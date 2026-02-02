import { supabase } from './supabase';

export interface MembershipPaymentData {
  clubId: string;
  memberId: string;
  membershipTypeId?: string;
  memberName: string;
  membershipTypeName: string;
  amount: number;
  paymentMethod: 'bank_transfer' | 'credit_card' | 'cash';
  stripePaymentIntentId?: string;
}

export interface ClubFinanceConfig {
  taxEnabled: boolean;
  taxRate: number;
  taxName: string;
  defaultMembershipCategoryId: string | null;
}

const STRIPE_RATE = 0.0175;
const STRIPE_FIXED_FEE = 0.30;

export function calculateStripeFee(amount: number): number {
  return Math.round((amount * STRIPE_RATE + STRIPE_FIXED_FEE) * 100) / 100;
}

export function calculateTaxAmount(amount: number, taxRate: number, taxInclusive: boolean = true): {
  taxAmount: number;
  baseAmount: number;
  totalAmount: number;
} {
  if (taxInclusive) {
    const taxAmount = Math.round((amount * taxRate / (1 + taxRate)) * 100) / 100;
    const baseAmount = amount - taxAmount;
    return {
      taxAmount,
      baseAmount,
      totalAmount: amount
    };
  } else {
    const taxAmount = Math.round((amount * taxRate) * 100) / 100;
    const totalAmount = amount + taxAmount;
    return {
      taxAmount,
      baseAmount: amount,
      totalAmount
    };
  }
}

export async function getClubFinanceConfig(clubId: string): Promise<ClubFinanceConfig | null> {
  try {
    const { data, error } = await supabase
      .from('clubs')
      .select('tax_enabled, tax_rate, tax_name, default_membership_category_id')
      .eq('id', clubId)
      .single();

    if (error) throw error;

    return {
      taxEnabled: data.tax_enabled || false,
      taxRate: data.tax_rate || 0,
      taxName: data.tax_name || 'Tax',
      defaultMembershipCategoryId: data.default_membership_category_id
    };
  } catch (error) {
    console.error('Error fetching club finance config:', error);
    return null;
  }
}

export async function createMembershipTransaction(
  paymentData: MembershipPaymentData,
  status: 'pending' | 'paid' = 'pending'
): Promise<{ success: boolean; transactionId?: string; membershipTransactionId?: string; error?: string }> {
  try {
    const config = await getClubFinanceConfig(paymentData.clubId);

    if (!config) {
      console.warn('Club finance configuration not found, creating transaction without category');
    }

    let taxAmount = 0;
    let baseAmount = paymentData.amount;
    let totalAmount = paymentData.amount;

    if (config && config.taxEnabled && config.taxRate > 0) {
      const taxCalc = calculateTaxAmount(paymentData.amount, config.taxRate, true);
      taxAmount = taxCalc.taxAmount;
      baseAmount = taxCalc.baseAmount;
      totalAmount = taxCalc.totalAmount;
    }

    let stripeFee = 0;
    let netAmount = totalAmount;

    if (paymentData.paymentMethod === 'credit_card' && status === 'paid') {
      stripeFee = calculateStripeFee(totalAmount);
      netAmount = totalAmount - stripeFee;
    }

    const transactionDate = new Date().toISOString().split('T')[0];
    const description = `Membership: ${paymentData.memberName} - ${paymentData.membershipTypeName}`;

    const transactionData = {
      club_id: paymentData.clubId,
      type: 'deposit',
      category_id: config?.defaultMembershipCategoryId || null,
      description,
      amount: totalAmount,
      tax_amount: taxAmount,
      net_amount: netAmount,
      date: transactionDate,
      payment_method: paymentData.paymentMethod,
      payment_status: status,
      payment_gateway: paymentData.paymentMethod === 'credit_card' ? 'stripe' : 'manual',
      gateway_transaction_id: paymentData.stripePaymentIntentId,
      gateway_fee: stripeFee,
      linked_entity_type: 'membership',
      linked_entity_id: paymentData.memberId,
      payer: paymentData.memberName,
      reference: paymentData.memberId,
    };

    console.log('Creating membership finance transaction:', transactionData);

    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert(transactionData)
      .select()
      .single();

    if (transactionError) {
      console.error('Error creating transaction:', transactionError);
      throw transactionError;
    }

    console.log('Transaction created successfully:', transaction.id);

    const membershipTransactionData = {
      club_id: paymentData.clubId,
      member_id: paymentData.memberId,
      transaction_id: transaction.id,
      membership_type_id: paymentData.membershipTypeId,
      amount: baseAmount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      payment_method: paymentData.paymentMethod,
      payment_status: status,
      stripe_payment_intent_id: paymentData.stripePaymentIntentId,
      stripe_fee: stripeFee,
    };

    const { data: membershipTransaction, error: membershipTransactionError } = await supabase
      .from('membership_transactions')
      .insert(membershipTransactionData)
      .select()
      .single();

    if (membershipTransactionError) throw membershipTransactionError;

    return {
      success: true,
      transactionId: transaction.id,
      membershipTransactionId: membershipTransaction.id
    };
  } catch (error: any) {
    console.error('Error creating membership transaction:', error);
    return {
      success: false,
      error: error.message || 'Failed to create membership transaction'
    };
  }
}

export async function updateMembershipTransactionStatus(
  memberId: string,
  status: 'paid' | 'failed' | 'refunded',
  paymentDate?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: membershipTransactions, error: fetchError } = await supabase
      .from('membership_transactions')
      .select('id, transaction_id, total_amount, payment_method')
      .eq('member_id', memberId)
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    if (!membershipTransactions || membershipTransactions.length === 0) {
      return { success: false, error: 'No pending transaction found' };
    }

    const membershipTransaction = membershipTransactions[0];

    let stripeFee = 0;
    let netAmount = membershipTransaction.total_amount;

    if (membershipTransaction.payment_method === 'credit_card' && status === 'paid') {
      stripeFee = calculateStripeFee(membershipTransaction.total_amount);
      netAmount = membershipTransaction.total_amount - stripeFee;
    }

    const updateDate = paymentDate || new Date().toISOString().split('T')[0];

    const { error: transactionUpdateError } = await supabase
      .from('transactions')
      .update({
        payment_status: status,
        date: updateDate,
        gateway_fee: stripeFee,
        net_amount: netAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', membershipTransaction.transaction_id);

    if (transactionUpdateError) throw transactionUpdateError;

    const { error: membershipTransactionUpdateError } = await supabase
      .from('membership_transactions')
      .update({
        payment_status: status,
        stripe_fee: stripeFee,
        updated_at: new Date().toISOString()
      })
      .eq('id', membershipTransaction.id);

    if (membershipTransactionUpdateError) throw membershipTransactionUpdateError;

    return { success: true };
  } catch (error: any) {
    console.error('Error updating membership transaction status:', error);
    return {
      success: false,
      error: error.message || 'Failed to update transaction status'
    };
  }
}

export async function getMemberPaymentHistory(memberId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('membership_transactions')
      .select(`
        *,
        transaction:transactions(*)
      `)
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error fetching member payment history:', error);
    return [];
  }
}

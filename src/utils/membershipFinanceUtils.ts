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

function toTxPaymentMethod(method: string): string {
  const map: Record<string, string> = {
    'bank_transfer': 'bank',
    'credit_card': 'card',
    'cash': 'cash',
    'cheque': 'cheque',
    'other': 'other',
    'bank': 'bank',
    'card': 'card',
  };
  return map[method] || 'bank';
}

function toTxPaymentStatus(status: string): string {
  const map: Record<string, string> = {
    'pending': 'awaiting_payment',
    'paid': 'paid',
    'failed': 'awaiting_payment',
    'refunded': 'awaiting_payment',
    'awaiting_payment': 'awaiting_payment',
  };
  return map[status] || 'awaiting_payment';
}

function toMtxPaymentMethod(method: string): string {
  const map: Record<string, string> = {
    'bank_transfer': 'bank_transfer',
    'credit_card': 'credit_card',
    'cash': 'cash',
    'bank': 'bank_transfer',
    'card': 'credit_card',
  };
  return map[method] || 'bank_transfer';
}

function toMtxPaymentStatus(status: string): string {
  const map: Record<string, string> = {
    'pending': 'pending',
    'paid': 'paid',
    'failed': 'failed',
    'refunded': 'refunded',
    'awaiting_payment': 'pending',
  };
  return map[status] || 'pending';
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

    const isCard = paymentData.paymentMethod === 'credit_card';
    let stripeFee = 0;
    let netAmount = totalAmount;

    if (isCard && status === 'paid') {
      stripeFee = calculateStripeFee(totalAmount);
      netAmount = totalAmount - stripeFee;
    }

    const transactionDate = new Date().toISOString().split('T')[0];
    const description = `Membership: ${paymentData.memberName} - ${paymentData.membershipTypeName}`;
    const dbPaymentMethod = toTxPaymentMethod(paymentData.paymentMethod);
    const dbPaymentStatus = toTxPaymentStatus(status);

    const transactionData = {
      club_id: paymentData.clubId,
      type: 'deposit',
      category_id: config?.defaultMembershipCategoryId || null,
      description,
      amount: totalAmount,
      tax_amount: taxAmount,
      net_amount: netAmount,
      date: transactionDate,
      payment_method: dbPaymentMethod,
      payment_status: dbPaymentStatus,
      payment_gateway: isCard ? 'stripe' : 'manual',
      gateway_transaction_id: paymentData.stripePaymentIntentId,
      gateway_fee: stripeFee,
      linked_entity_type: 'membership',
      linked_entity_id: paymentData.memberId,
      payer: paymentData.memberName,
      reference: paymentData.memberId,
    };

    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert(transactionData)
      .select()
      .single();

    if (transactionError) {
      console.error('Error creating transaction:', transactionError);
      throw transactionError;
    }

    const membershipTransactionData = {
      club_id: paymentData.clubId,
      member_id: paymentData.memberId,
      transaction_id: transaction.id,
      membership_type_id: paymentData.membershipTypeId,
      amount: baseAmount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      payment_method: toMtxPaymentMethod(paymentData.paymentMethod),
      payment_status: toMtxPaymentStatus(status),
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
      .or('payment_status.eq.awaiting_payment,payment_status.eq.pending')
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    if (!membershipTransactions || membershipTransactions.length === 0) {
      if (status === 'paid') {
        const result = await createTransactionForImportedMember(memberId, paymentDate);
        return result;
      }
      return { success: false, error: 'No pending transaction found' };
    }

    const membershipTransaction = membershipTransactions[0];

    let stripeFee = 0;
    let netAmount = membershipTransaction.total_amount;

    if (membershipTransaction.payment_method === 'card' && status === 'paid') {
      stripeFee = calculateStripeFee(membershipTransaction.total_amount);
      netAmount = membershipTransaction.total_amount - stripeFee;
    }

    const updateDate = paymentDate || new Date().toISOString().split('T')[0];
    const dbPaymentStatus = toTxPaymentStatus(status);

    const { error: transactionUpdateError } = await supabase
      .from('transactions')
      .update({
        payment_status: dbPaymentStatus,
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
        payment_status: toMtxPaymentStatus(status),
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

async function createTransactionForImportedMember(
  memberId: string,
  paymentDate?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, club_id, first_name, last_name, membership_level, amount_paid, user_id')
      .eq('id', memberId)
      .maybeSingle();

    if (memberError || !member) {
      return { success: false, error: 'Member not found' };
    }

    const memberName = `${member.first_name} ${member.last_name}`;
    const membershipType = member.membership_level || 'Membership';
    const transactionDate = paymentDate || new Date().toISOString().split('T')[0];

    let amount = member.amount_paid || 0;

    if (!amount && member.membership_level && member.club_id) {
      const { data: membershipTypeData } = await supabase
        .from('membership_types')
        .select('amount')
        .eq('club_id', member.club_id)
        .eq('name', member.membership_level)
        .maybeSingle();

      if (membershipTypeData?.amount) {
        amount = Number(membershipTypeData.amount);
      }
    }

    if (!amount && member.user_id) {
      const { data: application } = await supabase
        .from('membership_applications')
        .select('membership_amount')
        .eq('club_id', member.club_id)
        .eq('user_id', member.user_id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (application?.membership_amount) {
        amount = Number(application.membership_amount);
      }
    }

    const config = await getClubFinanceConfig(member.club_id);

    let taxAmount = 0;
    let baseAmount = amount;
    let totalAmount = amount;

    if (config && config.taxEnabled && config.taxRate > 0 && amount > 0) {
      const taxCalc = calculateTaxAmount(amount, config.taxRate, true);
      taxAmount = taxCalc.taxAmount;
      baseAmount = taxCalc.baseAmount;
      totalAmount = taxCalc.totalAmount;
    }

    const description = `Membership: ${memberName} - ${membershipType}`;

    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        club_id: member.club_id,
        type: 'deposit',
        category_id: config?.defaultMembershipCategoryId || null,
        description,
        amount: totalAmount,
        tax_amount: taxAmount,
        net_amount: totalAmount,
        date: transactionDate,
        payment_method: 'bank',
        payment_status: 'paid',
        payment_gateway: 'manual',
        linked_entity_type: 'membership',
        linked_entity_id: memberId,
        payer: memberName,
        reference: memberId,
      })
      .select()
      .single();

    if (txError) throw txError;

    const { error: mtxError } = await supabase
      .from('membership_transactions')
      .insert({
        club_id: member.club_id,
        member_id: memberId,
        transaction_id: transaction.id,
        amount: baseAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        payment_method: 'bank_transfer',
        payment_status: 'paid',
      })
      .select()
      .single();

    if (mtxError) throw mtxError;

    return { success: true };
  } catch (error: any) {
    console.error('Error creating transaction for imported member:', error);
    return {
      success: false,
      error: error.message || 'Failed to create finance transaction'
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

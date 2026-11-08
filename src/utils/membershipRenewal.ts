/**
 * Membership renewal for an unfinancial member: the options and the payment steps.
 * Shared by the desktop renewal screen (UnfinancialMemberScreen) and the phone app's
 * "Membership due" screen so both record payments, credits, finance entries and
 * admin notifications the same way.
 */
import { supabase } from './supabase';
import { createMembershipTransaction } from './membershipFinanceUtils';

export interface RenewalMember {
  member_id: string;
  club_id: string;
  club_name: string;
  membership_level: string | null;
  is_new_member: boolean;
  renewal_date: string | null;
  date_joined: string | null;
}

export interface RenewalType {
  id: string;
  name: string;
  amount: number;
  currency: string;
  description: string | null;
  renewal_period: string;
}

export interface MidCycleCredit {
  credit_id: string;
  credit_amount: number;
  membership_year_paid: number;
  notes: string;
}

export interface PendingRenewalPayment {
  id: string;
  amount: number;
  payment_method: string | null;
  created_at: string;
  membership_type_name: string | null;
}

export interface BankDetails { bank_name: string; bsb: string; account_number: string }

export async function getPendingRenewalPayment(memberId: string): Promise<PendingRenewalPayment | null> {
  const { data } = await supabase
    .from('membership_payments')
    .select('id, amount, payment_method, created_at, membership_type_id')
    .eq('member_id', memberId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  let typeName: string | null = null;
  if (data.membership_type_id) {
    const { data: typeData } = await supabase.from('membership_types').select('name').eq('id', data.membership_type_id).maybeSingle();
    typeName = typeData?.name || null;
  }
  return { id: data.id, amount: data.amount, payment_method: data.payment_method, created_at: data.created_at, membership_type_name: typeName };
}

export async function getRenewalOptions(member: RenewalMember): Promise<{
  types: RenewalType[];
  preselected: RenewalType | null;
  clubHasStripe: boolean;
  midCycleCredit: MidCycleCredit | null;
}> {
  const [typesResult, clubResult] = await Promise.all([
    supabase.from('membership_types').select('id, name, amount, currency, description, renewal_period')
      .eq('club_id', member.club_id).eq('is_active', true).order('amount'),
    supabase.from('clubs').select('stripe_account_id').eq('id', member.club_id).maybeSingle(),
  ]);
  const types = (typesResult.data || []) as RenewalType[];
  const preselected = member.membership_level
    ? types.find(t => t.name.toLowerCase() === member.membership_level?.toLowerCase()) || null
    : null;

  let midCycleCredit: MidCycleCredit | null = null;
  if (!member.is_new_member) {
    const now = new Date();
    const renewalYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    try {
      const { data: creditData } = await supabase.rpc('get_pending_mid_cycle_credit', {
        p_member_id: member.member_id, p_club_id: member.club_id, p_renewal_year: renewalYear,
      });
      if (creditData && creditData.length > 0) midCycleCredit = creditData[0];
    } catch (err) {
      console.error('Error checking mid-cycle credit:', err);
    }
  }
  return { types, preselected, clubHasStripe: !!clubResult.data?.stripe_account_id, midCycleCredit };
}

export async function getClubBankDetails(clubId: string): Promise<BankDetails | null> {
  const { data } = await supabase.from('clubs').select('bank_name, bsb, account_number').eq('id', clubId).maybeSingle();
  return data && (data.bank_name || data.bsb || data.account_number) ? data : null;
}

export const effectiveRenewalAmount = (type: RenewalType | null, credit: MidCycleCredit | null) =>
  (type ? Math.max(0, type.amount - (credit?.credit_amount || 0)) : 0);

export type RenewalResult =
  | { kind: 'redirect'; url: string }
  | { kind: 'completed' }
  | { kind: 'pending'; pending: PendingRenewalPayment }
  | { kind: 'none' };

/**
 * Card (Stripe Checkout) when the club takes cards and there's something to pay;
 * otherwise bank transfer (recorded as pending, admins told) or free (completed now).
 */
export async function submitRenewal(opts: {
  member: RenewalMember;
  type: RenewalType;
  method: 'stripe' | 'bank_transfer';
  clubHasStripe: boolean;
  midCycleCredit: MidCycleCredit | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<RenewalResult> {
  const { member, type, method, clubHasStripe, midCycleCredit } = opts;
  const amount = effectiveRenewalAmount(type, midCycleCredit);

  if (method === 'stripe' && clubHasStripe && amount > 0) {
    const { data: paymentData, error: paymentError } = await supabase
      .from('membership_payments')
      .insert({ member_id: member.member_id, membership_type_id: type.id, amount, currency: type.currency, status: 'pending' })
      .select()
      .single();
    if (paymentError) throw paymentError;
    if (midCycleCredit) {
      await supabase.rpc('apply_mid_cycle_credit', { p_credit_id: midCycleCredit.credit_id, p_applied_remittance_id: null });
    }
    const { data, error: checkoutError } = await supabase.functions.invoke('create-membership-checkout', {
      body: { member_id: member.member_id, membership_type_id: type.id, payment_id: paymentData.id, success_url: opts.successUrl, cancel_url: opts.cancelUrl },
    });
    if (checkoutError) throw checkoutError;
    if (data?.checkout_url) return { kind: 'redirect', url: data.checkout_url };
  }

  if (method === 'bank_transfer' || amount === 0) {
    const { error: paymentError } = await supabase.from('membership_payments').insert({
      member_id: member.member_id, membership_type_id: type.id, amount, currency: type.currency,
      status: amount === 0 ? 'completed' : 'pending', payment_method: amount === 0 ? 'free' : 'bank_transfer',
    });
    if (paymentError) throw paymentError;
    if (midCycleCredit) {
      await supabase.rpc('apply_mid_cycle_credit', { p_credit_id: midCycleCredit.credit_id, p_applied_remittance_id: null });
    }

    if (amount === 0) {
      const renewalDate = new Date();
      renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      await supabase.from('members').update({
        is_financial: true, amount_paid: 0, membership_level: type.name, renewal_date: renewalDate.toISOString().split('T')[0],
      }).eq('id', member.member_id);
      return { kind: 'completed' };
    }

    await supabase.from('members').update({ payment_status: 'pending', membership_level: type.name }).eq('id', member.member_id);
    const { data: memberRecord } = await supabase.from('members').select('first_name, last_name').eq('id', member.member_id).maybeSingle();
    const memberName = memberRecord ? `${memberRecord.first_name} ${memberRecord.last_name}` : 'Member';

    try {
      await createMembershipTransaction({
        clubId: member.club_id, memberId: member.member_id, memberName, membershipTypeName: type.name, amount, paymentMethod: 'bank_transfer',
      }, 'pending');
    } catch (finErr) {
      console.error('Failed to create pending transaction:', finErr);
    }

    try {
      const { data: clubAdmins } = await supabase.from('user_clubs').select('user_id').eq('club_id', member.club_id).in('role', ['admin', 'owner']);
      if (clubAdmins && clubAdmins.length > 0) {
        await supabase.from('notifications').insert(clubAdmins.map(admin => ({
          user_id: admin.user_id,
          club_id: member.club_id,
          title: 'Membership Renewal Submitted',
          message: `${memberName} has submitted a membership renewal (${type.name}) with bank transfer payment of $${amount.toFixed(2)}. Please confirm payment when received.`,
          type: 'membership',
          link_url: '/membership?tab=members',
        })));
      }
    } catch (notifErr) {
      console.error('Failed to send admin notification:', notifErr);
    }

    return { kind: 'pending', pending: { id: '', amount, payment_method: 'bank_transfer', created_at: new Date().toISOString(), membership_type_name: type.name } };
  }
  return { kind: 'none' };
}

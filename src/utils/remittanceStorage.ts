import { supabase } from './supabase';

export interface MembershipFeeStructure {
  id: string;
  state_association_id: string;
  national_association_id: string | null;
  state_contribution_amount: number;
  national_contribution_amount: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipRemittance {
  id: string;
  member_id: string;
  club_id: string;
  membership_payment_id: string | null;
  membership_type_id: string | null;
  state_association_id: string | null;
  national_association_id: string | null;
  fee_structure_id: string | null;
  total_membership_fee: number;
  state_contribution_amount: number;
  national_contribution_amount: number;
  club_retained_amount: number;
  club_to_state_status: 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'waived';
  club_to_state_paid_date: string | null;
  club_to_state_payment_reference: string | null;
  state_to_national_status: 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'waived';
  state_to_national_paid_date: string | null;
  state_to_national_payment_reference: string | null;
  membership_year: number;
  membership_start_date: string;
  membership_end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  member?: {
    first_name: string;
    last_name: string;
    email: string;
    avatar_url?: string | null;
  };
  member_name?: string;
  club_name?: string;
  state_association_name?: string;
}

export interface AssociationPayment {
  id: string;
  from_entity_type: 'club' | 'state_association';
  from_entity_id: string;
  to_entity_type: 'state_association' | 'national_association';
  to_entity_id: string;
  payment_type: 'bulk' | 'individual';
  payment_method: 'eft' | 'credit_card' | 'cheque' | 'cash' | 'other' | null;
  payment_date: string;
  amount: number;
  currency: string;
  payment_reference: string | null;
  external_reference: string | null;
  reconciliation_status: 'unreconciled' | 'partially_reconciled' | 'reconciled' | 'disputed';
  reconciled_amount: number;
  reconciled_at: string | null;
  reconciled_by: string | null;
  period_start_date: string | null;
  period_end_date: string | null;
  membership_year: number | null;
  transaction_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemittanceReconciliation {
  id: string;
  association_payment_id: string;
  membership_remittance_id: string;
  allocated_amount: number;
  allocation_level: 'club_to_state' | 'state_to_national';
  reconciled_by: string | null;
  reconciled_at: string;
  notes: string | null;
}

export interface OutstandingRemittance {
  remittance_id: string;
  member_name: string;
  member_email: string;
  membership_year: number;
  total_fee: number;
  state_contribution: number;
  national_contribution: number;
  status: string;
  days_outstanding: number;
}

export interface ClubOutstandingTotal {
  pending_count: number;
  total_outstanding: number;
  state_contribution_total: number;
  national_contribution_total: number;
}

export interface StateOutstandingFromClubs {
  club_id: string;
  club_name: string;
  pending_count: number;
  total_outstanding: number;
  oldest_unpaid_date: string;
}

// Get active fee structure for a state association
export async function getActiveFeeStructure(
  stateAssociationId: string,
  date: string = new Date().toISOString().split('T')[0]
): Promise<MembershipFeeStructure | null> {
  try {
    const { data, error } = await supabase
      .from('membership_fee_structures')
      .select('*')
      .eq('state_association_id', stateAssociationId)
      .lte('effective_from', date)
      .or(`effective_to.is.null,effective_to.gte.${date}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching active fee structure:', error);
    return null;
  }
}

// Get all fee structures for a state association
export async function getFeeStructures(
  stateAssociationId: string
): Promise<MembershipFeeStructure[]> {
  try {
    const { data, error } = await supabase
      .from('membership_fee_structures')
      .select('*')
      .eq('state_association_id', stateAssociationId)
      .order('effective_from', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching fee structures:', error);
    return [];
  }
}

// Create or update fee structure
export async function saveFeeStructure(
  feeStructure: Partial<MembershipFeeStructure>
): Promise<MembershipFeeStructure | null> {
  try {
    const { data: user } = await supabase.auth.getUser();

    const structureData = {
      ...feeStructure,
      created_by: user.user?.id,
    };

    if (feeStructure.id) {
      const { data, error } = await supabase
        .from('membership_fee_structures')
        .update(structureData)
        .eq('id', feeStructure.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('membership_fee_structures')
        .insert(structureData)
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  } catch (error) {
    console.error('Error saving fee structure:', error);
    return null;
  }
}

// Get outstanding remittances for a club
export async function getOutstandingClubRemittances(
  clubId: string,
  status: string = 'pending'
): Promise<OutstandingRemittance[]> {
  try {
    const { data, error } = await supabase
      .rpc('get_outstanding_club_remittances', {
        p_club_id: clubId,
        p_status: status
      });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching outstanding club remittances:', error);
    return [];
  }
}

// Get club outstanding total
export async function getClubOutstandingTotal(
  clubId: string
): Promise<ClubOutstandingTotal | null> {
  try {
    const { data, error } = await supabase
      .rpc('get_club_outstanding_total', {
        p_club_id: clubId
      });

    if (error) throw error;
    return data?.[0] || null;
  } catch (error) {
    console.error('Error fetching club outstanding total:', error);
    return null;
  }
}

// Get state outstanding from clubs
export async function getStateOutstandingFromClubs(
  stateAssociationId: string
): Promise<StateOutstandingFromClubs[]> {
  try {
    const { data, error } = await supabase
      .rpc('get_state_outstanding_from_clubs', {
        p_state_association_id: stateAssociationId
      });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching state outstanding from clubs:', error);
    return [];
  }
}

// Get remittances with member details
export async function getRemittancesWithMembers(
  clubId: string,
  filters?: {
    status?: string;
    year?: number;
  }
): Promise<MembershipRemittance[]> {
  try {
    let query = supabase
      .from('membership_remittances')
      .select(`
        *,
        member:members(first_name, last_name, email, avatar_url)
      `)
      .eq('club_id', clubId)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('club_to_state_status', filters.status);
    }

    if (filters?.year) {
      query = query.eq('membership_year', filters.year);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching remittances with members:', error);
    return [];
  }
}

// Record a payment
export async function recordAssociationPayment(
  payment: Partial<AssociationPayment>
): Promise<AssociationPayment | null> {
  try {
    const { data: user } = await supabase.auth.getUser();

    const paymentData = {
      ...payment,
      created_by: user.user?.id,
    };

    const { data, error } = await supabase
      .from('association_payments')
      .insert(paymentData)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error recording association payment:', error);
    return null;
  }
}

// Get payments for an entity
export async function getPaymentsForEntity(
  entityType: 'club' | 'state_association' | 'national_association',
  entityId: string
): Promise<AssociationPayment[]> {
  try {
    const { data, error } = await supabase
      .from('association_payments')
      .select('*')
      .or(`and(from_entity_type.eq.${entityType},from_entity_id.eq.${entityId}),and(to_entity_type.eq.${entityType},to_entity_id.eq.${entityId})`)
      .order('payment_date', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching payments for entity:', error);
    return [];
  }
}

// Mark remittances as paid
export async function markRemittancesAsPaid(
  remittanceIds: string[],
  paymentId: string,
  level: 'club_to_state' | 'state_to_national'
): Promise<number> {
  try {
    const { data, error } = await supabase
      .rpc('mark_remittances_as_paid', {
        p_remittance_ids: remittanceIds,
        p_payment_id: paymentId,
        p_level: level
      });

    if (error) throw error;
    return data || 0;
  } catch (error) {
    console.error('Error marking remittances as paid:', error);
    return 0;
  }
}

// Update payment reconciliation status
export async function updatePaymentReconciliation(
  paymentId: string,
  updates: {
    reconciliation_status?: string;
    reconciled_amount?: number;
    notes?: string;
  }
): Promise<AssociationPayment | null> {
  try {
    const { data: user } = await supabase.auth.getUser();

    const updateData = {
      ...updates,
      reconciled_by: user.user?.id,
      reconciled_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('association_payments')
      .update(updateData)
      .eq('id', paymentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating payment reconciliation:', error);
    return null;
  }
}

// Get remittances for a state association
export async function getStateRemittances(
  stateAssociationId: string,
  filters?: {
    clubId?: string;
    status?: string;
    year?: number;
  }
): Promise<MembershipRemittance[]> {
  try {
    let query = supabase
      .from('membership_remittances')
      .select(`
        *,
        member:members(first_name, last_name, email),
        club:clubs(name)
      `)
      .eq('state_association_id', stateAssociationId)
      .order('created_at', { ascending: false });

    if (filters?.clubId) {
      query = query.eq('club_id', filters.clubId);
    }

    if (filters?.status) {
      query = query.eq('club_to_state_status', filters.status);
    }

    if (filters?.year) {
      query = query.eq('membership_year', filters.year);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Transform the data to include flattened member_name and club_name
    return (data || []).map(remittance => ({
      ...remittance,
      member_name: remittance.member
        ? `${remittance.member.first_name} ${remittance.member.last_name}`
        : 'Unknown Member',
      club_name: (remittance as any).club?.name || 'Unknown Club'
    }));
  } catch (error) {
    console.error('Error fetching state remittances:', error);
    return [];
  }
}

// Get remittances for a national association
export async function getNationalRemittances(
  nationalAssociationId: string,
  filters?: {
    stateAssociationId?: string;
    status?: string;
    year?: number;
  }
): Promise<MembershipRemittance[]> {
  try {
    let query = supabase
      .from('membership_remittances')
      .select(`
        *,
        member:members(first_name, last_name, email),
        club:clubs(name),
        state_association:state_associations(name)
      `)
      .eq('national_association_id', nationalAssociationId)
      .order('created_at', { ascending: false });

    if (filters?.stateAssociationId) {
      query = query.eq('state_association_id', filters.stateAssociationId);
    }

    if (filters?.status) {
      query = query.eq('state_to_national_status', filters.status);
    }

    if (filters?.year) {
      query = query.eq('membership_year', filters.year);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Transform the data to include flattened names
    return (data || []).map(remittance => ({
      ...remittance,
      member_name: remittance.member
        ? `${remittance.member.first_name} ${remittance.member.last_name}`
        : 'Unknown Member',
      club_name: (remittance as any).club?.name || 'Unknown Club',
      state_association_name: (remittance as any).state_association?.name || 'Unknown State'
    }));
  } catch (error) {
    console.error('Error fetching national remittances:', error);
    return [];
  }
}

// Export remittances to CSV
export function exportRemittancesToCSV(
  remittances: MembershipRemittance[],
  filename: string = 'remittances.csv'
): void {
  const headers = [
    'Member Name',
    'Member Email',
    'Year',
    'Total Fee',
    'State Contribution',
    'National Contribution',
    'Club to State Status',
    'State to National Status',
    'Membership Start',
    'Created Date'
  ];

  const rows = remittances.map(r => [
    r.member ? `${r.member.first_name} ${r.member.last_name}` : '',
    r.member?.email || '',
    r.membership_year,
    r.total_membership_fee.toFixed(2),
    r.state_contribution_amount.toFixed(2),
    r.national_contribution_amount.toFixed(2),
    r.club_to_state_status,
    r.state_to_national_status,
    r.membership_start_date,
    new Date(r.created_at).toLocaleDateString()
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Export payments to CSV
export function exportPaymentsToCSV(
  payments: AssociationPayment[],
  filename: string = 'payments.csv'
): void {
  const headers = [
    'Date',
    'From Type',
    'To Type',
    'Payment Type',
    'Amount',
    'Method',
    'Reference',
    'Status',
    'Reconciled Amount',
    'Notes'
  ];

  const rows = payments.map(p => [
    p.payment_date,
    p.from_entity_type,
    p.to_entity_type,
    p.payment_type,
    p.amount.toFixed(2),
    p.payment_method || '',
    p.payment_reference || '',
    p.reconciliation_status,
    p.reconciled_amount.toFixed(2),
    p.notes || ''
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

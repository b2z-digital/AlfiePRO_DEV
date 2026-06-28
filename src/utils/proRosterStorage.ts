import { supabase } from './supabase';
import type {
  ProRoster,
  ProRosterRound,
  ProRosterAssignment,
  ProRosterExclusion,
  ProRosterMember,
  RosterFormData,
  RosterWithDetails,
} from '../types/proRoster';

export const getRosters = async (clubId: string): Promise<ProRoster[]> => {
  const { data, error } = await supabase
    .from('pro_rosters')
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const getRosterWithDetails = async (rosterId: string): Promise<RosterWithDetails> => {
  const { data: roster, error: rosterError } = await supabase
    .from('pro_rosters')
    .select('*')
    .eq('id', rosterId)
    .single();

  if (rosterError || !roster) throw rosterError || new Error('Roster not found');

  const [roundsRes, assignmentsRes, membersRes, exclusionsRes] = await Promise.all([
    supabase.from('pro_roster_rounds').select('*').eq('roster_id', rosterId).order('date', { ascending: true }),
    supabase.from('pro_roster_assignments').select('*').eq('roster_id', rosterId),
    supabase.from('pro_roster_members').select('*').eq('roster_id', rosterId),
    supabase.from('pro_roster_exclusions').select('*').eq('roster_id', rosterId),
  ]);

  return {
    ...roster,
    rounds: roundsRes.data || [],
    assignments: assignmentsRes.data || [],
    members: membersRes.data || [],
    exclusions: exclusionsRes.data || [],
  };
};

export const createRoster = async (clubId: string, formData: RosterFormData, createdBy: string): Promise<ProRoster> => {
  const { data, error } = await supabase
    .from('pro_rosters')
    .insert({
      club_id: clubId,
      name: formData.name,
      description: formData.description || null,
      boat_class: formData.boat_class,
      series_id: formData.series_id || null,
      start_date: formData.start_date,
      end_date: formData.end_date,
      allocation_method: formData.allocation_method,
      reminder_days_before: formData.reminder_days_before,
      reminder_type: formData.reminder_type,
      allow_decline: formData.allow_decline,
      max_consecutive: formData.max_consecutive,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error || !data) throw error || new Error('Failed to create roster');
  return data;
};

export const updateRoster = async (rosterId: string, updates: Partial<RosterFormData>): Promise<ProRoster> => {
  const { data, error } = await supabase
    .from('pro_rosters')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', rosterId)
    .select()
    .single();

  if (error || !data) throw error || new Error('Failed to update roster');
  return data;
};

export const deleteRoster = async (rosterId: string): Promise<void> => {
  const { error } = await supabase.from('pro_rosters').delete().eq('id', rosterId);
  if (error) throw error;
};

export const addRosterRounds = async (rosterId: string, dates: string[]): Promise<ProRosterRound[]> => {
  const rounds = dates.map((date, idx) => ({
    roster_id: rosterId,
    date,
    sort_order: idx,
  }));

  const { data, error } = await supabase
    .from('pro_roster_rounds')
    .insert(rounds)
    .select();

  if (error) throw error;
  return data || [];
};

export const updateRosterRound = async (roundId: string, updates: Partial<ProRosterRound>): Promise<void> => {
  const { error } = await supabase
    .from('pro_roster_rounds')
    .update(updates)
    .eq('id', roundId);

  if (error) throw error;
};

export const deleteRosterRound = async (roundId: string): Promise<void> => {
  const { error } = await supabase.from('pro_roster_rounds').delete().eq('id', roundId);
  if (error) throw error;
};

export const addRosterMembers = async (rosterId: string, memberIds: string[]): Promise<void> => {
  const members = memberIds.map(memberId => ({
    roster_id: rosterId,
    member_id: memberId,
  }));

  const { error } = await supabase
    .from('pro_roster_members')
    .upsert(members, { onConflict: 'roster_id,member_id' });

  if (error) throw error;
};

export const removeRosterMember = async (rosterId: string, memberId: string): Promise<void> => {
  const { error } = await supabase
    .from('pro_roster_members')
    .delete()
    .eq('roster_id', rosterId)
    .eq('member_id', memberId);

  if (error) throw error;
};

export const addExclusion = async (rosterId: string, memberId: string, date: string, reason?: string): Promise<void> => {
  const { error } = await supabase
    .from('pro_roster_exclusions')
    .insert({ roster_id: rosterId, member_id: memberId, exclusion_date: date, reason: reason || null });

  if (error) throw error;
};

export const removeExclusion = async (exclusionId: string): Promise<void> => {
  const { error } = await supabase.from('pro_roster_exclusions').delete().eq('id', exclusionId);
  if (error) throw error;
};

export const updateAssignmentStatus = async (
  assignmentId: string,
  status: 'confirmed' | 'declined' | 'completed',
  reason?: string
): Promise<void> => {
  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'confirmed') updates.confirmed_at = new Date().toISOString();
  if (status === 'declined') {
    updates.declined_at = new Date().toISOString();
    updates.decline_reason = reason || null;
  }

  const { error } = await supabase
    .from('pro_roster_assignments')
    .update(updates)
    .eq('id', assignmentId);

  if (error) throw error;
};

export const swapAssignment = async (assignmentId: string, newMemberId: string): Promise<void> => {
  const { data: assignment, error: fetchError } = await supabase
    .from('pro_roster_assignments')
    .select('*')
    .eq('id', assignmentId)
    .single();

  if (fetchError || !assignment) throw fetchError || new Error('Assignment not found');

  const { error } = await supabase
    .from('pro_roster_assignments')
    .update({
      member_id: newMemberId,
      status: 'assigned',
      swap_member_id: assignment.member_id,
      confirmed_at: null,
      declined_at: null,
      decline_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assignmentId);

  if (error) throw error;
};

interface AllocationResult {
  round_id: string;
  member_id: string;
}

export const generateFairAllocation = (
  rounds: ProRosterRound[],
  members: ProRosterMember[],
  exclusions: ProRosterExclusion[],
  maxConsecutive: number
): AllocationResult[] => {
  const activeMembers = members.filter(m => m.is_active);
  if (activeMembers.length === 0 || rounds.length === 0) return [];

  const exclusionMap = new Map<string, Set<string>>();
  exclusions.forEach(exc => {
    const key = exc.member_id;
    if (!exclusionMap.has(key)) exclusionMap.set(key, new Set());
    exclusionMap.get(key)!.add(exc.exclusion_date);
  });

  const dutyCount = new Map<string, number>();
  const lastAssignedIndex = new Map<string, number>();
  activeMembers.forEach(m => {
    dutyCount.set(m.member_id, m.duty_count);
    lastAssignedIndex.set(m.member_id, -999);
  });

  const sortedRounds = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
  const results: AllocationResult[] = [];

  for (let i = 0; i < sortedRounds.length; i++) {
    const round = sortedRounds[i];

    const eligible = activeMembers.filter(m => {
      const memberExclusions = exclusionMap.get(m.member_id);
      if (memberExclusions && memberExclusions.has(round.date)) return false;

      const lastIdx = lastAssignedIndex.get(m.member_id) ?? -999;
      if (i - lastIdx <= maxConsecutive && lastIdx >= 0 && maxConsecutive > 0) return false;

      return true;
    });

    if (eligible.length === 0) {
      const fallback = activeMembers.filter(m => {
        const memberExclusions = exclusionMap.get(m.member_id);
        return !(memberExclusions && memberExclusions.has(round.date));
      });
      if (fallback.length > 0) {
        const selected = fallback.reduce((min, m) =>
          (dutyCount.get(m.member_id) ?? 0) < (dutyCount.get(min.member_id) ?? 0) ? m : min
        );
        results.push({ round_id: round.id, member_id: selected.member_id });
        dutyCount.set(selected.member_id, (dutyCount.get(selected.member_id) ?? 0) + 1);
        lastAssignedIndex.set(selected.member_id, i);
      }
      continue;
    }

    const minDuty = Math.min(...eligible.map(m => dutyCount.get(m.member_id) ?? 0));
    const leastBusy = eligible.filter(m => (dutyCount.get(m.member_id) ?? 0) === minDuty);

    const selected = leastBusy[Math.floor(Math.random() * leastBusy.length)];
    results.push({ round_id: round.id, member_id: selected.member_id });
    dutyCount.set(selected.member_id, (dutyCount.get(selected.member_id) ?? 0) + 1);
    lastAssignedIndex.set(selected.member_id, i);
  }

  return results;
};

export const applyAllocation = async (rosterId: string, allocations: AllocationResult[]): Promise<void> => {
  const { error: deleteError } = await supabase
    .from('pro_roster_assignments')
    .delete()
    .eq('roster_id', rosterId);

  if (deleteError) throw deleteError;

  if (allocations.length === 0) return;

  const assignments = allocations.map(a => ({
    roster_id: rosterId,
    round_id: a.round_id,
    member_id: a.member_id,
    status: 'assigned' as const,
  }));

  const { error } = await supabase
    .from('pro_roster_assignments')
    .insert(assignments);

  if (error) throw error;
};

export const manualAssign = async (rosterId: string, roundId: string, memberId: string): Promise<void> => {
  const { error: deleteError } = await supabase
    .from('pro_roster_assignments')
    .delete()
    .eq('roster_id', rosterId)
    .eq('round_id', roundId);

  if (deleteError) throw deleteError;

  const { error } = await supabase
    .from('pro_roster_assignments')
    .insert({
      roster_id: rosterId,
      round_id: roundId,
      member_id: memberId,
      status: 'assigned',
    });

  if (error) throw error;
};

export const activateRoster = async (rosterId: string): Promise<void> => {
  const { error } = await supabase
    .from('pro_rosters')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', rosterId);

  if (error) throw error;
};

export const createTasksForAssignments = async (
  roster: ProRoster,
  rounds: ProRosterRound[],
  assignments: ProRosterAssignment[],
  clubId: string,
  createdBy: string
): Promise<void> => {
  const roundMap = new Map(rounds.map(r => [r.id, r]));

  for (const assignment of assignments) {
    const round = roundMap.get(assignment.round_id);
    if (!round) continue;

    const reminderDate = new Date(round.date);
    reminderDate.setDate(reminderDate.getDate() - roster.reminder_days_before);

    const { data: task, error } = await supabase
      .from('club_tasks')
      .insert({
        title: `PRO Duty: ${roster.name} - ${round.name || round.date}`,
        description: `You have been assigned as Principal Race Officer for ${roster.boat_class} on ${round.date}.`,
        due_date: round.date,
        status: 'pending',
        priority: 'high',
        assignee_id: assignment.member_id,
        club_id: clubId,
        created_by: createdBy,
        send_reminder: true,
        reminder_type: roster.reminder_type === 'both' ? 'both' : roster.reminder_type,
        reminder_date: reminderDate.toISOString().split('T')[0],
      })
      .select('id')
      .single();

    if (!error && task) {
      await supabase
        .from('pro_roster_assignments')
        .update({ task_id: task.id })
        .eq('id', assignment.id);
    }
  }
};

export interface ProAssignmentForDisplay {
  date: string;
  member_id: string;
  member_name: string;
  member_avatar: string | null;
  status: string;
}

export const getProAssignmentsForSeries = async (
  seriesId: string
): Promise<ProAssignmentForDisplay[]> => {
  const { data: rosters } = await supabase
    .from('pro_rosters')
    .select('id')
    .eq('series_id', seriesId)
    .in('status', ['active', 'draft']);

  if (!rosters || rosters.length === 0) return [];

  const rosterIds = rosters.map(r => r.id);

  const { data: rounds } = await supabase
    .from('pro_roster_rounds')
    .select('id, date, roster_id')
    .in('roster_id', rosterIds);

  if (!rounds || rounds.length === 0) return [];

  const roundIds = rounds.map(r => r.id);

  const { data: assignments } = await supabase
    .from('pro_roster_assignments')
    .select('round_id, member_id, status')
    .in('round_id', roundIds)
    .in('status', ['assigned', 'confirmed']);

  if (!assignments || assignments.length === 0) return [];

  const memberIds = [...new Set(assignments.map(a => a.member_id))];
  const { data: members } = await supabase
    .from('members')
    .select('id, first_name, last_name, avatar_url')
    .in('id', memberIds);

  const memberMap = new Map(
    (members || []).map(m => [m.id, m])
  );

  const roundDateMap = new Map(rounds.map(r => [r.id, r.date]));

  return assignments.map(a => {
    const member = memberMap.get(a.member_id);
    return {
      date: roundDateMap.get(a.round_id) || '',
      member_id: a.member_id,
      member_name: member ? `${member.first_name} ${member.last_name}` : 'Unknown',
      member_avatar: member?.avatar_url || null,
      status: a.status,
    };
  });
};

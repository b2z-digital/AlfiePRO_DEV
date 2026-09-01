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
      event_id: formData.event_id || null,
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
  // First, delete any tasks that were created for this roster's assignments
  const { data: assignments } = await supabase
    .from('pro_roster_assignments')
    .select('task_id')
    .eq('roster_id', rosterId)
    .not('task_id', 'is', null);

  if (assignments && assignments.length > 0) {
    const taskIds = assignments.map(a => a.task_id).filter(Boolean);
    if (taskIds.length > 0) {
      await supabase.from('club_tasks').delete().in('id', taskIds);
    }
  }

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
  const { data: existing } = await supabase
    .from('pro_roster_assignments')
    .select('id, task_id')
    .eq('roster_id', rosterId)
    .eq('round_id', roundId)
    .maybeSingle();

  if (existing?.task_id) {
    await supabase.from('club_tasks').delete().eq('id', existing.task_id);
  }
  if (existing) {
    await supabase.from('pro_roster_assignments').delete().eq('id', existing.id);
  }

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

export const removeAssignment = async (rosterId: string, roundId: string): Promise<void> => {
  const { data: existing } = await supabase
    .from('pro_roster_assignments')
    .select('id, task_id')
    .eq('roster_id', rosterId)
    .eq('round_id', roundId)
    .maybeSingle();

  if (!existing) return;

  if (existing.task_id) {
    await supabase.from('club_tasks').delete().eq('id', existing.task_id);
  }

  const { error } = await supabase
    .from('pro_roster_assignments')
    .delete()
    .eq('id', existing.id);

  if (error) throw error;
};

export const ensureTasksForRoster = async (
  rosterId: string,
  clubId: string,
  createdBy: string
): Promise<number> => {
  const details = await getRosterWithDetails(rosterId);
  const roster = details as ProRoster;
  const roundMap = new Map(details.rounds.map(r => [r.id, r]));
  let created = 0;

  for (const assignment of details.assignments) {
    if (assignment.task_id) continue;
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
      created++;
    }
  }

  return created;
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

export interface RosterAssignmentSummary {
  roster_id: string;
  member_ids: string[];
  member_names: string[];
  member_avatars: (string | null)[];
  total_rounds: number;
  assigned_count: number;
  confirmed_count: number;
  round_dates: string[];
  round_assignments: Map<string, { member_id: string; member_name: string; member_avatar: string | null; status: string }>;
}

export const getRosterAssignmentSummaries = async (rosterIds: string[], clubMembers: Array<{ id: string; first_name: string; last_name: string; avatar_url?: string | null }>): Promise<Map<string, RosterAssignmentSummary>> => {
  if (rosterIds.length === 0) return new Map();

  const [{ data: rounds }, { data: assignments }] = await Promise.all([
    supabase.from('pro_roster_rounds').select('id, roster_id, date').in('roster_id', rosterIds).order('date', { ascending: true }),
    supabase.from('pro_roster_assignments').select('id, roster_id, round_id, member_id, status').in('roster_id', rosterIds),
  ]);

  const memberMap = new Map(clubMembers.map(m => [m.id, m]));
  const result = new Map<string, RosterAssignmentSummary>();

  for (const rid of rosterIds) {
    const rosterRounds = (rounds || []).filter(r => r.roster_id === rid);
    const rosterAssignments = (assignments || []).filter(a => a.roster_id === rid);
    const uniqueMembers = [...new Set(rosterAssignments.map(a => a.member_id))];

    const roundAssignments = new Map<string, { member_id: string; member_name: string; member_avatar: string | null; status: string }>();
    for (const round of rosterRounds) {
      const assignment = rosterAssignments.find(a => a.round_id === round.id);
      if (assignment) {
        const m = memberMap.get(assignment.member_id);
        roundAssignments.set(round.date, {
          member_id: assignment.member_id,
          member_name: m ? `${m.first_name} ${m.last_name}` : 'Unknown',
          member_avatar: m?.avatar_url || null,
          status: assignment.status,
        });
      }
    }

    result.set(rid, {
      roster_id: rid,
      member_ids: uniqueMembers,
      member_names: uniqueMembers.map(mid => {
        const m = memberMap.get(mid);
        return m ? `${m.first_name} ${m.last_name}` : 'Unknown';
      }),
      member_avatars: uniqueMembers.map(mid => memberMap.get(mid)?.avatar_url || null),
      total_rounds: rosterRounds.length,
      assigned_count: rosterAssignments.length,
      confirmed_count: rosterAssignments.filter(a => a.status === 'confirmed').length,
      round_dates: rosterRounds.map(r => r.date),
      round_assignments: roundAssignments,
    });
  }
  return result;
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

export const getProAssignmentsForEvents = async (
  eventIds: string[]
): Promise<Map<string, ProAssignmentForDisplay>> => {
  if (eventIds.length === 0) return new Map();

  const { data: rosters } = await supabase
    .from('pro_rosters')
    .select('id, event_id')
    .in('event_id', eventIds)
    .in('status', ['active', 'draft']);

  if (!rosters || rosters.length === 0) return new Map();

  const rosterIds = rosters.map(r => r.id);
  const rosterEventMap = new Map(rosters.map(r => [r.id, r.event_id]));

  const { data: rounds } = await supabase
    .from('pro_roster_rounds')
    .select('id, date, roster_id')
    .in('roster_id', rosterIds);

  if (!rounds || rounds.length === 0) return new Map();

  const roundIds = rounds.map(r => r.id);
  const roundRosterMap = new Map(rounds.map(r => [r.id, r.roster_id]));

  const { data: assignments } = await supabase
    .from('pro_roster_assignments')
    .select('round_id, member_id, status')
    .in('round_id', roundIds)
    .in('status', ['assigned', 'confirmed']);

  if (!assignments || assignments.length === 0) return new Map();

  const memberIds = [...new Set(assignments.map(a => a.member_id))];
  const { data: members } = await supabase
    .from('members')
    .select('id, first_name, last_name, avatar_url')
    .in('id', memberIds);

  const memberMap = new Map((members || []).map(m => [m.id, m]));
  const roundDateMap = new Map(rounds.map(r => [r.id, r.date]));

  const result = new Map<string, ProAssignmentForDisplay>();
  for (const a of assignments) {
    const rosterId = roundRosterMap.get(a.round_id);
    const eventId = rosterId ? rosterEventMap.get(rosterId) : null;
    if (!eventId) continue;
    const member = memberMap.get(a.member_id);
    result.set(eventId, {
      date: roundDateMap.get(a.round_id) || '',
      member_id: a.member_id,
      member_name: member ? `${member.first_name} ${member.last_name}` : 'Unknown',
      member_avatar: member?.avatar_url || null,
      status: a.status,
    });
  }
  return result;
};

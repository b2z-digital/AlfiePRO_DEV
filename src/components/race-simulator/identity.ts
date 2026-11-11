// Who's sailing: the signed-in member's name and their sail number in each class, from their boats
// in My Garage (member_boats). The simulator puts that number on their sail.
import type { ClassId } from '@/sim/classes';
import { sailNumber } from '@/sim/look';

export interface SimIdentity {
  /** "Stephen Walsh" */
  name: string;
  /** "Stephen W", for leaderboards. */
  short: string;
  /** Sail number in each class they have a boat in (digits only). */
  sails: Partial<Record<ClassId, string>>;
}

const CLASS_OF: Record<string, ClassId> = { IOM: 'IOM', DF95: 'DF95', DF65: 'DF65', '10R': '10R', 'Ten Rater': '10R', Marblehead: 'M', M: 'M' };

/**
 * The number that goes on the sail: the last two digits ("AUS 123" → "23", "7" → "07"). Nothing
 * usable (or more than four digits) → null.
 */
export function sailDigits(s: string | null | undefined): string | null {
  const d = (s ?? '').replace(/\D/g, '');
  if (!d || d.length > 4) return null;
  return sailNumber(d);
}

export async function loadIdentity(userId: string, clubId?: string | null): Promise<SimIdentity | null> {
  try {
    const { supabase } = await import('@/utils/supabase');
    const { data: members, error } = await supabase.from('members').select('id, club_id, first_name, last_name').eq('user_id', userId);
    if (error || !members?.length) return null;
    const me = members.find(m => m.club_id === clubId) ?? members[0];
    const first = (me.first_name ?? '').trim(), last = (me.last_name ?? '').trim();
    const name = [first, last].filter(Boolean).join(' ');
    if (!name) return null;
    const { data: boats } = await supabase.from('member_boats').select('boat_type, sail_number, is_primary').in('member_id', members.map(m => m.id));
    const sails: SimIdentity['sails'] = {};
    // Primary boats first, so a member with two IOMs sails their main one.
    for (const b of [...(boats ?? [])].sort((a, c) => Number(!!c.is_primary) - Number(!!a.is_primary))) {
      const cls = CLASS_OF[(b.boat_type ?? '').trim()];
      const sail = sailDigits(b.sail_number);
      if (cls && sail && !sails[cls]) sails[cls] = sail;
    }
    return { name, short: last ? `${first} ${last[0]}` : first, sails };
  } catch {
    return null;
  }
}

// "Write it up": Alfie writes a short report of a Race Simulator race, from its debrief and Alfie's
// moments, through the app's Ask Alfie service (the ask-alfie-chat function, logged as the race
// simulator). Only the facts of the race go in; Alfie tells it like a race report.
import type { Moment } from './moments';
import type { RaceSummary } from './stats';
import { fmt } from './stats';
import { ordinal } from './ui';

const clockOf = (t: number) => (t < 0 ? `−${fmt(-t)}` : fmt(t));

/** The race, as plain facts for Alfie. */
export function raceFacts(sum: RaceSummary, moments: Moment[], gunT: number, where: string): string {
  const lines: string[] = [];
  lines.push(`Where: ${where}.`);
  lines.push(`Boats: ${sum.cls}, ${sum.fleet} boats, ${sum.level}-level AI skippers.`);
  lines.push(`Wind: ${sum.wind}.`);
  if (sum.mode === 'start') lines.push('It was a start practice, not a whole race.');
  lines.push(`Result: ${sum.status === 'finished' && sum.place ? `finished ${ordinal(sum.place)} of ${sum.of}${sum.time !== null ? ` in ${fmt(sum.time)}` : ''}${sum.behind !== null && sum.behind > 0.05 ? `, ${Math.round(sum.behind)} s behind the winner` : sum.place === 1 ? ', a win' : ''}` : sum.status.toUpperCase()}.`);
  lines.push(`Start: ${sum.ocs ? 'over the line at the gun and had to restart' : sum.late === null ? 'did not start' : `${sum.late.toFixed(1)} s after the gun${sum.spdAtGun !== null ? ` at ${Math.round(sum.spdAtGun * 100)}% speed` : ''}`}${sum.fromFavouredL !== null ? `; the ${sum.favoured} was favoured and I started ${Math.round(sum.fromFavouredL)} lengths from it` : ''}.`);
  if (sum.placesByLeg.length > 1) lines.push(`Places by mark: ${sum.placesByLeg.map(p => `${p.label} ${p.place}`).join(', ')}.`);
  if (sum.penalties) lines.push(`Penalty turns taken: ${sum.penalties}.`);
  if (moments.length) {
    lines.push('Moments that mattered:');
    for (const m of moments) lines.push(`- ${clockOf(m.t - gunT)} ${m.title} (${m.tone === 'good' ? 'went well' : m.tone === 'warn' ? 'cost me' : 'note'}): ${m.text.length > 180 ? `${m.text.slice(0, 177)}…` : m.text}`);
  }
  return lines.join('\n');
}

/** Alfie's answer without the greeting he opens a new conversation with. */
export function tidy(text: string): string {
  const t = text.replace(/^\s*(hi|hey|hello|g'day)\b[^\n]*\n+/i, '').replace(/^\s*(hi|hey|hello)\s+[A-Za-z'-]+[,!.]\s*/i, '').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export async function writeUp(facts: string, clubId: string | null): Promise<{ text: string } | { error: string }> {
  const message = [
    'Please write up my Race Simulator race as a short race report I can keep or share, in your voice as my coach.',
    'About 150 to 200 words in two or three plain paragraphs: no greeting, no headings, no lists, no emoji.',
    'Tell it like a race report (the start, the beats and runs, the moments that mattered, the result), then finish with one sentence on what to work on next time.',
    "It was a simulated race against AI skippers, so don't name other skippers or add anything that isn't in these facts.",
    '',
    facts,
  ].join('\n');
  try {
    const { supabase } = await import('@/utils/supabase');
    const { data, error } = await supabase.functions.invoke('ask-alfie-chat', { body: { message, clubId, source: 'race_simulator' } });
    if (error || !data?.message) return { error: "Alfie couldn't write it up just now. Try again in a moment." };
    return { text: tidy(String(data.message)) };
  } catch {
    return { error: "Alfie couldn't write it up just now. Try again in a moment." };
  }
}

// Short plain-English versions of the rules the simulator calls, with the radio sailing changes
// from Appendix E (RRS 2025–2028). For learning in the moment, not a substitute for the rulebook.
export interface RuleText { rule: string; title: string; text: string; rc?: string }

export const RULES: Record<string, RuleText> = {
  '10': { rule: '10', title: 'On opposite tacks', text: 'When boats are on opposite tacks, a port-tack boat keeps clear of a starboard-tack boat.' },
  '11': { rule: '11', title: 'Same tack, overlapped', text: 'When boats on the same tack are overlapped, the windward boat keeps clear of the leeward boat.' },
  '12': { rule: '12', title: 'Same tack, not overlapped', text: 'When boats on the same tack are not overlapped, the boat clear astern keeps clear of the boat clear ahead.' },
  '13': { rule: '13', title: 'While tacking', text: 'After a boat passes head to wind she keeps clear of other boats until she is on a close-hauled course. If two boats are tacking at once, the one on the other\'s port side, or the one astern, keeps clear.' },
  '14': { rule: '14', title: 'Avoiding contact', text: 'Every boat avoids contact if reasonably possible, even one with right of way. A right-of-way boat need not act until it is clear the other is not keeping clear.' },
  '15': { rule: '15', title: 'Acquiring right of way', text: 'When a boat gets right of way by her own actions, she initially gives the other boat room to keep clear.' },
  '16.1': { rule: '16.1', title: 'Changing course', text: 'When a right-of-way boat changes course, she gives the other boat room to keep clear.' },
  '18.2(a)': { rule: '18.2', title: 'Mark-room', text: 'When boats are overlapped as the first of them reaches the zone, the outside boat gives the inside boat mark-room. A boat clear ahead when she reaches the zone gets mark-room from the boat astern.', rc: 'In radio sailing the zone is 4 hull lengths.' },
  '18.2(c)': { rule: '18.2', title: 'Mark-room', text: 'Mark-room is room to sail to the mark and then sail her proper course while at it. The boat that must give it keeps giving it while the entitled boat is in the zone.', rc: 'In radio sailing the zone is 4 hull lengths.' },
  '18.3': { rule: '18.3', title: 'Passing head to wind in the zone', text: 'If a boat passes head to wind from port to starboard in the zone of a mark left to port, she must not make a boat that has been on starboard since entering the zone sail above close-hauled to avoid her, and she gets no mark-room from it.', rc: 'In radio sailing the zone is 4 hull lengths.' },
  '21': { rule: '21', title: 'Starting errors and penalties', text: 'A boat returning to the pre-start side after being over at the start, or taking a penalty, keeps clear of boats that are not.' },
  '29.1': { rule: '29.1', title: 'Individual recall', text: 'If any part of a boat is on the course side of the line at the starting signal, she must return completely to the pre-start side and then start.', rc: 'In radio sailing the race officer hails "Recall" with the sail numbers.' },
  '31': { rule: '31', title: 'Touching a mark', text: 'While racing, a boat does not touch a mark (including a starting mark before she starts).', rc: 'Appendix E: take a One-Turn Penalty.' },
  '44': { rule: '44', title: 'One-Turn Penalty', text: 'Get well clear of other boats as soon as possible after the incident, then make one turn in the same direction including one tack and one gybe.', rc: 'Appendix E replaces the Two-Turns Penalty with a One-Turn Penalty, for Part 2 rules and rule 31.' },
};

export function ruleText(rule: string): RuleText | null {
  return RULES[rule] ?? RULES[rule.split('(')[0]] ?? null;
}

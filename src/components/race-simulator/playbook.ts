// The Playbook: race strategy and tactics for radio sailing, a play at a time. Each play says when
// it applies, what to do, why it works, the usual mistake, and what's different sailing from the
// bank, and each points at the drill, rules lesson or scenario that practises it. The plays are the
// established principles of fleet racing (see READING for where to go deeper), written afresh here.
import { DRILLS, LAB, MODULES } from '@/sim/training';
import type { Cause } from './ledger';
import type { TrainLink } from './stats';

export type Chapter = 'plan' | 'start' | 'upwind' | 'marks' | 'downwind' | 'behind' | 'series';
export const CHAPTERS: { id: Chapter; title: string; text: string }[] = [
  { id: 'plan', title: 'Before the start', text: 'Read the course while the others are still launching.' },
  { id: 'start', title: 'The start', text: 'Front row, full speed, room to leeward, going the way you want.' },
  { id: 'upwind', title: 'The beat', text: 'Clear air, the lifted tack, and no corners.' },
  { id: 'marks', title: 'Marks', text: 'Arrive with rights and leave with speed.' },
  { id: 'downwind', title: 'The run', text: 'Pressure first, then angle, then the boats behind.' },
  { id: 'behind', title: 'Coming back', text: 'Making up ground without gambling.' },
  { id: 'series', title: 'Winning the day', text: 'A regatta is won on your worst race, not your best.' },
];

export interface PlayLink { kind: 'drill' | 'lesson' | 'lab'; id: string }
export interface Play {
  id: string; chapter: Chapter; title: string;
  /** The situation it's for. */
  when: string;
  /** What to do, a step to a line. */
  how: string[];
  why: string;
  /** What most skippers do instead. */
  mistake: string;
  /** What's different sailing a radio yacht from the bank. */
  radio?: string;
  /** The line to carry onto the water. */
  remember: string;
  practise: PlayLink[];
  /** The slice of the loss ledger this play shrinks. */
  fixes?: Cause;
}

const drill = (id: string): PlayLink => ({ kind: 'drill', id });
const lab = (id: string): PlayLink => ({ kind: 'lab', id });
const lesson = (id: string): PlayLink => ({ kind: 'lesson', id });

export const PLAYS: Play[] = [
  // ── Before the start ──
  {
    id: 'three-questions', chapter: 'plan', title: 'Three questions before every start',
    when: 'The minutes before the sequence, every race.',
    how: [
      'Which end of the line is closer to the wind? Sail along the line each way: the end you point higher towards is favoured.',
      'Which side of the beat do you want? Look for more wind (darker water) and for the shift that keeps coming back.',
      "Where will the crowd be? The favoured end draws it. Decide now whether you'll fight for it or start just down from it with room.",
    ],
    why: 'A start with a plan beats a better-timed start with none: you know which way you turn if it goes wrong.',
    mistake: 'Sailing about until the last minute, then starting wherever there happens to be a gap.',
    radio: "You can't feel the wind on your face. Read it from the boats: who is lifted, whose sails are fuller, where the ripples are darker.",
    remember: 'End, side, crowd.',
    practise: [drill('favoured-end')], fixes: 'start',
  },
  {
    id: 'average-wind', chapter: 'plan', title: 'Know the average before the gun',
    when: 'Shifty days, which on a pond is most days.',
    how: [
      'Watch the wind graph (or the boats) for two minutes and fix the middle of the swing in your head.',
      "At the gun, ask one thing: is the wind left or right of that middle? That tells you which tack is lifted off the line.",
    ],
    why: 'You can only call a header if you know what normal is. Everything on the beat hangs on this number.',
    mistake: 'Calling every wobble a shift, and tacking on it.',
    remember: 'Left or right of average?',
    practise: [lab('last-beat')], fixes: 'shifts',
  },

  // ── The start ──
  {
    id: 'own-a-gap', chapter: 'start', title: 'Own a gap, then use it',
    when: 'The last thirty seconds.',
    how: [
      'Set up on starboard a length or two below the line with a boat-width of clear water to leeward.',
      'Protect the gap: when a boat comes in below you, luff gently to close the door, then bear away into your space again.',
      'Know how long she takes to reach full speed (a few seconds: the "Full speed at the gun" drill shows you). Pull the trigger that long before the gun, bearing away into your gap to accelerate.',
    ],
    why: 'The gap to leeward is what lets you put the bow down and sail fast for the first minute. Without it you are pinned, slow and in bad air.',
    mistake: 'Sitting on the line stopped, sheeting in at the gun, and being rolled by the boat that came in with speed.',
    radio: 'From the bank the line is hard to judge unless you stand at its end. Use the countdown and your time-to-line, not your eye.',
    remember: 'Speed at the gun beats position at the gun.',
    practise: [drill('hold-spot'), drill('time-distance'), drill('trigger'), drill('speed')], fixes: 'start',
  },
  {
    id: 'favoured-end', chapter: 'start', title: 'The favoured end, or just down from it',
    when: 'One end is closer to the wind by five degrees or more.',
    how: [
      'Five degrees of bias on a ten-length line is most of a length: worth having.',
      'If you can win the end cleanly, take it.',
      'If six boats want it, start a third of the way down in clear air: you give away half a length and keep your speed.',
      'Pin favoured: approach on starboard and hold your lane. Starboard end favoured: come in from below the layline to the mark so nobody can shut you out.',
    ],
    why: "The bias is free distance, but only for the boat that crosses at speed. A slow start at the right end loses to a fast one near it.",
    mistake: 'Barging in above the layline at the starboard end and being shut out with nowhere to go.',
    remember: 'Near the favoured end, at full speed, with a way out.',
    practise: [drill('pin'), drill('boat-end'), lesson('right-of-way/windward-leeward')], fixes: 'start',
  },
  {
    id: 'start-for-the-side', chapter: 'start', title: 'On a square line, start for the side you want',
    when: 'No end is favoured, or the bias is small.',
    how: [
      'Want the right? Start near the starboard end so you can tack onto port as soon as you clear the boats above you.',
      'Want the left? Start further down the line and hold starboard: nobody to leeward can make you tack.',
      'No idea? Start in the middle third and keep both options.',
    ],
    why: 'When the line gives nothing away, the first shift decides the beat. Being free to go to it matters more than a few feet of line.',
    mistake: "Winning the pin on a square line, then being unable to tack because the fleet is on your hip.",
    remember: 'Start where you can go where you want.',
    practise: [drill('favoured-end'), drill('crowded')], fixes: 'start',
  },
  {
    id: 'port-start', chapter: 'start', title: 'The port-tack start',
    when: 'The pin is well favoured, the line is short of boats at that end, and you have judged it more than once.',
    how: [
      'Hover on port below the pin, out of the way of the starboard boats lining up.',
      "Go for the line on port and cross ahead of them, or duck the first boat's stern and take the next gap.",
      'Every starboard boat has right of way. If in doubt, duck early and cleanly.',
    ],
    why: 'On a pin-favoured line port tack is the lifted tack and takes you straight to the left. Done right you lead at the first cross.',
    mistake: 'Trying it on a crowded line with no escape, and taking a penalty in the first ten seconds.',
    remember: 'A port start needs an exit.',
    practise: [drill('port-start'), lesson('right-of-way/port-starboard')], fixes: 'start',
  },
  {
    id: 'second-row', chapter: 'start', title: 'Buried? Get out in the first ten seconds',
    when: 'You are in the second row at the gun, in bad air.',
    how: [
      'Decide at once: do not sail on in dirty air hoping.',
      'If there is a gap behind the boats to windward, tack onto port and duck sterns until your air is clear.',
      "If you can't tack, put the bow down and foot out to leeward into clear wind.",
    ],
    why: 'Dirty air costs lengths for every minute you stay in it. A tack and two ducks cost a couple of lengths, once.',
    mistake: 'Staying put for a minute because tacking feels like giving up.',
    remember: 'Bad air: move now.',
    practise: [lab('dirty-air'), drill('crowded')], fixes: 'air',
  },
  {
    id: 'over-early', chapter: 'start', title: 'Over early: back the short way',
    when: 'You hear your number in the recall.',
    how: [
      'Go back at once: every second you argue with yourself is a length.',
      'Dip below the line by the shortest route that keeps clear of boats starting properly. They all have right of way over you until you are back.',
      'Restart on the tack with clear air, which is often port.',
    ],
    why: 'A fast recovery puts you fifteen seconds behind. A slow one, or not going back, ends the race.',
    mistake: 'Carrying on in the hope it was someone else.',
    remember: 'Recalled: turn now.',
    practise: [drill('recall'), lesson('starting/over-early')], fixes: 'start',
  },
  {
    id: 'light-start', chapter: 'start', title: 'Light air: keep her moving',
    when: 'Under about five knots.',
    how: [
      'Never stop. A radio yacht takes a very long time to get going again in light air.',
      'Make a timed run instead of hovering: sail away from the line, turn, and come back on the clock.',
      'Stay away from the crowd: a wall of sails kills what wind there is.',
    ],
    why: 'In light air the boat with way on at the gun gains for the whole first beat.',
    mistake: 'Hovering on the line as you would in a breeze, and starting from a standstill.',
    remember: 'In the light, speed is everything.',
    practise: [drill('light-air'), drill('timed-run'), lab('speed-light')], fixes: 'start',
  },

  // ── The beat ──
  {
    id: 'lifted-tack', chapter: 'upwind', title: 'Sail the lifted tack',
    when: 'The wind is swinging either side of an average.',
    how: [
      'Be on the tack that points you closer to the mark. On the wind card: wind left of average, be on port; right of average, be on starboard.',
      'When you are headed five degrees or more below the average, tack.',
      'Ignore a wobble of two or three degrees: a tack costs about a length.',
    ],
    why: 'With the wind ten degrees off its average, the boat on the lifted tack makes over a third more ground to windward than the boat on the headed one.',
    mistake: 'Tacking on every flick, or sailing a header all the way to the layline.',
    radio: 'Watch the boats ahead and to windward: when they are knocked, your header is coming.',
    remember: 'Headed five: tack.',
    practise: [lab('last-beat'), lab('tacks')], fixes: 'shifts',
  },
  {
    id: 'long-tack', chapter: 'upwind', title: 'Long tack first, and stay off the corners',
    when: "You don't know what the wind will do next.",
    how: [
      'Sail first on the tack that points more nearly at the mark.',
      'Stay inside the laylines until the last third of the beat.',
      'Cross back towards the middle when you are lifted and ahead.',
    ],
    why: 'From the middle every shift is a chance. On a layline a lift is wasted (you overstand) and a header lets everyone below you cross.',
    mistake: 'Banging a corner on a hunch. It wins now and then, and loses far more often.',
    remember: 'The middle keeps your options.',
    practise: [lab('layline'), lab('last-beat')], fixes: 'laylines',
  },
  {
    id: 'cross-duck-leebow', chapter: 'upwind', title: 'Cross, duck or lee-bow',
    when: 'You are on port and a starboard boat is converging.',
    how: [
      'Decide four lengths out, not one.',
      'Clear ahead by a length: cross.',
      'Not clear, and you want to keep going right: bear away early and pass close behind her stern, easing the sail as you go down and sheeting in as you come up. It costs under a length.',
      'Not clear, and you want the left: tack just to leeward and ahead of her, far enough ahead that she never has to alter course. She now sails in your backwind.',
    ],
    why: 'Each answer keeps your strategy. Tacking under her because you panicked takes you the way she wants.',
    mistake: 'Leaving it late, then a crash tack too close, and a penalty turn.',
    remember: 'Decide early. Never make her alter.',
    practise: [lab('cross-or-duck'), lesson('right-of-way/port-starboard'), lesson('changing-course/tacking')], fixes: 'penalties',
  },
  {
    id: 'clear-lanes', chapter: 'upwind', title: 'Sail in clear air',
    when: 'Always, but above all in the first two minutes.',
    how: [
      "A boat's wind shadow stretches several lengths to leeward and astern of her. Dead astern and close on her leeward quarter are the worst places to be.",
      'If you cannot hold your lane, tack away or foot off for a clear one.',
      'Before you tack, look at where you will end up: do not tack into the shadow of the boat behind her.',
    ],
    why: 'Speed differences between good boats are tiny. The difference between clear and dirty air is not.',
    mistake: 'Following the leader in her dirty air because she must know where she is going.',
    remember: 'A clear lane is worth a tack.',
    practise: [lab('dirty-air')], fixes: 'air',
  },
  {
    id: 'cover', chapter: 'upwind', title: 'Ahead: stay between them and the mark',
    when: 'You lead a boat or a group you need to beat.',
    how: [
      'When she tacks, tack: keep yourself between her and the next mark.',
      'Cover loosely to herd her the way you want (sit on her air only on the tack you do not want her on).',
      'With the fleet split, cover the bigger group, or the boats that matter in the series.',
    ],
    why: 'From in front you cannot lose to a boat sailing the same wind as you. You lose by letting her find her own.',
    mistake: 'Sailing off to the favoured side alone and letting the fleet have the other one.',
    remember: 'Ahead: defend. Behind: split.',
    practise: [lab('cover')],
  },
  {
    id: 'clean-turns', chapter: 'upwind', title: 'Make every tack and gybe a clean one',
    when: 'Every time you turn.',
    how: [
      'Tack from full speed, never from a pinch.',
      'Turn her firmly through the wind, then take the rudder off early and let her build speed before you point up.',
      'Gybe smoothly from her best angle on one side to her best on the other, and no further.',
      'Count your tacks: each one costs about a length even when it is perfect, so make each one for a reason.',
    ],
    why: 'Ten tacks a race at two lengths each instead of one is ten lengths: often the whole gap to the boat in front.',
    mistake: 'Holding the rudder over too long, coming out on a reach, and then pinching back up.',
    remember: 'Speed in, rudder off early.',
    practise: [lab('tacks'), lab('gybes')], fixes: 'turns',
  },
  {
    id: 'gears', chapter: 'upwind', title: 'Change gear for the water',
    when: 'Chop, gusts or light patches.',
    how: [
      'Flat water and a steady breeze: sheet right in and point.',
      'Chop: sail a touch lower and faster, with quiet hands. Pinching into waves stops her.',
      'Gusts that lay her over: ease the sail a little until she stands up, then squeeze it back in.',
      'Very light: ease a hair and steer as little as you can.',
    ],
    why: 'The fastest setting changes with the water. The boats at the front change with it.',
    mistake: 'One trim and one angle all the way round.',
    remember: 'Speed first, then height.',
    practise: [lab('speed-up-chop'), lab('speed-up-blow'), lab('speed-light')], fixes: 'speed',
  },

  // ── Marks ──
  {
    id: 'top-mark', chapter: 'marks', title: 'Mark 1: starboard, and not too early',
    when: 'The last third of the beat.',
    how: [
      'Get onto the starboard layline between four and eight lengths from the mark: late enough to use the last shift, early enough to arrive with rights.',
      'Add a little height for bad air if boats are stacked on the layline.',
      'Avoid tacking inside the zone in front of starboard boats: there you have almost no rights.',
    ],
    why: 'A port-tack approach into a line of starboard boats is where most first-beat penalties happen.',
    mistake: 'Hitting the layline from a long way out and sailing the whole of it in dirty air.',
    radio: "The far mark is where judging distance is hardest. Give yourself a boat-length more than you think you need, and watch the boat ahead: if she lays it, so do you.",
    remember: 'Starboard layline, late.',
    practise: [lab('port-approach'), lab('layline'), lesson('mark-room/tack-in-zone'), lesson('mark-room/opposite-tacks')], fixes: 'laylines',
  },
  {
    id: 'wide-tight', chapter: 'marks', title: 'In wide, out tight',
    when: 'Every leeward mark and gate.',
    how: [
      'Start a boat-length wide of the mark so your turn is finished as you pass it.',
      'Sheet in steadily as she turns: the sail comes in with the bow.',
      'Come out close-hauled, touching distance from the mark, with speed.',
    ],
    why: 'The boat that exits tight and fast owns the height for the next beat. The boat that went in tight comes out wide, slow and to leeward of everyone.',
    mistake: 'Aiming at the mark and turning after it.',
    remember: 'Wide in, tight out.',
    practise: [lab('gate-exit'), lab('bear-away')], fixes: 'roundings',
  },
  {
    id: 'inside-overlap', chapter: 'marks', title: 'Win the inside before the zone',
    when: 'Running into a leeward mark with boats around you.',
    how: [
      'The overlap that counts is the one at four lengths from the mark. Work for the inside before then.',
      'Outside with no hope of the inside? Slow a touch, let her round, and follow her tight on the inside of her wake instead of going round the outside.',
      'Give the room you owe: an argument at the mark costs more than the place.',
    ],
    why: 'Inside at the zone is a right to room. Outside is a long way round in bad air.',
    mistake: 'Charging in late calling for room you do not have.',
    remember: 'Inside at four lengths.',
    practise: [lab('crowded-rounding'), lesson('mark-room/inside-leeward')], fixes: 'roundings',
  },
  {
    id: 'gate-choice', chapter: 'marks', title: 'Choosing the gate mark',
    when: 'Halfway down the run.',
    how: [
      'First: which side of the next beat do you want? Take the mark that sends you there.',
      'Second: which mark is further upwind? A skewed gate can be worth a length.',
      'Third: which has fewer boats? A clean rounding of the wrong mark beats a queue at the right one.',
    ],
    why: 'The gate is the one place the course lets you choose. Choosing late means choosing badly.',
    mistake: 'Following the boat ahead round whichever mark she picks.',
    remember: 'Next beat, then distance, then traffic.',
    practise: [lab('gate-choice')], fixes: 'roundings',
  },

  // ── The run ──
  {
    id: 'run-angles', chapter: 'downwind', title: 'Downwind: pressure, then the headed gybe',
    when: 'Every run.',
    how: [
      'Sail for the darker water: a puff lasts longer downwind because you travel with it.',
      'Downwind the shift rule turns round: gybe when you are lifted, so you are always on the gybe that points closer to the mark.',
      "Sail an angle a little above dead downwind. She's faster, steadier, and it more than pays for the distance.",
    ],
    why: 'Most skippers switch off on the run. It is where places are easiest to take.',
    mistake: 'Pointing straight at the mark with the boats behind sitting on your wind.',
    remember: 'Downwind: gybe on the lifts.',
    practise: [lab('speed-down-chop'), lab('gybes')], fixes: 'shifts',
  },
  {
    id: 'attack-defend', chapter: 'downwind', title: 'Attack and defend with your wind shadow',
    when: 'A boat is close ahead or close astern on the run.',
    how: [
      'Attacking: put your sails between her and the wind, directly upwind of her. When she slows, pass on the side that gives you the inside at the next mark.',
      'Defending: when she lines up on your wind, move sideways out of it early (a small luff or a gybe) instead of sailing on in it.',
      'Do not get dragged into a luffing match that takes you both off the course while the fleet sails by.',
    ],
    why: 'Downwind the boat behind has the weapon. Use it when you are behind, and step out of it when you are ahead.',
    mistake: 'Looking only forwards on the run.',
    remember: 'Behind: blanket. Ahead: step aside.',
    practise: [lab('downwind-pass'), lab('defend-run'), lesson('changing-course/proper-course')], fixes: 'air',
  },
  {
    id: 'heavy-run', chapter: 'downwind', title: 'A breezy run: keep the bow up',
    when: 'She starts to bury her bow in the gusts.',
    how: [
      'Steer early and small.',
      'When the bow goes down, weave gently from side to side to shed it.',
      'In the big gusts come up a few degrees instead of running square.',
    ],
    why: 'A nose-dive stops her dead and can cost many lengths. Staying on her feet is the whole game.',
    mistake: 'Running square in the gust with the rudder hard over.',
    remember: 'Bow going down: weave.',
    practise: [lab('speed-down-blow')], fixes: 'speed',
  },

  // ── Coming back ──
  {
    id: 'comeback', chapter: 'behind', title: 'Behind: clear air, then small gains',
    when: 'A bad start or a bad first beat.',
    how: [
      'First get clear air, even if it costs a tack.',
      'Then sail the shifts better than the boats in front: they are covering each other, you are free.',
      'Pass boats in ones and twos at the marks and on the run. Do not look for one move that passes ten.',
    ],
    why: 'Fleets compress at every mark. A boat that sails cleanly from fifteenth is usually eighth by the finish.',
    mistake: 'Banging the corner nobody else took, to get it all back at once.',
    remember: 'One boat at a time.',
    practise: [lab('dirty-air'), lab('last-beat'), lab('downwind-pass')], fixes: 'air',
  },
  {
    id: 'penalty', chapter: 'behind', title: 'A penalty: turn now, and turn well',
    when: 'You have fouled, or touched a mark.',
    how: [
      'Get clear of other boats and turn at once: one tack and one gybe.',
      'Start the turn with the gybe if you are going downwind, the tack if upwind, so you come out pointing the right way.',
      'A good turn costs about five lengths. Arguing, or turning late in traffic, costs more.',
    ],
    why: 'Five lengths is recoverable. A disqualification is not.',
    mistake: 'Sailing on, hoping nobody protests, and losing the race in the room.',
    remember: 'Fouled: turn at once.',
    practise: [lab('penalty-comeback'), lesson('penalties/one-turn')], fixes: 'penalties',
  },
  {
    id: 'last-beat', chapter: 'behind', title: 'The last beat: decide who you are racing',
    when: 'The final leg.',
    how: [
      'Ahead of the boat that matters: cover her, however ugly it feels.',
      'Behind her: go the other way on the first good header and make her choose.',
      'The finish line has a favoured end too: the end further downwind is closer. Aim for it.',
    ],
    why: 'Places change on the last beat because leaders stop covering and followers stop trying.',
    mistake: 'Sailing your own race when you only had to beat one boat.',
    remember: 'Finish at the downwind end.',
    practise: [lab('last-beat'), lab('cover')],
  },

  // ── Winning the day ──
  {
    id: 'see-your-boat', chapter: 'series', title: 'Sail where you can see her',
    when: 'Every race, from the control area.',
    how: [
      'Walk with your boat when the rules allow, and stand where you can see both her and the next mark.',
      'At the far end of the course, keep it simple: no close crosses, no tight laylines.',
      'Know your sail number from behind and in silhouette before you need to.',
    ],
    why: "Most radio-sailing incidents happen far from the bank, where a boat-length looks like nothing.",
    mistake: 'A brave call at fifty metres that you would never make at ten.',
    radio: 'In the bank view, this is what the camera does for you: note where it stands and stand there on the day.',
    remember: 'Far away: keep it simple.',
    practise: [lab('port-approach'), lab('crowded-rounding')], fixes: 'penalties',
  },
  {
    id: 'consistency', chapter: 'series', title: 'Count your worst race',
    when: 'A day of heats, or a series with discards.',
    how: [
      'Aim for a string of top-five results, not one win and a disaster.',
      'Take the low-risk start and the low-risk lane when you are near the front of the series.',
      'After a bad race, change one thing, not five.',
    ],
    why: 'Series are won by the skipper whose bad races are sixth, not sixteenth.',
    mistake: 'Chasing a win in every race and collecting two penalties doing it.',
    remember: 'Keep the bad ones small.',
    practise: [lab('cover'), lab('penalty-comeback')],
  },
];

/** Where to go deeper: the standard works these plays come from, and radio-sailing guides. */
export const READING: { title: string; by: string; note: string; url?: string }[] = [
  { title: 'Speed & Smarts', by: 'David Dellenbaugh', note: 'The racing newsletter. Start with "How to make a starting plan".', url: 'https://www.mysailing.com.au/david-dellenbaugh-how-to-make-a-starting-plan/' },
  { title: 'Winning in One-Designs', by: 'Dave Perry', note: 'The standard book on fleet racing: starts, tactics and the rules in practice.' },
  { title: 'Advanced Racing Tactics', by: 'Stuart Walker', note: 'Deeper, for when the basics are automatic.' },
  { title: 'Sailing the course: a simple guide', by: 'Model Yachting Association (UK)', note: 'Radio sailing, written for newcomers.', url: 'https://www.mya-uk.org.uk/kb/sailing-the-course-a-simple-guide-for-those-new-to-sailing/' },
  { title: 'Radio Sailing Rules Made Simple', by: 'Perth Radio Sailing Club', note: 'The rules as they apply from the bank.', url: 'https://www.perthradiosailing.com.au/uploads/Radio%20Sailing Rules Made Simple.pdf' },
];

/** The plays that shrink a slice of the loss ledger, best first. */
export const playsFor = (cause: Cause): Play[] => PLAYS.filter(p => p.fixes === cause);

/** A play's practice as a link the simulator can open, named by what it opens. */
export function practiceLink(l: PlayLink): TrainLink {
  if (l.kind === 'drill') return { kind: 'drill', id: l.id, label: `Start Trainer: ${DRILLS.find(d => d.id === l.id)?.title ?? l.id}` };
  if (l.kind === 'lab') return { kind: 'lab', id: l.id, label: `Scenario: ${LAB.find(m => m.id === l.id)?.title ?? l.id}` };
  const [mod, sit] = l.id.split('/');
  return { kind: 'lesson', id: l.id, label: `Rules: ${MODULES.find(m => m.id === mod)?.situations.find(s => s.id === sit)?.title ?? l.id}` };
}

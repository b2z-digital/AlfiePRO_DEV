// The sailing words a drill uses, in plain English, so a skipper new to the sport isn't left
// guessing. A drill's card lists the ones its own text uses ("Words used here").

export interface Word { word: string; means: string; /** Forms that count as this word. */ forms: string[] }

export const WORDS: Word[] = [
  { word: 'Close-hauled', forms: ['close-hauled'], means: 'Sailing as close to the wind as she will go, with the sail right in: about 40 to 45° off the wind. Any closer and the front of the sail starts to flap.' },
  { word: 'Pinching', forms: ['pinch', 'pinching', 'pinched'], means: 'Steering closer to the wind than close-hauled. The front of the sail flutters and she slows right down.' },
  { word: 'Footing', forms: ['foot', 'footing', 'footed'], means: 'Sailing a few degrees further from the wind than close-hauled, with the sail still right in. You point a little lower but go faster, which pays in waves.' },
  { word: 'Bear away', forms: ['bear away', 'bearing away', 'bears away', 'bear-away'], means: 'Turn the bow away from the wind. On starboard tack (wind over her right side) that is a turn to her left.' },
  { word: 'Luff up', forms: ['luff', 'luff up', 'luffing', 'head up', 'come up'], means: 'Turn the bow towards the wind.' },
  { word: 'Tack', forms: ['tack', 'tacks', 'tacking'], means: 'Turn the bow through the wind, so the wind comes over her other side and the sail swaps sides.' },
  { word: 'Gybe', forms: ['gybe', 'gybes', 'gybing'], means: 'Going downwind, turn the stern through the wind, so the boom swings across to the other side.' },
  { word: 'Starboard and port tack', forms: ['starboard', 'port'], means: 'Starboard tack: the wind comes over her right side and the sail is out on her left. Port tack: the other way round. A boat on starboard has right of way over one on port.' },
  { word: 'Header', forms: ['header', 'headers', 'headed'], means: 'A swing in the wind that makes you steer further from the mark to keep the sail full. The time to tack.' },
  { word: 'Lift', forms: ['lift', 'lifted', 'lifts'], means: 'A swing in the wind that lets you point closer to the mark. Stay on that tack.' },
  { word: 'Sheet in, ease', forms: ['sheet in', 'sheet right in', 'ease', 'eased', 'easing'], means: 'Sheet in: pull the sail in. Ease: let it out a little.' },
  { word: 'Speed made good', forms: ['speed made good', 'of her best'], means: 'How fast you are getting towards the mark, not just how fast the boat is moving. "80% of her best" means 80% of the best this boat can do towards it in this wind.' },
  { word: 'Chop', forms: ['chop'], means: 'Short, steep little waves that knock the bow about.' },
  { word: 'The beat', forms: ['beat', 'upwind'], means: 'The leg up to mark 1, into the wind. You can\'t sail straight at it, so you zig-zag close-hauled, tacking between.' },
  { word: 'The run', forms: ['run', 'downwind'], means: 'The leg back down, with the wind behind you and the sail right out.' },
  { word: 'Dead downwind', forms: ['dead downwind', 'square to the wind', 'run square', 'running square'], means: 'Pointing straight away from the wind. Most boats go faster turned a little towards the wind from there.' },
  { word: 'Heeling, laid over', forms: ['heel', 'heeled', 'laid over', 'laid right over'], means: 'Leaning over. Too far, and she slows and the rudder loses its grip.' },
  { word: 'Overpowered', forms: ['overpowered'], means: 'Too much wind for the sail: she leans right over and slows. Easing the sail a touch stands her up.' },
  { word: 'Nose-dive and broach', forms: ['nose-dive', 'buries her bow', 'broach', 'broaches'], means: 'Downwind in waves the bow can dig into the wave ahead (a nose-dive) and the boat spins out of control towards the wind (a broach).' },
  { word: 'Head to wind', forms: ['head to wind'], means: 'The bow pointing straight into the wind, the sail flapping. She stops if she stays there.' },
  { word: 'Layline', forms: ['layline', 'laylines'], means: 'The line from which you can just sail to the mark without another tack.' },
  { word: 'The zone', forms: ['zone'], means: 'The circle four hull lengths round a mark. Inside it, the rules about room at the mark apply.' },
  { word: 'Offset mark', forms: ['offset mark', 'offset'], means: 'A small mark a few lengths from mark 1. You round it too before the run.' },
  { word: 'The gate', forms: ['gate'], means: 'Two marks side by side at the bottom of the run. Round either one.' },
  { word: 'Reach', forms: ['reach', 'reaching'], means: 'Sailing across the wind, with the sail about half out.' },
  { word: 'Abeam', forms: ['abeam', 'beside you'], means: 'Directly beside the boat, level with her middle.' },
  { word: 'Wind shadow', forms: ['wind shadow', 'dirty air', 'bad air', 'clear air', 'backwind'], means: 'The disturbed, weaker wind behind and downwind of another boat\'s sail. Clear air is wind nobody has sailed through.' },
  { word: 'Duck', forms: ['duck'], means: 'Bear away to pass just behind another boat\'s stern.' },
  { word: 'Lee-bow', forms: ['lee-bow'], means: 'Tack just ahead and to leeward (downwind) of another boat, so the wind off your sail slows her.' },
  { word: 'Leeward, windward', forms: ['leeward', 'windward', 'to leeward', 'to windward'], means: 'Leeward: the side away from the wind (downwind). Windward: the side the wind comes from.' },
  { word: 'Cover', forms: ['cover', 'covering'], means: 'Stay between your rival and the next mark, so whatever the wind does helps you as much as her.' },
  { word: 'Overlap and mark-room', forms: ['overlap', 'mark-room'], means: 'Two boats overlap when neither is clear ahead. The boat on the inside at the zone gets room to sail round the mark.' },
];

/** The words a drill's own text uses, in the order of the list. */
export function wordsIn(...texts: (string | undefined)[]): Word[] {
  const all = texts.filter(Boolean).join(' ').toLowerCase();
  return WORDS.filter(w => w.forms.some(f => new RegExp(`(^|[^a-z-])${f.replace(/[-]/g, '\\-')}($|[^a-z-])`).test(all)));
}

// What a free skipper has used on this device: the class they sail (the first they raced), and how
// many races they've sailed on their own transmitter.
const KEY = 'alfie-academy-free-v1';

export interface FreeUse { classId: string | null; transmitterRaces: number }

export function loadFreeUse(): FreeUse {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<FreeUse> | null;
    return { classId: typeof v?.classId === 'string' ? v.classId : null, transmitterRaces: Math.max(0, Number(v?.transmitterRaces) || 0) };
  } catch { return { classId: null, transmitterRaces: 0 }; }
}

export function saveFreeUse(u: FreeUse): FreeUse {
  try { localStorage.setItem(KEY, JSON.stringify(u)); } catch { /* storage unavailable */ }
  return u;
}

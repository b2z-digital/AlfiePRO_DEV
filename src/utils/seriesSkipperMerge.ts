export const getSkipperSailNumber = (skipper: any): string =>
  String(skipper?.sailNumber || skipper?.sailNo || '').trim();

const getSkipperNameKey = (skipper: any): string =>
  String(skipper?.name || '').trim().replace(/\s+/g, ' ').toLowerCase();

const getSkipperHull = (skipper: any): string =>
  String(skipper?.hull || skipper?.boatModel || skipper?.design || '').trim();

export interface MergedSeriesSkipper {
  [key: string]: any;
  nameKey: string;
  sourceIndices: number[];
  sailNumbers: string[];
  hulls: string[];
  displaySailNo: string;
  displayHull: string;
}

// A skipper who changes boats between rounds appears once per sail number in the
// series list; leaderboard standings are per person, so group those entries by name.
export function mergeSeriesSkippersByName(skippers: any[]): MergedSeriesSkipper[] {
  const merged: MergedSeriesSkipper[] = [];
  const byKey = new Map<string, MergedSeriesSkipper>();

  skippers.forEach((skipper, index) => {
    const nameKey = getSkipperNameKey(skipper);
    const sail = getSkipperSailNumber(skipper);
    const hull = getSkipperHull(skipper);
    const key = nameKey ? `name:${nameKey}` : `sail:${sail}:${index}`;

    let entry = byKey.get(key);
    if (!entry) {
      entry = { ...skipper, nameKey, sourceIndices: [], sailNumbers: [], hulls: [], displaySailNo: '', displayHull: '' };
      byKey.set(key, entry);
      merged.push(entry);
    }
    entry.sourceIndices.push(index);
    if (sail && !entry.sailNumbers.includes(sail)) entry.sailNumbers.push(sail);
    if (hull && !entry.hulls.includes(hull)) entry.hulls.push(hull);
    if (!entry.avatarUrl && skipper.avatarUrl) entry.avatarUrl = skipper.avatarUrl;
  });

  merged.forEach(entry => {
    entry.displaySailNo = entry.sailNumbers.join(', ');
    entry.displayHull = entry.hulls.join(', ');
  });

  return merged;
}

export function findRoundSkipperIndex(roundSkippers: any[], merged: MergedSeriesSkipper): number {
  if (merged.nameKey) {
    const byName = roundSkippers.findIndex(rs => getSkipperNameKey(rs) === merged.nameKey);
    if (byName !== -1) return byName;
  }
  return roundSkippers.findIndex(rs => {
    const sail = getSkipperSailNumber(rs);
    return sail !== '' && merged.sailNumbers.includes(sail);
  });
}

export function getMergedOverride(
  overrides: Record<number, number> | undefined,
  merged: MergedSeriesSkipper
): number | undefined {
  if (!overrides) return undefined;
  for (const idx of merged.sourceIndices) {
    if (overrides[idx] !== undefined) return overrides[idx];
  }
  return undefined;
}

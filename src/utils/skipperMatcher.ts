/**
 * Skipper Matcher / Reconciliation Engine
 *
 * When a Race Officer adds skippers manually while offline (or before
 * the member cache has synced), this engine reconciles those manually-
 * entered skippers with the club's actual member records once connectivity
 * is restored.
 *
 * Multi-pass matching:
 * 1. Sail number + boat class (definitive match)
 * 2. Exact name match (high confidence)
 * 3. Fuzzy/partial name match (requires review)
 */

import { Member } from '../types/member';
import { Skipper } from '../types';

export interface MatchResult {
  skipperId: string;
  skipperName: string;
  skipperSailNumber?: string;
  skipperBoatClass?: string;
  matchedMember: Member | null;
  confidence: 'definitive' | 'high' | 'medium' | 'low' | 'none';
  reason: string;
  requiresReview: boolean;
}

function getSkipperId(skipper: Skipper, index: number): string {
  return (skipper as any).id || skipper.memberId || `idx_${index}`;
}

function getSkipperBoatClass(skipper: Skipper): string | undefined {
  return skipper.boatModel || skipper.boatType || skipper.boat || (skipper as any).boatClass;
}

export interface ReconciliationReport {
  autoMatched: MatchResult[];
  needsReview: MatchResult[];
  noMatch: MatchResult[];
  totalSkippers: number;
  timestamp: number;
}

/**
 * Reconcile manually-added skippers against club members.
 * Returns a report of matches, ambiguous cases, and unmatched skippers.
 */
export function reconcileSkippers(
  skippers: Skipper[],
  members: Member[]
): ReconciliationReport {
  const results: MatchResult[] = [];

  for (let i = 0; i < skippers.length; i++) {
    const skipper = skippers[i];
    // Skip skippers that are already linked to a member
    if (skipper.memberId) {
      results.push({
        skipperId: getSkipperId(skipper, i),
        skipperName: skipper.name,
        skipperSailNumber: skipper.sailNumber || skipper.sailNo,
        skipperBoatClass: getSkipperBoatClass(skipper),
        matchedMember: null,
        confidence: 'definitive',
        reason: 'Already linked to member',
        requiresReview: false,
      });
      continue;
    }

    const match = findBestMatch(skipper, i, members);
    results.push(match);
  }

  return {
    autoMatched: results.filter(r => !r.requiresReview && r.matchedMember !== null),
    needsReview: results.filter(r => r.requiresReview),
    noMatch: results.filter(r => !r.requiresReview && r.matchedMember === null),
    totalSkippers: skippers.length,
    timestamp: Date.now(),
  };
}

/**
 * Find the best match for a single skipper.
 */
function findBestMatch(skipper: Skipper, index: number, members: Member[]): MatchResult {
  const sailNumber = skipper.sailNumber || skipper.sailNo;
  const boatClass = getSkipperBoatClass(skipper);
  const baseResult = {
    skipperId: getSkipperId(skipper, index),
    skipperName: skipper.name,
    skipperSailNumber: sailNumber,
    skipperBoatClass: boatClass,
  };

  // Pass 1: Sail number + boat class match (definitive)
  if (sailNumber) {
    const sailMatch = findBySailNumber(sailNumber, boatClass, members);
    if (sailMatch) {
      return {
        ...baseResult,
        matchedMember: sailMatch,
        confidence: 'definitive',
        reason: `Sail number ${sailNumber} matches member`,
        requiresReview: false,
      };
    }
  }

  // Pass 2: Exact name match (high confidence)
  const exactMatch = findByExactName(skipper.name, members);
  if (exactMatch.length === 1) {
    return {
      ...baseResult,
      matchedMember: exactMatch[0],
      confidence: 'high',
      reason: 'Exact name match',
      requiresReview: false,
    };
  }

  // Multiple exact matches - ambiguous, needs review
  if (exactMatch.length > 1) {
    return {
      ...baseResult,
      matchedMember: exactMatch[0],
      confidence: 'medium',
      reason: `Multiple members named "${skipper.name}" - please confirm`,
      requiresReview: true,
    };
  }

  // Pass 3: Fuzzy name match
  const fuzzyMatches = findByFuzzyName(skipper.name, members);
  if (fuzzyMatches.length === 1 && fuzzyMatches[0].score >= 0.8) {
    return {
      ...baseResult,
      matchedMember: fuzzyMatches[0].member,
      confidence: 'medium',
      reason: `Similar name: "${getMemberDisplayName(fuzzyMatches[0].member)}"`,
      requiresReview: true,
    };
  }

  if (fuzzyMatches.length > 0 && fuzzyMatches[0].score >= 0.6) {
    return {
      ...baseResult,
      matchedMember: fuzzyMatches[0].member,
      confidence: 'low',
      reason: `Possible match: "${getMemberDisplayName(fuzzyMatches[0].member)}"`,
      requiresReview: true,
    };
  }

  // No match found
  return {
    ...baseResult,
    matchedMember: null,
    confidence: 'none',
    reason: 'No matching member found',
    requiresReview: false,
  };
}

/**
 * Find member by sail number, optionally filtering by boat class.
 */
function findBySailNumber(
  sailNumber: string,
  boatClass: string | undefined,
  members: Member[]
): Member | null {
  const normalizedSail = sailNumber.trim().toLowerCase();

  for (const member of members) {
    const boats = (member as any).member_boats || (member as any).boats || [];
    for (const boat of boats) {
      const memberSail = (boat.sail_number || '').toString().trim().toLowerCase();
      if (memberSail === normalizedSail) {
        // If boat class specified, verify it matches
        if (boatClass) {
          const memberClass = (boat.boat_class || boat.class_name || '').toLowerCase();
          const skipperClass = boatClass.toLowerCase();
          if (memberClass.includes(skipperClass) || skipperClass.includes(memberClass)) {
            return member;
          }
        } else {
          return member;
        }
      }
    }
  }

  return null;
}

/**
 * Find members by exact name (case-insensitive, whitespace-normalized).
 */
function findByExactName(name: string, members: Member[]): Member[] {
  const normalized = normalizeName(name);
  return members.filter(m => {
    const memberName = normalizeName(getMemberDisplayName(m));
    return memberName === normalized;
  });
}

/**
 * Find members by fuzzy name matching.
 * Returns matches sorted by confidence score (highest first).
 */
function findByFuzzyName(
  name: string,
  members: Member[]
): Array<{ member: Member; score: number }> {
  const normalized = normalizeName(name);
  const parts = normalized.split(' ').filter(Boolean);

  const scored = members.map(member => {
    const memberName = normalizeName(getMemberDisplayName(member));
    const memberParts = memberName.split(' ').filter(Boolean);

    let score = 0;

    // Check if one name is a subset of the other
    if (memberName.includes(normalized) || normalized.includes(memberName)) {
      score = 0.9;
    }

    // Check individual name parts
    const matchingParts = parts.filter(p =>
      memberParts.some(mp => mp === p || mp.startsWith(p) || p.startsWith(mp))
    );

    if (matchingParts.length > 0) {
      score = Math.max(score, matchingParts.length / Math.max(parts.length, memberParts.length));
    }

    // Check common abbreviations
    if (parts.length > 0 && memberParts.length > 0) {
      // "J Smith" matching "John Smith"
      if (parts[0].length === 1 && memberParts[0].startsWith(parts[0])) {
        const lastNameMatch = parts.slice(1).join(' ') === memberParts.slice(1).join(' ');
        if (lastNameMatch) {
          score = Math.max(score, 0.75);
        }
      }
      // Last name exact match with first initial
      const lastPart = parts[parts.length - 1];
      const memberLastPart = memberParts[memberParts.length - 1];
      if (lastPart === memberLastPart && parts.length >= 1 && memberParts.length >= 1) {
        score = Math.max(score, 0.7);
      }
    }

    // Levenshtein for close typos
    const editDistance = levenshteinDistance(normalized, memberName);
    const maxLen = Math.max(normalized.length, memberName.length);
    if (maxLen > 0) {
      const similarity = 1 - (editDistance / maxLen);
      if (similarity > 0.8) {
        score = Math.max(score, similarity);
      }
    }

    return { member, score };
  });

  return scored
    .filter(s => s.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function getMemberDisplayName(member: Member): string {
  return `${member.first_name || ''} ${member.last_name || ''}`.trim();
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Apply auto-matched results to skippers array.
 * Links skippers to their matched member IDs.
 */
export function applyAutoMatches(
  skippers: Skipper[],
  report: ReconciliationReport
): Skipper[] {
  const matchMap = new Map<string, Member>();
  for (const match of report.autoMatched) {
    if (match.matchedMember) {
      matchMap.set(match.skipperId, match.matchedMember);
    }
  }

  return skippers.map((skipper, idx) => {
    const id = getSkipperId(skipper, idx);
    const matched = matchMap.get(id);
    if (matched) {
      return {
        ...skipper,
        memberId: matched.id,
        name: `${matched.first_name || ''} ${matched.last_name || ''}`.trim() || skipper.name,
      } as Skipper;
    }
    return skipper;
  });
}

/**
 * Apply a manual match decision from the review UI.
 */
export function applyManualMatch(
  skippers: Skipper[],
  skipperId: string,
  member: Member | null
): Skipper[] {
  return skippers.map((skipper, idx) => {
    const id = getSkipperId(skipper, idx);
    if (id === skipperId && member) {
      return {
        ...skipper,
        memberId: member.id,
        name: `${member.first_name || ''} ${member.last_name || ''}`.trim() || skipper.name,
      } as Skipper;
    }
    return skipper;
  });
}

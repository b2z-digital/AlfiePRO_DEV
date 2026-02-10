import { supabase } from './supabase';
import type { NationalRanking, SkipperNameMapping, RankingSyncLog, FuzzyMatchResult } from '../types/rankings';

/**
 * Fetch all rankings for a national association and class
 */
export async function getRankingsByClass(
  nationalAssociationId: string,
  yachtClassName: string
): Promise<NationalRanking[]> {
  const { data, error } = await supabase
    .from('national_rankings')
    .select('*')
    .eq('national_association_id', nationalAssociationId)
    .eq('yacht_class_name', yachtClassName)
    .order('rank', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get all rankings for a national association
 */
export async function getAllRankings(nationalAssociationId: string): Promise<NationalRanking[]> {
  const { data, error } = await supabase
    .from('national_rankings')
    .select('*')
    .eq('national_association_id', nationalAssociationId)
    .order('yacht_class_name', { ascending: true })
    .order('rank', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Scrape rankings from a URL
 */
export async function scrapeRankings(
  url: string,
  yachtClassName: string,
  nationalAssociationId: string
): Promise<{ success: boolean; rankingsImported: number; rankings: any[] }> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-national-rankings`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, yachtClassName, nationalAssociationId }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Failed to scrape rankings');
  }

  return result;
}

/**
 * Get sync logs for a national association
 */
export async function getSyncLogs(
  nationalAssociationId: string,
  limit: number = 20
): Promise<RankingSyncLog[]> {
  const { data, error } = await supabase
    .from('ranking_sync_logs')
    .select('*')
    .eq('national_association_id', nationalAssociationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
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

  return matrix[str2.length][str1.length];
}

/**
 * Normalize name for matching
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate match confidence between two names
 */
function calculateMatchConfidence(name1: string, name2: string): number {
  const norm1 = normalizeName(name1);
  const norm2 = normalizeName(name2);

  // Exact match
  if (norm1 === norm2) return 1.0;

  // Check if one name contains the other (e.g., "Steve Walsh" vs "Stephen Walsh")
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return 0.9;
  }

  // Calculate Levenshtein distance
  const distance = levenshteinDistance(norm1, norm2);
  const maxLength = Math.max(norm1.length, norm2.length);
  const similarity = 1 - (distance / maxLength);

  // Only consider it a match if similarity is above 0.7
  return similarity > 0.7 ? similarity : 0;
}

/**
 * Find fuzzy matches between rankings and members
 */
export async function findFuzzyMatches(
  rankings: NationalRanking[],
  clubId: string,
  yachtClassName?: string
): Promise<FuzzyMatchResult[]> {
  // Get all members from clubs in this national association
  const { data: members, error } = await supabase
    .from('members')
    .select('id, first_name, last_name, sail_number, club_id')
    .eq('club_id', clubId);

  if (error) throw error;

  const matches: FuzzyMatchResult[] = [];

  for (const ranking of rankings) {
    for (const member of members || []) {
      const memberName = `${member.first_name} ${member.last_name}`;
      const confidence = calculateMatchConfidence(ranking.skipper_name, memberName);

      if (confidence > 0.7) {
        // Additional confidence boost if sail numbers match
        let finalConfidence = confidence;
        if (ranking.sail_number && member.sail_number) {
          if (ranking.sail_number === member.sail_number) {
            finalConfidence = Math.min(1.0, confidence + 0.2);
          }
        }

        matches.push({
          memberId: member.id,
          memberName,
          rankingName: ranking.skipper_name,
          confidence: finalConfidence,
          sailNumber: member.sail_number,
        });
      }
    }
  }

  // Sort by confidence (highest first)
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches;
}

/**
 * Get name mappings for a national association
 */
export async function getNameMappings(
  nationalAssociationId: string,
  yachtClassName?: string
): Promise<SkipperNameMapping[]> {
  let query = supabase
    .from('skipper_name_mappings')
    .select('*')
    .eq('national_association_id', nationalAssociationId);

  if (yachtClassName) {
    query = query.eq('yacht_class_name', yachtClassName);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Create or update a name mapping
 */
export async function saveNameMapping(
  mapping: Omit<SkipperNameMapping, 'id' | 'created_at' | 'updated_at' | 'normalized_ranking_name'>
): Promise<SkipperNameMapping> {
  const { data: existing } = await supabase
    .from('skipper_name_mappings')
    .select('id')
    .eq('national_association_id', mapping.national_association_id)
    .eq('ranking_name', mapping.ranking_name)
    .eq('yacht_class_name', mapping.yacht_class_name || '')
    .single();

  if (existing) {
    // Update existing mapping
    const { data, error } = await supabase
      .from('skipper_name_mappings')
      .update({
        member_id: mapping.member_id,
        member_name: mapping.member_name,
        verified: mapping.verified,
        match_confidence: mapping.match_confidence,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    // Insert new mapping
    const { data, error } = await supabase
      .from('skipper_name_mappings')
      .insert(mapping)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

/**
 * Delete a name mapping
 */
export async function deleteNameMapping(mappingId: string): Promise<void> {
  const { error } = await supabase
    .from('skipper_name_mappings')
    .delete()
    .eq('id', mappingId);

  if (error) throw error;
}

/**
 * Get ranking for a specific member
 */
export async function getRankingForMember(
  memberId: string,
  nationalAssociationId: string,
  yachtClassName: string
): Promise<NationalRanking | null> {
  // First check if there's a verified mapping
  const { data: mapping } = await supabase
    .from('skipper_name_mappings')
    .select('ranking_id')
    .eq('member_id', memberId)
    .eq('national_association_id', nationalAssociationId)
    .eq('yacht_class_name', yachtClassName)
    .eq('verified', true)
    .single();

  if (mapping?.ranking_id) {
    const { data: ranking } = await supabase
      .from('national_rankings')
      .select('*')
      .eq('id', mapping.ranking_id)
      .single();

    return ranking || null;
  }

  // No verified mapping found
  return null;
}

/**
 * Get rankings for multiple members (for heat assignment)
 */
export async function getRankingsForMembers(
  memberIds: string[],
  nationalAssociationId: string,
  yachtClassName: string
): Promise<Map<string, NationalRanking>> {
  const rankingsMap = new Map<string, NationalRanking>();

  // Get all verified mappings for these members
  const { data: mappings } = await supabase
    .from('skipper_name_mappings')
    .select('member_id, ranking_id')
    .eq('national_association_id', nationalAssociationId)
    .eq('yacht_class_name', yachtClassName)
    .eq('verified', true)
    .in('member_id', memberIds);

  if (!mappings || mappings.length === 0) {
    return rankingsMap;
  }

  // Get all rankings
  const rankingIds = mappings.map(m => m.ranking_id).filter(id => id) as string[];

  if (rankingIds.length === 0) {
    return rankingsMap;
  }

  const { data: rankings } = await supabase
    .from('national_rankings')
    .select('*')
    .in('id', rankingIds);

  if (!rankings) {
    return rankingsMap;
  }

  // Create map of member_id -> ranking
  const rankingById = new Map(rankings.map(r => [r.id, r]));

  for (const mapping of mappings) {
    if (mapping.ranking_id && rankingById.has(mapping.ranking_id)) {
      rankingsMap.set(mapping.member_id, rankingById.get(mapping.ranking_id)!);
    }
  }

  return rankingsMap;
}

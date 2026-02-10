export interface NationalRanking {
  id: string;
  national_association_id: string;
  boat_class_id?: string;
  yacht_class_name: string;
  rank: number;
  skipper_name: string;
  normalized_name: string;
  sail_number?: string;
  state?: string;
  points?: number;
  events_counted?: number;
  source_url?: string;
  last_updated: string;
  created_at: string;
}

export interface SkipperNameMapping {
  id: string;
  national_association_id: string;
  ranking_id?: string;
  ranking_name: string;
  normalized_ranking_name: string;
  member_id: string;
  member_name: string;
  yacht_class_name?: string;
  verified: boolean;
  match_confidence: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface RankingSyncLog {
  id: string;
  national_association_id: string;
  yacht_class_name: string;
  source_url: string;
  status: 'success' | 'partial' | 'failed';
  rankings_imported: number;
  error_message?: string;
  initiated_by?: string;
  created_at: string;
}

export interface RankingURLConfig {
  yachtClassName: string;
  url: string;
}

export interface FuzzyMatchResult {
  memberId: string;
  memberName: string;
  rankingName: string;
  confidence: number;
  sailNumber?: string;
}

export interface HMSSeeding {
  heatName: string;
  skippers: Array<{
    id: string;
    name: string;
    sailNumber: string;
    rank?: number;
    ranking?: NationalRanking;
    originalIndex?: number;  // The original index in the skippers array
  }>;
}

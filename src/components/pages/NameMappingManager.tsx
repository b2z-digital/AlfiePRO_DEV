import React, { useState, useEffect } from 'react';
import { CircleCheck as CheckCircle, Circle as XCircle, TriangleAlert as AlertTriangle, RefreshCw, Search, Link2 } from 'lucide-react';
import { KpiCard, PageHead } from '../association/AssocUI';
import type { SkipperNameMapping, NationalRanking, FuzzyMatchResult } from '../../types/rankings';
import type { Member } from '../../types/member';
import {
  getNameMappings,
  findFuzzyMatches,
  getRankingsByClass,
  saveNameMapping,
  deleteNameMapping,
} from '../../utils/rankingsStorage';
import { supabase } from '../../utils/supabase';

interface NameMappingManagerProps {
  nationalAssociationId: string;
  clubId: string;
}

export const NameMappingManager: React.FC<NameMappingManagerProps> = ({
  nationalAssociationId,
  clubId,
}) => {
  const [mappings, setMappings] = useState<SkipperNameMapping[]>([]);
  const [suggestions, setSuggestions] = useState<FuzzyMatchResult[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [rankings, setRankings] = useState<NationalRanking[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadMappings();
    loadMembers();
  }, [nationalAssociationId]);

  useEffect(() => {
    if (selectedClass) {
      loadRankingsAndSuggestions();
    }
  }, [selectedClass]);

  async function loadMappings() {
    try {
      const data = await getNameMappings(nationalAssociationId);
      setMappings(data);
    } catch (err) {
      console.error('Error loading mappings:', err);
    }
  }

  async function loadMembers() {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('club_id', clubId);

      if (error) throw error;
      setMembers(data || []);
    } catch (err) {
      console.error('Error loading members:', err);
    }
  }

  async function loadRankingsAndSuggestions() {
    try {
      setLoading(true);
      const rankingData = await getRankingsByClass(nationalAssociationId, selectedClass);
      setRankings(rankingData);

      // Find fuzzy matches
      const matches = await findFuzzyMatches(rankingData, clubId);
      setSuggestions(matches);
    } catch (err) {
      console.error('Error loading rankings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAcceptMapping(match: FuzzyMatchResult, rankingId: string) {
    try {
      await saveNameMapping({
        national_association_id: nationalAssociationId,
        ranking_id: rankingId,
        ranking_name: match.rankingName,
        member_id: match.memberId,
        member_name: match.memberName,
        yacht_class_name: selectedClass,
        verified: true,
        match_confidence: match.confidence,
      });

      await loadMappings();
      await loadRankingsAndSuggestions();
    } catch (err: any) {
      alert(`Error saving mapping: ${err.message}`);
    }
  }

  async function handleRejectMapping(mappingId: string) {
    if (!confirm('Are you sure you want to remove this mapping?')) return;

    try {
      await deleteNameMapping(mappingId);
      await loadMappings();
      await loadRankingsAndSuggestions();
    } catch (err: any) {
      alert(`Error deleting mapping: ${err.message}`);
    }
  }

  const classOptions = [...new Set(rankings.map(r => r.yacht_class_name))];

  const filteredMappings = mappings.filter(m => {
    if (selectedClass && m.yacht_class_name !== selectedClass) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        m.ranking_name.toLowerCase().includes(term) ||
        m.member_name.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const verifiedCount = mappings.filter(m => m.verified).length;
  const unverifiedCount = mappings.length - verifiedCount;

  return (
    <div className="flex flex-col gap-[22px]">
      {/* Header */}
      <PageHead icon={<Link2 size={24} />} title="Name mapping" sub="Match names in the national rankings to member records" />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <KpiCard cap="Verified" value={verifiedCount} sub="Mappings confirmed" icon={<CheckCircle size={18} />} tone={verifiedCount > 0 ? 'green' : undefined} />
        <KpiCard cap="Unverified" value={unverifiedCount} sub="Mappings to check" icon={<AlertTriangle size={18} />} tone={unverifiedCount > 0 ? 'amber' : undefined} />
        <KpiCard cap="Suggestions" value={suggestions.length} sub={selectedClass ? `For ${selectedClass}` : 'Pick a class to see suggestions'} icon={<RefreshCw size={18} />} />
      </div>

      {/* Class Selection */}
      <section className="a-card p-5 sm:p-6">
        <h3 className="a-ink text-[16px] font-semibold m-0 mb-4">Class to map</h3>

        <div className="flex gap-3">
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="a-inp flex-1"
            aria-label="Yacht class"
          >
            <option value="">Select a class</option>
            {classOptions.map((className) => (
              <option key={className} value={className}>
                {className}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadRankingsAndSuggestions}
            disabled={!selectedClass || loading}
            className="a-btn a-btn-p"
            style={{ height: 46 }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Find matches
          </button>
        </div>
      </section>

      {/* Suggested Mappings */}
      {selectedClass && suggestions.length > 0 && (
        <section className="a-card p-5 sm:p-6">
          <h3 className="a-ink text-[16px] font-semibold m-0 mb-4 flex items-center gap-2">
            Suggested mappings <span className="a-cnt">{suggestions.length}</span>
          </h3>

          <div className="a-grp">
            {suggestions.map((suggestion, index) => {
              const ranking = rankings.find(r => r.skipper_name === suggestion.rankingName);
              const confidenceTone =
                suggestion.confidence >= 0.95 ? 'a-txt-g' :
                suggestion.confidence >= 0.85 ? 'a-txt-a' :
                'a-txt-r';

              return (
                <div key={index} className="a-lnk flex-wrap sm:flex-nowrap">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-semibold a-ink m-0">{suggestion.rankingName}</p>
                    <p className="text-sm a-mute m-0 mt-0.5">Member: {suggestion.memberName}</p>
                    {suggestion.sailNumber && (
                      <p className="text-xs a-dim m-0 mt-1">Sail no. {suggestion.sailNumber}</p>
                    )}
                  </div>

                  <div className="text-center px-2">
                    <p className={`text-lg font-bold a-num m-0 ${confidenceTone}`}>
                      {(suggestion.confidence * 100).toFixed(0)}%
                    </p>
                    <p className="text-xs a-dim m-0">Confidence</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => ranking && handleAcceptMapping(suggestion, ranking.id)}
                      className="a-btn a-btn-g a-btn-sm"
                    >
                      Accept
                    </button>
                    <button type="button" className="a-btn a-btn-q a-btn-sm">
                      Skip
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Existing Mappings */}
      <section className="a-card overflow-hidden">
        <div className="a-dlg-head justify-between flex-wrap">
          <h3 className="a-ink text-[16px] font-semibold m-0 flex items-center gap-2">
            Existing mappings <span className="a-cnt">{filteredMappings.length}</span>
          </h3>

          <label className="a-field" style={{ width: 260, maxWidth: '100%' }}>
            <Search size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search mappings"
              aria-label="Search mappings"
            />
          </label>
        </div>

        <div className="p-5 sm:p-6">
          {filteredMappings.length === 0 ? (
            <div className="a-empty py-12">
              <span className="a-tile" style={{ width: 56, height: 56 }}><Link2 size={24} /></span>
              <p className="a-mute text-sm m-0">No mappings found</p>
            </div>
          ) : (
            <div className="a-grp">
              {filteredMappings.map((mapping) => (
                <div key={mapping.id} className="a-lnk a-hov-row">
                  <span className={`a-light ${mapping.verified ? 'a-light-g' : 'a-light-a'}`} title={mapping.verified ? 'Verified' : 'Not verified'} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold a-ink">{mapping.ranking_name}</span>
                      <span className="a-dim">→</span>
                      <span className="text-sm a-mute">{mapping.member_name}</span>
                    </div>

                    <div className="a-meta-row mt-1">
                      {mapping.yacht_class_name && <span>{mapping.yacht_class_name}</span>}
                      <span>{(mapping.match_confidence * 100).toFixed(0)}% match</span>
                      <span>{mapping.verified ? 'Verified' : 'Not verified'}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRejectMapping(mapping.id)}
                    className="a-btn a-btn-q a-btn-sm a-btn-reject"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

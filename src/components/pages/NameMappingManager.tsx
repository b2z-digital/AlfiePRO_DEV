import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Search } from 'lucide-react';
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Name Mapping</h2>
        <p className="text-sm text-gray-600 mt-1">
          Map national ranking names to member records
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Verified Mappings</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{verifiedCount}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Unverified Mappings</p>
              <p className="text-2xl font-bold text-yellow-600 mt-1">{unverifiedCount}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-yellow-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Suggestions</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{suggestions.length}</p>
            </div>
            <RefreshCw className="w-8 h-8 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Class Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Class to Map</h3>

        <div className="flex space-x-3">
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">-- Select a class --</option>
            {classOptions.map((className) => (
              <option key={className} value={className}>
                {className}
              </option>
            ))}
          </select>

          <button
            onClick={loadRankingsAndSuggestions}
            disabled={!selectedClass || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Suggested Mappings */}
      {selectedClass && suggestions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Suggested Mappings ({suggestions.length})
          </h3>

          <div className="space-y-3">
            {suggestions.map((suggestion, index) => {
              const ranking = rankings.find(r => r.skipper_name === suggestion.rankingName);
              const confidenceColor =
                suggestion.confidence >= 0.95 ? 'text-green-600' :
                suggestion.confidence >= 0.85 ? 'text-yellow-600' :
                'text-orange-600';

              return (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          Ranking: {suggestion.rankingName}
                        </p>
                        <p className="text-sm text-gray-600">
                          Member: {suggestion.memberName}
                        </p>
                        {suggestion.sailNumber && (
                          <p className="text-xs text-gray-500 mt-1">
                            Sail #: {suggestion.sailNumber}
                          </p>
                        )}
                      </div>

                      <div className="text-center">
                        <p className={`text-lg font-bold ${confidenceColor}`}>
                          {(suggestion.confidence * 100).toFixed(0)}%
                        </p>
                        <p className="text-xs text-gray-500">Confidence</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => ranking && handleAcceptMapping(suggestion, ranking.id)}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                    >
                      Accept
                    </button>
                    <button
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Existing Mappings */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Existing Mappings ({filteredMappings.length})
            </h3>

            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search mappings..."
                  className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {filteredMappings.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No mappings found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMappings.map((mapping) => (
                <div
                  key={mapping.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
                >
                  <div className="flex items-center space-x-4 flex-1">
                    {mapping.verified ? (
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                    )}

                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-900">
                          {mapping.ranking_name}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className="text-sm text-gray-700">
                          {mapping.member_name}
                        </span>
                      </div>

                      <div className="flex items-center space-x-4 mt-1">
                        {mapping.yacht_class_name && (
                          <span className="text-xs text-gray-500">
                            {mapping.yacht_class_name}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {(mapping.match_confidence * 100).toFixed(0)}% match
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRejectMapping(mapping.id)}
                    className="ml-4 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Users, CheckCircle, X, Search, Filter } from 'lucide-react';
import {
  getClubMemberClaims,
  acceptMemberClaim,
  rejectMemberClaim,
  getUnclaimedMembers
} from '../../utils/multiClubMembershipStorage';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  clubId: string;
  clubName: string;
}

export default function ClubMemberClaimingPanel({ clubId, clubName }: Props) {
  const { user } = useAuth();
  const [pendingClaims, setPendingClaims] = useState<any[]>([]);
  const [unclaimedMembers, setUnclaimedMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnclaimed, setShowUnclaimed] = useState(false);
  const [processingClaimId, setProcessingClaimId] = useState<string | null>(null);

  useEffect(() => {
    loadClaims();
  }, [clubId]);

  const loadClaims = async () => {
    setLoading(true);
    try {
      const claims = await getClubMemberClaims(clubId);
      setPendingClaims(claims);
    } catch (error) {
      console.error('Error loading claims:', error);
    }
    setLoading(false);
  };

  const handleAcceptClaim = async (claimId: string) => {
    if (!user) return;

    setProcessingClaimId(claimId);
    const success = await acceptMemberClaim(claimId, user.id);

    if (success) {
      setPendingClaims(prev => prev.filter(claim => claim.id !== claimId));
    } else {
      alert('Failed to accept claim. Please try again.');
    }

    setProcessingClaimId(null);
  };

  const handleRejectClaim = async (claimId: string) => {
    if (!user) return;

    const reason = prompt('Optional: Provide a reason for rejection');
    setProcessingClaimId(claimId);

    const success = await rejectMemberClaim(claimId, user.id, reason || undefined);

    if (success) {
      setPendingClaims(prev => prev.filter(claim => claim.id !== claimId));
    } else {
      alert('Failed to reject claim. Please try again.');
    }

    setProcessingClaimId(null);
  };

  const filteredClaims = pendingClaims.filter(claim => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    // Check both profile data and direct claim data
    const fullName = claim.profiles?.full_name || claim.full_name || '';
    const email = claim.profiles?.email || claim.email || '';
    const memberNumber = claim.profiles?.member_number || '';

    return (
      fullName.toLowerCase().includes(query) ||
      email.toLowerCase().includes(query) ||
      memberNumber.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading member claims...</p>
      </div>
    );
  }

  if (pendingClaims.length === 0) {
    return (
      <div className="text-center py-12">
        <Users size={48} className="mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No Pending Member Claims
        </h3>
        <p className="text-gray-600">
          There are no members waiting to be claimed by your club.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Users size={24} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">
              Members Available to Claim
            </h3>
            <p className="text-sm text-blue-800">
              Your association has added {pendingClaims.length} members that may belong to your club.
              Review and claim the members that are part of {clubName}.
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or member number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Claims List */}
      <div className="space-y-3">
        {filteredClaims.map((claim) => (
          <div
            key={claim.id}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="font-semibold text-gray-900">
                    {claim.profiles?.full_name || claim.full_name || 'Unknown Name'}
                  </h4>
                  {claim.match_confidence && claim.match_confidence > 0.8 && (
                    <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-medium">
                      {Math.round(claim.match_confidence * 100)}% Match
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <div className="text-gray-600">
                    <span className="font-medium">Email:</span> {claim.profiles?.email || claim.email || 'N/A'}
                  </div>
                  <div className="text-gray-600">
                    <span className="font-medium">Member #:</span> {claim.profiles?.member_number || 'Not assigned'}
                  </div>
                  {(claim.profiles?.date_of_birth || claim.date_of_birth) && (
                    <div className="text-gray-600">
                      <span className="font-medium">DOB:</span> {new Date(claim.profiles?.date_of_birth || claim.date_of_birth).toLocaleDateString()}
                    </div>
                  )}
                  {claim.phone && (
                    <div className="text-gray-600">
                      <span className="font-medium">Phone:</span> {claim.phone}
                    </div>
                  )}
                  <div className="text-gray-600">
                    <span className="font-medium">Type:</span>{' '}
                    <span className="capitalize">{claim.relationship_type || 'Primary'} Member</span>
                  </div>
                </div>

                {claim.match_reasons && claim.match_reasons.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Match reasons:</p>
                    <div className="flex flex-wrap gap-1">
                      {claim.match_reasons.map((reason: string, idx: number) => (
                        <span
                          key={idx}
                          className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRejectClaim(claim.id)}
                  disabled={processingClaimId === claim.id}
                  className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                  title="Not our member"
                >
                  <X size={20} />
                </button>
                <button
                  onClick={() => handleAcceptClaim(claim.id)}
                  disabled={processingClaimId === claim.id}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50"
                >
                  {processingClaimId === claim.id ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  ) : (
                    <>
                      <CheckCircle size={18} />
                      Claim Member
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredClaims.length === 0 && searchQuery && (
        <div className="text-center py-12">
          <Search size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">
            No members found matching "{searchQuery}"
          </p>
        </div>
      )}
    </div>
  );
}

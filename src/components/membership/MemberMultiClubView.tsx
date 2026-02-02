import React, { useState, useEffect } from 'react';
import { Building2, Star, Users, Calendar, DollarSign, AlertCircle } from 'lucide-react';
import { getMemberClubMemberships } from '../../utils/multiClubMembershipStorage';

interface Props {
  memberId: string;
}

export default function MemberMultiClubView({ memberId }: Props) {
  const [memberships, setMemberships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMemberships();
  }, [memberId]);

  const loadMemberships = async () => {
    setLoading(true);
    try {
      const data = await getMemberClubMemberships(memberId);
      setMemberships(data);
    } catch (error) {
      console.error('Error loading memberships:', error);
    }
    setLoading(false);
  };

  const getRelationshipBadge = (type: string) => {
    const badges = {
      primary: {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        label: 'Primary Member',
        icon: Star
      },
      affiliate: {
        bg: 'bg-purple-100',
        text: 'text-purple-700',
        label: 'Affiliate Member',
        icon: Users
      },
      guest: {
        bg: 'bg-gray-100',
        text: 'text-gray-700',
        label: 'Guest',
        icon: Users
      },
      honorary: {
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        label: 'Honorary Member',
        icon: Star
      }
    };

    const badge = badges[type as keyof typeof badges] || badges.primary;
    const Icon = badge.icon;

    return (
      <div className={`flex items-center gap-1.5 ${badge.bg} ${badge.text} px-3 py-1 rounded-full text-sm font-medium`}>
        <Icon size={14} />
        {badge.label}
      </div>
    );
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      active: { bg: 'bg-green-100', text: 'text-green-700', label: 'Active' },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending' },
      expired: { bg: 'bg-red-100', text: 'text-red-700', label: 'Expired' },
      archived: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Archived' }
    };

    const badge = badges[status as keyof typeof badges] || badges.active;

    return (
      <span className={`${badge.bg} ${badge.text} px-2 py-1 rounded-full text-xs font-medium`}>
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mx-auto"></div>
        <p className="text-gray-600 mt-2 text-sm">Loading memberships...</p>
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <div className="text-center py-8">
        <Building2 size={40} className="mx-auto text-gray-400 mb-3" />
        <p className="text-gray-600">No club memberships found</p>
      </div>
    );
  }

  const primaryMembership = memberships.find(m => m.relationship_type === 'primary');
  const affiliateMemberships = memberships.filter(m => m.relationship_type !== 'primary');

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      {primaryMembership && affiliateMemberships.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">Multi-Club Membership</p>
              <p className="text-blue-800">
                Your primary membership at <strong>{primaryMembership.clubs?.name}</strong> covers your
                association fees. Your affiliate memberships at other clubs do not include association fees.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Primary Membership */}
      {primaryMembership && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Primary Club
          </h3>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="text-xl font-bold text-gray-900">
                    {primaryMembership.clubs?.name || 'Unknown Club'}
                  </h4>
                  {getStatusBadge(primaryMembership.status)}
                </div>
                {getRelationshipBadge(primaryMembership.relationship_type)}
              </div>
              <Building2 size={32} className="text-blue-600" />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <Calendar size={16} className="text-gray-500" />
                <div>
                  <div className="font-medium">Member Since</div>
                  <div className="text-gray-600">
                    {primaryMembership.joined_date
                      ? new Date(primaryMembership.joined_date).toLocaleDateString()
                      : 'Unknown'}
                  </div>
                </div>
              </div>

              {primaryMembership.expiry_date && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar size={16} className="text-gray-500" />
                  <div>
                    <div className="font-medium">Expires</div>
                    <div className="text-gray-600">
                      {new Date(primaryMembership.expiry_date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              )}

              {primaryMembership.annual_fee_amount && (
                <div className="flex items-center gap-2 text-gray-700">
                  <DollarSign size={16} className="text-gray-500" />
                  <div>
                    <div className="font-medium">Annual Fee</div>
                    <div className="text-gray-600">
                      ${primaryMembership.annual_fee_amount.toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-gray-700">
                <DollarSign size={16} className="text-gray-500" />
                <div>
                  <div className="font-medium">Payment Status</div>
                  <div className="text-gray-600 capitalize">
                    {primaryMembership.payment_status || 'Unknown'}
                  </div>
                </div>
              </div>
            </div>

            {primaryMembership.pays_association_fees && (
              <div className="mt-4 pt-4 border-t border-blue-200">
                <p className="text-xs text-blue-700">
                  Association fees are paid through this membership
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Affiliate Memberships */}
      {affiliateMemberships.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Affiliate Clubs ({affiliateMemberships.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {affiliateMemberships.map((membership) => (
              <div
                key={membership.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-gray-900">
                        {membership.clubs?.name || 'Unknown Club'}
                      </h4>
                      {getStatusBadge(membership.status)}
                    </div>
                    {getRelationshipBadge(membership.relationship_type)}
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between text-gray-600">
                    <span>Joined:</span>
                    <span className="font-medium">
                      {membership.joined_date
                        ? new Date(membership.joined_date).toLocaleDateString()
                        : 'Unknown'}
                    </span>
                  </div>

                  {membership.expiry_date && (
                    <div className="flex items-center justify-between text-gray-600">
                      <span>Expires:</span>
                      <span className="font-medium">
                        {new Date(membership.expiry_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  {membership.annual_fee_amount && (
                    <div className="flex items-center justify-between text-gray-600">
                      <span>Fee:</span>
                      <span className="font-medium">
                        ${membership.annual_fee_amount.toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-gray-600">
                    <span>Payment:</span>
                    <span className="font-medium capitalize">
                      {membership.payment_status || 'Unknown'}
                    </span>
                  </div>
                </div>

                {membership.notes && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-600">{membership.notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

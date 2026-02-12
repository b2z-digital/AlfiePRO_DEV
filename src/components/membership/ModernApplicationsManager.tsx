import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Mail,
  Phone,
  MapPin,
  Anchor,
  AlertCircle,
  CreditCard,
  Award,
  X,
  Check,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { createMembershipTransaction } from '../../utils/membershipFinanceUtils';
import { ApplicationSummaryView } from './ApplicationSummaryView';

interface Application {
  id: string;
  user_id: string;
  club_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street?: string;
  city?: string;
  state?: string;
  postcode?: string;
  avatar_url?: string;
  membership_type_id?: string;
  membership_type_name?: string;
  membership_amount?: number;
  boats: Array<{ type: string; sailNumber: string; hullName: string }>;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  payment_method: string;
  code_of_conduct_accepted: boolean;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

interface ModernApplicationsManagerProps {
  darkMode: boolean;
  initialApplicationId?: string;
}

export const ModernApplicationsManager: React.FC<ModernApplicationsManagerProps> = ({ darkMode, initialApplicationId }) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [applications, setApplications] = useState<Application[]>([]);
  const [filteredApplications, setFilteredApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (currentClub?.clubId) {
      fetchApplications();
    }
  }, [currentClub]);

  useEffect(() => {
    filterApplications();
  }, [applications, searchQuery, statusFilter]);

  // Auto-select application if initialApplicationId is provided
  useEffect(() => {
    if (initialApplicationId && applications.length > 0 && !hasInitialized) {
      const app = applications.find(a => a.id === initialApplicationId);
      if (app) {
        setSelectedApplication(app);
        // Set status filter to match the application's status so it's visible
        setStatusFilter(app.status as any);
      }
      setHasInitialized(true);
    }
  }, [initialApplicationId, applications, hasInitialized]);

  const fetchApplications = async () => {
    if (!currentClub?.clubId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('membership_applications')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .eq('is_draft', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setApplications(data || []);
    } catch (error) {
      console.error('Error fetching applications:', error);
      addNotification('error', 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const filterApplications = () => {
    let filtered = applications;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((app) => app.status === statusFilter);
    }

    if (searchQuery) {
      filtered = filtered.filter(
        (app) =>
          app.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          app.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          app.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredApplications(filtered);
  };

  const handleApprove = async (application: Application) => {
    setProcessing(application.id);

    try {
      // Determine payment status based on payment method
      const paymentStatus = application.payment_method === 'bank_transfer' ? 'unpaid' : 'paid';

      // Update profile with member details
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: application.first_name,
          last_name: application.last_name,
          full_name: `${application.first_name} ${application.last_name}`,
          avatar_url: application.avatar_url,
          primary_club_id: application.club_id,
        })
        .eq('id', application.user_id);

      if (profileError) throw profileError;

      // Get membership type to calculate expiry
      const { data: membershipType } = await supabase
        .from('membership_types')
        .select('amount')
        .eq('id', application.membership_type_id)
        .single();

      // Create club membership record
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);

      const { data: newMembership, error: membershipError } = await supabase
        .from('club_memberships')
        .insert({
          member_id: application.user_id,
          club_id: application.club_id,
          membership_type_id: application.membership_type_id,
          relationship_type: 'primary',
          status: 'active',
          joined_date: new Date().toISOString(),
          expiry_date: expiryDate.toISOString(),
          payment_status: paymentStatus,
          annual_fee_amount: parseFloat(application.membership_amount || membershipType?.amount || '0'),
        })
        .select()
        .single();

      if (membershipError) throw membershipError;

      // Create boat records if boats were provided
      if (application.boats && application.boats.length > 0) {
        const boatRecords = application.boats.map(boat => ({
          member_id: application.user_id, // Use user_id as member_id in member_boats
          boat_type: boat.type,
          sail_number: boat.sailNumber,
          hull: boat.hullName || null,
        }));

        const { error: boatsError } = await supabase
          .from('member_boats')
          .insert(boatRecords);

        if (boatsError) {
          console.error('Error creating boats:', boatsError);
          // Don't fail the whole approval if boats fail
        }
      }

      // Ensure user_clubs link exists (may already exist from registration)
      const { error: linkError } = await supabase
        .from('user_clubs')
        .insert({
          user_id: application.user_id,
          club_id: application.club_id,
          role: 'member',
        });

      if (linkError && linkError.code !== '23505') {
        // Ignore duplicate errors
        console.log('User club link:', linkError);
      }

      // Update application status
      const { error: updateError } = await supabase
        .from('membership_applications')
        .update({
          status: 'approved',
          member_id: application.user_id, // Store user_id as member_id
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', application.id);

      if (updateError) throw updateError;

      // Create finance transaction for membership payment
      const transactionResult = await createMembershipTransaction(
        {
          clubId: application.club_id,
          memberId: application.user_id, // Use user_id as member ID
          membershipTypeId: application.membership_type_id,
          memberName: `${application.first_name} ${application.last_name}`,
          membershipTypeName: application.membership_type_name,
          amount: parseFloat(application.membership_amount || '0'),
          paymentMethod: application.payment_method as 'bank_transfer' | 'credit_card' | 'cash',
        },
        paymentStatus === 'pending' ? 'pending' : 'paid'
      );

      if (!transactionResult.success) {
        console.error('Failed to create finance transaction:', transactionResult.error);
        // Don't fail approval if finance transaction fails
      }

      addNotification('success', 'Application approved successfully');
      fetchApplications();
      setSelectedApplication(null);
    } catch (error: any) {
      console.error('Error approving application:', error);
      const errorMessage = error?.message || 'Failed to approve application';
      addNotification('error', `Failed to approve application: ${errorMessage}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!selectedApplication) return;

    setProcessing(selectedApplication.id);

    try {
      const { error } = await supabase
        .from('membership_applications')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', selectedApplication.id);

      if (error) throw error;

      addNotification('success', 'Application rejected');
      fetchApplications();
      setSelectedApplication(null);
      setShowRejectModal(false);
      setRejectionReason('');
    } catch (error) {
      console.error('Error rejecting application:', error);
      addNotification('error', 'Failed to reject application');
    } finally {
      setProcessing(null);
    }
  };

  const handleDelete = async (application: Application) => {
    if (!confirm('Are you sure you want to permanently delete this application? This will remove the application and the associated user account from the system, allowing the email to be reused for testing.')) {
      return;
    }

    setProcessing(application.id);

    try {
      // Call the delete function which handles cleanup
      const { data, error } = await supabase.rpc('delete_membership_application', {
        application_id: application.id
      });

      if (error) {
        console.error('RPC Error:', error);
        throw error;
      }

      addNotification('success', 'Application and user account deleted successfully');
      fetchApplications();
      setSelectedApplication(null);
    } catch (error: any) {
      console.error('Error deleting application:', error);
      addNotification('error', `Failed to delete application: ${error.message || 'Unknown error'}`);
    } finally {
      setProcessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock size={12} />
            Pending
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
            <CheckCircle size={12} />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle size={12} />
            Rejected
          </span>
        );
    }
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Membership Applications
          </h2>
          <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
            Review and process membership applications
          </p>
        </div>

        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search applications..."
              className={`pl-10 pr-4 py-2 rounded-lg ${
                darkMode
                  ? 'bg-slate-800 text-white border-slate-700'
                  : 'bg-slate-50 text-slate-900 border-slate-300'
              } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className={`px-4 py-2 rounded-lg ${
              darkMode
                ? 'bg-slate-800 text-white border-slate-700'
                : 'bg-slate-50 text-slate-900 border-slate-300'
            } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4">
        {filteredApplications.length === 0 ? (
          <div className={`p-12 rounded-xl text-center ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
            <Users className={`mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} size={48} />
            <p className={`text-lg font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              No applications found
            </p>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
              {statusFilter === 'pending' ? 'All applications have been processed' : 'Try adjusting your filters'}
            </p>
          </div>
        ) : (
          filteredApplications.map((application) => (
            <div
              key={application.id}
              className={`p-6 rounded-xl transition-all ${
                darkMode ? 'bg-slate-800/80 backdrop-blur-sm hover:bg-slate-800/90' : 'bg-white hover:shadow-md'
              } border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  {application.avatar_url ? (
                    <img
                      src={application.avatar_url}
                      alt={`${application.first_name} ${application.last_name}`}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                      darkMode ? 'bg-slate-700' : 'bg-slate-200'
                    }`}>
                      <Users size={32} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {application.first_name} {application.last_name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 mt-1">
                          <span className={`text-sm flex items-center gap-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            <Mail size={14} />
                            {application.email}
                          </span>
                          <span className={`text-sm flex items-center gap-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            <Phone size={14} />
                            {application.phone}
                          </span>
                        </div>
                      </div>
                      {getStatusBadge(application.status)}
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mt-4">
                      <div>
                        <div className={`text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          Membership
                        </div>
                        <div className="flex items-center gap-2">
                          <Award size={16} className="text-blue-500" />
                          <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
                            {application.membership_type_name}
                          </span>
                          {application.membership_amount && (
                            <span className="text-sm text-blue-500 font-medium">
                              ${application.membership_amount}/year
                            </span>
                          )}
                        </div>
                      </div>

                      {application.boats && application.boats.length > 0 && (
                        <div>
                          <div className={`text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Boat(s)
                          </div>
                          <div className="space-y-1">
                            {application.boats.slice(0, 2).map((boat, index) => (
                              <div key={index} className="flex items-center gap-2">
                                <Anchor size={14} className="text-cyan-500" />
                                <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                  {boat.type} #{boat.sailNumber}
                                </span>
                              </div>
                            ))}
                            {application.boats.length > 2 && (
                              <span className="text-xs text-slate-500">+{application.boats.length - 2} more</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/30">
                      <span className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                        Applied {formatTimeAgo(application.created_at)}
                      </span>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedApplication(application)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                            darkMode
                              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <Eye size={16} />
                          View Full
                        </button>

                        {application.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(application)}
                              disabled={processing === application.id}
                              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
                            >
                              <Check size={16} />
                              Approve
                            </button>

                            <button
                              onClick={() => {
                                setSelectedApplication(application);
                                setShowRejectModal(true);
                              }}
                              disabled={processing === application.id}
                              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                            >
                              <X size={16} />
                              Reject
                            </button>

                            <button
                              onClick={() => handleDelete(application)}
                              disabled={processing === application.id}
                              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-600 transition-colors disabled:opacity-50"
                              title="Permanently delete application and user account (for testing)"
                            >
                              <Trash2 size={16} />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedApplication && !showRejectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div
            className={`max-w-4xl w-full max-h-[90vh] overflow-y-auto rounded-2xl ${
              darkMode ? 'bg-slate-800/95 backdrop-blur-xl border border-slate-700/50' : 'bg-white/95 backdrop-blur-xl border border-slate-200'
            } shadow-2xl`}
          >
            <div className={`sticky top-0 p-6 border-b ${darkMode ? 'border-slate-700/50 bg-slate-800/95 backdrop-blur-xl' : 'border-slate-200 bg-white/95 backdrop-blur-xl'} z-10`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                    <Users className="text-white" size={24} />
                  </div>
                  <div>
                    <h3 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Review Application
                    </h3>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      {selectedApplication.first_name} {selectedApplication.last_name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedApplication(null)}
                  className={`p-2 rounded-lg transition-colors ${
                    darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6">
              <ApplicationSummaryView
                darkMode={darkMode}
                application={selectedApplication}
                club={currentClub?.club ? {
                  name: currentClub.club.name,
                  logo: currentClub.club.logo,
                  bank_name: currentClub.club.bank_name,
                  bsb: currentClub.club.bsb,
                  account_number: currentClub.club.account_number,
                } : undefined}
                mode={selectedApplication.status === 'pending' ? 'admin' : 'review'}
                onApprove={selectedApplication.status === 'pending' ? () => handleApprove(selectedApplication) : undefined}
                onReject={selectedApplication.status === 'pending' ? () => setShowRejectModal(true) : undefined}
                processing={processing === selectedApplication.id}
              />
            </div>
          </div>
        </div>
      )}

      {showRejectModal && selectedApplication && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className={`max-w-md w-full rounded-2xl p-6 ${darkMode ? 'bg-slate-800/95 backdrop-blur-xl border border-slate-700/50' : 'bg-white/95 backdrop-blur-xl border border-slate-200'} shadow-2xl`}>
            <h3 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Reject Application
            </h3>

            <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Please provide a reason for rejecting this application. This will be shared with the applicant.
            </p>

            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={4}
              className={`w-full px-4 py-3 rounded-lg ${
                darkMode
                  ? 'bg-slate-800 text-white border-slate-700'
                  : 'bg-slate-50 text-slate-900 border-slate-300'
              } border focus:ring-2 focus:ring-red-500 focus:border-transparent`}
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                }}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  darkMode
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Cancel
              </button>

              <button
                onClick={handleReject}
                disabled={!rejectionReason || processing === selectedApplication.id}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

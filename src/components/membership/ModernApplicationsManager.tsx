import React, { useState, useEffect } from 'react';
import { Users, Search, CircleCheck as CheckCircle, Circle as XCircle, Clock, Eye, X, Check, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { createMembershipTransaction } from '../../utils/membershipFinanceUtils';
import { ApplicationSummaryView } from './ApplicationSummaryView';
import { AAvatar, AStatus } from '../alfie/Kit';

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
    if (!currentClub?.clubId) return;

    const channel = supabase
      .channel('applications-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'membership_applications', filter: `club_id=eq.${currentClub.clubId}` },
        () => { fetchApplications(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentClub?.clubId]);

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

      // Update profile with member details (full_name is auto-generated)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: application.first_name,
          last_name: application.last_name,
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

      // Determine if this member should pay association fees
      // Check application_data for the recommendation
      let shouldPayAssociationFees = true; // Default to true

      if (application.application_data && typeof application.application_data === 'object') {
        const appData = application.application_data as any;
        if (typeof appData.should_pay_association_fees === 'boolean') {
          shouldPayAssociationFees = appData.should_pay_association_fees;
        }
      }

      // If not in application data, call the smart function to determine
      if (application.application_data && (application.application_data as any).should_pay_association_fees === undefined) {
        const { data: feeData, error: feeError } = await supabase
          .rpc('should_pay_association_fees', {
            p_member_id: application.user_id,
            p_club_id: application.club_id,
            p_relationship_type: 'primary'
          });

        if (!feeError && typeof feeData === 'boolean') {
          shouldPayAssociationFees = feeData;
        }
      }

      // Create or update club membership record (upsert to handle duplicates)
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);

      const { data: newMembership, error: membershipError } = await supabase
        .from('club_memberships')
        .upsert({
          member_id: application.user_id,
          club_id: application.club_id,
          membership_type_id: application.membership_type_id,
          relationship_type: 'primary',
          status: 'active',
          joined_date: new Date().toISOString(),
          expiry_date: expiryDate.toISOString(),
          payment_status: paymentStatus,
          annual_fee_amount: parseFloat(application.membership_amount || membershipType?.amount || '0'),
          pays_association_fees: shouldPayAssociationFees,
        }, {
          onConflict: 'member_id,club_id',
          ignoreDuplicates: false
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

      // Update application status (don't set member_id - it references old members table)
      const { error: updateError } = await supabase
        .from('membership_applications')
        .update({
          status: 'approved',
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
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-white/10 border-t-[#0A84FF]"></div>
      </div>
    );
  }

  const pendingCount = applications.filter(a => a.status === 'pending').length;
  const formatApplied = (date: string) =>
    new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const statusTone = (s: string) => (s === 'approved' ? 'g' : s === 'rejected' ? 'r' : 'a') as 'g' | 'r' | 'a';
  const money = (n?: number) => (n || n === 0 ? `$${Number(n).toFixed(2)}` : '—');

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <h2 className="a-display a-ink m-0 text-[22px] font-semibold">Applications</h2>
          <p className="a-mute mt-1 text-sm">Review and process membership applications</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="a-field w-full sm:w-[300px]">
            <Search size={17} />
            <span className="sr-only">Search applications</span>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search applications" />
          </label>
          <div className="a-seg" role="tablist" aria-label="Status">
            {([['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={statusFilter === k} onClick={() => setStatusFilter(k)} className={`a-seg-i ${statusFilter === k ? 'a-seg-on' : ''}`}>
                {label}{k === 'pending' && pendingCount > 0 && <span className="a-cnt">{pendingCount}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredApplications.length === 0 ? (
        <div className="a-card a-empty" style={{ padding: '40px 24px' }}>
          <span className="a-tile" style={{ width: 56, height: 56 }}><Users size={24} /></span>
          <div className="a-display a-ink text-lg font-semibold">
            {statusFilter === 'pending' && !searchQuery ? "You're all caught up" : 'No applications found'}
          </div>
          <p className="a-mute m-0 text-sm">
            {statusFilter === 'pending' && !searchQuery
              ? 'All applications have been processed. New ones will show here.'
              : 'Try a different search or status.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredApplications.map((application) => (
            <div key={application.id} className="a-card a-hov p-5 flex flex-col gap-4">
              <div className="flex items-center gap-3.5">
                <AAvatar url={application.avatar_url} first={application.first_name} last={application.last_name} />
                <div className="flex-1 min-w-0">
                  <div className="a-ink text-base font-semibold truncate">{application.first_name} {application.last_name}</div>
                  <div className="a-dim text-[12.5px] mt-0.5 truncate">{application.email} · Applied {formatApplied(application.created_at)}</div>
                </div>
                <AStatus tone={statusTone(application.status)}>{application.status.charAt(0).toUpperCase() + application.status.slice(1)}</AStatus>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.4fr] gap-2.5">
                <div className="a-inset">
                  <p className="a-cap">Membership</p>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mt-2">
                    <span className="a-lb-fmt"><span className="a-light a-light-b" style={{ boxShadow: 'none' }} /><span>{application.membership_type_name || '—'}</span></span>
                    <span className="a-num a-ink text-[17px] font-semibold">{money(application.membership_amount)}</span>
                  </div>
                </div>
                <div className="a-inset">
                  <p className="a-cap">Payment</p>
                  <div className="a-ink mt-2 text-[13.5px] font-semibold">{application.payment_method === 'card' ? 'Card' : 'Bank transfer'}</div>
                  <AStatus tone={application.payment_method === 'card' ? 'g' : 'a'} className="mt-1 text-[12.5px]">
                    <span className="a-mute">{application.payment_method === 'card' ? 'Online payment' : 'Awaiting bank transfer'}</span>
                  </AStatus>
                </div>
                <div className="a-inset">
                  <p className="a-cap">Boats</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {application.boats && application.boats.length > 0 ? (
                      <>
                        {application.boats.slice(0, 2).map((boat, index) => (
                          <span key={index} className="inline-flex items-center gap-2 min-w-0">
                            <span className="a-lb-cls"><ClassFlag />{boat.type}{boat.sailNumber && <span className="a-dim" style={{ fontWeight: 500, letterSpacing: 0 }}>{boat.sailNumber}</span>}</span>
                            {boat.hullName && <span className="a-mute text-[13px] truncate">{boat.hullName}</span>}
                          </span>
                        ))}
                        {application.boats.length > 2 && <span className="a-dim text-xs">+{application.boats.length - 2} more</span>}
                      </>
                    ) : (
                      <span className="a-dim text-[13px]">No boats listed</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button onClick={() => setSelectedApplication(application)} className="a-btn a-btn-q"><Eye size={16} />View details</button>
                <div className="flex-1" />
                {application.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleDelete(application)}
                      disabled={processing === application.id}
                      className="a-ib a-ib-d"
                      aria-label="Delete application"
                      title="Permanently delete application and user account (for testing)"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button
                      onClick={() => { setSelectedApplication(application); setShowRejectModal(true); }}
                      disabled={processing === application.id}
                      className="a-btn a-btn-reject"
                    >
                      <X size={16} />Reject
                    </button>
                    <button
                      onClick={() => handleApprove(application)}
                      disabled={processing === application.id}
                      className="a-btn a-btn-p"
                    >
                      <Check size={16} />Approve
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedApplication && !showRejectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="a-sheet max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 a-panel-head a-sheet-head">
              <AAvatar url={selectedApplication.avatar_url} first={selectedApplication.first_name} last={selectedApplication.last_name} size={44} />
              <div className="flex-1 min-w-0">
                <p className="a-cap">Review application</p>
                <h3 className="a-display a-ink text-[22px] font-semibold mt-[3px]">{selectedApplication.first_name} {selectedApplication.last_name}</h3>
              </div>
              <button onClick={() => setSelectedApplication(null)} className="a-ib" aria-label="Close"><X size={20} /></button>
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
          <div className="a-sheet max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="a-tile"><X size={18} /></span>
              <h3 className="a-display a-ink text-xl font-semibold">Reject application</h3>
            </div>
            <p className="a-mute text-sm mb-4">
              Please provide a reason for rejecting this application. This will be shared with the applicant.
            </p>
            <label className="sr-only" htmlFor="reject-reason">Rejection reason</label>
            <textarea
              id="reject-reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason…"
              rows={4}
              className="a-inp"
            />
            <div className="flex gap-2.5 mt-6 justify-end">
              <button onClick={() => { setShowRejectModal(false); setRejectionReason(''); }} className="a-btn">Cancel</button>
              <button onClick={handleReject} disabled={!rejectionReason || processing === selectedApplication.id} className="a-btn a-btn-d">
                <X size={16} />Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Class label flag (board label system). */
const ClassFlag = () => (
  <svg width="9" height="11" viewBox="0 0 10 12" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M1 .75v10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M1.75 1.25h6.5L1.75 5.5z" fill="currentColor" />
  </svg>
);

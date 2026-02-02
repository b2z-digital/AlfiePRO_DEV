import React, { useState, useEffect } from 'react';
import { UserCheck, UserX, Mail, Phone, Calendar, MessageSquare, AlertCircle, CheckCircle } from 'lucide-react';
import {
  getMembershipApplications,
  approveMembershipApplication,
  rejectMembershipApplication,
  MembershipApplication
} from '../utils/memberInvitations';
import { useNotifications } from '../contexts/NotificationContext';

interface MembershipApplicationsPanelProps {
  clubId: string;
  darkMode: boolean;
  onApplicationProcessed?: () => void;
}

export const MembershipApplicationsPanel: React.FC<MembershipApplicationsPanelProps> = ({
  clubId,
  darkMode,
  onApplicationProcessed
}) => {
  const [applications, setApplications] = useState<MembershipApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<MembershipApplication | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const { addNotification } = useNotifications();

  useEffect(() => {
    loadApplications();
  }, [clubId]);

  const loadApplications = async () => {
    setLoading(true);
    const apps = await getMembershipApplications(clubId);
    setApplications(apps);
    setLoading(false);
  };

  const handleApprove = async (application: MembershipApplication) => {
    setProcessing(application.id);
    const result = await approveMembershipApplication(application.id);

    if (result.success) {
      addNotification('success', 'Application approved successfully');
      await loadApplications();
      onApplicationProcessed?.();
    } else {
      addNotification('error', result.error || 'Failed to approve application');
    }
    setProcessing(null);
  };

  const handleReject = async () => {
    if (!selectedApp) return;

    setProcessing(selectedApp.id);
    const result = await rejectMembershipApplication(selectedApp.id, rejectionReason);

    if (result.success) {
      addNotification('success', 'Application rejected');
      await loadApplications();
      onApplicationProcessed?.();
      setShowRejectModal(false);
      setRejectionReason('');
      setSelectedApp(null);
    } else {
      addNotification('error', result.error || 'Failed to reject application');
    }
    setProcessing(null);
  };

  const openRejectModal = (application: MembershipApplication) => {
    setSelectedApp(application);
    setShowRejectModal(true);
  };

  if (loading) {
    return (
      <div className={`p-6 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow`}>
        <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Loading applications...</p>
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className={`p-6 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow`}>
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <CheckCircle size={48} className={`mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
            <p className={`text-lg font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              No Pending Applications
            </p>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
              All membership applications have been processed
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`p-6 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Pending Membership Applications
            </h3>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {applications.length} application{applications.length !== 1 ? 's' : ''} awaiting review
            </p>
          </div>
          <AlertCircle className="text-yellow-500" size={24} />
        </div>

        <div className="space-y-4">
          {applications.map((application) => (
            <div
              key={application.id}
              className={`p-4 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {application.first_name} {application.last_name}
                    </h4>
                    <span className={`text-xs px-2 py-1 rounded-full bg-yellow-500 text-white`}>
                      Pending
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                      <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {application.email}
                      </span>
                    </div>

                    {application.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                        <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {application.phone}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Calendar size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                      <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Applied {new Date(application.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {application.message && (
                      <div className="mt-3 p-3 rounded bg-slate-800/50 dark:bg-slate-900/50">
                        <div className="flex items-start gap-2">
                          <MessageSquare size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                          <div>
                            <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              Message:
                            </p>
                            <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                              {application.message}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleApprove(application)}
                    disabled={processing === application.id}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    title="Approve application"
                  >
                    <UserCheck size={16} />
                    {processing === application.id ? 'Processing...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => openRejectModal(application)}
                    disabled={processing === application.id}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    title="Reject application"
                  >
                    <UserX size={16} />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && selectedApp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-lg p-6 max-w-md w-full mx-4 shadow-xl`}>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Reject Application
            </h3>
            <p className={`text-sm mb-4 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Are you sure you want to reject the application from <strong>{selectedApp.first_name} {selectedApp.last_name}</strong>?
            </p>
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Reason for rejection (optional)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                className={`w-full px-3 py-2 rounded-md border ${
                  darkMode
                    ? 'bg-slate-700 border-slate-600 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                }`}
                placeholder="Optional reason that will be sent to the applicant..."
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                  setSelectedApp(null);
                }}
                disabled={processing === selectedApp.id}
                className={`px-4 py-2 rounded-md ${
                  darkMode
                    ? 'bg-slate-700 hover:bg-slate-600 text-white'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                } transition-colors`}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={processing === selectedApp.id}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing === selectedApp.id ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

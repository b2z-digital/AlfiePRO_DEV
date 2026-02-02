import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle, Mail, X, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { Logo } from '../Logo';

interface ApplicationPendingScreenProps {
  darkMode: boolean;
}

interface ApplicationData {
  id: string;
  club_id: string;
  club_name: string;
  membership_type_name: string;
  membership_amount: number;
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  application_data: any;
}

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (message: string) => Promise<void>;
  darkMode: boolean;
  clubName: string;
}

const EmailModal: React.FC<EmailModalProps> = ({ isOpen, onClose, onSend, darkMode, clubName }) => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!message.trim()) return;

    setSending(true);
    try {
      await onSend(message);
      setMessage('');
      onClose();
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`max-w-lg w-full rounded-xl shadow-xl ${
        darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'
      }`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
              Contact {clubName}
            </h2>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
              }`}
            >
              <X size={20} />
            </button>
          </div>

          <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Send a message to the club administrators. They will receive a notification and email.
          </p>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message here..."
            rows={6}
            className={`w-full px-4 py-3 rounded-lg border resize-none ${
              darkMode
                ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />

          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg transition-colors ${
                darkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!message.trim() || sending}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                !message.trim() || sending
                  ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              <Send size={18} />
              {sending ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ApplicationPendingScreen: React.FC<ApplicationPendingScreenProps> = ({ darkMode }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEmailModal, setShowEmailModal] = useState(false);

  useEffect(() => {
    if (user) {
      loadApplication();
    }
  }, [user]);

  const loadApplication = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('membership_applications')
        .select(`
          id,
          club_id,
          status,
          membership_type_name,
          membership_amount,
          created_at,
          application_data,
          clubs (
            name,
            bank_name,
            bsb,
            account_number
          )
        `)
        .eq('user_id', user.id)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;

      if (data) {
        const clubData = data.clubs as any;
        setApplication({
          id: data.id,
          club_id: data.club_id,
          club_name: clubData?.name || 'the club',
          membership_type_name: data.membership_type_name || 'Membership',
          membership_amount: data.membership_amount || 0,
          status: data.status as 'pending' | 'approved' | 'rejected',
          submitted_at: data.created_at,
          application_data: {
            ...data.application_data,
            clubBankName: clubData?.bank_name,
            clubBsb: clubData?.bsb,
            clubAccountNumber: clubData?.account_number,
          },
        });
      }
    } catch (error) {
      console.error('Error loading application:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!application) {
      console.error('No application found');
      return;
    }

    try {
      console.log('Starting to send message...');

      const { data: { user: authUser } } = await supabase.auth.getUser();
      console.log('Auth user:', authUser);

      if (!authUser) {
        throw new Error('Not authenticated');
      }

      const { data: adminUsers, error: adminError } = await supabase
        .from('user_clubs')
        .select('user_id')
        .eq('club_id', application.club_id)
        .eq('role', 'admin');

      console.log('Admin users query:', { adminUsers, adminError, club_id: application.club_id });

      if (adminError) throw adminError;

      if (!adminUsers || adminUsers.length === 0) {
        throw new Error('No admin users found for this club');
      }

      const adminUserIds = adminUsers.map(u => u.user_id);
      console.log('Admin user IDs:', adminUserIds);

      const { data: adminProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', adminUserIds);

      console.log('Admin profiles query:', { adminProfiles, profilesError });

      if (profilesError) throw profilesError;

      if (!adminProfiles || adminProfiles.length === 0) {
        console.error('No profiles found for admin users. This may be an RLS issue.');
        throw new Error('No admin user profiles found. Please contact support.');
      }

      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url, email')
        .eq('id', authUser.id)
        .single();

      // If profile is empty, get data from application
      let senderFirstName = senderProfile?.first_name;
      let senderLastName = senderProfile?.last_name;
      let senderEmail = senderProfile?.email || authUser.email;
      let senderAvatar = senderProfile?.avatar_url;

      if (!senderFirstName && !senderLastName && application.application_data) {
        senderFirstName = application.application_data.firstName;
        senderLastName = application.application_data.lastName;
        senderEmail = application.application_data.email || senderEmail;
      }

      // Always check for avatar in application data if not in profile
      if (!senderAvatar && application.application_data?.avatarUrl) {
        senderAvatar = application.application_data.avatarUrl;
      }

      const recipients = (adminProfiles || []).map((profile: any) => ({
        user_id: profile.id,
        email: profile.email,
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Unknown',
      }));

      const senderName = `${senderFirstName || ''} ${senderLastName || ''}`.trim() || senderEmail || 'Member';

      console.log('Sender info:', {
        senderFirstName,
        senderLastName,
        senderEmail,
        senderAvatar,
        senderName,
        applicationData: application.application_data
      });

      const { error } = await supabase.functions.invoke('send-notification', {
        body: {
          recipients: recipients,
          subject: 'Membership Application Inquiry',
          body: message,
          type: 'membership_inquiry',
          club_id: application.club_id,
          send_email: true,
          sender_name: senderName,
          sender_avatar: senderAvatar || null,
          club_name: application.club_name,
          sender_first_name: senderFirstName || '',
          sender_last_name: senderLastName || ''
        }
      });

      if (error) throw error;

      addNotification('success', 'Message sent successfully!');
    } catch (error: any) {
      console.error('Error sending message:', error);
      addNotification('error', error?.message || 'Failed to send message. Please try again.');
      throw error;
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-300">No application found</p>
        </div>
      </div>
    );
  }

  const submittedDate = new Date(application.submitted_at).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const paymentMethod = application.application_data?.paymentMethod;
  const hasBankDetails = application.application_data?.clubBankName &&
                        application.application_data?.clubBsb &&
                        application.application_data?.clubAccountNumber;

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          {/* Header with Logo */}
          <div className="relative flex items-center justify-center mb-8">
            <div className="flex items-center gap-3">
              <Logo size="large" />
              <h1 className="text-3xl text-white tracking-wide">
                <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
              </h1>
            </div>
            <button
              onClick={handleSignOut}
              className="absolute right-0 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-300 transition-colors"
            >
              Sign Out
            </button>
          </div>

          {/* Main Card */}
          <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-8 md:p-12">
              {/* Status Icon and Message */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 mb-4">
                  <Clock className="text-amber-500" size={32} />
                </div>
                <h2 className="text-3xl font-bold mb-2 text-white">
                  Application Pending
                </h2>
                <p className="text-lg text-slate-300">
                  Your membership application is under review
                </p>
              </div>

              {/* Application Details */}
              <div className="rounded-lg p-6 mb-6 bg-slate-700/30 backdrop-blur-sm border border-slate-600/30">
                <h3 className="text-lg font-semibold mb-4 text-slate-200">
                  Application Details
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Club:</span>
                    <span className="font-medium text-slate-200">
                      {application.club_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Membership Type:</span>
                    <span className="font-medium text-slate-200">
                      {application.membership_type_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Amount:</span>
                    <span className="font-medium text-slate-200">
                      ${application.membership_amount.toFixed(2)} AUD
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Submitted:</span>
                    <span className="font-medium text-slate-200">
                      {submittedDate}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Reminder */}
              {paymentMethod === 'bank_transfer' && hasBankDetails ? (
                <div className="rounded-lg p-6 mb-6 border bg-blue-500/10 border-blue-500/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="text-blue-400 flex-shrink-0 mt-0.5" size={20} />
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2 text-blue-300">
                        Payment Reminder
                      </h3>
                      <p className="text-sm mb-3 text-blue-200">
                        Complete your bank transfer using your name as the reference:
                      </p>
                      <div className="rounded-lg p-4 bg-slate-800/50">
                        <div className="grid md:grid-cols-2 gap-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Bank Name:</span>
                            <span className="font-medium text-slate-200">
                              {application.application_data.clubBankName}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">BSB:</span>
                            <span className="font-medium text-slate-200">
                              {application.application_data.clubBsb}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Account Number:</span>
                            <span className="font-medium text-slate-200">
                              {application.application_data.clubAccountNumber}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Reference:</span>
                            <span className="font-medium text-slate-200">
                              Use your name
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : paymentMethod === 'card' ? (
                <div className="rounded-lg p-6 mb-6 border bg-green-500/10 border-green-500/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="text-green-400 flex-shrink-0 mt-0.5" size={20} />
                    <div>
                      <h3 className="font-semibold mb-1 text-green-300">
                        Payment Processed
                      </h3>
                      <p className="text-sm text-green-200">
                        Your payment has been successfully processed via Stripe. You will receive a confirmation email shortly.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* What's Next */}
              <div className="rounded-lg p-6 mb-6 bg-slate-700/30 backdrop-blur-sm border border-slate-600/30">
                <h3 className="text-lg font-semibold mb-4 text-slate-200">
                  What Happens Next?
                </h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-blue-500/20 text-blue-400">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-slate-200">
                        Application Review
                      </p>
                      <p className="text-sm text-slate-400">
                        The club committee will review your application
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-blue-500/20 text-blue-400">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-slate-200">
                        Payment Verification
                      </p>
                      <p className="text-sm text-slate-400">
                        {paymentMethod === 'bank_transfer'
                          ? 'Your payment will be verified once received'
                          : 'Your payment has been processed automatically'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-blue-500/20 text-blue-400">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-slate-200">
                        Decision Notification
                      </p>
                      <p className="text-sm text-slate-400">
                        You'll receive an email once your application is approved
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div className="text-center">
                <p className="text-sm mb-3 text-slate-400">
                  Have questions about your application?
                </p>
                <button
                  onClick={() => setShowEmailModal(true)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg transition-colors bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                  <Mail size={18} />
                  Email Club
                </button>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              You'll be able to access the club dashboard once your application is approved
            </p>
          </div>
        </div>
      </div>

      <EmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        onSend={handleSendMessage}
        darkMode={darkMode}
        clubName={application.club_name}
      />
    </>
  );
};

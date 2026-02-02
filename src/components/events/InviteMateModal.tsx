import { useState } from 'react';
import { LogOut, Mail, MessageSquare, UserPlus } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface InviteMateModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
  eventDate: Date;
}

export default function InviteMateModal({
  isOpen,
  onClose,
  eventId,
  eventName,
  eventDate
}: InviteMateModalProps) {
  const { user } = useAuth();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [personalMessage, setPersonalMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [invitationLink, setInvitationLink] = useState('');

  if (!isOpen) return null;

  const handleSendInvitation = async () => {
    if (!recipientEmail.trim()) {
      setError('Please enter an email address');
      return;
    }

    if (!user) {
      setError('You must be logged in to send invitations');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      const senderName = profile?.full_name || 'A friend';

      const { data: invitation, error: insertError } = await supabase
        .from('event_invitations')
        .insert({
          event_id: eventId,
          sender_id: user.id,
          sender_name: senderName,
          recipient_email: recipientEmail.trim(),
          recipient_name: recipientName.trim() || null,
          personal_message: personalMessage.trim() || null,
          status: 'pending'
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const inviteLink = `${window.location.origin}/event-registration?token=${invitation.invitation_token}`;
      setInvitationLink(inviteLink);

      const { error: emailError } = await supabase.functions.invoke('send-event-invitation', {
        body: {
          recipientEmail: recipientEmail.trim(),
          recipientName: recipientName.trim() || null,
          senderName,
          eventName,
          eventDate: eventDate.toISOString(),
          personalMessage: personalMessage.trim() || null,
          invitationLink: inviteLink
        }
      });

      if (emailError) {
        console.error('Error sending invitation email:', emailError);
      }

      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 3000);
    } catch (err: any) {
      console.error('Error sending invitation:', err);
      setError(err.message || 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setRecipientEmail('');
    setRecipientName('');
    setPersonalMessage('');
    setError(null);
    setSuccess(false);
    setInvitationLink('');
    onClose();
  };

  const copyInvitationLink = () => {
    navigator.clipboard.writeText(invitationLink);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Invite a Mate</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Invitation Sent!
              </h3>
              <p className="text-gray-600 mb-4">
                Your mate will receive an email with details about {eventName}.
              </p>
              {invitationLink && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">Share this link:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={invitationLink}
                      readOnly
                      className="flex-1 px-3 py-2 text-sm border rounded bg-white"
                    />
                    <button
                      onClick={copyInvitationLink}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800">
                  Invite a friend to join you at <strong>{eventName}</strong>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="mate@example.com"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={sending}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Their Name (Optional)
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="John Smith"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={sending}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Personal Message (Optional)
                </label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <textarea
                    value={personalMessage}
                    onChange={(e) => setPersonalMessage(e.target.value)}
                    placeholder="Add a personal note to your invitation..."
                    rows={3}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    disabled={sending}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  This will be included in the invitation email
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={sending}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendInvitation}
                  disabled={sending || !recipientEmail.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {sending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Send Invitation
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
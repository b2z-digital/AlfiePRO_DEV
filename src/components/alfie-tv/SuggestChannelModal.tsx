import React, { useState } from 'react';
import { LogOut, Lightbulb, Send } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';

interface SuggestChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  darkMode?: boolean;
}

export const SuggestChannelModal: React.FC<SuggestChannelModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  darkMode = true
}) => {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const [channelName, setChannelName] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!channelName.trim() || !channelUrl.trim()) {
      addNotification('Please provide both channel name and URL', 'error');
      return;
    }

    setSubmitting(true);

    try {
      // Insert suggestion into database
      const { error } = await supabase
        .from('alfie_tv_channel_suggestions')
        .insert({
          user_id: user?.id,
          channel_name: channelName.trim(),
          channel_url: channelUrl.trim(),
          description: description.trim() || null,
          status: 'pending'
        });

      if (error) throw error;

      // Notify superadmin via edge function
      await supabase.functions.invoke('send-channel-suggestion', {
        body: {
          channelName: channelName.trim(),
          channelUrl: channelUrl.trim(),
          description: description.trim(),
          userName: user?.email || 'Anonymous'
        }
      });

      addNotification('Thank you for your suggestion! We\'ll review it shortly.', 'success');

      // Reset form and close
      setChannelName('');
      setChannelUrl('');
      setDescription('');
      onClose();

      // Navigate back to channels view
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error submitting suggestion:', error);
      addNotification('Failed to submit suggestion. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className={`
          relative w-full max-w-2xl rounded-2xl shadow-2xl
          ${darkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-gray-200'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-lg">
              <Lightbulb className="w-6 h-6 text-yellow-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Suggest a Channel</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <p className="text-gray-400">
            Know a great sailing or radio control yacht channel? Suggest it for AlfieTV and help grow our community content!
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Channel Name *
            </label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="e.g., SailGP, RC Sailing Weekly"
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Channel URL *
            </label>
            <input
              type="url"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              placeholder="https://www.youtube.com/@channelname"
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
              required
            />
            <p className="mt-2 text-xs text-gray-500">
              Paste the YouTube channel URL (e.g., https://www.youtube.com/@channelname)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Why should we add this channel? (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us what makes this channel great..."
              rows={4}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-gray-400 hover:text-white transition-colors"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold rounded-lg transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit Suggestion
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

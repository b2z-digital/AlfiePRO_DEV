import React, { useState } from 'react';
import { AlfieIcon } from '../brand/AlfieIcon';
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
      addNotification('error', 'Please provide both channel name and URL');
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

      addNotification('success', 'Thank you for your suggestion! We\'ll review it shortly.');

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
      addNotification('error', 'Failed to submit suggestion. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6 atvm-modal atvm-font">
      <div className="a-veil absolute inset-0 backdrop-blur-[2px]" onClick={() => !submitting && onClose()} aria-hidden="true" />
      <form onSubmit={handleSubmit} className="a-sheet relative w-full max-w-xl flex flex-col max-h-[92vh] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="atvm-sug-title">
        <header className="a-sheet-head a-md-sheet-head">
          <span className="a-tile a-tile-rim" style={{ width: 44, height: 44 }}><AlfieIcon glyph="spark" size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="atvm-sug-title" className="a-display a-ink m-0 text-[20px] font-semibold leading-tight">Suggest a Channel</h2>
            <p className="a-mute m-0 mt-0.5 text-[13.5px]">Help grow AlfieTV for the whole community</p>
          </div>
          <button type="button" onClick={onClose} className="a-ib" aria-label="Close"><AlfieIcon glyph="x" size={20} /></button>
        </header>

        <div className="a-md-sheet-body">
          <p className="a-mute m-0 text-[14px] leading-relaxed">
            Know a great sailing or radio control yacht channel? Suggest it for AlfieTV and help grow our community content!
          </p>

          <label className="a-md-fl">
            <span>Channel Name *</span>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="e.g., SailGP, RC Sailing Weekly"
              className="a-inp"
              required
            />
          </label>

          <label className="a-md-fl">
            <span>Channel URL *</span>
            <span className="a-field">
              <AlfieIcon glyph="link" size={16} />
              <input
                type="url"
                value={channelUrl}
                onChange={(e) => setChannelUrl(e.target.value)}
                placeholder="https://www.youtube.com/@channelname"
                required
              />
            </span>
            <small>Paste the YouTube channel URL (e.g., https://www.youtube.com/@channelname)</small>
          </label>

          <label className="a-md-fl">
            <span>Why should we add this channel? (Optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us what makes this channel great..."
              rows={4}
              className="a-inp"
            />
          </label>
        </div>

        <footer className="a-sheet-foot a-md-sheet-foot">
          <button type="button" onClick={onClose} className="a-btn a-btn-q" disabled={submitting}>Cancel</button>
          <button type="submit" disabled={submitting} className="a-btn a-btn-p">
            {submitting ? (
              <>
                <span className="a-nw-spin" />
                Submitting...
              </>
            ) : (
              <>
                <AlfieIcon glyph="send" size={16} />
                Submit Suggestion
              </>
            )}
          </button>
        </footer>
      </form>
    </div>
  );
};

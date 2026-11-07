import React, { useState, useEffect } from 'react';
import { AlfieIcon } from './brand/AlfieIcon';
import { MediaThumb } from './media/MediaParts';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { EventMedia } from '../types/media';
import { useNotifications } from '../contexts/NotificationContext';

interface ShareWithClubsModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  selectedMedia: EventMedia[];
  onSuccess?: () => void;
}

interface Club {
  id: string;
  name: string;
  abbreviation: string;
  logo: string | null;
  organization_type: string;
}

export const ShareWithClubsModal: React.FC<ShareWithClubsModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  selectedMedia,
  onSuccess
}) => {
  const { currentClub } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState('');
  const [selectedClubs, setSelectedClubs] = useState<Set<string>>(new Set());
  const [availableClubs, setAvailableClubs] = useState<Club[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (isOpen) {
      fetchAvailableClubs();
      generateDefaultMessage();
    }
  }, [isOpen, selectedMedia]);

  const fetchAvailableClubs = async () => {
    try {
      setLoadingClubs(true);
      setError(null);

      // Fetch all clubs except the current one
      const { data, error } = await supabase
        .from('clubs')
        .select('id, name, abbreviation, logo, organization_type')
        .neq('id', currentClub?.clubId)
        .order('name');

      if (error) throw error;
      setAvailableClubs(data || []);
    } catch (err) {
      console.error('Error fetching clubs:', err);
      setError('Failed to load available clubs');
    } finally {
      setLoadingClubs(false);
    }
  };

  const generateDefaultMessage = () => {
    const imageCount = selectedMedia.filter(item => item.media_type === 'image').length;
    const videoCount = selectedMedia.filter(item => item.media_type === 'youtube_video').length;
    
    let message = `Hi! We'd like to share some `;
    
    if (imageCount > 0 && videoCount > 0) {
      message += `photos and videos`;
    } else if (imageCount > 0) {
      message += `photos`;
    } else if (videoCount > 0) {
      message += `videos`;
    } else {
      message += `media`;
    }
    
    message += ` from ${currentClub?.club?.name || 'our club'}.`;
    
    // Add event context if available
    const eventNames = [...new Set(selectedMedia.map(item => item.event_name).filter(Boolean))];
    if (eventNames.length === 1) {
      message += ` These are from our ${eventNames[0]} event.`;
    } else if (eventNames.length > 1) {
      message += ` These are from our recent events.`;
    }
    
    setShareMessage(message);
  };

  const handleClubToggle = (clubId: string) => {
    const newSelection = new Set(selectedClubs);
    if (newSelection.has(clubId)) {
      newSelection.delete(clubId);
    } else {
      newSelection.add(clubId);
    }
    setSelectedClubs(newSelection);
  };

  const handleShare = async () => {
    if (selectedClubs.size === 0) {
      setError('Please select at least one club to share with');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const { data, error } = await supabase.functions.invoke('share-media-with-clubs', {
        body: {
          mediaIds: selectedMedia.map(item => item.id),
          sharingClubId: currentClub?.clubId,
          recipientClubIds: Array.from(selectedClubs),
          message: shareMessage.trim() || null
        }
      });

      if (error) throw error;

      addNotification('success', `Successfully shared media with ${selectedClubs.size} club${selectedClubs.size > 1 ? 's' : ''}!`);
      
      if (onSuccess) onSuccess();
      onClose();

    } catch (err) {
      console.error('Error sharing media with clubs:', err);
      setError(err instanceof Error ? err.message : 'Failed to share media with clubs');
    } finally {
      setLoading(false);
    }
  };

  const filteredClubs = availableClubs.filter(club =>
    club.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    club.abbreviation.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6">
      <div className="a-veil absolute inset-0 backdrop-blur-[2px]" onClick={() => !loading && onClose()} aria-hidden="true" />
      <section className="a-sheet a-md-sheet relative w-full max-w-3xl flex flex-col max-h-[92vh] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="a-md-clubs-title">
        <header className="a-sheet-head a-md-sheet-head">
          <span className="a-tile a-tile-rim" style={{ width: 44, height: 44 }}><AlfieIcon glyph="team" size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="a-md-clubs-title" className="a-display a-ink m-0 text-[20px] font-semibold leading-tight">Share with Other Clubs</h2>
            <p className="a-mute m-0 mt-0.5 text-[13.5px]">The media appears in their Media Center, marked as shared by you</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="a-ib" aria-label="Close">
            <AlfieIcon glyph="x" size={20} />
          </button>
        </header>

        <div className="a-md-sheet-body">
          {error && (
            <div className="a-nw-ed-msg a-nw-ed-msg-r" role="alert">
              <AlfieIcon glyph="warn" size={18} />
              <p><b>Error</b><br />{error}</p>
            </div>
          )}

          {success && (
            <div className="a-nw-ed-msg a-nw-ed-msg-g" role="status">
              <AlfieIcon glyph="check" size={18} />
              <p><b>Success</b><br />{success}</p>
            </div>
          )}

          <div className="a-md-fl">
            <span>Selected Media ({selectedMedia.length} items)</span>
            <div className="a-md-strip">
              {selectedMedia.slice(0, 8).map((item) => (
                <span key={item.id} className="a-md-strip-i">
                  <MediaThumb item={item} />
                  {item.media_type === 'youtube_video' && (
                    <span className="a-md-play a-md-play-sm" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></svg>
                    </span>
                  )}
                </span>
              ))}
              {selectedMedia.length > 8 && (
                <span className="a-md-strip-i a-md-strip-more">+{selectedMedia.length - 8} more</span>
              )}
            </div>
          </div>

          <div className="a-md-fl">
            <span>Select Clubs to Share With</span>
            <label className="a-field">
              <AlfieIcon glyph="search" size={16} />
              <input
                type="text"
                placeholder="Search clubs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </label>

            {loadingClubs ? (
              <div className="a-md-readonly justify-center"><span className="a-nw-spin" />Loading clubs…</div>
            ) : filteredClubs.length === 0 ? (
              <div className="a-md-none">
                <AlfieIcon glyph="team" size={26} />
                <p>{searchTerm ? 'No clubs found matching your search' : 'No other clubs available'}</p>
              </div>
            ) : (
              <div className="a-md-pick-list">
                {filteredClubs.map((club) => {
                  const on = selectedClubs.has(club.id);
                  return (
                    <button
                      type="button"
                      key={club.id}
                      onClick={() => handleClubToggle(club.id)}
                      className={`a-md-pick-row ${on ? 'is-on' : ''}`}
                      aria-pressed={on}
                    >
                      {club.logo ? (
                        <img src={club.logo} alt="" className="a-md-pick-logo" />
                      ) : (
                        <span className="a-md-pick-logo a-md-pick-logo-txt">{(club.abbreviation || club.name || '?').slice(0, 4)}</span>
                      )}
                      <span className="min-w-0 flex-1 text-left">
                        <b>{club.abbreviation}</b>
                        <span>{club.name}</span>
                      </span>
                      <span className={`a-chk ${on ? 'a-chk-on' : ''}`}>{on && <AlfieIcon glyph="check" size={12} strokeWidth={2.6} />}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <label className="a-md-fl">
            <span>Message (Optional)</span>
            <textarea
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
              rows={3}
              className="a-inp"
              placeholder="Add a message to accompany your shared media..."
            />
            <small>This message will be sent along with the shared media to the selected clubs.</small>
          </label>
        </div>

        <footer className="a-sheet-foot a-md-sheet-foot">
          <button onClick={onClose} disabled={loading} className="a-btn a-btn-q">
            Cancel
          </button>
          <button
            onClick={handleShare}
            disabled={loading || selectedClubs.size === 0}
            className="a-btn a-btn-p"
          >
            {loading ? (
              <>
                <span className="a-nw-spin" />
                Sharing...
              </>
            ) : (
              <>
                <AlfieIcon glyph="send" size={16} />
                Share with {selectedClubs.size} Club{selectedClubs.size !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </footer>
      </section>
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { X, Share2, Building, Send, AlertTriangle, CheckCircle, Users, MessageSquare } from 'lucide-react';
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-4xl rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <Share2 className="text-blue-400" size={24} />
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Share with Other Clubs
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className={`
              rounded-full p-2 transition-colors
              ${darkMode 
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
              ${loading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30 flex items-start gap-3">
              <AlertTriangle className="text-red-400 mt-0.5" size={18} />
              <div>
                <h3 className="text-red-400 font-medium">Error</h3>
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-lg bg-green-900/20 border border-green-900/30 flex items-start gap-3">
              <CheckCircle className="text-green-400 mt-0.5" size={18} />
              <div>
                <h3 className="text-green-400 font-medium">Success</h3>
                <p className="text-green-300 text-sm">{success}</p>
              </div>
            </div>
          )}

          {/* Selected Media Preview */}
          <div>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Selected Media ({selectedMedia.length} items)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {selectedMedia.slice(0, 8).map((item) => (
                <div key={item.id} className={`
                  relative aspect-video rounded-lg overflow-hidden
                  ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}
                `}>
                  {item.media_type === 'youtube_video' ? (
                    <>
                      <img
                        src={item.thumbnail_url || `https://img.youtube.com/vi/${item.url.split('v=')[1]?.split('&')[0]}/maxresdefault.jpg`}
                        alt={item.title || 'Video thumbnail'}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
                          <div className="w-0 h-0 border-l-[6px] border-l-white border-y-[4px] border-y-transparent ml-0.5"></div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <img
                      src={item.url}
                      alt={item.title || 'Image'}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              ))}
              {selectedMedia.length > 8 && (
                <div className={`
                  aspect-video rounded-lg flex items-center justify-center
                  ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}
                `}>
                  <span className="text-sm font-medium">+{selectedMedia.length - 8} more</span>
                </div>
              )}
            </div>
          </div>

          {/* Club Selection */}
          <div>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Select Clubs to Share With
            </h3>
            
            {/* Search */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search clubs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' 
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'}
                `}
              />
            </div>

            {loadingClubs ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : filteredClubs.length === 0 ? (
              <div className={`
                text-center py-8 rounded-lg border
                ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}
              `}>
                <Users size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
                <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                  {searchTerm ? 'No clubs found matching your search' : 'No other clubs available'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                {filteredClubs.map((club) => (
                  <div
                    key={club.id}
                    onClick={() => handleClubToggle(club.id)}
                    className={`
                      p-4 rounded-lg border cursor-pointer transition-all
                      ${selectedClubs.has(club.id)
                        ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-800'
                        : darkMode
                          ? 'border-slate-600 hover:border-slate-500'
                          : 'border-slate-300 hover:border-slate-400'
                      }
                      ${darkMode ? 'bg-slate-700' : 'bg-white'}
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {club.logo ? (
                          <img 
                            src={club.logo} 
                            alt={`${club.name} logo`}
                            className="w-10 h-10 object-contain rounded-lg"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                            <Building size={20} className="text-white" />
                          </div>
                        )}
                        <div>
                          <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                            {club.abbreviation}
                          </h4>
                          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {club.name}
                          </p>
                        </div>
                      </div>
                      <div className={`
                        w-5 h-5 rounded-full border-2 transition-colors
                        ${selectedClubs.has(club.id)
                          ? 'bg-blue-500 border-blue-500'
                          : darkMode
                            ? 'border-slate-400'
                            : 'border-slate-300'
                        }
                      `}>
                        {selectedClubs.has(club.id) && (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Share Message */}
          <div>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Message (Optional)
            </h3>
            <div className="relative">
              <MessageSquare 
                size={18} 
                className={`absolute left-3 top-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
              />
              <textarea
                value={shareMessage}
                onChange={(e) => setShareMessage(e.target.value)}
                rows={4}
                className={`
                  w-full pl-10 pr-4 py-3 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' 
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'}
                `}
                placeholder="Add a message to accompany your shared media..."
              />
            </div>
            <p className={`text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              This message will be sent along with the shared media to the selected clubs.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className={`
          flex justify-end gap-3 p-6 border-t
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <button
            onClick={onClose}
            disabled={loading}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${darkMode
                ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
              ${loading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            Cancel
          </button>
          
          <button
            onClick={handleShare}
            disabled={loading || selectedClubs.size === 0}
            className={`
              flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors text-white
              ${loading || selectedClubs.size === 0
                ? 'opacity-50 cursor-not-allowed bg-slate-600'
                : 'bg-blue-600 hover:bg-blue-700'}
            `}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Sharing...
              </>
            ) : (
              <>
                <Send size={16} />
                Share with {selectedClubs.size} Club{selectedClubs.size !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
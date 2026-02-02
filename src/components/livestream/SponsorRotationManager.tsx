import React, { useState, useEffect } from 'react';
import { DollarSign, Plus, Trash2, Eye, EyeOff, Image as ImageIcon } from 'lucide-react';
import { livestreamStorage } from '../../utils/livestreamStorage';
import type { LivestreamSponsorRotation, SponsorDisplayType, SponsorPosition } from '../../types/livestream';

interface SponsorRotationManagerProps {
  sessionId: string;
  clubId: string;
}

export function SponsorRotationManager({ sessionId, clubId }: SponsorRotationManagerProps) {
  const [sponsors, setSponsors] = useState<LivestreamSponsorRotation[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSponsor, setNewSponsor] = useState({
    sponsor_name: '',
    logo_url: '',
    display_type: 'corner' as SponsorDisplayType,
    position: 'bottom_right' as SponsorPosition,
    display_duration: 10,
    show_between_races: true,
    show_during_race: false
  });

  useEffect(() => {
    loadSponsors();
  }, [sessionId]);

  const loadSponsors = async () => {
    try {
      const data = await livestreamStorage.getSponsorRotations(sessionId);
      setSponsors(data);
    } catch (error) {
      console.error('Error loading sponsors:', error);
    }
  };

  const addSponsor = async () => {
    try {
      await livestreamStorage.createSponsorRotation({
        session_id: sessionId,
        ...newSponsor,
        rotation_order: sponsors.length
      });

      setShowAddModal(false);
      setNewSponsor({
        sponsor_name: '',
        logo_url: '',
        display_type: 'corner',
        position: 'bottom_right',
        display_duration: 10,
        show_between_races: true,
        show_during_race: false
      });
      loadSponsors();
    } catch (error) {
      console.error('Error adding sponsor:', error);
      alert('Failed to add sponsor');
    }
  };

  const removeSponsor = async (sponsorId: string) => {
    if (!confirm('Remove this sponsor?')) return;

    try {
      await livestreamStorage.deleteSponsorRotation(sponsorId);
      loadSponsors();
    } catch (error) {
      console.error('Error removing sponsor:', error);
      alert('Failed to remove sponsor');
    }
  };

  const toggleActive = async (sponsorId: string, isActive: boolean) => {
    try {
      await livestreamStorage.updateSponsorRotation(sponsorId, { is_active: !isActive });
      loadSponsors();
    } catch (error) {
      console.error('Error toggling sponsor:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Sponsor Rotation</h3>
          <p className="text-sm text-slate-400 mt-1">
            Rotate sponsor banners during your livestream
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Sponsor
        </button>
      </div>

      {sponsors.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No sponsors configured</p>
          <p className="text-sm mt-1">Add sponsors to display during your stream</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sponsors.map((sponsor) => (
            <div
              key={sponsor.id}
              className={`p-4 rounded-lg border transition-all ${
                sponsor.is_active
                  ? 'bg-slate-700/50 border-slate-600'
                  : 'bg-slate-800/50 border-slate-700 opacity-60'
              }`}
            >
              <div className="flex items-center gap-4">
                {sponsor.logo_url && (
                  <div className="w-16 h-16 bg-slate-800 rounded-lg overflow-hidden flex-shrink-0">
                    <img
                      src={sponsor.logo_url}
                      alt={sponsor.sponsor_name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white">{sponsor.sponsor_name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span>{sponsor.display_type}</span>
                    <span>•</span>
                    <span>{sponsor.display_duration}s</span>
                    <span>•</span>
                    <span>{sponsor.impressions} impressions</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {sponsor.show_between_races && (
                      <span className="px-2 py-1 bg-blue-900/50 text-blue-400 text-xs rounded">
                        Between races
                      </span>
                    )}
                    {sponsor.show_during_race && (
                      <span className="px-2 py-1 bg-green-900/50 text-green-400 text-xs rounded">
                        During race
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleActive(sponsor.id, sponsor.is_active)}
                    className="p-2 hover:bg-slate-600 rounded transition-colors"
                    title={sponsor.is_active ? 'Hide' : 'Show'}
                  >
                    {sponsor.is_active ? (
                      <Eye className="w-4 h-4 text-slate-400" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                  <button
                    onClick={() => removeSponsor(sponsor.id)}
                    className="p-2 hover:bg-red-900/50 text-red-400 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {sponsors.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
          <p className="text-sm text-blue-300">
            Sponsors will rotate every {sponsors[0]?.display_duration || 10} seconds during your livestream
          </p>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold text-white mb-4">Add Sponsor</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Sponsor Name
                </label>
                <input
                  type="text"
                  value={newSponsor.sponsor_name}
                  onChange={(e) => setNewSponsor({ ...newSponsor, sponsor_name: e.target.value })}
                  placeholder="e.g., Acme Sailing Co."
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Logo URL
                </label>
                <input
                  type="url"
                  value={newSponsor.logo_url}
                  onChange={(e) => setNewSponsor({ ...newSponsor, logo_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                />
                {newSponsor.logo_url && (
                  <div className="mt-2 p-2 bg-slate-900 rounded-lg">
                    <img
                      src={newSponsor.logo_url}
                      alt="Preview"
                      className="w-full h-24 object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Display Type
                </label>
                <select
                  value={newSponsor.display_type}
                  onChange={(e) => setNewSponsor({ ...newSponsor, display_type: e.target.value as SponsorDisplayType })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                >
                  <option value="corner">Corner Watermark</option>
                  <option value="banner">Top Banner</option>
                  <option value="lower_third">Lower Third</option>
                  <option value="fullscreen">Full Screen</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Position
                </label>
                <select
                  value={newSponsor.position}
                  onChange={(e) => setNewSponsor({ ...newSponsor, position: e.target.value as SponsorPosition })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                >
                  <option value="top_left">Top Left</option>
                  <option value="top_right">Top Right</option>
                  <option value="bottom_left">Bottom Left</option>
                  <option value="bottom_right">Bottom Right</option>
                  <option value="center">Center</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Display Duration (seconds)
                </label>
                <input
                  type="number"
                  value={newSponsor.display_duration}
                  onChange={(e) => setNewSponsor({ ...newSponsor, display_duration: parseInt(e.target.value) || 10 })}
                  min="5"
                  max="60"
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-700">
                <label className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-300">
                    Show between races
                  </span>
                  <input
                    type="checkbox"
                    checked={newSponsor.show_between_races}
                    onChange={(e) => setNewSponsor({ ...newSponsor, show_between_races: e.target.checked })}
                    className="w-4 h-4 bg-slate-900 border-slate-700 rounded"
                  />
                </label>

                <label className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-300">
                    Show during race
                  </span>
                  <input
                    type="checkbox"
                    checked={newSponsor.show_during_race}
                    onChange={(e) => setNewSponsor({ ...newSponsor, show_during_race: e.target.checked })}
                    className="w-4 h-4 bg-slate-900 border-slate-700 rounded"
                  />
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addSponsor}
                disabled={!newSponsor.sponsor_name}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Sponsor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

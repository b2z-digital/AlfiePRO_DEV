import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2, Trophy, Upload, LogOut, ExternalLink, Image as ImageIcon, Check, Sparkles } from 'lucide-react';
import type { EventSponsor } from '../../types/eventWebsite';
import { eventWebsiteStorage } from '../../utils/eventWebsiteStorage';
import { supabase } from '../../utils/supabase';
import imageCompression from 'browser-image-compression';

interface EventWebsiteSponsorManagerProps {
  websiteId: string;
}

export const EventWebsiteSponsorManager: React.FC<EventWebsiteSponsorManagerProps> = ({ websiteId }) => {
  const [loading, setLoading] = useState(true);
  const [sponsors, setSponsors] = useState<EventSponsor[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<EventSponsor | null>(null);
  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string>('');

  const [name, setName] = useState('');
  const [tier, setTier] = useState<EventSponsor['tier']>('supporter');
  const [logoUrl, setLogoUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    loadSponsors();
  }, [websiteId]);

  const loadSponsors = async () => {
    try {
      setLoading(true);
      const data = await eventWebsiteStorage.getEventSponsors(websiteId);
      setSponsors(data.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)));
    } catch (error) {
      console.error('Error loading sponsors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (sponsor: EventSponsor) => {
    setEditingSponsor(sponsor);
    setName(sponsor.name);
    setTier(sponsor.tier);
    setLogoUrl(sponsor.logo_url);
    setLogoPreview(sponsor.logo_url);
    setWebsiteUrl(sponsor.website_url || '');
    setDescription(sponsor.description || '');
    setShowModal(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);

      // Compress image
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      };

      const compressedFile = await imageCompression(file, options);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `event-sponsors/${websiteId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, compressedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      setLogoUrl(publicUrl);
      setLogoPreview(publicUrl);
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name || !logoUrl) {
      alert('Please enter sponsor name and upload a logo');
      return;
    }

    try {
      const sponsorData: Partial<EventSponsor> = {
        event_website_id: websiteId,
        name,
        tier,
        logo_url: logoUrl,
        website_url: websiteUrl || null,
        description: description || null,
        display_order: editingSponsor?.display_order ?? sponsors.length
      };

      if (editingSponsor) {
        await eventWebsiteStorage.updateEventSponsor(editingSponsor.id, sponsorData);
      } else {
        await eventWebsiteStorage.createEventSponsor(sponsorData);
      }

      resetForm();
      await loadSponsors();
    } catch (error) {
      console.error('Error saving sponsor:', error);
      alert('Failed to save sponsor');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sponsor?')) return;

    try {
      await eventWebsiteStorage.deleteEventSponsor(id);
      await loadSponsors();
    } catch (error) {
      console.error('Error deleting sponsor:', error);
      alert('Failed to delete sponsor');
    }
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingSponsor(null);
    setName('');
    setTier('supporter');
    setLogoUrl('');
    setLogoPreview('');
    setWebsiteUrl('');
    setDescription('');
  };

  const getTierInfo = (tier: string) => {
    const tierData: Record<string, { label: string; gradient: string; icon: string }> = {
      title: { label: 'Title Sponsor', gradient: 'from-purple-500 to-pink-500', icon: '👑' },
      platinum: { label: 'Platinum', gradient: 'from-slate-300 to-slate-400', icon: '💎' },
      gold: { label: 'Gold', gradient: 'from-yellow-400 to-yellow-600', icon: '🥇' },
      silver: { label: 'Silver', gradient: 'from-slate-400 to-slate-500', icon: '🥈' },
      bronze: { label: 'Bronze', gradient: 'from-orange-400 to-orange-600', icon: '🥉' },
      supporter: { label: 'Supporter', gradient: 'from-blue-500 to-cyan-500', icon: '⭐' }
    };
    return tierData[tier] || tierData.supporter;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-white">
            Sponsors
          </h3>
          <p className="text-sm text-slate-400 mt-1">Showcase your event partners in style</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
        >
          <Plus size={20} />
          <span className="font-semibold">Add Sponsor</span>
        </button>
      </div>

      {sponsors.length === 0 ? (
        <div className="relative overflow-hidden bg-slate-800/50 backdrop-blur-sm rounded-2xl p-16 border border-slate-700/50">
          <div className="relative text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-cyan-500/10 mb-6">
              <Trophy className="w-10 h-10 text-cyan-400" />
            </div>
            <h4 className="text-2xl font-bold text-white mb-3">No Sponsors Yet</h4>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              Start building credibility by showcasing the brands and organizations supporting your event
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 font-semibold"
            >
              <Sparkles size={20} />
              Add Your First Sponsor
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {sponsors.map((sponsor) => {
            const tierInfo = getTierInfo(sponsor.tier);
            return (
              <div
                key={sponsor.id}
                className="group relative bg-slate-800/50 backdrop-blur-sm rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl border border-slate-700/50 hover:border-slate-600 transition-all transform hover:scale-105"
              >
                {/* Tier badge */}
                <div className="absolute top-4 left-4 z-10">
                  <div className={`px-3 py-1.5 rounded-full bg-gradient-to-r ${tierInfo.gradient} text-white text-xs font-bold shadow-lg flex items-center gap-1.5`}>
                    <span>{tierInfo.icon}</span>
                    <span>{tierInfo.label}</span>
                  </div>
                </div>

                {/* Logo */}
                <div className="aspect-video bg-slate-900/30 flex items-center justify-center p-8 relative overflow-hidden">
                  {sponsor.logo_url ? (
                    <img
                      src={sponsor.logo_url}
                      alt={sponsor.name}
                      className="relative max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <Trophy className="text-slate-600" size={64} />
                  )}
                </div>

                {/* Content */}
                <div className="p-5">
                  <h4 className="font-bold text-white mb-1 text-lg truncate">{sponsor.name}</h4>
                  {sponsor.description && (
                    <p className="text-sm text-slate-400 line-clamp-2 mb-3">{sponsor.description}</p>
                  )}

                  {sponsor.website_url && (
                    <a
                      href={sponsor.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium mb-3"
                    >
                      <ExternalLink size={12} />
                      Visit Website
                    </a>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-slate-700">
                    <button
                      onClick={() => handleEdit(sponsor)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-all font-medium text-sm"
                    >
                      <Edit2 size={14} />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(sponsor.id)}
                      className="px-4 py-2.5 bg-red-900/50 hover:bg-red-900 text-red-400 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modern Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-700/50">
            {/* Header */}
            <div className="sticky top-0 bg-slate-800/80 backdrop-blur-sm p-6 flex items-center justify-between border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Trophy className="text-emerald-400" size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {editingSponsor ? 'Edit Sponsor' : 'Add New Sponsor'}
                  </h3>
                  <p className="text-slate-400 text-sm">Showcase your event partners</p>
                </div>
              </div>
              <button
                onClick={resetForm}
                className="w-8 h-8 rounded-full bg-slate-700/50 hover:bg-slate-600 flex items-center justify-center transition-colors"
              >
                <LogOut className="text-slate-300" size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Logo Upload */}
              <div>
                <label className="block text-sm font-semibold text-white mb-3">
                  Sponsor Logo *
                </label>
                <div className="relative">
                  {logoPreview ? (
                    <div className="relative bg-slate-900/30 rounded-xl p-8 border-2 border-slate-700/50">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="max-h-40 mx-auto object-contain"
                      />
                      <button
                        onClick={() => {
                          setLogoUrl('');
                          setLogoPreview('');
                        }}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                      >
                        <LogOut size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="relative block cursor-pointer">
                      <div className="border-2 border-dashed border-slate-600/50 rounded-xl p-12 text-center hover:border-emerald-500 hover:bg-emerald-500/5 transition-all">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-4">
                          {uploading ? (
                            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                          ) : (
                            <Upload className="w-8 h-8 text-emerald-400" />
                          )}
                        </div>
                        <p className="text-white font-semibold mb-1">
                          {uploading ? 'Uploading...' : 'Click to upload logo'}
                        </p>
                        <p className="text-sm text-slate-400">PNG, JPG up to 5MB</p>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    Sponsor Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    placeholder="e.g., Acme Corporation"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    Sponsorship Tier
                  </label>
                  <select
                    value={tier}
                    onChange={(e) => setTier(e.target.value as EventSponsor['tier'])}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  >
                    <option value="title">👑 Title Sponsor</option>
                    <option value="platinum">💎 Platinum</option>
                    <option value="gold">🥇 Gold</option>
                    <option value="silver">🥈 Silver</option>
                    <option value="bronze">🥉 Bronze</option>
                    <option value="supporter">⭐ Supporter</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Website URL
                </label>
                <div className="relative">
                  <ExternalLink className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    placeholder="https://sponsor-website.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none"
                  placeholder="Brief description of the sponsor and their contribution..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-slate-800/80 backdrop-blur-sm p-6 border-t border-slate-700/50 flex items-center justify-end gap-3">
              <button
                onClick={resetForm}
                className="px-6 py-3 text-slate-300 hover:bg-slate-700 rounded-lg transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!name || !logoUrl}
                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                <Check size={18} />
                {editingSponsor ? 'Update Sponsor' : 'Add Sponsor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

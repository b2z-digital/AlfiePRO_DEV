import React, { useState, useEffect } from 'react';
import { X, Share2, Copy, Check, Mail, Globe, QrCode, Loader as Loader2, Building2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import QRCode from 'qrcode';

interface ShareResultsExternalModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
}

interface ExternalOrganization {
  id: string;
  name: string;
  abbreviation: string;
  contact_email: string;
}

export const ShareResultsExternalModal: React.FC<ShareResultsExternalModalProps> = ({
  isOpen,
  onClose,
  eventId,
  eventName,
}) => {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());
  const [customEmail, setCustomEmail] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && user) {
      loadOrganizations();
      checkExistingShare();
    }
  }, [isOpen, user]);

  const loadOrganizations = async () => {
    try {
      const { data } = await supabase
        .from('external_organizations')
        .select('id, name, abbreviation, contact_email')
        .eq('user_id', user!.id)
        .order('name');

      setOrganizations(data || []);
    } catch (err) {
      console.error('Error loading organizations:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkExistingShare = async () => {
    try {
      const { data } = await supabase
        .from('shared_results')
        .select('share_token')
        .eq('event_id', eventId)
        .eq('user_id', user!.id)
        .maybeSingle();

      if (data?.share_token) {
        const link = `${window.location.origin}/results/shared/${data.share_token}`;
        setShareLink(link);
        generateQR(link);
      }
    } catch (err) {
      console.error('Error checking existing share:', err);
    }
  };

  const generateShareLink = async () => {
    setGenerating(true);
    try {
      const recipients = [
        ...Array.from(selectedOrgs).map(orgId => {
          const org = organizations.find(o => o.id === orgId);
          return org ? { type: 'organization' as const, id: org.id, name: org.name, email: org.contact_email } : null;
        }).filter(Boolean),
        ...(customEmail.trim() ? [{ type: 'email' as const, id: '', name: '', email: customEmail.trim() }] : []),
      ];

      const { data, error } = await supabase
        .from('shared_results')
        .upsert({
          user_id: user!.id,
          event_id: eventId,
          event_name: eventName,
          recipients: recipients,
        }, { onConflict: 'user_id,event_id' })
        .select('share_token')
        .single();

      if (error) throw error;

      const link = `${window.location.origin}/results/shared/${data.share_token}`;
      setShareLink(link);
      generateQR(link);
    } catch (err) {
      console.error('Error generating share link:', err);
    } finally {
      setGenerating(false);
    }
  };

  const generateQR = async (url: string) => {
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 2 });
      setQrDataUrl(dataUrl);
    } catch (err) {
      console.error('QR generation error:', err);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const toggleOrg = (id: string) => {
    setSelectedOrgs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-sky-500/20 rounded-lg flex items-center justify-center">
              <Share2 className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Share Results</h2>
              <p className="text-xs text-slate-400">{eventName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {shareLink ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Public Share Link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm"
                  />
                  <button
                    onClick={handleCopy}
                    className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {qrDataUrl && (
                <div className="flex flex-col items-center py-4">
                  <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 rounded-lg" />
                  <p className="text-xs text-slate-400 mt-2">Scan to view results</p>
                </div>
              )}

              <div className="bg-slate-700/30 rounded-lg p-3 text-xs text-slate-400">
                Anyone with this link can view the results without logging in. The link does not expire.
              </div>
            </>
          ) : (
            <>
              {organizations.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Share with Organizations (optional)
                  </label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {organizations.map(org => (
                      <label
                        key={org.id}
                        className="flex items-center gap-3 p-2.5 bg-slate-700/40 hover:bg-slate-700/60 rounded-lg cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedOrgs.has(org.id)}
                          onChange={() => toggleOrg(org.id)}
                          className="w-4 h-4 rounded border-slate-500 text-sky-500 focus:ring-sky-500 bg-slate-700"
                        />
                        <Building2 className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-white flex-1">{org.name}</span>
                        {org.abbreviation && (
                          <span className="text-xs text-slate-400">{org.abbreviation}</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Additional Email (optional)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={customEmail}
                    onChange={e => setCustomEmail(e.target.value)}
                    placeholder="recipient@example.com"
                    className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                </div>
              </div>

              <button
                onClick={generateShareLink}
                disabled={generating}
                className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Globe className="w-4 h-4" />
                )}
                Generate Public Share Link
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

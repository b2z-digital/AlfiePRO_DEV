import React, { useState, useEffect } from 'react';
import { X, Download, Copy, Share2, QrCode, Users, Bell } from 'lucide-react';
import type { LiveTrackingEvent } from '../../types/liveTracking';
import { createOrUpdateLiveTrackingEvent, getEventEngagementStats } from '../../utils/liveTrackingStorage';
import MemberSelectionModal from './MemberSelectionModal';

interface LiveTrackingQRCodeModalProps {
  eventId: string;
  eventName: string;
  clubId?: string | null;
  stateAssociationId?: string | null;
  nationalAssociationId?: string | null;
  onClose: () => void;
}

export default function LiveTrackingQRCodeModal({
  eventId,
  eventName,
  clubId,
  stateAssociationId,
  nationalAssociationId,
  onClose,
}: LiveTrackingQRCodeModalProps) {
  const [trackingEvent, setTrackingEvent] = useState<LiveTrackingEvent | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showMemberSelection, setShowMemberSelection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [stats, setStats] = useState({
    active_sessions: 0,
    total_sessions: 0,
    notifications_sent: 0,
    notification_open_rate: 0,
  });
  const [publicUrl, setPublicUrl] = useState<string>('');
  const [displayUrl, setDisplayUrl] = useState<string>('');

  useEffect(() => {
    initializeLiveTracking();
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, [eventId]);

  const getEventWebsiteDomain = async (): Promise<string | null> => {
    try {
      const { supabase } = await import('../../utils/supabase');

      // Check if this event has an event website with a custom domain or subdomain
      const { data: eventWebsite } = await supabase
        .from('event_websites')
        .select('custom_domain, subdomain, website_published')
        .eq('event_id', eventId)
        .eq('website_published', true)
        .maybeSingle();

      if (eventWebsite) {
        // Prefer custom domain over subdomain
        if (eventWebsite.custom_domain) {
          return `https://${eventWebsite.custom_domain}`;
        } else if (eventWebsite.subdomain) {
          return `https://${eventWebsite.subdomain}.alfiepro.com`;
        }
      }

      return null;
    } catch (error) {
      console.error('Error fetching event website domain:', error);
      return null;
    }
  };

  const initializeLiveTracking = async () => {
    try {
      setLoading(true);

      console.log('Creating live tracking event for:', eventId, clubId, stateAssociationId, nationalAssociationId);
      const event = await createOrUpdateLiveTrackingEvent(
        eventId,
        clubId,
        true,
        stateAssociationId,
        nationalAssociationId
      );
      if (!event) {
        console.error('Failed to create tracking event - no event returned');
        throw new Error('Failed to create tracking event');
      }

      console.log('Live tracking event created:', event);
      setTrackingEvent(event);

      const shortCode = event.short_code;
      const eventDomain = await getEventWebsiteDomain();
      const localBaseUrl = eventDomain || window.location.origin;

      const qrUrl = shortCode
        ? `${localBaseUrl}/t/${shortCode}`
        : `${localBaseUrl}/live/${event.access_token}`;

      const brandedBase = eventDomain || 'https://alfiepro.com.au';
      const brandedUrl = shortCode
        ? `${brandedBase}/t/${shortCode}`
        : qrUrl;

      setPublicUrl(qrUrl);
      setDisplayUrl(brandedUrl);

      await generateQRCode(qrUrl);
      console.log('QR code generated successfully');

      await loadStats();
    } catch (error: any) {
      console.error('Error initializing live tracking:', error);
      console.error('Error details:', {
        message: error?.message,
        stack: error?.stack,
        eventId,
        clubId,
        stateAssociationId,
        nationalAssociationId
      });
      setError(error?.message || 'Failed to initialize live tracking');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    const eventStats = await getEventEngagementStats(eventId);
    setStats(eventStats);
  };

  const generateQRCode = async (url: string) => {
    try {
      const qrCode = await import('qrcode');

      // First generate the QR code to a canvas
      const qrCanvas = document.createElement('canvas');
      await qrCode.toCanvas(qrCanvas, url, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      // Create a new canvas to add the logo
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = qrCanvas.width;
      finalCanvas.height = qrCanvas.height;
      const ctx = finalCanvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      // Draw the QR code
      ctx.drawImage(qrCanvas, 0, 0);

      // Load and draw the Alfie logo in the center
      const logo = new Image();
      await new Promise<void>((resolve, reject) => {
        logo.onload = () => resolve();
        logo.onerror = () => reject(new Error('Failed to load logo'));
        logo.src = '/alfie_app_logo.svg';
      });

      // Calculate logo size (about 13% of QR code size for better spacing)
      const logoSize = qrCanvas.width * 0.13;
      const logoX = (qrCanvas.width - logoSize) / 2;
      const logoY = (qrCanvas.height - logoSize) / 2;

      // Draw white background circle for logo with more padding
      const circlePadding = 12;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(qrCanvas.width / 2, qrCanvas.height / 2, logoSize / 2 + circlePadding, 0, 2 * Math.PI);
      ctx.fill();

      // Draw the logo
      ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

      const dataUrl = finalCanvas.toDataURL();
      console.log('QR Code data URL generated with logo, length:', dataUrl.length);
      setQrCodeDataUrl(dataUrl);
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw error;
    }
  };

  const handleCopyLink = () => {
    if (!trackingEvent || !displayUrl) return;
    navigator.clipboard.writeText(displayUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    if (!qrCodeDataUrl) return;

    const link = document.createElement('a');
    link.download = `${eventName.replace(/\s+/g, '-')}-live-tracking-qr.png`;
    link.href = qrCodeDataUrl;
    link.click();
  };

  const handleDownloadPoster = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Helper function to wrap text
    const wrapText = (text: string, maxWidth: number, fontSize: number, fontWeight: string = 'bold') => {
      ctx.font = `${fontWeight} ${fontSize}px Arial`;
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = words[0];

      for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + ' ' + word).width;
        if (width < maxWidth) {
          currentLine += ' ' + word;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }
      lines.push(currentLine);
      return lines;
    };

    // Draw event title with wrapping
    ctx.fillStyle = '#1f2937';
    ctx.textAlign = 'center';
    const titleLines = wrapText(eventName, canvas.width - 100, 72);
    let yPosition = 80;
    titleLines.forEach((line, index) => {
      ctx.font = 'bold 72px Arial';
      ctx.fillText(line, canvas.width / 2, yPosition + (index * 90));
    });

    // Adjust subsequent content position based on title lines
    const titleHeight = titleLines.length * 90;
    yPosition = 80 + titleHeight + 40;

    ctx.font = '48px Arial';
    ctx.fillStyle = '#4b5563';
    ctx.fillText('Live Skipper Tracking', canvas.width / 2, yPosition);

    const qrImage = new Image();
    qrImage.onload = () => {
      const qrSize = 600;
      const qrX = (canvas.width - qrSize) / 2;
      const qrY = yPosition + 80;
      ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

      ctx.font = 'bold 56px Arial';
      ctx.fillStyle = '#1f2937';
      ctx.fillText('Scan for Real-Time Updates', canvas.width / 2, qrY + qrSize + 100);

      ctx.font = '36px Arial';
      ctx.fillStyle = '#6b7280';
      const subtitleLines = wrapText('Follow race progress and get live results updates', canvas.width - 200, 36, 'normal');
      subtitleLines.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, qrY + qrSize + 160 + (index * 45));
      });

      const link = document.createElement('a');
      link.download = `${eventName.replace(/\s+/g, '-')}-live-tracking-poster.png`;
      link.href = canvas.toDataURL();
      link.click();
    };
    qrImage.src = qrCodeDataUrl;
  };

  const handleShare = () => {
    if (!trackingEvent || !displayUrl) return;

    if (navigator.share && /Mobile|Android|iPhone/i.test(navigator.userAgent)) {
      navigator.share({
        title: `${eventName} - Live Tracking`,
        text: 'Track race progress in real-time!',
        url: displayUrl,
      }).catch(() => {
        // If cancelled or failed, show member selection
        setShowMemberSelection(true);
      });
    } else {
      // Show member selection modal
      setShowMemberSelection(true);
    }
  };

  const handleSendNotifications = async (selectedMembers: any[]) => {
    if (!trackingEvent || !displayUrl) return;

    try {
      const { supabase } = await import('../../utils/supabase');

      const orgId = clubId || stateAssociationId || nationalAssociationId;
      if (!orgId) {
        throw new Error('No organization ID available for notifications');
      }

      const notifications = selectedMembers.map(member => ({
        user_id: member.user_id,
        club_id: clubId || null,
        state_association_id: stateAssociationId || null,
        national_association_id: nationalAssociationId || null,
        type: 'info' as const,
        title: `${eventName} - Live Tracking Available`,
        message: `Live skipper tracking is now active! Scan the QR code or visit the link to follow the race in real-time.`,
        link: displayUrl,
        read: false
      }));

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notifError) throw notifError;

      setSuccessMessage(`Successfully notified ${selectedMembers.length} member${selectedMembers.length !== 1 ? 's' : ''}!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error sending notifications:', error);
      setError('Failed to send notifications. Please try again.');
      setTimeout(() => setError(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] rounded-2xl p-8 max-w-2xl w-full border border-slate-700/50">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
          </div>
          <p className="text-center mt-4 text-slate-400">Generating QR Code...</p>
        </div>
      </div>
    );
  }

  if (error || !trackingEvent) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] rounded-2xl p-8 max-w-2xl w-full border border-slate-700/50">
          <div className="text-center">
            <div className="text-red-400 text-5xl mb-4">!</div>
            <h3 className="text-xl font-bold text-white mb-2">
              Failed to Initialize Live Tracking
            </h3>
            <p className="text-slate-400 mb-6">
              {error || 'Unable to create tracking event. Please check browser console for details.'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  initializeLiveTracking();
                }}
                className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-medium transition-all"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-xl font-medium transition-colors border border-slate-600/50"
              >
                Close
              </button>
            </div>
            <div className="mt-4 text-sm text-slate-500">
              <p>Check browser console (F12) for detailed error information</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] rounded-2xl shadow-2xl max-w-4xl w-full my-8 border border-slate-700/50 overflow-hidden animate-slideUp">
        <div className="bg-gradient-to-r from-cyan-600 via-cyan-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20 transform hover:scale-105 transition-transform">
              <QrCode className="text-white drop-shadow-lg" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">Live Skipper Tracking</h2>
              <p className="text-cyan-100 text-sm mt-0.5">{eventName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300 relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Engagement Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 backdrop-blur-sm p-4">
              <div className="flex items-center gap-2 text-cyan-400 mb-1">
                <Users size={16} />
                <span className="text-xs font-medium uppercase tracking-wider">Active Now</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.active_sessions}</p>
            </div>
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 backdrop-blur-sm p-4">
              <div className="flex items-center gap-2 text-emerald-400 mb-1">
                <Users size={16} />
                <span className="text-xs font-medium uppercase tracking-wider">Total Sessions</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.total_sessions}</p>
            </div>
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 backdrop-blur-sm p-4">
              <div className="flex items-center gap-2 text-amber-400 mb-1">
                <Bell size={16} />
                <span className="text-xs font-medium uppercase tracking-wider">Notifications</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.notifications_sent}</p>
            </div>
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 backdrop-blur-sm p-4">
              <div className="flex items-center gap-2 text-rose-400 mb-1">
                <Bell size={16} />
                <span className="text-xs font-medium uppercase tracking-wider">Open Rate</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {stats.notification_open_rate.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* QR Code Display */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-6 flex flex-col items-center min-h-[350px] justify-center">
                {qrCodeDataUrl ? (
                  <img
                    src={qrCodeDataUrl}
                    alt="QR Code"
                    className="w-full max-w-[280px] rounded-xl"
                  />
                ) : (
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-cyan-500 mx-auto mb-4"></div>
                    <p className="text-slate-400">Generating QR Code...</p>
                  </div>
                )}
                <p className="text-sm text-slate-400 text-center mt-4">
                  Skippers scan this code to start tracking
                </p>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownloadQR}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl transition-all text-sm font-medium shadow-lg shadow-cyan-500/20"
                >
                  <Download size={16} />
                  QR Code
                </button>
                <button
                  onClick={handleDownloadPoster}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl transition-all text-sm font-medium shadow-lg shadow-emerald-500/20"
                >
                  <Download size={16} />
                  Poster
                </button>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700/50 hover:bg-slate-600/50 text-slate-200 rounded-xl transition-colors text-sm font-medium border border-slate-600/50"
                >
                  <Copy size={16} />
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={handleShare}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white rounded-xl transition-all text-sm font-medium shadow-lg shadow-cyan-500/20"
                  title="Select members to notify about live tracking"
                >
                  <Share2 size={16} />
                  Notify Members
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
                  How It Works
                </h3>
                <div className="space-y-3">
                  {[
                    { num: 1, title: 'Display QR Code', desc: 'Print poster or show on screen at event venue' },
                    { num: 2, title: 'Skippers Scan', desc: 'They select their name/sail number - no app required' },
                    { num: 3, title: 'Follow Their Race', desc: 'View live updates, results, and standings on their device' },
                    { num: 4, title: 'Stay Updated', desc: 'Automatic page updates as you score each race' },
                  ].map((step) => (
                    <div key={step.num} className="flex gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center font-semibold text-sm">
                        {step.num}
                      </div>
                      <div>
                        <p className="font-medium text-white">{step.title}</p>
                        <p className="text-sm text-slate-400">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4">
                <h4 className="font-semibold text-cyan-300 text-sm mb-2">
                  Real-Time Information
                </h4>
                <ul className="text-sm text-slate-300 space-y-1">
                  <li>Live race results as they're scored</li>
                  <li>Current standings and rankings</li>
                  <li>Heat assignments (for HMS racing)</li>
                  <li>Promotion/relegation status</li>
                  <li>Individual handicap updates</li>
                  <li>Overall event leaderboard</li>
                </ul>
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                <h4 className="font-semibold text-emerald-300 text-sm mb-2">
                  Works for All Race Formats
                </h4>
                <ul className="text-sm text-slate-300 space-y-1">
                  <li>Heat Racing (HMS)</li>
                  <li>One-Fleet Scratch Racing</li>
                  <li>Handicap Racing</li>
                  <li>Series & Championships</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Public URL */}
          {trackingEvent && displayUrl && (
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 backdrop-blur-sm p-4">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Share Link
              </label>
              <div className="flex gap-2 items-center">
                <div className="flex-1 px-4 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-xl text-sm font-mono text-cyan-300 truncate select-all">
                  {displayUrl}
                </div>
                <button
                  onClick={handleCopyLink}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl transition-all text-sm font-medium shrink-0"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="absolute bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg">
            {successMessage}
          </div>
        )}
        {error && !loading && (
          <div className="absolute bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg">
            {error}
          </div>
        )}
      </div>

      {/* Member Selection Modal */}
      {showMemberSelection && trackingEvent && displayUrl && (
        <MemberSelectionModal
          clubId={clubId || undefined}
          stateAssociationId={stateAssociationId || undefined}
          nationalAssociationId={nationalAssociationId || undefined}
          eventName={eventName}
          trackingUrl={displayUrl}
          onClose={() => setShowMemberSelection(false)}
          onSend={handleSendNotifications}
        />
      )}
    </div>
  );
}

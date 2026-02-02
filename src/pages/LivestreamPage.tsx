import React, { useState, useEffect } from 'react';
import { Video, Radio, Archive, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { LivestreamControlPanel } from '../components/livestream/LivestreamControlPanel';
import { LivestreamArchiveViewer } from '../components/livestream/LivestreamArchiveViewer';

export default function LivestreamPage() {
  const { currentClub } = useAuth();
  const [activeTab, setActiveTab] = useState<'stream' | 'archives'>('stream');
  const [showBanner, setShowBanner] = useState(true);

  useEffect(() => {
    const dismissed = localStorage.getItem('livestream_banner_dismissed');
    if (dismissed === 'true') {
      setShowBanner(false);
    }
  }, []);

  const dismissBanner = () => {
    setShowBanner(false);
    localStorage.setItem('livestream_banner_dismissed', 'true');
  };

  const clubId = currentClub?.club?.id;

  if (!clubId) {
    return (
      <div className="p-6">
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-6">
          <p className="text-yellow-300">Please select a club to access livestreaming features</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Video className="w-9 h-9" />
            Livestreaming
          </h1>
          <p className="text-slate-400 mt-2">
            Broadcast your races live to YouTube with professional overlays
          </p>
        </div>
      </div>

      {showBanner && (
        <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg border border-blue-700/50 p-6 relative">
          <button
            onClick={dismissBanner}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-start gap-4 pr-8">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Radio className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Live Race Broadcasting</h3>
              <p className="text-slate-300 text-sm">
                Stream your races directly to YouTube with real-time overlays showing heat numbers, skipper info,
                standings, weather data, and sponsor banners. Perfect for engaging spectators and promoting your club!
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-800 rounded-lg border border-slate-700">
        <div className="border-b border-slate-700">
          <div className="flex gap-2 p-2">
            <button
              onClick={() => setActiveTab('stream')}
              className={`px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                activeTab === 'stream'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Video className="w-5 h-5" />
              Live Stream
            </button>
            <button
              onClick={() => setActiveTab('archives')}
              className={`px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                activeTab === 'archives'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Archive className="w-5 h-5" />
              Race Replays
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'stream' && (
            <LivestreamControlPanel clubId={clubId} />
          )}

          {activeTab === 'archives' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white mb-2">Race Replays</h2>
                <p className="text-slate-400">
                  Watch previous race broadcasts and share them with your members
                </p>
              </div>
              <LivestreamArchiveViewer clubId={clubId} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center mb-4">
            <Video className="w-5 h-5 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Mobile-First</h3>
          <p className="text-sm text-slate-400">
            Stream directly from your mobile device. No expensive equipment needed - just point and broadcast.
          </p>
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center mb-4">
            <Radio className="w-5 h-5 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Real-Time Overlays</h3>
          <p className="text-sm text-slate-400">
            Automatically display race data, heat info, standings, and weather directly on your stream.
          </p>
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <div className="w-10 h-10 bg-green-600/20 rounded-lg flex items-center justify-center mb-4">
            <Archive className="w-5 h-5 text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Auto-Archive</h3>
          <p className="text-sm text-slate-400">
            All streams are automatically saved to YouTube and linked to race results for easy replay.
          </p>
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-300 mb-3">Getting Started</h3>
        <ol className="space-y-2 text-sm text-blue-200">
          <li className="flex items-start gap-2">
            <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">1</span>
            <span>Connect your YouTube account in Settings → Integrations</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">2</span>
            <span>Create a new stream and configure your title and description</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">3</span>
            <span>Start a test stream to check your camera and audio</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">4</span>
            <span>Configure overlays and sponsor rotation (optional)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">5</span>
            <span>Hit "Go Live" when you're ready to broadcast!</span>
          </li>
        </ol>
      </div>
    </div>
  );
}

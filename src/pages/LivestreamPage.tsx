import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Video, Archive } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { LivestreamControlPanel } from '../components/livestream/LivestreamControlPanel';
import { LivestreamArchiveViewer } from '../components/livestream/LivestreamArchiveViewer';

export default function LivestreamPage() {
  const { currentClub } = useAuth();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId') || undefined;
  const [activeTab, setActiveTab] = useState<'stream' | 'archives'>('stream');

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
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
            <Video className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white leading-tight">Broadcast Studio</h1>
            <p className="text-xs text-slate-500">Live production & streaming</p>
          </div>
        </div>

        <div className="flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/50">
          <button
            onClick={() => setActiveTab('stream')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
              activeTab === 'stream'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            Studio
          </button>
          <button
            onClick={() => setActiveTab('archives')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
              activeTab === 'archives'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            Replays
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'stream' && (
          <LivestreamControlPanel clubId={clubId} sessionId={sessionId} />
        )}

        {activeTab === 'archives' && (
          <div className="p-4 sm:p-6 lg:p-8 space-y-6">
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
  );
}

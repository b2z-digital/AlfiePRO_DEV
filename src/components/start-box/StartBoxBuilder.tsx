import React, { useState } from 'react';
import { Music, ListMusic } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { StartBoxSoundLibrary } from './StartBoxSoundLibrary';
import { StartBoxSequenceEditor } from './StartBoxSequenceEditor';

interface StartBoxBuilderProps {
  darkMode: boolean;
  onBack?: () => void;
}

type BuilderTab = 'sounds' | 'sequences';

export const StartBoxBuilder: React.FC<StartBoxBuilderProps> = ({ darkMode, onBack }) => {
  const { currentClub } = useAuth();
  const [activeTab, setActiveTab] = useState<BuilderTab>('sequences');
  const [soundsVersion, setSoundsVersion] = useState(0);

  const clubId = currentClub?.clubId || null;

  const tabs: { id: BuilderTab; label: string; icon: React.ReactNode }[] = [
    { id: 'sequences', label: 'Start Sequences', icon: <ListMusic size={16} /> },
    { id: 'sounds', label: 'Sound Library', icon: <Music size={16} /> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Start System
        </h2>
        <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Configure start sequences, sounds, and countdown settings for race starts.
          System defaults are available to all clubs. Create custom sequences for your club.
        </p>
      </div>

      <div className={`flex border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? darkMode
                  ? 'border-blue-500 text-blue-400'
                  : 'border-blue-600 text-blue-600'
                : darkMode
                  ? 'border-transparent text-slate-500 hover:text-slate-300'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'sounds' && (
        <StartBoxSoundLibrary
          darkMode={darkMode}
          clubId={clubId}
          onSoundsChange={() => setSoundsVersion(v => v + 1)}
        />
      )}

      {activeTab === 'sequences' && (
        <StartBoxSequenceEditor
          darkMode={darkMode}
          clubId={clubId}
          soundsVersion={soundsVersion}
        />
      )}
    </div>
  );
};

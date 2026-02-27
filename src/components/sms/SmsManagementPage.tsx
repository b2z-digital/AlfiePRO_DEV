import React, { useState } from 'react';
import { MessageSquare, Coins, Settings, BarChart3, Send, Calendar } from 'lucide-react';
import { SmsTokenManager } from './SmsTokenManager';
import { SmsAttendanceSettings } from './SmsAttendanceSettings';
import { SmsActivityDashboard } from './SmsActivityDashboard';
import { SmsManualSend } from './SmsManualSend';

type TabId = 'dashboard' | 'settings' | 'tokens' | 'send';

interface SmsManagementPageProps {
  darkMode?: boolean;
  clubId: string;
}

export const SmsManagementPage: React.FC<SmsManagementPageProps> = ({ darkMode = true, clubId }) => {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Activity', icon: <BarChart3 size={16} /> },
    { id: 'send', label: 'Send SMS', icon: <Send size={16} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
    { id: 'tokens', label: 'Tokens', icon: <Coins size={16} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl bg-teal-500/10 ring-1 ring-teal-500/20`}>
          <MessageSquare size={22} className="text-teal-400" />
        </div>
        <div>
          <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            SMS Attendance
          </h2>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Automated event attendance notifications via SMS
          </p>
        </div>
      </div>

      <div className={`flex gap-1 p-1 rounded-xl ${darkMode ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? darkMode
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'bg-white text-slate-900 shadow-sm'
                : darkMode
                  ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && (
        <SmsActivityDashboard darkMode={darkMode} clubId={clubId} />
      )}

      {activeTab === 'send' && (
        <SmsManualSend darkMode={darkMode} clubId={clubId} />
      )}

      {activeTab === 'settings' && (
        <SmsAttendanceSettings darkMode={darkMode} clubId={clubId} />
      )}

      {activeTab === 'tokens' && (
        <SmsTokenManager darkMode={darkMode} clubId={clubId} />
      )}
    </div>
  );
};

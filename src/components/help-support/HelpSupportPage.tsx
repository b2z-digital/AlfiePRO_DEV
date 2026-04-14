import { useState } from 'react';
import {
  HelpCircle, BookOpen, Ticket, BarChart3,
} from 'lucide-react';
import FaqManagement from './FaqManagement';
import TutorialManagement from './TutorialManagement';
import TicketManagement from './TicketManagement';

interface Props {
  darkMode?: boolean;
}

type TabId = 'faqs' | 'tutorials' | 'tickets';

const tabs: { id: TabId; label: string; icon: typeof HelpCircle; description: string }[] = [
  { id: 'faqs', label: 'FAQs', icon: HelpCircle, description: 'Manage frequently asked questions' },
  { id: 'tutorials', label: 'Tutorials', icon: BookOpen, description: 'Video tutorials & guides' },
  { id: 'tickets', label: 'Support Tickets', icon: Ticket, description: 'Manage support requests' },
];

export default function HelpSupportPage({ darkMode = true }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('faqs');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 sm:p-10 lg:p-14">
        {notification && (
          <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-xl text-white text-sm font-medium transition-all duration-300 ${
            notification.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}>
            {notification.message}
          </div>
        )}

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Help & Support</h1>
              <p className="text-sm text-slate-400">Manage FAQs, tutorials, and support tickets</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-8 border-b border-slate-700/50 pb-px">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg transition-all relative ${
                  isActive
                    ? 'text-sky-400 bg-slate-800/60'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500 rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        <div>
          {activeTab === 'faqs' && (
            <FaqManagement darkMode={darkMode} onNotify={handleNotify} />
          )}
          {activeTab === 'tutorials' && (
            <TutorialManagement darkMode={darkMode} onNotify={handleNotify} />
          )}
          {activeTab === 'tickets' && (
            <TicketManagement darkMode={darkMode} onNotify={handleNotify} />
          )}
        </div>
      </div>
    </div>
  );
}

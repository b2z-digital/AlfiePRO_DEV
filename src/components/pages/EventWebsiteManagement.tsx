import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import { EventWebsitesPage } from '../../pages/EventWebsitesPage';

interface EventWebsiteManagementProps {
  darkMode: boolean;
}

export const EventWebsiteManagement: React.FC<EventWebsiteManagementProps> = ({ darkMode }) => {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
            <Globe className="text-white" size={24} />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Event Website Management
            </h1>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Manage dedicated websites for your state and national events
            </p>
          </div>
        </div>

        <EventWebsitesPage />
      </div>
    </div>
  );
};

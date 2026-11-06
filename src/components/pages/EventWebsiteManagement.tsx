import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import { EventWebsitesPage } from '../../pages/EventWebsitesPage';

interface EventWebsiteManagementProps {
  darkMode: boolean;
}

export const EventWebsiteManagement: React.FC<EventWebsiteManagementProps> = ({ darkMode }) => {
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        <div className="flex items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><Globe size={24} /></span>
          <div>
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">
              Event Websites
            </h1>
            <p className="a-mute mt-1 text-[14.5px]">
              Dedicated websites for your state and national events
            </p>
          </div>
        </div>

        <EventWebsitesPage />
      </div>
    </div>
  );
};

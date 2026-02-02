import React, { useState } from 'react';
import { DollarSign, BarChart3, Layout, Target, Image } from 'lucide-react';
import { AdvertisersTab } from './tabs/AdvertisersTab';
import { CampaignsTab } from './tabs/CampaignsTab';
import { BannersTab } from './tabs/BannersTab';
import { PlacementsTab } from './tabs/PlacementsTab';
import { AnalyticsTab } from './tabs/AnalyticsTab';

type Tab = 'advertisers' | 'campaigns' | 'banners' | 'placements' | 'analytics';

export const AdvertisingManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('analytics');

  const tabs = [
    { id: 'analytics' as Tab, label: 'Analytics', icon: BarChart3 },
    { id: 'advertisers' as Tab, label: 'Advertisers', icon: DollarSign },
    { id: 'campaigns' as Tab, label: 'Campaigns', icon: Target },
    { id: 'banners' as Tab, label: 'Banners', icon: Image },
    { id: 'placements' as Tab, label: 'Placements', icon: Layout },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'advertisers':
        return <AdvertisersTab />;
      case 'campaigns':
        return <CampaignsTab />;
      case 'banners':
        return <BannersTab />;
      case 'placements':
        return <PlacementsTab />;
      case 'analytics':
        return <AnalyticsTab />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Advertising Management
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage advertisers, campaigns, banners, and track performance
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-1 py-4 border-b-2 font-medium text-sm transition-colors
                  ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }
                `}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div>{renderTabContent()}</div>
    </div>
  );
};

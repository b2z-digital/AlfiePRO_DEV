import React, { useState, useEffect } from 'react';
import {
  Bot, FileText, MessageSquare, Database, Image,
  BookOpen, ChevronLeft, BarChart3
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getKnowledgeStats } from '../utils/alfieKnowledgeStorage';
import TuningGuidesTab from '../components/ask-alfie/TuningGuidesTab';
import CorrectionsTab from '../components/ask-alfie/CorrectionsTab';

interface AskAlfieManagementPageProps {
  darkMode: boolean;
}

type TabType = 'overview' | 'guides' | 'corrections';

export default function AskAlfieManagementPage({ darkMode }: AskAlfieManagementPageProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [stats, setStats] = useState({
    totalGuides: 0,
    activeGuides: 0,
    totalCorrections: 0,
    activeCorrections: 0,
    totalChunks: 0,
    totalImages: 0
  });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await getKnowledgeStats();
      setStats(data);
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'guides', label: 'Tuning Guides', icon: <FileText className="w-4 h-4" /> },
    { id: 'corrections', label: 'Knowledge Corrections', icon: <MessageSquare className="w-4 h-4" /> }
  ];

  const statCards = [
    {
      label: 'Tuning Guides',
      value: stats.totalGuides,
      sub: `${stats.activeGuides} active`,
      icon: <FileText className="w-5 h-5" />,
      color: 'blue',
      onClick: () => setActiveTab('guides')
    },
    {
      label: 'Knowledge Corrections',
      value: stats.totalCorrections,
      sub: `${stats.activeCorrections} active`,
      icon: <MessageSquare className="w-5 h-5" />,
      color: 'emerald',
      onClick: () => setActiveTab('corrections')
    },
    {
      label: 'Knowledge Chunks',
      value: stats.totalChunks,
      sub: 'Processed text segments',
      icon: <Database className="w-5 h-5" />,
      color: 'amber'
    },
    {
      label: 'Extracted Images',
      value: stats.totalImages,
      sub: 'From tuning guides',
      icon: <Image className="w-5 h-5" />,
      color: 'rose'
    }
  ];

  const colorMap: Record<string, { bg: string; text: string; iconBg: string }> = {
    blue: {
      bg: darkMode ? 'bg-blue-900/20 border-blue-800/30' : 'bg-blue-50 border-blue-100',
      text: darkMode ? 'text-blue-400' : 'text-blue-600',
      iconBg: darkMode ? 'bg-blue-900/40' : 'bg-blue-100'
    },
    emerald: {
      bg: darkMode ? 'bg-emerald-900/20 border-emerald-800/30' : 'bg-emerald-50 border-emerald-100',
      text: darkMode ? 'text-emerald-400' : 'text-emerald-600',
      iconBg: darkMode ? 'bg-emerald-900/40' : 'bg-emerald-100'
    },
    amber: {
      bg: darkMode ? 'bg-amber-900/20 border-amber-800/30' : 'bg-amber-50 border-amber-100',
      text: darkMode ? 'text-amber-400' : 'text-amber-600',
      iconBg: darkMode ? 'bg-amber-900/40' : 'bg-amber-100'
    },
    rose: {
      bg: darkMode ? 'bg-rose-900/20 border-rose-800/30' : 'bg-rose-50 border-rose-100',
      text: darkMode ? 'text-rose-400' : 'text-rose-600',
      iconBg: darkMode ? 'bg-rose-900/40' : 'bg-rose-100'
    }
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className={`p-2.5 rounded-xl ${darkMode ? 'bg-blue-900/30' : 'bg-blue-100'}`}>
            <Bot className={`w-6 h-6 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Ask Alfie - Knowledge Management
            </h1>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Manage tuning guides, knowledge corrections, and AI training data
            </p>
          </div>
        </div>

        <div className={`flex items-center gap-1 p-1 rounded-xl mb-6 ${
          darkMode ? 'bg-gray-800' : 'bg-gray-100'
        }`}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? (darkMode
                    ? 'bg-gray-700 text-white shadow-sm'
                    : 'bg-white text-gray-900 shadow-sm')
                  : (darkMode
                    ? 'text-gray-400 hover:text-gray-300'
                    : 'text-gray-500 hover:text-gray-700')
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map(card => {
                const colors = colorMap[card.color];
                return (
                  <button
                    key={card.label}
                    onClick={card.onClick}
                    disabled={!card.onClick}
                    className={`p-5 rounded-xl border text-left transition-all ${colors.bg} ${
                      card.onClick ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-default'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`p-2 rounded-lg ${colors.iconBg} ${colors.text}`}>
                        {card.icon}
                      </div>
                    </div>
                    <p className={`text-3xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {loadingStats ? '-' : card.value}
                    </p>
                    <p className={`text-sm font-medium ${colors.text}`}>{card.label}</p>
                    <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{card.sub}</p>
                  </button>
                );
              })}
            </div>

            <div className={`rounded-xl border p-6 ${
              darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  How Alfie's Knowledge Works
                </h2>
              </div>
              <div className={`space-y-4 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                    <h3 className={`font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Tuning Guides
                    </h3>
                    <p>Upload PDF tuning guides for specific boat classes. Each guide is processed to extract text and images,
                    which are stored as searchable knowledge chunks. When a skipper asks Alfie about rig tuning,
                    sail setup, or boat adjustments, the relevant guide content is retrieved to provide accurate answers.</p>
                  </div>
                  <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                    <h3 className={`font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Knowledge Corrections
                    </h3>
                    <p>When Alfie gives an incorrect or incomplete answer, add a correction here. Corrections are tagged
                    as high-priority knowledge and receive a relevance boost during search, ensuring they surface first
                    when a similar question is asked. Over time, this builds a curated knowledge base that makes Alfie
                    increasingly accurate for RC yacht racing.</p>
                  </div>
                </div>
                <div className={`p-4 rounded-lg border ${darkMode ? 'bg-blue-900/10 border-blue-800/30' : 'bg-blue-50 border-blue-100'}`}>
                  <p className={`font-medium ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>
                    All tuning advice follows the 1-2mm adjustment rule -- Alfie recommends small incremental adjustments
                    rather than large changes, matching the approach used by experienced RC yacht racers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'guides' && <TuningGuidesTab darkMode={darkMode} />}
        {activeTab === 'corrections' && <CorrectionsTab darkMode={darkMode} />}
      </div>
    </div>
  );
}

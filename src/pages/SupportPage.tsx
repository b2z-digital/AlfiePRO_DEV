import React, { useState, useEffect } from 'react';
import { Circle as HelpCircle, BookOpen, Search, ChevronRight, ChevronDown, MessageCircle, ExternalLink, LifeBuoy, Sparkles, Bug } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AskAlfieChatPanel } from '../components/ask-alfie/AskAlfieChatPanel';
import { BugReportModal } from '../components/bug-report/BugReportModal';
import { BugReportList } from '../components/bug-report/BugReportList';

const AlfieLogo: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg viewBox="0 0 129.34 201.37" width={size} height={size * 1.56}>
    <path fill="#0066b4" d="M92.55,0s-33.42,35.95-46.9,76.95-17.97,123.01-17.97,123.01c53.92-26.12,87.06-5.06,101.66,1.42C75.98,145.19,92.55,0,92.55,0Z"/>
    <path fill="#01a2e9" d="M45.37,35.39s-23.87,31.11-37.35,61.22c-13.48,30.11-5.9,88.18-5.9,88.18,22.19-23.87,68.8-19.1,68.8-19.1C33.86,122.72,45.37,35.39,45.37,35.39Z"/>
  </svg>
);

interface SupportPageProps {
  darkMode: boolean;
}

interface FaqCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
}

interface Faq {
  id: string;
  question: string;
  answer: string;
  category_id: string;
}

interface Tutorial {
  id: string;
  title: string;
  description: string;
  video_url: string;
  group_id: string;
}

const SupportPage: React.FC<SupportPageProps> = ({ darkMode }) => {
  const { user, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'alfie' | 'faqs' | 'tutorials' | 'bugs'>('alfie');
  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBugSubmitModal, setShowBugSubmitModal] = useState(false);
  const [bugCount, setBugCount] = useState(0);

  useEffect(() => {
    loadContent();
    loadBugCount();
  }, []);

  const loadContent = async () => {
    setLoading(true);
    const [catResult, faqResult, tutResult] = await Promise.all([
      supabase.from('support_faq_categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('support_faqs').select('*').eq('is_published', true),
      supabase.from('support_tutorials').select('*').eq('is_published', true).order('sort_order'),
    ]);
    setCategories(catResult.data || []);
    setFaqs(faqResult.data || []);
    setTutorials(tutResult.data || []);
    setLoading(false);
  };

  const loadBugCount = async () => {
    if (!user) return;
    const query = supabase
      .from('bug_reports')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']);
    if (!isSuperAdmin) {
      query.eq('reported_by', user.id);
    }
    const { count } = await query;
    setBugCount(count || 0);
  };

  const filteredFaqs = faqs.filter(faq => {
    const matchesSearch = !searchQuery ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || faq.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const formatAnswer = (answer: string) => {
    return answer.split('\n').map((line, i) => {
      if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={i} className="font-semibold mt-3 mb-1">{line.slice(2, -2)}</p>;
      }
      const boldFormatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      if (line.trim().startsWith('- ') || line.trim().match(/^\d+\./)) {
        return <li key={i} className="ml-4" dangerouslySetInnerHTML={{ __html: boldFormatted }} />;
      }
      if (!line.trim()) return <br key={i} />;
      return <p key={i} dangerouslySetInnerHTML={{ __html: boldFormatted }} />;
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 sm:p-8 lg:p-10 max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <LifeBuoy className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Support</h1>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Get help using AlfiePRO - ask Alfie or browse our guides
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-6 border-b border-slate-700/50 pb-px overflow-x-auto">
          {[
            { id: 'alfie' as const, label: 'Ask Alfie', icon: Sparkles },
            { id: 'faqs' as const, label: 'FAQs & Guides', icon: HelpCircle },
            { id: 'tutorials' as const, label: 'Video Tutorials', icon: BookOpen },
            { id: 'bugs' as const, label: 'Bug Reports', icon: Bug, badge: bugCount > 0 ? bugCount : undefined },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg transition-all relative whitespace-nowrap ${
                  isActive
                    ? darkMode ? 'text-cyan-400 bg-slate-800/60' : 'text-sky-600 bg-sky-50'
                    : darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {'badge' in tab && tab.badge && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full leading-none">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
                {isActive && (
                  <div className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-t ${darkMode ? 'bg-cyan-500' : 'bg-sky-500'}`} />
                )}
              </button>
            );
          })}
        </div>

        {activeTab === 'alfie' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className={`rounded-2xl border overflow-hidden ${
                darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
              }`} style={{ height: '600px' }}>
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-slate-800 to-slate-900 border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                      <AlfieLogo size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">Ask Alfie</h3>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[11px] text-slate-400">Your platform assistant</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ height: 'calc(100% - 52px)' }}>
                  <AskAlfieChatPanel
                    darkMode={darkMode}
                    onClose={() => {}}
                    embedded={true}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className={`p-5 rounded-xl border ${
                darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <MessageCircle size={16} className="text-cyan-400" />
                  <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    What can Alfie help with?
                  </h3>
                </div>
                <ul className={`space-y-2 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  <li className="flex items-start gap-2">
                    <ChevronRight size={12} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                    Setting up race events and series
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight size={12} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                    Managing club members and memberships
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight size={12} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                    Scoring races and entering results
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight size={12} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                    Creating event websites
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight size={12} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                    Setting up meetings and agendas
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight size={12} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                    Managing finances and invoices
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight size={12} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                    HMS heat racing setup
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight size={12} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                    Live tracking and livestreaming
                  </li>
                </ul>
              </div>

              <div className={`p-5 rounded-xl border ${
                darkMode ? 'bg-gradient-to-br from-cyan-900/20 to-blue-900/20 border-cyan-800/30' : 'bg-sky-50 border-sky-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={16} className="text-cyan-400" />
                  <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Powered by AI
                  </h3>
                </div>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Alfie is trained on AlfiePRO documentation, sailing rules, tuning guides, and platform knowledge to give you accurate, contextual answers.
                </p>
              </div>

              <button
                onClick={() => setActiveTab('faqs')}
                className={`w-full p-4 rounded-xl border text-left transition-colors ${
                  darkMode
                    ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-700/50'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HelpCircle size={16} className="text-amber-400" />
                    <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Browse FAQs
                    </span>
                  </div>
                  <ChevronRight size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                </div>
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                  {faqs.length} articles across {categories.length} {categories.length === 1 ? 'category' : 'categories'}
                </p>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'faqs' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={16} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search FAQs..."
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition-colors ${
                    darkMode
                      ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-500'
                      : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-sky-400'
                  } focus:outline-none focus:ring-2 focus:ring-cyan-500/20`}
                />
              </div>
              {categories.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      !selectedCategory
                        ? 'bg-cyan-500 text-white'
                        : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        selectedCategory === cat.id
                          ? 'bg-cyan-500 text-white'
                          : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : filteredFaqs.length === 0 ? (
              <div className="text-center py-12">
                <HelpCircle size={40} className={`mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  No FAQs found matching your search.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFaqs.map(faq => (
                  <div
                    key={faq.id}
                    className={`rounded-xl border overflow-hidden transition-colors ${
                      darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
                    }`}
                  >
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                        darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {faq.question}
                      </span>
                      {expandedFaq === faq.id ? (
                        <ChevronDown size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                      ) : (
                        <ChevronRight size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                      )}
                    </button>
                    {expandedFaq === faq.id && (
                      <div className={`px-4 pb-4 text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        <div className={`pt-3 border-t ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                          {formatAnswer(faq.answer)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tutorials' && (
          <div>
            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : tutorials.length === 0 ? (
              <div className="text-center py-16">
                <BookOpen size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Video Tutorials Coming Soon
                </h3>
                <p className={`text-sm max-w-md mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  We're working on video tutorials to help you get the most out of AlfiePRO. In the meantime, ask Alfie or check our FAQs.
                </p>
                <button
                  onClick={() => setActiveTab('alfie')}
                  className="mt-4 px-4 py-2 bg-cyan-500 text-white text-sm font-medium rounded-lg hover:bg-cyan-600 transition-colors"
                >
                  Ask Alfie Instead
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tutorials.map(tutorial => (
                  <a
                    key={tutorial.id}
                    href={tutorial.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`p-4 rounded-xl border transition-colors group ${
                      darkMode
                        ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-700/50'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {tutorial.title}
                      </h3>
                      <ExternalLink size={14} className={`flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity ${
                        darkMode ? 'text-slate-400' : 'text-slate-400'
                      }`} />
                    </div>
                    {tutorial.description && (
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {tutorial.description}
                      </p>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'bugs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Report issues or track the status of your submitted bug reports.
              </p>
              <button
                onClick={() => setShowBugSubmitModal(true)}
                className="px-4 py-2 bg-cyan-500 text-white text-sm font-medium rounded-lg hover:bg-cyan-600 transition-colors flex items-center gap-2"
              >
                <Bug size={14} />
                Report a Bug
              </button>
            </div>
            <BugReportList
              darkMode={darkMode}
              onClose={() => {}}
              onNewReport={() => setShowBugSubmitModal(true)}
              onRefresh={loadBugCount}
              embedded
            />
          </div>
        )}

        {showBugSubmitModal && (
          <BugReportModal
            darkMode={darkMode}
            onClose={() => setShowBugSubmitModal(false)}
            onSubmitted={() => {
              setShowBugSubmitModal(false);
              loadBugCount();
            }}
          />
        )}
      </div>
    </div>
  );
};

export default SupportPage;

import React, { useState, useEffect } from 'react';
import { Circle as HelpCircle, BookOpen, Search, ChevronRight, ChevronDown, MessageCircle, ExternalLink, LifeBuoy, Sparkles, Bug, Play, FolderOpen } from 'lucide-react';
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
  category_id: string;
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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
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

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const filteredFaqs = faqs.filter(faq => {
    if (!searchQuery) return true;
    return faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const faqsByCategory = categories.map(cat => ({
    category: cat,
    items: filteredFaqs.filter(faq => faq.category_id === cat.id),
  })).filter(group => group.items.length > 0);

  const uncategorizedFaqs = filteredFaqs.filter(faq => !categories.some(c => c.id === faq.category_id));

  const tutorialsByCategory = categories.map(cat => ({
    category: cat,
    items: tutorials.filter(t => t.category_id === cat.id || t.group_id === cat.id),
  })).filter(group => group.items.length > 0);

  const uncategorizedTutorials = tutorials.filter(t =>
    !categories.some(c => c.id === t.category_id || c.id === t.group_id)
  );

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
      <div className="p-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600">
            <LifeBuoy className="text-white" size={28} />
          </div>
          <div>
            <h2 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Support</h2>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Get help using AlfiePRO - ask Alfie or browse our guides
            </p>
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
              <div className={`rounded-xl border overflow-hidden ${
                darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'
              }`} style={{ height: '600px' }}>
                <div className={`flex items-center justify-between px-4 py-3 border-b ${
                  darkMode
                    ? 'bg-gradient-to-r from-slate-700/80 to-slate-800/80 border-slate-700/50'
                    : 'bg-gradient-to-r from-slate-100 to-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      darkMode ? 'bg-slate-600/50' : 'bg-white'
                    }`}>
                      <AlfieLogo size={18} />
                    </div>
                    <div>
                      <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Ask Alfie</h3>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Your platform assistant</span>
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
                darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <MessageCircle size={16} className="text-cyan-400" />
                  <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    What can Alfie help with?
                  </h3>
                </div>
                <ul className={`space-y-2 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {[
                    'Setting up race events and series',
                    'Managing club members and memberships',
                    'Scoring races and entering results',
                    'Creating event websites',
                    'Setting up meetings and agendas',
                    'Managing finances and invoices',
                    'HMS heat racing setup',
                    'Live tracking and livestreaming',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
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
                    ? 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50'
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
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search FAQs & Guides..."
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition-colors ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-500'
                    : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-sky-400'
                } focus:outline-none focus:ring-2 focus:ring-cyan-500/20`}
              />
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : faqsByCategory.length === 0 && uncategorizedFaqs.length === 0 ? (
              <div className={`text-center py-12 rounded-lg border ${
                darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'
              }`}>
                <HelpCircle size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                <h3 className={`text-lg font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {searchQuery ? 'No FAQs found matching your search' : 'No FAQs available yet'}
                </h3>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {searchQuery ? 'Try a different search term or ask Alfie directly.' : 'Check back soon for helpful guides and FAQs.'}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); setActiveTab('alfie'); }}
                    className="mt-4 px-4 py-2 bg-cyan-500 text-white text-sm font-medium rounded-lg hover:bg-cyan-600 transition-colors"
                  >
                    Ask Alfie Instead
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {faqsByCategory.map(({ category, items }) => {
                  const isExpanded = expandedCategories.has(category.id);
                  return (
                    <div
                      key={category.id}
                      className={`rounded-xl border overflow-hidden transition-all ${
                        isExpanded ? 'md:col-span-2' : ''
                      } ${
                        darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'
                      }`}
                    >
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${
                          darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            darkMode ? 'bg-cyan-500/10' : 'bg-cyan-50'
                          }`}>
                            <FolderOpen size={20} className="text-cyan-500" />
                          </div>
                          <div>
                            <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                              {category.name}
                            </h3>
                            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {items.length} {items.length === 1 ? 'article' : 'articles'}
                              {category.description ? ` - ${category.description}` : ''}
                            </p>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronDown size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                        ) : (
                          <ChevronRight size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                        )}
                      </button>

                      {isExpanded && (
                        <div className={`border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-100'}`}>
                          {items.map(faq => (
                            <div key={faq.id} className={`border-b last:border-b-0 ${
                              darkMode ? 'border-slate-700/30' : 'border-slate-100'
                            }`}>
                              <button
                                onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                                className={`w-full flex items-center justify-between px-5 py-3 text-left transition-colors ${
                                  darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'
                                }`}
                              >
                                <span className={`text-sm ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                                  {faq.question}
                                </span>
                                {expandedFaq === faq.id ? (
                                  <ChevronDown size={14} className={`flex-shrink-0 ml-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                                ) : (
                                  <ChevronRight size={14} className={`flex-shrink-0 ml-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                                )}
                              </button>
                              {expandedFaq === faq.id && (
                                <div className={`px-5 pb-4 text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                  <div className={`pt-2 border-t ${darkMode ? 'border-slate-700/30' : 'border-slate-100'}`}>
                                    {formatAnswer(faq.answer)}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {uncategorizedFaqs.length > 0 && (
                  <div className={`rounded-xl border overflow-hidden ${
                    expandedCategories.has('uncategorized') ? 'md:col-span-2' : ''
                  } ${
                    darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'
                  }`}>
                    <button
                      onClick={() => toggleCategory('uncategorized')}
                      className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${
                        darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          darkMode ? 'bg-slate-600/50' : 'bg-slate-100'
                        }`}>
                          <HelpCircle size={20} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                        </div>
                        <div>
                          <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            General
                          </h3>
                          <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {uncategorizedFaqs.length} {uncategorizedFaqs.length === 1 ? 'article' : 'articles'}
                          </p>
                        </div>
                      </div>
                      {expandedCategories.has('uncategorized') ? (
                        <ChevronDown size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                      ) : (
                        <ChevronRight size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                      )}
                    </button>

                    {expandedCategories.has('uncategorized') && (
                      <div className={`border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-100'}`}>
                        {uncategorizedFaqs.map(faq => (
                          <div key={faq.id} className={`border-b last:border-b-0 ${
                            darkMode ? 'border-slate-700/30' : 'border-slate-100'
                          }`}>
                            <button
                              onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                              className={`w-full flex items-center justify-between px-5 py-3 text-left transition-colors ${
                                darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'
                              }`}
                            >
                              <span className={`text-sm ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                                {faq.question}
                              </span>
                              {expandedFaq === faq.id ? (
                                <ChevronDown size={14} className={`flex-shrink-0 ml-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                              ) : (
                                <ChevronRight size={14} className={`flex-shrink-0 ml-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                              )}
                            </button>
                            {expandedFaq === faq.id && (
                              <div className={`px-5 pb-4 text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                <div className={`pt-2 border-t ${darkMode ? 'border-slate-700/30' : 'border-slate-100'}`}>
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
              </div>
            )}
          </div>
        )}

        {activeTab === 'tutorials' && (
          <div className="space-y-6">
            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : tutorialsByCategory.length === 0 && uncategorizedTutorials.length === 0 ? (
              <div className={`text-center py-16 rounded-lg border ${
                darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'
              }`}>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tutorialsByCategory.map(({ category, items }) => {
                  const isExpanded = expandedCategories.has(`tut-${category.id}`);
                  return (
                    <div
                      key={category.id}
                      className={`rounded-xl border overflow-hidden transition-all ${
                        isExpanded ? 'md:col-span-2' : ''
                      } ${
                        darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'
                      }`}
                    >
                      <button
                        onClick={() => toggleCategory(`tut-${category.id}`)}
                        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${
                          darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            darkMode ? 'bg-red-500/10' : 'bg-red-50'
                          }`}>
                            <Play size={20} className="text-red-500" />
                          </div>
                          <div>
                            <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                              {category.name}
                            </h3>
                            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {items.length} {items.length === 1 ? 'video' : 'videos'}
                              {category.description ? ` - ${category.description}` : ''}
                            </p>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronDown size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                        ) : (
                          <ChevronRight size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                        )}
                      </button>

                      {isExpanded && (
                        <div className={`border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-100'}`}>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                            {items.map(tutorial => (
                              <a
                                key={tutorial.id}
                                href={tutorial.video_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`p-4 rounded-lg border transition-colors group ${
                                  darkMode
                                    ? 'bg-slate-700/30 border-slate-600/50 hover:bg-slate-700/60'
                                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Play size={14} className="text-red-500 flex-shrink-0" />
                                    <h4 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                      {tutorial.title}
                                    </h4>
                                  </div>
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
                        </div>
                      )}
                    </div>
                  );
                })}

                {uncategorizedTutorials.length > 0 && (
                  <div className={`rounded-xl border overflow-hidden ${
                    expandedCategories.has('tut-uncategorized') ? 'md:col-span-2' : ''
                  } ${
                    darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'
                  }`}>
                    <button
                      onClick={() => toggleCategory('tut-uncategorized')}
                      className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${
                        darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          darkMode ? 'bg-slate-600/50' : 'bg-slate-100'
                        }`}>
                          <Play size={20} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                        </div>
                        <div>
                          <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            General
                          </h3>
                          <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {uncategorizedTutorials.length} {uncategorizedTutorials.length === 1 ? 'video' : 'videos'}
                          </p>
                        </div>
                      </div>
                      {expandedCategories.has('tut-uncategorized') ? (
                        <ChevronDown size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                      ) : (
                        <ChevronRight size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                      )}
                    </button>

                    {expandedCategories.has('tut-uncategorized') && (
                      <div className={`border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-100'}`}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                          {uncategorizedTutorials.map(tutorial => (
                            <a
                              key={tutorial.id}
                              href={tutorial.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`p-4 rounded-lg border transition-colors group ${
                                darkMode
                                  ? 'bg-slate-700/30 border-slate-600/50 hover:bg-slate-700/60'
                                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Play size={14} className="text-red-500 flex-shrink-0" />
                                  <h4 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                    {tutorial.title}
                                  </h4>
                                </div>
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
                      </div>
                    )}
                  </div>
                )}
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

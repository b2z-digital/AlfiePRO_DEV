import React, { useState, useEffect } from 'react';
import {
  Search, Sparkles, Bug, X, ArrowLeft,
  BookMarked, Video, MessageSquare, ChevronRight,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AskAlfieChatPanel } from '../components/ask-alfie/AskAlfieChatPanel';
import { BugReportModal } from '../components/bug-report/BugReportModal';
import { BugReportList } from '../components/bug-report/BugReportList';
import SupportVideoRow from '../components/support/SupportVideoRow';
import SupportFaqSection from '../components/support/SupportFaqSection';
import type { SupportFaq, SupportFaqCategory, SupportTutorial, SupportTutorialGroup } from '../types/helpSupport';

const AlfieLogo: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg viewBox="0 0 129.34 201.37" width={size} height={size * 1.56}>
    <path fill="#0066b4" d="M92.55,0s-33.42,35.95-46.9,76.95-17.97,123.01-17.97,123.01c53.92-26.12,87.06-5.06,101.66,1.42C75.98,145.19,92.55,0,92.55,0Z"/>
    <path fill="#01a2e9" d="M45.37,35.39s-23.87,31.11-37.35,61.22c-13.48,30.11-5.9,88.18-5.9,88.18,22.19-23.87,68.8-19.1,68.8-19.1C33.86,122.72,45.37,35.39,45.37,35.39Z"/>
  </svg>
);

interface SupportPageProps {
  darkMode: boolean;
}

type ActiveView = 'home' | 'faqs' | 'tutorials' | 'bugs' | 'alfie';

const TILE_IMAGES = {
  faqs: 'https://images.pexels.com/photos/3184639/pexels-photo-3184639.jpeg?auto=compress&cs=tinysrgb&w=600',
  tutorials: 'https://images.pexels.com/photos/4144923/pexels-photo-4144923.jpeg?auto=compress&cs=tinysrgb&w=600',
  bugs: 'https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?auto=compress&cs=tinysrgb&w=600',
  alfie: 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&cs=tinysrgb&w=600',
};

const SupportPage: React.FC<SupportPageProps> = ({ darkMode }) => {
  const { user, isSuperAdmin } = useAuth();
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [categories, setCategories] = useState<SupportFaqCategory[]>([]);
  const [faqs, setFaqs] = useState<SupportFaq[]>([]);
  const [tutorials, setTutorials] = useState<SupportTutorial[]>([]);
  const [groups, setGroups] = useState<SupportTutorialGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBugSubmitModal, setShowBugSubmitModal] = useState(false);
  const [bugCount, setBugCount] = useState(0);
  const [playingTutorial, setPlayingTutorial] = useState<SupportTutorial | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadContent();
    loadBugCount();
  }, []);

  const loadContent = async () => {
    setLoading(true);
    const [catResult, faqResult, tutResult, grpResult] = await Promise.all([
      supabase.from('support_faq_categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('support_faqs').select('*').eq('is_published', true),
      supabase.from('support_tutorials').select('*').eq('is_published', true).order('sort_order'),
      supabase.from('support_tutorial_groups').select('*').eq('is_active', true).order('sort_order'),
    ]);
    setCategories(catResult.data || []);
    setFaqs(faqResult.data || []);
    setTutorials(tutResult.data || []);
    setGroups(grpResult.data || []);
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

  const tutorialsByGroup = groups.map(grp => ({
    group: grp,
    items: tutorials.filter(t => t.group_id === grp.id),
  })).filter(g => g.items.length > 0);

  const uncategorizedTutorials = tutorials.filter(t =>
    !groups.some(g => g.id === t.group_id)
  );

  const filteredTutorialsByGroup = searchQuery
    ? tutorialsByGroup.map(g => ({
        ...g,
        items: g.items.filter(t =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description?.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter(g => g.items.length > 0)
    : tutorialsByGroup;

  const filteredUncategorized = searchQuery
    ? uncategorizedTutorials.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : uncategorizedTutorials;

  const firstName = (user as any)?.firstName || 'there';

  const tiles = [
    {
      id: 'faqs' as const,
      label: 'FAQs & Guides',
      icon: BookMarked,
      image: TILE_IMAGES.faqs,
      count: faqs.length,
      countLabel: 'articles',
    },
    {
      id: 'tutorials' as const,
      label: 'Video Tutorials',
      icon: Video,
      image: TILE_IMAGES.tutorials,
      count: tutorials.length,
      countLabel: 'videos',
    },
    {
      id: 'bugs' as const,
      label: 'Bug Reports',
      icon: Bug,
      image: TILE_IMAGES.bugs,
      count: bugCount,
      countLabel: 'active',
    },
    {
      id: 'alfie' as const,
      label: 'Ask Alfie',
      icon: Sparkles,
      image: TILE_IMAGES.alfie,
      count: undefined,
      countLabel: 'AI Assistant',
    },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 sm:p-8 lg:p-12 max-w-7xl mx-auto">

        {activeView === 'home' && (
          <>
            <div className="text-center mb-10">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 flex items-center justify-center">
                  <AlfieLogo size={22} />
                </div>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
                Hi {firstName}, need some help?
              </h1>
              <p className="text-slate-400 text-base max-w-lg mx-auto">
                Explore short tutorials and guides to help you master AlfiePRO.
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
              {tiles.map(tile => {
                const Icon = tile.icon;
                return (
                  <button
                    key={tile.id}
                    onClick={() => setActiveView(tile.id)}
                    className="group relative rounded-2xl overflow-hidden aspect-[4/3] text-left transition-all hover:ring-2 hover:ring-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10"
                  >
                    <img
                      src={tile.image}
                      alt={tile.label}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />
                    <div className="absolute inset-0 p-5 flex flex-col justify-end">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={16} className="text-cyan-400" />
                        {tile.count !== undefined && tile.count > 0 && (
                          <span className="text-[11px] font-medium text-cyan-400">
                            {tile.count} {tile.countLabel}
                          </span>
                        )}
                        {tile.count === undefined && (
                          <span className="text-[11px] font-medium text-cyan-400">
                            {tile.countLabel}
                          </span>
                        )}
                      </div>
                      <h3 className="text-white font-semibold text-base flex items-center gap-2">
                        {tile.label}
                        <ChevronRight size={16} className="text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
                      </h3>
                    </div>
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div className="space-y-10">
                {[1, 2].map(i => (
                  <div key={i}>
                    <div className="h-6 w-48 bg-slate-800/50 rounded mb-4 animate-pulse" />
                    <div className="flex gap-4">
                      {[1, 2, 3, 4].map(j => (
                        <div key={j} className="flex-shrink-0 w-72">
                          <div className="aspect-video rounded-xl bg-slate-800/50 animate-pulse" />
                          <div className="mt-2 h-4 w-32 bg-slate-800/50 rounded animate-pulse" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : tutorials.length === 0 ? (
              <div className="text-center py-16 rounded-2xl border bg-slate-800/30 border-slate-700/50">
                <Video size={48} className="mx-auto mb-4 text-slate-600" />
                <h3 className="text-lg font-semibold mb-2 text-white">Video Tutorials Coming Soon</h3>
                <p className="text-sm max-w-md mx-auto text-slate-400">
                  We're working on video tutorials. In the meantime, check the FAQs or ask Alfie.
                </p>
              </div>
            ) : (
              <>
                {filteredTutorialsByGroup.map(({ group, items }) => (
                  <SupportVideoRow
                    key={group.id}
                    title={group.name}
                    description={group.description}
                    tutorials={items}
                    onPlay={setPlayingTutorial}
                  />
                ))}
                {filteredUncategorized.length > 0 && (
                  <SupportVideoRow
                    title="More Tutorials"
                    tutorials={filteredUncategorized}
                    onPlay={setPlayingTutorial}
                  />
                )}
              </>
            )}
          </>
        )}

        {activeView === 'faqs' && (
          <SupportFaqSection
            categories={categories}
            faqs={faqs}
            onBack={() => setActiveView('home')}
          />
        )}

        {activeView === 'tutorials' && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setActiveView('home')}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white">Video Tutorials</h2>
                <p className="text-sm text-slate-400">
                  {tutorials.length} tutorials across {groups.length} categories
                </p>
              </div>
            </div>

            <div className="relative max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tutorials..."
                className="w-full pl-12 pr-4 py-3 rounded-xl border bg-slate-800/80 border-slate-700/50 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 text-sm"
              />
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : filteredTutorialsByGroup.length === 0 && filteredUncategorized.length === 0 ? (
              <div className="text-center py-16 rounded-2xl border bg-slate-800/30 border-slate-700/50">
                <Video size={48} className="mx-auto mb-4 text-slate-600" />
                <h3 className="text-lg font-semibold mb-2 text-white">
                  {searchQuery ? 'No tutorials found' : 'No video tutorials yet'}
                </h3>
                <p className="text-sm text-slate-400">
                  {searchQuery ? 'Try a different search term.' : 'Video tutorials will appear here once added.'}
                </p>
              </div>
            ) : (
              <>
                {filteredTutorialsByGroup.map(({ group, items }) => (
                  <SupportVideoRow
                    key={group.id}
                    title={group.name}
                    description={group.description}
                    tutorials={items}
                    onPlay={setPlayingTutorial}
                  />
                ))}
                {filteredUncategorized.length > 0 && (
                  <SupportVideoRow
                    title="More Tutorials"
                    tutorials={filteredUncategorized}
                    onPlay={setPlayingTutorial}
                  />
                )}
              </>
            )}
          </div>
        )}

        {activeView === 'bugs' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 mb-2">
              <button
                onClick={() => setActiveView('home')}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white">Bug Reports</h2>
                <p className="text-sm text-slate-400">
                  Report issues or track the status of your submitted bug reports.
                </p>
              </div>
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

        {activeView === 'alfie' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 mb-2">
              <button
                onClick={() => setActiveView('home')}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white">Ask Alfie</h2>
                <p className="text-sm text-slate-400">
                  Your AI-powered platform assistant
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <div className="rounded-xl border overflow-hidden bg-slate-800/50 border-slate-700/50" style={{ height: '600px' }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-slate-700/80 to-slate-800/80 border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-600/50">
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
                <div className="p-5 rounded-xl border bg-slate-800/50 border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare size={16} className="text-cyan-400" />
                    <h3 className="text-sm font-semibold text-white">What can Alfie help with?</h3>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-400">
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
                <div className="p-5 rounded-xl border bg-gradient-to-br from-cyan-900/20 to-blue-900/20 border-cyan-800/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={16} className="text-cyan-400" />
                    <h3 className="text-sm font-semibold text-white">Powered by AI</h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    Alfie is trained on AlfiePRO documentation, sailing rules, tuning guides, and platform knowledge to give you accurate, contextual answers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {playingTutorial && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setPlayingTutorial(null)}
        >
          <div
            className="w-full max-w-5xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${playingTutorial.youtube_video_id}?autoplay=1&rel=0&modestbranding=1`}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={playingTutorial.title}
              />
            </div>
            <div className="mt-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{playingTutorial.title}</h3>
                {playingTutorial.description && (
                  <p className="text-sm text-slate-400 mt-1 max-w-2xl">{playingTutorial.description}</p>
                )}
              </div>
              <button
                onClick={() => setPlayingTutorial(null)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0 ml-4"
              >
                <X size={20} />
              </button>
            </div>
          </div>
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
  );
};

export default SupportPage;

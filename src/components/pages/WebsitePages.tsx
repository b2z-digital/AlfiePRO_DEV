import React, { useState, useEffect } from 'react';
import { Globe, Plus, Edit, Eye, Trash2, FileText, CheckCircle2, Clock, Archive } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';
import { useNavigate } from 'react-router-dom';
import { CreatePageModal } from './CreatePageModal';

interface WebsitePagesProps {
  darkMode: boolean;
}

interface Page {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  author_id: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author?: {
    first_name: string;
    last_name: string;
  };
}

export const WebsitePages: React.FC<WebsitePagesProps> = ({ darkMode }) => {
  const { currentClub } = useAuth();
  const navigate = useNavigate();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'published' | 'archived'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (currentClub?.clubId) {
      loadPages();
    }
  }, [currentClub?.clubId]);

  const loadPages = async () => {
    try {
      setLoading(true);
      const { data: pagesData, error: pagesError } = await supabase
        .from('website_pages')
        .select('*')
        .eq('club_id', currentClub?.clubId)
        .order('created_at', { ascending: false });

      if (pagesError || !pagesData) {
        setPages([]);
        return;
      }

      // Get unique author IDs
      const authorIds = [...new Set(pagesData.map(p => p.author_id).filter(Boolean))];

      // Fetch profile data for these authors
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', authorIds);

      // Create a map of author profiles
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Combine pages with author data
      const pagesWithAuthors = pagesData.map(page => ({
        ...page,
        author: page.author_id ? profileMap.get(page.author_id) : undefined
      })) as Page[];

      setPages(pagesWithAuthors);
    } catch (err) {
      console.error('Error loading pages:', err);
    } finally {
      setLoading(false);
    }
  };

  const logActivity = async (action: string, entityId: string, entityName: string) => {
    try {
      await supabase.from('website_activity_log').insert({
        club_id: currentClub?.clubId,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        action,
        entity_type: 'page',
        entity_id: entityId,
        entity_name: entityName
      });
    } catch (err) {
      console.error('Error logging activity:', err);
    }
  };

  const handleCreatePage = async (title: string, slug: string) => {
    try {
      const { data, error } = await supabase
        .from('website_pages')
        .insert({
          club_id: currentClub?.clubId,
          title,
          slug,
          status: 'draft',
          author_id: (await supabase.auth.getUser()).data.user?.id,
          content: []
        })
        .select()
        .single();

      if (!error && data) {
        await logActivity('created', data.id, title);
        setShowCreateModal(false);
        navigate(`/website/pages/edit/${data.id}`);
      } else {
        console.error('Error creating page:', error);
        alert('Error creating page. Please try again.');
      }
    } catch (err) {
      console.error('Error creating page:', err);
      alert('Error creating page. Please try again.');
    }
  };

  const publishPage = async (page: Page) => {
    try {
      const { error } = await supabase
        .from('website_pages')
        .update({
          status: 'published',
          published_at: new Date().toISOString()
        })
        .eq('id', page.id);

      if (!error) {
        await logActivity('published', page.id, page.title);
        loadPages();
      }
    } catch (err) {
      console.error('Error publishing page:', err);
    }
  };

  const unpublishPage = async (page: Page) => {
    try {
      const { error } = await supabase
        .from('website_pages')
        .update({ status: 'draft' })
        .eq('id', page.id);

      if (!error) {
        await logActivity('unpublished', page.id, page.title);
        loadPages();
      }
    } catch (err) {
      console.error('Error unpublishing page:', err);
    }
  };

  const archivePage = async (page: Page) => {
    if (!confirm(`Are you sure you want to archive "${page.title}"?`)) return;

    try {
      const { error } = await supabase
        .from('website_pages')
        .update({ status: 'archived' })
        .eq('id', page.id);

      if (!error) {
        await logActivity('deleted', page.id, page.title);
        loadPages();
      }
    } catch (err) {
      console.error('Error archiving page:', err);
    }
  };

  const deletePage = async (page: Page) => {
    if (!confirm(`Are you sure you want to permanently delete "${page.title}"?`)) return;

    try {
      const { error } = await supabase
        .from('website_pages')
        .delete()
        .eq('id', page.id);

      if (!error) {
        loadPages();
      }
    } catch (err) {
      console.error('Error deleting page:', err);
    }
  };

  const filteredPages = pages.filter(page => {
    if (filter === 'all') return page.status !== 'archived';
    return page.status === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
            <CheckCircle2 size={12} />
            Published
          </div>
        );
      case 'draft':
        return (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
            <Clock size={12} />
            Draft
          </div>
        );
      case 'archived':
        return (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400">
            <Archive size={12} />
            Archived
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <Globe className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Pages</h1>
              <p className="text-slate-400">Manage your website pages</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={20} />
            New Page
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : darkMode
                ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('draft')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'draft'
                ? 'bg-blue-600 text-white'
                : darkMode
                ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Drafts
          </button>
          <button
            onClick={() => setFilter('published')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'published'
                ? 'bg-blue-600 text-white'
                : darkMode
                ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Published
          </button>
          <button
            onClick={() => setFilter('archived')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'archived'
                ? 'bg-blue-600 text-white'
                : darkMode
                ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Archived
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
          </div>
        ) : filteredPages.length === 0 ? (
          <div
            className={`
              p-12 rounded-xl border text-center
              ${darkMode
                ? 'bg-slate-800/30 border-slate-700/50'
                : 'bg-white/10 border-slate-200/20'}
            `}
          >
            <FileText size={48} className="text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No pages found</h3>
            <p className="text-slate-400 mb-6">
              {filter === 'all'
                ? 'Get started by creating your first page'
                : `No ${filter} pages found`}
            </p>
            {filter === 'all' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Create Your First Page
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPages.map(page => (
              <div
                key={page.id}
                className={`
                  p-6 rounded-xl border backdrop-blur-sm
                  ${darkMode
                    ? 'bg-slate-800/30 border-slate-700/50'
                    : 'bg-white/10 border-slate-200/20'}
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{page.title}</h3>
                      {getStatusBadge(page.status)}
                    </div>
                    <p className="text-sm text-slate-400 mb-1">
                      /{page.slug}
                    </p>
                    <p className="text-sm text-slate-400">
                      {page.author && `By ${page.author.first_name} ${page.author.last_name} • `}
                      {page.status === 'published' && page.published_at
                        ? `Published ${formatDate(page.published_at)}`
                        : `Updated ${formatDate(page.updated_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {page.status === 'published' && (
                      <a
                        href={`/club/${currentClub?.club?.id}/public/${page.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`
                          p-2 rounded-lg transition-colors
                          ${darkMode
                            ? 'text-slate-300 hover:bg-slate-700'
                            : 'text-slate-600 hover:bg-slate-200'}
                        `}
                        title="View page"
                      >
                        <Eye size={18} />
                      </a>
                    )}
                    <a
                      href={`/website/pages/edit/${page.id}`}
                      className={`
                        p-2 rounded-lg transition-colors
                        ${darkMode
                          ? 'text-blue-400 hover:bg-slate-700'
                          : 'text-blue-600 hover:bg-slate-200'}
                      `}
                      title="Edit page"
                    >
                      <Edit size={18} />
                    </a>
                    {page.status === 'draft' && (
                      <button
                        onClick={() => publishPage(page)}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                      >
                        Publish
                      </button>
                    )}
                    {page.status === 'published' && (
                      <button
                        onClick={() => unpublishPage(page)}
                        className="px-3 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm"
                      >
                        Unpublish
                      </button>
                    )}
                    {page.status !== 'archived' && (
                      <button
                        onClick={() => archivePage(page)}
                        className={`
                          p-2 rounded-lg transition-colors
                          ${darkMode
                            ? 'text-slate-400 hover:bg-slate-700'
                            : 'text-slate-600 hover:bg-slate-200'}
                        `}
                        title="Archive page"
                      >
                        <Archive size={18} />
                      </button>
                    )}
                    {page.status === 'archived' && (
                      <button
                        onClick={() => deletePage(page)}
                        className={`
                          p-2 rounded-lg transition-colors
                          ${darkMode
                            ? 'text-red-400 hover:bg-slate-700'
                            : 'text-red-600 hover:bg-slate-200'}
                        `}
                        title="Delete permanently"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Page Modal */}
      <CreatePageModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreatePage}
        darkMode={darkMode}
      />
    </div>
  );
};

export default WebsitePages;

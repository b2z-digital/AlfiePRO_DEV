import React, { useState, useEffect } from 'react';
import { Plus, Edit, Eye, Trash2, Home, Globe, GripVertical, FileText, CheckCircle2, Clock, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { OrganizationType, OrganizationPageLayout } from '../../types/organizationWidgets';
import {
  getOrganizationPages,
  createOrganizationPage,
  deleteOrganizationPage,
  updateOrganizationPage,
  setHomepage,
  updatePageOrder
} from '../../utils/organizationPageBuilderStorage';

interface Props {
  organizationType: OrganizationType;
  organizationId: string;
  organizationName: string;
  darkMode?: boolean;
  baseUrl?: string;
}

const OrganizationPageManager: React.FC<Props> = ({
  organizationType,
  organizationId,
  organizationName,
  darkMode = true,
  baseUrl
}) => {
  const navigate = useNavigate();
  const [pages, setPages] = useState<OrganizationPageLayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageSlug, setNewPageSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    loadPages();
  }, [organizationId]);

  const loadPages = async () => {
    setLoading(true);
    const data = await getOrganizationPages(organizationType, organizationId);
    setPages(data);
    setLoading(false);
  };

  const handleCreatePage = async () => {
    if (!newPageTitle.trim()) return;
    setCreating(true);

    const slug = newPageSlug.trim() || newPageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const existingSlug = pages.find(p => p.page_slug === slug);
    if (existingSlug) {
      alert('A page with this URL already exists');
      setCreating(false);
      return;
    }

    const newPage = await createOrganizationPage(organizationType, organizationId, {
      page_title: newPageTitle.trim(),
      page_slug: slug,
      is_published: false,
      show_in_navigation: true
    });

    if (newPage) {
      setShowCreateModal(false);
      setNewPageTitle('');
      setNewPageSlug('');
      navigate(`/website/pages/edit/${slug}`);
    }
    setCreating(false);
  };

  const handleDeletePage = async (page: OrganizationPageLayout) => {
    if (page.is_homepage) {
      alert('Cannot delete the homepage. Set another page as homepage first.');
      return;
    }
    if (!confirm(`Are you sure you want to delete "${page.page_title}"?`)) return;

    const success = await deleteOrganizationPage(page.id);
    if (success) {
      loadPages();
    }
    setMenuOpenId(null);
  };

  const handleSetHomepage = async (page: OrganizationPageLayout) => {
    const success = await setHomepage(organizationType, organizationId, page.id);
    if (success) {
      loadPages();
    }
    setMenuOpenId(null);
  };

  const handleTogglePublish = async (page: OrganizationPageLayout) => {
    await updateOrganizationPage(page.id, { is_published: !page.is_published });
    loadPages();
    setMenuOpenId(null);
  };

  const generateSlug = (title: string) => {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 lg:p-16">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600">
              <Globe className="text-white" size={28} />
            </div>
            <div>
              <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Website Pages
              </h1>
              <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                Manage your {organizationName} website pages
              </p>
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

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
          </div>
        ) : pages.length === 0 ? (
          <div className={`p-12 rounded-xl border text-center ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
            <FileText size={48} className="text-slate-500 mx-auto mb-4" />
            <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              No pages yet
            </h3>
            <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Create your first page to get started
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Create Your First Page
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {pages.map(page => (
              <div
                key={page.id}
                className={`p-4 rounded-xl border backdrop-blur-sm flex items-center gap-4 ${
                  darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'
                }`}
              >
                <GripVertical size={20} className="text-slate-500 cursor-grab" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={`font-semibold truncate ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                      {page.page_title}
                    </h3>
                    {page.is_homepage && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-400">
                        <Home size={12} />
                        Homepage
                      </span>
                    )}
                    {page.is_published ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">
                        <CheckCircle2 size={12} />
                        Published
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-400">
                        <Clock size={12} />
                        Draft
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    /{page.page_slug}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {page.is_published && baseUrl && (
                    <a
                      href={`${baseUrl}/${page.page_slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`p-2 rounded-lg transition-colors ${
                        darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                      title="View page"
                    >
                      <Eye size={18} />
                    </a>
                  )}
                  <button
                    onClick={() => navigate(`/website/pages/edit/${page.page_slug}`)}
                    className={`p-2 rounded-lg transition-colors ${
                      darkMode ? 'text-blue-400 hover:bg-slate-700' : 'text-blue-600 hover:bg-slate-100'
                    }`}
                    title="Edit page"
                  >
                    <Edit size={18} />
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpenId(menuOpenId === page.id ? null : page.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <MoreVertical size={18} />
                    </button>
                    {menuOpenId === page.id && (
                      <div className={`absolute right-0 top-full mt-1 w-48 rounded-lg shadow-xl border z-10 ${
                        darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                      }`}>
                        <button
                          onClick={() => handleTogglePublish(page)}
                          className={`w-full px-4 py-2 text-left text-sm ${
                            darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {page.is_published ? 'Unpublish' : 'Publish'}
                        </button>
                        {!page.is_homepage && (
                          <button
                            onClick={() => handleSetHomepage(page)}
                            className={`w-full px-4 py-2 text-left text-sm ${
                              darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Set as Homepage
                          </button>
                        )}
                        {!page.is_homepage && (
                          <button
                            onClick={() => handleDeletePage(page)}
                            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md rounded-xl shadow-xl ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <div className={`p-6 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Create New Page
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Page Title
                </label>
                <input
                  type="text"
                  value={newPageTitle}
                  onChange={(e) => {
                    setNewPageTitle(e.target.value);
                    if (!newPageSlug) {
                      setNewPageSlug(generateSlug(e.target.value));
                    }
                  }}
                  placeholder="e.g., About Us"
                  className={`w-full px-3 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-700 text-white border-slate-600'
                      : 'bg-white text-slate-800 border-slate-300'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  URL Slug
                </label>
                <div className="flex items-center gap-2">
                  <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>/</span>
                  <input
                    type="text"
                    value={newPageSlug}
                    onChange={(e) => setNewPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="about-us"
                    className={`flex-1 px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 text-white border-slate-600'
                        : 'bg-white text-slate-800 border-slate-300'
                    }`}
                  />
                </div>
              </div>
            </div>
            <div className={`flex justify-end gap-3 p-6 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewPageTitle('');
                  setNewPageSlug('');
                }}
                className={`px-4 py-2 rounded-lg ${
                  darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePage}
                disabled={!newPageTitle.trim() || creating}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Page'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizationPageManager;

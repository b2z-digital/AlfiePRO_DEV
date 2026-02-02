import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Eye, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';

interface WebsitePageEditorSimpleProps {
  onBack?: () => void;
}

interface PageData {
  id: string;
  title: string;
  slug: string;
  content: any[];
  status: string;
}

const WebsitePageEditorSimple: React.FC<WebsitePageEditorSimpleProps> = ({ onBack }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState('');

  useEffect(() => {
    if (id && currentClub?.clubId) {
      loadPage();
    }
  }, [id, currentClub?.clubId]);

  const loadPage = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('website_pages')
        .select('*')
        .eq('id', id)
        .eq('club_id', currentClub?.clubId)
        .single();

      if (!error && data) {
        setPage(data);
        // Extract text content if exists
        if (data.content && Array.isArray(data.content) && data.content.length > 0) {
          const firstSection = data.content[0];
          if (firstSection.columns && firstSection.columns[0]?.blocks) {
            const textBlock = firstSection.columns[0].blocks.find((b: any) => b.type === 'text');
            if (textBlock?.content?.text) {
              setContent(textBlock.content.text);
            }
          }
        }
      } else {
        console.error('Error loading page:', error);
        alert('Error loading page');
        navigate('/website/pages');
      }
    } catch (err) {
      console.error('Error loading page:', err);
      alert('Error loading page');
      navigate('/website/pages');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!page || !id) return;

    try {
      setSaving(true);

      // Create a simple content structure
      const contentStructure = [
        {
          id: 'section-1',
          type: 'regular',
          layout: 'single',
          columns: [
            {
              id: 'column-1',
              blocks: [
                {
                  id: 'block-1',
                  type: 'text',
                  content: {
                    text: content
                  }
                }
              ]
            }
          ],
          settings: {
            paddingTop: '3rem',
            paddingBottom: '3rem'
          }
        }
      ];

      const { error } = await supabase
        .from('website_pages')
        .update({
          content: contentStructure,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('club_id', currentClub?.clubId);

      if (!error) {
        // Log activity
        await supabase.from('website_activity_log').insert({
          club_id: currentClub?.clubId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          action: 'updated',
          entity_type: 'page',
          entity_id: id,
          entity_name: page.title
        });

        alert('Page saved successfully!');
      } else {
        console.error('Error saving page:', error);
        alert('Error saving page. Please try again.');
      }
    } catch (err) {
      console.error('Error saving page:', err);
      alert('Error saving page. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!page || !id) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('website_pages')
        .update({
          status: 'published',
          published_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('club_id', currentClub?.clubId);

      if (!error) {
        await supabase.from('website_activity_log').insert({
          club_id: currentClub?.clubId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          action: 'published',
          entity_type: 'page',
          entity_id: id,
          entity_name: page.title
        });

        alert('Page published successfully!');
        setPage({ ...page, status: 'published' });
      } else {
        console.error('Error publishing page:', error);
        alert('Error publishing page. Please try again.');
      }
    } catch (err) {
      console.error('Error publishing page:', err);
      alert('Error publishing page. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <p className="text-white text-xl mb-4">Page not found</p>
          <button
            onClick={() => navigate('/website/pages')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Pages
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack || (() => navigate('/website/pages'))}
            className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            Back
          </button>
          <div>
            <h1 className="text-xl font-semibold text-white">{page.title}</h1>
            <p className="text-sm text-slate-400">/{page.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {page.status === 'draft' && (
            <button
              onClick={handlePublish}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Eye size={18} />
              Publish
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Content Editor */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-slate-800 rounded-xl p-8 border border-slate-700">
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Page Content
              </label>
              <p className="text-xs text-slate-400 mb-4">
                Enter your page content. You can use basic HTML tags like &lt;h1&gt;, &lt;p&gt;, &lt;strong&gt;, etc.
              </p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="<h1>Welcome to Our Page</h1>
<p>Add your content here...</p>"
                rows={20}
                className="w-full px-4 py-3 bg-slate-700 text-white border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              />
            </div>

            <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
              <h3 className="text-sm font-medium text-slate-300 mb-3">Preview</h3>
              <div
                className="prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebsitePageEditorSimple;

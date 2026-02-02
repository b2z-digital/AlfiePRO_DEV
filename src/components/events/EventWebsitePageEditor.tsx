import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, Eye, ArrowUp, ArrowDown, Type, Image as ImageIcon, Video, Layout, Calendar, Trophy, Newspaper, Mail } from 'lucide-react';
import type { EventWebsitePage, ContentBlock } from '../../types/eventWebsite';
import { eventWebsiteStorage } from '../../utils/eventWebsiteStorage';

interface EventWebsitePageEditorProps {
  websiteId: string;
  page: EventWebsitePage | null;
  onClose: () => void;
}

export const EventWebsitePageEditor: React.FC<EventWebsitePageEditorProps> = ({
  websiteId,
  page,
  onClose
}) => {
  const [title, setTitle] = useState(page?.title || '');
  const [slug, setSlug] = useState(page?.slug || '');
  const [pageType, setPageType] = useState<EventWebsitePage['page_type']>(page?.page_type || 'custom');
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>(page?.content_blocks || []);
  const [showInNavigation, setShowInNavigation] = useState(page?.show_in_navigation ?? true);
  const [isPublished, setIsPublished] = useState(page?.is_published ?? false);
  const [saving, setSaving] = useState(false);

  const blockTypes = [
    { type: 'hero', label: 'Hero Section', icon: Layout },
    { type: 'text', label: 'Text Content', icon: Type },
    { type: 'image', label: 'Image', icon: ImageIcon },
    { type: 'video', label: 'Video', icon: Video },
    { type: 'gallery', label: 'Gallery', icon: ImageIcon },
    { type: 'countdown', label: 'Countdown', icon: Calendar },
    { type: 'sponsors', label: 'Sponsors', icon: Trophy },
    { type: 'news', label: 'News Feed', icon: Newspaper },
    { type: 'contact', label: 'Contact Form', icon: Mail }
  ];

  useEffect(() => {
    if (!slug && title) {
      const autoSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      setSlug(autoSlug);
    }
  }, [title]);

  const addBlock = (type: ContentBlock['type']) => {
    const newBlock: ContentBlock = {
      id: `block-${Date.now()}`,
      type,
      content: getDefaultContent(type),
      order: contentBlocks.length
    };
    setContentBlocks([...contentBlocks, newBlock]);
  };

  const getDefaultContent = (type: ContentBlock['type']) => {
    switch (type) {
      case 'hero':
        return {
          title: 'Welcome to Our Event',
          subtitle: 'Join us for an amazing experience',
          backgroundImage: '',
          showCountdown: true
        };
      case 'text':
        return { text: '<p>Enter your content here...</p>' };
      case 'image':
        return { url: '', alt: '', caption: '' };
      case 'video':
        return { url: '', title: '' };
      case 'gallery':
        return { images: [] };
      case 'countdown':
        return { targetDate: '', title: 'Event Starts In' };
      case 'sponsors':
        return { displayTiers: ['title', 'platinum', 'gold', 'silver', 'bronze'] };
      case 'news':
        return { limit: 3, showFeatured: true };
      case 'contact':
        return { email: '', showMap: true };
      default:
        return {};
    }
  };

  const updateBlock = (index: number, updates: Partial<ContentBlock>) => {
    const updated = [...contentBlocks];
    updated[index] = { ...updated[index], ...updates };
    setContentBlocks(updated);
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const newBlocks = [...contentBlocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newBlocks.length) return;

    [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
    newBlocks.forEach((block, i) => block.order = i);
    setContentBlocks(newBlocks);
  };

  const deleteBlock = (index: number) => {
    setContentBlocks(contentBlocks.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!title || !slug) {
      alert('Please enter a title and slug');
      return;
    }

    try {
      setSaving(true);
      const pageData: Partial<EventWebsitePage> = {
        event_website_id: websiteId,
        title,
        slug,
        page_type: pageType,
        content_blocks: contentBlocks,
        show_in_navigation: showInNavigation,
        is_published: isPublished,
        navigation_order: 0
      };

      if (page) {
        await eventWebsiteStorage.updateEventWebsitePage(page.id, pageData);
      } else {
        await eventWebsiteStorage.createEventWebsitePage(pageData);
      }

      onClose();
    } catch (error) {
      console.error('Error saving page:', error);
      alert('Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-white">
            {page ? 'Edit Page' : 'Create New Page'}
          </h3>
          <p className="text-sm text-slate-400 mt-1">Build your page with content blocks</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Page'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Page Settings */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 sticky top-0">
              <h4 className="font-semibold text-white mb-4">Page Settings</h4>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Page Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="About Us"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    URL Slug
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="about-us"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Page Type
                  </label>
                  <select
                    value={pageType}
                    onChange={(e) => setPageType(e.target.value as EventWebsitePage['page_type'])}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  >
                    <option value="home">Home</option>
                    <option value="about">About</option>
                    <option value="schedule">Schedule</option>
                    <option value="results">Results</option>
                    <option value="media">Media</option>
                    <option value="sponsors">Sponsors</option>
                    <option value="competitors">Competitors</option>
                    <option value="news">News</option>
                    <option value="contact">Contact</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showInNavigation}
                    onChange={(e) => setShowInNavigation(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 text-purple-600"
                  />
                  <span className="text-sm text-slate-300">Show in navigation</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 text-purple-600"
                  />
                  <span className="text-sm text-slate-300">Publish page</span>
                </label>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-700">
                <h5 className="font-semibold text-white mb-3 text-sm">Add Content Block</h5>
                <div className="grid grid-cols-2 gap-2">
                  {blockTypes.map((blockType) => {
                    const Icon = blockType.icon;
                    return (
                      <button
                        key={blockType.type}
                        onClick={() => addBlock(blockType.type as ContentBlock['type'])}
                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors border border-slate-700 hover:border-purple-500"
                      >
                        <Icon size={16} className="text-purple-400 mb-1" />
                        <div className="text-xs text-slate-300">{blockType.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Content Blocks */}
          <div className="lg:col-span-2 space-y-4">
            {contentBlocks.length === 0 ? (
              <div className="bg-slate-900/50 rounded-lg p-12 border border-slate-700 text-center">
                <Plus className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                <h4 className="text-lg font-semibold text-white mb-2">No Content Yet</h4>
                <p className="text-slate-400">
                  Add content blocks from the left panel to start building your page
                </p>
              </div>
            ) : (
              contentBlocks.map((block, index) => {
                const BlockIcon = blockTypes.find(bt => bt.type === block.type)?.icon || Layout;
                return (
                  <div
                    key={block.id}
                    className="bg-slate-900/50 rounded-lg p-4 border border-slate-700"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <BlockIcon size={18} className="text-purple-400" />
                        <span className="font-medium text-white capitalize">{block.type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => moveBlock(index, 'up')}
                          disabled={index === 0}
                          className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed text-slate-400"
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          onClick={() => moveBlock(index, 'down')}
                          disabled={index === contentBlocks.length - 1}
                          className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed text-slate-400"
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          onClick={() => deleteBlock(index)}
                          className="p-1 hover:bg-red-900 rounded text-red-400"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Block-specific content editors */}
                    {block.type === 'text' && (
                      <textarea
                        value={block.content.text || ''}
                        onChange={(e) => updateBlock(index, { content: { text: e.target.value } })}
                        rows={4}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white resize-none"
                        placeholder="Enter your text content..."
                      />
                    )}

                    {block.type === 'hero' && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={block.content.title || ''}
                          onChange={(e) => updateBlock(index, { content: { ...block.content, title: e.target.value } })}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                          placeholder="Hero Title"
                        />
                        <input
                          type="text"
                          value={block.content.subtitle || ''}
                          onChange={(e) => updateBlock(index, { content: { ...block.content, subtitle: e.target.value } })}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                          placeholder="Hero Subtitle"
                        />
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={block.content.showCountdown || false}
                            onChange={(e) => updateBlock(index, { content: { ...block.content, showCountdown: e.target.checked } })}
                            className="w-4 h-4 rounded border-slate-600 text-purple-600"
                          />
                          <span className="text-sm text-slate-300">Show countdown timer</span>
                        </label>
                      </div>
                    )}

                    {block.type === 'image' && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={block.content.url || ''}
                          onChange={(e) => updateBlock(index, { content: { ...block.content, url: e.target.value } })}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                          placeholder="Image URL"
                        />
                        <input
                          type="text"
                          value={block.content.caption || ''}
                          onChange={(e) => updateBlock(index, { content: { ...block.content, caption: e.target.value } })}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                          placeholder="Image Caption"
                        />
                      </div>
                    )}

                    {(block.type === 'sponsors' || block.type === 'news' || block.type === 'gallery') && (
                      <div className="text-sm text-slate-400 italic">
                        This block will automatically display your {block.type} content
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Eye, EyeOff, Loader2, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EventWebsitePage } from '../../types/eventWebsite';
import { eventWebsiteStorage } from '../../utils/eventWebsiteStorage';
import { EventPageBuilderInline } from './EventPageBuilderInline';
import { CreatePageModal } from './CreatePageModal';
import { supabase } from '../../utils/supabase';

interface EventWebsitePageManagerProps {
  websiteId: string;
}

interface SortablePageItemProps {
  page: EventWebsitePage;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
  getPageTypeColor: (type: string) => string;
}

const SortablePageItem: React.FC<SortablePageItemProps> = ({
  page,
  onEdit,
  onDelete,
  onTogglePublish,
  getPageTypeColor
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group bg-slate-800/40 rounded-lg border border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600/50 transition-all ${isDragging ? 'shadow-lg ring-2 ring-cyan-500/50' : ''}`}
    >
      <div className="flex items-start gap-4 p-4">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing pt-1">
          <GripVertical size={18} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-base font-semibold text-white mb-1.5">{page.title}</h4>
          <p className="text-sm text-slate-400 mb-3">
            /{page.slug} • {page.content_blocks.length} content blocks
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${getPageTypeColor(page.page_type)}`}>
              {page.page_type}
            </span>
            {!page.is_published && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50">
                Draft
              </span>
            )}
            {page.show_in_navigation && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-600/30">
                In Nav
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onTogglePublish}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors font-medium text-sm ${
              page.is_published
                ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                : 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 border border-amber-600/30'
            }`}
            title={page.is_published ? 'Unpublish page' : 'Click to publish page'}
          >
            {page.is_published ? <Eye size={16} /> : <EyeOff size={16} />}
            <span className="hidden sm:inline">
              {page.is_published ? 'Published' : 'Publish'}
            </span>
          </button>
          <button
            onClick={onEdit}
            className="p-2 bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors"
            title="Edit page"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 rounded-lg transition-colors"
            title="Delete page"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export const EventWebsitePageManager: React.FC<EventWebsitePageManagerProps> = ({ websiteId }) => {
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<EventWebsitePage[]>([]);
  const [editingPage, setEditingPage] = useState<EventWebsitePage | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  useEffect(() => {
    loadPages();
  }, [websiteId]);

  const loadPages = async () => {
    try {
      setLoading(true);
      const pagesData = await eventWebsiteStorage.getEventWebsitePages(websiteId);
      setPages(pagesData);
    } catch (error) {
      console.error('Error loading pages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePage = () => {
    setShowCreateModal(true);
  };

  const handlePageCreated = (newPage: EventWebsitePage) => {
    setShowCreateModal(false);
    setEditingPage(newPage);
    setShowEditor(true);
    loadPages();
  };

  const handleEditPage = (page: EventWebsitePage) => {
    setEditingPage(page);
    setShowEditor(true);
  };

  const handleDeletePage = async (pageId: string) => {
    if (!confirm('Are you sure you want to delete this page?')) return;

    try {
      await eventWebsiteStorage.deleteEventWebsitePage(pageId);
      await loadPages();
    } catch (error) {
      console.error('Error deleting page:', error);
      alert('Failed to delete page');
    }
  };

  const handleTogglePublish = async (page: EventWebsitePage) => {
    try {
      // Update event_page_layouts table directly
      const { error } = await supabase
        .from('event_page_layouts')
        .update({ is_published: !page.is_published })
        .eq('id', page.id);

      if (error) throw error;
      await loadPages();
    } catch (error) {
      console.error('Error updating page:', error);
    }
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = pages.findIndex(p => p.id === active.id);
    const newIndex = pages.findIndex(p => p.id === over.id);

    const newPages = arrayMove(pages, oldIndex, newIndex);
    setPages(newPages);

    try {
      // Update event_page_layouts table directly
      await Promise.all(
        newPages.map((page, index) =>
          supabase
            .from('event_page_layouts')
            .update({ navigation_order: index })
            .eq('id', page.id)
        )
      );
    } catch (error) {
      console.error('Error updating page order:', error);
      await loadPages();
    }
  };

  const getPageTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      home: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
      about: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
      schedule: 'bg-green-600/20 text-green-400 border-green-600/30',
      results: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
      media: 'bg-pink-600/20 text-pink-400 border-pink-600/30',
      sponsors: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
      competitors: 'bg-cyan-600/20 text-cyan-400 border-cyan-600/30',
      news: 'bg-red-600/20 text-red-400 border-red-600/30',
      contact: 'bg-indigo-600/20 text-indigo-400 border-indigo-600/30',
      custom: 'bg-slate-600/20 text-slate-400 border-slate-600/30'
    };
    return colors[type] || colors.custom;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (showEditor && editingPage) {
    return (
      <EventPageBuilderInline
        websiteId={websiteId}
        pageSlug={editingPage.slug}
        pageTitle={editingPage.title}
        darkMode={true}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">Pages</h3>
          <p className="text-sm text-slate-400 mt-1">Manage your event website pages</p>
        </div>
        <button
          onClick={handleCreatePage}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus size={18} />
          New Page
        </button>
      </div>

      {pages.some(p => !p.is_published && p.show_in_navigation) && (
        <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <Eye className="text-amber-400" size={20} />
            </div>
            <div>
              <h4 className="font-medium text-amber-400 mb-1">Pages not visible in navigation</h4>
              <p className="text-sm text-slate-300">
                Some pages are marked "In Nav" but not published. Click the "Publish" button on each page to make them visible in your website's navigation menu.
              </p>
            </div>
          </div>
        </div>
      )}

      {pages.length === 0 ? (
        <div className="bg-slate-900/50 rounded-lg p-12 border border-slate-700 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="text-slate-400" size={32} />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No Pages Yet</h3>
            <p className="text-slate-400 mb-6">
              Create your first page to start building your event website
            </p>
            <button
              onClick={handleCreatePage}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Create First Page
            </button>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={pages.map(p => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {pages.map((page) => (
                <SortablePageItem
                  key={page.id}
                  page={page}
                  onEdit={() => handleEditPage(page)}
                  onDelete={() => handleDeletePage(page.id)}
                  onTogglePublish={() => handleTogglePublish(page)}
                  getPageTypeColor={getPageTypeColor}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Create Page Modal */}
      {showCreateModal && (
        <CreatePageModal
          websiteId={websiteId}
          onSave={handlePageCreated}
          onClose={() => setShowCreateModal(false)}
          darkMode={true}
        />
      )}
    </div>
  );
};

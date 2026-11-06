import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Eye, EyeOff, Loader2, GripVertical , Menu, FileText } from 'lucide-react';
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
      className={`a-pg group ${isDragging ? 'a-pg-drag' : ''}`}
    >
        <div {...attributes} {...listeners} className="a-dim flex cursor-grab active:cursor-grabbing" aria-label="Drag to reorder">
          <GripVertical size={18} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="a-ink text-[15px] font-semibold">{page.title}</span>
            <span className="a-lb-fmt" style={{ height: 22, fontSize: 11.5 }}><span className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: ({ home: '#8A4DFF', about: '#2E7BFF', schedule: '#30D158', results: '#FFB340', media: '#FF3E9A', sponsors: '#FF8A2B', competitors: '#40C8C0', news: '#FF6B6B', contact: '#7A5AF8', custom: '#9AA6BD' } as Record<string, string>)[page.page_type] || '#9AA6BD' }} />{page.page_type}</span>
          </div>
          <div className="a-dim a-mono mt-1">/{page.slug} · {page.content_blocks.length} block{page.content_blocks.length !== 1 ? 's' : ''}</div>
        </div>

        <div className="flex items-center gap-3.5">
          {page.show_in_navigation ? (
            <span className={`a-st text-[12.5px] ${page.is_published ? '' : 'a-txt-a'}`}><Menu size={14} />In menu</span>
          ) : (
            <span className="a-dim text-[12.5px]">Not in menu</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="a-dim text-[12.5px] hidden sm:inline">{page.is_published ? 'Published' : 'Draft'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={page.is_published}
            aria-label={page.is_published ? 'Unpublish page' : 'Publish page'}
            onClick={onTogglePublish}
            className="a-sw"
            title={page.is_published ? 'Unpublish page' : 'Click to publish page'}
          />
          <button
            onClick={onEdit}
            className="a-ib"
            title="Edit page"
            aria-label="Edit page"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={onDelete}
            className="a-ib a-ib-d"
            title="Delete page"
            aria-label="Delete page"
          >
            <Trash2 size={16} />
          </button>
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="a-display a-ink m-0 text-[22px] font-semibold">Pages</h2>
          <p className="a-mute mt-1 text-[14px]">Drag to reorder. The menu follows this order.</p>
        </div>
        <button
          onClick={handleCreatePage}
          className="a-btn a-btn-p"
          style={{ height: 42, borderRadius: 13 }}
        >
          <Plus size={17} />
          New page
        </button>
      </div>

      {pages.some(p => !p.is_published && p.show_in_navigation) && (
        <div className="a-banner-a">
          <Eye className="a-txt-a flex-shrink-0" size={18} />
          <span className="a-mute flex-1 text-[13px]">
            <b className="a-txt-a font-semibold">{pages.filter(p => !p.is_published && p.show_in_navigation).length === 1 ? '1 page is' : `${pages.filter(p => !p.is_published && p.show_in_navigation).length} pages are`} in the menu but still a draft.</b> Publish {pages.filter(p => !p.is_published && p.show_in_navigation).length === 1 ? 'it' : 'them'} to show {pages.filter(p => !p.is_published && p.show_in_navigation).length === 1 ? 'it' : 'them'} on the website.
          </span>
        </div>
      )}

      {pages.length === 0 ? (
        <div className="a-card a-empty p-12 text-center">
          <div className="max-w-md mx-auto">
            <span className="a-tile mx-auto mb-3" style={{ width: 48, height: 48 }}><FileText size={22} /></span>
            <h3 className="a-ink text-[16px] font-semibold mb-1">No pages yet</h3>
            <p className="a-dim text-[13.5px] mb-5">
              Create your first page to start building your event website
            </p>
            <button
              onClick={handleCreatePage}
              className="a-btn a-btn-p"
            >
              <Plus size={16} />Create first page
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
            <div className="a-card overflow-hidden">
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

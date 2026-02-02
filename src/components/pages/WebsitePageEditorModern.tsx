import React, { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeft, Eye, Save, Undo, Redo, Monitor, Tablet,
  Smartphone, Settings, Copy, Trash2,
  GripVertical, Plus, Layers, Layout, X
} from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
// TODO: These imports are temporarily commented out until components are created
// import BlockLibrary from './WebsitePageEditor/BlockLibrary';
// import PropertiesPanel from './WebsitePageEditor/PropertiesPanel';
// import BlockTemplates from './WebsitePageEditor/BlockTemplates';
// import GlobalStylesPanel from './WebsitePageEditor/GlobalStylesPanel';
// import SectionSettingsPanel from './WebsitePageEditor/SectionSettingsPanel';
// import SectionTemplatesModal from './WebsitePageEditor/SectionTemplatesModal';
import { supabase } from '../../utils/supabase';
import { useRaceCalendar, useLatestArticles, useLatestMedia } from '../../hooks/usePageBuilderData';

interface ContentBlock {
  id: string;
  type: string;
  content: any;
  style?: any;
  spacing?: any;
  visibility?: any;
  className?: string;
  elementId?: string;
}

interface Column {
  id: string;
  blocks: ContentBlock[];
  width?: string; // e.g., '50%', '33.33%', '66.66%'
  settings?: {
    backgroundColor?: string;
    paddingTop?: string;
    paddingRight?: string;
    paddingBottom?: string;
    paddingLeft?: string;
  };
}

interface Section {
  id: string;
  type: 'regular' | 'full-width' | 'hero' | 'two-column' | 'three-column';
  layout?: 'single' | 'two-equal' | 'three-equal' | 'two-thirds-left' | 'two-thirds-right' | 'four-equal';
  columns: Column[];
  settings: any;
}

interface Page {
  id: string;
  title: string;
  slug: string;
  sections: Section[];
}

interface WebsitePageEditorModernProps {
  onBack?: () => void;
}

const WebsitePageEditorModern: React.FC<WebsitePageEditorModernProps> = ({ onBack }) => {
  const [page, setPage] = useState<Page>({
    id: '1',
    title: 'Homepage',
    slug: 'home',
    sections: [
      {
        id: 'section-1',
        type: 'hero',
        layout: 'single',
        columns: [
          {
            id: 'column-1',
            blocks: [
              {
                id: 'block-1',
                type: 'text',
                content: {
                  text: '<h1>Welcome to Our Club</h1><p>Join us for exciting events and races throughout the year</p>'
                }
              }
            ]
          }
        ],
        settings: {
          backgroundColor: '#1e40af',
          backgroundImage: 'https://images.pexels.com/photos/416978/pexels-photo-416978.jpeg?auto=compress&cs=tinysrgb&w=1600',
          paddingTop: '6rem',
          paddingBottom: '6rem'
        }
      }
    ]
  });

  const [history, setHistory] = useState<Page[]>([page]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState<ContentBlock | null>(null);
  const [showProperties, setShowProperties] = useState(false);
  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showGlobalStyles, setShowGlobalStyles] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [showSectionSettings, setShowSectionSettings] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [showSectionTemplates, setShowSectionTemplates] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Auto-save effect
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      savePage();
    }, 30000); // Auto-save every 30 seconds

    return () => clearInterval(autoSaveInterval);
  }, [page]);

  const savePage = async () => {
    setIsSaving(true);
    try {
      // Here you would save to Supabase
      // For now, just simulate a save
      await new Promise(resolve => setTimeout(resolve, 500));
      setLastSaved(new Date());
    } catch (error) {
      console.error('Error saving page:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const addToHistory = useCallback((newPage: Page) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newPage);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setPage(newPage);
  }, [history, historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setPage(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setPage(history[historyIndex + 1]);
    }
  };

  const addBlock = useCallback((sectionId: string, blockType: string, columnId?: string) => {
    const newBlock: ContentBlock = {
      id: `block-${Date.now()}`,
      type: blockType,
      content: getDefaultContentForType(blockType),
      style: {},
      spacing: {},
      visibility: { desktop: true, tablet: true, mobile: true }
    };

    const newPage = {
      ...page,
      sections: page.sections.map(section => {
        if (section.id === sectionId) {
          return {
            ...section,
            columns: section.columns.map((column, index) => {
              // If columnId specified, add to that column; otherwise add to first column
              const shouldAddToThisColumn = columnId ? column.id === columnId : index === 0;
              return shouldAddToThisColumn
                ? { ...column, blocks: [...column.blocks, newBlock] }
                : column;
            })
          };
        }
        return section;
      })
    };

    addToHistory(newPage);
  }, [page, addToHistory]);

  const updateBlock = useCallback((blockId: string, updates: Partial<ContentBlock>) => {
    const newPage = {
      ...page,
      sections: page.sections.map(section => ({
        ...section,
        columns: section.columns.map(column => ({
          ...column,
          blocks: column.blocks.map(block =>
            block.id === blockId ? { ...block, ...updates } : block
          )
        }))
      }))
    };

    addToHistory(newPage);

    if (selectedBlock && selectedBlock.id === blockId) {
      setSelectedBlock({ ...selectedBlock, ...updates });
    }
  }, [page, selectedBlock, addToHistory]);

  const deleteBlock = useCallback((blockId: string) => {
    const newPage = {
      ...page,
      sections: page.sections.map(section => ({
        ...section,
        columns: section.columns.map(column => ({
          ...column,
          blocks: column.blocks.filter(block => block.id !== blockId)
        }))
      }))
    };

    addToHistory(newPage);
    if (selectedBlock?.id === blockId) {
      setSelectedBlock(null);
      setShowProperties(false);
    }
  }, [page, selectedBlock, addToHistory]);

  const duplicateBlock = useCallback((blockId: string) => {
    let blockToDuplicate: ContentBlock | null = null;
    let targetSectionId: string | null = null;
    let targetColumnId: string | null = null;

    page.sections.forEach(section => {
      section.columns.forEach(column => {
        const block = column.blocks.find(b => b.id === blockId);
        if (block) {
          blockToDuplicate = block;
          targetSectionId = section.id;
          targetColumnId = column.id;
        }
      });
    });

    if (blockToDuplicate && targetSectionId && targetColumnId) {
      const newBlock = {
        ...blockToDuplicate,
        id: `block-${Date.now()}`
      };

      const newPage = {
        ...page,
        sections: page.sections.map(section =>
          section.id === targetSectionId
            ? {
                ...section,
                columns: section.columns.map(column =>
                  column.id === targetColumnId
                    ? { ...column, blocks: [...column.blocks, newBlock] }
                    : column
                )
              }
            : section
        )
      };

      addToHistory(newPage);
    }
  }, [page, addToHistory]);

  const createColumnsForLayout = (layout: string): Column[] => {
    const baseColumn = (id: string, width?: string): Column => ({
      id,
      blocks: [],
      width,
      settings: {}
    });

    switch (layout) {
      case 'two-equal':
        return [
          baseColumn(`column-${Date.now()}-1`, '50%'),
          baseColumn(`column-${Date.now()}-2`, '50%')
        ];
      case 'three-equal':
        return [
          baseColumn(`column-${Date.now()}-1`, '33.33%'),
          baseColumn(`column-${Date.now()}-2`, '33.33%'),
          baseColumn(`column-${Date.now()}-3`, '33.33%')
        ];
      case 'two-thirds-left':
        return [
          baseColumn(`column-${Date.now()}-1`, '66.66%'),
          baseColumn(`column-${Date.now()}-2`, '33.33%')
        ];
      case 'two-thirds-right':
        return [
          baseColumn(`column-${Date.now()}-1`, '33.33%'),
          baseColumn(`column-${Date.now()}-2`, '66.66%')
        ];
      case 'four-equal':
        return [
          baseColumn(`column-${Date.now()}-1`, '25%'),
          baseColumn(`column-${Date.now()}-2`, '25%'),
          baseColumn(`column-${Date.now()}-3`, '25%'),
          baseColumn(`column-${Date.now()}-4`, '25%')
        ];
      case 'single':
      default:
        return [baseColumn(`column-${Date.now()}-1`, '100%')];
    }
  };

  const addSection = useCallback((layout: string = 'single') => {
    const newSection: Section = {
      id: `section-${Date.now()}`,
      type: 'regular',
      layout: layout as any,
      columns: createColumnsForLayout(layout),
      settings: {
        paddingTop: '4rem',
        paddingBottom: '4rem'
      }
    };

    addToHistory({
      ...page,
      sections: [...page.sections, newSection]
    });

    // Set the new section as active
    setActiveSectionId(newSection.id);
  }, [page, addToHistory]);

  const updateSection = useCallback((sectionId: string, updates: Partial<Section>) => {
    const newPage = {
      ...page,
      sections: page.sections.map(section =>
        section.id === sectionId ? { ...section, ...updates } : section
      )
    };
    addToHistory(newPage);

    if (selectedSection && selectedSection.id === sectionId) {
      setSelectedSection({ ...selectedSection, ...updates });
    }
  }, [page, selectedSection, addToHistory]);

  const deleteSection = useCallback((sectionId: string) => {
    const newPage = {
      ...page,
      sections: page.sections.filter(section => section.id !== sectionId)
    };
    addToHistory(newPage);

    if (selectedSection?.id === sectionId) {
      setSelectedSection(null);
      setShowSectionSettings(false);
    }
  }, [page, selectedSection, addToHistory]);

  const applyTemplate = useCallback((template: any) => {
    const newSections = template.sections.map((section: any) => ({
      ...section,
      id: `section-${Date.now()}-${Math.random()}`,
      blocks: section.blocks.map((block: any) => ({
        ...block,
        id: `block-${Date.now()}-${Math.random()}`,
        style: {},
        spacing: {},
        visibility: { desktop: true, tablet: true, mobile: true }
      }))
    }));

    addToHistory({
      ...page,
      sections: [...page.sections, ...newSections]
    });
  }, [page, addToHistory]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      // Check if we're dragging sections
      const sectionIds = page.sections.map(s => s.id);
      if (sectionIds.includes(active.id as string) && sectionIds.includes(over.id as string)) {
        const oldIndex = sectionIds.indexOf(active.id as string);
        const newIndex = sectionIds.indexOf(over.id as string);

        const newSections = arrayMove(page.sections, oldIndex, newIndex);

        addToHistory({
          ...page,
          sections: newSections
        });
        return;
      }

      // Otherwise, handle block reordering within a column
      page.sections.forEach(section => {
        section.columns.forEach(column => {
          const blockIds = column.blocks.map(b => b.id);
          if (blockIds.includes(active.id as string) && blockIds.includes(over.id as string)) {
            const oldIndex = blockIds.indexOf(active.id as string);
            const newIndex = blockIds.indexOf(over.id as string);

            const newBlocks = arrayMove(column.blocks, oldIndex, newIndex);

            const newPage = {
              ...page,
              sections: page.sections.map(s =>
                s.id === section.id
                  ? {
                      ...s,
                      columns: s.columns.map(c =>
                        c.id === column.id ? { ...c, blocks: newBlocks } : c
                      )
                    }
                  : s
              )
            };

            addToHistory(newPage);
          }
        });
      });
    }
  };

  const getViewportWidth = () => {
    switch (viewportMode) {
      case 'tablet': return 'max-w-[768px]';
      case 'mobile': return 'max-w-[375px]';
      default: return 'w-full';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="flex-none border-b border-slate-700 bg-slate-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-medium text-white">Edit: {page.title}</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={undo}
              disabled={historyIndex === 0}
              className="p-2 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300"
            >
              <Undo size={18} />
            </button>
            <button
              onClick={redo}
              disabled={historyIndex === history.length - 1}
              className="p-2 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300"
            >
              <Redo size={18} />
            </button>

            <div className="h-6 w-px bg-slate-700 mx-2" />

            <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1">
              <button
                onClick={() => setViewportMode('desktop')}
                className={`p-1.5 rounded transition-colors ${
                  viewportMode === 'desktop' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Monitor size={16} />
              </button>
              <button
                onClick={() => setViewportMode('tablet')}
                className={`p-1.5 rounded transition-colors ${
                  viewportMode === 'tablet' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Tablet size={16} />
              </button>
              <button
                onClick={() => setViewportMode('mobile')}
                className={`p-1.5 rounded transition-colors ${
                  viewportMode === 'mobile' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone size={16} />
              </button>
            </div>

            <div className="h-6 w-px bg-slate-700 mx-2" />

            <button
              onClick={() => setShowTemplates(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors"
            >
              <Layout size={16} />
              <span className="text-sm">Templates</span>
            </button>

            <button
              onClick={() => setShowGlobalStyles(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors"
            >
              <Settings size={16} />
              <span className="text-sm">Styles</span>
            </button>

            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors"
            >
              <Eye size={16} />
              <span className="text-sm">Preview</span>
            </button>

            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors"
              >
                <ArrowLeft size={16} />
                <span className="text-sm">Exit</span>
              </button>
            )}

            <button
              onClick={savePage}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              <Save size={16} />
              <span className="text-sm font-medium">
                {isSaving ? 'Saving...' : lastSaved ? 'Saved' : 'Save Page'}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 flex-none border-r border-slate-700 bg-slate-800 overflow-y-auto">
          <BlockLibrary
            onAddBlock={(type) => {
              // Add to active section and column if set, otherwise to the last section's first column
              const targetSectionId = activeSectionId || page.sections[page.sections.length - 1]?.id;

              if (targetSectionId) {
                addBlock(targetSectionId, type, activeColumnId || undefined);
              } else {
                // No sections exist, create one first
                addSection();
                setTimeout(() => {
                  if (page.sections.length > 0) {
                    addBlock(page.sections[page.sections.length - 1].id, type);
                  }
                }, 100);
              }
            }}
            darkMode={true}
          />
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-y-auto bg-slate-900 p-8">
            <div className={`mx-auto transition-all ${getViewportWidth()}`}>
              <SortableContext
                items={page.sections.map(s => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {page.sections.map((section) => (
                  <SortableSectionWrapper
                    key={section.id}
                    section={section}
                    onAddBlock={(type) => addBlock(section.id, type)}
                    onSelectBlock={(block) => {
                      setSelectedBlock(block);
                      setShowProperties(true);
                    }}
                    onDeleteBlock={deleteBlock}
                    onDuplicateBlock={duplicateBlock}
                    onUpdateBlock={updateBlock}
                    onEditSection={(section) => {
                      setSelectedSection(section);
                      setShowSectionSettings(true);
                      setShowProperties(false);
                    }}
                    onDeleteSection={deleteSection}
                    onSectionClick={() => setActiveSectionId(section.id)}
                    onColumnClick={(columnId) => {
                      setActiveSectionId(section.id);
                      setActiveColumnId(columnId);
                    }}
                    isActive={activeSectionId === section.id}
                    activeColumnId={activeColumnId}
                    selectedBlockId={selectedBlock?.id}
                  />
                ))}
              </SortableContext>

              <button
                onClick={() => setShowSectionTemplates(true)}
                className="w-full py-8 mt-4 border-2 border-dashed border-slate-700 rounded-lg text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={20} />
                <span>Add Section</span>
              </button>
            </div>
          </div>
        </DndContext>

        {showProperties && selectedBlock && (
          <div className="w-80 flex-none border-l border-slate-700 bg-slate-800">
            <PropertiesPanel
              selectedElement={selectedBlock}
              onUpdate={(updates) => updateBlock(selectedBlock.id, updates)}
              onClose={() => {
                setShowProperties(false);
                setSelectedBlock(null);
              }}
              darkMode={true}
            />
          </div>
        )}
      </div>

      {showTemplates && (
        <BlockTemplates
          onSelectTemplate={applyTemplate}
          onClose={() => setShowTemplates(false)}
          darkMode={true}
        />
      )}

      {showGlobalStyles && (
        <GlobalStylesPanel
          onClose={() => setShowGlobalStyles(false)}
          darkMode={true}
        />
      )}

      {/* Section Settings Panel */}
      {showSectionSettings && selectedSection && (
        <div className="fixed right-0 top-0 h-full w-80 bg-slate-800 border-l border-slate-700 shadow-xl z-50 overflow-y-auto p-6">
          <SectionSettingsPanel
            section={selectedSection}
            onSave={(sectionId, settings) => {
              updateSection(sectionId, { settings });
              setShowSectionSettings(false);
              setSelectedSection(null);
            }}
            onClose={() => {
              setShowSectionSettings(false);
              setSelectedSection(null);
            }}
            darkMode={true}
          />
        </div>
      )}

      <SectionTemplatesModal
        isOpen={showSectionTemplates}
        onClose={() => setShowSectionTemplates(false)}
        onSelectLayout={(layout) => {
          addSection(layout.id);
        }}
        darkMode={true}
      />

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center">
          <div className="w-full h-full flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-700">
              <h2 className="text-white font-medium">Preview: {page.title}</h2>
              <button
                onClick={() => setShowPreview(false)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors"
              >
                <X size={16} />
                <span className="text-sm">Close Preview</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-white">
              <div className="w-full">
                {page.sections.map((section) => (
                  <div
                    key={section.id}
                    style={{
                      backgroundColor: section.settings.backgroundColor,
                      backgroundImage: section.settings.backgroundImage
                        ? `url(${section.settings.backgroundImage})`
                        : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      paddingTop: section.settings.paddingTop,
                      paddingRight: section.settings.paddingRight,
                      paddingBottom: section.settings.paddingBottom,
                      paddingLeft: section.settings.paddingLeft,
                      marginTop: section.settings.marginTop,
                      marginRight: section.settings.marginRight,
                      marginBottom: section.settings.marginBottom,
                      marginLeft: section.settings.marginLeft,
                      minHeight: section.settings.minHeight || 'auto'
                    }}
                  >
                    <div className="max-w-6xl mx-auto px-4">
                      <div className={`flex gap-4 ${section.columns.length === 1 ? '' : 'flex-row'}`}>
                        {section.columns.map((column) => (
                          <div
                            key={column.id}
                            style={{
                              width: column.width || 'auto',
                              backgroundColor: column.settings?.backgroundColor,
                              paddingTop: column.settings?.paddingTop,
                              paddingRight: column.settings?.paddingRight,
                              paddingBottom: column.settings?.paddingBottom,
                              paddingLeft: column.settings?.paddingLeft,
                            }}
                          >
                            {column.blocks.map((block) => (
                              <div key={block.id} className="mb-4">
                                <BlockRenderer block={block} />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SortableSectionWrapper: React.FC<{
  section: Section;
  onAddBlock: (type: string) => void;
  onSelectBlock: (block: ContentBlock) => void;
  onDeleteBlock: (blockId: string) => void;
  onDuplicateBlock: (blockId: string) => void;
  onUpdateBlock: (blockId: string, updates: Partial<ContentBlock>) => void;
  onEditSection?: (section: Section) => void;
  onDeleteSection?: (sectionId: string) => void;
  onSectionClick?: () => void;
  onColumnClick?: (columnId: string) => void;
  isActive?: boolean;
  activeColumnId?: string | null;
  selectedBlockId?: string;
}> = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SectionComponent {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
};

const SectionComponent: React.FC<{
  section: Section;
  onAddBlock: (type: string) => void;
  onSelectBlock: (block: ContentBlock) => void;
  onDeleteBlock: (blockId: string) => void;
  onDuplicateBlock: (blockId: string) => void;
  onUpdateBlock: (blockId: string, updates: Partial<ContentBlock>) => void;
  onEditSection?: (section: Section) => void;
  onDeleteSection?: (sectionId: string) => void;
  onSectionClick?: () => void;
  onColumnClick?: (columnId: string) => void;
  isActive?: boolean;
  activeColumnId?: string | null;
  selectedBlockId?: string;
  dragHandleProps?: any;
}> = ({ section, onAddBlock, onSelectBlock, onDeleteBlock, onDuplicateBlock, onUpdateBlock, onEditSection, onDeleteSection, onSectionClick, onColumnClick, isActive, activeColumnId, selectedBlockId, dragHandleProps }) => {
  return (
    <div
      onClick={onSectionClick}
      className={`group relative mb-4 rounded-lg overflow-hidden cursor-pointer transition-all ${
        isActive ? 'ring-2 ring-blue-500' : 'hover:ring-2 hover:ring-blue-400'
      }`}
      style={{
        backgroundColor: section.settings.backgroundColor,
        backgroundImage: section.settings.backgroundImage
          ? `url(${section.settings.backgroundImage})`
          : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        paddingTop: section.settings.paddingTop,
        paddingRight: section.settings.paddingRight,
        paddingBottom: section.settings.paddingBottom,
        paddingLeft: section.settings.paddingLeft,
        marginTop: section.settings.marginTop,
        marginRight: section.settings.marginRight,
        marginBottom: section.settings.marginBottom,
        marginLeft: section.settings.marginLeft,
        minHeight: section.settings.minHeight || 'auto'
      }}
    >
      {/* Section Controls */}
      <div className="absolute top-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-start z-10">
        <button
          {...dragHandleProps}
          className="p-2 bg-slate-800 text-white rounded hover:bg-slate-700 transition-colors cursor-grab active:cursor-grabbing"
          title="Drag to reorder section"
        >
          <GripVertical size={16} />
        </button>

        <div className="flex gap-2">
          {onEditSection && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditSection(section);
              }}
              className="p-2 bg-slate-800 text-white rounded hover:bg-slate-700 transition-colors"
              title="Edit Section"
            >
              <Settings size={16} />
            </button>
          )}
          {onDeleteSection && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSection(section.id);
              }}
              className="p-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              title="Delete Section"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4">
        <div className={`flex gap-4 ${section.columns.length === 1 ? '' : 'flex-row'}`}>
          {section.columns.map((column) => (
            <div
              key={column.id}
              onClick={(e) => {
                e.stopPropagation();
                onColumnClick?.(column.id);
              }}
              className={`flex-shrink-0 min-h-[100px] cursor-pointer rounded transition-all ${
                activeColumnId === column.id ? 'ring-2 ring-green-500' : 'hover:ring-2 hover:ring-green-400'
              }`}
              style={{
                width: column.width || 'auto',
                backgroundColor: column.settings?.backgroundColor,
                paddingTop: column.settings?.paddingTop,
                paddingRight: column.settings?.paddingRight,
                paddingBottom: column.settings?.paddingBottom,
                paddingLeft: column.settings?.paddingLeft,
              }}
            >
              <SortableContext
                items={column.blocks.map(b => b.id)}
                strategy={verticalListSortingStrategy}
              >
                {column.blocks.map((block) => (
                  <BlockComponent
                    key={block.id}
                    block={block}
                    onClick={() => onSelectBlock(block)}
                    onDelete={() => onDeleteBlock(block.id)}
                    onDuplicate={() => onDuplicateBlock(block.id)}
                    onUpdate={(updates) => onUpdateBlock(block.id, updates)}
                    isSelected={selectedBlockId === block.id}
                  />
                ))}
              </SortableContext>

              {column.blocks.length === 0 && (
                <div className="py-16 text-center border-2 border-dashed border-slate-600 rounded-lg">
                  <p className="text-slate-400 mb-2 text-sm">Column {section.columns.indexOf(column) + 1}</p>
                  <p className="text-slate-500 text-xs">
                    {isActive
                      ? 'Click blocks to add here'
                      : 'Click section first'
                    }
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface BlockComponentProps {
  block: ContentBlock;
  onClick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUpdate?: (updates: Partial<ContentBlock>) => void;
  isSelected: boolean;
}

const BlockComponent: React.FC<BlockComponentProps> = ({
  block,
  onClick,
  onDelete,
  onDuplicate,
  onUpdate,
  isSelected
}) => {
  const [isEditing, setIsEditing] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (block.type === 'text' || block.type === 'heading') {
      e.stopPropagation();
      setIsEditing(true);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (isEditing && onUpdate) {
      const newText = e.currentTarget.innerHTML;
      onUpdate({ content: { ...block.content, text: newText } });
      setIsEditing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative my-4 rounded-lg transition-all ${
        isSelected ? 'ring-2 ring-blue-500' : 'hover:ring-2 hover:ring-blue-400'
      }`}
      onClick={onClick}
    >
      <div className="absolute -left-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          {...attributes}
          {...listeners}
          className="p-1 text-slate-400 hover:text-white cursor-grab active:cursor-grabbing"
        >
          <GripVertical size={16} />
        </button>
      </div>

      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="p-1.5 rounded bg-slate-800/90 hover:bg-slate-700 text-white"
        >
          <Copy size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1.5 rounded bg-slate-800/90 hover:bg-red-600 text-white"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div
        className="bg-white rounded-lg p-6"
        style={{
          ...block.style,
          marginTop: block.spacing?.marginTop,
          marginRight: block.spacing?.marginRight,
          marginBottom: block.spacing?.marginBottom,
          marginLeft: block.spacing?.marginLeft,
          paddingTop: block.spacing?.paddingTop,
          paddingRight: block.spacing?.paddingRight,
          paddingBottom: block.spacing?.paddingBottom,
          paddingLeft: block.spacing?.paddingLeft
        }}
        onDoubleClick={handleDoubleClick}
      >
        <BlockRenderer
          block={block}
          isEditing={isEditing}
          onBlur={handleBlur}
        />
      </div>
    </div>
  );
};

const BlockRenderer: React.FC<{
  block: ContentBlock;
  isEditing?: boolean;
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void;
}> = ({ block, isEditing, onBlur }) => {
  // Fetch real data for dynamic blocks
  const { events: raceEvents } = useRaceCalendar(block.content?.limit || 5);
  const { articles } = useLatestArticles(block.content?.count || 3);
  const { media } = useLatestMedia(block.content?.limit || 12);

  switch (block.type) {
    case 'text':
      if (isEditing) {
        return (
          <div
            contentEditable={true}
            suppressContentEditableWarning
            onBlur={onBlur}
            className="outline-none focus:ring-2 focus:ring-blue-500 rounded"
            dangerouslySetInnerHTML={{ __html: block.content.text || 'Enter text...' }}
          />
        );
      }
      return <div dangerouslySetInnerHTML={{ __html: block.content.text || 'Enter text...' }} />;

    case 'heading':
      return (
        <h2
          contentEditable={isEditing}
          suppressContentEditableWarning
          onBlur={onBlur}
          className={`text-3xl font-bold ${isEditing ? 'outline-none focus:ring-2 focus:ring-blue-500 rounded' : ''}`}
        >
          {block.content.text || 'Heading'}
        </h2>
      );

    case 'button':
      return (
        <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          {block.content.label || 'Button'}
        </button>
      );

    case 'image':
      return block.content.url ? (
        <img src={block.content.url} alt={block.content.alt || ''} className="w-full rounded-lg" />
      ) : (
        <div className="bg-slate-200 rounded-lg aspect-video flex items-center justify-center text-slate-400">
          Add Image
        </div>
      );

    case 'race-calendar':
      return (
        <div>
          <h3 className="text-2xl font-bold mb-4">{block.content.title || 'Upcoming Races'}</h3>
          <div className="space-y-3">
            {raceEvents.length > 0 ? (
              raceEvents.map((event: any, i: number) => (
                <div key={event.id || i} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                  <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                    {new Date(event.date).getDate()}
                  </div>
                  <div>
                    <div className="font-semibold">{event.name || event.title}</div>
                    <div className="text-sm text-slate-600">{new Date(event.date).toLocaleDateString()}</div>
                  </div>
                </div>
              ))
            ) : (
              [1, 2, 3].slice(0, block.content.limit || 5).map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                  <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                    {i}
                  </div>
                  <div>
                    <div className="font-semibold">Race Event {i}</div>
                    <div className="text-sm text-slate-600">Coming Soon</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );

    case 'results':
      return (
        <div>
          <h3 className="text-2xl font-bold mb-4">{block.content.title || 'Latest Results'}</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Position</th>
                  <th className="text-left p-2">Sailor</th>
                  <th className="text-left p-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3].map((i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{i}</td>
                    <td className="p-2">Sailor {i}</td>
                    <td className="p-2">--:--</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    case 'stats':
      return (
        <div className="grid grid-cols-3 gap-8 text-center">
          {(block.content.stats || [{ label: 'Members', value: '150', suffix: '+' }]).map((stat: any, i: number) => (
            <div key={i}>
              <div className="text-4xl font-bold text-blue-600">
                {stat.value}{stat.suffix}
              </div>
              <div className="text-slate-600 mt-2">{stat.label}</div>
            </div>
          ))}
        </div>
      );

    case 'photo-stream':
      return (
        <div>
          <h3 className="text-2xl font-bold mb-4">{block.content.title || 'Latest Photos'}</h3>
          <div className={`grid grid-cols-${block.content.columns || 3} gap-4`}>
            {media.length > 0 ? (
              media.map((item: any, i: number) => (
                <div key={item.id || i} className="aspect-square bg-slate-200 rounded-lg overflow-hidden">
                  <img src={item.url || item.file_path} alt={item.title || ''} className="w-full h-full object-cover" />
                </div>
              ))
            ) : (
              Array.from({ length: block.content.limit || 6 }).map((_, i) => (
                <div key={i} className="aspect-square bg-slate-200 rounded-lg" />
              ))
            )}
          </div>
        </div>
      );

    case 'articles':
      return (
        <div>
          <h3 className="text-2xl font-bold mb-4">{block.content.title || 'Latest News'}</h3>
          <div className="space-y-4">
            {articles.length > 0 ? (
              articles.map((article: any) => (
                <div key={article.id} className="flex gap-4 p-4 bg-slate-50 rounded-lg">
                  {block.content.displayImage && article.featured_image && (
                    <img src={article.featured_image} alt="" className="w-24 h-24 object-cover rounded" />
                  )}
                  {block.content.displayImage && !article.featured_image && (
                    <div className="w-24 h-24 bg-slate-200 rounded" />
                  )}
                  <div>
                    <h4 className="font-semibold">{article.title}</h4>
                    <p className="text-sm text-slate-600 mt-1">{article.excerpt || 'Article preview...'}</p>
                  </div>
                </div>
              ))
            ) : (
              [1, 2, 3].slice(0, block.content.count || 3).map((i) => (
                <div key={i} className="flex gap-4 p-4 bg-slate-50 rounded-lg">
                  <div className="w-24 h-24 bg-slate-200 rounded" />
                  <div>
                    <h4 className="font-semibold">Article Title {i}</h4>
                    <p className="text-sm text-slate-600 mt-1">Article preview text...</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );

    case 'leaderboard':
      return (
        <div>
          <h3 className="text-2xl font-bold mb-4">{block.content.title || 'Season Standings'}</h3>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].slice(0, block.content.limit || 10).map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                <div className="w-8 h-8 flex items-center justify-center font-bold text-blue-600">
                  {i}
                </div>
                {block.content.showAvatar !== false && (
                  <div className="w-10 h-10 rounded-full bg-slate-300" />
                )}
                <div className="flex-1">Sailor {i}</div>
                <div className="font-semibold">{100 - i * 10} pts</div>
              </div>
            ))}
          </div>
        </div>
      );

    case 'video':
      return (
        <div className="aspect-video bg-slate-900 rounded-lg flex items-center justify-center text-white">
          {block.content.url ? (
            <p>Video: {block.content.url}</p>
          ) : (
            <p>Add Video URL</p>
          )}
        </div>
      );

    default:
      return (
        <div className="text-center text-slate-400 py-8">
          {block.type} block
        </div>
      );
  }
};

function getDefaultContentForType(type: string): any {
  switch (type) {
    case 'text':
      return { text: '<p>Enter your text here...</p>' };
    case 'heading':
      return { text: 'Heading' };
    case 'button':
      return { label: 'Click Me', url: '#', style: 'primary' };
    case 'image':
      return { url: '', alt: '' };
    case 'race-calendar':
      return { title: 'Upcoming Races', limit: 5, layout: 'list' };
    case 'results':
      return { title: 'Latest Results', limit: 10 };
    case 'stats':
      return {
        stats: [
          { label: 'Members', value: '150', suffix: '+' },
          { label: 'Events', value: '50', suffix: '' },
          { label: 'Years', value: '25', suffix: '' }
        ]
      };
    case 'photo-stream':
      return { title: 'Latest Photos', limit: 12, layout: 'grid', columns: 3 };
    case 'articles':
      return { title: 'Latest News', count: 3, displayImage: true };
    case 'leaderboard':
      return { title: 'Season Standings', limit: 10, showAvatar: true };
    case 'video':
      return { url: '', controls: true, autoplay: false, loop: false };
    default:
      return {};
  }
}

export default WebsitePageEditorModern;

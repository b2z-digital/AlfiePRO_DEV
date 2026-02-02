import { useState, useRef } from 'react';
import {
  Plus, GripVertical, Settings, Trash2, Copy, Upload,
  Type, Image as ImageIcon, Square, Minus, Video, Share2, Menu, Columns, Code, Move, Heading
} from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ColumnSelectorModal from './ColumnSelectorModal';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';

interface ContentBlock {
  id: string;
  type: 'text' | 'image' | 'button' | 'divider' | 'spacer' | 'video' | 'social' | 'html' | 'menu' | 'heading';
  config: Record<string, any>;
}

interface EmailRow {
  id: string;
  backgroundColor?: string;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  marginTop?: number;
  marginBottom?: number;
  fullWidth?: boolean;
  blocks: ContentBlock[];
}

interface GlobalSettings {
  pageBackgroundColor: string;
  contentBackgroundColor: string;
  contentWidth: number;
  contentPadding: number;
  fontFamily: string;
}

interface EnhancedEmailPageBuilderProps {
  content?: EmailRow[];
  onChange: (content: EmailRow[]) => void;
  darkMode?: boolean;
}

export default function EnhancedEmailPageBuilder({ content = [], onChange, darkMode = false }: EnhancedEmailPageBuilderProps) {
  const { currentClub } = useAuth();
  const [rows, setRows] = useState<EmailRow[]>(content);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    pageBackgroundColor: '#f3f4f6',
    contentBackgroundColor: '#ffffff',
    contentWidth: 600,
    contentPadding: 20,
    fontFamily: 'Arial, sans-serif'
  });
  const [activeTab, setActiveTab] = useState<'content' | 'rows' | 'settings'>('content');
  const [selectedBlock, setSelectedBlock] = useState<{ rowId: string; blockId: string } | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const blockTypes = [
    { type: 'heading', icon: Heading, label: 'Heading', color: 'indigo' },
    { type: 'text', icon: Type, label: 'Text', color: 'blue' },
    { type: 'image', icon: ImageIcon, label: 'Image', color: 'purple' },
    { type: 'button', icon: Square, label: 'Button', color: 'green' },
    { type: 'divider', icon: Minus, label: 'Divider', color: 'gray' },
    { type: 'spacer', icon: Move, label: 'Spacer', color: 'slate' },
    { type: 'video', icon: Video, label: 'Video', color: 'red' },
    { type: 'social', icon: Share2, label: 'Social', color: 'blue' },
    { type: 'menu', icon: Menu, label: 'Menu', color: 'orange' },
    { type: 'html', icon: Code, label: 'HTML', color: 'yellow' },
  ];

  const updateRows = (newRows: EmailRow[]) => {
    setRows(newRows);
    onChange(newRows);
  };

  const addRow = (columns: number = 1) => {
    // Create placeholder blocks for each column
    const placeholderBlocks: ContentBlock[] = Array.from({ length: columns }, (_, i) => ({
      id: `block-${Date.now()}-${i}`,
      type: 'text',
      config: {
        content: `<p>Column ${i + 1} - Click to edit or delete and add your content</p>`,
        fontSize: 14,
        color: '#6b7280',
        lineHeight: 1.6,
        align: 'center',
        fontFamily: 'Arial, sans-serif',
        paddingTop: 20,
        paddingBottom: 20,
      }
    }));

    const newRow: EmailRow = {
      id: `row-${Date.now()}`,
      backgroundColor: '#ffffff',
      paddingTop: 20,
      paddingBottom: 20,
      paddingLeft: 20,
      paddingRight: 20,
      marginTop: 0,
      marginBottom: 0,
      fullWidth: false,
      blocks: placeholderBlocks
    };
    updateRows([...rows, newRow]);
    setShowColumnSelector(false);
  };

  const deleteRow = (rowId: string) => {
    updateRows(rows.filter(r => r.id !== rowId));
    if (selectedRowId === rowId) setSelectedRowId(null);
  };

  const duplicateRow = (rowId: string) => {
    const rowIndex = rows.findIndex(r => r.id === rowId);
    if (rowIndex === -1) return;

    const rowToCopy = rows[rowIndex];
    const newRow: EmailRow = {
      ...rowToCopy,
      id: `row-${Date.now()}`,
      blocks: rowToCopy.blocks.map(block => ({
        ...block,
        id: `block-${Date.now()}-${Math.random()}`
      }))
    };

    const newRows = [...rows];
    newRows.splice(rowIndex + 1, 0, newRow);
    updateRows(newRows);
  };

  const updateRowConfig = (rowId: string, config: Partial<EmailRow>) => {
    updateRows(rows.map(row => row.id === rowId ? { ...row, ...config } : row));
  };

  const addBlock = (rowId: string, blockType: string) => {
    const newBlock: ContentBlock = {
      id: `block-${Date.now()}`,
      type: blockType as any,
      config: getDefaultBlockConfig(blockType)
    };

    updateRows(rows.map(row =>
      row.id === rowId ? { ...row, blocks: [...row.blocks, newBlock] } : row
    ));
  };

  const deleteBlock = (rowId: string, blockId: string) => {
    updateRows(rows.map(row =>
      row.id === rowId ? { ...row, blocks: row.blocks.filter(b => b.id !== blockId) } : row
    ));
    if (selectedBlock?.blockId === blockId) setSelectedBlock(null);
  };

  const updateBlockConfig = (rowId: string, blockId: string, config: Record<string, any>) => {
    updateRows(rows.map(row =>
      row.id === rowId
        ? {
            ...row,
            blocks: row.blocks.map(block =>
              block.id === blockId ? { ...block, config: { ...block.config, ...config } } : block
            )
          }
        : row
    ));
  };

  const replaceBlock = (rowId: string, blockId: string, blockType: string) => {
    const newBlock: ContentBlock = {
      id: `block-${Date.now()}`,
      type: blockType as any,
      config: getDefaultBlockConfig(blockType)
    };

    updateRows(rows.map(row =>
      row.id === rowId
        ? {
            ...row,
            blocks: row.blocks.map(block =>
              block.id === blockId ? newBlock : block
            )
          }
        : row
    ));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = rows.findIndex(r => r.id === active.id);
      const newIndex = rows.findIndex(r => r.id === over.id);
      updateRows(arrayMove(rows, oldIndex, newIndex));
    }
  };

  const handleImageUpload = async (file: File, rowId: string, blockId: string) => {
    if (!currentClub) return;

    try {
      setUploadingImage(true);

      const fileExt = file.name.split('.').pop();
      const fileName = `${currentClub.clubId}/marketing/${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('media')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      updateBlockConfig(rowId, blockId, { src: publicUrl });
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const getDefaultBlockConfig = (type: string): Record<string, any> => {
    switch (type) {
      case 'heading':
        return {
          content: 'Your Heading Here',
          level: 'h2',
          fontSize: 32,
          color: '#000000',
          fontWeight: 'bold',
          align: 'center',
          fontFamily: 'Arial, sans-serif',
          paddingTop: 10,
          paddingBottom: 10,
          paddingLeft: 0,
          paddingRight: 0,
          lineHeight: 1.2
        };
      case 'text':
        return {
          content: '<p>Enter your text here...</p>',
          fontSize: 16,
          color: '#000000',
          lineHeight: 1.6,
          align: 'left',
          fontFamily: 'Arial, sans-serif',
          paddingTop: 10,
          paddingBottom: 10,
        };
      case 'image':
        return {
          src: '',
          alt: '',
          width: '100%',
          align: 'center',
          link: '',
          paddingTop: 10,
          paddingBottom: 10,
          fullWidth: false
        };
      case 'button':
        return {
          text: 'Click Here',
          url: '#',
          backgroundColor: '#3b82f6',
          textColor: '#ffffff',
          borderRadius: 6,
          fontSize: 16,
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 24,
          paddingRight: 24,
          align: 'center',
          fullWidth: false
        };
      case 'divider':
        return {
          color: '#e5e7eb',
          height: 1,
          style: 'solid',
          width: '100%',
          align: 'center',
          paddingTop: 20,
          paddingBottom: 20
        };
      case 'spacer':
        return { height: 40 };
      case 'video':
        return {
          embedUrl: '',
          align: 'center',
          paddingTop: 10,
          paddingBottom: 10
        };
      case 'social':
        return {
          links: [
            { platform: 'facebook', url: '', icon: '📘' },
            { platform: 'twitter', url: '', icon: '🐦' },
            { platform: 'instagram', url: '', icon: '📷' },
            { platform: 'linkedin', url: '', icon: '💼' }
          ],
          iconBackgroundColor: '#3b5998',
          iconColor: '#ffffff',
          align: 'center',
          paddingTop: 10,
          paddingBottom: 10
        };
      case 'menu':
        return {
          items: [
            { label: 'Home', url: '#' },
            { label: 'About', url: '#' },
            { label: 'Services', url: '#' },
            { label: 'Contact', url: '#' }
          ],
          linkColor: '#3b82f6',
          fontSize: 14,
          align: 'center',
          paddingTop: 10,
          paddingBottom: 10
        };
      case 'html':
        return {
          html: '<p>Add your custom HTML here</p>',
          paddingTop: 10,
          paddingBottom: 10
        };
      default:
        return {};
    }
  };

  const renderBlock = (block: ContentBlock, rowId: string) => {
    const currentRow = rows.find(r => r.id === rowId);
    const rowPaddingLeft = currentRow?.paddingLeft || 0;
    const rowPaddingRight = currentRow?.paddingRight || 0;
    const totalHorizontalPadding = rowPaddingLeft + rowPaddingRight;

    switch (block.type) {
      case 'heading':
        const HeadingTag = block.config.level || 'h2';
        return (
          <HeadingTag
            style={{
              fontSize: block.config.fontSize,
              color: block.config.color,
              fontWeight: block.config.fontWeight,
              lineHeight: block.config.lineHeight,
              textAlign: block.config.align,
              fontFamily: block.config.fontFamily || globalSettings.fontFamily,
              padding: `${block.config.paddingTop || 0}px ${block.config.paddingRight || 0}px ${block.config.paddingBottom || 0}px ${block.config.paddingLeft || 0}px`,
              margin: 0
            }}
          >
            {block.config.content}
          </HeadingTag>
        );
      case 'text':
        return (
          <div
            style={{
              fontSize: block.config.fontSize,
              color: block.config.color,
              lineHeight: block.config.lineHeight,
              textAlign: block.config.align,
              fontFamily: block.config.fontFamily || globalSettings.fontFamily,
              padding: `${block.config.paddingTop || 0}px ${block.config.paddingRight || 0}px ${block.config.paddingBottom || 0}px ${block.config.paddingLeft || 0}px`
            }}
            dangerouslySetInnerHTML={{ __html: block.config.content }}
          />
        );
      case 'image':
        return (
          <div
            style={{
              textAlign: block.config.align,
              padding: block.config.fullWidth ? '0' : `${block.config.paddingTop || 10}px 0 ${block.config.paddingBottom || 10}px 0`,
              ...(block.config.fullWidth && totalHorizontalPadding > 0 && {
                marginLeft: `-${rowPaddingLeft}px`,
                marginRight: `-${rowPaddingRight}px`,
                width: `calc(100% + ${totalHorizontalPadding}px)`,
              })
            }}
          >
            {block.config.src ? (
              <img
                src={block.config.src}
                alt={block.config.alt}
                style={{
                  width: '100%',
                  maxWidth: block.config.fullWidth ? 'none' : '100%',
                  height: 'auto',
                  display: 'block'
                }}
              />
            ) : (
              <div
                onClick={() => {
                  setSelectedBlock({ rowId, blockId: block.id });
                  fileInputRef.current?.click();
                }}
                className={`h-32 flex flex-col items-center justify-center rounded cursor-pointer transition-colors ${
                  darkMode
                    ? 'bg-slate-700 hover:bg-slate-600 border-2 border-dashed border-slate-500'
                    : 'bg-gray-100 hover:bg-gray-200 border-2 border-dashed border-gray-300'
                }`}
              >
                <Upload className={`w-8 h-8 mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Click to upload image
                </p>
              </div>
            )}
          </div>
        );
      case 'button':
        return (
          <div style={{ textAlign: block.config.align, padding: '10px 0' }}>
            <a
              href={block.config.url}
              style={{
                display: block.config.fullWidth ? 'block' : 'inline-block',
                backgroundColor: block.config.backgroundColor,
                color: block.config.textColor,
                padding: `${block.config.paddingTop}px ${block.config.paddingLeft}px ${block.config.paddingBottom}px ${block.config.paddingRight}px`,
                borderRadius: `${block.config.borderRadius}px`,
                textDecoration: 'none',
                fontSize: `${block.config.fontSize}px`,
                fontWeight: 500,
                fontFamily: globalSettings.fontFamily
              }}
            >
              {block.config.text}
            </a>
          </div>
        );
      case 'divider':
        return (
          <div style={{ textAlign: block.config.align, padding: `${block.config.paddingTop}px 0 ${block.config.paddingBottom}px 0` }}>
            <hr
              style={{
                borderColor: block.config.color,
                borderWidth: `${block.config.height}px`,
                borderStyle: block.config.style,
                width: block.config.width,
                margin: block.config.align === 'center' ? '0 auto' : block.config.align === 'right' ? '0 0 0 auto' : '0'
              }}
            />
          </div>
        );
      case 'spacer':
        return <div style={{ height: `${block.config.height}px` }} />;
      case 'video':
        return (
          <div style={{ textAlign: block.config.align || 'center', padding: `${block.config.paddingTop || 10}px 0 ${block.config.paddingBottom || 10}px 0` }}>
            {block.config.embedUrl ? (
              <div
                style={{
                  position: 'relative',
                  paddingBottom: '56.25%',
                  height: 0,
                  overflow: 'hidden'
                }}
              >
                <iframe
                  src={block.config.embedUrl}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    border: 'none'
                  }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div
                className={`h-32 flex flex-col items-center justify-center rounded ${
                  darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-600'
                }`}
              >
                <Video className="w-8 h-8 mb-2" />
                <p className="text-sm">Video placeholder - Add video URL in settings</p>
              </div>
            )}
          </div>
        );
      case 'social':
        const socialLinks = block.config.links || [
          { platform: 'facebook', url: '', icon: '📘' },
          { platform: 'twitter', url: '', icon: '🐦' },
          { platform: 'instagram', url: '', icon: '📷' },
          { platform: 'linkedin', url: '', icon: '💼' }
        ];
        return (
          <div style={{ textAlign: block.config.align || 'center', padding: `${block.config.paddingTop || 10}px 0 ${block.config.paddingBottom || 10}px 0` }}>
            <div style={{ display: 'flex', justifyContent: block.config.align === 'left' ? 'flex-start' : block.config.align === 'right' ? 'flex-end' : 'center', gap: '10px' }}>
              {socialLinks.map((link: any, idx: number) => (
                link.url ? (
                  <a
                    key={idx}
                    href={link.url}
                    style={{
                      display: 'inline-block',
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: block.config.iconBackgroundColor || '#3b5998',
                      color: block.config.iconColor || '#ffffff',
                      textAlign: 'center',
                      lineHeight: '40px',
                      fontSize: '20px',
                      textDecoration: 'none'
                    }}
                  >
                    {link.icon}
                  </a>
                ) : null
              ))}
            </div>
          </div>
        );
      case 'menu':
        const menuItems = block.config.items || [
          { label: 'Home', url: '#' },
          { label: 'About', url: '#' },
          { label: 'Services', url: '#' },
          { label: 'Contact', url: '#' }
        ];
        return (
          <div style={{ textAlign: block.config.align || 'center', padding: `${block.config.paddingTop || 10}px 0 ${block.config.paddingBottom || 10}px 0` }}>
            <div style={{
              display: 'flex',
              justifyContent: block.config.align === 'left' ? 'flex-start' : block.config.align === 'right' ? 'flex-end' : 'center',
              gap: '20px',
              flexWrap: 'wrap'
            }}>
              {menuItems.map((item: any, idx: number) => (
                <a
                  key={idx}
                  href={item.url}
                  style={{
                    color: block.config.linkColor || '#3b82f6',
                    textDecoration: 'none',
                    fontSize: block.config.fontSize || 14,
                    fontFamily: globalSettings.fontFamily
                  }}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        );
      case 'html':
        return (
          <div
            style={{
              padding: `${block.config.paddingTop || 10}px 0 ${block.config.paddingBottom || 10}px 0`,
              fontFamily: globalSettings.fontFamily
            }}
            dangerouslySetInnerHTML={{ __html: block.config.html || '<p>Custom HTML - Edit in settings</p>' }}
          />
        );
      default:
        return null;
    }
  };

  const getSelectedBlock = () => {
    if (!selectedBlock) return null;
    const row = rows.find(r => r.id === selectedBlock.rowId);
    if (!row) return null;
    return row.blocks.find(b => b.id === selectedBlock.blockId);
  };

  const getSelectedRow = () => {
    if (!selectedRowId) return null;
    return rows.find(r => r.id === selectedRowId);
  };

  return (
    <>
      <div className={`h-full flex ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        {/* Left Sidebar */}
        <div className={`w-80 border-r overflow-y-auto ${
          darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <div className="p-4">
            {/* Tabs */}
            <div className="flex gap-1 mb-4">
              <button
                onClick={() => setActiveTab('content')}
                className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-colors uppercase ${
                  activeTab === 'content'
                    ? darkMode ? 'bg-slate-700 text-slate-100' : 'bg-gray-100 text-gray-900'
                    : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Content
              </button>
              <button
                onClick={() => setActiveTab('rows')}
                className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-colors uppercase ${
                  activeTab === 'rows'
                    ? darkMode ? 'bg-slate-700 text-slate-100' : 'bg-gray-100 text-gray-900'
                    : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Rows
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-colors uppercase ${
                  activeTab === 'settings'
                    ? darkMode ? 'bg-slate-700 text-slate-100' : 'bg-gray-100 text-gray-900'
                    : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Settings
              </button>
            </div>

            {/* Content Tab */}
            {activeTab === 'content' && (
              <div className="space-y-4">
                <h3 className={`text-xs font-semibold uppercase mb-3 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  Drag blocks to your email
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {blockTypes.map((blockType) => {
                    const Icon = blockType.icon;
                    return (
                      <div
                        key={blockType.type}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('blockType', blockType.type)}
                        className={`p-4 rounded-lg cursor-move flex flex-col items-center gap-2 transition-all hover:scale-105 ${
                          darkMode
                            ? 'bg-slate-700 hover:bg-slate-600 border border-slate-600'
                            : 'bg-white hover:bg-gray-50 border border-gray-200 shadow-sm'
                        }`}
                      >
                        <Icon className={`w-6 h-6 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`} />
                        <span className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                          {blockType.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rows Tab */}
            {activeTab === 'rows' && (
              <div className="space-y-4">
                {selectedRowId ? (
                  <RowSettings
                    row={getSelectedRow()!}
                    onUpdate={(config) => updateRowConfig(selectedRowId, config)}
                    onBack={() => setSelectedRowId(null)}
                    darkMode={darkMode}
                  />
                ) : (
                  <>
                    <h3 className={`text-xs font-semibold uppercase mb-3 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      Row Settings
                    </h3>
                    {rows.length === 0 ? (
                      <p className={`text-sm text-center py-8 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                        No rows yet. Add your first row to get started!
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {rows.map((row, idx) => (
                          <button
                            key={row.id}
                            onClick={() => setSelectedRowId(row.id)}
                            className={`w-full p-3 rounded-lg text-left transition-colors ${
                              darkMode
                                ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                            }`}
                          >
                            Row {idx + 1} ({row.blocks.length} blocks)
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-4">
                {selectedBlock ? (
                  <BlockSettings
                    block={getSelectedBlock()!}
                    rowId={selectedBlock.rowId}
                    onUpdate={(config) => updateBlockConfig(selectedBlock.rowId, selectedBlock.blockId, config)}
                    onBack={() => setSelectedBlock(null)}
                    onImageUpload={(file) => handleImageUpload(file, selectedBlock.rowId, selectedBlock.blockId)}
                    uploadingImage={uploadingImage}
                    darkMode={darkMode}
                  />
                ) : (
                  <GlobalSettingsPanel
                    settings={globalSettings}
                    onUpdate={setGlobalSettings}
                    darkMode={darkMode}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Canvas */}
        <div className="flex-1 overflow-y-auto p-8" style={{ backgroundColor: globalSettings.pageBackgroundColor }}>
          <div
            className="mx-auto shadow-2xl"
            style={{
              maxWidth: `${globalSettings.contentWidth}px`,
              backgroundColor: globalSettings.contentBackgroundColor,
              fontFamily: globalSettings.fontFamily
            }}
          >
            {rows.length === 0 ? (
              <div className="p-16 text-center">
                <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Start Building Your Email
                </h3>
                <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  Click the + button below to add your first row
                </p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                  {rows.map((row) => (
                    <SortableRow
                      key={row.id}
                      row={row}
                      onDelete={deleteRow}
                      onDuplicate={duplicateRow}
                      onAddBlock={addBlock}
                      onDeleteBlock={deleteBlock}
                      onReplaceBlock={replaceBlock}
                      onSelectBlock={(blockId) => {
                        setSelectedBlock({ rowId: row.id, blockId });
                        setActiveTab('settings');
                      }}
                      renderBlock={renderBlock}
                      selectedBlockId={selectedBlock?.blockId}
                      darkMode={darkMode}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}

            {/* Add Row Button */}
            <div className="p-4 text-center border-t" style={{ borderColor: darkMode ? '#334155' : '#e5e7eb' }}>
              <button
                onClick={() => setShowColumnSelector(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
              >
                <Plus className="w-5 h-5" />
                Add Row
              </button>
            </div>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && selectedBlock) {
              handleImageUpload(file, selectedBlock.rowId, selectedBlock.blockId);
            }
          }}
        />
      </div>

      {/* Column Selector Modal */}
      {showColumnSelector && (
        <ColumnSelectorModal
          onSelect={addRow}
          onClose={() => setShowColumnSelector(false)}
          darkMode={darkMode}
        />
      )}
    </>
  );
}

function SortableRow({ row, onDelete, onDuplicate, onAddBlock, onDeleteBlock, onReplaceBlock, onSelectBlock, renderBlock, selectedBlockId, darkMode }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: row.backgroundColor,
        padding: `${row.paddingTop}px ${row.paddingRight}px ${row.paddingBottom}px ${row.paddingLeft}px`,
        marginTop: `${row.marginTop}px`,
        marginBottom: `${row.marginBottom}px`
      }}
      className="relative group"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const blockType = e.dataTransfer.getData('blockType');
        if (blockType) onAddBlock(row.id, blockType);
      }}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className={`absolute left-2 top-2 p-2 rounded cursor-move opacity-0 group-hover:opacity-100 transition-opacity z-20 ${
          darkMode ? 'bg-slate-700 text-slate-300' : 'bg-white text-gray-600 shadow'
        }`}
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Row Controls */}
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-20">
        <button
          onClick={() => onDuplicate(row.id)}
          className={`p-2 rounded transition-colors ${
            darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-white hover:bg-gray-100 text-gray-600 shadow'
          }`}
          title="Duplicate Row"
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(row.id)}
          className="p-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors shadow"
          title="Delete Row"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Blocks */}
      <div className={row.blocks.length > 1 ? `grid gap-2` : 'space-y-2'} style={{
        gridTemplateColumns: row.blocks.length > 1 ? `repeat(${row.blocks.length}, 1fr)` : undefined
      }}>
        {row.blocks.map((block: any) => (
          <div
            key={block.id}
            onClick={() => onSelectBlock(block.id)}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverBlockId(block.id);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOverBlockId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverBlockId(null);
              const blockType = e.dataTransfer.getData('blockType');
              if (blockType) {
                // Replace this specific block when dropping on it
                onReplaceBlock(row.id, block.id, blockType);
              }
            }}
            className={`relative group/block rounded-lg transition-all cursor-pointer ${
              selectedBlockId === block.id
                ? 'ring-2 ring-blue-500'
                : dragOverBlockId === block.id
                ? 'ring-2 ring-green-500 bg-green-50/20'
                : 'hover:ring-2 hover:ring-blue-300'
            }`}
          >
            {renderBlock(block, row.id)}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteBlock(row.id, block.id);
              }}
              className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded shadow-lg opacity-0 group-hover/block:opacity-100 transition-opacity z-30"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}

        {row.blocks.length === 0 && (
          <div className={`border-2 border-dashed rounded-lg p-8 text-center ${
            darkMode ? 'border-slate-600 bg-slate-800/30' : 'border-gray-300 bg-gray-50/30'
          }`}>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              Drag blocks here to add content
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function RowSettings({ row, onUpdate, onBack, darkMode }: any) {
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className={`text-sm ${darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-600 hover:text-gray-900'}`}
      >
        ← Back to Rows
      </button>

      <h3 className={`text-sm font-semibold ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
        Row Settings
      </h3>

      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
          Background Color
        </label>
        <input
          type="color"
          value={row.backgroundColor}
          onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
          className="w-full h-10 rounded-lg"
        />
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
          Padding Top
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={row.paddingTop}
          onChange={(e) => onUpdate({ paddingTop: parseInt(e.target.value) })}
          className="w-full"
        />
        <div className={`text-xs text-center mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
          {row.paddingTop}px
        </div>
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
          Padding Bottom
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={row.paddingBottom}
          onChange={(e) => onUpdate({ paddingBottom: parseInt(e.target.value) })}
          className="w-full"
        />
        <div className={`text-xs text-center mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
          {row.paddingBottom}px
        </div>
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
          Padding Left/Right
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={row.paddingLeft}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            onUpdate({ paddingLeft: val, paddingRight: val });
          }}
          className="w-full"
        />
        <div className={`text-xs text-center mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
          {row.paddingLeft}px
        </div>
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
          Margin Top
        </label>
        <input
          type="range"
          min="0"
          max="50"
          value={row.marginTop}
          onChange={(e) => onUpdate({ marginTop: parseInt(e.target.value) })}
          className="w-full"
        />
        <div className={`text-xs text-center mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
          {row.marginTop}px
        </div>
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
          Margin Bottom
        </label>
        <input
          type="range"
          min="0"
          max="50"
          value={row.marginBottom}
          onChange={(e) => onUpdate({ marginBottom: parseInt(e.target.value) })}
          className="w-full"
        />
        <div className={`text-xs text-center mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
          {row.marginBottom}px
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={row.fullWidth}
            onChange={(e) => onUpdate({ fullWidth: e.target.checked })}
            className="w-4 h-4 text-blue-600 rounded"
          />
          <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
            Full Width
          </span>
        </label>
      </div>
    </div>
  );
}

function BlockSettings({ block, rowId, onUpdate, onBack, onImageUpload, uploadingImage, darkMode }: any) {
  const renderSettings = () => {
    switch (block.type) {
      case 'heading':
        return (
          <>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Heading Text
              </label>
              <input
                type="text"
                value={block.config.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Heading Level
              </label>
              <select
                value={block.config.level}
                onChange={(e) => onUpdate({ level: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="h1">H1 - Main Title</option>
                <option value="h2">H2 - Section Title</option>
                <option value="h3">H3 - Subsection</option>
                <option value="h4">H4 - Small Heading</option>
                <option value="h5">H5 - Minor Heading</option>
                <option value="h6">H6 - Smallest</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Font Family
              </label>
              <select
                value={block.config.fontFamily}
                onChange={(e) => onUpdate({ fontFamily: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="Arial, sans-serif">Arial</option>
                <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="'Times New Roman', Times, serif">Times New Roman</option>
                <option value="'Courier New', Courier, monospace">Courier New</option>
                <option value="Verdana, sans-serif">Verdana</option>
                <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                <option value="'Comic Sans MS', cursive">Comic Sans MS</option>
                <option value="Impact, fantasy">Impact</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Font Size
                </label>
                <input
                  type="number"
                  value={block.config.fontSize}
                  onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value) })}
                  className={`w-full px-3 py-2 rounded-lg text-sm border ${
                    darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Color
                </label>
                <input
                  type="color"
                  value={block.config.color}
                  onChange={(e) => onUpdate({ color: e.target.value })}
                  className="w-full h-10 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Font Weight
              </label>
              <select
                value={block.config.fontWeight}
                onChange={(e) => onUpdate({ fontWeight: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
                <option value="700">Bold (700)</option>
                <option value="800">Extra Bold (800)</option>
                <option value="900">Black (900)</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Alignment
              </label>
              <div className="flex gap-2">
                {['left', 'center', 'right'].map((align) => (
                  <button
                    key={align}
                    onClick={() => onUpdate({ align })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm ${
                      block.config.align === align
                        ? 'bg-blue-600 text-white'
                        : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {align.charAt(0).toUpperCase() + align.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Top Padding
                </label>
                <input
                  type="number"
                  value={block.config.paddingTop}
                  onChange={(e) => onUpdate({ paddingTop: parseInt(e.target.value) })}
                  className={`w-full px-3 py-2 rounded-lg text-sm border ${
                    darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Bottom Padding
                </label>
                <input
                  type="number"
                  value={block.config.paddingBottom}
                  onChange={(e) => onUpdate({ paddingBottom: parseInt(e.target.value) })}
                  className={`w-full px-3 py-2 rounded-lg text-sm border ${
                    darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
            </div>
          </>
        );

      case 'text':
        return (
          <>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Content
              </label>
              <textarea
                value={block.config.content.replace(/<[^>]*>/g, '')}
                onChange={(e) => onUpdate({ content: `<p>${e.target.value}</p>` })}
                rows={4}
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Font Size
                </label>
                <input
                  type="number"
                  value={block.config.fontSize}
                  onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value) })}
                  className={`w-full px-3 py-2 rounded-lg text-sm border ${
                    darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Color
                </label>
                <input
                  type="color"
                  value={block.config.color}
                  onChange={(e) => onUpdate({ color: e.target.value })}
                  className="w-full h-10 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Alignment
              </label>
              <div className="flex gap-2">
                {['left', 'center', 'right'].map((align) => (
                  <button
                    key={align}
                    onClick={() => onUpdate({ align })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm ${
                      block.config.align === align
                        ? 'bg-blue-600 text-white'
                        : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {align.charAt(0).toUpperCase() + align.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </>
        );

      case 'image':
        return (
          <>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Image
              </label>
              <div
                onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  darkMode
                    ? 'border-slate-600 hover:border-slate-500 bg-slate-900'
                    : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                }`}
              >
                {uploadingImage ? (
                  <div className={`${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Uploading...
                  </div>
                ) : block.config.src ? (
                  <div>
                    <img src={block.config.src} alt="" className="max-h-32 mx-auto mb-2 rounded" />
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Click to change
                    </p>
                  </div>
                ) : (
                  <div>
                    <Upload className={`w-8 h-8 mx-auto mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Click to upload or drag and drop
                    </p>
                  </div>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImageUpload(file);
                }}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Alt Text
              </label>
              <input
                type="text"
                value={block.config.alt}
                onChange={(e) => onUpdate({ alt: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Width
              </label>
              <input
                type="text"
                value={block.config.width}
                onChange={(e) => onUpdate({ width: e.target.value })}
                placeholder="100% or 600px"
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={block.config.fullWidth}
                  onChange={(e) => onUpdate({ fullWidth: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Full Width
                </span>
              </label>
            </div>
          </>
        );

      case 'button':
        return (
          <>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Button Text
              </label>
              <input
                type="text"
                value={block.config.text}
                onChange={(e) => onUpdate({ text: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                URL
              </label>
              <input
                type="text"
                value={block.config.url}
                onChange={(e) => onUpdate({ url: e.target.value })}
                placeholder="https://example.com"
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Background
                </label>
                <input
                  type="color"
                  value={block.config.backgroundColor}
                  onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                  className="w-full h-10 rounded-lg"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Text Color
                </label>
                <input
                  type="color"
                  value={block.config.textColor}
                  onChange={(e) => onUpdate({ textColor: e.target.value })}
                  className="w-full h-10 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Border Radius
              </label>
              <input
                type="range"
                min="0"
                max="50"
                value={block.config.borderRadius}
                onChange={(e) => onUpdate({ borderRadius: parseInt(e.target.value) })}
                className="w-full"
              />
              <div className={`text-xs text-center mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                {block.config.borderRadius}px
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={block.config.fullWidth}
                  onChange={(e) => onUpdate({ fullWidth: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Full Width
                </span>
              </label>
            </div>
          </>
        );

      case 'divider':
        return (
          <>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Color
              </label>
              <input
                type="color"
                value={block.config.color}
                onChange={(e) => onUpdate({ color: e.target.value })}
                className="w-full h-10 rounded-lg"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Height
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={block.config.height}
                onChange={(e) => onUpdate({ height: parseInt(e.target.value) })}
                className="w-full"
              />
              <div className={`text-xs text-center mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                {block.config.height}px
              </div>
            </div>
          </>
        );

      case 'spacer':
        return (
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
              Height
            </label>
            <input
              type="range"
              min="10"
              max="200"
              value={block.config.height}
              onChange={(e) => onUpdate({ height: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className={`text-xs text-center mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              {block.config.height}px
            </div>
          </div>
        );

      case 'video':
        return (
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
              Video Embed URL
            </label>
            <input
              type="text"
              value={block.config.embedUrl}
              onChange={(e) => onUpdate({ embedUrl: e.target.value })}
              placeholder="https://www.youtube.com/embed/..."
              className={`w-full px-3 py-2 rounded-lg text-sm border ${
                darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
              }`}
            />
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              Use YouTube embed URL format
            </p>
          </div>
        );

      case 'social':
        return (
          <>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Social Links
              </label>
              {block.config.links?.map((link: any, idx: number) => (
                <div key={idx} className="mb-2">
                  <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    {link.platform.charAt(0).toUpperCase() + link.platform.slice(1)} URL
                  </label>
                  <input
                    type="text"
                    value={link.url}
                    onChange={(e) => {
                      const newLinks = [...block.config.links];
                      newLinks[idx].url = e.target.value;
                      onUpdate({ links: newLinks });
                    }}
                    placeholder={`https://${link.platform}.com/...`}
                    className={`w-full px-3 py-2 rounded-lg text-sm border ${
                      darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Icon Background
                </label>
                <input
                  type="color"
                  value={block.config.iconBackgroundColor}
                  onChange={(e) => onUpdate({ iconBackgroundColor: e.target.value })}
                  className="w-full h-10 rounded-lg"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Icon Color
                </label>
                <input
                  type="color"
                  value={block.config.iconColor}
                  onChange={(e) => onUpdate({ iconColor: e.target.value })}
                  className="w-full h-10 rounded-lg"
                />
              </div>
            </div>
          </>
        );

      case 'menu':
        return (
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
              Menu Items
            </label>
            {block.config.items?.map((item: any, idx: number) => (
              <div key={idx} className="mb-3 p-3 rounded-lg border" style={{ borderColor: darkMode ? '#475569' : '#e5e7eb' }}>
                <input
                  type="text"
                  value={item.label}
                  onChange={(e) => {
                    const newItems = [...block.config.items];
                    newItems[idx].label = e.target.value;
                    onUpdate({ items: newItems });
                  }}
                  placeholder="Label"
                  className={`w-full px-3 py-2 rounded-lg text-sm border mb-2 ${
                    darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
                <input
                  type="text"
                  value={item.url}
                  onChange={(e) => {
                    const newItems = [...block.config.items];
                    newItems[idx].url = e.target.value;
                    onUpdate({ items: newItems });
                  }}
                  placeholder="URL"
                  className={`w-full px-3 py-2 rounded-lg text-sm border ${
                    darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
            ))}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Link Color
              </label>
              <input
                type="color"
                value={block.config.linkColor}
                onChange={(e) => onUpdate({ linkColor: e.target.value })}
                className="w-full h-10 rounded-lg"
              />
            </div>
          </div>
        );

      case 'html':
        return (
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
              Custom HTML
            </label>
            <textarea
              value={block.config.html}
              onChange={(e) => onUpdate({ html: e.target.value })}
              rows={8}
              className={`w-full px-3 py-2 rounded-lg text-sm border font-mono ${
                darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
              }`}
              placeholder="<div>Your custom HTML here</div>"
            />
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              Add your custom HTML code here
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className={`text-sm ${darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-600 hover:text-gray-900'}`}
      >
        ← Back
      </button>
      <h3 className={`text-sm font-semibold ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
        {block.type.toUpperCase()} Settings
      </h3>
      {renderSettings()}
    </div>
  );
}

function GlobalSettingsPanel({ settings, onUpdate, darkMode }: any) {
  return (
    <div className="space-y-4">
      <h3 className={`text-sm font-semibold ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
        Global Settings
      </h3>

      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
          Page Background Color
        </label>
        <input
          type="color"
          value={settings.pageBackgroundColor}
          onChange={(e) => onUpdate({ ...settings, pageBackgroundColor: e.target.value })}
          className="w-full h-10 rounded-lg"
        />
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
          Content Background Color
        </label>
        <input
          type="color"
          value={settings.contentBackgroundColor}
          onChange={(e) => onUpdate({ ...settings, contentBackgroundColor: e.target.value })}
          className="w-full h-10 rounded-lg"
        />
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
          Content Width
        </label>
        <input
          type="range"
          min="400"
          max="800"
          value={settings.contentWidth}
          onChange={(e) => onUpdate({ ...settings, contentWidth: parseInt(e.target.value) })}
          className="w-full"
        />
        <div className={`text-xs text-center mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
          {settings.contentWidth}px
        </div>
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
          Content Padding
        </label>
        <input
          type="range"
          min="0"
          max="50"
          value={settings.contentPadding}
          onChange={(e) => onUpdate({ ...settings, contentPadding: parseInt(e.target.value) })}
          className="w-full"
        />
        <div className={`text-xs text-center mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
          {settings.contentPadding}px
        </div>
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
          Font Family
        </label>
        <select
          value={settings.fontFamily}
          onChange={(e) => onUpdate({ ...settings, fontFamily: e.target.value })}
          className={`w-full px-3 py-2 rounded-lg text-sm border ${
            darkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
          }`}
        >
          <option value="Arial, sans-serif">Arial</option>
          <option value="Helvetica, sans-serif">Helvetica</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="'Times New Roman', serif">Times New Roman</option>
          <option value="'Courier New', monospace">Courier New</option>
        </select>
      </div>
    </div>
  );
}

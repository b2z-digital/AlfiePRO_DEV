import { useState, useRef } from 'react';
import {
  Plus, GripVertical, Settings, Trash2, Copy, Eye, Code,
  Type, Image as ImageIcon, Square, Minus, Link2, Mail,
  Video, Share2, Menu, Gift, Calendar, Table, Html,
  Star, Columns, ChevronDown, AlignLeft, AlignCenter, AlignRight,
  Palette, Move
} from 'lucide-react';

interface ContentBlock {
  id: string;
  type: 'text' | 'image' | 'button' | 'divider' | 'spacer' | 'video' | 'social' | 'html' | 'menu' | 'columns';
  config: Record<string, any>;
}

interface EmailRow {
  id: string;
  backgroundColor?: string;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  fullWidth?: boolean;
  blocks: ContentBlock[];
}

interface EmailPageBuilderProps {
  content?: EmailRow[];
  onChange: (content: EmailRow[]) => void;
  darkMode?: boolean;
}

export default function EmailPageBuilder({ content = [], onChange, darkMode = false }: EmailPageBuilderProps) {
  const [rows, setRows] = useState<EmailRow[]>(content.length > 0 ? content : []);
  const [activeTab, setActiveTab] = useState<'content' | 'rows' | 'settings'>('content');
  const [selectedBlock, setSelectedBlock] = useState<{ rowId: string; blockId: string } | null>(null);
  const [draggedBlockType, setDraggedBlockType] = useState<string | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  const blockTypes = [
    { type: 'text', icon: Type, label: 'Text', color: 'blue' },
    { type: 'image', icon: ImageIcon, label: 'Image', color: 'purple' },
    { type: 'button', icon: Square, label: 'Button', color: 'green' },
    { type: 'divider', icon: Minus, label: 'Divider', color: 'gray' },
    { type: 'spacer', icon: Move, label: 'Spacer', color: 'slate' },
    { type: 'video', icon: Video, label: 'Video', color: 'red' },
    { type: 'social', icon: Share2, label: 'Social', color: 'blue' },
    { type: 'menu', icon: Menu, label: 'Menu', color: 'orange' },
    { type: 'columns', icon: Columns, label: '2 Columns', color: 'indigo' },
    { type: 'html', icon: Code, label: 'HTML', color: 'yellow' },
  ];

  const addRow = () => {
    const newRow: EmailRow = {
      id: `row-${Date.now()}`,
      backgroundColor: '#ffffff',
      paddingTop: 20,
      paddingBottom: 20,
      paddingLeft: 20,
      paddingRight: 20,
      fullWidth: false,
      blocks: []
    };
    const updatedRows = [...rows, newRow];
    setRows(updatedRows);
    onChange(updatedRows);
  };

  const deleteRow = (rowId: string) => {
    const updatedRows = rows.filter(r => r.id !== rowId);
    setRows(updatedRows);
    onChange(updatedRows);
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

    const updatedRows = [...rows];
    updatedRows.splice(rowIndex + 1, 0, newRow);
    setRows(updatedRows);
    onChange(updatedRows);
  };

  const updateRowConfig = (rowId: string, config: Partial<EmailRow>) => {
    const updatedRows = rows.map(row =>
      row.id === rowId ? { ...row, ...config } : row
    );
    setRows(updatedRows);
    onChange(updatedRows);
  };

  const addBlock = (rowId: string, blockType: string) => {
    const newBlock: ContentBlock = {
      id: `block-${Date.now()}`,
      type: blockType as any,
      config: getDefaultBlockConfig(blockType)
    };

    const updatedRows = rows.map(row =>
      row.id === rowId
        ? { ...row, blocks: [...row.blocks, newBlock] }
        : row
    );
    setRows(updatedRows);
    onChange(updatedRows);
  };

  const deleteBlock = (rowId: string, blockId: string) => {
    const updatedRows = rows.map(row =>
      row.id === rowId
        ? { ...row, blocks: row.blocks.filter(b => b.id !== blockId) }
        : row
    );
    setRows(updatedRows);
    onChange(updatedRows);
    if (selectedBlock?.blockId === blockId) {
      setSelectedBlock(null);
    }
  };

  const updateBlockConfig = (rowId: string, blockId: string, config: Record<string, any>) => {
    const updatedRows = rows.map(row =>
      row.id === rowId
        ? {
            ...row,
            blocks: row.blocks.map(block =>
              block.id === blockId ? { ...block, config: { ...block.config, ...config } } : block
            )
          }
        : row
    );
    setRows(updatedRows);
    onChange(updatedRows);
  };

  const getDefaultBlockConfig = (type: string): Record<string, any> => {
    switch (type) {
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
          paddingLeft: 0,
          paddingRight: 0
        };
      case 'image':
        return {
          src: '',
          alt: '',
          width: '100%',
          align: 'center',
          link: '',
          paddingTop: 10,
          paddingBottom: 10
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
        return {
          height: 40
        };
      case 'video':
        return {
          url: '',
          thumbnail: '',
          width: '100%',
          align: 'center'
        };
      case 'social':
        return {
          icons: [
            { platform: 'facebook', url: '#' },
            { platform: 'twitter', url: '#' },
            { platform: 'instagram', url: '#' }
          ],
          iconSize: 32,
          spacing: 10,
          align: 'center'
        };
      case 'menu':
        return {
          items: [
            { label: 'Home', url: '#' },
            { label: 'About', url: '#' },
            { label: 'Contact', url: '#' }
          ],
          align: 'center',
          layout: 'horizontal',
          fontSize: 14,
          color: '#000000',
          spacing: 20
        };
      case 'columns':
        return {
          columnCount: 2,
          columnGap: 20,
          columns: [
            { width: 50, blocks: [] },
            { width: 50, blocks: [] }
          ]
        };
      case 'html':
        return {
          content: '<div><!-- Custom HTML --></div>'
        };
      default:
        return {};
    }
  };

  const handleDragStart = (blockType: string) => {
    setDraggedBlockType(blockType);
  };

  const handleDragOver = (e: React.DragEvent, rowId: string) => {
    e.preventDefault();
    setHoveredRowId(rowId);
  };

  const handleDrop = (e: React.DragEvent, rowId: string) => {
    e.preventDefault();
    if (draggedBlockType) {
      addBlock(rowId, draggedBlockType);
      setDraggedBlockType(null);
      setHoveredRowId(null);
    }
  };

  const renderBlock = (block: ContentBlock, rowId: string) => {
    const isSelected = selectedBlock?.blockId === block.id;

    switch (block.type) {
      case 'text':
        return (
          <div
            style={{
              fontSize: block.config.fontSize,
              color: block.config.color,
              lineHeight: block.config.lineHeight,
              textAlign: block.config.align,
              fontFamily: block.config.fontFamily,
              padding: `${block.config.paddingTop}px ${block.config.paddingRight}px ${block.config.paddingBottom}px ${block.config.paddingLeft}px`
            }}
            dangerouslySetInnerHTML={{ __html: block.config.content }}
          />
        );
      case 'image':
        return (
          <div style={{ textAlign: block.config.align, padding: `${block.config.paddingTop}px 0 ${block.config.paddingBottom}px 0` }}>
            {block.config.src ? (
              <img
                src={block.config.src}
                alt={block.config.alt}
                style={{ width: block.config.width, maxWidth: '100%', height: 'auto' }}
              />
            ) : (
              <div className={`${darkMode ? 'bg-slate-700' : 'bg-gray-100'} h-32 flex items-center justify-center rounded`}>
                <ImageIcon className={`w-8 h-8 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} />
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
                fontWeight: 500
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
          <div style={{ textAlign: block.config.align, padding: '10px 0' }}>
            {block.config.thumbnail ? (
              <div className={`relative ${darkMode ? 'bg-slate-700' : 'bg-gray-100'} rounded overflow-hidden`}>
                <img src={block.config.thumbnail} alt="Video" style={{ width: block.config.width, maxWidth: '100%' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Video className="w-12 h-12 text-white opacity-80" />
                </div>
              </div>
            ) : (
              <div className={`${darkMode ? 'bg-slate-700' : 'bg-gray-100'} h-48 flex items-center justify-center rounded`}>
                <Video className={`w-12 h-12 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} />
              </div>
            )}
          </div>
        );
      case 'social':
        return (
          <div style={{ textAlign: block.config.align, padding: '10px 0' }}>
            <div style={{ display: 'inline-flex', gap: `${block.config.spacing}px` }}>
              {block.config.icons.map((icon: any, idx: number) => (
                <a
                  key={idx}
                  href={icon.url}
                  style={{
                    display: 'inline-block',
                    width: `${block.config.iconSize}px`,
                    height: `${block.config.iconSize}px`,
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    textAlign: 'center',
                    lineHeight: `${block.config.iconSize}px`
                  }}
                >
                  <Share2 size={block.config.iconSize * 0.5} style={{ verticalAlign: 'middle' }} />
                </a>
              ))}
            </div>
          </div>
        );
      case 'menu':
        return (
          <div style={{ textAlign: block.config.align, padding: '10px 0' }}>
            <div style={{
              display: 'flex',
              flexDirection: block.config.layout === 'horizontal' ? 'row' : 'column',
              gap: `${block.config.spacing}px`,
              justifyContent: block.config.align,
              flexWrap: 'wrap'
            }}>
              {block.config.items.map((item: any, idx: number) => (
                <a
                  key={idx}
                  href={item.url}
                  style={{
                    color: block.config.color,
                    fontSize: `${block.config.fontSize}px`,
                    textDecoration: 'none'
                  }}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        );
      case 'html':
        return <div dangerouslySetInnerHTML={{ __html: block.config.content }} />;
      default:
        return <div className="text-gray-400">Unknown block type</div>;
    }
  };

  const getSelectedBlock = () => {
    if (!selectedBlock) return null;
    const row = rows.find(r => r.id === selectedBlock.rowId);
    if (!row) return null;
    return row.blocks.find(b => b.id === selectedBlock.blockId);
  };

  return (
    <div className={`h-full flex ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Left Sidebar - Block Library */}
      <div className={`w-80 border-r overflow-y-auto ${
        darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
      }`}>
        <div className="p-4">
          {/* Tabs */}
          <div className="flex gap-1 mb-4">
            <button
              onClick={() => setActiveTab('content')}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'content'
                  ? darkMode
                    ? 'bg-slate-700 text-slate-100'
                    : 'bg-gray-100 text-gray-900'
                  : darkMode
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              CONTENT
            </button>
            <button
              onClick={() => setActiveTab('rows')}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'rows'
                  ? darkMode
                    ? 'bg-slate-700 text-slate-100'
                    : 'bg-gray-100 text-gray-900'
                  : darkMode
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ROWS
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'settings'
                  ? darkMode
                    ? 'bg-slate-700 text-slate-100'
                    : 'bg-gray-100 text-gray-900'
                  : darkMode
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              SETTINGS
            </button>
          </div>

          {/* Content Tab */}
          {activeTab === 'content' && (
            <div className="space-y-2">
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
                      onDragStart={() => handleDragStart(blockType.type)}
                      className={`p-4 rounded-lg cursor-move flex flex-col items-center gap-2 transition-all ${
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
              <h3 className={`text-xs font-semibold uppercase mb-3 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Row Settings
              </h3>
              <button
                onClick={addRow}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Add New Row
              </button>
              {rows.length === 0 && (
                <p className={`text-sm text-center py-8 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  No rows yet. Add your first row to get started!
                </p>
              )}
            </div>
          )}

          {/* Settings Tab - Block Properties */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              {selectedBlock ? (
                <BlockSettingsPanel
                  block={getSelectedBlock()!}
                  onUpdate={(config) => updateBlockConfig(selectedBlock.rowId, selectedBlock.blockId, config)}
                  darkMode={darkMode}
                />
              ) : (
                <div className={`text-center py-12 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  <Settings className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Select a block to edit its settings</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Canvas */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className={`max-w-3xl mx-auto rounded-lg shadow-2xl overflow-hidden ${
          darkMode ? 'bg-slate-800' : 'bg-white'
        }`}>
          {rows.length === 0 ? (
            <div className="p-16 text-center">
              <Mail className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
              <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Start Building Your Email
              </h3>
              <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Add rows and drag blocks to create your perfect email campaign
              </p>
              <button
                onClick={addRow}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add Your First Row
              </button>
            </div>
          ) : (
            rows.map((row, rowIndex) => (
              <div
                key={row.id}
                onDragOver={(e) => handleDragOver(e, row.id)}
                onDrop={(e) => handleDrop(e, row.id)}
                className={`relative group transition-all ${
                  hoveredRowId === row.id ? 'ring-2 ring-blue-500' : ''
                }`}
                style={{
                  backgroundColor: row.backgroundColor,
                  padding: `${row.paddingTop}px ${row.paddingRight}px ${row.paddingBottom}px ${row.paddingLeft}px`
                }}
              >
                {/* Row Controls */}
                <div className="absolute -left-12 top-4 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                  <button
                    onClick={() => duplicateRow(row.id)}
                    className={`p-2 rounded transition-colors ${
                      darkMode
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : 'bg-white hover:bg-gray-100 text-gray-600 shadow'
                    }`}
                    title="Duplicate Row"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteRow(row.id)}
                    className="p-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors shadow"
                    title="Delete Row"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Row Content */}
                <div className="space-y-2">
                  {row.blocks.map((block) => (
                    <div
                      key={block.id}
                      onClick={() => {
                        setSelectedBlock({ rowId: row.id, blockId: block.id });
                        setActiveTab('settings');
                      }}
                      className={`relative group/block rounded-lg transition-all cursor-pointer ${
                        selectedBlock?.blockId === block.id
                          ? 'ring-2 ring-blue-500'
                          : 'hover:ring-2 hover:ring-blue-300'
                      }`}
                    >
                      {renderBlock(block, row.id)}

                      {/* Block Controls */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover/block:opacity-100 transition-opacity flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBlock(row.id, block.id);
                          }}
                          className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded shadow-lg transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Empty State */}
                  {row.blocks.length === 0 && (
                    <div className={`border-2 border-dashed rounded-lg p-8 text-center ${
                      darkMode ? 'border-slate-600' : 'border-gray-300'
                    }`}>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                        Drag blocks here or click below to add content
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2 justify-center">
                        {blockTypes.slice(0, 4).map((blockType) => (
                          <button
                            key={blockType.type}
                            onClick={() => addBlock(row.id, blockType.type)}
                            className={`px-3 py-1.5 text-xs rounded transition-colors ${
                              darkMode
                                ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                            }`}
                          >
                            + {blockType.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function BlockSettingsPanel({ block, onUpdate, darkMode }: { block: ContentBlock; onUpdate: (config: any) => void; darkMode: boolean }) {
  const renderSettings = () => {
    switch (block.type) {
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
                className={`w-full px-3 py-2 rounded-lg text-sm ${
                  darkMode
                    ? 'bg-slate-900 border-slate-600 text-slate-100'
                    : 'bg-white border-gray-300 text-gray-900'
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
                  className={`w-full px-3 py-2 rounded-lg text-sm ${
                    darkMode
                      ? 'bg-slate-900 border-slate-600 text-slate-100'
                      : 'bg-white border-gray-300 text-gray-900'
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
                        : darkMode
                          ? 'bg-slate-700 text-slate-300'
                          : 'bg-gray-100 text-gray-700'
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
                Image URL
              </label>
              <input
                type="text"
                value={block.config.src}
                onChange={(e) => onUpdate({ src: e.target.value })}
                placeholder="https://example.com/image.jpg"
                className={`w-full px-3 py-2 rounded-lg text-sm ${
                  darkMode
                    ? 'bg-slate-900 border-slate-600 text-slate-100'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
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
                className={`w-full px-3 py-2 rounded-lg text-sm ${
                  darkMode
                    ? 'bg-slate-900 border-slate-600 text-slate-100'
                    : 'bg-white border-gray-300 text-gray-900'
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
                className={`w-full px-3 py-2 rounded-lg text-sm ${
                  darkMode
                    ? 'bg-slate-900 border-slate-600 text-slate-100'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
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
                className={`w-full px-3 py-2 rounded-lg text-sm ${
                  darkMode
                    ? 'bg-slate-900 border-slate-600 text-slate-100'
                    : 'bg-white border-gray-300 text-gray-900'
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
                className={`w-full px-3 py-2 rounded-lg text-sm ${
                  darkMode
                    ? 'bg-slate-900 border-slate-600 text-slate-100'
                    : 'bg-white border-gray-300 text-gray-900'
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

      default:
        return (
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            No settings available for this block type
          </p>
        );
    }
  };

  return (
    <div className="space-y-4">
      <h3 className={`text-sm font-semibold ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
        {block.type.toUpperCase()} Settings
      </h3>
      {renderSettings()}
    </div>
  );
}

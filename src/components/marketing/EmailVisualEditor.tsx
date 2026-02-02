import { useState, useRef } from 'react';
import { Plus, Image, Type, Square, Minus, Link2, Mail, Bold, Italic, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import type { EmailBuilderStructure, EmailBuilderRow, EmailWidget } from '../../types/marketing';

interface EmailVisualEditorProps {
  content?: string;
  structure?: EmailBuilderStructure;
  onChange: (content: string | EmailBuilderStructure) => void;
  darkMode?: boolean;
}

export default function EmailVisualEditor({ content, structure, onChange, darkMode = false }: EmailVisualEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // If content is provided, use simple HTML mode
  if (content !== undefined) {
    return (
      <div className={`h-full flex flex-col ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className={`border-b p-3 flex items-center gap-2 ${
          darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <button
            onClick={() => document.execCommand('bold')}
            className={`p-2 rounded hover:bg-opacity-10 transition-colors ${
              darkMode ? 'hover:bg-white' : 'hover:bg-gray-200'
            }`}
            title="Bold"
          >
            <Bold className={`w-4 h-4 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`} />
          </button>
          <button
            onClick={() => document.execCommand('italic')}
            className={`p-2 rounded hover:bg-opacity-10 transition-colors ${
              darkMode ? 'hover:bg-white' : 'hover:bg-gray-200'
            }`}
            title="Italic"
          >
            <Italic className={`w-4 h-4 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`} />
          </button>
          <div className={`w-px h-6 ${darkMode ? 'bg-slate-700' : 'bg-gray-300'}`} />
          <button
            onClick={() => document.execCommand('justifyLeft')}
            className={`p-2 rounded hover:bg-opacity-10 transition-colors ${
              darkMode ? 'hover:bg-white' : 'hover:bg-gray-200'
            }`}
            title="Align Left"
          >
            <AlignLeft className={`w-4 h-4 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`} />
          </button>
          <button
            onClick={() => document.execCommand('justifyCenter')}
            className={`p-2 rounded hover:bg-opacity-10 transition-colors ${
              darkMode ? 'hover:bg-white' : 'hover:bg-gray-200'
            }`}
            title="Align Center"
          >
            <AlignCenter className={`w-4 h-4 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`} />
          </button>
          <button
            onClick={() => document.execCommand('justifyRight')}
            className={`p-2 rounded hover:bg-opacity-10 transition-colors ${
              darkMode ? 'hover:bg-white' : 'hover:bg-gray-200'
            }`}
            title="Align Right"
          >
            <AlignRight className={`w-4 h-4 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`} />
          </button>
          <div className={`w-px h-6 ${darkMode ? 'bg-slate-700' : 'bg-gray-300'}`} />
          <button
            onClick={() => {
              const url = prompt('Enter URL:');
              if (url) document.execCommand('createLink', false, url);
            }}
            className={`p-2 rounded hover:bg-opacity-10 transition-colors ${
              darkMode ? 'hover:bg-white' : 'hover:bg-gray-200'
            }`}
            title="Insert Link"
          >
            <Link2 className={`w-4 h-4 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`} />
          </button>
          <button
            onClick={() => {
              const url = prompt('Enter image URL:');
              if (url) document.execCommand('insertImage', false, url);
            }}
            className={`p-2 rounded hover:bg-opacity-10 transition-colors ${
              darkMode ? 'hover:bg-white' : 'hover:bg-gray-200'
            }`}
            title="Insert Image"
          >
            <Image className={`w-4 h-4 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-8">
          <div className={`max-w-2xl mx-auto rounded-lg shadow-lg overflow-hidden ${
            darkMode ? 'bg-slate-800' : 'bg-white'
          }`}>
            <div
              ref={editorRef}
              contentEditable
              onInput={(e) => onChange(e.currentTarget.innerHTML)}
              dangerouslySetInnerHTML={{ __html: content || '<p>Start typing your email content here...</p>' }}
              className={`min-h-[400px] p-6 focus:outline-none ${
                darkMode ? 'text-slate-100' : 'text-gray-900'
              }`}
              style={{
                lineHeight: '1.6'
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Otherwise use the structure-based builder
  if (!structure) return null;
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);

  const addRow = () => {
    const newRow: EmailBuilderRow = {
      id: `row-${Date.now()}`,
      columns: [{
        id: `col-${Date.now()}`,
        width: 100,
        widgets: []
      }]
    };

    onChange({
      ...structure,
      rows: [...structure.rows, newRow]
    });
  };

  const addWidget = (rowId: string, columnId: string, type: EmailWidget['type']) => {
    const newWidget: EmailWidget = {
      id: `widget-${Date.now()}`,
      type,
      config: getDefaultConfig(type)
    };

    const updatedRows = structure.rows.map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          columns: row.columns.map(col => {
            if (col.id === columnId) {
              return {
                ...col,
                widgets: [...col.widgets, newWidget]
              };
            }
            return col;
          })
        };
      }
      return row;
    });

    onChange({
      ...structure,
      rows: updatedRows
    });
  };

  const updateWidget = (widgetId: string, config: Record<string, any>) => {
    const updatedRows = structure.rows.map(row => ({
      ...row,
      columns: row.columns.map(col => ({
        ...col,
        widgets: col.widgets.map(widget =>
          widget.id === widgetId ? { ...widget, config } : widget
        )
      }))
    }));

    onChange({
      ...structure,
      rows: updatedRows
    });
  };

  const deleteRow = (rowId: string) => {
    onChange({
      ...structure,
      rows: structure.rows.filter(row => row.id !== rowId)
    });
  };

  const getDefaultConfig = (type: EmailWidget['type']): Record<string, any> => {
    switch (type) {
      case 'text':
        return { content: '<p>Enter your text here...</p>', fontSize: 16, color: '#000000' };
      case 'image':
        return { src: '', alt: '', width: '100%' };
      case 'button':
        return { text: 'Click Here', url: '#', backgroundColor: '#3b82f6', textColor: '#ffffff' };
      case 'divider':
        return { color: '#e5e7eb', height: 1 };
      case 'spacer':
        return { height: 20 };
      default:
        return {};
    }
  };

  const renderWidget = (widget: EmailWidget) => {
    switch (widget.type) {
      case 'text':
        return (
          <div
            dangerouslySetInnerHTML={{ __html: widget.config.content }}
            style={{ fontSize: widget.config.fontSize, color: widget.config.color }}
          />
        );
      case 'image':
        return widget.config.src ? (
          <img src={widget.config.src} alt={widget.config.alt} style={{ width: widget.config.width }} />
        ) : (
          <div className="bg-gray-100 h-32 flex items-center justify-center text-gray-400">
            <Image className="w-8 h-8" />
          </div>
        );
      case 'button':
        return (
          <button
            style={{
              backgroundColor: widget.config.backgroundColor,
              color: widget.config.textColor,
              padding: '12px 24px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            {widget.config.text}
          </button>
        );
      case 'divider':
        return (
          <hr style={{ borderColor: widget.config.color, height: widget.config.height }} />
        );
      case 'spacer':
        return <div style={{ height: widget.config.height }} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar - Widget Library */}
      <div className="w-64 bg-white border-r border-gray-200 p-4 overflow-y-auto">
        <h3 className="font-semibold text-gray-900 mb-4">Add Widgets</h3>
        <div className="space-y-2">
          <button
            onClick={addRow}
            className="w-full flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Row
          </button>

          <div className="pt-4 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-600 mb-2">Content</p>
            <div className="space-y-2">
              <div
                draggable
                className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg cursor-move hover:bg-gray-100 transition-colors"
              >
                <Type className="w-4 h-4 text-gray-600" />
                <span className="text-sm">Text</span>
              </div>
              <div
                draggable
                className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg cursor-move hover:bg-gray-100 transition-colors"
              >
                <Image className="w-4 h-4 text-gray-600" />
                <span className="text-sm">Image</span>
              </div>
              <div
                draggable
                className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg cursor-move hover:bg-gray-100 transition-colors"
              >
                <Square className="w-4 h-4 text-gray-600" />
                <span className="text-sm">Button</span>
              </div>
              <div
                draggable
                className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg cursor-move hover:bg-gray-100 transition-colors"
              >
                <Minus className="w-4 h-4 text-gray-600" />
                <span className="text-sm">Divider</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 bg-gray-50 p-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden">
          {structure.rows.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Mail className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="mb-4">Start building your email by adding rows and content</p>
              <button
                onClick={addRow}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add Your First Row
              </button>
            </div>
          ) : (
            structure.rows.map((row) => (
              <div
                key={row.id}
                className="border-b border-gray-200 p-6 hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    {row.columns.map((column) => (
                      <div key={column.id} className="space-y-4">
                        {column.widgets.map((widget) => (
                          <div
                            key={widget.id}
                            onClick={() => setSelectedWidget(widget.id)}
                            className={`p-4 rounded-lg cursor-pointer transition-all ${
                              selectedWidget === widget.id
                                ? 'ring-2 ring-blue-500 bg-blue-50'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            {renderWidget(widget)}
                          </div>
                        ))}

                        {/* Quick Add Buttons */}
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => addWidget(row.id, column.id, 'text')}
                            className="px-3 py-1 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50"
                          >
                            + Text
                          </button>
                          <button
                            onClick={() => addWidget(row.id, column.id, 'image')}
                            className="px-3 py-1 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50"
                          >
                            + Image
                          </button>
                          <button
                            onClick={() => addWidget(row.id, column.id, 'button')}
                            className="px-3 py-1 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50"
                          >
                            + Button
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => deleteRow(row.id)}
                    className="text-red-600 hover:bg-red-50 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Properties Panel */}
      {selectedWidget && (
        <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
          <h3 className="font-semibold text-gray-900 mb-4">Widget Properties</h3>
          {/* Widget property editors would go here */}
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Select a widget to edit its properties</p>
          </div>
        </div>
      )}
    </div>
  );
}

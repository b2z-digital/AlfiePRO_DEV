import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, GripVertical, Settings as SettingsIcon, Eye, Columns as ColumnsIcon, Layout as LayoutIcon } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { v4 as uuidv4 } from 'uuid';
import type { EventPageRow, EventPageColumn, EventWidgetConfig } from '../../types/eventWidgets';
import { EVENT_WIDGET_REGISTRY } from '../../constants/eventWidgetRegistry';
import { eventPageBuilderStorage } from '../../utils/eventPageBuilderStorage';

interface Props {
  websiteId: string;
  pageSlug: string;
  pageTitle: string;
  onClose: () => void;
  darkMode?: boolean;
}

interface SortableRowProps {
  row: EventPageRow;
  onUpdate: (row: EventPageRow) => void;
  onDelete: () => void;
  onAddWidget: (columnId: string, widget: EventWidgetConfig) => void;
  darkMode?: boolean;
}

const SortableRow: React.FC<SortableRowProps> = ({ row, onUpdate, onDelete, onAddWidget, darkMode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const addColumn = () => {
    const newColumn: EventPageColumn = {
      id: uuidv4(),
      width: Math.floor(12 / (row.columns.length + 1)),
      widgets: []
    };

    // Redistribute widths
    const newColumns = [...row.columns, newColumn];
    const equalWidth = Math.floor(12 / newColumns.length);
    newColumns.forEach(col => col.width = equalWidth);

    onUpdate({ ...row, columns: newColumns });
  };

  const removeColumn = (columnId: string) => {
    const newColumns = row.columns.filter(col => col.id !== columnId);
    if (newColumns.length > 0) {
      const equalWidth = Math.floor(12 / newColumns.length);
      newColumns.forEach(col => col.width = equalWidth);
    }
    onUpdate({ ...row, columns: newColumns });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border-2 border-dashed mb-4 ${
        darkMode ? 'border-slate-700 bg-slate-800/30' : 'border-slate-300 bg-slate-50'
      }`}
    >
      {/* Row Header */}
      <div className={`flex items-center justify-between p-3 border-b ${
        darkMode ? 'border-slate-700' : 'border-slate-200'
      }`}>
        <div className="flex items-center gap-2">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical size={18} className="text-slate-400" />
          </div>
          <LayoutIcon size={16} className="text-cyan-500" />
          <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Row ({row.columns.length} {row.columns.length === 1 ? 'Column' : 'Columns'})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addColumn}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode
                ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10'
                : 'text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
            }`}
            title="Add Column"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={onDelete}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode
                ? 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'
                : 'text-slate-600 hover:text-red-600 hover:bg-red-50'
            }`}
            title="Delete Row"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-12 gap-4 p-4">
        {row.columns.map((column) => (
          <div
            key={column.id}
            className={`rounded-lg border-2 border-dashed min-h-[200px] ${
              darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-300 bg-white'
            }`}
            style={{ gridColumn: `span ${column.width}` }}
          >
            <div className={`flex items-center justify-between p-2 border-b ${
              darkMode ? 'border-slate-600' : 'border-slate-200'
            }`}>
              <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Column
              </span>
              {row.columns.length > 1 && (
                <button
                  onClick={() => removeColumn(column.id)}
                  className="text-slate-400 hover:text-red-500"
                  title="Remove Column"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="p-3 space-y-2">
              {column.widgets.length === 0 ? (
                <div className="text-center py-8">
                  <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    Drag widgets here
                  </p>
                </div>
              ) : (
                column.widgets.map((widget) => {
                  const widgetDef = EVENT_WIDGET_REGISTRY.find(w => w.type === widget.type);
                  return (
                    <div
                      key={widget.id}
                      className={`p-3 rounded-lg border ${
                        darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {widgetDef?.name || widget.type}
                        </span>
                        <button
                          className={`p-1 rounded transition-colors ${
                            darkMode
                              ? 'text-slate-400 hover:text-cyan-400'
                              : 'text-slate-600 hover:text-cyan-600'
                          }`}
                        >
                          <SettingsIcon size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const EventPageBuilderEditor: React.FC<Props> = ({ websiteId, pageSlug, pageTitle, onClose, darkMode = false }) => {
  const [rows, setRows] = useState<EventPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showWidgetLibrary, setShowWidgetLibrary] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  useEffect(() => {
    loadLayout();
  }, [websiteId, pageSlug]);

  const loadLayout = async () => {
    setLoading(true);
    try {
      const layout = await eventPageBuilderStorage.getPageLayout(websiteId, pageSlug);
      if (layout && layout.rows) {
        setRows(layout.rows as EventPageRow[]);
      }
    } catch (error) {
      console.error('Error loading layout:', error);
    } finally {
      setLoading(false);
    }
  };

  const addRow = () => {
    const newRow: EventPageRow = {
      id: uuidv4(),
      order: rows.length,
      columns: [
        {
          id: uuidv4(),
          width: 12,
          widgets: []
        }
      ]
    };
    setRows([...rows, newRow]);
  };

  const updateRow = (index: number, updatedRow: EventPageRow) => {
    const newRows = [...rows];
    newRows[index] = updatedRow;
    setRows(newRows);
  };

  const deleteRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = rows.findIndex(row => row.id === active.id);
    const newIndex = rows.findIndex(row => row.id === over.id);

    const newRows = arrayMove(rows, oldIndex, newIndex);
    setRows(newRows.map((row, index) => ({ ...row, order: index })));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await eventPageBuilderStorage.savePageLayout({
        event_website_id: websiteId,
        page_slug: pageSlug,
        rows: rows
      });
      onClose();
    } catch (error) {
      console.error('Error saving layout:', error);
    } finally {
      setSaving(false);
    }
  };

  const addWidgetToColumn = (columnId: string, widget: EventWidgetConfig) => {
    const newRows = rows.map(row => ({
      ...row,
      columns: row.columns.map(col =>
        col.id === columnId
          ? { ...col, widgets: [...col.widgets, widget] }
          : col
      )
    }));
    setRows(newRows);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-7xl h-[90vh] rounded-2xl shadow-2xl flex overflow-hidden ${
        darkMode ? 'bg-slate-900' : 'bg-white'
      }`}>
        {/* Main Editor */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className={`flex items-center justify-between p-6 border-b ${
            darkMode ? 'border-slate-700' : 'border-slate-200'
          }`}>
            <div>
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {pageTitle}
              </h2>
              <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Build your page with drag-and-drop
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowWidgetLibrary(!showWidgetLibrary)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  darkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
                }`}
              >
                {showWidgetLibrary ? 'Hide' : 'Show'} Widgets
              </button>
              <button
                onClick={onClose}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  darkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/30 transition-all hover:scale-[1.02] font-medium disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Page'}
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
                  <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Loading...</p>
                </div>
              </div>
            ) : (
              <div className="max-w-6xl mx-auto">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                    {rows.map((row, index) => (
                      <SortableRow
                        key={row.id}
                        row={row}
                        onUpdate={(updatedRow) => updateRow(index, updatedRow)}
                        onDelete={() => deleteRow(index)}
                        onAddWidget={addWidgetToColumn}
                        darkMode={darkMode}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {rows.length === 0 && (
                  <div className={`text-center py-16 rounded-xl border-2 border-dashed ${
                    darkMode ? 'border-slate-700 bg-slate-800/30' : 'border-slate-300 bg-slate-50'
                  }`}>
                    <LayoutIcon size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
                    <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      No rows yet
                    </p>
                    <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Start building your page by adding a row
                    </p>
                  </div>
                )}

                <button
                  onClick={addRow}
                  className={`w-full mt-4 py-4 rounded-xl border-2 border-dashed font-medium transition-colors ${
                    darkMode
                      ? 'border-slate-700 hover:border-cyan-500 hover:bg-cyan-500/10 text-slate-400 hover:text-cyan-400'
                      : 'border-slate-300 hover:border-cyan-500 hover:bg-cyan-50 text-slate-600 hover:text-cyan-600'
                  }`}
                >
                  <Plus size={20} className="inline mr-2" />
                  Add Row
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Widget Library Sidebar */}
        {showWidgetLibrary && (
          <div className={`w-80 border-l overflow-y-auto ${
            darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="p-6">
              <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Widget Library
              </h3>

              {['event', 'content', 'media', 'engagement', 'layout'].map((category) => {
                const widgets = EVENT_WIDGET_REGISTRY.filter(w => w.category === category);
                if (widgets.length === 0) return null;

                return (
                  <div key={category} className="mb-6">
                    <h4 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${
                      darkMode ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      {category}
                    </h4>
                    <div className="space-y-2">
                      {widgets.map((widget) => (
                        <button
                          key={widget.type}
                          className={`w-full p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.02] ${
                            darkMode
                              ? 'bg-slate-700 border-slate-600 hover:border-cyan-500 hover:bg-slate-600'
                              : 'bg-white border-slate-200 hover:border-cyan-500 hover:shadow-md'
                          }`}
                        >
                          <div className={`font-medium text-sm mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {widget.name}
                          </div>
                          <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {widget.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

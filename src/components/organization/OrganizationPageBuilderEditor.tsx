import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Save, Loader2, Eye, Monitor, Tablet, Smartphone, Columns, Plus, Settings, Pencil, Copy, Trash2, GripVertical, Image, Clock, Info, FileText, Calendar, Trophy, MapPin, Users, Camera, Video, Newspaper, Cloud, Map, Type, Square, MousePointer, Layout, Minus, Mail, Phone, MessageSquare, Award, Sparkles } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, useDroppable } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { OrganizationType } from '../../types/organizationWidgets';
import type { EventPageRow, EventPageColumn, EventWidgetConfig, EventGlobalSection, DeviceType } from '../../types/eventWidgets';
import { getOrganizationPage, updateOrganizationPage, createOrganizationPage, getOrganizationGlobalSections } from '../../utils/organizationPageBuilderStorage';
import { OrganizationWidgetLibraryModal } from './OrganizationWidgetLibraryModal';
import { EventWidgetRenderer } from '../events/EventWidgetRenderer';
import { EventWidgetSettingsModal } from '../events/EventWidgetSettingsModal';
import { SliderManagementModal } from '../events/SliderManagementModal';
import { RowSettingsModal } from '../events/RowSettingsModal';
import { ColumnSettingsModal } from '../events/ColumnSettingsModal';
import { RowLayoutSelectorModal } from '../events/RowLayoutSelectorModal';
import { organizationWidgetRegistry, getWidgetDefinition } from '../../constants/organizationWidgetRegistry';
import { useNotifications } from '../../contexts/NotificationContext';

interface Props {
  organizationType: OrganizationType;
  organizationId: string;
  pageSlug: string;
  pageTitle: string;
  onClose: () => void;
  onSave?: () => void;
  darkMode?: boolean;
}

interface SortableWidgetProps {
  widget: EventWidgetConfig;
  columnId: string;
  websiteId: string;
  onEdit: () => void;
  onDelete: () => void;
  onManageSlides: (widgetId: string) => void;
  darkMode?: boolean;
}

const iconMap: Record<string, React.ComponentType<any>> = {
  Image, Clock, Info, FileText, Calendar, Trophy, MapPin, Users, Camera, Video,
  Newspaper, Cloud, Map, Type, Square, MousePointer, Layout, Minus, Mail, Phone,
  MessageSquare, Award, Sparkles
};

const SortableWidget: React.FC<SortableWidgetProps> = ({
  widget,
  columnId,
  websiteId,
  onEdit,
  onDelete,
  onManageSlides,
  darkMode
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    data: { type: 'widget', widget, columnId }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const widgetDef = getWidgetDefinition(widget.type);
  const IconComponent = widgetDef?.icon ? (iconMap[widgetDef.icon] || Square) : Square;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative border-2 overflow-hidden flex flex-col h-full ${
        darkMode ? 'bg-slate-800/30 border-slate-700 shadow-lg' : 'bg-white border-slate-200 shadow-md'
      }`}
    >
      <div className={`p-3 border-b flex-shrink-0 ${
        darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-100 bg-slate-50/50'
      }`}>
        <div className="flex items-center gap-3">
          <div
            {...attributes}
            {...listeners}
            className={`p-2 rounded-lg cursor-grab active:cursor-grabbing ${
              darkMode ? 'bg-cyan-500/10 hover:bg-cyan-500/20' : 'bg-cyan-50 hover:bg-cyan-100'
            }`}
          >
            <GripVertical size={16} className="text-cyan-500" />
          </div>
          <div className={`p-2 rounded-lg ${darkMode ? 'bg-cyan-500/10' : 'bg-cyan-50'}`}>
            <IconComponent size={20} className="text-cyan-500" />
          </div>
          <div className="flex-1">
            <div className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {widgetDef?.name || widget.type}
            </div>
            <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {widgetDef?.category.toUpperCase()}
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className={`p-1.5 rounded-lg transition-all ${
                darkMode ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10' : 'text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
              }`}
              title="Edit widget settings"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={onDelete}
              className={`p-1.5 rounded-lg transition-all ${
                darkMode ? 'text-slate-400 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-600 hover:text-red-600 hover:bg-red-50'
              }`}
              title="Delete widget"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <EventWidgetRenderer
          widget={widget}
          websiteId={websiteId}
          darkMode={darkMode}
          isEditing={true}
          onManageSlides={onManageSlides}
        />
      </div>
    </div>
  );
};

interface DroppableColumnProps {
  column: EventPageColumn;
  rowId: string;
  widgets: EventWidgetConfig[];
  websiteId: string;
  onAddWidget: () => void;
  onEditWidget: (widgetId: string) => void;
  onDeleteWidget: (widgetId: string) => void;
  onManageSlides: (widgetId: string) => void;
  onOpenSettings: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  canRemove: boolean;
  darkMode?: boolean;
  columnStyles?: React.CSSProperties;
}

const DroppableColumn: React.FC<DroppableColumnProps> = ({
  column,
  rowId,
  widgets,
  websiteId,
  onAddWidget,
  onEditWidget,
  onDeleteWidget,
  onManageSlides,
  onOpenSettings,
  onRemove,
  onDuplicate,
  canRemove,
  darkMode,
  columnStyles
}) => {
  const { setNodeRef } = useSortable({
    id: column.id,
    data: { type: 'column', columnId: column.id, rowId }
  });

  return (
    <div
      ref={setNodeRef}
      className={`border-2 border-dashed min-h-[150px] relative flex flex-col ${
        darkMode ? 'border-slate-600 bg-slate-800/50' : 'border-slate-300 bg-white'
      }`}
      style={columnStyles}
    >
      <div className={`flex items-center justify-between p-2 border-b ${
        darkMode ? 'border-slate-600' : 'border-slate-200'
      }`}>
        <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Column
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSettings}
            className={`p-1 rounded transition-colors ${
              darkMode ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10' : 'text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
            }`}
            title="Column Settings"
          >
            <Settings size={14} />
          </button>
          <button
            onClick={onDuplicate}
            className={`p-1 rounded transition-colors ${
              darkMode ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10' : 'text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
            }`}
            title="Duplicate Column"
          >
            <Copy size={14} />
          </button>
          {canRemove && (
            <button
              onClick={onRemove}
              className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
              title="Remove Column"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      <div
        className="p-3 flex flex-col gap-3 flex-1 min-h-0"
        style={{
          justifyContent: column.verticalAlign === 'center' ? 'center' : column.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start'
        }}
      >
        <SortableContext items={widgets.map(w => w.id)} strategy={verticalListSortingStrategy}>
          {widgets.map((widget) => (
            <div key={widget.id} className="flex-1 min-h-[200px]">
              <SortableWidget
                widget={widget}
                columnId={column.id}
                websiteId={websiteId}
                onEdit={() => onEditWidget(widget.id)}
                onDelete={() => onDeleteWidget(widget.id)}
                onManageSlides={onManageSlides}
                darkMode={darkMode}
              />
            </div>
          ))}
        </SortableContext>
        <button
          onClick={onAddWidget}
          className={`w-full py-3 rounded-lg border-2 border-dashed font-medium transition-colors flex-shrink-0 ${
            darkMode
              ? 'border-slate-600 hover:border-cyan-500 hover:bg-cyan-500/10 text-slate-400 hover:text-cyan-400'
              : 'border-slate-300 hover:border-cyan-500 hover:bg-cyan-50 text-slate-600 hover:text-cyan-600'
          }`}
        >
          <Plus size={16} className="inline mr-1" />
          Add Widget
        </button>
      </div>
    </div>
  );
};

interface SortableRowProps {
  row: EventPageRow;
  index: number;
  websiteId: string;
  onUpdate: (row: EventPageRow) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddWidget: (columnId: string) => void;
  onDeleteWidget: (columnId: string, widgetId: string) => void;
  onEditWidget: (columnId: string, widgetId: string) => void;
  onManageSlides: (widgetId: string) => void;
  onOpenRowSettings: () => void;
  onOpenColumnSettings: (columnId: string) => void;
  currentViewport: DeviceType;
  darkMode?: boolean;
}

const SortableRow: React.FC<SortableRowProps> = ({
  row,
  index,
  websiteId,
  onUpdate,
  onDelete,
  onDuplicate,
  onAddWidget,
  onDeleteWidget,
  onEditWidget,
  onManageSlides,
  onOpenRowSettings,
  onOpenColumnSettings,
  currentViewport,
  darkMode
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    data: { type: 'row', row }
  });

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
    const newColumns = [...row.columns, newColumn];
    const equalWidth = Math.floor(12 / newColumns.length);
    newColumns.forEach(col => col.width = equalWidth);
    onUpdate({ ...row, columns: newColumns });
  };

  const removeColumn = (columnId: string) => {
    if (row.columns.length <= 1) return;
    const newColumns = row.columns.filter(col => col.id !== columnId);
    const equalWidth = Math.floor(12 / newColumns.length);
    newColumns.forEach(col => col.width = equalWidth);
    onUpdate({ ...row, columns: newColumns });
  };

  const duplicateColumn = (columnId: string) => {
    const columnToDuplicate = row.columns.find(col => col.id === columnId);
    if (!columnToDuplicate) return;
    const duplicated: EventPageColumn = {
      ...columnToDuplicate,
      id: uuidv4(),
      widgets: columnToDuplicate.widgets.map(w => ({ ...w, id: uuidv4() }))
    };
    const columnIndex = row.columns.findIndex(col => col.id === columnId);
    const newColumns = [...row.columns];
    newColumns.splice(columnIndex + 1, 0, duplicated);
    const equalWidth = Math.floor(12 / newColumns.length);
    newColumns.forEach(col => col.width = equalWidth);
    onUpdate({ ...row, columns: newColumns });
  };

  const getResponsiveValue = (device: DeviceType, base: any, responsive: any) => {
    return responsive?.[device] || base;
  };

  const padding = getResponsiveValue(currentViewport, row.padding, row.responsivePadding);
  const margin = getResponsiveValue(currentViewport, row.margin, row.responsiveMargin);

  const rowStyles: React.CSSProperties = {
    backgroundColor: row.background?.mediaType ? 'transparent' : (row.background?.type === 'color' ? row.background.value : undefined),
    marginTop: margin?.top ? `${margin.top}px` : undefined,
    marginBottom: margin?.bottom ? `${margin.bottom}px` : undefined,
    paddingTop: padding?.top ? `${padding.top}px` : undefined,
    paddingBottom: padding?.bottom ? `${padding.bottom}px` : undefined
  };

  const hasMediaBackground = row.background?.mediaType === 'image' || row.background?.mediaType === 'video';

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...rowStyles }}
      className={`rounded-xl border-2 border-dashed mb-4 relative ${
        darkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-300 bg-slate-50'
      }`}
    >
      {hasMediaBackground && (
        <div className={`absolute top-2 right-14 px-2 py-1 rounded text-xs font-medium ${
          darkMode ? 'bg-cyan-600 text-white' : 'bg-cyan-100 text-cyan-800'
        }`}>
          {row.background?.mediaType === 'video' ? 'Video BG' : 'Image BG'}
        </div>
      )}
      <div className={`flex items-center justify-between p-3 border-b ${
        darkMode ? 'border-slate-700' : 'border-slate-200'
      }`}>
        <div className="flex items-center gap-2">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical size={18} className="text-slate-400" />
          </div>
          <Columns size={16} className="text-cyan-500" />
          <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Row {index + 1} ({row.columns.length} {row.columns.length === 1 ? 'Column' : 'Columns'})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenRowSettings}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10' : 'text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
            }`}
            title="Row Settings"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={onDuplicate}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10' : 'text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
            }`}
            title="Duplicate Row"
          >
            <Copy size={16} />
          </button>
          <button
            onClick={() => {
              const fullWidth = !row.fullWidth;
              onUpdate({ ...row, fullWidth });
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              row.fullWidth
                ? 'bg-cyan-500 text-white'
                : darkMode
                ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10'
                : 'text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
            }`}
            title={row.fullWidth ? 'Full Width (Click to disable)' : 'Make Full Width'}
          >
            <Layout size={16} className="inline mr-1" />
            {row.fullWidth ? 'Full Width' : 'Contained'}
          </button>
          <button
            onClick={addColumn}
            disabled={row.columns.length >= 4}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              row.columns.length >= 4
                ? 'opacity-50 cursor-not-allowed'
                : darkMode
                ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10'
                : 'text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
            }`}
            title={row.columns.length >= 4 ? 'Maximum 4 columns' : 'Add Column'}
          >
            <Plus size={16} className="inline mr-1" />
            Column
          </button>
          <button
            onClick={onDelete}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode ? 'text-slate-400 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-600 hover:text-red-600 hover:bg-red-50'
            }`}
            title="Delete Row"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className={`grid grid-cols-12 ${row.fullWidth ? '' : 'gap-4 p-4'}`}>
        {row.columns.map((column) => {
          const shouldStack =
            (currentViewport === 'mobile' && row.stackOnMobile) ||
            (currentViewport === 'tablet' && row.stackOnTablet);

          const columnPadding = getResponsiveValue(currentViewport, column.padding, column.responsivePadding);
          const columnMargin = getResponsiveValue(currentViewport, column.margin, column.responsiveMargin);

          const columnStyles: React.CSSProperties = {
            gridColumn: shouldStack && row.columns.length > 1 ? `span 12` : `span ${column.width}`,
            backgroundColor: column.background?.value,
            marginTop: columnMargin?.top ? `${columnMargin.top}px` : undefined,
            marginBottom: columnMargin?.bottom ? `${columnMargin.bottom}px` : undefined,
            paddingTop: columnPadding?.top ? `${columnPadding.top}px` : undefined,
            paddingBottom: columnPadding?.bottom ? `${columnPadding.bottom}px` : undefined
          };

          return (
            <DroppableColumn
              key={column.id}
              column={column}
              rowId={row.id}
              widgets={column.widgets}
              websiteId={websiteId}
              onAddWidget={() => onAddWidget(column.id)}
              onEditWidget={(widgetId) => onEditWidget(column.id, widgetId)}
              onDeleteWidget={(widgetId) => onDeleteWidget(column.id, widgetId)}
              onManageSlides={onManageSlides}
              onOpenSettings={() => onOpenColumnSettings(column.id)}
              onRemove={() => removeColumn(column.id)}
              onDuplicate={() => duplicateColumn(column.id)}
              canRemove={row.columns.length > 1}
              darkMode={darkMode}
              columnStyles={columnStyles}
            />
          );
        })}
      </div>
    </div>
  );
};

const OrganizationPageBuilderEditor: React.FC<Props> = ({
  organizationType,
  organizationId,
  pageSlug,
  pageTitle,
  onClose,
  onSave,
  darkMode = true
}) => {
  const { addNotification } = useNotifications();
  const [pageId, setPageId] = useState<string | null>(null);
  const [rows, setRows] = useState<EventPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [currentViewport, setCurrentViewport] = useState<DeviceType>('desktop');

  const [showWidgetLibrary, setShowWidgetLibrary] = useState(false);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);

  const [showWidgetSettings, setShowWidgetSettings] = useState(false);
  const [editingWidget, setEditingWidget] = useState<EventWidgetConfig | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);

  const [showRowSettings, setShowRowSettings] = useState(false);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);

  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [editingColumnForSettings, setEditingColumnForSettings] = useState<{ rowIndex: number; columnId: string } | null>(null);

  const [showRowLayoutSelector, setShowRowLayoutSelector] = useState(false);

  const [showSliderManagement, setShowSliderManagement] = useState(false);
  const [sliderWidgetId, setSliderWidgetId] = useState<string | null>(null);

  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    loadPage();
  }, [organizationType, organizationId, pageSlug]);

  const loadPage = async () => {
    setLoading(true);
    try {
      let pageData = await getOrganizationPage(organizationType, organizationId, pageSlug);

      if (!pageData) {
        pageData = await createOrganizationPage(organizationType, organizationId, {
          page_slug: pageSlug,
          page_title: pageTitle,
          rows: [],
          is_published: false
        });
      }

      if (pageData) {
        setPageId(pageData.id);
        setRows((pageData.rows as EventPageRow[]) || []);
      }
    } catch (err) {
      console.error('Error loading page:', err);
      addNotification('error', 'Failed to load page');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!pageId) return;
    setSaving(true);
    try {
      const updated = await updateOrganizationPage(pageId, { rows });
      if (updated) {
        setHasChanges(false);
        addNotification('success', 'Page saved successfully');
        onSave?.();
      } else {
        addNotification('error', 'Failed to save page');
      }
    } catch (err) {
      console.error('Error saving page:', err);
      addNotification('error', 'Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRow = (widths: number[]) => {
    // Convert percentages to grid columns (out of 12)
    const newColumns: EventPageColumn[] = widths.map((width) => ({
      id: uuidv4(),
      width: Math.round((width / 100) * 12), // Convert percentage to grid columns
      widgets: [],
      verticalAlign: 'top' as const
    }));

    const newRow: EventPageRow = {
      id: uuidv4(),
      order: rows.length,
      columns: newColumns,
      padding: { top: 40, bottom: 40, left: 20, right: 20 },
      fullWidth: false,
      columnGap: 20,
      stackOnMobile: true
    };

    setRows([...rows, newRow]);
    setHasChanges(true);
    setShowRowLayoutSelector(false);
  };

  const handleUpdateRow = (index: number, updatedRow: EventPageRow) => {
    const newRows = [...rows];
    newRows[index] = updatedRow;
    setRows(newRows);
    setHasChanges(true);
  };

  const handleDeleteRow = (index: number) => {
    if (!confirm('Delete this row and all its widgets?')) return;
    const newRows = rows.filter((_, i) => i !== index);
    setRows(newRows);
    setHasChanges(true);
  };

  const handleDuplicateRow = (index: number) => {
    const rowToDuplicate = rows[index];
    const duplicated: EventPageRow = {
      ...rowToDuplicate,
      id: uuidv4(),
      columns: rowToDuplicate.columns.map(col => ({
        ...col,
        id: uuidv4(),
        widgets: col.widgets.map(w => ({ ...w, id: uuidv4() }))
      }))
    };
    const newRows = [...rows];
    newRows.splice(index + 1, 0, duplicated);
    setRows(newRows);
    setHasChanges(true);
  };

  const handleAddWidget = (columnId: string) => {
    setSelectedColumnId(columnId);
    setShowWidgetLibrary(true);
  };

  const handleSelectWidget = (widgetType: any) => {
    if (!selectedColumnId) return;

    const widgetDef = getWidgetDefinition(widgetType);
    const newWidget: EventWidgetConfig = {
      id: uuidv4(),
      type: widgetType,
      settings: widgetDef?.defaultSettings || {},
      order: 0
    };

    setRows(rows.map(row => ({
      ...row,
      columns: row.columns.map(col => {
        if (col.id !== selectedColumnId) return col;
        return {
          ...col,
          widgets: [...col.widgets, { ...newWidget, order: col.widgets.length }]
        };
      })
    })));

    setShowWidgetLibrary(false);
    setSelectedColumnId(null);
    setHasChanges(true);
  };

  const handleDeleteWidget = (columnId: string, widgetId: string) => {
    setRows(rows.map(row => ({
      ...row,
      columns: row.columns.map(col => {
        if (col.id !== columnId) return col;
        return {
          ...col,
          widgets: col.widgets.filter(w => w.id !== widgetId)
        };
      })
    })));
    setHasChanges(true);
  };

  const handleEditWidget = (columnId: string, widgetId: string) => {
    for (const row of rows) {
      for (const col of row.columns) {
        if (col.id === columnId) {
          const widget = col.widgets.find(w => w.id === widgetId);
          if (widget) {
            setEditingWidget(widget);
            setEditingColumnId(columnId);
            setShowWidgetSettings(true);
            return;
          }
        }
      }
    }
  };

  const handleSaveWidgetSettings = (updatedWidget: EventWidgetConfig) => {
    if (!editingColumnId) return;
    setRows(rows.map(row => ({
      ...row,
      columns: row.columns.map(col => {
        if (col.id !== editingColumnId) return col;
        return {
          ...col,
          widgets: col.widgets.map(w => w.id === updatedWidget.id ? updatedWidget : w)
        };
      })
    })));
    setShowWidgetSettings(false);
    setEditingWidget(null);
    setEditingColumnId(null);
    setHasChanges(true);
  };

  const handleManageSlides = (widgetId: string) => {
    setSliderWidgetId(widgetId);
    setShowSliderManagement(true);
  };

  const handleOpenRowSettings = (index: number) => {
    setEditingRowIndex(index);
    setShowRowSettings(true);
  };

  const handleSaveRowSettings = (updatedRow: EventPageRow) => {
    if (editingRowIndex === null) return;
    handleUpdateRow(editingRowIndex, updatedRow);
    setShowRowSettings(false);
    setEditingRowIndex(null);
  };

  const handleOpenColumnSettings = (rowIndex: number, columnId: string) => {
    setEditingColumnForSettings({ rowIndex, columnId });
    setShowColumnSettings(true);
  };

  const handleSaveColumnSettings = (updatedColumn: EventPageColumn) => {
    if (!editingColumnForSettings) return;
    const { rowIndex, columnId } = editingColumnForSettings;
    setRows(rows.map((row, i) => {
      if (i !== rowIndex) return row;
      return {
        ...row,
        columns: row.columns.map(col => col.id === columnId ? updatedColumn : col)
      };
    }));
    setShowColumnSettings(false);
    setEditingColumnForSettings(null);
    setHasChanges(true);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveWidgetId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveWidgetId(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'row' && overData?.type === 'row') {
      const oldIndex = rows.findIndex(r => r.id === active.id);
      const newIndex = rows.findIndex(r => r.id === over.id);
      if (oldIndex !== newIndex) {
        setRows(arrayMove(rows, oldIndex, newIndex));
        setHasChanges(true);
      }
    } else if (activeData?.type === 'widget') {
      const fromColumnId = activeData.columnId;
      let toColumnId = '';
      let newIndex = 0;

      if (overData?.type === 'widget') {
        toColumnId = overData.columnId;
        for (const row of rows) {
          const targetColumn = row.columns.find(c => c.id === toColumnId);
          if (targetColumn) {
            const overIndex = targetColumn.widgets.findIndex(w => w.id === over.id);
            if (fromColumnId === toColumnId) {
              const activeIndex = targetColumn.widgets.findIndex(w => w.id === active.id);
              newIndex = activeIndex < overIndex ? overIndex : overIndex;
            } else {
              newIndex = overIndex + 1;
            }
            break;
          }
        }
      } else if (overData?.type === 'column') {
        toColumnId = overData.columnId;
        for (const row of rows) {
          const targetColumn = row.columns.find(c => c.id === toColumnId);
          if (targetColumn) {
            newIndex = targetColumn.widgets.length;
            break;
          }
        }
      }

      if (toColumnId && fromColumnId) {
        moveWidget(fromColumnId, toColumnId, active.id as string, newIndex);
      }
    }
  };

  const moveWidget = (fromColumnId: string, toColumnId: string, widgetId: string, newIndex: number) => {
    let movedWidget: EventWidgetConfig | null = null;

    const rowsWithoutWidget = rows.map(row => ({
      ...row,
      columns: row.columns.map(col => {
        if (col.id === fromColumnId) {
          const widget = col.widgets.find(w => w.id === widgetId);
          if (widget) movedWidget = widget;
          return { ...col, widgets: col.widgets.filter(w => w.id !== widgetId) };
        }
        return col;
      })
    }));

    if (!movedWidget) return;

    const finalRows = rowsWithoutWidget.map(row => ({
      ...row,
      columns: row.columns.map(col => {
        if (col.id === toColumnId) {
          const newWidgets = [...col.widgets];
          newWidgets.splice(newIndex, 0, movedWidget!);
          return { ...col, widgets: newWidgets };
        }
        return col;
      })
    }));

    setRows(finalRows);
    setHasChanges(true);
  };

  const viewportWidths: Record<DeviceType, string> = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin h-8 w-8 text-cyan-500" />
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${darkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
      <div className={`flex items-center justify-between p-4 border-b ${
        darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              {pageTitle}
            </h1>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              /{pageSlug}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`flex items-center rounded-lg border ${
            darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
          }`}>
            {(['desktop', 'tablet', 'mobile'] as DeviceType[]).map((device) => {
              const Icon = device === 'desktop' ? Monitor : device === 'tablet' ? Tablet : Smartphone;
              return (
                <button
                  key={device}
                  onClick={() => setCurrentViewport(device)}
                  className={`p-2 transition-colors ${
                    currentViewport === device
                      ? 'bg-cyan-500 text-white'
                      : darkMode
                      ? 'text-slate-400 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  } ${device === 'desktop' ? 'rounded-l-lg' : device === 'mobile' ? 'rounded-r-lg' : ''}`}
                  title={device.charAt(0).toUpperCase() + device.slice(1)}
                >
                  <Icon size={18} />
                </button>
              );
            })}
          </div>

          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div
          className="mx-auto transition-all duration-300"
          style={{ maxWidth: viewportWidths[currentViewport] }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
              {rows.map((row, index) => (
                <SortableRow
                  key={row.id}
                  row={row}
                  index={index}
                  websiteId={organizationId}
                  onUpdate={(updatedRow) => handleUpdateRow(index, updatedRow)}
                  onDelete={() => handleDeleteRow(index)}
                  onDuplicate={() => handleDuplicateRow(index)}
                  onAddWidget={handleAddWidget}
                  onDeleteWidget={handleDeleteWidget}
                  onEditWidget={handleEditWidget}
                  onManageSlides={handleManageSlides}
                  onOpenRowSettings={() => handleOpenRowSettings(index)}
                  onOpenColumnSettings={(columnId) => handleOpenColumnSettings(index, columnId)}
                  currentViewport={currentViewport}
                  darkMode={darkMode}
                />
              ))}
            </SortableContext>
          </DndContext>

          <button
            onClick={() => setShowRowLayoutSelector(true)}
            className={`w-full py-6 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors ${
              darkMode
                ? 'border-slate-700 hover:border-cyan-500 hover:bg-cyan-500/10 text-slate-400 hover:text-cyan-400'
                : 'border-slate-300 hover:border-cyan-500 hover:bg-cyan-50 text-slate-600 hover:text-cyan-600'
            }`}
          >
            <Plus size={24} />
            <span className="font-medium">Add Row</span>
          </button>
        </div>
      </div>

      {showWidgetLibrary && (
        <OrganizationWidgetLibraryModal
          onSelectWidget={handleSelectWidget}
          onClose={() => {
            setShowWidgetLibrary(false);
            setSelectedColumnId(null);
          }}
          darkMode={darkMode}
        />
      )}

      {showWidgetSettings && editingWidget && (
        <EventWidgetSettingsModal
          widget={editingWidget}
          websiteId={organizationId}
          onSave={handleSaveWidgetSettings}
          onClose={() => {
            setShowWidgetSettings(false);
            setEditingWidget(null);
            setEditingColumnId(null);
          }}
          darkMode={darkMode}
        />
      )}

      {showRowSettings && editingRowIndex !== null && (
        <RowSettingsModal
          row={rows[editingRowIndex]}
          onSave={handleSaveRowSettings}
          onClose={() => {
            setShowRowSettings(false);
            setEditingRowIndex(null);
          }}
          darkMode={darkMode}
        />
      )}

      {showColumnSettings && editingColumnForSettings && (
        <ColumnSettingsModal
          column={rows[editingColumnForSettings.rowIndex].columns.find(c => c.id === editingColumnForSettings.columnId)!}
          onSave={handleSaveColumnSettings}
          onClose={() => {
            setShowColumnSettings(false);
            setEditingColumnForSettings(null);
          }}
          currentViewport={currentViewport}
          darkMode={darkMode}
        />
      )}

      {showRowLayoutSelector && (
        <RowLayoutSelectorModal
          onSelect={handleAddRow}
          onClose={() => setShowRowLayoutSelector(false)}
          darkMode={darkMode}
        />
      )}

      {showSliderManagement && sliderWidgetId && (
        <SliderManagementModal
          websiteId={organizationId}
          widgetId={sliderWidgetId}
          onClose={() => {
            setShowSliderManagement(false);
            setSliderWidgetId(null);
          }}
          darkMode={darkMode}
        />
      )}
    </div>
  );
};

export default OrganizationPageBuilderEditor;

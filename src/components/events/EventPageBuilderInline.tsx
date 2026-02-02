import React, { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, Columns, Save, Loader2, AlertCircle, Image, Clock, Info, FileText, Calendar, Trophy, MapPin, Users, Camera, Video, Newspaper, Cloud, Map, Type, Square, MousePointer, Layout, Minus, Mail, Phone, MessageSquare, Award, Sparkles, Settings, Pencil, Eye, Edit3, Monitor, Tablet, Smartphone, Copy, Grid } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent, closestCorners, useDroppable } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { v4 as uuidv4 } from 'uuid';
import type { EventPageRow, EventPageColumn, EventWidgetConfig, EventGlobalSection, DeviceType } from '../../types/eventWidgets';
import { EVENT_WIDGET_REGISTRY, getWidgetDefinition } from '../../constants/eventWidgetRegistry';
import { eventPageBuilderStorage } from '../../utils/eventPageBuilderStorage';
import { EventWidgetLibraryModal } from './EventWidgetLibraryModal';
import { EventWidgetRenderer } from './EventWidgetRenderer';
import { EventWidgetSettingsModal } from './EventWidgetSettingsModal';
import { SliderManagementModal } from './SliderManagementModal';
import { RowSettingsModal } from './RowSettingsModal';
import { ColumnSettingsModal } from './ColumnSettingsModal';
import { RowLayoutSelectorModal } from './RowLayoutSelectorModal';
import { useNotifications } from '../../contexts/NotificationContext';

interface Props {
  websiteId: string;
  pageSlug: string;
  pageTitle: string;
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
    data: {
      type: 'widget',
      widget,
      columnId
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const widgetDef = getWidgetDefinition(widget.type);
  const IconComponent = widgetDef?.icon ?
    (() => {
      const icons = { Image, Clock, Info, FileText, Calendar, Trophy, MapPin, Users, Camera, Video, Newspaper, Cloud, Map, Type, Square, MousePointer, Layout, Minus, Mail, Phone, MessageSquare, Award, Sparkles };
      return (icons as any)[widgetDef.icon] || Square;
    })() : Square;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative border-2 overflow-hidden flex flex-col h-full ${
        darkMode
          ? 'bg-slate-800/30 border-slate-700 shadow-lg'
          : 'bg-white border-slate-200 shadow-md'
      }`}
    >
      {/* Widget Header with Icon */}
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
          <div className={`p-2 rounded-lg ${
            darkMode ? 'bg-cyan-500/10' : 'bg-cyan-50'
          }`}>
            <IconComponent size={20} className="text-cyan-500" />
          </div>
          <div className="flex-1">
            <div className={`text-sm font-semibold ${
              darkMode ? 'text-white' : 'text-slate-900'
            }`}>
              {widgetDef?.name || widget.type}
            </div>
            <div className={`text-xs ${
              darkMode ? 'text-slate-400' : 'text-slate-500'
            }`}>
              {widgetDef?.category.toUpperCase()}
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className={`p-1.5 rounded-lg transition-all ${
                darkMode
                  ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10'
                  : 'text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
              }`}
              title="Edit widget settings"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={onDelete}
              className={`p-1.5 rounded-lg transition-all ${
                darkMode
                  ? 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'
                  : 'text-slate-600 hover:text-red-600 hover:bg-red-50'
              }`}
              title="Delete widget"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Widget Preview - Actual Rendered Widget */}
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
    data: {
      type: 'column',
      columnId: column.id,
      rowId
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={`border-2 border-dashed min-h-[150px] relative flex flex-col ${
        darkMode ? 'border-slate-600 bg-slate-800/50' : 'border-slate-300 bg-white'
      }`}
      style={columnStyles}
    >
      {/* Column Header */}
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
              darkMode
                ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10'
                : 'text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
            }`}
            title="Column Settings"
          >
            <Settings size={14} />
          </button>
          <button
            onClick={onDuplicate}
            className={`p-1 rounded transition-colors ${
              darkMode
                ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10'
                : 'text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
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

      {/* Widgets */}
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

        {/* Add Widget Button */}
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
    data: {
      type: 'row',
      row
    }
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

  const duplicateColumnLocal = (columnId: string) => {
    const columnToDuplicate = row.columns.find(col => col.id === columnId);
    if (!columnToDuplicate) return;

    const deepCopyColumn = (column: EventPageColumn): EventPageColumn => ({
      ...column,
      id: uuidv4(),
      widgets: column.widgets.map(widget => ({
        ...widget,
        id: uuidv4()
      }))
    });

    const duplicatedColumn = deepCopyColumn(columnToDuplicate);
    const columnIndex = row.columns.findIndex(col => col.id === columnId);
    const newColumns = [...row.columns];
    newColumns.splice(columnIndex + 1, 0, duplicatedColumn);

    // Redistribute widths equally
    const equalWidth = Math.floor(12 / newColumns.length);
    newColumns.forEach(col => col.width = equalWidth);

    onUpdate({ ...row, columns: newColumns });
  };

  const getResponsiveValue = (device: DeviceType, base: any, responsive: any) => {
    return responsive?.[device] || base;
  };

  const padding = getResponsiveValue(currentViewport, row.padding, row.responsivePadding);
  const margin = getResponsiveValue(currentViewport, row.margin, row.responsiveMargin);
  const maxWidth = row.responsiveMaxWidth?.[currentViewport] || row.maxWidth || undefined;
  const minHeight = row.responsiveMinHeight?.[currentViewport] || row.minHeight || undefined;
  const maxHeight = row.responsiveMaxHeight?.[currentViewport] || row.maxHeight || undefined;

  const rowStyles: React.CSSProperties = {
    backgroundColor: row.background?.mediaType ? 'transparent' : (row.background?.type === 'color' ? row.background.value : undefined),
    marginTop: margin?.top ? `${margin.top}px` : undefined,
    marginBottom: margin?.bottom ? `${margin.bottom}px` : undefined,
    marginLeft: margin?.left ? `${margin.left}px` : undefined,
    marginRight: margin?.right ? `${margin.right}px` : undefined,
    paddingTop: padding?.top ? `${padding.top}px` : undefined,
    paddingBottom: padding?.bottom ? `${padding.bottom}px` : undefined,
    paddingLeft: padding?.left ? `${padding.left}px` : undefined,
    paddingRight: padding?.right ? `${padding.right}px` : undefined,
    maxWidth: maxWidth || undefined,
    minHeight: minHeight || undefined,
    maxHeight: maxHeight || undefined
  };

  // Show a preview indicator for image/video backgrounds in edit mode
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
      {/* Row Header */}
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
              darkMode
                ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10'
                : 'text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
            }`}
            title="Row Settings"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={onDuplicate}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode
                ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10'
                : 'text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
            }`}
            title="Duplicate Row"
          >
            <Copy size={16} />
          </button>
          <button
            onClick={() => {
              const fullWidth = !row.fullWidth;
              onUpdate({
                ...row,
                fullWidth
                // Don't automatically reset padding/columnGap - let users control these independently
              });
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
      <div className={`grid grid-cols-12 ${row.fullWidth ? '' : 'gap-4 p-4'}`}>
        {row.columns.map((column) => {
          const shouldStack =
            (currentViewport === 'mobile' && row.stackOnMobile) ||
            (currentViewport === 'tablet' && row.stackOnTablet);

          const columnPadding = getResponsiveValue(currentViewport, column.padding, column.responsivePadding);
          const columnMargin = getResponsiveValue(currentViewport, column.margin, column.responsiveMargin);

          const columnStyles: React.CSSProperties = {
            gridColumn: shouldStack && row.columns.length > 1
              ? `span 12`
              : `span ${column.width}`,
            backgroundColor: column.background?.value,
            marginTop: columnMargin?.top ? `${columnMargin.top}px` : undefined,
            marginBottom: columnMargin?.bottom ? `${columnMargin.bottom}px` : undefined,
            marginLeft: columnMargin?.left ? `${columnMargin.left}px` : undefined,
            marginRight: columnMargin?.right ? `${columnMargin.right}px` : undefined,
            paddingTop: columnPadding?.top ? `${columnPadding.top}px` : undefined,
            paddingBottom: columnPadding?.bottom ? `${columnPadding.bottom}px` : undefined,
            paddingLeft: columnPadding?.left ? `${columnPadding.left}px` : undefined,
            paddingRight: columnPadding?.right ? `${columnPadding.right}px` : undefined
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
              onDuplicate={() => duplicateColumnLocal(column.id)}
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

// Sortable Widget for Visual Mode
interface SortableVisualWidgetProps {
  widget: EventWidgetConfig;
  columnId: string;
  rowIndex: number;
  websiteId: string;
  currentViewport: DeviceType;
  darkMode?: boolean;
  isHovered: boolean;
  onEditWidget: (columnId: string, widgetId: string) => void;
  onDeleteWidget: (columnId: string, widgetId: string) => void;
  onManageSlides: (widgetId: string) => void;
  onMouseEnter: () => void;
}

const SortableVisualWidget: React.FC<SortableVisualWidgetProps> = ({
  widget,
  columnId,
  rowIndex,
  websiteId,
  currentViewport,
  darkMode,
  isHovered,
  onEditWidget,
  onDeleteWidget,
  onManageSlides,
  onMouseEnter
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: widget.id,
    data: {
      type: 'widget',
      widget,
      columnId
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const showWidgetToolbar = isHovered;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group/widget"
      onMouseEnter={onMouseEnter}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEditWidget(columnId, widget.id);
      }}
    >
      {/* Widget Hover Outline */}
      {isHovered && (
        <div className="absolute top-0 bottom-0 left-0 right-0 border-2 border-green-500 pointer-events-none z-10 rounded" />
      )}

      {/* Widget Inline Toolbar with Drag Handle */}
      {showWidgetToolbar && (
        <div className="absolute -top-10 left-0 right-0 flex items-center justify-between z-20">
          {/* Drag Handle on Left */}
          <div
            {...attributes}
            {...listeners}
            className="flex items-center gap-1 bg-green-500 rounded-lg shadow-lg p-1 cursor-grab active:cursor-grabbing"
          >
            <div className="p-1.5 text-white" title="Drag to move">
              <GripVertical size={14} />
            </div>
            <span className="text-white text-xs font-medium px-2">
              {widget.type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </span>
          </div>

          {/* Action Buttons on Right */}
          <div className="flex items-center gap-1 bg-green-500 rounded-lg shadow-lg p-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditWidget(columnId, widget.id);
              }}
              className="p-1.5 text-white hover:bg-green-600 rounded transition-colors"
              title="Edit Widget"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteWidget(columnId, widget.id);
              }}
              className="p-1.5 text-white hover:bg-red-600 rounded transition-colors"
              title="Delete Widget"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Render Actual Widget */}
      <div
        className="w-full"
        style={{
          marginTop: widget.responsiveMargin?.[currentViewport]?.top !== undefined
            ? `${widget.responsiveMargin[currentViewport]!.top}px`
            : undefined,
          marginBottom: widget.responsiveMargin?.[currentViewport]?.bottom !== undefined
            ? `${widget.responsiveMargin[currentViewport]!.bottom}px`
            : undefined,
          marginLeft: widget.responsiveMargin?.[currentViewport]?.left !== undefined
            ? `${widget.responsiveMargin[currentViewport]!.left}px`
            : undefined,
          marginRight: widget.responsiveMargin?.[currentViewport]?.right !== undefined
            ? `${widget.responsiveMargin[currentViewport]!.right}px`
            : undefined,
          paddingTop: widget.responsivePadding?.[currentViewport]?.top !== undefined
            ? `${widget.responsivePadding[currentViewport]!.top}px`
            : undefined,
          paddingBottom: widget.responsivePadding?.[currentViewport]?.bottom !== undefined
            ? `${widget.responsivePadding[currentViewport]!.bottom}px`
            : undefined,
          paddingLeft: widget.responsivePadding?.[currentViewport]?.left !== undefined
            ? `${widget.responsivePadding[currentViewport]!.left}px`
            : undefined,
          paddingRight: widget.responsivePadding?.[currentViewport]?.right !== undefined
            ? `${widget.responsivePadding[currentViewport]!.right}px`
            : undefined
        }}
      >
        <EventWidgetRenderer
          widget={widget}
          websiteId={websiteId}
          darkMode={darkMode}
          isEditing={false}
          onManageSlides={onManageSlides}
        />
      </div>
    </div>
  );
};

interface DroppableVisualColumnProps {
  column: EventPageColumn;
  rowId: string;
  rowIndex: number;
  websiteId: string;
  currentViewport: DeviceType;
  darkMode: boolean;
  hoveredElement: any;
  setHoveredElement: (element: any) => void;
  onAddWidget: (columnId: string) => void;
  onEditWidget: (columnId: string, widgetId: string) => void;
  onDeleteWidget: (columnId: string, widgetId: string) => void;
  onManageSlides: (widgetId: string) => void;
  onOpenColumnSettings: (rowIndex: number, columnId: string) => void;
  hoverTimeoutRef: React.MutableRefObject<any>;
}

const DroppableVisualColumn: React.FC<DroppableVisualColumnProps> = ({
  column,
  rowId,
  rowIndex,
  websiteId,
  currentViewport,
  darkMode,
  hoveredElement,
  setHoveredElement,
  onAddWidget,
  onEditWidget,
  onDeleteWidget,
  onManageSlides,
  onOpenColumnSettings,
  hoverTimeoutRef
}) => {
  // Make column a droppable target
  const { setNodeRef: setColumnRef } = useDroppable({
    id: `column-${column.id}`,
    data: {
      type: 'column',
      columnId: column.id,
      rowId: rowId
    }
  });

  const showColumnOutline = hoveredElement?.columnId === column.id || (hoveredElement?.type === 'column' && hoveredElement.id === column.id);
  const showColumnToolbar = hoveredElement?.type === 'column' && hoveredElement.id === column.id;

  // Apply column background with responsive padding and margin
  const columnPadding = column.responsivePadding?.[currentViewport] || column.padding || {};
  const columnMargin = column.responsiveMargin?.[currentViewport] || column.margin || {};

  let columnBackgroundStyle: any = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: column.verticalAlign === 'center' ? 'center' : column.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
    height: '100%',
    backgroundColor: column.background?.type === 'color' ? column.background.value : 'transparent',
    paddingTop: columnPadding.top !== undefined ? `${columnPadding.top}px` : '16px',
    paddingBottom: columnPadding.bottom !== undefined ? `${columnPadding.bottom}px` : '16px',
    paddingLeft: columnPadding.left !== undefined ? `${columnPadding.left}px` : '16px',
    paddingRight: columnPadding.right !== undefined ? `${columnPadding.right}px` : '16px',
    marginTop: columnMargin.top !== undefined ? `${columnMargin.top}px` : undefined,
    marginBottom: columnMargin.bottom !== undefined ? `${columnMargin.bottom}px` : undefined,
    marginLeft: columnMargin.left !== undefined ? `${columnMargin.left}px` : undefined,
    marginRight: columnMargin.right !== undefined ? `${columnMargin.right}px` : undefined
  };

  if (column.background?.type === 'image' && column.background.value) {
    columnBackgroundStyle = {
      ...columnBackgroundStyle,
      backgroundImage: `url(${column.background.value})`,
      backgroundSize: column.background.size || 'cover',
      backgroundPosition: column.background.position || 'center',
      backgroundRepeat: column.background.repeat || 'no-repeat'
    };
  }

  return (
    <div
      key={column.id}
      ref={setColumnRef}
      className="relative group/column"
      onMouseEnter={(e) => {
        e.stopPropagation();
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setHoveredElement({ type: 'column', id: column.id, rowIndex, columnId: column.id, rowId });
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpenColumnSettings(rowIndex, column.id);
      }}
      style={columnBackgroundStyle}
    >
      {/* Column Hover Outline */}
      {showColumnOutline && (
        <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none z-10" />
      )}

      {/* Hover Bridge for Column */}
      {showColumnToolbar && (
        <div className="absolute top-0 right-0 w-32 h-16 pointer-events-none z-15" />
      )}

      {/* Column Inline Toolbar */}
      {showColumnToolbar && (
        <div
          className="absolute top-2 right-2 flex items-center gap-1 bg-blue-500 rounded-lg shadow-lg z-20 p-1"
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenColumnSettings(rowIndex, column.id);
            }}
            className="p-1.5 text-white hover:bg-blue-600 rounded transition-colors"
            title="Column Settings"
          >
            <Settings size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddWidget(column.id);
            }}
            className="p-1.5 text-white hover:bg-blue-600 rounded transition-colors"
            title="Add Widget"
          >
            <Plus size={14} />
          </button>
        </div>
      )}

      {/* Column Widgets */}
      <SortableContext items={column.widgets.map(w => w.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-4 min-h-[100px] flex flex-col">
          {column.widgets.length === 0 && hoveredElement?.type === 'column' && hoveredElement?.id === column.id && (
            <div className="flex-1 flex items-center justify-center text-slate-400 border-2 border-dashed border-slate-300 rounded-lg p-8">
              <div className="text-center">
                <Plus size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Click + below to add a widget</p>
              </div>
            </div>
          )}
          {column.widgets.map((widget) => (
            <SortableVisualWidget
              key={widget.id}
              widget={widget}
              columnId={column.id}
              rowIndex={rowIndex}
              websiteId={websiteId}
              currentViewport={currentViewport}
              darkMode={darkMode}
              isHovered={hoveredElement?.type === 'widget' && hoveredElement.id === widget.id}
              onEditWidget={onEditWidget}
              onDeleteWidget={onDeleteWidget}
              onManageSlides={onManageSlides}
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                setHoveredElement({
                  type: 'widget',
                  id: widget.id,
                  rowIndex,
                  columnId: column.id,
                  rowId
                });
              }}
            />
          ))}
        </div>
      </SortableContext>

      {/* Add Widget Button at Bottom of Column - appears on hover */}
      {hoveredElement?.type === 'column' && hoveredElement?.id === column.id && (
        <div
          className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 z-30"
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddWidget(column.id);
            }}
            className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg flex items-center justify-center transition-all hover:scale-110"
            title="Add Widget"
          >
            <Plus size={20} />
          </button>
        </div>
      )}
    </div>
  );
};

interface VisualEditRendererProps {
  rows: EventPageRow[];
  globalSections: {
    header: EventGlobalSection | null;
    menu: EventGlobalSection | null;
    footer: EventGlobalSection | null;
  };
  websiteId: string;
  currentViewport: DeviceType;
  darkMode?: boolean;
  onUpdateRow: (index: number, row: EventPageRow) => void;
  onDeleteRow: (index: number) => void;
  onDuplicateRow: (index: number) => void;
  onAddWidget: (columnId: string) => void;
  onDeleteWidget: (columnId: string, widgetId: string) => void;
  onEditWidget: (columnId: string, widgetId: string) => void;
  onManageSlides: (widgetId: string) => void;
  onOpenRowSettings: (index: number) => void;
  onOpenColumnSettings: (rowIndex: number, columnId: string) => void;
  onAddRow: (afterIndex: number) => void;
  onMoveWidget: (fromColumnId: string, toColumnId: string, widgetId: string, newIndex: number) => void;
}

const VisualEditRenderer: React.FC<VisualEditRendererProps> = ({
  rows,
  globalSections,
  websiteId,
  currentViewport,
  darkMode = false,
  onUpdateRow,
  onDeleteRow,
  onDuplicateRow,
  onAddWidget,
  onDeleteWidget,
  onEditWidget,
  onManageSlides,
  onOpenRowSettings,
  onOpenColumnSettings,
  onAddRow,
  onMoveWidget
}) => {
  const [hoveredElement, setHoveredElement] = React.useState<{
    type: 'row' | 'column' | 'widget',
    id: string,
    rowIndex?: number,
    columnId?: string,
    rowId?: string
  } | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [navigationPages, setNavigationPages] = React.useState<any[]>([]);
  const hoverTimeoutRef = React.useRef<any>(null);
  const [activeWidgetId, setActiveWidgetId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveWidgetId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta } = event;
    setActiveWidgetId(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'widget') {
      const fromColumnId = activeData.columnId;
      let toColumnId = '';
      let newIndex = 0;

      if (overData?.type === 'widget') {
        // Dropping on another widget
        toColumnId = overData.columnId;

        // Find the widget's index in the target column
        for (const row of rows) {
          const targetColumn = row.columns.find(c => c.id === toColumnId);
          if (targetColumn) {
            const overIndex = targetColumn.widgets.findIndex(w => w.id === over.id);

            // If moving within the same column, use sortable's natural order
            if (fromColumnId === toColumnId) {
              const activeIndex = targetColumn.widgets.findIndex(w => w.id === active.id);
              // When moving down in same column, the target index shifts back by 1 after removal
              newIndex = activeIndex < overIndex ? overIndex - 1 : overIndex;
            } else {
              // Moving between different columns
              // Always insert after when moving between columns (more intuitive)
              newIndex = overIndex + 1;
            }
            break;
          }
        }
      } else if (overData?.type === 'column') {
        // Dropping into a column
        toColumnId = overData.columnId;

        // Add at the end of the column
        for (const row of rows) {
          const targetColumn = row.columns.find(c => c.id === toColumnId);
          if (targetColumn) {
            newIndex = targetColumn.widgets.length;
            break;
          }
        }
      }

      if (toColumnId && fromColumnId) {
        onMoveWidget(fromColumnId, toColumnId, active.id as string, newIndex);
      }
    }
  };

  // Find the active widget for drag overlay
  const activeWidget = React.useMemo(() => {
    if (!activeWidgetId) return null;
    for (const row of rows) {
      for (const column of row.columns) {
        const widget = column.widgets.find(w => w.id === activeWidgetId);
        if (widget) return widget;
      }
    }
    return null;
  }, [activeWidgetId, rows]);

  React.useEffect(() => {
    const loadNavigationPages = async () => {
      try {
        const { supabase } = await import('../../utils/supabase');
        const { data, error } = await supabase
          .from('event_page_layouts')
          .select('page_slug, title, navigation_order')
          .eq('is_published', true)
          .eq('show_in_navigation', true)
          .order('navigation_order', { ascending: true });

        if (!error && data) {
          setNavigationPages(data);
        }
      } catch (err) {
        console.error('Error loading navigation pages:', err);
      }
    };

    loadNavigationPages();
  }, []);

  const headerConfig = globalSections.header?.config || {};
  const menuConfig = globalSections.menu?.config || {};

  // Get all widget IDs for sortable context
  const allWidgetIds = rows.flatMap(row =>
    row.columns.flatMap(column => column.widgets.map(w => w.id))
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
    <div className={`rounded-xl overflow-hidden border-2 relative ${
      darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
    }`}>
      {/* Global Header & Menu (non-editable in this view) */}
      {(globalSections.header?.enabled || globalSections.menu?.enabled) && (
        <div style={{ opacity: 0.7, pointerEvents: 'none' }} className="border-b-2 border-dashed border-slate-400">
          {/* Simplified header rendering */}
          <div className="p-4 text-center text-sm text-slate-500">
            Header & Navigation (Edit in Header/Navigation settings)
          </div>
        </div>
      )}

      {/* Rows with Visual Edit Mode */}
      <div className="relative">
        {rows.map((row, rowIndex) => {
          const padding = row.responsivePadding?.[currentViewport] || row.padding || {};
          const margin = row.responsiveMargin?.[currentViewport] || row.margin || {};
          const maxWidth = row.responsiveMaxWidth?.[currentViewport] || row.maxWidth || undefined;
          const minHeight = row.responsiveMinHeight?.[currentViewport] || row.minHeight || undefined;
          const maxHeight = row.responsiveMaxHeight?.[currentViewport] || row.maxHeight || undefined;

          const isRowHovered = hoveredElement?.type === 'row' && hoveredElement.rowIndex === rowIndex;

          // Determine if we should show row outline (when row or child is hovered)
          const showRowOutline = hoveredElement?.rowIndex === rowIndex;
          const showRowToolbar = hoveredElement?.type === 'row' && hoveredElement.rowIndex === rowIndex;

          // Apply background image/video if present
          let backgroundStyle: any = {
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: row.background?.type === 'color' ? row.background.value : 'transparent',
            marginTop: margin.top !== undefined ? `${margin.top}px` : undefined,
            marginBottom: margin.bottom !== undefined ? `${margin.bottom}px` : undefined,
            marginLeft: margin.left !== undefined ? `${margin.left}px` : undefined,
            marginRight: margin.right !== undefined ? `${margin.right}px` : undefined,
            maxWidth: maxWidth || undefined,
            minHeight: minHeight || undefined,
            maxHeight: maxHeight || undefined
          };

          if (row.background?.type === 'image' && row.background.value) {
            backgroundStyle = {
              ...backgroundStyle,
              backgroundImage: `url(${row.background.value})`,
              backgroundSize: row.background.size || 'cover',
              backgroundPosition: row.background.position || 'center',
              backgroundRepeat: row.background.repeat || 'no-repeat'
            };
          }

          return (
            <div
              key={row.id}
              className="relative group"
              onMouseEnter={() => setHoveredElement({ type: 'row', id: row.id, rowIndex, rowId: row.id })}
              onMouseLeave={() => {
                if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = setTimeout(() => setHoveredElement(null), 300);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onOpenRowSettings(rowIndex);
              }}
              style={backgroundStyle}
            >
              {/* Row Hover Outline - Always show when any child is hovered */}
              {showRowOutline && (
                <div className="absolute inset-0 border-2 border-cyan-500 pointer-events-none z-10" />
              )}

              {/* Hover Bridge for Row - invisible area to maintain hover */}
              {showRowToolbar && (
                <div className="absolute top-0 right-0 w-40 h-16 pointer-events-none z-15" />
              )}

              {/* Row Inline Toolbar */}
              {showRowToolbar && (
                <div
                  className="absolute top-2 right-2 flex items-center gap-1 bg-cyan-500 rounded-lg shadow-lg z-20 p-1"
                  onMouseEnter={() => {
                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                  }}
                >
                  <button
                    onClick={() => onOpenRowSettings(rowIndex)}
                    className="p-2 text-white hover:bg-cyan-600 rounded transition-colors"
                    title="Row Settings"
                  >
                    <Settings size={16} />
                  </button>
                  <button
                    onClick={() => onDuplicateRow(rowIndex)}
                    className="p-2 text-white hover:bg-cyan-600 rounded transition-colors"
                    title="Duplicate Row"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    onClick={() => onDeleteRow(rowIndex)}
                    className="p-2 text-white hover:bg-red-600 rounded transition-colors"
                    title="Delete Row"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}

              {/* Row Content */}
              <div
                className={`grid gap-4 ${
                  row.fullWidth ? 'w-full' : 'w-full max-w-7xl mx-auto px-4'
                }`}
                style={{
                  flex: 1,
                  gridTemplateColumns: `repeat(${row.columns.length}, 1fr)`,
                  paddingTop: padding.top !== undefined ? `${padding.top}px` : '40px',
                  paddingBottom: padding.bottom !== undefined ? `${padding.bottom}px` : '40px',
                  paddingLeft: padding.left !== undefined ? `${padding.left}px` : '20px',
                  paddingRight: padding.right !== undefined ? `${padding.right}px` : '20px'
                }}
              >
                {row.columns.map((column) => (
                  <DroppableVisualColumn
                    key={column.id}
                    column={column}
                    rowId={row.id}
                    rowIndex={rowIndex}
                    websiteId={websiteId}
                    currentViewport={currentViewport}
                    darkMode={darkMode}
                    hoveredElement={hoveredElement}
                    setHoveredElement={setHoveredElement}
                    onAddWidget={onAddWidget}
                    onEditWidget={onEditWidget}
                    onDeleteWidget={onDeleteWidget}
                    onManageSlides={onManageSlides}
                    onOpenColumnSettings={onOpenColumnSettings}
                    hoverTimeoutRef={hoverTimeoutRef}
                  />
                ))}
              </div>

              {/* Add Row Button at Bottom - appears on hover */}
              {hoveredElement?.type === 'row' && hoveredElement?.rowIndex === rowIndex && (
                <div
                  className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 z-30"
                  onMouseEnter={() => {
                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddRow(rowIndex);
                    }}
                    className="w-12 h-12 rounded-full bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg flex items-center justify-center transition-all hover:scale-110"
                    title="Add Row Below"
                  >
                    <Plus size={24} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>

    {/* Drag Overlay */}
    <DragOverlay>
      {activeWidget && (
        <div className="bg-green-500/20 border-2 border-green-500 rounded-lg p-4 shadow-2xl opacity-90">
          <div className="text-green-600 font-semibold">
            {activeWidget.type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
          </div>
        </div>
      )}
    </DragOverlay>
    </DndContext>
  );
};

interface PreviewRendererProps {
  rows: EventPageRow[];
  globalSections: {
    header: EventGlobalSection | null;
    menu: EventGlobalSection | null;
    footer: EventGlobalSection | null;
  };
  websiteId: string;
  currentViewport: DeviceType;
  darkMode?: boolean;
}

const PreviewRenderer: React.FC<PreviewRendererProps> = ({ rows, globalSections, websiteId, currentViewport, darkMode = false }) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [navigationPages, setNavigationPages] = React.useState<any[]>([]);

  React.useEffect(() => {
    const loadNavigationPages = async () => {
      try {
        const { supabase } = await import('../../utils/supabase');
        const { data, error } = await supabase
          .from('event_page_layouts')
          .select('page_slug, title, navigation_order')
          .eq('event_website_id', websiteId)
          .eq('show_in_navigation', true)
          .order('navigation_order', { ascending: true });

        if (data && !error) {
          setNavigationPages(data.map(page => ({
            label: page.title,
            url: `/${page.page_slug}`,
            type: 'page'
          })));
        }
      } catch (error) {
        console.error('Error loading navigation pages:', error);
      }
    };

    loadNavigationPages();
  }, [websiteId]);

  const headerConfig = globalSections.header?.config || {};
  const menuConfig = globalSections.menu?.config || {};
  const footerConfig = globalSections.footer?.config || {};

  const backgroundColor = headerConfig.background_color || '#ffffff';
  const textColor = headerConfig.text_color || '#000000';
  const logoUrl = headerConfig.logo_url || '';
  const logoType = headerConfig.logo_type || 'text';
  const headerText = headerConfig.header_text || '';
  const showEventName = headerConfig.show_event_name !== false;
  const height = headerConfig.height || 100;
  const logoSize = headerConfig.logo_size || 48;
  const textSize = headerConfig.text_size || 32;
  const logoPosition = headerConfig.logo_position || 'center';

  const menuItems = navigationPages.length > 0 ? navigationPages : (menuConfig.items || []);
  const ctaButtons = menuConfig.cta_buttons || [];
  const menuStyle = menuConfig.style || 'horizontal';
  const isHamburgerMenu = menuStyle === 'dropdown' || menuStyle === 'hamburger';
  const menuPosition = menuConfig.menu_position || 'left';
  const menuBgColor = menuConfig.background_color || '#ffffff';
  const menuTextColor = menuConfig.text_color || '#000000';
  const menuHoverColor = menuConfig.hover_color || '#06b6d4';
  const hamburgerColor = menuConfig.hamburger_color || '#404040';
  const scrollPosition = menuConfig.position || 'sticky';

  return (
    <div className={`rounded-xl overflow-hidden border-2 relative ${
      darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
    }`}>
      {/* Combined Header + Navigation */}
      {(globalSections.header?.enabled || globalSections.menu?.enabled) && (
        <div className="relative">
          {/* Header Section */}
          {globalSections.header?.enabled && (
            <header
              className="px-6 flex items-center"
              style={{
                backgroundColor,
                height: `${height}px`
              }}
            >
              <div className="w-full max-w-7xl mx-auto flex items-center justify-between relative">
                {/* Left side - Hamburger menu (when menuPosition is left) or CTA buttons (when menuPosition is right) */}
                {globalSections.menu?.enabled && isHamburgerMenu && menuPosition === 'left' && (
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-75 transition-opacity"
                    style={{ color: hamburgerColor }}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="w-6 h-0.5 bg-current"></div>
                      <div className="w-6 h-0.5 bg-current"></div>
                      <div className="w-6 h-0.5 bg-current"></div>
                    </div>
                    <span className="text-xs font-medium mt-0.5" style={{ color: hamburgerColor }}>MENU</span>
                  </button>
                )}
                {globalSections.menu?.enabled && isHamburgerMenu && menuPosition === 'right' && ctaButtons.length > 0 && (
                  <div className="flex items-center gap-3">
                    {ctaButtons.map((button: any, index: number) => (
                      <a
                        key={index}
                        href={button.url || '#'}
                        style={{
                          backgroundColor: button.background_color || '#10b981',
                          color: button.text_color || '#ffffff'
                        }}
                        className="px-6 py-2 rounded-lg font-medium transition-all hover:opacity-90 whitespace-nowrap"
                      >
                        {button.label}
                      </a>
                    ))}
                  </div>
                )}

                {/* Center - Logo/Text (absolutely positioned when center aligned) */}
                <div className={logoPosition === 'center' && globalSections.menu?.enabled && isHamburgerMenu
                  ? 'absolute left-1/2 transform -translate-x-1/2 flex items-center'
                  : 'flex items-center'}>
                  {logoType === 'upload' && logoUrl && (
                    <img
                      src={logoUrl}
                      alt="Logo"
                      style={{ height: `${logoSize}px` }}
                      className="object-contain"
                    />
                  )}
                  {logoType === 'club' && logoUrl && (
                    <img
                      src={logoUrl}
                      alt="Club Logo"
                      style={{ height: `${logoSize}px` }}
                      className="object-contain"
                    />
                  )}
                  {logoType === 'text' && headerText && (
                    <h1
                      style={{
                        color: textColor,
                        fontSize: `${textSize}px`
                      }}
                      className="font-bold"
                    >
                      {headerText}
                    </h1>
                  )}
                </div>

                {/* Right side - CTA buttons (when menuPosition is left) or Hamburger menu (when menuPosition is right) */}
                {globalSections.menu?.enabled && isHamburgerMenu && menuPosition === 'left' && ctaButtons.length > 0 && (
                  <div className="flex items-center gap-3">
                    {ctaButtons.map((button: any, index: number) => (
                      <a
                        key={index}
                        href={button.url || '#'}
                        style={{
                          backgroundColor: button.background_color || '#10b981',
                          color: button.text_color || '#ffffff'
                        }}
                        className="px-6 py-2 rounded-lg font-medium transition-all hover:opacity-90 whitespace-nowrap"
                      >
                        {button.label}
                      </a>
                    ))}
                  </div>
                )}
                {globalSections.menu?.enabled && isHamburgerMenu && menuPosition === 'right' && (
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-75 transition-opacity"
                    style={{ color: hamburgerColor }}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="w-6 h-0.5 bg-current"></div>
                      <div className="w-6 h-0.5 bg-current"></div>
                      <div className="w-6 h-0.5 bg-current"></div>
                    </div>
                    <span className="text-xs font-medium mt-0.5" style={{ color: hamburgerColor }}>MENU</span>
                  </button>
                )}
              </div>
            </header>
          )}

          {/* Dropdown Menu Panel (for hamburger style) */}
          {globalSections.menu?.enabled && isHamburgerMenu && menuOpen && menuItems.length > 0 && (
            <div
              className={`absolute ${menuPosition === 'left' ? 'left-0' : 'right-0'} top-full w-64 shadow-2xl z-50`}
              style={{ backgroundColor: '#ffffff' }}
            >
              {/* Close Menu Button */}
              <div className="bg-slate-100 px-4 py-5">
                <button
                  onClick={() => setMenuOpen(false)}
                  className="w-full text-center text-slate-900 font-semibold text-xs tracking-[0.2em] hover:text-slate-600 transition-colors"
                >
                  CLOSE MENU
                </button>
              </div>

              {/* Menu Items */}
              <nav className="space-y-0">
                {menuItems.map((item: any, index: number) => (
                  <a
                    key={index}
                    href={item.url || '#'}
                    className="block py-3 text-center text-slate-900 font-medium text-xs tracking-[0.15em] hover:text-slate-600 transition-colors border-b border-slate-200"
                  >
                    {item.label.toUpperCase()}
                  </a>
                ))}
              </nav>
            </div>
          )}
        </div>
      )}

      {/* Horizontal Navigation Bar (if style is horizontal) */}
      {globalSections.menu?.enabled && !isHamburgerMenu && menuItems.length > 0 && (
        <nav
          style={{
            backgroundColor: menuBgColor,
            borderBottom: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`
          }}
          className={scrollPosition === 'sticky' ? 'sticky top-0 z-10' : ''}
        >
              <div className="max-w-7xl mx-auto px-6">
                <div className={`flex items-center py-4 ${
                  menuPosition === 'right' ? 'justify-end' : 'justify-between'
                }`}>
                  <div className={`flex items-center gap-8 ${menuPosition === 'right' ? 'order-2' : ''}`}>
                    {menuItems.map((item: any, index: number) => (
                      <a
                        key={index}
                        href={item.url || '#'}
                        style={{
                          color: menuTextColor
                        }}
                        className="font-medium transition-colors hover:opacity-75"
                      >
                        {item.label}
                      </a>
                    ))}
                  </div>
                  {ctaButtons.length > 0 && (
                    <div className={`flex items-center gap-3 ${menuPosition === 'right' ? 'order-1 mr-8' : ''}`}>
                      {ctaButtons.map((button: any, index: number) => (
                        <a
                          key={index}
                          href={button.url || '#'}
                          style={{
                            backgroundColor: button.background_color || '#10b981',
                            color: button.text_color || '#ffffff'
                          }}
                          className="px-6 py-2 rounded-lg font-medium transition-all hover:opacity-90"
                        >
                          {button.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
        </nav>
      )}

      <main>
        {rows.length === 0 ? (
          <div className="text-center py-16 px-6">
            <Columns size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
            <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              No content yet
            </p>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Switch to Edit Mode to start building your page
            </p>
          </div>
        ) : (
          <>
            {rows.map((row) => {
              const getResponsiveValue = (base: any, responsive: any) => {
                return responsive?.[currentViewport] || base;
              };

              const padding = getResponsiveValue(row.padding, row.responsivePadding);
              const margin = getResponsiveValue(row.margin, row.responsiveMargin);

              const shouldStack =
                (currentViewport === 'mobile' && row.stackOnMobile) ||
                (currentViewport === 'tablet' && row.stackOnTablet);

              // Helper function to get overlay styles
              const getOverlayStyle = () => {
                if (!row.background?.overlayType || row.background.overlayType === 'none') {
                  return {};
                }

                const opacity = (row.background.overlayOpacity ?? 30) / 100;

                if (row.background.overlayType === 'solid') {
                  const color = row.background.overlayColor ?? '#000000';
                  // Convert hex to rgba
                  const r = parseInt(color.slice(1, 3), 16);
                  const g = parseInt(color.slice(3, 5), 16);
                  const b = parseInt(color.slice(5, 7), 16);
                  return { backgroundColor: `rgba(${r}, ${g}, ${b}, ${opacity})` };
                }

                if (row.background.overlayType === 'gradient') {
                  const start = row.background.overlayGradientStart ?? '#000000';
                  const end = row.background.overlayGradientEnd ?? '#ffffff';
                  const direction = row.background.overlayGradientDirection ?? 'to-bottom';

                  // Convert hex colors to rgba for opacity
                  const startR = parseInt(start.slice(1, 3), 16);
                  const startG = parseInt(start.slice(3, 5), 16);
                  const startB = parseInt(start.slice(5, 7), 16);
                  const endR = parseInt(end.slice(1, 3), 16);
                  const endG = parseInt(end.slice(3, 5), 16);
                  const endB = parseInt(end.slice(5, 7), 16);

                  return {
                    backgroundImage: `linear-gradient(${direction}, rgba(${startR}, ${startG}, ${startB}, ${opacity}), rgba(${endR}, ${endG}, ${endB}, ${opacity}))`
                  };
                }

                return {};
              };

              const extractYouTubeId = (url: string): string => {
                if (!url) return '';
                const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
                const match = url.match(regExp);
                return (match && match[7].length === 11) ? match[7] : '';
              };

              const maxWidth = row.responsiveMaxWidth?.[currentViewport] || row.maxWidth || undefined;
              const minHeight = row.responsiveMinHeight?.[currentViewport] || row.minHeight || undefined;
              const maxHeight = row.responsiveMaxHeight?.[currentViewport] || row.maxHeight || undefined;

              return (
                <div
                  key={row.id}
                  className="w-full relative overflow-hidden"
                  style={{
                    backgroundColor: row.background?.mediaType ? 'transparent' : (row.background?.type === 'color' ? row.background.value : undefined),
                    marginTop: margin?.top ? `${margin.top}px` : undefined,
                    marginBottom: margin?.bottom ? `${margin.bottom}px` : undefined,
                    marginLeft: margin?.left ? `${margin.left}px` : undefined,
                    marginRight: margin?.right ? `${margin.right}px` : undefined,
                    maxWidth: maxWidth || undefined,
                    minHeight: minHeight || undefined,
                    maxHeight: maxHeight || undefined
                  }}
                >
                  {/* Video Background */}
                  {row.background?.mediaType === 'video' && row.background.videoUrl && (
                    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
                      <iframe
                        src={`https://www.youtube.com/embed/${extractYouTubeId(row.background.videoUrl)}?autoplay=1&mute=1&controls=0&loop=1&playlist=${extractYouTubeId(row.background.videoUrl)}&playsinline=1`}
                        className="absolute top-1/2 left-1/2 w-[300%] h-[300%]"
                        style={{
                          transform: 'translate(-50%, -50%)',
                          pointerEvents: 'none'
                        }}
                        frameBorder="0"
                        allow="autoplay; encrypted-media"
                        title="Background video"
                      />
                    </div>
                  )}

                  {/* Image Background */}
                  {row.background?.mediaType === 'image' && row.background.value && (
                    <div
                      className={`absolute inset-0 w-full h-full bg-cover ${row.background.kenBurnsEffect ? 'ken-burns-effect' : ''}`}
                      style={{
                        backgroundImage: `url(${row.background.value})`,
                        backgroundPosition: row.background.imagePosition ?? 'center center',
                        backgroundSize: 'cover'
                      }}
                    />
                  )}

                  {/* Overlay */}
                  {(row.background?.mediaType === 'image' || row.background?.mediaType === 'video') && (
                    <div
                      className="absolute inset-0 w-full h-full"
                      style={getOverlayStyle()}
                    />
                  )}

                  {/* Content */}
                  <div
                    className={`relative z-10 ${row.fullWidth ? 'w-full grid grid-cols-12' : 'max-w-7xl mx-auto grid grid-cols-12'}`}
                    style={{
                      paddingTop: padding?.top !== undefined ? `${padding.top}px` : (row.fullWidth ? '0px' : '48px'),
                      paddingBottom: padding?.bottom !== undefined ? `${padding.bottom}px` : (row.fullWidth ? '0px' : '48px'),
                      paddingLeft: padding?.left !== undefined ? `${padding.left}px` : (row.fullWidth ? '0px' : '24px'),
                      paddingRight: padding?.right !== undefined ? `${padding.right}px` : (row.fullWidth ? '0px' : '24px'),
                      gap: row.columnGap !== undefined ? `${row.columnGap}px` : '24px'
                    }}
                  >
                    {row.columns.map((column) => {
                      const columnPadding = getResponsiveValue(column.padding, column.responsivePadding);
                      const columnMargin = getResponsiveValue(column.margin, column.responsiveMargin);

                      return (
                        <div
                          key={column.id}
                          style={{
                            gridColumn: shouldStack && row.columns.length > 1 ? `span 12` : `span ${column.width}`,
                            backgroundColor: column.background?.value,
                            marginTop: columnMargin?.top ? `${columnMargin.top}px` : undefined,
                            marginBottom: columnMargin?.bottom ? `${columnMargin.bottom}px` : undefined,
                            marginLeft: columnMargin?.left ? `${columnMargin.left}px` : undefined,
                            marginRight: columnMargin?.right ? `${columnMargin.right}px` : undefined,
                            paddingTop: columnPadding?.top ? `${columnPadding.top}px` : undefined,
                            paddingBottom: columnPadding?.bottom ? `${columnPadding.bottom}px` : undefined,
                            paddingLeft: columnPadding?.left ? `${columnPadding.left}px` : undefined,
                            paddingRight: columnPadding?.right ? `${columnPadding.right}px` : undefined
                          }}
                        >
                          {column.widgets.map((widget) => (
                            <div key={widget.id}>
                              <EventWidgetRenderer widget={widget} websiteId={websiteId} darkMode={darkMode} />
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </main>

      {globalSections.footer?.enabled && (
        <footer
          style={{
            backgroundColor: footerConfig.background_color || '#1e293b',
            color: footerConfig.text_color || '#94a3b8'
          }}
          className="py-12"
        >
          <div className="max-w-7xl mx-auto px-6">
            {/* Footer Columns */}
            {footerConfig.columns && footerConfig.columns.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
                {footerConfig.columns.map((column: any, index: number) => (
                  <div key={column.id || index}>
                    {column.title && (
                      <h3 className="font-bold text-white mb-3">
                        {column.title}
                      </h3>
                    )}
                    <div className="space-y-2">
                      {column.items?.map((item: any) => (
                        <a
                          key={item.id}
                          href={item.url || '#'}
                          className="block text-sm hover:opacity-75 transition-opacity"
                          style={{ color: footerConfig.text_color || '#94a3b8' }}
                        >
                          {item.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Social Links */}
            {footerConfig.show_social_links && footerConfig.social_links && (
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-white/10">
                {footerConfig.social_links.facebook && (
                  <a href={footerConfig.social_links.facebook} target="_blank" rel="noopener noreferrer" className="hover:opacity-75 transition-opacity">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </a>
                )}
                {footerConfig.social_links.instagram && (
                  <a href={footerConfig.social_links.instagram} target="_blank" rel="noopener noreferrer" className="hover:opacity-75 transition-opacity">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                  </a>
                )}
                {footerConfig.social_links.twitter && (
                  <a href={footerConfig.social_links.twitter} target="_blank" rel="noopener noreferrer" className="hover:opacity-75 transition-opacity">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
                  </a>
                )}
                {footerConfig.social_links.youtube && (
                  <a href={footerConfig.social_links.youtube} target="_blank" rel="noopener noreferrer" className="hover:opacity-75 transition-opacity">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  </a>
                )}
              </div>
            )}

            {/* Copyright */}
            {footerConfig.copyright_text && (
              <div
                className="text-sm text-center opacity-75"
                style={{ color: footerConfig.text_color || '#94a3b8' }}
              >
                {footerConfig.copyright_text}
              </div>
            )}
          </div>
        </footer>
      )}
    </div>
  );
};

export const EventPageBuilderInline: React.FC<Props> = ({ websiteId, pageSlug, pageTitle, darkMode = false }) => {
  const [rows, setRows] = useState<EventPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showWidgetLibrary, setShowWidgetLibrary] = useState(false);
  const [targetColumnId, setTargetColumnId] = useState<string | null>(null);
  const [editingWidget, setEditingWidget] = useState<{ columnId: string; widget: EventWidgetConfig } | null>(null);
  const [sliderWidgetId, setSliderWidgetId] = useState<string | null>(null);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editingColumn, setEditingColumn] = useState<{ rowIndex: number; columnId: string } | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [editMode, setEditMode] = useState<'wireframe' | 'visual'>('visual');
  const [activeWidget, setActiveWidget] = useState<EventWidgetConfig | null>(null);
  const [modalPosition, setModalPosition] = useState<'left' | 'right' | 'center' | null>(null);
  const [showPageSettings, setShowPageSettings] = useState(false);
  const [currentViewport, setCurrentViewport] = useState<DeviceType>('desktop');
  const [showRowLayoutSelector, setShowRowLayoutSelector] = useState(false);
  const [insertRowAfterIndex, setInsertRowAfterIndex] = useState<number | null>(null);
  const [pageSettings, setPageSettings] = useState({
    title: pageTitle,
    slug: pageSlug,
    page_type: 'custom' as string,
    is_homepage: false,
    is_published: true,
    show_in_navigation: true,
    seo_title: '',
    seo_description: ''
  });
  const [globalSections, setGlobalSections] = useState<{
    header: EventGlobalSection | null;
    menu: EventGlobalSection | null;
    footer: EventGlobalSection | null;
  }>({
    header: null,
    menu: null,
    footer: null
  });
  const { addNotification } = useNotifications();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  useEffect(() => {
    loadLayout();
    loadGlobalSections();
    loadPageSettings();
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

  const loadGlobalSections = async () => {
    try {
      const sections = await eventPageBuilderStorage.getAllGlobalSections(websiteId);
      setGlobalSections({
        header: sections.find(s => s.section_type === 'header') || null,
        menu: sections.find(s => s.section_type === 'menu') || null,
        footer: sections.find(s => s.section_type === 'footer') || null
      });
    } catch (error) {
      console.error('Error loading global sections:', error);
    }
  };

  const loadPageSettings = async () => {
    try {
      const { supabase } = await import('../../utils/supabase');
      const { data, error } = await supabase
        .from('event_page_layouts')
        .select('title, page_slug, page_type, is_homepage, is_published, show_in_navigation, navigation_order, seo_title, seo_description')
        .eq('event_website_id', websiteId)
        .eq('page_slug', pageSlug)
        .single();

      if (data && !error) {
        setPageSettings({
          title: data.title || pageTitle,
          slug: data.page_slug || pageSlug,
          page_type: data.page_type || 'custom',
          is_homepage: data.is_homepage || false,
          is_published: data.is_published !== undefined ? data.is_published : true,
          show_in_navigation: data.show_in_navigation !== undefined ? data.show_in_navigation : true,
          seo_title: data.seo_title || '',
          seo_description: data.seo_description || ''
        });
      }
    } catch (error) {
      console.error('Error loading page settings:', error);
    }
  };

  const addRow = (columnWidths?: number[]) => {
    try {
      let columns: EventPageColumn[];

      if (columnWidths && columnWidths.length > 0) {
        const gridWidths = columnWidths.map(width => Math.round((width / 100) * 12));
        const totalWidth = gridWidths.reduce((sum, w) => sum + w, 0);
        const diff = 12 - totalWidth;

        if (diff !== 0 && gridWidths.length > 0) {
          gridWidths[gridWidths.length - 1] += diff;
        }

        columns = gridWidths.map(width => ({
          id: uuidv4(),
          width: Math.max(1, Math.min(12, width)), // Ensure width is between 1 and 12
          widgets: []
        }));
      } else {
        columns = [{
          id: uuidv4(),
          width: 12,
          widgets: []
        }];
      }

      const newRow: EventPageRow = {
        id: uuidv4(),
        order: rows.length,
        columns
      };

      // If inserting after a specific row
      if (insertRowAfterIndex !== null) {
        const newRows = [...rows];
        newRows.splice(insertRowAfterIndex + 1, 0, newRow);
        newRows.forEach((r, i) => r.order = i);
        setRows(newRows);
        setInsertRowAfterIndex(null);
      } else {
        setRows([...rows, newRow]);
      }
      setShowRowLayoutSelector(false);
    } catch (error) {
      console.error('Error adding row:', error);
      addNotification('Failed to add row', 'error');
      setShowRowLayoutSelector(false);
    }
  };

  const updateRow = (index: number, updatedRow: EventPageRow) => {
    const newRows = [...rows];
    const oldRow = newRows[index];
    newRows[index] = updatedRow;
    setRows(newRows);

    // Check if a column was removed and close any modals for that column
    if (oldRow && editingColumn) {
      const columnStillExists = updatedRow.columns.some(col => col.id === editingColumn.columnId);
      if (!columnStillExists) {
        setEditingColumn(null);
        setEditingWidget(null);
      }
    }

    // Check if a widget was removed and close its modal
    if (oldRow && editingWidget) {
      let widgetStillExists = false;
      for (const column of updatedRow.columns) {
        if (column.widgets.some(w => w.id === editingWidget.widget.id)) {
          widgetStillExists = true;
          break;
        }
      }
      if (!widgetStillExists) {
        setEditingWidget(null);
      }
    }
  };

  const deleteRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
    // Reset editing states if we're deleting what's being edited
    if (editingRowIndex === index) {
      setEditingRowIndex(null);
    } else if (editingRowIndex !== null && editingRowIndex > index) {
      // Adjust index if deleting a row before the one being edited
      setEditingRowIndex(editingRowIndex - 1);
    }
    // Close any modals that might be open for this row
    setEditingWidget(null);
    setEditingColumn(null);
  };

  const addRowAfter = (afterIndex: number) => {
    // Open the row layout selector modal
    setInsertRowAfterIndex(afterIndex);
    setShowRowLayoutSelector(true);
  };

  const duplicateRow = (index: number) => {
    const rowToDuplicate = rows[index];
    const deepCopyRow = (row: EventPageRow): EventPageRow => ({
      ...row,
      id: uuidv4(),
      order: index + 1,
      columns: row.columns.map(col => ({
        ...col,
        id: uuidv4(),
        widgets: col.widgets.map(widget => ({
          ...widget,
          id: uuidv4()
        }))
      }))
    });

    const duplicatedRow = deepCopyRow(rowToDuplicate);
    const newRows = [...rows];
    newRows.splice(index + 1, 0, duplicatedRow);
    setRows(newRows.map((row, i) => ({ ...row, order: i })));
  };

  const duplicateColumn = (rowIndex: number, columnId: string) => {
    const row = rows[rowIndex];
    const columnToDuplicate = row.columns.find(col => col.id === columnId);
    if (!columnToDuplicate) return;

    const deepCopyColumn = (column: EventPageColumn): EventPageColumn => ({
      ...column,
      id: uuidv4(),
      widgets: column.widgets.map(widget => ({
        ...widget,
        id: uuidv4()
      }))
    });

    const duplicatedColumn = deepCopyColumn(columnToDuplicate);
    const columnIndex = row.columns.findIndex(col => col.id === columnId);
    const newColumns = [...row.columns];
    newColumns.splice(columnIndex + 1, 0, duplicatedColumn);

    // Redistribute widths equally
    const equalWidth = Math.floor(12 / newColumns.length);
    newColumns.forEach(col => col.width = equalWidth);

    const updatedRow = { ...row, columns: newColumns };
    const newRows = [...rows];
    newRows[rowIndex] = updatedRow;
    setRows(newRows);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeData = active.data.current;

    if (activeData?.type === 'widget') {
      setActiveWidget(activeData.widget);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveWidget(null);

    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Handle row reordering
    if (activeData?.type === 'row' && overData?.type === 'row') {
      const oldIndex = rows.findIndex(row => row.id === active.id);
      const newIndex = rows.findIndex(row => row.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newRows = arrayMove(rows, oldIndex, newIndex);
        setRows(newRows.map((row, index) => ({ ...row, order: index })));
      }
      return;
    }

    // Handle widget dragging
    if (activeData?.type === 'widget') {
      const sourceColumnId = activeData.columnId;
      const targetColumnId = overData?.type === 'column' ? overData.columnId : overData?.columnId;

      if (!targetColumnId) return;

      // Find source and target columns
      let sourceRow: EventPageRow | null = null;
      let targetRow: EventPageRow | null = null;
      let sourceColumn: EventPageColumn | null = null;
      let targetColumn: EventPageColumn | null = null;

      for (const row of rows) {
        for (const col of row.columns) {
          if (col.id === sourceColumnId) {
            sourceRow = row;
            sourceColumn = col;
          }
          if (col.id === targetColumnId) {
            targetRow = row;
            targetColumn = col;
          }
        }
      }

      if (!sourceColumn || !targetColumn) return;

      const sourceWidgetIndex = sourceColumn.widgets.findIndex(w => w.id === active.id);
      if (sourceWidgetIndex === -1) return;

      const widget = sourceColumn.widgets[sourceWidgetIndex];

      // Same column - reorder
      if (sourceColumnId === targetColumnId) {
        const targetWidgetIndex = overData?.type === 'widget'
          ? targetColumn.widgets.findIndex(w => w.id === over.id)
          : targetColumn.widgets.length;

        const newRows = rows.map(row => {
          if (row.id === sourceRow!.id) {
            return {
              ...row,
              columns: row.columns.map(col => {
                if (col.id === sourceColumnId) {
                  const newWidgets = [...col.widgets];
                  newWidgets.splice(sourceWidgetIndex, 1);
                  newWidgets.splice(targetWidgetIndex, 0, widget);
                  return { ...col, widgets: newWidgets };
                }
                return col;
              })
            };
          }
          return row;
        });
        setRows(newRows);
      }
      // Different columns - move
      else {
        const targetWidgetIndex = overData?.type === 'widget'
          ? targetColumn.widgets.findIndex(w => w.id === over.id)
          : targetColumn.widgets.length;

        const newRows = rows.map(row => {
          // Remove from source column
          if (row.id === sourceRow!.id) {
            return {
              ...row,
              columns: row.columns.map(col => {
                if (col.id === sourceColumnId) {
                  return { ...col, widgets: col.widgets.filter(w => w.id !== widget.id) };
                }
                // Add to target column if same row
                if (row.id === targetRow!.id && col.id === targetColumnId) {
                  const newWidgets = [...col.widgets];
                  newWidgets.splice(targetWidgetIndex, 0, widget);
                  return { ...col, widgets: newWidgets };
                }
                return col;
              })
            };
          }
          // Add to target column if different row
          if (row.id === targetRow!.id && sourceRow!.id !== targetRow!.id) {
            return {
              ...row,
              columns: row.columns.map(col => {
                if (col.id === targetColumnId) {
                  const newWidgets = [...col.widgets];
                  newWidgets.splice(targetWidgetIndex, 0, widget);
                  return { ...col, widgets: newWidgets };
                }
                return col;
              })
            };
          }
          return row;
        });
        setRows(newRows);
      }
    }
  };

  const handleAddWidget = (columnId: string) => {
    setTargetColumnId(columnId);
    setShowWidgetLibrary(true);
  };

  const handleSelectWidget = (widgetType: string) => {
    if (!targetColumnId) return;

    const widgetDef = getWidgetDefinition(widgetType);
    if (!widgetDef) return;

    const newWidget: EventWidgetConfig = {
      id: uuidv4(),
      type: widgetType as any,
      settings: widgetDef.defaultSettings,
      order: 0
    };

    const newRows = rows.map(row => ({
      ...row,
      columns: row.columns.map(col =>
        col.id === targetColumnId
          ? { ...col, widgets: [...col.widgets, newWidget] }
          : col
      )
    }));

    setRows(newRows);
    setShowWidgetLibrary(false);

    // Auto-open widget settings after adding
    const columnId = targetColumnId;
    const widgetId = newWidget.id;
    setTargetColumnId(null);

    // Use setTimeout to ensure the widget is rendered before opening settings
    setTimeout(() => {
      setEditingWidget({ columnId, widget: newWidget });
    }, 100);
  };

  const handleDeleteWidget = (columnId: string, widgetId: string) => {
    const newRows = rows.map(row => ({
      ...row,
      columns: row.columns.map(col =>
        col.id === columnId
          ? { ...col, widgets: col.widgets.filter(w => w.id !== widgetId) }
          : col
      )
    }));
    setRows(newRows);
    // Close widget editor if we're deleting the widget being edited
    if (editingWidget && editingWidget.widget.id === widgetId) {
      setEditingWidget(null);
    }
  };

  const handleMoveWidget = (fromColumnId: string, toColumnId: string, widgetId: string, newIndex: number) => {
    // Find the widget to move
    let widgetToMove: EventWidgetConfig | null = null;
    let sourceRowIndex = -1;
    let targetRowIndex = -1;

    // Find source widget and row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const sourceColumn = row.columns.find(c => c.id === fromColumnId);
      if (sourceColumn) {
        const widget = sourceColumn.widgets.find(w => w.id === widgetId);
        if (widget) {
          widgetToMove = widget;
          sourceRowIndex = i;
          break;
        }
      }
    }

    if (!widgetToMove || sourceRowIndex === -1) return;

    // Find target row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.columns.some(c => c.id === toColumnId)) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) return;

    // Create new rows array with the widget moved
    const newRows = rows.map((row, rowIdx) => {
      // Remove from source column
      if (rowIdx === sourceRowIndex) {
        const newColumns = row.columns.map(col => {
          if (col.id === fromColumnId) {
            return {
              ...col,
              widgets: col.widgets.filter(w => w.id !== widgetId)
            };
          }
          return col;
        });
        return { ...row, columns: newColumns };
      }
      return row;
    }).map((row, rowIdx) => {
      // Add to target column
      if (rowIdx === targetRowIndex) {
        const newColumns = row.columns.map(col => {
          if (col.id === toColumnId) {
            const newWidgets = [...col.widgets];
            // Adjust index if moving within the same column
            const adjustedIndex = (sourceRowIndex === targetRowIndex && fromColumnId === toColumnId)
              ? (newIndex > col.widgets.findIndex(w => w.id === widgetId) ? newIndex - 1 : newIndex)
              : newIndex;
            newWidgets.splice(adjustedIndex, 0, widgetToMove!);
            return {
              ...col,
              widgets: newWidgets
            };
          }
          return col;
        });
        return { ...row, columns: newColumns };
      }
      return row;
    });

    setRows(newRows);
  };

  const handleEditWidget = (columnId: string, widgetId: string) => {
    for (const row of rows) {
      for (const col of row.columns) {
        if (col.id === columnId) {
          const widget = col.widgets.find(w => w.id === widgetId);
          if (widget) {
            setEditingWidget({ columnId, widget });
            return;
          }
        }
      }
    }
  };

  const handleSaveWidget = (updatedWidget: EventWidgetConfig) => {
    if (!editingWidget) return;

    const newRows = rows.map(row => ({
      ...row,
      columns: row.columns.map(col =>
        col.id === editingWidget.columnId
          ? {
              ...col,
              widgets: col.widgets.map(w =>
                w.id === updatedWidget.id ? updatedWidget : w
              )
            }
          : col
      )
    }));
    setRows(newRows);
  };

  const handleManageSlides = (widgetId: string) => {
    setSliderWidgetId(widgetId);
  };

  const handleOpenColumnSettings = (rowIndex: number, columnId: string) => {
    setEditingColumn({ rowIndex, columnId });
  };

  const handleSaveColumn = (updatedColumn: EventPageColumn) => {
    if (!editingColumn) return;

    const newRows = [...rows];
    const row = newRows[editingColumn.rowIndex];
    row.columns = row.columns.map(col =>
      col.id === updatedColumn.id ? updatedColumn : col
    );
    setRows(newRows);
    setEditingColumn(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);

    console.log('Saving page layout...', { websiteId, pageSlug, rowCount: rows.length });

    try {
      const success = await eventPageBuilderStorage.savePageLayout({
        event_website_id: websiteId,
        page_slug: pageSlug,
        rows: rows
      });

      console.log('Save result:', success);

      if (success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        console.log('Page saved successfully!');
        addNotification('Successfully Updated', 'success');
      } else {
        console.error('Save returned false');
        addNotification('Failed to save page. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error saving layout:', error);
      addNotification(`Failed to save page: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="space-y-6 transition-all duration-300"
      style={{
        marginLeft: modalPosition === 'left' ? '520px' : undefined,
        marginRight: modalPosition === 'right' ? '520px' : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {pageTitle}
          </h3>
          <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            {previewMode ? 'Preview how your page will look live' : 'Build your page by adding rows and widgets'}
            {!previewMode && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-cyan-500/20 text-cyan-400 font-medium">
                Editing for {currentViewport}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center rounded-xl overflow-hidden border ${
            darkMode ? 'border-slate-700' : 'border-slate-300'
          }`}>
            <button
              onClick={() => setCurrentViewport('desktop')}
              className={`px-4 py-2 transition-all ${
                currentViewport === 'desktop'
                  ? 'bg-cyan-500 text-white'
                  : darkMode
                  ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title="Desktop View"
            >
              <Monitor size={18} />
            </button>
            <button
              onClick={() => setCurrentViewport('tablet')}
              className={`px-4 py-2 transition-all border-x ${
                darkMode ? 'border-slate-700' : 'border-slate-300'
              } ${
                currentViewport === 'tablet'
                  ? 'bg-cyan-500 text-white'
                  : darkMode
                  ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title="Tablet View"
            >
              <Tablet size={18} />
            </button>
            <button
              onClick={() => setCurrentViewport('mobile')}
              className={`px-4 py-2 transition-all ${
                currentViewport === 'mobile'
                  ? 'bg-cyan-500 text-white'
                  : darkMode
                  ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title="Mobile View"
            >
              <Smartphone size={18} />
            </button>
          </div>

          {/* Edit Mode Switcher (Wireframe vs Visual) */}
          {!previewMode && (
            <div className={`flex items-center rounded-xl overflow-hidden border ${
              darkMode ? 'border-slate-700' : 'border-slate-300'
            }`}>
              <button
                onClick={() => setEditMode('wireframe')}
                className={`flex items-center gap-2 px-4 py-2 transition-all ${
                  editMode === 'wireframe'
                    ? 'bg-cyan-500 text-white'
                    : darkMode
                    ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
                title="Wireframe Mode"
              >
                <Grid size={18} />
                <span className="text-sm font-medium">Wireframe</span>
              </button>
              <button
                onClick={() => setEditMode('visual')}
                className={`flex items-center gap-2 px-4 py-2 transition-all border-l ${
                  darkMode ? 'border-slate-700' : 'border-slate-300'
                } ${
                  editMode === 'visual'
                    ? 'bg-cyan-500 text-white'
                    : darkMode
                    ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
                title="Visual Edit Mode"
              >
                <Pencil size={18} />
                <span className="text-sm font-medium">Visual</span>
              </button>
            </div>
          )}

          {!previewMode && (
            <>
              <button
                onClick={() => setShowPageSettings(true)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                  darkMode
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300'
                }`}
              >
                <Settings size={18} />
                <span>Page Settings</span>
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl hover:shadow-lg hover:shadow-cyan-500/30 transition-all hover:scale-[1.02] font-medium disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : saveSuccess ? (
                  <>
                    <AlertCircle size={18} />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    <span>Save Page</span>
                  </>
                )}
              </button>
            </>
          )}
          <button
            onClick={() => {
              setPreviewMode(!previewMode);
              if (!previewMode) {
                loadGlobalSections();
              }
            }}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              previewMode
                ? 'bg-slate-700 hover:bg-slate-600 text-white'
                : darkMode
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            }`}
          >
            {previewMode ? (
              <>
                <Edit3 size={18} />
                <span>Edit Mode</span>
              </>
            ) : (
              <>
                <Eye size={18} />
                <span>Preview</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex justify-center">
        <div
          className={`transition-all duration-300 ${
            currentViewport === 'desktop'
              ? 'w-full'
              : currentViewport === 'tablet'
              ? 'w-[768px]'
              : 'w-[375px]'
          }`}
          style={{
            maxWidth: currentViewport === 'desktop' ? '100%' : undefined,
            margin: '0 auto'
          }}
        >
          {previewMode ? (
            <PreviewRenderer
              rows={rows}
              globalSections={globalSections}
              websiteId={websiteId}
              currentViewport={currentViewport}
              darkMode={darkMode}
            />
          ) : editMode === 'visual' ? (
            <VisualEditRenderer
              rows={rows}
              globalSections={globalSections}
              websiteId={websiteId}
              currentViewport={currentViewport}
              darkMode={darkMode}
              onUpdateRow={(index, row) => updateRow(index, row)}
              onDeleteRow={(index) => deleteRow(index)}
              onDuplicateRow={(index) => duplicateRow(index)}
              onAddWidget={handleAddWidget}
              onDeleteWidget={handleDeleteWidget}
              onEditWidget={handleEditWidget}
              onManageSlides={handleManageSlides}
              onOpenRowSettings={(index) => setEditingRowIndex(index)}
              onOpenColumnSettings={handleOpenColumnSettings}
              onAddRow={addRowAfter}
              onMoveWidget={handleMoveWidget}
            />
          ) : (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                {rows.map((row, index) => (
                  <SortableRow
                    key={row.id}
                    row={row}
                    index={index}
                    websiteId={websiteId}
                    onUpdate={(updatedRow) => updateRow(index, updatedRow)}
                    onDelete={() => deleteRow(index)}
                    onDuplicate={() => duplicateRow(index)}
                    onAddWidget={handleAddWidget}
                    onDeleteWidget={handleDeleteWidget}
                    onEditWidget={handleEditWidget}
                    onManageSlides={handleManageSlides}
                    onOpenRowSettings={() => setEditingRowIndex(index)}
                    onOpenColumnSettings={(columnId) => handleOpenColumnSettings(index, columnId)}
                    currentViewport={currentViewport}
                    darkMode={darkMode}
                  />
                ))}
              </SortableContext>

              {/* Drag Overlay */}
              <DragOverlay>
                {activeWidget && (() => {
                  const widgetDef = getWidgetDefinition(activeWidget.type);
                  const IconComponent = widgetDef?.icon ?
                    (() => {
                      const icons = { Image, Clock, Info, FileText, Calendar, Trophy, MapPin, Users, Camera, Video, Newspaper, Cloud, Map, Type, Square, MousePointer, Layout, Minus, Mail, Phone, MessageSquare, Award, Sparkles };
                      return (icons as any)[widgetDef.icon] || Square;
                    })() : Square;

                  return (
                    <div
                      className={`rounded-xl border-2 overflow-hidden shadow-2xl w-96 ${
                        darkMode
                          ? 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700'
                          : 'bg-gradient-to-br from-white to-slate-50 border-slate-200'
                      }`}
                    >
                      {/* Widget Header */}
                      <div className={`p-3 border-b ${
                        darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-100 bg-slate-50/50'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            darkMode ? 'bg-cyan-500/10' : 'bg-cyan-50'
                          }`}>
                            <GripVertical size={16} className="text-cyan-500" />
                          </div>
                          <div className={`p-2 rounded-lg ${
                            darkMode ? 'bg-cyan-500/10' : 'bg-cyan-50'
                          }`}>
                            <IconComponent size={20} className="text-cyan-500" />
                          </div>
                          <div className="flex-1">
                            <div className={`text-sm font-semibold ${
                              darkMode ? 'text-white' : 'text-slate-900'
                            }`}>
                              {widgetDef?.name || activeWidget.type}
                            </div>
                            <div className={`text-xs ${
                              darkMode ? 'text-slate-400' : 'text-slate-500'
                            }`}>
                              {widgetDef?.category.toUpperCase()}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Dragging Indicator */}
                      <div className="p-4 text-center">
                        <div className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                          Drop to place widget
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </DragOverlay>
            </DndContext>

            {rows.length === 0 && (
              <div className={`text-center py-16 rounded-xl border-2 border-dashed ${
                darkMode ? 'border-slate-700 bg-slate-800/30' : 'border-slate-300 bg-slate-50'
              }`}>
                <Columns size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
                <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Start Building Your Page
                </p>
                <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Add rows and columns, then fill them with widgets
                </p>
              </div>
            )}

            <button
              onClick={() => setShowRowLayoutSelector(true)}
              className={`w-full mt-4 py-4 rounded-xl border-2 border-dashed font-medium transition-colors ${
                darkMode
                  ? 'border-slate-700 hover:border-cyan-500 hover:bg-cyan-500/10 text-slate-400 hover:text-cyan-400'
                  : 'border-slate-300 hover:border-cyan-500 hover:bg-cyan-50 text-slate-600 hover:text-cyan-600'
              }`}
            >
              <Plus size={20} className="inline mr-2" />
              Add Row
            </button>
          </>
        )}
        </div>
      </div>

      {/* Widget Library Modal */}
      {showWidgetLibrary && (
        <EventWidgetLibraryModal
          onSelectWidget={handleSelectWidget}
          onClose={() => {
            setShowWidgetLibrary(false);
            setTargetColumnId(null);
          }}
          darkMode={darkMode}
        />
      )}

      {/* Widget Settings Modal */}
      {editingWidget && (
        <EventWidgetSettingsModal
          widget={editingWidget.widget}
          websiteId={websiteId}
          onSave={handleSaveWidget}
          onClose={() => {
            setEditingWidget(null);
            setModalPosition(null);
          }}
          darkMode={darkMode}
          initialViewport={currentViewport}
          onPositionChange={setModalPosition}
        />
      )}

      {/* Slider Management Modal */}
      {sliderWidgetId && (
        <SliderManagementModal
          isOpen={true}
          onClose={() => setSliderWidgetId(null)}
          websiteId={websiteId}
          widgetId={sliderWidgetId}
        />
      )}

      {/* Row Settings Modal */}
      {editingRowIndex !== null && rows[editingRowIndex] && (
        <RowSettingsModal
          row={rows[editingRowIndex]}
          onSave={(updatedRow) => {
            updateRow(editingRowIndex, updatedRow);
            setEditingRowIndex(null);
            setModalPosition(null);
          }}
          onClose={() => {
            setEditingRowIndex(null);
            setModalPosition(null);
          }}
          darkMode={darkMode}
          websiteId={websiteId}
          onPositionChange={setModalPosition}
        />
      )}

      {/* Column Settings Modal */}
      {editingColumn !== null && (() => {
        const row = rows[editingColumn.rowIndex];
        if (!row) return null;
        const column = row.columns.find(col => col.id === editingColumn.columnId);
        return column ? (
          <ColumnSettingsModal
            column={column}
            onSave={handleSaveColumn}
            onClose={() => {
              setEditingColumn(null);
              setModalPosition(null);
            }}
            currentViewport={currentViewport}
            darkMode={darkMode}
            onPositionChange={setModalPosition}
          />
        ) : null;
      })()}

      {/* Row Layout Selector Modal */}
      {showRowLayoutSelector && (
        <RowLayoutSelectorModal
          onSelect={(columnWidths) => addRow(columnWidths)}
          onClose={() => setShowRowLayoutSelector(false)}
          darkMode={darkMode}
        />
      )}

      {/* Page Settings Modal */}
      {showPageSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto ${
            darkMode ? 'bg-slate-800' : 'bg-white'
          }`}>
            {/* Modal Header */}
            <div className={`sticky top-0 px-6 py-4 border-b ${
              darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
            } z-10`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Page Settings
                  </h3>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Configure page metadata and visibility
                  </p>
                </div>
                <button
                  onClick={() => setShowPageSettings(false)}
                  className={`p-2 rounded-lg transition-colors ${
                    darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Page Title */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Page Title
                </label>
                <input
                  type="text"
                  value={pageSettings.title}
                  onChange={(e) => setPageSettings({ ...pageSettings, title: e.target.value })}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-900'
                  } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                  placeholder="e.g., Homepage"
                />
              </div>

              {/* URL Slug */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  URL Slug
                </label>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>/events/{websiteId.slice(0, 8)}.../</span>
                  <input
                    type="text"
                    value={pageSettings.slug.replace(/^\//, '')}
                    onChange={(e) => setPageSettings({ ...pageSettings, slug: '/' + e.target.value.replace(/^\//, '') })}
                    className={`flex-1 px-4 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500'
                        : 'bg-white border-slate-300 text-slate-900'
                    } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                    placeholder="home"
                  />
                </div>
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                  Use lowercase letters, numbers, and hyphens only
                </p>
              </div>

              {/* Page Type */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Page Type
                </label>
                <select
                  value={pageSettings.page_type}
                  onChange={(e) => setPageSettings({ ...pageSettings, page_type: e.target.value })}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
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
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                  Helps categorize your page for organization
                </p>
              </div>

              {/* Checkboxes */}
              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pageSettings.is_homepage}
                    onChange={(e) => setPageSettings({ ...pageSettings, is_homepage: e.target.checked })}
                    className="mt-1 w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <div>
                    <div className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Make Default Homepage
                    </div>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      This page will be shown when visitors access your event website URL
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pageSettings.is_published}
                    onChange={(e) => setPageSettings({ ...pageSettings, is_published: e.target.checked })}
                    className="mt-1 w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <div>
                    <div className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Publish Page
                    </div>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Make this page visible to the public
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pageSettings.show_in_navigation}
                    onChange={(e) => setPageSettings({ ...pageSettings, show_in_navigation: e.target.checked })}
                    className="mt-1 w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <div>
                    <div className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Show in Navigation
                    </div>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Display this page in the website menu
                    </p>
                  </div>
                </label>
              </div>

              {/* SEO Section */}
              <div className={`pt-6 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <h4 className={`text-sm font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  SEO Settings (Optional)
                </h4>

                <div className="space-y-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      SEO Title
                    </label>
                    <input
                      type="text"
                      value={pageSettings.seo_title}
                      onChange={(e) => setPageSettings({ ...pageSettings, seo_title: e.target.value })}
                      className={`w-full px-4 py-2 rounded-lg border ${
                        darkMode
                          ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500'
                          : 'bg-white border-slate-300 text-slate-900'
                      } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                      placeholder="Custom title for search engines"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      SEO Description
                    </label>
                    <textarea
                      value={pageSettings.seo_description}
                      onChange={(e) => setPageSettings({ ...pageSettings, seo_description: e.target.value })}
                      rows={3}
                      className={`w-full px-4 py-2 rounded-lg border ${
                        darkMode
                          ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500'
                          : 'bg-white border-slate-300 text-slate-900'
                      } focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none`}
                      placeholder="Brief description for search engines"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className={`sticky bottom-0 px-6 py-4 border-t ${
              darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
            } flex justify-end gap-3`}>
              <button
                onClick={() => setShowPageSettings(false)}
                className={`px-6 py-2.5 rounded-lg font-medium transition-colors ${
                  darkMode
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    const { supabase } = await import('../../utils/supabase');
                    const { error } = await supabase
                      .from('event_page_layouts')
                      .update({
                        title: pageSettings.title,
                        page_slug: pageSettings.slug,
                        page_type: pageSettings.page_type,
                        is_homepage: pageSettings.is_homepage,
                        is_published: pageSettings.is_published,
                        show_in_navigation: pageSettings.show_in_navigation,
                        seo_title: pageSettings.seo_title || null,
                        seo_description: pageSettings.seo_description || null,
                        updated_at: new Date().toISOString()
                      })
                      .eq('event_website_id', websiteId)
                      .eq('page_slug', pageSlug);

                    if (error) throw error;

                    addNotification('Page settings saved successfully!', 'success');
                    setShowPageSettings(false);

                    // Reload page settings to reflect any database changes
                    await loadPageSettings();
                  } catch (error) {
                    console.error('Error saving page settings:', error);
                    addNotification('error', 'Failed to save page settings');
                  }
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-cyan-500/30 transition-all"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

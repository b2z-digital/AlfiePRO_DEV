import React, { useState, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDroppable
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable';
import { Edit2, Check, Plus, RotateCcw, Columns, LayoutGrid, GripVertical, Sparkles, Pencil, Save } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { WidgetConfig, DashboardLayout, DashboardRow } from '../../types/dashboard';
import { loadDashboardLayout, saveDashboardLayout, resetDashboardLayout, getTemplateForUser } from '../../utils/dashboardStorage';
import { getWidgetDefinition } from './WidgetRegistry';
import { SortableWidget } from './SortableWidget';
import { WidgetLibraryModal } from './WidgetLibraryModal';
import { SaveTemplateModal } from './SaveTemplateModal';
import { DASHBOARD_TEMPLATES } from '../../constants/dashboardTemplates';
import { saveTemplate } from '../../utils/dashboardTemplateStorage';
import { v4 as uuidv4 } from 'uuid';
import { useNotifications } from '../../contexts/NotificationContext';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '../../utils/supabase';

interface DroppableSlotProps {
  rowId: string;
  columnIndex: number;
  isEditMode: boolean;
  onAddWidgetToSlot: (rowId: string, columnIndex: number) => void;
}

const DroppableSlot: React.FC<DroppableSlotProps> = ({ rowId, columnIndex, isEditMode, onAddWidgetToSlot }) => {
  const droppableId = `${rowId}-slot-${columnIndex}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { rowId, columnIndex }
  });

  return (
    <div
      ref={setNodeRef}
      onClick={() => onAddWidgetToSlot(rowId, columnIndex)}
      className={`h-full rounded-2xl border-2 border-dashed ${
        isOver ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600/50 hover:border-slate-500'
      } flex items-center justify-center cursor-pointer transition-colors`}
    >
      <div className="text-center">
        <Plus className="mx-auto mb-2 text-slate-500" size={32} />
        <p className="text-sm text-slate-400">Add Widget</p>
      </div>
    </div>
  );
};

interface SortableRowProps {
  row: DashboardRow;
  widgets: WidgetConfig[];
  isEditMode: boolean;
  onRemoveWidget: (widgetId: string) => void;
  onRemoveRow: (rowId: string) => void;
  onAddWidgetToSlot: (rowId: string, columnIndex: number) => void;
  onToggleRowHeight: (rowId: string) => void;
  onUpdateTheme: (widgetId: string, theme: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({
  row,
  widgets,
  isEditMode,
  onRemoveWidget,
  onRemoveRow,
  onAddWidgetToSlot,
  onToggleRowHeight,
  onUpdateTheme
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: row.id, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getColumnClass = (columns: number): string => {
    switch (columns) {
      case 1: return 'grid-cols-1';
      case 2: return 'grid-cols-1 lg:grid-cols-2';
      case 3: return 'grid-cols-1 lg:grid-cols-3';
      case 4: return 'grid-cols-1 lg:grid-cols-4';
      default: return 'grid-cols-1 lg:grid-cols-3';
    }
  };

  // Create an array representing all columns in the row
  const columns = Array.from({ length: row.columns }, (_, index) => {
    const widget = widgets.find(w => w.columnIndex === index);
    return { index, widget };
  });

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {isEditMode && (
        <div className="flex items-center justify-between mb-2 group">
          <div className="flex items-center gap-2">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-slate-700/30 rounded transition-colors"
              title="Drag to reorder row"
            >
              <GripVertical size={16} className="text-slate-500" />
            </div>
            <span className="text-xs text-slate-400">
              {row.columns} Column{row.columns > 1 ? 's' : ''} Row
            </span>
            <button
              onClick={() => onToggleRowHeight(row.id)}
              className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 bg-slate-700/30 hover:bg-slate-700/50 rounded transition-colors"
              title="Toggle row height"
            >
              {row.height === 'compact' ? 'Default' : 'Compact'}
            </button>
          </div>
          <button
            onClick={() => onRemoveRow(row.id)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Remove Row
          </button>
        </div>
      )}
      <SortableContext
        items={widgets.map(w => w.id)}
        strategy={verticalListSortingStrategy}
        disabled={!isEditMode}
      >
        <div className={`grid ${getColumnClass(row.columns)} gap-6`}>
          {columns.map(({ index, widget }) => (
            <div key={`${row.id}-col-${index}`} className={row.height === 'compact' ? 'min-h-[120px]' : 'min-h-[200px]'}>
              {widget ? (
                <SortableWidget
                  key={`${widget.id}-${widget.settings?.colorTheme || 'default'}`}
                  widget={widget}
                  isEditMode={isEditMode}
                  onRemove={() => onRemoveWidget(widget.id)}
                  onUpdateTheme={onUpdateTheme}
                />
              ) : isEditMode ? (
                <DroppableSlot
                  rowId={row.id}
                  columnIndex={index}
                  isEditMode={isEditMode}
                  onAddWidgetToSlot={onAddWidgetToSlot}
                />
              ) : null}
            </div>
          ))}
        </div>
      </SortableContext>
    </div>
  );
};

export const CustomizableDashboard: React.FC = () => {
  const { user, currentClub, currentOrganization } = useAuth();
  const { addNotification } = useNotifications();
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [targetRowId, setTargetRowId] = useState<string | null>(null);
  const [targetColumnIndex, setTargetColumnIndex] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingSystemTemplate, setEditingSystemTemplate] = useState<string | null>(null);
  const [originalLayoutBeforeEdit, setOriginalLayoutBeforeEdit] = useState<{ widgets: WidgetConfig[], rows: DashboardRow[] } | null>(null);
  const newRowRef = useRef<HTMLDivElement | null>(null);

  const isSuperAdmin = user?.user_metadata?.is_super_admin || false;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    if (user) {
      loadLayout();
    }
  }, [user, currentClub?.clubId, currentOrganization?.id, currentOrganization?.type]);

  const loadLayout = async () => {
    if (!user) {
      console.warn('⚠️ Cannot load layout: no user');
      setLoading(false);
      return;
    }

    setLoading(true);

    // Set a fallback timeout - if loading takes more than 10 seconds, stop loading state
    const loadTimeout = setTimeout(() => {
      console.warn('⚠️ Dashboard layout loading timeout - completing with empty state');
      setLoading(false);
    }, 10000);

    try {
      console.log('📥 CustomizableDashboard: Loading layout');

      // Build organization context
      const context = {
        clubId: currentClub?.clubId || null,
        stateAssociationId: currentOrganization?.type === 'state' ? currentOrganization.id : null,
        nationalAssociationId: currentOrganization?.type === 'national' ? currentOrganization.id : null
      };

      // Add timeout to loadDashboardLayout
      const layoutPromise = loadDashboardLayout(user.id, context);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Layout load timeout')), 8000)
      );

      const layout = await Promise.race([layoutPromise, timeoutPromise]);

      // If no saved layout and user has a club, check for role-based template
      if (layout.widgets.length === 0 && layout.rows.length === 0 && currentClub?.clubId) {
        console.log('🎨 No saved layout, checking for role-based template');

        try {
          const templatePromise = getTemplateForUser(currentClub.clubId, user.id);
          const templateTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Template load timeout')), 3000)
          );

          const roleTemplate = await Promise.race([templatePromise, templateTimeout]);

          if (roleTemplate) {
            console.log('✨ Applying role-based template:', roleTemplate.name);
            clearTimeout(loadTimeout);
            handleApplyTemplate(roleTemplate.template_id);
            return;
          }
        } catch (templateError) {
          console.warn('Could not load role template:', templateError);
          // Continue with empty layout
        }
      }

      // Ensure rows have order field
      const sortedRows = layout.rows.map((row, index) => ({
        ...row,
        order: row.order ?? index
      })).sort((a, b) => a.order - b.order);

      console.log('📋 Setting rows after load:', sortedRows.map(r => ({ id: r.id, height: r.height })));

      setWidgets(layout.widgets);
      setRows(sortedRows);
    } catch (error) {
      console.error('❌ Error loading layout:', error);
      // Set empty state on error so dashboard doesn't hang
      setWidgets([]);
      setRows([]);
    } finally {
      clearTimeout(loadTimeout);
      setLoading(false);
    }
  };

  const saveLayout = async () => {
    if (!user) return;

    setSaving(true);
    try {
      console.log('💾 Preparing to save layout with rows:', rows.map(r => ({ id: r.id, height: r.height, columns: r.columns })));

      const layout: DashboardLayout = {
        widgets,
        rows,
        version: 1
      };

      // Build organization context
      const context = {
        clubId: currentClub?.clubId || null,
        stateAssociationId: currentOrganization?.type === 'state' ? currentOrganization.id : null,
        nationalAssociationId: currentOrganization?.type === 'national' ? currentOrganization.id : null
      };

      const result = await saveDashboardLayout(user.id, context, layout);
      if (result.success) {
        console.log('✅ Layout saved successfully');
        addNotification('success', 'Dashboard layout saved successfully');
        return true;
      } else {
        console.error('❌ Layout save failed:', result.error);
        addNotification('error', 'Failed to save dashboard layout');
        return false;
      }
    } catch (error) {
      console.error('❌ Exception during layout save:', error);
      addNotification('error', 'An error occurred while saving dashboard layout');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) {
      return;
    }

    // Check if we're dragging rows
    const activeRow = rows.find(r => r.id === active.id);
    const overRow = rows.find(r => r.id === over.id);

    if (activeRow && overRow) {
      const oldIndex = rows.findIndex(r => r.id === active.id);
      const newIndex = rows.findIndex(r => r.id === over.id);
      const reorderedRows = arrayMove(rows, oldIndex, newIndex).map((row, index) => ({
        ...row,
        order: index
      }));
      setRows(reorderedRows);
      return;
    }

    // Check if we're dragging a widget
    const activeWidget = widgets.find(w => w.id === active.id);
    if (!activeWidget) return;

    // Check if we're dropping on an empty slot
    const overIdStr = String(over.id);
    if (overIdStr.includes('-slot-')) {
      const targetRowId = over.data.current?.rowId;
      const targetColumnIndex = over.data.current?.columnIndex;

      if (targetRowId !== undefined && targetColumnIndex !== undefined) {
        const activeRowObj = rows.find(r => r.widgetIds.includes(active.id as string));
        if (!activeRowObj) return;

        // Update the widget with new row and column
        const updatedWidgets = widgets.map(widget => {
          if (widget.id === activeWidget.id) {
            return {
              ...widget,
              rowId: targetRowId,
              columnIndex: targetColumnIndex
            };
          }
          return widget;
        });

        // Update rows to reflect widget movement
        const updatedRows = rows.map(row => {
          if (row.id === activeRowObj.id && row.id !== targetRowId) {
            // Remove widget from source row (only if moving to different row)
            return {
              ...row,
              widgetIds: row.widgetIds.filter(id => id !== activeWidget.id)
            };
          }
          if (row.id === targetRowId) {
            // Add widget to target row if not already there
            if (!row.widgetIds.includes(activeWidget.id)) {
              return {
                ...row,
                widgetIds: [...row.widgetIds, activeWidget.id]
              };
            }
          }
          return row;
        });

        setWidgets(updatedWidgets);
        setRows(updatedRows);
        return;
      }
    }

    // Check if we're dropping on another widget
    const overWidget = widgets.find(w => w.id === over.id);

    if (activeWidget && overWidget) {
      // Find which rows contain these widgets
      const activeRowObj = rows.find(r => r.widgetIds.includes(active.id as string));
      const overRowObj = rows.find(r => r.widgetIds.includes(over.id as string));

      if (!activeRowObj || !overRowObj) return;

      // If same row, swap widget positions
      if (activeRowObj.id === overRowObj.id) {
        const activeColumnIndex = activeWidget.columnIndex ?? 0;
        const overColumnIndex = overWidget.columnIndex ?? 0;

        // Swap the columnIndex values
        const updatedWidgets = widgets.map(widget => {
          if (widget.id === activeWidget.id) {
            return { ...widget, columnIndex: overColumnIndex };
          }
          if (widget.id === overWidget.id) {
            return { ...widget, columnIndex: activeColumnIndex };
          }
          return widget;
        });

        setWidgets(updatedWidgets);
      } else {
        // Moving widget to different row
        const overColumnIndex = overWidget.columnIndex ?? 0;

        // Update the widget with new row and column
        const updatedWidgets = widgets.map(widget => {
          if (widget.id === activeWidget.id) {
            return {
              ...widget,
              rowId: overRowObj.id,
              columnIndex: overColumnIndex
            };
          }
          // Shift the overWidget to make room
          if (widget.id === overWidget.id) {
            // Find an empty slot in the over row
            const overRowWidgets = widgets.filter(w =>
              overRowObj.widgetIds.includes(w.id)
            );
            let newColumnIndex = overColumnIndex + 1;

            // Find next available column in the target row
            while (
              newColumnIndex < overRowObj.columns &&
              overRowWidgets.some(w => w.columnIndex === newColumnIndex)
            ) {
              newColumnIndex++;
            }

            // If no space, keep original position
            if (newColumnIndex >= overRowObj.columns) {
              return widget;
            }

            return { ...widget, columnIndex: newColumnIndex };
          }
          return widget;
        });

        // Update rows to reflect widget movement
        const updatedRows = rows.map(row => {
          if (row.id === activeRowObj.id) {
            // Remove widget from source row
            return {
              ...row,
              widgetIds: row.widgetIds.filter(id => id !== activeWidget.id)
            };
          }
          if (row.id === overRowObj.id) {
            // Add widget to target row if not already there
            if (!row.widgetIds.includes(activeWidget.id)) {
              return {
                ...row,
                widgetIds: [...row.widgetIds, activeWidget.id]
              };
            }
          }
          return row;
        });

        setWidgets(updatedWidgets);
        setRows(updatedRows);
      }
    }
  };

  const handleRemoveWidget = (widgetId: string) => {
    setWidgets(widgets.filter(w => w.id !== widgetId));
    setRows(rows.map(row => ({
      ...row,
      widgetIds: row.widgetIds.filter(id => id !== widgetId)
    })));
  };

  const handleRemoveRow = (rowId: string) => {
    // Remove widgets in this row
    const row = rows.find(r => r.id === rowId);
    if (row) {
      setWidgets(widgets.filter(w => !row.widgetIds.includes(w.id)));
    }
    setRows(rows.filter(r => r.id !== rowId));
  };

  const handleUpdateWidgetTheme = (widgetId: string, theme: string) => {
    setWidgets(prevWidgets => prevWidgets.map(widget => {
      if (widget.id === widgetId) {
        return {
          ...widget,
          settings: {
            ...widget.settings,
            colorTheme: theme
          }
        };
      }
      return widget;
    }));
  };

  const handleAddWidget = (widgetType: string) => {
    const definition = getWidgetDefinition(widgetType);
    if (!definition) return;

    const newWidget: WidgetConfig = {
      id: `${widgetType}-${Date.now()}`,
      type: widgetType,
      position: { x: 0, y: 0, w: 1, h: 1 },
      columnSpan: 1,
      rowId: targetRowId || undefined,
      columnIndex: targetColumnIndex ?? undefined
    };

    if (targetRowId !== null && targetColumnIndex !== null) {
      setRows(rows.map(row => {
        if (row.id === targetRowId) {
          return {
            ...row,
            widgetIds: [...row.widgetIds, newWidget.id]
          };
        }
        return row;
      }));
    }

    setWidgets([...widgets, newWidget]);
    setShowLibrary(false);
    setTargetRowId(null);
    setTargetColumnIndex(null);
  };

  const handleApplyTemplate = async (templateId: string) => {
    console.log('handleApplyTemplate called with ID:', templateId);

    // First try to load from database (this allows edited system templates to work)
    try {
      const { data: dbTemplate, error } = await supabase
        .from('dashboard_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (dbTemplate && !error) {
        console.log('Loading template from database:', dbTemplate.name);
        // Load from database template_data
        const templateLayout = dbTemplate.template_data?.lg || [];
        const rowConfigs = dbTemplate.template_data?.row_configs || [];

        const rowMap = new Map<number, DashboardRow>();
        const newWidgets: WidgetConfig[] = [];

        templateLayout.forEach((widgetConfig: any) => {
          const rowNum = widgetConfig.row;

          if (!rowMap.has(rowNum)) {
            const rowWidgets = templateLayout.filter((w: any) => w.row === rowNum);
            const columns = rowWidgets.length;
            const rowConfig = rowConfigs.find((r: any) => r.row === rowNum);

            rowMap.set(rowNum, {
              id: `row-${uuidv4()}`,
              columns,
              widgetIds: [],
              order: rowNum,
              height: rowConfig?.height || 'default'
            });
          }

          const row = rowMap.get(rowNum)!;
          const rowWidgets = templateLayout.filter((w: any) => w.row === rowNum);
          const sortedRowWidgets = rowWidgets.sort((a: any, b: any) => a.col - b.col);
          const columnIndex = sortedRowWidgets.findIndex((w: any) => w.col === widgetConfig.col);

          const newWidget: WidgetConfig = {
            id: uuidv4(),
            type: widgetConfig.type,
            settings: widgetConfig.settings || {},
            colorTheme: widgetConfig.colorTheme || 'default',
            rowId: row.id,
            columnIndex: columnIndex,
            position: { x: widgetConfig.col, y: rowNum, w: widgetConfig.width, h: widgetConfig.height }
          };

          newWidgets.push(newWidget);
          row.widgetIds.push(newWidget.id);
        });

        const newRows = Array.from(rowMap.values()).sort((a, b) => a.order - b.order);
        setRows(newRows);
        setWidgets(newWidgets);
        return;
      }
    } catch (error) {
      console.warn('Could not load template from database, trying hardcoded templates:', error);
    }

    // Fallback to hardcoded templates if not in database
    const hardcodedTemplate = DASHBOARD_TEMPLATES.find(t => t.id === templateId);

    if (hardcodedTemplate) {
      console.log('Loading hardcoded template:', hardcodedTemplate.name);
      const templateLayout = hardcodedTemplate.defaultLayouts.lg;
      const rowMap = new Map<number, DashboardRow>();
      const newWidgets: WidgetConfig[] = [];

      templateLayout.forEach(widgetConfig => {
        const rowNum = widgetConfig.row;

        if (!rowMap.has(rowNum)) {
          const rowWidgets = templateLayout.filter(w => w.row === rowNum);
          const columns = rowWidgets.length;
          const rowConfig = hardcodedTemplate.rowConfigs?.find(r => r.row === rowNum);

          rowMap.set(rowNum, {
            id: `row-${uuidv4()}`,
            columns,
            widgetIds: [],
            order: rowNum,
            height: rowConfig?.height || 'default'
          });
        }

        const row = rowMap.get(rowNum)!;
        const rowWidgets = templateLayout.filter(w => w.row === rowNum);
        const sortedRowWidgets = rowWidgets.sort((a, b) => a.col - b.col);
        const columnIndex = sortedRowWidgets.findIndex(w => w.col === widgetConfig.col);

        const newWidget: WidgetConfig = {
          id: uuidv4(),
          type: widgetConfig.type,
          settings: widgetConfig.settings || {},
          colorTheme: widgetConfig.colorTheme || 'default',
          rowId: row.id,
          columnIndex: columnIndex,
          position: { x: widgetConfig.col, y: rowNum, w: widgetConfig.width, h: widgetConfig.height }
        };

        newWidgets.push(newWidget);
        row.widgetIds.push(newWidget.id);
      });

      const newRows = Array.from(rowMap.values()).sort((a, b) => a.order - b.order);
      setRows(newRows);
      setWidgets(newWidgets);
      return;
    }

    console.error('Template not found:', templateId);
  };

  const handleEditSystemTemplate = (templateId: string) => {
    if (!isSuperAdmin) return;

    // Save the current dashboard layout before editing the template
    setOriginalLayoutBeforeEdit({
      widgets: [...widgets],
      rows: [...rows]
    });

    // Load the template layout
    handleApplyTemplate(templateId);

    // Set state to indicate we're editing a system template
    setEditingSystemTemplate(templateId);
    setIsEditMode(true);

    addNotification('info', 'Editing system template. Your changes will update the template for position assignments.');
  };

  const handleCancelSystemTemplateEdit = () => {
    // Restore the original dashboard layout
    if (originalLayoutBeforeEdit) {
      setWidgets(originalLayoutBeforeEdit.widgets);
      setRows(originalLayoutBeforeEdit.rows);
      setOriginalLayoutBeforeEdit(null);
    }

    setEditingSystemTemplate(null);
    setIsEditMode(false);
    addNotification('info', 'Template editing cancelled');
  };

  const handleSaveSystemTemplate = async () => {
    if (!editingSystemTemplate || !isSuperAdmin) return;

    try {
      setSaving(true);

      // Convert current layout to template format
      const templateWidgets = widgets.map(widget => {
        const row = rows.find(r => r.id === widget.rowId);
        return {
          type: widget.type,
          row: row?.order || 0,
          col: widget.columnIndex,
          width: widget.position.w,
          height: widget.position.h,
          settings: widget.settings,
          colorTheme: widget.colorTheme
        };
      });

      // Convert rows to row configs
      const rowConfigs = rows.map(row => ({
        row: row.order,
        columns: row.columns,
        height: row.height || 'default'
      }));

      // Save to dashboard_templates table - include row_configs in template_data
      const { error } = await supabase
        .from('dashboard_templates')
        .update({
          template_data: {
            lg: templateWidgets,
            md: templateWidgets,
            sm: templateWidgets,
            row_configs: rowConfigs
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', editingSystemTemplate)
        .eq('is_system_template', true)
        .eq('is_editable_by_super_admin', true);

      if (error) throw error;

      addNotification('success', 'System template updated successfully!');

      // Restore the original dashboard layout
      if (originalLayoutBeforeEdit) {
        setWidgets(originalLayoutBeforeEdit.widgets);
        setRows(originalLayoutBeforeEdit.rows);
        setOriginalLayoutBeforeEdit(null);
      }

      setEditingSystemTemplate(null);
      setIsEditMode(false);
    } catch (error: any) {
      console.error('Error saving system template:', error);
      addNotification('error', 'Failed to save system template');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRow = (columns: number) => {
    const newRow: DashboardRow = {
      id: `row-${Date.now()}`,
      columns,
      widgetIds: [],
      order: rows.length
    };
    setRows([...rows, newRow]);

    // Scroll to the new row after it's rendered
    setTimeout(() => {
      if (newRowRef.current) {
        newRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleAddWidgetToSlot = (rowId: string, columnIndex: number) => {
    setTargetRowId(rowId);
    setTargetColumnIndex(columnIndex);
    setShowLibrary(true);
  };

  const handleToggleRowHeight = (rowId: string) => {
    setRows(rows.map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          height: row.height === 'compact' ? 'default' : 'compact'
        };
      }
      return row;
    }));
  };

  const handleSaveAndExit = async () => {
    if (editingSystemTemplate) {
      await handleSaveSystemTemplate();
    } else {
      const success = await saveLayout();
      if (success) {
        setIsEditMode(false);
      }
    }
  };

  const handleCancelEdit = () => {
    if (editingSystemTemplate) {
      if (confirm('Discard changes to system template?')) {
        handleCancelSystemTemplateEdit();
      }
    } else {
      loadLayout();
      setIsEditMode(false);
    }
  };

  const handleResetLayout = async () => {
    if (!user) return;
    if (!confirm('Are you sure you want to reset your dashboard to the default layout?')) return;

    try {
      // Build organization context
      const context = {
        clubId: currentClub?.clubId || null,
        stateAssociationId: currentOrganization?.type === 'state' ? currentOrganization.id : null,
        nationalAssociationId: currentOrganization?.type === 'national' ? currentOrganization.id : null
      };

      await resetDashboardLayout(user.id, context);
      await loadLayout();
    } catch (error) {
      console.error('Error resetting layout:', error);
    }
  };

  const handleSaveAsTemplate = async (name: string, description: string, icon: string, isPublic: boolean) => {
    if (!user || !currentClub) return;

    const layout: DashboardLayout = {
      widgets,
      rows,
      version: 1
    };

    const saved = await saveTemplate(
      name,
      description,
      icon,
      layout,
      currentClub.clubId,
      isPublic
    );

    if (saved) {
      addNotification('success', 'Dashboard template saved successfully!');
    } else {
      addNotification('error', 'Failed to save template');
    }
  };

  const isAdmin = currentClub?.role === 'admin' || currentClub?.role === 'super_admin';

  const getRowWidgets = (rowId: string): WidgetConfig[] => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return [];
    return widgets
      .filter(w => row.widgetIds.includes(w.id))
      .sort((a, b) => (a.columnIndex ?? 0) - (b.columnIndex ?? 0));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="relative">
      {editingSystemTemplate && (
        <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
          <Pencil className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="font-medium text-amber-300 mb-1">Editing System Template</h4>
            <p className="text-sm text-amber-200/80">
              You are editing a system-wide default template. Changes will affect all users who use this template or are assigned to positions using this template.
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-end gap-2 mb-2">
        {isEditMode && (
          <>
            <div className="flex items-center gap-2 mr-auto">
              <span className="text-sm text-slate-400">Add Row:</span>
              <button
                onClick={() => handleAddRow(1)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-white transition-colors"
              >
                <Columns size={16} />
                <span className="text-xs">1 Col</span>
              </button>
              <button
                onClick={() => handleAddRow(2)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-white transition-colors"
              >
                <Columns size={16} />
                <span className="text-xs">2 Cols</span>
              </button>
              <button
                onClick={() => handleAddRow(3)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-white transition-colors"
              >
                <LayoutGrid size={16} />
                <span className="text-xs">3 Cols</span>
              </button>
              <button
                onClick={() => handleAddRow(4)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-white transition-colors"
              >
                <LayoutGrid size={16} />
                <span className="text-xs">4 Cols</span>
              </button>
            </div>
            <button
              onClick={() => setShowLibrary(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white transition-colors"
            >
              <Sparkles size={16} />
              <span className="text-sm">Templates</span>
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowSaveTemplate(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600/80 hover:bg-green-600 text-white transition-colors"
              >
                <Save size={16} />
                <span className="text-sm">Save as Template</span>
              </button>
            )}
            <button
              onClick={handleResetLayout}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-white transition-colors"
            >
              <RotateCcw size={16} />
              <span className="text-sm">Reset</span>
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-white transition-colors"
            >
              <span className="text-sm">Cancel</span>
            </button>
            <button
              onClick={handleSaveAndExit}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
            >
              <Check size={16} />
              <span className="text-sm">{saving ? 'Saving...' : 'Save'}</span>
            </button>
          </>
        )}
        {!isEditMode && (
          <button
            onClick={() => setIsEditMode(true)}
            className="fixed top-[4.5rem] right-4 z-50 p-3 bg-slate-900 bg-opacity-30 hover:bg-opacity-50 text-white rounded-lg backdrop-blur-sm transition-all"
            title="Edit Dashboard"
          >
            <Pencil size={20} />
          </button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={rows.map(r => r.id)}
          strategy={verticalListSortingStrategy}
          disabled={!isEditMode}
        >
          <div className="space-y-6">
            {rows.map((row, index) => {
              const rowWidgets = getRowWidgets(row.id);
              if (rowWidgets.length === 0 && !isEditMode) return null;
              const isLastRow = index === rows.length - 1;

              return (
                <div key={row.id} ref={isLastRow ? newRowRef : null}>
                  <SortableRow
                    row={row}
                    widgets={rowWidgets}
                    isEditMode={isEditMode}
                    onRemoveWidget={handleRemoveWidget}
                    onRemoveRow={handleRemoveRow}
                    onAddWidgetToSlot={handleAddWidgetToSlot}
                    onToggleRowHeight={handleToggleRowHeight}
                    onUpdateTheme={handleUpdateWidgetTheme}
                  />
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {widgets.length === 0 && !isEditMode && (
        <div className="text-center py-12">
          <p className="text-slate-400 mb-4">Your dashboard is empty</p>
          <button
            onClick={() => setIsEditMode(true)}
            className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Add Widgets
          </button>
        </div>
      )}

      <WidgetLibraryModal
        isOpen={showLibrary}
        onClose={() => {
          setShowLibrary(false);
          setTargetRowId(null);
          setTargetColumnIndex(null);
        }}
        onAddWidget={handleAddWidget}
        onApplyTemplate={handleApplyTemplate}
        onEditSystemTemplate={handleEditSystemTemplate}
        existingWidgets={widgets}
        currentLayout={{ widgets, rows, version: 1 }}
      />

      <SaveTemplateModal
        isOpen={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        onSave={handleSaveAsTemplate}
        currentLayout={{ widgets, rows, version: 1 }}
        darkMode={true}
      />
    </div>
  );
};

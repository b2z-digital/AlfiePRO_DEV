import { supabase } from './supabase';
import { DashboardLayout, WidgetConfig } from '../types/dashboard';

interface OrganizationContext {
  clubId?: string | null;
  stateAssociationId?: string | null;
  nationalAssociationId?: string | null;
}

export async function saveDashboardLayout(
  userId: string,
  context: OrganizationContext,
  layout: DashboardLayout
): Promise<{ success: boolean; error?: any }> {
  try {
    console.log('💾 Saving dashboard layout:', {
      userId,
      context,
      widgetCount: layout.widgets.length,
      rowCount: layout.rows?.length || 0,
      rows: layout.rows?.map(r => ({ id: r.id, columns: r.columns, height: r.height }))
    });

    // First, try to find an existing layout
    let query = supabase
      .from('user_dashboard_layouts')
      .select('id')
      .eq('user_id', userId)
      .eq('is_default', true);

    // Apply organization filters
    if (context.clubId) {
      query = query.eq('club_id', context.clubId)
        .is('state_association_id', null)
        .is('national_association_id', null);
    } else if (context.stateAssociationId) {
      query = query.eq('state_association_id', context.stateAssociationId)
        .is('club_id', null)
        .is('national_association_id', null);
    } else if (context.nationalAssociationId) {
      query = query.eq('national_association_id', context.nationalAssociationId)
        .is('club_id', null)
        .is('state_association_id', null);
    } else {
      query = query.is('club_id', null)
        .is('state_association_id', null)
        .is('national_association_id', null);
    }

    const { data: existing, error: findError } = await query.maybeSingle();

    if (findError) {
      console.error('❌ Error finding existing layout:', findError);
      throw findError;
    }

    const layoutData = {
      user_id: userId,
      club_id: context.clubId || null,
      state_association_id: context.stateAssociationId || null,
      national_association_id: context.nationalAssociationId || null,
      layout_data: layout,
      is_default: true,
      updated_at: new Date().toISOString()
    };

    let result;
    if (existing) {
      // Update existing layout
      console.log('📝 Updating existing layout:', existing.id);
      const { data, error } = await supabase
        .from('user_dashboard_layouts')
        .update(layoutData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('❌ Error updating dashboard layout:', error);
        throw error;
      }
      result = data;
    } else {
      // Insert new layout
      console.log('➕ Creating new layout');
      const { data, error } = await supabase
        .from('user_dashboard_layouts')
        .insert(layoutData)
        .select()
        .single();

      if (error) {
        console.error('❌ Error inserting dashboard layout:', error);
        throw error;
      }
      result = data;
    }

    console.log('✅ Dashboard layout saved successfully:', result);
    return { success: true };
  } catch (error) {
    console.error('❌ Exception saving dashboard layout:', error);
    return { success: false, error };
  }
}

export async function loadDashboardLayout(
  userId: string,
  context: OrganizationContext
): Promise<DashboardLayout> {
  try {
    console.log('📥 Loading dashboard layout:', { userId, context });

    let query = supabase
      .from('user_dashboard_layouts')
      .select('layout_data')
      .eq('user_id', userId)
      .eq('is_default', true);

    // Apply organization filters
    if (context.clubId) {
      query = query.eq('club_id', context.clubId)
        .is('state_association_id', null)
        .is('national_association_id', null);
    } else if (context.stateAssociationId) {
      query = query.eq('state_association_id', context.stateAssociationId)
        .is('club_id', null)
        .is('national_association_id', null);
    } else if (context.nationalAssociationId) {
      query = query.eq('national_association_id', context.nationalAssociationId)
        .is('club_id', null)
        .is('state_association_id', null);
    } else {
      query = query.is('club_id', null)
        .is('state_association_id', null)
        .is('national_association_id', null);
    }

    // Order by updated_at descending and get the most recent one
    query = query.order('updated_at', { ascending: false }).limit(1);

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('❌ Error loading dashboard layout:', error);
      throw error;
    }

    if (data?.layout_data) {
      console.log('✅ Dashboard layout loaded:', {
        widgetCount: data.layout_data.widgets?.length || 0,
        rowCount: data.layout_data.rows?.length || 0,
        rows: data.layout_data.rows?.map((r: any) => ({ id: r.id, columns: r.columns, height: r.height }))
      });

      // Migrate old layouts: assign columnIndex based on position in row
      const layout = data.layout_data as DashboardLayout;

      // Ensure rows have order field
      const rows = (layout.rows || []).map((row, index) => ({
        ...row,
        order: row.order ?? index
      }));

      // Assign columnIndex to widgets that don't have it
      const widgets = (layout.widgets || []).map(widget => {
        if (widget.columnIndex !== undefined) {
          return widget;
        }

        // Find the row this widget belongs to
        const row = rows.find(r => r.widgetIds.includes(widget.id));
        if (row) {
          const columnIndex = row.widgetIds.indexOf(widget.id);
          return { ...widget, columnIndex };
        }

        return widget;
      });

      return {
        ...layout,
        widgets,
        rows
      };
    }

    console.log('ℹ️ No saved layout found, using default');
    return getDefaultLayout();
  } catch (error) {
    console.error('❌ Exception loading dashboard layout:', error);
    return getDefaultLayout();
  }
}

export function getDefaultLayout(): DashboardLayout {
  return {
    widgets: [
      {
        id: 'event-count-1',
        type: 'event-count',
        position: { x: 0, y: 0, w: 1, h: 1 },
        rowId: 'row-1',
        columnSpan: 1,
        columnIndex: 0
      },
      {
        id: 'members-count-1',
        type: 'members-count',
        position: { x: 1, y: 0, w: 1, h: 1 },
        rowId: 'row-1',
        columnSpan: 1,
        columnIndex: 1
      },
      {
        id: 'tasks-count-1',
        type: 'tasks-count',
        position: { x: 2, y: 0, w: 1, h: 1 },
        rowId: 'row-1',
        columnSpan: 1,
        columnIndex: 2
      },
      {
        id: 'upcoming-events-1',
        type: 'upcoming-events',
        position: { x: 0, y: 1, w: 3, h: 2 },
        rowId: 'row-2',
        columnSpan: 1,
        columnIndex: 0
      },
      {
        id: 'recent-results-1',
        type: 'recent-results',
        position: { x: 1, y: 1, w: 3, h: 2 },
        rowId: 'row-2',
        columnSpan: 1,
        columnIndex: 1
      },
      {
        id: 'financial-health-1',
        type: 'financial-health',
        position: { x: 0, y: 3, w: 1, h: 1 },
        rowId: 'row-3',
        columnSpan: 1,
        columnIndex: 0
      },
      {
        id: 'weather-1',
        type: 'weather',
        position: { x: 1, y: 3, w: 1, h: 1 },
        rowId: 'row-3',
        columnSpan: 1,
        columnIndex: 1
      },
      {
        id: 'membership-status-1',
        type: 'membership-status',
        position: { x: 2, y: 3, w: 1, h: 1 },
        rowId: 'row-3',
        columnSpan: 1,
        columnIndex: 2
      }
    ],
    rows: [
      { id: 'row-1', columns: 3, widgetIds: ['event-count-1', 'members-count-1', 'tasks-count-1'], order: 0 },
      { id: 'row-2', columns: 2, widgetIds: ['upcoming-events-1', 'recent-results-1'], order: 1 },
      { id: 'row-3', columns: 3, widgetIds: ['financial-health-1', 'weather-1', 'membership-status-1'], order: 2 }
    ],
    version: 1
  };
}

export async function resetDashboardLayout(
  userId: string,
  context: OrganizationContext
): Promise<{ success: boolean; error?: any }> {
  const defaultLayout = getDefaultLayout();
  return saveDashboardLayout(userId, context, defaultLayout);
}

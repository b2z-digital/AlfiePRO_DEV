import { supabase } from './supabase';
import {
  EventTaskBoard,
  EventTaskLane,
  EnhancedTask,
  TaskDependency,
  EventTeamChannel,
  EventChannelMessage,
  EventActivity,
  EventTaskTemplate,
  AutomationRule,
  TaskMoveEvent,
  TaskGroup,
  BoardColumn,
  TaskColumnData,
} from '../types/eventCommandCenter';

export class EventCommandCenterStorage {
  // ==================== BOARDS ====================

  static async createBoard(boardData: {
    event_id?: string;
    club_id?: string;
    state_association_id?: string;
    national_association_id?: string;
    name: string;
    description?: string;
    board_type?: 'event' | 'template' | 'project';
    is_template?: boolean;
    template_category?: string;
    settings?: Record<string, any>;
  }): Promise<EventTaskBoard> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('event_task_boards')
      .insert({
        ...boardData,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getBoard(boardId: string): Promise<EventTaskBoard | null> {
    const { data, error } = await supabase
      .from('event_task_boards')
      .select('*')
      .eq('id', boardId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  static async getBoardsByEvent(eventId: string): Promise<EventTaskBoard[]> {
    const { data, error } = await supabase
      .from('event_task_boards')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async updateBoard(boardId: string, updates: Partial<EventTaskBoard>): Promise<EventTaskBoard> {
    const { data, error } = await supabase
      .from('event_task_boards')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', boardId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteBoard(boardId: string): Promise<void> {
    const { error } = await supabase
      .from('event_task_boards')
      .delete()
      .eq('id', boardId);

    if (error) throw error;
  }

  // ==================== LANES ====================

  static async getLanesByBoard(boardId: string): Promise<EventTaskLane[]> {
    const { data, error } = await supabase
      .from('event_task_lanes')
      .select('*')
      .eq('board_id', boardId)
      .order('position', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async createLane(laneData: {
    board_id: string;
    name: string;
    description?: string;
    color?: string;
    position: number;
    wip_limit?: number;
    lane_type?: string;
  }): Promise<EventTaskLane> {
    const { data, error } = await supabase
      .from('event_task_lanes')
      .insert(laneData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateLane(laneId: string, updates: Partial<EventTaskLane>): Promise<EventTaskLane> {
    const { data, error } = await supabase
      .from('event_task_lanes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', laneId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteLane(laneId: string): Promise<void> {
    const { error } = await supabase
      .from('event_task_lanes')
      .delete()
      .eq('id', laneId);

    if (error) throw error;
  }

  static async reorderLanes(boardId: string, laneOrders: { id: string; position: number }[]): Promise<void> {
    const updates = laneOrders.map(({ id, position }) =>
      supabase
        .from('event_task_lanes')
        .update({ position })
        .eq('id', id)
    );

    await Promise.all(updates);
  }

  // ==================== TASKS ====================

  static async getTasksByBoard(boardId: string): Promise<EnhancedTask[]> {
    const { data, error } = await supabase
      .from('club_tasks')
      .select(`
        *,
        assignee:members!assignee_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('board_id', boardId)
      .order('position', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async getTasksByLane(laneId: string): Promise<EnhancedTask[]> {
    const { data, error } = await supabase
      .from('club_tasks')
      .select(`
        *,
        assignee:members!assignee_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('lane_id', laneId)
      .order('position', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async createTask(taskData: {
    title: string;
    board_id?: string;
    lane_id?: string;
    group_id?: string;
    position_in_group?: number;
    description?: string;
    due_date?: string;
    priority?: string;
    assignee_id?: string;
    event_id?: string;
    club_id?: string;
    state_association_id?: string;
    national_association_id?: string;
    estimated_hours?: number;
    is_milestone?: boolean;
    tags?: string[];
    followers?: string[];
    status?: string;
  }): Promise<EnhancedTask> {
    const { data: { user } } = await supabase.auth.getUser();

    // Get the next position in the lane (for Kanban boards)
    let position = 0;
    if (taskData.lane_id) {
      const { data: tasksInLane } = await supabase
        .from('club_tasks')
        .select('position')
        .eq('lane_id', taskData.lane_id)
        .order('position', { ascending: false })
        .limit(1);

      if (tasksInLane && tasksInLane.length > 0) {
        position = (tasksInLane[0].position || 0) + 1;
      }
    }

    const { data, error } = await supabase
      .from('club_tasks')
      .insert({
        ...taskData,
        position,
        created_by: user?.id,
        status: taskData.status || 'pending',
      })
      .select(`
        *,
        assignee:members!assignee_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;
    return data;
  }

  static async moveTask(moveEvent: TaskMoveEvent): Promise<void> {
    const { taskId, targetLaneId, targetPosition } = moveEvent;

    const { error } = await supabase
      .from('club_tasks')
      .update({
        lane_id: targetLaneId,
        position: targetPosition,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (error) throw error;
  }

  static async updateTaskPosition(taskId: string, position: number): Promise<void> {
    const { error } = await supabase
      .from('club_tasks')
      .update({ position })
      .eq('id', taskId);

    if (error) throw error;
  }

  // ==================== DEPENDENCIES ====================

  static async getTaskDependencies(taskId: string): Promise<TaskDependency[]> {
    const { data, error } = await supabase
      .from('event_task_dependencies')
      .select(`
        *,
        depends_on_task:club_tasks!depends_on_task_id (
          id,
          title,
          status,
          due_date
        )
      `)
      .eq('task_id', taskId);

    if (error) throw error;
    return data || [];
  }

  static async getTaskDependents(taskId: string): Promise<TaskDependency[]> {
    const { data, error } = await supabase
      .from('event_task_dependencies')
      .select(`
        *,
        task:club_tasks!task_id (
          id,
          title,
          status,
          due_date
        )
      `)
      .eq('depends_on_task_id', taskId);

    if (error) throw error;
    return data || [];
  }

  static async createDependency(dependencyData: {
    task_id: string;
    depends_on_task_id: string;
    dependency_type?: string;
    lag_days?: number;
  }): Promise<TaskDependency> {
    const { data, error } = await supabase
      .from('event_task_dependencies')
      .insert(dependencyData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteDependency(dependencyId: string): Promise<void> {
    const { error } = await supabase
      .from('event_task_dependencies')
      .delete()
      .eq('id', dependencyId);

    if (error) throw error;
  }

  // ==================== CHANNELS ====================

  static async getEventChannels(eventId: string): Promise<EventTeamChannel[]> {
    const { data, error } = await supabase
      .from('event_team_channels')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async createChannel(channelData: {
    event_id: string;
    club_id?: string;
    state_association_id?: string;
    national_association_id?: string;
    name: string;
    description?: string;
    channel_type?: string;
    is_private?: boolean;
  }): Promise<EventTeamChannel> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('event_team_channels')
      .insert({
        ...channelData,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getChannelMessages(
    channelId: string,
    limit: number = 50,
    before?: string
  ): Promise<EventChannelMessage[]> {
    let query = supabase
      .from('event_channel_messages')
      .select('*')
      .eq('channel_id', channelId)
      .is('thread_id', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Fetch user profiles separately
    const messages = data || [];
    const userIds = [...new Set(messages.map(m => m.user_id).filter(Boolean))];

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', userIds);

      const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return messages.map(msg => ({
        ...msg,
        user: profilesMap.get(msg.user_id)
      })).reverse();
    }

    return messages.reverse();
  }

  static async sendMessage(messageData: {
    channel_id: string;
    message: string;
    mentions?: string[];
    attachments?: any[];
    thread_id?: string;
  }): Promise<EventChannelMessage> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('event_channel_messages')
      .insert({
        ...messageData,
        user_id: user?.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateMessage(messageId: string, message: string): Promise<EventChannelMessage> {
    const { data, error } = await supabase
      .from('event_channel_messages')
      .update({
        message,
        is_edited: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteMessage(messageId: string): Promise<void> {
    const { error } = await supabase
      .from('event_channel_messages')
      .delete()
      .eq('id', messageId);

    if (error) throw error;
  }

  static async addReaction(messageId: string, emoji: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: message } = await supabase
      .from('event_channel_messages')
      .select('reactions')
      .eq('id', messageId)
      .single();

    if (!message) return;

    const reactions = (message.reactions as any[]) || [];
    const existingReaction = reactions.find((r: any) => r.emoji === emoji);

    let updatedReactions;
    if (existingReaction) {
      if (!existingReaction.user_ids.includes(user.id)) {
        existingReaction.user_ids.push(user.id);
        existingReaction.count = existingReaction.user_ids.length;
      }
      updatedReactions = reactions;
    } else {
      updatedReactions = [...reactions, { emoji, user_ids: [user.id], count: 1 }];
    }

    await supabase
      .from('event_channel_messages')
      .update({ reactions: updatedReactions })
      .eq('id', messageId);
  }

  // ==================== ACTIVITY FEED ====================

  static async getEventActivity(
    eventId: string,
    limit: number = 50,
    activityTypes?: string[]
  ): Promise<EventActivity[]> {
    let query = supabase
      .from('event_activity_feed')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (activityTypes && activityTypes.length > 0) {
      query = query.in('activity_type', activityTypes);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Fetch user profiles separately
    const activities = data || [];
    const userIds = [...new Set(activities.map(a => a.user_id).filter(Boolean))];

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', userIds);

      const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return activities.map(activity => ({
        ...activity,
        user: profilesMap.get(activity.user_id)
      }));
    }

    return activities;
  }

  static async createActivity(activityData: {
    event_id: string;
    club_id?: string;
    state_association_id?: string;
    national_association_id?: string;
    activity_type: string;
    entity_type?: string;
    entity_id?: string;
    title: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<EventActivity> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('event_activity_feed')
      .insert({
        ...activityData,
        user_id: user?.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ==================== TEMPLATES ====================

  static async getTemplates(filters?: {
    event_type?: string;
    is_public?: boolean;
  }): Promise<EventTaskTemplate[]> {
    let query = supabase
      .from('event_task_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.event_type) {
      query = query.eq('event_type', filters.event_type);
    }

    if (filters?.is_public !== undefined) {
      query = query.eq('is_public', filters.is_public);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  static async createTemplate(templateData: Partial<EventTaskTemplate>): Promise<EventTaskTemplate> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('event_task_templates')
      .insert({
        ...templateData,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async applyTemplate(
    templateId: string,
    eventId: string,
    eventDate: Date
  ): Promise<{ board: EventTaskBoard; tasks: EnhancedTask[] }> {
    const { data: template } = await supabase
      .from('event_task_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (!template) throw new Error('Template not found');

    const { data: event } = await supabase
      .from('public_events')
      .select('club_id, state_association_id, national_association_id')
      .eq('id', eventId)
      .single();

    if (!event) throw new Error('Event not found');

    const board = await this.createBoard({
      event_id: eventId,
      club_id: event.club_id,
      state_association_id: event.state_association_id,
      national_association_id: event.national_association_id,
      name: template.name,
      description: template.description || undefined,
      board_type: 'event',
    });

    const lanes = template.default_lanes || [];
    const createdLanes: Record<string, string> = {};

    for (const lane of lanes) {
      const createdLane = await this.createLane({
        board_id: board.id,
        name: lane.name,
        description: lane.description,
        color: lane.color,
        position: lane.position,
        lane_type: lane.lane_type,
      });
      createdLanes[lane.lane_type] = createdLane.id;
    }

    const templateTasks = template.tasks || [];
    const createdTasks: EnhancedTask[] = [];

    for (const task of templateTasks) {
      const dueDate = new Date(eventDate);
      dueDate.setDate(dueDate.getDate() - task.days_before_event);

      const laneId = createdLanes[task.lane_type] || createdLanes['planning'];

      const { data: createdTask } = await supabase
        .from('club_tasks')
        .insert({
          title: task.title,
          description: task.description,
          due_date: dueDate.toISOString(),
          priority: task.priority,
          event_id: eventId,
          board_id: board.id,
          lane_id: laneId,
          estimated_hours: task.estimated_hours,
          is_milestone: task.is_milestone,
          tags: task.tags,
          club_id: event.club_id,
          state_association_id: event.state_association_id,
          national_association_id: event.national_association_id,
          status: 'pending',
        })
        .select()
        .single();

      if (createdTask) {
        createdTasks.push(createdTask as EnhancedTask);
      }
    }

    return { board, tasks: createdTasks };
  }

  // ==================== AUTOMATION ====================

  static async getAutomationRules(boardId: string): Promise<AutomationRule[]> {
    const { data, error } = await supabase
      .from('event_automation_rules')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async createAutomationRule(ruleData: Partial<AutomationRule>): Promise<AutomationRule> {
    const { data, error } = await supabase
      .from('event_automation_rules')
      .insert(ruleData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateAutomationRule(
    ruleId: string,
    updates: Partial<AutomationRule>
  ): Promise<AutomationRule> {
    const { data, error } = await supabase
      .from('event_automation_rules')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', ruleId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteAutomationRule(ruleId: string): Promise<void> {
    const { error } = await supabase
      .from('event_automation_rules')
      .delete()
      .eq('id', ruleId);

    if (error) throw error;
  }

  // ==================== REALTIME ====================

  static subscribeToBoard(boardId: string, callbacks: {
    onTaskUpdated?: (task: EnhancedTask) => void;
    onTaskCreated?: (task: EnhancedTask) => void;
    onTaskDeleted?: (taskId: string) => void;
  }) {
    const channel = supabase
      .channel(`board:${boardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'club_tasks',
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && callbacks.onTaskCreated) {
            callbacks.onTaskCreated(payload.new as EnhancedTask);
          } else if (payload.eventType === 'UPDATE' && callbacks.onTaskUpdated) {
            callbacks.onTaskUpdated(payload.new as EnhancedTask);
          } else if (payload.eventType === 'DELETE' && callbacks.onTaskDeleted) {
            callbacks.onTaskDeleted(payload.old.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  static subscribeToChannel(channelId: string, callbacks: {
    onMessage?: (message: EventChannelMessage) => void;
    onMessageUpdated?: (message: EventChannelMessage) => void;
    onMessageDeleted?: (messageId: string) => void;
  }) {
    const channel = supabase
      .channel(`channel:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_channel_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && callbacks.onMessage) {
            callbacks.onMessage(payload.new as EventChannelMessage);
          } else if (payload.eventType === 'UPDATE' && callbacks.onMessageUpdated) {
            callbacks.onMessageUpdated(payload.new as EventChannelMessage);
          } else if (payload.eventType === 'DELETE' && callbacks.onMessageDeleted) {
            callbacks.onMessageDeleted(payload.old.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  static subscribeToActivity(eventId: string, callback: (activity: EventActivity) => void) {
    const channel = supabase
      .channel(`activity:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'event_activity_feed',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          callback(payload.new as EventActivity);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  // ==================== GROUPS (Monday.com style) ====================

  static async getGroups(boardId: string): Promise<TaskGroup[]> {
    const { data, error } = await supabase
      .from('event_task_groups')
      .select('*')
      .eq('board_id', boardId)
      .order('position', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async createGroup(groupData: {
    board_id: string;
    name: string;
    description?: string;
    color?: string;
    position: number;
  }): Promise<TaskGroup> {
    const { data, error } = await supabase
      .from('event_task_groups')
      .insert(groupData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateGroup(groupId: string, updates: Partial<TaskGroup>): Promise<void> {
    const { error } = await supabase
      .from('event_task_groups')
      .update(updates)
      .eq('id', groupId);

    if (error) throw error;
  }

  static async deleteGroup(groupId: string): Promise<void> {
    const { error } = await supabase
      .from('event_task_groups')
      .delete()
      .eq('id', groupId);

    if (error) throw error;
  }

  // ==================== COLUMNS (Monday.com style) ====================

  static async getColumns(boardId: string): Promise<BoardColumn[]> {
    const { data, error } = await supabase
      .from('event_board_columns')
      .select('*')
      .eq('board_id', boardId)
      .order('position', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async createColumn(columnData: {
    board_id: string;
    name: string;
    column_type: string;
    position: number;
    width?: number;
    settings?: Record<string, any>;
  }): Promise<BoardColumn> {
    const { data, error } = await supabase
      .from('event_board_columns')
      .insert(columnData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateColumn(columnId: string, updates: Partial<BoardColumn>): Promise<void> {
    const { error } = await supabase
      .from('event_board_columns')
      .update(updates)
      .eq('id', columnId);

    if (error) throw error;
  }

  static async deleteColumn(columnId: string): Promise<void> {
    const { error } = await supabase
      .from('event_board_columns')
      .delete()
      .eq('id', columnId);

    if (error) throw error;
  }

  // ==================== COLUMN DATA ====================

  static async getAllColumnData(boardId: string): Promise<TaskColumnData[]> {
    const { data, error } = await supabase
      .from('event_task_column_data')
      .select(`
        *,
        task:club_tasks!inner(board_id)
      `)
      .eq('task.board_id', boardId);

    if (error) throw error;
    return data || [];
  }

  static async getTaskColumnData(taskId: string): Promise<TaskColumnData[]> {
    const { data, error } = await supabase
      .from('event_task_column_data')
      .select('*')
      .eq('task_id', taskId);

    if (error) throw error;
    return data || [];
  }

  static async createColumnData(columnDataInput: {
    task_id: string;
    column_id: string;
    value: any;
  }): Promise<TaskColumnData> {
    const { data, error } = await supabase
      .from('event_task_column_data')
      .insert(columnDataInput)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateColumnData(columnDataId: string, value: any): Promise<void> {
    const { error } = await supabase
      .from('event_task_column_data')
      .update({ value })
      .eq('id', columnDataId);

    if (error) throw error;
  }

  static async deleteColumnData(columnDataId: string): Promise<void> {
    const { error } = await supabase
      .from('event_task_column_data')
      .delete()
      .eq('id', columnDataId);

    if (error) throw error;
  }

  // ==================== BOARD TASKS (with groups) ====================

  static async getBoardTasks(boardId: string): Promise<EnhancedTask[]> {
    const { data, error } = await supabase
      .from('club_tasks')
      .select(`
        *,
        assignee:members(id, first_name, last_name, avatar_url)
      `)
      .eq('board_id', boardId)
      .order('position_in_group', { ascending: true });

    if (error) throw error;
    return data || [];
  }
}

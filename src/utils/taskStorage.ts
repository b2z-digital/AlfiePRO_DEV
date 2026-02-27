import { supabase } from './supabase';
import { Task, TaskFormData, TaskFilter } from '../types/task';
import { v4 as uuidv4 } from 'uuid';

// Get all tasks for a club
export const getTasks = async (clubId: string): Promise<Task[]> => {
  try {
    const { data, error } = await supabase
      .from('club_tasks')
      .select(`
        *,
        assignee:members(id, first_name, last_name)
      `)
      .eq('club_id', clubId)
      .order('due_date', { ascending: true });

    if (error) throw error;

    // Transform the data to include assignee name
    return (data || []).map(task => ({
      ...task,
      assignee_name: task.assignee 
        ? `${task.assignee.first_name || ''} ${task.assignee.last_name || ''}`.trim() || 'Unnamed User'
        : undefined
    }));
  } catch (error) {
    console.error('Error fetching tasks:', error);
    throw error;
  }
};

// Get tasks filtered by status
export const getFilteredTasks = async (clubId: string, filter: TaskFilter): Promise<Task[]> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayStr = today.toISOString().split('T')[0];
    
    // Calculate dates for filters
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    
    const monthEnd = new Date(today);
    monthEnd.setMonth(today.getMonth() + 1);
    const monthEndStr = monthEnd.toISOString().split('T')[0];
    
    let query = supabase
      .from('club_tasks')
      .select(`
        *,
        assignee:members(id, first_name, last_name)
      `)
      .eq('club_id', clubId);
    
    // Apply filters
    switch (filter) {
      case 'current':
        query = query.not('status', 'eq', 'completed').not('status', 'eq', 'cancelled');
        break;
      case 'overdue':
        query = query
          .lt('due_date', todayStr)
          .not('status', 'eq', 'completed')
          .not('status', 'eq', 'cancelled');
        break;
      case 'due_today':
        query = query
          .eq('due_date', todayStr)
          .not('status', 'eq', 'completed')
          .not('status', 'eq', 'cancelled');
        break;
      case 'due_this_week':
        query = query
          .gte('due_date', todayStr)
          .lte('due_date', weekEndStr)
          .not('status', 'eq', 'completed')
          .not('status', 'eq', 'cancelled');
        break;
      case 'due_this_month':
        query = query
          .gte('due_date', todayStr)
          .lte('due_date', monthEndStr)
          .not('status', 'eq', 'completed')
          .not('status', 'eq', 'cancelled');
        break;
      case 'completed':
        query = query.eq('status', 'completed');
        break;
    }
    
    const { data, error } = await query.order('due_date', { ascending: true });
    
    if (error) throw error;
    
    // Transform the data to include assignee name
    return (data || []).map(task => ({
      ...task,
      assignee_name: task.assignee 
        ? `${task.assignee.first_name || ''} ${task.assignee.last_name || ''}`.trim() || 'Unnamed User'
        : undefined
    }));
  } catch (error) {
    console.error('Error fetching filtered tasks:', error);
    throw error;
  }
};

// Get tasks assigned to a specific user
export const getUserTasks = async (clubId: string, userId: string): Promise<Task[]> => {
  try {
    const { data, error } = await supabase
      .from('club_tasks')
      .select(`
        *,
        assignee:members(id, first_name, last_name)
      `)
      .eq('club_id', clubId)
      .eq('assignee_id', userId)
      .order('due_date', { ascending: true });

    if (error) throw error;

    // Transform the data to include assignee name
    return (data || []).map(task => ({
      ...task,
      assignee_name: task.assignee 
        ? `${task.assignee.first_name || ''} ${task.assignee.last_name || ''}`.trim() || 'Unnamed User'
        : undefined
    }));
  } catch (error) {
    console.error('Error fetching user tasks:', error);
    throw error;
  }
};

// Create a new task
export const createTask = async (clubId: string, userId: string, taskData: TaskFormData): Promise<Task> => {
  try {
    const taskId = uuidv4();
    
    // Extract attachments from taskData to handle separately
    const { attachments, ...taskDataWithoutAttachments } = taskData;
    
    const newTask = {
      id: taskId,
      title: taskDataWithoutAttachments.title,
      description: taskDataWithoutAttachments.description,
      due_date: taskDataWithoutAttachments.due_date,
      status: 'pending' as const,
      priority: taskDataWithoutAttachments.priority,
      assignee_id: taskDataWithoutAttachments.assignee_id,
      club_id: clubId,
      created_by: userId,
      repeat_type: taskDataWithoutAttachments.repeat_type || 'none',
      repeat_end_date: taskDataWithoutAttachments.repeat_end_date,
      send_reminder: taskDataWithoutAttachments.send_reminder,
      reminder_type: taskDataWithoutAttachments.reminder_type,
      reminder_date: taskDataWithoutAttachments.reminder_date,
      followers: taskDataWithoutAttachments.followers || []
    };
    
    const { data, error } = await supabase
      .from('club_tasks')
      .insert(newTask)
      .select(`
        *,
        assignee:members(id, first_name, last_name)
      `)
      .single();
    
    if (error) throw error;
    
    // Handle attachments if any
    if (attachments && attachments.length > 0) {
      await Promise.all(attachments.map(async (file) => {
        let uploadFile: File = file;
        if (file.type.startsWith('image/')) {
          const { compressImage } = await import('./imageCompression');
          uploadFile = await compressImage(file, 'photo');
        }

        const fileExt = uploadFile.name.split('.').pop();
        const fileName = `tasks/${taskId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('event-media')
          .upload(fileName, uploadFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        // Get the public URL
        const { data: { publicUrl } } = supabase.storage
          .from('event-media')
          .getPublicUrl(uploadData.path);

        // Add attachment to task
        const { error: attachmentError } = await supabase
          .from('task_attachments')
          .insert({
            task_id: taskId,
            name: file.name,
            url: publicUrl,
            type: file.type,
            size: file.size
          });

        if (attachmentError) throw attachmentError;
      }));
    }
    
    // Transform the data to include assignee name
    return {
      ...data,
      assignee_name: data.assignee 
        ? `${data.assignee.first_name || ''} ${data.assignee.last_name || ''}`.trim() || 'Unnamed User'
        : undefined
    };
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
};

// Update a task
export const updateTask = async (taskId: string, updates: Partial<TaskFormData>): Promise<Task> => {
  try {
    // Extract attachments from updates to handle separately
    const { attachments, ...updatesWithoutAttachments } = updates;
    
    const { data, error } = await supabase
      .from('club_tasks')
      .update(updatesWithoutAttachments)
      .eq('id', taskId)
      .select(`
        *,
        assignee:members(id, first_name, last_name)
      `)
      .single();
    
    if (error) throw error;
    
    // Handle attachments if any
    if (attachments && attachments.length > 0) {
      await Promise.all(attachments.map(async (file) => {
        let uploadFile: File = file;
        if (file.type.startsWith('image/')) {
          const { compressImage } = await import('./imageCompression');
          uploadFile = await compressImage(file, 'photo');
        }

        const fileExt = uploadFile.name.split('.').pop();
        const fileName = `tasks/${taskId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('event-media')
          .upload(fileName, uploadFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        // Get the public URL
        const { data: { publicUrl } } = supabase.storage
          .from('event-media')
          .getPublicUrl(uploadData.path);

        // Add attachment to task
        const { error: attachmentError } = await supabase
          .from('task_attachments')
          .insert({
            task_id: taskId,
            name: file.name,
            url: publicUrl,
            type: file.type,
            size: file.size
          });

        if (attachmentError) throw attachmentError;
      }));
    }
    
    // Transform the data to include assignee name
    return {
      ...data,
      assignee_name: data.assignee 
        ? `${data.assignee.first_name || ''} ${data.assignee.last_name || ''}`.trim() || 'Unnamed User'
        : undefined
    };
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
};

// Mark a task as completed
export const completeTask = async (taskId: string): Promise<Task> => {
  try {
    const { data, error } = await supabase
      .from('club_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .select(`
        *,
        assignee:members(id, first_name, last_name)
      `)
      .single();
    
    if (error) throw error;
    
    // Transform the data to include assignee name
    return {
      ...data,
      assignee_name: data.assignee 
        ? `${data.assignee.first_name || ''} ${data.assignee.last_name || ''}`.trim() || 'Unnamed User'
        : undefined
    };
  } catch (error) {
    console.error('Error completing task:', error);
    throw error;
  }
};

// Delete a task
export const deleteTask = async (taskId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('club_tasks')
      .delete()
      .eq('id', taskId);
    
    if (error) throw error;
    
    // Delete attachments from database
    const { data: attachments } = await supabase
      .from('task_attachments')
      .select('url')
      .eq('task_id', taskId);

    if (attachments && attachments.length > 0) {
      // Extract file paths from URLs and delete from storage
      const filePaths = attachments.map(att => {
        const url = new URL(att.url);
        const path = url.pathname.split('/storage/v1/object/public/event-media/')[1];
        return path;
      }).filter(Boolean);

      if (filePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('event-media')
          .remove(filePaths);

        if (storageError) {
          console.error('Error deleting task attachments from storage:', storageError);
        }
      }
    }

    // Delete attachment records
    await supabase
      .from('task_attachments')
      .delete()
      .eq('task_id', taskId);
  } catch (error) {
    console.error('Error deleting task:', error);
    throw error;
  }
};

// Get task attachments
export const getTaskAttachments = async (taskId: string) => {
  try {
    const { data, error } = await supabase
      .from('task_attachments')
      .select('*')
      .eq('task_id', taskId);
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Error fetching task attachments:', error);
    throw error;
  }
};

// Delete a task attachment
export const deleteTaskAttachment = async (attachmentId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('task_attachments')
      .delete()
      .eq('id', attachmentId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting task attachment:', error);
    throw error;
  }
};
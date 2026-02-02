export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskFilter = 'current' | 'overdue' | 'due_today' | 'due_this_week' | 'due_this_month' | 'completed';

export interface Task {
  id: string;
  title: string;
  description: string;
  due_date: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  assignee_name?: string;
  club_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  repeat_type?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  repeat_end_date?: string | null;
  send_reminder: boolean;
  reminder_type?: 'email' | 'notification' | 'both';
  reminder_date?: string | null;
  followers?: string[];
  attachments?: {
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
    created_at: string;
  }[];
}

export interface TaskFormData {
  title: string;
  description: string;
  due_date: string | null;
  priority: TaskPriority;
  assignee_id: string | null;
  repeat_type?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  repeat_end_date?: string | null;
  send_reminder: boolean;
  reminder_type?: 'email' | 'notification' | 'both';
  reminder_date?: string | null;
  followers?: string[];
  attachments?: File[];
}
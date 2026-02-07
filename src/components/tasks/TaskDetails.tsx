import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  User, 
  Flag, 
  Edit2, 
  Trash2, 
  CheckSquare, 
  Paperclip, 
  AlertTriangle, 
  Check,
  MessageSquare,
  Eye
} from 'lucide-react';
import { Task } from '../../types/task';
import { completeTask, getTaskAttachments } from '../../utils/taskStorage';
import { formatDate } from '../../utils/date';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { Avatar } from '../ui/Avatar';

interface TaskDetailsProps {
  task: Task;
  darkMode: boolean;
  onClose: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export const TaskDetails: React.FC<TaskDetailsProps> = ({
  task,
  darkMode,
  onClose,
  onEdit,
  onComplete,
  onDelete,
  onUpdate
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [followers, setFollowers] = useState<any[]>([]);

  // Get assignee name from either assignee object or assignee_name field
  const getAssigneeName = () => {
    const assignee = (task as any).assignee;
    if (assignee) {
      const name = `${assignee.first_name || ''} ${assignee.last_name || ''}`.trim();
      if (name) return name;
    }
    return task.assignee_name || null;
  };

  const hasAssignee = () => {
    return getAssigneeName() !== null;
  };

  useEffect(() => {
    fetchAttachments();
    fetchComments();
    fetchFollowers();
  }, [task.id]);

  const fetchAttachments = async () => {
    try {
      const attachmentsData = await getTaskAttachments(task.id);
      setAttachments(attachmentsData);
    } catch (err) {
      console.error('Error fetching attachments:', err);
    }
  };

  const handleMarkAsComplete = async () => {
    try {
      setLoading(true);
      await completeTask(task.id);
      setSuccess('Task marked as completed');
      setTimeout(() => {
        onUpdate();
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error completing task:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      setLoadingComments(true);
      const { data: commentsData, error: commentsError } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', task.id)
        .order('created_at', { ascending: true });

      if (commentsError) throw commentsError;

      // Fetch user profiles separately
      if (commentsData && commentsData.length > 0) {
        const userIds = [...new Set(commentsData.map(c => c.user_id))];
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', userIds);

        if (profilesError) throw profilesError;

        // Map profiles to comments
        const profileMap = new Map(profilesData?.map(p => [p.id, p]) || []);
        const enrichedComments = commentsData.map(comment => ({
          ...comment,
          user: profileMap.get(comment.user_id)
        }));

        setComments(enrichedComments);
      } else {
        setComments([]);
      }
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const fetchFollowers = async () => {
    try {
      if (!task.followers || task.followers.length === 0) {
        setFollowers([]);
        return;
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', task.followers);

      if (profilesError) throw profilesError;

      setFollowers(profilesData || []);
    } catch (err) {
      console.error('Error fetching followers:', err);
      setFollowers([]);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;

    try {
      const { error } = await supabase
        .from('task_comments')
        .insert({
          task_id: task.id,
          user_id: user?.id,
          comment: comment.trim()
        });

      if (error) throw error;

      setSuccess('Comment added');
      setComment('');
      fetchComments();
      setTimeout(() => setSuccess(null), 1500);
    } catch (err) {
      console.error('Error adding comment:', err);
      setError(err instanceof Error ? err.message : 'Failed to add comment');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-400';
      case 'medium':
        return 'text-yellow-400';
      case 'low':
        return 'text-green-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-white tracking-tight">My Tasks</h2>
        <div className="flex items-center gap-2">
          {task.status !== 'completed' && (
            <button
              onClick={handleMarkAsComplete}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-700 text-white rounded-xl hover:from-green-700 hover:to-emerald-800 font-medium transition-all duration-200 disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-105"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Completing...</span>
                </>
              ) : (
                <>
                  <CheckSquare size={18} />
                  <span>Mark as Complete</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-700 text-white rounded-xl hover:from-cyan-700 hover:to-blue-800 font-medium transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <Edit2 size={18} />
            <span>Edit</span>
          </button>

          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-500/20 text-red-300 border border-red-500/30 rounded-xl hover:bg-red-500/30 hover:border-red-500/40 font-medium transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <Trash2 size={18} />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-green-900/20 border border-green-900/30">
          <div className="flex">
            <div className="flex-shrink-0">
              <Check className="h-5 w-5 text-green-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-300">{success}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm shadow-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white tracking-tight">{task.title}</h2>
              <div className={`px-4 py-1.5 rounded-xl text-sm font-semibold shadow-lg ${
                task.status === 'completed'
                  ? 'bg-gradient-to-r from-emerald-500/20 to-green-600/20 text-emerald-300 ring-1 ring-emerald-400/30'
                  : task.status === 'cancelled'
                    ? 'bg-gradient-to-r from-red-500/20 to-red-600/20 text-red-300 ring-1 ring-red-400/30'
                    : 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-300 ring-1 ring-cyan-400/30'
              }`}>
                {task.status === 'completed'
                  ? 'Completed'
                  : task.status === 'cancelled'
                    ? 'Cancelled'
                    : 'In Progress'}
              </div>
            </div>
            
            <div className="prose prose-invert max-w-none mb-6">
              {task.description ? (
                <div className="whitespace-pre-line text-slate-300">{task.description}</div>
              ) : (
                <p className="text-slate-400 italic">No description provided</p>
              )}
            </div>
            
            {attachments.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Attachments</h3>
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-blue-500/10 hover:border-cyan-400/40 transition-all duration-200 shadow-sm hover:shadow-lg hover:scale-[1.02]"
                    >
                      <Paperclip size={18} className="text-cyan-400" />
                      <div>
                        <div className="text-white font-medium">{attachment.name}</div>
                        <div className="text-xs text-slate-400">
                          {(attachment.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
            
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Comments</h3>

              <div className="mb-4">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment..."
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-800/50 text-slate-200 rounded-xl border border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400/50 transition-all duration-200"
                />
                <div className="flex justify-end mt-3">
                  <button
                    onClick={handleAddComment}
                    disabled={!comment.trim()}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-700 text-white rounded-xl hover:from-cyan-700 hover:to-blue-800 font-medium transition-all duration-200 disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-105"
                  >
                    Add Comment
                  </button>
                </div>
              </div>
              
              <div className="space-y-3">
                {loadingComments ? (
                  <div className="p-6 text-center rounded-xl bg-slate-700/30">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400 mx-auto"></div>
                  </div>
                ) : comments.length > 0 ? (
                  comments.map((c) => (
                    <div key={c.id} className="p-4 rounded-xl border border-slate-700/50 bg-slate-800/50 shadow-md hover:shadow-lg transition-all duration-200">
                      <div className="flex items-start gap-3">
                        <Avatar
                          firstName={c.user?.first_name}
                          lastName={c.user?.last_name}
                          imageUrl={c.user?.avatar_url}
                          size="sm"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-white">
                              {c.user?.first_name} {c.user?.last_name}
                            </span>
                            <span className="text-xs text-slate-400">
                              {formatDate(c.created_at)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-300 leading-relaxed">{c.comment}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center rounded-xl border border-slate-700/50 bg-slate-800/20">
                    <MessageSquare className="mx-auto h-10 w-10 text-slate-500 mb-3" />
                    <p className="text-slate-400 font-medium">No comments yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm shadow-xl p-6">
            <h3 className="text-lg font-bold text-white mb-6 tracking-tight">Task Details</h3>
            
            <div className="space-y-5">
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Status</div>
                <div className={`inline-flex px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm ${
                  task.status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30'
                    : task.status === 'cancelled'
                      ? 'bg-red-500/20 text-red-300 ring-1 ring-red-400/30'
                      : 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/30'
                }`}>
                  {task.status === 'completed'
                    ? 'Completed'
                    : task.status === 'cancelled'
                      ? 'Cancelled'
                      : task.status === 'in_progress'
                        ? 'In Progress'
                        : 'Pending'}
                </div>
              </div>
              
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Assignee</div>
                {hasAssignee() ? (
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      firstName={(task as any).assignee?.first_name}
                      lastName={(task as any).assignee?.last_name}
                      imageUrl={(task as any).assignee?.avatar_url}
                      size="sm"
                    />
                    <span className="text-white font-medium">
                      {getAssigneeName()}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-slate-400" />
                    <span className="text-slate-400">Unassigned</span>
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Due Date</div>
                <div className="flex items-center gap-2.5">
                  <Calendar size={16} className="text-cyan-400" />
                  <span className="text-white font-medium">
                    {task.due_date ? formatDate(task.due_date) : 'No due date'}
                  </span>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Priority</div>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-semibold shadow-sm ${
                  task.priority === 'urgent'
                    ? 'bg-red-500/20 text-red-300 ring-1 ring-red-400/30'
                    : task.priority === 'high'
                    ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-400/30'
                    : task.priority === 'medium'
                    ? 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-400/30'
                    : 'bg-green-500/20 text-green-300 ring-1 ring-green-400/30'
                }`}>
                  <Flag size={14} />
                  <span className="capitalize text-sm">{task.priority}</span>
                </div>
              </div>
              
              {task.repeat_type && task.repeat_type !== 'none' && (
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Repeats</div>
                  <div className="flex items-center gap-2.5">
                    <Clock size={16} className="text-cyan-400" />
                    <span className="text-white font-medium capitalize">
                      {task.repeat_type}
                      {task.repeat_end_date && ` until ${formatDate(task.repeat_end_date)}`}
                    </span>
                  </div>
                </div>
              )}

              {task.send_reminder && (
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reminder</div>
                  <div className="flex items-center gap-2.5">
                    <Clock size={16} className="text-cyan-400" />
                    <span className="text-white font-medium">
                      {task.reminder_type === 'on_due_date' && 'On due date'}
                      {task.reminder_type === 'one_day_before' && '1 day before'}
                      {task.reminder_type === 'one_week_before' && '1 week before'}
                      {task.reminder_type === 'custom' && task.reminder_date && `On ${formatDate(task.reminder_date)}`}
                    </span>
                  </div>
                </div>
              )}

              {(() => {
                const assigneeMemberId = (task as any).assignee?.id || task.assignee_id;
                const filteredFollowers = followers.filter(f => f.id !== assigneeMemberId);
                if (filteredFollowers.length === 0) return null;
                return (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Supporting Members</div>
                    <div className="flex flex-col gap-2.5">
                      {filteredFollowers.map((follower) => (
                        <div key={follower.id} className="flex items-center gap-2.5">
                          <Avatar
                            firstName={follower.first_name}
                            lastName={follower.last_name}
                            imageUrl={follower.avatar_url}
                            size="sm"
                          />
                          <span className="text-white font-medium text-sm">
                            {follower.first_name} {follower.last_name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Created</div>
                <div className="flex items-center gap-2.5">
                  <Calendar size={16} className="text-cyan-400" />
                  <span className="text-white font-medium">
                    {formatDate(task.created_at)}
                  </span>
                </div>
              </div>

              {task.completed_at && (
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Completed</div>
                  <div className="flex items-center gap-2.5">
                    <CheckSquare size={16} className="text-green-400" />
                    <span className="text-white font-medium">
                      {formatDate(task.completed_at)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
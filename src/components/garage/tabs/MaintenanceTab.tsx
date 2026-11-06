import React, { useState, useEffect } from 'react';
import { Wrench, Plus, Calendar, DollarSign, Clock, Bell, CircleCheck as CheckCircle, CircleAlert as AlertCircle, SquarePen as Edit, Trash2, FileText, Repeat as RepeatIcon, User } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotifications } from '../../../contexts/NotificationContext';

interface MaintenanceTabProps {
  boatId: string;
  darkMode: boolean;
  onUpdate: () => void;
}

interface MaintenanceLog {
  id: string;
  boat_id: string;
  title: string;
  description?: string;
  maintenance_type: 'repair' | 'upgrade' | 'inspection' | 'cleaning' | 'other';
  cost?: number;
  performed_by?: string;
  performed_date: string;
  next_service_date?: string;
  notes?: string;
  attachments?: any[];
  created_at: string;
  updated_at: string;
}

interface MaintenanceReminder {
  id: string;
  boat_id: string;
  title: string;
  description?: string;
  reminder_type: 'time_based' | 'usage_based' | 'seasonal';
  due_date?: string;
  recurrence: 'once' | 'weekly' | 'monthly' | 'quarterly' | 'annually';
  is_completed: boolean;
  completed_date?: string;
  notification_days_before: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const maintenanceTypes = [
  { value: 'repair', label: 'Repair', color: 'from-red-500 to-orange-500' },
  { value: 'upgrade', label: 'Upgrade', color: 'from-blue-500 to-cyan-500' },
  { value: 'inspection', label: 'Inspection', color: 'from-yellow-500 to-amber-500' },
  { value: 'cleaning', label: 'Cleaning', color: 'from-green-500 to-emerald-500' },
  { value: 'other', label: 'Other', color: 'from-slate-500 to-slate-600' }
];

const recurrenceOptions = [
  { value: 'once', label: 'One Time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' }
];

export const MaintenanceTab: React.FC<MaintenanceTabProps> = ({ boatId, darkMode, onUpdate }) => {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<'logs' | 'reminders'>('logs');
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [reminders, setReminders] = useState<MaintenanceReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [editingLog, setEditingLog] = useState<MaintenanceLog | null>(null);
  const [editingReminder, setEditingReminder] = useState<MaintenanceReminder | null>(null);

  useEffect(() => {
    loadData();
  }, [boatId]);

  useEffect(() => {
    if (reminders.length > 0) {
      checkAndNotifyUpcomingMaintenance();
    }
  }, [reminders]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadLogs(), loadReminders()]);
    } finally {
      setLoading(false);
    }
  };

  const checkAndNotifyUpcomingMaintenance = () => {
    const today = new Date();

    reminders.forEach(reminder => {
      if (reminder.is_completed || !reminder.due_date) return;

      const dueDate = new Date(reminder.due_date);
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilDue <= reminder.notification_days_before && daysUntilDue >= 0) {
        const message = daysUntilDue === 0
          ? `Maintenance due TODAY: ${reminder.title}`
          : `Maintenance due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}: ${reminder.title}`;

        addNotification(daysUntilDue === 0 ? 'warning' : 'info', message);
      } else if (daysUntilDue < 0) {
        addNotification('error', `OVERDUE: ${reminder.title} was due ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'} ago`);
      }
    });
  };

  const createReminderFromNextService = async (logId: string, title: string, nextServiceDate: string, boatId: string, daysBefore: number = 7) => {
    try {
      const { data: existingReminder } = await supabase
        .from('maintenance_reminders')
        .select('id')
        .eq('boat_id', boatId)
        .eq('title', `Service: ${title}`)
        .eq('due_date', nextServiceDate)
        .maybeSingle();

      if (existingReminder) return;

      const { error } = await supabase
        .from('maintenance_reminders')
        .insert({
          boat_id: boatId,
          title: `Service: ${title}`,
          description: `Scheduled maintenance service for ${title}`,
          reminder_type: 'time_based',
          due_date: nextServiceDate,
          recurrence: 'once',
          notification_days_before: daysBefore,
          is_active: true,
          is_completed: false
        });

      if (error) throw error;

      addNotification('success', `Automatic reminder set for ${title} on ${new Date(nextServiceDate).toLocaleDateString()}`);
    } catch (error) {
      console.error('Error creating reminder:', error);
    }
  };

  const loadLogs = async () => {
    const { data, error } = await supabase
      .from('maintenance_logs')
      .select('*')
      .eq('boat_id', boatId)
      .order('performed_date', { ascending: false });

    if (error) throw error;
    setLogs(data || []);
  };

  const loadReminders = async () => {
    const { data, error } = await supabase
      .from('maintenance_reminders')
      .select('*')
      .eq('boat_id', boatId)
      .eq('is_active', true)
      .order('due_date', { ascending: true });

    if (error) throw error;
    setReminders(data || []);
  };

  const deleteLog = async (id: string) => {
    const logToDelete = logs.find(l => l.id === id);
    if (!confirm('Delete this maintenance log?')) return;

    try {
      const { error } = await supabase
        .from('maintenance_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;

      addNotification('success', `${logToDelete?.title || 'Maintenance log'} has been deleted`);

      await loadLogs();
      onUpdate();
    } catch (error) {
      console.error('Error deleting log:', error);
      addNotification('error', 'Failed to delete maintenance log');
    }
  };

  const deleteReminder = async (id: string) => {
    const reminderToDelete = reminders.find(r => r.id === id);
    if (!confirm('Delete this reminder?')) return;

    try {
      const { error } = await supabase
        .from('maintenance_reminders')
        .delete()
        .eq('id', id);

      if (error) throw error;

      addNotification('success', `${reminderToDelete?.title || 'Reminder'} has been deleted`);

      await loadReminders();
    } catch (error) {
      console.error('Error deleting reminder:', error);
      addNotification('error', 'Failed to delete reminder');
    }
  };

  const toggleReminderComplete = async (reminder: MaintenanceReminder) => {
    try {
      const { error } = await supabase
        .from('maintenance_reminders')
        .update({
          is_completed: !reminder.is_completed,
          completed_date: !reminder.is_completed ? new Date().toISOString() : null
        })
        .eq('id', reminder.id);

      if (error) throw error;

      if (!reminder.is_completed) {
        addNotification('success', `Great! ${reminder.title} has been marked as complete`);
      }

      await loadReminders();
    } catch (error) {
      console.error('Error toggling reminder:', error);
      addNotification('error', 'Failed to update reminder status');
    }
  };

  const getDaysUntilDue = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getDueStatus = (dueDate: string) => {
    const days = getDaysUntilDue(dueDate);
    if (days < 0) return { label: 'Overdue', color: 'text-red-500', bgColor: 'bg-red-500/10' };
    if (days === 0) return { label: 'Due Today', color: 'text-orange-500', bgColor: 'bg-orange-500/10' };
    if (days <= 7) return { label: `${days}d`, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' };
    return { label: `${days}d`, color: 'text-green-500', bgColor: 'bg-green-500/10' };
  };

  if (loading) {
    return (
      <div className="a-card text-center" style={{ padding: 48 }}>
        <Wrench className="w-8 h-8 mx-auto mb-3 animate-spin a-dim" />
        <p className="a-dim text-[13.5px]">Loading maintenance…</p>
      </div>
    );
  }

  const upcomingReminders = reminders.filter(r => !r.is_completed && r.due_date);
  const overdueReminders = upcomingReminders.filter(r => getDaysUntilDue(r.due_date!) < 0);
  const TYPE_DOT: Record<string, string> = { repair: '#FF6B6B', upgrade: '#2E7BFF', inspection: '#FFB340', cleaning: '#30D158', other: '#9AA6BD' };
  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const firstOverdue = overdueReminders[0];
  const statCard = (icon: React.ReactNode, cap: string, value: React.ReactNode, tone?: string) => (
    <div className="a-card flex items-center gap-3.5" style={{ padding: '16px 18px' }}>
      <span className="a-tile" style={{ width: 44, height: 44 }}>{icon}</span>
      <div>
        <p className="a-cap">{cap}</p>
        <div className={`a-display a-num text-[28px] font-semibold leading-none mt-1.5 ${tone || 'a-ink'}`}>{value}</div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {firstOverdue && (
        <div className="a-overdue flex flex-wrap items-center gap-3">
          <AlertCircle size={18} className="a-txt-r flex-shrink-0" />
          <div className="flex-1 min-w-[200px]">
            <span className="a-txt-r text-[14px] font-semibold">{firstOverdue.title}</span>
            <span className="a-mute text-[13px]"> · was due {new Date(firstOverdue.due_date!).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}, {Math.abs(getDaysUntilDue(firstOverdue.due_date!))} days ago</span>
          </div>
          <button onClick={() => toggleReminderComplete(firstOverdue)} className="a-btn a-btn-p" style={{ height: 36 }}>
            <CheckCircle size={16} />Mark done
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCard(<FileText size={20} />, 'Logs', logs.length)}
        {statCard(<Bell size={20} />, 'Active reminders', upcomingReminders.length)}
        {statCard(<AlertCircle size={20} />, 'Overdue', overdueReminders.length, overdueReminders.length > 0 ? 'a-txt-r' : undefined)}
        {statCard(<DollarSign size={20} />, 'Total cost', `$${logs.reduce((sum, log) => sum + (log.cost || 0), 0).toFixed(0)}`)}
      </div>

      <div className="a-card flex flex-col gap-4" style={{ padding: '18px 20px' }}>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="a-seg" role="tablist">
            <button onClick={() => setActiveTab('logs')} className={`a-seg-i ${activeTab === 'logs' ? 'a-seg-on' : ''}`} role="tab" aria-selected={activeTab === 'logs'}>
              <FileText size={16} />Logs{logs.length > 0 && <span className="a-cnt">{logs.length}</span>}
            </button>
            <button onClick={() => setActiveTab('reminders')} className={`a-seg-i ${activeTab === 'reminders' ? 'a-seg-on' : ''}`} role="tab" aria-selected={activeTab === 'reminders'}>
              <Bell size={16} />Reminders{overdueReminders.length > 0 && <span className="a-cnt" style={{ background: '#FF6B6B', color: '#fff', boxShadow: 'none' }}>{overdueReminders.length}</span>}
            </button>
          </div>
          <div className="flex-1" />
          {activeTab === 'logs' ? (
            <button onClick={() => { setEditingLog(null); setShowLogModal(true); }} className="a-btn a-btn-p" style={{ height: 40 }}>
              <Plus size={16} />Add log
            </button>
          ) : (
            <button onClick={() => { setEditingReminder(null); setShowReminderModal(true); }} className="a-btn a-btn-p" style={{ height: 40 }}>
              <Plus size={16} />Add reminder
            </button>
          )}
        </div>

        {activeTab === 'logs' ? (
          logs.length === 0 ? (
            <div className="a-grp a-empty text-center" style={{ padding: 32 }}>
              <span className="a-tile mx-auto mb-3" style={{ width: 48, height: 48 }}><Wrench size={20} /></span>
              <p className="a-ink text-[15px] font-semibold mb-1">No maintenance logs</p>
              <p className="a-dim text-[13px]">Start tracking your boat's maintenance</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {logs.map((log, i) => {
                const typeInfo = maintenanceTypes.find(t => t.value === log.maintenance_type);
                const dot = TYPE_DOT[log.maintenance_type] || '#9AA6BD';
                return (
                  <div key={log.id} className="flex gap-4 relative" style={{ paddingBottom: i < logs.length - 1 ? 20 : 0 }}>
                    {i < logs.length - 1 && <span className="a-tl-line" />}
                    <span className="a-tile flex-shrink-0" style={{ width: 40, height: 40, color: dot }}><Wrench size={17} /></span>
                    <div className="a-grp flex-1 min-w-0" style={{ padding: '14px 16px' }}>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="a-lb-fmt" style={{ height: 22, fontSize: 11.5 }}><span className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: dot }} />{typeInfo?.label || 'Other'}</span>
                        <span className="a-dim text-[12.5px]">{fmt(log.performed_date)}{log.performed_by ? ` · by ${log.performed_by}` : ''}</span>
                        <div className="flex-1" />
                        <button onClick={() => { setEditingLog(log); setShowLogModal(true); }} className="a-ib" style={{ width: 30, height: 30 }} aria-label="Edit log"><Edit size={15} /></button>
                        <button onClick={() => deleteLog(log.id)} className="a-ib a-ib-d" style={{ width: 30, height: 30 }} aria-label="Delete log"><Trash2 size={15} /></button>
                      </div>
                      <div className="a-ink text-[15.5px] font-semibold mt-2">{log.title}</div>
                      {log.description && <div className="a-mute text-[13.5px] mt-1 leading-[1.5]">{log.description}</div>}
                      {(log.cost || log.next_service_date) && (
                        <div className="a-dim flex flex-wrap gap-4 text-[12.5px] mt-2">
                          {!!log.cost && <span className="inline-flex items-center gap-1"><DollarSign size={13} />${log.cost.toFixed(2)}</span>}
                          {log.next_service_date && <span className="inline-flex items-center gap-1"><Calendar size={13} />Next service {fmt(log.next_service_date)}</span>}
                        </div>
                      )}
                      {log.notes && <div className="a-dim text-[13px] mt-2 italic">{log.notes}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : reminders.length === 0 ? (
          <div className="a-grp a-empty text-center" style={{ padding: 32 }}>
            <span className="a-tile mx-auto mb-3" style={{ width: 48, height: 48 }}><Bell size={20} /></span>
            <p className="a-ink text-[15px] font-semibold mb-1">No reminders set</p>
            <p className="a-dim text-[13px]">Create reminders for upcoming maintenance</p>
          </div>
        ) : (
          <div className="a-grp">
            {reminders.map(reminder => {
              const days = reminder.due_date ? getDaysUntilDue(reminder.due_date) : null;
              const tone = reminder.is_completed ? 'g' : days === null ? 'n' : days < 0 ? 'r' : days <= 7 ? 'a' : 'g';
              const label = reminder.is_completed ? 'Done' : days === null ? '' : days < 0 ? `${Math.abs(days)}d late` : days === 0 ? 'Due today' : `in ${days}d`;
              return (
                <div key={reminder.id} className="a-ir" style={{ alignItems: 'flex-start' }}>
                  <button onClick={() => toggleReminderComplete(reminder)} className={`a-chk mt-0.5 ${reminder.is_completed ? 'a-chk-on' : ''}`} style={{ borderRadius: 999 }} aria-label={reminder.is_completed ? 'Mark not done' : 'Mark done'}>
                    {reminder.is_completed && <CheckCircle size={13} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[14.5px] font-semibold ${reminder.is_completed ? 'a-dim line-through' : 'a-ink'}`}>{reminder.title}</div>
                    {reminder.description && <div className="a-mute text-[13px] mt-0.5">{reminder.description}</div>}
                    <div className="a-dim flex flex-wrap gap-3.5 text-[12.5px] mt-1.5">
                      {reminder.due_date && <span className="inline-flex items-center gap-1"><Calendar size={13} />Due {fmt(reminder.due_date)}</span>}
                      <span className="inline-flex items-center gap-1"><Bell size={13} />{reminder.notification_days_before} days before</span>
                      {reminder.recurrence !== 'once' && <span className="inline-flex items-center gap-1"><RepeatIcon size={13} />{recurrenceOptions.find(r => r.value === reminder.recurrence)?.label}</span>}
                    </div>
                  </div>
                  {label && <span className={`a-lb-fmt ${tone === 'r' ? 'a-lb-late' : tone === 'a' ? 'a-lb-soon' : ''}`} style={{ height: 22, fontSize: 11 }}>{label}</span>}
                  <button onClick={() => { setEditingReminder(reminder); setShowReminderModal(true); }} className="a-ib" style={{ width: 30, height: 30 }} aria-label="Edit reminder"><Edit size={15} /></button>
                  <button onClick={() => deleteReminder(reminder.id)} className="a-ib a-ib-d" style={{ width: 30, height: 30 }} aria-label="Delete reminder"><Trash2 size={15} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showLogModal && (
        <MaintenanceLogModal
          boatId={boatId}
          log={editingLog}
          darkMode={darkMode}
          onClose={() => {
            setShowLogModal(false);
            setEditingLog(null);
          }}
          onSave={async () => {
            await loadLogs();
            await loadReminders();
            onUpdate();
            setShowLogModal(false);
            setEditingLog(null);
          }}
          onCreateReminder={createReminderFromNextService}
        />
      )}

      {showReminderModal && (
        <MaintenanceReminderModal
          boatId={boatId}
          reminder={editingReminder}
          darkMode={darkMode}
          onClose={() => {
            setShowReminderModal(false);
            setEditingReminder(null);
          }}
          onSave={async () => {
            await loadReminders();
            setShowReminderModal(false);
            setEditingReminder(null);
          }}
        />
      )}
    </div>
  );
};

interface MaintenanceLogModalProps {
  boatId: string;
  log: MaintenanceLog | null;
  darkMode: boolean;
  onClose: () => void;
  onSave: () => void;
  onCreateReminder?: (logId: string, title: string, nextServiceDate: string, boatId: string, daysBefore?: number) => Promise<void>;
}

const MaintenanceLogModal: React.FC<MaintenanceLogModalProps> = ({ boatId, log, darkMode, onClose, onSave, onCreateReminder }) => {
  const { addNotification } = useNotifications();
  const [formData, setFormData] = useState({
    title: log?.title || '',
    description: log?.description || '',
    maintenance_type: log?.maintenance_type || 'repair',
    cost: log?.cost?.toString() || '',
    performed_by: log?.performed_by || '',
    performed_date: log?.performed_date || new Date().toISOString().split('T')[0],
    next_service_date: log?.next_service_date || '',
    notes: log?.notes || ''
  });
  const [createReminder, setCreateReminder] = useState(!!log?.next_service_date);
  const [reminderDaysBefore, setReminderDaysBefore] = useState('7');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!formData.title || !formData.performed_date) {
      alert('Please fill in required fields');
      return;
    }

    try {
      setSaving(true);
      const data = {
        boat_id: boatId,
        ...formData,
        cost: formData.cost ? parseFloat(formData.cost) : null,
        next_service_date: formData.next_service_date || null
      };

      let savedLogId = log?.id;

      if (log) {
        const { error } = await supabase
          .from('maintenance_logs')
          .update(data)
          .eq('id', log.id);
        if (error) throw error;

        addNotification('success', `${formData.title} has been updated successfully`);
      } else {
        const { data: newLog, error } = await supabase
          .from('maintenance_logs')
          .insert(data)
          .select()
          .single();

        if (error) throw error;
        savedLogId = newLog.id;

        addNotification('success', `${formData.title} has been logged successfully`);
      }

      if (formData.next_service_date && createReminder && onCreateReminder && savedLogId) {
        await onCreateReminder(savedLogId, formData.title, formData.next_service_date, boatId, parseInt(reminderDaysBefore) || 7);
      }

      onSave();
    } catch (error) {
      console.error('Error saving log:', error);
      addNotification('error', 'Failed to save maintenance log. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="a-sheet max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ padding: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="a-display a-ink text-[22px] font-semibold mb-5">
          {log ? 'Edit' : 'Add'} Maintenance Log
        </h3>

        <div className="space-y-4">
          <div>
            <label className="a-flab">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Hull Cleaning, Rigging Repair"
              className="a-inp w-full"
            />
          </div>

          <div>
            <label className="a-flab">
              Type
            </label>
            <div className="a-seg" style={{ display: 'flex' }}>
              {maintenanceTypes.map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, maintenance_type: type.value as any })}
                  className={`a-seg-i flex-1 justify-center ${formData.maintenance_type === type.value ? 'a-seg-on' : ''}`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="a-flab">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Describe what was done..."
              className="a-inp w-full"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="a-flab">
                Date Performed *
              </label>
              <input
                type="date"
                value={formData.performed_date}
                onChange={e => setFormData({ ...formData, performed_date: e.target.value })}
                className="a-inp w-full"
              />
            </div>

            <div>
              <label className="a-flab">
                Next Service Date
              </label>
              <input
                type="date"
                value={formData.next_service_date}
                onChange={e => setFormData({ ...formData, next_service_date: e.target.value })}
                className="a-inp w-full"
              />
            </div>
          </div>

          {formData.next_service_date && (
            <div className="a-grp" style={{ padding: 14 }}>
              <label className="flex items-center cursor-pointer group">
                <input
                  type="checkbox"
                  checked={createReminder}
                  onChange={(e) => setCreateReminder(e.target.checked)}
                  className="w-5 h-5 rounded accent-blue-500 cursor-pointer"
                />
                <span className="a-ink ml-3 font-medium text-[14px]">
                  Create automatic reminder for next service
                </span>
              </label>
              {createReminder && (
                <div className="mt-3 ml-8">
                  <label className="a-flab">
                    Notify me (days before)
                  </label>
                  <input
                    type="number"
                    value={reminderDaysBefore}
                    onChange={(e) => setReminderDaysBefore(e.target.value)}
                    className="a-inp" style={{ width: 128 }}
                  />
                  <p className="a-dim mt-2 text-[12.5px]">
                    You'll be reminded on {new Date(new Date(formData.next_service_date).getTime() - (parseInt(reminderDaysBefore) || 7) * 24 * 60 * 60 * 1000).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="a-flab">
                Cost
              </label>
              <div className="relative">
                <span className="a-dim absolute left-3 top-1/2 -translate-y-1/2">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.cost}
                  onChange={e => setFormData({ ...formData, cost: e.target.value })}
                  placeholder="0.00"
                  className="a-inp w-full" style={{ paddingLeft: 30 }}
                />
              </div>
            </div>

            <div>
              <label className="a-flab">
                Performed By
              </label>
              <input
                type="text"
                value={formData.performed_by}
                onChange={e => setFormData({ ...formData, performed_by: e.target.value })}
                placeholder="e.g., Self, Marine Shop"
                className="a-inp w-full"
              />
            </div>
          </div>

          <div>
            <label className="a-flab">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Additional notes..."
              className="a-inp w-full"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="a-btn flex-1 justify-center"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="a-btn a-btn-p flex-1 justify-center disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Log'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface MaintenanceReminderModalProps {
  boatId: string;
  reminder: MaintenanceReminder | null;
  darkMode: boolean;
  onClose: () => void;
  onSave: () => void;
}

const MaintenanceReminderModal: React.FC<MaintenanceReminderModalProps> = ({ boatId, reminder, darkMode, onClose, onSave }) => {
  const { addNotification } = useNotifications();
  const [formData, setFormData] = useState({
    title: reminder?.title || '',
    description: reminder?.description || '',
    reminder_type: reminder?.reminder_type || 'time_based',
    due_date: reminder?.due_date || '',
    recurrence: reminder?.recurrence || 'once',
    notification_days_before: reminder?.notification_days_before?.toString() || '7'
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!formData.title) {
      alert('Please enter a title');
      return;
    }

    try {
      setSaving(true);
      const data = {
        boat_id: boatId,
        ...formData,
        notification_days_before: parseInt(formData.notification_days_before) || 7,
        is_active: true,
        is_completed: false
      };

      if (reminder) {
        const { error } = await supabase
          .from('maintenance_reminders')
          .update(data)
          .eq('id', reminder.id);
        if (error) throw error;

        addNotification('success', `${formData.title} reminder has been updated`);
      } else {
        const { error } = await supabase
          .from('maintenance_reminders')
          .insert(data);
        if (error) throw error;

        const dueMessage = formData.due_date
          ? ` for ${new Date(formData.due_date).toLocaleDateString()}`
          : '';

        addNotification('success', `${formData.title} reminder has been set${dueMessage}`);
      }

      onSave();
    } catch (error) {
      console.error('Error saving reminder:', error);
      addNotification('error', 'Failed to save reminder. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="a-sheet max-w-2xl w-full" style={{ padding: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="a-display a-ink text-[22px] font-semibold mb-5">
          {reminder ? 'Edit' : 'Add'} Reminder
        </h3>

        <div className="space-y-4">
          <div>
            <label className="a-flab">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Check Rigging, Replace Sails"
              className="a-inp w-full"
            />
          </div>

          <div>
            <label className="a-flab">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="What needs to be done..."
              className="a-inp w-full"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="a-flab">
                Due Date
              </label>
              <input
                type="date"
                value={formData.due_date}
                onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                className="a-inp w-full"
              />
            </div>

            <div>
              <label className="a-flab">
                Notify Me (days before)
              </label>
              <input
                type="number"
                value={formData.notification_days_before}
                onChange={e => setFormData({ ...formData, notification_days_before: e.target.value })}
                className="a-inp w-full"
              />
            </div>
          </div>

          <div>
            <label className="a-flab">
              Recurrence
            </label>
            <div className="a-seg" style={{ display: 'flex' }}>
              {recurrenceOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, recurrence: option.value as any })}
                  className={`a-seg-i flex-1 justify-center ${formData.recurrence === option.value ? 'a-seg-on' : ''}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="a-btn flex-1 justify-center"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="a-btn a-btn-p flex-1 justify-center disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Reminder'}
          </button>
        </div>
      </div>
    </div>
  );
};

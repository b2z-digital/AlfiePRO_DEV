import React, { useState, useEffect } from 'react';
import {
  Wrench, Plus, Calendar, DollarSign, Clock, Bell,
  CheckCircle, AlertCircle, Edit, Trash2, FileText,
  RepeatIcon, User
} from 'lucide-react';
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
      <div className={`rounded-2xl p-12 text-center ${darkMode ? 'bg-slate-800/80 backdrop-blur-sm border border-slate-700' : 'bg-white border border-slate-200'}`}>
        <Wrench className={`w-8 h-8 mx-auto mb-4 animate-spin ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
        <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Loading maintenance data...</p>
      </div>
    );
  }

  const upcomingReminders = reminders.filter(r => !r.is_completed && r.due_date);
  const overdueReminders = upcomingReminders.filter(r => getDaysUntilDue(r.due_date!) < 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
          <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {logs.length}
          </div>
          <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Total Logs
          </div>
        </div>
        <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
          <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {upcomingReminders.length}
          </div>
          <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Active Reminders
          </div>
        </div>
        <div className={`rounded-xl p-4 ${darkMode ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-orange-50 border border-orange-200'}`}>
          <div className="text-2xl font-bold text-orange-500">
            {overdueReminders.length}
          </div>
          <div className={`text-sm ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
            Overdue
          </div>
        </div>
        <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
          <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            ${logs.reduce((sum, log) => sum + (log.cost || 0), 0).toFixed(0)}
          </div>
          <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Total Cost
          </div>
        </div>
      </div>

      {/* Tab Selector */}
      <div className={`rounded-2xl p-2 flex gap-2 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all ${
            activeTab === 'logs'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
              : darkMode
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4 inline mr-2" />
          Maintenance Logs
        </button>
        <button
          onClick={() => setActiveTab('reminders')}
          className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all ${
            activeTab === 'reminders'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
              : darkMode
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Bell className="w-4 h-4 inline mr-2" />
          Reminders
          {overdueReminders.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
              {overdueReminders.length}
            </span>
          )}
        </button>
      </div>

      {/* Content Area */}
      {activeTab === 'logs' ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Maintenance History
            </h3>
            <button
              onClick={() => {
                setEditingLog(null);
                setShowLogModal(true);
              }}
              className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 transition-all duration-200"
            >
              <Plus className="w-4 h-4 inline mr-2" />
              Add Log
            </button>
          </div>

          {logs.length === 0 ? (
            <div className={`rounded-2xl p-12 text-center ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
              <Wrench className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
              <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                No Maintenance Logs
              </h3>
              <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Start tracking your boat maintenance activities
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map(log => {
                const typeInfo = maintenanceTypes.find(t => t.value === log.maintenance_type);
                return (
                  <div
                    key={log.id}
                    className={`rounded-xl p-4 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'} hover:shadow-lg transition-all`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${typeInfo?.color} text-white`}>
                            {typeInfo?.label}
                          </span>
                          <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {new Date(log.performed_date).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className={`text-lg font-bold mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {log.title}
                        </h4>
                        {log.description && (
                          <p className={`text-sm mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {log.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-4 text-sm">
                          {log.cost && (
                            <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                              <DollarSign className="w-4 h-4 inline mr-1" />
                              ${log.cost.toFixed(2)}
                            </span>
                          )}
                          {log.performed_by && (
                            <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                              <User className="w-4 h-4 inline mr-1" />
                              {log.performed_by}
                            </span>
                          )}
                          {log.next_service_date && (
                            <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                              <Calendar className="w-4 h-4 inline mr-1" />
                              Next: {new Date(log.next_service_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {log.notes && (
                          <p className={`text-sm mt-2 italic ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                            {log.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => {
                            setEditingLog(log);
                            setShowLogModal(true);
                          }}
                          className={`p-2 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'}`}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteLog(log.id)}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Maintenance Reminders
            </h3>
            <button
              onClick={() => {
                setEditingReminder(null);
                setShowReminderModal(true);
              }}
              className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 transition-all duration-200"
            >
              <Plus className="w-4 h-4 inline mr-2" />
              Add Reminder
            </button>
          </div>

          {reminders.length === 0 ? (
            <div className={`rounded-2xl p-12 text-center ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
              <Bell className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
              <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                No Reminders Set
              </h3>
              <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Create reminders for upcoming maintenance tasks
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reminders.map(reminder => {
                const dueStatus = reminder.due_date ? getDueStatus(reminder.due_date) : null;
                return (
                  <div
                    key={reminder.id}
                    className={`rounded-xl p-4 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'} hover:shadow-lg transition-all`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <button
                          onClick={() => toggleReminderComplete(reminder)}
                          className={`mt-1 ${
                            reminder.is_completed
                              ? 'text-green-500'
                              : darkMode
                              ? 'text-slate-600 hover:text-slate-400'
                              : 'text-slate-300 hover:text-slate-500'
                          }`}
                        >
                          <CheckCircle className="w-5 h-5" fill={reminder.is_completed ? 'currentColor' : 'none'} />
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            {dueStatus && (
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${dueStatus.bgColor} ${dueStatus.color}`}>
                                {dueStatus.label}
                              </span>
                            )}
                            {reminder.recurrence !== 'once' && (
                              <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                <RepeatIcon className="w-3 h-3 inline mr-1" />
                                {recurrenceOptions.find(r => r.value === reminder.recurrence)?.label}
                              </span>
                            )}
                          </div>
                          <h4 className={`text-lg font-bold mb-1 ${
                            reminder.is_completed
                              ? darkMode ? 'text-slate-500 line-through' : 'text-slate-400 line-through'
                              : darkMode ? 'text-white' : 'text-slate-900'
                          }`}>
                            {reminder.title}
                          </h4>
                          {reminder.description && (
                            <p className={`text-sm mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              {reminder.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-4 text-sm">
                            {reminder.due_date && (
                              <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                                <Calendar className="w-4 h-4 inline mr-1" />
                                Due: {new Date(reminder.due_date).toLocaleDateString()}
                              </span>
                            )}
                            <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                              <Bell className="w-4 h-4 inline mr-1" />
                              {reminder.notification_days_before} days before
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => {
                            setEditingReminder(reminder);
                            setShowReminderModal(true);
                          }}
                          className={`p-2 rounded-lg ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteReminder(reminder.id)}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-slate-800/80 backdrop-blur-sm border border-slate-700' : 'bg-white border border-slate-200'}`}
        onClick={e => e.stopPropagation()}
      >
        <h3 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          {log ? 'Edit' : 'Add'} Maintenance Log
        </h3>

        <div className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Hull Cleaning, Rigging Repair"
              className={`w-full px-4 py-3 rounded-lg ${
                darkMode
                  ? 'bg-slate-800 border-slate-600 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Type
            </label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {maintenanceTypes.map(type => (
                <button
                  key={type.value}
                  onClick={() => setFormData({ ...formData, maintenance_type: type.value as any })}
                  className={`py-3 rounded-lg font-medium transition-all ${
                    formData.maintenance_type === type.value
                      ? `bg-gradient-to-r ${type.color} text-white shadow-lg`
                      : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Describe what was done..."
              className={`w-full px-4 py-3 rounded-lg ${
                darkMode
                  ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Date Performed *
              </label>
              <input
                type="date"
                value={formData.performed_date}
                onChange={e => setFormData({ ...formData, performed_date: e.target.value })}
                className={`w-full px-4 py-3 rounded-lg ${
                  darkMode
                    ? 'bg-slate-800 border-slate-600 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Next Service Date
              </label>
              <input
                type="date"
                value={formData.next_service_date}
                onChange={e => setFormData({ ...formData, next_service_date: e.target.value })}
                className={`w-full px-4 py-3 rounded-lg ${
                  darkMode
                    ? 'bg-slate-800 border-slate-600 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
              />
            </div>
          </div>

          {formData.next_service_date && (
            <div className={`rounded-lg p-4 ${darkMode ? 'bg-slate-700/50 border border-slate-600' : 'bg-blue-50 border border-blue-200'}`}>
              <label className="flex items-center cursor-pointer group">
                <input
                  type="checkbox"
                  checked={createReminder}
                  onChange={(e) => setCreateReminder(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-cyan-500 text-cyan-500 focus:ring-2 focus:ring-cyan-500 cursor-pointer"
                />
                <span className={`ml-3 font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                  Create automatic reminder for next service
                </span>
              </label>
              {createReminder && (
                <div className="mt-3 ml-8">
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    Notify me (days before)
                  </label>
                  <input
                    type="number"
                    value={reminderDaysBefore}
                    onChange={(e) => setReminderDaysBefore(e.target.value)}
                    className={`w-32 px-3 py-2 rounded-lg ${
                      darkMode
                        ? 'bg-slate-800 border-slate-600 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                  />
                  <p className={`mt-2 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    You'll be reminded on {new Date(new Date(formData.next_service_date).getTime() - (parseInt(reminderDaysBefore) || 7) * 24 * 60 * 60 * 1000).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Cost
              </label>
              <div className="relative">
                <span className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.cost}
                  onChange={e => setFormData({ ...formData, cost: e.target.value })}
                  placeholder="0.00"
                  className={`w-full pl-8 pr-4 py-3 rounded-lg ${
                    darkMode
                      ? 'bg-slate-800 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Performed By
              </label>
              <input
                type="text"
                value={formData.performed_by}
                onChange={e => setFormData({ ...formData, performed_by: e.target.value })}
                placeholder="e.g., Self, Marine Shop"
                className={`w-full px-4 py-3 rounded-lg ${
                  darkMode
                    ? 'bg-slate-800 border-slate-600 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Additional notes..."
              className={`w-full px-4 py-3 rounded-lg ${
                darkMode
                  ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className={`flex-1 px-4 py-3 rounded-lg font-medium ${
              darkMode ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-900'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 transition-all duration-200 disabled:opacity-50"
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`rounded-2xl p-6 max-w-2xl w-full ${darkMode ? 'bg-slate-800/80 backdrop-blur-sm border border-slate-700' : 'bg-white border border-slate-200'}`}
        onClick={e => e.stopPropagation()}
      >
        <h3 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          {reminder ? 'Edit' : 'Add'} Reminder
        </h3>

        <div className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Check Rigging, Replace Sails"
              className={`w-full px-4 py-3 rounded-lg ${
                darkMode
                  ? 'bg-slate-800 border-slate-600 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="What needs to be done..."
              className={`w-full px-4 py-3 rounded-lg ${
                darkMode
                  ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Due Date
              </label>
              <input
                type="date"
                value={formData.due_date}
                onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                className={`w-full px-4 py-3 rounded-lg ${
                  darkMode
                    ? 'bg-slate-800 border-slate-600 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Notify Me (days before)
              </label>
              <input
                type="number"
                value={formData.notification_days_before}
                onChange={e => setFormData({ ...formData, notification_days_before: e.target.value })}
                className={`w-full px-4 py-3 rounded-lg ${
                  darkMode
                    ? 'bg-slate-800 border-slate-600 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Recurrence
            </label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {recurrenceOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => setFormData({ ...formData, recurrence: option.value as any })}
                  className={`py-3 rounded-lg font-medium transition-all ${
                    formData.recurrence === option.value
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
                      : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
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
            className={`flex-1 px-4 py-3 rounded-lg font-medium ${
              darkMode ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-900'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 transition-all duration-200 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Reminder'}
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { MessageSquare, Settings, Clock, Zap, ToggleLeft, ToggleRight, Save, Filter } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

interface SmsSettings {
  is_enabled: boolean;
  auto_send_enabled: boolean;
  auto_send_days_before: number;
  send_time: string;
  message_template: string;
  include_boat_class_filter: boolean;
}

const DEFAULT_TEMPLATE = 'Hi {first_name}, {event_name} is on {event_date} at {venue}. Will you be sailing? Reply YES, NO, or MAYBE.';

interface SmsAttendanceSettingsProps {
  darkMode?: boolean;
  clubId: string;
}

export const SmsAttendanceSettings: React.FC<SmsAttendanceSettingsProps> = ({ darkMode = true, clubId }) => {
  const { addNotification } = useNotifications();
  const [settings, setSettings] = useState<SmsSettings>({
    is_enabled: false,
    auto_send_enabled: false,
    auto_send_days_before: 7,
    send_time: '09:00',
    message_template: DEFAULT_TEMPLATE,
    include_boat_class_filter: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (clubId) fetchSettings();
  }, [clubId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('sms_club_settings')
        .select('*')
        .eq('club_id', clubId)
        .maybeSingle();

      if (data) {
        setSettings({
          is_enabled: data.is_enabled,
          auto_send_enabled: data.auto_send_enabled,
          auto_send_days_before: data.auto_send_days_before,
          send_time: data.send_time?.slice(0, 5) || '09:00',
          message_template: data.message_template || DEFAULT_TEMPLATE,
          include_boat_class_filter: data.include_boat_class_filter,
        });
      }
    } catch (err) {
      console.error('Error fetching SMS settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('sms_club_settings')
        .upsert({
          club_id: clubId,
          is_enabled: settings.is_enabled,
          auto_send_enabled: settings.auto_send_enabled,
          auto_send_days_before: settings.auto_send_days_before,
          send_time: settings.send_time + ':00',
          message_template: settings.message_template,
          include_boat_class_filter: settings.include_boat_class_filter,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'club_id' });

      if (error) throw error;
      addNotification('success', 'SMS settings saved');
      setHasChanges(false);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof SmsSettings>(key: K, value: SmsSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const previewMessage = settings.message_template
    .replace('{first_name}', 'John')
    .replace('{last_name}', 'Smith')
    .replace('{event_name}', 'IOM Championship')
    .replace('{event_date}', 'Sat 22 Feb')
    .replace('{venue}', 'Lake Macquarie')
    .replace('{boat_class}', 'IOM');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`p-5 rounded-xl ${darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${settings.is_enabled ? 'bg-teal-500/10 ring-1 ring-teal-500/20' : darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
              <MessageSquare size={20} className={settings.is_enabled ? 'text-teal-400' : darkMode ? 'text-slate-400' : 'text-slate-500'} />
            </div>
            <div>
              <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>SMS Attendance</h3>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Send automated SMS to members before events
              </p>
            </div>
          </div>
          <button
            onClick={() => updateSetting('is_enabled', !settings.is_enabled)}
            className="transition-transform hover:scale-105"
          >
            {settings.is_enabled ? (
              <ToggleRight size={36} className="text-teal-500" />
            ) : (
              <ToggleLeft size={36} className={darkMode ? 'text-slate-600' : 'text-slate-300'} />
            )}
          </button>
        </div>

        {settings.is_enabled && (
          <div className="space-y-5">
            <div className={`p-4 rounded-xl ${darkMode ? 'bg-slate-700/30 border border-slate-700/50' : 'bg-slate-50 border border-slate-200'}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-amber-400" />
                  <span className={`font-medium text-sm ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    Auto-Send Before Events
                  </span>
                </div>
                <button
                  onClick={() => updateSetting('auto_send_enabled', !settings.auto_send_enabled)}
                  className="transition-transform hover:scale-105"
                >
                  {settings.auto_send_enabled ? (
                    <ToggleRight size={28} className="text-teal-500" />
                  ) : (
                    <ToggleLeft size={28} className={darkMode ? 'text-slate-600' : 'text-slate-300'} />
                  )}
                </button>
              </div>

              {settings.auto_send_enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Days Before Event
                    </label>
                    <select
                      value={settings.auto_send_days_before}
                      onChange={(e) => updateSetting('auto_send_days_before', parseInt(e.target.value))}
                      className={`w-full px-3 py-2 rounded-lg text-sm ${
                        darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                      } border focus:ring-2 focus:ring-blue-500`}
                    >
                      <option value={1}>1 day</option>
                      <option value={2}>2 days</option>
                      <option value={3}>3 days</option>
                      <option value={5}>5 days</option>
                      <option value={7}>7 days (recommended)</option>
                      <option value={14}>14 days</option>
                    </select>
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Send Time
                    </label>
                    <div className="flex items-center gap-2">
                      <Clock size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                      <input
                        type="time"
                        value={settings.send_time}
                        onChange={(e) => updateSetting('send_time', e.target.value)}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm ${
                          darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                        } border focus:ring-2 focus:ring-blue-500`}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className={`p-4 rounded-xl ${darkMode ? 'bg-slate-700/30 border border-slate-700/50' : 'bg-slate-50 border border-slate-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-blue-400" />
                  <span className={`font-medium text-sm ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    Filter by Boat Class
                  </span>
                </div>
                <button
                  onClick={() => updateSetting('include_boat_class_filter', !settings.include_boat_class_filter)}
                  className="transition-transform hover:scale-105"
                >
                  {settings.include_boat_class_filter ? (
                    <ToggleRight size={28} className="text-teal-500" />
                  ) : (
                    <ToggleLeft size={28} className={darkMode ? 'text-slate-600' : 'text-slate-300'} />
                  )}
                </button>
              </div>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                When enabled, SMS is only sent to members who own a boat of the class being raced. Saves tokens by targeting relevant members only.
              </p>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Message Template
              </label>
              <textarea
                value={settings.message_template}
                onChange={(e) => updateSetting('message_template', e.target.value)}
                rows={3}
                className={`w-full px-4 py-3 rounded-xl text-sm ${
                  darkMode ? 'bg-slate-700 text-slate-200 border-slate-600 placeholder-slate-500' : 'bg-white text-slate-900 border-slate-300'
                } border focus:ring-2 focus:ring-blue-500 resize-none`}
                placeholder="Enter your SMS template..."
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {['{first_name}', '{event_name}', '{event_date}', '{venue}', '{boat_class}'].map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => updateSetting('message_template', settings.message_template + ' ' + tag)}
                    className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                      darkMode
                        ? 'bg-slate-700 text-blue-400 hover:bg-slate-600 border border-slate-600'
                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Preview
              </label>
              <div className={`p-4 rounded-xl border-2 border-dashed ${
                darkMode ? 'border-slate-600 bg-slate-800/30' : 'border-slate-300 bg-slate-50'
              }`}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-teal-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageSquare size={14} className="text-teal-400" />
                  </div>
                  <div>
                    <p className={`text-xs mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>SMS Preview</p>
                    <p className={`text-sm leading-relaxed ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      {previewMessage}
                    </p>
                    <p className={`text-xs mt-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {previewMessage.length} characters ({Math.ceil(previewMessage.length / 160)} SMS segment{Math.ceil(previewMessage.length / 160) > 1 ? 's' : ''})
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {hasChanges && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shadow-lg shadow-blue-500/20"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Save size={16} />
            )}
            Save Settings
          </button>
        </div>
      )}
    </div>
  );
};

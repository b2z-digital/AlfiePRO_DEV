import React, { useState, useEffect } from 'react';
import { Users, Plus, Clock, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Trash2, UserCheck, UserX, Download, Search, Phone, FileText, Anchor } from 'lucide-react';
import {
  getSignOnSheet, signOn, signOff, signOffAll, deleteSignOn, getStillOnWater,
  RaceDaySignOn
} from '../utils/raceSignOnStorage';
import { useAuth } from '../contexts/AuthContext';

interface RaceSignOnSheetProps {
  eventId: string;
  clubId: string;
  darkMode: boolean;
  isAdmin: boolean;
  eventName?: string;
  members?: Array<{ id: string; first_name: string; last_name: string; sail_number?: string }>;
}

export const RaceSignOnSheet: React.FC<RaceSignOnSheetProps> = ({
  eventId,
  clubId,
  darkMode,
  isAdmin,
  eventName,
  members = []
}) => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<RaceDaySignOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [raceDay, setRaceDay] = useState(new Date().toISOString().split('T')[0]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'on_water'>('all');

  const [form, setForm] = useState({
    skipper_name: '',
    sail_number: '',
    member_id: null as string | null,
    emergency_contact_name: '',
    emergency_contact_phone: '',
    notes: '',
  });

  useEffect(() => {
    loadEntries();
  }, [eventId, raceDay]);

  const loadEntries = async () => {
    setLoading(true);
    const data = await getSignOnSheet(eventId, raceDay);
    setEntries(data);
    setLoading(false);
  };

  const handleSignOn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.skipper_name.trim() || !form.sail_number.trim()) return;

    const result = await signOn({
      event_id: eventId,
      club_id: clubId,
      race_day: raceDay,
      skipper_name: form.skipper_name.trim(),
      sail_number: form.sail_number.trim(),
      member_id: form.member_id,
      user_id: user?.id || null,
      signed_on_by: isAdmin ? 'admin' : 'self',
      emergency_contact_name: form.emergency_contact_name.trim() || null,
      emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      notes: form.notes.trim() || null,
    });

    if (result.success) {
      setForm({ skipper_name: '', sail_number: '', member_id: null, emergency_contact_name: '', emergency_contact_phone: '', notes: '' });
      setShowAddForm(false);
      loadEntries();
    }
  };

  const handleSignOff = async (id: string) => {
    const result = await signOff(id);
    if (result.success) loadEntries();
  };

  const handleSignOffAll = async () => {
    if (!confirm('Sign off all skippers still on the water?')) return;
    const result = await signOffAll(eventId, raceDay);
    if (result.success) loadEntries();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this sign-on entry?')) return;
    const result = await deleteSignOn(id);
    if (result.success) loadEntries();
  };

  const handleMemberSelect = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (member) {
      setForm(prev => ({
        ...prev,
        skipper_name: `${member.first_name} ${member.last_name}`,
        sail_number: member.sail_number || prev.sail_number,
        member_id: member.id,
      }));
    }
  };

  const onWater = entries.filter(e => !e.signed_off_at);
  const signedOff = entries.filter(e => !!e.signed_off_at);
  const displayEntries = viewMode === 'on_water' ? onWater : entries;

  const filtered = displayEntries.filter(e =>
    e.skipper_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.sail_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportCSV = () => {
    const headers = ['Skipper Name', 'Sail Number', 'Signed On', 'Signed Off', 'Emergency Contact', 'Notes'];
    const rows = entries.map(e => [
      e.skipper_name,
      e.sail_number,
      new Date(e.signed_on_at).toLocaleTimeString(),
      e.signed_off_at ? new Date(e.signed_off_at).toLocaleTimeString() : 'Still on water',
      e.emergency_contact_name ? `${e.emergency_contact_name} (${e.emergency_contact_phone || ''})` : '',
      e.notes || ''
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sign_on_sheet_${raceDay}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const bgClass = darkMode ? 'bg-gray-800' : 'bg-white';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const mutedClass = darkMode ? 'text-gray-400' : 'text-gray-500';
  const borderClass = darkMode ? 'border-gray-700' : 'border-gray-200';
  const inputClass = darkMode
    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400';

  return (
    <div className={`${bgClass} rounded-xl shadow-sm border ${borderClass} overflow-hidden`}>
      {/* Header */}
      <div className={`p-4 border-b ${borderClass}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Anchor className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${textClass}`}>Race Day Sign-On</h2>
              <p className={`text-sm ${mutedClass}`}>
                {onWater.length} on water / {entries.length} total
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={raceDay}
              onChange={(e) => setRaceDay(e.target.value)}
              className={`px-3 py-1.5 text-sm rounded-lg border ${inputClass}`}
            />
            {isAdmin && (
              <button
                onClick={exportCSV}
                className={`p-2 rounded-lg border ${borderClass} hover:bg-gray-100 dark:hover:bg-gray-700`}
                title="Export CSV"
              >
                <Download className={`w-4 h-4 ${mutedClass}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Safety Alert */}
      {onWater.length > 0 && (
        <div className="mx-4 mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {onWater.length} skipper{onWater.length !== 1 ? 's' : ''} still on the water
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Ensure all skippers sign off before leaving the venue
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={handleSignOffAll}
              className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700"
            >
              Sign Off All
            </button>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${mutedClass}`} />
          <input
            type="text"
            placeholder="Search skippers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg border ${inputClass}`}
          />
        </div>
        <div className="flex rounded-lg overflow-hidden border ${borderClass}">
          <button
            onClick={() => setViewMode('all')}
            className={`px-3 py-2 text-xs font-medium ${viewMode === 'all'
              ? 'bg-blue-600 text-white'
              : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
            }`}
          >
            All ({entries.length})
          </button>
          <button
            onClick={() => setViewMode('on_water')}
            className={`px-3 py-2 text-xs font-medium ${viewMode === 'on_water'
              ? 'bg-blue-600 text-white'
              : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
            }`}
          >
            On Water ({onWater.length})
          </button>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Sign On
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className={`mx-4 mb-4 p-4 rounded-lg border ${borderClass} ${darkMode ? 'bg-gray-750' : 'bg-gray-50'}`}>
          <form onSubmit={handleSignOn} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {members.length > 0 && (
                <div className="sm:col-span-2">
                  <label className={`block text-xs font-medium mb-1 ${mutedClass}`}>Select Member</label>
                  <select
                    onChange={(e) => handleMemberSelect(e.target.value)}
                    className={`w-full px-3 py-2 text-sm rounded-lg border ${inputClass}`}
                    defaultValue=""
                  >
                    <option value="">-- Quick select from members --</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.first_name} {m.last_name} {m.sail_number ? `(${m.sail_number})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className={`block text-xs font-medium mb-1 ${mutedClass}`}>Skipper Name *</label>
                <input
                  type="text"
                  value={form.skipper_name}
                  onChange={(e) => setForm(prev => ({ ...prev, skipper_name: e.target.value }))}
                  className={`w-full px-3 py-2 text-sm rounded-lg border ${inputClass}`}
                  required
                />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${mutedClass}`}>Sail Number *</label>
                <input
                  type="text"
                  value={form.sail_number}
                  onChange={(e) => setForm(prev => ({ ...prev, sail_number: e.target.value }))}
                  className={`w-full px-3 py-2 text-sm rounded-lg border ${inputClass}`}
                  required
                />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${mutedClass}`}>Emergency Contact Name</label>
                <input
                  type="text"
                  value={form.emergency_contact_name}
                  onChange={(e) => setForm(prev => ({ ...prev, emergency_contact_name: e.target.value }))}
                  className={`w-full px-3 py-2 text-sm rounded-lg border ${inputClass}`}
                />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${mutedClass}`}>Emergency Contact Phone</label>
                <input
                  type="text"
                  value={form.emergency_contact_phone}
                  onChange={(e) => setForm(prev => ({ ...prev, emergency_contact_phone: e.target.value }))}
                  className={`w-full px-3 py-2 text-sm rounded-lg border ${inputClass}`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={`block text-xs font-medium mb-1 ${mutedClass}`}>Notes</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. New sailor, requires buddy"
                  className={`w-full px-3 py-2 text-sm rounded-lg border ${inputClass}`}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className={`px-4 py-2 text-sm rounded-lg border ${borderClass} ${darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Sign On
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Entries List */}
      <div className="px-4 pb-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <Users className={`w-10 h-10 mx-auto mb-2 ${mutedClass}`} />
            <p className={`text-sm ${mutedClass}`}>
              {searchTerm ? 'No matching entries' : 'No one has signed on yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${borderClass} ${
                  entry.signed_off_at
                    ? darkMode ? 'bg-gray-800/50 opacity-70' : 'bg-gray-50 opacity-70'
                    : darkMode ? 'bg-gray-750' : 'bg-white'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  entry.signed_off_at
                    ? 'bg-green-100 dark:bg-green-900/30'
                    : 'bg-blue-100 dark:bg-blue-900/30'
                }`}>
                  {entry.signed_off_at
                    ? <UserCheck className="w-4 h-4 text-green-600" />
                    : <Anchor className="w-4 h-4 text-blue-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium text-sm ${textClass} truncate`}>
                      {entry.skipper_name}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                      {entry.sail_number}
                    </span>
                  </div>
                  <div className={`flex items-center gap-3 text-xs ${mutedClass} mt-0.5`}>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(entry.signed_on_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {entry.signed_off_at && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-3 h-3" />
                        Off {new Date(entry.signed_off_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {entry.emergency_contact_name && (
                      <span className="flex items-center gap-1" title={`${entry.emergency_contact_name}: ${entry.emergency_contact_phone || 'No phone'}`}>
                        <Phone className="w-3 h-3" />
                        {entry.emergency_contact_name}
                      </span>
                    )}
                    {entry.notes && (
                      <span className="flex items-center gap-1" title={entry.notes}>
                        <FileText className="w-3 h-3" />
                        {entry.notes.length > 20 ? entry.notes.slice(0, 20) + '...' : entry.notes}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!entry.signed_off_at && (
                    <button
                      onClick={() => handleSignOff(entry.id)}
                      className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                      title="Sign Off"
                    >
                      <UserCheck className="w-4 h-4" />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Users, Plus, Clock, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Trash2, UserCheck, UserX, Download, Search, Phone, Anchor, SquareCheck as CheckSquare, Square } from 'lucide-react';
import {
  getSignOnSheet, signOn, signOff, signOffAll, deleteSignOn,
  RaceDaySignOn
} from '../utils/raceSignOnStorage';
import { useAuth } from '../contexts/AuthContext';

interface EventSkipper {
  name: string;
  sailNo?: string;
  memberId?: string;
  boatId?: string;
  hull?: string;
  club?: string;
  [key: string]: any;
}

interface RaceSignOnSheetProps {
  eventId: string;
  clubId: string;
  darkMode: boolean;
  isAdmin: boolean;
  eventName?: string;
  eventSkippers?: EventSkipper[];
  members?: Array<{ id: string; first_name: string; last_name: string; sail_number?: string }>;
}

export const RaceSignOnSheet: React.FC<RaceSignOnSheetProps> = ({
  eventId,
  clubId,
  darkMode,
  isAdmin,
  eventName,
  eventSkippers = [],
  members = []
}) => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<RaceDaySignOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [raceDay, setRaceDay] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddWalkUp, setShowAddWalkUp] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'signed_on' | 'not_signed_on'>('all');

  const [walkUpForm, setWalkUpForm] = useState({
    skipper_name: '',
    sail_number: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
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

  const handleQuickSignOn = async (skipper: EventSkipper) => {
    const result = await signOn({
      event_id: eventId,
      club_id: clubId,
      race_day: raceDay,
      skipper_name: skipper.name,
      sail_number: skipper.sailNo || '',
      member_id: skipper.memberId || null,
      user_id: user?.id || null,
      signed_on_by: isAdmin ? 'admin' : 'self',
      emergency_contact_name: null,
      emergency_contact_phone: null,
      notes: null,
    });
    if (result.success) loadEntries();
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

  const handleSignOnAll = async () => {
    const unsignedSkippers = eventSkippers.filter(s =>
      !entries.some(e => e.skipper_name.toLowerCase() === s.name.toLowerCase() || (s.sailNo && e.sail_number === s.sailNo))
    );
    for (const skipper of unsignedSkippers) {
      await signOn({
        event_id: eventId,
        club_id: clubId,
        race_day: raceDay,
        skipper_name: skipper.name,
        sail_number: skipper.sailNo || '',
        member_id: skipper.memberId || null,
        user_id: null,
        signed_on_by: 'admin',
        emergency_contact_name: null,
        emergency_contact_phone: null,
        notes: null,
      });
    }
    loadEntries();
  };

  const handleWalkUpSignOn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkUpForm.skipper_name.trim()) return;
    const result = await signOn({
      event_id: eventId,
      club_id: clubId,
      race_day: raceDay,
      skipper_name: walkUpForm.skipper_name.trim(),
      sail_number: walkUpForm.sail_number.trim(),
      member_id: null,
      user_id: user?.id || null,
      signed_on_by: isAdmin ? 'admin' : 'self',
      emergency_contact_name: walkUpForm.emergency_contact_name.trim() || null,
      emergency_contact_phone: walkUpForm.emergency_contact_phone.trim() || null,
      notes: 'Walk-up entry',
    });
    if (result.success) {
      setWalkUpForm({ skipper_name: '', sail_number: '', emergency_contact_name: '', emergency_contact_phone: '' });
      setShowAddWalkUp(false);
      loadEntries();
    }
  };

  const exportCSV = () => {
    const headers = ['Skipper Name', 'Sail Number', 'Signed On', 'Signed Off', 'Status'];
    const rows = entries.map(e => [
      e.skipper_name,
      e.sail_number,
      new Date(e.signed_on_at).toLocaleTimeString(),
      e.signed_off_at ? new Date(e.signed_off_at).toLocaleTimeString() : '',
      e.signed_off_at ? 'Signed Off' : 'On Water'
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sign_on_${raceDay}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Determine sign-on status for each event skipper
  const getSkipperStatus = (skipper: EventSkipper) => {
    return entries.find(e =>
      e.skipper_name.toLowerCase() === skipper.name.toLowerCase() ||
      (skipper.sailNo && e.sail_number === skipper.sailNo)
    );
  };

  const onWater = entries.filter(e => !e.signed_off_at);
  const signedOff = entries.filter(e => !!e.signed_off_at);
  const totalRegistered = eventSkippers.length;
  const totalSignedOn = entries.length;
  const unsignedCount = eventSkippers.filter(s => !getSkipperStatus(s)).length;

  // Build display list based on view mode (for events without registered skippers)
  const getDisplayList = () => {
    if (eventSkippers.length === 0) {
      const list = viewMode === 'signed_on' ? entries : viewMode === 'not_signed_on' ? [] : entries;
      return list.filter(e =>
        e.skipper_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.sail_number.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return [];
  };

  // Build the skipper roster with status
  const getSkipperRoster = () => {
    if (eventSkippers.length === 0) return [];

    let roster = eventSkippers.map(skipper => ({
      skipper,
      entry: getSkipperStatus(skipper),
    }));

    // Filter by view mode
    if (viewMode === 'signed_on') {
      roster = roster.filter(r => !!r.entry);
    } else if (viewMode === 'not_signed_on') {
      roster = roster.filter(r => !r.entry);
    }

    // Filter by search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      roster = roster.filter(r =>
        r.skipper.name.toLowerCase().includes(term) ||
        (r.skipper.sailNo && r.skipper.sailNo.toLowerCase().includes(term))
      );
    }

    return roster;
  };

  // Walk-up entries not in the event skippers list
  const getWalkUpEntries = () => {
    if (eventSkippers.length === 0) return [];
    return entries.filter(e =>
      !eventSkippers.some(s =>
        s.name.toLowerCase() === e.skipper_name.toLowerCase() ||
        (s.sailNo && s.sailNo === e.sail_number)
      )
    ).filter(e =>
      !searchTerm || e.skipper_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.sail_number.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const inputClass = darkMode
    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400';

  return (
    <div className={`rounded-xl border overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      {/* Header */}
      <div className={`p-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${darkMode ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
              <Anchor className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Race Day Sign-On
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {totalSignedOn} signed on{totalRegistered > 0 ? ` / ${totalRegistered} registered` : ''}
                {onWater.length > 0 && ` | ${onWater.length} on water`}
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
            <button
              onClick={exportCSV}
              className={`p-2 rounded-lg border ${darkMode ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-100'}`}
              title="Export CSV"
            >
              <Download className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Safety Alert */}
      {onWater.length > 0 && (
        <div className={`mx-4 mt-4 p-3 rounded-lg flex items-center gap-3 ${darkMode ? 'bg-amber-900/20 border border-amber-700/50' : 'bg-amber-50 border border-amber-200'}`}>
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className={`text-sm font-medium ${darkMode ? 'text-amber-200' : 'text-amber-800'}`}>
              {onWater.length} skipper{onWater.length !== 1 ? 's' : ''} still on the water
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
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
          <input
            type="text"
            placeholder="Search skippers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg border ${inputClass}`}
          />
        </div>
        <div className={`flex rounded-lg overflow-hidden border ${darkMode ? 'border-slate-600' : 'border-slate-300'}`}>
          {(['all', 'signed_on', 'not_signed_on'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-2 text-xs font-medium ${viewMode === mode
                ? 'bg-blue-600 text-white'
                : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {mode === 'all' ? `All (${eventSkippers.length || entries.length})` : mode === 'signed_on' ? `Signed On (${entries.length})` : `Awaiting (${unsignedCount})`}
            </button>
          ))}
        </div>
        {isAdmin && eventSkippers.length > 0 && unsignedCount > 0 && (
          <button
            onClick={handleSignOnAll}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700"
            title="Sign on all registered skippers"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Sign On All
          </button>
        )}
        <button
          onClick={() => setShowAddWalkUp(!showAddWalkUp)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-3.5 h-3.5" />
          Walk-Up
        </button>
      </div>

      {/* Walk-Up Form */}
      {showAddWalkUp && (
        <div className={`mx-4 mb-4 p-4 rounded-lg border ${darkMode ? 'bg-slate-750 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
          <h4 className={`text-xs font-semibold mb-3 uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Add Walk-Up Entry
          </h4>
          <form onSubmit={handleWalkUpSignOn} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <input
                type="text"
                value={walkUpForm.skipper_name}
                onChange={(e) => setWalkUpForm(prev => ({ ...prev, skipper_name: e.target.value }))}
                placeholder="Skipper Name *"
                className={`w-full px-3 py-2 text-sm rounded-lg border ${inputClass}`}
                required
              />
            </div>
            <div>
              <input
                type="text"
                value={walkUpForm.sail_number}
                onChange={(e) => setWalkUpForm(prev => ({ ...prev, sail_number: e.target.value }))}
                placeholder="Sail Number"
                className={`w-full px-3 py-2 text-sm rounded-lg border ${inputClass}`}
              />
            </div>
            <div>
              <input
                type="text"
                value={walkUpForm.emergency_contact_name}
                onChange={(e) => setWalkUpForm(prev => ({ ...prev, emergency_contact_name: e.target.value }))}
                placeholder="Emergency Contact Name"
                className={`w-full px-3 py-2 text-sm rounded-lg border ${inputClass}`}
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={walkUpForm.emergency_contact_phone}
                onChange={(e) => setWalkUpForm(prev => ({ ...prev, emergency_contact_phone: e.target.value }))}
                placeholder="Emergency Phone"
                className={`flex-1 px-3 py-2 text-sm rounded-lg border ${inputClass}`}
              />
              <button
                type="button"
                onClick={() => setShowAddWalkUp(false)}
                className={`px-3 py-2 text-sm rounded-lg border ${darkMode ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-slate-300 text-slate-500 hover:bg-slate-100'}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Skipper Roster (when event has registered skippers) */}
      <div className="px-4 pb-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : eventSkippers.length > 0 ? (
          <div className="space-y-1.5">
            {getSkipperRoster().map(({ skipper, entry }, idx) => {
              const isOnWater = entry && !entry.signed_off_at;
              const isSignedOff = entry?.signed_off_at;

              return (
                <div
                  key={`${skipper.name}-${idx}`}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    isOnWater
                      ? darkMode ? 'bg-blue-900/15 border-blue-700/40' : 'bg-blue-50 border-blue-200'
                      : isSignedOff
                        ? darkMode ? 'bg-green-900/10 border-green-800/30 opacity-60' : 'bg-green-50/50 border-green-200 opacity-60'
                        : darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'
                  }`}
                >
                  {/* Status indicator */}
                  <button
                    onClick={() => {
                      if (!entry) {
                        handleQuickSignOn(skipper);
                      } else if (!entry.signed_off_at) {
                        handleSignOff(entry.id);
                      }
                    }}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                      isOnWater
                        ? 'bg-blue-600 text-white hover:bg-green-600'
                        : isSignedOff
                          ? 'bg-green-600/20 text-green-500'
                          : darkMode
                            ? 'bg-slate-700 text-slate-500 hover:bg-blue-600 hover:text-white'
                            : 'bg-slate-100 text-slate-400 hover:bg-blue-600 hover:text-white'
                    }`}
                    title={isOnWater ? 'Click to sign off' : isSignedOff ? 'Already signed off' : 'Click to sign on'}
                    disabled={!!isSignedOff}
                  >
                    {isOnWater ? (
                      <Anchor className="w-4 h-4" />
                    ) : isSignedOff ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  {/* Skipper info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {skipper.name}
                      </span>
                      {skipper.sailNo && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                          {skipper.sailNo}
                        </span>
                      )}
                      {skipper.hull && (
                        <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {skipper.hull}
                        </span>
                      )}
                    </div>
                    {entry && (
                      <div className={`flex items-center gap-3 text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          On {new Date(entry.signed_on_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {entry.signed_off_at && (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="w-3 h-3" />
                            Off {new Date(entry.signed_off_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!entry && (
                      <span className={`text-xs px-2 py-1 rounded ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        Not signed on
                      </span>
                    )}
                    {isOnWater && (
                      <button
                        onClick={() => handleSignOff(entry!.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                          darkMode ? 'bg-green-800/30 text-green-400 hover:bg-green-700/40' : 'bg-green-50 text-green-700 hover:bg-green-100'
                        }`}
                      >
                        Sign Off
                      </button>
                    )}
                    {isAdmin && entry && (
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className={`p-1.5 rounded-lg ${darkMode ? 'text-red-400 hover:bg-red-900/20' : 'text-red-500 hover:bg-red-50'}`}
                        title="Remove entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Walk-up entries section */}
            {getWalkUpEntries().length > 0 && (
              <>
                <div className={`mt-4 pt-3 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  <p className={`text-xs font-medium uppercase tracking-wide mb-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    Walk-Up Entries
                  </p>
                </div>
                {getWalkUpEntries().map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      entry.signed_off_at
                        ? darkMode ? 'bg-green-900/10 border-green-800/30 opacity-60' : 'bg-green-50/50 border-green-200 opacity-60'
                        : darkMode ? 'bg-amber-900/10 border-amber-700/30' : 'bg-amber-50 border-amber-200'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      entry.signed_off_at
                        ? 'bg-green-600/20 text-green-500'
                        : 'bg-amber-600/20 text-amber-500'
                    }`}>
                      {entry.signed_off_at ? <CheckCircle className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {entry.skipper_name}
                        </span>
                        {entry.sail_number && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                            {entry.sail_number}
                          </span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                          Walk-up
                        </span>
                      </div>
                      <div className={`flex items-center gap-3 text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          On {new Date(entry.signed_on_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {entry.signed_off_at && (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="w-3 h-3" />
                            Off {new Date(entry.signed_off_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {entry.emergency_contact_name && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {entry.emergency_contact_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!entry.signed_off_at && (
                        <button
                          onClick={() => handleSignOff(entry.id)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                            darkMode ? 'bg-green-800/30 text-green-400 hover:bg-green-700/40' : 'bg-green-50 text-green-700 hover:bg-green-100'
                          }`}
                        >
                          Sign Off
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className={`p-1.5 rounded-lg ${darkMode ? 'text-red-400 hover:bg-red-900/20' : 'text-red-500 hover:bg-red-50'}`}
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {getSkipperRoster().length === 0 && getWalkUpEntries().length === 0 && !loading && (
              <div className={`text-center py-6 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                <p className="text-sm">
                  {searchTerm ? 'No matching skippers' : viewMode === 'signed_on' ? 'No one has signed on yet' : viewMode === 'not_signed_on' ? 'Everyone is signed on' : 'No registered skippers'}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Fallback for events without registered skippers */
          <>
            {getDisplayList().length === 0 ? (
              <div className="text-center py-8">
                <Users className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {searchTerm ? 'No matching entries' : 'No one has signed on yet'}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {getDisplayList().map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      entry.signed_off_at
                        ? darkMode ? 'bg-slate-800/50 border-slate-700/50 opacity-60' : 'bg-slate-50 border-slate-200 opacity-60'
                        : darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      entry.signed_off_at ? 'bg-green-100 dark:bg-green-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
                    }`}>
                      {entry.signed_off_at ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Anchor className="w-4 h-4 text-blue-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>{entry.skipper_name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>{entry.sail_number}</span>
                      </div>
                      <div className={`flex items-center gap-3 text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
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
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!entry.signed_off_at && (
                        <button onClick={() => handleSignOff(entry.id)} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-green-800/30 text-green-400 hover:bg-green-700/40">Sign Off</button>
                      )}
                      {isAdmin && (
                        <button onClick={() => handleDelete(entry.id)} className={`p-1.5 rounded-lg ${darkMode ? 'text-red-400 hover:bg-red-900/20' : 'text-red-500 hover:bg-red-50'}`}><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

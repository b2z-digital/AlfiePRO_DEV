import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check, Calendar, Users, Settings, Shuffle, Plus, X, Search, UserPlus, CircleAlert as AlertCircle, Link2 } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import {
  createRoster, updateRoster, addRosterRounds, addRosterMembers,
  generateFairAllocation, applyAllocation, getRosterWithDetails,
  createTasksForAssignments
} from '../../utils/proRosterStorage';
import { getStoredRaceSeries } from '../../utils/raceStorage';
import type { RaceSeries } from '../../types/race';
import type { ProRoster, RosterFormData } from '../../types/proRoster';

interface RosterBuilderProps {
  clubId: string;
  clubName: string;
  members: Array<{ id: string; first_name: string; last_name: string; avatar_url?: string | null; boats?: Array<{ boat_type: string }> }>;
  existingRoster?: ProRoster | null;
  onComplete: () => void;
  onCancel: () => void;
  darkMode?: boolean;
}

export const RosterBuilder: React.FC<RosterBuilderProps> = ({
  clubId, clubName, members, existingRoster, onComplete, onCancel
}) => {
  const { addNotification } = useNotifications();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [availableSeries, setAvailableSeries] = useState<RaceSeries[]>([]);
  const [linkedSeries, setLinkedSeries] = useState<RaceSeries | null>(null);

  useEffect(() => {
    getStoredRaceSeries().then(series => {
      const incomplete = series.filter(s => !s.completed && s.rounds && s.rounds.length > 0);
      setAvailableSeries(incomplete);
    }).catch(() => {});
  }, []);

  const [formData, setFormData] = useState<RosterFormData>({
    name: existingRoster?.name || '',
    description: existingRoster?.description || '',
    boat_class: existingRoster?.boat_class || '',
    series_id: existingRoster?.series_id || null,
    start_date: existingRoster?.start_date || new Date().toISOString().split('T')[0],
    end_date: existingRoster?.end_date || '',
    allocation_method: existingRoster?.allocation_method || 'fair_random',
    reminder_days_before: existingRoster?.reminder_days_before || 7,
    reminder_type: existingRoster?.reminder_type || 'both',
    allow_decline: existingRoster?.allow_decline ?? true,
    max_consecutive: existingRoster?.max_consecutive || 1,
  });

  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');

  const boatClasses = useMemo(() => {
    const classes = new Set<string>();
    members.forEach(m => {
      m.boats?.forEach(b => classes.add(b.boat_type));
    });
    return Array.from(classes).sort();
  }, [members]);

  const eligibleMembers = useMemo(() => {
    if (!formData.boat_class) return members;
    return members.filter(m =>
      m.boats?.some(b => b.boat_type === formData.boat_class)
    );
  }, [members, formData.boat_class]);

  const filteredMembers = useMemo(() => {
    if (!memberSearch) return eligibleMembers;
    const search = memberSearch.toLowerCase();
    return eligibleMembers.filter(m =>
      `${m.first_name} ${m.last_name}`.toLowerCase().includes(search)
    );
  }, [eligibleMembers, memberSearch]);

  const steps = [
    { title: 'Details', icon: Settings },
    { title: 'Sailing Days', icon: Calendar },
    { title: 'Members', icon: Users },
    { title: 'Review', icon: Check },
  ];

  const addDate = () => {
    if (newDate && !selectedDates.includes(newDate)) {
      setSelectedDates(prev => [...prev, newDate].sort());
      setNewDate('');
    }
  };

  const removeDate = (date: string) => {
    setSelectedDates(prev => prev.filter(d => d !== date));
  };

  const generateWeeklyDates = (dayOfWeek: number) => {
    if (!formData.start_date || !formData.end_date) return;
    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    const dates: string[] = [];
    const current = new Date(start);

    while (current.getDay() !== dayOfWeek) {
      current.setDate(current.getDate() + 1);
    }

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 7);
    }

    setSelectedDates(prev => [...new Set([...prev, ...dates])].sort());
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const selectAllEligible = () => {
    setSelectedMembers(eligibleMembers.map(m => m.id));
  };

  const handleSelectSeries = (seriesId: string) => {
    if (!seriesId) {
      setLinkedSeries(null);
      setFormData(prev => ({ ...prev, series_id: null, name: '', boat_class: '', start_date: new Date().toISOString().split('T')[0], end_date: '' }));
      setSelectedDates([]);
      return;
    }
    const series = availableSeries.find(s => s.id === seriesId);
    if (!series) return;
    setLinkedSeries(series);

    const roundDates = series.rounds
      .filter(r => r.date && !r.cancelled)
      .map(r => r.date)
      .sort();

    const startDate = roundDates[0] || new Date().toISOString().split('T')[0];
    const endDate = roundDates[roundDates.length - 1] || '';

    setFormData(prev => ({
      ...prev,
      series_id: series.id,
      name: `${series.seriesName} PRO Roster`,
      boat_class: series.raceClass || prev.boat_class,
      start_date: startDate,
      end_date: endDate,
    }));

    setSelectedDates(roundDates);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      let roster: ProRoster;
      if (existingRoster) {
        roster = await updateRoster(existingRoster.id, formData);
      } else {
        roster = await createRoster(clubId, formData, 'current_user');
      }

      if (!existingRoster && selectedDates.length > 0) {
        await addRosterRounds(roster.id, selectedDates);
      }

      if (!existingRoster && selectedMembers.length > 0) {
        await addRosterMembers(roster.id, selectedMembers);
      }

      if (!existingRoster && formData.allocation_method !== 'manual' && selectedDates.length > 0 && selectedMembers.length > 0) {
        const details = await getRosterWithDetails(roster.id);
        const allocations = generateFairAllocation(
          details.rounds,
          details.members,
          details.exclusions,
          formData.max_consecutive
        );
        await applyAllocation(roster.id, allocations);

        const updatedDetails = await getRosterWithDetails(roster.id);
        await createTasksForAssignments(roster, updatedDetails.rounds, updatedDetails.assignments, clubId, 'current_user');
      }

      addNotification('success', existingRoster ? 'Roster updated!' : 'Roster created with PRO assignments!');
      onComplete();
    } catch (err) {
      console.error('Error saving roster:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to save roster');
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 0: return formData.name && formData.boat_class && formData.start_date && formData.end_date;
      case 1: return selectedDates.length > 0;
      case 2: return selectedMembers.length >= 2;
      case 3: return true;
      default: return false;
    }
  };

  return (
    <div className="h-full overflow-y-auto"><div className="p-4 sm:p-6 lg:p-16 space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onCancel} className="p-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-all">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-white">
            {existingRoster ? 'Edit Roster' : 'Create PRO Roster'}
          </h2>
          <p className="text-sm text-slate-400">
            {existingRoster ? 'Update roster settings' : 'Set up a new race officer duty roster'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
        {steps.map((s, idx) => (
          <React.Fragment key={idx}>
            <button
              onClick={() => idx <= step && setStep(idx)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                idx === step
                  ? 'bg-cyan-600 text-white'
                  : idx < step
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-slate-500'
              }`}
            >
              {idx < step ? <Check size={14} /> : <s.icon size={14} />}
              <span className="hidden sm:inline">{s.title}</span>
            </button>
            {idx < steps.length - 1 && <div className="flex-1 h-px bg-slate-700" />}
          </React.Fragment>
        ))}
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        {step === 0 && (
          <div className="space-y-5">
            <h3 className="text-lg font-semibold text-white mb-4">Roster Details</h3>

            {availableSeries.length > 0 && !existingRoster && (
              <div className="p-4 bg-slate-900/50 border border-cyan-500/20 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-cyan-400 text-sm font-medium">
                  <Link2 size={14} />
                  Link to Existing Series
                </div>
                <select
                  value={linkedSeries?.id || ''}
                  onChange={e => handleSelectSeries(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-800/80 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Create standalone roster (manual setup)</option>
                  {availableSeries.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.seriesName} ({s.raceClass || 'All classes'}) - {s.rounds.filter(r => !r.cancelled).length} rounds
                    </option>
                  ))}
                </select>
                {linkedSeries && (
                  <p className="text-xs text-slate-400">
                    Details and sailing days will be auto-populated from the series. You can still adjust settings below.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Roster Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., 2026 Winter DF95 PRO Roster"
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Description (optional)</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this roster..."
                rows={2}
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Boat Class</label>
              <select
                value={formData.boat_class}
                onChange={e => setFormData(prev => ({ ...prev, boat_class: e.target.value }))}
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">Select a class...</option>
                {boatClasses.map(bc => (
                  <option key={bc} value={bc}>{bc}</option>
                ))}
              </select>
              {formData.boat_class && (
                <p className="text-xs text-slate-500 mt-1">
                  {eligibleMembers.length} members sail this class
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={e => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">End Date</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={e => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Allocation Method</label>
                <select
                  value={formData.allocation_method}
                  onChange={e => setFormData(prev => ({ ...prev, allocation_method: e.target.value as any }))}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="fair_random">Fair Random (recommended)</option>
                  <option value="round_robin">Round Robin</option>
                  <option value="manual">Manual Only</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Max Consecutive Duties</label>
                <select
                  value={formData.max_consecutive}
                  onChange={e => setFormData(prev => ({ ...prev, max_consecutive: parseInt(e.target.value) }))}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="1">No back-to-back (1 gap)</option>
                  <option value="2">Allow 2 consecutive</option>
                  <option value="0">No limit</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Reminder (days before)</label>
                <select
                  value={formData.reminder_days_before}
                  onChange={e => setFormData(prev => ({ ...prev, reminder_days_before: parseInt(e.target.value) }))}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="3">3 days</option>
                  <option value="5">5 days</option>
                  <option value="7">7 days (default)</option>
                  <option value="14">14 days</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Reminder Type</label>
                <select
                  value={formData.reminder_type}
                  onChange={e => setFormData(prev => ({ ...prev, reminder_type: e.target.value as any }))}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="both">Email + Notification</option>
                  <option value="email">Email only</option>
                  <option value="notification">Notification only</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h3 className="text-lg font-semibold text-white mb-2">Sailing Days</h3>
            <p className="text-sm text-slate-400 mb-4">
              {linkedSeries
                ? `Dates have been pre-filled from "${linkedSeries.seriesName}". You can add or remove dates as needed.`
                : 'Add the dates that need a PRO assigned. Use quick-fill to add weekly recurring dates.'}
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs text-slate-500 self-center mr-1">Quick fill:</span>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                <button
                  key={day}
                  onClick={() => generateWeeklyDates(idx)}
                  className="px-3 py-1 text-xs bg-slate-700 text-slate-300 rounded-lg hover:bg-cyan-600 hover:text-white transition-all"
                >
                  Every {day}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                min={formData.start_date}
                max={formData.end_date}
                className="flex-1 px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={addDate}
                disabled={!newDate}
                className="px-4 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 disabled:opacity-50 transition-all"
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1">
              {selectedDates.map(date => (
                <div key={date} className="flex items-center justify-between px-3 py-2 bg-slate-900/30 rounded-lg">
                  <span className="text-sm text-white">
                    {new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <button onClick={() => removeDate(date)} className="text-slate-500 hover:text-red-400 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            {selectedDates.length > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{selectedDates.length} sailing days added</span>
                <button onClick={() => setSelectedDates([])} className="text-red-400 hover:text-red-300 text-xs">
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Select Members</h3>
                <p className="text-sm text-slate-400">Choose which members are eligible for PRO duty</p>
              </div>
              <button
                onClick={selectAllEligible}
                className="px-3 py-1.5 text-xs bg-cyan-600/20 text-cyan-400 rounded-lg hover:bg-cyan-600/30 transition-all"
              >
                <UserPlus size={12} className="inline mr-1" />
                Select All ({eligibleMembers.length})
              </button>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search members..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1">
              {filteredMembers.map(member => {
                const isSelected = selectedMembers.includes(member.id);
                return (
                  <button
                    key={member.id}
                    onClick={() => toggleMember(member.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                      isSelected ? 'bg-cyan-600/20 border border-cyan-500/30' : 'bg-slate-900/30 border border-transparent hover:bg-slate-700/50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                      isSelected ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        `${member.first_name[0]}${member.last_name[0]}`
                      )}
                    </div>
                    <span className={`text-sm ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                      {member.first_name} {member.last_name}
                    </span>
                    {isSelected && <Check size={14} className="ml-auto text-cyan-400" />}
                  </button>
                );
              })}
            </div>

            <p className="text-sm text-slate-400">
              {selectedMembers.length} members selected
              {selectedMembers.length > 0 && selectedDates.length > 0 && (
                <span className="text-slate-500">
                  {' '}(~{Math.ceil(selectedDates.length / selectedMembers.length)} duties each)
                </span>
              )}
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h3 className="text-lg font-semibold text-white mb-4">Review & Create</h3>

            {linkedSeries && (
              <div className="flex items-center gap-2 px-4 py-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg mb-2">
                <Link2 size={14} className="text-cyan-400" />
                <span className="text-sm text-cyan-300">Linked to series: <span className="font-medium">{linkedSeries.seriesName}</span></span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/30 rounded-lg p-4">
                <div className="text-xs text-slate-500 mb-1">Roster Name</div>
                <div className="text-sm text-white font-medium">{formData.name}</div>
              </div>
              <div className="bg-slate-900/30 rounded-lg p-4">
                <div className="text-xs text-slate-500 mb-1">Boat Class</div>
                <div className="text-sm text-white font-medium">{formData.boat_class}</div>
              </div>
              <div className="bg-slate-900/30 rounded-lg p-4">
                <div className="text-xs text-slate-500 mb-1">Period</div>
                <div className="text-sm text-white font-medium">
                  {new Date(formData.start_date).toLocaleDateString()} - {new Date(formData.end_date).toLocaleDateString()}
                </div>
              </div>
              <div className="bg-slate-900/30 rounded-lg p-4">
                <div className="text-xs text-slate-500 mb-1">Allocation</div>
                <div className="text-sm text-white font-medium capitalize">{formData.allocation_method.replace('_', ' ')}</div>
              </div>
              <div className="bg-slate-900/30 rounded-lg p-4">
                <div className="text-xs text-slate-500 mb-1">Sailing Days</div>
                <div className="text-sm text-white font-medium">{selectedDates.length} days</div>
              </div>
              <div className="bg-slate-900/30 rounded-lg p-4">
                <div className="text-xs text-slate-500 mb-1">Eligible Members</div>
                <div className="text-sm text-white font-medium">{selectedMembers.length} members</div>
              </div>
              <div className="bg-slate-900/30 rounded-lg p-4">
                <div className="text-xs text-slate-500 mb-1">Approx. Duties Each</div>
                <div className="text-sm text-white font-medium">
                  ~{selectedMembers.length > 0 ? Math.ceil(selectedDates.length / selectedMembers.length) : 0} times
                </div>
              </div>
              <div className="bg-slate-900/30 rounded-lg p-4">
                <div className="text-xs text-slate-500 mb-1">Reminder</div>
                <div className="text-sm text-white font-medium">{formData.reminder_days_before} days before</div>
              </div>
            </div>

            {formData.allocation_method !== 'manual' && (
              <div className="flex items-start gap-3 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                <Shuffle size={18} className="text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-cyan-300 font-medium">Auto-Allocation Active</p>
                  <p className="text-xs text-cyan-400/70 mt-0.5">
                    PROs will be fairly distributed across all sailing days. Each member will do approximately equal duties
                    with no back-to-back assignments. Tasks with reminders will be created automatically.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => step > 0 ? setStep(step - 1) : onCancel()}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-all"
        >
          <ArrowLeft size={16} />
          {step === 0 ? 'Cancel' : 'Back'}
        </button>

        {step < steps.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg font-medium hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Next
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-lg font-medium hover:from-emerald-500 hover:to-green-500 disabled:opacity-50 transition-all"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check size={16} />
                {existingRoster ? 'Save Changes' : 'Create Roster'}
              </>
            )}
          </button>
        )}
      </div>
    </div></div>
  );
};

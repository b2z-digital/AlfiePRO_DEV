import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Copy, SquarePen as Edit2, Check, X, ChevronDown, ChevronUp, Play, Square, Clock, Volume2, Shield, ListMusic, Timer, Upload, Music, Loader as Loader2, Crosshair, RotateCcw, Pause, Scissors, SkipForward } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ConfirmationModal } from '../ConfirmationModal';
import type { StartSequence, StartSequenceSound, StartBoxSound, SequenceType } from '../../types/startBox';
import {
  getSequences, getSounds, createSequence, updateSequence, deleteSequence,
  addSequenceSound, updateSequenceSound, removeSequenceSound, duplicateSequence,
  uploadSequenceAudio, removeSequenceAudio,
  uploadBackgroundMusic, removeBackgroundMusic,
  uploadCustomEventSound, removeCustomEventSound,
} from '../../utils/startBoxStorage';
import { getStartBoxEngine } from '../../utils/startBoxAudio';

interface StartBoxSequenceEditorProps {
  darkMode: boolean;
  clubId: string | null;
  soundsVersion?: number;
}

const SEQUENCE_TYPES: { value: SequenceType; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'handicap', label: 'Handicap' },
  { value: 'botw', label: 'BOTW' },
  { value: 'special', label: 'Special' },
];

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const StartBoxSequenceEditor: React.FC<StartBoxSequenceEditorProps> = ({
  darkMode,
  clubId,
  soundsVersion,
}) => {
  const { user, isSuperAdmin } = useAuth();
  const [sequences, setSequences] = useState<StartSequence[]>([]);
  const [sounds, setSounds] = useState<StartBoxSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState<SequenceType>('standard');
  const [formDuration, setFormDuration] = useState(120);
  const [formRaceDefault, setFormRaceDefault] = useState<string>('');

  const [deleteTarget, setDeleteTarget] = useState<StartSequence | null>(null);

  const [addingSoundToSeq, setAddingSoundToSeq] = useState<string | null>(null);
  const [newSoundId, setNewSoundId] = useState('');
  const [newTriggerTime, setNewTriggerTime] = useState(0);
  const [newLabel, setNewLabel] = useState('');
  const [uploadingAudioFor, setUploadingAudioFor] = useState<string | null>(null);
  const [uploadingBgMusicFor, setUploadingBgMusicFor] = useState<string | null>(null);
  const [uploadingEventSoundFor, setUploadingEventSoundFor] = useState<string | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { loadData(); }, [clubId, soundsVersion]);

  const handleAudioUpload = async (seqId: string, file: File) => {
    setUploadingAudioFor(seqId);
    await uploadSequenceAudio(seqId, clubId, file);
    setUploadingAudioFor(null);
    await loadData();
  };

  const handleRemoveAudio = async (seqId: string) => {
    stopAudioPreview();
    await removeSequenceAudio(seqId);
    await loadData();
  };

  const handleBgMusicUpload = async (seqId: string, file: File) => {
    setUploadingBgMusicFor(seqId);
    await uploadBackgroundMusic(seqId, clubId, file);
    setUploadingBgMusicFor(null);
    await loadData();
  };

  const handleRemoveBgMusic = async (seqId: string) => {
    stopAudioPreview();
    await removeBackgroundMusic(seqId);
    await loadData();
  };

  const handleEventSoundUpload = async (ssId: string, file: File) => {
    setUploadingEventSoundFor(ssId);
    await uploadCustomEventSound(ssId, clubId, file);
    setUploadingEventSoundFor(null);
    await loadData();
  };

  const handleRemoveEventSound = async (ssId: string) => {
    await removeCustomEventSound(ssId);
    await loadData();
  };

  const toggleAudioPreview = (url: string) => {
    if (audioPreviewUrl === url && audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current.currentTime = 0;
      setAudioPreviewUrl(null);
      return;
    }
    stopAudioPreview();
    const audio = new Audio(url);
    audio.volume = 0.8;
    audio.onended = () => setAudioPreviewUrl(null);
    audio.play();
    audioPreviewRef.current = audio;
    setAudioPreviewUrl(url);
  };

  const stopAudioPreview = () => {
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current.currentTime = 0;
      audioPreviewRef.current = null;
    }
    setAudioPreviewUrl(null);
  };

  const loadData = async () => {
    setLoading(true);
    const [seqs, snds] = await Promise.all([getSequences(clubId), getSounds(clubId)]);
    setSequences(seqs);
    setSounds(snds);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!formName.trim()) return;
    const result = await createSequence({
      club_id: isSuperAdmin ? null : clubId,
      name: formName.trim(),
      description: formDesc.trim() || undefined,
      sequence_type: formType,
      total_duration_seconds: formDuration,
      is_system_default: isSuperAdmin ? true : false,
      is_active: true,
      race_type_default: (formRaceDefault as 'scratch' | 'handicap') || null,
      sort_order: sequences.length + 1,
      created_by: user?.id,
    });
    if (result) {
      setShowCreateForm(false);
      resetForm();
      await loadData();
    }
  };

  const handleUpdate = async (seqId: string) => {
    await updateSequence(seqId, {
      name: formName.trim(),
      description: formDesc.trim() || undefined,
      sequence_type: formType,
      total_duration_seconds: formDuration,
      race_type_default: (formRaceDefault as 'scratch' | 'handicap') || null,
    });
    setEditingId(null);
    resetForm();
    await loadData();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteSequence(deleteTarget.id, isSuperAdmin && deleteTarget.is_system_default);
    if (expandedId === deleteTarget.id) setExpandedId(null);
    setDeleteTarget(null);
    await loadData();
  };

  const handleDuplicate = async (seq: StartSequence) => {
    if (!clubId) return;
    await duplicateSequence(seq.id, clubId, `${seq.name} (Copy)`, user?.id);
    await loadData();
  };

  const handleAddSound = async (seqId: string) => {
    if (!newSoundId && !newLabel.trim()) return;
    await addSequenceSound({
      sequence_id: seqId,
      sound_id: newSoundId || null,
      trigger_time_seconds: newTriggerTime,
      label: newLabel.trim() || undefined,
      repeat_count: 1,
      sort_order: 0,
    });
    setAddingSoundToSeq(null);
    setNewSoundId('');
    setNewTriggerTime(0);
    setNewLabel('');
    await loadData();
  };

  const handleRemoveSound = async (ssId: string) => {
    await removeSequenceSound(ssId);
    await loadData();
  };

  const startEdit = (seq: StartSequence) => {
    setEditingId(seq.id);
    setFormName(seq.name);
    setFormDesc(seq.description || '');
    setFormType(seq.sequence_type);
    setFormDuration(seq.total_duration_seconds);
    setFormRaceDefault(seq.race_type_default || '');
  };

  const resetForm = () => {
    setFormName('');
    setFormDesc('');
    setFormType('standard');
    setFormDuration(120);
    setFormRaceDefault('');
  };

  const previewSequence = async (seq: StartSequence) => {
    const engine = getStartBoxEngine();
    await engine.initialize();
    await engine.preloadSequence(seq);
    engine.arm(seq);
    engine.start();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListMusic size={18} className="text-green-400" />
          <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Start Sequences
          </h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
            {sequences.length} sequences
          </span>
        </div>
        <button
          onClick={() => { setShowCreateForm(!showCreateForm); resetForm(); }}
          className="btn-primary-green flex items-center gap-1.5 px-3 py-1.5 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={14} />
          New Sequence
        </button>
      </div>

      {showCreateForm && (
        <div className={`p-4 rounded-lg border ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
          <SequenceForm
            darkMode={darkMode}
            name={formName} setName={setFormName}
            desc={formDesc} setDesc={setFormDesc}
            type={formType} setType={setFormType}
            duration={formDuration} setDuration={setFormDuration}
            raceDefault={formRaceDefault} setRaceDefault={setFormRaceDefault}
          />
          <div className="flex gap-2 mt-3">
            <button onClick={handleCreate} disabled={!formName.trim()} className="btn-primary-green px-4 py-2 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
              Create
            </button>
            <button onClick={() => { setShowCreateForm(false); resetForm(); }} className={`px-4 py-2 text-sm rounded-lg ${darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700'}`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sequences.map(seq => (
          <div
            key={seq.id}
            className={`rounded-lg border transition-colors ${
              darkMode ? 'border-slate-700/50 hover:border-slate-600' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div
              className={`flex items-center gap-3 p-3 cursor-pointer ${
                darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'
              }`}
              onClick={() => setExpandedId(expandedId === seq.id ? null : seq.id)}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                seq.sequence_type === 'standard' ? 'bg-blue-500/20 text-blue-400' :
                seq.sequence_type === 'handicap' ? 'bg-amber-500/20 text-amber-400' :
                seq.sequence_type === 'botw' ? 'bg-green-500/20 text-green-400' :
                'bg-slate-500/20 text-slate-400'
              }`}>
                <Timer size={16} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {seq.name}
                  </span>
                  {seq.is_system_default && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                      <Shield size={8} /> System
                    </span>
                  )}
                  {seq.race_type_default && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      seq.race_type_default === 'scratch' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      Default: {seq.race_type_default}
                    </span>
                  )}
                </div>
                <div className={`flex items-center gap-3 text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  <span className="capitalize">{seq.sequence_type}</span>
                  <span>{formatTime(seq.total_duration_seconds)}</span>
                  {seq.use_audio_only ? (
                    <span className="flex items-center gap-1">
                      <Music size={10} />
                      Audio file
                    </span>
                  ) : (
                    <span>{seq.sounds?.length || 0} sounds</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {(!seq.is_system_default || isSuperAdmin) && (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); startEdit(seq); setExpandedId(seq.id); }}
                      className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(seq); }}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
                <button
                  onClick={e => { e.stopPropagation(); handleDuplicate(seq); }}
                  className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                  title="Duplicate to my club"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); previewSequence(seq); }}
                  className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/20 transition-colors"
                  title="Preview"
                >
                  <Play size={14} />
                </button>
                {expandedId === seq.id ? <ChevronUp size={16} className={darkMode ? 'text-slate-500' : 'text-slate-400'} /> : <ChevronDown size={16} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />}
              </div>
            </div>

            {expandedId === seq.id && (
              <div className={`px-3 pb-3 border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
                {editingId === seq.id && (!seq.is_system_default || isSuperAdmin) && (
                  <div className={`p-3 mt-3 rounded-lg ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                    <SequenceForm
                      darkMode={darkMode}
                      name={formName} setName={setFormName}
                      desc={formDesc} setDesc={setFormDesc}
                      type={formType} setType={setFormType}
                      duration={formDuration} setDuration={setFormDuration}
                      raceDefault={formRaceDefault} setRaceDefault={setFormRaceDefault}
                    />
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => handleUpdate(seq.id)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">
                        <Check size={14} /> Save
                      </button>
                      <button onClick={() => { setEditingId(null); resetForm(); }} className={`px-3 py-1.5 text-sm rounded-lg ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {seq.is_system_default && !isSuperAdmin && (
                  <div className={`mt-3 flex items-center gap-3 p-3 rounded-lg border ${darkMode ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                    <Shield size={14} className="text-amber-400 flex-shrink-0" />
                    <span className={`text-xs ${darkMode ? 'text-amber-400/80' : 'text-amber-600'}`}>
                      System sequences are read-only. Click the <strong>Duplicate</strong> button to create your own copy with Audio Only Mode and custom audio file support.
                    </span>
                  </div>
                )}

                {(!seq.is_system_default || isSuperAdmin) && (
                  <div className={`mt-3 flex items-center gap-3 p-3 rounded-lg ${darkMode ? 'bg-slate-800/30' : 'bg-slate-50'}`}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={seq.use_audio_only || false}
                          onChange={async () => {
                            await updateSequence(seq.id, { use_audio_only: !seq.use_audio_only });
                            await loadData();
                          }}
                          className="sr-only peer"
                        />
                        <div className={`w-9 h-5 rounded-full transition-colors peer-checked:bg-green-600 ${darkMode ? 'bg-slate-600' : 'bg-slate-300'}`} />
                        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                      </div>
                      <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        Audio Only Mode
                      </span>
                    </label>
                    <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      Play a single MP3 file with a visual LED countdown - no individual sound events
                    </span>
                  </div>
                )}

                {seq.sequence_type === 'botw' && (!seq.is_system_default || isSuperAdmin) && (
                  <div className={`mt-3 flex items-center gap-3 p-3 rounded-lg border ${darkMode ? 'bg-slate-800/30 border-green-500/20' : 'bg-green-50/50 border-green-200'}`}>
                    <SkipForward size={16} className="text-green-400 flex-shrink-0" />
                    <div className="flex items-center gap-2 flex-1">
                      <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        Follow-on Sequence
                      </span>
                      <select
                        value={seq.follow_on_sequence_id || ''}
                        onChange={async (e) => {
                          const val = e.target.value || null;
                          await updateSequence(seq.id, { follow_on_sequence_id: val });
                          await loadData();
                        }}
                        className={`flex-1 max-w-xs px-2 py-1.5 rounded text-xs border ${
                          darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        <option value="">None (manual)</option>
                        {sequences.filter(s => s.sequence_type !== 'botw' && s.id !== seq.id).map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({formatTime(s.total_duration_seconds)})</option>
                        ))}
                      </select>
                    </div>
                    <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      Auto-starts after BOTW completes
                    </span>
                  </div>
                )}

                {(!seq.use_audio_only) && (!seq.is_system_default || isSuperAdmin) && (
                  <div className={`mt-3 flex flex-col gap-3 p-3 rounded-lg ${darkMode ? 'bg-slate-800/30' : 'bg-slate-50'}`}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={seq.enable_countdown_beep || false}
                          onChange={async () => {
                            await updateSequence(seq.id, { enable_countdown_beep: !seq.enable_countdown_beep });
                            await loadData();
                          }}
                          className="sr-only peer"
                        />
                        <div className={`w-9 h-5 rounded-full transition-colors peer-checked:bg-green-600 ${darkMode ? 'bg-slate-600' : 'bg-slate-300'}`} />
                        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                      </div>
                      <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        Countdown Beep
                      </span>
                      <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        Play a beep every second during the LED countdown
                      </span>
                    </label>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <ListMusic size={16} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                        <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          Minute Callout Sound
                        </span>
                      </div>
                      <select
                        value={seq.minute_callout_sound_id || ''}
                        onChange={async (e) => {
                          const val = e.target.value || null;
                          await updateSequence(seq.id, { minute_callout_sound_id: val });
                          await loadData();
                        }}
                        className={`flex-1 max-w-xs px-2 py-1.5 rounded text-xs border ${
                          darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        <option value="">None</option>
                        {sounds.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        Plays at each minute mark
                      </span>
                    </div>
                  </div>
                )}

                {/* Background Music Section */}
                {!seq.use_audio_only && (!seq.is_system_default || isSuperAdmin) && (
                  <div className={`mt-3 p-4 rounded-lg border ${
                    seq.use_background_music
                      ? darkMode ? 'bg-slate-800/50 border-cyan-500/20' : 'bg-cyan-50/50 border-cyan-200'
                      : darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Music size={16} className={seq.use_background_music ? 'text-cyan-400' : darkMode ? 'text-slate-500' : 'text-slate-400'} />
                        <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          Background Music
                        </h4>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={seq.use_background_music || false}
                            onChange={async () => {
                              await updateSequence(seq.id, { use_background_music: !seq.use_background_music });
                              await loadData();
                            }}
                            className="sr-only peer"
                          />
                          <div className={`w-9 h-5 rounded-full transition-colors peer-checked:bg-cyan-600 ${darkMode ? 'bg-slate-600' : 'bg-slate-300'}`} />
                          <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                        </div>
                      </label>
                    </div>

                    {seq.use_background_music && (
                      <div className="space-y-3">
                        <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          Plays a music track during the countdown. Volume automatically ducks when sound events fire.
                        </p>

                        {seq.background_music_url ? (
                          <div className="space-y-3">
                            <div className={`flex items-center gap-3 p-3 rounded-lg ${darkMode ? 'bg-slate-900/50' : 'bg-white'}`}>
                              <Music size={14} className="text-cyan-400" />
                              <span className={`text-sm font-medium truncate flex-1 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                {seq.background_music_path?.split('/').pop() || 'Background music'}
                              </span>
                              <button
                                onClick={() => toggleAudioPreview(seq.background_music_url!)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  audioPreviewUrl === seq.background_music_url
                                    ? 'bg-cyan-500/20 text-cyan-400'
                                    : darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
                                }`}
                              >
                                {audioPreviewUrl === seq.background_music_url ? <Square size={12} /> : <Play size={12} />}
                              </button>
                              <label className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                                darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}>
                                <Upload size={12} />
                                Replace
                                <input
                                  type="file"
                                  accept="audio/*"
                                  className="hidden"
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleBgMusicUpload(seq.id, file);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              <button
                                onClick={() => handleRemoveBgMusic(seq.id)}
                                className="p-2 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div>
                                <label className={`block text-[10px] font-medium mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  Volume
                                </label>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={Math.round((seq.background_music_volume ?? 0.6) * 100)}
                                  onChange={async (e) => {
                                    await updateSequence(seq.id, { background_music_volume: parseInt(e.target.value) / 100 });
                                    await loadData();
                                  }}
                                  className="w-full accent-cyan-500"
                                />
                                <span className={`text-[10px] ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                                  {Math.round((seq.background_music_volume ?? 0.6) * 100)}%
                                </span>
                              </div>
                              <div>
                                <label className={`block text-[10px] font-medium mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  Duck Volume
                                </label>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={Math.round((seq.background_music_duck_volume ?? 0.15) * 100)}
                                  onChange={async (e) => {
                                    await updateSequence(seq.id, { background_music_duck_volume: parseInt(e.target.value) / 100 });
                                    await loadData();
                                  }}
                                  className="w-full accent-cyan-500"
                                />
                                <span className={`text-[10px] ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                                  {Math.round((seq.background_music_duck_volume ?? 0.15) * 100)}%
                                </span>
                              </div>
                              <div>
                                <label className={`block text-[10px] font-medium mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  Duck Duration
                                </label>
                                <input
                                  type="number"
                                  min={500}
                                  max={10000}
                                  step={500}
                                  value={seq.background_music_duck_duration_ms ?? 3000}
                                  onChange={async (e) => {
                                    await updateSequence(seq.id, { background_music_duck_duration_ms: parseInt(e.target.value) || 3000 });
                                    await loadData();
                                  }}
                                  className={`w-full px-2 py-1.5 rounded text-xs border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                                />
                                <span className={`text-[10px] ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>ms</span>
                              </div>
                              <div>
                                <label className={`block text-[10px] font-medium mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  Fade In / Out
                                </label>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={10000}
                                    step={500}
                                    value={seq.background_music_fade_in_ms ?? 2000}
                                    onChange={async (e) => {
                                      await updateSequence(seq.id, { background_music_fade_in_ms: parseInt(e.target.value) || 0 });
                                      await loadData();
                                    }}
                                    className={`w-full px-2 py-1.5 rounded text-xs border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                                  />
                                  <span className={`text-[10px] ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>/</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={10000}
                                    step={500}
                                    value={seq.background_music_fade_out_ms ?? 3000}
                                    onChange={async (e) => {
                                      await updateSequence(seq.id, { background_music_fade_out_ms: parseInt(e.target.value) || 0 });
                                      await loadData();
                                    }}
                                    className={`w-full px-2 py-1.5 rounded text-xs border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                                  />
                                </div>
                                <span className={`text-[10px] ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>ms</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            {uploadingBgMusicFor === seq.id ? (
                              <div className="flex items-center gap-2 py-3">
                                <Loader2 size={16} className="animate-spin text-cyan-400" />
                                <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Uploading background music...</span>
                              </div>
                            ) : (
                              <label className={`flex flex-col items-center gap-2 px-6 py-5 rounded-lg border-2 border-dashed cursor-pointer transition-all ${
                                darkMode
                                  ? 'border-slate-700 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-400'
                                  : 'border-slate-300 hover:border-cyan-400 text-slate-500 hover:text-cyan-600'
                              }`}>
                                <Music size={20} />
                                <span className="text-sm font-medium">Upload Background Music</span>
                                <span className={`text-xs ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                                  Music will play during the countdown and duck when announcements fire
                                </span>
                                <input
                                  type="file"
                                  accept="audio/*"
                                  className="hidden"
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleBgMusicUpload(seq.id, file);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(seq.use_audio_only || !seq.is_system_default || isSuperAdmin) && (
                  <div className={`mt-3 p-4 rounded-lg border ${
                    seq.use_audio_only
                      ? darkMode ? 'bg-slate-800/50 border-green-500/20' : 'bg-green-50/50 border-green-200'
                      : darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Music size={16} className={seq.use_audio_only ? 'text-green-400' : darkMode ? 'text-slate-500' : 'text-slate-400'} />
                      <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {seq.use_audio_only ? 'Countdown Audio File' : 'Optional Audio File'}
                      </h4>
                      {seq.use_audio_only && !seq.audio_file_url && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                          Required
                        </span>
                      )}
                    </div>

                    {seq.audio_file_url ? (
                      <div className="space-y-3">
                        <div className={`flex items-center gap-3 p-3 rounded-lg ${darkMode ? 'bg-slate-900/50' : 'bg-white'}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Music size={14} className={darkMode ? 'text-blue-400' : 'text-blue-500'} />
                              <span className={`text-sm font-medium truncate ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                {seq.audio_file_path?.split('/').pop() || 'Countdown audio'}
                              </span>
                            </div>
                          </div>
                          {(!seq.is_system_default || isSuperAdmin) && (
                            <div className="flex items-center gap-1.5">
                              <label className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                                darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}>
                                <Upload size={12} />
                                Replace
                                <input
                                  type="file"
                                  accept="audio/*"
                                  className="hidden"
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleAudioUpload(seq.id, file);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              <button
                                onClick={() => handleRemoveAudio(seq.id)}
                                className="p-2 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                                title="Remove audio"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>

                        {seq.use_audio_only && (!seq.is_system_default || isSuperAdmin) && (
                          <AudioSyncTool
                            darkMode={darkMode}
                            sequence={seq}
                            onSave={async (offsetMs, countdownSeconds, audioStartMs, audioEndMs) => {
                              await updateSequence(seq.id, {
                                audio_offset_ms: offsetMs,
                                countdown_start_seconds: countdownSeconds,
                                audio_start_ms: audioStartMs,
                                audio_end_ms: audioEndMs,
                              });
                              await loadData();
                            }}
                          />
                        )}

                        {!seq.use_audio_only && (
                          <div className="mt-1">
                            <label className={`block text-[10px] font-medium mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              Audio Offset (ms)
                            </label>
                            <input
                              type="number"
                              value={seq.audio_offset_ms || 0}
                              onChange={async (e) => {
                                const val = parseInt(e.target.value) || 0;
                                await updateSequence(seq.id, { audio_offset_ms: val });
                                await loadData();
                              }}
                              className={`w-32 px-2 py-1.5 rounded text-xs border ${
                                darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                              }`}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {uploadingAudioFor === seq.id ? (
                          <div className="flex items-center gap-2 py-3">
                            <Loader2 size={16} className="animate-spin text-blue-400" />
                            <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Uploading audio file...</span>
                          </div>
                        ) : (!seq.is_system_default || isSuperAdmin) ? (
                          <label className={`flex flex-col items-center gap-2 px-6 py-6 rounded-lg border-2 border-dashed cursor-pointer transition-all ${
                            darkMode
                              ? 'border-slate-700 hover:border-green-500/50 text-slate-400 hover:text-green-400'
                              : 'border-slate-300 hover:border-green-400 text-slate-500 hover:text-green-600'
                          }`}>
                            <Upload size={24} />
                            <span className="text-sm font-medium">Upload MP3 Audio File</span>
                            <span className={`text-xs ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                              Upload your pre-recorded countdown audio (horns, beeps, announcements, etc.)
                            </span>
                            <input
                              type="file"
                              ref={audioFileInputRef}
                              accept="audio/*"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleAudioUpload(seq.id, file);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        ) : (
                          <p className={`text-xs py-2 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                            No countdown audio attached
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!seq.use_audio_only && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        Sound Event Timeline
                      </h4>
                      {(!seq.is_system_default || isSuperAdmin) && (
                        <button
                          onClick={() => { setAddingSoundToSeq(seq.id); setNewTriggerTime(seq.total_duration_seconds); }}
                          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                        >
                          <Plus size={12} /> Add Sound Event
                        </button>
                      )}
                    </div>

                    {addingSoundToSeq === seq.id && (
                      <div className={`p-3 mb-2 rounded-lg border ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className={`block text-[10px] font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Sound</label>
                            <select
                              value={newSoundId}
                              onChange={e => setNewSoundId(e.target.value)}
                              className={`w-full px-2 py-1.5 rounded text-xs border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                            >
                              <option value="">Select...</option>
                              {sounds.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={`block text-[10px] font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>At T-{formatTime(newTriggerTime)}</label>
                            <input
                              type="number"
                              min={0}
                              max={seq.total_duration_seconds}
                              value={newTriggerTime}
                              onChange={e => setNewTriggerTime(parseInt(e.target.value) || 0)}
                              className={`w-full px-2 py-1.5 rounded text-xs border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                            />
                          </div>
                          <div>
                            <label className={`block text-[10px] font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Label</label>
                            <input
                              type="text"
                              value={newLabel}
                              onChange={e => setNewLabel(e.target.value)}
                              placeholder="e.g., Warning"
                              className={`w-full px-2 py-1.5 rounded text-xs border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => handleAddSound(seq.id)} disabled={!newSoundId && !newLabel.trim()} className="btn-primary-green px-3 py-1 disabled:opacity-50 text-white text-xs rounded-lg">Add</button>
                          <button onClick={() => setAddingSoundToSeq(null)} className={`px-3 py-1 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Cancel</button>
                          <span className={`text-[10px] ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                            Tip: You can upload a custom audio after adding
                          </span>
                        </div>
                      </div>
                    )}

                    {seq.sounds && seq.sounds.length > 0 ? (
                      <div className="relative">
                        <div className={`absolute left-4 top-0 bottom-0 w-px ${darkMode ? 'bg-slate-700' : 'bg-slate-300'}`} />
                        <div className="space-y-1">
                          {seq.sounds.map(ss => (
                            <div key={ss.id} className="pl-2 relative">
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center z-10 flex-shrink-0 ${
                                  ss.trigger_time_seconds === 0
                                    ? 'border-red-500 bg-red-500/20'
                                    : ss.trigger_time_seconds === seq.total_duration_seconds
                                      ? 'border-green-500 bg-green-500/20'
                                      : darkMode ? 'border-slate-600 bg-slate-800' : 'border-slate-400 bg-white'
                                }`}>
                                  <div className={`w-1.5 h-1.5 rounded-full ${
                                    ss.trigger_time_seconds === 0 ? 'bg-red-400' : ss.trigger_time_seconds === seq.total_duration_seconds ? 'bg-green-400' : darkMode ? 'bg-slate-500' : 'bg-slate-400'
                                  }`} />
                                </div>
                                <div className={`flex-1 flex items-center gap-2 py-1.5 px-2 rounded-lg text-xs ${darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}>
                                  <span className={`font-mono font-bold w-12 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                    T-{formatTime(ss.trigger_time_seconds)}
                                  </span>
                                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
                                    ss.trigger_time_seconds === 0 ? 'bg-red-500' : 'bg-blue-500'
                                  }`} />
                                  <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
                                    {ss.custom_sound_name || ss.sound?.name || 'Unknown'}
                                  </span>
                                  {ss.custom_sound_url && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Custom</span>
                                  )}
                                  {ss.label && (
                                    <span className={`italic ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                      {ss.label}
                                    </span>
                                  )}
                                  {ss.volume_override != null && (
                                    <span className="flex items-center gap-0.5 text-slate-500">
                                      <Volume2 size={10} /> {Math.round(ss.volume_override * 100)}%
                                    </span>
                                  )}
                                </div>
                                {(!seq.is_system_default || isSuperAdmin) && (
                                  <div className="flex items-center gap-1">
                                    {uploadingEventSoundFor === ss.id ? (
                                      <Loader2 size={12} className="animate-spin text-green-400" />
                                    ) : ss.custom_sound_url ? (
                                      <button
                                        onClick={() => handleRemoveEventSound(ss.id)}
                                        className="p-1 rounded text-amber-400 hover:bg-amber-500/20 transition-colors"
                                        title="Remove custom sound"
                                      >
                                        <RotateCcw size={11} />
                                      </button>
                                    ) : (
                                      <label
                                        className="p-1 rounded text-green-400 hover:bg-green-500/20 transition-colors cursor-pointer"
                                        title="Upload custom sound for this event"
                                      >
                                        <Upload size={11} />
                                        <input
                                          type="file"
                                          accept="audio/*"
                                          className="hidden"
                                          onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (file) handleEventSoundUpload(ss.id, file);
                                            e.target.value = '';
                                          }}
                                        />
                                      </label>
                                    )}
                                    <button
                                      onClick={() => handleRemoveSound(ss.id)}
                                      className="p-1 rounded text-red-400 hover:bg-red-500/20 transition-colors"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className={`text-xs text-center py-3 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                        No sound events configured
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Sequence"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}"?${deleteTarget.is_system_default ? ' This is a system sequence and will be removed for all clubs.' : ''} This cannot be undone.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
        variant="danger"
      />
    </div>
  );
};

const formatTimeMs = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const frac = Math.floor((ms % 1000) / 100);
  return `${m}:${s.toString().padStart(2, '0')}.${frac}`;
};

const AudioSyncTool: React.FC<{
  darkMode: boolean;
  sequence: StartSequence;
  onSave: (offsetMs: number, countdownSeconds: number, audioStartMs: number, audioEndMs: number | null) => Promise<void>;
}> = ({ darkMode, sequence, onSave }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [countdownStartMs, setCountdownStartMs] = useState<number>(
    sequence.audio_offset_ms || 0
  );
  const [audioStartMs, setAudioStartMs] = useState<number>(
    sequence.audio_start_ms || 0
  );
  const [audioEndMs, setAudioEndMs] = useState<number | null>(
    sequence.audio_end_ms ?? null
  );
  const [countdownSeconds, setCountdownSeconds] = useState(
    sequence.countdown_start_seconds ?? sequence.total_duration_seconds
  );
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'trim' | 'sync'>('trim');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'start' | 'end' | 'countdown' | null>(null);

  const hasUnsavedChanges =
    countdownStartMs !== (sequence.audio_offset_ms || 0)
    || countdownSeconds !== (sequence.countdown_start_seconds ?? sequence.total_duration_seconds)
    || audioStartMs !== (sequence.audio_start_ms || 0)
    || audioEndMs !== (sequence.audio_end_ms ?? null);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const tick = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      const currentMs = Math.round(audioRef.current.currentTime * 1000);
      setElapsedMs(currentMs);
      if (audioEndMs !== null && currentMs >= audioEndMs) {
        audioRef.current.pause();
        setIsPlaying(false);
        setIsPaused(false);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [audioEndMs]);

  const handlePlay = (fromStart?: boolean) => {
    cleanup();
    const audio = new Audio(sequence.audio_file_url!);
    audio.volume = 0.8;
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      setAudioDurationMs(Math.round(audio.duration * 1000));
      if (fromStart && audioStartMs > 0) {
        audio.currentTime = audioStartMs / 1000;
      }
    });
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setIsPaused(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    });

    audio.play().then(() => {
      setIsPlaying(true);
      setIsPaused(false);
      if (fromStart && audioStartMs > 0) {
        audio.currentTime = audioStartMs / 1000;
        setElapsedMs(audioStartMs);
      } else {
        setElapsedMs(0);
      }
      rafRef.current = requestAnimationFrame(tick);
    });
  };

  const handlePause = () => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPaused(true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
  };

  const handleResume = () => {
    if (audioRef.current && audioRef.current.paused && isPaused) {
      audioRef.current.play().then(() => {
        setIsPaused(false);
        rafRef.current = requestAnimationFrame(tick);
      });
    }
  };

  const handleStop = () => {
    cleanup();
    setElapsedMs(0);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(countdownStartMs, countdownSeconds, audioStartMs, audioEndMs);
    setSaving(false);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !audioDurationMs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = ratio * (audioDurationMs / 1000);
    audioRef.current.currentTime = seekTime;
    setElapsedMs(Math.round(seekTime * 1000));
  };

  const handleMarkerDragStart = (marker: 'start' | 'end' | 'countdown') => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = marker;

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!timelineRef.current || !audioDurationMs || !draggingRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const clientX = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const ms = Math.round(ratio * audioDurationMs);

      if (draggingRef.current === 'start') {
        const maxMs = audioEndMs !== null ? audioEndMs - 100 : audioDurationMs - 100;
        setAudioStartMs(Math.max(0, Math.min(ms, maxMs)));
      } else if (draggingRef.current === 'end') {
        const minMs = audioStartMs + 100;
        setAudioEndMs(Math.max(minMs, Math.min(ms, audioDurationMs)));
      } else if (draggingRef.current === 'countdown') {
        const effectiveEnd = audioEndMs ?? audioDurationMs;
        setCountdownStartMs(Math.max(audioStartMs, Math.min(ms, effectiveEnd)));
      }
    };

    const handleUp = () => {
      draggingRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleUp);
  };

  const setMarkerToCurrentTime = (marker: 'start' | 'end' | 'countdown') => {
    if (marker === 'start') {
      setAudioStartMs(elapsedMs);
    } else if (marker === 'end') {
      setAudioEndMs(elapsedMs);
    } else {
      setCountdownStartMs(elapsedMs);
    }
  };

  const progress = audioDurationMs > 0 ? elapsedMs / audioDurationMs : 0;
  const startPct = audioDurationMs > 0 ? (audioStartMs / audioDurationMs) * 100 : 0;
  const endPct = audioDurationMs > 0 ? ((audioEndMs ?? audioDurationMs) / audioDurationMs) * 100 : 100;
  const countdownPct = audioDurationMs > 0 ? (countdownStartMs / audioDurationMs) * 100 : 0;

  return (
    <div className={`p-4 rounded-lg space-y-4 ${darkMode ? 'bg-slate-900/50' : 'bg-white'}`}>
      <div className="flex items-center justify-between">
        <h5 className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          Audio Sync Tool
        </h5>
      </div>

      <div className="flex gap-1">
        <button
          onClick={() => setActiveTab('trim')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'trim'
              ? 'bg-blue-600 text-white'
              : darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <Scissors size={12} />
          Trim Audio
        </button>
        <button
          onClick={() => setActiveTab('sync')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'sync'
              ? 'bg-blue-600 text-white'
              : darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <Crosshair size={12} />
          Sync Countdown
        </button>
      </div>

      <div className={`rounded-lg p-3 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
        <div className="flex items-center gap-3 mb-3">
          {!isPlaying ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePlay(false)}
                className="btn-primary-green flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              >
                <Play size={16} /> Play Full
              </button>
              {audioStartMs > 0 && (
                <button
                  onClick={() => handlePlay(true)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    darkMode ? 'bg-slate-700 text-green-400 hover:bg-slate-600' : 'bg-slate-200 text-green-600 hover:bg-slate-300'
                  }`}
                >
                  <SkipForward size={14} /> From Start Mark
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {isPaused ? (
                <button
                  onClick={handleResume}
                  className="btn-primary-green flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  <Play size={14} /> Resume
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                >
                  <Pause size={14} /> Pause
                </button>
              )}
              <button
                onClick={handleStop}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                }`}
              >
                <Square size={14} /> Stop
              </button>
            </div>
          )}

          <div className="flex-1 text-right">
            <span className={`font-mono text-2xl font-bold tabular-nums ${
              isPlaying && !isPaused ? 'text-green-400' : darkMode ? 'text-slate-300' : 'text-slate-700'
            }`}>
              {formatTimeMs(elapsedMs)}
            </span>
            {audioDurationMs > 0 && (
              <span className={`text-xs ml-2 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                / {formatTimeMs(audioDurationMs)}
              </span>
            )}
          </div>
        </div>

        <div className="relative select-none" ref={timelineRef}>
          <div
            className={`relative h-12 rounded-lg cursor-pointer overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}
            onClick={handleSeek}
          >
            {/* Dimmed regions outside start/end */}
            <div
              className="absolute inset-y-0 left-0 bg-black/40 z-[5]"
              style={{ width: `${startPct}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-black/40 z-[5]"
              style={{ width: `${100 - endPct}%` }}
            />

            {/* Active region highlight */}
            <div
              className={`absolute inset-y-0 ${darkMode ? 'bg-green-500/10' : 'bg-green-500/15'}`}
              style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
            />

            {/* Playback progress */}
            <div
              className="absolute inset-y-0 left-0 bg-green-600/20 transition-[width] duration-75"
              style={{ width: `${progress * 100}%` }}
            />

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-30"
              style={{ left: `${progress * 100}%` }}
            />

            {/* Time scale ticks */}
            {audioDurationMs > 0 && Array.from({ length: Math.ceil(audioDurationMs / 10000) + 1 }, (_, i) => {
              const tickMs = i * 10000;
              if (tickMs > audioDurationMs) return null;
              const pct = (tickMs / audioDurationMs) * 100;
              return (
                <div key={i} className="absolute top-0 z-[3]" style={{ left: `${pct}%` }}>
                  <div className={`w-px h-2 ${darkMode ? 'bg-slate-600' : 'bg-slate-300'}`} />
                  <span className={`absolute top-2 -translate-x-1/2 text-[8px] font-mono ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    {formatTimeMs(tickMs)}
                  </span>
                </div>
              );
            })}

            {/* Countdown start marker (amber) */}
            {activeTab === 'sync' && (
              <div
                className="absolute top-0 bottom-0 z-20"
                style={{ left: `${countdownPct}%` }}
              >
                <div className="absolute top-0 bottom-0 w-0.5 bg-amber-500" />
                <div
                  className="absolute -top-1 -translate-x-1/2 w-4 h-4 bg-amber-500 rounded-full border-2 border-amber-300 cursor-grab active:cursor-grabbing shadow-lg"
                  onMouseDown={handleMarkerDragStart('countdown')}
                  onTouchStart={handleMarkerDragStart('countdown')}
                  onClick={e => e.stopPropagation()}
                />
                <div className="absolute bottom-0.5 -translate-x-1/2 whitespace-nowrap">
                  <span className="text-[8px] font-mono font-bold text-amber-400 bg-slate-900/80 px-1 rounded">
                    LED {formatTimeMs(countdownStartMs)}
                  </span>
                </div>
              </div>
            )}

            {/* Start marker (green) */}
            <div
              className="absolute top-0 bottom-0 z-20"
              style={{ left: `${startPct}%` }}
            >
              <div className="absolute top-0 bottom-0 w-0.5 bg-green-500" />
              <div
                className="absolute -top-1 -translate-x-1/2 w-4 h-4 bg-green-500 rounded-full border-2 border-green-300 cursor-grab active:cursor-grabbing shadow-lg"
                onMouseDown={handleMarkerDragStart('start')}
                onTouchStart={handleMarkerDragStart('start')}
                onClick={e => e.stopPropagation()}
              />
              {activeTab === 'trim' && (
                <div className="absolute bottom-0.5 -translate-x-1/2 whitespace-nowrap">
                  <span className="text-[8px] font-mono font-bold text-green-400 bg-slate-900/80 px-1 rounded">
                    IN {formatTimeMs(audioStartMs)}
                  </span>
                </div>
              )}
            </div>

            {/* End marker (red) */}
            {audioEndMs !== null && (
              <div
                className="absolute top-0 bottom-0 z-20"
                style={{ left: `${endPct}%` }}
              >
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-500" />
                <div
                  className="absolute -top-1 -translate-x-1/2 w-4 h-4 bg-red-500 rounded-full border-2 border-red-300 cursor-grab active:cursor-grabbing shadow-lg"
                  onMouseDown={handleMarkerDragStart('end')}
                  onTouchStart={handleMarkerDragStart('end')}
                  onClick={e => e.stopPropagation()}
                />
                {activeTab === 'trim' && (
                  <div className="absolute bottom-0.5 -translate-x-1/2 whitespace-nowrap">
                    <span className="text-[8px] font-mono font-bold text-red-400 bg-slate-900/80 px-1 rounded">
                      OUT {formatTimeMs(audioEndMs)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {!isPlaying && !elapsedMs && audioDurationMs === 0 && (
              <div className="absolute inset-0 flex items-center justify-center z-[2]">
                <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  Click Play to load and preview the audio
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'trim' && (
        <div className={`space-y-3 p-3 rounded-lg ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Scissors size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
            <span className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Trim Audio Playback
            </span>
          </div>
          <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            Drag the green (start) and red (stop) markers on the timeline, or use the buttons below to set them to the current playback position.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-900/50' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-green-400 flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  Start Point (IN)
                </span>
                <button
                  onClick={() => setMarkerToCurrentTime('start')}
                  disabled={!isPlaying && !isPaused && !elapsedMs}
                  className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${
                    isPlaying || isPaused || elapsedMs
                      ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                      : darkMode ? 'bg-slate-700 text-slate-600' : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  <Crosshair size={10} />
                  Set to Current
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold text-green-400">{formatTimeMs(audioStartMs)}</span>
                {audioStartMs > 0 && (
                  <button onClick={() => setAudioStartMs(0)} className="text-xs text-slate-500 hover:text-slate-300">Reset</button>
                )}
              </div>
            </div>

            <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-900/50' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-red-400 flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  Stop Point (OUT)
                </span>
                <button
                  onClick={() => setMarkerToCurrentTime('end')}
                  disabled={!isPlaying && !isPaused && !elapsedMs}
                  className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${
                    isPlaying || isPaused || elapsedMs
                      ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                      : darkMode ? 'bg-slate-700 text-slate-600' : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  <Crosshair size={10} />
                  Set to Current
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-mono text-lg font-bold ${audioEndMs !== null ? 'text-red-400' : darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                  {audioEndMs !== null ? formatTimeMs(audioEndMs) : 'End of file'}
                </span>
                {audioEndMs !== null && (
                  <button onClick={() => setAudioEndMs(null)} className="text-xs text-slate-500 hover:text-slate-300">Clear</button>
                )}
              </div>
            </div>
          </div>

          {audioEndMs !== null && (
            <div className={`text-xs p-2.5 rounded-lg ${darkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-700'}`}>
              Audio will play from <strong>{formatTimeMs(audioStartMs)}</strong> to <strong>{formatTimeMs(audioEndMs)}</strong> (duration: <strong>{formatTimeMs(audioEndMs - audioStartMs)}</strong>)
            </div>
          )}
        </div>
      )}

      {activeTab === 'sync' && (
        <div className={`space-y-3 p-3 rounded-lg ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Crosshair size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
            <span className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Sync LED Countdown
            </span>
          </div>
          <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            Drag the amber marker to the point where the LED countdown should begin, or play the audio and click "Set to Current" when you hear the first horn/click.
          </p>

          <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-900/50' : 'bg-white'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                LED Countdown Starts At
              </span>
              <button
                onClick={() => setMarkerToCurrentTime('countdown')}
                disabled={!isPlaying && !isPaused && !elapsedMs}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${
                  isPlaying || isPaused || elapsedMs
                    ? 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 animate-pulse'
                    : darkMode ? 'bg-slate-700 text-slate-600' : 'bg-slate-200 text-slate-400'
                }`}
              >
                <Crosshair size={10} />
                Set to Current
              </button>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-lg font-bold text-amber-400">{formatTimeMs(countdownStartMs)}</span>
              {countdownStartMs > 0 && (
                <button onClick={() => setCountdownStartMs(0)} className="text-xs text-slate-500 hover:text-slate-300">Reset</button>
              )}
            </div>
          </div>

          <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-900/50' : 'bg-white'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Clock size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
              <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Countdown from (seconds)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={10}
                max={900}
                value={countdownSeconds}
                onChange={e => setCountdownSeconds(parseInt(e.target.value) || sequence.total_duration_seconds)}
                className={`w-20 px-3 py-2 rounded-lg text-sm border ${
                  darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
              <span className={`text-sm font-mono ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                = {formatTime(countdownSeconds)}
              </span>
            </div>
          </div>

          {countdownStartMs > 0 && (
            <div className={`text-xs p-2.5 rounded-lg ${darkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-700'}`}>
              Audio plays from <strong>{formatTimeMs(audioStartMs)}</strong>.
              LED countdown starts at <strong>{formatTimeMs(countdownStartMs)}</strong> and counts down <strong>{formatTime(countdownSeconds)}</strong> to 0:00.
              {audioEndMs !== null && <> Audio stops at <strong>{formatTimeMs(audioEndMs)}</strong>.</>}
            </div>
          )}
        </div>
      )}

      {hasUnsavedChanges && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save Sync Settings
          </button>
          <span className={`text-xs ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
            Unsaved changes
          </span>
        </div>
      )}
    </div>
  );
};

const SequenceForm: React.FC<{
  darkMode: boolean;
  name: string; setName: (v: string) => void;
  desc: string; setDesc: (v: string) => void;
  type: SequenceType; setType: (v: SequenceType) => void;
  duration: number; setDuration: (v: number) => void;
  raceDefault: string; setRaceDefault: (v: string) => void;
}> = ({ darkMode, name, setName, desc, setDesc, type, setType, duration, setDuration, raceDefault, setRaceDefault }) => {
  const inputClass = `w-full px-3 py-2 rounded-lg text-sm border ${
    darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
  }`;
  const labelClass = `block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div>
        <label className={labelClass}>Name *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Custom 3 Min Start" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Type</label>
        <select value={type} onChange={e => setType(e.target.value as SequenceType)} className={inputClass}>
          {SEQUENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass}>Duration (seconds)</label>
        <input type="number" min={10} max={900} value={duration} onChange={e => setDuration(parseInt(e.target.value) || 120)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Race Type Default</label>
        <select value={raceDefault} onChange={e => setRaceDefault(e.target.value)} className={inputClass}>
          <option value="">None</option>
          <option value="scratch">Scratch</option>
          <option value="handicap">Handicap</option>
        </select>
      </div>
      <div className="col-span-2 sm:col-span-2">
        <label className={labelClass}>Description</label>
        <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description" className={inputClass} />
      </div>
    </div>
  );
};

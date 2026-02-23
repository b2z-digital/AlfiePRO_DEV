import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Copy, Edit2, Check, X, ChevronDown, ChevronUp, Play, Square, Clock, Volume2, Shield, ListMusic, Timer, Upload, Music, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { StartSequence, StartSequenceSound, StartBoxSound, SequenceType } from '../../types/startBox';
import {
  getSequences, getSounds, createSequence, updateSequence, deleteSequence,
  addSequenceSound, updateSequenceSound, removeSequenceSound, duplicateSequence,
  uploadSequenceAudio, removeSequenceAudio,
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
  const { user } = useAuth();
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

  const [addingSoundToSeq, setAddingSoundToSeq] = useState<string | null>(null);
  const [newSoundId, setNewSoundId] = useState('');
  const [newTriggerTime, setNewTriggerTime] = useState(0);
  const [newLabel, setNewLabel] = useState('');
  const [uploadingAudioFor, setUploadingAudioFor] = useState<string | null>(null);
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
      club_id: clubId,
      name: formName.trim(),
      description: formDesc.trim() || undefined,
      sequence_type: formType,
      total_duration_seconds: formDuration,
      is_system_default: false,
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

  const handleDelete = async (seqId: string) => {
    await deleteSequence(seqId);
    if (expandedId === seqId) setExpandedId(null);
    await loadData();
  };

  const handleDuplicate = async (seq: StartSequence) => {
    if (!clubId) return;
    await duplicateSequence(seq.id, clubId, `${seq.name} (Copy)`, user?.id);
    await loadData();
  };

  const handleAddSound = async (seqId: string) => {
    if (!newSoundId) return;
    await addSequenceSound({
      sequence_id: seqId,
      sound_id: newSoundId,
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
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
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
            <button onClick={handleCreate} disabled={!formName.trim()} className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
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
                  <span>{seq.sounds?.length || 0} sounds</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!seq.is_system_default && (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); startEdit(seq); setExpandedId(seq.id); }}
                      className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(seq.id); }}
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
                {editingId === seq.id && !seq.is_system_default && (
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

                <div className={`mt-3 p-3 rounded-lg ${darkMode ? 'bg-slate-800/30' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      Countdown Audio File
                    </h4>
                  </div>

                  {seq.audio_file_url ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleAudioPreview(seq.audio_file_url!)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          audioPreviewUrl === seq.audio_file_url
                            ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                            : darkMode
                              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        {audioPreviewUrl === seq.audio_file_url ? (
                          <><Square size={14} /> Stop Preview</>
                        ) : (
                          <><Play size={14} /> Preview Audio</>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Music size={14} className={darkMode ? 'text-blue-400' : 'text-blue-500'} />
                          <span className={`text-sm truncate ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {seq.audio_file_path?.split('/').pop() || 'Countdown audio'}
                          </span>
                        </div>
                      </div>
                      {!seq.is_system_default && (
                        <div className="flex items-center gap-1">
                          <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                            darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
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
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                            title="Remove audio"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      {uploadingAudioFor === seq.id ? (
                        <div className="flex items-center gap-2 py-2">
                          <Loader2 size={16} className="animate-spin text-blue-400" />
                          <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Uploading...</span>
                        </div>
                      ) : !seq.is_system_default ? (
                        <label className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                          darkMode
                            ? 'border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-300'
                            : 'border-slate-300 hover:border-slate-400 text-slate-500 hover:text-slate-600'
                        }`}>
                          <Upload size={16} />
                          <span className="text-sm">Upload MP3 countdown audio file</span>
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

                  {seq.audio_file_url && (
                    <div className="mt-2">
                      <label className={`block text-[10px] font-medium mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        Audio Offset (ms) - positive delays audio, negative starts audio earlier
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

                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      Timeline
                    </h4>
                    {!seq.is_system_default && (
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
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => handleAddSound(seq.id)} disabled={!newSoundId} className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs rounded-lg">Add</button>
                        <button onClick={() => setAddingSoundToSeq(null)} className={`px-3 py-1 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {seq.sounds && seq.sounds.length > 0 ? (
                    <div className="relative">
                      <div className={`absolute left-4 top-0 bottom-0 w-px ${darkMode ? 'bg-slate-700' : 'bg-slate-300'}`} />
                      <div className="space-y-1">
                        {seq.sounds.map(ss => (
                          <div key={ss.id} className="flex items-center gap-3 pl-2 relative">
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
                                {ss.sound?.name || 'Unknown'}
                              </span>
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
                            {!seq.is_system_default && (
                              <button
                                onClick={() => handleRemoveSound(ss.id)}
                                className="p-1 rounded text-red-400 hover:bg-red-500/20 transition-colors"
                              >
                                <X size={12} />
                              </button>
                            )}
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
              </div>
            )}
          </div>
        ))}
      </div>
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

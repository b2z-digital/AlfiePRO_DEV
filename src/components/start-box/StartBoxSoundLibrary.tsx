import React, { useState, useEffect, useRef } from 'react';
import { Upload, Play, Square, Trash2, Music, Volume2, Clock, HardDrive, Shield, Edit2, Check, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { StartBoxSound } from '../../types/startBox';
import { getSounds, uploadSound, deleteSound } from '../../utils/startBoxStorage';
import { supabase } from '../../utils/supabase';

interface StartBoxSoundLibraryProps {
  darkMode: boolean;
  clubId: string | null;
  onSoundsChange?: () => void;
}

export const StartBoxSoundLibrary: React.FC<StartBoxSoundLibraryProps> = ({
  darkMode,
  clubId,
  onSoundsChange,
}) => {
  const { user, isSuperAdmin } = useAuth();
  const [sounds, setSounds] = useState<StartBoxSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [replacingFileFor, setReplacingFileFor] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSounds();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [clubId]);

  const loadSounds = async () => {
    setLoading(true);
    const data = await getSounds(clubId);
    setSounds(data);
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!selectedFile || !newName.trim()) return;
    setUploading(true);
    const result = await uploadSound(
      isSuperAdmin ? null : clubId,
      selectedFile,
      newName.trim(),
      newDescription.trim() || undefined,
      user?.id,
      isSuperAdmin
    );
    if (result) {
      setNewName('');
      setNewDescription('');
      setSelectedFile(null);
      setShowUploadForm(false);
      await loadSounds();
      onSoundsChange?.();
    }
    setUploading(false);
  };

  const handleDelete = async (soundId: string, isSystem: boolean) => {
    const success = await deleteSound(soundId, isSystem && isSuperAdmin);
    if (success) {
      setSounds(prev => prev.filter(s => s.id !== soundId));
      onSoundsChange?.();
    }
  };

  const startEditing = (sound: StartBoxSound) => {
    setEditingId(sound.id);
    setEditName(sound.name);
    setEditDescription(sound.description || '');
  };

  const handleSaveEdit = async (soundId: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from('start_box_sounds')
      .update({ name: editName.trim(), description: editDescription.trim() || null })
      .eq('id', soundId);
    if (!error) {
      setEditingId(null);
      await loadSounds();
    }
  };

  const handleReplaceFile = async (soundId: string, file: File) => {
    setReplacingFileFor(soundId);
    const sound = sounds.find(s => s.id === soundId);
    if (!sound) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp3';
    const prefix = sound.is_system_default ? 'system' : (clubId || 'global');
    const fileName = `${prefix}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('start-box-sounds')
      .upload(fileName, file, { contentType: file.type || 'audio/mpeg', upsert: false });

    if (!uploadError) {
      if (sound.file_path) {
        await supabase.storage.from('start-box-sounds').remove([sound.file_path]);
      }
      const { data: { publicUrl } } = supabase.storage.from('start-box-sounds').getPublicUrl(fileName);
      await supabase
        .from('start_box_sounds')
        .update({ file_path: fileName, file_url: publicUrl, file_size: file.size, mime_type: file.type || 'audio/mpeg' })
        .eq('id', soundId);
      await loadSounds();
      onSoundsChange?.();
    }
    setReplacingFileFor(null);
  };

  const togglePlay = (sound: StartBoxSound) => {
    if (playingId === sound.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(sound.file_url);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    audio.play().catch(() => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(sound.id);
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '--';
    const seconds = ms / 1000;
    if (seconds < 1) return `${ms}ms`;
    return `${seconds.toFixed(1)}s`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '--';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music size={18} className="text-blue-400" />
          <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Sound Library
          </h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
            {sounds.length} sounds
          </span>
        </div>
        <button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
        >
          <Upload size={14} />
          Upload Sound
        </button>
      </div>

      {showUploadForm && (
        <div className={`p-4 rounded-lg border ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Sound Name *
              </label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g., Custom Horn"
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  darkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Description
              </label>
              <input
                type="text"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="Optional description"
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  darkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
          </div>
          <div className="mt-3">
            <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Audio File * (MP3, WAV, OGG - max 10MB)
            </label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/mpeg,audio/wav,audio/ogg,audio/mp3,audio/x-wav,audio/webm"
                onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                  darkMode
                    ? 'border-slate-600 hover:bg-slate-700 text-slate-300'
                    : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                }`}
              >
                {selectedFile ? selectedFile.name : 'Choose File...'}
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || !newName.trim() || uploading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              <button
                onClick={() => { setShowUploadForm(false); setSelectedFile(null); setNewName(''); setNewDescription(''); }}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sounds.length === 0 ? (
        <div className={`text-center py-8 rounded-lg border-2 border-dashed ${
          darkMode ? 'border-slate-700 text-slate-500' : 'border-slate-300 text-slate-400'
        }`}>
          <Volume2 size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No sounds uploaded yet</p>
          <p className="text-xs mt-1">Upload audio files to use in your start sequences</p>
        </div>
      ) : (
        <div className="space-y-1">
          {sounds.map(sound => (
            <div
              key={sound.id}
              className={`rounded-lg transition-colors ${
                darkMode
                  ? 'hover:bg-slate-800/50 border border-slate-700/50'
                  : 'hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3 p-3">
                <button
                  onClick={() => togglePlay(sound)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    playingId === sound.id
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                  }`}
                >
                  {playingId === sound.id ? <Square size={14} /> : <Play size={14} className="ml-0.5" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {sound.name}
                    </span>
                    {sound.is_system_default && (
                      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                        <Shield size={8} />
                        System
                      </span>
                    )}
                  </div>
                  {sound.description && (
                    <p className={`text-xs truncate ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {sound.description}
                    </p>
                  )}
                </div>

                <div className={`flex items-center gap-3 text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {formatDuration(sound.duration_ms)}
                  </span>
                  <span className="flex items-center gap-1">
                    <HardDrive size={10} />
                    {formatSize(sound.file_size)}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {(!sound.is_system_default || isSuperAdmin) && (
                    <button
                      onClick={() => startEditing(sound)}
                      className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                      title="Edit sound"
                    >
                      <Edit2 size={14} />
                    </button>
                  )}
                  {(!sound.is_system_default || isSuperAdmin) && (
                    <button
                      onClick={() => handleDelete(sound.id, sound.is_system_default)}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                      title="Delete sound"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {editingId === sound.id && (
                <div className={`px-3 pb-3 border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
                  <div className={`p-3 mt-3 rounded-lg ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Name
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className={`w-full px-3 py-2 rounded-lg text-sm border ${
                            darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Description
                        </label>
                        <input
                          type="text"
                          value={editDescription}
                          onChange={e => setEditDescription(e.target.value)}
                          placeholder="Optional description"
                          className={`w-full px-3 py-2 rounded-lg text-sm border ${
                            darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                          }`}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <label className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                        darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}>
                        <Upload size={12} />
                        {replacingFileFor === sound.id ? 'Replacing...' : 'Replace Audio File'}
                        <input
                          ref={replaceFileInputRef}
                          type="file"
                          accept="audio/mpeg,audio/wav,audio/ogg,audio/mp3,audio/x-wav,audio/webm"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleReplaceFile(sound.id, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleSaveEdit(sound.id)}
                        disabled={!editName.trim()}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg"
                      >
                        <Check size={14} /> Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className={`px-3 py-1.5 text-sm rounded-lg ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Save, Clock, CircleCheck as CheckCircle2, Trash2, TriangleAlert as AlertTriangle } from 'lucide-react';
import { getCheckpoints, createCheckpoint, deleteCheckpoint, ScoringCheckpoint } from '../utils/scoringCheckpoints';
import type { HeatManagement } from '../types/heat';
import type { Skipper } from '../types/index';

interface ScoringCheckpointModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  eventId: string;
  clubId: string;
  currentHeatManagement: HeatManagement;
  currentRaceResults: any[];
  currentSkippers: Skipper[];
  currentLastCompletedRace: number;
  currentDropRules: number[];
  currentNumRaces: number;
  onRestore: (checkpoint: ScoringCheckpoint) => void;
}

export const ScoringCheckpointModal: React.FC<ScoringCheckpointModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  eventId,
  clubId,
  currentHeatManagement,
  currentRaceResults,
  currentSkippers,
  currentLastCompletedRace,
  currentDropRules,
  currentNumRaces,
  onRestore,
}) => {
  const [checkpoints, setCheckpoints] = useState<ScoringCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCheckpoints();
    }
  }, [isOpen, eventId]);

  const loadCheckpoints = async () => {
    setLoading(true);
    const data = await getCheckpoints(eventId);
    setCheckpoints(data);
    setLoading(false);
  };

  const handleCreateManual = async () => {
    setSaving(true);
    const completedRounds = currentHeatManagement.rounds.filter(r => r.completed);
    const highestRound = completedRounds.length > 0
      ? Math.max(...completedRounds.map(r => r.round))
      : currentHeatManagement.currentRound;

    const result = await createCheckpoint({
      eventId,
      clubId,
      roundNumber: highestRound,
      checkpointType: 'manual',
      label: `Manual save - Race ${highestRound} (in progress: Race ${currentHeatManagement.currentRound})`,
      heatManagement: currentHeatManagement,
      raceResults: currentRaceResults,
      skippers: currentSkippers,
      lastCompletedRace: currentLastCompletedRace,
      dropRules: currentDropRules,
      numRaces: currentNumRaces,
    });

    if (result.success) {
      await loadCheckpoints();
    }
    setSaving(false);
  };

  const handleRestore = (checkpoint: ScoringCheckpoint) => {
    onRestore(checkpoint);
    setRestoreConfirm(null);
    onClose();
  };

  const handleDelete = async (checkpointId: string) => {
    await deleteCheckpoint(checkpointId);
    setDeleteConfirm(null);
    await loadCheckpoints();
  };

  if (!isOpen) return null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCheckpointSummary = (cp: ScoringCheckpoint) => {
    const hm = cp.heat_management;
    const completedRounds = hm.rounds.filter(r => r.completed).length;
    const totalResults = hm.rounds.reduce((sum, r) => sum + r.results.length, 0);
    const numSkippers = cp.skippers.length;
    return `${numSkippers} skippers, ${completedRounds} rounds complete, ${totalResults} results`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className={`w-full max-w-lg rounded-xl shadow-2xl ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'} max-h-[80vh] flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <RotateCcw className={`w-5 h-5 ${darkMode ? 'text-sky-400' : 'text-sky-600'}`} />
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Scoring Checkpoints
            </h2>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Manual Save Button */}
        <div className={`px-4 pt-4 pb-2`}>
          <button
            onClick={handleCreateManual}
            disabled={saving}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${
              darkMode
                ? 'bg-sky-600 hover:bg-sky-500 text-white disabled:bg-slate-700'
                : 'bg-sky-600 hover:bg-sky-700 text-white disabled:bg-slate-300'
            }`}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Checkpoint Now'}
          </button>
          <p className={`text-xs mt-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Checkpoints are also saved automatically at the end of each completed race.
          </p>
        </div>

        {/* Checkpoint List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Loading checkpoints...
            </div>
          ) : checkpoints.length === 0 ? (
            <div className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No checkpoints yet.</p>
              <p className="text-xs mt-1">Complete a race to create your first automatic checkpoint.</p>
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              {checkpoints.map((cp) => (
                <div
                  key={cp.id}
                  className={`rounded-lg border p-3 ${
                    darkMode
                      ? 'border-slate-700 bg-slate-750'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${
                          cp.checkpoint_type === 'auto_round_complete'
                            ? darkMode ? 'text-emerald-400' : 'text-emerald-600'
                            : darkMode ? 'text-amber-400' : 'text-amber-600'
                        }`} />
                        <span className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {cp.label}
                        </span>
                      </div>
                      <p className={`text-xs mt-0.5 ml-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {formatDate(cp.created_at)} &middot; {getCheckpointSummary(cp)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {restoreConfirm === cp.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRestore(cp)}
                            className="px-2 py-1 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setRestoreConfirm(null)}
                            className={`px-2 py-1 text-xs rounded ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : deleteConfirm === cp.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(cp.id)}
                            className="px-2 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className={`px-2 py-1 text-xs rounded ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => setRestoreConfirm(cp.id)}
                            title="Restore to this checkpoint"
                            className={`p-1.5 rounded-lg transition-colors ${
                              darkMode ? 'hover:bg-slate-700 text-slate-400 hover:text-amber-400' : 'hover:bg-slate-200 text-slate-500 hover:text-amber-600'
                            }`}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(cp.id)}
                            title="Delete checkpoint"
                            className={`p-1.5 rounded-lg transition-colors ${
                              darkMode ? 'hover:bg-slate-700 text-slate-400 hover:text-red-400' : 'hover:bg-slate-200 text-slate-500 hover:text-red-600'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Warning */}
        {checkpoints.length > 0 && (
          <div className={`px-4 py-3 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Restoring a checkpoint will replace all current scoring data with the saved state.
                Results entered after the checkpoint will be lost.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

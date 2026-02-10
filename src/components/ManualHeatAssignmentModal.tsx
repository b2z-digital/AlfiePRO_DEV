import React, { useState, useEffect, useCallback } from 'react';
import { X, Users, Shuffle, Trash2, UserPlus, Edit2, Trophy } from 'lucide-react';
import { Skipper } from '../types';
import { HeatDesignation } from '../types/heat';
import { RaceEvent } from '../types/race';
import { ConfirmationModal } from './ConfirmationModal';
import { getCountryFlag, getIOCCode } from '../utils/countryFlags';

interface HeatAssignment {
  heatDesignation: HeatDesignation;
  skipperIndices: number[];
}

interface ManualHeatAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (assignments: HeatAssignment[]) => void;
  skippers: Skipper[];
  numHeats: number;
  darkMode: boolean;
  currentEvent?: RaceEvent | null;
  autoShuffle?: boolean;
  onDeleteSkipper?: (skipperIndex: number) => void;
  onAddSkipper?: () => void;
  onEditSkipper?: (skipperIndex: number) => void;
  onSaveSkipper?: (skipperIndex: number, updatedSkipper: Skipper) => void;
  onRankingAssignment?: () => void;
}

const adjustIndicesAfterDeletion = (indices: number[], deletedIndex: number): number[] => {
  return indices
    .filter(idx => idx !== deletedIndex) // Remove the deleted index
    .map(idx => idx > deletedIndex ? idx - 1 : idx); // Decrement indices greater than deleted
};

export const ManualHeatAssignmentModal: React.FC<ManualHeatAssignmentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  skippers,
  numHeats,
  darkMode,
  currentEvent,
  autoShuffle = false,
  onDeleteSkipper,
  onAddSkipper,
  onEditSkipper,
  onSaveSkipper,
  onRankingAssignment
}) => {
  const [draggedSkipperIndex, setDraggedSkipperIndex] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<HeatAssignment[]>([]);
  const [unassigned, setUnassigned] = useState<number[]>([]);
  const [skipperToDelete, setSkipperToDelete] = useState<{index: number, name: string} | null>(null);
  const [editingSkipperData, setEditingSkipperData] = useState<{index: number, skipper: Skipper} | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const heatDesignations: HeatDesignation[] = ['F', 'E', 'D', 'C', 'B', 'A'];
  const availableHeats = heatDesignations.slice(-numHeats);
  const [hasAutoShuffled, setHasAutoShuffled] = useState(false);

  useEffect(() => {
    if (isOpen && !isInitialized) {
      // Initialize with all skippers unassigned (only on first open)
      setUnassigned(skippers.map((_, idx) => idx));
      setAssignments(availableHeats.map(heat => ({
        heatDesignation: heat,
        skipperIndices: []
      })));
      setHasAutoShuffled(false);
      setIsInitialized(true);
    } else if (!isOpen) {
      // Reset initialization flag when modal closes
      setIsInitialized(false);
    }
  }, [isOpen, numHeats, isInitialized, skippers.length, availableHeats]);

  const handleRandomAssignment = useCallback(() => {
    const allSkipperIndices = skippers.map((_, idx) => idx);
    const shuffled = [...allSkipperIndices].sort(() => Math.random() - 0.5);

    // Calculate base size and remainder
    const baseSize = Math.floor(shuffled.length / numHeats);
    const remainder = shuffled.length % numHeats;

    // Assign skippers to heats, with Heat A (last in array) getting the extras
    let skipperIdx = 0;
    const newAssignments = availableHeats.map((heat, heatIdx) => {
      // Heat A is at the end of availableHeats array and should get extra boats
      const isHeatA = heatIdx === availableHeats.length - 1;
      const heatSize = isHeatA ? baseSize + remainder : baseSize;

      const skipperIndices = shuffled.slice(skipperIdx, skipperIdx + heatSize);
      skipperIdx += heatSize;

      return {
        heatDesignation: heat,
        skipperIndices
      };
    });

    setAssignments(newAssignments);
    setUnassigned([]);
  }, [skippers, numHeats, availableHeats]);

  // Auto-shuffle after initialization when requested
  useEffect(() => {
    if (isOpen && autoShuffle && !hasAutoShuffled && assignments.length > 0) {
      // Delay slightly to ensure state is settled
      setTimeout(() => {
        handleRandomAssignment();
        setHasAutoShuffled(true);
      }, 100);
    }
  }, [isOpen, autoShuffle, hasAutoShuffled, assignments.length, handleRandomAssignment]);

  if (!isOpen) return null;

  const getHeatColor = (heat: HeatDesignation): string => {
    const colors: Record<HeatDesignation, string> = {
      'A': 'bg-blue-600',
      'B': 'bg-green-600',
      'C': 'bg-red-600',
      'D': 'bg-purple-600',
      'E': 'bg-yellow-600',
      'F': 'bg-orange-600'
    };
    return colors[heat] || 'bg-slate-600';
  };

  const handleDragStart = (skipperIndex: number) => {
    setDraggedSkipperIndex(skipperIndex);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnHeat = (heatDesignation: HeatDesignation) => {
    if (draggedSkipperIndex === null) return;

    // Remove from unassigned
    setUnassigned(prev => prev.filter(idx => idx !== draggedSkipperIndex));

    // Remove from any other heat
    setAssignments(prev => prev.map(assignment => ({
      ...assignment,
      skipperIndices: assignment.skipperIndices.filter(idx => idx !== draggedSkipperIndex)
    })));

    // Add to target heat
    setAssignments(prev => prev.map(assignment =>
      assignment.heatDesignation === heatDesignation
        ? { ...assignment, skipperIndices: [...assignment.skipperIndices, draggedSkipperIndex] }
        : assignment
    ));

    setDraggedSkipperIndex(null);
  };

  const handleDropOnUnassigned = () => {
    if (draggedSkipperIndex === null) return;

    // Remove from any heat
    setAssignments(prev => prev.map(assignment => ({
      ...assignment,
      skipperIndices: assignment.skipperIndices.filter(idx => idx !== draggedSkipperIndex)
    })));

    // Add to unassigned
    if (!unassigned.includes(draggedSkipperIndex)) {
      setUnassigned(prev => [...prev, draggedSkipperIndex]);
    }

    setDraggedSkipperIndex(null);
  };

  const handleRemoveFromHeat = (heatDesignation: HeatDesignation, skipperIndex: number) => {
    setAssignments(prev => prev.map(assignment =>
      assignment.heatDesignation === heatDesignation
        ? { ...assignment, skipperIndices: assignment.skipperIndices.filter(idx => idx !== skipperIndex) }
        : assignment
    ));
    setUnassigned(prev => [...prev, skipperIndex]);
  };

  const handleConfirm = () => {
    if (unassigned.length > 0) {
      if (!confirm(`${unassigned.length} skipper(s) are unassigned. Continue anyway?`)) {
        return;
      }
    }
    console.log('🔵 Manual assignments being confirmed:', JSON.stringify(assignments, null, 2));
    console.log('🔵 Heat A skipper indices:', assignments.find(a => a.heatDesignation === 'A')?.skipperIndices);
    onConfirm(assignments);
  };

  const totalAssigned = assignments.reduce((sum, a) => sum + a.skipperIndices.length, 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-6xl max-h-[90vh] rounded-xl shadow-xl overflow-hidden
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        {/* Header */}
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <Users className="text-blue-400" size={24} />
            <div>
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                Manual Heat Assignment
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Drag and drop skippers into heats
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {onAddSkipper && (
              <button
                onClick={onAddSkipper}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-green-600 text-white hover:bg-green-700 flex items-center gap-2"
              >
                <UserPlus size={16} />
                Add Skipper
              </button>
            )}
            {onRankingAssignment && (
              <button
                onClick={onRankingAssignment}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-amber-600 text-white hover:bg-amber-700 flex items-center gap-2"
              >
                <Trophy size={16} />
                Ranking Assignment
              </button>
            )}
            <button
              onClick={handleRandomAssignment}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-2"
            >
              <Shuffle size={16} />
              Random Assignment
            </button>
            <button
              onClick={onClose}
              className={`
                px-4 py-2 rounded-lg font-medium transition-colors
                ${darkMode
                  ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
              `}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              Confirm Assignment
            </button>
          </div>
        </div>

        {/* Content - Fixed height with internal scrolling */}
        <div className="flex flex-col lg:flex-row gap-4 p-6" style={{ height: 'calc(90vh - 180px)' }}>
          {/* Unassigned Skippers - Scrollable - 40% width */}
          <div className="lg:w-[40%] flex flex-col min-w-0">
            <div className={`mb-3 flex-shrink-0 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <h3 className="text-lg font-semibold mb-1">Unassigned Skippers</h3>
              <p className="text-sm opacity-75">{unassigned.length} skipper(s)</p>
            </div>
            <div
              onDragOver={handleDragOver}
              onDrop={handleDropOnUnassigned}
              className={`
                flex-1 overflow-y-auto rounded-xl p-4 border-2 border-dashed transition-colors
                ${darkMode
                  ? 'bg-slate-900/50 border-slate-700'
                  : 'bg-slate-50 border-slate-300'
                }
              `}
            >
                <div className="space-y-2">
                  {unassigned.map(skipperIdx => {
                    const skipper = skippers[skipperIdx];
                    if (!skipper) return null;
                    return (
                      <div
                        key={skipperIdx}
                        draggable
                        onDragStart={() => handleDragStart(skipperIdx)}
                        className={`
                          p-3 rounded-lg cursor-move transition-all group
                          ${darkMode
                            ? 'bg-slate-800 hover:bg-slate-700'
                            : 'bg-white hover:bg-slate-50'
                          }
                          shadow-sm hover:shadow-md
                        `}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {/* Flag (if event shows flag) */}
                            {currentEvent?.show_flag && skipper.country_code && (
                              <div className="flex-shrink-0 text-2xl">
                                {getCountryFlag(skipper.country_code)}
                              </div>
                            )}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                              darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {currentEvent?.show_country && skipper.country_code && (
                                <span className="font-bold text-xs mr-0.5">
                                  {getIOCCode(skipper.country_code)}
                                </span>
                              )}
                              {skipper.sailNo}
                            </div>
                            {skipper.avatarUrl ? (
                              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                                <img
                                  src={skipper.avatarUrl}
                                  alt={skipper.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                                darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-300 text-slate-700'
                              }`}>
                                {skipper.name.split(' ').map(n => n[0]).join('')}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className={`font-medium truncate ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                {skipper.name}
                              </div>
                              <div className={`text-xs truncate ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                {skipper.boatModel} • {skipper.club}
                              </div>
                            </div>
                          </div>
                          {(onEditSkipper || onDeleteSkipper) && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {onEditSkipper && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSkipperData({index: skipperIdx, skipper});
                                  }}
                                  className={`p-2 rounded-lg transition-colors ${
                                    darkMode
                                      ? 'text-slate-400 hover:text-cyan-400 hover:bg-slate-700'
                                      : 'text-slate-500 hover:text-cyan-600 hover:bg-slate-100'
                                  }`}
                                  title="Edit skipper"
                                >
                                  <Edit2 size={14} />
                                </button>
                              )}
                              {onDeleteSkipper && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSkipperToDelete({index: skipperIdx, name: skipper.name});
                                  }}
                                  className={`p-2 rounded-lg transition-colors ${
                                    darkMode
                                      ? 'text-slate-400 hover:text-red-400 hover:bg-slate-700'
                                      : 'text-slate-500 hover:text-red-600 hover:bg-slate-100'
                                  }`}
                                  title="Remove from event"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
          </div>

          {/* Heats - Scrollable - 60% width */}
          <div className="lg:w-[60%] flex flex-col min-w-0">
            <div className={`mb-3 flex-shrink-0 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <h3 className="text-lg font-semibold mb-1">Heat Assignments</h3>
              <p className="text-sm opacity-75">{totalAssigned} of {skippers.length} assigned</p>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {assignments.slice().reverse().map(assignment => {
                  const { heatDesignation, skipperIndices } = assignment;
                  return (
                    <div key={heatDesignation} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className={`px-3 py-1 rounded-lg ${getHeatColor(heatDesignation)} text-white font-bold text-sm shadow-md`}>
                          Heat {heatDesignation}
                        </div>
                        <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {skipperIndices.length} skipper(s)
                        </span>
                      </div>
                      <div
                        onDragOver={handleDragOver}
                        onDrop={() => handleDropOnHeat(heatDesignation)}
                        className={`
                          min-h-[80px] rounded-xl p-3 border-2 border-dashed transition-colors
                          ${darkMode
                            ? 'bg-slate-900/30 border-slate-700'
                            : 'bg-slate-50 border-slate-300'
                          }
                        `}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {skipperIndices.map(skipperIdx => {
                            const skipper = skippers[skipperIdx];
                            if (!skipper) return null;
                            return (
                              <div
                                key={skipperIdx}
                                draggable
                                onDragStart={() => handleDragStart(skipperIdx)}
                                className={`
                                  p-2 rounded-lg cursor-move transition-all flex items-center justify-between group
                                  ${darkMode
                                    ? 'bg-slate-800 hover:bg-slate-700'
                                    : 'bg-white hover:bg-slate-50'
                                  }
                                  shadow-sm hover:shadow
                                `}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  {/* Flag (if event shows flag) */}
                                  {currentEvent?.show_flag && skipper.country_code && (
                                    <div className="flex-shrink-0 text-lg">
                                      {getCountryFlag(skipper.country_code)}
                                    </div>
                                  )}
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                                    darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'
                                  }`}>
                                    {currentEvent?.show_country && skipper.country_code && (
                                      <span className="font-bold text-[10px] mr-0.5">
                                        {getIOCCode(skipper.country_code)}
                                      </span>
                                    )}
                                    {skipper.sailNo}
                                  </div>
                                  {skipper.avatarUrl ? (
                                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                                      <img
                                        src={skipper.avatarUrl}
                                        alt={skipper.name}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  ) : (
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                                      darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-300 text-slate-700'
                                    }`}>
                                      {skipper.name.split(' ').map(n => n[0]).join('')}
                                    </div>
                                  )}
                                  <span className={`text-sm font-medium truncate ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                    {skipper.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {onEditSkipper && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingSkipperData({index: skipperIdx, skipper});
                                      }}
                                      className={`p-1.5 rounded transition-colors ${
                                        darkMode
                                          ? 'text-slate-400 hover:text-cyan-400 hover:bg-slate-700'
                                          : 'text-slate-500 hover:text-cyan-600 hover:bg-slate-100'
                                      }`}
                                      title="Edit skipper"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                  )}
                                  {onDeleteSkipper && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSkipperToDelete({index: skipperIdx, name: skipper.name});
                                      }}
                                      className={`p-1.5 rounded transition-colors ${
                                        darkMode
                                          ? 'text-slate-400 hover:text-red-400 hover:bg-slate-700'
                                          : 'text-slate-500 hover:text-red-600 hover:bg-slate-100'
                                      }`}
                                      title="Remove from event"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleRemoveFromHeat(heatDesignation, skipperIdx)}
                                    className={`p-1.5 rounded transition-colors ${
                                      darkMode
                                        ? 'text-slate-400 hover:text-orange-400 hover:bg-slate-700'
                                        : 'text-slate-500 hover:text-orange-600 hover:bg-slate-100'
                                    }`}
                                    title="Remove from heat (keep in unassigned)"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!skipperToDelete}
        onClose={() => setSkipperToDelete(null)}
        onConfirm={() => {
          if (skipperToDelete && onDeleteSkipper) {
            const deletedIndex = skipperToDelete.index;

            // Adjust all assignments to account for the deletion
            setAssignments(prev => prev.map(assignment => ({
              ...assignment,
              skipperIndices: adjustIndicesAfterDeletion(assignment.skipperIndices, deletedIndex)
            })));

            // Adjust unassigned list
            setUnassigned(prev => adjustIndicesAfterDeletion(prev, deletedIndex));

            // Call the parent's delete handler
            onDeleteSkipper(deletedIndex);
          }
          setSkipperToDelete(null);
        }}
        title="Remove Skipper"
        message={`Are you sure you want to remove ${skipperToDelete?.name} from this event? This will remove them from the scoring table.`}
        confirmText="Remove"
        cancelText="Cancel"
        darkMode={darkMode}
      />

      {/* Edit Skipper Modal */}
      {editingSkipperData && (
        <SkipperEditModal
          skipper={editingSkipperData.skipper}
          skipperIndex={editingSkipperData.index}
          darkMode={darkMode}
          onClose={() => setEditingSkipperData(null)}
          onSave={(updatedSkipper) => {
            if (onSaveSkipper) {
              onSaveSkipper(editingSkipperData.index, updatedSkipper);
            }
            setEditingSkipperData(null);
          }}
        />
      )}
    </>
  );
};

// Inline Skipper Edit Modal Component
interface SkipperEditModalProps {
  skipper: Skipper;
  skipperIndex: number;
  darkMode: boolean;
  onClose: () => void;
  onSave: (updatedSkipper: Skipper) => void;
}

const SkipperEditModal: React.FC<SkipperEditModalProps> = ({
  skipper,
  darkMode,
  onClose,
  onSave
}) => {
  const [editedSkipper, setEditedSkipper] = useState<Skipper>(skipper);
  const isMemberBased = !!skipper.memberId;

  const handleSave = () => {
    onSave(editedSkipper);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
      <div
        className={`w-full max-w-2xl rounded-2xl shadow-2xl ${
          darkMode ? 'bg-slate-800' : 'bg-white'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-8 py-6 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <h2 className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
            {isMemberBased ? 'Complete Skipper Information' : 'Edit Skipper'}
          </h2>
        </div>

        {/* Content */}
        <div className="px-8 py-6 space-y-6">
          {!isMemberBased && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Skipper Name *
              </label>
              <input
                type="text"
                value={editedSkipper.name}
                onChange={(e) => setEditedSkipper({...editedSkipper, name: e.target.value})}
                className={`w-full px-4 py-3 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-700 border-slate-600 text-slate-100'
                    : 'bg-white border-slate-300 text-slate-900'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                placeholder="Enter skipper name"
              />
            </div>
          )}

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Sail Number *
            </label>
            <input
              type="text"
              value={editedSkipper.sailNo}
              onChange={(e) => setEditedSkipper({...editedSkipper, sailNo: e.target.value})}
              className={`w-full px-4 py-3 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-slate-100'
                  : 'bg-white border-slate-300 text-slate-900'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="Enter sail number"
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Boat Design (Hull) *
            </label>
            <input
              type="text"
              value={editedSkipper.boatModel}
              onChange={(e) => setEditedSkipper({...editedSkipper, boatModel: e.target.value})}
              className={`w-full px-4 py-3 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-slate-100'
                  : 'bg-white border-slate-300 text-slate-900'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="Enter boat design (e.g., Trance, B6)"
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Club *
            </label>
            <input
              type="text"
              value={editedSkipper.club}
              onChange={(e) => setEditedSkipper({...editedSkipper, club: e.target.value})}
              className={`w-full px-4 py-3 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-slate-100'
                  : 'bg-white border-slate-300 text-slate-900'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="Enter club name"
            />
          </div>

          {isMemberBased && (
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              This information will be saved to the member's profile and used for all future events.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className={`px-8 py-6 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'} flex justify-end gap-3`}>
          <button
            onClick={onClose}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              darkMode
                ? 'text-slate-300 hover:bg-slate-700'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            {isMemberBased ? 'Save Information' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

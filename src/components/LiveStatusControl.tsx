import React, { useState, useEffect } from 'react';
import { Flag, Pause, CheckCircle, Circle } from 'lucide-react';
import { updateRaceStatus, getRaceStatus, subscribeToRaceStatus, RaceStatus } from '../utils/liveTrackingStorage';

interface LiveStatusControlProps {
  eventId: string;
  darkMode?: boolean;
}

export const LiveStatusControl: React.FC<LiveStatusControlProps> = ({ eventId, darkMode = false }) => {
  const [currentStatus, setCurrentStatus] = useState<RaceStatus>('on_hold');
  const [isOpen, setIsOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadCurrentStatus();

    // Subscribe to real-time status changes
    const unsubscribe = subscribeToRaceStatus(eventId, (newStatus) => {
      setCurrentStatus(newStatus);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [eventId]);

  const loadCurrentStatus = async () => {
    const statusData = await getRaceStatus(eventId);
    if (statusData) {
      setCurrentStatus(statusData.status);
    }
  };

  const handleStatusChange = async (newStatus: RaceStatus) => {
    setUpdating(true);
    try {
      const success = await updateRaceStatus(eventId, newStatus);
      if (success) {
        setCurrentStatus(newStatus);
        setIsOpen(false);
      }
    } finally {
      setUpdating(false);
    }
  };

  const statusOptions: Array<{ value: RaceStatus; label: string; icon: React.ReactNode; color: string }> = [
    {
      value: 'live',
      label: 'Live Racing',
      icon: <Flag size={16} />,
      color: 'bg-green-500 hover:bg-green-600'
    },
    {
      value: 'on_hold',
      label: 'On Hold',
      icon: <Pause size={16} />,
      color: 'bg-amber-500 hover:bg-amber-600'
    },
    {
      value: 'completed_for_day',
      label: 'Complete for Day',
      icon: <CheckCircle size={16} />,
      color: 'bg-blue-500 hover:bg-blue-600'
    },
    {
      value: 'event_complete',
      label: 'Event Complete',
      icon: <Circle size={16} />,
      color: 'bg-purple-500 hover:bg-purple-600'
    },
  ];

  const currentOption = statusOptions.find(opt => opt.value === currentStatus);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={updating}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all shadow-md ${
          currentOption?.color || 'bg-slate-500 hover:bg-slate-600'
        } text-white ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {currentOption?.icon}
        <span className="text-sm">Race Status: {currentOption?.label}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className={`absolute top-full mt-2 left-0 w-64 rounded-lg shadow-xl z-20 overflow-hidden ${
            darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'
          }`}>
            <div className={`px-3 py-2 text-xs font-semibold ${
              darkMode ? 'text-slate-400 bg-slate-900/50' : 'text-slate-600 bg-slate-50'
            }`}>
              Update Race Status
            </div>
            <div className="p-2 space-y-1">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleStatusChange(option.value)}
                  disabled={updating || currentStatus === option.value}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    currentStatus === option.value
                      ? darkMode
                        ? 'bg-slate-700/50 text-white ring-2 ring-slate-600'
                        : 'bg-slate-100 text-slate-900 ring-2 ring-slate-300'
                      : darkMode
                      ? 'hover:bg-slate-700 text-slate-300'
                      : 'hover:bg-slate-50 text-slate-700'
                  } ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`p-1.5 rounded ${option.color} text-white`}>
                    {option.icon}
                  </div>
                  <span className="text-sm font-medium">{option.label}</span>
                  {currentStatus === option.value && (
                    <svg className="ml-auto w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            <div className={`px-3 py-2 text-xs ${
              darkMode ? 'text-slate-500 bg-slate-900/50' : 'text-slate-500 bg-slate-50'
            }`}>
              Auto-managed based on scoring activity. Visible to all skippers in live tracking.
            </div>
          </div>
        </>
      )}
    </div>
  );
};

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Users, TriangleAlert as AlertTriangle, UserMinus, UserPlus, ChevronRight, X, Check, RotateCcw } from 'lucide-react';
import { Skipper } from '../types';
import { HeatManagement, HeatDesignation, getAvailableHeats } from '../types/heat';

export interface WithdrawalEntry {
  skipperIndex: number;
  declaredAtRound: number;
  effectiveFromRound: number;
  confirmed: boolean;
}

export interface FleetStatusBadgeProps {
  skippers: Skipper[];
  heatManagement: HeatManagement;
  darkMode: boolean;
  currentRound: number;
  onWithdrawSkipper: (skipperIndex: number) => void;
  onConfirmWithdrawals: () => void;
  onReenterSkipper: (skipperIndex: number) => void;
  onCancelPendingWithdrawal: (skipperIndex: number) => void;
}

export const FleetStatusBadge: React.FC<FleetStatusBadgeProps> = ({
  skippers,
  heatManagement,
  darkMode,
  currentRound,
  onWithdrawSkipper,
  onConfirmWithdrawals,
  onReenterSkipper,
  onCancelPendingWithdrawal
}) => {
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmingReentry, setConfirmingReentry] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          badgeRef.current && !badgeRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
        setConfirmingReentry(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen]);

  const scoringSystem = heatManagement.configuration?.scoringSystem || 'hms';
  const numberOfHeats = heatManagement.configuration?.numberOfHeats || 2;

  const { activeSkippers, withdrawnSkippers, pendingWithdrawals } = useMemo(() => {
    const active: { index: number; skipper: Skipper }[] = [];
    const withdrawn: { index: number; skipper: Skipper; fromRound: number }[] = [];
    const pending: { index: number; skipper: Skipper }[] = [];

    skippers.forEach((skipper, index) => {
      if (skipper.withdrawnFromRace != null) {
        // Check if this is a "pending" withdrawal (declared this round, not yet confirmed for next)
        const isCurrentRoundWithdrawal = skipper.withdrawnFromRace === currentRound;
        // For the Fleet Status, a withdrawal that's already been applied (has auto-DNC in future rounds)
        // is confirmed. A fresh withdrawal in the current round is "pending confirmation for recalculation"
        const hasResultsInFutureRounds = heatManagement.rounds.some(r =>
          r.round > currentRound &&
          r.results.some(res => res.skipperIndex === index && res.letterScore === 'WDN')
        );

        if (isCurrentRoundWithdrawal && !hasResultsInFutureRounds) {
          pending.push({ index, skipper });
        } else {
          withdrawn.push({ index, skipper, fromRound: skipper.withdrawnFromRace });
        }
      } else {
        active.push({ index, skipper });
      }
    });

    return { activeSkippers: active, withdrawnSkippers: withdrawn, pendingWithdrawals: pending };
  }, [skippers, currentRound, heatManagement.rounds]);

  const totalSkippers = skippers.length;
  const activeCount = activeSkippers.length;
  const withdrawnCount = withdrawnSkippers.length;
  const pendingCount = pendingWithdrawals.length;

  const hasPending = pendingCount > 0;
  const hasWithdrawals = withdrawnCount > 0 || pendingCount > 0;

  // Calculate what heat sizes would be after pending withdrawals are confirmed
  const projectedHeatSizes = useMemo(() => {
    if (!hasPending) return null;
    const projectedActive = activeCount - pendingCount;
    const heats = getAvailableHeats(numberOfHeats);
    const baseSize = Math.floor(projectedActive / heats.length);
    const remainder = projectedActive % heats.length;
    return heats.map((heat, i) => ({
      heat,
      size: baseSize + (i < remainder ? 1 : 0)
    }));
  }, [hasPending, activeCount, pendingCount, numberOfHeats]);

  // Badge status color
  const getBadgeStyles = () => {
    if (hasPending) {
      return darkMode
        ? 'bg-amber-900/50 text-amber-300 border-amber-700'
        : 'bg-amber-50 text-amber-700 border-amber-300';
    }
    if (hasWithdrawals) {
      return darkMode
        ? 'bg-slate-700 text-slate-300 border-slate-600'
        : 'bg-slate-100 text-slate-600 border-slate-300';
    }
    return darkMode
      ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
      : 'bg-emerald-50 text-emerald-700 border-emerald-300';
  };

  const getDotColor = () => {
    if (hasPending) return 'bg-amber-500';
    if (hasWithdrawals) return 'bg-slate-400';
    return 'bg-emerald-500';
  };

  return (
    <div className="relative">
      {/* Badge */}
      <button
        ref={badgeRef}
        onClick={() => setPanelOpen(!panelOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${getBadgeStyles()} hover:opacity-80`}
        title="Fleet Status - Click to manage withdrawals"
      >
        <span className={`w-2 h-2 rounded-full ${getDotColor()} ${hasPending ? 'animate-pulse' : ''}`} />
        <span>{activeCount} active</span>
        {hasWithdrawals && (
          <span className="opacity-70">
            , {withdrawnCount + pendingCount} WDN
          </span>
        )}
        {hasPending && (
          <AlertTriangle size={12} className="ml-0.5 text-amber-500" />
        )}
      </button>

      {/* Panel - Fixed overlay to prevent clipping on any screen size */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 sm:pt-24">
          <div
            className="fixed inset-0 bg-black/20"
            onClick={() => { setPanelOpen(false); setConfirmingReentry(null); }}
          />
          <div
            ref={panelRef}
            className={`relative w-full max-w-md max-h-[70vh] overflow-y-auto rounded-xl shadow-2xl border z-50 ${
              darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
            }`}
          >
          {/* Panel Header */}
          <div className={`sticky top-0 px-4 py-3 border-b flex items-center justify-between ${
            darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-2">
              <Users size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
              <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Fleet Roster
              </h3>
            </div>
            <button
              onClick={() => { setPanelOpen(false); setConfirmingReentry(null); }}
              className={`p-1 rounded-md ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
            >
              <X size={16} />
            </button>
          </div>

          {/* Summary Stats */}
          <div className={`px-4 py-3 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className="grid grid-cols-3 gap-3">
              <div className={`text-center p-2 rounded-lg ${darkMode ? 'bg-emerald-900/30' : 'bg-emerald-50'}`}>
                <div className={`text-lg font-bold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  {activeCount}
                </div>
                <div className={`text-xs ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>Active</div>
              </div>
              <div className={`text-center p-2 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <div className={`text-lg font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {withdrawnCount}
                </div>
                <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Withdrawn</div>
              </div>
              <div className={`text-center p-2 rounded-lg ${hasPending ? (darkMode ? 'bg-amber-900/30' : 'bg-amber-50') : (darkMode ? 'bg-slate-700' : 'bg-slate-100')}`}>
                <div className={`text-lg font-bold ${hasPending ? (darkMode ? 'text-amber-300' : 'text-amber-700') : (darkMode ? 'text-slate-300' : 'text-slate-700')}`}>
                  {pendingCount}
                </div>
                <div className={`text-xs ${hasPending ? (darkMode ? 'text-amber-400' : 'text-amber-600') : (darkMode ? 'text-slate-400' : 'text-slate-500')}`}>Pending</div>
              </div>
            </div>
          </div>

          {/* Pending Withdrawals Alert */}
          {hasPending && (
            <div className={`px-4 py-3 border-b ${darkMode ? 'bg-amber-900/20 border-slate-700' : 'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className={`text-xs font-medium ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                    {pendingCount} withdrawal{pendingCount > 1 ? 's' : ''} pending confirmation
                  </p>
                  <p className={`text-xs mt-0.5 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                    {scoringSystem === 'hms'
                      ? `Fleet reduces from ${activeCount} to ${activeCount - pendingCount}. Heat sizes will be recalculated.`
                      : `Withdrawn skipper${pendingCount > 1 ? 's' : ''} will be placed in lowest fleet for finals.`
                    }
                  </p>
                  {projectedHeatSizes && scoringSystem === 'hms' && (
                    <div className={`mt-2 text-xs ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                      <span className="font-medium">Projected heat sizes: </span>
                      {projectedHeatSizes.map(h => `${h.heat}=${h.size}`).join(', ')}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      onConfirmWithdrawals();
                      setPanelOpen(false);
                    }}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                  >
                    <Check size={12} />
                    Confirm & Recalculate
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Pending Withdrawal List */}
          {pendingWithdrawals.length > 0 && (
            <div className={`px-4 py-2 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                Pending Withdrawals
              </h4>
              {pendingWithdrawals.map(({ index, skipper }) => (
                <div
                  key={index}
                  className={`flex items-center justify-between py-2 border-b last:border-b-0 ${
                    darkMode ? 'border-slate-700' : 'border-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <UserMinus size={14} className="text-amber-500" />
                    <div>
                      <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {skipper.name}
                      </p>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Sail: {skipper.sailNo}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onCancelPendingWithdrawal(index)}
                    className={`text-xs px-2 py-1 rounded ${
                      darkMode ? 'text-slate-400 hover:bg-slate-700 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                    }`}
                    title="Cancel withdrawal"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Confirmed Withdrawn List */}
          {withdrawnSkippers.length > 0 && (
            <div className={`px-4 py-2 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Withdrawn Skippers
              </h4>
              {withdrawnSkippers.map(({ index, skipper, fromRound }) => (
                <div
                  key={index}
                  className={`flex items-center justify-between py-2 border-b last:border-b-0 ${
                    darkMode ? 'border-slate-700' : 'border-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <UserMinus size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                    <div>
                      <p className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {skipper.name}
                      </p>
                      <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        Sail: {skipper.sailNo} | WDN from R{fromRound}
                      </p>
                    </div>
                  </div>
                  {confirmingReentry === index ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          onReenterSkipper(index);
                          setConfirmingReentry(null);
                        }}
                        className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmingReentry(null)}
                        className={`text-xs px-2 py-1 rounded ${darkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingReentry(index)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
                        darkMode ? 'text-emerald-400 hover:bg-slate-700' : 'text-emerald-600 hover:bg-emerald-50'
                      }`}
                      title="Re-enter skipper"
                    >
                      <RotateCcw size={12} />
                      Re-enter
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Active Skippers - Withdraw Action */}
          <div className="px-4 py-2">
            <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Active Skippers ({activeCount})
            </h4>
            <div className="max-h-48 overflow-y-auto">
              {activeSkippers.map(({ index, skipper }) => (
                <div
                  key={index}
                  className={`flex items-center justify-between py-1.5 border-b last:border-b-0 ${
                    darkMode ? 'border-slate-700/50' : 'border-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      darkMode ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {skipper.sailNo?.slice(0, 3) || '?'}
                    </div>
                    <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {skipper.name}
                    </span>
                  </div>
                  <button
                    onClick={() => onWithdrawSkipper(index)}
                    className={`text-xs px-2 py-1 rounded opacity-60 hover:opacity-100 transition-opacity ${
                      darkMode ? 'text-red-400 hover:bg-red-900/30' : 'text-red-500 hover:bg-red-50'
                    }`}
                    title={`Withdraw ${skipper.name}`}
                  >
                    <UserMinus size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Info */}
          <div className={`px-4 py-2.5 border-t text-xs ${
            darkMode ? 'border-slate-700 text-slate-500 bg-slate-800/50' : 'border-slate-200 text-slate-400 bg-slate-50'
          }`}>
            {scoringSystem === 'hms' ? (
              <p>HMS: Withdrawals affect fleet size and heat allocation for subsequent rounds.</p>
            ) : (
              <p>SHRS Rule 4.2: Withdrawn skippers are placed in the lowest fleet for finals.</p>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
};

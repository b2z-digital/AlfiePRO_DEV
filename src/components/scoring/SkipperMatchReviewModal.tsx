import React, { useState } from 'react';
import { X, Check, UserCheck, UserX, CircleAlert as AlertCircle, Link2 } from 'lucide-react';
import { MatchResult, ReconciliationReport } from '../../utils/skipperMatcher';
import { Member } from '../../types/member';

interface SkipperMatchReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ReconciliationReport;
  onApproveMatch: (skipperId: string, member: Member) => void;
  onRejectMatch: (skipperId: string) => void;
  onApproveAll: () => void;
  darkMode?: boolean;
}

export const SkipperMatchReviewModal: React.FC<SkipperMatchReviewModalProps> = ({
  isOpen,
  onClose,
  report,
  onApproveMatch,
  onRejectMatch,
  onApproveAll,
  darkMode = false,
}) => {
  const [reviewedItems, setReviewedItems] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const handleApprove = (match: MatchResult) => {
    if (match.matchedMember) {
      onApproveMatch(match.skipperId, match.matchedMember);
      setReviewedItems(prev => new Set([...prev, match.skipperId]));
    }
  };

  const handleReject = (match: MatchResult) => {
    onRejectMatch(match.skipperId);
    setReviewedItems(prev => new Set([...prev, match.skipperId]));
  };

  const unreviewedCount = report.needsReview.filter(
    m => !reviewedItems.has(m.skipperId)
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`w-full max-w-lg rounded-xl shadow-xl ${darkMode ? 'bg-slate-800' : 'bg-white'} max-h-[80vh] flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div>
            <h2 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Skipper Matching Review
            </h2>
            <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {report.autoMatched.length} auto-matched, {report.needsReview.length} need review, {report.noMatch.length} unmatched
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Auto-matched summary */}
          {report.autoMatched.length > 0 && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${darkMode ? 'bg-emerald-900/20 border border-emerald-800/30' : 'bg-emerald-50 border border-emerald-100'}`}>
              <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span className={`text-sm ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                {report.autoMatched.length} skipper{report.autoMatched.length !== 1 ? 's' : ''} automatically matched to club members
              </span>
            </div>
          )}

          {/* Items needing review */}
          {report.needsReview.length > 0 && (
            <div className="space-y-2">
              <h3 className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Needs your confirmation:
              </h3>
              {report.needsReview.map((match) => {
                const isReviewed = reviewedItems.has(match.skipperId);
                return (
                  <div
                    key={match.skipperId}
                    className={`p-3 rounded-lg border transition-all ${
                      isReviewed
                        ? darkMode
                          ? 'bg-slate-800/50 border-slate-700 opacity-50'
                          : 'bg-slate-50 border-slate-200 opacity-50'
                        : darkMode
                          ? 'bg-slate-700/50 border-slate-600'
                          : 'bg-white border-slate-200 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          <span className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {match.skipperName}
                            {match.skipperSailNumber && (
                              <span className="opacity-60 ml-1">(Sail {match.skipperSailNumber})</span>
                            )}
                          </span>
                        </div>
                        {match.matchedMember && (
                          <div className="flex items-center gap-1.5 mt-1.5 ml-5">
                            <Link2 className="w-3 h-3 text-blue-400" />
                            <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {match.reason}
                            </span>
                          </div>
                        )}
                      </div>

                      {!isReviewed && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleApprove(match)}
                            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                            title="Link to this member"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleReject(match)}
                            className="p-1.5 rounded-lg bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 transition-colors"
                            title="Keep as guest"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {isReviewed && (
                        <span className={`text-xs px-2 py-0.5 rounded ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                          Done
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Unmatched skippers */}
          {report.noMatch.length > 0 && (
            <div className="space-y-2">
              <h3 className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                No match found (kept as guest):
              </h3>
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-700/30' : 'bg-slate-50'}`}>
                <div className="flex flex-wrap gap-2">
                  {report.noMatch.map(match => (
                    <span
                      key={match.skipperId}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-200 text-slate-600'}`}
                    >
                      <UserX className="w-3 h-3" />
                      {match.skipperName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-5 py-3 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Results are preserved regardless of matching.
          </p>
          <div className="flex gap-2">
            {unreviewedCount > 0 && (
              <button
                onClick={onApproveAll}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
              >
                Accept All Suggestions
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

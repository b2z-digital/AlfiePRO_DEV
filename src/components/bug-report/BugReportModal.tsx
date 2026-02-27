import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Bug, AlertTriangle, Send, Monitor, Layers, Zap, Database, Eye } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface BugReportModalProps {
  darkMode: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-blue-500', description: 'Minor cosmetic issue' },
  { value: 'medium', label: 'Medium', color: 'bg-amber-500', description: 'Functionality impacted' },
  { value: 'high', label: 'High', color: 'bg-orange-500', description: 'Major feature broken' },
  { value: 'critical', label: 'Critical', color: 'bg-red-500', description: 'System unusable' },
];

const CATEGORY_OPTIONS = [
  { value: 'ui', label: 'UI / Visual', icon: Eye },
  { value: 'functionality', label: 'Functionality', icon: Zap },
  { value: 'performance', label: 'Performance', icon: Layers },
  { value: 'data', label: 'Data / Database', icon: Database },
  { value: 'other', label: 'Other', icon: Monitor },
];

export const BugReportModal: React.FC<BugReportModalProps> = ({ darkMode, onClose, onSubmitted }) => {
  const { user, currentClub, currentOrganization } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [category, setCategory] = useState('functionality');
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1);

  const getBrowserInfo = () => {
    const ua = navigator.userAgent;
    const screenRes = `${window.screen.width}x${window.screen.height}`;
    const viewportSize = `${window.innerWidth}x${window.innerHeight}`;
    return `${ua} | Screen: ${screenRes} | Viewport: ${viewportSize}`;
  };

  const handleSubmit = async () => {
    if (!title.trim() || !user) return;
    setSubmitting(true);

    try {
      const clubName = currentClub?.clubName || currentOrganization?.name || '';
      const profile = user.user_metadata;

      const { error } = await supabase.from('bug_reports').insert({
        title: title.trim(),
        description: description.trim(),
        steps_to_reproduce: stepsToReproduce.trim(),
        severity,
        category,
        page_url: window.location.href,
        browser_info: getBrowserInfo(),
        user_agent: navigator.userAgent,
        reported_by: user.id,
        reporter_name: profile?.full_name || profile?.first_name || user.email || '',
        reporter_email: user.email || '',
        reporter_club: clubName,
      });

      if (error) throw error;
      onSubmitted();
    } catch (err) {
      console.error('Failed to submit bug report:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = step === 1 ? title.trim().length > 0 : true;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${
        darkMode ? 'bg-slate-800' : 'bg-white'
      }`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Bug className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Report a Bug
              </h2>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Step {step} of 2
              </p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${
            darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
          }`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 px-6 pt-4">
          <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${
            step >= 1 ? 'bg-red-500' : darkMode ? 'bg-slate-700' : 'bg-slate-200'
          }`} />
          <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${
            step >= 2 ? 'bg-red-500' : darkMode ? 'bg-slate-700' : 'bg-slate-200'
          }`} />
        </div>

        <div className="p-6 space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Bug Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Brief summary of the issue..."
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                    darkMode
                      ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500 focus:border-red-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-red-500'
                  } focus:outline-none focus:ring-2 focus:ring-red-500/20`}
                  autoFocus
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1.5 ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What happened? What did you expect to happen?"
                  rows={3}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-colors resize-none ${
                    darkMode
                      ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500 focus:border-red-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-red-500'
                  } focus:outline-none focus:ring-2 focus:ring-red-500/20`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1.5 ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Steps to Reproduce
                </label>
                <textarea
                  value={stepsToReproduce}
                  onChange={e => setStepsToReproduce(e.target.value)}
                  placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                  rows={3}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-colors resize-none ${
                    darkMode
                      ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500 focus:border-red-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-red-500'
                  } focus:outline-none focus:ring-2 focus:ring-red-500/20`}
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Severity
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SEVERITY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSeverity(opt.value)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                        severity === opt.value
                          ? darkMode
                            ? 'border-red-500 bg-red-500/10'
                            : 'border-red-500 bg-red-50'
                          : darkMode
                            ? 'border-slate-700 hover:border-slate-600 bg-slate-700/30'
                            : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full ${opt.color}`} />
                      <div>
                        <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {opt.label}
                        </div>
                        <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {opt.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setCategory(opt.value)}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm transition-all ${
                          category === opt.value
                            ? darkMode
                              ? 'border-red-500 bg-red-500/10 text-red-400'
                              : 'border-red-500 bg-red-50 text-red-600'
                            : darkMode
                              ? 'border-slate-700 text-slate-400 hover:border-slate-600'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`flex items-start gap-2 p-3 rounded-xl ${
                darkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'
              }`}>
                <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                  darkMode ? 'text-amber-400' : 'text-amber-600'
                }`} />
                <p className={`text-xs ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                  Page URL and browser info will be automatically captured to help diagnose the issue.
                </p>
              </div>
            </>
          )}
        </div>

        <div className={`flex items-center justify-between px-6 py-4 border-t ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          {step === 1 ? (
            <>
              <button
                onClick={onClose}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!canProceed}
                className="px-5 py-2 rounded-xl text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(1)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bug, X } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { BugReportModal } from './BugReportModal';
import { BugReportList } from './BugReportList';

interface BugReportButtonProps {
  darkMode: boolean;
}

export const BugReportButton: React.FC<BugReportButtonProps> = ({ darkMode }) => {
  const { user, isSuperAdmin } = useAuth();
  const [showPanel, setShowPanel] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadOpenCount();
  }, [user]);

  const loadOpenCount = async () => {
    if (!user) return;
    const query = supabase
      .from('bug_reports')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']);

    if (!isSuperAdmin) {
      query.eq('reported_by', user.id);
    }

    const { count } = await query;
    setOpenCount(count || 0);
  };

  const handleNewReport = () => {
    setShowPanel(false);
    setShowSubmitModal(true);
  };

  const handleReportSubmitted = () => {
    setShowSubmitModal(false);
    setPulse(true);
    setTimeout(() => setPulse(false), 1000);
    loadOpenCount();
  };

  return createPortal(
    <>
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={`fixed bottom-6 right-6 z-[9990] w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 group ${
          showPanel
            ? 'bg-slate-600 hover:bg-slate-700 rotate-0'
            : 'bg-red-500 hover:bg-red-600'
        } ${pulse ? 'animate-bounce' : ''}`}
        title="Bug Report"
      >
        {showPanel ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <>
            <Bug className="w-6 h-6 text-white" />
            {openCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {openCount > 9 ? '9+' : openCount}
              </span>
            )}
          </>
        )}
      </button>

      {showPanel && (
        <BugReportList
          darkMode={darkMode}
          onClose={() => setShowPanel(false)}
          onNewReport={handleNewReport}
          onRefresh={loadOpenCount}
        />
      )}

      {showSubmitModal && (
        <BugReportModal
          darkMode={darkMode}
          onClose={() => setShowSubmitModal(false)}
          onSubmitted={handleReportSubmitted}
        />
      )}
    </>,
    document.body
  );
};

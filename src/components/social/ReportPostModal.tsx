import React, { useState } from 'react';
import { X, Flag, AlertTriangle, Ban, MessageSquare, HelpCircle, ShieldAlert, Check } from 'lucide-react';
import { socialStorage } from '../../utils/socialStorage';

const REPORT_REASONS = [
  { id: 'offensive', label: 'Offensive Content', icon: AlertTriangle, description: 'Contains hateful or abusive language' },
  { id: 'spam', label: 'Spam', icon: Ban, description: 'Unsolicited advertising or repetitive content' },
  { id: 'harassment', label: 'Harassment', icon: ShieldAlert, description: 'Targeting or bullying another person' },
  { id: 'misinformation', label: 'Misinformation', icon: MessageSquare, description: 'Contains false or misleading information' },
  { id: 'inappropriate', label: 'Inappropriate', icon: Flag, description: 'Not suitable for the community' },
  { id: 'other', label: 'Other', icon: HelpCircle, description: 'Something else not listed above' },
] as const;

interface ReportPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  clubId?: string;
  groupId?: string;
  darkMode?: boolean;
  onReported?: () => void;
}

export default function ReportPostModal({ isOpen, onClose, postId, clubId, groupId, darkMode = false, onReported }: ReportPostModalProps) {
  const lightMode = !darkMode;
  const [selectedReason, setSelectedReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) return;
    setSubmitting(true);
    try {
      await socialStorage.reportPost(postId, selectedReason, details, clubId, groupId);
      setSubmitted(true);
      onReported?.();
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error) {
      console.error('Error reporting post:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedReason('');
    setDetails('');
    setSubmitted(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="bg-gradient-to-r from-red-600 to-orange-600 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Flag className="w-5 h-5 text-white" />
            <h2 className="text-lg font-bold text-white">Report Post</h2>
          </div>
          <button onClick={handleClose} className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all">
            <X size={18} />
          </button>
        </div>

        <div className={`p-5 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
          {submitted ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Report Submitted</h3>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Thank you for helping keep the community safe. Club admins will review this report.
              </p>
            </div>
          ) : (
            <>
              <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Why are you reporting this post? Select a reason below.
              </p>

              <div className="space-y-2 mb-4">
                {REPORT_REASONS.map(reason => {
                  const Icon = reason.icon;
                  return (
                    <button
                      key={reason.id}
                      onClick={() => setSelectedReason(reason.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        selectedReason === reason.id
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : darkMode
                          ? 'border-slate-600 hover:border-slate-500 text-slate-300'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <Icon className={`w-5 h-5 flex-shrink-0 ${selectedReason === reason.id ? 'text-red-500' : darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                      <div>
                        <div className={`text-sm font-medium ${selectedReason === reason.id ? 'text-red-700' : ''}`}>{reason.label}</div>
                        <div className={`text-xs ${selectedReason === reason.id ? 'text-red-500' : darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{reason.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedReason && (
                <div className="mb-4">
                  <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    Additional details (optional)
                  </label>
                  <textarea
                    value={details}
                    onChange={e => setDetails(e.target.value)}
                    placeholder="Provide more context about your report..."
                    rows={3}
                    className={`w-full px-3 py-2 rounded-lg border text-sm resize-none focus:ring-2 focus:ring-red-500 ${
                      darkMode ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-400' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!selectedReason || submitting}
                  className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

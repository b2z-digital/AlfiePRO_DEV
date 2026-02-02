import React, { useState } from 'react';
import { X, Archive, Check } from 'lucide-react';
import { Member } from '../types/member';

interface ArchiveMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (removeAuthAccess: boolean, reason?: string) => void | Promise<void>;
  member: Member | null;
  darkMode: boolean;
}

export const ArchiveMemberModal: React.FC<ArchiveMemberModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  member,
  darkMode
}) => {
  const [removeAuthAccess, setRemoveAuthAccess] = useState(false);
  const [reason, setReason] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);

  if (!isOpen || !member) return null;

  const handleConfirm = async () => {
    setIsArchiving(true);
    await onConfirm(removeAuthAccess, reason || undefined);
    setIsArchiving(false);
    setRemoveAuthAccess(false);
    setReason('');
  };

  const handleClose = () => {
    if (!isArchiving) {
      setRemoveAuthAccess(false);
      setReason('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-lg rounded-xl shadow-xl overflow-hidden
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700 bg-blue-900/20' : 'border-slate-200 bg-blue-50'}
        `}>
          <div className="flex items-center gap-3">
            <Archive className="text-blue-500" size={24} />
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
              Archive Member
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isArchiving}
            className={`
              rounded-full p-2 transition-colors
              ${darkMode
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
              ${isArchiving ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className={`text-base font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
            Archive {member.first_name} {member.last_name}?
          </p>

          <div className={`
            p-4 rounded-lg space-y-2
            ${darkMode ? 'bg-green-900/20 border border-green-900/30' : 'bg-green-50 border border-green-200'}
          `}>
            <div className="flex items-start gap-2">
              <Check className={`flex-shrink-0 mt-0.5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} size={16} />
              <p className={`text-sm font-medium ${darkMode ? 'text-green-300' : 'text-green-800'}`}>
                All data will be preserved:
              </p>
            </div>
            <ul className={`text-sm space-y-1 ml-6 list-disc ${darkMode ? 'text-green-400/80' : 'text-green-700/80'}`}>
              <li>Race results and history</li>
              <li>Payment records</li>
              <li>Boats and equipment</li>
              <li>Attendance records</li>
              <li>All historical data</li>
            </ul>
          </div>

          <div className={`
            p-4 rounded-lg
            ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
          `}>
            <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              Archiving will:
            </p>
            <ul className={`text-sm space-y-1 mt-2 ml-4 list-disc ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              <li>Hide member from active member lists</li>
              <li>Preserve all historical records</li>
              <li>Allow restoration later if needed</li>
            </ul>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Reason for archiving (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isArchiving}
              placeholder="e.g., Membership expired, Moved clubs, etc."
              rows={2}
              className={`
                w-full px-3 py-2 rounded-lg border text-sm
                ${darkMode
                  ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}
                ${isArchiving ? 'opacity-50 cursor-not-allowed' : ''}
                focus:outline-none focus:ring-2 focus:ring-blue-500
              `}
            />
          </div>

          {member.user_id && (
            <div className={`
              p-4 rounded-lg border
              ${darkMode ? 'bg-amber-900/20 border-amber-900/30' : 'bg-amber-50 border-amber-200'}
            `}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeAuthAccess}
                  onChange={(e) => setRemoveAuthAccess(e.target.checked)}
                  disabled={isArchiving}
                  className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                    Also remove authentication access
                  </p>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-amber-400/80' : 'text-amber-700/80'}`}>
                    Their login account will be deleted only if they have no other active club memberships.
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>

        <div className={`
          flex justify-end gap-3 p-6 border-t
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <button
            onClick={handleClose}
            disabled={isArchiving}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${darkMode
                ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
              ${isArchiving ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isArchiving}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${isArchiving
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'}
              text-white
            `}
          >
            {isArchiving ? 'Archiving...' : 'Archive Member'}
          </button>
        </div>
      </div>
    </div>
  );
};

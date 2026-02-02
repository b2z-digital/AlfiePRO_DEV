import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Member } from '../types/member';

interface DeleteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (deleteAuthUser: boolean) => void | Promise<void>;
  member: Member | null;
  darkMode: boolean;
}

export const DeleteMemberModal: React.FC<DeleteMemberModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  member,
  darkMode
}) => {
  const [deleteAuthUser, setDeleteAuthUser] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !member) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    await onConfirm(deleteAuthUser);
    setIsDeleting(false);
    setDeleteAuthUser(false);
  };

  const handleClose = () => {
    if (!isDeleting) {
      setDeleteAuthUser(false);
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
          ${darkMode ? 'border-slate-700 bg-red-900/20' : 'border-slate-200 bg-red-50'}
        `}>
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-red-500" size={24} />
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
              Delete Member
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className={`
              rounded-full p-2 transition-colors
              ${darkMode
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
              ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className={`text-base font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
            Are you sure you want to delete {member.first_name} {member.last_name}?
          </p>

          <div className={`
            p-4 rounded-lg space-y-2
            ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
          `}>
            <p className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              This will permanently remove:
            </p>
            <ul className={`text-sm space-y-1 ml-4 list-disc ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              <li>Member record</li>
              <li>All boats</li>
              <li>Invitations</li>
              <li>Attendance records</li>
              <li>Payment history</li>
            </ul>
          </div>

          {member.user_id && (
            <div className={`
              p-4 rounded-lg border
              ${darkMode ? 'bg-amber-900/20 border-amber-900/30' : 'bg-amber-50 border-amber-200'}
            `}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteAuthUser}
                  onChange={(e) => setDeleteAuthUser(e.target.checked)}
                  disabled={isDeleting}
                  className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                    Also delete authentication account
                  </p>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-amber-400/80' : 'text-amber-700/80'}`}>
                    The account will only be deleted if they have no other club memberships.
                  </p>
                </div>
              </label>
            </div>
          )}

          <p className={`text-sm ${darkMode ? 'text-red-400' : 'text-red-600'} font-medium`}>
            This action cannot be undone.
          </p>
        </div>

        <div className={`
          flex justify-end gap-3 p-6 border-t
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${darkMode
                ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
              ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${isDeleting
                ? 'bg-red-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700'}
              text-white
            `}
          >
            {isDeleting ? 'Deleting...' : 'Delete Member'}
          </button>
        </div>
      </div>
    </div>
  );
};

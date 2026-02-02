import React from 'react';
import { X } from 'lucide-react';

interface CodeOfConductModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  clubName: string;
  darkMode: boolean;
}

export const CodeOfConductModal: React.FC<CodeOfConductModalProps> = ({
  isOpen,
  onClose,
  content,
  clubName,
  darkMode
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-3xl rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <h2 className={`text-xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
            {clubName} - Code of Conduct
          </h2>
          <button
            onClick={onClose}
            className={`
              rounded-full p-2 transition-colors
              ${darkMode 
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
            `}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div 
            className={`prose ${darkMode ? 'prose-invert' : ''} max-w-none`}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>

        <div className={`
          flex justify-end gap-3 p-6 border-t
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <button
            onClick={onClose}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${darkMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'}
            `}
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};
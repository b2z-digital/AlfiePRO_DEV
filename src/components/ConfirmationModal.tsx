import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  darkMode: boolean;
  variant?: 'default' | 'danger';
  onAlternative?: () => void | Promise<void>;
  alternativeText?: string;
  alternativeVariant?: 'default' | 'warning';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  darkMode,
  variant = 'default',
  onAlternative,
  alternativeText,
  alternativeVariant = 'warning'
}) => {
  if (!isOpen) return null;

  const handleConfirm = async () => {
    console.log('ConfirmationModal: handleConfirm called, invoking onConfirm()');
    await onConfirm();
    console.log('ConfirmationModal: onConfirm completed');
  };

  const handleAlternative = async () => {
    if (onAlternative) {
      console.log('ConfirmationModal: handleAlternative called');
      await onAlternative();
      console.log('ConfirmationModal: onAlternative completed');
    }
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className={`
        w-full max-w-md rounded-xl shadow-xl overflow-hidden
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <h2 className={`text-xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
            {title}
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

        <div className="p-6">
          <p className={`text-base ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            {message}
          </p>
        </div>

        <div className={`
          flex ${onAlternative ? 'justify-between' : 'justify-end'} gap-3 p-6 border-t
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          {onAlternative && alternativeText && (
            <button
              onClick={handleAlternative}
              className={`px-4 py-2 text-white rounded-lg font-medium transition-colors ${
                alternativeVariant === 'warning'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-slate-600 hover:bg-slate-700'
              }`}
            >
              {alternativeText}
            </button>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className={`
                px-4 py-2 rounded-lg font-medium transition-colors
                ${darkMode
                  ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
              `}
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              className={`px-4 py-2 text-white rounded-lg font-medium transition-colors ${
                variant === 'danger'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
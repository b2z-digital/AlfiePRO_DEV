import React, { useEffect } from 'react';

export interface KeyboardShortcuts {
  onCompose?: () => void;
  onReply?: () => void;
  onDelete?: () => void;
  onStar?: () => void;
  onArchive?: () => void;
  onSearch?: () => void;
  onEscape?: () => void;
  onSelectNext?: () => void;
  onSelectPrevious?: () => void;
  onOpenSelected?: () => void;
  onShowHelp?: () => void;
}

export const useKeyboardShortcuts = (shortcuts: KeyboardShortcuts) => {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).contentEditable === 'true'
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;

      // Handle shortcuts
      switch (key) {
        case 'c':
          if (!ctrl) {
            e.preventDefault();
            shortcuts.onCompose?.();
          }
          break;

        case 'r':
          if (!ctrl) {
            e.preventDefault();
            shortcuts.onReply?.();
          }
          break;

        case 'delete':
        case 'backspace':
          if (!ctrl && e.target === document.body) {
            e.preventDefault();
            shortcuts.onDelete?.();
          }
          break;

        case 's':
          if (!ctrl) {
            e.preventDefault();
            shortcuts.onStar?.();
          }
          break;

        case 'e':
          if (!ctrl) {
            e.preventDefault();
            shortcuts.onArchive?.();
          }
          break;

        case '/':
          e.preventDefault();
          shortcuts.onSearch?.();
          break;

        case 'escape':
          shortcuts.onEscape?.();
          break;

        case 'arrowdown':
        case 'j':
          if (!ctrl) {
            e.preventDefault();
            shortcuts.onSelectNext?.();
          }
          break;

        case 'arrowup':
        case 'k':
          if (!ctrl) {
            e.preventDefault();
            shortcuts.onSelectPrevious?.();
          }
          break;

        case 'enter':
          if (!ctrl) {
            e.preventDefault();
            shortcuts.onOpenSelected?.();
          }
          break;

        case '?':
          if (e.shiftKey) {
            e.preventDefault();
            shortcuts.onShowHelp?.();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [shortcuts]);
};

export const KeyboardShortcutsHelp: React.FC<{ onClose: () => void; darkMode?: boolean }> = ({
  onClose,
  darkMode = true,
}) => {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl rounded-xl shadow-xl p-6 ${
          darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold text-white mb-6">Keyboard Shortcuts</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-blue-400 mb-2">Actions</h3>
            <ShortcutItem shortcut="C" description="Compose new message" />
            <ShortcutItem shortcut="R" description="Reply to message" />
            <ShortcutItem shortcut="S" description="Star/unstar message" />
            <ShortcutItem shortcut="E" description="Archive message" />
            <ShortcutItem shortcut="Del" description="Delete message" />
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-blue-400 mb-2">Navigation</h3>
            <ShortcutItem shortcut="↓ or J" description="Select next" />
            <ShortcutItem shortcut="↑ or K" description="Select previous" />
            <ShortcutItem shortcut="Enter" description="Open selected" />
            <ShortcutItem shortcut="/" description="Focus search" />
            <ShortcutItem shortcut="Esc" description="Close dialog" />
            <ShortcutItem shortcut="?" description="Show this help" />
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Got it!
        </button>
      </div>
    </div>
  );
};

const ShortcutItem: React.FC<{ shortcut: string; description: string }> = ({
  shortcut,
  description,
}) => {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-300 text-sm">{description}</span>
      <kbd className="px-2 py-1 text-xs font-semibold bg-slate-700 text-slate-300 rounded border border-slate-600">
        {shortcut}
      </kbd>
    </div>
  );
};

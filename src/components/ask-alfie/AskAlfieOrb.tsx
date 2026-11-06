import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AskAlfieChatPanel } from './AskAlfieChatPanel';
import { AlfieMark } from '../brand/AlfieMark';

interface AskAlfieOrbProps {
  darkMode: boolean;
}

export const AskAlfieOrb: React.FC<AskAlfieOrbProps> = ({ darkMode }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [orbKey, setOrbKey] = useState(0);
  const handleToggle = () => {
    if (!isOpen) {
      setOrbKey(prev => prev + 1);
    }
    setIsOpen(!isOpen);
    if (!hasInteracted) setHasInteracted(true);
  };

  if (!user) return null;

  return createPortal(
    <>
      <button
        onClick={handleToggle}
        className={`fixed bottom-6 right-6 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 ${
          isOpen ? 'w-14 h-14 bg-slate-700 hover:bg-slate-600 z-[9990]' : 'w-[68px] h-[68px] z-40'
        }`}
        title="Ask Alfie"
        style={!isOpen ? { background: 'transparent', filter: 'drop-shadow(0 10px 24px rgba(138, 77, 255, 0.35))' } : undefined}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <AlfieMark size={60} className="cursor-pointer" />
        )}
      </button>

      {!isOpen && !hasInteracted && (
        <div className="fixed bottom-[6.5rem] right-6 z-40 animate-fade-in">
          <div className={`alfie-orb-label px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg ${
            darkMode ? 'bg-slate-700 text-cyan-300 border border-slate-600' : 'bg-white text-sky-600 border border-sky-200'
          }`}>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
            Ask Alfie
          </div>
        </div>
      )}

      {isOpen && (
        <AskAlfieChatPanel
          key={orbKey}
          darkMode={darkMode}
          onClose={() => setIsOpen(false)}
        />
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-[9988]"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>,
    document.body
  );
};

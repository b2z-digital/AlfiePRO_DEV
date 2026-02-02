import React, { useState, useRef, useEffect } from 'react';
import { FileText, ChevronDown } from 'lucide-react';

interface CreateReportSplitButtonProps {
  onGenerateSocialReport: () => void;
  onGenerateRaceReport: () => void;
  darkMode?: boolean;
}

export const CreateReportSplitButton: React.FC<CreateReportSplitButtonProps> = ({
  onGenerateSocialReport,
  onGenerateRaceReport,
  darkMode = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex">
        <button
          onClick={onGenerateRaceReport}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-l-lg transition-colors
            ${darkMode
              ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
            }
          `}
        >
          <FileText size={18} />
          Create Race Report
        </button>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            px-2 py-2 rounded-r-lg border-l transition-colors
            ${darkMode
              ? 'bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600'
              : 'bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600'
            }
          `}
        >
          <ChevronDown size={18} />
        </button>
      </div>

      {isOpen && (
        <div
          className={`
            absolute right-0 mt-2 w-64 rounded-lg shadow-lg z-50
            ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
          `}
        >
          <button
            onClick={() => {
              onGenerateRaceReport();
              setIsOpen(false);
            }}
            className={`
              w-full text-left px-4 py-3 rounded-t-lg transition-colors flex items-center gap-2
              ${darkMode
                ? 'hover:bg-slate-700 text-white'
                : 'hover:bg-slate-50 text-slate-900'
              }
            `}
          >
            <FileText size={18} />
            <div>
              <div className="font-medium">Generate Race Report</div>
              <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Create and save a detailed race report
              </div>
            </div>
          </button>
          <button
            onClick={() => {
              onGenerateSocialReport();
              setIsOpen(false);
            }}
            className={`
              w-full text-left px-4 py-3 rounded-b-lg transition-colors flex items-center gap-2
              ${darkMode
                ? 'hover:bg-slate-700 text-white'
                : 'hover:bg-slate-50 text-slate-900'
              }
            `}
          >
            <FileText size={18} />
            <div>
              <div className="font-medium">Generate Social Media Post</div>
              <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Create a post for Facebook with media
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

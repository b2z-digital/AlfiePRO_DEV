import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ColumnLayout {
  id: string;
  name: string;
  columns: number[];
  preview: React.ReactNode;
}

interface Props {
  onSelect: (layout: number[]) => void;
  onClose: () => void;
  darkMode?: boolean;
}

const layouts: ColumnLayout[] = [
  { id: '1', name: 'Full Width', columns: [100], preview: <div className="flex gap-2 h-16"><div className="flex-1 bg-teal-500/80 rounded" /></div> },
  { id: '2-equal', name: 'Two Equal', columns: [50, 50], preview: <div className="flex gap-2 h-16"><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /></div> },
  { id: '3-equal', name: 'Three Equal', columns: [33.33, 33.33, 33.34], preview: <div className="flex gap-2 h-16"><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /></div> },
  { id: '4-equal', name: 'Four Equal', columns: [25, 25, 25, 25], preview: <div className="flex gap-2 h-16"><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /></div> },
  { id: '5-equal', name: 'Five Equal', columns: [20, 20, 20, 20, 20], preview: <div className="flex gap-2 h-16"><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /></div> },
  { id: '6-equal', name: 'Six Equal', columns: [16.66, 16.66, 16.67, 16.67, 16.67, 16.67], preview: <div className="flex gap-2 h-16"><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /></div> },
  { id: '2-66-33', name: '2/3 - 1/3', columns: [66.66, 33.34], preview: <div className="flex gap-2 h-16"><div className="flex-[2] bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /></div> },
  { id: '2-33-66', name: '1/3 - 2/3', columns: [33.33, 66.67], preview: <div className="flex gap-2 h-16"><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-[2] bg-teal-500/80 rounded" /></div> },
  { id: '2-75-25', name: '3/4 - 1/4', columns: [75, 25], preview: <div className="flex gap-2 h-16"><div className="flex-[3] bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /></div> },
  { id: '2-25-75', name: '1/4 - 3/4', columns: [25, 75], preview: <div className="flex gap-2 h-16"><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-[3] bg-teal-500/80 rounded" /></div> },
  { id: '3-25-50-25', name: '1/4 - 1/2 - 1/4', columns: [25, 50, 25], preview: <div className="flex gap-2 h-16"><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-[2] bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /></div> },
  { id: '3-40-20-40', name: '2/5 - 1/5 - 2/5', columns: [40, 20, 40], preview: <div className="flex gap-2 h-16"><div className="flex-[2] bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-[2] bg-teal-500/80 rounded" /></div> },
  { id: '3-50-25-25', name: '1/2 - 1/4 - 1/4', columns: [50, 25, 25], preview: <div className="flex gap-2 h-16"><div className="flex-[2] bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /></div> },
  { id: '3-25-25-50', name: '1/4 - 1/4 - 1/2', columns: [25, 25, 50], preview: <div className="flex gap-2 h-16"><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-[2] bg-teal-500/80 rounded" /></div> },
  { id: '4-25-25-25-25', name: '1/4 Each', columns: [25, 25, 25, 25], preview: <div className="flex gap-2 h-16"><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /></div> },
  { id: '4-40-20-20-20', name: '2/5 - 3x1/5', columns: [40, 20, 20, 20], preview: <div className="flex gap-2 h-16"><div className="flex-[2] bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /></div> },
  { id: '4-20-20-20-40', name: '3x1/5 - 2/5', columns: [20, 20, 20, 40], preview: <div className="flex gap-2 h-16"><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-1 bg-teal-500/80 rounded" /><div className="flex-[2] bg-teal-500/80 rounded" /></div> },
  { id: '4-20-30-30-20', name: '1/5 - 3/10 - 3/10 - 1/5', columns: [20, 30, 30, 20], preview: <div className="flex gap-2 h-16"><div className="flex-[2] bg-teal-500/80 rounded" /><div className="flex-[3] bg-teal-500/80 rounded" /><div className="flex-[3] bg-teal-500/80 rounded" /><div className="flex-[2] bg-teal-500/80 rounded" /></div> },
];

export const RowLayoutSelectorModal: React.FC<Props> = ({ onSelect, onClose, darkMode = false }) => {
  const [selectedLayout, setSelectedLayout] = useState<string | null>(null);

  const handleSelect = (layout: ColumnLayout) => {
    setSelectedLayout(layout.id);
    onSelect(layout.columns);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={`w-full max-w-4xl rounded-xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col ${
          darkMode ? 'bg-slate-900' : 'bg-white'
        }`}
      >
        <div className={`flex items-center justify-between p-6 border-b ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div>
            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Choose Column Layout
            </h2>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Select a layout for your new row
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'text-slate-400 hover:text-white hover:bg-slate-700'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-4">
            {layouts.map((layout) => (
              <button
                key={layout.id}
                onClick={() => handleSelect(layout)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedLayout === layout.id
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : darkMode
                    ? 'border-slate-700 hover:border-slate-600 bg-slate-800'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                {layout.preview}
                <p className={`text-xs mt-3 font-medium ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  {layout.name}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

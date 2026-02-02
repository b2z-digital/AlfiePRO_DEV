import { X } from 'lucide-react';

interface ColumnSelectorModalProps {
  onSelect: (columns: number) => void;
  onClose: () => void;
  darkMode?: boolean;
}

export default function ColumnSelectorModal({ onSelect, onClose, darkMode = false }: ColumnSelectorModalProps) {
  const layouts = [
    { columns: 1, label: 'Full Width', preview: ['100%'] },
    { columns: 2, label: '2 Columns', preview: ['50%', '50%'] },
    { columns: 3, label: '3 Columns', preview: ['33%', '33%', '33%'] },
    { columns: 2, label: '33% / 66%', preview: ['33%', '66%'], widths: [33, 67] },
    { columns: 2, label: '66% / 33%', preview: ['66%', '33%'], widths: [67, 33] },
    { columns: 4, label: '4 Columns', preview: ['25%', '25%', '25%', '25%'] },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`max-w-2xl w-full rounded-xl overflow-hidden ${
        darkMode ? 'bg-slate-800' : 'bg-white'
      }`}>
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          darkMode ? 'border-slate-700' : 'border-gray-200'
        }`}>
          <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
            Select Row Layout
          </h3>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
            }`}
          >
            <X className={`w-5 h-5 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`} />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-4">
            {layouts.map((layout, idx) => (
              <button
                key={idx}
                onClick={() => onSelect(layout.columns)}
                className={`p-6 rounded-xl border-2 transition-all hover:scale-105 ${
                  darkMode
                    ? 'border-slate-600 hover:border-blue-500 bg-slate-700'
                    : 'border-gray-200 hover:border-blue-500 bg-gray-50'
                }`}
              >
                <div className="flex gap-2 mb-3 h-16">
                  {layout.preview.map((width, colIdx) => (
                    <div
                      key={colIdx}
                      className={`rounded ${darkMode ? 'bg-slate-600' : 'bg-gray-300'}`}
                      style={{ width }}
                    />
                  ))}
                </div>
                <div className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  {layout.label}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

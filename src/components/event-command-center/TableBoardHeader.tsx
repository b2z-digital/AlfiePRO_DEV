import React from 'react';
import { Plus } from 'lucide-react';
import { BoardColumn } from '../../types/eventCommandCenter';

interface TableBoardHeaderProps {
  columns: BoardColumn[];
  darkMode: boolean;
  onAddColumn: () => void;
}

export const TableBoardHeader: React.FC<TableBoardHeaderProps> = ({
  columns,
  darkMode,
  onAddColumn,
}) => {
  return (
    <div
      className={`
        sticky top-0 z-20 flex items-center border-b
        ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}
      `}
    >
      {/* Task Name Column (fixed) */}
      <div
        className={`
          flex-shrink-0 w-80 px-4 py-3 font-semibold text-sm border-r
          ${darkMode ? 'text-gray-200 border-gray-700' : 'text-gray-700 border-gray-200'}
        `}
      >
        Task
      </div>

      {/* Custom Columns */}
      {columns.map((column) => (
        <div
          key={column.id}
          className={`
            flex-shrink-0 px-4 py-3 font-semibold text-sm border-r
            ${darkMode ? 'text-gray-200 border-gray-700' : 'text-gray-700 border-gray-200'}
          `}
          style={{ width: `${column.width}px` }}
        >
          {column.name}
        </div>
      ))}

      {/* Add Column Button */}
      <button
        onClick={onAddColumn}
        className={`
          flex-shrink-0 w-12 flex items-center justify-center py-3
          ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}
        `}
        title="Add column"
      >
        <Plus className="w-5 h-5" />
      </button>
    </div>
  );
};

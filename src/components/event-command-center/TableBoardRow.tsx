import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { EnhancedTask, BoardColumn, TaskColumnData } from '../../types/eventCommandCenter';

interface TableBoardRowProps {
  task: EnhancedTask;
  columns: BoardColumn[];
  columnData: Map<string, TaskColumnData>;
  darkMode: boolean;
  onUpdateColumnData: (taskId: string, columnId: string, value: any) => void;
}

export const TableBoardRow: React.FC<TableBoardRowProps> = ({
  task,
  columns,
  columnData,
  darkMode,
  onUpdateColumnData,
}) => {
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const getColumnValue = (columnId: string) => {
    return columnData.get(columnId)?.value;
  };

  const handleCellClick = (columnId: string, currentValue: any) => {
    setEditingColumn(columnId);
    setEditValue(currentValue?.text || currentValue?.label || currentValue || '');
  };

  const handleSave = (columnId: string, column: BoardColumn) => {
    let value: any = editValue;

    // Format value based on column type
    if (column.column_type === 'status' || column.column_type === 'dropdown') {
      value = { label: editValue, color: '#3B82F6' };
    } else if (column.column_type === 'number') {
      value = parseFloat(editValue) || 0;
    } else if (column.column_type === 'checkbox') {
      value = editValue === 'true' || editValue === '1';
    } else {
      value = { text: editValue };
    }

    onUpdateColumnData(task.id, columnId, value);
    setEditingColumn(null);
  };

  const renderCellContent = (column: BoardColumn) => {
    const value = getColumnValue(column.id);

    if (editingColumn === column.id) {
      return (
        <input
          autoFocus
          type={column.column_type === 'number' ? 'number' : 'text'}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleSave(column.id, column)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave(column.id, column);
            if (e.key === 'Escape') setEditingColumn(null);
          }}
          className={`
            w-full px-2 py-1 rounded border
            ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}
            focus:outline-none focus:ring-2 focus:ring-blue-500
          `}
        />
      );
    }

    // Display value based on column type
    if (column.column_type === 'status' && value) {
      return (
        <div
          className="inline-flex items-center px-2 py-1 rounded text-xs font-medium text-white"
          style={{ backgroundColor: value.color || '#3B82F6' }}
        >
          {value.label}
        </div>
      );
    }

    if (column.column_type === 'checkbox') {
      return (
        <div className="flex items-center">
          {value && (
            <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
      );
    }

    if (column.column_type === 'person' && value) {
      return (
        <div className="flex items-center gap-2">
          {value.avatar_url ? (
            <img src={value.avatar_url} alt={value.name} className="w-6 h-6 rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs">
              {value.name?.[0]}
            </div>
          )}
          <span className="text-sm">{value.name}</span>
        </div>
      );
    }

    if (column.column_type === 'date' && value) {
      return <span className="text-sm">{new Date(value).toLocaleDateString()}</span>;
    }

    // Default text display
    return (
      <span className="text-sm">
        {value?.text || value?.label || value || ''}
      </span>
    );
  };

  return (
    <div
      className={`
        flex items-center border-b
        ${darkMode ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-200 hover:bg-gray-50'}
      `}
    >
      {/* Task Name */}
      <div className="flex-shrink-0 w-80 px-4 py-3 border-r border-gray-200 dark:border-gray-700">
        <input
          type="text"
          value={task.title}
          onChange={(e) => {
            // TODO: Update task title
          }}
          className={`
            w-full bg-transparent border-none focus:outline-none
            ${darkMode ? 'text-white' : 'text-gray-900'}
          `}
        />
      </div>

      {/* Custom Columns */}
      {columns.map((column) => (
        <div
          key={column.id}
          className="flex-shrink-0 px-4 py-3 border-r border-gray-200 dark:border-gray-700 cursor-pointer"
          style={{ width: `${column.width}px` }}
          onClick={() => handleCellClick(column.id, getColumnValue(column.id))}
        >
          {renderCellContent(column)}
        </div>
      ))}

      {/* Empty cell for add column button alignment */}
      <div className="flex-shrink-0 w-12" />
    </div>
  );
};

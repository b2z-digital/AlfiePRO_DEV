import React from 'react';
import { X } from 'lucide-react';
import { FinancialChart } from '../../finances/FinancialChart';

interface FinancialPositionWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

export const FinancialPositionWidget: React.FC<FinancialPositionWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  settings,
  colorTheme = 'default'
}) => {
  return (
    <div className="relative w-full h-full [&>div]:!mb-0">
      {isEditMode && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
          title="Remove widget"
        >
          <X size={16} />
        </button>
      )}
      <FinancialChart darkMode={true} />
    </div>
  );
};

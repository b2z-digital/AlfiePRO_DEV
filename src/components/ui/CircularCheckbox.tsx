import React from 'react';
import { Check } from 'lucide-react';

interface CircularCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const CircularCheckbox: React.FC<CircularCheckboxProps> = ({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 18
  };

  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`
        ${sizeClasses[size]}
        rounded-full border-2 transition-all duration-200 ease-in-out
        flex items-center justify-center
        ${checked
          ? 'bg-blue-500 border-blue-500 text-white shadow-md'
          : 'border-slate-300 hover:border-blue-400'
        }
        ${disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:scale-105 active:scale-95'
        }
        ${className}
      `}
    >
      {checked && (
        <Check 
          size={iconSizes[size]} 
          className="text-white drop-shadow-sm" 
          strokeWidth={3}
        />
      )}
    </button>
  );
};
import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';

interface HandicapChangeBadgeProps {
  change: number;
  onClick?: () => void;
  darkMode: boolean;
  readOnly?: boolean;
}

export const HandicapChangeBadge: React.FC<HandicapChangeBadgeProps> = ({
  change,
  onClick,
  darkMode,
  readOnly = false
}) => {
  if (change === 0) return null;

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold shadow-lg transition-all ${
        readOnly
          ? 'bg-amber-500 text-white hover:bg-amber-600 border border-dashed border-amber-300'
          : change > 0
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'bg-green-500 text-white hover:bg-green-600'
      }`}
      title={readOnly ? 'Suggested only — not saved to member record' : undefined}
    >
      {change > 0 ? (
        <TrendingUp size={12} strokeWidth={3} />
      ) : (
        <TrendingDown size={12} strokeWidth={3} />
      )}
      <span>{change > 0 ? '+' : ''}{change}{readOnly ? '*' : ''}</span>
    </motion.button>
  );
};

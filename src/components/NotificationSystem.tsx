import React, { useState } from 'react';
import { X, CheckCircle, Info, AlertTriangle, AlertCircle } from 'lucide-react';

interface Notification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
}

interface NotificationSystemProps {
  notifications: Notification[];
  onRemove: (id: string) => void;
  darkMode: boolean;
}

export const NotificationSystem: React.FC<NotificationSystemProps> = ({
  notifications,
  onRemove,
  darkMode
}) => {
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const handleRemove = (id: string) => {
    setRemovingIds(prev => new Set([...prev, id]));
    setTimeout(() => {
      onRemove(id);
      setRemovingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }, 300);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle size={18} className="text-green-400" />;
      case 'info':
        return <Info size={18} className="text-blue-400" />;
      case 'warning':
        return <AlertTriangle size={18} className="text-amber-400" />;
      case 'error':
        return <AlertCircle size={18} className="text-red-400" />;
      default:
        return <Info size={18} className="text-blue-400" />;
    }
  };

  const getBackgroundColor = (type: string) => {
    switch (type) {
      case 'success':
        return darkMode ? 'bg-green-900/20 border-green-600/30' : 'bg-green-50 border-green-200';
      case 'info':
        return darkMode ? 'bg-blue-900/20 border-blue-600/30' : 'bg-blue-50 border-blue-200';
      case 'warning':
        return darkMode ? 'bg-amber-900/20 border-amber-600/30' : 'bg-amber-50 border-amber-200';
      case 'error':
        return darkMode ? 'bg-red-900/20 border-red-600/30' : 'bg-red-50 border-red-200';
      default:
        return darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-3 max-w-sm">
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          className={`
            flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md
            transform transition-all duration-500 ease-out
            ${getBackgroundColor(notification.type)}
            ${removingIds.has(notification.id) ? 'animate-slide-out-right' : 'animate-slide-in-right'}
          `}
          style={{
            animationDelay: `${index * 100}ms`,
            maxWidth: '350px'
          }}
        >
          {getIcon(notification.type)}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium leading-relaxed ${
              darkMode ? 'text-white' : 'text-slate-800'
            }`}>
              {notification.message}
            </p>
          </div>
          <button
            onClick={() => handleRemove(notification.id)}
            className={`
              p-1.5 rounded-full transition-colors flex-shrink-0
              ${darkMode 
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}
            `}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};
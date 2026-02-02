import React, { createContext, useContext, useState, ReactNode } from 'react';

interface Notification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  duration?: number;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (type: Notification['type'], message: string, duration?: number) => void;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (type: Notification['type'], message: string, duration?: number) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newNotification: Notification = {
      id,
      type,
      message,
      duration: duration || (type === 'info' ? 8000 : 5000)
    };

    setNotifications(prev => [...prev, newNotification]);

    // Auto-remove after specified duration
    setTimeout(() => {
      removeNotification(id);
    }, newNotification.duration);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const value = {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const useNotification = useNotifications;
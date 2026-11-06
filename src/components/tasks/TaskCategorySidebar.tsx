import React from 'react';
import { 
  Clock, 
  AlertTriangle, 
  Calendar, 
  CalendarDays, 
  CalendarRange, 
  CheckCircle, 
  List, 
  User 
} from 'lucide-react';

interface TaskCategorySidebarProps {
  activeCategory: string;
  onCategorySelect: (category: string) => void;
  taskCounts: {
    current: number;
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
    dueThisMonth: number;
    completed: number;
    all: number;
    myTasks: number;
  };
  darkMode: boolean;
}

export const TaskCategorySidebar: React.FC<TaskCategorySidebarProps> = ({
  activeCategory,
  onCategorySelect,
  taskCounts,
  darkMode
}) => {
  const categories = [
    {
      id: 'current',
      label: 'Current',
      icon: Clock,
      count: taskCounts.current,
      color: 'from-blue-500 to-blue-600',
      hoverColor: 'hover:from-blue-600 hover:to-blue-700'
    },
    {
      id: 'overdue',
      label: 'Overdue',
      icon: AlertTriangle,
      count: taskCounts.overdue,
      color: 'from-red-500 to-red-600',
      hoverColor: 'hover:from-red-600 hover:to-red-700'
    },
    {
      id: 'dueToday',
      label: 'Due today',
      icon: Calendar,
      count: taskCounts.dueToday,
      color: 'from-orange-500 to-orange-600',
      hoverColor: 'hover:from-orange-600 hover:to-orange-700'
    },
    {
      id: 'dueThisWeek',
      label: 'This week',
      icon: CalendarDays,
      count: taskCounts.dueThisWeek,
      color: 'from-purple-500 to-purple-600',
      hoverColor: 'hover:from-purple-600 hover:to-purple-700'
    },
    {
      id: 'dueThisMonth',
      label: 'This month',
      icon: CalendarRange,
      count: taskCounts.dueThisMonth,
      color: 'from-indigo-500 to-indigo-600',
      hoverColor: 'hover:from-indigo-600 hover:to-indigo-700'
    },
    {
      id: 'completed',
      label: 'Completed',
      icon: CheckCircle,
      count: taskCounts.completed,
      color: 'from-green-500 to-green-600',
      hoverColor: 'hover:from-green-600 hover:to-green-700'
    }
  ];

  const quickFilters = [
    {
      id: 'all',
      label: 'All tasks',
      icon: List,
      count: taskCounts.all,
      color: 'from-slate-500 to-slate-600',
      hoverColor: 'hover:from-slate-600 hover:to-slate-700'
    },
    {
      id: 'myTasks',
      label: 'My tasks',
      icon: User,
      count: taskCounts.myTasks,
      color: 'from-cyan-500 to-cyan-600',
      hoverColor: 'hover:from-cyan-600 hover:to-cyan-700'
    }
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="a-cap px-1">My lists</p>
      <div className="grid grid-cols-2 gap-2">
        {categories.map((category) => {
          const Icon = category.icon;
          const on = activeCategory === category.id;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onCategorySelect(category.id)}
              className={`a-sl ${on ? 'a-sl-on' : ''}`}
              aria-pressed={on}
            >
              <span className="flex items-center justify-between">
                <span className={`a-tile a-tile-sm ${category.id === 'overdue' && category.count > 0 ? 'a-txt-r' : ''}`}><Icon size={16} /></span>
                <span className="a-num a-ink text-[24px] font-semibold">{category.count}</span>
              </span>
              <span className="a-ink text-[13.5px] font-medium">{category.label}</span>
            </button>
          );
        })}
      </div>

      <p className="a-cap px-1 pt-2">Everyone</p>
      <div className="flex flex-col gap-0.5">
        {quickFilters.map((filter) => {
          const Icon = filter.icon;
          const on = activeCategory === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => onCategorySelect(filter.id)}
              className={`a-ql ${on ? 'a-ql-on' : ''}`}
              aria-pressed={on}
            >
              <span className="a-tile a-tile-sm"><Icon size={16} /></span>
              <span className="flex-1 text-left">{filter.label}</span>
              <span className="a-num text-[15px] font-semibold">{filter.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

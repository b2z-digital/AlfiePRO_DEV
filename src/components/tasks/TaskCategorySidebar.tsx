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
      label: 'Due Today',
      icon: Calendar,
      count: taskCounts.dueToday,
      color: 'from-orange-500 to-orange-600',
      hoverColor: 'hover:from-orange-600 hover:to-orange-700'
    },
    {
      id: 'dueThisWeek',
      label: 'This Week',
      icon: CalendarDays,
      count: taskCounts.dueThisWeek,
      color: 'from-purple-500 to-purple-600',
      hoverColor: 'hover:from-purple-600 hover:to-purple-700'
    },
    {
      id: 'dueThisMonth',
      label: 'This Month',
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
      label: 'All Tasks',
      icon: List,
      count: taskCounts.all,
      color: 'from-slate-500 to-slate-600',
      hoverColor: 'hover:from-slate-600 hover:to-slate-700'
    },
    {
      id: 'myTasks',
      label: 'My Tasks',
      icon: User,
      count: taskCounts.myTasks,
      color: 'from-cyan-500 to-cyan-600',
      hoverColor: 'hover:from-cyan-600 hover:to-cyan-700'
    }
  ];

  const CategoryTile = ({ category, isSelected }: { category: any; isSelected: boolean }) => {
    const Icon = category.icon;
    
    return (
      <button
        onClick={() => onCategorySelect(category.id)}
        className={`
          relative w-full h-24 rounded-xl transition-all duration-200 transform
          bg-gradient-to-br ${category.color} ${category.hoverColor}
          hover:scale-105 hover:shadow-lg active:scale-95
          ${isSelected ? 'ring-2 ring-white ring-opacity-50 shadow-lg scale-105' : ''}
          overflow-hidden group
        `}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 bg-white bg-opacity-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        
        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center p-3 text-white">
          {/* Icon */}
          <div className="mb-2">
            <Icon size={20} className="drop-shadow-sm" />
          </div>
          
          {/* Label */}
          <div className="text-sm font-medium text-center leading-tight mb-1">
            {category.label}
          </div>
          
          {/* Count */}
          <div className="text-lg font-bold">
            {category.count}
          </div>
        </div>
      </button>
    );
  };

  const QuickFilterTile = ({ filter, isSelected }: { filter: any; isSelected: boolean }) => {
    const Icon = filter.icon;
    
    return (
      <button
        onClick={() => onCategorySelect(filter.id)}
        className={`
          relative w-full h-16 rounded-xl transition-all duration-200 transform
          bg-gradient-to-br ${filter.color} ${filter.hoverColor}
          hover:scale-105 hover:shadow-lg active:scale-95
          ${isSelected ? 'ring-2 ring-white ring-opacity-50 shadow-lg scale-105' : ''}
          overflow-hidden group
        `}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 bg-white bg-opacity-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        
        {/* Content */}
        <div className="relative h-full flex items-center justify-between p-4 text-white">
          {/* Icon and Label */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white bg-opacity-20">
              <Icon size={16} className="drop-shadow-sm" />
            </div>
            <div className="text-sm font-medium">
              {filter.label}
            </div>
          </div>
          
          {/* Count */}
          <div className="text-lg font-bold">
            {filter.count}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Task Categories */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-4 text-slate-400">
          Task Categories
        </h2>
        
        <div className="grid grid-cols-2 gap-3">
          {categories.map((category) => (
            <CategoryTile
              key={category.id}
              category={category}
              isSelected={activeCategory === category.id}
            />
          ))}
        </div>
      </div>

      {/* Quick Filters */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-4 text-slate-400">
          Quick Filters
        </h2>

        <div className="space-y-3">
          {quickFilters.map((filter) => (
            <QuickFilterTile
              key={filter.id}
              filter={filter}
              isSelected={activeCategory === filter.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
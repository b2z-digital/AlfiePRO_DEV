import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Users, DollarSign, UserPlus, ChevronRight, ChevronDown, CircleCheck as CheckCircle2, Circle, X, Rocket, Sparkles, CheckCheck } from 'lucide-react';
import { useClubSetupStatus, SetupCategory, SetupTask } from '../../hooks/useClubSetupStatus';
import { usePermissions } from '../../hooks/usePermissions';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  users: Users,
  'dollar-sign': DollarSign,
  'user-plus': UserPlus,
};

const CATEGORY_COLORS: Record<string, { bg: string; ring: string; text: string; icon: string }> = {
  membership: {
    bg: 'bg-blue-500/10',
    ring: 'text-blue-500',
    text: 'text-blue-400',
    icon: 'text-blue-400',
  },
  finance: {
    bg: 'bg-emerald-500/10',
    ring: 'text-emerald-500',
    text: 'text-emerald-400',
    icon: 'text-emerald-400',
  },
  members: {
    bg: 'bg-amber-500/10',
    ring: 'text-amber-500',
    text: 'text-amber-400',
    icon: 'text-amber-400',
  },
};

function ProgressRing({ percent, size = 120 }: { percent: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        className="transform -rotate-90"
        width={size}
        height={size}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-700/50"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-xl font-bold text-white">{percent}%</span>
        <span className="text-[8px] text-slate-400 uppercase tracking-widest font-medium mt-1">Complete</span>
      </div>
    </div>
  );
}

function CategorySection({
  category,
  isExpanded,
  onToggle,
  onNavigate,
  onToggleTask,
}: {
  category: SetupCategory;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: (task: SetupTask) => void;
  onToggleTask: (taskId: string) => void;
}) {
  const Icon = CATEGORY_ICONS[category.icon] || Users;
  const colors = CATEGORY_COLORS[category.id] || CATEGORY_COLORS.membership;
  const isComplete = category.completedCount === category.totalCount;

  return (
    <div className={`rounded-xl border transition-all duration-200 ${
      isComplete
        ? 'border-emerald-500/20 bg-emerald-500/5'
        : 'border-slate-700/50 bg-slate-800/50'
    }`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isComplete ? 'bg-emerald-500/20' : colors.bg
        }`}>
          {isComplete ? (
            <CheckCircle2 size={20} className="text-emerald-400" />
          ) : (
            <Icon size={20} className={colors.icon} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold text-sm ${
              isComplete ? 'text-emerald-400' : 'text-white'
            }`}>
              {category.title}
            </h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isComplete
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-slate-700 text-slate-400'
            }`}>
              {category.completedCount}/{category.totalCount}
            </span>
          </div>
          <div className="mt-1.5 w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                isComplete
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-blue-500 to-cyan-400'
              }`}
              style={{ width: `${(category.completedCount / category.totalCount) * 100}%` }}
            />
          </div>
        </div>

        <ChevronDown
          size={18}
          className={`text-slate-500 transition-transform duration-200 flex-shrink-0 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-1">
          {category.tasks.map((task) => (
            <TaskItem key={task.id} task={task} onNavigate={onNavigate} onToggleComplete={() => onToggleTask(task.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskItem({
  task,
  onNavigate,
  onToggleComplete,
}: {
  task: SetupTask;
  onNavigate: (task: SetupTask) => void;
  onToggleComplete: () => void;
}) {
  return (
    <div
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 group ${
        task.completed
          ? 'opacity-70'
          : 'hover:bg-slate-700/50'
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete();
        }}
        className="flex-shrink-0 p-0.5 rounded-full hover:bg-slate-600/50 transition-colors"
        title={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {task.completed ? (
          <CheckCircle2 size={18} className="text-emerald-500" />
        ) : (
          <Circle size={18} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
        )}
      </button>

      <button
        onClick={() => onNavigate(task)}
        className="flex-1 min-w-0 text-left"
      >
        <p className={`text-sm font-medium ${
          task.completed ? 'text-slate-500 line-through' : 'text-slate-200'
        }`}>
          {task.label}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {task.description}
        </p>
      </button>

      <button
        onClick={() => onNavigate(task)}
        className="flex-shrink-0"
      >
        <ChevronRight
          size={16}
          className="text-slate-600 group-hover:text-slate-400 transition-colors"
        />
      </button>
    </div>
  );
}

export function ClubSetupChecklist() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = usePermissions();
  const setupStatus = useClubSetupStatus();
  const pendingRefresh = useRef(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    membership: true,
    finance: false,
    members: false,
  });
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (location.state?.fromSetupChecklist && !pendingRefresh.current) {
      pendingRefresh.current = true;
      window.history.replaceState({}, '');
      setupStatus.refresh();
    }
  }, [location.state]);

  useEffect(() => {
    if (pendingRefresh.current && !setupStatus.loading && setupStatus.categories.length > 0) {
      pendingRefresh.current = false;
      const expanded: Record<string, boolean> = {};
      const firstIncomplete = setupStatus.categories.find(c => c.completedCount < c.totalCount);
      for (const cat of setupStatus.categories) {
        expanded[cat.id] = cat.id === firstIncomplete?.id;
      }
      setExpandedCategories(expanded);
    }
  }, [setupStatus.loading, setupStatus.categories]);

  if (!isAdmin || setupStatus.loading || setupStatus.isDismissed || setupStatus.isFullyComplete) {
    return null;
  }

  if (setupStatus.totalTasks === 0) return null;

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => {
      const isCurrentlyExpanded = prev[id];
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) {
        next[key] = false;
      }
      if (!isCurrentlyExpanded) {
        next[id] = true;
      }
      return next;
    });
  };

  const handleNavigate = (task: SetupTask) => {
    if (task.routeState) {
      navigate(task.route, { state: task.routeState });
    } else {
      navigate(task.route);
    }
  };

  const firstIncompleteCategory = setupStatus.categories.find(
    c => c.completedCount < c.totalCount
  );

  if (isMinimized) {
    return (
      <div className="mb-6">
        <button
          onClick={() => setIsMinimized(false)}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-700/50 bg-slate-800/80 backdrop-blur-sm hover:bg-slate-800 transition-all group"
        >
          <div className="relative w-10 h-10 flex-shrink-0">
            <svg className="transform -rotate-90" width={40} height={40}>
              <circle cx={20} cy={20} r={16} fill="none" stroke="currentColor" strokeWidth={3} className="text-slate-700/50" />
              <circle
                cx={20} cy={20} r={16} fill="none" stroke="#10b981" strokeWidth={3} strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 16}
                strokeDashoffset={2 * Math.PI * 16 - (setupStatus.progressPercent / 100) * 2 * Math.PI * 16}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
              {setupStatus.progressPercent}%
            </span>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-white">Club Setup in Progress</p>
            <p className="text-xs text-slate-400">
              {setupStatus.completedTasks} of {setupStatus.totalTasks} tasks complete
            </p>
          </div>
          <ChevronDown size={18} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-sm overflow-hidden">
      <div className="p-6 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <ProgressRing percent={setupStatus.progressPercent} size={80} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Rocket size={18} className="text-emerald-400" />
                <h2 className="text-lg font-bold text-white">
                  Get Your Club Ready
                </h2>
              </div>
              <p className="text-sm text-slate-400 max-w-md">
                Complete these steps to set up your club. You can do them in any order
                and come back anytime.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
              title="Minimize"
            >
              <ChevronDown size={16} />
            </button>
            <button
              onClick={setupStatus.dismiss}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
              title="Dismiss checklist"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-2">
        {setupStatus.categories.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            isExpanded={!!expandedCategories[category.id]}
            onToggle={() => toggleCategory(category.id)}
            onNavigate={handleNavigate}
            onToggleTask={setupStatus.toggleTask}
          />
        ))}
      </div>

      <div className="px-6 pb-6 flex gap-3">
        {firstIncompleteCategory && (
          <button
            onClick={() => {
              const firstIncompleteTask = firstIncompleteCategory.tasks.find(t => !t.completed);
              if (firstIncompleteTask) {
                handleNavigate(firstIncompleteTask);
              }
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
          >
            <Sparkles size={16} />
            Continue Setup
            <ChevronRight size={16} />
          </button>
        )}
        <button
          onClick={setupStatus.completeAll}
          className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl border border-slate-600 hover:border-slate-500 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white font-semibold text-sm transition-all"
        >
          <CheckCheck size={16} />
          Complete Setup
        </button>
      </div>
    </div>
  );
}

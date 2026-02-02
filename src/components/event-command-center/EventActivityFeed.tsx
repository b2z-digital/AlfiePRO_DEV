import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  MessageSquare,
  FileText,
  UserPlus,
  Globe,
  TrendingUp,
  Calendar,
  Bell,
  Filter,
} from 'lucide-react';
import { EventActivity } from '../../types/eventCommandCenter';
import { EventCommandCenterStorage } from '../../utils/eventCommandCenterStorage';
import { useNotifications } from '../../contexts/NotificationContext';
import { formatDistanceToNow } from 'date-fns';

interface EventActivityFeedProps {
  eventId: string;
  darkMode: boolean;
}

export const EventActivityFeed: React.FC<EventActivityFeedProps> = ({ eventId, darkMode }) => {
  const [activities, setActivities] = useState<EventActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const { addNotification } = useNotifications();

  useEffect(() => {
    loadActivities();
    setupRealtime();
  }, [eventId, filterType]);

  const loadActivities = async () => {
    try {
      setLoading(true);
      const activitiesData = await EventCommandCenterStorage.getEventActivity(
        eventId,
        100,
        filterType.length > 0 ? filterType : undefined
      );
      setActivities(activitiesData);
    } catch (error) {
      console.error('Error loading activities:', error);
      addNotification('Failed to load activity feed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const setupRealtime = () => {
    const unsubscribe = EventCommandCenterStorage.subscribeToActivity(eventId, (newActivity) => {
      setActivities((prev) => [newActivity, ...prev]);
    });

    return unsubscribe;
  };

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case 'task_created':
      case 'task_updated':
        return <FileText className="w-5 h-5" />;
      case 'task_completed':
        return <CheckCircle2 className="w-5 h-5" />;
      case 'task_assigned':
        return <UserPlus className="w-5 h-5" />;
      case 'message_sent':
        return <MessageSquare className="w-5 h-5" />;
      case 'file_uploaded':
        return <FileText className="w-5 h-5" />;
      case 'registration_received':
        return <UserPlus className="w-5 h-5" />;
      case 'website_updated':
        return <Globe className="w-5 h-5" />;
      case 'document_generated':
        return <FileText className="w-5 h-5" />;
      case 'deadline_approaching':
        return <Calendar className="w-5 h-5" />;
      case 'milestone_reached':
        return <TrendingUp className="w-5 h-5" />;
      case 'automation_triggered':
        return <Bell className="w-5 h-5" />;
      default:
        return <Bell className="w-5 h-5" />;
    }
  };

  const getActivityColor = (activityType: string) => {
    switch (activityType) {
      case 'task_completed':
      case 'milestone_reached':
        return 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400';
      case 'task_created':
      case 'task_updated':
        return 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400';
      case 'task_assigned':
      case 'registration_received':
        return 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400';
      case 'deadline_approaching':
        return 'bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400';
      case 'message_sent':
        return 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const activityTypes = [
    { value: 'task_created', label: 'Task Created' },
    { value: 'task_updated', label: 'Task Updated' },
    { value: 'task_completed', label: 'Task Completed' },
    { value: 'task_assigned', label: 'Task Assigned' },
    { value: 'message_sent', label: 'Message Sent' },
    { value: 'file_uploaded', label: 'File Uploaded' },
    { value: 'registration_received', label: 'Registration' },
    { value: 'website_updated', label: 'Website Updated' },
    { value: 'milestone_reached', label: 'Milestone' },
  ];

  const toggleFilter = (type: string) => {
    setFilterType((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Activity Feed
            </h2>
            <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Real-time updates from your event
            </p>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
              ${darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'}
            `}
          >
            <Filter className="w-4 h-4" />
            Filter
            {filterType.length > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5">
                {filterType.length}
              </span>
            )}
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className={`mt-4 p-4 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
            <div className="flex flex-wrap gap-2">
              {activityTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => toggleFilter(type.value)}
                  className={`
                    px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                    ${
                      filterType.includes(type.value)
                        ? 'bg-blue-600 text-white'
                        : darkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                    }
                  `}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Activity Stream */}
      <div className="flex-1 overflow-y-auto p-6">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Bell className={`w-12 h-12 mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
            <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              No activity yet
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className={`
                  flex gap-4 p-4 rounded-lg border
                  ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}
                  hover:shadow-md transition-shadow duration-200
                `}
              >
                {/* Icon */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getActivityColor(activity.activity_type)}`}>
                  {getActivityIcon(activity.activity_type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h4 className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {activity.title}
                      </h4>
                      {activity.description && (
                        <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {activity.description}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs whitespace-nowrap ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  {/* User */}
                  {activity.user && (
                    <div className="flex items-center gap-2 mt-2">
                      {activity.user.avatar_url ? (
                        <img
                          src={activity.user.avatar_url}
                          alt={`${activity.user.first_name} ${activity.user.last_name}`}
                          className="w-5 h-5 rounded-full"
                        />
                      ) : (
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                            darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {activity.user.first_name?.[0]}
                        </div>
                      )}
                      <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {activity.user.first_name} {activity.user.last_name}
                      </span>
                    </div>
                  )}

                  {/* Metadata */}
                  {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                    <div className={`mt-2 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      {activity.metadata.priority && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 mr-2">
                          Priority: {activity.metadata.priority}
                        </span>
                      )}
                      {activity.metadata.status && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 mr-2">
                          Status: {activity.metadata.status}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

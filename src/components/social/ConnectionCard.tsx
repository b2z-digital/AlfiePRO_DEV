import React from 'react';
import { UserPlus, UserCheck, MessageCircle } from 'lucide-react';
import { SocialConnection } from '../../utils/socialStorage';

interface ConnectionCardProps {
  connection?: SocialConnection;
  user?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
  onConnect?: () => void;
  onMessage?: () => void;
  isConnected?: boolean;
}

export default function ConnectionCard({ connection, user, onConnect, onMessage, isConnected }: ConnectionCardProps) {
  const displayUser = connection?.connected_user || user;

  if (!displayUser) return null;

  return (
    <div className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start space-x-4">
        {displayUser.avatar_url ? (
          <img
            src={displayUser.avatar_url}
            alt={displayUser.full_name}
            className="w-16 h-16 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {displayUser.full_name?.charAt(0) || 'U'}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">
            {displayUser.full_name}
          </h3>
          <p className="text-sm text-gray-500 mt-1">Member</p>

          <div className="flex items-center space-x-2 mt-3">
            {isConnected ? (
              <>
                <button
                  onClick={onMessage}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Message</span>
                </button>
                <button className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium">
                  <UserCheck className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={onConnect}
                className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <UserPlus className="w-4 h-4" />
                <span>Connect</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

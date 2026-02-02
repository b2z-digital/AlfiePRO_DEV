import React from 'react';
import { Users, Lock, Globe, Settings } from 'lucide-react';
import { SocialGroup } from '../../utils/socialStorage';

interface GroupCardProps {
  group: SocialGroup;
  onJoin?: () => void;
  onLeave?: () => void;
  onClick?: () => void;
}

export default function GroupCard({ group, onJoin, onLeave, onClick }: GroupCardProps) {
  const isMember = group.user_membership?.status === 'active';

  const getVisibilityIcon = () => {
    switch (group.visibility) {
      case 'public':
        return <Globe className="w-4 h-4" />;
      case 'private':
        return <Lock className="w-4 h-4" />;
      case 'secret':
        return <Lock className="w-4 h-4" />;
      default:
        return <Globe className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
      <div
        className="relative h-32 bg-gradient-to-br from-blue-500 to-blue-600 rounded-t-lg overflow-hidden cursor-pointer"
        onClick={onClick}
        style={group.cover_image_url ? {
          backgroundImage: `url(${group.cover_image_url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        } : {}}
      >
        <div className="absolute inset-0 bg-black bg-opacity-20"></div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h3
              className="font-bold text-lg text-gray-900 hover:text-blue-600 cursor-pointer"
              onClick={onClick}
            >
              {group.name}
            </h3>
            <div className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
              {getVisibilityIcon()}
              <span className="capitalize">{group.visibility} Group</span>
              <span>•</span>
              <span>{group.member_count} members</span>
            </div>
          </div>

          {isMember && group.user_membership?.role === 'admin' && (
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <Settings className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        {group.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-3">
            {group.description}
          </p>
        )}

        <div className="flex items-center justify-between pt-3 border-t">
          {isMember ? (
            <button
              onClick={onLeave}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Leave Group
            </button>
          ) : (
            <button
              onClick={onJoin}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Join Group
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

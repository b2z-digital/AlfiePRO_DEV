import React from 'react';

interface AvatarProps {
  firstName?: string;
  lastName?: string;
  name?: string;
  imageUrl?: string | null;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  firstName = '',
  lastName = '',
  name,
  imageUrl,
  src,
  size = 'md',
  className = ''
}) => {
  const getInitials = () => {
    // If name prop is provided, use it
    if (name) {
      const parts = name.trim().split(' ');
      const first = parts[0]?.charAt(0).toUpperCase() || '';
      const last = parts[parts.length - 1]?.charAt(0).toUpperCase() || '';
      return parts.length > 1 ? first + last : first || '?';
    }

    // Otherwise use firstName and lastName
    const first = firstName?.trim().charAt(0).toUpperCase() || '';
    const last = lastName?.trim().charAt(0).toUpperCase() || '';
    return first + last || '?';
  };

  const sizeClasses = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-16 h-16 text-xl'
  };

  const initials = getInitials();
  const avatarImage = src || imageUrl;
  const displayName = name || `${firstName} ${lastName}`.trim();

  return (
    <div
      className={`
        ${sizeClasses[size]}
        rounded-full
        flex items-center justify-center
        font-semibold
        overflow-hidden
        flex-shrink-0
        ${avatarImage ? '' : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'}
        ${className}
      `}
    >
      {avatarImage ? (
        <img
          src={avatarImage}
          alt={displayName}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
};

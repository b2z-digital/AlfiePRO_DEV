import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { Settings, User, LogOut, LayoutDashboard, Building, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  darkMode: boolean;
  onOpenSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  darkMode,
  onOpenSettings
}) => {
  const { user, signOut, userClubs, currentClub, setCurrentClub } = useAuth();
  const navigate = useNavigate();
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showClubDropdown, setShowClubDropdown] = useState(false);

  // Get avatar URL from user metadata
  const avatarUrl = user?.user_metadata?.avatar_url;

  const handleSignOut = async () => {
    try {
      console.log('Signing out from Header component');
      
      // Clear any local storage first
      localStorage.removeItem('currentClubId');
      localStorage.removeItem('current-event');
      sessionStorage.clear();
      
      // Then call the signOut function
      await signOut();
      
      console.log('Sign out successful, navigating to login');
      
      // Force redirect to login page
      window.location.href = '/login';
    } catch (error) {
      console.error('Error signing out:', error);
      // Force redirect to login page if signOut fails
      window.location.href = '/login';
    }
  };

  const handleClubChange = (club: typeof userClubs[0]) => {
    setCurrentClub(club);
    setShowClubDropdown(false);
  };

  // Get first name and last name from user metadata
  const firstName = user?.user_metadata?.first_name || '';
  const lastName = user?.user_metadata?.last_name || '';
  const displayName = firstName && lastName ? `${firstName} ${lastName}` : user?.email;
  const initials = firstName && lastName 
    ? `${firstName.charAt(0)}${lastName.charAt(0)}` 
    : user?.email?.charAt(0) || 'U';

  return (
    <header className="flex items-center justify-between py-6">
      <div className="flex items-center gap-4">
        <Logo className="w-12 h-12" />
        <div>
          <h1 className="text-3xl text-white tracking-wide">
            <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {user && userClubs.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowClubDropdown(!showClubDropdown)}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
                ${darkMode 
                  ? 'text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700' 
                  : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'}
              `}
            >
              <Building size={18} />
              <span className="text-sm font-medium hidden sm:block">
                {currentClub?.club?.name || 'Select Club'}
              </span>
              <ChevronDown size={16} />
            </button>

            {showClubDropdown && (
              <div 
                className={`
                  absolute right-0 mt-2 w-64 rounded-lg shadow-lg border overflow-hidden z-50
                  ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
                `}
              >
                <div className={`
                  p-3 border-b
                  ${darkMode ? 'border-slate-700' : 'border-slate-200'}
                `}>
                  <p className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Switch Club
                  </p>
                </div>

                <div className="max-h-60 overflow-y-auto">
                  {userClubs.map(club => (
                    <button
                      key={club.id}
                      onClick={() => handleClubChange(club)}
                      className={`
                        w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                        ${currentClub?.clubId === club.clubId
                          ? darkMode 
                            ? 'bg-slate-700 text-white' 
                            : 'bg-slate-100 text-slate-900'
                          : darkMode 
                            ? 'text-slate-300 hover:bg-slate-700' 
                            : 'text-slate-700 hover:bg-slate-50'
                        }
                      `}
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white">
                        {club.club?.abbreviation?.charAt(0) || club.club?.name?.charAt(0) || 'C'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {club.club?.name || 'Unknown Club'}
                        </p>
                        <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {club.role === 'admin' ? 'Admin' : 'Editor'}
                        </p>
                      </div>
                      {currentClub?.clubId === club.clubId && (
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {user ? (
          <div className="relative">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
                ${darkMode 
                  ? 'text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700' 
                  : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'}
              `}
            >
              {avatarUrl ? (
                <img 
                  src={avatarUrl} 
                  alt={displayName || 'User'} 
                  className="h-8 w-8 rounded-full object-cover border border-slate-600"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white">
                  {initials}
                </div>
              )}
              <span className="text-sm font-medium hidden sm:block">
                {displayName}
              </span>
              <ChevronDown size={16} />
            </button>

            {showUserDropdown && (
              <div 
                className={`
                  absolute right-0 mt-2 w-56 rounded-lg shadow-lg border overflow-hidden z-50
                  ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
                `}
              >
                <div className={`
                  p-4 border-b
                  ${darkMode ? 'border-slate-700' : 'border-slate-200'}
                `}>
                  <div className="flex items-center gap-3">
                    {avatarUrl ? (
                      <img 
                        src={avatarUrl} 
                        alt={displayName || 'User'} 
                        className="h-10 w-10 rounded-full object-cover border border-slate-600"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
                        {initials}
                      </div>
                    )}
                    <div>
                      <p className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        {displayName}
                      </p>
                      <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {user.user_metadata?.role || 'User'}
                  </p>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowUserDropdown(false);
                      navigate('/dashboard');
                    }}
                    className={`
                      w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors
                      ${darkMode 
                        ? 'text-slate-300 hover:bg-slate-700' 
                        : 'text-slate-700 hover:bg-slate-50'}
                    `}
                  >
                    <LayoutDashboard size={16} />
                    Dashboard
                  </button>
                  
                  <button
                    onClick={() => {
                      setShowUserDropdown(false);
                      navigate('/profile');
                    }}
                    className={`
                      w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors
                      ${darkMode 
                        ? 'text-slate-300 hover:bg-slate-700' 
                        : 'text-slate-700 hover:bg-slate-50'}
                    `}
                  >
                    <User size={16} />
                    Profile
                  </button>
                  
                  {onOpenSettings && (
                    <button
                      onClick={() => {
                        setShowUserDropdown(false);
                        onOpenSettings();
                      }}
                      className={`
                        w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors
                        ${darkMode 
                          ? 'text-slate-300 hover:bg-slate-700' 
                          : 'text-slate-700 hover:bg-slate-50'}
                      `}
                    >
                      <Settings size={16} />
                      App Settings
                    </button>
                  )}
                </div>

                <div className={`
                  py-1 border-t
                  ${darkMode ? 'border-slate-700' : 'border-slate-200'}
                `}>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setShowUserDropdown(false);
                      handleSignOut();
                    }}
                    className={`
                      w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors
                      ${darkMode 
                        ? 'text-red-400 hover:bg-slate-700' 
                        : 'text-red-600 hover:bg-slate-50'}
                    `}
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
              ${darkMode 
                ? 'text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700' 
                : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'}
            `}
          >
            <span className="text-sm font-medium">Sign in</span>
          </button>
        )}
      </div>
    </header>
  );
};
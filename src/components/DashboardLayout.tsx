import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Building, Calendar, Users, ChevronLeft, Home, Settings, LogOut, LayoutDashboard, TrendingUp, MapPin, ChevronRight, ChevronDown, ChevronUp, CreditCard, Globe, Newspaper, DollarSign, CheckSquare, Monitor, Camera, Flag, Anchor, Mail, Tag, Wrench, Sailboat, FolderOpen, Wind, MessageSquare, Tv, Upload, Send, Video, FileCheck, Award, Link } from 'lucide-react';
import { supabase, getOrCreateChannel, removeChannelByName } from '../utils/supabase';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { RaceManagementPage } from './pages/RaceManagementPage';
import { ClubSettings } from './pages/ClubSettings';
import { VenuesPage } from './pages/VenuesPage';
import { MembersPage } from './pages/MembersPage';
import { RaceCalendar } from './RaceCalendar';
import { DashboardHome } from './DashboardHome';
import { getStoredRaceEvents, getStoredRaceSeries } from '../utils/raceStorage';
import { getStoredMembers } from '../utils/storage';
import { getStoredClubs } from '../utils/clubStorage';
import { RaceEvent } from '../types/race';
import { formatDate } from '../utils/date';
import { ResultsPage } from '../pages/ResultsPage';
import { MembershipPage } from '../pages/MembershipPage';
import { Logo } from './Logo';
import { ClubSwitcher } from './ClubSwitcher';
import { OfflineIndicator } from './OfflineIndicator';
import { useAuth } from '../contexts/AuthContext';
import { SettingsPage } from './pages/SettingsPage';
import { MembershipDashboard } from './pages/MembershipDashboard';
import { useNotifications } from '../contexts/NotificationContext';
import { SuperAdminEventModal } from './SuperAdminEventModal';
import { getPublicEvents } from '../utils/publicEventStorage';
import NewsPage from '../pages/NewsPage';
import ArticleDetailPage from '../pages/ArticleDetailPage';
import ArticleEditorPage from '../pages/ArticleEditorPage';
import { FinancesPage } from '../pages/FinancesPage';
import { MeetingsPage } from './pages/MeetingsPage';
import { RankingsManagement } from './pages/RankingsManagement';
import { NameMappingManager } from './pages/NameMappingManager';
import { TasksPage } from './tasks/TasksPage';
import { EventDetails } from './EventDetails';
import { usePermissions } from '../hooks/usePermissions';
import { YachtClassesRouter } from '../pages/YachtClassesRouter';

// Import Website section components
import WebsiteOverview from './pages/WebsiteOverview';
import { DocumentTemplateBuilder } from './pages/DocumentTemplateBuilder';
import { WysiwygDocumentBuilder } from './pages/WysiwygDocumentBuilder';
import WebsitePages from './pages/WebsitePages';
import WebsitePageEditorSimple from './pages/WebsitePageEditorSimple';
import { OrganizationPageManager, OrganizationPageBuilderEditor } from './organization';
import type { OrganizationType } from '../types/organizationWidgets';
import WebsiteNavigation from './pages/WebsiteNavigation';
import WebsiteTheme from './pages/WebsiteTheme';
import WebsiteSettings from './pages/WebsiteSettings';
import { EventWebsiteManagement } from './pages/EventWebsiteManagement';
import { EventWebsiteDashboard } from './pages/EventWebsiteDashboard';
import ClubWebsiteAnalytics from './pages/ClubWebsiteAnalytics';
import { WebsiteHomepageManager } from './pages/WebsiteHomepageManager';
import MediaPage from '../pages/MediaPage';
import AlfieTVPage from '../pages/AlfieTVPage';
import AlfieTVAdmin from './alfie-tv/AlfieTVAdmin';
import { FormBuilderPage } from './pages/FormBuilderPage';
import { MyBoatsPage } from './pages/MyBoatsPage';
import CommsPage from '../pages/CommsPage';
import { MyGaragePage } from '../pages/MyGaragePage';
import ClassifiedsPage from '../pages/ClassifiedsPage';
import CommunityPage from '../pages/CommunityPage';
import { StateAssociationDashboard } from './StateAssociationDashboard';
import { NationalAssociationDashboard } from './NationalAssociationDashboard';
import { StateAssociationMembers } from './membership/StateAssociationMembers';
import { NationalAssociationMembers } from './membership/NationalAssociationMembers';
import { AssociationMemberReports } from './membership/AssociationMemberReports';
import { StateRemittanceDashboard } from './membership/StateRemittanceDashboard';
import { NationalRemittanceDashboard } from './membership/NationalRemittanceDashboard';
import { AssociationsManagementPage } from './pages/AssociationsManagementPage';
import { ClubsManagementPage } from './pages/ClubsManagementPage';
import { AssociationFinancesPage } from '../pages/AssociationFinancesPage';
import { AssociationResourcesPage } from './pages/AssociationResourcesPage';
import WeatherPage from '../pages/WeatherPage';
import AssociationMemberImportModal from './membership/AssociationMemberImportModal';
import MarketingPage from '../pages/MarketingPage';
import MarketingCampaignsPage from '../pages/MarketingCampaignsPage';
import MarketingCampaignEditorPage from '../pages/MarketingCampaignEditorPage';
import MarketingSubscribersPage from '../pages/MarketingSubscribersPage';
import MarketingTemplatesPage from '../pages/MarketingTemplatesPage';
import MarketingTemplateEditorPage from '../pages/MarketingTemplateEditorPage';
import MarketingAutomationFlowsPage from '../pages/MarketingAutomationFlowsPage';
import MarketingAutomationFlowEditorPage from '../pages/MarketingAutomationFlowEditorPage';
import LivestreamPage from '../pages/LivestreamPage';

type DashboardSection = 'home' | 'race-management' | 'club-management' | 'race-calendar' | 'team-management' | 'results' | 'yacht-classes';

interface OrganizationPageBuilderWrapperProps {
  organizationType: OrganizationType;
  organizationId: string;
  darkMode: boolean;
  onClose: () => void;
}

const OrganizationPageBuilderWrapper: React.FC<OrganizationPageBuilderWrapperProps> = ({
  organizationType,
  organizationId,
  darkMode,
  onClose
}) => {
  const { pageSlug } = useParams<{ pageSlug: string }>();
  const [pageTitle, setPageTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPageTitle = async () => {
      if (!pageSlug) return;
      try {
        const { data } = await supabase
          .from('organization_page_layouts')
          .select('page_title')
          .eq('club_id', organizationId)
          .eq('page_slug', pageSlug)
          .maybeSingle();
        if (data) {
          setPageTitle(data.page_title);
        } else {
          setPageTitle(pageSlug.charAt(0).toUpperCase() + pageSlug.slice(1).replace(/-/g, ' '));
        }
      } catch (err) {
        console.error('Error loading page title:', err);
      } finally {
        setLoading(false);
      }
    };
    loadPageTitle();
  }, [organizationId, pageSlug]);

  if (!pageSlug || loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <OrganizationPageBuilderEditor
      organizationType={organizationType}
      organizationId={organizationId}
      pageSlug={pageSlug}
      pageTitle={pageTitle}
      onClose={onClose}
      darkMode={darkMode}
    />
  );
};

interface DashboardLayoutProps {
  darkMode: boolean;
  selectedEvent: RaceEvent | null;
  onEventSelect: (event: RaceEvent) => void;
  onStartScoring: () => void;
  onClearSelectedEvent: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  darkMode,
  selectedEvent,
  onEventSelect,
  onStartScoring,
  onClearSelectedEvent
}) => {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeRaces: 0,
    clubMembers: 0,
    upcomingEvents: 0
  });
  const { user, userClubs, currentClub, currentOrganization, setCurrentClub, setCurrentOrganization, signOut, isSuperAdmin, isNationalOrgAdmin, isStateOrgAdmin } = useAuth();
  const { can, isMember } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    // Force collapse on tablets and iPads (< 1280px)
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      return true;
    }
    // Check for user preference on desktop
    const userPreference = localStorage.getItem('sidebarCollapsed');
    if (userPreference !== null) {
      return userPreference === 'true';
    }
    // Default to collapsed (true) to save screen real estate
    return true;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showSuperAdminModal, setShowSuperAdminModal] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const { addNotification } = useNotifications();
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [unreadTasksCount, setUnreadTasksCount] = useState(0);
  const [membershipActionCount, setMembershipActionCount] = useState(0);
  const [showImportMembersModal, setShowImportMembersModal] = useState(false);
  const [isHoveringNav, setIsHoveringNav] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('navExpandedGroups');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {};
      }
    }
    return {};
  });
  const [isTouchDevice, setIsTouchDevice] = useState(() => {
    // Detect if this is a touch device (iPad, tablet, etc.)
    return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  });
  const [isDesktop, setIsDesktop] = useState(() => {
    return typeof window !== 'undefined' && window.innerWidth >= 1280;
  });

  // Check if we're in the page editor
  const isPageEditor = location.pathname.includes('/website/pages/edit') || location.pathname.includes('/website/pages/new');

  // Listen for storage events (for sidebar state changes from other components)
  useEffect(() => {
    const handleStorageChange = () => {
      const sidebarState = localStorage.getItem('sidebarCollapsed');
      if (sidebarState !== null) {
        setCollapsed(sidebarState === 'true');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Handle responsive sidebar collapse
  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1280;
      setIsDesktop(desktop);

      // Force collapse on iPad Pro and smaller (< 1280px)
      if (!desktop) {
        setCollapsed(true);
        localStorage.setItem('sidebarCollapsed', 'true');
      }
    };

    window.addEventListener('resize', handleResize);
    // Run on mount
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Load light mode preference
    const savedLightMode = localStorage.getItem('lightMode');
    if (savedLightMode !== null) {
      setLightMode(savedLightMode === 'true');
    }

    // Listen for light mode changes from SettingsPage
    const handleLightModeChange = (e: CustomEvent) => {
      setLightMode(e.detail.lightMode);
    };

    // Listen for storage changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'lightMode') {
        setLightMode(e.newValue === 'true');
      }
    };

    window.addEventListener('lightModeChange', handleLightModeChange as EventListener);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('lightModeChange', handleLightModeChange as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    // Apply light mode to body
    document.body.classList.toggle('light-mode', lightMode);
  }, [lightMode]);

  useEffect(() => {
    loadStats();
    fetchUnreadNotificationsCount();
    fetchUnreadTasksCount();
    fetchMembershipActionCount();
  }, [currentClub]);

  // Subscribe to realtime changes on members table
  useEffect(() => {
    if (!currentClub?.clubId) return;

    const channelName = `dashboard-members-${currentClub.clubId}`;
    const channel = getOrCreateChannel(channelName, (ch) =>
      ch.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'members',
          filter: `club_id=eq.${currentClub.clubId}`,
        },
        () => {
          // Refresh stats when members change
          loadStats();
        }
      )
      .subscribe()
    );

    return () => {
      removeChannelByName(channelName);
    };
  }, [currentClub?.clubId]);

  useEffect(() => {
    // Refresh counts when navigating between pages
    fetchUnreadNotificationsCount();
    fetchUnreadTasksCount();
  }, [location.pathname]);

  useEffect(() => {
    // Subscribe to notifications and tasks changes
    // ONLY depend on IDs, not full objects - this prevents unnecessary channel recreation
    if (!user?.id || !currentClub?.clubId) return;

    const userId = user.id;
    const clubId = currentClub.clubId;

    const channels = [
      {
        name: `notifications-${userId}`,
        setup: (ch: any) => ch.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        }, () => fetchUnreadNotificationsCount()).subscribe()
      },
      {
        name: `tasks-${userId}`,
        setup: (ch: any) => ch.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'club_tasks'
        }, () => fetchUnreadTasksCount()).subscribe()
      },
      {
        name: `task-comments-${userId}`,
        setup: (ch: any) => ch.on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'task_comments'
        }, () => fetchUnreadTasksCount()).subscribe()
      },
      {
        name: `membership-apps-${clubId}`,
        setup: (ch: any) => ch.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'membership_applications',
          filter: `club_id=eq.${clubId}`
        }, () => fetchMembershipActionCount()).subscribe()
      },
      {
        name: `members-payment-${clubId}`,
        setup: (ch: any) => ch.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'members',
          filter: `club_id=eq.${clubId}`
        }, () => fetchMembershipActionCount()).subscribe()
      },
      {
        name: `remittances-${clubId}`,
        setup: (ch: any) => ch.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'membership_remittances',
          filter: `club_id=eq.${clubId}`
        }, () => fetchMembershipActionCount()).subscribe()
      }
    ];

    // Create all channels
    channels.forEach(({ name, setup }) => {
      getOrCreateChannel(name, setup);
    });

    return () => {
      // Cleanup all channels
      channels.forEach(({ name }) => {
        removeChannelByName(name);
      });
    };
  }, [user?.id, currentClub?.clubId]);

  useEffect(() => {
    // Load user's manual preference if it exists
    const savedCollapsed = localStorage.getItem('sidebarCollapsed');
    if (savedCollapsed !== null) {
      setCollapsed(savedCollapsed === 'true');
    }
    // Otherwise, the initial state already handles the responsive default
  }, []);

  const toggleSidebar = () => {
    // Prevent expanding on tablets/iPads
    if (window.innerWidth < 1280 && collapsed) {
      return; // Don't allow expansion on smaller screens
    }
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem('sidebarCollapsed', String(newCollapsed));
  };

  const toggleNavGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const isCurrentlyExpanded = prev[groupId] ?? false;

      // If we're opening a new group (not closing), close all other groups first
      if (!isCurrentlyExpanded) {
        // Close all groups and open only the clicked one
        const newState = { [groupId]: true };
        localStorage.setItem('navExpandedGroups', JSON.stringify(newState));
        return newState;
      } else {
        // Just toggle this group (closing it)
        const newState = { ...prev, [groupId]: false };
        localStorage.setItem('navExpandedGroups', JSON.stringify(newState));
        return newState;
      }
    });
  };

  const isGroupExpanded = (groupId: string) => {
    return expandedGroups[groupId] ?? false;
  };

  const fetchUnreadNotificationsCount = async () => {
    if (!user || !currentClub?.clubId) return;

    // Skip if offline - not critical for offline functionality
    if (!navigator.onLine) {
      console.log('Offline - skipping notification count fetch');
      return;
    }

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('club_id', currentClub.clubId)
        .eq('read', false);

      if (error) {
        console.error('Error fetching unread notifications count:', error);
        return;
      }

      setUnreadNotificationsCount(count || 0);
    } catch (err) {
      console.error('Error fetching unread notifications count:', err);
    }
  };

  const fetchUnreadTasksCount = async () => {
    if (!user || !currentClub?.clubId) return;

    if (!navigator.onLine) return;

    try {
      const { data: memberData } = await supabase
        .from('members')
        .select('id')
        .eq('club_id', currentClub.clubId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!memberData) {
        setUnreadTasksCount(0);
        return;
      }

      const { count, error } = await supabase
        .from('club_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assignee_id', memberData.id)
        .eq('club_id', currentClub.clubId)
        .in('status', ['pending', 'in_progress']);

      if (error) throw error;

      setUnreadTasksCount(count || 0);
    } catch (err) {
      console.error('Error fetching active tasks count:', err);
      setUnreadTasksCount(0);
    }
  };

  const fetchMembershipActionCount = async () => {
    if (!currentClub?.clubId) {
      setMembershipActionCount(0);
      return;
    }

    try {
      // Only count pending applications (exclude drafts)
      // This acts as an alert for outstanding membership applications
      const { count: applicationsCount, error: appsError } = await supabase
        .from('membership_applications')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', currentClub.clubId)
        .eq('status', 'pending')
        .eq('is_draft', false);

      if (appsError) {
        console.error('Error fetching applications count:', appsError);
        setMembershipActionCount(0);
      } else {
        setMembershipActionCount(applicationsCount || 0);
      }
    } catch (err) {
      console.error('Error fetching membership action count:', err);
      setMembershipActionCount(0);
    }
  };

  const loadStats = async () => {
    try {
      setLoading(true);
      
      // Fetch both quick races, series events, and public events
      const [raceEvents, raceSeries, members, clubs, publicEvents] = await Promise.all([
        getStoredRaceEvents(),
        getStoredRaceSeries(),
        getStoredMembers(),
        getStoredClubs(),
        getPublicEvents()
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Count active races (incomplete races)
      const activeQuickRaces = raceEvents.filter(event => !event.completed).length;
      const activeSeries = raceSeries.filter(series => !series.completed).length;
      const activeRaces = activeQuickRaces + activeSeries;

      // Count upcoming events
      const upcomingQuickRaces = raceEvents.filter(event => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate >= today && !event.completed && !event.cancelled;
      }).length;

      const upcomingSeriesRounds = raceSeries.reduce((count, series) => {
        return count + series.rounds.filter(round => {
          const roundDate = new Date(round.date);
          roundDate.setHours(0, 0, 0, 0);
          return roundDate >= today && !round.cancelled && !round.completed;
        }).length;
      }, 0);

      const upcomingPublicEvents = publicEvents.filter(event => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate >= today && !event.completed && !event.cancelled;
      }).length;

      const upcomingEvents = upcomingQuickRaces + upcomingSeriesRounds + upcomingPublicEvents;

      setStats({
        activeRaces,
        clubMembers: members.length,
        upcomingEvents
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSectionChange = (path: string) => {
    // Navigate immediately without showing loading overlay
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  const handleSignOut = async () => {
    try {
      console.log('Signing out from DashboardLayout');
      
      // Clear any local storage first
      localStorage.removeItem('currentClubId');
      localStorage.removeItem('current-event');
      sessionStorage.clear();
      
      // Then call the signOut function
      await signOut();
      
      console.log('Sign out successful, redirecting to login');
      
      // Force redirect to login page
      window.location.href = '/login';
    } catch (error) {
      console.error('Error signing out:', error);
      // Force redirect to login page if signOut fails
      window.location.href = '/login';
    }
  };

  const handleStartScoring = () => {
    if (onStartScoring) {
      onStartScoring();
      onClearSelectedEvent(); // Clear the selected event to close the modal
    }
  };

  const handleEventSelect = (event: RaceEvent) => {
    onEventSelect(event);
    setShowEventDetails(true);
  };

  const handleCloseEventDetails = () => {
    setShowEventDetails(false);
    onClearSelectedEvent();
  };

  const handleEventDataUpdated = () => {
    // Force DashboardHome to refresh by changing its key
    setDashboardRefreshKey(prev => prev + 1);
  };

  const handleSuperAdminEventSuccess = () => {
    // Refresh data after adding/editing a public event
    loadStats();
  };

  const allNavigationSections = [
    {
      id: 'dashboard',
      label: null,
      collapsible: false,
      items: [
        {
          id: 'home',
          label: 'Dashboard',
          icon: Home,
          description: 'Overview',
          path: '/'
        }
      ]
    },
    ...(currentOrganization?.type === 'national' ? [{
      id: 'associations',
      label: 'Associations',
      collapsible: true,
      items: [
        {
          id: 'associations',
          label: 'State Associations',
          icon: Building,
          description: 'Manage state associations',
          path: '/associations'
        }
      ]
    }] : []),
    {
      id: 'racing',
      label: 'Racing',
      collapsible: true,
      icon: Flag,
      items: [
        {
          id: 'race-management',
          label: 'Race Management',
          icon: Flag,
          description: 'Manage races and series',
          path: '/race-management',
          permission: 'races.manage'
        },
        {
          id: 'race-calendar',
          label: 'Race Calendar',
          icon: Calendar,
          description: 'View upcoming races',
          path: '/calendar'
        },
        {
          id: 'results',
          label: 'Results',
          icon: Trophy,
          description: 'View race results',
          path: '/results'
        },
        {
          id: 'hms-validator',
          label: 'HMS Validator',
          icon: FileCheck,
          description: 'Validate AlfiePRO results against HMS scoring',
          path: '/hms-validator'
        },
        {
          id: 'yacht-classes',
          label: 'Yacht Classes',
          icon: Sailboat,
          description: 'View yacht classes sailed at the club',
          path: '/yacht-classes'
        }
      ]
    },
    {
      id: 'content-media',
      label: 'Content & Media',
      collapsible: true,
      icon: Camera,
      items: [
        {
          id: 'news',
          label: 'News',
          icon: Newspaper,
          description: 'Club news and announcements',
          path: '/news'
        },
        {
          id: 'media',
          label: 'Media',
          icon: Camera,
          description: 'Manage club media',
          path: '/media'
        },
        {
          id: 'alfie-tv',
          label: 'AlfieTV',
          icon: Tv,
          description: 'Watch RC yachting videos',
          path: '/alfie-tv'
        },
        {
          id: 'livestream',
          label: 'Livestream',
          icon: Video,
          description: 'Broadcast races to YouTube',
          path: '/livestream'
        }
      ]
    },
    ...(currentOrganization?.type === 'state' || currentOrganization?.type === 'national' ? [{
      id: 'membership-assoc',
      label: 'Membership',
      collapsible: true,
      icon: Users,
      items: [
        {
          id: 'import-members',
          label: 'Import Members',
          icon: Upload,
          description: 'Bulk import members from CSV',
          path: '#',
          onClick: () => setShowImportMembersModal(true)
        },
        ...(currentOrganization?.type === 'state' ? [{
          id: 'clubs',
          label: 'Clubs',
          icon: Building,
          description: 'Manage member clubs',
          path: '/clubs'
        }] : []),
        {
          id: 'association-members',
          label: 'Club Members',
          icon: Users,
          description: currentOrganization?.type === 'national' ? 'View all members across associations' : 'View all members in member clubs',
          path: '/association-members'
        },
        {
          id: 'association-member-reports',
          label: 'Member Reports',
          icon: TrendingUp,
          description: 'View member analytics and custom reports',
          path: '/association-member-reports'
        },
        {
          id: 'association-remittances',
          label: 'Remittances',
          icon: DollarSign,
          description: 'Track membership fee remittances',
          path: '/association-remittances'
        },
        {
          id: 'finances-assoc',
          label: 'Finances',
          icon: DollarSign,
          description: 'Manage association finances',
          path: '/finances'
        },
        ...(currentOrganization?.type === 'national' ? [{
          id: 'rankings',
          label: 'National Rankings',
          icon: Award,
          description: 'Manage national skipper rankings',
          path: '/rankings'
        }, {
          id: 'name-mapping',
          label: 'Name Mapping',
          icon: Link,
          description: 'Map rankings to member records',
          path: '/name-mapping'
        }] : [])
      ]
    }] : []),
    ...(!currentOrganization ? [{
      id: 'club-operations',
      label: 'Club Operations',
      collapsible: true,
      icon: Users,
      items: [
        {
          id: 'membership-dashboard',
          label: isMember ? 'My Membership' : 'Club Membership',
          icon: Users,
          description: isMember ? 'Manage your membership' : 'Manage Club Memberships',
          path: '/membership-dashboard'
        },
        ...(isMember ? [{
          id: 'my-boats',
          label: 'My Boats',
          icon: Anchor,
          description: 'Manage your registered boats',
          path: '/my-boats'
        }] : []),
        {
          id: 'meetings',
          label: 'Meetings',
          icon: Calendar,
          description: 'Manage club meetings',
          path: '/meetings'
        },
        {
          id: 'tasks',
          label: 'Tasks',
          icon: CheckSquare,
          description: 'Manage club tasks',
          path: '/tasks'
        },
        {
          id: 'finances',
          label: 'Finances',
          icon: DollarSign,
          description: 'Manage club finances',
          path: '/finances',
          permission: 'finance.manage'
        }
      ]
    }] : []),
    {
      id: 'communications',
      label: 'Communications',
      collapsible: true,
      icon: Mail,
      items: [
        {
          id: 'comms',
          label: 'Inbox & Notifications',
          icon: Mail,
          description: 'Send and manage member communications',
          path: '/comms'
        },
        {
          id: 'marketing',
          label: 'Marketing',
          icon: Send,
          description: 'Email campaigns and automation flows',
          path: '/marketing',
          permission: 'admin'
        },
        {
          id: 'community',
          label: 'Community',
          icon: MessageSquare,
          description: 'Connect with other members',
          path: '/community'
        }
      ]
    },
    {
      id: 'resources-tools',
      label: 'Resources & Tools',
      collapsible: true,
      icon: FolderOpen,
      items: [
        {
          id: 'resources',
          label: 'Resources',
          icon: FolderOpen,
          description: currentOrganization
            ? 'Manage documents, files, and links for clubs'
            : 'Manage documents, files, and links',
          path: '/resources'
        },
        {
          id: 'venues',
          label: 'Venues',
          icon: MapPin,
          description: 'Manage racing venues',
          path: '/venues'
        },
        {
          id: 'my-garage',
          label: 'Boat Shed',
          icon: Wrench,
          description: 'Manage your boats, maintenance, and rig tuning',
          path: '/my-garage'
        },
        {
          id: 'weather',
          label: 'Weather',
          icon: Wind,
          description: 'Live marine weather forecast',
          path: '/weather'
        },
        {
          id: 'classifieds',
          label: 'Classifieds',
          icon: Tag,
          description: 'Buy, sell, and trade sailing gear',
          path: '/classifieds'
        }
      ]
    },
    {
      id: 'website',
      label: 'Website',
      collapsible: true,
      icon: Monitor,
      items: [
        {
          id: 'website',
          label: 'Website Manager',
          icon: Monitor,
          description: 'Manage club website',
          path: '/website',
          permission: 'website.manage'
        }
      ]
    }
  ];

  // Filter navigation sections based on permissions
  const navigationSections = allNavigationSections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (!item.permission) return true;
      return can(item.permission as any);
    })
  })).filter(section => section.items.length > 0);

  return (
    <div className={`min-h-screen ${lightMode ? 'bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200' : 'bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a]'}`}>
      {/* Loading overlay when switching organizations */}
      {isTransitioning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="bg-slate-800 rounded-xl p-6 shadow-2xl border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-white font-medium">Switching organization...</span>
            </div>
          </div>
        </div>
      )}

      {/* Left Navigation - Hidden in page editor */}
      {!isPageEditor && (
      <div
        className={`
          fixed inset-y-0 left-0 z-40 transition-all duration-300 ease-in-out
          ${(collapsed && !isHoveringNav) ? 'w-[70px]' : 'w-64'}
          ${lightMode ? 'bg-white/60' : darkMode ? 'bg-slate-800/50 border-r border-slate-700/50' : 'bg-white/10 border-r border-slate-200/20'}
          backdrop-blur-xl
        `}
        onMouseEnter={() => !isTouchDevice && setIsHoveringNav(true)}
        onMouseLeave={() => !isTouchDevice && setIsHoveringNav(false)}
      >
        <div className="flex flex-col h-full">
          <div className={`p-5 flex items-center ${(collapsed && !isHoveringNav) ? 'justify-center' : 'justify-between'}`}>
            {/* Logo */}
            <div className={`flex items-center gap-2 ${(collapsed && !isHoveringNav) ? 'justify-center' : ''}`}>
              <Logo size="small" />
              {(!collapsed || isHoveringNav) && (
                <div>
                  <h1 className="text-2xl text-white tracking-wide">
                    <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
                  </h1>
                </div>
              )}
            </div>
            
            {/* Collapse/Expand Button - Only show on desktop (>= 1280px) */}
            {isDesktop && (
              <button
                onClick={toggleSidebar}
                className={`${(collapsed && !isHoveringNav) ? 'absolute -right-3 top-5 bg-slate-700 rounded-full p-1 shadow-md text-slate-300' : 'p-1 rounded-full text-slate-400 hover:text-slate-300 hover:bg-slate-700'}`}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            )}
          </div>

          {/* Navigation Items */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <nav className="space-y-1 pb-4">
              {navigationSections.map((section, sectionIndex) => {
                const sectionId = section.id || `section-${sectionIndex}`;
                const isExpanded = !section.collapsible || isGroupExpanded(sectionId);
                const SectionIcon = section.icon;
                const hasActiveItem = section.items.some(item =>
                  location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path))
                );

                return (
                <div key={sectionId}>
                  {/* Collapsible Section Header */}
                  {section.collapsible && section.label ? (
                    (collapsed && !isHoveringNav) ? (
                      // Collapsed mode - show icon only (but hide when expanded to avoid duplicate icons)
                      !isExpanded ? (
                        <button
                          onClick={() => toggleNavGroup(sectionId)}
                          className={`
                            w-full flex items-center justify-center p-2.5 mt-2 rounded-lg transition-all relative
                            ${hasActiveItem && !isExpanded
                              ? lightMode
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-blue-900/30 text-blue-300'
                              : lightMode
                                ? 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                            }
                          `}
                          title={section.label}
                        >
                          {SectionIcon && <SectionIcon size={18} className="opacity-70" />}
                          {hasActiveItem && !isExpanded && (
                            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500"></div>
                          )}
                        </button>
                      ) : null
                    ) : (
                      // Expanded mode - show full header
                      <button
                        onClick={() => toggleNavGroup(sectionId)}
                        className={`
                          w-full flex items-center justify-between px-3 py-2 mt-2 rounded-lg transition-all
                          ${hasActiveItem && !isExpanded
                            ? lightMode
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-blue-900/30 text-blue-300'
                            : lightMode
                              ? 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                          }
                        `}
                      >
                        <div className="flex items-center gap-2">
                          {SectionIcon && <SectionIcon size={16} className="opacity-70" />}
                          <span className="text-xs font-semibold uppercase tracking-wider">
                            {section.label}
                          </span>
                          {hasActiveItem && !isExpanded && (
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                          )}
                        </div>
                        <ChevronDown
                          size={14}
                          className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    )
                  ) : !section.collapsible && section.label && (!collapsed || isHoveringNav) ? (
                    <div className="px-3 pt-4 pb-2">
                      <h3 className={`text-xs font-semibold uppercase tracking-wider ${
                        lightMode ? 'text-gray-400' : 'text-slate-500'
                      }`}>
                        {section.label}
                      </h3>
                    </div>
                  ) : null}

                  {/* Section Items - with animation */}
                  <div
                    className={`
                      space-y-1 overflow-hidden transition-all duration-200 ease-in-out
                      ${!section.collapsible || isExpanded ? 'max-h-[1000px] opacity-100 mt-1' : 'max-h-0 opacity-0'}
                    `}
                  >
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.path ||
                                      (item.path !== '/' && location.pathname.startsWith(item.path));

                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (item.onClick) {
                              item.onClick();
                            } else {
                              handleSectionChange(item.path);
                            }
                          }}
                          className={`
                            w-full flex items-center py-2 px-3 rounded-lg transition-all relative
                            ${(collapsed && !isHoveringNav) ? 'justify-center' : 'gap-3'}
                            ${section.collapsible && (!collapsed || isHoveringNav) ? 'pl-5' : ''}
                            ${isActive
                              ? 'bg-blue-600 text-white shadow-lg'
                              : lightMode
                                ? 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                                : darkMode
                                  ? 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                                  : 'text-slate-200 hover:text-white hover:bg-white/10'
                            }
                          `}
                          title={(collapsed && !isHoveringNav) ? `${item.label} - ${item.description}` : ''}
                        >
                          <Icon size={18} className={`flex-shrink-0 ${isActive ? '!text-white' : ''}`} />
                          {(!collapsed || isHoveringNav) && (
                            <div className="text-left flex-1 flex items-center gap-2">
                              <div className={`text-sm font-medium ${isActive ? '!text-white' : ''}`}>{item.label}</div>
                              {item.id === 'comms' && unreadNotificationsCount > 0 && (
                                <div className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-green-500 text-white text-xs font-bold rounded-full">
                                  {unreadNotificationsCount}
                                </div>
                              )}
                              {item.id === 'tasks' && unreadTasksCount > 0 && (
                                <div className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-green-500 text-white text-xs font-bold rounded-full">
                                  {unreadTasksCount}
                                </div>
                              )}
                              {item.id === 'membership-dashboard' && membershipActionCount > 0 && (
                                <div className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-green-500 text-white text-xs font-bold rounded-full">
                                  {membershipActionCount}
                                </div>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                </div>
                );
              })}
            </nav>
          </div>


          {/* Club Switcher */}
          <div className={`px-3 py-3 border-t ${lightMode ? 'border-gray-200/50' : 'border-slate-700/50'} ${(collapsed && !isHoveringNav) ? 'flex flex-col items-center' : ''}`}>
            {!collapsed && <p className={`text-xs mb-2 px-2 ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>Current Club</p>}
            <ClubSwitcher
              currentClubId={currentOrganization?.id || currentClub?.clubId || null}
              onClubChange={async (orgId) => {
                try {
                  const club = userClubs.find(c => c.clubId === orgId);
                  if (club) {
                    // Switching to a club
                    setCurrentClub(club);
                    setCurrentOrganization(null);
                    // Force dashboard refresh with new key
                    setDashboardRefreshKey(prev => prev + 1);
                    // Always navigate to home when switching contexts
                    navigate('/');
                  } else {
                    // Only show loader when fetching association data from database
                    setIsTransitioning(true);

                    // First, check what type of organization this is
                    // Check if it's a state association (direct lookup)
                    const { data: stateAssocInfo } = await supabase
                      .from('state_associations')
                      .select('id, name, short_name, national_association_id')
                      .eq('id', orgId)
                      .maybeSingle();

                    if (stateAssocInfo) {
                      // It's a state association - check if user has access
                      // 1. Check for direct role
                      const { data: directRole } = await supabase
                        .from('user_state_associations')
                        .select('role')
                        .eq('user_id', user?.id)
                        .eq('state_association_id', orgId)
                        .maybeSingle();

                      let userRole = directRole?.role;

                      // 2. If no direct role, check if user is national admin of parent
                      if (!userRole && stateAssocInfo.national_association_id) {
                        const { data: nationalAdminRole } = await supabase
                          .from('user_national_associations')
                          .select('role')
                          .eq('user_id', user?.id)
                          .eq('national_association_id', stateAssocInfo.national_association_id)
                          .maybeSingle();

                        if (nationalAdminRole?.role === 'national_admin') {
                          userRole = 'national_admin'; // Inherited role
                        }
                      }

                      if (userRole) {
                        setCurrentOrganization({
                          id: orgId,
                          type: 'state',
                          name: stateAssocInfo.short_name || stateAssocInfo.name,
                          role: userRole
                        });
                        setCurrentClub(null);
                        setIsTransitioning(false);
                        navigate('/');
                        return;
                      }
                    }

                    // Check if this is a national association
                    const { data: nationalAssoc } = await supabase
                      .from('user_national_associations')
                      .select('national_association_id, role, national_associations(name, short_name)')
                      .eq('user_id', user?.id)
                      .eq('national_association_id', orgId)
                      .maybeSingle();

                    if (nationalAssoc) {
                      const na = nationalAssoc.national_associations as any;
                      setCurrentOrganization({
                        id: orgId,
                        type: 'national',
                        name: na?.short_name || na?.name || '',
                        role: nationalAssoc.role
                      });
                      setCurrentClub(null);
                      setIsTransitioning(false);
                      navigate('/');
                    } else {
                      setIsTransitioning(false);
                    }
                  }
                } catch (error) {
                  console.error('Error switching organization:', error);
                  setIsTransitioning(false);
                }
              }}
              className={(collapsed && !isHoveringNav) ? "w-10 h-10 overflow-hidden p-0" : "w-full"}
              isCollapsed={collapsed && !isHoveringNav}
              darkMode={!lightMode}
            />

            {/* Bottom Actions */}
            <div className={`space-y-1 mt-3 ${(collapsed && !isHoveringNav) ? 'flex flex-col items-center' : ''}`}>
              <button
                onClick={() => handleSectionChange('/settings')}
                className={`
                  ${(collapsed && !isHoveringNav) ? 'flex items-center justify-center' : 'w-full flex items-center gap-3'} px-3 py-2.5
                  rounded-lg transition-colors
                  ${location.pathname === '/settings'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : lightMode
                      ? 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                      : darkMode
                        ? 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                        : 'text-slate-200 hover:text-white hover:bg-white/10'
                  }
                `}
                title={(collapsed && !isHoveringNav) ? "Settings" : ""}
              >
                <Settings size={16} className={location.pathname === '/settings' ? '!text-white' : ''} />
                {(!collapsed || isHoveringNav) && <span className={`text-sm ${location.pathname === '/settings' ? '!text-white' : ''}`}>Settings</span>}
              </button>
              <button
                onClick={handleSignOut}
                className={`
                  ${(collapsed && !isHoveringNav) ? 'flex items-center justify-center' : 'w-full flex items-center gap-3'} px-3 py-2.5
                  rounded-lg transition-colors
                  ${lightMode
                    ? 'text-gray-700 hover:text-red-600 hover:bg-red-50'
                    : darkMode
                      ? 'text-slate-300 hover:text-red-400 hover:bg-red-900/20'
                      : 'text-slate-200 hover:text-red-400 hover:bg-red-900/20'
                  }
                `}
                title={(collapsed && !isHoveringNav) ? "Sign Out" : ""}
              >
                <LogOut size={16} />
                {(!collapsed || isHoveringNav) && <span className="text-sm">Sign Out</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Mobile menu button - Hidden in page editor, shown only on small screens */}
      {!isPageEditor && (
      <>
        <div className="fixed top-4 left-4 z-50 sm:hidden">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            <ChevronDown size={24} />
          </button>
        </div>

        {/* Mobile sidebar */}
        {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          <div className={`fixed inset-y-0 left-0 w-64 border-r z-50 ${lightMode ? 'bg-white border-gray-200' : 'bg-slate-900 border-slate-700'}`}>
            <div className={`p-4 border-b flex items-center justify-between ${lightMode ? 'border-gray-200' : 'border-slate-700'}`}>
              <div className="flex items-center gap-2">
                <Logo size="small" />
                <div>
                  <h1 className={`text-2xl tracking-wide ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                    <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
                  </h1>
                </div>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className={lightMode ? 'text-gray-500 hover:text-gray-700 p-1' : 'text-slate-400 hover:text-slate-300 p-1'}
              >
                <ChevronUp size={20} />
              </button>
            </div>

            <div className="py-4 overflow-y-auto max-h-[calc(100vh-80px)]">
              <nav className="px-3 space-y-1">
                {navigationSections.map((section, sectionIndex) => {
                  const sectionId = section.id || `mobile-section-${sectionIndex}`;
                  const isExpanded = !section.collapsible || isGroupExpanded(sectionId);
                  const SectionIcon = section.icon;
                  const hasActiveItem = section.items.some(item =>
                    location.pathname === item.path ||
                    (item.path !== '/' && location.pathname.startsWith(item.path))
                  );

                  return (
                  <div key={sectionId}>
                    {/* Collapsible Section Header */}
                    {section.collapsible && section.label ? (
                      <button
                        onClick={() => toggleNavGroup(sectionId)}
                        className={`
                          w-full flex items-center justify-between px-3 py-2 mt-1 rounded-lg transition-all
                          ${hasActiveItem && !isExpanded
                            ? lightMode
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-blue-900/30 text-blue-300'
                            : lightMode
                              ? 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                          }
                        `}
                      >
                        <div className="flex items-center gap-2">
                          {SectionIcon && <SectionIcon size={16} className="opacity-70" />}
                          <span className="text-xs font-semibold uppercase tracking-wider">
                            {section.label}
                          </span>
                          {hasActiveItem && !isExpanded && (
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                          )}
                        </div>
                        <ChevronDown
                          size={14}
                          className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    ) : section.label ? (
                      <div className="px-3 pt-3 pb-1">
                        <h3 className={`text-xs font-semibold uppercase tracking-wider ${
                          lightMode ? 'text-gray-400' : 'text-slate-500'
                        }`}>
                          {section.label}
                        </h3>
                      </div>
                    ) : null}

                    {/* Section Items - with animation */}
                    <div
                      className={`
                        space-y-0.5 overflow-hidden transition-all duration-200 ease-in-out
                        ${!section.collapsible || isExpanded ? 'max-h-[1000px] opacity-100 mt-1' : 'max-h-0 opacity-0'}
                      `}
                    >
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path ||
                                        (item.path !== '/' && location.pathname.startsWith(item.path));

                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              if (item.onClick) {
                                item.onClick();
                              } else {
                                handleSectionChange(item.path);
                              }
                            }}
                            className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors ${
                              section.collapsible ? 'pl-5' : ''
                            } ${
                              isActive
                                ? 'bg-blue-600 text-white'
                                : lightMode
                                  ? 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            <Icon size={18} className={`flex-shrink-0 ${isActive ? '!text-white' : ''}`} />
                            <div className="ml-3 flex-1 flex items-center gap-2">
                              <span className={`text-sm font-medium ${isActive ? '!text-white' : ''}`}>{item.label}</span>
                              {item.id === 'comms' && unreadNotificationsCount > 0 && (
                                <div className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-green-500 text-white text-xs font-bold rounded-full">
                                  {unreadNotificationsCount}
                                </div>
                              )}
                              {item.id === 'tasks' && unreadTasksCount > 0 && (
                                <div className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-green-500 text-white text-xs font-bold rounded-full">
                                  {unreadTasksCount}
                                </div>
                              )}
                              {item.id === 'membership-dashboard' && membershipActionCount > 0 && (
                                <div className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-green-500 text-white text-xs font-bold rounded-full">
                                  {membershipActionCount}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
        )}
      </>
      )}

      {/* Main Content */}
      <div className={`transition-all duration-300 ${isPageEditor ? '' : (collapsed ? 'ml-[70px]' : 'ml-64')}`}>
        <div className="h-full">
          <div className={`h-full transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
            <Routes>
              <Route path="/" element={
                currentOrganization?.type === 'national' ? (
                  <NationalAssociationDashboard key={currentOrganization.id} darkMode={darkMode} />
                ) : currentOrganization?.type === 'state' ? (
                  <StateAssociationDashboard key={currentOrganization.id} darkMode={darkMode} />
                ) : (
                  <DashboardHome
                    key={dashboardRefreshKey}
                    darkMode={darkMode}
                    stats={stats}
                    onNavigate={(path) => handleSectionChange(path)}
                    onEventSelect={handleEventSelect}
                  />
                )
              } />
              <Route path="/associations" element={<AssociationsManagementPage darkMode={darkMode} />} />
              <Route path="/clubs" element={<ClubsManagementPage darkMode={darkMode} />} />
              <Route path="/association-members" element={
                currentOrganization?.type === 'national' ? (
                  <NationalAssociationMembers darkMode={darkMode} />
                ) : currentOrganization?.type === 'state' ? (
                  <StateAssociationMembers
                    darkMode={darkMode}
                    stateAssociationId={currentOrganization.id}
                  />
                ) : null
              } />
              <Route path="/association-member-reports" element={
                currentOrganization ? (
                  <AssociationMemberReports
                    darkMode={darkMode}
                    associationId={currentOrganization.id}
                    associationType={currentOrganization.type as 'state' | 'national'}
                  />
                ) : null
              } />
              <Route path="/association-remittances" element={
                <div className="h-full overflow-y-auto">
                  <div className="p-4 sm:p-6 lg:p-16">
                    {currentOrganization?.type === 'national' ? (
                      <NationalRemittanceDashboard
                        darkMode={darkMode}
                        nationalAssociationId={currentOrganization.id}
                      />
                    ) : currentOrganization?.type === 'state' ? (
                      <StateRemittanceDashboard
                        darkMode={darkMode}
                        stateAssociationId={currentOrganization.id}
                      />
                    ) : null}
                  </div>
                </div>
              } />
              <Route path="/rankings" element={
                <div className="h-full overflow-y-auto">
                  <div className="p-4 sm:p-6 lg:p-16">
                    {currentOrganization?.type === 'national' ? (
                      <RankingsManagement
                        nationalAssociationId={currentOrganization.id}
                      />
                    ) : null}
                  </div>
                </div>
              } />
              <Route path="/name-mapping" element={
                <div className="h-full overflow-y-auto">
                  <div className="p-4 sm:p-6 lg:p-16">
                    {currentOrganization?.type === 'national' && currentClub ? (
                      <NameMappingManager
                        nationalAssociationId={currentOrganization.id}
                        clubId={currentClub.clubId}
                      />
                    ) : null}
                  </div>
                </div>
              } />
              <Route path="/race-management" element={
                <RaceManagementPage
                  darkMode={darkMode}
                  selectedEvent={selectedEvent}
                  onEventSelect={onEventSelect}
                  onStartScoring={handleStartScoring}
                />
              } />
              <Route path="/weather" element={<WeatherPage />} />
              <Route path="/venues" element={<VenuesPage darkMode={darkMode} />} />
              <Route path="/my-garage" element={<MyGaragePage darkMode={darkMode} />} />
              <Route path="/members" element={<MembersPage darkMode={darkMode} />} />
              <Route path="/calendar" element={
                <RaceCalendar
                  events={[]}
                  darkMode={darkMode}
                  onEventSelect={onEventSelect}
                  onStartScoring={handleStartScoring}
                  onClose={() => handleSectionChange('/')}
                />
              } />
              <Route path="/results" element={<ResultsPage />} />
              <Route path="/results/:id" element={<ResultsPage />} />
              <Route path="/yacht-classes" element={<YachtClassesRouter darkMode={darkMode} />} />
              <Route path="/settings" element={<SettingsPage darkMode={darkMode} />} />
              <Route path="/settings/race-documents/form-builder" element={
                <FormBuilderPage 
                  editingForm={null}
                  onSuccess={() => {
                    navigate('/settings?tab=race-documents');
                  }}
                />
              } />
              <Route path="/settings/race-documents/template-builder" element={
                <DocumentTemplateBuilder
                  onSuccess={() => {
                    navigate('/settings?tab=race-documents');
                  }}
                />
              } />
              <Route path="/settings/race-documents/wysiwyg-builder" element={
                <WysiwygDocumentBuilder />
              } />
              <Route path="/membership-dashboard" element={<MembershipDashboard darkMode={darkMode} />} />
              <Route path="/my-boats" element={<MyBoatsPage darkMode={darkMode} />} />
              <Route path="/community" element={<CommunityPage darkMode={darkMode} />} />
              <Route path="/membership/:clubId" element={<MembershipPage />} />
              <Route path="/membership/:clubId/renew/:memberId" element={<MembershipPage />} />
              <Route path="/finances/*" element={
                currentOrganization?.type === 'national' ? (
                  <AssociationFinancesPage
                    darkMode={darkMode}
                    associationId={currentOrganization.id}
                    associationType="national"
                    associationName={currentOrganization.name}
                  />
                ) : currentOrganization?.type === 'state' ? (
                  <AssociationFinancesPage
                    darkMode={darkMode}
                    associationId={currentOrganization.id}
                    associationType="state"
                    associationName={currentOrganization.name}
                  />
                ) : (
                  <FinancesPage darkMode={darkMode} />
                )
              } />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/news/:id" element={<ArticleDetailPage />} />
              <Route path="/news/new" element={<ArticleEditorPage />} />
              <Route path="/news/edit/:id" element={<ArticleEditorPage />} />
              <Route path="/meetings" element={<MeetingsPage darkMode={darkMode} />} />
              <Route path="/tasks" element={<TasksPage darkMode={darkMode} />} />
              <Route path="/resources" element={<AssociationResourcesPage darkMode={darkMode} />} />
              <Route path="/classifieds" element={<ClassifiedsPage />} />
              <Route path="/comms" element={<CommsPage darkMode={darkMode} />} />
              <Route path="/marketing" element={<MarketingPage darkMode={darkMode} />} />
              <Route path="/marketing/campaigns" element={<MarketingCampaignsPage darkMode={darkMode} />} />
              <Route path="/marketing/campaigns/:id" element={<MarketingCampaignEditorPage darkMode={darkMode} />} />
              <Route path="/marketing/subscribers" element={<MarketingSubscribersPage darkMode={darkMode} />} />
              <Route path="/marketing/templates" element={<MarketingTemplatesPage darkMode={darkMode} />} />
              <Route path="/marketing/templates/:id/edit" element={<MarketingTemplateEditorPage darkMode={darkMode} />} />
              <Route path="/marketing/flows" element={<MarketingAutomationFlowsPage darkMode={darkMode} />} />
              <Route path="/marketing/flows/:id" element={<MarketingAutomationFlowEditorPage darkMode={darkMode} />} />
              <Route path="/media" element={<MediaPage darkMode={darkMode} />} />
              <Route path="/alfie-tv" element={<AlfieTVPage darkMode={darkMode} />} />
              <Route path="/alfie-tv/admin" element={<AlfieTVAdmin darkMode={darkMode} />} />
              <Route path="/livestream" element={<LivestreamPage />} />

              {/* Website Routes */}
              <Route path="/website" element={<WebsiteOverview darkMode={darkMode} />} />
              <Route path="/website/homepage" element={<WebsiteHomepageManager />} />
              <Route path="/website/pages" element={
                currentClub?.club?.id ? (
                  <OrganizationPageManager
                    organizationType="club"
                    organizationId={currentClub.club.id}
                    organizationName={currentClub.club.name || 'Club'}
                    darkMode={darkMode}
                    baseUrl={currentClub.club.subdomain ? `https://${currentClub.club.subdomain}.alfiesailing.com` : undefined}
                  />
                ) : (
                  <WebsitePages darkMode={darkMode} />
                )
              } />
              <Route path="/website/pages/edit/:pageSlug" element={
                currentClub?.club?.id ? (
                  <OrganizationPageBuilderWrapper
                    organizationType="club"
                    organizationId={currentClub.club.id}
                    darkMode={darkMode}
                    onClose={() => navigate('/website/pages')}
                  />
                ) : (
                  <WebsitePageEditorSimple onBack={() => navigate('/website/pages')} />
                )
              } />
              <Route path="/website/navigation" element={<WebsiteNavigation darkMode={darkMode} onBack={() => navigate('/website')} />} />
              <Route path="/website/theme" element={<WebsiteTheme darkMode={darkMode} />} />
              <Route path="/website/analytics" element={<ClubWebsiteAnalytics darkMode={darkMode} onBack={() => navigate('/website')} />} />
              <Route path="/website/event-websites-management" element={<EventWebsiteManagement darkMode={darkMode} />} />
              <Route path="/website/event-websites/:websiteId" element={<EventWebsiteDashboard darkMode={darkMode} />} />
              <Route path="/website/settings" element={<WebsiteSettings darkMode={darkMode} />} />
              
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        </div>
      </div>

      {/* Super Admin Event Modal */}
      {showSuperAdminModal && (
        <SuperAdminEventModal
          isOpen={showSuperAdminModal}
          onClose={() => setShowSuperAdminModal(false)}
          darkMode={darkMode}
          onSuccess={handleSuperAdminEventSuccess}
        />
      )}

      {/* Event Details Modal */}
      {showEventDetails && selectedEvent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <EventDetails
              event={selectedEvent}
              darkMode={darkMode}
              onStartScoring={onStartScoring}
              onClose={handleCloseEventDetails}
              onEventDataUpdated={handleEventDataUpdated}
            />
          </div>
        </div>
      )}

      {/* Association Member Import Modal */}
      {showImportMembersModal && currentOrganization && (
        <AssociationMemberImportModal
          isOpen={showImportMembersModal}
          onClose={() => setShowImportMembersModal(false)}
          associationId={currentOrganization.id}
          associationType={currentOrganization.type as 'state' | 'national'}
          associationName={currentOrganization.name}
        />
      )}
    </div>
  );
};
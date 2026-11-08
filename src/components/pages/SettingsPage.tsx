import React, { useState, useEffect, useRef } from 'react';
import { Settings, User, Building, Users, Shield, Mail, Phone, Save, TriangleAlert as AlertTriangle, Check, Globe, CreditCard, Upload, Trash2, Sun, Moon, FileText, Download, Smartphone, Sailboat, Percent, Tag, Receipt, DollarSign, Calendar, BookOpen, ScrollText, LayoutGrid, Megaphone, ChevronDown, Zap, Landmark, Flag, SlidersHorizontal, Share2, Search, X, ChevronRight, Camera, ImagePlus, Lock, Table2, Hand, Grid3x3, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useImpersonation } from '../../contexts/ImpersonationContext';
import { updateUserProfile } from '../../utils/auth';
import { usePermissions } from '../../hooks/usePermissions';
import { ClubSettings } from './ClubSettings';
import { ClubProfileSettings } from './ClubProfileSettings';
import { AssociationProfileSettings } from './AssociationProfileSettings';
import { AssociationUsersManagement } from './AssociationUsersManagement';
import { AssociationEmailLogs } from '../membership/AssociationEmailLogs';
import { ClubEmailLogs } from '../membership/ClubEmailLogs';
import { StateAssociationFeeSettings } from '../membership/StateAssociationFeeSettings';
import { NationalAssociationFeeSettings } from '../membership/NationalAssociationFeeSettings';
import { CommitteeManagement } from './CommitteeManagement';
import { DashboardTemplateManager } from './DashboardTemplateManager';
import { IntegrationsPage } from './IntegrationsPage';
import { FinanceSettingsPage } from './FinanceSettingsPage';
import { ExpenseApprovalSettings } from '../finances/ExpenseApprovalSettings';
import { MembershipSettingsPage } from './MembershipSettingsPage';
import { SubscriptionManagement } from './SubscriptionManagement';
import { RaceDocumentsPage } from './RaceDocumentsPage';
import { FormBuilderPage } from './FormBuilderPage';
import { DocumentTemplateBuilder } from './DocumentTemplateBuilder';
import { BackupRestoreSection } from './BackupRestoreSection';
import { AdvertisingManagement } from '../advertising/AdvertisingManagement';
import { StartBoxBuilder } from '../start-box/StartBoxBuilder';
import { ClubFeaturesAccess } from './ClubFeaturesAccess';
import { RaceOfficerTeamAccess } from './RaceOfficerTeamAccess';
import HandicapRuleBuilderPage from '../../pages/HandicapRuleBuilderPage';
import { ExternalOrganizationsPage } from '../../pages/ExternalOrganizationsPage';
import { ClubYachtClassesSelector } from '../ClubYachtClassesSelector';
import { formatDate } from '../../utils/date';
import { supabase } from '../../utils/supabase';
import { isValidUUID } from '../../utils/storage';
import { MemberOnboardingModal } from '../MemberOnboardingModal';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlfieIcon } from '../brand/AlfieIcon';

type SettingsItem = { id: string; title: string; desc: string; glyph: string; show: boolean; open: () => void };
type SettingsGroup = { id: string; title: string; dot: string; items: SettingsItem[] };
import { useNotifications } from '../../contexts/NotificationContext';

interface SettingsPageProps {
  darkMode: boolean;
}

type SettingsTab = 'profile' | 'club' | 'yacht-classes' | 'association' | 'association-fees' | 'association-users' | 'club-features' | 'team' | 'team-access' | 'subscriptions' | 'integrations' |
  'finance-tax' | 'finance-categories' | 'finance-documents' | 'finance-payment' | 'finance-payment-settings' | 'finance-opening-balance' | 'finance-approvals' |
  'membership-types' | 'membership-renewals' | 'membership-emails' | 'membership-conduct' |
  'race-documents' | 'import-export' | 'dashboard-templates' | 'advertising' | 'start-system' | 'handicap-rules' | 'email-logs' | 'club-email-logs';

export const SettingsPage: React.FC<SettingsPageProps> = ({ darkMode }) => {
  const { user, currentClub, currentOrganization, isRaceOfficer } = useAuth();
  const { isImpersonating, session: impersonationSession } = useImpersonation();
  const effectiveUserId = isImpersonating ? impersonationSession?.targetUserId : user?.id;
  const { can } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SettingsTab | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lightMode, setLightMode] = useState(() => {
    try { return localStorage.getItem('lightMode') === 'true'; } catch { return false; }
  });
  const [settingsQuery, setSettingsQuery] = useState('');
  const settingsListRef = useRef<HTMLDivElement>(null);

  const settingsSearchRef = useRef<HTMLInputElement>(null);
  const [recentSettings, setRecentSettings] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem('alfie.settings.recent') || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const rememberSetting = (id: string) => {
    setRecentSettings((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 8);
      try { localStorage.setItem('alfie.settings.recent', JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  };
  // ⌘, / Ctrl+, focuses the settings search (board hint)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',' && settingsSearchRef.current) {
        e.preventDefault();
        settingsSearchRef.current.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [membershipStatus, setMembershipStatus] = useState<'active' | 'expired' | 'none'>('none');
  const fromSetupChecklist = location.state?.fromSetupChecklist === true;
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [showMembershipModal, setShowMembershipModal] = useState(false);
  const { addNotification } = useNotifications();
  const { userClubs, refreshUserClubs } = useAuth();
  const [defaultClubId, setDefaultClubId] = useState<string>('');
  const [scoringMode, setScoringMode] = useState<'pro' | 'touch' | 'spreadsheet'>('pro');
  // What's saved, so the profile can show a save bar only when something has changed
  const [savedProfile, setSavedProfile] = useState<{
    firstName: string; lastName: string; defaultClubId: string; scoringMode: 'pro' | 'touch' | 'spreadsheet'; avatarUrl: string | null;
  } | null>(null);

  // PWA Install state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  // Accordion state for settings sections
  const [expandedSections, setExpandedSections] = useState<{
    account: boolean;
    club: boolean;
    raceManagement: boolean;
    finance: boolean;
    membership: boolean;
    system: boolean;
  }>({
    account: true,  // All sections open by default (board layout); users can still collapse
    club: true,
    raceManagement: true,
    finance: true,
    membership: true,
    system: true,
  });

  useEffect(() => {
    // Load expanded sections from localStorage
    const savedSections = localStorage.getItem('settingsExpandedSections');
    if (savedSections) {
      try {
        setExpandedSections(JSON.parse(savedSections));
      } catch (err) {
        console.error('Error loading expanded sections:', err);
      }
    }

    // Check for OAuth callback parameters (code and state) and auto-open integrations tab
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if ((code || urlParams.get('error')) && state) {
      try {
        const stateData = JSON.parse(decodeURIComponent(state));
        if (stateData.integration) {
          setActiveTab('integrations');
        }
      } catch (err) {
        console.error('Error parsing OAuth state:', err);
      }
    }

    // Check for navigation state to set active tab
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }

    if (user && currentClub?.clubId && isValidUUID(currentClub.clubId)) {
      checkMembershipStatus();
    }
    if (user) {
      fetchUserProfile();
    }

    // Load light mode preference
    const savedLightMode = localStorage.getItem('lightMode');
    if (savedLightMode !== null) {
      setLightMode(savedLightMode === 'true');
    }

    // Listen for light mode changes from other components
    const handleLightModeChange = (e: CustomEvent) => {
      setLightMode(e.detail.lightMode);
    };

    window.addEventListener('lightModeChange', handleLightModeChange as EventListener);

    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsInstalled(true);
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('lightModeChange', handleLightModeChange as EventListener);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [user, currentClub]);
  
  useEffect(() => {
    // Apply light mode to body
    document.body.classList.toggle('light-mode', lightMode);
    localStorage.setItem('lightMode', lightMode.toString());
    // Dispatch custom event so other components can react to the change
    window.dispatchEvent(new CustomEvent('lightModeChange', { detail: { lightMode } }));
  }, [lightMode]);

  const fetchUserProfile = async () => {
    if (!user) return;

    try {
      // Fetch profile data
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('avatar_url, first_name, last_name, default_club_id, scoring_mode_preference')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      if (profileData) {
        const loaded = {
          // Use profile data which is synced from members table
          firstName: profileData.first_name || user?.user_metadata?.first_name || '',
          lastName: profileData.last_name || user?.user_metadata?.last_name || '',
          defaultClubId: profileData.default_club_id || '',
          scoringMode: (profileData.scoring_mode_preference as 'pro' | 'touch' | 'spreadsheet') || 'pro',
          avatarUrl: profileData.avatar_url as string | null,
        };
        setAvatarUrl(loaded.avatarUrl);
        setFirstName(loaded.firstName);
        setLastName(loaded.lastName);
        setDefaultClubId(loaded.defaultClubId);
        setScoringMode(loaded.scoringMode);
        setSavedProfile(loaded);
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
      // Fallback to user metadata
      setFirstName(user?.user_metadata?.first_name || '');
      setLastName(user?.user_metadata?.last_name || '');
      setSavedProfile((prev) => prev ?? {
        firstName: user?.user_metadata?.first_name || '',
        lastName: user?.user_metadata?.last_name || '',
        defaultClubId,
        scoringMode,
        avatarUrl,
      });
    }
  };

  const checkMembershipStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('is_financial, renewal_date')
        .eq('club_id', currentClub?.clubId)
        .eq('user_id', effectiveUserId)
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data) {
        const today = new Date();
        const renewalDateObj = data.renewal_date ? new Date(data.renewal_date) : null;
        
        setRenewalDate(data.renewal_date);
        
        if (!data.is_financial || (renewalDateObj && renewalDateObj < today)) {
          setMembershipStatus('expired');
        } else {
          setMembershipStatus('active');
        }
      } else {
        setMembershipStatus('none');
      }
    } catch (err) {
      console.error('Error checking membership status:', err);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    // Close all other sections and toggle the clicked one
    const newExpandedSections = {
      account: false,
      club: false,
      raceManagement: false,
      finance: false,
      membership: false,
      system: false,
      [section]: !expandedSections[section],
    };
    setExpandedSections(newExpandedSections);
    localStorage.setItem('settingsExpandedSections', JSON.stringify(newExpandedSections));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if file is an image
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image size should be less than 2MB');
      return;
    }

    setAvatarFile(file);
    setAvatarUrl(URL.createObjectURL(file));
  };

  const uploadAvatar = async () => {
    if (!avatarFile || !user) return;

    try {
      setIsUploadingAvatar(true);

      const { compressImage } = await import('../../utils/imageCompression');
      const compressed = await compressImage(avatarFile, 'avatar');

      const fileExt = compressed.name.split('.').pop();
      const filePath = `${user.id}/${user.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, compressed, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
      
      // Update the user's profile with the avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);
      
      if (updateError) throw updateError;
      
      setAvatarUrl(publicUrl);
      
      // Also update the user metadata so it's available in the auth context
      await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      });
      
      return publicUrl;
    } catch (err) {
      console.error('Error uploading avatar:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
      return null;
    } finally {
      setIsUploadingAvatar(false);
      setAvatarFile(null);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    
    try {
      setIsUploadingAvatar(true);
      
      // Update the user's profile to remove the avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user.id);
      
      if (updateError) throw updateError;
      
      // Also update the user metadata
      await supabase.auth.updateUser({
        data: { avatar_url: null }
      });
      
      setAvatarUrl(null);
      setAvatarFile(null);
      setSavedProfile((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
    } catch (err) {
      console.error('Error removing avatar:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove avatar');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      // If we have the prompt, use it
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
          addNotification('success', 'App installed successfully!');
          setIsInstalled(true);
        }

        setDeferredPrompt(null);
      } catch (err) {
        console.error('Error installing app:', err);
        addNotification('error', 'Failed to install app');
      }
    } else {
      // No prompt yet - show manual instructions
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        addNotification('info', 'To install on iOS: Tap the Share button in Safari, then tap "Add to Home Screen"', 10000);
      } else {
        // For desktop Chrome/Edge - provide detailed steps
        addNotification('info', 'Installation will be available after using the app for a few minutes. You can also check the address bar for an install icon.', 8000);
      }
    }
  };

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        addNotification('success', 'App installed successfully!');
        setIsInstalled(true);
      }

      setDeferredPrompt(null);
    } catch (error) {
      console.error('Error installing PWA:', error);
      addNotification('error', 'Failed to install app');
    }
  };

  const handleSetupSaveComplete = () => {
    navigate('/', { state: { fromSetupChecklist: true } });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    // Upload avatar if a new one is selected
    if (avatarFile) {
      const uploadedUrl = await uploadAvatar();
      if (!uploadedUrl) {
        setLoading(false);
        return;
      }
    }

    try {
      // Step 1: Update profiles table FIRST (most important)
      if (user) {
        console.log('Updating profiles table...');
        console.log('Default club:', defaultClubId || 'null');

        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            first_name: firstName,
            last_name: lastName,
            default_club_id: defaultClubId || null,
            scoring_mode_preference: scoringMode
          })
          .eq('id', user.id);

        if (profileError) {
          console.error('Error updating profiles table:', profileError);
          throw new Error(`Failed to update profile: ${profileError.message}`);
        }
        console.log('Profiles table updated successfully');
      }

      // Step 2: Update auth metadata (optional - profiles table already saved)
      try {
        console.log('Updating auth metadata...');
        await updateUserProfile({
          firstName,
          lastName
        });
        console.log('Auth metadata updated successfully');
      } catch (metadataError: any) {
        // Log but don't fail - profiles table is already updated
        console.warn('Failed to update auth metadata (non-critical):', metadataError);
      }

      addNotification('success', 'Profile updated successfully');
      setSuccess(true);
      fetchUserProfile();
      refreshUserClubs();
      window.dispatchEvent(new Event('profile-updated'));

      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error in profile update:', err);
      setError(err.message || 'Failed to update profile');

      // Hide error message after 5 seconds
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><AlfieIcon glyph="gear" size={24} /></span>
            <div>
              <h1 className="a-display a-ink text-[30px] font-bold leading-tight">Settings</h1>
              <p className="a-mute text-[14.5px] mt-1">Your account, club and platform settings</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Appearance: Dark / Light */}
            <div className="a-seg" role="radiogroup" aria-label="Appearance">
              <button
                role="radio"
                aria-checked={!lightMode}
                onClick={() => setLightMode(false)}
                className={`a-seg-i ${!lightMode ? 'a-seg-on' : ''}`}
              >
                <Moon size={16} />
                Dark
              </button>
              <button
                role="radio"
                aria-checked={lightMode}
                onClick={() => setLightMode(true)}
                className={`a-seg-i ${lightMode ? 'a-seg-on' : ''}`}
              >
                <Sun size={16} />
                Light
              </button>
            </div>

            {/* Close Button - shown when viewing a specific setting */}
            {activeTab !== null && (
              <button
                onClick={() => setActiveTab(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all"
                aria-label="Close settings"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Settings Cards - only show when no tab is selected */}
        {!activeTab && (
          <div className="a-card a-settings-profile flex items-center gap-4 flex-wrap mb-4">
            <span className="a-settings-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" />
              ) : (
                <span className="a-display">{`${(firstName || '?')[0] || ''}${(lastName || '')[0] || ''}`.toUpperCase()}</span>
              )}
            </span>
            <div className="flex-1 min-w-0">
              <div className="a-display a-ink text-xl font-semibold truncate">{[firstName, lastName].filter(Boolean).join(' ') || 'Your profile'}</div>
              <div className="a-mute text-sm truncate">{email}</div>
            </div>
            {(currentOrganization?.name || currentClub?.club?.name) && (
              <div className="a-settings-org">
                <span className="a-settings-org-logo">
                  {(currentClub?.club as any)?.logo && !currentOrganization ? (
                    <img src={(currentClub?.club as any).logo} alt="" />
                  ) : (
                    <Building size={18} />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="a-ink text-sm font-semibold truncate">
                    {currentOrganization?.name || (currentClub?.club as any)?.abbreviation || currentClub?.club?.name}
                  </div>
                  <div className="a-dim text-xs capitalize">{(currentOrganization?.role || currentClub?.role || '').replace(/_/g, ' ')}</div>
                </div>
              </div>
            )}
            <button type="button" className="a-btn" onClick={() => setActiveTab('profile')}>
              <User size={17} />
              Edit profile
            </button>
          </div>
        )}

        {!activeTab && (
          <label className="a-field a-settings-search mb-6">
            <Search size={19} />
            <input
              ref={settingsSearchRef}
              value={settingsQuery}
              onChange={(e) => setSettingsQuery(e.target.value)}
              placeholder="Search settings — e.g. bank details, start system, renewals"
              aria-label="Search settings"
            />
            {!settingsQuery && <span className="a-kbd-pair hidden sm:inline-flex" aria-hidden="true"><kbd className="alfie-kbd">⌘</kbd><kbd className="alfie-kbd">,</kbd></span>}
            {settingsQuery && (
              <button type="button" className="a-ib" style={{ width: 28, height: 28 }} onClick={() => setSettingsQuery('')} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </label>
        )}

        {!activeTab && (() => {
          const isSuper = !!user?.user_metadata?.is_super_admin;
          const open = (id: string) => () => setActiveTab(id as SettingsTab);
          const groups: SettingsGroup[] = [
            { id: 'account', title: 'Account', dot: '#2E7BFF', items: [
              { id: 'profile', title: 'Profile', desc: 'Your name, photo and contact details', glyph: 'user', show: true, open: open('profile') },
              { id: 'team-access', title: 'Team access', desc: 'Invite admins and set what they can see', glyph: 'key', show: !!(isRaceOfficer && !currentClub && !currentOrganization), open: open('team-access') },
              { id: 'association-users', title: 'Users', desc: 'Admin and editor access to this association', glyph: 'team', show: !!(currentOrganization && can('users.manage')), open: open('association-users') },
              { id: 'club-features', title: 'Club features', desc: 'Turn platform features on or off for your clubs', glyph: 'toggle', show: !!(currentOrganization && (currentOrganization.type === 'state' || currentOrganization.type === 'national') && can('users.manage')), open: open('club-features') },
              { id: 'install-app', title: 'Install app', desc: 'Add AlfiePRO to your phone or desktop', glyph: 'phone', show: !!(!isInstalled && deferredPrompt), open: handleInstallPWA },
            ] },
            { id: 'club', title: 'Club', dot: '#30D158', items: can('settings.club') && !currentOrganization ? [
              { id: 'club', title: 'Club details', desc: 'Name, logo, contact and club information', glyph: 'build', show: true, open: open('club') },
              { id: 'yacht-classes', title: 'Yacht classes', desc: 'The boat classes your club races', glyph: 'boat', show: true, open: open('yacht-classes') },
              { id: 'team', title: 'Committee', desc: 'Roles and permissions for your committee', glyph: 'crown', show: can('settings.team'), open: open('team') },
              { id: 'dashboard-templates', title: 'Dashboard templates', desc: 'Dashboard layouts for committee roles', glyph: 'dash', show: can('settings.team'), open: open('dashboard-templates') },
            ] : [] },
            { id: 'association', title: 'Association', dot: '#5AC8FA', items: currentOrganization && can('settings.club') ? [
              { id: 'association', title: `${currentOrganization.type === 'state' ? 'State' : 'National'} association`, desc: 'Name, logo, contact and association information', glyph: 'build', show: true, open: open('association') },
            ] : [] },
            { id: 'race', title: 'Race management', dot: '#FF8A2B', items: [
              { id: 'race-documents', title: 'Race documents', desc: 'Notices of race and sailing instructions', glyph: 'doc', show: !!(can('settings.documents') || (isRaceOfficer && !currentClub)), open: open('race-documents') },
              { id: 'start-system', title: 'Start system', desc: 'Start sequence, timings and sounds', glyph: 'timer', show: !!(can('settings.startbox') || (isRaceOfficer && !currentClub)), open: open('start-system') },
              { id: 'data-feeds', title: 'Data feeds', desc: 'Results and live data shared with other sites', glyph: 'rss', show: !!(isRaceOfficer && !currentClub), open: open('data-feeds') },
              { id: 'handicap-rules', title: 'Handicap rules', desc: 'How handicaps adjust after each race', glyph: 'scale', show: can('settings.handicap_rules'), open: open('handicap-rules') },
            ] },
            { id: 'finance', title: 'Finance', dot: '#FFB340', items: can('settings.finance') ? [
              { id: 'finance-tax', title: 'Tax', desc: 'GST and tax rates', glyph: 'percent', show: true, open: open('finance-tax') },
              { id: 'finance-categories', title: 'Categories', desc: 'Income and expense categories', glyph: 'tag', show: true, open: open('finance-categories') },
              { id: 'finance-documents', title: 'Documents', desc: 'Invoice and receipt templates', glyph: 'doc', show: true, open: open('finance-documents') },
              { id: 'finance-payment', title: 'Bank details', desc: 'Account shown on invoices and renewals', glyph: 'bank', show: true, open: open('finance-payment') },
              { id: 'finance-payment-settings', title: 'Payments', desc: 'Card and online payment settings', glyph: 'card', show: true, open: open('finance-payment-settings') },
              { id: 'finance-opening-balance', title: 'Opening balance', desc: 'Starting balance for your books', glyph: 'wallet', show: true, open: open('finance-opening-balance') },
              { id: 'finance-approvals', title: 'Expense approvals', desc: 'Someone else approves expenses before they are paid', glyph: 'check', show: true, open: open('finance-approvals') },
            ] : [] },
            { id: 'membership', title: 'Membership', dot: '#8A4DFF', items: can('settings.membership') ? [
              { id: 'membership-types', title: 'Membership types', desc: 'Fees and categories of membership', glyph: 'card', show: true, open: open('membership-types') },
              { id: 'membership-renewals', title: 'Renewals', desc: 'Renewal dates, reminders and grace period', glyph: 'renew', show: true, open: open('membership-renewals') },
              { id: 'membership-emails', title: 'Email templates', desc: 'Welcome, renewal and reminder emails', glyph: 'mail', show: true, open: open('membership-emails') },
              { id: 'membership-conduct', title: 'Code of conduct', desc: 'What members agree to when joining', glyph: 'shield', show: true, open: open('membership-conduct') },
            ] : [] },
            { id: 'system', title: 'System', dot: '#9AA6BD', items: [
              { id: 'subscriptions', title: 'Subscription & billing', desc: 'Your AlfiePRO plan and invoices', glyph: 'card', show: can('settings.subscriptions'), open: open('subscriptions') },
              { id: 'integrations', title: 'Integrations & webhooks', desc: 'Connect other tools', glyph: 'plug', show: can('settings.integrations'), open: open('integrations') },
              { id: 'import-export', title: 'Backup & restore', desc: "Download or restore your club's data", glyph: 'history', show: can('settings.import'), open: open('import-export') },
              { id: 'email-logs', title: 'Email logs', desc: 'Every email the platform has sent', glyph: 'mail', show: !!currentOrganization, open: open('email-logs') },
              { id: 'club-email-logs', title: 'Email logs', desc: 'Every email the platform has sent', glyph: 'mail', show: !!(currentClub && !currentOrganization), open: open('club-email-logs') },
              { id: 'advertising', title: 'Advertising', desc: 'Sponsor ads across your club pages', glyph: 'mega', show: isSuper, open: open('advertising') },
              { id: 'privacy-policy', title: 'Privacy policy', desc: 'Your public privacy policy', glyph: 'lock', show: isSuper, open: () => navigate('/legal/privacy-policy/edit') },
              { id: 'terms-of-service', title: 'Terms of service', desc: 'Your public terms of service', glyph: 'doc', show: isSuper, open: () => navigate('/legal/terms-of-service/edit') },
            ] },
          ];
          const q = settingsQuery.trim().toLowerCase();
          const visible = groups
            .map((g) => ({ ...g, items: g.items.filter((it) => it.show && (!q || `${it.title} ${it.desc} ${g.title}`.toLowerCase().includes(q))) }))
            .filter((g) => g.items.length > 0);
          const all = groups.flatMap((g) => g.items.filter((it) => it.show).map((it) => ({ ...it, group: g.title })));
          const byId = new Map(all.map((it) => [it.id, it]));
          const recent = [...recentSettings, 'finance-payment', 'start-system', 'membership-renewals', 'club', 'profile', 'subscriptions']
            .filter((id, i, a) => a.indexOf(id) === i && byId.has(id))
            .slice(0, 4)
            .map((id) => byId.get(id)!);
          const go = (it: SettingsItem) => { rememberSetting(it.id); it.open(); };
          const left = visible.filter((g) => ['account', 'club', 'association', 'race'].includes(g.id));
          const right = visible.filter((g) => !['account', 'club', 'association', 'race'].includes(g.id));
          const renderGroup = (g: SettingsGroup) => (
            <section key={g.id} className="a-sg" aria-label={g.title}>
              <div className="a-sgh">
                <span className="a-sgh-dot" style={{ background: g.dot }} />
                <h2 className="a-display">{g.title}</h2>
                <span className="a-cnt">{g.items.length}</span>
              </div>
              {g.items.map((it) => (
                <button key={it.id} type="button" className="a-sr" onClick={() => go(it)}>
                  <span className="a-tile a-tile-sm"><AlfieIcon glyph={it.glyph} size={17} /></span>
                  <span className="flex-1 min-w-0 text-left">
                    <span className="block a-ink text-[14.5px] font-semibold truncate">{it.title}</span>
                    <span className="block a-dim text-[12.5px] mt-0.5 truncate">{it.desc}</span>
                  </span>
                  <ChevronRight size={16} className="a-dim flex-shrink-0" />
                </button>
              ))}
            </section>
          );
          return (
            <div ref={settingsListRef} className="alfie-settings-board">
              {!q && recent.length > 0 && (
                <div className="mb-[18px]">
                  <p className="a-cap mb-2.5">Recently used</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {recent.map((it) => (
                      <button key={it.id} type="button" className="a-qk" onClick={() => go(it)}>
                        <span className="a-tile"><AlfieIcon glyph={it.glyph} size={19} /></span>
                        <span className="block text-left min-w-0">
                          <span className="block a-ink text-[14.5px] font-semibold truncate">{it.title}</span>
                          <span className="block a-dim text-[12px] mt-0.5 truncate">{it.group}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {visible.length === 0 ? (
                <div className="a-card a-empty py-14 px-6">
                  <span className="a-tile" style={{ width: 52, height: 52 }}><Search size={22} /></span>
                  <h3 className="a-display a-ink text-[17px] font-semibold">No settings match “{settingsQuery.trim()}”</h3>
                  <p className="a-mute text-[14px]">Try another word, like bank, renewals or start.</p>
                </div>
              ) : (
                <div className={`grid gap-[18px] items-start ${left.length && right.length ? 'lg:grid-cols-2' : ''}`}>
                  {left.length > 0 && <div className="flex flex-col gap-[18px] min-w-0">{left.map(renderGroup)}</div>}
                  {right.length > 0 && <div className="flex flex-col gap-[18px] min-w-0">{right.map(renderGroup)}</div>}
                </div>
              )}
            </div>
          );
        })()}

        {/* Content - only show when a tab is selected */}
        {activeTab && (
          <div>
            {activeTab === 'profile' && (() => {
              const fullName = [firstName, lastName].filter(Boolean).join(' ');
              const initials = `${(firstName || '?')[0] || ''}${(lastName || '')[0] || ''}`.toUpperCase();
              const club = currentClub?.club as any;
              const orgName = currentOrganization?.name || club?.name;
              const orgLogo = !currentOrganization ? club?.logo : (currentOrganization as any)?.logo_url;
              const role = (currentOrganization?.role || currentClub?.role || '').replace(/_/g, ' ');
              const orgKind = currentOrganization
                ? (currentOrganization.type === 'state' ? 'State association' : 'National association')
                : club?.organization_type === 'state_association' ? 'State association'
                : club?.organization_type === 'national_association' ? 'National association' : 'Club';
              const dirty = !!savedProfile && (
                firstName !== savedProfile.firstName ||
                lastName !== savedProfile.lastName ||
                defaultClubId !== savedProfile.defaultClubId ||
                scoringMode !== savedProfile.scoringMode ||
                !!avatarFile
              );
              const discard = () => {
                if (!savedProfile) return;
                setFirstName(savedProfile.firstName);
                setLastName(savedProfile.lastName);
                setDefaultClubId(savedProfile.defaultClubId);
                setScoringMode(savedProfile.scoringMode);
                setAvatarFile(null);
                setAvatarUrl(savedProfile.avatarUrl);
                setError(null);
              };
              const modes: { id: 'pro' | 'touch' | 'spreadsheet'; title: string; desc: string; Icon: typeof Table2 }[] = [
                { id: 'pro', title: 'Pro', desc: 'Full results table with every detail. Best on a laptop.', Icon: Table2 },
                { id: 'touch', title: 'Touch', desc: 'Big sail numbers you tap or drag. Made for tablets.', Icon: Hand },
                { id: 'spreadsheet', title: 'Spreadsheet', desc: 'Type sail numbers into finishing places.', Icon: Grid3x3 },
              ];
              return (
                <form onSubmit={handleSubmit} className="a-prof">
                  {/* Who you are */}
                  <section className="a-prof-hero">
                    <div className="a-prof-av">
                      {avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="a-prof-av-in a-display">{initials}</span>}
                      {isUploadingAvatar && (
                        <span className="a-prof-busy"><span className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" /></span>
                      )}
                      <label className="a-prof-cam" title="Change photo">
                        <Camera size={16} />
                        <span className="sr-only">Change photo</span>
                        <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" disabled={isUploadingAvatar || loading} />
                      </label>
                    </div>
                    <div className="a-prof-who">
                      <h2 className="a-prof-name a-display a-ink">{fullName || 'Your profile'}</h2>
                      <p className="a-prof-mail a-mute">{email}</p>
                      <div className="a-prof-chips">
                        {orgName && (
                          <span className="a-prof-chip">
                            <span className="a-prof-chip-logo">{orgLogo ? <img src={orgLogo} alt="" /> : <Building size={13} />}</span>
                            <span className="truncate">{orgName}</span>
                          </span>
                        )}
                        {role && <span className="a-prof-chip a-prof-chip-plain capitalize">{orgKind} · {role}</span>}
                      </div>
                      <div className="a-prof-photo">
                        <label className="a-btn a-btn-sm cursor-pointer">
                          <ImagePlus size={15} />
                          {avatarUrl ? 'Change photo' : 'Add a photo'}
                          <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" disabled={isUploadingAvatar || loading} />
                        </label>
                        {avatarUrl && !avatarFile && (
                          <button type="button" className="a-btn a-btn-sm a-btn-q a-prof-remove" onClick={handleRemoveAvatar} disabled={isUploadingAvatar || loading}>
                            <Trash2 size={15} />
                            Remove
                          </button>
                        )}
                        <span className="a-dim text-[12px]">{avatarFile ? 'New photo: save to keep it' : 'Square photo, up to 2 MB'}</span>
                      </div>
                    </div>
                  </section>

                  {error && (
                    <div className="a-prof-alert" role="alert">
                      <AlertTriangle size={18} />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Membership of this club */}
                  {membershipStatus !== 'none' && (
                    <section className="a-card a-prof-mem">
                      <span className={`a-prof-mem-ic ${membershipStatus === 'active' ? 'is-ok' : 'is-bad'}`}><CreditCard size={20} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="a-ink text-[15px] font-semibold truncate">
                          {membershipStatus === 'active' ? 'Membership active' : 'Membership expired'}
                          {club?.name ? <span className="a-mute font-normal"> · {club.abbreviation || club.name}</span> : null}
                        </div>
                        <div className="a-st mt-1 a-mute">
                          <span className={`a-light ${membershipStatus === 'active' ? 'a-light-g' : 'a-light-r'}`} />
                          {membershipStatus === 'active'
                            ? (renewalDate ? `Active until ${formatDate(renewalDate)}` : 'Active')
                            : 'Renew to keep racing and receiving club news'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`a-btn ${membershipStatus === 'active' ? '' : 'a-btn-p'}`}
                        onClick={() => navigate(`/membership/${currentClub?.clubId}`)}
                      >
                        {membershipStatus === 'active' ? 'View membership' : 'Renew now'}
                        <ChevronRight size={16} />
                      </button>
                    </section>
                  )}
                  {membershipStatus === 'none' && currentClub?.club && (
                    <section className="a-card a-prof-mem">
                      <span className="a-prof-mem-ic is-join"><Users size={20} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="a-ink text-[15px] font-semibold truncate">Join {currentClub.club.name}</div>
                        <div className="a-mute text-[13px] mt-0.5">Become a member to take part in club events and races</div>
                      </div>
                      <button type="button" className="a-btn a-btn-p" onClick={() => setShowMembershipModal(true)}>
                        Apply for membership
                      </button>
                    </section>
                  )}

                  {/* Personal details */}
                  <section className="a-card a-prof-sec">
                    <header className="a-prof-sh">
                      <span className="a-tile a-tile-sm"><User size={16} /></span>
                      <div>
                        <h3 className="a-display a-ink">Personal details</h3>
                        <p className="a-dim">How you appear to your club and in results</p>
                      </div>
                    </header>
                    <div className="a-prof-grid">
                      <label className="a-prof-f">
                        <span className="a-prof-lbl">First name</span>
                        <span className="a-field">
                          <input id="first-name" name="first-name" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" autoComplete="given-name" />
                        </span>
                      </label>
                      <label className="a-prof-f">
                        <span className="a-prof-lbl">Last name</span>
                        <span className="a-field">
                          <input id="last-name" name="last-name" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" autoComplete="family-name" />
                        </span>
                      </label>
                      <div className="a-prof-f a-prof-wide">
                        <span className="a-prof-lbl">Email</span>
                        <span className="a-field a-prof-ro" aria-readonly="true">
                          <Mail size={17} />
                          <input id="email" name="email" type="email" value={email} disabled />
                          <span className="a-prof-lock"><Lock size={13} /> Sign-in email</span>
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Preferences */}
                  <section className="a-card a-prof-sec">
                    <header className="a-prof-sh">
                      <span className="a-tile a-tile-sm"><SlidersHorizontal size={16} /></span>
                      <div>
                        <h3 className="a-display a-ink">Preferences</h3>
                        <p className="a-dim">How AlfiePRO opens and scores for you</p>
                      </div>
                    </header>

                    {userClubs && userClubs.length > 1 && (
                      <label className="a-prof-f">
                        <span className="a-prof-lbl">Open this club when I sign in</span>
                        <span className="a-field a-prof-sel">
                          <Building size={17} />
                          <select id="default-club" name="default-club" value={defaultClubId} onChange={(e) => setDefaultClubId(e.target.value)}>
                            <option value="">Ask me each time</option>
                            {userClubs.map((userClub) => (
                              <option key={userClub.clubId} value={userClub.clubId}>
                                {userClub.club?.name || 'Unnamed Club'}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={16} />
                        </span>
                      </label>
                    )}

                    <div className="a-prof-f">
                      <span className="a-prof-lbl" id="scoring-mode-label">Race scoring screen</span>
                      <div className="a-prof-modes" role="radiogroup" aria-labelledby="scoring-mode-label">
                        {modes.map(({ id, title, desc, Icon }) => (
                          <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={scoringMode === id}
                            className={`a-prof-mode ${scoringMode === id ? 'is-on' : ''}`}
                            onClick={() => setScoringMode(id)}
                          >
                            <span className="a-prof-mode-top">
                              <span className="a-prof-mode-ic"><Icon size={20} /></span>
                              <span className={`a-prof-radio ${scoringMode === id ? 'is-on' : ''}`} />
                            </span>
                            <span className="a-prof-mode-t">{title}</span>
                            <span className="a-prof-mode-d">{desc}</span>
                          </button>
                        ))}
                      </div>
                      <p className="a-dim text-[12.5px] mt-2">You can still switch screens while scoring.</p>
                    </div>
                  </section>

                  {/* Save bar: comes up when something has changed */}
                  <div
                    className={`a-prof-save ${dirty || loading || success ? 'is-on' : ''} ${success && !dirty && !loading ? 'is-done' : ''}`}
                    aria-hidden={!(dirty || loading || success)}
                    role="status"
                  >
                    {success && !dirty && !loading ? (
                      <span className="a-prof-save-t"><Check size={16} className="text-[#30D158]" /> Profile saved</span>
                    ) : (
                      <>
                        <span className="a-prof-save-t"><span className="a-light a-light-a" /> Unsaved changes</span>
                        <button type="button" className="a-btn a-btn-q" onClick={discard} disabled={loading} tabIndex={dirty ? 0 : -1}>Discard</button>
                        <button type="submit" className="a-btn a-btn-p" disabled={loading} tabIndex={dirty || loading ? 0 : -1}>
                          {loading ? (
                            <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                          ) : (
                            <><Save size={16} /> Save changes</>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </form>
              );
            })()}

          {activeTab === 'club' && (
            <ClubProfileSettings darkMode={darkMode} />
          )}

          {activeTab === 'yacht-classes' && (
            <ClubYachtClassesSelector darkMode={darkMode} />
          )}

          {activeTab === 'association' && (
            <AssociationProfileSettings darkMode={darkMode} />
          )}

          {activeTab === 'association-users' && currentOrganization && (
            <AssociationUsersManagement darkMode={darkMode} />
          )}

          {activeTab === 'club-features' && currentOrganization && (
            <ClubFeaturesAccess darkMode={darkMode} />
          )}

          {activeTab === 'team-access' && isRaceOfficer && !currentClub && (
            <RaceOfficerTeamAccess darkMode={darkMode} />
          )}

          {activeTab === 'team' && (
            <CommitteeManagement darkMode={darkMode} onSaveComplete={fromSetupChecklist ? handleSetupSaveComplete : undefined} />
          )}

          {activeTab === 'dashboard-templates' && (
            <DashboardTemplateManager darkMode={darkMode} />
          )}

          {activeTab === 'subscriptions' && (
            <SubscriptionManagement darkMode={darkMode} />
          )}
          
          {activeTab === 'integrations' && (
            <IntegrationsPage darkMode={darkMode} />
          )}

          {activeTab === 'advertising' && (
            <AdvertisingManagement />
          )}

          {activeTab === 'finance-tax' && (
            <FinanceSettingsPage darkMode={darkMode} initialTab="taxes" associationId={currentOrganization?.id} associationType={currentOrganization?.type as 'state' | 'national' | undefined} />
          )}

          {activeTab === 'finance-categories' && (
            <FinanceSettingsPage darkMode={darkMode} initialTab="categories" associationId={currentOrganization?.id} associationType={currentOrganization?.type as 'state' | 'national' | undefined} onSaveComplete={fromSetupChecklist ? handleSetupSaveComplete : undefined} />
          )}

          {activeTab === 'finance-documents' && (
            <FinanceSettingsPage darkMode={darkMode} initialTab="transactions" associationId={currentOrganization?.id} associationType={currentOrganization?.type as 'state' | 'national' | undefined} />
          )}

          {activeTab === 'finance-payment' && (
            <FinanceSettingsPage darkMode={darkMode} initialTab="transactions" initialSection="payment" associationId={currentOrganization?.id} associationType={currentOrganization?.type as 'state' | 'national' | undefined} />
          )}

          {activeTab === 'finance-payment-settings' && (
            <FinanceSettingsPage darkMode={darkMode} initialTab="membership" associationId={currentOrganization?.id} associationType={currentOrganization?.type as 'state' | 'national' | undefined} onSaveComplete={fromSetupChecklist ? handleSetupSaveComplete : undefined} />
          )}

          {activeTab === 'finance-opening-balance' && (
            <FinanceSettingsPage darkMode={darkMode} initialTab="transactions" initialSection="opening-balance" associationId={currentOrganization?.id} associationType={currentOrganization?.type as 'state' | 'national' | undefined} onSaveComplete={fromSetupChecklist ? handleSetupSaveComplete : undefined} />
          )}

          {activeTab === 'finance-approvals' && (
            <ExpenseApprovalSettings
              associationId={currentOrganization && currentOrganization.type !== 'club' ? currentOrganization.id : undefined}
              associationType={currentOrganization && currentOrganization.type !== 'club' ? currentOrganization.type as 'state' | 'national' : undefined}
              onOpenCommittee={() => setActiveTab('team')}
            />
          )}

          {activeTab === 'membership-types' && (
            <MembershipSettingsPage darkMode={darkMode} initialView="types" onSaveComplete={fromSetupChecklist ? handleSetupSaveComplete : undefined} />
          )}

          {activeTab === 'membership-renewals' && (
            <MembershipSettingsPage darkMode={darkMode} initialView="renewals" onSaveComplete={fromSetupChecklist ? handleSetupSaveComplete : undefined} />
          )}

          {activeTab === 'membership-emails' && (
            <>
              {!currentOrganization && currentClub?.clubId && (
                <div className="a-card mb-5 flex flex-wrap items-center gap-4 p-4">
                  <span className="a-tile" style={{ width: 40, height: 40 }}><Send size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="a-ink text-[14px] font-semibold">These emails now live in Email studio</div>
                    <div className="a-dim text-[12.5px]">Find them under Communications › Email studio › Flows, next to your newsletters and campaigns. You can still edit them here.</div>
                  </div>
                  <button className="a-btn a-btn-sm" onClick={() => navigate('/email-studio/flows')}>Open Email studio</button>
                </div>
              )}
              <MembershipSettingsPage darkMode={darkMode} initialView="emails" />
            </>
          )}

          {activeTab === 'membership-conduct' && (
            <MembershipSettingsPage darkMode={darkMode} initialView="conduct" onSaveComplete={fromSetupChecklist ? handleSetupSaveComplete : undefined} />
          )}

          {activeTab === 'race-documents' && (
            <RaceDocumentsPage darkMode={darkMode} />
          )}

          {activeTab === 'start-system' && can('settings.startbox') && (
            <StartBoxBuilder darkMode={darkMode} onBack={() => setActiveTab(null)} />
          )}

          {activeTab === 'data-feeds' && (
            <ExternalOrganizationsPage darkMode={darkMode} />
          )}

          {activeTab === 'handicap-rules' && (
            <HandicapRuleBuilderPage darkMode={darkMode} clubId={currentClub?.clubId || null} />
          )}

          {activeTab === 'import-export' && (
            <BackupRestoreSection darkMode={darkMode} />
          )}

          {activeTab === 'email-logs' && currentOrganization && (
            <AssociationEmailLogs darkMode={darkMode} />
          )}

          {activeTab === 'club-email-logs' && currentClub && !currentOrganization && (
            <ClubEmailLogs darkMode={darkMode} />
          )}
          </div>
        )}

        <MemberOnboardingModal
          isOpen={showMembershipModal}
          onClose={() => setShowMembershipModal(false)}
          darkMode={darkMode}
          clubId={currentClub?.clubId || ''}
          onSuccess={() => {
            setShowMembershipModal(false);
            checkMembershipStatus();
          }}
        />
      </div>
    </div>
  );
};
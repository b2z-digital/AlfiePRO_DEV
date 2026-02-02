import React, { useState, useEffect } from 'react';
import { Settings, User, Building, Users, Shield, Mail, Phone, Save, AlertTriangle, Check, Globe, CreditCard, Upload, Trash2, Sun, Moon, FileText, Download, Smartphone, Sailboat, Percent, Tag, Receipt, DollarSign, Calendar, BookOpen, ScrollText, LayoutGrid, Megaphone, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { updateUserProfile } from '../../utils/auth';
import { usePermissions } from '../../hooks/usePermissions';
import { ClubSettings } from './ClubSettings';
import { ClubProfileSettings } from './ClubProfileSettings';
import { AssociationProfileSettings } from './AssociationProfileSettings';
import { CommitteeManagement } from './CommitteeManagement';
import { DashboardTemplateManager } from './DashboardTemplateManager';
import { IntegrationsPage } from './IntegrationsPage';
import { FinanceSettingsPage } from './FinanceSettingsPage';
import { MembershipSettingsPage } from './MembershipSettingsPage';
import { SubscriptionManagement } from './SubscriptionManagement';
import { RaceDocumentsPage } from './RaceDocumentsPage';
import { FormBuilderPage } from './FormBuilderPage';
import { DocumentTemplateBuilder } from './DocumentTemplateBuilder';
import { BackupRestoreSection } from './BackupRestoreSection';
import { AdvertisingManagement } from '../advertising/AdvertisingManagement';
import { ClubYachtClassesSelector } from '../ClubYachtClassesSelector';
import { formatDate } from '../../utils/date';
import { supabase } from '../../utils/supabase';
import { isValidUUID } from '../../utils/storage';
import { MemberOnboardingModal } from '../MemberOnboardingModal';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotifications } from '../../contexts/NotificationContext';

interface SettingsPageProps {
  darkMode: boolean;
}

type SettingsTab = 'profile' | 'club' | 'yacht-classes' | 'association' | 'team' | 'subscriptions' | 'integrations' |
  'finance-tax' | 'finance-categories' | 'finance-documents' | 'finance-payment' |
  'membership-types' | 'membership-renewals' | 'membership-emails' | 'membership-conduct' | 'membership-payment' |
  'race-documents' | 'import-export' | 'dashboard-templates' | 'advertising';

export const SettingsPage: React.FC<SettingsPageProps> = ({ darkMode }) => {
  const { user, currentClub, currentOrganization } = useAuth();
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
  const [lightMode, setLightMode] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [membershipStatus, setMembershipStatus] = useState<'active' | 'expired' | 'none'>('none');
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [showMembershipModal, setShowMembershipModal] = useState(false);
  const { addNotification } = useNotifications();
  const { userClubs, refreshUserClubs } = useAuth();
  const [defaultClubId, setDefaultClubId] = useState<string>('');
  const [scoringMode, setScoringMode] = useState<'pro' | 'touch'>('pro');

  // PWA Install state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  // Accordion state for settings sections
  const [expandedSections, setExpandedSections] = useState<{
    account: boolean;
    club: boolean;
    finance: boolean;
    membership: boolean;
    system: boolean;
  }>({
    account: true,  // Default to first section expanded
    club: false,
    finance: false,
    membership: false,
    system: false,
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

    if (code && state) {
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
        setAvatarUrl(profileData.avatar_url);
        // Use profile data which is synced from members table
        setFirstName(profileData.first_name || user?.user_metadata?.first_name || '');
        setLastName(profileData.last_name || user?.user_metadata?.last_name || '');
        setDefaultClubId(profileData.default_club_id || '');
        setScoringMode((profileData.scoring_mode_preference as 'pro' | 'touch') || 'pro');
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
      // Fallback to user metadata
      setFirstName(user?.user_metadata?.first_name || '');
      setLastName(user?.user_metadata?.last_name || '');
    }
  };

  const checkMembershipStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('is_financial, renewal_date')
        .eq('club_id', currentClub?.clubId)
        .eq('user_id', user?.id)
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
      
      // Create a unique file path
      const fileExt = avatarFile.name.split('.').pop();
      const filePath = `${user.id}/${user.id}-${Date.now()}.${fileExt}`;
      
      // Upload the file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile, { upsert: true });
      
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
        addNotification('App installed successfully!', 'success');
        setIsInstalled(true);
      }

      setDeferredPrompt(null);
    } catch (error) {
      console.error('Error installing PWA:', error);
      addNotification('Failed to install app', 'error');
    }
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

      // Hide success message after 3 seconds
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
    <div className={`h-full overflow-y-auto ${lightMode ? 'bg-gray-50' : ''}`}>
      <div className="p-16">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <Settings className="text-white" size={28} />
            </div>
            <div>
              <h1 className={`text-3xl font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>Settings</h1>
              <p className={lightMode ? 'text-gray-600' : 'text-slate-400'}>Manage your account, team, and club settings</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setLightMode(!lightMode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                lightMode
                  ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              }`}
              aria-label="Toggle dark mode"
            >
              {lightMode ? (
                <>
                  <Moon size={20} />
                  <span className="text-sm font-medium">Dark Mode</span>
                </>
              ) : (
                <>
                  <Sun size={20} />
                  <span className="text-sm font-medium">Light Mode</span>
                </>
              )}
            </button>

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
          <div className="space-y-8">

            {/* Account Settings Section */}
            <div>
              <button
                onClick={() => toggleSection('account')}
                className={`w-full flex items-center justify-between p-4 rounded-lg mb-4 transition-all ${
                  lightMode
                    ? 'bg-white border border-gray-200 hover:bg-gray-50'
                    : 'bg-slate-800/50 border border-slate-700 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <User size={20} className={lightMode ? 'text-blue-600' : 'text-blue-400'} />
                  <h2 className={`text-lg font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                    Account
                  </h2>
                </div>
                <ChevronDown
                  size={20}
                  className={`transition-transform duration-200 ${
                    expandedSections.account ? 'rotate-180' : ''
                  } ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}
                />
              </button>
              <div
                className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-200 overflow-hidden ${
                  expandedSections.account ? 'opacity-100 max-h-[2000px]' : 'opacity-0 max-h-0'
                }`}
              >

              {/* Profile Card */}
              <button
                onClick={() => setActiveTab('profile')}
                className={`
                  group p-6 rounded-xl text-left transition-all border
                  ${activeTab === 'profile'
                    ? lightMode
                      ? 'bg-white border-blue-500 shadow-lg shadow-blue-500/10'
                      : 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                    : lightMode
                      ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                `}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-blue-50' : 'bg-blue-500/20'}`}>
                    <User size={20} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Profile settings</h3>
                    <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                      Manage your personal information and preferences
                    </p>
                  </div>
                </div>
              </button>

              {/* PWA Install Card */}
              {!isInstalled && deferredPrompt && (
                <button
                  onClick={handleInstallPWA}
                  className={`group p-6 rounded-xl text-left transition-all border ${lightMode ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300' : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-blue-50' : 'bg-blue-500/20'}`}>
                      <Smartphone size={20} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Install App</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Install as a standalone app on your device
                      </p>
                    </div>
                  </div>
                </button>
              )}

            </div>
          </div>

          {/* Club Settings Section */}
          {can('settings.club') && !currentOrganization && (
            <div>
              <button
                onClick={() => toggleSection('club')}
                className={`w-full flex items-center justify-between p-4 rounded-lg mb-4 transition-all ${
                  lightMode
                    ? 'bg-white border border-gray-200 hover:bg-gray-50'
                    : 'bg-slate-800/50 border border-slate-700 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Building size={20} className={lightMode ? 'text-emerald-600' : 'text-emerald-400'} />
                  <h2 className={`text-lg font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                    Club
                  </h2>
                </div>
                <ChevronDown
                  size={20}
                  className={`transition-transform duration-200 ${
                    expandedSections.club ? 'rotate-180' : ''
                  } ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}
                />
              </button>
              <div
                className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-200 overflow-hidden ${
                  expandedSections.club ? 'opacity-100 max-h-[2000px]' : 'opacity-0 max-h-0'
                }`}
              >

                {/* Club Profile Card */}
                <button
                  onClick={() => setActiveTab('club')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'club'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-emerald-50' : 'bg-emerald-500/20'}`}>
                      <Building size={20} className="text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Club details</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Configure your club information and settings
                      </p>
                    </div>
                  </div>
                </button>

                {/* Yacht Classes Card */}
                <button
                  onClick={() => setActiveTab('yacht-classes')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'yacht-classes'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-emerald-50' : 'bg-emerald-500/20'}`}>
                      <Sailboat size={20} className="text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Yacht classes</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Manage the boat classes your club races
                      </p>
                    </div>
                  </div>
                </button>

                {/* Team Management Card */}
                {can('settings.team') && (
                  <button
                    onClick={() => setActiveTab('team')}
                    className={`
                      group p-6 rounded-xl text-left transition-all border
                      ${activeTab === 'team'
                        ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                        : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                    `}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-emerald-50' : 'bg-emerald-500/20'}`}>
                        <Users size={20} className="text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Team management</h3>
                        <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                          Manage roles and permissions for your team
                        </p>
                      </div>
                    </div>
                  </button>
                )}

                {/* Dashboard Templates Card */}
                {can('settings.team') && (
                  <button
                    onClick={() => setActiveTab('dashboard-templates')}
                    className={`
                      group p-6 rounded-xl text-left transition-all border
                      ${activeTab === 'dashboard-templates'
                        ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                        : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                    `}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-purple-50' : 'bg-purple-500/20'}`}>
                        <LayoutGrid size={20} className="text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Dashboard templates</h3>
                        <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                          Configure dashboard layouts for committee roles
                        </p>
                      </div>
                    </div>
                  </button>
                )}

                {/* Race Documents Card */}
                {can('settings.documents') && (
                  <button
                    onClick={() => setActiveTab('race-documents')}
                    className={`
                      group p-6 rounded-xl text-left transition-all border
                      ${activeTab === 'race-documents'
                        ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                        : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                    `}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-emerald-50' : 'bg-emerald-500/20'}`}>
                        <FileText size={20} className="text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Race documents</h3>
                        <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                          Manage race document templates and forms
                        </p>
                      </div>
                    </div>
                  </button>
                )}

              </div>
            </div>
          )}

          {/* Finance Settings Section */}
          {can('settings.finance') && (
            <div>
              <button
                onClick={() => toggleSection('finance')}
                className={`w-full flex items-center justify-between p-4 rounded-lg mb-4 transition-all ${
                  lightMode
                    ? 'bg-white border border-gray-200 hover:bg-gray-50'
                    : 'bg-slate-800/50 border border-slate-700 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <DollarSign size={20} className={lightMode ? 'text-amber-600' : 'text-amber-400'} />
                  <h2 className={`text-lg font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                    Finance
                  </h2>
                </div>
                <ChevronDown
                  size={20}
                  className={`transition-transform duration-200 ${
                    expandedSections.finance ? 'rotate-180' : ''
                  } ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}
                />
              </button>
              <div
                className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-200 overflow-hidden ${
                  expandedSections.finance ? 'opacity-100 max-h-[2000px]' : 'opacity-0 max-h-0'
                }`}
              >

                {/* Tax Card */}
                <button
                  onClick={() => setActiveTab('finance-tax')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'finance-tax'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-amber-50' : 'bg-amber-500/20'}`}>
                      <Percent size={20} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Tax</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Manage tax rates for your organization
                      </p>
                    </div>
                  </div>
                </button>

                {/* Categories Card */}
                <button
                  onClick={() => setActiveTab('finance-categories')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'finance-categories'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-amber-50' : 'bg-amber-500/20'}`}>
                      <Tag size={20} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Categories</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Configure income and expense categories
                      </p>
                    </div>
                  </div>
                </button>

                {/* Documents Card */}
                <button
                  onClick={() => setActiveTab('finance-documents')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'finance-documents'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-amber-50' : 'bg-amber-500/20'}`}>
                      <Receipt size={20} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Documents</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Setup invoice and receipt templates
                      </p>
                    </div>
                  </div>
                </button>

                {/* Payment Setup Card */}
                <button
                  onClick={() => setActiveTab('finance-payment')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'finance-payment'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-amber-50' : 'bg-amber-500/20'}`}>
                      <DollarSign size={20} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Payment Setup</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Configure Stripe integration and payment methods
                      </p>
                    </div>
                  </div>
                </button>

              </div>
            </div>
          )}

          {/* Membership Settings Section */}
          {can('settings.membership') && (
            <div>
              <button
                onClick={() => toggleSection('membership')}
                className={`w-full flex items-center justify-between p-4 rounded-lg mb-4 transition-all ${
                  lightMode
                    ? 'bg-white border border-gray-200 hover:bg-gray-50'
                    : 'bg-slate-800/50 border border-slate-700 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Users size={20} className={lightMode ? 'text-purple-600' : 'text-purple-400'} />
                  <h2 className={`text-lg font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                    Membership
                  </h2>
                </div>
                <ChevronDown
                  size={20}
                  className={`transition-transform duration-200 ${
                    expandedSections.membership ? 'rotate-180' : ''
                  } ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}
                />
              </button>
              <div
                className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-200 overflow-hidden ${
                  expandedSections.membership ? 'opacity-100 max-h-[2000px]' : 'opacity-0 max-h-0'
                }`}
              >

                {/* Membership Types Card */}
                <button
                  onClick={() => setActiveTab('membership-types')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'membership-types'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-purple-50' : 'bg-purple-500/20'}`}>
                      <Users size={20} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Membership Types</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Configure membership types and fees
                      </p>
                    </div>
                  </div>
                </button>

                {/* Renewals Card */}
                <button
                  onClick={() => setActiveTab('membership-renewals')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'membership-renewals'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-purple-50' : 'bg-purple-500/20'}`}>
                      <Calendar size={20} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Renewals</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Configure renewal settings and schedules
                      </p>
                    </div>
                  </div>
                </button>

                {/* Email Templates Card */}
                <button
                  onClick={() => setActiveTab('membership-emails')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'membership-emails'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-purple-50' : 'bg-purple-500/20'}`}>
                      <Mail size={20} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Email Templates</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Customize membership email templates
                      </p>
                    </div>
                  </div>
                </button>

                {/* Code of Conduct Card */}
                <button
                  onClick={() => setActiveTab('membership-conduct')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'membership-conduct'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`
                      p-3 rounded-lg transition-colors
                      ${activeTab === 'membership-conduct'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-slate-700 text-slate-400 group-hover:bg-slate-600'}
                    `}>
                      <ScrollText size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Code of Conduct</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Define club rules and conduct policies
                      </p>
                    </div>
                  </div>
                </button>

                {/* Payment Settings Card */}
                <button
                  onClick={() => setActiveTab('membership-payment')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'membership-payment'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`
                      p-3 rounded-lg transition-colors
                      ${activeTab === 'membership-payment'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-slate-700 text-slate-400 group-hover:bg-slate-600'}
                    `}>
                      <CreditCard size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Payment Information</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Configure payment details for invoices
                      </p>
                    </div>
                  </div>
                </button>

              </div>
            </div>
          )}

          {/* Association Settings Section */}
          {currentOrganization && (
            <div>
              <h2 className={`text-lg font-semibold mb-4 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Association settings</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                {/* Association Profile Card */}
                <button
                  onClick={() => setActiveTab('association')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'association'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-cyan-50' : 'bg-cyan-500/20'}`}>
                      <Building size={20} className="text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                        {currentOrganization.type === 'state' ? 'State' : 'National'} Association
                      </h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Configure your association information
                      </p>
                    </div>
                  </div>
                </button>

              </div>
            </div>
          )}

          {/* System Settings Section */}
          <div>
            <button
              onClick={() => toggleSection('system')}
              className={`w-full flex items-center justify-between p-4 rounded-lg mb-4 transition-all ${
                lightMode
                  ? 'bg-white border border-gray-200 hover:bg-gray-50'
                  : 'bg-slate-800/50 border border-slate-700 hover:bg-slate-800/70'
              }`}
            >
              <div className="flex items-center gap-3">
                <Settings size={20} className={lightMode ? 'text-slate-600' : 'text-slate-400'} />
                <h2 className={`text-lg font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                  System
                </h2>
              </div>
              <ChevronDown
                size={20}
                className={`transition-transform duration-200 ${
                  expandedSections.system ? 'rotate-180' : ''
                } ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}
              />
            </button>
            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-200 overflow-hidden ${
                expandedSections.system ? 'opacity-100 max-h-[2000px]' : 'opacity-0 max-h-0'
              }`}
            >

              {/* Subscriptions Card */}
              {can('settings.subscriptions') && (
                <button
                  onClick={() => setActiveTab('subscriptions')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'subscriptions'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-rose-50' : 'bg-rose-500/20'}`}>
                      <CreditCard size={20} className="text-rose-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Subscription & billing</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Manage your subscription plan and billing
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {/* Integrations Card */}
              {can('settings.integrations') && (
                <button
                  onClick={() => setActiveTab('integrations')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'integrations'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-rose-50' : 'bg-rose-500/20'}`}>
                      <Globe size={20} className="text-rose-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Integrations & webhooks</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Connect external services and APIs
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {/* Import/Export Card */}
              {can('settings.import') && (
                <button
                  onClick={() => setActiveTab('import-export')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'import-export'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-rose-50' : 'bg-rose-500/20'}`}>
                      <Download size={20} className="text-rose-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Backup & restore</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Import and export your club data
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {/* Advertising Card - SuperAdmin Only */}
              {user?.user_metadata?.is_super_admin && (
                <button
                  onClick={() => setActiveTab('advertising')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${activeTab === 'advertising'
                      ? 'bg-slate-800/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : lightMode
                        ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-amber-50' : 'bg-amber-500/20'}`}>
                      <Megaphone size={20} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Advertising</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Manage advertisers, campaigns, and analytics
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {/* Privacy Policy Card - SuperAdmin Only */}
              {user?.user_metadata?.is_super_admin && (
                <button
                  onClick={() => navigate('/legal/privacy-policy/edit')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${lightMode
                      ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                      : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-indigo-50' : 'bg-indigo-500/20'}`}>
                      <Shield size={20} className="text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Privacy Policy</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Edit global privacy policy for all clubs
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {/* Terms of Service Card - SuperAdmin Only */}
              {user?.user_metadata?.is_super_admin && (
                <button
                  onClick={() => navigate('/legal/terms-of-service/edit')}
                  className={`
                    group p-6 rounded-xl text-left transition-all border
                    ${lightMode
                      ? 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                      : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 hover:border-slate-600'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg transition-colors ${lightMode ? 'bg-purple-50' : 'bg-purple-500/20'}`}>
                      <ScrollText size={20} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Terms of Service</h3>
                      <p className={`text-sm leading-relaxed ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                        Edit global terms of service for all clubs
                      </p>
                    </div>
                  </div>
                </button>
              )}

            </div>
          </div>
          </div>
        )}

        {/* Content - only show when a tab is selected */}
        {activeTab && (
          <div>
            {activeTab === 'profile' && (
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
              <h2 className="text-xl font-semibold text-white mb-6">Profile Settings</h2>
              
              {/* Organization Type Badge */}
              {currentClub?.club?.organization_type && (
                <div className="mb-6 p-4 rounded-lg bg-blue-900/20 border border-blue-600/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-600/20">
                      {currentClub.club.organization_type === 'club' ? (
                        <Building size={20} className="text-blue-400" />
                      ) : currentClub.club.organization_type === 'state_association' ? (
                        <Users size={20} className="text-blue-400" />
                      ) : (
                        <Globe size={20} className="text-blue-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-blue-400 font-medium">
                        {currentClub.club.organization_type === 'club' 
                          ? 'Yacht Club' 
                          : currentClub.club.organization_type === 'state_association'
                            ? 'State Association'
                            : 'National Association'}
                      </h3>
                      <p className="text-blue-300 text-sm">
                        You have {currentClub.role} access to this organization
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Membership Status Card */}
              {membershipStatus !== 'none' && (
                <div className={`
                  mb-8 p-6 rounded-xl border backdrop-blur-sm
                  ${membershipStatus === 'active'
                    ? 'bg-green-900/10 border-green-900/30'
                    : 'bg-red-900/10 border-red-900/30'}
                `}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`
                        p-3 rounded-lg
                        ${membershipStatus === 'active' ? 'bg-green-900/30' : 'bg-red-900/30'}
                      `}>
                        <CreditCard size={24} className={membershipStatus === 'active' ? 'text-green-400' : 'text-red-400'} />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-white">
                          {membershipStatus === 'active' ? 'Active Membership' : 'Membership Expired'}
                        </h2>
                        <p className={`text-sm ${membershipStatus === 'active' ? 'text-green-300' : 'text-red-300'}`}>
                          {membershipStatus === 'active'
                            ? `Your membership is active until ${formatDate(renewalDate)}`
                            : 'Your membership has expired and needs renewal'}
                        </p>
                      </div>
                    </div>
                    
                    <a
                      href={`/membership/${currentClub?.clubId}`}
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-colors
                        ${membershipStatus === 'active'
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-red-600 text-white hover:bg-red-700'}
                      `}
                    >
                      {membershipStatus === 'active' ? 'View Membership' : 'Renew Now'}
                    </a>
                  </div>
                </div>
              )}

              {/* Join Club Card - for non-members */}
              {membershipStatus === 'none' && currentClub?.club && (
                <div className="mb-8 p-6 rounded-xl border border-blue-900/30 bg-blue-900/10 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-blue-900/30">
                        <Users size={24} className="text-blue-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-white">
                          Join {currentClub.club.name}
                        </h2>
                        <p className="text-sm text-blue-300">
                          Become a member to participate in club events and races
                        </p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => setShowMembershipModal(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                    >
                      Apply for Membership
                    </button>
                  </div>
                </div>
              )}
              
              {error && (
                <div className="mb-4 p-4 rounded-md bg-red-900/20 border border-red-900/30">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-300">
                        {error}
                      </h3>
                    </div>
                  </div>
                </div>
              )}
              
              {success && (
                <div className="mb-4 p-4 rounded-md bg-green-900/20 border border-green-900/30">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <Check className="h-5 w-5 text-green-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-green-300">
                        Profile updated successfully
                      </h3>
                    </div>
                  </div>
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div>
                    <label htmlFor="first-name" className="block text-sm font-medium text-slate-300 mb-1">
                      First name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        id="first-name"
                        name="first-name"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-slate-600 rounded-lg shadow-sm bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="John"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="last-name" className="block text-sm font-medium text-slate-300 mb-1">
                      Last name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        id="last-name"
                        name="last-name"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-slate-600 rounded-lg shadow-sm bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Doe"
                      />
                    </div>
                  </div>
                </div>
              {/* Avatar Upload Section */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Profile Picture
                </label>
                <div className="flex items-center gap-6">
                  <div className="relative">
                    {avatarUrl ? (
                      <img 
                        src={avatarUrl} 
                        alt="Profile" 
                        className="w-24 h-24 rounded-full object-cover border-2 border-slate-600"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center">
                        <User size={40} className="text-slate-400" />
                      </div>
                    )}
                    
                    {isUploadingAvatar && (
                      <div className="absolute inset-0 bg-slate-900/70 rounded-full flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                      <Upload size={16} />
                      <span>Upload Image</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleAvatarChange} 
                        className="hidden" 
                        disabled={isUploadingAvatar || loading}
                      />
                    </label>
                    
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        disabled={isUploadingAvatar || loading}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors"
                      >
                        <Trash2 size={16} />
                        <span>Remove</span>
                      </button>
                    )}
                    
                    <p className="text-xs text-slate-400">
                      Recommended: Square image, max 2MB
                    </p>
                  </div>
                </div>
              </div>
              

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      disabled
                      value={email}
                      className="block w-full pl-10 pr-3 py-2 border border-slate-600 rounded-lg shadow-sm bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-70 disabled:cursor-not-allowed"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Email address cannot be changed
                  </p>
                </div>

                {/* Default Club Selector */}
                {userClubs && userClubs.length > 1 && (
                  <div>
                    <label htmlFor="default-club" className="block text-sm font-medium text-slate-300 mb-1">
                      Default Club
                    </label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <select
                        id="default-club"
                        name="default-club"
                        value={defaultClubId}
                        onChange={(e) => setDefaultClubId(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-slate-600 rounded-lg shadow-sm bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer"
                      >
                        <option value="">No default (manual selection)</option>
                        {userClubs.map((userClub) => (
                          <option key={userClub.clubId} value={userClub.clubId}>
                            {userClub.club?.name || 'Unnamed Club'}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                        </svg>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      This club will open automatically when you log in
                    </p>
                  </div>
                )}

                {/* Scoring Mode Preference */}
                <div>
                  <label htmlFor="scoring-mode" className="block text-sm font-medium text-slate-300 mb-1">
                    Race Scoring Mode
                  </label>
                  <div className="relative">
                    <Sailboat className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <select
                      id="scoring-mode"
                      name="scoring-mode"
                      value={scoringMode}
                      onChange={(e) => setScoringMode(e.target.value as 'pro' | 'touch')}
                      className="block w-full pl-10 pr-3 py-2 border border-slate-600 rounded-lg shadow-sm bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer"
                    >
                      <option value="pro">Pro Mode - Full table with all details</option>
                      <option value="touch">Touch Mode - Simplified tablet-optimized scoring</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {scoringMode === 'pro'
                      ? 'Pro Mode: Best for desktop scoring with full table view and all race details'
                      : 'Touch Mode: Optimized for tablets with large sail numbers and drag-and-drop interface'}
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Saving...
                      </div>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'club' && (
            <ClubProfileSettings darkMode={darkMode} />
          )}

          {activeTab === 'yacht-classes' && (
            <ClubYachtClassesSelector darkMode={darkMode} />
          )}

          {activeTab === 'association' && (
            <AssociationProfileSettings darkMode={darkMode} />
          )}

          {activeTab === 'team' && (
            <CommitteeManagement darkMode={darkMode} />
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
            <FinanceSettingsPage darkMode={darkMode} initialTab="taxes" />
          )}

          {activeTab === 'finance-categories' && (
            <FinanceSettingsPage darkMode={darkMode} initialTab="categories" />
          )}

          {activeTab === 'finance-documents' && (
            <FinanceSettingsPage darkMode={darkMode} initialTab="transactions" />
          )}

          {activeTab === 'finance-payment' && (
            <FinanceSettingsPage darkMode={darkMode} initialTab="membership" />
          )}

          {activeTab === 'membership-types' && (
            <MembershipSettingsPage darkMode={darkMode} initialView="types" />
          )}

          {activeTab === 'membership-renewals' && (
            <MembershipSettingsPage darkMode={darkMode} initialView="renewals" />
          )}

          {activeTab === 'membership-emails' && (
            <MembershipSettingsPage darkMode={darkMode} initialView="emails" />
          )}

          {activeTab === 'membership-conduct' && (
            <MembershipSettingsPage darkMode={darkMode} initialView="conduct" />
          )}

          {activeTab === 'membership-payment' && (
            <FinanceSettingsPage darkMode={darkMode} initialTab="transactions" initialSection="payment" />
          )}

          {activeTab === 'race-documents' && (
            <RaceDocumentsPage darkMode={darkMode} />
          )}

          {activeTab === 'import-export' && (
            <BackupRestoreSection darkMode={darkMode} />
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
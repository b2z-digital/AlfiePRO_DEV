import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Facebook, Check, AlertTriangle, RefreshCw, ExternalLink, Youtube, Loader, Instagram, CreditCard, DollarSign, BarChart3, X, Save, HardDrive, MessageSquare, ArrowLeft, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { PublishToMetaModal } from '../PublishToMetaModal';
import { useNotifications } from '../../contexts/NotificationContext';
import { SmsManagementPage } from '../sms/SmsManagementPage';

interface IntegrationsPageProps {
  darkMode: boolean;
}

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  connected: boolean;
  enabled: boolean;
  connectedInfo?: {
    label: string;
    value: string;
    url?: string;
  };
}

export const IntegrationsPage: React.FC<IntegrationsPageProps> = ({ darkMode }) => {
  const { currentClub, currentOrganization } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const { addNotification } = useNotifications();
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showSmsManagement, setShowSmsManagement] = useState(false);
  const callbackProcessedRef = React.useRef(false);

  // Configuration states
  const [googleAnalyticsId, setGoogleAnalyticsId] = useState('');
  const [paypalClientId, setPaypalClientId] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [facebookPages, setFacebookPages] = useState<Array<{ id: string; name: string; access_token: string }>>([]);
  const [selectedFacebookPage, setSelectedFacebookPage] = useState('');
  const [facebookAccessToken, setFacebookAccessToken] = useState('');

  // Integration states
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: 'google',
      name: 'Google Calendar',
      description: 'Connect Google Calendar to automatically generate Google Meet links for meetings.',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      ),
      iconBg: 'bg-slate-700/50',
      iconColor: 'text-white',
      connected: false,
      enabled: false,
    },
    {
      id: 'google_drive',
      name: 'Google Drive',
      description: 'Connect Google Drive to manage your club resources and files.',
      icon: (
        <svg width="32" height="32" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
          <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
          <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
          <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
          <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
          <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
        </svg>
      ),
      iconBg: 'bg-slate-700/50',
      iconColor: 'text-white',
      connected: false,
      enabled: false,
    },
    {
      id: 'stripe',
      name: 'Stripe',
      description: 'Accept credit card payments for memberships and event entries.',
      icon: (
        <svg width="32" height="32" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="28" height="28" rx="6" fill="#635BFF"/>
          <path d="M13.3 11.2c0-.69.57-1.01 1.49-1.01 1.32 0 2.99.4 4.31 1.11V7.58c-1.43-.56-2.85-.83-4.31-.83-3.51 0-5.84 1.84-5.84 4.91 0 4.78 6.59 4.02 6.59 6.08 0 .8-.7 1.06-1.67 1.06-1.45 0-3.32-.6-4.79-1.4v3.75c1.61.67 3.23 1.01 4.79 1.01 3.59 0 6.06-1.77 6.06-4.89 0-5.16-6.63-4.25-6.63-6.27z" fill="white"/>
        </svg>
      ),
      iconBg: 'bg-slate-700/50',
      iconColor: 'text-white',
      connected: false,
      enabled: false,
    },
    {
      id: 'google-analytics',
      name: 'Google Analytics',
      description: 'Track data with Google Analytics when users visit your site.',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path d="M22.84 2.998v18.004c0 .55-.445.998-.994.998a.997.997 0 01-.994-.998V2.998c0-.55.445-.998.994-.998.55 0 .994.447.994.998z" fill="#F9AB00"/>
          <path d="M12.5 8.995v12.007c0 .55-.447.998-.998.998a.997.997 0 01-.997-.998V8.995c0-.55.447-.998.997-.998.55 0 .998.447.998.998z" fill="#E37400"/>
          <circle cx="3.499" cy="19.5" r="2.5" fill="#E37400"/>
        </svg>
      ),
      iconBg: 'bg-slate-700/50',
      iconColor: 'text-white',
      connected: false,
      enabled: false,
    },
    {
      id: 'facebook',
      name: 'Facebook',
      description: 'Connect with Facebook to directly reach and market to your followers.',
      icon: <Facebook size={32} />,
      iconBg: 'bg-blue-600/20',
      iconColor: 'text-blue-400',
      connected: false,
      enabled: false,
    },
    {
      id: 'instagram',
      name: 'Instagram',
      description: 'Share race photos and results directly to your Instagram account.',
      icon: <Instagram size={32} />,
      iconBg: 'bg-pink-600/20',
      iconColor: 'text-pink-400',
      connected: false,
      enabled: false,
    },
    {
      id: 'youtube',
      name: 'Youtube',
      description: 'Connect your YouTube channel to attach videos to events.',
      icon: <Youtube size={32} />,
      iconBg: 'bg-red-600/20',
      iconColor: 'text-red-400',
      connected: false,
      enabled: false,
    },
    {
      id: 'paypal',
      name: 'PayPal',
      description: 'Accept PayPal payments for memberships and event registrations.',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path d="M8.32 23.295l.924-5.86h-2.52L8.71 4.837c.03-.19.093-.348.19-.474.097-.125.232-.19.404-.19h6.636c1.58 0 2.79.348 3.632 1.045.843.696 1.264 1.737 1.264 3.123 0 .347-.03.725-.093 1.136-.442 2.678-1.674 4.415-3.696 5.21l-.19.063c1.106.19 1.926.6 2.458 1.23.532.633.798 1.487.798 2.562 0 .41-.047.82-.14 1.23-.347 1.833-1.106 3.218-2.277 4.162-1.17.945-2.715 1.417-4.634 1.417H8.32zm2.646-9.67l-.683 4.35h2.52c.946 0 1.706-.22 2.278-.663.572-.442.905-1.076 1.007-1.9.047-.316.047-.6 0-.854-.046-.252-.163-.474-.35-.663-.19-.19-.458-.316-.808-.38-.35-.063-.783-.095-1.302-.095h-2.52zm1.074-6.857l-.61 3.886h2.52c.758 0 1.407-.19 1.947-.57.54-.38.843-.946.95-1.704.095-.474.047-.885-.14-1.23-.19-.348-.62-.522-1.292-.522H12.04z" fill="#003087"/>
          <path d="M8.32 23.295l.924-5.86h-2.52L8.71 4.837c.03-.19.093-.348.19-.474.097-.125.232-.19.404-.19h6.636c1.58 0 2.79.348 3.632 1.045.843.696 1.264 1.737 1.264 3.123 0 .347-.03.725-.093 1.136-.442 2.678-1.674 4.415-3.696 5.21l-.19.063c1.106.19 1.926.6 2.458 1.23.532.633.798 1.487.798 2.562 0 .41-.047.82-.14 1.23-.347 1.833-1.106 3.218-2.277 4.162-1.17.945-2.715 1.417-4.634 1.417H8.32z" fill="#0070E0"/>
        </svg>
      ),
      iconBg: 'bg-slate-700/50',
      iconColor: 'text-white',
      connected: false,
      enabled: false,
    },
    {
      id: 'sms',
      name: 'SMS Attendance',
      description: 'Automated SMS notifications for event attendance with YES/NO/MAYBE replies.',
      icon: <MessageSquare size={32} />,
      iconBg: 'bg-teal-600/20',
      iconColor: 'text-teal-400',
      connected: false,
      enabled: false,
    },
  ]);

  useEffect(() => {
    if (currentClub?.clubId || currentOrganization?.id) {
      fetchIntegrationStatus();
      checkConnectionFromRedirect();
    }
  }, [currentClub, currentOrganization]);

  const checkConnectionFromRedirect = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    // Prevent processing the same OAuth callback twice if the effect re-runs
    if (callbackProcessedRef.current) return;
    if (code) callbackProcessedRef.current = true;

    if (urlParams.get('stripe_connected') === 'true') {
      setSuccess('Stripe account connected successfully!');
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => {
        fetchIntegrationStatus();
        setSuccess(null);
      }, 2000);
      return;
    }

    if (urlParams.get('youtube_connected') === 'true') {
      const channelName = urlParams.get('channel_name') || 'YouTube';
      setSuccess(`YouTube connected successfully: ${channelName}`);
      addNotification('success', `Connected to YouTube channel: ${channelName}`);
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => {
        fetchIntegrationStatus();
        setSuccess(null);
      }, 3000);
      return;
    }

    if (urlParams.get('youtube_error')) {
      const ytError = urlParams.get('youtube_error');
      setError(`YouTube connection failed: ${ytError}`);
      addNotification('error', `YouTube connection failed: ${ytError}`);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (code && state) {
      try {
        const stateData = JSON.parse(decodeURIComponent(state));
        const { integration, clubId, associationId, associationType } = stateData;

        if (integration === 'facebook') {
          await handleFacebookCallback(code, clubId);
        } else if (integration === 'instagram') {
          await handleInstagramCallback(code, clubId);
        } else if (integration === 'google') {
          await handleGoogleCallback(code, clubId, associationId, associationType);
        } else if (integration === 'youtube') {
          await handleYoutubeCallback(code, clubId);
        } else if (integration === 'google_drive') {
          await handleGoogleDriveCallback(code, clubId, associationId, associationType);
        }

        window.history.replaceState({}, '', window.location.pathname);
      } catch (err) {
        console.error('Error processing OAuth callback:', err);
        setError('Failed to connect integration');
      }
    }
  };

  const fetchIntegrationStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      let data, error;

      if (currentClub?.clubId) {
        console.log('Fetching integrations for club:', currentClub.clubId);
        const result = await supabase
          .from('integrations')
          .select('*')
          .eq('club_id', currentClub.clubId);
        data = result.data;
        error = result.error;
      } else if (currentOrganization?.id) {
        console.log('Fetching integrations for association:', currentOrganization.id, currentOrganization.type);
        const idColumn = currentOrganization.type === 'national' ? 'national_association_id' : 'state_association_id';
        const result = await supabase
          .from('integrations')
          .select('*')
          .eq(idColumn, currentOrganization.id);
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log('Fetched integrations:', data);

      const orgId = currentClub?.clubId || currentOrganization?.id;
      const { data: smsSettings } = await supabase
        .from('sms_club_settings')
        .select('is_enabled')
        .eq('club_id', orgId)
        .maybeSingle();

      setIntegrations(prev => prev.map(integration => {
        const dbIntegration = data?.find(i => i.platform === integration.id);

        console.log(`Processing integration ${integration.id}:`, {
          found: !!dbIntegration,
          enabled: dbIntegration?.is_active,
          data: dbIntegration
        });

        if (dbIntegration && dbIntegration.is_active) {
          let connectedInfo;
          const credentials = dbIntegration.credentials || {};

          switch (integration.id) {
            case 'facebook':
              connectedInfo = {
                label: 'Connected to Facebook Page:',
                value: credentials.page_name || '',
                url: `https://facebook.com/${credentials.page_id}`
              };
              break;
            case 'youtube':
              connectedInfo = {
                label: 'Connected to YouTube Channel:',
                value: credentials.channel_name || '',
                url: credentials.channel_id ? `https://youtube.com/channel/${credentials.channel_id}` : undefined
              };
              break;
            case 'google_drive':
              connectedInfo = {
                label: 'Connected Google Drive:',
                value: credentials.google_account_email || 'Connected',
                url: credentials.folder_id ?
                  `https://drive.google.com/drive/folders/${credentials.folder_id}` :
                  undefined
              };
              console.log('Google Drive connected info:', connectedInfo);
              break;
            case 'instagram':
              connectedInfo = {
                label: 'Connected to Instagram:',
                value: `@${credentials.username || ''}`,
                url: credentials.username ? `https://instagram.com/${credentials.username}` : undefined
              };
              break;
            case 'google':
              connectedInfo = {
                label: 'Connected Google Account:',
                value: credentials.email || 'Connected'
              };
              break;
            case 'google-analytics':
              connectedInfo = {
                label: 'Google Analytics Property ID:',
                value: dbIntegration.google_analytics_property_id || ''
              };
              setGoogleAnalyticsId(dbIntegration.google_analytics_property_id || '');
              break;
            case 'paypal':
              connectedInfo = {
                label: 'PayPal Account:',
                value: dbIntegration.paypal_email || ''
              };
              setPaypalEmail(dbIntegration.paypal_email || '');
              setPaypalClientId(dbIntegration.paypal_merchant_id || '');
              break;
          }

          return {
            ...integration,
            connected: true,
            enabled: true,
            connectedInfo
          };
        }

        if (integration.id === 'sms') {
          const smsData = data?.find(i => i.platform === 'sms');
          if ((smsData && smsData.is_active) || smsSettings?.is_enabled) {
            return {
              ...integration,
              connected: true,
              enabled: true,
              connectedInfo: {
                label: 'SMS Attendance',
                value: 'Active',
              }
            };
          }
          return integration;
        }

        if (integration.id === 'stripe' && currentClub?.stripe_account_id) {
          return {
            ...integration,
            connected: true,
            enabled: true,
            connectedInfo: {
              label: 'Stripe Account Connected',
              value: 'Active'
            }
          };
        }

        return integration;
      }));
    } catch (err) {
      console.error('Error fetching integration status:', err);
      setError(err instanceof Error ? err.message : 'Failed to load integration status');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleIntegration = async (integrationId: string) => {
    const integration = integrations.find(i => i.id === integrationId);
    if (!integration) return;

    if (!integration.connected) {
      switch (integrationId) {
        case 'facebook':
          handleConnectFacebook();
          break;
        case 'instagram':
          handleConnectInstagram();
          break;
        case 'youtube':
          handleConnectYoutube();
          break;
        case 'google_drive':
          handleConnectGoogleDrive();
          break;
        case 'stripe':
          await handleConnectStripe();
          break;
        case 'google':
          handleConnectGoogle();
          break;
        case 'google-analytics':
          setSelectedIntegration('google-analytics');
          setShowConfigModal(true);
          break;
        case 'paypal':
          setSelectedIntegration('paypal');
          setShowConfigModal(true);
          break;
        case 'sms':
          setShowSmsManagement(true);
          break;
        default:
          addNotification('info', `${integration.name} integration coming soon!`);
      }
      return;
    }

    // Disconnect integrations
    switch (integrationId) {
      case 'facebook':
        await handleDisconnectIntegration('meta');
        break;
      case 'youtube':
      case 'instagram':
      case 'google':
      case 'google-analytics':
      case 'paypal':
        await handleDisconnectIntegration(integrationId);
        break;
      case 'sms':
        setShowSmsManagement(true);
        break;
      case 'stripe':
        await handleDisconnectStripe();
        break;
      case 'google_drive':
        await handleDisconnectGoogleDrive();
        break;
      default:
        await toggleIntegrationEnabled(integrationId);
    }
  };

  const handleConnectFacebook = async () => {
    try {
      const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
      if (!appId) {
        addNotification('error', 'Facebook integration not configured');
        return;
      }

      const redirectUri = `${window.location.origin}/settings`;
      const scope = 'pages_show_list,pages_read_engagement,pages_manage_posts';

      const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
        `client_id=${appId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${scope}&` +
        `response_type=code&` +
        `state=${encodeURIComponent(JSON.stringify({ clubId: currentClub?.clubId, integration: 'facebook' }))}`;

      window.location.href = authUrl;
    } catch (err) {
      console.error('Error initiating Facebook OAuth:', err);
      addNotification('error', 'Failed to connect Facebook');
    }
  };

  const handleConnectInstagram = async () => {
    try {
      const appId = import.meta.env.VITE_INSTAGRAM_APP_ID || '123456789';
      const redirectUri = `${window.location.origin}/settings`;

      const authUrl = `https://api.instagram.com/oauth/authorize?` +
        `client_id=${appId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=user_profile,user_media&` +
        `response_type=code&` +
        `state=${encodeURIComponent(JSON.stringify({ clubId: currentClub?.clubId, integration: 'instagram' }))}`;

      window.location.href = authUrl;
    } catch (err) {
      console.error('Error initiating Instagram OAuth:', err);
      addNotification('error', 'Failed to connect Instagram');
    }
  };

  const handleConnectYoutube = async () => {
    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '230273275079-723coi1ukfg2vngapur5djnug1cer6hd.apps.googleusercontent.com';
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const redirectUri = `${supabaseUrl}/functions/v1/youtube-oauth-callback`;
      const scope = 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload';

      const stateData = {
        clubId: currentClub?.clubId,
        integration: 'youtube',
        origin: window.location.origin,
      };

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scope)}&` +
        `response_type=code&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${encodeURIComponent(JSON.stringify(stateData))}`;

      window.location.href = authUrl;
    } catch (err) {
      console.error('Error initiating YouTube OAuth:', err);
      addNotification('error', 'Failed to connect YouTube');
    }
  };

  const handleConnectGoogleDrive = async () => {
    try {
      // Fetch the client ID from the edge function to guarantee it matches the server-side secret
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const clientIdRes = await fetch(`${supabaseUrl}/functions/v1/google-drive-oauth-callback`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${anonKey}` },
      });
      const clientIdData = await clientIdRes.json();
      if (!clientIdData.clientId) {
        throw new Error('Google Drive is not configured. Please contact support.');
      }
      const clientId = clientIdData.clientId;

      const redirectUri = `${window.location.origin}/settings`;
      const scope = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly';

      const stateData: any = { integration: 'google_drive' };
      // Association context takes priority over club context
      if (currentOrganization?.id) {
        stateData.associationId = currentOrganization.id;
        stateData.associationType = currentOrganization.type;
      } else if (currentClub?.clubId) {
        stateData.clubId = currentClub.clubId;
      }

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scope)}&` +
        `response_type=code&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${encodeURIComponent(JSON.stringify(stateData))}`;

      window.location.href = authUrl;
    } catch (err) {
      console.error('Error initiating Google Drive OAuth:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to connect Google Drive');
    }
  };

  const handleConnectGoogle = async () => {
    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '230273275079-723coi1ukfg2vngapur5djnug1cer6hd.apps.googleusercontent.com';
      const redirectUri = `${window.location.origin}/settings`;
      const scope = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/calendar';

      const stateData: any = { integration: 'google' };
      if (currentClub?.clubId) {
        stateData.clubId = currentClub.clubId;
      } else if (currentOrganization?.id) {
        stateData.associationId = currentOrganization.id;
        stateData.associationType = currentOrganization.type;
      }

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scope)}&` +
        `response_type=code&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${encodeURIComponent(JSON.stringify(stateData))}`;

      window.location.href = authUrl;
    } catch (err) {
      console.error('Error initiating Google OAuth:', err);
      addNotification('error', 'Failed to connect Google');
    }
  };

  const handleConnectStripe = async () => {
    if (!currentClub?.clubId) {
      setError('No club selected');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      addNotification('info', 'Connecting to Stripe...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('You must be logged in to connect Stripe');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connect-stripe`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            club_id: currentClub.clubId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || 'Failed to connect to Stripe';

        if (response.status === 500 && errorMessage.includes('STRIPE_SECRET_KEY')) {
          throw new Error('Stripe is not configured. Please contact support to set up Stripe integration.');
        }

        throw new Error(errorMessage);
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No redirect URL received from Stripe');
      }
    } catch (err) {
      console.error('Error connecting Stripe:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect Stripe');
      addNotification('error', err instanceof Error ? err.message : 'Failed to connect Stripe');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectStripe = async () => {
    try {
      setSaving(true);
      setError(null);

      const { error } = await supabase
        .from('clubs')
        .update({
          stripe_account_id: null,
          stripe_enabled: false
        })
        .eq('id', currentClub?.clubId);

      if (error) throw error;

      setIntegrations(prev => prev.map(i =>
        i.id === 'stripe' ? { ...i, connected: false, enabled: false, connectedInfo: undefined } : i
      ));

      addNotification('success', 'Stripe integration disconnected successfully');
    } catch (err) {
      console.error('Error disconnecting Stripe:', err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect Stripe');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectGoogleDrive = async () => {
    try {
      setSaving(true);
      setError(null);

      let query = supabase.from('integrations').delete().eq('platform', 'google_drive');

      if (currentClub?.clubId) {
        query = query.eq('club_id', currentClub.clubId);
      } else if (currentOrganization?.id) {
        const idColumn = currentOrganization.type === 'national' ? 'national_association_id' : 'state_association_id';
        query = query.eq(idColumn, currentOrganization.id);
      } else {
        throw new Error('No organisation found');
      }

      const { error } = await query;
      if (error) throw error;

      await fetchIntegrationStatus();
      addNotification('success', 'Google Drive disconnected successfully');
    } catch (err) {
      console.error('Error disconnecting Google Drive:', err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect Google Drive');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectIntegration = async (provider: string) => {
    try {
      setSaving(true);
      setError(null);

      const { error } = await supabase
        .from('integrations')
        .delete()
        .eq('club_id', currentClub?.clubId)
        .eq('platform', provider);

      if (error) throw error;

      await fetchIntegrationStatus();
      addNotification('success', 'Integration disconnected successfully');
    } catch (err) {
      console.error('Error disconnecting integration:', err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect integration');
    } finally {
      setSaving(false);
    }
  };

  const toggleIntegrationEnabled = async (integrationId: string) => {
    try {
      const integration = integrations.find(i => i.id === integrationId);
      if (!integration) return;

      const { error } = await supabase
        .from('integrations')
        .update({ is_active: !integration.enabled })
        .eq('club_id', currentClub?.clubId)
        .eq('platform', integrationId);

      if (error) throw error;

      await fetchIntegrationStatus();
    } catch (err) {
      console.error('Error toggling integration:', err);
      addNotification('error', 'Failed to update integration');
    }
  };

  const handleSaveGoogleAnalytics = async () => {
    if (!googleAnalyticsId.trim()) {
      addNotification('error', 'Please enter a Google Analytics Property ID');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const { error } = await supabase
        .from('club_integrations')
        .upsert({
          club_id: currentClub?.clubId,
          provider: 'google-analytics',
          google_analytics_property_id: googleAnalyticsId,
          is_enabled: true,
          connected_at: new Date().toISOString()
        }, {
          onConflict: 'club_id,provider'
        });

      if (error) throw error;

      setShowConfigModal(false);
      await fetchIntegrationStatus();
      addNotification('success', 'Google Analytics connected successfully');
    } catch (err) {
      console.error('Error saving Google Analytics:', err);
      addNotification('error', 'Failed to connect Google Analytics');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePayPal = async () => {
    if (!paypalEmail.trim() || !paypalClientId.trim()) {
      addNotification('error', 'Please enter PayPal email and client ID');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const { error } = await supabase
        .from('club_integrations')
        .upsert({
          club_id: currentClub?.clubId,
          provider: 'paypal',
          paypal_email: paypalEmail,
          paypal_merchant_id: paypalClientId,
          is_enabled: true,
          connected_at: new Date().toISOString()
        }, {
          onConflict: 'club_id,provider'
        });

      if (error) throw error;

      setShowConfigModal(false);
      await fetchIntegrationStatus();
      addNotification('success', 'PayPal connected successfully');
    } catch (err) {
      console.error('Error saving PayPal:', err);
      addNotification('error', 'Failed to connect PayPal');
    } finally {
      setSaving(false);
    }
  };

  const handleFacebookCallback = async (code: string, clubId: string) => {
    try {
      setSaving(true);
      setError(null);
      addNotification('info', 'Connecting to Facebook...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const redirectUri = `${window.location.origin}/settings`;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-oauth-callback`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, redirectUri, clubId }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect Facebook');
      }

      if (data.pages && data.pages.length > 0) {
        setFacebookPages(data.pages);
        setFacebookAccessToken(data.pages[0].access_token);
        setSelectedIntegration('facebook');
        setShowConfigModal(true);
      } else {
        throw new Error('No Facebook pages found');
      }
    } catch (err) {
      console.error('Error in Facebook callback:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to connect Facebook');
    } finally {
      setSaving(false);
    }
  };

  const handleInstagramCallback = async (code: string, clubId: string) => {
    try {
      setSaving(true);
      setError(null);
      addNotification('info', 'Connecting to Instagram...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const redirectUri = `${window.location.origin}/settings`;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-oauth-callback`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, redirectUri, clubId }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect Instagram');
      }

      await fetchIntegrationStatus();
      setSuccess('Instagram connected successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error in Instagram callback:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to connect Instagram');
    } finally {
      setSaving(false);
    }
  };

  const handleGoogleCallback = async (code: string, clubId?: string, associationId?: string, associationType?: string) => {
    try {
      setSaving(true);
      setError(null);
      addNotification('info', 'Connecting to Google...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const redirectUri = `${window.location.origin}/settings`;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-oauth-callback`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, redirectUri, clubId, associationId, associationType }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect Google');
      }

      await fetchIntegrationStatus();
      setSuccess('Google connected successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error in Google callback:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to connect Google');
    } finally {
      setSaving(false);
    }
  };

  const handleYoutubeCallback = async (code: string, clubId: string) => {
    try {
      setSaving(true);
      setError(null);
      addNotification('info', 'Connecting to YouTube...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const redirectUri = `${window.location.origin}/settings`;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-oauth-callback`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            state: JSON.stringify({ clubId, integration: 'youtube' }),
            redirectUri,
            clubId
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect YouTube');
      }

      await fetchIntegrationStatus();
      setSuccess('YouTube connected successfully!');
      setTimeout(() => setSuccess(null), 3000);
      addNotification('success', `Connected to YouTube channel: ${data.channelName}`);
    } catch (err) {
      console.error('Error in YouTube callback:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to connect YouTube');
    } finally {
      setSaving(false);
    }
  };

  const handleGoogleDriveCallback = async (code: string, clubId?: string, associationId?: string, associationType?: string) => {
    try {
      setSaving(true);
      setError(null);
      addNotification('info', 'Connecting to Google Drive...');

      const organizationId = clubId || associationId;
      const orgType = clubId ? 'club' : associationType;

      console.log('Google Drive callback triggered:', { code: code.substring(0, 10) + '...', organizationId, orgType });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const redirectUri = `${window.location.origin}/settings`;

      console.log('Calling edge function with:', {
        redirectUri,
        organizationId,
        organizationType: orgType
      });

      const stateData: any = { integration: 'google_drive' };
      if (clubId) {
        stateData.clubId = clubId;
      } else if (associationId && associationType) {
        stateData.associationId = associationId;
        stateData.associationType = associationType;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-oauth-callback`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            state: JSON.stringify(stateData),
            redirectUri,
            organizationId,
            organizationType: orgType
          }),
        }
      );

      const data = await response.json();
      console.log('Edge function response:', { status: response.status, data });

      if (!response.ok) {
        const errMsg = data.error || 'Failed to connect Google Drive';
        const isCredsMismatch = errMsg.includes('invalid_client') || errMsg.includes('Unauthorized');
        throw new Error(isCredsMismatch
          ? 'Google Drive credentials mismatch. The OAuth client ID/secret in the server configuration does not match the Google Cloud project. Please contact support.'
          : errMsg
        );
      }

      console.log('Fetching updated integration status...');
      await fetchIntegrationStatus();
      setSuccess('Google Drive connected successfully!');
      setTimeout(() => setSuccess(null), 3000);
      addNotification('success', `Connected to Google Drive: ${data.userEmail}`);

      // Navigate to Resources page to show synced files
      setTimeout(() => {
        window.location.href = '/resources';
      }, 1500);
    } catch (err) {
      console.error('Error in Google Drive callback:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to connect Google Drive');
    } finally {
      setSaving(false);
    }
  };

  const saveFacebookPage = async () => {
    if (!selectedFacebookPage) {
      addNotification('error', 'Please select a Facebook page');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const selectedPage = facebookPages.find(p => p.id === selectedFacebookPage);
      if (!selectedPage) throw new Error('Selected page not found');

      const { error } = await supabase
        .from('club_integrations')
        .upsert({
          club_id: currentClub?.clubId,
          provider: 'meta',
          page_id: selectedPage.id,
          page_name: selectedPage.name,
          access_token: selectedPage.access_token,
          is_enabled: true,
          connected_at: new Date().toISOString()
        }, {
          onConflict: 'club_id,provider'
        });

      if (error) throw error;

      setShowConfigModal(false);
      setFacebookPages([]);
      setSelectedFacebookPage('');
      await fetchIntegrationStatus();
      setSuccess('Facebook connected successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving Facebook page:', err);
      addNotification('error', 'Failed to save Facebook page');
    } finally {
      setSaving(false);
    }
  };

  if (showSmsManagement) {
    const clubId = currentClub?.clubId || currentOrganization?.id || '';
    return (
      <div className="space-y-6">
        <button
          onClick={() => setShowSmsManagement(false)}
          className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Integrations
        </button>
        <SmsManagementPage darkMode={darkMode} clubId={clubId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30">
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
        <div className="p-4 rounded-lg bg-green-900/20 border border-green-900/30">
          <div className="flex">
            <div className="flex-shrink-0">
              <Check className="h-5 w-5 text-green-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-300">
                {success}
              </h3>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Globe className="text-blue-400" size={32} />
          <h2 className="text-3xl font-bold text-white">Integrations</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((integration) => (
            <div
              key={integration.id}
              className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50 p-6 hover:border-slate-600/50 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-4">
                  <div className={`${integration.iconBg} ${integration.iconColor} p-3 rounded-lg flex-shrink-0`}>
                    {integration.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white mb-1">
                      {integration.name}
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {integration.description}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleToggleIntegration(integration.id)}
                  disabled={saving}
                  className={`
                    relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                    transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800
                    ${integration.enabled ? 'bg-blue-600' : 'bg-slate-600'}
                    ${saving ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                  role="switch"
                  aria-checked={integration.enabled}
                >
                  <span
                    aria-hidden="true"
                    className={`
                      pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                      transition duration-200 ease-in-out
                      ${integration.enabled ? 'translate-x-5' : 'translate-x-0'}
                    `}
                  />
                </button>
              </div>

              {integration.connectedInfo && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">{integration.connectedInfo.label}</p>
                      <p className="text-sm font-medium text-white">{integration.connectedInfo.value}</p>
                    </div>
                    {integration.id === 'sms' ? (
                      <button
                        onClick={() => setShowSmsManagement(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 transition-colors"
                      >
                        <Settings size={14} />
                        Manage
                      </button>
                    ) : integration.connectedInfo.url ? (
                      <a
                        href={integration.connectedInfo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm"
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Configuration Modal */}
      {showConfigModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">
                {selectedIntegration === 'facebook' && 'Connect with Facebook'}
                {selectedIntegration === 'google-analytics' && 'Configure Google Analytics'}
                {selectedIntegration === 'paypal' && 'Configure PayPal'}
              </h3>
              <button
                onClick={() => {
                  setShowConfigModal(false);
                  setSelectedIntegration(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {selectedIntegration === 'facebook' && (
              <>
                <p className="text-slate-300 mb-6">
                  Select which Facebook page you want to connect to your club. Posts will be published to the selected page.
                </p>

                {facebookPages.length > 0 ? (
                  <>
                    <div className="space-y-4 mb-6">
                      <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600/50">
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Select Facebook Page
                        </label>
                        <select
                          className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                          value={selectedFacebookPage}
                          onChange={(e) => setSelectedFacebookPage(e.target.value)}
                        >
                          <option value="" disabled>Select a page</option>
                          {facebookPages.map((page) => (
                            <option key={page.id} value={page.id}>
                              {page.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={saveFacebookPage}
                        disabled={saving || !selectedFacebookPage}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {saving ? (
                          <>
                            <RefreshCw size={16} className="animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save size={16} />
                            Save
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setShowConfigModal(false);
                          setSelectedIntegration(null);
                          setFacebookPages([]);
                          setSelectedFacebookPage('');
                        }}
                        className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-slate-400">No Facebook pages found. Please make sure you have admin access to at least one Facebook page.</p>
                  </div>
                )}
              </>
            )}

            {selectedIntegration === 'google-analytics' && (
              <>
                <p className="text-slate-300 mb-6">
                  Enter your Google Analytics Property ID to start tracking website visitors.
                </p>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Google Analytics Property ID
                    </label>
                    <input
                      type="text"
                      value={googleAnalyticsId}
                      onChange={(e) => setGoogleAnalyticsId(e.target.value)}
                      placeholder="G-XXXXXXXXXX"
                      className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-400 mt-2">
                      Find this in your Google Analytics account under Admin → Property Settings
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSaveGoogleAnalytics}
                    disabled={saving || !googleAnalyticsId.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Save
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setShowConfigModal(false);
                      setSelectedIntegration(null);
                    }}
                    className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {selectedIntegration === 'paypal' && (
              <>
                <p className="text-slate-300 mb-6">
                  Enter your PayPal credentials to accept payments through PayPal.
                </p>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      PayPal Email
                    </label>
                    <input
                      type="email"
                      value={paypalEmail}
                      onChange={(e) => setPaypalEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      PayPal Client ID
                    </label>
                    <input
                      type="text"
                      value={paypalClientId}
                      onChange={(e) => setPaypalClientId(e.target.value)}
                      placeholder="Your PayPal Client ID"
                      className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-400 mt-2">
                      Find this in your PayPal Developer Dashboard
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSavePayPal}
                    disabled={saving || !paypalEmail.trim() || !paypalClientId.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Save
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setShowConfigModal(false);
                      setSelectedIntegration(null);
                    }}
                    className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Publish to Meta Modal */}
      {showPublishModal && (
        <PublishToMetaModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          darkMode={darkMode}
          pageName=""
          pageId=""
          eventData={{
            title: "InterClub Challenge",
            date: "2025-07-05",
            venue: "Grahamstown Lakes",
            raceClass: "10R",
            raceFormat: "Scratch"
          }}
        />
      )}
    </div>
  );
};

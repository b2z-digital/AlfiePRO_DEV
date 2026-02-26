import React, { useState, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { 
  Users, 
  TrendingUp, 
  Calendar, 
  Settings, 
  FileText, 
  Filter, 
  BarChart2, 
  PieChart, 
  Activity, 
  UserCheck,
  Globe,
  CreditCard,
  Mail,
  Check,
  AlertTriangle,
  ClipboardList,
  Shield
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { MembersPage } from './MembersPage';
import { ModernApplicationsManager } from '../membership/ModernApplicationsManager';
import { ExpiringMembershipsPanel } from '../membership/ExpiringMembershipsPanel';
import { ClubRemittanceDashboard } from '../membership/ClubRemittanceDashboard';
import { RecordPaymentModal } from '../membership/RecordPaymentModal';
import { CommitteeManagement } from './CommitteeManagement';
import { useNotifications } from '../../contexts/NotificationContext';
import { usePermissions } from '../../hooks/usePermissions';
import { MemberMembershipView } from './MemberMembershipView';

// Register ChartJS components
ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Define tab types
type MembershipTab = 'dashboard' | 'members' | 'applications' | 'renewals' | 'remittances' | 'committee';

interface MembershipDashboardProps {
  darkMode: boolean;
}

export const MembershipDashboard: React.FC<MembershipDashboardProps> = ({ darkMode }) => {
  const { currentClub, user, loading: authLoading } = useAuth();
  const { isMember } = usePermissions();

  // Show loading state while auth is initializing
  if (authLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-16">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-400">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If user is a member, show the member-specific view
  if (isMember) {
    return <MemberMembershipView darkMode={darkMode} />;
  }
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const initialTab = (location.state?.activeTab as MembershipTab) || (searchParams.get('tab') as MembershipTab) || 'dashboard';
  const [activeTab, setActiveTab] = useState<MembershipTab>(initialTab);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | undefined>(location.state?.selectedApplicationId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalMembers: 0,
    activeMembers: 0,
    pendingRenewals: 0,
    newMembersThisMonth: 0
  });
  const [membershipTypes, setMembershipTypes] = useState<any[]>([]);
  const [membersByCategory, setMembersByCategory] = useState<{[key: string]: number}>({});
  const [membersByClass, setMembersByClass] = useState<{[key: string]: number}>({});
  const [memberActivity, setMemberActivity] = useState<{singleEvents: number, seriesEvents: number}>({ singleEvents: 0, seriesEvents: 0 });
  const [retentionData, setRetentionData] = useState<{[key: string]: number}>({});
  const [timeRange, setTimeRange] = useState<'month' | 'quarter' | 'year'>('year');
  const [codeOfConduct, setCodeOfConduct] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [bankDetails, setBankDetails] = useState({
    bank_name: 'Greater Bank',
    bsb: '637-000',
    account_number: '723 940 842'
  });
  const [editingBankDetails, setEditingBankDetails] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const { addNotification } = useNotifications();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [stateAssociationId, setStateAssociationId] = useState<string | null>(null);
  const [pendingApplicationsCount, setPendingApplicationsCount] = useState(0);
  const [paymentPendingCount, setPaymentPendingCount] = useState(0);
  const [pendingRemittancesCount, setPendingRemittancesCount] = useState(0);

  useEffect(() => {
    if (currentClub?.clubId) {
      fetchDashboardData();
      fetchCodeOfConduct();
      fetchBankDetails();
      checkStripeConnection();
      fetchStateAssociation();
      fetchActionCounts();
    }
  }, [currentClub, timeRange]);

  useEffect(() => {
    if (currentClub?.clubId) {
      fetchActionCounts();
    }
  }, [activeTab]);

  // Subscribe to realtime changes for action counts
  useEffect(() => {
    if (!currentClub?.clubId) return;

    const applicationsChannel = supabase
      .channel('membership-apps-tab-changes')
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'membership_applications',
          filter: `club_id=eq.${currentClub.clubId}`
        },
        () => {
          fetchActionCounts();
        }
      )
      .subscribe();

    const membersChannel = supabase
      .channel('members-tab-changes')
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'members',
          filter: `club_id=eq.${currentClub.clubId}`
        },
        () => {
          fetchActionCounts();
        }
      )
      .subscribe();

    const remittancesChannel = supabase
      .channel('remittances-tab-changes')
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'membership_remittances',
          filter: `club_id=eq.${currentClub.clubId}`
        },
        () => {
          fetchActionCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(applicationsChannel);
      supabase.removeChannel(membersChannel);
      supabase.removeChannel(remittancesChannel);
    };
  }, [currentClub?.clubId]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      console.log('Fetching dashboard data for club:', currentClub?.clubId);

      // Fetch basic stats
      const { data: membersData, error: membersError } = await supabase
        .from('members')
        .select('id, is_financial, renewal_date, created_at, membership_level')
        .eq('club_id', currentClub?.clubId)
        .or('membership_status.eq.active,membership_status.is.null');

      if (membersError) {
        console.error('Error fetching members:', membersError);
        throw membersError;
      }

      console.log('Fetched members:', membersData?.length || 0);

      // Calculate stats
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);

      const totalMembers = membersData?.length || 0;
      const activeMembers = membersData?.filter(m => m.is_financial).length || 0;

      // Members with renewal dates in the next 30 days
      const pendingRenewals = membersData?.filter(m => {
        if (!m.renewal_date) return false;
        const renewalDate = new Date(m.renewal_date);
        return renewalDate > now && renewalDate <= new Date(now.setDate(now.getDate() + 30));
      }).length || 0;

      // New members in the last 30 days
      const newMembersThisMonth = membersData?.filter(m => {
        const createdAt = new Date(m.created_at);
        return createdAt >= thirtyDaysAgo;
      }).length || 0;

      setStats({
        totalMembers,
        activeMembers,
        pendingRenewals,
        newMembersThisMonth
      });

      // Calculate members by membership category/type
      const categoryDistribution: {[key: string]: number} = {};
      membersData?.forEach(member => {
        const type = member.membership_level || 'Unassigned';
        if (!categoryDistribution[type]) {
          categoryDistribution[type] = 0;
        }
        categoryDistribution[type]++;
      });
      console.log('Members by category:', categoryDistribution);
      setMembersByCategory(categoryDistribution);

      // Calculate members by boat class - fetch boats separately
      const distribution: {[key: string]: number} = {};

      if (membersData && membersData.length > 0) {
        const memberIds = membersData.map(m => m.id);
        const { data: boatsData, error: boatsError } = await supabase
          .from('member_boats')
          .select('boat_type, member_id')
          .in('member_id', memberIds);

        if (!boatsError && boatsData) {
          boatsData.forEach((boat: any) => {
            if (!boat.boat_type) return;
            if (!distribution[boat.boat_type]) {
              distribution[boat.boat_type] = 0;
            }
            distribution[boat.boat_type]++;
          });
        } else if (boatsError) {
          console.error('Error fetching boats:', boatsError);
        }
      }
      console.log('Members by boat class:', distribution);
      setMembersByClass(distribution);

      // Fetch membership types
      const { data: typesData, error: typesError } = await supabase
        .from('membership_types')
        .select('*')
        .eq('club_id', currentClub?.clubId);

      if (typesError) throw typesError;
      setMembershipTypes(typesData || []);

      // Calculate date range based on timeRange filter
      const currentDate = new Date();
      let startDate = new Date();

      if (timeRange === 'month') {
        startDate.setMonth(currentDate.getMonth() - 1);
      } else if (timeRange === 'quarter') {
        startDate.setMonth(currentDate.getMonth() - 3);
      } else {
        startDate.setFullYear(currentDate.getFullYear() - 1);
      }

      // Fetch single events count (quick_races)
      const { data: quickRacesData, error: quickRacesError } = await supabase
        .from('quick_races')
        .select('id, race_date')
        .eq('club_id', currentClub?.clubId)
        .eq('completed', true)
        .gte('race_date', startDate.toISOString());

      const singleEventsCount = quickRacesData?.length || 0;

      // Fetch series events count (race_series_rounds)
      const { data: seriesRoundsData, error: seriesRoundsError } = await supabase
        .from('race_series_rounds')
        .select('id, date')
        .eq('club_id', currentClub?.clubId)
        .gte('date', startDate.toISOString().split('T')[0]);

      const seriesEventsCount = seriesRoundsData?.length || 0;

      setMemberActivity({
        singleEvents: singleEventsCount,
        seriesEvents: seriesEventsCount
      });

      // Fetch real retention data based on renewal dates
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const membersWithRenewalDates = membersData?.filter(m => m.renewal_date) || [];
      const renewed = membersWithRenewalDates.filter(m => {
        const renewalDate = new Date(m.renewal_date);
        return renewalDate > oneYearAgo && m.is_financial;
      }).length;

      const notRenewed = membersWithRenewalDates.filter(m => {
        const renewalDate = new Date(m.renewal_date);
        return renewalDate <= oneYearAgo || !m.is_financial;
      }).length;

      setRetentionData({
        'Renewed': renewed,
        'Not Renewed': notRenewed
      });
      
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const fetchCodeOfConduct = async () => {
    try {
      if (!currentClub?.clubId) return;
      
      const { data, error } = await supabase
        .from('clubs')
        .select('code_of_conduct')
        .eq('id', currentClub.clubId)
        .single();
      
      if (error) throw error;
      
      setCodeOfConduct(data?.code_of_conduct || '');
    } catch (err) {
      console.error('Error fetching code of conduct:', err);
    }
  };

  const fetchStateAssociation = async () => {
    try {
      if (!currentClub?.clubId) return;

      const { data, error } = await supabase
        .from('state_association_clubs')
        .select('state_association_id')
        .eq('club_id', currentClub.clubId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setStateAssociationId(data.state_association_id);
      }
    } catch (err) {
      console.error('Error fetching state association:', err);
    }
  };

  const fetchBankDetails = async () => {
    try {
      if (!currentClub?.clubId) return;

      const { data, error } = await supabase
        .from('clubs')
        .select('bank_name, bsb, account_number')
        .eq('id', currentClub.clubId)
        .single();

      if (error) throw error;

      if (data && data.bank_name) {
        setBankDetails({
          bank_name: data.bank_name,
          bsb: data.bsb,
          account_number: data.account_number
        });
      }
    } catch (err) {
      console.error('Error fetching bank details:', err);
    }
  };

  const checkStripeConnection = async () => {
    try {
      if (!currentClub?.clubId) return;

      const { data, error } = await supabase
        .from('clubs')
        .select('stripe_account_id, stripe_enabled')
        .eq('id', currentClub.clubId)
        .single();

      if (error) throw error;

      setStripeConnected(!!(data?.stripe_account_id && data?.stripe_enabled));

      // Check for successful connection from redirect
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('stripe_connected') === 'true') {
        setSuccess('Stripe account connected successfully!');
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname + '?tab=payment-settings');
        // Refresh connection status
        setTimeout(() => {
          checkStripeConnection();
        }, 1000);
      }
    } catch (err) {
      console.error('Error checking Stripe connection:', err);
    }
  };

  const handleSaveCodeOfConduct = async () => {
    try {
      if (!currentClub?.clubId) return;
      
      setLoading(true);
      
      const { error } = await supabase
        .from('clubs')
        .update({ code_of_conduct: codeOfConduct })
        .eq('id', currentClub.clubId);
      
      if (error) throw error;
      
      setSuccess('Code of Conduct saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Code of Conduct');
    } finally {
      setLoading(false);
    }
  };

  const fetchActionCounts = async () => {
    if (!currentClub?.clubId) return;

    try {
      // Count pending applications (exclude drafts)
      const { count: appsCount } = await supabase
        .from('membership_applications')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', currentClub.clubId)
        .eq('status', 'pending')
        .eq('is_draft', false);

      setPendingApplicationsCount(appsCount || 0);

      // Count members with outstanding payment issues (payment_pending OR overdue)
      const { count: pendingCount } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', currentClub.clubId)
        .in('payment_status', ['payment_pending', 'overdue']);

      setPaymentPendingCount(pendingCount || 0);

      // Count pending remittances
      const { count: remitCount } = await supabase
        .from('membership_remittances')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', currentClub.clubId)
        .eq('club_to_state_status', 'pending');

      setPendingRemittancesCount(remitCount || 0);
    } catch (err) {
      console.error('Error fetching action counts:', err);
    }
  };

  const handleSaveBankDetails = async () => {
    try {
      if (!currentClub?.clubId) return;
      
      setLoading(true);
      
      const { error } = await supabase
        .from('clubs')
        .update({
          bank_name: bankDetails.bank_name,
          bsb: bankDetails.bsb,
          account_number: bankDetails.account_number
        })
        .eq('id', currentClub.clubId);
      
      if (error) throw error;
      
      setSuccess('Bank details saved successfully');
      setTimeout(() => setSuccess(null), 3000);
      setEditingBankDetails(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bank details');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectStripe = async () => {
    if (!currentClub?.clubId) {
      setError('No club selected');
      return;
    }

    try {
      setSuccess('Connecting to Stripe...');
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('You must be logged in to connect Stripe');
        setSuccess(null);
        return;
      }

      console.log('Calling connect-stripe function for club:', currentClub.clubId);

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

      console.log('Response status:', response.status);

      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        const errorMessage = data.error || 'Failed to connect to Stripe';

        // Check for common setup issues
        if (response.status === 500 && errorMessage.includes('STRIPE_SECRET_KEY')) {
          throw new Error('Stripe is not configured. Please contact support to set up Stripe integration.');
        }

        throw new Error(errorMessage);
      }

      if (data.url) {
        console.log('Opening Stripe onboarding:', data.url);
        // Open Stripe Connect onboarding in a new tab
        const stripeWindow = window.open(data.url, '_blank', 'noopener,noreferrer');

        if (!stripeWindow) {
          // Fallback to redirect if popup was blocked
          window.location.href = data.url;
        } else {
          setSuccess('Opening Stripe onboarding in a new tab. Complete the setup there, then return here.');
        }
      } else {
        throw new Error('No redirect URL received from Stripe');
      }
    } catch (err: any) {
      console.error('Error connecting to Stripe:', err);

      // Provide helpful error messages
      let errorMessage = err.message || 'Failed to connect to Stripe';

      if (err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      }

      setError(errorMessage);
      setSuccess(null);
    }
  };

  // Chart colors
  const getChartColors = (darkMode: boolean) => {
    return {
      blue: darkMode ? 'rgba(59, 130, 246, 0.8)' : 'rgba(37, 99, 235, 0.8)',
      purple: darkMode ? 'rgba(139, 92, 246, 0.8)' : 'rgba(124, 58, 237, 0.8)',
      green: darkMode ? 'rgba(16, 185, 129, 0.8)' : 'rgba(5, 150, 105, 0.8)',
      orange: darkMode ? 'rgba(249, 115, 22, 0.8)' : 'rgba(234, 88, 12, 0.8)',
      red: darkMode ? 'rgba(239, 68, 68, 0.8)' : 'rgba(220, 38, 38, 0.8)',
      cyan: darkMode ? 'rgba(6, 182, 212, 0.8)' : 'rgba(8, 145, 178, 0.8)',
      pink: darkMode ? 'rgba(236, 72, 153, 0.8)' : 'rgba(219, 39, 119, 1.0)'
    };
  };

  const colors = getChartColors(darkMode);

  const membershipCategoryChartData = {
    labels: Object.keys(membersByCategory),
    datasets: [
      {
        data: Object.values(membersByCategory),
        backgroundColor: [
          colors.blue,
          colors.purple,
          colors.green,
          colors.orange,
          colors.red,
          colors.cyan,
          colors.pink
        ],
        borderWidth: 0
      }
    ]
  };

  const boatClassChartData = {
    labels: Object.keys(membersByClass),
    datasets: [
      {
        data: Object.values(membersByClass),
        backgroundColor: [
          colors.blue,
          colors.purple,
          colors.green,
          colors.orange,
          colors.red,
          colors.cyan,
          colors.pink
        ],
        borderWidth: 0
      }
    ]
  };

  // Calculate top skippers from actual race data
  const [topSkippers, setTopSkippers] = useState<{name: string, wins: number, races: number}[]>([]);

  useEffect(() => {
    const fetchTopSkippers = async () => {
      if (!currentClub?.clubId) return;

      try {
        // Aggregate skipper performance from ALL race types
        const skipperStats: {[name: string]: {wins: number, races: number}} = {};

        // 1. Fetch quick_races (all classes, all formats)
        const { data: quickRaces } = await supabase
          .from('quick_races')
          .select('race_results, race_class, race_format')
          .eq('club_id', currentClub.clubId)
          .eq('completed', true);

        quickRaces?.forEach(race => {
          if (race.race_results && Array.isArray(race.race_results)) {
            race.race_results.forEach((result: any, idx: number) => {
              const skipperName = result.skipper || result.name;
              if (!skipperName) return;

              if (!skipperStats[skipperName]) {
                skipperStats[skipperName] = { wins: 0, races: 0 };
              }
              skipperStats[skipperName].races++;
              if (idx === 0) skipperStats[skipperName].wins++;
            });
          }
        });

        // 2. Fetch race_series (all series types)
        const { data: raceSeries } = await supabase
          .from('race_series')
          .select('standings')
          .eq('club_id', currentClub.clubId);

        raceSeries?.forEach(series => {
          if (series.standings && Array.isArray(series.standings)) {
            series.standings.forEach((result: any, idx: number) => {
              const skipperName = result.skipper || result.name;
              if (!skipperName) return;

              if (!skipperStats[skipperName]) {
                skipperStats[skipperName] = { wins: 0, races: 0 };
              }
              skipperStats[skipperName].races++;
              if (idx === 0) skipperStats[skipperName].wins++;
            });
          }
        });

        // 3. Fetch public_events that were copied to this club
        const { data: publicEvents } = await supabase
          .from('public_events')
          .select('results')
          .eq('club_id', currentClub.clubId);

        publicEvents?.forEach(event => {
          if (event.results && Array.isArray(event.results)) {
            event.results.forEach((result: any, idx: number) => {
              const skipperName = result.skipper || result.name;
              if (!skipperName) return;

              if (!skipperStats[skipperName]) {
                skipperStats[skipperName] = { wins: 0, races: 0 };
              }
              skipperStats[skipperName].races++;
              if (idx === 0) skipperStats[skipperName].wins++;
            });
          }
        });

        // Convert to array and sort by wins, then by total races
        const sortedSkippers = Object.entries(skipperStats)
          .map(([name, stats]) => ({ name, ...stats }))
          .sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return b.races - a.races; // If equal wins, sort by total races
          })
          .slice(0, 5);

        setTopSkippers(sortedSkippers);
      } catch (err) {
        console.error('Error fetching top skippers:', err);
      }
    };

    fetchTopSkippers();
  }, [currentClub?.clubId]);

  const topSkippersChartData = {
    labels: topSkippers.length > 0
      ? topSkippers.map(s => s.name)
      : ['No race data yet'],
    datasets: [
      {
        label: 'Race Wins',
        data: topSkippers.length > 0
          ? topSkippers.map(s => s.wins)
          : [0],
        backgroundColor: colors.blue,
        borderRadius: 6
      },
      {
        label: 'Total Races',
        data: topSkippers.length > 0
          ? topSkippers.map(s => s.races)
          : [0],
        backgroundColor: colors.green,
        borderRadius: 6
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: darkMode ? '#e2e8f0' : '#1e293b',
          font: {
            size: 11
          },
          padding: 15
        }
      },
      tooltip: {
        backgroundColor: darkMode ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: darkMode ? '#e2e8f0' : '#1e293b',
        bodyColor: darkMode ? '#e2e8f0' : '#1e293b',
        borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        borderWidth: 1,
        padding: 12
      }
    }
  };

  const barChartOptions = {
    ...chartOptions,
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
        },
        ticks: {
          color: darkMode ? '#94a3b8' : '#64748b'
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: darkMode ? '#94a3b8' : '#64748b'
        }
      }
    }
  };

  const boatClassChartOptions = {
    ...barChartOptions,
    plugins: {
      ...barChartOptions.plugins,
      legend: {
        display: false
      }
    }
  };

  const renderDashboard = () => (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <Users className="text-blue-400" size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.totalMembers}</div>
              <div className="text-sm text-slate-400">Total Members</div>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-green-600/20 flex items-center justify-center">
              <UserCheck className="text-green-400" size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.activeMembers}</div>
              <div className="text-sm text-slate-400">Active Members</div>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-amber-600/20 flex items-center justify-center">
              <Calendar className="text-amber-400" size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.pendingRenewals}</div>
              <div className="text-sm text-slate-400">Pending Renewals</div>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-600/20 flex items-center justify-center">
              <Users className="text-purple-400" size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.newMembersThisMonth}</div>
              <div className="text-sm text-slate-400">New This Month</div>
            </div>
          </div>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Membership Trends</h3>
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          <button
            onClick={() => setTimeRange('month')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              timeRange === 'month' 
                ? 'bg-blue-600 text-white' 
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setTimeRange('quarter')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              timeRange === 'quarter' 
                ? 'bg-blue-600 text-white' 
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Quarter
          </button>
          <button
            onClick={() => setTimeRange('year')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              timeRange === 'year' 
                ? 'bg-blue-600 text-white' 
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Year
          </button>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Membership Types */}
        <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <PieChart className="text-blue-400" size={20} />
              <h3 className="text-lg font-medium text-white">Membership Types</h3>
            </div>
          </div>
          <div className="h-64">
            <Doughnut data={membershipCategoryChartData} options={chartOptions} />
          </div>
        </div>

        {/* Members by Class */}
        <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <BarChart2 className="text-green-400" size={20} />
              <h3 className="text-lg font-medium text-white">Members by Class</h3>
            </div>
          </div>
          <div className="h-64">
            <Bar data={boatClassChartData} options={boatClassChartOptions} />
          </div>
        </div>

        {/* Member Activity */}
        <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Activity className="text-amber-400" size={20} />
              <h3 className="text-lg font-medium text-white">Event Participation</h3>
            </div>
          </div>
          <div className="h-64">
            <Bar data={{
              labels: ['Single Events', 'Pointscore Series'],
              datasets: [{
                label: 'Event Count',
                data: [memberActivity.singleEvents, memberActivity.seriesEvents],
                backgroundColor: [colors.blue, colors.orange],
                borderRadius: 6
              }]
            }} options={{
              ...barChartOptions,
              plugins: {
                ...barChartOptions.plugins,
                legend: {
                  display: false
                }
              }
            }} />
          </div>
        </div>

        {/* Member Retention */}
        <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <UserCheck className="text-purple-400" size={20} />
              <h3 className="text-lg font-medium text-white">Member Retention</h3>
            </div>
          </div>
          <div className="h-64">
            <Doughnut data={{
              labels: Object.keys(retentionData),
              datasets: [{
                data: Object.values(retentionData),
                backgroundColor: [colors.green, colors.red],
                borderWidth: 0
              }]
            }} options={chartOptions} />
          </div>
        </div>
      </div>
    </div>
  );

  const renderApplications = () => (
    <ModernApplicationsManager darkMode={darkMode} initialApplicationId={selectedApplicationId} />
  );

  const renderPayments = () => (
    <div className="space-y-6">
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/30">
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
        <div className="mb-6 p-4 rounded-lg bg-green-900/20 border border-green-900/30">
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
          <CreditCard className="text-blue-400" size={24} />
          <h2 className="text-xl font-semibold text-white">Payment Integrations</h2>
        </div>
        
        <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600/50 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-white">Stripe Integration</h3>
              <p className="text-sm text-slate-400 mt-1">
                Connect your Stripe account to accept online payments for memberships
              </p>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              stripeConnected
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-slate-600 text-slate-300'
            }`}>
              {stripeConnected ? '✓ Connected' : 'Not Connected'}
            </div>
          </div>

          {stripeConnected ? (
            <div className="space-y-3">
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-sm text-green-400">
                  ✓ Your Stripe account is connected and ready to accept payments
                </p>
              </div>
              <a
                href="https://dashboard.stripe.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-4 py-2 bg-slate-600 text-slate-300 rounded-lg hover:bg-slate-500 text-sm transition-colors inline-flex items-center justify-center gap-2"
              >
                <CreditCard size={16} />
                View Stripe Dashboard
              </a>
            </div>
          ) : (
            <button
              onClick={handleConnectStripe}
              disabled={success !== null}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 font-medium transition-all duration-200 disabled:opacity-50"
            >
              <CreditCard size={18} />
              {success ? 'Connecting...' : 'Connect with Stripe'}
            </button>
          )}
        </div>
        
        {/* Bank Transfer Details */}
        <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-white">Bank Transfer Details</h3>
            {!editingBankDetails ? (
              <button
                onClick={() => setEditingBankDetails(true)}
                className="px-3 py-1.5 bg-slate-600 text-slate-300 rounded-lg hover:bg-slate-500 text-sm transition-colors"
              >
                Edit Details
              </button>
            ) : (
              <button
                onClick={() => setEditingBankDetails(false)}
                className="px-3 py-1.5 bg-slate-600 text-slate-300 rounded-lg hover:bg-slate-500 text-sm transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
          
          <p className="text-sm text-slate-300 mb-4">
            If Stripe is not connected, members can pay via bank transfer using these details:
          </p>
          
          {editingBankDetails ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={bankDetails.bank_name}
                  onChange={(e) => setBankDetails({...bankDetails, bank_name: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-600 text-slate-200 rounded-lg border border-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  BSB
                </label>
                <input
                  type="text"
                  value={bankDetails.bsb}
                  onChange={(e) => setBankDetails({...bankDetails, bsb: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-600 text-slate-200 rounded-lg border border-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  value={bankDetails.account_number}
                  onChange={(e) => setBankDetails({...bankDetails, account_number: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-600 text-slate-200 rounded-lg border border-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <button
                onClick={handleSaveBankDetails}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Bank Details
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-1 text-sm">
              <p className="text-slate-300">{bankDetails.bank_name}</p>
              <p className="text-slate-300">BSB {bankDetails.bsb}</p>
              <p className="text-slate-300">Account No. {bankDetails.account_number}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16 space-y-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <Users className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Club Membership</h1>
              <p className="text-slate-400">
                Manage club memberships for {currentClub?.club?.name || 'your club'}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-8 border-b border-slate-700">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <TrendingUp size={16} />
                <span>Dashboard</span>
              </div>
            </button>
            
            <button
              onClick={() => setActiveTab('members')}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'members'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Users size={16} />
                <span>Members</span>
                {paymentPendingCount > 0 && (
                  <div className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-green-500 text-white text-xs font-bold rounded-full">
                    {paymentPendingCount}
                  </div>
                )}
              </div>
            </button>
            
            <button
              onClick={() => setActiveTab('applications')}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'applications'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <ClipboardList size={16} />
                <span>Applications</span>
                {pendingApplicationsCount > 0 && (
                  <div className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-green-500 text-white text-xs font-bold rounded-full">
                    {pendingApplicationsCount}
                  </div>
                )}
              </div>
            </button>

            <button
              onClick={() => setActiveTab('renewals')}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'renewals'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>Renewals</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('remittances')}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'remittances'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <CreditCard size={16} />
                <span>Remittances</span>
                {pendingRemittancesCount > 0 && (
                  <div className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-green-500 text-white text-xs font-bold rounded-full">
                    {pendingRemittancesCount}
                  </div>
                )}
              </div>
            </button>

            <button
              onClick={() => setActiveTab('committee')}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'committee'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield size={16} />
                <span>Committee</span>
              </div>
            </button>

          </div>
        </div>

        {/* Content based on active tab */}
        <div>
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'members' && <MembersPage darkMode={darkMode} onNavigateToRemittances={() => setActiveTab('remittances')} />}
          {activeTab === 'applications' && renderApplications()}
          {activeTab === 'renewals' && <ExpiringMembershipsPanel darkMode={darkMode} />}
          {activeTab === 'remittances' && (
            <ClubRemittanceDashboard
              darkMode={darkMode}
              onRecordPayment={() => setShowPaymentModal(true)}
            />
          )}
          {activeTab === 'committee' && (
            <CommitteeManagement darkMode={darkMode} />
          )}
        </div>

        {/* Record Payment Modal */}
        {showPaymentModal && stateAssociationId && (
          <RecordPaymentModal
            darkMode={darkMode}
            isOpen={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            paymentDirection="club_to_state"
            fromEntityId={currentClub?.clubId || ''}
            toEntityId={stateAssociationId}
            onPaymentRecorded={() => {
              setShowPaymentModal(false);
              // Trigger refresh of remittances
              if (activeTab === 'remittances') {
                window.location.reload();
              }
            }}
          />
        )}
      </div>

    </div>
  );
};
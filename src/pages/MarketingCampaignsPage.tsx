import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Plus, Send, Calendar, BarChart3, Search, Filter, MoreVertical, Edit, Trash2, Copy, X, Eye, FileText, Save, Archive, ClipboardCopy, List, CalendarRange, ChevronDown, Tag, Users } from 'lucide-react';
import { getMarketingCampaigns, deleteMarketingCampaign, getMarketingSubscriberLists } from '../utils/marketingStorage';
import type { MarketingCampaign, MarketingSubscriberList } from '../types/marketing';
import { format } from 'date-fns';

interface MarketingCampaignsPageProps {
  darkMode?: boolean;
}

export default function MarketingCampaignsPage({ darkMode = true }: MarketingCampaignsPageProps) {
  const { currentClub } = useAuth();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [subscriberLists, setSubscriberLists] = useState<MarketingSubscriberList[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
  }, [currentClub]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (menuOpen && !target.closest('.campaign-menu-container')) {
        setMenuOpen(null);
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  async function loadCampaigns() {
    if (!currentClub) return;

    try {
      setLoading(true);
      const [campaignsData, listsData] = await Promise.all([
        getMarketingCampaigns(currentClub.clubId),
        getMarketingSubscriberLists(currentClub.clubId)
      ]);
      setCampaigns(campaignsData);
      setSubscriberLists(listsData);
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
    }
  }

  function getListNames(listIds: string[]): string {
    if (!listIds || listIds.length === 0) return 'No lists';
    const names = listIds
      .map(id => subscriberLists.find(list => list.id === id)?.name)
      .filter(Boolean)
      .join(', ');
    return names || 'Unknown list';
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this campaign?')) return;

    try {
      await deleteMarketingCampaign(id);
      setCampaigns(campaigns.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert('Failed to delete campaign');
    }
  }

  async function handleClone(campaign: MarketingCampaign) {
    try {
      // Clone logic will be implemented with campaign duplication
      alert('Clone functionality coming soon');
    } catch (error) {
      console.error('Error cloning campaign:', error);
      alert('Failed to clone campaign');
    }
  }

  async function handleArchive(id: string) {
    try {
      // Archive logic - update status to archived
      alert('Archive functionality coming soon');
    } catch (error) {
      console.error('Error archiving campaign:', error);
      alert('Failed to archive campaign');
    }
  }

  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         campaign.subject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter;

    // Date range filter
    let matchesDateRange = true;
    if (dateRangeFilter !== 'all' && campaign.created_at) {
      const campaignDate = new Date(campaign.created_at);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - campaignDate.getTime()) / (1000 * 60 * 60 * 24));

      switch (dateRangeFilter) {
        case 'today':
          matchesDateRange = daysDiff === 0;
          break;
        case 'week':
          matchesDateRange = daysDiff <= 7;
          break;
        case 'month':
          matchesDateRange = daysDiff <= 30;
          break;
        case '3months':
          matchesDateRange = daysDiff <= 90;
          break;
        default:
          matchesDateRange = true;
      }
    }

    return matchesSearch && matchesStatus && matchesDateRange;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-green-100 text-green-700';
      case 'sending': return 'bg-blue-100 text-blue-700';
      case 'scheduled': return 'bg-purple-100 text-purple-700';
      case 'draft': return 'bg-gray-100 text-gray-700';
      case 'paused': return 'bg-yellow-100 text-yellow-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-16 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <Mail className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className={`text-3xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              Email Campaigns
            </h1>
            <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>
              Create and manage your email campaigns
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/marketing/campaigns/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            New Campaign
          </Link>
          <button
            onClick={() => navigate('/marketing')}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title="Back to Marketing"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className={`rounded-xl p-4 ${
        darkMode
          ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
          : 'bg-white shadow-sm border border-gray-200'
      }`}>
        <div className="flex flex-col gap-4">
          {/* Search and View Toggle */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
              <input
                type="text"
                placeholder="Search campaigns..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  darkMode
                    ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                }`}
              />
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-2">
              <div className={`flex rounded-lg border ${darkMode ? 'border-slate-600 bg-slate-900/50' : 'border-gray-300 bg-white'}`}>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-2 rounded-l-lg flex items-center gap-2 text-sm transition-colors ${
                    viewMode === 'list'
                      ? darkMode
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-blue-50 text-blue-600'
                      : darkMode
                        ? 'text-slate-400 hover:text-slate-300'
                        : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <List className="w-4 h-4" />
                  List
                </button>
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-3 py-2 rounded-r-lg flex items-center gap-2 text-sm transition-colors ${
                    viewMode === 'calendar'
                      ? darkMode
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-blue-50 text-blue-600'
                      : darkMode
                        ? 'text-slate-400 hover:text-slate-300'
                        : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <CalendarRange className="w-4 h-4" />
                  Calendar
                </button>
              </div>
            </div>
          </div>

          {/* Filter Row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Range Filter */}
            <div className="relative">
              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value)}
                className={`pl-3 pr-8 py-2 rounded-lg border text-sm appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  darkMode
                    ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 days</option>
                <option value="month">Last 30 days</option>
                <option value="3months">Last 3 months</option>
              </select>
              <ChevronDown className={`absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`pl-3 pr-8 py-2 rounded-lg border text-sm appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  darkMode
                    ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="sending">Sending</option>
                <option value="sent">Sent</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <ChevronDown className={`absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
            </div>

            {/* Results Count */}
            <span className={`text-sm ml-auto ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
              {filteredCampaigns.length} {filteredCampaigns.length === 1 ? 'campaign' : 'campaigns'}
            </span>
          </div>
        </div>
      </div>

      {/* Campaigns List or Calendar View */}
      {filteredCampaigns.length > 0 ? (
        viewMode === 'list' ? (
        <div className="space-y-3">
          {filteredCampaigns.map((campaign) => {
            const openRate = campaign.total_delivered > 0
              ? ((campaign.total_opened / campaign.total_delivered) * 100).toFixed(2)
              : '0.00';
            const clickRate = campaign.total_delivered > 0
              ? ((campaign.total_clicked / campaign.total_delivered) * 100).toFixed(2)
              : '0.00';

            return (
              <div
                key={campaign.id}
                className={`rounded-xl p-5 transition-all ${
                  darkMode
                    ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 hover:bg-slate-800/70'
                    : 'bg-white shadow-sm border border-gray-200 hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Campaign Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <Mail className={`w-5 h-5 flex-shrink-0 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <Link
                          to={`/marketing/campaigns/${campaign.id}`}
                          className={`text-lg font-semibold hover:text-blue-400 transition-colors truncate ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}
                        >
                          {campaign.name}
                        </Link>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${getStatusColor(campaign.status)}`}>
                          {campaign.status}
                        </span>
                      </div>
                    </div>

                    <p className={`text-sm mb-2 ml-8 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      {campaign.subject}
                    </p>

                    {/* List and Recipients Info */}
                    <div className={`flex items-center gap-2 ml-8 mb-3 text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                      <Users className="w-3.5 h-3.5" />
                      <span>{getListNames(campaign.list_ids || [])}</span>
                      {campaign.total_recipients > 0 && (
                        <>
                          <span>•</span>
                          <span>{campaign.total_recipients.toLocaleString()} recipients</span>
                        </>
                      )}
                    </div>

                    {/* Metrics Row */}
                    <div className="flex flex-wrap items-center gap-6 ml-8">
                      {campaign.status === 'sent' ? (
                        <>
                          <div>
                            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>Send date</span>
                            <p className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-900'}`}>
                              {campaign.sent_at ? format(new Date(campaign.sent_at), 'MMM d, yyyy') : '-'}
                              {campaign.sent_at && (
                                <span className={`text-xs ml-1 ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                                  {format(new Date(campaign.sent_at), 'h:mm a')}
                                </span>
                              )}
                            </p>
                          </div>
                          <div>
                            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>Open rate</span>
                            <p className={`text-sm font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                              {openRate}%
                            </p>
                            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                              {campaign.total_opened.toLocaleString()} recipients
                            </span>
                          </div>
                          <div>
                            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>Click rate</span>
                            <p className={`text-sm font-semibold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                              {clickRate}%
                            </p>
                            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                              {campaign.total_clicked.toLocaleString()} recipients
                            </span>
                          </div>
                          <div>
                            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>Total sent</span>
                            <p className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-900'}`}>
                              {campaign.total_sent.toLocaleString()}
                            </p>
                          </div>
                        </>
                      ) : campaign.status === 'scheduled' && campaign.send_at ? (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <div>
                            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>Scheduled for</span>
                            <p className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-900'}`}>
                              {format(new Date(campaign.send_at), 'MMM d, yyyy h:mm a')}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>Created</span>
                          <p className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-900'}`}>
                            {format(new Date(campaign.created_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Menu */}
                  <div className="relative flex-shrink-0 campaign-menu-container">
                    <button
                      onClick={() => setMenuOpen(menuOpen === campaign.id ? null : campaign.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-gray-100'
                      }`}
                    >
                      <MoreVertical className={`w-5 h-5 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`} />
                    </button>

                    {menuOpen === campaign.id && (
                      <div className={`absolute right-0 mt-2 w-56 rounded-lg shadow-xl py-1 z-50 campaign-menu-container ${
                        darkMode
                          ? 'bg-slate-800 border border-slate-700'
                          : 'bg-white border border-gray-200'
                      }`}>
                        <Link
                          to={`/marketing/campaigns/${campaign.id}/analytics`}
                          className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                            darkMode
                              ? 'text-slate-200 hover:bg-slate-700/50'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                          onClick={() => setMenuOpen(null)}
                        >
                          <BarChart3 className="w-4 h-4" />
                          View performance
                        </Link>
                        <Link
                          to={`/marketing/campaigns/${campaign.id}`}
                          className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                            darkMode
                              ? 'text-slate-200 hover:bg-slate-700/50'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                          onClick={() => setMenuOpen(null)}
                        >
                          <Edit className="w-4 h-4" />
                          Edit details
                        </Link>
                        <button
                          onClick={() => {
                            navigate(`/marketing/campaigns/${campaign.id}/preview`);
                            setMenuOpen(null);
                          }}
                          className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors ${
                            darkMode
                              ? 'text-slate-200 hover:bg-slate-700/50'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <Eye className="w-4 h-4" />
                          Preview content
                        </button>
                        <Link
                          to="/marketing/templates/new"
                          state={{ fromCampaign: campaign }}
                          className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                            darkMode
                              ? 'text-slate-200 hover:bg-slate-700/50'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                          onClick={() => setMenuOpen(null)}
                        >
                          <Save className="w-4 h-4" />
                          Add to templates
                        </Link>
                        <button
                          onClick={() => {
                            handleClone(campaign);
                            setMenuOpen(null);
                          }}
                          className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors ${
                            darkMode
                              ? 'text-slate-200 hover:bg-slate-700/50'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <Copy className="w-4 h-4" />
                          Clone
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(campaign.id);
                            alert('Campaign ID copied to clipboard');
                            setMenuOpen(null);
                          }}
                          className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors ${
                            darkMode
                              ? 'text-slate-200 hover:bg-slate-700/50'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <ClipboardCopy className="w-4 h-4" />
                          Copy ID
                        </button>
                        <div className={`border-t my-1 ${darkMode ? 'border-slate-700' : 'border-gray-200'}`} />
                        <button
                          onClick={() => {
                            handleArchive(campaign.id);
                            setMenuOpen(null);
                          }}
                          className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors ${
                            darkMode
                              ? 'text-slate-200 hover:bg-slate-700/50'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <Archive className="w-4 h-4" />
                          Archive
                        </button>
                        <button
                          onClick={() => {
                            setMenuOpen(null);
                            handleDelete(campaign.id);
                          }}
                          className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors ${
                            darkMode
                              ? 'text-red-400 hover:bg-red-500/10'
                              : 'text-red-600 hover:bg-red-50'
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        ) : (
          /* Calendar View */
          <div className={`rounded-xl p-6 ${
            darkMode
              ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
              : 'bg-white shadow-sm border border-gray-200'
          }`}>
            {(() => {
              // Group campaigns by month
              const campaignsByMonth = filteredCampaigns.reduce((acc, campaign) => {
                const date = campaign.sent_at || campaign.send_at || campaign.created_at;
                const monthKey = format(new Date(date), 'MMMM yyyy');
                if (!acc[monthKey]) acc[monthKey] = [];
                acc[monthKey].push(campaign);
                return acc;
              }, {} as Record<string, MarketingCampaign[]>);

              return Object.entries(campaignsByMonth).map(([month, campaigns]) => (
                <div key={month} className="mb-6 last:mb-0">
                  <h3 className={`text-lg font-semibold mb-3 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                    {month}
                  </h3>
                  <div className="space-y-2">
                    {campaigns.map(campaign => {
                      const date = campaign.sent_at || campaign.send_at || campaign.created_at;
                      return (
                        <div
                          key={campaign.id}
                          className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                            darkMode
                              ? 'bg-slate-900/50 hover:bg-slate-900/70'
                              : 'bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`text-center ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                              <div className="text-2xl font-bold">
                                {format(new Date(date), 'd')}
                              </div>
                              <div className="text-xs">
                                {format(new Date(date), 'MMM')}
                              </div>
                            </div>
                            <div className="flex-1">
                              <Link
                                to={`/marketing/campaigns/${campaign.id}`}
                                className={`font-medium hover:text-blue-400 transition-colors ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}
                              >
                                {campaign.name}
                              </Link>
                              <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                                {campaign.subject}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs">
                                <span className={`px-2 py-0.5 rounded-full ${getStatusColor(campaign.status)}`}>
                                  {campaign.status}
                                </span>
                                {campaign.status === 'sent' && (
                                  <>
                                    <span className={darkMode ? 'text-slate-500' : 'text-gray-500'}>
                                      Opens: {campaign.total_opened.toLocaleString()}
                                    </span>
                                    <span className={darkMode ? 'text-slate-500' : 'text-gray-500'}>
                                      Clicks: {campaign.total_clicked.toLocaleString()}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => navigate(`/marketing/campaigns/${campaign.id}`)}
                            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                              darkMode
                                ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                                : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                            }`}
                          >
                            View
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        )
      ) : (
        <div className={`rounded-xl p-12 text-center ${
          darkMode
            ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
            : 'bg-white shadow-sm border border-gray-200'
        }`}>
          <Mail className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`} />
          <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
            No campaigns found
          </h3>
          <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
            {searchTerm || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Get started by creating your first email campaign'}
          </p>
          <Link
            to="/marketing/campaigns/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Campaign
          </Link>
        </div>
      )}
    </div>
  );
}

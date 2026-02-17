import React, { useState, useEffect } from 'react';
import {
  Wrench, Plus, TrendingUp,
  Bell, Award, Activity, ChevronRight, Zap,
  Image as ImageIcon, Anchor, Trophy,
  Edit2, Trash2
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { BoatDetailView } from '../components/garage/BoatDetailView';
import { AddBoatModal } from '../components/garage/AddBoatModal';
import { EditBoatModal } from '../components/garage/EditBoatModal';
import { BoatImageUploadModal } from '../components/garage/BoatImageUploadModal';

interface Boat {
  id: string;
  boat_type: string;
  sail_number: string;
  hull: string;
  handicap: number | null;
  image_url: string | null;
  description: string | null;
  is_primary: boolean;
  created_at: string;
  boat_name?: string;
  design_name?: string;
  designer_name?: string;
  hull_registration_number?: string;
  registration_date?: string;
  certification_authority?: string;
  certification_file_url?: string;
  certification_file_name?: string;
}

interface MaintenanceReminder {
  id: string;
  title: string;
  due_date: string;
  boat_id: string;
}

interface PerformanceStats {
  total_races: number;
  best_position: number | null;
  avg_position: number | null;
  recent_trend: 'improving' | 'stable' | 'declining' | null;
}

interface MyGaragePageProps {
  darkMode: boolean;
}

export const MyGaragePage: React.FC<MyGaragePageProps> = ({ darkMode }) => {
  const { user, currentClub, currentOrganization } = useAuth();
  const { addNotification } = useNotifications();
  const [boats, setBoats] = useState<Boat[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [selectedBoat, setSelectedBoat] = useState<Boat | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [upcomingReminders, setUpcomingReminders] = useState<MaintenanceReminder[]>([]);
  const [performanceStats, setPerformanceStats] = useState<Record<string, PerformanceStats>>({});
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null);
  const [editingBoat, setEditingBoat] = useState<Boat | null>(null);
  const [boatForImageUpload, setBoatForImageUpload] = useState<Boat | null>(null);

  useEffect(() => {
    if (user?.id) {
      fetchGarageData();
    }
  }, [currentClub, currentOrganization, user]);

  const fetchGarageData = async () => {
    try {
      setLoading(true);

      // Get ALL member IDs for this user across all clubs
      // My Garage is a personal feature - should show all boats regardless of current club context
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('id, club_id')
        .eq('user_id', user?.id);

      if (memberError) throw memberError;
      if (!memberData || memberData.length === 0) {
        setLoading(false);
        return; // No boats to show
      }

      // Store the first member ID for backwards compatibility with add/edit modals
      setMemberId(memberData[0].id);

      // Get all member IDs for the user
      const memberIds = memberData.map(m => m.id);

      // Fetch boats from ALL clubs where the user is a member
      const { data: boatsData, error: boatsError } = await supabase
        .from('member_boats')
        .select(`
          *,
          members!inner(club_id, clubs(name))
        `)
        .in('member_id', memberIds)
        .order('is_primary', { ascending: false })
        .order('boat_type', { ascending: true });

      if (boatsError) throw boatsError;

      const boatsWithImages = await Promise.all(
        (boatsData || []).map(async (boat: any) => {
          const { data: primaryImage } = await supabase
            .from('boat_images')
            .select('image_url')
            .eq('boat_id', boat.id)
            .eq('is_primary', true)
            .maybeSingle();

          return {
            ...boat,
            image_url: boat.image_url || primaryImage?.image_url || null
          } as Boat;
        })
      );

      setBoats(boatsWithImages as Boat[]);

      // Fetch upcoming maintenance reminders for all boats
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      // Get all boat IDs
      const boatIds = boatsWithImages.map((b: Boat) => b.id);

      const { data: remindersData } = boatIds.length > 0 ? await supabase
        .from('maintenance_reminders')
        .select('id, title, due_date, boat_id')
        .in('boat_id', boatIds)
        .eq('is_active', true)
        .eq('is_completed', false)
        .lte('due_date', nextWeek.toISOString().split('T')[0])
        .order('due_date', { ascending: true })
        .limit(5) : { data: null };

      setUpcomingReminders(remindersData || []);

      // Fetch performance stats for each boat from actual race results
      const stats: Record<string, PerformanceStats> = {};

      // Query both quick_races and race_series for complete race data
      // Get all unique club IDs from the boats' member data
      const clubIds = [...new Set(boatsData?.map((b: any) => b.members?.club_id).filter(Boolean))];

      // Fetch races from all clubs where the user has boats
      const { data: quickRaces } = clubIds.length > 0 ? await supabase
        .from('quick_races')
        .select('race_results, created_at')
        .in('club_id', clubIds)
        .order('created_at', { ascending: false }) : { data: null };

      const { data: seriesRaces } = clubIds.length > 0 ? await supabase
        .from('race_series')
        .select('race_results, created_at')
        .in('club_id', clubIds)
        .order('created_at', { ascending: false }) : { data: null };

      const allRaces = [...(quickRaces || []), ...(seriesRaces || [])];

      for (const boat of boatsWithImages as Boat[]) {
        const boatResults = [];

        // Search through all race results
        for (const race of allRaces) {
          if (race.race_results && Array.isArray(race.race_results)) {
            // race_results is an array of race rounds
            for (const raceRound of race.race_results) {
              if (raceRound && Array.isArray(raceRound)) {
                // Each round contains skipper results
                const result = raceRound.find((r: any) => {
                  // Match by boat_type (class) AND sail number
                  const sailNoMatch = (r.sailNo || r.sailNumber) === boat.sail_number;
                  const classMatch = (r.type || r.boat || r.boat_type) === boat.boat_type;

                  // Also check hull name as fallback
                  const hullMatch = boat.hull && (r.hull === boat.hull || r.boat === boat.hull);

                  return (sailNoMatch && classMatch) || hullMatch;
                });

                if (result && result.position) {
                  const pos = typeof result.position === 'string' ? parseInt(result.position) : result.position;
                  if (!isNaN(pos) && pos > 0) {
                    boatResults.push({
                      position: pos,
                      date: race.created_at
                    });
                  }
                }
              }
            }
          }
        }

        if (boatResults.length > 0) {
          const positions = boatResults.map(r => r.position).filter(p => p && !isNaN(p));
          stats[boat.id] = {
            total_races: positions.length,
            best_position: positions.length > 0 ? Math.min(...positions) : null,
            avg_position: positions.length > 0 ? Math.round(positions.reduce((a, b) => a + b, 0) / positions.length) : null,
            recent_trend: calculateTrend(positions)
          };
        } else {
          stats[boat.id] = {
            total_races: 0,
            best_position: null,
            avg_position: null,
            recent_trend: null
          };
        }
      }
      setPerformanceStats(stats);

    } catch (err) {
      console.error('Error fetching garage data:', err);
      addNotification('error', 'Failed to load garage data');
    } finally {
      setLoading(false);
    }
  };

  const calculateTrend = (positions: number[]): 'improving' | 'stable' | 'declining' | null => {
    if (positions.length < 3) return null;
    const recent = positions.slice(0, 3);
    const older = positions.slice(3, 6);
    if (older.length === 0) return null;

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    if (recentAvg < olderAvg - 1) return 'improving';
    if (recentAvg > olderAvg + 1) return 'declining';
    return 'stable';
  };

  const getBoatName = (boatId: string) => {
    const boat = boats.find(b => b.id === boatId);
    return boat ? `${boat.boat_type} ${boat.sail_number}` : 'Boat';
  };

  const handleImageUploadWithPosition = async (boatId: string, file: File, position: { x: number; y: number; scale: number }) => {
    try {
      const { compressImage } = await import('../utils/imageCompression');
      const compressed = await compressImage(file, 'photo');

      const { data: boatData } = await supabase
        .from('member_boats')
        .select('member_id, members!inner(club_id)')
        .eq('id', boatId)
        .single();

      const clubId = boatData?.members?.club_id || currentClub?.clubId || 'default';

      const fileExt = compressed.name.split('.').pop();
      const fileName = `${boatId}-${Date.now()}.${fileExt}`;
      const filePath = `${clubId}/boats/${fileName}`;

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('media')
        .upload(filePath, compressed, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Failed to upload image: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      if (!publicUrlData?.publicUrl) {
        throw new Error('Failed to get public URL for uploaded image');
      }

      const { error: updateError } = await supabase
        .from('member_boats')
        .update({
          image_url: publicUrlData.publicUrl,
          image_position: position
        })
        .eq('id', boatId);

      if (updateError) {
        console.error('Database update error:', updateError);
        throw new Error(`Failed to update boat: ${updateError.message}`);
      }

      try {
        await supabase
          .from('boat_images')
          .insert({
            boat_id: boatId,
            image_url: publicUrlData.publicUrl,
            is_primary: true,
            uploaded_by: user?.id
          });
      } catch (imgErr) {
        console.warn('Non-critical: Failed to add to boat_images gallery:', imgErr);
      }

      addNotification('success', 'Boat image updated successfully');
      fetchGarageData();
    } catch (err: any) {
      console.error('Error uploading image:', err);
      addNotification('error', err.message || 'Failed to upload image');
    }
  };

  const handleDeleteBoat = async (boatId: string, boatName: string) => {
    if (!confirm(`Are you sure you want to delete ${boatName}? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('member_boats')
        .delete()
        .eq('id', boatId);

      if (error) throw error;

      addNotification('success', 'Boat deleted successfully');
      fetchGarageData();
    } catch (err) {
      console.error('Error deleting boat:', err);
      addNotification('error', 'Failed to delete boat');
    }
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-16">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
              <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Loading your garage...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (selectedBoat) {
    return (
      <BoatDetailView
        boat={selectedBoat}
        darkMode={darkMode}
        onClose={() => {
          setSelectedBoat(null);
          fetchGarageData();
        }}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-16">
        {/* Hero Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
                <Wrench className="text-white" size={32} />
              </div>
              <div>
                <h1 className={`text-4xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Boat Shed
                </h1>
                <p className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Your fleet command center
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200 animate-pulse"
            >
              <Plus size={20} />
              <span className="hidden sm:inline">Add Boat</span>
            </button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`
              p-4 rounded-xl flex items-start gap-4
              ${darkMode
                ? 'bg-slate-800/50 border border-slate-700/50'
                : 'bg-white border border-slate-200'}
            `}>
              <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20 flex-shrink-0">
                <Anchor className="text-white" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {boats.length}
                </div>
                <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Total Boats
                </div>
              </div>
            </div>

            <div className={`
              p-4 rounded-xl flex items-start gap-4
              ${darkMode
                ? 'bg-slate-800/50 border border-slate-700/50'
                : 'bg-white border border-slate-200'}
            `}>
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 shadow-lg shadow-orange-500/20 flex-shrink-0">
                <Bell className="text-white" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {upcomingReminders.length}
                </div>
                <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Due Soon
                </div>
              </div>
            </div>

            <div className={`
              p-4 rounded-xl flex items-start gap-4
              ${darkMode
                ? 'bg-slate-800/50 border border-slate-700/50'
                : 'bg-white border border-slate-200'}
            `}>
              <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/20 flex-shrink-0">
                <Trophy className="text-white" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {Object.values(performanceStats).reduce((sum, stat) => sum + stat.total_races, 0)}
                </div>
                <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Total Races
                </div>
              </div>
            </div>

            <div className={`
              p-4 rounded-xl flex items-start gap-4
              ${darkMode
                ? 'bg-slate-800/50 border border-slate-700/50'
                : 'bg-white border border-slate-200'}
            `}>
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg shadow-purple-500/20 flex-shrink-0">
                <TrendingUp className="text-white" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {Object.values(performanceStats).filter(s => s.recent_trend === 'improving').length}
                </div>
                <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Improving
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Boats Section - Takes 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            <div className="mb-4">
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Your Fleet
              </h2>
            </div>

            {boats.length === 0 ? (
              <div className={`
                text-center py-16 rounded-2xl border-2 border-dashed
                ${darkMode
                  ? 'bg-slate-800/50 border-slate-700'
                  : 'bg-slate-50 border-slate-300'}
              `}>
                <Wrench className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
                <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  No boats in your garage yet
                </p>
                <p className={`text-sm mb-4 ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                  Add your first boat to start tracking maintenance and performance
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200 font-medium animate-pulse"
                >
                  <Plus size={20} />
                  <span>Add Your First Boat</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {boats.map((boat) => {
                  const stats = performanceStats[boat.id];
                  return (
                    <div
                      key={boat.id}
                      className={`
                        group relative overflow-hidden rounded-2xl transition-all
                        ${darkMode
                          ? 'bg-slate-800/80 backdrop-blur-sm hover:bg-slate-800/90 border border-slate-700 hover:border-cyan-500/50'
                          : 'bg-white hover:bg-slate-50 border border-slate-200 hover:border-cyan-500/50'}
                        shadow-lg hover:shadow-xl hover:shadow-cyan-500/10
                      `}
                    >
                      {/* Boat Image */}
                      <div className="relative h-64 overflow-hidden cursor-pointer" onClick={() => setSelectedBoat(boat)}>
                        {boat.image_url ? (
                          <div className="w-full h-full overflow-hidden relative">
                            <div
                              className="absolute inset-0 flex items-center justify-center group-hover:scale-105 transition-transform duration-300"
                              style={
                                boat.image_position
                                  ? {
                                      transform: `translate(${boat.image_position.x || 0}px, ${boat.image_position.y || 0}px) scale(${boat.image_position.scale || 1})`,
                                      transformOrigin: 'center'
                                    }
                                  : undefined
                              }
                            >
                              <img
                                src={boat.image_url}
                                alt={`${boat.boat_type} ${boat.sail_number}`}
                                className="max-w-none"
                                style={{
                                  width: 'auto',
                                  height: '100%'
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className={`
                            w-full h-full flex items-center justify-center
                            ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}
                          `}>
                            <Wrench className={`w-16 h-16 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                          </div>
                        )}

                        {/* Overlay Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>

                        {/* Action Buttons */}
                        <div className="absolute top-3 left-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setBoatForImageUpload(boat);
                            }}
                            className={`
                              p-2 rounded-lg transition-all
                              ${darkMode ? 'bg-slate-900/80 hover:bg-slate-900' : 'bg-white/80 hover:bg-white'}
                              backdrop-blur-sm shadow-lg
                            `}
                            title="Upload image"
                          >
                            <ImageIcon size={16} className={darkMode ? 'text-cyan-400' : 'text-cyan-600'} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingBoat(boat);
                            }}
                            className={`
                              p-2 rounded-lg transition-all
                              ${darkMode ? 'bg-slate-900/80 hover:bg-slate-900' : 'bg-white/80 hover:bg-white'}
                              backdrop-blur-sm shadow-lg
                            `}
                            title="Edit boat"
                          >
                            <Edit2 size={16} className={darkMode ? 'text-green-400' : 'text-green-600'} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBoat(boat.id, `${boat.boat_type} ${boat.sail_number}`);
                            }}
                            className={`
                              p-2 rounded-lg transition-all
                              ${darkMode ? 'bg-slate-900/80 hover:bg-slate-900' : 'bg-white/80 hover:bg-white'}
                              backdrop-blur-sm shadow-lg
                            `}
                            title="Delete boat"
                          >
                            <Trash2 size={16} className="text-red-400" />
                          </button>
                        </div>

                        {/* Badges */}
                        <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
                          {boat.is_primary && (
                            <div className="px-3 py-1 bg-yellow-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                              <Award size={12} />
                              Primary
                            </div>
                          )}
                          {/* Club Badge */}
                          {(boat as any).members?.clubs?.name && (
                            <div className={`px-3 py-1 text-xs font-medium rounded-full backdrop-blur-sm ${
                              darkMode
                                ? 'bg-slate-900/80 text-cyan-400 border border-cyan-500/30'
                                : 'bg-white/90 text-cyan-600 border border-cyan-500/30'
                            }`}>
                              {(boat as any).members.clubs.name}
                            </div>
                          )}
                        </div>

                        {/* Boat Type & Sail Number */}
                        <div className="absolute bottom-3 left-3 right-3">
                          <h3 className="text-xl font-bold text-white mb-1">
                            {boat.boat_type}
                          </h3>
                          <div className="flex items-center gap-2">
                            <span className="text-white/90 text-sm">Sail #{boat.sail_number}</span>
                            {boat.hull && (
                              <>
                                <span className="text-white/50">•</span>
                                <span className="text-white/90 text-sm">{boat.hull}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Stats Bar */}
                      <div className="p-4">
                        <div className="grid grid-cols-4 gap-3">
                          {stats && stats.total_races > 0 ? (
                            <>
                              <div className="text-center">
                                <div className={`text-lg font-bold ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>
                                  {stats.total_races}
                                </div>
                                <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                                  Races
                                </div>
                              </div>
                              <div className="text-center">
                                <div className={`text-lg font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                                  {stats.best_position || '-'}
                                </div>
                                <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                                  Best
                                </div>
                              </div>
                              <div className="text-center">
                                <div className={`text-lg font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                                  {stats.avg_position || '-'}
                                </div>
                                <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                                  Avg
                                </div>
                              </div>
                              <div className="text-center">
                                {stats.recent_trend && (
                                  <div className={`text-lg font-bold flex items-center justify-center gap-1 ${
                                    stats.recent_trend === 'improving' ? (darkMode ? 'text-green-400' : 'text-green-600') :
                                    stats.recent_trend === 'declining' ? (darkMode ? 'text-red-400' : 'text-red-600') :
                                    (darkMode ? 'text-slate-400' : 'text-slate-600')
                                  }`}>
                                    {stats.recent_trend === 'improving' && <TrendingUp size={16} />}
                                    {stats.recent_trend === 'declining' && <Activity size={16} className="transform rotate-180" />}
                                    {stats.recent_trend === 'stable' && <Activity size={16} />}
                                  </div>
                                )}
                                {!stats.recent_trend && (
                                  <div className={`text-lg font-bold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                    -
                                  </div>
                                )}
                                <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                                  Trend
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="col-span-4 text-center py-2">
                              <Trophy className={`w-8 h-8 mx-auto mb-2 ${darkMode ? 'text-slate-700' : 'text-slate-300'}`} />
                              <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                                No race data yet
                              </p>
                            </div>
                          )}
                        </div>

                        {/* View Details Button */}
                        <button
                          onClick={() => setSelectedBoat(boat)}
                          className={`
                            w-full mt-4 pt-4 border-t flex items-center justify-between cursor-pointer
                            ${darkMode ? 'border-slate-700' : 'border-slate-200'}
                          `}
                        >
                          <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            View Details
                          </span>
                          <ChevronRight size={20} className={`
                            transition-transform group-hover:translate-x-1
                            ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}
                          `} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar - Reminders & Quick Actions */}
          <div className="space-y-6">
            {/* Upcoming Maintenance */}
            <div className={`
              rounded-2xl p-6
              ${darkMode
                ? 'bg-slate-800 border border-slate-700'
                : 'bg-white border border-slate-200'}
            `}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Bell className="text-orange-500" size={20} />
                </div>
                <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Due Soon
                </h3>
              </div>

              {upcomingReminders.length === 0 ? (
                <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                  No upcoming maintenance
                </p>
              ) : (
                <div className="space-y-3">
                  {upcomingReminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className={`
                        p-3 rounded-xl
                        ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
                      `}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {reminder.title}
                          </p>
                          <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {getBoatName(reminder.boat_id)}
                          </p>
                        </div>
                        <div className={`text-xs font-medium px-2 py-1 rounded ${
                          new Date(reminder.due_date) < new Date()
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-orange-500/20 text-orange-400'
                        }`}>
                          {new Date(reminder.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Performance Tip */}
            <div className={`
              rounded-2xl p-6 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border
              ${darkMode ? 'border-cyan-500/20' : 'border-cyan-500/30'}
            `}>
              <div className="flex items-start gap-3 mb-3">
                <Zap className="text-cyan-500 flex-shrink-0" size={20} />
                <div>
                  <h4 className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Pro Tip
                  </h4>
                  <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Log your rig settings after each race to track what works best in different conditions!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Boat Modal */}
      {showAddModal && (
        <AddBoatModal
          darkMode={darkMode}
          memberId={memberId!}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchGarageData();
          }}
        />
      )}

      {/* Edit Boat Modal */}
      {editingBoat && (
        <EditBoatModal
          boat={editingBoat}
          darkMode={darkMode}
          onClose={() => setEditingBoat(null)}
          onSuccess={() => {
            setEditingBoat(null);
            fetchGarageData();
          }}
        />
      )}

      {/* Boat Image Upload Modal */}
      {boatForImageUpload && (
        <BoatImageUploadModal
          isOpen={!!boatForImageUpload}
          onClose={() => setBoatForImageUpload(null)}
          onSave={async (file, position) => {
            await handleImageUploadWithPosition(boatForImageUpload.id, file, position);
            setBoatForImageUpload(null);
          }}
          darkMode={darkMode}
          boatName={`${boatForImageUpload.boat_type} ${boatForImageUpload.sail_number}`}
        />
      )}
    </div>
  );
};

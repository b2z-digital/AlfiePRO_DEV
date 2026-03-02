import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Camera, Settings, Clock, TrendingUp, Wrench,
  Plus, Calendar, Wind, Droplets, Award, Share2, Edit2,
  Trash2, Upload, Image as ImageIcon, Activity, FileText, ExternalLink, ChevronRight
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { MaintenanceTab } from './tabs/MaintenanceTab';
import { RigTuningTab } from './tabs/RigTuningTab';
import { PerformanceTab } from './tabs/PerformanceTab';
import { GalleryTab } from './tabs/GalleryTab';
import { EditBoatModal } from './EditBoatModal';

interface Boat {
  id: string;
  boat_type: string;
  sail_number: string;
  hull: string;
  handicap: number | null;
  image_url?: string | null;
  description?: string | null;
  is_primary: boolean;
  purchase_date?: string | null;
  purchase_value?: number | null;
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

interface BoatDetailViewProps {
  boat: Boat;
  darkMode: boolean;
  onClose: () => void;
}

type Tab = 'overview' | 'gallery' | 'maintenance' | 'rig-tuning' | 'performance';

const calcRoundPosition = (raceResults: any[], skipperIndices: number[]): number | null => {
  if (!raceResults || !Array.isArray(raceResults) || skipperIndices.length === 0) return null;
  const totals: Record<number, number> = {};
  for (const result of raceResults) {
    const idx = result.skipperIndex;
    if (typeof idx !== 'number') continue;
    const pos = typeof result.position === 'string' ? parseInt(result.position) : result.position;
    if (!isNaN(pos) && pos > 0) {
      totals[idx] = (totals[idx] || 0) + pos;
    }
  }
  const allIndices = Object.keys(totals).map(Number);
  if (allIndices.length === 0) return null;
  allIndices.sort((a, b) => totals[a] - totals[b]);
  const boatIdx = skipperIndices[0];
  const rank = allIndices.indexOf(boatIdx) + 1;
  return rank > 0 ? rank : null;
};

export const BoatDetailView: React.FC<BoatDetailViewProps> = ({
  boat: initialBoat,
  darkMode,
  onClose
}) => {
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [boat, setBoat] = useState(initialBoat);
  const [stats, setStats] = useState({
    totalRaces: 0,
    bestPosition: null as number | null,
    avgPosition: null as number | null,
    maintenanceLogs: 0,
    upcomingReminders: 0,
    rigs: 0
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    fetchStats();
  }, [boat.id]);

  const findBoatSkipperIndex = (skippers: any[]): number[] => {
    if (!skippers || !Array.isArray(skippers)) return [];
    const indices: number[] = [];
    skippers.forEach((skipper: any, idx: number) => {
      if (skipper.boatId === boat.id) {
        indices.push(idx);
      }
    });
    return indices;
  };

  const extractPositions = (raceResults: any[], skipperIndices: number[]) => {
    if (!raceResults || !Array.isArray(raceResults) || skipperIndices.length === 0) return [];
    const positions: number[] = [];
    for (const result of raceResults) {
      if (skipperIndices.includes(result.skipperIndex)) {
        const pos = typeof result.position === 'string' ? parseInt(result.position) : result.position;
        if (pos && !isNaN(pos) && pos > 0) {
          positions.push(pos);
        }
      }
    }
    return positions;
  };

  const fetchStats = async () => {
    try {
      const boatResults: { position: number; date: string }[] = [];
      const activityItems: any[] = [];

      const { data: raceData } = await supabase
        .from('quick_races')
        .select('id, race_date, event_name, race_results, skippers')
        .not('race_results', 'is', null)
        .not('skippers', 'is', null)
        .order('race_date', { ascending: false });

      if (raceData) {
        for (const race of raceData) {
          const skipperIndices = findBoatSkipperIndex(race.skippers);
          if (skipperIndices.length === 0) continue;

          const positions = extractPositions(race.race_results, skipperIndices);
          const roundPosition = calcRoundPosition(race.race_results, skipperIndices);
          const raceNumbers = new Set<number>();
          for (const result of (race.race_results || [])) {
            if (skipperIndices.includes(result.skipperIndex) && result.race) {
              raceNumbers.add(result.race);
            }
          }

          if (raceNumbers.size > 0) {
            activityItems.push({
              type: 'race',
              date: race.race_date,
              title: race.event_name || 'Race',
              position: roundPosition,
              resultId: race.id,
              raceCount: raceNumbers.size
            });
          }

          for (const pos of positions) {
            boatResults.push({ position: pos, date: race.race_date });
          }
        }
      }

      const { data: seriesRounds } = await supabase
        .from('race_series_rounds')
        .select(`
          id, date, round_name, round_index,
          race_results, skippers,
          race_series:series_id(id, series_name)
        `)
        .not('race_results', 'is', null)
        .not('skippers', 'is', null)
        .order('date', { ascending: false });

      if (seriesRounds) {
        for (const round of seriesRounds) {
          const skipperIndices = findBoatSkipperIndex(round.skippers);
          if (skipperIndices.length === 0) continue;

          const positions = extractPositions(round.race_results, skipperIndices);
          const roundPosition = calcRoundPosition(round.race_results, skipperIndices);
          const raceNumbers = new Set<number>();
          for (const result of (round.race_results || [])) {
            if (skipperIndices.includes(result.skipperIndex) && result.race) {
              raceNumbers.add(result.race);
            }
          }

          const seriesInfo = Array.isArray(round.race_series)
            ? round.race_series[0]
            : (round.race_series as any);
          const seriesName = seriesInfo?.series_name;
          const seriesId = seriesInfo?.id;
          const roundLabel = round.round_name || `Round ${(round.round_index ?? 0) + 1}`;

          if (raceNumbers.size > 0) {
            activityItems.push({
              type: 'race',
              date: round.date,
              title: `${seriesName || 'Series'} - ${roundLabel}`,
              position: roundPosition,
              resultId: seriesId || round.id,
              raceCount: raceNumbers.size
            });
          }

          for (const pos of positions) {
            boatResults.push({ position: pos, date: round.date });
          }
        }
      }

      const positions = boatResults.map(r => r.position).filter(p => p && !isNaN(p));

      const { count: logsCount } = await supabase
        .from('maintenance_logs')
        .select('*', { count: 'exact', head: true })
        .eq('boat_id', boat.id);

      const { count: remindersCount } = await supabase
        .from('maintenance_reminders')
        .select('*', { count: 'exact', head: true })
        .eq('boat_id', boat.id)
        .eq('is_active', true)
        .eq('is_completed', false);

      const { count: rigsCount } = await supabase
        .from('boat_rigs')
        .select('*', { count: 'exact', head: true })
        .eq('boat_id', boat.id);

      const { data: maintenanceData } = await supabase
        .from('maintenance_logs')
        .select('*')
        .eq('boat_id', boat.id)
        .order('date', { ascending: false })
        .limit(5);

      if (maintenanceData) {
        maintenanceData.forEach(log => {
          activityItems.push({
            type: 'maintenance',
            date: log.date,
            title: log.title,
            description: log.notes,
            id: log.id
          });
        });
      }

      activityItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentActivity(activityItems.slice(0, 10));

      setStats({
        totalRaces: positions.length,
        bestPosition: positions.length > 0 ? Math.min(...positions) : null,
        avgPosition: positions.length > 0 ? Math.round(positions.reduce((a, b) => a + b, 0) / positions.length) : null,
        maintenanceLogs: logsCount || 0,
        upcomingReminders: remindersCount || 0,
        rigs: rigsCount || 0
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      setUploadingImage(true);

      const fileExt = file.name.split('.').pop();
      const fileName = `${boat.id}-${Date.now()}.${fileExt}`;
      const filePath = `boats/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('member_boats')
        .update({ image_url: publicUrlData.publicUrl })
        .eq('id', boat.id);

      if (updateError) throw updateError;

      await supabase
        .from('boat_images')
        .upsert({
          boat_id: boat.id,
          image_url: publicUrlData.publicUrl,
          is_primary: true
        }, {
          onConflict: 'boat_id,is_primary'
        });

      setBoat({ ...boat, image_url: publicUrlData.publicUrl });
      addNotification('success', 'Boat image updated successfully');
    } catch (err) {
      console.error('Error uploading image:', err);
      addNotification('error', 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const tabs = [
    { id: 'overview' as Tab, label: 'Overview', icon: TrendingUp },
    { id: 'gallery' as Tab, label: 'Gallery', icon: Camera },
    { id: 'maintenance' as Tab, label: 'Maintenance', icon: Wrench },
    { id: 'rig-tuning' as Tab, label: 'Rig Tuning', icon: Settings },
    { id: 'performance' as Tab, label: 'Performance', icon: Award }
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-16">
        {/* Back Button */}
        <button
          onClick={onClose}
          className={`
            flex items-center gap-2 mb-6 px-4 py-2 rounded-xl transition-colors
            ${darkMode
              ? 'text-slate-300 hover:bg-slate-800'
              : 'text-slate-700 hover:bg-slate-100'}
          `}
        >
          <ArrowLeft size={20} />
          <span className="font-medium">Back to Garage</span>
        </button>

        {/* Boat Header */}
        <div className={`
          rounded-2xl overflow-hidden mb-6
          ${darkMode ? 'bg-slate-800/80 backdrop-blur-sm border border-slate-700' : 'bg-white border border-slate-200'}
        `}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            {/* Image Section */}
            <div className="relative h-64 md:h-auto group">
              {boat.image_url ? (
                <img
                  src={boat.image_url}
                  alt={`${boat.boat_type} ${boat.sail_number}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className={`
                  w-full h-full flex items-center justify-center
                  ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}
                `}>
                  <Camera className={`w-16 h-16 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                </div>
              )}

              {/* Upload Button Overlay */}
              <label
                htmlFor="boat-detail-image"
                className={`
                  absolute bottom-4 left-4 px-4 py-2 rounded-lg cursor-pointer transition-all flex items-center gap-2
                  ${darkMode ? 'bg-slate-900/90 hover:bg-slate-900 text-white' : 'bg-white/90 hover:bg-white text-slate-900'}
                  backdrop-blur-sm shadow-lg opacity-0 group-hover:opacity-100
                `}
              >
                {uploadingImage ? (
                  <>
                    <div className="animate-spin">
                      <Upload size={16} />
                    </div>
                    <span className="text-sm font-medium">Uploading...</span>
                  </>
                ) : (
                  <>
                    <ImageIcon size={16} />
                    <span className="text-sm font-medium">Change Photo</span>
                  </>
                )}
              </label>
              <input
                id="boat-detail-image"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                }}
              />

              {boat.is_primary && (
                <div className="absolute top-4 right-4 px-3 py-1.5 bg-yellow-500 text-white text-sm font-bold rounded-full flex items-center gap-1.5 shadow-lg">
                  <Award size={14} />
                  Primary
                </div>
              )}
            </div>

            {/* Info Section */}
            <div className="md:col-span-2 p-6 md:p-8">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {boat.boat_type}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className={`font-medium ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>
                      Sail #{boat.sail_number}
                    </span>
                    {boat.hull && (
                      <>
                        <span className={darkMode ? 'text-slate-600' : 'text-slate-400'}>•</span>
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                          Hull: {boat.hull}
                        </span>
                      </>
                    )}
                    {boat.handicap && boat.handicap !== 0 && (
                      <>
                        <span className={darkMode ? 'text-slate-600' : 'text-slate-400'}>•</span>
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                          Handicap: {boat.handicap}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowEditModal(true)}
                    className={`
                      p-2 rounded-lg transition-colors
                      ${darkMode
                        ? 'hover:bg-slate-700 text-slate-400'
                        : 'hover:bg-slate-100 text-slate-600'}
                    `}
                    title="Edit boat"
                  >
                    <Edit2 size={20} />
                  </button>
                  <button
                    className={`
                      p-2 rounded-lg transition-colors
                      ${darkMode
                        ? 'hover:bg-slate-700 text-slate-400'
                        : 'hover:bg-slate-100 text-slate-600'}
                    `}
                    title="Share"
                  >
                    <Share2 size={20} />
                  </button>
                </div>
              </div>

              {boat.description && (
                <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {boat.description}
                </p>
              )}

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className={`
                  p-4 rounded-xl
                  ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
                `}>
                  <div className={`text-2xl font-bold ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>
                    {stats.totalRaces}
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Total Races
                  </div>
                </div>

                <div className={`
                  p-4 rounded-xl
                  ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
                `}>
                  <div className={`text-2xl font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                    {stats.bestPosition || '-'}
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Best Position
                  </div>
                </div>

                <div className={`
                  p-4 rounded-xl
                  ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
                `}>
                  <div className={`text-2xl font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                    {stats.upcomingReminders}
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Due Soon
                  </div>
                </div>

                <div className={`
                  p-4 rounded-xl
                  ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
                `}>
                  <div className={`text-2xl font-bold ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                    {stats.rigs}
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Rig Setups
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className={`
          flex items-center gap-2 mb-6 p-1 rounded-xl overflow-x-auto
          ${darkMode ? 'bg-slate-800/50' : 'bg-slate-100'}
        `}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap
                  ${activeTab === tab.id
                    ? darkMode
                      ? 'bg-slate-700 text-white shadow-lg'
                      : 'bg-white text-slate-900 shadow-lg'
                    : darkMode
                      ? 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }
                `}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Overview content - Summary of all sections */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={`
                  rounded-2xl p-6
                  ${darkMode ? 'bg-slate-800/80 backdrop-blur-sm border border-slate-700' : 'bg-white border border-slate-200'}
                `}>
                  <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <Activity size={20} />
                    Recent Activity
                  </h3>
                  {recentActivity.length === 0 ? (
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      No activity yet. Start racing or logging maintenance to see activity here.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {recentActivity.slice(0, 5).map((activity, index) => (
                        <div
                          key={`${activity.type}-${activity.resultId}-${index}`}
                          onClick={() => activity.type === 'race' && activity.resultId && navigate(`/results/${activity.resultId}`)}
                          className={`
                            p-3 rounded-xl border transition-colors
                            ${activity.type === 'race' && activity.resultId
                              ? darkMode
                                ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700 cursor-pointer'
                                : 'bg-slate-50 border-slate-200 hover:bg-slate-100 cursor-pointer'
                              : darkMode
                                ? 'bg-slate-700/50 border-slate-600'
                                : 'bg-slate-50 border-slate-200'
                            }
                          `}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {activity.type === 'race' ? (
                                  <Award size={14} className={darkMode ? 'text-cyan-400' : 'text-cyan-600'} />
                                ) : (
                                  <Wrench size={14} className={darkMode ? 'text-orange-400' : 'text-orange-600'} />
                                )}
                                <p className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                  {activity.title}
                                </p>
                              </div>
                              {activity.position != null && (
                                <p className={`text-xs font-medium ${darkMode ? 'text-cyan-400' : 'text-cyan-700'}`}>
                                  Finished {activity.position}{activity.position === 1 ? 'st' : activity.position === 2 ? 'nd' : activity.position === 3 ? 'rd' : 'th'}
                                </p>
                              )}
                              {activity.description && (
                                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'} line-clamp-1`}>
                                  {activity.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-600'} whitespace-nowrap`}>
                                {new Date(activity.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </div>
                              {activity.type === 'race' && activity.resultId && (
                                <ChevronRight size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className={`
                  rounded-2xl p-6
                  ${darkMode ? 'bg-slate-800/80 backdrop-blur-sm border border-slate-700' : 'bg-white border border-slate-200'}
                `}>
                  <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Boat Specifications
                  </h3>
                  <div className="space-y-3 text-sm">
                    {/* Basic Info - Always Show */}
                    <div className="flex justify-between">
                      <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Boat Type:</span>
                      <span className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {boat.boat_type}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Sail Number:</span>
                      <span className={darkMode ? 'text-white' : 'text-slate-900'}>
                        #{boat.sail_number}
                      </span>
                    </div>
                    {boat.hull_registration_number && (
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Hull Reg #:</span>
                        <span className={`font-mono font-semibold tracking-wide ${darkMode ? 'text-cyan-300' : 'text-cyan-700'}`}>
                          {boat.hull_registration_number}
                        </span>
                      </div>
                    )}
                    {boat.hull && (
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Hull:</span>
                        <span className={darkMode ? 'text-white' : 'text-slate-900'}>
                          {boat.hull}
                        </span>
                      </div>
                    )}
                    {boat.handicap && boat.handicap !== 0 && (
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Handicap:</span>
                        <span className={darkMode ? 'text-white' : 'text-slate-900'}>
                          {boat.handicap}
                        </span>
                      </div>
                    )}

                    {/* Registration & Certification - Conditional */}
                    {(boat.boat_name || boat.design_name || boat.designer_name || boat.hull_registration_number ||
                      boat.registration_date || boat.certification_authority || boat.certification_file_url) && (
                      <div className={`pt-3 mt-3 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                        <h4 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Registration & Certification
                        </h4>
                      </div>
                    )}

                    {boat.boat_name && (
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Boat Name:</span>
                        <span className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {boat.boat_name}
                        </span>
                      </div>
                    )}
                    {boat.design_name && (
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Design:</span>
                        <span className={darkMode ? 'text-white' : 'text-slate-900'}>
                          {boat.design_name}
                        </span>
                      </div>
                    )}
                    {boat.designer_name && (
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Designer:</span>
                        <span className={darkMode ? 'text-white' : 'text-slate-900'}>
                          {boat.designer_name}
                        </span>
                      </div>
                    )}
                    {boat.hull_registration_number && (
                      <div className="flex flex-col gap-1 py-2">
                        <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Hull Registration Number:
                        </span>
                        <div className={`
                          px-4 py-3 rounded-lg font-mono text-base font-bold tracking-wider text-center
                          ${darkMode
                            ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300'
                            : 'bg-cyan-50 border border-cyan-200 text-cyan-700'}
                        `}>
                          {boat.hull_registration_number}
                        </div>
                      </div>
                    )}
                    {boat.registration_date && (
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Registered:</span>
                        <span className={darkMode ? 'text-white' : 'text-slate-900'}>
                          {new Date(boat.registration_date).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {boat.certification_authority && (
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Authority:</span>
                        <span className={`text-right ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {boat.certification_authority}
                        </span>
                      </div>
                    )}
                    {boat.certification_file_url && (
                      <div className="pt-2">
                        <a
                          href={boat.certification_file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`
                            flex items-center gap-3 p-4 rounded-xl border-2 transition-all group
                            ${darkMode
                              ? 'bg-green-500/10 border-green-500/30 hover:border-green-500 hover:bg-green-500/20'
                              : 'bg-green-50 border-green-200 hover:border-green-400 hover:bg-green-100'}
                          `}
                        >
                          <FileText className="text-green-500 flex-shrink-0" size={28} />
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                              {boat.certification_file_name || 'Certificate'}
                            </p>
                            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              Click to view PDF
                            </p>
                          </div>
                          <ExternalLink
                            className={`flex-shrink-0 ${darkMode ? 'text-slate-400' : 'text-slate-600'} group-hover:text-green-500`}
                            size={18}
                          />
                        </a>
                      </div>
                    )}
                    {(boat.purchase_date || boat.purchase_value) && (
                      <div className={`pt-3 mt-3 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                        <h4 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Purchase Information
                        </h4>
                      </div>
                    )}
                    {boat.purchase_date && (
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Purchased:</span>
                        <span className={darkMode ? 'text-white' : 'text-slate-900'}>
                          {new Date(boat.purchase_date).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {boat.purchase_value && (
                      <div className="flex justify-between">
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Value:</span>
                        <span className={darkMode ? 'text-white' : 'text-slate-900'}>
                          ${boat.purchase_value.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gallery' && (
            <GalleryTab boatId={boat.id} darkMode={darkMode} />
          )}

          {activeTab === 'maintenance' && (
            <MaintenanceTab boatId={boat.id} darkMode={darkMode} onUpdate={fetchStats} />
          )}

          {activeTab === 'rig-tuning' && (
            <RigTuningTab boatId={boat.id} boatType={boat.boat_type} darkMode={darkMode} onUpdate={fetchStats} />
          )}

          {activeTab === 'performance' && (
            <PerformanceTab boatId={boat.id} sailNumber={boat.sail_number} darkMode={darkMode} />
          )}
        </div>
      </div>

      {showEditModal && (
        <EditBoatModal
          boat={boat}
          darkMode={darkMode}
          onClose={() => setShowEditModal(false)}
          onSuccess={async () => {
            setShowEditModal(false);
            // Refresh boat data
            const { data: updatedBoat } = await supabase
              .from('member_boats')
              .select('*')
              .eq('id', boat.id)
              .single();

            if (updatedBoat) {
              setBoat(updatedBoat);
            }
            fetchStats();
          }}
        />
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Camera, Settings, TrendingUp, Wrench, Award, Share2, SquarePen as Edit2, Upload, Image as ImageIcon, Activity, FileText, ExternalLink, ChevronRight, Sailboat } from 'lucide-react';
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
        .neq('is_simulated', true)
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
    { id: 'rig-tuning' as Tab, label: 'Rig tuning', icon: Settings },
    { id: 'performance' as Tab, label: 'Performance', icon: Award }
  ];

  const ord = (n: number | null) => n ? `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}` : '–';
  const MEDAL: Record<number, string> = { 1: '#FFC56B', 2: '#C9D1DE', 3: '#E59A62' };
  const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const specRow = (label: string, value: React.ReactNode) => (
    <div className="a-ir" key={label}>
      <span className="a-ir-l">{label}</span>
      <span className="a-ir-v text-right">{value}</span>
    </div>
  );
  const hasReg = !!(boat.hull_registration_number || boat.registration_date || boat.certification_authority);

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        <div className="flex items-center gap-2 text-[13.5px]">
          <button onClick={onClose} className="a-txt-b inline-flex items-center gap-1 font-medium">
            <ChevronLeft size={16} />Boat Shed
          </button>
        </div>

        <div className="a-card overflow-hidden grid grid-cols-1 md:grid-cols-[420px_1fr]">
          <div className="relative group" style={{ minHeight: 250 }}>
            {boat.image_url ? (
              <img src={boat.image_url} alt={`${boat.boat_type} ${boat.sail_number}`} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="a-bc-ph absolute inset-0 flex items-center justify-center"><Camera size={52} className="a-dim" /></div>
            )}
            {boat.is_primary && <span className="a-glass absolute" style={{ left: 14, top: 14, color: '#FFC56B' }}>★ Primary</span>}
            <label htmlFor="boat-detail-image" className="a-glass absolute cursor-pointer" style={{ left: 14, bottom: 14 }}>
              {uploadingImage ? <><Upload size={14} className="animate-pulse" />Uploading…</> : <><ImageIcon size={14} />Change photo</>}
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
          </div>

          <div className="flex flex-col gap-4" style={{ padding: '22px 24px' }}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="a-cap">{[boat.boat_type, boat.design_name ? `${boat.design_name} design` : null].filter(Boolean).join(' · ')}</p>
                <h1 className="a-display a-ink mt-1 mb-0 text-[32px] font-bold leading-[1.1]">{boat.boat_name || boat.boat_type}</h1>
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <span className="a-lb-cls"><Sailboat size={11} />{boat.boat_type}{boat.sail_number && <span className="a-dim" style={{ fontWeight: 500, letterSpacing: 0 }}>{boat.sail_number}</span>}</span>
                  {boat.hull_registration_number && <span className="a-hullreg">{boat.hull_registration_number}</span>}
                  {boat.hull && <span className="a-lb-fmt">Hull {boat.hull}</span>}
                  {!!boat.handicap && <span className="a-lb-fmt">Handicap {boat.handicap}</span>}
                </div>
              </div>
              <button onClick={() => setShowEditModal(true)} className="a-ib" aria-label="Edit boat" title="Edit boat"><Edit2 size={18} /></button>
              <button className="a-ib" aria-label="Share" title="Share"><Share2 size={18} /></button>
            </div>

            {boat.description && <p className="a-mute m-0 text-[14px] leading-[1.55]">{boat.description}</p>}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="a-mini-stat"><div className="a-dim text-[11.5px]">Total races</div><div className="a-display a-ink a-num text-[24px] font-semibold mt-1.5 leading-none">{stats.totalRaces}</div></div>
              <div className="a-mini-stat"><div className="a-dim text-[11.5px]">Best finish</div><div className={`a-display a-num text-[24px] font-semibold mt-1.5 leading-none ${stats.bestPosition && stats.bestPosition <= 3 ? `a-best-${stats.bestPosition}` : 'a-ink'}`}>{ord(stats.bestPosition)}</div></div>
              <div className="a-mini-stat"><div className="a-dim text-[11.5px]">Due soon</div><div className={`a-display a-num text-[24px] font-semibold mt-1.5 leading-none ${stats.upcomingReminders > 0 ? 'a-txt-r' : 'a-ink'}`}>{stats.upcomingReminders}</div></div>
              <div className="a-mini-stat"><div className="a-dim text-[11.5px]">Rig setups</div><div className="a-display a-num text-[24px] font-semibold mt-1.5 leading-none a-txt-v">{stats.rigs}</div></div>
            </div>
          </div>
        </div>

        <nav className="a-seg a-seg-lg self-start max-w-full overflow-x-auto" role="tablist">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`a-seg-i whitespace-nowrap ${activeTab === tab.id ? 'a-seg-on' : ''}`} role="tab" aria-selected={activeTab === tab.id}>
                <Icon size={17} />
                {tab.label}
                {tab.id === 'maintenance' && stats.upcomingReminders > 0 && <span className="a-cnt" style={{ background: '#FF6B6B', color: '#fff', boxShadow: 'none' }}>{stats.upcomingReminders}</span>}
              </button>
            );
          })}
        </nav>

        <div>
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <div className="a-card overflow-hidden">
                <div style={{ padding: '18px 18px 8px' }}>
                  <div className="flex items-center gap-3">
                    <span className="a-tile a-tile-sm"><Activity size={16} /></span>
                    <h2 className="a-display a-ink flex-1 m-0 text-[18px] font-semibold">Recent activity</h2>
                  </div>
                </div>
                {recentActivity.length === 0 ? (
                  <p className="a-dim text-[13px]" style={{ padding: '6px 18px 18px' }}>No activity yet. Race or log maintenance to see it here.</p>
                ) : (
                  <div style={{ paddingBottom: 6 }}>
                    {recentActivity.slice(0, 5).map((activity, index) => {
                      const clickable = activity.type === 'race' && activity.resultId;
                      const p = activity.position as number | null;
                      return (
                        <div
                          key={`${activity.type}-${activity.resultId}-${index}`}
                          onClick={() => clickable && navigate(`/results/${activity.resultId}`)}
                          className="a-rr"
                          style={{ padding: '12px 16px', cursor: clickable ? 'pointer' : 'default' }}
                        >
                          {activity.type === 'race' ? (
                            p && MEDAL[p]
                              ? <span className="a-med" style={{ width: 32, height: 32, background: MEDAL[p], boxShadow: `0 0 0 3px color-mix(in srgb, ${MEDAL[p]} 25%, transparent)` }}>{p}</span>
                              : <span className="a-med a-med-n" style={{ width: 32, height: 32 }}>{p ?? '–'}</span>
                          ) : (
                            <span className="a-tile a-tile-sm a-txt-a"><Wrench size={15} /></span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="a-ink text-[14.5px] font-semibold truncate">{activity.title}</div>
                            <div className="a-dim text-[12.5px] mt-0.5 truncate">
                              {activity.type === 'race' ? (p != null ? `Finished ${ord(p)}` : `${activity.raceCount} race${activity.raceCount === 1 ? '' : 's'}`) : (activity.description || 'Maintenance')}
                            </div>
                          </div>
                          <span className="a-dim text-[12.5px] whitespace-nowrap">{new Date(activity.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                          {clickable && <ChevronRight size={15} className="a-dim" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="a-card flex flex-col gap-3.5" style={{ padding: '18px 20px' }}>
                <div className="flex items-center gap-3">
                  <span className="a-tile a-tile-sm"><FileText size={16} /></span>
                  <h2 className="a-display a-ink flex-1 m-0 text-[18px] font-semibold">Specifications</h2>
                </div>
                <div className="a-grp">
                  {boat.boat_name && specRow('Boat name', boat.boat_name)}
                  {specRow('Class', <span className="a-lb-cls"><Sailboat size={11} />{boat.boat_type}</span>)}
                  {specRow('Sail number', boat.sail_number || '–')}
                  {boat.hull && specRow('Hull', boat.hull)}
                  {!!boat.handicap && specRow('Handicap', boat.handicap)}
                  {boat.design_name && specRow('Design', boat.design_name)}
                  {boat.designer_name && specRow('Designer', boat.designer_name)}
                </div>
                {hasReg && (
                  <>
                    <p className="a-cap mt-1">Registration</p>
                    <div className="a-grp">
                      {boat.hull_registration_number && specRow('Hull reg.', <span className="a-hullreg" style={{ background: 'none', padding: 0 }}>{boat.hull_registration_number}</span>)}
                      {boat.registration_date && specRow('Registered', fmtDate(boat.registration_date))}
                      {boat.certification_authority && specRow('Authority', boat.certification_authority)}
                    </div>
                  </>
                )}
                {boat.certification_file_url && (
                  <a href={boat.certification_file_url} target="_blank" rel="noopener noreferrer" className="a-grp flex items-center gap-3" style={{ padding: '12px 14px' }}>
                    <span className="a-tile" style={{ width: 40, height: 40 }}><FileText size={18} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="a-ink text-[14px] font-semibold truncate">{boat.certification_file_name || 'Certificate'}</div>
                      <div className="a-dim text-[12px] mt-0.5">Measurement certificate</div>
                    </div>
                    <ExternalLink size={16} className="a-dim" />
                  </a>
                )}
                {(boat.purchase_date || boat.purchase_value) && (
                  <>
                    <p className="a-cap mt-1">Purchase</p>
                    <div className="a-grp">
                      {boat.purchase_date && specRow('Purchased', fmtDate(boat.purchase_date))}
                      {boat.purchase_value && specRow('Value', `$${boat.purchase_value.toFixed(2)}`)}
                    </div>
                  </>
                )}
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

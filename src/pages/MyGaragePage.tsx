import React, { useState, useEffect } from 'react';
import { Wrench, Plus, TrendingUp, Bell, Award, Activity, ChevronRight, Zap, Image as ImageIcon, Anchor, Trophy, SquarePen as Edit2, Trash2, Sailboat } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
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
  const { isImpersonating, session: impersonationSession } = useImpersonation();
  const effectiveUserId = isImpersonating ? impersonationSession?.targetUserId : user?.id;
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
    if (effectiveUserId) {
      fetchGarageData();
    }
  }, [currentClub, currentOrganization, effectiveUserId]);

  const fetchGarageData = async () => {
    try {
      setLoading(true);

      // Get ALL member IDs for this user across all clubs
      // My Garage is a personal feature - should show all boats regardless of current club context
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('id, club_id')
        .eq('user_id', effectiveUserId);

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

      // Fetch performance stats for each boat using skipper+boatId matching
      const stats: Record<string, PerformanceStats> = {};

      const { data: quickRaces } = await supabase
        .from('quick_races')
        .select('race_date, race_results, skippers')
        .not('race_results', 'is', null)
        .not('skippers', 'is', null)
        .neq('is_simulated', true)
        .order('race_date', { ascending: false });

      const { data: seriesRounds } = await supabase
        .from('race_series_rounds')
        .select('date, race_results, skippers')
        .not('race_results', 'is', null)
        .not('skippers', 'is', null)
        .order('date', { ascending: false });

      const findSkipperIndices = (skippers: any[], boatId: string): number[] => {
        if (!skippers || !Array.isArray(skippers)) return [];
        const indices: number[] = [];
        skippers.forEach((skipper: any, idx: number) => {
          if (skipper.boatId === boatId) {
            indices.push(idx);
          }
        });
        return indices;
      };

      const extractPositions = (raceResults: any[], skipperIndices: number[]): number[] => {
        if (!raceResults || !Array.isArray(raceResults) || skipperIndices.length === 0) return [];
        const positions: number[] = [];
        for (const result of raceResults) {
          if (skipperIndices.includes(result.skipperIndex)) {
            const pos = typeof result.position === 'string' ? parseInt(result.position) : result.position;
            if (pos && !isNaN(pos) && pos > 0) positions.push(pos);
          }
        }
        return positions;
      };

      for (const boat of boatsWithImages as Boat[]) {
        const allPositions: number[] = [];

        for (const race of (quickRaces || [])) {
          const indices = findSkipperIndices(race.skippers, boat.id);
          if (indices.length === 0) continue;
          allPositions.push(...extractPositions(race.race_results, indices));
        }

        for (const round of (seriesRounds || [])) {
          const indices = findSkipperIndices(round.skippers, boat.id);
          if (indices.length === 0) continue;
          allPositions.push(...extractPositions(round.race_results, indices));
        }

        stats[boat.id] = {
          total_races: allPositions.length,
          best_position: allPositions.length > 0 ? Math.min(...allPositions) : null,
          avg_position: allPositions.length > 0 ? Math.round(allPositions.reduce((a, b) => a + b, 0) / allPositions.length) : null,
          recent_trend: calculateTrend(allPositions)
        };
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
        <div className="p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="a-dim">Loading your boat shed…</p>
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

  const totalRaces = Object.values(performanceStats).reduce((sum, stat) => sum + stat.total_races, 0);
  const improving = Object.values(performanceStats).filter(st => st.recent_trend === 'improving').length;
  const now = new Date();
  const overdueCount = upcomingReminders.filter(r => new Date(r.due_date) < now).length;
  const ord = (n: number | null) => n ? `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}` : '–';
  const statCard = (icon: React.ReactNode, cap: string, value: React.ReactNode, sub?: string, tone?: string) => (
    <div className="a-card flex items-center gap-3.5" style={{ padding: '16px 18px' }}>
      <span className="a-tile" style={{ width: 44, height: 44 }}>{icon}</span>
      <div>
        <p className="a-cap">{cap}</p>
        <div className={`a-display a-num text-[28px] font-semibold leading-none mt-1.5 ${tone || 'a-ink'}`}>{value}</div>
        {sub && <div className="a-dim text-[12px] mt-1.5">{sub}</div>}
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        <div className="flex items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><Wrench size={24} /></span>
          <div className="flex-1 min-w-0">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">Boat Shed</h1>
            <p className="a-mute mt-1 text-[14.5px]">Your fleet, maintenance and rig setups</p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="a-btn a-btn-p" style={{ height: 42, borderRadius: 13 }}>
            <Plus size={17} />
            <span className="max-sm:hidden">Add boat</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCard(<Anchor size={20} />, 'Boats', boats.length)}
          {statCard(<Bell size={20} />, overdueCount > 0 ? 'Overdue' : 'Due soon', overdueCount > 0 ? overdueCount : upcomingReminders.length, overdueCount > 0 && upcomingReminders.length > overdueCount ? `${upcomingReminders.length} due in total` : undefined, overdueCount > 0 ? 'a-txt-r' : undefined)}
          {statCard(<Trophy size={20} />, 'Total races', totalRaces)}
          {statCard(<TrendingUp size={20} />, 'Improving', improving, improving === 0 ? 'No boat trending up' : `${improving === 1 ? 'boat' : 'boats'} trending up`)}
        </div>

        <div className="flex flex-col xl:flex-row gap-4 items-start">
          <div className="flex-1 min-w-0 w-full">
            {boats.length === 0 ? (
              <div className="a-bc a-bc-add" style={{ minHeight: 280 }} onClick={() => setShowAddModal(true)} role="button" tabIndex={0}>
                <span className="a-tile" style={{ width: 52, height: 52 }}><Plus size={22} /></span>
                <div className="text-[15px] font-semibold">Add your first boat</div>
                <div className="a-dim text-[13px] max-w-xs text-center">Track maintenance, rig setups and performance for every boat you sail.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {boats.map((boat) => {
                  const stats = performanceStats[boat.id];
                  return (
                    <div key={boat.id} className="a-bc group" onClick={() => setSelectedBoat(boat)} role="button" tabIndex={0}>
                      <div className="relative overflow-hidden" style={{ height: 190 }}>
                        {boat.image_url ? (
                          <div className="absolute inset-0 flex items-center justify-center"
                            style={(boat as any).image_position ? { transform: `translate(${(boat as any).image_position.x || 0}px, ${(boat as any).image_position.y || 0}px) scale(${(boat as any).image_position.scale || 1})`, transformOrigin: 'center' } : undefined}>
                            <img src={boat.image_url} alt={`${boat.boat_type} ${boat.sail_number}`} className="max-w-none" style={{ width: 'auto', height: '100%', minWidth: '100%', objectFit: 'cover' }} />
                          </div>
                        ) : (
                          <div className="a-bc-ph absolute inset-0 flex items-center justify-center"><Sailboat size={52} className="a-dim" /></div>
                        )}
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(6,11,22,0.1) 40%, rgba(6,11,22,0.85))' }} />
                        <div className="absolute flex gap-1.5" style={{ left: 12, top: 12 }}>
                          {boat.is_primary && <span className="a-glass" style={{ color: '#FFC56B' }}>★ Primary</span>}
                          {(boat as any).members?.clubs?.name && <span className="a-glass">{(boat as any).members.clubs.name}</span>}
                        </div>
                        <div className="absolute flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ right: 12, top: 12 }}>
                          <button onClick={(e) => { e.stopPropagation(); setBoatForImageUpload(boat); }} className="a-gb" style={{ width: 32, height: 32 }} aria-label="Upload image" title="Upload image"><ImageIcon size={15} /></button>
                          <button onClick={(e) => { e.stopPropagation(); setEditingBoat(boat); }} className="a-gb" style={{ width: 32, height: 32 }} aria-label="Edit boat" title="Edit boat"><Edit2 size={15} /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteBoat(boat.id, `${boat.boat_type} ${boat.sail_number}`); }} className="a-gb a-gb-d" style={{ width: 32, height: 32 }} aria-label="Delete boat" title="Delete boat"><Trash2 size={15} /></button>
                        </div>
                        <div className="absolute" style={{ left: 16, bottom: 14, right: 16 }}>
                          <div className="a-display text-[22px] font-bold" style={{ color: '#fff' }}>{boat.boat_name || boat.boat_type}</div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="a-glass" style={{ height: 24, fontSize: 11 }}><Sailboat size={12} />{boat.boat_type}{boat.sail_number ? ` · ${boat.sail_number}` : ''}</span>
                            {boat.hull && <span className="a-glass" style={{ height: 24, fontSize: 11 }}>{boat.hull}</span>}
                            {boat.hull_registration_number && <span style={{ font: '600 12px ui-monospace, Menlo, monospace', color: '#8FD3FF' }}>{boat.hull_registration_number}</span>}
                          </div>
                        </div>
                      </div>

                      {stats && stats.total_races > 0 ? (
                        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', padding: '14px 16px' }}>
                          <div><div className="a-dim text-[11.5px]">Races</div><div className="a-display a-ink a-num text-[20px] font-semibold mt-1">{stats.total_races}</div></div>
                          <div><div className="a-dim text-[11.5px]">Best</div><div className="a-display a-ink a-num text-[20px] font-semibold mt-1">{ord(stats.best_position)}</div></div>
                          <div><div className="a-dim text-[11.5px]">Avg</div><div className="a-display a-ink a-num text-[20px] font-semibold mt-1">{stats.avg_position || '–'}</div></div>
                          <div>
                            <div className="a-dim text-[11.5px]">Trend</div>
                            <div className={`flex items-center gap-1 mt-1.5 text-[13px] font-semibold ${stats.recent_trend === 'improving' ? 'a-txt-g' : stats.recent_trend === 'declining' ? 'a-txt-r' : 'a-dim'}`}>
                              {stats.recent_trend === 'improving' && <TrendingUp size={16} />}
                              {stats.recent_trend === 'declining' && <Activity size={16} className="rotate-180" />}
                              {stats.recent_trend === 'stable' && <Activity size={16} />}
                              {stats.recent_trend ? stats.recent_trend.charAt(0).toUpperCase() + stats.recent_trend.slice(1) : '–'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="a-dim flex items-center gap-2 text-[13px]" style={{ padding: '22px 16px' }}><Trophy size={15} />No races yet</div>
                      )}
                      <div className="a-ink flex items-center justify-between border-t a-bd text-[13.5px] font-semibold" style={{ padding: '12px 16px' }}>
                        Open<ChevronRight size={16} className="a-dim" />
                      </div>
                    </div>
                  );
                })}
                <div className="a-bc a-bc-add" style={{ minHeight: 300 }} onClick={() => setShowAddModal(true)} role="button" tabIndex={0}>
                  <span className="a-tile" style={{ width: 52, height: 52 }}><Plus size={22} /></span>
                  <div className="text-[15px] font-semibold">Add a boat</div>
                </div>
              </div>
            )}
          </div>

          <aside className="w-full xl:w-[380px] flex-shrink-0 flex flex-col gap-4">
            <div className="a-card overflow-hidden">
              <div style={{ padding: '18px 18px 10px' }}>
                <div className="flex items-center gap-3">
                  <span className="a-tile a-tile-sm"><Wrench size={16} /></span>
                  <div className="flex-1 min-w-0">
                    <h2 className="a-display a-ink m-0 text-[18px] font-semibold">Maintenance</h2>
                    <p className="a-dim mt-0.5 text-[12.5px]">{overdueCount > 0 ? `${overdueCount} overdue` : upcomingReminders.length > 0 ? `${upcomingReminders.length} due soon` : 'All caught up'}</p>
                  </div>
                </div>
              </div>
              {upcomingReminders.length === 0 ? (
                <p className="a-dim text-[13px]" style={{ padding: '4px 18px 18px' }}>No upcoming maintenance</p>
              ) : (
                <div style={{ paddingBottom: 6 }}>
                  {upcomingReminders.map((reminder) => {
                    const due = new Date(reminder.due_date);
                    const late = due < now;
                    const days = Math.abs(Math.round((due.getTime() - now.getTime()) / 86400000));
                    return (
                      <div key={reminder.id} className="a-rr" style={{ padding: '11px 14px', cursor: 'default' }}>
                        <span className={`a-light ${late ? 'a-light-r' : 'a-light-a'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="a-ink text-[14px] font-semibold truncate">{reminder.title}</div>
                          <div className="a-dim text-[12px] mt-0.5 truncate">{getBoatName(reminder.boat_id)} · due {due.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</div>
                        </div>
                        <span className={`a-lb-fmt ${late ? 'a-lb-late' : 'a-lb-soon'}`} style={{ height: 22, fontSize: 11 }}>{late ? `${days}d late` : days === 0 ? 'Today' : `in ${days}d`}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="a-card a-spec-card flex gap-3.5" style={{ padding: 18 }}>
              <span className="a-tile" style={{ width: 40, height: 40 }}><Zap size={18} /></span>
              <div>
                <div className="a-ink text-[14.5px] font-semibold">Tip from Alfie</div>
                <div className="a-mute text-[13px] mt-1 leading-[1.5]">Log your rig settings after each race to track what works best in different conditions.</div>
              </div>
            </div>
          </aside>
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

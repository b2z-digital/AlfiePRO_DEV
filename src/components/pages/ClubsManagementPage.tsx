import React, { useState, useEffect, useRef } from 'react';
import { Building, Plus, Users, CircleCheck as CheckCircle, Grid2x2 as Grid, List, Eye, UserPlus, DollarSign, CircleAlert as AlertCircle, MapPin as MapPinIcon, Pencil, Trash2, EllipsisVertical, Anchor, Calendar, Trophy, TrendingUp, Clock, Circle as XCircle, Check, X, Shield, Search } from 'lucide-react';
import { InlineLoading, KpiCard, OrgLogo, PageHead } from '../association/AssocUI';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { ClubOnboardingWizard } from './ClubOnboardingWizard';
import { ManageClubAdminsModal } from './ManageClubAdminsModal';
import { useNavigate } from 'react-router-dom';
import { loadGoogleMaps } from '../../utils/googleMaps';

import { useNotification } from '../../contexts/NotificationContext';

interface SailingDay {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  boat_class_name?: string;
  frequency?: string;
}

interface Club {
  id: string;
  name: string;
  abbreviation: string;
  logo: string | null;
  club_introduction: string | null;
  created_at: string;
  member_count?: number;
  pending_applications?: number;
  pending_payments?: number;
  boat_classes?: string[];
  sailing_days?: SailingDay[];
  upcoming_events?: number;
  recent_results?: number;
  default_venue?: {
    latitude: number;
    longitude: number;
    name: string;
    address: string;
  } | null;
}

interface PendingClub {
  id: string;
  name: string;
  abbreviation: string;
  location: string | null;
  email: string | null;
  phone: string | null;
  club_introduction: string | null;
  approval_status: string;
  registered_by_user_id: string;
  created_at: string;
  registrant_email?: string;
}

interface ClubsManagementPageProps {
  darkMode: boolean;
}

export const ClubsManagementPage: React.FC<ClubsManagementPageProps> = ({ darkMode }) => {
  const { currentOrganization, user } = useAuth();
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddClubModal, setShowAddClubModal] = useState(false);
  const [stateAssociationId, setStateAssociationId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('grid');
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clubToDelete, setClubToDelete] = useState<Club | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingClubs, setPendingClubs] = useState<PendingClub[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [manageAdminsClub, setManageAdminsClub] = useState<{ id: string; name: string } | null>(null);
  const { addNotification } = useNotification();

  useEffect(() => {
    loadStateAssociation();
  }, [user, currentOrganization]);

  useEffect(() => {
    if (stateAssociationId) {
      loadClubs();
      loadPendingClubs();
    }
  }, [stateAssociationId]);

  const loadStateAssociation = async () => {
    console.log('ClubsManagementPage: loadStateAssociation called', { user, currentOrganization });

    // Prioritize currentOrganization if it's a state association
    if (currentOrganization?.type === 'state') {
      console.log('ClubsManagementPage: Using currentOrganization ID:', currentOrganization.id);
      setStateAssociationId(currentOrganization.id);
      return;
    }

    if (!user) {
      console.log('ClubsManagementPage: No user found and no currentOrganization');
      return;
    }

    console.log('ClubsManagementPage: Querying user_state_associations for user:', user.id);

    try {
      // Get user's state association
      const { data: userStateAssoc, error } = await supabase
        .from('user_state_associations')
        .select('state_association_id')
        .eq('user_id', user.id)
        .maybeSingle();

      console.log('ClubsManagementPage: User state association query result:', { userStateAssoc, error });

      if (error) throw error;

      if (userStateAssoc) {
        console.log('ClubsManagementPage: Setting state association ID from user_state_associations:', userStateAssoc.state_association_id);
        setStateAssociationId(userStateAssoc.state_association_id);
      } else {
        console.log('ClubsManagementPage: No user state association found');
      }
    } catch (error) {
      console.error('ClubsManagementPage: Error loading state association:', error);
    }
  };

  const loadClubs = async () => {
    if (!stateAssociationId) {
      console.log('ClubsManagementPage: No state association ID, cannot load clubs');
      return;
    }

    console.log('ClubsManagementPage: Loading clubs for state association:', stateAssociationId);

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('clubs')
        .select(`
          id,
          name,
          abbreviation,
          logo,
          club_introduction,
          created_at,
          venues!club_id(
            latitude,
            longitude,
            name,
            address,
            is_default
          )
        `)
        .eq('state_association_id', stateAssociationId)
        .neq('approval_status', 'pending_approval')
        .neq('approval_status', 'rejected')
        .neq('is_test', true)
        .order('name', { ascending: true });

      console.log('ClubsManagementPage: Clubs query result:', { data, error, count: data?.length });

      if (error) throw error;

      // Load member counts, pending applications, and pending payments for each club
      const clubsWithStats = await Promise.all(
        (data || []).map(async (club) => {
          // First get race series IDs for this club
          const { data: raceSeries, error: seriesError } = await supabase
            .from('race_series')
            .select('id')
            .eq('club_id', club.id);

          if (seriesError) {
            console.error(`[${club.name}] Error fetching race series:`, seriesError);
          }

          const seriesIds = (raceSeries || []).map(s => s.id);
          console.log(`[${club.name}] Found ${seriesIds.length} race series with IDs:`, seriesIds);

          const [
            memberCountResult,
            applicationsResult,
            paymentsResult,
            boatClassesResult,
            sailingDaysResult,
            upcomingSingleEventsResult,
            upcomingSeriesRoundsResult,
            recentSingleResultsResult,
            recentSeriesResultsResult
          ] = await Promise.all([
            // Member count
            supabase
              .from('members')
              .select('*', { count: 'exact', head: true })
              .eq('club_id', club.id)
              .eq('membership_status', 'active'),

            // Pending applications (exclude drafts)
            supabase
              .from('membership_applications')
              .select('*', { count: 'exact', head: true })
              .eq('club_id', club.id)
              .eq('status', 'pending')
              .eq('is_draft', false),

            // Pending payments to state (state fee only, state will forward national fee)
            supabase
              .from('membership_remittances')
              .select('state_contribution_amount')
              .eq('club_id', club.id)
              .neq('club_to_state_status', 'paid')
              .eq('membership_year', new Date().getFullYear()),

            // Boat classes assigned to this club
            supabase
              .from('club_boat_classes')
              .select(`
                boat_class_id,
                boat_classes(name)
              `)
              .eq('club_id', club.id),

            // Sailing days for this club
            supabase
              .from('club_sailing_days')
              .select(`
                id,
                day_of_week,
                start_time,
                end_time,
                boat_class_id,
                frequency,
                boat_classes(name)
              `)
              .eq('club_id', club.id)
              .eq('is_active', true)
              .order('day_of_week'),

            // Upcoming single events (future events from quick_races)
            supabase
              .from('quick_races')
              .select('*', { count: 'exact', head: true })
              .eq('club_id', club.id)
              .eq('archived', false)
              .neq('is_simulated', true)
              .gte('race_date', new Date().toISOString().split('T')[0]),

            // Upcoming series rounds (future rounds from race_series_rounds)
            seriesIds.length > 0
              ? supabase
                  .from('race_series_rounds')
                  .select('*', { count: 'exact', head: true })
                  .in('series_id', seriesIds)
                  .gte('date', new Date().toISOString().split('T')[0])
              : Promise.resolve({ count: 0, error: null }),

            // Recent single event results (completed races in last 3 months from quick_races)
            supabase
              .from('quick_races')
              .select('*', { count: 'exact', head: true })
              .eq('club_id', club.id)
              .eq('completed', true)
              .eq('archived', false)
              .neq('is_simulated', true)
              .gte('race_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),

            // Recent series results (completed rounds in last 3 months from race_series_rounds)
            seriesIds.length > 0
              ? supabase
                  .from('race_series_rounds')
                  .select('*', { count: 'exact', head: true })
                  .in('series_id', seriesIds)
                  .eq('completed', true)
                  .gte('date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
              : Promise.resolve({ count: 0, error: null })
          ]);

          const pendingPaymentAmount = paymentsResult.data?.reduce((sum, payment) =>
            sum + (Number(payment.state_contribution_amount) || 0), 0) || 0;

          const uniqueBoatClasses = (boatClassesResult.data || [])
            .map((b: any) => b.boat_classes?.name)
            .filter(Boolean);

          const sailingDays = (sailingDaysResult.data || []).map((sd: any) => ({
            id: sd.id,
            day_of_week: sd.day_of_week,
            start_time: sd.start_time,
            end_time: sd.end_time,
            boat_class_name: sd.boat_classes?.name || null,
            frequency: sd.frequency || 'every_week'
          }));

          // Log all query results for debugging
          console.log(`[${club.name}] Query results:`, {
            upcomingSingleEvents: upcomingSingleEventsResult.count,
            upcomingSingleEventsError: upcomingSingleEventsResult.error,
            upcomingSeriesRounds: upcomingSeriesRoundsResult.count,
            upcomingSeriesRoundsError: upcomingSeriesRoundsResult.error,
            recentSingleResults: recentSingleResultsResult.count,
            recentSingleResultsError: recentSingleResultsResult.error,
            recentSeriesResults: recentSeriesResultsResult.count,
            recentSeriesResultsError: recentSeriesResultsResult.error
          });

          // Calculate total upcoming events (single events + series rounds)
          const totalUpcomingEvents = (upcomingSingleEventsResult.count || 0) + (upcomingSeriesRoundsResult.count || 0);

          // Calculate total recent results (single events + series rounds)
          const totalRecentResults = (recentSingleResultsResult.count || 0) + (recentSeriesResultsResult.count || 0);

          console.log(`[${club.name}] Calculated totals:`, {
            totalUpcomingEvents,
            totalRecentResults
          });

          // Find default venue
          const venues = (club as any).venues || [];
          const defaultVenue = venues.find((v: any) => v.is_default) || venues[0] || null;

          return {
            ...club,
            member_count: memberCountResult.count || 0,
            pending_applications: applicationsResult.count || 0,
            pending_payments: pendingPaymentAmount,
            boat_classes: uniqueBoatClasses,
            sailing_days: sailingDays,
            upcoming_events: totalUpcomingEvents,
            recent_results: totalRecentResults,
            default_venue: defaultVenue ? {
              latitude: defaultVenue.latitude,
              longitude: defaultVenue.longitude,
              name: defaultVenue.name,
              address: defaultVenue.address
            } : null
          };
        })
      );

      setClubs(clubsWithStats);
    } catch (error) {
      console.error('Error loading clubs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingClubs = async () => {
    if (!stateAssociationId) return;

    try {
      setPendingLoading(true);

      const { data, error } = await supabase
        .from('clubs')
        .select('id, name, abbreviation, location, email, phone, club_introduction, approval_status, registered_by_user_id, created_at')
        .eq('state_association_id', stateAssociationId)
        .eq('approval_status', 'pending_approval')
        .neq('is_test', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const pendingWithEmails = await Promise.all(
        (data || []).map(async (club) => {
          let registrantEmail = '';
          if (club.registered_by_user_id) {
            const { data: emailData } = await supabase.rpc('get_user_id_by_email', {}).catch(() => ({ data: null }));
            const { data: profileData } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', club.registered_by_user_id)
              .maybeSingle();
            registrantEmail = profileData?.full_name || club.email || '';
          }
          return { ...club, registrant_email: registrantEmail || club.email || '' };
        })
      );

      setPendingClubs(pendingWithEmails);
    } catch (error) {
      console.error('Error loading pending clubs:', error);
    } finally {
      setPendingLoading(false);
    }
  };

  const handleApproveClub = async (clubId: string) => {
    try {
      const { error } = await supabase
        .from('clubs')
        .update({ approval_status: 'active' })
        .eq('id', clubId);

      if (error) throw error;

      const club = pendingClubs.find(c => c.id === clubId);

      if (club?.registered_by_user_id) {
        await supabase
          .from('user_clubs')
          .upsert({
            user_id: club.registered_by_user_id,
            club_id: clubId,
            role: 'admin',
          }, { onConflict: 'user_id,club_id' });
      }

      addNotification('success', `${club?.name || 'Club'} has been approved`);
      loadPendingClubs();
      loadClubs();
    } catch (error) {
      console.error('Error approving club:', error);
      addNotification('error', 'Failed to approve club');
    }
  };

  const handleRejectClub = async (clubId: string) => {
    try {
      const { error } = await supabase
        .from('clubs')
        .update({ approval_status: 'rejected' })
        .eq('id', clubId);

      if (error) throw error;

      const club = pendingClubs.find(c => c.id === clubId);
      addNotification('success', `${club?.name || 'Club'} registration has been rejected`);
      loadPendingClubs();
    } catch (error) {
      console.error('Error rejecting club:', error);
      addNotification('error', 'Failed to reject club');
    }
  };

  // Initialize map when switching to map view
  useEffect(() => {
    if (viewMode === 'map' && !mapLoaded) {
      loadGoogleMaps(() => {
        setMapLoaded(true);
      });
    }
  }, [viewMode]);

  // Initialize map and markers
  useEffect(() => {
    if (viewMode === 'map' && mapLoaded && mapRef.current && !googleMapRef.current) {
      initializeMap();
    } else if (viewMode === 'map' && googleMapRef.current) {
      updateMarkers();
    }
  }, [viewMode, mapLoaded, clubs]);

  const initializeMap = () => {
    if (!mapRef.current) return;

    // Calculate bounds for all clubs with venues
    const clubsWithLocations = filteredClubs.filter(club => club.default_venue);

    const bounds = new google.maps.LatLngBounds();
    clubsWithLocations.forEach(club => {
      if (club.default_venue) {
        bounds.extend(new google.maps.LatLng(
          club.default_venue.latitude,
          club.default_venue.longitude
        ));
      }
    });

    // Default center (NSW, Australia) if no clubs have venues
    const center = clubsWithLocations.length > 0
      ? bounds.getCenter()
      : new google.maps.LatLng(-32.5, 147.0);

    // Light map style similar to club homepage - makes colored pins stand out
    const lightMapStyles = [
      {
        featureType: 'water',
        elementType: 'geometry',
        stylers: [{ color: '#c9e6ff' }]
      },
      {
        featureType: 'landscape',
        elementType: 'geometry',
        stylers: [{ color: '#f5f5f5' }]
      },
      {
        featureType: 'road',
        elementType: 'geometry',
        stylers: [{ color: '#ffffff' }]
      },
      {
        featureType: 'poi',
        elementType: 'geometry',
        stylers: [{ color: '#eeeeee' }]
      },
      {
        featureType: 'poi.park',
        elementType: 'geometry',
        stylers: [{ color: '#e5f5e0' }]
      },
      {
        featureType: 'administrative',
        elementType: 'geometry.stroke',
        stylers: [{ color: '#c9c9c9' }, { weight: 1 }]
      },
      {
        featureType: 'administrative',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#7c7c7c' }]
      },
      {
        featureType: 'road',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#9e9e9e' }]
      }
    ];

    googleMapRef.current = new google.maps.Map(mapRef.current, {
      center,
      zoom: 7,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      styles: lightMapStyles,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_RIGHT
      },
      fullscreenControl: true,
      streetViewControl: false,
      zoomControl: true,
    });

    // If we have clubs, fit bounds but restrict max zoom to state level
    if (clubsWithLocations.length > 0) {
      googleMapRef.current.fitBounds(bounds);

      // Add listener to restrict zoom after fitBounds
      const boundsListener = google.maps.event.addListenerOnce(googleMapRef.current, 'bounds_changed', () => {
        const currentZoom = googleMapRef.current?.getZoom();
        if (currentZoom && currentZoom > 9) {
          googleMapRef.current?.setZoom(9);
        }
      });
    }

    infoWindowRef.current = new google.maps.InfoWindow();

    updateMarkers();
  };

  const updateMarkers = () => {
    if (!googleMapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Add markers for clubs with venues
    filteredClubs.forEach(club => {
      if (!club.default_venue || !googleMapRef.current) return;

      const marker = new google.maps.Marker({
        position: {
          lat: club.default_venue.latitude,
          lng: club.default_venue.longitude
        },
        map: googleMapRef.current,
        title: club.name,
        icon: {
          path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
          fillColor: '#10b981',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 1.8,
          anchor: new google.maps.Point(12, 22),
          labelOrigin: new google.maps.Point(12, 9)
        }
      });

      marker.addListener('click', () => {
        if (!infoWindowRef.current) return;

        const contentString = `
          <div style="padding: 12px; max-width: 300px; font-family: system-ui, -apple-system, sans-serif;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              ${club.logo
                ? `<img src="${club.logo}" style="width: 48px; height: 48px; border-radius: 8px; object-fit: cover;" />`
                : `<div style="width: 48px; height: 48px; border-radius: 8px; background: #1e293b; display: flex; align-items: center; justify-content: center;">
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
                       <rect x="3" y="3" width="7" height="7"></rect>
                       <rect x="14" y="3" width="7" height="7"></rect>
                       <rect x="14" y="14" width="7" height="7"></rect>
                       <rect x="3" y="14" width="7" height="7"></rect>
                     </svg>
                   </div>`
              }
              <div>
                <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #0f172a;">${club.name}</h3>
                ${club.abbreviation ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">${club.abbreviation}</p>` : ''}
              </div>
            </div>
            ${club.club_introduction
              ? `<p style="margin: 0 0 12px 0; font-size: 14px; color: #475569; line-height: 1.5;">${club.club_introduction.substring(0, 100).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c] || c))}${club.club_introduction.length > 100 ? '...' : ''}</p>`
              : ''
            }
            ${club.boat_classes && club.boat_classes.length > 0
              ? `<div style="margin-bottom: 12px;">
                   <div style="font-size: 11px; color: #64748b; margin-bottom: 6px; font-weight: 500;">BOAT CLASSES</div>
                   <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                     ${club.boat_classes.slice(0, 4).map(bc =>
                       `<span style="padding: 3px 8px; background: #e0f2fe; color: #0369a1; border-radius: 12px; font-size: 11px; font-weight: 500;">${bc}</span>`
                     ).join('')}
                     ${club.boat_classes.length > 4 ? `<span style="padding: 3px 8px; background: #f1f5f9; color: #64748b; border-radius: 12px; font-size: 11px;">+${club.boat_classes.length - 4}</span>` : ''}
                   </div>
                 </div>`
              : ''
            }
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px;">
              <div style="padding: 8px; background: #eff6ff; border-radius: 6px; text-align: center;">
                <div style="font-size: 16px; font-weight: 700; color: #1e40af; margin-bottom: 2px;">${club.upcoming_events || 0}</div>
                <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600;">Events</div>
              </div>
              <div style="padding: 8px; background: #fef3c7; border-radius: 6px; text-align: center;">
                <div style="font-size: 16px; font-weight: 700; color: #d97706; margin-bottom: 2px;">${club.recent_results || 0}</div>
                <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600;">Results</div>
              </div>
              <div style="padding: 8px; background: #d1fae5; border-radius: 6px; text-align: center;">
                <div style="font-size: 16px; font-weight: 700; color: #059669; margin-bottom: 2px;">${club.member_count || 0}</div>
                <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600;">Members</div>
              </div>
            </div>
            ${(club.pending_applications || 0) > 0 || (club.pending_payments || 0) > 0
              ? `<div style="margin-bottom: 12px;">
                   ${(club.pending_applications || 0) > 0
                     ? `<div style="padding: 6px 8px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                          <span style="font-size: 12px; color: #92400e;">Pending Applications</span>
                          <strong style="font-size: 13px; color: #78350f;">${club.pending_applications}</strong>
                        </div>`
                     : ''
                   }
                   ${(club.pending_payments || 0) > 0
                     ? `<div style="padding: 6px 8px; background: #fee2e2; border: 1px solid #f87171; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                          <span style="font-size: 12px; color: #991b1b;">Pending Payments</span>
                          <strong style="font-size: 13px; color: #7f1d1d;">$${(club.pending_payments || 0).toFixed(2)}</strong>
                        </div>`
                     : ''
                   }
                 </div>`
              : ''
            }
            <div style="padding: 8px; background: #f1f5f9; border-radius: 6px; margin-bottom: 12px;">
              <div style="font-size: 11px; color: #64748b; margin-bottom: 4px; font-weight: 600; text-transform: uppercase;">Venue Location</div>
              <div style="font-size: 13px; color: #0f172a; font-weight: 500;">${club.default_venue.name}</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${club.default_venue.address}</div>
            </div>
            <button
              onclick="window.handleViewClubFromMap('${club.id}')"
              style="width: 100%; padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s;"
              onmouseover="this.style.background='#059669'"
              onmouseout="this.style.background='#10b981'"
            >
              View Members
            </button>
          </div>
        `;

        infoWindowRef.current.setContent(contentString);
        infoWindowRef.current.open(googleMapRef.current, marker);
      });

      markersRef.current.push(marker);
    });
  };

  const handleViewClub = (clubId: string) => {
    navigate('/association-members', { state: { viewClubId: clubId } });
  };

  const handleEditClub = (clubId: string) => {
    setSelectedClubId(clubId);
    setShowEditModal(true);
    setOpenMenuId(null);
  };

  const handleDeleteClub = (club: Club) => {
    setClubToDelete(club);
    setShowDeleteConfirm(true);
    setOpenMenuId(null);
  };

  const confirmDeleteClub = async () => {
    if (!clubToDelete) return;

    try {
      const { error } = await supabase
        .from('clubs')
        .delete()
        .eq('id', clubToDelete.id);

      if (error) throw error;

      addNotification('success', `${clubToDelete.name} has been deleted`);
      loadClubs();
      setShowDeleteConfirm(false);
      setClubToDelete(null);
    } catch (error) {
      console.error('Error deleting club:', error);
      addNotification('error', 'Failed to delete club');
    }
  };

  // Set up window handler for map info window buttons
  useEffect(() => {
    (window as any).handleViewClubFromMap = handleViewClub;
    return () => {
      delete (window as any).handleViewClubFromMap;
    };
  }, []);

  const filteredClubs = clubs.filter(club =>
    club.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    club.abbreviation?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="a-apage">
          <PageHead icon={<Building size={24} />} title="Member clubs" sub="Loading clubs…" />
          <InlineLoading label="Loading clubs…" />
        </div>
      </div>
    );
  }

  const totalMembers = clubs.reduce((sum, c) => sum + (c.member_count || 0), 0);

  const clubMenu = (club: Club) => (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpenMenuId(openMenuId === club.id ? null : club.id)}
        className="a-ib"
        aria-label={`More for ${club.name}`}
        aria-haspopup="menu"
        aria-expanded={openMenuId === club.id}
      >
        <EllipsisVertical size={18} />
      </button>
      {openMenuId === club.id && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
          <div className="a-pop absolute right-0 top-full mt-1 w-52 z-20 p-1.5 flex flex-col gap-0.5" role="menu">
            <button
              type="button"
              role="menuitem"
              className="a-pop-item"
              onClick={() => {
                setManageAdminsClub({ id: club.id, name: club.name });
                setOpenMenuId(null);
              }}
            >
              <Shield size={15} className="a-txt-a" />
              Manage access
            </button>
            <button type="button" role="menuitem" className="a-pop-item" onClick={() => handleEditClub(club.id)}>
              <Pencil size={15} />
              Edit club
            </button>
            <div className="a-pop-rule" />
            <button type="button" role="menuitem" className="a-pop-item a-pop-danger" onClick={() => handleDeleteClub(club)}>
              <Trash2 size={15} />
              Delete club
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="a-apage">
        <PageHead
          icon={<Building size={24} />}
          title="Member clubs"
          sub={`${clubs.length} club${clubs.length === 1 ? '' : 's'} in ${currentOrganization?.name || 'your state association'}`}
        >
          <label className="a-field" style={{ width: 260 }}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search clubs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search clubs"
            />
          </label>
          <div className="a-seg a-seg-ic" role="radiogroup" aria-label="View">
            {([
              ['grid', <Grid size={16} key="g" />, 'Cards'],
              ['list', <List size={16} key="l" />, 'List'],
              ['map', <MapPinIcon size={16} key="m" />, 'Map'],
            ] as const).map(([mode, icon, label]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={viewMode === mode}
                aria-label={label}
                title={`${label} view`}
                onClick={() => setViewMode(mode)}
                className={`a-seg-i ${viewMode === mode ? 'a-seg-on' : ''}`}
              >
                {icon}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setShowAddClubModal(true)} className="a-btn a-btn-p">
            <Plus size={18} />
            Add club
          </button>
        </PageHead>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <KpiCard cap="Clubs" value={clubs.length} sub="Member clubs in the association" icon={<Building size={18} />} />
          <KpiCard
            cap="Waiting for approval"
            value={pendingClubs.length}
            sub={pendingClubs.length ? 'New club registrations to review' : 'No registrations waiting'}
            icon={<Clock size={18} />}
            tone={pendingClubs.length ? 'amber' : undefined}
          />
          <KpiCard cap="Members" value={totalMembers} sub="Across all member clubs" icon={<Users size={18} />} />
        </div>

        {/* Pending Club Approvals */}
        {pendingClubs.length > 0 && (
          <section className="a-grp" aria-label="Pending club registrations">
            <div className="a-lnk a-grp-head">
              <span className="a-tile a-tile-sm a-txt-a"><Clock size={16} /></span>
              <span className="flex-1 min-w-0">
                <span className="block a-ink text-[15px] font-semibold">Pending club registrations</span>
                <span className="block a-dim text-xs mt-0.5">{pendingClubs.length} club{pendingClubs.length !== 1 ? 's' : ''} waiting for your approval</span>
              </span>
              <span className="a-cnt a-cnt-amber">{pendingClubs.length}</span>
            </div>
            {pendingClubs.map((club) => (
              <div key={club.id} className="a-lnk items-start flex-wrap">
                <OrgLogo name={club.name} small />
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="a-ink text-[14.5px] font-semibold">{club.name}</span>
                    {club.abbreviation && <span className="a-lb-fmt">{club.abbreviation}</span>}
                  </div>
                  {club.club_introduction && (
                    <p className="a-mute text-[13px] line-clamp-2 mt-1">{club.club_introduction}</p>
                  )}
                  <div className="a-meta-row mt-1.5">
                    {club.location && <span><MapPinIcon size={12} />{club.location}</span>}
                    {club.registrant_email && <span>Registered by {club.registrant_email}</span>}
                    <span>{new Date(club.created_at).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => handleRejectClub(club.id)} className="a-btn a-btn-d a-btn-sm">
                    <X size={14} />
                    Reject
                  </button>
                  <button type="button" onClick={() => handleApproveClub(club.id)} className="a-btn a-btn-p a-btn-sm">
                    <Check size={14} />
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Clubs Display */}
        {filteredClubs.length === 0 ? (
          <div className="a-card a-empty py-16 px-6">
            <span className="a-tile" style={{ width: 56, height: 56 }}><Building size={24} /></span>
            <div className="a-display a-ink text-lg font-semibold">{searchQuery ? 'No clubs found' : 'No clubs yet'}</div>
            <p className="a-mute m-0 text-sm">{searchQuery ? 'Try a different search.' : 'Add your first member club to get started.'}</p>
          </div>
        ) : viewMode === 'map' ? (
          <div className="a-card relative w-full overflow-hidden" style={{ height: 'calc(100vh - 420px)', minHeight: 500 }}>
            <div ref={mapRef} className="w-full h-full" />
            {!mapLoaded && (
              <div className="absolute inset-0"><InlineLoading label="Loading map…" /></div>
            )}
            {mapLoaded && filteredClubs.filter(c => c.default_venue).length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(6,11,22,0.72)' }}>
                <div className="a-empty px-6">
                  <span className="a-tile" style={{ width: 56, height: 56 }}><MapPinIcon size={24} /></span>
                  <div className="a-display a-ink text-lg font-semibold">No club locations yet</div>
                  <p className="a-mute m-0 text-sm">Clubs appear on the map once they set a default venue.</p>
                </div>
              </div>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredClubs.map((club) => (
              <article key={club.id} className="a-card a-clubcard">
                {/* Header with Logo */}
                <div className="flex items-start gap-3">
                  <OrgLogo src={club.logo} name={club.name} />
                  <div className="flex-1 min-w-0">
                    <h3 className="a-ink text-[16px] font-semibold leading-snug truncate" title={club.name}>{club.name}</h3>
                    {club.abbreviation && <p className="a-dim text-[13px] mt-0.5">{club.abbreviation}</p>}
                  </div>
                  {clubMenu(club)}
                </div>

                {/* Sailing days */}
                <div className="a-clubcard-sec">
                  <p className="a-cap flex items-center gap-1.5"><Calendar size={12} />Regular sailing</p>
                  {club.sailing_days && club.sailing_days.length > 0 ? (
                    <>
                      {club.sailing_days.slice(0, 3).map((day) => (
                        <div key={day.id} className="a-sail">
                          <span className="a-sail-day">{day.day_of_week}</span>
                          {day.frequency && day.frequency !== 'every_week' && (
                            <span className="a-wk">{day.frequency === 'week_a' ? 'Wk A' : 'Wk B'}</span>
                          )}
                          <span className="a-dim a-num">{day.start_time.substring(0, 5)} – {day.end_time.substring(0, 5)}</span>
                          {day.boat_class_name && <span className="a-lb-fmt" style={{ height: 22, fontSize: 11.5 }}>{day.boat_class_name}</span>}
                        </div>
                      ))}
                      {club.sailing_days.length > 3 && <span className="a-dim text-xs">+{club.sailing_days.length - 3} more</span>}
                    </>
                  ) : (
                    <span className="a-dim text-[13px]">No sailing days set</span>
                  )}
                </div>

                {/* Boat classes */}
                <div className="a-clubcard-sec">
                  <p className="a-cap flex items-center gap-1.5"><Anchor size={12} />Classes sailed</p>
                  {club.boat_classes && club.boat_classes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {club.boat_classes.slice(0, 4).map((boatClass, index) => (
                        <span key={index} className="a-lb-cls" title={boatClass}>{boatClass}</span>
                      ))}
                      {club.boat_classes.length > 4 && <span className="a-lb-fmt">+{club.boat_classes.length - 4}</span>}
                    </div>
                  ) : (
                    <span className="a-dim text-[13px]">No classes recorded</span>
                  )}
                </div>

                {/* Bottom section */}
                <div className="mt-auto flex flex-col gap-3">
                  <div className="a-wells">
                    {([
                      [<Calendar size={15} key="e" />, club.upcoming_events || 0, 'Events'],
                      [<Trophy size={15} key="r" />, club.recent_results || 0, 'Results'],
                      [<Users size={15} key="m" />, club.member_count || 0, 'Members'],
                    ] as const).map(([icon, n, label]) => (
                      <div key={label} className="a-well">
                        {icon}
                        <span className={`a-well-n ${n ? '' : 'is-zero'}`}>{n}</span>
                        <span className="a-well-l">{label}</span>
                      </div>
                    ))}
                  </div>

                  {(club.pending_payments || 0) > 0 && (
                    <div className="a-due">
                      <DollarSign size={15} />
                      Payments due to the association
                      <b>${(club.pending_payments || 0).toFixed(2)}</b>
                    </div>
                  )}

                  <button type="button" onClick={() => handleViewClub(club.id)} className="a-btn w-full justify-center">
                    <Eye size={16} />
                    View members
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="a-card overflow-visible">
            {filteredClubs.map((club) => (
              <div key={club.id} className="a-clubrow">
                <OrgLogo src={club.logo} name={club.name} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="a-ink text-[15px] font-semibold truncate">{club.name}</span>
                    {club.abbreviation && <span className="a-lb-fmt">{club.abbreviation}</span>}
                  </div>
                  {club.boat_classes && club.boat_classes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {club.boat_classes.slice(0, 3).map((boatClass, index) => (
                        <span key={index} className="a-lb-cls">{boatClass}</span>
                      ))}
                      {club.boat_classes.length > 3 && <span className="a-lb-fmt">+{club.boat_classes.length - 3}</span>}
                    </div>
                  )}
                  <div className="a-meta-row mt-2">
                    <span><Users size={12} />{club.member_count || 0} members</span>
                    <span><Calendar size={12} />{club.upcoming_events || 0} events</span>
                    <span><Trophy size={12} />{club.recent_results || 0} results</span>
                    {(club.pending_applications || 0) > 0 && (
                      <span className="a-txt-a"><AlertCircle size={12} />{club.pending_applications} pending</span>
                    )}
                    {(club.pending_payments || 0) > 0 && (
                      <span className="a-txt-r"><DollarSign size={12} />${(club.pending_payments || 0).toFixed(2)} due</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => handleViewClub(club.id)} className="a-btn a-btn-sm">
                    <Eye size={14} />
                    View members
                  </button>
                  {clubMenu(club)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Club Wizard */}
      <ClubOnboardingWizard
        isOpen={showAddClubModal}
        onClose={() => setShowAddClubModal(false)}
        onSuccess={async () => {
          setShowAddClubModal(false);
          await loadClubs();
          await loadPendingClubs();
        }}
        stateAssociationId={currentOrganization?.id || ''}
        darkMode={darkMode}
      />

      {/* Edit Club Wizard */}
      {selectedClubId && (
        <ClubOnboardingWizard
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedClubId(null);
          }}
          onSuccess={async () => {
            setShowEditModal(false);
            setSelectedClubId(null);
            await loadClubs();
          }}
          stateAssociationId={currentOrganization?.id || ''}
          darkMode={darkMode}
          clubId={selectedClubId}
        />
      )}

      {/* Manage club admins */}
      {manageAdminsClub && (
        <ManageClubAdminsModal
          isOpen={!!manageAdminsClub}
          onClose={() => setManageAdminsClub(null)}
          clubId={manageAdminsClub.id}
          clubName={manageAdminsClub.name}
          darkMode={darkMode}
        />
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && clubToDelete && (
        <div className="a-confirm a-veil backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Delete club">
          <div className="a-sheet">
            <div className="flex items-center gap-3 mb-4">
              <span className="a-tile a-txt-r" style={{ width: 46, height: 46 }}><Trash2 size={20} /></span>
              <div>
                <h3 className="a-display a-ink text-lg font-semibold">Delete club</h3>
                <p className="a-dim text-[13px]">This can't be undone</p>
              </div>
            </div>
            <p className="a-mute text-[14px] mb-6">
              Are you sure you want to delete <strong className="a-ink">{clubToDelete.name}</strong>?
              This permanently removes the club and all its data.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setClubToDelete(null);
                }}
                className="a-btn flex-1"
                style={{ height: 44 }}
              >
                Cancel
              </button>
              <button type="button" onClick={confirmDeleteClub} className="a-btn a-btn-d flex-1" style={{ height: 44 }}>
                Delete club
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

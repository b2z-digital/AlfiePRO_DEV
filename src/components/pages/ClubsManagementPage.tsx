import React, { useState, useEffect, useRef } from 'react';
import { Building, Plus, Users, CheckCircle, Grid, List, Eye, UserPlus, DollarSign, AlertCircle, MapPin as MapPinIcon, Edit2, Trash2, MoreVertical, Anchor, Calendar, Trophy, TrendingUp, Clock, XCircle, Check, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { ClubOnboardingWizard } from './ClubOnboardingWizard';
import { useNavigate } from 'react-router-dom';
import { loadGoogleMaps } from '../../utils/googleMaps';

import { useNotification } from '../../contexts/NotificationContext';

interface SailingDay {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  boat_class_name?: string;
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
            boat_class_name: sd.boat_classes?.name || null
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
        const { data: existingLink } = await supabase
          .from('user_clubs')
          .select('id')
          .eq('user_id', club.registered_by_user_id)
          .eq('club_id', clubId)
          .maybeSingle();

        if (!existingLink) {
          await supabase
            .from('user_clubs')
            .insert({
              user_id: club.registered_by_user_id,
              club_id: clubId,
              role: 'admin',
            });
        }
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
              ? `<p style="margin: 0 0 12px 0; font-size: 14px; color: #475569; line-height: 1.5;">${club.club_introduction.substring(0, 100)}${club.club_introduction.length > 100 ? '...' : ''}</p>`
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
        <div className="p-4 sm:p-6 lg:p-16">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
            <p className={`mt-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Loading clubs...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-16">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-emerald-600/20">
              <Building className="text-emerald-400" size={28} />
            </div>
            <div>
              <h1 className={`text-3xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                Member Clubs
              </h1>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Manage all clubs in your state association
              </p>
            </div>
          </div>

          {/* Search and Actions */}
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <input
              type="text"
              placeholder="Search clubs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`flex-1 min-w-[300px] px-4 py-2.5 rounded-lg border ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500'
                  : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
              } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
            />
            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex items-center gap-2 p-1 rounded-lg bg-slate-700/30 border border-slate-600/50">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded transition-all ${
                    viewMode === 'grid'
                      ? 'bg-emerald-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Grid view"
                >
                  <Grid size={16} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded transition-all ${
                    viewMode === 'list'
                      ? 'bg-emerald-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="List view"
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  className={`p-2 rounded transition-all ${
                    viewMode === 'map'
                      ? 'bg-emerald-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Map view"
                >
                  <MapPinIcon size={16} />
                </button>
              </div>
              <button
                onClick={() => setShowAddClubModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
              >
                <Plus size={20} />
                Add Club
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className={`p-6 rounded-xl border backdrop-blur-sm ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}`}>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-emerald-600/20">
                <Building className="text-emerald-400" size={24} />
              </div>
              <div>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Total Clubs
                </p>
                <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  {clubs.length}
                </p>
              </div>
            </div>
          </div>

          <div className={`p-6 rounded-xl border backdrop-blur-sm ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}`}>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-amber-600/20">
                <Clock className="text-amber-400" size={24} />
              </div>
              <div>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Pending Approvals
                </p>
                <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  {pendingClubs.length}
                </p>
              </div>
            </div>
          </div>

          <div className={`p-6 rounded-xl border backdrop-blur-sm ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}`}>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-purple-600/20">
                <Users className="text-purple-400" size={24} />
              </div>
              <div>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Total Members
                </p>
                <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  {clubs.reduce((sum, c) => sum + (c.member_count || 0), 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Club Approvals */}
        {pendingClubs.length > 0 && (
          <div className={`mb-8 rounded-xl border ${darkMode ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
            <div className="p-5 border-b border-amber-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <Clock className="text-amber-400" size={20} />
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                    Pending Club Registrations
                  </h3>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {pendingClubs.length} club{pendingClubs.length !== 1 ? 's' : ''} awaiting your approval
                  </p>
                </div>
              </div>
            </div>
            <div className="divide-y divide-amber-500/10">
              {pendingClubs.map((club) => (
                <div key={club.id} className="p-5 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        darkMode ? 'bg-slate-700' : 'bg-slate-100'
                      }`}>
                        <Building className={darkMode ? 'text-slate-400' : 'text-slate-500'} size={20} />
                      </div>
                      <div>
                        <h4 className={`font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                          {club.name}
                        </h4>
                        <div className="flex items-center gap-3 text-xs">
                          {club.abbreviation && (
                            <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>{club.abbreviation}</span>
                          )}
                          {club.location && (
                            <span className={`flex items-center gap-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                              <MapPinIcon size={10} /> {club.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {club.club_introduction && (
                      <p className={`text-sm line-clamp-2 mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {club.club_introduction}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs">
                      {club.registrant_email && (
                        <span className={darkMode ? 'text-slate-500' : 'text-slate-500'}>
                          Registered by: {club.registrant_email}
                        </span>
                      )}
                      <span className={darkMode ? 'text-slate-500' : 'text-slate-500'}>
                        {new Date(club.created_at).toLocaleDateString('en-AU', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleRejectClub(club.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        darkMode
                          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                          : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                      }`}
                    >
                      <X size={14} />
                      Reject
                    </button>
                    <button
                      onClick={() => handleApproveClub(club.id)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Check size={14} />
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clubs Display */}
        {filteredClubs.length === 0 ? (
          <div className={`text-center py-16 rounded-xl border backdrop-blur-sm ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}`}>
            <Building size={64} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
            <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {searchQuery ? 'No clubs found' : 'No clubs yet'}
            </h3>
            <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
              {searchQuery ? 'Try a different search term' : 'Get started by adding your first club'}
            </p>
          </div>
        ) : viewMode === 'map' ? (
          <div className="relative w-full rounded-xl overflow-hidden border border-slate-700/50 shadow-2xl" style={{ height: 'calc(100vh - 450px)', minHeight: '500px' }}>
            <div ref={mapRef} className="w-full h-full" />
            {!mapLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800/90 backdrop-blur-sm">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
                  <p className="text-slate-300 font-medium">Loading map...</p>
                </div>
              </div>
            )}
            {mapLoaded && filteredClubs.filter(c => c.default_venue).length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800/90 backdrop-blur-sm pointer-events-none">
                <div className="text-center px-4">
                  <MapPinIcon size={64} className="mx-auto mb-4 text-slate-600" />
                  <h3 className="text-xl font-semibold mb-2 text-slate-300">No Club Locations</h3>
                  <p className="text-slate-400">
                    Clubs need to set a default venue to appear on the map
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClubs.map((club) => (
              <div
                key={club.id}
                className={`group flex flex-col p-6 rounded-xl border backdrop-blur-sm transition-all hover:shadow-lg ${
                  darkMode
                    ? 'bg-slate-800/30 border-slate-700/50 hover:border-emerald-500/50'
                    : 'bg-white/10 border-slate-200/20 hover:border-emerald-300'
                }`}
              >
                {/* Header with Logo */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {club.logo ? (
                      <img
                        src={club.logo}
                        alt={club.name}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        darkMode ? 'bg-slate-700' : 'bg-slate-100'
                      }`}>
                        <Building className={darkMode ? 'text-slate-500' : 'text-slate-400'} size={24} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold text-lg truncate ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                        {club.name}
                      </h3>
                      {club.abbreviation && (
                        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {club.abbreviation}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setOpenMenuId(openMenuId === club.id ? null : club.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        darkMode
                          ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                          : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <MoreVertical size={18} />
                    </button>
                    {openMenuId === club.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div className={`absolute right-0 top-full mt-1 w-48 rounded-lg border shadow-lg z-20 ${
                          darkMode
                            ? 'bg-slate-800 border-slate-700'
                            : 'bg-white border-slate-200'
                        }`}>
                          <button
                            onClick={() => handleEditClub(club.id)}
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                              darkMode
                                ? 'text-slate-300 hover:bg-slate-700'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Edit2 size={14} />
                            Edit Club
                          </button>
                          <button
                            onClick={() => handleDeleteClub(club)}
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors text-red-400 ${
                              darkMode ? 'hover:bg-slate-700' : 'hover:bg-red-50'
                            }`}
                          >
                            <Trash2 size={14} />
                            Delete Club
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Sailing Days - fixed height area */}
                <div className="mb-3 min-h-[40px]">
                  {club.sailing_days && club.sailing_days.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Calendar size={14} className="text-blue-400" />
                        <span className="text-xs font-medium text-blue-400">REGULAR SAILING</span>
                      </div>
                      {club.sailing_days.slice(0, 2).map((day) => (
                        <div key={day.id} className="flex items-center gap-2 text-xs">
                          <Clock size={12} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                          <span className={`font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {day.day_of_week}
                          </span>
                          <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                            {day.start_time.substring(0, 5)} - {day.end_time.substring(0, 5)}
                          </span>
                          {day.boat_class_name && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-xs">
                              {day.boat_class_name}
                            </span>
                          )}
                        </div>
                      ))}
                      {club.sailing_days.length > 2 && (
                        <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                          +{club.sailing_days.length - 2} more
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Clock size={14} className={darkMode ? 'text-slate-600' : 'text-slate-400'} />
                      <p className={`text-xs italic ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                        No sailing days defined
                      </p>
                    </div>
                  )}
                </div>

                {/* Boat Classes - fixed height area */}
                <div className="mb-4 min-h-[52px]">
                  {club.boat_classes && club.boat_classes.length > 0 ? (
                    <>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Anchor size={14} className={darkMode ? 'text-sky-400' : 'text-sky-600'} />
                        <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Classes Sailed
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {club.boat_classes.slice(0, 4).map((boatClass, index) => (
                          <span
                            key={index}
                            className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                              darkMode
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                : 'bg-sky-100 text-sky-700 border border-sky-200'
                            }`}
                          >
                            {boatClass}
                          </span>
                        ))}
                        {club.boat_classes.length > 4 && (
                          <span
                            className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                              darkMode
                                ? 'bg-slate-700 text-slate-400'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            +{club.boat_classes.length - 4}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Anchor size={14} className={darkMode ? 'text-slate-600' : 'text-slate-400'} />
                      <span className={`text-xs italic ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                        No classes recorded
                      </span>
                    </div>
                  )}
                </div>

                {/* Bottom section - pushed to bottom */}
                <div className="mt-auto space-y-3">
                  {/* Activity Stats Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className={`p-3 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700/30 border-slate-600/50'
                        : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-center justify-center mb-1">
                        <Calendar size={18} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
                      </div>
                      <div className={`text-lg font-bold text-center ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                        {club.upcoming_events || 0}
                      </div>
                      <div className={`text-xs text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Events
                      </div>
                    </div>

                    <div className={`p-3 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700/30 border-slate-600/50'
                        : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-center justify-center mb-1">
                        <Trophy size={18} className={darkMode ? 'text-amber-400' : 'text-amber-600'} />
                      </div>
                      <div className={`text-lg font-bold text-center ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                        {club.recent_results || 0}
                      </div>
                      <div className={`text-xs text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Results
                      </div>
                    </div>

                    <div className={`p-3 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700/30 border-slate-600/50'
                        : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-center justify-center mb-1">
                        <Users size={18} className={darkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                      </div>
                      <div className={`text-lg font-bold text-center ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                        {club.member_count || 0}
                      </div>
                      <div className={`text-xs text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Members
                      </div>
                    </div>
                  </div>

                  {(club.pending_payments || 0) > 0 && (
                    <div className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg ${
                      darkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'
                    }`}>
                      <span className={`flex items-center gap-1.5 ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                        <DollarSign size={14} />
                        Pending Payments
                      </span>
                      <span className={`font-bold ${darkMode ? 'text-red-200' : 'text-red-800'}`}>
                        ${(club.pending_payments || 0).toFixed(2)}
                      </span>
                    </div>
                  )}

                  {/* Actions - always at very bottom */}
                  <button
                    onClick={() => handleViewClub(club.id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg font-medium transition-all"
                  >
                    <Eye size={16} />
                    View Members
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredClubs.map((club) => (
              <div
                key={club.id}
                className={`p-4 rounded-xl border backdrop-blur-sm transition-all ${
                  darkMode
                    ? 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-700/50'
                    : 'bg-white/10 border-slate-200/20 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    {club.logo ? (
                      <img
                        src={club.logo}
                        alt={club.name}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        darkMode ? 'bg-slate-700' : 'bg-slate-100'
                      }`}>
                        <Building className={darkMode ? 'text-slate-500' : 'text-slate-400'} size={24} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className={`font-semibold text-lg ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                          {club.name}
                        </h3>
                        {club.abbreviation && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {club.abbreviation}
                          </span>
                        )}
                      </div>

                      {/* Boat Classes */}
                      {club.boat_classes && club.boat_classes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {club.boat_classes.slice(0, 3).map((boatClass, index) => (
                            <span
                              key={index}
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                darkMode
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : 'bg-sky-100 text-sky-700'
                              }`}
                            >
                              {boatClass}
                            </span>
                          ))}
                          {club.boat_classes.length > 3 && (
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-600'
                            }`}>
                              +{club.boat_classes.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-6 text-xs flex-wrap">
                        <span className={`flex items-center gap-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          <Users size={12} />
                          {club.member_count || 0} members
                        </span>
                        <span className={`flex items-center gap-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                          <Calendar size={12} />
                          {club.upcoming_events || 0} events
                        </span>
                        <span className={`flex items-center gap-1 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                          <Trophy size={12} />
                          {club.recent_results || 0} results
                        </span>
                        {(club.pending_applications || 0) > 0 && (
                          <span className="flex items-center gap-1 text-orange-400">
                            <AlertCircle size={12} />
                            {club.pending_applications} pending
                          </span>
                        )}
                        {(club.pending_payments || 0) > 0 && (
                          <span className="flex items-center gap-1 text-red-400">
                            <DollarSign size={12} />
                            ${(club.pending_payments || 0).toFixed(2)} pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewClub(club.id)}
                      className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg font-medium transition-all flex items-center gap-2 text-sm"
                    >
                      <Eye size={14} />
                      View Members
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === club.id ? null : club.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          darkMode
                            ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                            : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <MoreVertical size={18} />
                      </button>
                      {openMenuId === club.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className={`absolute right-0 top-full mt-1 w-48 rounded-lg border shadow-lg z-20 ${
                            darkMode
                              ? 'bg-slate-800 border-slate-700'
                              : 'bg-white border-slate-200'
                          }`}>
                            <button
                              onClick={() => handleEditClub(club.id)}
                              className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                                darkMode
                                  ? 'text-slate-300 hover:bg-slate-700'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <Edit2 size={14} />
                              Edit Club
                            </button>
                            <button
                              onClick={() => handleDeleteClub(club)}
                              className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors text-red-400 ${
                                darkMode ? 'hover:bg-slate-700' : 'hover:bg-red-50'
                              }`}
                            >
                              <Trash2 size={14} />
                              Delete Club
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
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
        onSuccess={() => {
          loadClubs();
          setShowAddClubModal(false);
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
          onSuccess={() => {
            loadClubs();
            setShowEditModal(false);
            setSelectedClubId(null);
          }}
          stateAssociationId={currentOrganization?.id || ''}
          darkMode={darkMode}
          clubId={selectedClubId}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && clubToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md rounded-xl shadow-2xl ${
            darkMode ? 'bg-slate-800' : 'bg-white'
          }`}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-lg bg-red-500/20">
                  <Trash2 className="text-red-400" size={24} />
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                    Delete Club
                  </h3>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    This action cannot be undone
                  </p>
                </div>
              </div>

              <p className={`mb-6 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Are you sure you want to delete <strong>{clubToDelete.name}</strong>?
                This will permanently remove the club and all associated data.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setClubToDelete(null);
                  }}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    darkMode
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-100'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteClub}
                  className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
                >
                  Delete Club
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { Users, Search, Award, MapPin, Flag, Loader2, UserCircle2, Trophy, Building2, DollarSign, Download, FileImage, FileText, FileSpreadsheet, Upload, Trash2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { ImportRegistrationsModal } from './ImportRegistrationsModal';

interface EventWebsiteCompetitorManagerProps {
  websiteId: string;
  eventId: string;
}

interface EventInfo {
  id: string;
  name: string;
  is_primary: boolean;
  display_order: number;
}

interface Competitor {
  id: string;
  sail_number: string;
  boat_name: string | null;
  boat_class: string | null;
  skipper_name: string;
  club_name: string | null;
  club_abbreviation: string | null;
  state: string | null;
  country: string | null;
  avatar_url: string | null;
  status: string;
  amount_paid: number;
  entry_fee_amount: number;
  payment_status: string;
}

const abbreviateState = (state: string | null): string => {
  if (!state) return '—';

  const stateMap: { [key: string]: string } = {
    'New South Wales': 'NSW',
    'Queensland': 'QLD',
    'Victoria': 'VIC',
    'South Australia': 'SA',
    'Western Australia': 'WA',
    'Tasmania': 'TAS',
    'Northern Territory': 'NT',
    'Australian Capital Territory': 'ACT'
  };

  return stateMap[state] || state;
};

export const EventWebsiteCompetitorManager: React.FC<EventWebsiteCompetitorManagerProps> = ({
  websiteId,
  eventId
}) => {
  const { currentClub } = useAuth();
  const { showNotification } = useNotification();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>(eventId);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [competitorToDelete, setCompetitorToDelete] = useState<Competitor | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEvents();
  }, [websiteId]);

  useEffect(() => {
    fetchCompetitors();
  }, [selectedEventId, currentClub?.clubId]);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showExportMenu && !target.closest('.export-menu-container')) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu]);

  const fetchEvents = async () => {
    try {
      // Use the event_website_all_events view which returns all events in a JSONB array
      const { data: eventWebsiteData, error } = await supabase
        .from('event_website_all_events')
        .select('all_events')
        .eq('event_website_id', websiteId)
        .maybeSingle();

      if (error) throw error;

      console.log('Event Website All Events:', eventWebsiteData);

      // Extract events from the all_events JSONB array
      const allEvents = eventWebsiteData?.all_events || [];
      const eventsData: EventInfo[] = allEvents.map((evt: any) => ({
        id: evt.id,
        name: evt.event_name,
        is_primary: evt.is_primary,
        display_order: evt.display_order
      }));

      console.log('Processed Events Data:', eventsData);

      setEvents(eventsData);

      // If no event is selected or the selected event is not in the list, select the first one
      if (!selectedEventId || !eventsData.find(e => e.id === selectedEventId)) {
        const primaryEvent = eventsData.find(e => e.is_primary);
        setSelectedEventId(primaryEvent?.id || eventsData[0]?.id || eventId);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  const fetchCompetitors = async () => {
    if (!currentClub?.clubId || !selectedEventId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch from event_registrations (both pending and confirmed)
      const { data: registrations, error } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', selectedEventId)
        .in('status', ['pending', 'confirmed'])
        .order('sail_number', { ascending: true });

      if (error) throw error;

      // Get unique user_ids and club_ids that are not null
      const userIds = [...new Set(registrations?.map(r => r.user_id).filter(Boolean))];
      const clubIds = [...new Set(registrations?.map(r => r.club_id).filter(Boolean))];

      // Fetch member data for those user_ids
      let membersMap = new Map();
      if (userIds.length > 0) {
        const { data: members } = await supabase
          .from('members')
          .select('user_id, first_name, last_name, avatar_url')
          .in('user_id', userIds)
          .eq('club_id', currentClub.clubId);

        if (members) {
          members.forEach(m => {
            if (m.user_id) {
              membersMap.set(m.user_id, m);
            }
          });
        }
      }

      // Fetch club abbreviations
      let clubsMap = new Map();
      if (clubIds.length > 0) {
        const { data: clubs } = await supabase
          .from('clubs')
          .select('id, name, abbreviation')
          .in('id', clubIds);

        if (clubs) {
          clubs.forEach(c => {
            clubsMap.set(c.id, c);
          });
        }
      }

      // Transform the data
      const competitorsData: Competitor[] = (registrations || []).map((reg: any) => {
        const member = reg.user_id ? membersMap.get(reg.user_id) : null;
        const club = reg.club_id ? clubsMap.get(reg.club_id) : null;
        const firstName = member?.first_name || reg.guest_first_name || '';
        const lastName = member?.last_name || reg.guest_last_name || '';

        return {
          id: reg.id,
          sail_number: reg.sail_number || 'TBA',
          boat_name: reg.boat_name,
          boat_class: reg.boat_class,
          skipper_name: `${firstName} ${lastName}`.trim() || 'Unknown',
          club_name: reg.guest_club_name || club?.name,
          club_abbreviation: club?.abbreviation || null,
          state: reg.guest_state,
          country: reg.guest_country,
          avatar_url: member?.avatar_url || null,
          status: reg.status,
          amount_paid: parseFloat(reg.amount_paid || 0),
          entry_fee_amount: parseFloat(reg.entry_fee_amount || 0),
          payment_status: reg.payment_status
        };
      });

      setCompetitors(competitorsData);
    } catch (error) {
      console.error('Error fetching competitors:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCompetitors = competitors.filter(comp =>
    comp.skipper_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    comp.sail_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    comp.boat_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    comp.club_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportToCSV = () => {
    const currentEvent = events.find(e => e.id === selectedEventId);
    const eventName = currentEvent?.name || 'Event';

    const headers = ['Sail #', 'Skipper', 'Boat Name', 'Boat Class', 'Club', 'State', 'Country', 'Payment Status'];
    const rows = filteredCompetitors.map(c => [
      c.sail_number,
      c.skipper_name,
      c.boat_name || '',
      c.boat_class || '',
      c.club_name || '',
      c.state || '',
      c.country || '',
      (c.payment_status === 'paid' || c.amount_paid >= c.entry_fee_amount) ? 'Paid' : 'Pending'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${eventName}_competitors.csv`;
    link.click();
    setShowExportMenu(false);
  };

  const exportToJPG = async () => {
    if (!tableRef.current) return;

    try {
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: '#1e293b',
        scale: 2
      });

      const currentEvent = events.find(e => e.id === selectedEventId);
      const eventName = currentEvent?.name || 'Event';

      const link = document.createElement('a');
      link.download = `${eventName}_competitors.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
      setShowExportMenu(false);
    } catch (error) {
      console.error('Error exporting to JPG:', error);
      alert('Failed to export as JPG. Please try again.');
    }
  };

  const exportToPDF = async () => {
    if (!tableRef.current) return;

    try {
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: '#1e293b',
        scale: 2
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = 297; // A4 landscape width
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

      const currentEvent = events.find(e => e.id === selectedEventId);
      const eventName = currentEvent?.name || 'Event';

      pdf.save(`${eventName}_competitors.pdf`);
      setShowExportMenu(false);
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      alert('Failed to export as PDF. Please try again.');
    }
  };

  const handleDeleteClick = (competitor: Competitor) => {
    setCompetitorToDelete(competitor);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!competitorToDelete) return;

    setDeletingId(competitorToDelete.id);
    setShowDeleteModal(false);

    try {
      console.log('Deleting competitor:', competitorToDelete.id);

      // Delete the event registration
      const { data, error } = await supabase
        .from('event_registrations')
        .delete()
        .eq('id', competitorToDelete.id)
        .select();

      console.log('Delete response:', { data, error });

      if (error) {
        console.error('Delete error details:', error);
        throw error;
      }

      // Show success notification
      showNotification('success', `${competitorToDelete.skipper_name} has been removed from the event`);

      // Refresh the competitors list
      await fetchCompetitors();
    } catch (error: any) {
      console.error('Error deleting competitor:', error);
      showNotification('error', error.message || 'Failed to remove competitor. Please try again.');
    } finally {
      setDeletingId(null);
      setCompetitorToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setCompetitorToDelete(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-xl">
              <Trophy className="w-6 h-6 text-cyan-400" />
            </div>
            Competitors
          </h3>
          <p className="text-sm text-slate-400 mt-2">
            {competitors.length} {competitors.length === 1 ? 'competitor' : 'competitors'} registered
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Import Registrations Button */}
          <button
            onClick={() => {
              console.log('Opening import modal with events:', events);
              setShowImportModal(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg transition-all flex items-center gap-2 font-medium shadow-lg"
          >
            <Upload className="w-4 h-4" />
            Import Registrations
          </button>

          {/* Export Button */}
          {filteredCompetitors.length > 0 && (
            <div className="relative export-menu-container">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg transition-all flex items-center gap-2 font-medium shadow-lg"
              >
                <Download className="w-4 h-4" />
                Export
              </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-10">
                <button
                  onClick={exportToJPG}
                  className="w-full px-4 py-3 text-left text-white hover:bg-slate-700 transition-colors flex items-center gap-3"
                >
                  <FileImage className="w-4 h-4 text-cyan-400" />
                  Export as JPG
                </button>
                <button
                  onClick={exportToPDF}
                  className="w-full px-4 py-3 text-left text-white hover:bg-slate-700 transition-colors flex items-center gap-3 border-t border-slate-700"
                >
                  <FileText className="w-4 h-4 text-red-400" />
                  Export as PDF
                </button>
                <button
                  onClick={exportToCSV}
                  className="w-full px-4 py-3 text-left text-white hover:bg-slate-700 transition-colors flex items-center gap-3 border-t border-slate-700"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-400" />
                  Export as CSV
                </button>
              </div>
            )}
            </div>
          )}
        </div>
      </div>

      {/* Event Selector Tabs - Show only if multiple events */}
      {events.length > 1 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-1 flex gap-1 overflow-x-auto">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => setSelectedEventId(event.id)}
              className={`px-6 py-3 rounded-lg font-medium whitespace-nowrap transition-all ${
                selectedEventId === event.id
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {event.name}
              {event.is_primary && (
                <span className="ml-2 text-xs opacity-75">(Primary)</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Content for Export */}
      <div ref={tableRef}>
        {/* Stats Cards - Moved above table */}
        {competitors.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-xl p-4 border border-cyan-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/20 rounded-lg">
                <Users className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{competitors.length}</p>
                <p className="text-sm text-slate-400">Total Entries</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl p-4 border border-purple-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Building2 className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {new Set(competitors.map(c => c.club_name).filter(Boolean)).size}
                </p>
                <p className="text-sm text-slate-400">Clubs</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-xl p-4 border border-green-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  ${competitors.reduce((sum, c) => sum + c.amount_paid, 0).toFixed(2)}
                </p>
                <p className="text-sm text-slate-400">Total Paid</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      {competitors.length > 0 && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search by name, sail number, boat, or club..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
      )}

      {/* Competitors List */}
      {filteredCompetitors.length === 0 ? (
        <div className="relative overflow-hidden bg-slate-800/50 backdrop-blur-sm rounded-2xl p-16 border border-slate-700/50">
          <div className="relative text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-cyan-500/10 mb-6">
              <Users className="w-10 h-10 text-cyan-400" />
            </div>
            <h4 className="text-2xl font-bold text-white mb-3">
              {searchTerm ? 'No Competitors Found' : 'No Competitors Yet'}
            </h4>
            <p className="text-slate-400 max-w-md mx-auto">
              {searchTerm
                ? 'Try adjusting your search terms'
                : 'Competitors will appear here once they register for the event'}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-800/50 border-b border-slate-700/50 text-sm font-semibold text-slate-400">
            <div className="col-span-1 text-center">Sail #</div>
            <div className="col-span-4">Skipper</div>
            <div className="col-span-2">Design</div>
            <div className="col-span-2">State</div>
            <div className="col-span-2">Club</div>
            <div className="col-span-1 text-center">Actions</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-slate-700/50">
            {filteredCompetitors.map((competitor, index) => (
              <div
                key={competitor.id}
                className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-slate-700/20 transition-colors group"
              >
                {/* Sail Number */}
                <div className="col-span-1 flex items-center justify-center">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
                    <span className="text-lg font-bold text-cyan-400">
                      {competitor.sail_number}
                    </span>
                  </div>
                </div>

                {/* Skipper Name with Avatar */}
                <div className="col-span-4 flex items-center gap-3">
                  <div className="relative">
                    {competitor.avatar_url ? (
                      <img
                        src={competitor.avatar_url}
                        alt={competitor.skipper_name}
                        className="w-12 h-12 rounded-xl object-cover border-2 border-slate-700 group-hover:border-cyan-500/50 transition-colors"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center border-2 border-slate-700 group-hover:border-cyan-500/50 transition-colors">
                        <UserCircle2 className="w-7 h-7 text-slate-400" />
                      </div>
                    )}
                    {index < 3 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center border-2 border-slate-800">
                        <Award className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-white font-semibold group-hover:text-cyan-400 transition-colors">
                      {competitor.skipper_name}
                    </p>
                    {competitor.payment_status === 'paid' || competitor.amount_paid >= competitor.entry_fee_amount ? (
                      <span className="inline-block mt-0.5 px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-400 rounded border border-green-500/30">
                        Paid
                      </span>
                    ) : (
                      <span className="inline-block mt-0.5 px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded border border-yellow-500/30">
                        Payment Pending
                      </span>
                    )}
                  </div>
                </div>

                {/* Design (Boat Name) */}
                <div className="col-span-2 flex items-center">
                  <p className="text-slate-300 truncate">
                    {competitor.boat_name || '—'}
                  </p>
                </div>

                {/* State */}
                <div className="col-span-2 flex items-center">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <p className="text-slate-300 font-medium">
                      {abbreviateState(competitor.state)}
                    </p>
                  </div>
                </div>

                {/* Club (Abbreviation) */}
                <div className="col-span-2 flex items-center">
                  <p className="text-slate-400 text-sm truncate font-semibold">
                    {competitor.club_abbreviation || competitor.club_name || '—'}
                  </p>
                </div>

                {/* Actions (Delete Button) */}
                <div className="col-span-1 flex items-center justify-center">
                  <button
                    onClick={() => handleDeleteClick(competitor)}
                    disabled={deletingId === competitor.id}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed group/delete"
                    title="Remove competitor"
                  >
                    {deletingId === competitor.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Trash2 className="w-5 h-5 group-hover/delete:scale-110 transition-transform" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* Import Registrations Modal */}
      <ImportRegistrationsModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        websiteId={websiteId}
        events={events}
        onImportComplete={() => {
          fetchCompetitors();
          setShowImportModal(false);
        }}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && competitorToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border-b border-red-500/20 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Remove Competitor</h3>
                  <p className="text-sm text-slate-400">This action cannot be undone</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-6">
              <p className="text-slate-300 mb-4">
                Are you sure you want to remove{' '}
                <span className="font-semibold text-white">{competitorToDelete.skipper_name}</span>{' '}
                (Sail #{competitorToDelete.sail_number}) from this event?
              </p>
              <p className="text-sm text-slate-400">
                All registration data and payment information will be permanently deleted.
              </p>
            </div>

            {/* Actions */}
            <div className="bg-slate-900/50 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white rounded-lg transition-all font-medium shadow-lg"
              >
                Remove Competitor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

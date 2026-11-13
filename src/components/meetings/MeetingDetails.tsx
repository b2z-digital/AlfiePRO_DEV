import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Clock, Video, FileText, ChevronLeft, SquarePen as Edit2, Mail, Check, X, TriangleAlert as AlertTriangle, Play, Lock, Share, Shield, Repeat, Navigation, ExternalLink, Copy, Printer, Trash2 } from 'lucide-react';
import { AAvatar } from '../alfie/Kit';
import { Meeting, MeetingAgendaItem } from '../../types/meeting';
import { getMeetingAgenda, lockMeetingMinutes } from '../../utils/meetingStorage';
import { generateAgendaPdf } from '../../utils/agendaPdfExport';
import { formatDate } from '../../utils/date';
import { useNavigate } from 'react-router-dom';
import { MeetingInviteModal } from './MeetingInviteModal';
import { ShareMinutesModal } from './ShareMinutesModal';
import { supabase } from '../../utils/supabase';

interface MeetingDetailsProps {
  meeting: Meeting;
  darkMode: boolean;
  associationId?: string;
  associationType?: 'state' | 'national';
  onClose: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onMarkAsCompleted: () => void;
  onMarkAsCancelled: () => void;
}

export const MeetingDetails: React.FC<MeetingDetailsProps> = ({
  meeting,
  darkMode,
  associationId,
  associationType,
  onClose,
  onEdit,
  onDelete,
  onDuplicate,
  onMarkAsCompleted,
  onMarkAsCancelled
}) => {
  const navigate = useNavigate();
  const [agendaItems, setAgendaItems] = useState<MeetingAgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showStatusConfirm, setShowStatusConfirm] = useState<'complete' | 'cancel' | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [attendance, setAttendance] = useState<{member: any, status: string}[]>([]);

  useEffect(() => {
    fetchAgendaItems();
    fetchAttendance();
  }, [meeting.id]);

  const fetchAttendance = async () => {
    try {
      const { data, error } = await supabase
        .from('meeting_attendance')
        .select(`
          status,
          member:members(id, first_name, last_name, avatar_url)
        `)
        .eq('meeting_id', meeting.id);

      if (error) throw error;

      setAttendance((data || [])
        .filter((a: any) => a.member)
        .map((a: any) => ({
          member: a.member,
          status: a.status
        })));
    } catch (error) {
      console.error('Error fetching attendance:', error);
    }
  };

  const fetchAgendaItems = async () => {
    try {
      setLoading(true);
      const items = await getMeetingAgenda(meeting.id);
      setAgendaItems(items);
    } catch (err) {
      console.error('Error fetching agenda items:', err);
      setError('Failed to load agenda items');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmStatusChange = () => {
    if (showStatusConfirm === 'complete') {
      onMarkAsCompleted();
    } else if (showStatusConfirm === 'cancel') {
      onMarkAsCancelled();
    }
    setShowStatusConfirm(null);
  };

  const handleStartMeeting = async () => {
    // Store the attending members in session storage for the minute taking page to pre-select
    const attendingMemberIds = attendance
      .filter(a => a.status === 'attending' && a.member)
      .map(a => a.member.id);

    if (attendingMemberIds.length > 0) {
      sessionStorage.setItem(`meeting_${meeting.id}_attendees`, JSON.stringify(attendingMemberIds));
    }

    navigate(`/meetings/${meeting.id}/minutes`);
  };

  const handleLockMinutes = async () => {
    try {
      await lockMeetingMinutes(meeting.id);
      setSuccess('Minutes have been locked and can no longer be edited');
      setTimeout(() => {
        setSuccess(null);
        setShowLockConfirm(false);
      }, 2000);
    } catch (err) {
      console.error('Error locking minutes:', err);
      setError('Failed to lock minutes');
    }
  };

  const formatTime = (time: string | null) => {
    if (!time) return '';
    return time.substring(0, 5);
  };

  const getAgendaItemTypeLabel = (type: string) => {
    switch (type) {
      case 'for_noting':
        return 'For Noting';
      case 'for_action':
        return 'For Action';
      case 'for_discussion':
        return 'For Discussion';
      default:
        return type;
    }
  };

  const getAgendaItemTypeClass = (type: string) => {
    switch (type) {
      case 'for_noting':
        return 'bg-blue-900/30 text-blue-400';
      case 'for_action':
        return 'bg-green-900/30 text-green-400';
      case 'for_discussion':
        return 'bg-purple-900/30 text-purple-400';
      default:
        return 'bg-slate-700 text-slate-300';
    }
  };

  const mType = (meeting as any).meeting_type as string | undefined;
  const lat = (meeting as any).location_lat, lng = (meeting as any).location_lng, placeId = (meeting as any).location_place_id;
  const directionsUrl = lat && lng ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}${placeId ? `&destination_place_id=${placeId}` : ''}` : null;
  const attending = attendance.filter(a => a.status === 'attending' && a.member);
  const conf = meeting.conferencing_url || '';
  const confName = /teams\.(microsoft|live)\.com/i.test(conf) ? 'Microsoft Teams' : /zoom\.us/i.test(conf) ? 'Zoom' : /meet\.google\.com/i.test(conf) ? 'Google Meet' : 'Video conference';
  const confShort = conf.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const typeDot = (t: string) => (t === 'for_noting' ? '#2E7BFF' : t === 'for_action' ? '#30D158' : t === 'for_discussion' ? '#8A4DFF' : '#9AA6BD');
  const longDate = (() => { const d = new Date(meeting.date); return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); })();
  const runAgendaPdf = async () => {
    setGeneratingPdf(true);
    try {
      await generateAgendaPdf(meeting, agendaItems, associationId, associationType);
    } catch (err) {
      console.error('Error generating agenda PDF:', err);
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex items-center gap-2 text-[13.5px]">
        <button onClick={onClose} className="a-txt-b inline-flex items-center gap-1 font-medium">
          <ChevronLeft size={16} />Meetings
        </button>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}>{meeting.meeting_category === 'committee' ? <Shield size={24} /> : <Calendar size={24} />}</span>
        <div className="flex-1 min-w-[260px]">
          <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">{meeting.name}</h1>
          <div className="flex gap-2 flex-wrap mt-3">
            <span className="a-chip"><Calendar size={15} />{longDate}</span>
            {meeting.start_time && meeting.end_time && <span className="a-chip"><Clock size={15} />{formatTime(meeting.start_time)} – {formatTime(meeting.end_time)}</span>}
            {mType && (
              <span className={`a-chip ${mType === 'online' ? 'a-txt-b' : ''}`}>
                {mType === 'online' ? <><Video size={15} />Online meeting</> : mType === 'hybrid' ? <><Video size={15} />Hybrid meeting</> : <><MapPin size={15} />In person</>}
              </span>
            )}
            {meeting.meeting_category && (
              <span className="a-chip"><span className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: meeting.meeting_category === 'committee' ? '#FFB340' : '#2E7BFF' }} />{meeting.meeting_category === 'committee' ? 'Committee' : 'General'}</span>
            )}
            {meeting.recurrence_type && meeting.recurrence_type !== 'none' && (
              <span className="a-chip"><Repeat size={15} />{meeting.recurrence_type === 'monthly_nth' ? 'Monthly' : meeting.recurrence_type.charAt(0).toUpperCase() + meeting.recurrence_type.slice(1)}</span>
            )}
            {meeting.status !== 'upcoming' && (
              <span className={`a-chip ${meeting.status === 'completed' ? 'a-txt-g' : 'a-txt-r'}`}>
                {meeting.status === 'completed' ? <Check size={15} /> : <X size={15} />}
                {meeting.status === 'completed' ? 'Completed' : 'Cancelled'}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          {onDuplicate && (
            <button onClick={onDuplicate} className="a-btn"><Copy size={16} />Duplicate</button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="a-btn a-btn-danger-soft" aria-label="Delete meeting"><Trash2 size={16} />Delete</button>
          )}

          {meeting.status === 'upcoming' && (
            <>
              {meeting.minutes_status !== 'in_progress' && (
                <button onClick={onEdit} className="a-btn"><Edit2 size={16} />Edit</button>
              )}
              {meeting.minutes_status !== 'in_progress' && (
                <button onClick={() => setShowInviteModal(true)} className="a-btn"><Mail size={16} />Send invites</button>
              )}
              <button onClick={() => setShowStatusConfirm('cancel')} className="a-btn a-btn-danger-soft"><X size={16} />Cancel meeting</button>
              {meeting.minutes_status === 'in_progress' ? (
                <button onClick={handleStartMeeting} className="a-btn a-btn-p" style={{ height: 42, borderRadius: 13 }}><Edit2 size={16} />Continue minutes</button>
              ) : (
                <button onClick={handleStartMeeting} className="a-btn a-btn-p" style={{ height: 42, borderRadius: 13 }}><Play size={16} />Start meeting</button>
              )}
            </>
          )}

          {meeting.status !== 'upcoming' && meeting.minutes_status === 'in_progress' && (
            <button onClick={handleStartMeeting} className="a-btn a-btn-p" style={{ height: 42, borderRadius: 13 }}><Edit2 size={16} />Continue minutes</button>
          )}

          {meeting.minutes_status === 'completed' && (
            <>
              {!meeting.minutes_locked && (
                <button onClick={() => setShowLockConfirm(true)} className="a-btn"><Lock size={16} />Confirm &amp; lock</button>
              )}
              <button onClick={() => setShowShareModal(true)} className="a-btn"><Share size={16} />Share minutes</button>
              <button onClick={handleStartMeeting} className="a-btn a-btn-p" style={{ height: 42, borderRadius: 13 }}><FileText size={16} />View minutes</button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="a-note a-note-r flex items-center gap-2.5">
          <AlertTriangle size={17} />
          <p className="m-0 text-[13.5px]">{error}</p>
        </div>
      )}

      {success && (
        <div className="a-note flex items-center gap-2.5">
          <Check size={17} className="a-txt-g" />
          <p className="m-0 text-[13.5px]">{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <div className="a-card overflow-hidden">
            <div className="flex items-center gap-3" style={{ padding: '18px 20px 12px' }}>
              <span className="a-tile a-tile-sm"><FileText size={16} /></span>
              <h2 className="a-display a-ink flex-1 m-0 text-[19px] font-semibold">Agenda</h2>
              <span className="a-dim text-[12.5px] mr-2">{agendaItems.length} {agendaItems.length === 1 ? 'item' : 'items'}</span>
              {agendaItems.length > 0 && (
                <button onClick={runAgendaPdf} disabled={generatingPdf} className="a-btn disabled:opacity-50" style={{ height: 36, fontSize: 13 }}>
                  <Printer size={15} />
                  {generatingPdf ? 'Generating…' : 'Print agenda'}
                </button>
              )}
            </div>

            {loading ? (
              <div className="text-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
                <p className="a-dim text-[13.5px]">Loading agenda…</p>
              </div>
            ) : agendaItems.length === 0 ? (
              <div className="text-center py-10 border-t a-bd">
                <span className="a-tile mx-auto mb-3" style={{ width: 48, height: 48 }}><FileText size={20} /></span>
                <p className="a-dim text-[13.5px]">No agenda items added yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div style={{ minWidth: 600 }}>
                  <div className="a-ag a-ag-h">
                    <p className="a-cap">#</p>
                    <p className="a-cap">Item</p>
                    <p className="a-cap">Type</p>
                    <p className="a-cap">Owner</p>
                    <p className="a-cap">Time</p>
                  </div>
                  {agendaItems.map((item) => (
                    <div key={item.id} className="a-ag">
                      <span className="a-ag-num">{item.item_number}</span>
                      <span className={`text-[14.5px] truncate ${item.item_name ? 'a-ink font-semibold' : 'a-dim italic'}`}>{item.item_name || 'Untitled item'}</span>
                      <span><span className="a-lb-fmt"><span className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: typeDot(item.type) }} />{getAgendaItemTypeLabel(item.type).replace(/ (\w)/, (_, c) => ' ' + c.toLowerCase())}</span></span>
                      {item.owner ? (
                        <span className="flex items-center gap-2 min-w-0">
                          <AAvatar url={item.owner.avatar_url} first={item.owner.first_name} last={item.owner.last_name} size={26} />
                          <span className="a-ink text-[13px] truncate">{item.owner.first_name} {item.owner.last_name}</span>
                        </span>
                      ) : (
                        <span className="a-dim text-[13px]">No owner</span>
                      )}
                      <span className="a-dim text-[13px]">{item.duration ? `${item.duration} min` : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {meeting.description && (
            <div className="a-card" style={{ padding: '18px 20px' }}>
              <div className="flex items-center gap-3 mb-2.5">
                <span className="a-tile a-tile-sm"><FileText size={16} /></span>
                <h2 className="a-display a-ink m-0 text-[17px] font-semibold">Description</h2>
              </div>
              <p className="a-mute m-0 text-[14px] leading-[1.65] whitespace-pre-line">{meeting.description}</p>
            </div>
          )}

          {meeting.minutes_status === 'completed' && (
            <div className="a-card" style={{ padding: '18px 20px' }}>
              <div className="flex items-center gap-3 mb-2.5">
                <span className="a-tile a-tile-sm"><FileText size={16} /></span>
                <h2 className="a-display a-ink m-0 text-[17px] font-semibold">Minutes</h2>
              </div>
              <p className="a-mute m-0 text-[14px] leading-[1.65]">Minutes have been recorded for this meeting. Use View minutes above to read them in full.</p>
              {meeting.minutes_locked && (
                <div className="a-note mt-3 flex items-center gap-2 a-txt-a">
                  <Lock size={16} />
                  <span className="text-[13.5px] font-medium">These minutes are locked and can no longer be edited.</span>
                </div>
              )}
            </div>
          )}

          {lat && lng && (
            <div className="a-card" style={{ padding: '18px 20px' }}>
              <div className="flex items-center gap-3 mb-3">
                <span className="a-tile a-tile-sm"><MapPin size={16} /></span>
                <h2 className="a-display a-ink flex-1 m-0 text-[17px] font-semibold">Venue location</h2>
                {directionsUrl && (
                  <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="a-btn" style={{ height: 36, fontSize: 13 }}>
                    <Navigation size={15} />Directions
                  </a>
                )}
              </div>
              <div className="overflow-hidden" style={{ borderRadius: 14 }}>
                <iframe
                  src={`https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&q=${lat},${lng}&zoom=15`}
                  width="100%"
                  height="250"
                  style={{ border: 0, display: 'block' }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {meeting.conferencing_url && (
            <div className="a-card a-spec-card flex flex-col gap-3" style={{ padding: 18 }}>
              <div className="flex items-center gap-3">
                <span className="a-tile" style={{ width: 44, height: 44 }}><Video size={20} /></span>
                <div className="flex-1 min-w-0">
                  <div className="a-ink text-[15px] font-semibold">{confName}</div>
                  <div className="a-dim text-[12.5px] mt-0.5">Video conference</div>
                </div>
              </div>
              <a href={meeting.conferencing_url} target="_blank" rel="noopener noreferrer" className="a-btn a-btn-p justify-center" style={{ height: 46 }}>
                <Video size={17} />Join meeting<ExternalLink size={15} />
              </a>
              <div className="a-linkbox">
                <span className="flex-1 truncate">{confShort}</span>
              </div>
            </div>
          )}

          <div className="a-card" style={{ padding: 8 }}>
            <p className="a-cap" style={{ padding: '10px 12px 4px' }}>People</p>
            {meeting.chairperson && (
              <div className="flex items-center gap-3" style={{ padding: '10px 12px' }}>
                <AAvatar url={meeting.chairperson.avatar_url} first={meeting.chairperson.first_name} last={meeting.chairperson.last_name} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="a-ink text-[14.5px] font-semibold truncate">{meeting.chairperson.first_name} {meeting.chairperson.last_name}</div>
                  <div className="a-dim text-[12px] mt-0.5">Chairperson</div>
                </div>
              </div>
            )}
            {meeting.minute_taker && (
              <div className="flex items-center gap-3" style={{ padding: '10px 12px' }}>
                <AAvatar url={meeting.minute_taker.avatar_url} first={meeting.minute_taker.first_name} last={meeting.minute_taker.last_name} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="a-ink text-[14.5px] font-semibold truncate">{meeting.minute_taker.first_name} {meeting.minute_taker.last_name}</div>
                  <div className="a-dim text-[12px] mt-0.5">Minute taker</div>
                </div>
              </div>
            )}
            {!meeting.chairperson && !meeting.minute_taker && (
              <p className="a-dim text-[13px]" style={{ padding: '6px 12px 10px' }}>No chair or minute taker set</p>
            )}
            {meeting.status === 'upcoming' && attending.length > 0 && (
              <div className="flex items-center gap-2.5 border-t a-bd" style={{ padding: '10px 12px' }}>
                <span className="inline-flex">
                  {attending.slice(0, 5).map((att, idx) => (
                    <span key={idx} className="a-av-ring inline-flex rounded-full" style={{ marginLeft: idx ? -8 : 0 }} title={`${att.member?.first_name || ''} ${att.member?.last_name || ''}`}>
                      <AAvatar url={att.member?.avatar_url} first={att.member?.first_name} last={att.member?.last_name} size={28} />
                    </span>
                  ))}
                </span>
                <span className="a-dim text-[12.5px]">{attending.length} attending</span>
              </div>
            )}
            <div className="flex items-center gap-2.5 flex-wrap border-t a-bd" style={{ padding: '10px 12px' }}>
              <span className="a-st text-[12.5px]"><span className={`a-light ${mType === 'online' ? 'a-light-g' : mType === 'hybrid' ? 'a-light-b' : 'a-light-a'}`} />{mType === 'online' ? 'Online' : mType === 'hybrid' ? 'Hybrid' : 'In person'}</span>
              <span className="a-dim text-[12.5px] min-w-0 truncate">· {meeting.location || (mType === 'online' ? 'No venue needed' : 'Venue not set')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Status Change Confirmation Modal */}
      {showStatusConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="a-sheet max-w-md w-full" style={{ padding: 24 }}>
            <h3 className="a-display a-ink text-[20px] font-semibold mb-2">
              {showStatusConfirm === 'complete' ? 'Mark as Completed' : 'Mark as Cancelled'}
            </h3>
            <p className="a-mute text-[14px] mb-6">
              {showStatusConfirm === 'complete'
                ? 'Are you sure you want to mark this meeting as completed?'
                : 'Are you sure you want to mark this meeting as cancelled?'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowStatusConfirm(null)}
                className="a-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmStatusChange}
                className={`a-btn ${showStatusConfirm === 'complete' ? 'a-btn-g' : 'a-btn-d'}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lock Minutes Confirmation Modal */}
      {showLockConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="a-sheet max-w-md w-full" style={{ padding: 24 }}>
            <h3 className="a-display a-ink text-[20px] font-semibold mb-2">
              Confirm & Lock Minutes
            </h3>
            <p className="a-mute text-[14px] mb-6">
              Are you sure you want to lock these minutes? Once locked, they can no longer be edited.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLockConfirm(false)}
                className="a-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleLockMinutes}
                className="a-btn a-btn-a"
              >
                Lock Minutes
              </button>
            </div>
          </div>
        </div>
      )}

      <MeetingInviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        meetingId={meeting.id}
        meetingName={meeting.name}
        clubId={meeting.club_id || undefined}
        darkMode={darkMode}
        meetingCategory={meeting.meeting_category}
        associationId={meeting.state_association_id || meeting.national_association_id || associationId}
        associationType={meeting.state_association_id ? 'state' : meeting.national_association_id ? 'national' : associationType}
      />

      <ShareMinutesModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        meeting={meeting}
        associationId={meeting.state_association_id || meeting.national_association_id || associationId || undefined}
        associationType={meeting.state_association_id ? 'state' : meeting.national_association_id ? 'national' : associationType}
        agendaItems={agendaItems}
        clubId={meeting.club_id || undefined}
        darkMode={darkMode}
        meetingCategory={meeting.meeting_category}
      />
    </div>
  );
};
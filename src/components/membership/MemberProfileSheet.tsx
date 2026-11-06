import React from 'react';
import { X, Mail, Phone, Globe, Calendar, House, User, Sailboat, SquarePen } from 'lucide-react';
import { AAvatar, AStatus } from '../alfie/Kit';
import { getCountryFlag } from '../../utils/countryFlags';

/**
 * Alfie theme: read-only member profile (board "MemEditB" › View member).
 * Purely presentational — renders the member record the caller already loaded.
 */

interface ProfileBoat { boat_type?: string; sail_number?: string; hull?: string; handicap?: number | null }

export interface MemberProfileData {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  membership_level?: string;
  is_financial?: boolean;
  date_joined?: string;
  user_id?: string | null;
  boats?: ProfileBoat[];
}

const ClassFlag = () => (
  <svg width="9" height="11" viewBox="0 0 10 12" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M1 .75v10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M1.75 1.25h6.5L1.75 5.5z" fill="currentColor" />
  </svg>
);

const Sec: React.FC<{ icon: React.ReactNode; title: string; right?: React.ReactNode }> = ({ icon, title, right }) => (
  <div className="a-sec">
    <span className="a-tile a-tile-sm" style={{ width: 30, height: 30 }}>{icon}</span>
    <h3>{title}</h3>
    <div className="flex-1" />
    {right}
  </div>
);

const Cell: React.FC<{ label: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ label, icon, children }) => (
  <div className="a-cell">
    {icon && <span className="a-dim flex">{icon}</span>}
    <span className="min-w-0"><span className="a-cell-l">{label}</span><span className="a-cell-v block truncate">{children || <span className="a-dim">—</span>}</span></span>
  </div>
);

export const MemberProfileSheet: React.FC<{
  member: MemberProfileData | null;
  avatarUrl?: string | null;
  loading?: boolean;
  onClose: () => void;
  onEdit?: () => void;
}> = ({ member, avatarUrl, loading, onClose, onEdit }) => {
  const m = member || {};
  const name = `${m.first_name || ''} ${m.last_name || ''}`.trim();
  const address = [m.street, [m.city, m.state, m.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const since = m.date_joined ? new Date(m.date_joined).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const boats = (m.boats || []).filter((b) => b.boat_type || b.hull);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <section className="a-msheet" role="dialog" aria-modal="true" aria-label={name ? `Member profile — ${name}` : 'Member profile'}>
        <div className="a-profile-hero relative flex flex-col items-center text-center flex-shrink-0" style={{ padding: '26px 20px 22px' }}>
          <button onClick={onClose} className="a-ib absolute" style={{ top: 16, right: 16 }} aria-label="Close"><X size={20} /></button>
          <span className="a-profile-ring">
            <AAvatar url={avatarUrl} first={m.first_name} last={m.last_name} size={84} className="a-profile-av" />
          </span>
          <h2 className="a-display a-ink" style={{ margin: '14px 0 6px', fontSize: 26, fontWeight: 600 }}>{loading ? 'Loading…' : name || 'Member'}</h2>
          {!loading && (
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 justify-center">
              <AStatus tone={m.is_financial ? 'g' : 'a'} className="text-[12.5px]">{m.is_financial ? 'Financial' : 'Unfinancial'}</AStatus>
              {m.membership_level && <span className="a-st a-mute text-[12.5px]"><span className="a-light a-light-b" style={{ boxShadow: 'none' }} />{m.membership_level}</span>}
              <AStatus tone={m.user_id ? 'b' : 'n'} className="text-[12.5px]"><span className="a-mute">{m.user_id ? 'On the app' : 'Not on the app'}</span></AStatus>
            </div>
          )}
          {onEdit && (
            <div className="flex gap-2.5 mt-[18px]">
              <button onClick={onEdit} className="a-btn a-btn-p"><SquarePen size={16} />Edit member</button>
            </div>
          )}
        </div>

        {!loading && (
          <div className="flex-1 overflow-y-auto flex flex-col gap-5" style={{ padding: '0 20px 22px' }}>
            <div>
              <Sec icon={<User size={15} />} title="Personal information" />
              <div className="a-grp">
                <div className="a-gr">
                  <Cell label="Email" icon={<Mail size={16} />}>{m.email}</Cell>
                  <Cell label="Phone" icon={<Phone size={16} />}>{m.phone}</Cell>
                </div>
                <div className="a-gr">
                  <Cell label="Country" icon={<Globe size={16} />}>{m.country || m.country_code ? <>{getCountryFlag(m.country_code || 'AU')}&nbsp; {m.country || m.country_code}</> : ''}</Cell>
                  <Cell label="Member since" icon={<Calendar size={16} />}>{since}</Cell>
                </div>
              </div>
            </div>

            <div>
              <Sec icon={<House size={15} />} title="Address" />
              <div className="a-grp"><div className="a-gr a-gr1"><Cell label="Home">{address}</Cell></div></div>
            </div>

            <div>
              <Sec icon={<Phone size={15} />} title="Emergency contact" />
              <div className="a-grp">
                <div className="a-gr a-gr3">
                  <Cell label="Name">{m.emergency_contact_name}</Cell>
                  <Cell label="Phone">{m.emergency_contact_phone}</Cell>
                  <Cell label="Relationship">{m.emergency_contact_relationship}</Cell>
                </div>
              </div>
            </div>

            <div>
              <Sec icon={<Sailboat size={15} />} title="Boats" right={<span className="a-dim text-[13px]">{boats.length} {boats.length === 1 ? 'boat' : 'boats'}</span>} />
              {boats.length === 0 ? (
                <div className="a-grp a-lnk"><span className="a-dim text-[13.5px]">No boats registered</span></div>
              ) : (
                <div className="a-grp">
                  {boats.map((b, i) => (
                    <div key={i} className="a-lnk">
                      <span className="a-tile a-tile-sm"><Sailboat size={15} /></span>
                      <div className="flex-1 min-w-0"><div className="a-ink text-[14.5px] font-semibold truncate">{b.hull || b.boat_type}</div></div>
                      {b.boat_type && <span className="a-lb-cls"><ClassFlag />{b.boat_type}{b.sail_number && <span className="a-dim" style={{ fontWeight: 500, letterSpacing: 0 }}>{b.sail_number}</span>}</span>}
                      {b.handicap !== undefined && b.handicap !== null && (
                        <span className="a-mute text-right text-[12.5px]" style={{ width: 92 }}>Handicap <b className="a-num a-ink font-semibold">{b.handicap}</b></span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

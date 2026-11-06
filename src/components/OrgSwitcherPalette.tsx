import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Star, Check, ChevronDown, Plus, Shield, X } from 'lucide-react';
import type { Organization } from '../types/club';

/**
 * Alfie club / association switcher palette (design board "OrgSwitcher").
 * Pure presentation + navigation: selecting a row calls onSelect(id) exactly
 * like the old slide-out list did.
 */

export const PLATFORM_ID = 'super-admin-dashboard';

type Org = Omit<Organization, 'type'> & { type: string };

interface OrgSwitcherPaletteProps {
  organizations: Org[];
  parentOf: Record<string, string>;
  currentId: string | null;
  isSuperAdmin: boolean;
  pinnedIds: string[];
  onPinnedChange: (ids: string[]) => void;
  recentIds: string[];
  onSelect: (id: string) => void;
  onClose: () => void;
  left: number;
  panelRef?: React.Ref<HTMLDivElement>;
}

const ADMIN_ROLES = ['admin', 'state_admin', 'national_admin', 'super_admin'];
const LEVEL: Record<string, string> = { platform: 'Platform', national: 'National', state: 'State', club: 'Club' };
const TILE_BG: Record<string, string> = { national: '#2F9E5B', state: '#2F6FDE', club: '#3E8BB0' };

export const formatOrgRole = (role?: string | null): string => {
  switch (role) {
    case 'super_admin': return 'Super Admin';
    case 'national_admin': return 'National Admin';
    case 'state_admin': return 'State Admin';
    case 'admin': return 'Admin';
    case 'editor': return 'Editor';
    case 'viewer': return 'Viewer';
    default: return 'Member';
  }
};

const initials = (name: string) => {
  const clean = (name || '').trim();
  if (/^[A-Z0-9]{2,8}$/.test(clean)) return clean.slice(0, 3);
  const words = clean.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join('') : clean.slice(0, 2)).toUpperCase();
};

export const OrgLogo: React.FC<{ org: Org; size?: number; radius?: number }> = ({ org, size = 34, radius = 10 }) => {
  const style: React.CSSProperties = { width: size, height: size, borderRadius: radius };
  if (org.type === 'platform') {
    return (
      <span className="osw-logo" style={{ ...style, background: 'linear-gradient(135deg,#2E7BFF,#8A4DFF)' }}>
        <Shield size={Math.round(size * 0.47)} />
      </span>
    );
  }
  if (org.logo) {
    return (
      <span className="osw-logo osw-logo-img" style={style}>
        <img src={org.logo} alt="" />
      </span>
    );
  }
  return (
    <span className="osw-logo" style={{ ...style, background: TILE_BG[org.type] || '#3E8BB0', fontSize: size > 40 ? 13 : 11 }}>
      {initials(org.name)}
    </span>
  );
};

export const OrgSwitcherPalette: React.FC<OrgSwitcherPaletteProps> = ({
  organizations,
  parentOf,
  currentId,
  isSuperAdmin,
  pinnedIds,
  onPinnedChange,
  recentIds,
  onSelect,
  onClose,
  left,
  panelRef,
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'assoc' | 'clubs' | 'admin'>('all');
  const [hi, setHi] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const all: Org[] = useMemo(() => {
    const list = [...organizations];
    if (isSuperAdmin && !list.some((o) => o.id === PLATFORM_ID)) {
      list.unshift({ id: PLATFORM_ID, name: 'AlfiePRO Management', type: 'platform', logo: null, role: 'super_admin' } as Org);
    }
    return list;
  }, [organizations, isSuperAdmin]);
  const byId = useMemo(() => new Map(all.map((o) => [o.id, o])), [all]);

  // Open the branches that lead to the current place
  const [open, setOpen] = useState<Set<string>>(() => {
    const s = new Set<string>();
    let p = currentId ? parentOf[currentId] : undefined;
    let guard = 0;
    while (p && guard++ < 5) { s.add(p); p = parentOf[p]; }
    return s;
  });
  const [showAll, setShowAll] = useState<Set<string>>(new Set());

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, []);
  useEffect(() => { setHi(0); }, [query, filter]);

  const q = query.trim().toLowerCase();
  const passesFilter = (o: Org) =>
    filter === 'all' ? true
      : filter === 'assoc' ? o.type !== 'club'
      : filter === 'clubs' ? o.type === 'club'
      : ADMIN_ROLES.includes(o.role || '');

  const sortByName = (a: Org, b: Org) => a.name.localeCompare(b.name);
  const childrenOf = (id: string, type?: string) =>
    all.filter((o) => parentOf[o.id] === id && (!type || o.type === type)).sort(sortByName);

  const pinned = pinnedIds.map((id) => byId.get(id)).filter(Boolean) as Org[];
  const recent = (() => {
    const ids = currentId ? [currentId, ...recentIds.filter((id) => id !== currentId)] : recentIds;
    return ids.map((id) => byId.get(id)).filter(Boolean).slice(0, 4) as Org[];
  })();

  // ── Rows (flat, in render order) so arrow keys can move through them ──
  type Row = { org: Org; depth: number; key: string; kind: 'recent' | 'browse' | 'more'; parent?: string; hidden?: number };
  const rows: Row[] = [];
  if (q) {
    all
      .filter((o) => passesFilter(o) && o.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || sortByName(a, b))
      .forEach((o) => rows.push({ org: o, depth: 0, key: `s-${o.id}`, kind: 'browse' }));
  } else {
    if (filter === 'all') recent.forEach((o) => rows.push({ org: o, depth: 0, key: `r-${o.id}`, kind: 'recent' }));
    if (filter === 'all') {
      const ids = new Set(all.map((o) => o.id));
      const roots = all
        .filter((o) => o.type === 'platform' || o.type === 'national' || !parentOf[o.id] || !ids.has(parentOf[o.id]))
        .sort((a, b) => (a.type === 'platform' ? -1 : b.type === 'platform' ? 1 : 0) || ['national', 'state', 'club'].indexOf(a.type) - ['national', 'state', 'club'].indexOf(b.type) || sortByName(a, b));
      const walk = (o: Org, depth: number) => {
        rows.push({ org: o, depth, key: `b-${o.id}`, kind: 'browse' });
        if (!open.has(o.id)) return;
        const kids = childrenOf(o.id);
        const clubsLimit = showAll.has(o.id) ? kids.length : 8;
        let clubCount = 0;
        kids.forEach((k) => {
          if (k.type === 'club') {
            clubCount++;
            if (clubCount > clubsLimit) return;
          }
          walk(k, depth + 1);
        });
        if (clubCount > clubsLimit) rows.push({ org: o, depth: depth + 1, key: `m-${o.id}`, kind: 'more', parent: o.id, hidden: clubCount - clubsLimit });
      };
      roots.forEach((r) => walk(r, 0));
    } else {
      all.filter(passesFilter).sort(sortByName).forEach((o) => rows.push({ org: o, depth: 0, key: `f-${o.id}`, kind: 'browse' }));
    }
  }
  const selectable = rows.filter((r) => r.kind !== 'more');

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-osw-hi="true"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  const choose = (id: string) => { onSelect(id); onClose(); };
  const togglePin = (id: string) =>
    onPinnedChange(pinnedIds.includes(id) ? pinnedIds.filter((x) => x !== id) : [...pinnedIds, id].slice(-8));
  const toggleOpen = (id: string) =>
    setOpen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, selectable.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = selectable[hi]; if (r) choose(r.org.id); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const r = selectable[hi];
      if (r && !q && childrenOf(r.org.id).length) {
        const isOpen = open.has(r.org.id);
        if ((e.key === 'ArrowRight' && !isOpen) || (e.key === 'ArrowLeft' && isOpen)) { e.preventDefault(); toggleOpen(r.org.id); }
      }
    }
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const next = pinnedIds.filter((id) => id !== dragId);
    next.splice(next.indexOf(targetId), 0, dragId);
    onPinnedChange(next);
    setDragId(null);
  };

  let selIndex = -1;
  const renderRow = (r: Row) => {
    if (r.kind === 'more') {
      return (
        <button key={r.key} type="button" className="osw-org osw-more" style={{ marginLeft: r.depth * 22 }} onClick={() => setShowAll((s) => new Set(s).add(r.parent!))}>
          <Plus size={15} strokeWidth={2.2} />
          Show all {r.org.name} clubs <span className="a-dim">({r.hidden} more)</span>
        </button>
      );
    }
    selIndex++;
    const idx = selIndex;
    const o = r.org;
    const isCurrent = o.id === currentId;
    const kids = !q && r.kind === 'browse' && filter === 'all' ? childrenOf(o.id).length : 0;
    const isPinned = pinnedIds.includes(o.id);
    return (
      <div
        key={r.key}
        role="option"
        aria-selected={isCurrent}
        data-osw-hi={idx === hi}
        tabIndex={-1}
        className={`osw-org ${isCurrent ? 'osw-org-on' : ''} ${idx === hi ? 'osw-org-kb' : ''}`}
        style={{ marginLeft: r.depth * 22 }}
        onMouseMove={() => idx !== hi && setHi(idx)}
        onClick={() => choose(o.id)}
      >
        {r.depth > 0 && <span className="osw-branch" aria-hidden="true" />}
        <OrgLogo org={o} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="osw-name">{o.name}</span>
            <span className="osw-lvl">{LEVEL[o.type] || 'Club'}</span>
          </div>
          <div className="osw-sub">{formatOrgRole(o.role)}{isCurrent ? ' · current' : ''}</div>
        </div>
        {isCurrent && <span className="osw-check"><Check size={17} strokeWidth={2.4} /></span>}
        {!isCurrent && idx === hi && <span className="alfie-kbd">↵</span>}
        <button
          type="button"
          className={`osw-star ${isPinned ? 'osw-star-on' : ''}`}
          title={isPinned ? 'Unpin' : 'Pin to top'}
          aria-label={isPinned ? `Unpin ${o.name}` : `Pin ${o.name}`}
          onClick={(e) => { e.stopPropagation(); togglePin(o.id); }}
        >
          <Star size={15} fill={isPinned ? 'currentColor' : 'none'} />
        </button>
        {kids > 0 && (
          <button
            type="button"
            className="osw-chev"
            aria-label={open.has(o.id) ? 'Collapse' : 'Expand'}
            onClick={(e) => { e.stopPropagation(); toggleOpen(o.id); }}
            style={{ transform: open.has(o.id) ? 'none' : 'rotate(-90deg)' }}
          >
            <ChevronDown size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    );
  };

  const recentRows = rows.filter((r) => r.kind === 'recent');
  const otherRows = rows.filter((r) => r.kind !== 'recent');

  return createPortal(
    <>
      <div className="osw-veil" onMouseDown={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="osw-pal"
        role="dialog"
        aria-label="Switch club or association"
        style={{ left }}
        onKeyDown={onKeyDown}
      >
        <div className="osw-top">
          <label className="a-field osw-search">
            <Search size={18} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clubs and associations"
              aria-label="Search clubs and associations"
            />
            {query ? (
              <button type="button" className="a-ib" style={{ width: 26, height: 26 }} onClick={() => setQuery('')} aria-label="Clear search">
                <X size={14} />
              </button>
            ) : (
              <span className="alfie-kbd">⌘O</span>
            )}
          </label>
          <div className="a-seg osw-filter" role="radiogroup" aria-label="Show">
            {([['all', 'All'], ['assoc', 'Associations'], ['clubs', 'Clubs'], ['admin', 'Admin only']] as const).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={filter === k} className={`a-seg-i ${filter === k ? 'a-seg-on' : ''}`} onClick={() => setFilter(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {!q && filter === 'all' && (
          <>
            <div className="osw-sec"><span>Pinned</span>{pinned.length > 1 && <span className="osw-sec-note">Drag to reorder</span>}</div>
            <div className="osw-pins">
              {pinned.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`osw-pin ${o.id === currentId ? 'osw-pin-on' : ''} ${dragId === o.id ? 'osw-pin-drag' : ''}`}
                  draggable
                  onDragStart={() => setDragId(o.id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(o.id)}
                  onClick={() => choose(o.id)}
                  title={o.name}
                >
                  <OrgLogo org={o} size={44} radius={13} />
                  <span className="osw-pin-n">{o.type === 'platform' ? 'Platform' : o.name}</span>
                </button>
              ))}
              {currentId && byId.get(currentId) && !pinnedIds.includes(currentId) ? (
                <button type="button" className="osw-pin" onClick={() => togglePin(currentId)} title="Pin the current place">
                  <span className="osw-logo osw-logo-add" style={{ width: 44, height: 44, borderRadius: 13 }}><Plus size={18} strokeWidth={2} /></span>
                  <span className="osw-pin-n a-dim">Pin</span>
                </button>
              ) : pinned.length === 0 ? (
                <span className="osw-sec-note" style={{ padding: '6px 10px' }}>Tap ☆ on any place to pin it here</span>
              ) : null}
            </div>
            <div className="osw-rule" />
          </>
        )}

        <div ref={listRef} className="osw-list" role="listbox" aria-label="Places">
          {recentRows.length > 0 && <div className="osw-sec">Recent</div>}
          {recentRows.map(renderRow)}
          {!q && filter === 'all' && otherRows.length > 0 && <div className="osw-sec" style={{ marginTop: 4 }}>Browse by association</div>}
          {otherRows.map(renderRow)}
          {rows.length === 0 && <div className="osw-empty">No clubs or associations match “{query}”.</div>}
        </div>

        <div className="osw-foot">
          <span><span className="alfie-kbd">↑</span> <span className="alfie-kbd">↓</span> move</span>
          <span><span className="alfie-kbd">↵</span> switch</span>
          <span><span className="alfie-kbd">⌘</span><span className="alfie-kbd">⇧</span><span className="alfie-kbd">O</span> jump back</span>
          <span style={{ flex: 1 }} />
          <span className="alfie-kbd">esc</span>
        </div>
      </div>
    </>,
    document.body
  );
};

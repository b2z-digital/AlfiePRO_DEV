import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search, Shield, Star } from 'lucide-react';
import type { Organization } from '../types/club';

/**
 * Alfie theme: the club & association switcher popover (board "OrgSwitcher").
 * Purely presentational: it lists the organisations ClubSwitcher already
 * fetched and calls back with the chosen id. Pinned / recent ids live in
 * localStorage exactly as before.
 */

export type SwitcherOrg = Organization & { parentId?: string | null };

export const PLATFORM_ID = 'super-admin-dashboard';

const ADMIN_ROLES = new Set(['admin', 'state_admin', 'national_admin', 'super_admin']);

export const formatRole = (role?: string): string => {
  switch (role) {
    case 'super_admin': return 'Super Admin';
    case 'national_admin': return 'National admin';
    case 'state_admin': return 'State admin';
    case 'admin': return 'Admin';
    case 'editor': return 'Editor';
    case 'viewer': return 'Viewer';
    default: return 'Member';
  }
};

const levelLabel = (o: SwitcherOrg) =>
  o.id === PLATFORM_ID ? 'Platform' : o.type === 'national' ? 'National' : o.type === 'state' ? 'State' : 'Club';

const TILE_COLOURS = ['#2F6FDE', '#2F9E5B', '#B7791F', '#C2564B', '#3E8BB0', '#7A5AF8', '#2E8A84'];
const tileColour = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TILE_COLOURS[h % TILE_COLOURS.length];
};
const initials = (name: string) => {
  const clean = name.replace(/[^A-Za-z0-9 ]/g, '').trim();
  if (/^[A-Z]{2,4}/.test(clean)) return clean.slice(0, clean.startsWith('NSW') ? 3 : 2);
  const words = clean.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : clean.slice(0, 2)).toUpperCase();
};

const Sail: React.FC<{ w: number; h: number }> = ({ w, h }) => (
  <svg width={w} height={h} viewBox="0 0 129.34 201.37" aria-hidden="true">
    <path fill="#0066b4" d="M92.55,0s-33.42,35.95-46.9,76.95-17.97,123.01-17.97,123.01c53.92-26.12,87.06-5.06,101.66,1.42C75.98,145.19,92.55,0,92.55,0Z" />
    <path fill="#01a2e9" d="M45.37,35.39s-23.87,31.11-37.35,61.22c-13.48,30.11-5.9,88.18-5.9,88.18,22.19-23.87,68.8-19.1,68.8-19.1C33.86,122.72,45.37,35.39,45.37,35.39Z" />
  </svg>
);

/** Square logo tile: uploaded logo, the AlfiePRO sail for clubs, or coloured initials. */
export const OrgLogo: React.FC<{ org?: SwitcherOrg | null; size?: number; radius?: number }> = ({ org, size = 34, radius }) => {
  const r = radius ?? Math.round(size * 0.3);
  const style: React.CSSProperties = { width: size, height: size, borderRadius: r };
  if (org?.id === PLATFORM_ID) {
    return <span className="osw-logo osw-logo-platform" style={style}><Shield size={Math.round(size * 0.46)} /></span>;
  }
  if (org?.logo) {
    return <span className="osw-logo osw-logo-img" style={style}><img src={org.logo} alt="" /></span>;
  }
  if (!org || org.type === 'club') {
    return (
      <span className="osw-logo osw-logo-club" style={style}>
        <Sail w={Math.round(size * 0.32)} h={Math.round(size * 0.46)} />
        {size >= 34 && org && <span className="osw-logo-abbr">{org.name.slice(0, 6)}</span>}
      </span>
    );
  }
  return (
    <span className="osw-logo" style={{ ...style, background: tileColour(org.name), fontSize: size >= 40 ? 11 : 10 }}>
      {initials(org.name)}
    </span>
  );
};

export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="osw-kbd">{children}</span>;

type Filter = 'all' | 'assoc' | 'clubs' | 'admin';

interface PaletteProps {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement>;
  layoutKey: string;
  orgs: SwitcherOrg[];
  currentId: string | null;
  pinnedIds: string[];
  recentIds: string[];
  isSuperAdmin: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
  onTogglePin: (id: string) => void;
  onReorderPins: (ids: string[]) => void;
}

export const OrgSwitcherPalette: React.FC<PaletteProps> = ({
  open, anchorRef, layoutKey, orgs, currentId, pinnedIds, recentIds, isSuperAdmin,
  onSelect, onClose, onTogglePin, onReorderPins,
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState<Set<string>>(new Set());
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const platform: SwitcherOrg | null = isSuperAdmin
    ? { id: PLATFORM_ID, name: 'AlfiePRO Management', type: 'club' as any, role: 'super_admin' }
    : null;
  const all = useMemo(() => (platform ? [platform, ...orgs] : orgs), [orgs, isSuperAdmin]);
  const byId = (id: string) => all.find((o) => o.id === id);

  // Expand the path down to the current organisation when the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const path = new Set<string>();
    let o = currentId ? byId(currentId) : undefined;
    while (o?.parentId) { path.add(o.parentId); o = byId(o.parentId); }
    setExpanded(path);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const place = () => {
      const a = anchorRef.current!.getBoundingClientRect();
      const rail = anchorRef.current!.closest('.alfie-chrome') as HTMLElement | null;
      const right = rail ? rail.getBoundingClientRect().right : a.right;
      setPos({ left: Math.round(right + 14), bottom: Math.max(12, Math.round(window.innerHeight - a.bottom - 4)) });
    };
    place();
    const t = setTimeout(place, 320); // after the rail's width transition
    window.addEventListener('resize', place);
    return () => { clearTimeout(t); window.removeEventListener('resize', place); };
  }, [open, layoutKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose]);

  const matchesFilter = (o: SwitcherOrg) => {
    if (filter === 'assoc') return o.type === 'national' || o.type === 'state' || o.id === PLATFORM_ID;
    if (filter === 'clubs') return o.type === 'club' && o.id !== PLATFORM_ID;
    if (filter === 'admin') return ADMIN_ROLES.has(o.role || '');
    return true;
  };
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const sortByName = (a: SwitcherOrg, b: SwitcherOrg) => a.name.localeCompare(b.name);
  const children = (id: string | null) =>
    orgs.filter((o) => (o.parentId || null) === id).sort(sortByName);
  const known = new Set(all.map((o) => o.id));
  const roots = orgs
    .filter((o) => !o.parentId || !known.has(o.parentId))
    .sort((a, b) => (a.type === b.type ? sortByName(a, b) : ['national', 'state', 'club'].indexOf(a.type) - ['national', 'state', 'club'].indexOf(b.type)));

  // ── Rows in display order (also the keyboard order) ──
  type Row = { kind: 'org'; org: SwitcherOrg; depth: number; section: string; expandable?: boolean }
    | { kind: 'head'; label: string; key: string }
    | { kind: 'more'; parent: SwitcherOrg; depth: number; key: string };
  const rows: Row[] = [];

  if (searching) {
    const hits = all.filter((o) => o.name.toLowerCase().includes(q) && matchesFilter(o));
    const assoc = hits.filter((o) => o.type !== 'club' || o.id === PLATFORM_ID).sort(sortByName);
    const clubs = hits.filter((o) => o.type === 'club' && o.id !== PLATFORM_ID).sort(sortByName);
    if (assoc.length) { rows.push({ kind: 'head', label: 'Associations', key: 'h-a' }); assoc.forEach((org) => rows.push({ kind: 'org', org, depth: 0, section: 's' })); }
    if (clubs.length) { rows.push({ kind: 'head', label: 'Clubs', key: 'h-c' }); clubs.forEach((org) => rows.push({ kind: 'org', org, depth: 0, section: 's' })); }
  } else {
    const recent = recentIds.map(byId).filter((o): o is SwitcherOrg => !!o && matchesFilter(o)).slice(0, 4);
    if (currentId && !recentIds.includes(currentId)) { const c = byId(currentId); if (c && matchesFilter(c)) recent.unshift(c); }
    if (recent.length) { rows.push({ kind: 'head', label: 'Recent', key: 'h-r' }); recent.forEach((org) => rows.push({ kind: 'org', org, depth: 0, section: 'r' })); }

    if (filter === 'clubs' || filter === 'admin') {
      const flat = all.filter(matchesFilter).sort(sortByName);
      if (flat.length) { rows.push({ kind: 'head', label: filter === 'clubs' ? 'All clubs' : 'Where you are an admin', key: 'h-f' }); flat.forEach((org) => rows.push({ kind: 'org', org, depth: 0, section: 'b' })); }
    } else {
      rows.push({ kind: 'head', label: 'Browse by association', key: 'h-b' });
      if (platform) rows.push({ kind: 'org', org: platform, depth: 0, section: 'b' });
      const walk = (o: SwitcherOrg, depth: number) => {
        if (!matchesFilter(o)) return;
        const kids = children(o.id).filter(matchesFilter);
        rows.push({ kind: 'org', org: o, depth, section: 'b', expandable: kids.length > 0 });
        if (!kids.length || !expanded.has(o.id)) return;
        const clubKids = kids.filter((k) => k.type === 'club');
        const limit = showAll.has(o.id) ? Infinity : 5;
        kids.filter((k) => k.type !== 'club').forEach((k) => walk(k, depth + 1));
        clubKids.slice(0, limit).forEach((k) => walk(k, depth + 1));
        if (clubKids.length > limit) rows.push({ kind: 'more', parent: o, depth: depth + 1, key: 'm-' + o.id });
      };
      roots.forEach((o) => walk(o, 0));
    }
  }

  const navRows = rows.filter((r): r is Extract<Row, { kind: 'org' }> => r.kind === 'org');
  useEffect(() => { setActive(0); }, [q, filter]);

  useEffect(() => {
    listRef.current?.querySelector('[data-kb="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(navRows.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = navRows[active]; if (r) onSelect(r.org.id); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const toggleExpand = (id: string) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const pinned = pinnedIds.map(byId).filter((o): o is SwitcherOrg => !!o);
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const next = pinnedIds.filter((id) => id !== dragId);
    next.splice(next.indexOf(targetId), 0, dragId);
    onReorderPins(next);
  };

  if (!open || !pos) return null;

  let navIndex = -1;
  return createPortal(
    <div
      ref={panelRef}
      className="osw-pal"
      role="dialog"
      aria-label="Switch organisation"
      style={{ left: pos.left, bottom: pos.bottom, maxHeight: `calc(100vh - ${pos.bottom + 12}px)` }}
      onKeyDown={onKeyDown}
    >
      <div className="osw-top">
        <label className="osw-field">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clubs and associations"
            aria-label="Search clubs and associations"
          />
          <Kbd>⌘O</Kbd>
        </label>
        <div className="osw-seg" role="tablist" aria-label="Show">
          {([['all', 'All'], ['assoc', 'Associations'], ['clubs', 'Clubs'], ['admin', 'Admin only']] as [Filter, string][]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={`osw-seg-i ${filter === k ? 'osw-seg-on' : ''}`} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
      </div>

      {!searching && (
        <>
          <div className="osw-sec osw-sec-pad">Pinned<span className="osw-sec-note">{pinned.length > 1 ? 'Drag to reorder' : pinned.length ? '' : 'Star a place to pin it'}</span></div>
          <div className="osw-pins">
            {pinned.map((o) => (
              <button
                key={o.id}
                className={`osw-pin ${dragId === o.id ? 'osw-pin-drag' : ''}`}
                draggable
                onDragStart={(e) => { setDragId(o.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { e.preventDefault(); dropOn(o.id); }}
                onDragEnd={() => setDragId(null)}
                onClick={() => onSelect(o.id)}
                title={o.name}
              >
                <OrgLogo org={o} size={44} radius={13} />
                <span className="osw-pin-n">{o.name}</span>
              </button>
            ))}
            <button className="osw-pin osw-pin-add" onClick={() => inputRef.current?.focus()} title="Find a place, then star it to pin">
              <span className="osw-pin-plus"><Plus size={18} strokeWidth={2} /></span>
              <span className="osw-pin-n">Pin</span>
            </button>
          </div>
          <div className="osw-rule" />
        </>
      )}

      <div className="osw-list" ref={listRef} role="listbox" aria-label="Clubs and associations">
        {rows.map((r) => {
          if (r.kind === 'head') return <div key={r.key} className="osw-sec">{r.label}</div>;
          if (r.kind === 'more') {
            return (
              <div key={r.key} className="osw-tree" style={{ marginLeft: 27 + (r.depth - 1) * 39 }}>
                <button className="osw-more" onClick={() => setShowAll((p) => new Set(p).add(r.parent.id))}>
                  <Plus size={15} strokeWidth={2.2} />Show all {r.parent.name} clubs
                </button>
              </div>
            );
          }
          navIndex++;
          const i = navIndex;
          const o = r.org;
          const isCurrent = o.id === currentId;
          const isPinned = pinnedIds.includes(o.id);
          const kb = i === active;
          const sub = o.id === PLATFORM_ID ? 'Platform administration' : `${formatRole(o.role)}${isCurrent ? ' · current' : ''}`;
          const row = (
            <div
              key={r.section + o.id}
              role="option"
              aria-selected={isCurrent}
              data-kb={kb ? '1' : undefined}
              tabIndex={-1}
              className={`osw-org ${isCurrent ? 'osw-org-on' : ''} ${kb && !isCurrent ? 'osw-org-kb' : ''}`}
              onMouseMove={() => active !== i && setActive(i)}
              onClick={() => onSelect(o.id)}
            >
              <OrgLogo org={o} size={34} radius={10} />
              <div className="osw-org-txt">
                <div className="osw-org-line"><span className="osw-org-name">{o.name}</span><span className="osw-lvl">{levelLabel(o)}</span></div>
                <div className="osw-org-sub">{sub}</div>
              </div>
              {o.id !== PLATFORM_ID || isSuperAdmin ? (
                <button
                  className={`osw-star ${isPinned ? 'osw-star-on' : ''}`}
                  aria-label={isPinned ? `Unpin ${o.name}` : `Pin ${o.name}`}
                  title={isPinned ? 'Unpin' : 'Pin to top'}
                  onClick={(e) => { e.stopPropagation(); onTogglePin(o.id); }}
                >
                  <Star size={15} fill={isPinned ? 'currentColor' : 'none'} />
                </button>
              ) : null}
              {r.expandable && (
                <button
                  className="osw-chev"
                  aria-label={expanded.has(o.id) ? `Collapse ${o.name}` : `Expand ${o.name}`}
                  aria-expanded={expanded.has(o.id)}
                  onClick={(e) => { e.stopPropagation(); toggleExpand(o.id); }}
                  style={{ transform: expanded.has(o.id) ? 'none' : 'rotate(-90deg)' }}
                >
                  <ChevronDown size={15} strokeWidth={2} />
                </button>
              )}
              {isCurrent ? <span className="osw-check"><Check size={17} strokeWidth={2.4} /></span> : kb ? <Kbd>↵</Kbd> : null}
            </div>
          );
          return r.depth > 0 ? (
            <div key={'t' + r.section + o.id} className="osw-tree" style={{ marginLeft: 27 + (r.depth - 1) * 39 }}>{row}</div>
          ) : row;
        })}
        {navRows.length === 0 && (
          <div className="osw-empty">
            <span className="osw-empty-tile"><Search size={18} /></span>
            <div>No clubs or associations match</div>
            <div className="osw-dim">Try a different name, or switch the filter to All.</div>
          </div>
        )}
      </div>

      <div className="osw-foot">
        <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> move</span>
        <span><Kbd>↵</Kbd> switch</span>
        <span><Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>O</Kbd> jump back</span>
        <span style={{ flex: 1 }} />
        <button className="osw-esc" onClick={onClose} aria-label="Close"><Kbd>esc</Kbd></button>
      </div>
    </div>,
    document.body
  );
};

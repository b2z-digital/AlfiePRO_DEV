import React, { useMemo, useState } from 'react';
import { LayoutTemplate, Search, X } from 'lucide-react';
import { MODULE_GROUPS, MODULES, ROW_LAYOUTS, SECTIONS, type ModuleDef, type SectionDef } from './model';
import { ModuleIcon } from './icons';

export type InsertTab = 'modules' | 'sections' | 'rows';
export type DragItem = { kind: 'module'; def: ModuleDef } | { kind: 'section'; def: SectionDef } | { kind: 'row'; widths: number[] };

interface Props {
  tab: InsertTab;
  setTab: (t: InsertTab) => void;
  /** Where things go when clicked: shown so it's clear */
  target: string;
  onPick: (item: DragItem) => void;
  onDragStart: (item: DragItem) => void;
  onDragEnd: () => void;
  onClose: () => void;
}

const SectionThumb: React.FC<{ id: string }> = ({ id }) => {
  // Tiny sketches of each ready-made section
  const shapes: Record<string, React.ReactNode> = {
    hero: <><i className="bg dark" /><i className="ln w60 lt" style={{ top: 18 }} /><i className="ln w40 lt" style={{ top: 26 }} /><i className="pill acc" style={{ top: 36 }} /></>,
    intro: <><i className="ln w30" style={{ top: 12 }} /><i className="ln w35" style={{ top: 20 }} /><i className="ln w25" style={{ top: 26 }} /><i className="ph" /></>,
    cards: <><i className="ln w30 c" style={{ top: 8 }} /><i className="card" style={{ left: 8 }} /><i className="card" style={{ left: 40 }} /><i className="card" style={{ left: 72 }} /></>,
    racing: <><i className="rowl" style={{ top: 10 }} /><i className="rowl" style={{ top: 22 }} /><i className="rowl" style={{ top: 34 }} /><i className="res" /></>,
    news: <><i className="card tall" style={{ left: 8 }} /><i className="card tall" style={{ left: 40 }} /><i className="card tall" style={{ left: 72 }} /></>,
    join: <><i className="bg brand" /><i className="ln w40 lt" style={{ top: 20 }} /><i className="pill acc r" style={{ top: 20 }} /></>,
    faq: <><i className="ln w20" style={{ top: 12 }} /><i className="acc1" style={{ top: 10 }} /><i className="acc1" style={{ top: 22 }} /><i className="acc1" style={{ top: 34 }} /></>,
    sponsors: <><i className="logo" style={{ left: 12 }} /><i className="logo" style={{ left: 36 }} /><i className="logo" style={{ left: 60 }} /><i className="logo" style={{ left: 84 }} /></>,
  };
  return <span className="sb-sth">{shapes[id] || null}</span>;
};

export const InsertPanel: React.FC<Props> = ({ tab, setTab, target, onPick, onDragStart, onDragEnd, onClose }) => {
  const [q, setQ] = useState('');
  const mods = useMemo(() => MODULES.filter(m => !q || `${m.label} ${m.note}`.toLowerCase().includes(q.toLowerCase())), [q]);
  const drag = (item: DragItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData('text/plain', 'sb-insert'); e.dataTransfer.effectAllowed = 'copy'; onDragStart(item); },
    onDragEnd,
    onClick: () => onPick(item),
  });
  return (
    <div className="sb-lp-in">
      <div className="sb-lp-h">
        <div><b>Insert</b><span>Drag onto the page, or click to add {target}</span></div>
        <button type="button" className="sb-ib" onClick={onClose} aria-label="Close insert"><X size={16} /></button>
      </div>
      <div className="sb-tabs3 in">{(['modules', 'sections', 'rows'] as InsertTab[]).map(t => <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'modules' ? 'Modules' : t === 'sections' ? 'Sections' : 'Rows'}</button>)}</div>
      <div className="sb-lp-scroll">
        {tab === 'modules' && (
          <>
            <div className="sb-field" style={{ margin: '4px 12px 12px' }}><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search modules" aria-label="Search modules" /></div>
            {MODULE_GROUPS.map(g => {
              const list = mods.filter(m => m.group === g.id);
              if (!list.length) return null;
              return (
                <div key={g.id} className="sb-mgrp">
                  <div className="sb-mgrp-h"><span>{g.label}</span>{g.note ? <small>{g.note}</small> : null}</div>
                  <div className="sb-tiles">
                    {list.map(m => (
                      <button key={m.type} type="button" className={`sb-tile${m.live ? ' live' : ''}`} title={m.note} {...drag({ kind: 'module', def: m })}>
                        <ModuleIcon type={m.type} size={18} /><span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!mods.length && <div className="sb-hint" style={{ padding: 16 }}>Nothing matches “{q}”.</div>}
          </>
        )}
        {tab === 'sections' && (
          <div className="sb-secs">
            <div className="sb-hint" style={{ padding: '0 14px 10px' }}>Ready-made sections. Every part stays editable and uses your club’s colours.</div>
            {SECTIONS.map(s => (
              <button key={s.id} type="button" className="sb-sec" {...drag({ kind: 'section', def: s })}>
                <SectionThumb id={s.id} />
                <span className="t"><b>{s.label}</b><small>{s.note}</small></span>
              </button>
            ))}
          </div>
        )}
        {tab === 'rows' && (
          <div className="sb-rowpick">
            <div className="sb-hint" style={{ padding: '0 14px 10px' }}>An empty section with columns. Columns stack on phones by themselves.</div>
            <div className="sb-rowgrid">
              {ROW_LAYOUTS.map(l => (
                <button key={l.id} type="button" className="sb-rowl" title={l.label} aria-label={l.label} {...drag({ kind: 'row', widths: l.widths })}>
                  <span className="pv">{l.widths.map((w, i) => <i key={i} style={{ flex: w }} />)}</span>
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="sb-btn" style={{ margin: '14px 14px 0' }} onClick={() => setTab('sections')}><LayoutTemplate size={15} />Or start from a ready-made section</button>
          </div>
        )}
      </div>
    </div>
  );
};

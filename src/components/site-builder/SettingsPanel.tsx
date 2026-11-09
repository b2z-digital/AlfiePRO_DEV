import React, { useState } from 'react';
import { Copy, EyeOff, Hash, MousePointerClick, Settings2, Trash2 } from 'lucide-react';
import type { DeviceType, EventPageRow, EventWidgetConfig } from '../../types/eventWidgets';
import { EventWidgetSettingsModal } from '../events/EventWidgetSettingsModal';
import { cleanHtml } from '../site/SiteModules';
import { moduleDef, moduleLabel, ROW_LAYOUTS, type Sel } from './model';
import { patchCol, patchMod, patchModSettings, patchRow, setLayout, spacingFor, toggleHide, withSpacing } from './ops';
import { Colour, DeviceIcon, FieldControl, Group, ImagePick, Num, Row, Seg, SpacingBox, Toggle, Txt } from './fields';
import { ModuleIcon } from './icons';

type Tab = 'content' | 'design' | 'advanced';
interface Props {
  rows: EventPageRow[];
  sel: Sel | null;
  device: DeviceType;
  clubId: string;
  pages: { slug: string; title: string }[];
  site: { primary: string; dark: string; accent: string };
  onChange: (rows: EventPageRow[], coalesce?: string) => void;
  onAct: (act: 'dup' | 'del') => void;
  onSelect: (sel: Sel | null) => void;
}

const DEVICE_WORD: Record<DeviceType, string> = { desktop: 'desktop', tablet: 'tablets', mobile: 'phones' };
const sumBox = (b: { top: number; right: number; bottom: number; left: number }) => `${b.top} · ${b.right} · ${b.bottom} · ${b.left}`;

const ShowOn: React.FC<{ hideOn?: DeviceType[]; onToggle: (d: DeviceType) => void }> = ({ hideOn, onToggle }) => (
  <div className="sb-showon">
    {(['desktop', 'tablet', 'mobile'] as DeviceType[]).map(d => (
      <button key={d} type="button" className={hideOn?.includes(d) ? '' : 'on'} aria-pressed={!hideOn?.includes(d)} onClick={() => onToggle(d)}>
        <DeviceIcon d={d} size={15} />{d === 'mobile' ? 'Phone' : d[0].toUpperCase() + d.slice(1)}
      </button>
    ))}
  </div>
);

const Anchor: React.FC<{ value?: string; onChange: (v: string | undefined) => void }> = ({ value, onChange }) => (
  <Row label="Link name" note="Lets a button or menu item jump here" stack>
    <div className="sb-field"><Hash size={14} /><input value={value || ''} placeholder="e.g. join" onChange={e => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+/, '') || undefined)} aria-label="Link name" /></div>
  </Row>
);

export const SettingsPanel: React.FC<Props> = ({ rows, sel, device, clubId, pages, site, onChange, onAct, onSelect }) => {
  const [tab, setTab] = useState<Tab>('content');
  const [legacy, setLegacy] = useState<EventWidgetConfig | null>(null);
  if (!sel) {
    return (
      <div className="sb-rp-empty">
        <MousePointerClick size={22} />
        <b>Nothing selected</b>
        <span>Click anything on the page to change it, or drag something in from Insert.</span>
      </div>
    );
  }
  const row = rows.find(r => r.id === sel.row);
  const col = sel.kind !== 'row' ? row?.columns.find(c => c.id === sel.col) : undefined;
  const mod = sel.kind === 'mod' ? col?.widgets.find(w => w.id === sel.mod) : undefined;
  if (!row || (sel.kind !== 'row' && !col) || (sel.kind === 'mod' && !mod)) return null;

  const rowName = row.name || `Section ${rows.indexOf(row) + 1}`;
  const colIndex = col ? row.columns.indexOf(col) + 1 : 0;
  const head = sel.kind === 'mod'
    ? { title: moduleLabel(mod!), where: `In ${rowName} · Column ${colIndex}`, cls: 'mod' }
    : sel.kind === 'col' ? { title: `Column ${colIndex}`, where: `In ${rowName}`, cls: 'col' } : { title: rowName, where: `${row.columns.length} column${row.columns.length === 1 ? '' : 's'}`, cls: 'row' };

  const tabs: { id: Tab; l: string }[] = sel.kind === 'row' ? [{ id: 'content', l: 'Layout' }, { id: 'design', l: 'Design' }, { id: 'advanced', l: 'Advanced' }] : [{ id: 'content', l: 'Content' }, { id: 'design', l: 'Design' }, { id: 'advanced', l: 'Advanced' }];

  /* ── Module ── */
  const moduleBody = () => {
    const def = moduleDef(mod!.type);
    const set = (k: string, v: unknown) => onChange(patchModSettings(rows, mod!.id, { [k]: k === 'content' ? cleanHtml(String(v || '')) : v }), `${mod!.id}:${k}`);
    const sp = (kind: 'padding' | 'margin') => spacingFor(mod as any, kind, device);
    if (tab === 'content') {
      if (!def) {
        return (
          <div className="sb-legacy">
            <p>This was made with the older page builder. It still works and looks the same on your site.</p>
            <button type="button" className="sb-btn" onClick={() => setLegacy(mod!)}><Settings2 size={15} />Open its settings</button>
          </div>
        );
      }
      if (!def.fields.length) return <div className="sb-hint" style={{ padding: 16 }}>Nothing to set here. Use Design for spacing.</div>;
      return <div className="sb-pad">{def.fields.map(f => <FieldControl key={f.k} f={f} value={mod!.settings?.[f.k]} onChange={v => set(f.k, v)} pages={pages} device={device} all={mod!.settings} site={site} />)}</div>;
    }
    if (tab === 'design') {
      const m = sp('margin'); const p = sp('padding');
      return (
        <>
          {def?.design?.length ? <Group title="Style">{def.design.map(f => <FieldControl key={f.k} f={f} value={mod!.settings?.[f.k]} onChange={v => set(f.k, v)} pages={pages} device={device} all={mod!.settings} site={site} />)}</Group> : null}
          <Group title="Spacing" summary={`${sumBox(m.shown)} / ${sumBox(p.shown)}`} open={!def?.design?.length}>
            <div className="sb-hint">For {DEVICE_WORD[device]}. Switch screens at the top to set others.</div>
            <SpacingBox label="Outside (margin)" device={device} own={m.own} shown={m.shown} onChange={v => onChange(rows.map(r => r.id !== row.id ? r : { ...r, columns: r.columns.map(c => c.id !== col!.id ? c : { ...c, widgets: c.widgets.map(w => w.id !== mod!.id ? w : withSpacing(w as any, 'margin', device, v as any, false)) }) }), `${mod!.id}:margin`)} />
            <SpacingBox label="Inside (padding)" device={device} own={p.own} shown={p.shown} onChange={v => onChange(rows.map(r => r.id !== row.id ? r : { ...r, columns: r.columns.map(c => c.id !== col!.id ? c : { ...c, widgets: c.widgets.map(w => w.id !== mod!.id ? w : withSpacing(w as any, 'padding', device, v as any, false)) }) }), `${mod!.id}:padding`)} />
          </Group>
        </>
      );
    }
    return (
      <div className="sb-pad">
        <Row label="Show on" stack><ShowOn hideOn={mod!.hideOn} onToggle={d => onChange(patchMod(rows, mod!.id, { hideOn: toggleHide(mod!, d).hideOn }))} /></Row>
        <Anchor value={mod!.anchor} onChange={v => onChange(patchMod(rows, mod!.id, { anchor: v }), `${mod!.id}:anchor`)} />
      </div>
    );
  };

  /* ── Column ── */
  const columnBody = () => {
    const c = col!;
    if (tab === 'content') {
      const others = row.columns.filter(x => x.id !== c.id);
      return (
        <div className="sb-pad">
          <Row label="Width" note="Out of 12 across the section" stack>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="range" min={1} max={12 - others.length} value={c.width} aria-label="Column width"
                onChange={e => {
                  const w = Number(e.target.value);
                  // Take or give the difference from the next column so the section stays full
                  const idx = row.columns.indexOf(c);
                  const nb = row.columns[idx + 1] || row.columns[idx - 1];
                  if (!nb) return;
                  const diff = w - c.width;
                  if (nb.width - diff < 1) return;
                  onChange(rows.map(r => r.id !== row.id ? r : { ...r, columns: r.columns.map(x => x.id === c.id ? { ...x, width: w } : x.id === nb.id ? { ...x, width: nb.width - diff } : x) }), `${c.id}:width`);
                }} />
              <span className="sb-pill">{c.width}/12</span>
            </div>
          </Row>
          <Row label="Line up" stack><Seg value={c.verticalAlign || 'top'} options={[{ v: 'top', l: 'Top' }, { v: 'center', l: 'Middle' }, { v: 'bottom', l: 'Bottom' }]} onChange={v => onChange(patchCol(rows, c.id, { verticalAlign: v as any }))} label="Line up" /></Row>
        </div>
      );
    }
    if (tab === 'design') {
      const p = spacingFor(c as any, 'padding', device);
      return (
        <>
          <Group title="Background">
            <Row label="Colour" stack><Colour value={c.background?.type === 'color' ? c.background.value : ''} allowNone site={site} label="Column background" onChange={v => onChange(patchCol(rows, c.id, { background: v ? { type: 'color', value: v } : undefined }))} /></Row>
            <Row label="Picture" stack><ImagePick value={c.background?.type === 'image' ? c.background.value : ''} label="Column picture" onChange={v => onChange(patchCol(rows, c.id, { background: v ? { type: 'image', value: v } : undefined }))} /></Row>
          </Group>
          <Group title="Spacing" summary={sumBox(p.shown)}>
            <div className="sb-hint">For {DEVICE_WORD[device]}.</div>
            <SpacingBox label="Inside (padding)" device={device} own={p.own} shown={p.shown} onChange={v => onChange(rows.map(r => r.id !== row.id ? r : { ...r, columns: r.columns.map(x => x.id !== c.id ? x : withSpacing(x as any, 'padding', device, v as any, true)) }), `${c.id}:padding`)} />
          </Group>
        </>
      );
    }
    return <div className="sb-pad"><Row label="Show on" stack><ShowOn hideOn={c.hideOn} onToggle={d => onChange(patchCol(rows, c.id, { hideOn: toggleHide(c, d).hideOn }))} /></Row></div>;
  };

  /* ── Section ── */
  const rowBody = () => {
    const r = row;
    const widths = r.columns.map(c => c.width).join('-');
    if (tab === 'content') {
      return (
        <div className="sb-pad">
          <Row label="Name" note="Shown in Layers" stack><Txt value={r.name} placeholder={rowName} onChange={v => onChange(patchRow(rows, r.id, { name: v || undefined }), `${r.id}:name`)} label="Section name" /></Row>
          <Row label="Columns" stack>
            <div className="sb-layouts">
              {ROW_LAYOUTS.map(l => (
                <button key={l.id} type="button" className={l.widths.join('-') === widths ? 'on' : ''} title={l.label} aria-label={l.label} onClick={() => onChange(setLayout(rows, r.id, l.widths))}>
                  {l.widths.map((w, i) => <i key={i} style={{ flex: w }} />)}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Gap" device={device === 'desktop' ? null : device}><Num value={(r.responsiveColumnGap as any)?.[device] ?? r.columnGap ?? 16} min={0} max={120} unit="px" label="Gap between columns"
            onChange={v => onChange(patchRow(rows, r.id, device === 'desktop' ? { columnGap: v ?? undefined } : { responsiveColumnGap: { ...(r.responsiveColumnGap || {}), [device]: v ?? undefined } }), `${r.id}:gap`)} /></Row>
          <Row label="Line up" stack><Seg value={r.columns.every(c => c.verticalAlign === 'center') ? 'center' : r.columns.every(c => c.verticalAlign === 'bottom') ? 'bottom' : 'top'} options={[{ v: 'top', l: 'Top' }, { v: 'center', l: 'Middle' }, { v: 'bottom', l: 'Bottom' }]} label="Line up columns"
            onChange={v => onChange(patchRow(rows, r.id, { columns: r.columns.map(c => ({ ...c, verticalAlign: v as any })) }))} /></Row>
          <Row label="Width" stack><Seg value={r.fullWidth ? 'full' : 'site'} options={[{ v: 'site', l: 'Site width' }, { v: 'full', l: 'Full width' }]} label="Section width" onChange={v => onChange(patchRow(rows, r.id, { fullWidth: v === 'full' }))} /></Row>
          <Row label="On phones" stack><Seg value={r.stackOnMobile ? (r.reverseOnMobile ? 'reverse' : 'stack') : 'side'} options={[{ v: 'stack', l: 'Stack' }, { v: 'reverse', l: 'Stack, last first' }, { v: 'side', l: 'Side by side' }]} label="On phones"
            onChange={v => onChange(patchRow(rows, r.id, { stackOnMobile: v !== 'side', reverseOnMobile: v === 'reverse' }))} /></Row>
          <Row label="Stack on tablets"><Toggle checked={!!r.stackOnTablet} onChange={v => onChange(patchRow(rows, r.id, { stackOnTablet: v }))} label="Stack on tablets" /></Row>
          <Row label="Min height" device={device === 'desktop' ? null : device}><Num value={parseInt(String((r.responsiveMinHeight as any)?.[device] ?? r.minHeight ?? ''), 10) || null} min={0} max={1400} step={10} unit="px" placeholder="Auto" label="Minimum height"
            onChange={v => onChange(patchRow(rows, r.id, device === 'desktop' ? { minHeight: v ? `${v}px` : undefined } : { responsiveMinHeight: { ...(r.responsiveMinHeight || {}), [device]: v ? `${v}px` : undefined } }), `${r.id}:minh`)} /></Row>
        </div>
      );
    }
    if (tab === 'design') {
      const bg = r.background;
      const kind = !bg ? 'none' : bg.mediaType === 'video' ? 'video' : bg.mediaType === 'image' ? 'image' : bg.type === 'gradient' ? 'gradient' : 'color';
      const grad = /linear-gradient\((\d+)deg,\s*(#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/i.exec(bg?.type === 'gradient' ? bg.value : '') || null;
      const gAngle = grad ? Number(grad[1]) : 160; const g1 = grad ? grad[2] : site.dark; const g2 = grad ? grad[3] : site.primary;
      const setBg = (b: EventPageRow['background'] | undefined) => onChange(patchRow(rows, r.id, { background: b }), `${r.id}:bg`);
      const m = spacingFor(r as any, 'margin', device); const p = spacingFor(r as any, 'padding', device);
      const overlay = (
        <>
          <Row label="Shade the picture" stack><Seg value={bg?.overlayType || 'none'} options={[{ v: 'none', l: 'None' }, { v: 'solid', l: 'Even' }, { v: 'gradient', l: 'Fade' }]} label="Shade" onChange={v => setBg({ ...bg!, overlayType: v as any, overlayColor: bg?.overlayColor || '#000000', overlayGradientStart: bg?.overlayGradientStart || '#000000', overlayGradientEnd: bg?.overlayGradientEnd || '#000000', overlayGradientDirection: 'to bottom', overlayOpacity: bg?.overlayOpacity ?? 45 })} /></Row>
          {bg?.overlayType && bg.overlayType !== 'none' ? <Row label="Strength"><Num value={bg.overlayOpacity ?? 45} min={0} max={100} unit="%" label="Shade strength" onChange={v => setBg({ ...bg!, overlayOpacity: v ?? 0 })} /></Row> : null}
        </>
      );
      return (
        <>
          <Group title="Background">
            <div className="sb-pad0">
              <Seg value={kind} label="Background" options={[{ v: 'none', l: 'None' }, { v: 'color', l: 'Colour' }, { v: 'gradient', l: 'Gradient' }, { v: 'image', l: 'Picture' }, { v: 'video', l: 'Video' }]}
                onChange={v => setBg(v === 'none' ? undefined : v === 'color' ? { type: 'color', value: '#F5F8FC' } : v === 'gradient' ? { type: 'gradient', value: `linear-gradient(${gAngle}deg, ${g1}, ${g2})` } : v === 'image' ? { type: 'image', value: '', mediaType: 'image', overlayType: 'solid', overlayColor: '#000000', overlayOpacity: 40 } : { type: 'image', value: '', mediaType: 'video', videoUrl: '', overlayType: 'solid', overlayColor: '#000000', overlayOpacity: 40 })} />
            </div>
            {kind === 'color' && <Row label="Colour" stack><Colour value={bg!.value} site={site} label="Section colour" onChange={v => setBg({ type: 'color', value: v || '#FFFFFF' })} /></Row>}
            {kind === 'gradient' && (
              <>
                <Row label="From" stack><Colour value={g1} site={site} label="Gradient start" onChange={v => setBg({ type: 'gradient', value: `linear-gradient(${gAngle}deg, ${v || g1}, ${g2})` })} /></Row>
                <Row label="To" stack><Colour value={g2} site={site} label="Gradient end" onChange={v => setBg({ type: 'gradient', value: `linear-gradient(${gAngle}deg, ${g1}, ${v || g2})` })} /></Row>
                <Row label="Angle"><Num value={gAngle} min={0} max={360} step={5} unit="°" label="Gradient angle" onChange={v => setBg({ type: 'gradient', value: `linear-gradient(${v ?? 0}deg, ${g1}, ${g2})` })} /></Row>
              </>
            )}
            {kind === 'image' && (
              <>
                <Row label="Picture" stack><ImagePick value={bg!.value} label="Section picture" onChange={v => setBg({ ...bg!, value: v })} /></Row>
                <Row label="Focus" stack><Seg value={bg!.imagePosition || 'center center'} label="Picture focus" options={[{ v: 'center top', l: 'Top' }, { v: 'center center', l: 'Middle' }, { v: 'center bottom', l: 'Bottom' }]} onChange={v => setBg({ ...bg!, imagePosition: v })} /></Row>
                <Row label="Slow zoom"><Toggle checked={!!bg!.kenBurnsEffect} label="Slow zoom" onChange={v => setBg({ ...bg!, kenBurnsEffect: v })} /></Row>
                {overlay}
              </>
            )}
            {kind === 'video' && (
              <>
                <Row label="YouTube link" stack note="Plays muted on a loop behind the section"><Txt value={bg!.videoUrl} placeholder="https://www.youtube.com/watch?v=…" label="YouTube link" onChange={v => setBg({ ...bg!, videoUrl: v })} /></Row>
                {overlay}
              </>
            )}
          </Group>
          <Group title="Spacing" summary={`${sumBox(m.shown)} / ${sumBox(p.shown)}`}>
            <div className="sb-hint">For {DEVICE_WORD[device]}. Switch screens at the top to set others.</div>
            <SpacingBox label="Outside (margin)" device={device} own={m.own} shown={m.shown} onChange={v => onChange(rows.map(x => x.id !== r.id ? x : withSpacing(x as any, 'margin', device, v as any, true)), `${r.id}:margin`)} />
            <SpacingBox label="Inside (padding)" device={device} own={p.own} shown={p.shown} onChange={v => onChange(rows.map(x => x.id !== r.id ? x : withSpacing(x as any, 'padding', device, v as any, true)), `${r.id}:padding`)} />
          </Group>
        </>
      );
    }
    return (
      <div className="sb-pad">
        <Row label="Show on" stack><ShowOn hideOn={r.hideOn} onToggle={d => onChange(patchRow(rows, r.id, { hideOn: toggleHide(r, d).hideOn }))} /></Row>
        <Anchor value={r.anchor} onChange={v => onChange(patchRow(rows, r.id, { anchor: v }), `${r.id}:anchor`)} />
      </div>
    );
  };

  const hidden = (sel.kind === 'mod' ? mod!.hideOn : sel.kind === 'col' ? col!.hideOn : row.hideOn)?.includes(device);
  return (
    <div className="sb-settings">
      <div className={`sb-rp-h ${head.cls}`}>
        <span className="ic">{sel.kind === 'mod' ? <ModuleIcon type={mod!.type} size={17} /> : sel.kind === 'col' ? <span className="colic" /> : <span className="rowic" />}</span>
        <div className="t"><b>{head.title}</b><span>{head.where}</span></div>
        {sel.kind !== 'col' && <button type="button" className="sb-ib" aria-label="Duplicate" title="Duplicate" onClick={() => onAct('dup')}><Copy size={15} /></button>}
        <button type="button" className="sb-ib" aria-label="Delete" title="Delete" onClick={() => onAct('del')}><Trash2 size={15} /></button>
      </div>
      {hidden && <div className="sb-hidden-note"><EyeOff size={14} />Hidden on {DEVICE_WORD[device]}. Visitors on other screens still see it.</div>}
      <div className="sb-tabs3">{tabs.map(t => <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.l}</button>)}</div>
      <div className="sb-rp-scroll">
        {sel.kind === 'mod' ? moduleBody() : sel.kind === 'col' ? columnBody() : rowBody()}
      </div>
      {sel.kind !== 'row' && (
        <div className="sb-crumbs-mini">
          <button type="button" onClick={() => onSelect({ kind: 'row', row: row.id })}>{rowName}</button>
          {sel.kind === 'mod' && <>›<button type="button" onClick={() => onSelect({ kind: 'col', row: row.id, col: col!.id })}>Column {colIndex}</button></>}
        </div>
      )}
      {legacy && (
        <EventWidgetSettingsModal widget={legacy} websiteId={clubId} darkMode onClose={() => setLegacy(null)}
          onSave={w => { onChange(patchMod(rows, w.id, { settings: w.settings, responsiveSettings: w.responsiveSettings, responsivePadding: w.responsivePadding, responsiveMargin: w.responsiveMargin } as any)); setLegacy(null); }} />
      )}
    </div>
  );
};

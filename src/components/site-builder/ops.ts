// Pure edits on a page's rows. Every function returns new rows and never changes its input.
import type { DeviceType, EventPageColumn, EventPageRow, EventWidgetConfig } from '../../types/eventWidgets';
import { cloneModule, cloneRow, makeColumn, makeRow, type Sel } from './model';

const mapRow = (rows: EventPageRow[], id: string, fn: (r: EventPageRow) => EventPageRow) => rows.map(r => (r.id === id ? fn(r) : r));
const mapCol = (rows: EventPageRow[], colId: string, fn: (c: EventPageColumn) => EventPageColumn) =>
  rows.map(r => (r.columns.some(c => c.id === colId) ? { ...r, columns: r.columns.map(c => (c.id === colId ? fn(c) : c)) } : r));
const mapMod = (rows: EventPageRow[], modId: string, fn: (w: EventWidgetConfig) => EventWidgetConfig) =>
  rows.map(r => ({ ...r, columns: r.columns.map(c => (c.widgets.some(w => w.id === modId) ? { ...c, widgets: c.widgets.map(w => (w.id === modId ? fn(w) : w)) } : c)) }));

export const patchRow = (rows: EventPageRow[], id: string, patch: Partial<EventPageRow>) => mapRow(rows, id, r => ({ ...r, ...patch }));
export const patchCol = (rows: EventPageRow[], id: string, patch: Partial<EventPageColumn>) => mapCol(rows, id, c => ({ ...c, ...patch }));
export const patchMod = (rows: EventPageRow[], id: string, patch: Partial<EventWidgetConfig>) => mapMod(rows, id, w => ({ ...w, ...patch }));
export const patchModSettings = (rows: EventPageRow[], id: string, patch: Record<string, any>) => mapMod(rows, id, w => ({ ...w, settings: { ...(w.settings || {}), ...patch } }));

export function insertRow(rows: EventPageRow[], row: EventPageRow, index: number): EventPageRow[] {
  const out = [...rows];
  out.splice(Math.max(0, Math.min(index, out.length)), 0, row);
  return out;
}

export function insertModule(rows: EventPageRow[], colId: string, mod: EventWidgetConfig, index?: number): EventPageRow[] {
  return mapCol(rows, colId, c => {
    const ws = [...c.widgets];
    ws.splice(index === undefined ? ws.length : Math.max(0, Math.min(index, ws.length)), 0, mod);
    return { ...c, widgets: ws };
  });
}

/** Where a new module goes, given what's selected. Adds a section when nothing is. */
export function placeModule(rows: EventPageRow[], sel: Sel | null, mod: EventWidgetConfig): { rows: EventPageRow[]; sel: Sel } {
  if (sel?.kind === 'mod') {
    const row = rows.find(r => r.id === sel.row);
    const col = row?.columns.find(c => c.id === sel.col);
    const i = col ? col.widgets.findIndex(w => w.id === sel.mod) : -1;
    if (col) return { rows: insertModule(rows, col.id, mod, i + 1), sel: { kind: 'mod', row: sel.row, col: col.id, mod: mod.id } };
  }
  if (sel?.kind === 'col') return { rows: insertModule(rows, sel.col, mod), sel: { kind: 'mod', row: sel.row, col: sel.col, mod: mod.id } };
  if (sel?.kind === 'row') {
    const row = rows.find(r => r.id === sel.row);
    if (row?.columns[0]) return { rows: insertModule(rows, row.columns[0].id, mod), sel: { kind: 'mod', row: row.id, col: row.columns[0].id, mod: mod.id } };
  }
  const row = makeRow([12], [[mod]]);
  return { rows: [...rows, row], sel: { kind: 'mod', row: row.id, col: row.columns[0].id, mod: mod.id } };
}

export function removeAt(rows: EventPageRow[], sel: Sel): EventPageRow[] {
  if (sel.kind === 'row') return rows.filter(r => r.id !== sel.row);
  if (sel.kind === 'col') {
    return mapRow(rows, sel.row, r => {
      const left = r.columns.filter(c => c.id !== sel.col);
      if (!left.length) return r;
      // Give the space to the others
      const freed = r.columns.find(c => c.id === sel.col)?.width || 0;
      const each = Math.floor(freed / left.length);
      return { ...r, columns: left.map((c, i) => ({ ...c, width: c.width + each + (i === left.length - 1 ? freed - each * left.length : 0) })) };
    });
  }
  return mapCol(rows, sel.col, c => ({ ...c, widgets: c.widgets.filter(w => w.id !== sel.mod) }));
}

export function duplicateAt(rows: EventPageRow[], sel: Sel): { rows: EventPageRow[]; sel: Sel } {
  if (sel.kind === 'row') {
    const i = rows.findIndex(r => r.id === sel.row);
    if (i < 0) return { rows, sel };
    const copy = cloneRow(rows[i]);
    return { rows: insertRow(rows, copy, i + 1), sel: { kind: 'row', row: copy.id } };
  }
  if (sel.kind === 'mod') {
    const row = rows.find(r => r.id === sel.row);
    const col = row?.columns.find(c => c.id === sel.col);
    const i = col?.widgets.findIndex(w => w.id === sel.mod) ?? -1;
    if (!col || i < 0) return { rows, sel };
    const copy = cloneModule(col.widgets[i]);
    return { rows: insertModule(rows, col.id, copy, i + 1), sel: { kind: 'mod', row: sel.row, col: col.id, mod: copy.id } };
  }
  return { rows, sel };
}

export function moveAt(rows: EventPageRow[], sel: Sel, dir: -1 | 1): EventPageRow[] {
  if (sel.kind === 'row') {
    const i = rows.findIndex(r => r.id === sel.row);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return rows;
    const out = [...rows];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  }
  if (sel.kind === 'mod') {
    // Within the column; at the ends, hop into the next or previous section's first column
    const ri = rows.findIndex(r => r.id === sel.row);
    const row = rows[ri];
    const col = row?.columns.find(c => c.id === sel.col);
    const i = col?.widgets.findIndex(w => w.id === sel.mod) ?? -1;
    if (!col || i < 0) return rows;
    const j = i + dir;
    if (j >= 0 && j < col.widgets.length) {
      return mapCol(rows, col.id, c => { const ws = [...c.widgets]; [ws[i], ws[j]] = [ws[j], ws[i]]; return { ...c, widgets: ws }; });
    }
    return rows;
  }
  return rows;
}

/** Move a module to a column and position (drag on the canvas or in Layers). */
export function moveModule(rows: EventPageRow[], modId: string, toCol: string, index: number): EventPageRow[] {
  let mod: EventWidgetConfig | null = null;
  let fromCol = '';
  let fromIdx = -1;
  for (const r of rows) for (const c of r.columns) { const i = c.widgets.findIndex(w => w.id === modId); if (i >= 0) { mod = c.widgets[i]; fromCol = c.id; fromIdx = i; } }
  if (!mod) return rows;
  let at = index;
  if (fromCol === toCol && fromIdx < index) at -= 1;
  const without = mapCol(rows, fromCol, c => ({ ...c, widgets: c.widgets.filter(w => w.id !== modId) }));
  return insertModule(without, toCol, mod, at);
}

/** Change a section's columns, keeping every module (extra columns fold into the last one). */
export function setLayout(rows: EventPageRow[], rowId: string, widths: number[]): EventPageRow[] {
  return mapRow(rows, rowId, r => {
    const cols = widths.map((w, i) => (r.columns[i] ? { ...r.columns[i], width: w } : makeColumn(w)));
    const extra = r.columns.slice(widths.length).flatMap(c => c.widgets);
    if (extra.length) cols[cols.length - 1] = { ...cols[cols.length - 1], widgets: [...cols[cols.length - 1].widgets, ...extra] };
    return { ...r, columns: cols };
  });
}

/** Spacing for one screen size. Desktop also sets the base value older pages use. */
type Box = { top: number; bottom: number; left: number; right: number };
export function spacingFor(item: { padding?: Box; responsivePadding?: any; margin?: Box; responsiveMargin?: any }, kind: 'padding' | 'margin', device: DeviceType): { own: Partial<Box> | null; shown: Box } {
  const resp = kind === 'padding' ? item.responsivePadding : item.responsiveMargin;
  const base = (kind === 'padding' ? item.padding : item.margin) as Box | undefined;
  const own = resp?.[device] || (device === 'desktop' ? base : null) || null;
  // Same rule as the public site: this screen's value, else the base (desktop) value
  const shown = own || base || { top: 0, bottom: 0, left: 0, right: 0 };
  return { own, shown: { top: shown.top ?? 0, bottom: shown.bottom ?? 0, left: shown.left ?? 0, right: shown.right ?? 0 } };
}

export function withSpacing<T extends { padding?: Box; responsivePadding?: any; margin?: Box; responsiveMargin?: any }>(item: T, kind: 'padding' | 'margin', device: DeviceType, value: Box | null, setBase: boolean): T {
  const rk = kind === 'padding' ? 'responsivePadding' : 'responsiveMargin';
  const resp = { ...((item as any)[rk] || {}) };
  if (value) resp[device] = value; else delete resp[device];
  const out: any = { ...item, [rk]: resp };
  if (setBase && device === 'desktop') out[kind] = value || undefined;
  return out;
}

export function toggleHide<T extends { hideOn?: DeviceType[] }>(item: T, device: DeviceType): T {
  const has = item.hideOn?.includes(device);
  const next = has ? (item.hideOn || []).filter(d => d !== device) : [...(item.hideOn || []), device];
  return { ...item, hideOn: next.length ? next : undefined };
}

import React, { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, X } from 'lucide-react';
import type { DeviceType, EventPageRow } from '../../types/eventWidgets';
import { moduleLabel, type Sel } from './model';
import { patchCol, patchMod, patchRow, toggleHide } from './ops';
import { ModuleIcon } from './icons';

interface Props {
  rows: EventPageRow[];
  sel: Sel | null;
  device: DeviceType;
  onSelect: (s: Sel) => void;
  onChange: (rows: EventPageRow[]) => void;
  onClose: () => void;
}

const Sortable: React.FC<{ id: string; children: (handle: React.HTMLAttributes<HTMLElement>) => React.ReactNode }> = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>{children({ ...attributes, ...listeners })}</div>;
};

export const LayersPanel: React.FC<Props> = ({ rows, sel, device, onSelect, onChange, onClose }) => {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const word = device === 'mobile' ? 'phones' : device === 'tablet' ? 'tablets' : 'desktop';

  const onRowsEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = rows.findIndex(r => r.id === e.active.id); const to = rows.findIndex(r => r.id === e.over!.id);
    if (from >= 0 && to >= 0) onChange(arrayMove(rows, from, to));
  };
  const onModsEnd = (rowId: string, colId: string) => (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    onChange(rows.map(r => r.id !== rowId ? r : { ...r, columns: r.columns.map(c => {
      if (c.id !== colId) return c;
      const from = c.widgets.findIndex(w => w.id === e.active.id); const to = c.widgets.findIndex(w => w.id === e.over!.id);
      return from >= 0 && to >= 0 ? { ...c, widgets: arrayMove(c.widgets, from, to) } : c;
    }) }));
  };
  const eye = (hidden: boolean, toggle: () => void, name: string) => (
    <button type="button" className={`sb-eye${hidden ? ' off' : ''}`} title={hidden ? `Hidden on ${word}. Show it` : `Hide on ${word}`} aria-label={hidden ? `Show ${name} on ${word}` : `Hide ${name} on ${word}`} onClick={e => { e.stopPropagation(); toggle(); }}>
      {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  );

  return (
    <div className="sb-lp-in">
      <div className="sb-lp-h">
        <div><b>Layers</b><span>Drag to reorder · eye hides on {word}</span></div>
        <button type="button" className="sb-ib" onClick={onClose} aria-label="Close layers"><X size={16} /></button>
      </div>
      <div className="sb-lp-scroll sb-layers">
        <div className="sb-ly pinned"><span className="dot hdr" />Header<small>Every page</small></div>
        {rows.length === 0 && <div className="sb-hint" style={{ padding: '10px 14px' }}>No sections yet.</div>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onRowsEnd}>
          <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
            {rows.map((r, ri) => {
              const isOpen = !closed[r.id];
              const rowSel = sel?.kind === 'row' && sel.row === r.id;
              return (
                <Sortable key={r.id} id={r.id}>
                  {handle => (
                    <div className="sb-ly-grp">
                      <div className={`sb-ly sec${rowSel ? ' on' : ''}${r.hideOn?.includes(device) ? ' hid' : ''}`} onClick={() => onSelect({ kind: 'row', row: r.id })}>
                        <span className="grip" {...handle}><GripVertical size={14} /></span>
                        <button type="button" className="tw" onClick={e => { e.stopPropagation(); setClosed(c => ({ ...c, [r.id]: isOpen })); }} aria-label={isOpen ? 'Collapse' : 'Expand'}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                        <span className="dot sec" /><span className="nm">{r.name || `Section ${ri + 1}`}</span>
                        {eye(!!r.hideOn?.includes(device), () => onChange(patchRow(rows, r.id, { hideOn: toggleHide(r, device).hideOn })), r.name || `Section ${ri + 1}`)}
                      </div>
                      {isOpen && r.columns.map((c, ci) => (
                        <div key={c.id}>
                          {r.columns.length > 1 && (
                            <div className={`sb-ly col${sel?.kind === 'col' && sel.col === c.id ? ' on' : ''}${c.hideOn?.includes(device) ? ' hid' : ''}`} onClick={() => onSelect({ kind: 'col', row: r.id, col: c.id })}>
                              <span className="dot col" /><span className="nm">Column {ci + 1}</span><small>{c.width}/12</small>
                              {eye(!!c.hideOn?.includes(device), () => onChange(patchCol(rows, c.id, { hideOn: toggleHide(c, device).hideOn })), `Column ${ci + 1}`)}
                            </div>
                          )}
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onModsEnd(r.id, c.id)}>
                            <SortableContext items={c.widgets.map(w => w.id)} strategy={verticalListSortingStrategy}>
                              {c.widgets.map(w => (
                                <Sortable key={w.id} id={w.id}>
                                  {h => (
                                    <div className={`sb-ly mod${r.columns.length > 1 ? ' deep' : ''}${sel?.kind === 'mod' && sel.mod === w.id ? ' on' : ''}${w.hideOn?.includes(device) ? ' hid' : ''}`} onClick={() => onSelect({ kind: 'mod', row: r.id, col: c.id, mod: w.id })}>
                                      <span className="grip" {...h}><GripVertical size={13} /></span>
                                      <span className="mi"><ModuleIcon type={w.type} size={14} /></span>
                                      <span className="nm">{moduleLabel(w)}</span>
                                      {(() => { const hint = String(w.settings?.text || w.settings?.title || '').replace(/<[^>]+>/g, '').trim(); return hint && hint.toLowerCase() !== moduleLabel(w).toLowerCase() ? <small>{hint}</small> : null; })()}
                                      {eye(!!w.hideOn?.includes(device), () => onChange(patchMod(rows, w.id, { hideOn: toggleHide(w, device).hideOn })), moduleLabel(w))}
                                    </div>
                                  )}
                                </Sortable>
                              ))}
                            </SortableContext>
                          </DndContext>
                        </div>
                      ))}
                    </div>
                  )}
                </Sortable>
              );
            })}
          </SortableContext>
        </DndContext>
        <div className="sb-ly pinned"><span className="dot hdr" />Footer<small>Every page</small></div>
      </div>
    </div>
  );
};

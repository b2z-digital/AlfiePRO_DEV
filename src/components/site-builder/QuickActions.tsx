import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';

export interface QuickAction { id: string; group: 'Actions' | 'Insert' | 'Go to' | 'View'; label: string; hint?: string; icon?: React.ReactNode; run: () => void }

/** ⌘K: find a module, a page or an action and do it. */
export const QuickActions: React.FC<{ actions: QuickAction[]; onClose: () => void }> = ({ actions, onClose }) => {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return actions.filter(a => words.every(w => `${a.group} ${a.label} ${a.hint || ''}`.toLowerCase().includes(w))).slice(0, 40);
  }, [q, actions]);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { setAt(0); }, [q]);
  const run = (a?: QuickAction) => { if (!a) return; onClose(); setTimeout(a.run, 0); };
  let lastGroup = '';
  return (
    <div className="sb-qa-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label="Find or do anything">
      <div className="sb-qa">
        <div className="sb-qa-in">
          <Search size={17} />
          <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Find or do anything" aria-label="Find or do anything"
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setAt(i => Math.min(list.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setAt(i => Math.max(0, i - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); run(list[at]); }
              if (e.key === 'Escape') onClose();
            }} />
          <kbd>esc</kbd>
        </div>
        <div className="sb-qa-list" role="listbox">
          {list.map((a, i) => {
            const head = a.group !== lastGroup ? a.group : null;
            lastGroup = a.group;
            return (
              <React.Fragment key={a.id}>
                {head && <div className="sb-qa-g">{head}</div>}
                <button type="button" role="option" aria-selected={i === at} className={i === at ? 'on' : ''} onMouseEnter={() => setAt(i)} onClick={() => run(a)}>
                  <span className="ic">{a.icon}</span><span className="l">{a.label}</span>{a.hint ? <small>{a.hint}</small> : null}{i === at ? <CornerDownLeft size={14} className="ent" /> : null}
                </button>
              </React.Fragment>
            );
          })}
          {!list.length && <div className="sb-qa-none">Nothing matches “{q}”.</div>}
        </div>
      </div>
    </div>
  );
};

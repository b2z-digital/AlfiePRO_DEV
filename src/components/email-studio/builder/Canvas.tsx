import React, { useEffect, useMemo, useRef } from 'react';

/** The email canvas: the real email HTML in an iframe, with click-to-select, a block toolbar,
 *  "add here" buttons and drop targets for blocks dragged from the left panel. */

const BRIDGE = `
(function(){
  var root = document.getElementById('es-root');
  var bar = document.getElementById('es-bar');
  var line = document.getElementById('es-drop');
  var sel = null, labels = {}, dragging = false;
  function post(m){ parent.postMessage(Object.assign({ __es: 1 }, m), '*'); }
  function blocks(){ return Array.prototype.slice.call(root.querySelectorAll('[data-es-block]')); }
  function place(){
    var el = sel && root.querySelector('[data-es-block="' + sel + '"]');
    blocks().forEach(function(b){ b.classList.toggle('es-on', b === el); });
    if (!el) { bar.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    bar.style.display = 'flex';
    bar.style.top = Math.max(4, r.top + window.scrollY - 34) + 'px';
    bar.style.left = (r.left + window.scrollX) + 'px';
    bar.style.width = r.width + 'px';
    bar.querySelector('.lbl').textContent = labels[sel] || '';
    var i = blocks().indexOf(el), n = blocks().length;
    bar.querySelector('[data-a=up]').disabled = i <= 0;
    bar.querySelector('[data-a=down]').disabled = i >= n - 1;
  }
  root.addEventListener('click', function(e){
    var a = e.target.closest('a'); if (a) e.preventDefault();
    var add = e.target.closest('[data-es-add]');
    if (add) { post({ type: 'insert', after: add.getAttribute('data-es-add') }); return; }
    var b = e.target.closest('[data-es-block]');
    post({ type: 'select', id: b ? b.getAttribute('data-es-block') : null });
  });
  bar.addEventListener('click', function(e){
    var btn = e.target.closest('button[data-a]'); if (!btn || !sel) return;
    post({ type: 'act', act: btn.getAttribute('data-a'), id: sel });
  });
  function gapAt(y){
    var bs = blocks(), best = bs.length, top = 0;
    for (var i = 0; i < bs.length; i++) { var r = bs[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { best = i; top = r.top; break; } top = r.bottom; }
    if (best < bs.length) top = bs[best].getBoundingClientRect().top;
    return { index: best, top: top };
  }
  document.addEventListener('dragover', function(e){
    if (!dragging) return; e.preventDefault();
    var g = gapAt(e.clientY), wrap = root.querySelector('.es-wrap') || root;
    var wr = (root.querySelector('table.es-card') || wrap).getBoundingClientRect();
    line.style.display = 'block'; line.style.top = (g.top + window.scrollY - 2) + 'px'; line.style.left = (wr.left + 16) + 'px'; line.style.width = (wr.width - 32) + 'px';
  });
  document.addEventListener('dragleave', function(e){ if (!e.relatedTarget) line.style.display = 'none'; });
  document.addEventListener('drop', function(e){ if (!dragging) return; e.preventDefault(); line.style.display = 'none'; post({ type: 'drop', index: gapAt(e.clientY).index }); });
  window.addEventListener('message', function(e){
    var m = e.data || {}; if (!m.__es) return;
    if (m.type === 'render') {
      var y = window.scrollY; root.innerHTML = m.body; labels = m.labels || {}; sel = m.selected || null;
      window.scrollTo(0, y); place();
      if (m.scrollTo) { var t = root.querySelector('[data-es-block="' + m.scrollTo + '"]'); if (t) t.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(place, 350); }
    }
    if (m.type === 'drag') { dragging = !!m.active; if (!dragging) line.style.display = 'none'; }
  });
  window.addEventListener('resize', place); window.addEventListener('scroll', place);
  new ResizeObserver(place).observe(root);
  post({ type: 'ready' });
})();`;

const EDIT_CSS = `
html,body{margin:0;background:#F3F5F8}
[data-es-block]{cursor:pointer;position:relative}
[data-es-block]:hover>td{box-shadow:inset 0 0 0 1.5px rgba(46,123,255,.5)}
[data-es-block].es-on>td{box-shadow:inset 0 0 0 2px #2E7BFF}
#es-bar{position:absolute;display:none;align-items:flex-start;justify-content:space-between;pointer-events:none;z-index:5;font:600 12px 'Instrument Sans',system-ui,sans-serif}
#es-bar .lbl{pointer-events:none;height:24px;line-height:24px;padding:0 9px;border-radius:7px 7px 0 0;background:#2E7BFF;color:#fff;margin-top:10px}
#es-bar .tb{pointer-events:auto;display:flex;gap:2px;padding:3px;border-radius:10px;background:#141B2D;box-shadow:0 8px 20px rgba(0,0,0,.35)}
#es-bar .tb button{width:28px;height:26px;border:0;border-radius:7px;background:transparent;color:#E8EDF7;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
#es-bar .tb button:hover{background:rgba(255,255,255,.12)}
#es-bar .tb button:disabled{opacity:.35;cursor:default}
#es-drop{position:absolute;display:none;height:4px;border-radius:4px;background:#2E7BFF;box-shadow:0 0 0 4px rgba(46,123,255,.2);z-index:6;pointer-events:none}
[data-es-add]{display:none}
`;

const ICON = (d: string) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const TOOLBAR = `<div id="es-bar"><span class="lbl"></span><span class="tb">
<button type="button" data-a="up" title="Move up">${ICON('<path d="m18 15-6-6-6 6"/>')}</button>
<button type="button" data-a="down" title="Move down">${ICON('<path d="m6 9 6 6 6-6"/>')}</button>
<button type="button" data-a="dup" title="Duplicate">${ICON('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>')}</button>
<button type="button" data-a="add" title="Add a block below">${ICON('<path d="M5 12h14"/><path d="M12 5v14"/>')}</button>
<button type="button" data-a="del" title="Delete">${ICON('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>')}</button>
</span></div><div id="es-drop"></div>`;

export interface CanvasMsg { type: 'ready' | 'select' | 'act' | 'insert' | 'drop'; id?: string | null; act?: string; after?: string; index?: number }

export const Canvas: React.FC<{
  head: string;
  body: string;
  selected: string | null;
  labels: Record<string, string>;
  phone: boolean;
  dragging: boolean;
  scrollTo?: string | null;
  onMessage: (m: CanvasMsg) => void;
}> = ({ head, body, selected, labels, phone, dragging, scrollTo, onMessage }) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const latest = useRef({ body, selected, labels, scrollTo });
  latest.current = { body, selected, labels, scrollTo };
  const cb = useRef(onMessage);
  cb.current = onMessage;

  const doc = useMemo(() => `<!DOCTYPE html><html><head>${head}<style>${EDIT_CSS}</style></head><body><div id="es-root"></div>${TOOLBAR}<script>${BRIDGE}</script></body></html>`, [head]);

  useEffect(() => { ready.current = false; }, [doc]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || !e.data?.__es) return;
      const m = e.data as CanvasMsg;
      if (m.type === 'ready') {
        ready.current = true;
        ref.current?.contentWindow?.postMessage({ __es: 1, type: 'render', ...latest.current }, '*');
        return;
      }
      cb.current(m);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    ref.current?.contentWindow?.postMessage({ __es: 1, type: 'render', body, selected, labels, scrollTo }, '*');
  }, [body, selected, labels, scrollTo]);

  useEffect(() => {
    ref.current?.contentWindow?.postMessage({ __es: 1, type: 'drag', active: dragging }, '*');
  }, [dragging]);

  return <iframe ref={ref} title="Email canvas" srcDoc={doc} className={phone ? 'phone' : ''} />;
};

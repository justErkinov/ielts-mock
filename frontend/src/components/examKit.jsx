import { useEffect, useRef, useState } from 'react';

/* ------------------------------------------------------------------ */
/* Highlights                                                          */
/* Stored as non-overlapping character ranges per text piece.          */
/* A new highlight replaces whatever it overlaps, so re-highlighting   */
/* the same words can never duplicate text.                            */
/* ------------------------------------------------------------------ */

export function addRange(list, nr) {
  const out = [];
  for (const r of list) {
    if (r.end <= nr.start || r.start >= nr.end) { out.push(r); continue; }
    if (r.start < nr.start) out.push({ ...r, end: nr.start });
    if (r.end > nr.end) out.push({ ...r, start: nr.end });
  }
  out.push(nr);
  out.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && last.color === r.color && last.end >= r.start) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

export const HL_COLORS = { yellow: '#fde68a', red: '#fca5a5' };

export function HLText({ id, text, ranges = [], onRemove }) {
  const segs = [];
  let cur = 0;
  ranges.forEach((r, i) => {
    if (r.start > cur) segs.push({ t: text.slice(cur, r.start) });
    segs.push({ t: text.slice(r.start, r.end), r, i });
    cur = r.end;
  });
  if (cur < text.length) segs.push({ t: text.slice(cur) });
  return (
    <span data-hl={id}>
      {segs.map((s, k) => s.r
        ? <mark key={k} className="rx-mark" style={{ background: HL_COLORS[s.r.color] }}
            onClick={() => { if (window.getSelection().isCollapsed) onRemove(id, s.r); }}
            title="Click to remove">{s.t}</mark>
        : <span key={k}>{s.t}</span>)}
    </span>
  );
}

/* Selection -> "Highlight / Important" toolbar, shared by exam pages. */
export function useHighlighter() {
  const [hl, setHl] = useState({});
  const [toolbar, setToolbar] = useState(null);

  const onMouseUp = () => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { setToolbar(null); return; }
      const range = sel.getRangeAt(0);
      const el = n => (n.nodeType === 3 ? n.parentElement : n);
      const box = el(range.startContainer)?.closest('[data-hl]');
      if (!box || box !== el(range.endContainer)?.closest('[data-hl]') || !range.toString().trim()) {
        setToolbar(null); return;
      }
      const pre = document.createRange();
      pre.selectNodeContents(box);
      pre.setEnd(range.startContainer, range.startOffset);
      const start = pre.toString().length;
      const rect = range.getBoundingClientRect();
      setToolbar({ key: box.dataset.hl, start, end: start + range.toString().length, x: rect.left + rect.width / 2, y: rect.top });
    }, 0);
  };

  const apply = color => {
    if (!toolbar) return;
    const { key, start, end } = toolbar;
    setHl(h => ({ ...h, [key]: addRange(h[key] || [], { start, end, color }) }));
    window.getSelection().removeAllRanges();
    setToolbar(null);
  };

  const remove = (key, r) => setHl(h => ({ ...h, [key]: (h[key] || []).filter(x => x !== r) }));

  const toolbarEl = toolbar && (
    <div className="rx-toolbar" style={{ left: toolbar.x, top: Math.max(8, toolbar.y - 46) }}
      onMouseDown={e => e.preventDefault()} onMouseUp={e => e.stopPropagation()}>
      <button onClick={() => apply('yellow')}><i style={{ background: HL_COLORS.yellow }} />Highlight</button>
      <button onClick={() => apply('red')}><i style={{ background: HL_COLORS.red }} />Important</button>
    </div>
  );

  // t(id, text) renders highlightable text. A plain function (not a component),
  // so re-renders keep the same DOM nodes and the user's selection.
  const t = (id, text) => <HLText id={id} text={text} ranges={hl[id]} onRemove={remove} />;

  return { onMouseUp, toolbarEl, t };
}

/* ------------------------------------------------------------------ */
/* Zoomable image (maps, charts)                                       */
/* Touchpad pinch / Ctrl+wheel to zoom at the cursor, drag to move,    */
/* two-finger pinch on touch screens, double-click to zoom in/out,     */
/* +/- buttons, and "Enlarge" to open it over the whole screen.        */
/* ------------------------------------------------------------------ */

const MIN_Z = 1, MAX_Z = 6;
const clampZ = z => Math.min(MAX_Z, Math.max(MIN_Z, z));

function ZoomStage({ src, alt, height }) {
  const boxRef = useRef(null);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const drag = useRef(null);

  const clampPan = (z, x, y) => {
    const b = boxRef.current;
    if (!b || z <= 1) return { z: 1, x: 0, y: 0 };
    const mx = (b.clientWidth * (z - 1)) / 2, my = (b.clientHeight * (z - 1)) / 2;
    return { z, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };

  // zoom keeping the point under (cx, cy) — box coordinates from the centre — fixed
  const zoomAt = (nz, cx = 0, cy = 0) => {
    const v = viewRef.current;
    const z = clampZ(nz);
    const k = z / v.z;
    setView(clampPan(z, cx - (cx - v.x) * k, cy - (cy - v.y) * k));
  };

  const centreOffset = (clientX, clientY) => {
    const r = boxRef.current.getBoundingClientRect();
    return [clientX - r.left - r.width / 2, clientY - r.top - r.height / 2];
  };

  useEffect(() => {
    const b = boxRef.current;
    if (!b) return;
    const onWheel = e => {
      // Touchpad pinch arrives as wheel + ctrlKey. Plain wheel scrolls the page unless zoomed in.
      if (!e.ctrlKey && viewRef.current.z === 1) return;
      e.preventDefault();
      const [cx, cy] = centreOffset(e.clientX, e.clientY);
      if (e.ctrlKey) {
        zoomAt(viewRef.current.z * Math.exp(-Math.max(-40, Math.min(40, e.deltaY)) * 0.01), cx, cy);
      } else {
        const v = viewRef.current;
        setView(clampPan(v.z, v.x - e.deltaX, v.y - e.deltaY));
      }
    };
    b.addEventListener('wheel', onWheel, { passive: false });
    return () => b.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = e => {
    boxRef.current.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: viewRef.current.z };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
    }
  };
  const onPointerMove = e => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const [cx, cy] = centreOffset((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      zoomAt(pinch.current.z * (d / pinch.current.d), cx, cy);
    } else if (drag.current && viewRef.current.z > 1) {
      const { x, y, vx, vy } = drag.current;
      setView(clampPan(viewRef.current.z, vx + e.clientX - x, vy + e.clientY - y));
    }
  };
  const onPointerUp = e => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };
  const onDoubleClick = e => {
    const [cx, cy] = centreOffset(e.clientX, e.clientY);
    zoomAt(viewRef.current.z > 1 ? 1 : 2.5, cx, cy);
  };

  return (
    <div className="zx-stage-wrap">
      <div ref={boxRef} className="zx-stage" style={{ height, cursor: view.z > 1 ? 'grab' : 'zoom-in' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDoubleClick={onDoubleClick}>
        <img src={src} alt={alt} draggable={false}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }} />
      </div>
      <div className="zx-controls" onPointerDown={e => e.stopPropagation()}>
        <button onClick={() => zoomAt(viewRef.current.z / 1.4)} disabled={view.z <= 1} aria-label="Zoom out">−</button>
        <span>{Math.round(view.z * 100)}%</span>
        <button onClick={() => zoomAt(viewRef.current.z * 1.4)} disabled={view.z >= MAX_Z} aria-label="Zoom in">+</button>
        <button onClick={() => setView({ z: 1, x: 0, y: 0 })} disabled={view.z === 1} className="zx-text">Reset</button>
      </div>
    </div>
  );
}

export function ZoomableImage({ src, alt = 'Diagram', height = 320 }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="zx">
      <ZoomStage src={src} alt={alt} height={height} />
      <div className="zx-bar">
        <span>Pinch on the touchpad or press + to zoom · drag to move</span>
        <button onClick={() => setOpen(true)}>⤢ Enlarge</button>
      </div>
      {open && (
        <div className="zx-lightbox" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="zx-lightbox-inner">
            <button className="zx-close" onClick={() => setOpen(false)}>✕ Close</button>
            <ZoomStage src={src} alt={alt} height="calc(100vh - 110px)" />
          </div>
        </div>
      )}
    </div>
  );
}

/* Official exam look: white, grey, black, red accent, Arial. Always light. */
export const EXAM_CSS = `
.rx-root{position:fixed;inset:0;z-index:500;display:flex;flex-direction:column;background:#fff;color:#111827;
  font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5}
.rx-root *{box-sizing:border-box}
.rx-header{height:52px;flex-shrink:0;display:flex;align-items:center;gap:24px;padding:0 20px;border-bottom:1px solid #e5e7eb;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.rx-brand{color:#dc2626;font-weight:800;font-size:22px;letter-spacing:.03em}
.rx-taker{font-size:13px;color:#6b7280}
.rx-taker b{color:#111827}
.rx-title{flex:1;text-align:center;font-size:13px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rx-timer{display:flex;align-items:center;gap:6px;font-family:'Courier New',monospace;font-weight:700;font-size:16px;
  background:#f3f4f6;color:#374151;padding:5px 12px;border-radius:8px}
.rx-timer-low{background:#fee2e2;color:#dc2626}
.rx-main{flex:1;display:flex;min-height:0}
.rx-left,.rx-right{overflow-y:auto;padding:22px 26px}
.rx-right{flex:1}
.rx-divider{width:9px;flex-shrink:0;background:#e5e7eb;cursor:col-resize;display:flex;align-items:center;justify-content:center}
.rx-divider:hover{background:#d1d5db}
.rx-divider span{width:3px;height:34px;border-radius:2px;background:#9ca3af}
.rx-partbox{background:#f3f4f6;border-radius:6px;padding:14px 16px;margin-bottom:20px}
.rx-partbox p{font-size:14px;color:#374151;margin-top:4px}
.rx-ptitle{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.rx-ptitle h2{font-size:19px;font-weight:700}
.rx-hint{font-size:12px;color:#4b5563;background:#eff6ff;padding:4px 10px;border-radius:999px}
.rx-passage p{text-align:justify;line-height:1.75;margin-bottom:14px;white-space:pre-wrap}
.rx-plabel{display:block;font-size:16px;margin-bottom:2px}
.rx-mark{color:#111827;cursor:pointer;border-radius:2px;padding:1px 0}
.rx-mark:hover{outline:1px dashed #dc2626}
.rx-group{margin-bottom:30px}
.rx-group h3{font-size:16px;font-weight:700;margin-bottom:6px}
.rx-instr{font-size:14px;color:#374151;margin-bottom:4px}
.rx-legend{margin:6px 0 14px;font-size:13.5px;border-collapse:collapse}
.rx-legend td{padding:2px 14px 2px 0;vertical-align:top}
.rx-notes{border:1px solid #d1d5db;border-radius:6px;padding:14px 16px;margin-top:10px}
.rx-gapline{line-height:2.4;font-size:14.5px;scroll-margin:90px}
.rx-bullet{color:#6b7280}
.rx-gap{width:150px;height:30px;margin:0 6px;border:1px solid #9ca3af;border-radius:4px;padding:0 8px;font-size:14.5px;
  text-align:center;font-family:inherit;background:#fff;color:#111827;vertical-align:middle}
.rx-gap::placeholder{color:#9ca3af;font-weight:700}
.rx-gap:focus,.rx-gap-cur{outline:none;border:2px solid #2563eb}
.rx-q{padding:10px 12px;margin:6px -12px;border-radius:6px;scroll-margin:90px}
.rx-q-cur{background:#f8fafc;box-shadow:inset 3px 0 0 #2563eb}
.rx-stem{font-size:14.5px;display:flex;gap:8px;align-items:flex-start}
.rx-num{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:22px;padding:0 4px;border:1px solid #111827;
  border-radius:3px;font-size:12.5px;font-weight:700;flex-shrink:0;margin-top:1px}
.rx-opts{display:flex;flex-direction:column;gap:4px;margin:8px 0 0 34px}
.rx-opt{display:flex;align-items:flex-start;gap:9px;font-size:14px;padding:5px 8px;border-radius:5px;cursor:pointer}
.rx-opt:hover{background:#f3f4f6}
.rx-opt-on{background:#eff6ff}
.rx-opt input{margin-top:3px;accent-color:#111827;width:15px;height:15px}
.rx-letter{min-width:14px}
.rx-box{border:1px solid #d1d5db;border-radius:6px;padding:12px 16px;margin:10px 0 14px}
.rx-box>b{display:block;margin-bottom:6px;font-size:14px}
.rx-boxrow{display:flex;gap:10px;font-size:14px;padding:2px 0}
.rx-boxrow b{min-width:30px}
.rx-sel{display:flex;align-items:center;gap:10px;padding:7px 12px;margin:2px -12px;border-radius:6px;font-size:14.5px;scroll-margin:90px}
.rx-sel-label{flex:1}
.rx-sel select{min-width:72px;height:30px;border:1px solid #9ca3af;border-radius:4px;background:#fff;color:#111827;font-size:14px;padding:0 6px}
.rx-sel select:focus{outline:none;border:2px solid #2563eb}
.rx-arrows{position:fixed;right:18px;bottom:66px;display:flex;gap:8px;z-index:510}
.rx-arrows button{width:42px;height:42px;border:none;border-radius:6px;background:#e5e7eb;color:#111827;font-size:24px;cursor:pointer}
.rx-arrows .rx-arrow-next{background:#111827;color:#fff}
.rx-arrows button:disabled{opacity:.35;cursor:default}
.rx-footer{height:54px;flex-shrink:0;display:flex;align-items:center;gap:16px;padding:0 16px;border-top:1px solid #e5e7eb;background:#fff}
.rx-parts{flex:1;display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0;overflow-x:auto}
.rx-part-on{display:flex;align-items:center;gap:5px}
.rx-part-on>b{font-size:15px;margin-right:6px;white-space:nowrap}
.rx-part-off{background:none;border:none;font-size:15px;color:#9ca3af;cursor:pointer;white-space:nowrap;font-family:inherit}
.rx-part-off span{margin-left:8px;font-size:14px}
.rx-part-off:hover{color:#374151}
.rx-n{width:28px;height:28px;border:1px solid #d1d5db;border-radius:4px;background:#fff;color:#4b5563;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0}
.rx-n:hover{border-color:#6b7280}
.rx-n.rx-n-done{background:#16a34a;border-color:#16a34a;color:#fff}
.rx-n.rx-n-cur{border:2px solid #2563eb;color:#111827;background:#fff}
.rx-submit{background:#dc2626;color:#fff;border:none;border-radius:6px;padding:0 22px;height:36px;font-size:14px;font-weight:700;cursor:pointer}
.rx-submit:hover{background:#b91c1c}
.rx-submit:disabled{opacity:.6}
.rx-toolbar{position:fixed;transform:translateX(-50%);z-index:520;display:flex;gap:4px;background:#fff;border:1px solid #e5e7eb;
  border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.15);padding:4px}
.rx-toolbar button{display:flex;align-items:center;gap:6px;border:none;background:none;padding:6px 10px;border-radius:5px;
  font-size:13px;font-weight:600;cursor:pointer;color:#111827;font-family:inherit}
.rx-toolbar button:hover{background:#f3f4f6}
.rx-toolbar i{width:14px;height:14px;border-radius:3px;display:inline-block;border:1px solid rgba(0,0,0,.1)}
.rx-modal-bg{position:fixed;inset:0;z-index:2000;background:rgba(17,24,39,.55);display:flex;align-items:center;justify-content:center;padding:20px}
.rx-modal{background:#fff;border-radius:12px;padding:26px;width:100%;max-width:420px;box-shadow:0 24px 64px rgba(0,0,0,.25)}
.rx-modal h3{font-size:19px;margin-bottom:8px}
.rx-modal p{font-size:14.5px;color:#4b5563;line-height:1.55}
.rx-modal-btns{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
.rx-modal-btns button{border:1px solid #d1d5db;background:#fff;border-radius:7px;padding:9px 18px;font-size:14px;font-weight:600;cursor:pointer}
.rx-modal-btns .rx-danger{background:#dc2626;border-color:#dc2626;color:#fff}

.zx{border:1px solid #d1d5db;border-radius:6px;background:#fff;overflow:hidden;margin:10px 0 14px}
.zx-stage-wrap{position:relative}
.zx-stage{position:relative;overflow:hidden;background:#fff;touch-action:none;user-select:none;display:flex;align-items:center;justify-content:center}
.zx-stage img{max-width:100%;max-height:100%;object-fit:contain;transform-origin:center center;transition:transform .05s linear;pointer-events:none}
.zx-controls{position:absolute;right:8px;top:8px;display:flex;align-items:center;gap:2px;background:rgba(255,255,255,.95);border:1px solid #d1d5db;border-radius:7px;padding:3px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.zx-controls button{width:30px;height:28px;border:none;background:none;border-radius:5px;font-size:18px;font-weight:700;cursor:pointer;color:#111827}
.zx-controls .zx-text{width:auto;padding:0 8px;font-size:12px}
.zx-controls button:hover:not(:disabled){background:#f3f4f6}
.zx-controls button:disabled{opacity:.3;cursor:default}
.zx-controls span{min-width:44px;text-align:center;font-size:12px;font-weight:700;color:#374151}
.zx-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px;border-top:1px solid #e5e7eb;background:#f9fafb;font-size:12px;color:#6b7280}
.zx-bar button{border:1px solid #d1d5db;background:#fff;border-radius:6px;padding:4px 10px;font-size:12.5px;font-weight:700;cursor:pointer;color:#111827}
.zx-lightbox{position:fixed;inset:0;z-index:2500;background:rgba(17,24,39,.8);display:flex;align-items:center;justify-content:center;padding:20px}
.zx-lightbox-inner{background:#fff;border-radius:10px;width:100%;height:100%;padding:44px 10px 10px;position:relative}
.zx-lightbox-inner .zx-stage-wrap{height:100%}
.zx-close{position:absolute;left:12px;top:8px;border:1px solid #d1d5db;background:#fff;border-radius:6px;padding:5px 12px;font-weight:700;cursor:pointer;font-size:13px}
.lx-audio{display:flex;align-items:center;gap:10px;background:#f3f4f6;border-radius:999px;padding:5px 14px;min-width:340px}
.lx-audio-state{font-size:12.5px;font-weight:700;color:#111827;white-space:nowrap}
.lx-audio-bar{flex:1;height:5px;background:#d1d5db;border-radius:3px;overflow:hidden;min-width:120px}
.lx-audio-bar i{display:block;height:100%;background:#111827}
.lx-audio-time{font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:#374151}
.lx-audio input[type=range]{width:70px;accent-color:#111827}
.lx-play{border:none;background:#111827;color:#fff;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer}
.lx-single{max-width:900px;margin:0 auto;padding:22px 26px}
.lx-notes-title{font-weight:700;text-align:center;font-size:15px;margin-bottom:8px;text-transform:uppercase}
.lx-review{background:#fef3c7;color:#92400e;text-align:center;font-size:13.5px;font-weight:700;padding:6px}
.rx-n-bar{display:flex;flex-direction:column;align-items:center;gap:3px}
.wx-text{width:100%;flex:1;min-height:300px;border:1px solid #9ca3af;border-radius:4px;padding:12px 14px;font-family:Arial,Helvetica,sans-serif;
  font-size:15px;line-height:1.7;color:#111827;resize:none;background:#fff}
.wx-text:focus{outline:none;border:2px solid #2563eb;padding:11px 13px}
.wx-right{display:flex;flex-direction:column}
.wx-count{display:flex;justify-content:space-between;font-size:13px;color:#6b7280;margin-top:8px}
.wx-ok{color:#16a34a;font-weight:700}
.wx-prompt{border:1px solid #d1d5db;border-radius:6px;padding:16px 18px;font-size:15px;line-height:1.65;white-space:pre-wrap}
.wx-timer-paused{opacity:.45}
`;

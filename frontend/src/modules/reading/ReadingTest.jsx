import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import ScoreCard from '../../components/ScoreCard';
import { useAntiCheat } from '../../hooks/useAntiCheat';
import { FullscreenGate, ViolationWarning, BlockedScreen } from '../../components/AntiCheatOverlay';

/* ------------------------------------------------------------------ */
/* Highlights                                                          */
/* Stored as non-overlapping character ranges per text piece.          */
/* A new highlight replaces whatever it overlaps, so re-highlighting   */
/* the same words can never duplicate text.                            */
/* ------------------------------------------------------------------ */

function addRange(list, nr) {
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

const HL_COLORS = { yellow: '#fde68a', red: '#fca5a5' };

function HLText({ id, text, ranges = [], onRemove }) {
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

/* ------------------------------------------------------------------ */
/* Question grouping (real IELTS layout: "Questions 1–7" + instructions) */
/* ------------------------------------------------------------------ */

const YNNG = ['YES', 'NO', 'NOT GIVEN'];
const TFNG = ['TRUE', 'FALSE', 'NOT GIVEN'];
const LETTERS = 'ABCDEFGHIJKLMNOP';

function kindOf(q) {
  if (q.question_type === 'tfng') return 'tfng';
  if (q.question_type === 'gap_fill' || q.question_type === 'matching') return 'gap';
  const o = q.options || [];
  if (o.join('|') === YNNG.join('|')) return 'ynng';
  return 'mcq:' + o.join('|');
}

function cleanText(t) {
  return (t || '')
    .replace(/^YES \/ NO \/ NOT GIVEN:\s*/i, '')
    .replace(/^TRUE \/ FALSE \/ NOT GIVEN:\s*/i, '')
    .replace(/\s*\(ONE WORD( ONLY)?\)\s*$/i, '')
    .trim();
}

function buildGroups(questions, passageNumber) {
  const raw = [];
  questions.forEach(q => {
    const k = kindOf(q);
    const last = raw[raw.length - 1];
    if (last && last.kind === k) last.items.push(q);
    else raw.push({ kind: k, items: [q] });
  });

  // mcq groups: shared option list (>1 question) vs normal multiple choice
  const groups = [];
  raw.forEach(g => {
    if (g.kind.startsWith('mcq:')) {
      const style = g.items.length > 1 ? 'list' : 'choice';
      const last = groups[groups.length - 1];
      if (style === 'choice' && last && last.style === 'choice') last.items.push(...g.items);
      else groups.push({ ...g, style });
    } else {
      groups.push({ ...g, style: g.kind });
    }
  });

  return groups.map(g => {
    const first = g.items[0].question_number;
    const lastN = g.items[g.items.length - 1].question_number;
    const range = first === lastN ? `Question ${first}` : `Questions ${first}–${lastN}`;
    const out = { ...g, range, lines: [] };

    if (g.style === 'tfng') {
      out.lines = [`Do the following statements agree with the information given in Reading Passage ${passageNumber}?`, 'Choose:'];
      out.legend = [['TRUE', 'if the statement agrees with the information'],
        ['FALSE', 'if the statement contradicts the information'],
        ['NOT GIVEN', 'if there is no information on this']];
    } else if (g.style === 'ynng') {
      out.lines = [`Do the following statements agree with the claims of the writer in Reading Passage ${passageNumber}?`, 'Choose:'];
      out.legend = [['YES', 'if the statement agrees with the claims of the writer'],
        ['NO', 'if the statement contradicts the claims of the writer'],
        ['NOT GIVEN', 'if it is impossible to say what the writer thinks about this']];
    } else if (g.style === 'gap') {
      const oneWord = g.items.some(q => /\(ONE WORD/i.test(q.question_text));
      out.lines = ['Complete the notes below.', oneWord
        ? `Choose ONE WORD ONLY from the passage for each answer.`
        : 'Write your answers in the gaps.'];
    } else if (g.style === 'choice') {
      const n = Math.max(...g.items.map(q => (q.options || []).length));
      out.lines = [`Choose the correct letter, ${LETTERS.slice(0, n).split('').join(', ').replace(/, ([^,]*)$/, ' or $1')}.`];
    } else {
      const opts = g.items[0].options || [];
      const roman = opts.every(o => /^[ivx]+\./i.test(o));
      out.options = opts.map((o, i) => {
        const m = o.match(/^([ivx]+)\.\s*(.*)$/i);
        return m ? { code: m[1], text: m[2], value: o } : { code: LETTERS[i], text: o, value: o };
      });
      const texts = g.items.map(q => q.question_text);
      if (roman) {
        out.boxTitle = 'List of Headings';
        out.lines = ['Choose the correct heading for each paragraph from the list of headings below.'];
        out.labels = texts.map(t => t.replace(/^Choose the correct heading for\s*/i, ''));
      } else if (texts.every(t => t.includes(':'))) {
        const head = texts[0].split(':')[0];
        out.boxTitle = 'Options';
        out.lines = [`${head}.`];
        out.labels = texts.map(t => t.slice(t.indexOf(':') + 1).trim());
      } else {
        out.boxTitle = 'Endings';
        out.lines = ['Complete each sentence with the correct ending from the box below.'];
        out.labels = texts;
      }
    }
    return out;
  });
}

/* ------------------------------------------------------------------ */

const isAnswered = v => v !== undefined && v !== null && String(v).trim() !== '';

export default function ReadingTest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [started, setStarted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [part, setPart] = useState(0);
  const [currentQ, setCurrentQ] = useState(null);
  const [split, setSplit] = useState(50);
  const [hl, setHl] = useState({});
  const [toolbar, setToolbar] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [secs, setSecs] = useState(60 * 60);
  const [error, setError] = useState('');

  const startedAt = useRef(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submittingRef = useRef(false);
  const dragRef = useRef(false);

  useEffect(() => {
    api.get(`/reading/${id}/`).then(r => {
      setTest(r.data);
      const q = r.data.passages?.[0]?.questions?.[0];
      if (q) setCurrentQ(q.question_number);
    }).finally(() => setLoading(false));
  }, [id]);

  const passages = useMemo(
    () => (test?.passages || []).slice().sort((a, b) => a.passage_number - b.passage_number),
    [test]);
  const allQ = useMemo(() => passages.flatMap((p, pi) =>
    (p.questions || []).slice().sort((a, b) => a.question_number - b.question_number)
      .map(q => ({ ...q, pi }))), [passages]);

  /* ---------- submit ---------- */
  const submit = useCallback(async (finishReason = 'manual') => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setConfirmOpen(false);
    const timeSpent = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : null;
    try {
      const res = await api.post(`/reading/${id}/submit/`, {
        answers: answersRef.current, time_spent: timeSpent, time_limit: 60 * 60, finish_reason: finishReason,
      });
      setResult(res.data);
    } catch {
      submittingRef.current = false;
      setError('Submission failed. Check the internet connection and press Submit again.');
    } finally {
      setSubmitting(false);
    }
  }, [id]);

  const { warning, blocked, dismissWarning, enterFullscreen, exitFullscreen } = useAntiCheat({
    active: started && !result, onBlocked: () => submit('blocked'), testType: 'reading', testId: id,
  });

  useEffect(() => { if (result || blocked) exitFullscreen(); }, [result, blocked, exitFullscreen]);

  /* ---------- timer ---------- */
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (!started || result) return;
    const iv = setInterval(() => setSecs(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [started, result]);
  useEffect(() => {
    if (started && secs === 0 && !result) submitRef.current('timeout');
  }, [secs, started, result]);

  /* ---------- resizable divider ---------- */
  useEffect(() => {
    const move = e => {
      if (!dragRef.current) return;
      setSplit(Math.min(75, Math.max(25, (e.clientX / window.innerWidth) * 100)));
    };
    const up = () => { dragRef.current = false; document.body.style.cursor = ''; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  /* ---------- highlighting ---------- */
  const onMouseUp = () => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { setToolbar(null); return; }
      const range = sel.getRangeAt(0);
      const el = n => (n.nodeType === 3 ? n.parentElement : n);
      const box = el(range.startContainer)?.closest('[data-hl]');
      if (!box || box !== el(range.endContainer)?.closest('[data-hl]')) { setToolbar(null); return; }
      const pre = document.createRange();
      pre.selectNodeContents(box);
      pre.setEnd(range.startContainer, range.startOffset);
      const start = pre.toString().length;
      const end = start + range.toString().length;
      if (!range.toString().trim()) { setToolbar(null); return; }
      const rect = range.getBoundingClientRect();
      setToolbar({ key: box.dataset.hl, start, end, x: rect.left + rect.width / 2, y: rect.top });
    }, 0);
  };

  const applyHighlight = color => {
    if (!toolbar) return;
    const { key, start, end } = toolbar;
    setHl(h => ({ ...h, [key]: addRange(h[key] || [], { start, end, color }) }));
    window.getSelection().removeAllRanges();
    setToolbar(null);
  };

  const removeHighlight = (key, r) =>
    setHl(h => ({ ...h, [key]: (h[key] || []).filter(x => x !== r) }));

  /* ---------- navigation ---------- */
  const goTo = n => {
    const q = allQ.find(x => x.question_number === n);
    if (!q) return;
    setPart(q.pi);
    setCurrentQ(n);
    setTimeout(() => {
      document.getElementById(`rq-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 30);
  };
  const step = d => {
    const i = allQ.findIndex(q => q.question_number === currentQ);
    const next = allQ[i + d];
    if (next) goTo(next.question_number);
  };
  const setAnswer = (n, v) => { setAnswers(a => ({ ...a, [n]: v })); setCurrentQ(n); };

  /* ---------- screens before / after the exam ---------- */
  if (loading) return <div className="container"><p className="text-muted">Loading test...</p></div>;
  if (!test) return <div className="container"><p>Test not found.</p></div>;
  if (blocked) return <BlockedScreen onBack={() => navigate('/reading')} />;
  if (result) return (
    <div className="container">
      <ScoreCard title={test.title} score={result.score} total={result.total} detail={result.detail}
        onBack={() => navigate('/reading')} />
    </div>
  );
  if (!started) return (
    <FullscreenGate title={test.title} onStart={async () => {
      await enterFullscreen(); startedAt.current = Date.now(); setStarted(true);
    }} />
  );

  /* ---------- exam screen ---------- */
  const passage = passages[part];
  const pq = allQ.filter(q => q.pi === part);
  const groups = buildGroups(pq, passage.passage_number);
  const answeredTotal = allQ.filter(q => isAnswered(answers[q.question_number])).length;
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  const paragraphs = (passage.text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  const numBadge = n => <span className="rx-num">{n}</span>;

  const renderGap = q => {
    const parts = cleanText(q.question_text).split('___');
    const input = (
      <input
        className={`rx-gap ${currentQ === q.question_number ? 'rx-gap-cur' : ''}`}
        value={answers[q.question_number] || ''}
        placeholder={String(q.question_number)}
        onFocus={() => setCurrentQ(q.question_number)}
        onChange={e => setAnswer(q.question_number, e.target.value)}
        spellCheck={false} autoComplete="off"
      />
    );
    return (
      <div key={q.id} id={`rq-${q.question_number}`} className="rx-gapline">
        <span className="rx-bullet">•</span>{' '}
        <HLText id={`q${q.question_number}a`} text={parts[0]} ranges={hl[`q${q.question_number}a`]} onRemove={removeHighlight} />
        {input}
        {parts[1] !== undefined && (
          <HLText id={`q${q.question_number}b`} text={parts[1]} ranges={hl[`q${q.question_number}b`]} onRemove={removeHighlight} />
        )}
      </div>
    );
  };

  const renderRadio = (q, opts, labels) => (
    <div key={q.id} id={`rq-${q.question_number}`}
      className={`rx-q ${currentQ === q.question_number ? 'rx-q-cur' : ''}`}>
      <p className="rx-stem">
        {numBadge(q.question_number)}
        <HLText id={`q${q.question_number}`} text={cleanText(q.question_text)} ranges={hl[`q${q.question_number}`]} onRemove={removeHighlight} />
      </p>
      <div className="rx-opts">
        {opts.map((o, i) => (
          <label key={o} className={`rx-opt ${answers[q.question_number] === o ? 'rx-opt-on' : ''}`}>
            <input type="radio" name={`q${q.question_number}`} checked={answers[q.question_number] === o}
              onChange={() => setAnswer(q.question_number, o)} />
            {labels && <b className="rx-letter">{labels[i]}</b>}
            <span>{o}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="rx-root" onMouseUp={onMouseUp}>
      <style>{CSS}</style>

      {/* Header */}
      <header className="rx-header">
        <div className="rx-brand">IELTS</div>
        <div className="rx-taker">Test taker: <b>{user?.first_name || user?.username}</b></div>
        <div className="rx-title">{test.title}</div>
        <div className={`rx-timer ${secs < 300 ? 'rx-timer-low' : ''}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>
          {mm}:{ss}
        </div>
      </header>

      {/* Split panes */}
      <main className="rx-main">
        <section className="rx-left" style={{ width: `${split}%` }}>
          <div className="rx-partbox">
            <b>Part {passage.passage_number}</b>
            <p>You should spend about 20 minutes on Questions {pq[0]?.question_number}–{pq[pq.length - 1]?.question_number}, which are based on Reading Passage {passage.passage_number} below.</p>
          </div>
          <div className="rx-ptitle">
            <h2>{passage.title}</h2>
            <span className="rx-hint">Select text to highlight · click a highlight to remove it</span>
          </div>
          <div className="rx-passage">
            {paragraphs.map((p, i) => {
              const m = p.match(/^([A-H])\s*\n([\s\S]*)$/);
              const body = m ? m[2] : p;
              return (
                <p key={i}>
                  {m && <b className="rx-plabel">{m[1]}</b>}
                  <HLText id={`p${part}-${i}`} text={body} ranges={hl[`p${part}-${i}`]} onRemove={removeHighlight} />
                </p>
              );
            })}
          </div>
        </section>

        <div className="rx-divider" onMouseDown={e => { e.preventDefault(); dragRef.current = true; document.body.style.cursor = 'col-resize'; }}>
          <span />
        </div>

        <section className="rx-right">
          {groups.map((g, gi) => (
            <div key={gi} className="rx-group">
              <h3>{g.range}</h3>
              {g.lines.map(l => <p key={l} className="rx-instr">{l}</p>)}
              {g.legend && (
                <table className="rx-legend"><tbody>
                  {g.legend.map(([a, b]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td></tr>)}
                </tbody></table>
              )}

              {g.style === 'gap' && <div className="rx-notes">{g.items.map(renderGap)}</div>}
              {g.style === 'tfng' && g.items.map(q => renderRadio(q, TFNG))}
              {g.style === 'ynng' && g.items.map(q => renderRadio(q, YNNG))}
              {g.style === 'choice' && g.items.map(q => renderRadio(q, q.options || [], LETTERS.split('')))}

              {g.style === 'list' && (
                <>
                  <div className="rx-box">
                    <b>{g.boxTitle}</b>
                    {g.options.map(o => (
                      <div key={o.value} className="rx-boxrow"><b>{o.code}</b><span>{o.text}</span></div>
                    ))}
                  </div>
                  {g.items.map((q, i) => (
                    <div key={q.id} id={`rq-${q.question_number}`}
                      className={`rx-sel ${currentQ === q.question_number ? 'rx-q-cur' : ''}`}>
                      {numBadge(q.question_number)}
                      <span className="rx-sel-label">
                        <HLText id={`q${q.question_number}`} text={g.labels[i]} ranges={hl[`q${q.question_number}`]} onRemove={removeHighlight} />
                      </span>
                      <select value={answers[q.question_number] || ''}
                        onFocus={() => setCurrentQ(q.question_number)}
                        onChange={e => setAnswer(q.question_number, e.target.value)}>
                        <option value="">—</option>
                        {g.options.map(o => <option key={o.value} value={o.value}>{o.code}</option>)}
                      </select>
                    </div>
                  ))}
                </>
              )}
            </div>
          ))}
          <div style={{ height: 80 }} />
        </section>
      </main>

      {/* Prev / next */}
      <div className="rx-arrows">
        <button onClick={() => step(-1)} disabled={allQ[0]?.question_number === currentQ} aria-label="Previous question">‹</button>
        <button className="rx-arrow-next" onClick={() => step(1)} disabled={allQ[allQ.length - 1]?.question_number === currentQ} aria-label="Next question">›</button>
      </div>

      {/* Footer: parts + question numbers of the active part only */}
      <footer className="rx-footer">
        <div className="rx-parts">
          {passages.map((p, i) => {
            const qs = allQ.filter(q => q.pi === i);
            const done = qs.filter(q => isAnswered(answers[q.question_number])).length;
            if (i !== part) {
              return (
                <button key={p.id} className="rx-part-off" onClick={() => goTo(qs[0]?.question_number)}>
                  Part {p.passage_number} <span>{done} of {qs.length}</span>
                </button>
              );
            }
            return (
              <div key={p.id} className="rx-part-on">
                <b>Part {p.passage_number}</b>
                {qs.map(q => {
                  const n = q.question_number;
                  const cls = n === currentQ ? 'rx-n rx-n-cur' : isAnswered(answers[n]) ? 'rx-n rx-n-done' : 'rx-n';
                  return <button key={n} className={cls} onClick={() => goTo(n)}>{n}</button>;
                })}
              </div>
            );
          })}
        </div>
        <button className="rx-submit" onClick={() => setConfirmOpen(true)} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </footer>

      {/* Highlight toolbar */}
      {toolbar && (
        <div className="rx-toolbar" style={{ left: toolbar.x, top: Math.max(8, toolbar.y - 46) }}
          onMouseDown={e => e.preventDefault()} onMouseUp={e => e.stopPropagation()}>
          <button onClick={() => applyHighlight('yellow')}><i style={{ background: HL_COLORS.yellow }} />Highlight</button>
          <button onClick={() => applyHighlight('red')}><i style={{ background: HL_COLORS.red }} />Important</button>
        </div>
      )}

      {/* Submit confirmation */}
      {confirmOpen && (
        <div className="rx-modal-bg">
          <div className="rx-modal">
            <h3>Submit your answers?</h3>
            <p>You have answered <b>{answeredTotal} of {allQ.length}</b> questions.
              {answeredTotal < allQ.length && ' Unanswered questions will be marked as wrong.'}</p>
            <div className="rx-modal-btns">
              <button onClick={() => setConfirmOpen(false)}>Go back</button>
              <button className="rx-danger" onClick={() => submit('manual')}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rx-modal-bg">
          <div className="rx-modal">
            <h3>Could not submit</h3>
            <p>{error}</p>
            <div className="rx-modal-btns"><button className="rx-danger" onClick={() => setError('')}>OK</button></div>
          </div>
        </div>
      )}

      {warning && (
        <ViolationWarning count={warning.count} deadline={warning.deadline}
          onDismiss={async () => { dismissWarning(); await enterFullscreen(); }} />
      )}
    </div>
  );
}

/* Official exam look: white, grey, black, red accent, Arial. Always light. */
const CSS = `
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
`;

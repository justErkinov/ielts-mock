import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';

export const KINDS = {
  listening: { label: 'Listening', icon: '🎧', unit: 'Part', count: 4 },
  reading: { label: 'Reading', icon: '📖', unit: 'Passage', count: 3 },
  writing: { label: 'Writing', icon: '✍️', unit: 'Task', count: 2 },
};

export const errText = (e, fallback = 'Something went wrong. Check the internet connection and try again.') =>
  e?.response?.data?.error || e?.response?.data?.detail || fallback;

/* ---------- upload button (audio or image) ---------- */
export function UploadButton({ accept, label, onDone, small }) {
  const ref = useRef(null);
  const [pct, setPct] = useState(null);
  const [error, setError] = useState('');

  const pick = async e => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(''); setPct(0);
    const fd = new FormData();
    fd.append('file', f);
    try {
      const r = await api.post('/studio/upload/', fd, {
        onUploadProgress: p => p.total && setPct(Math.round((p.loaded / p.total) * 100)),
      });
      onDone(r.data.url, f.name);
    } catch (err) {
      setError(errText(err, 'Upload failed. Check the internet connection and try again.'));
    } finally { setPct(null); }
  };

  return (
    <span className="st-upload">
      <input ref={ref} type="file" accept={accept} onChange={pick} hidden />
      <button type="button" className={`btn btn-outline ${small ? 'btn-sm' : ''}`} disabled={pct !== null}
        onClick={() => ref.current?.click()}>
        {pct !== null ? `Uploading… ${pct}%` : label}
      </button>
      {error && <span className="st-err-inline">{error}</span>}
    </span>
  );
}

/* ---------- live parse of pasted questions + answers ---------- */
export function useParsed(kind, questions, answers, first, last) {
  const [res, setRes] = useState({ questions: [], errors: [], warnings: [], loading: false });
  useEffect(() => {
    if (!questions.trim()) { setRes({ questions: [], errors: [], warnings: [], loading: false, empty: true }); return; }
    setRes(r => ({ ...r, loading: true }));
    const t = setTimeout(() => {
      api.post('/studio/parse/', { kind, questions, answers, first, last })
        .then(r => setRes({ ...r.data, loading: false }))
        .catch(() => setRes(r => ({ ...r, loading: false })));
    }, 450);
    return () => clearTimeout(t);
  }, [kind, questions, answers, first, last]);
  return res;
}

const LET = 'ABCDEFGHIJKLMNOP';

function Blanked({ text }) {
  const parts = (text || '').split('___');
  return parts.map((p, i) => (
    <span key={i}>{p}{i < parts.length - 1 && <span className="st-blank" />}</span>
  ));
}

/* Compact view of what the students will get, with the answers marked */
export function ParsedPreview({ parsed }) {
  if (parsed.empty) return <p className="st-muted">Paste the questions on the left. They appear here as students will get them, with the correct answers marked.</p>;
  const groups = [];
  parsed.questions.forEach(q => {
    const last = groups[groups.length - 1];
    if (last && last.title === q.group_title) last.items.push(q);
    else groups.push({ title: q.group_title, instruction: q.group_instruction, items: [q] });
  });
  return (
    <div className={parsed.loading ? 'st-dim' : ''}>
      {groups.map((g, gi) => {
        const lines = (g.instruction || '').split('\n').filter(Boolean);
        const img = (lines.find(l => l.startsWith('[img:')) || '').slice(5, -1);
        const box = (lines.find(l => l.startsWith('[box:')) || '').slice(5, -1);
        const shared = g.items.length > 1 && g.items[0].options && g.items[0].question_type === 'mcq'
          && g.items.every(q => JSON.stringify(q.options) === JSON.stringify(g.items[0].options))
          && !['YES', 'TRUE'].includes(g.items[0].options[0]);
        return (
          <div key={gi} className="st-pgroup">
            <h4>{g.title}</h4>
            {lines.filter(l => !/^\[(img|box):/.test(l)).map((l, i) => <p key={i} className="st-pinstr">{l}</p>)}
            {img && <img src={img} alt="" className="st-pimg" />}
            {shared && (
              <div className="st-pbox">
                {box && <b>{box}</b>}
                {g.items[0].options.map((o, i) => <div key={i}><b>{/^[ivx]+\./i.test(o) ? '' : LET[i]}</b> {o}</div>)}
              </div>
            )}
            {g.items.map(q => {
              const lns = (q.question_text || '').split('\n');
              const body = lns.pop();
              const answers = (q.correct_answer || '').split('|').filter(Boolean);
              return (
                <div key={q.question_number} className="st-pq">
                  {lns.map((h, i) => <div key={i} className="st-phead">{h}</div>)}
                  <div className="st-pline">
                    <span className="st-pnum">{q.question_number}</span>
                    <span className="st-ptext"><Blanked text={body} /></span>
                  </div>
                  {!shared && q.options && q.question_type === 'mcq' && !['YES'].includes(q.options[0]) && (
                    <div className="st-popts">
                      {q.options.map((o, i) => (
                        <div key={i} className={answers.includes(o) ? 'st-ok' : ''}><b>{LET[i]}</b> {o}</div>
                      ))}
                    </div>
                  )}
                  <div className="st-pans">
                    {answers.length
                      ? <>Answer: {answers.map((a, i) => <span key={i} className="st-chip">{a}</span>)}</>
                      : <span className="st-chip st-chip-bad">no answer</span>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function Problems({ errors = [], warnings = [] }) {
  if (!errors.length && !warnings.length) return null;
  return (
    <div className="st-problems">
      {errors.map((e, i) => <div key={'e' + i} className="st-prob-err">{e}</div>)}
      {warnings.map((w, i) => <div key={'w' + i} className="st-prob-warn">{w}</div>)}
    </div>
  );
}

/* ---------- modal ---------- */
export function Modal({ title, children, onClose, actions }) {
  return (
    <div className="st-modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className="st-modal">
        <h3>{title}</h3>
        <div className="st-modal-body">{children}</div>
        <div className="st-modal-actions">{actions}</div>
      </div>
    </div>
  );
}

/* ---------- format help with an example ---------- */
export const SAMPLES = {
  listening: {
    questions: `Questions 1-5
Complete the notes below.
Write ONE WORD AND/OR A NUMBER for each answer.
Hotel booking
Name: Sarah 1 ……………
• arriving on 2 ……………
• room with a view of the 3 ……………
Price per night: £ 4 ……………
• breakfast served in the 5 ……………

Questions 6-7
Choose the correct letter, A, B or C.
6 Why does Sarah choose this hotel?
A It is close to the station.
B It has a swimming pool.
C It was recommended by a friend.
7 What will Sarah do on the first evening?
A go to a concert
B eat in the hotel
C visit the old town`,
    answers: `1 Jenkins
2 Friday
3 harbour / harbor
4 85
5 garden
6 C
7 A`,
  },
  reading: {
    questions: `Questions 1-3
Do the following statements agree with the information given in Reading Passage 1?
Write TRUE, FALSE or NOT GIVEN.
1 The first bridge was built of wood.
2 Most visitors arrive by train.
3 The museum is closed in winter.

Questions 4-6
Reading Passage 1 has three paragraphs, A-C.
Choose the correct heading for each paragraph from the list of headings below.
List of Headings
i A difficult beginning
ii Plans for the future
iii Why tourists come
iv A change of owner
4 Paragraph A
5 Paragraph B
6 Paragraph C

Questions 7-8
Complete the sentences below.
Choose ONE WORD ONLY from the passage for each answer.
7 The town became famous for its …………… .
8 Visitors can buy local …………… at the market.`,
    answers: `1 TRUE
2 NG
3 F
4 i
5 iii
6 ii
7 cheese
8 honey / (the) honey`,
  },
};

export function FormatHelp({ kind, onExample }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="st-help">
      <button type="button" className="st-help-toggle" onClick={() => setOpen(o => !o)}>
        {open ? '▾' : '▸'} How to paste questions and answers
      </button>
      {open && (
        <div className="st-help-body">
          <ul>
            <li>Copy the questions from the book or PDF and paste them as they are. Start each block with its title line, e.g. <code>Questions 1-10</code>, then its instructions.</li>
            <li>Gaps can be dots <code>……</code> or underscores <code>___</code>, with the question number before them: <code>shows you how to 1 ……… and cook</code> or <code>1 shows you how to ……… and cook</code>.</li>
            <li>Multiple choice: the question line, then options on separate lines: <code>A …</code>, <code>B …</code>, <code>C …</code>.</li>
            <li>A shared list (headings, people, endings, a box of words) is a list of lines <code>A …</code> or <code>i …</code> before or after the questions.</li>
            <li>True / False / Not Given and Yes / No / Not Given are recognised from the instructions.</li>
            <li>A picture (map, plan, diagram): press <b>Add picture</b> where it belongs.</li>
            <li>Answer key: one answer per line, <code>1 choose</code>, <code>11 B</code>, <code>14 iv</code>, <code>8 NG</code>. Several correct answers: <code>3 20 / twenty</code>. Optional word: <code>(the) river</code>. Two answers in any order: <code>21-22 B, D</code>.</li>
            <li>The preview on the right shows exactly what was understood. Red lines must be fixed before publishing.</li>
          </ul>
          {onExample && kind !== 'writing' && (
            <button type="button" className="btn btn-outline btn-sm" onClick={onExample}>Fill in a short example</button>
          )}
        </div>
      )}
    </div>
  );
}

/* insert text into a textarea at the cursor (used for pictures) */
export function insertAtCursor(el, value, text, setter) {
  if (!el) { setter(value + (value.endsWith('\n') || !value ? '' : '\n') + text + '\n'); return; }
  const pos = el.selectionStart ?? value.length;
  const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd = value.indexOf('\n', pos);
  const at = lineEnd === -1 ? value.length : lineEnd;   // after the current line
  const before = value.slice(0, at), after = value.slice(at);
  setter(`${before}${before && !before.endsWith('\n') ? '\n' : ''}${text}${after.startsWith('\n') ? '' : '\n'}${after}`);
  void lineStart;
}

export const STUDIO_CSS = `
.st-wrap{max-width:1280px;margin:0 auto;padding:24px 20px 120px}
.st-top{display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap}
.st-back{color:var(--text2);text-decoration:none;font-size:13.5px}
.st-back:hover{color:var(--text)}
.st-title-in{flex:1;min-width:240px;font-size:20px;font-weight:700;border:1px solid transparent;border-radius:8px;padding:8px 10px;background:transparent;color:var(--text);font-family:inherit}
.st-title-in:hover{border-color:var(--border)}
.st-title-in:focus{outline:none;border-color:var(--primary);background:var(--card)}
.st-pill{font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px}
.st-pill-draft{background:var(--yellow-bg);color:#9a6700}
.st-pill-live{background:var(--green-bg);color:var(--green)}
.st-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:18px;overflow-x:auto}
.st-tab{border:0;background:none;padding:10px 16px;font-size:14px;font-weight:500;color:var(--text2);cursor:pointer;border-bottom:2px solid transparent;display:flex;align-items:center;gap:7px;font-family:inherit;white-space:nowrap}
.st-tab:hover{color:var(--text)}
.st-tab-on{color:var(--primary);border-bottom-color:var(--primary);font-weight:600}
.st-dot{width:8px;height:8px;border-radius:50%;background:var(--border)}
.st-dot-ok{background:var(--green)}
.st-dot-bad{background:var(--accent)}
.st-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:start}
@media (max-width:900px){.st-cols{grid-template-columns:1fr}}
.st-field{margin-bottom:16px}
.st-field>label{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px;gap:8px}
.st-field>label span{font-weight:400;color:var(--text2);font-size:12px}
.st-field input[type=text],.st-field textarea{width:100%;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13.5px;background:var(--card);color:var(--text);font-family:inherit;line-height:1.55}
.st-field textarea{resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.8px}
.st-field textarea.st-prose{font-family:inherit;font-size:14px}
.st-field input:focus,.st-field textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-light)}
.st-audio{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px;border:1px dashed var(--border);border-radius:10px;background:var(--bg)}
.st-audio audio{height:36px;flex:1;min-width:220px}
.st-link-in{flex:1;min-width:200px;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:12.5px;background:var(--card);color:var(--text)}
.st-upload{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
.st-err-inline{color:var(--accent);font-size:12.5px}
.st-preview{position:sticky;top:72px;max-height:calc(100vh - 160px);overflow:auto;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 18px}
.st-preview-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:13px;color:var(--text2)}
.st-preview-head b{color:var(--text);font-size:14px}
.st-muted{color:var(--text2);font-size:13.5px;line-height:1.6}
.st-dim{opacity:.55;transition:opacity .2s}
.st-pgroup{margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--border)}
.st-pgroup:last-child{border-bottom:0}
.st-pgroup h4{font-size:14px;margin-bottom:4px}
.st-pinstr{font-size:12.5px;color:var(--text2);margin-bottom:2px}
.st-pimg{max-width:100%;max-height:180px;border:1px solid var(--border);border-radius:6px;margin:8px 0}
.st-pbox{border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin:8px 0;font-size:12.5px;line-height:1.6}
.st-pbox>b{display:block;margin-bottom:2px}
.st-pq{margin:8px 0 10px}
.st-phead{font-weight:700;font-size:13px;margin:8px 0 2px}
.st-pline{display:flex;gap:8px;font-size:13.5px;line-height:1.55}
.st-pnum{flex-shrink:0;min-width:24px;height:22px;border-radius:5px;background:var(--primary-light);color:var(--primary);font-weight:700;font-size:12px;display:inline-flex;align-items:center;justify-content:center}
.st-blank{display:inline-block;width:64px;border-bottom:2px solid var(--text2);margin:0 4px;vertical-align:-2px}
.st-popts{margin:4px 0 0 32px;font-size:12.8px;line-height:1.6;color:var(--text2)}
.st-popts .st-ok{color:var(--green);font-weight:600}
.st-pans{margin:4px 0 0 32px;font-size:12px;color:var(--text2)}
.st-chip{display:inline-block;background:var(--green-bg);color:var(--green);font-weight:600;border-radius:5px;padding:1px 7px;margin-left:5px;font-size:12px}
.st-chip-bad{background:var(--accent-light);color:var(--accent);margin-left:0}
.st-problems{margin-bottom:12px;display:flex;flex-direction:column;gap:5px}
.st-prob-err,.st-prob-warn{font-size:12.8px;border-radius:7px;padding:7px 10px;line-height:1.45}
.st-prob-err{background:var(--accent-light);color:var(--accent)}
.st-prob-warn{background:var(--yellow-bg);color:#9a6700}
.st-help{margin-bottom:16px;border:1px solid var(--border);border-radius:10px;background:var(--card)}
.st-help-toggle{width:100%;text-align:left;border:0;background:none;padding:10px 14px;font-size:13.5px;font-weight:600;color:var(--primary);cursor:pointer;font-family:inherit}
.st-help-body{padding:0 16px 14px;font-size:13px;line-height:1.6;color:var(--text)}
.st-help-body ul{padding-left:18px;margin-bottom:10px}
.st-help-body li{margin-bottom:4px}
.st-help-body code{background:var(--bg2);border-radius:4px;padding:1px 5px;font-size:12px}
.st-bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--border);box-shadow:0 -4px 16px rgba(0,0,0,.06);z-index:150}
.st-bar-in{max-width:1280px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.st-bar-status{flex:1;font-size:13.5px;color:var(--text2);min-width:200px}
.st-bar-status b{color:var(--text)}
.st-bar-status .st-bad{color:var(--accent);font-weight:600}
.st-bar-status .st-good{color:var(--green);font-weight:600}
.st-modal-bg{position:fixed;inset:0;background:rgba(17,24,39,.5);display:flex;align-items:center;justify-content:center;z-index:400;padding:20px}
.st-modal{background:var(--card);color:var(--text);border-radius:12px;max-width:520px;width:100%;padding:24px;box-shadow:0 24px 64px rgba(0,0,0,.25)}
.st-modal h3{font-size:18px;margin-bottom:10px}
.st-modal-body{font-size:14px;line-height:1.6;color:var(--text2);max-height:50vh;overflow:auto}
.st-modal-body li{margin:3px 0 3px 18px}
.st-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;flex-wrap:wrap}
.st-table{width:100%;border-collapse:collapse;font-size:14px}
.st-table th{text-align:left;font-size:12px;font-weight:600;color:var(--text2);padding:10px 12px;border-bottom:1px solid var(--border)}
.st-table td{padding:12px;border-bottom:1px solid var(--border);vertical-align:middle}
.st-table tr:last-child td{border-bottom:0}
.st-kind{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--text2)}
.st-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.st-new{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:26px}
@media (max-width:700px){.st-new{grid-template-columns:1fr}.st-hide-sm{display:none}}
.st-new a{display:block;text-decoration:none;color:var(--text);background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 18px;transition:border-color .15s,box-shadow .15s}
.st-new a:hover{border-color:var(--primary);box-shadow:var(--shadow-md)}
.st-new a b{display:block;font-size:15px;margin:6px 0 2px}
.st-new a span{font-size:12.5px;color:var(--text2)}
.st-wimg{margin-top:10px;max-width:100%;max-height:260px;border:1px solid var(--border);border-radius:8px;display:block}
`;

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import {
  KINDS, UploadButton, useParsed, ParsedPreview, Problems, Modal, FormatHelp,
  SAMPLES, insertAtCursor, STUDIO_CSS, errText,
} from './studioKit';

const emptySection = kind => (kind === 'listening'
  ? { audio_url: '', questions: '', answers: '' }
  : { title: '', text: '', questions: '', answers: '' });

const TASK1_HINT = 'The chart below shows …\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.';
const TASK2_HINT = 'Some people believe that …\n\nTo what extent do you agree or disagree?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words.';

/* Plays the uploaded audio and shows its length, or a clear message if it can't be played */
function AudioCheck({ src, audioRef }) {
  const [state, setState] = useState({ ok: null, dur: 0 });
  useEffect(() => { setState({ ok: null, dur: 0 }); }, [src]);
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <audio ref={audioRef} controls preload="metadata" src={src} style={{ width: '100%', height: 36 }}
        onLoadedMetadata={e => setState({ ok: true, dur: e.target.duration || 0 })}
        onError={() => setState({ ok: false, dur: 0 })} />
      <div style={{ fontSize: 12, marginTop: 4 }}>
        {state.ok === null && <span className="st-muted">Checking the audio…</span>}
        {state.ok && <span style={{ color: 'var(--green)' }}>✓ Audio works · length {fmt(state.dur)}</span>}
        {state.ok === false && <span style={{ color: 'var(--accent)' }}>This audio can't be played. Upload an mp3 file instead.</span>}
      </div>
    </div>
  );
}

const baseUrl = u => (u || '').split('#')[0];
const startOf = u => { const m = (u || '').match(/#t=([\d.]+)/); return m ? Number(m[1]) : null; };
const fmtTime = sec => (sec === null || sec === undefined || sec === '' ? '' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`);
// "7:32", "7.32", "452" -> seconds; '' -> null; anything else -> NaN
const parseTime = t => {
  const v = String(t || '').trim();
  if (!v) return null;
  const m = v.match(/^(\d{1,3})[:.](\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return /^\d+$/.test(v) ? Number(v) : NaN;
};

/* Listening: one recording for all parts (most books) or one file per part */
function AudioPanel({ mode, setMode, full, setFull, starts, setStarts, sections, setPartAudio, partsUsed }) {
  const ref = useRef(null);
  return (
    <div className="st-field" style={{ marginBottom: 18 }}>
      <label>Audio
        <span style={{ display: 'inline-flex', gap: 14 }}>
          <label className="st-radio"><input type="radio" checked={mode === 'single'} onChange={() => setMode('single')} /> One file for the whole test</label>
          <label className="st-radio"><input type="radio" checked={mode === 'separate'} onChange={() => setMode('separate')} /> A separate file for each part</label>
        </span>
      </label>
      {mode === 'single' ? (
        <div className="st-audio" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {full ? <AudioCheck src={full} audioRef={ref} /> : <span className="st-muted" style={{ flex: 1 }}>No audio yet. Upload the full recording (all parts in one mp3).</span>}
            <UploadButton accept="audio/*" label={full ? 'Replace audio' : 'Upload audio'} onDone={url => setFull(url)} />
          </div>
          {full && partsUsed > 1 && (
            <div style={{ marginTop: 10 }}>
              <div className="st-muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
                Optional: when each part starts, so the students' screen turns to that part by itself.
                Play the recording, pause where "Part 2" begins and press <b>Now</b>.
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {Array.from({ length: partsUsed - 1 }, (_, k) => k + 1).map(i => {
                  const bad = Number.isNaN(parseTime(starts[i]));
                  return (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      Part {i + 1} at
                      <input className="st-link-in" style={{ width: 70, minWidth: 0, flex: 'none', borderColor: bad ? 'var(--accent)' : undefined }}
                        placeholder="m:ss" value={starts[i] || ''}
                        onChange={e => setStarts(s => s.map((x, j) => (j === i ? e.target.value : x)))} />
                      <button type="button" className="btn btn-outline btn-sm"
                        onClick={() => ref.current && setStarts(s => s.map((x, j) => (j === i ? fmtTime(ref.current.currentTime) : x)))}>Now</button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="st-muted" style={{ fontSize: 12.5 }}>Upload each part's audio in its tab below.</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One Listening part or Reading passage                               */
/* ------------------------------------------------------------------ */
function SectionEditor({ kind, index, value, onChange, onStatus, visible, singleAudio }) {
  const qRef = useRef(null);
  const first = kind === 'listening' ? index * 10 + 1 : undefined;
  const last = kind === 'listening' ? index * 10 + 10 : undefined;
  const parsed = useParsed(kind, value.questions, value.answers, first, last);
  const set = (k, v) => onChange({ ...value, [k]: v });

  const missing = [];
  if (kind === 'listening' && !singleAudio && !value.audio_url.trim()) missing.push(`Part ${index + 1}: upload the audio file.`);
  if (kind === 'reading' && !value.text.trim()) missing.push(`Passage ${index + 1}: paste the passage text.`);
  const errors = [...missing, ...(parsed.errors || [])];

  useEffect(() => {
    onStatus(index, { count: parsed.questions.length, errors: errors.length, loading: parsed.loading });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, errors.length, index]);

  if (!visible) return null;
  const unit = KINDS[kind].unit;

  return (
    <div className="st-cols">
      <div>
        {kind === 'listening' && !singleAudio && (
          <div className="st-field">
            <label>Audio for Part {index + 1} <span>mp3 or m4a, plays once in the test</span></label>
            <div className="st-audio">
              {value.audio_url
                ? <AudioCheck src={value.audio_url} />
                : <span className="st-muted" style={{ flex: 1 }}>No audio yet.</span>}
              <UploadButton accept="audio/*" label={value.audio_url ? 'Replace audio' : 'Upload audio'}
                onDone={url => set('audio_url', url)} />
            </div>
            <input className="st-link-in" style={{ marginTop: 8, width: '100%' }} type="text"
              placeholder="…or paste a link to the audio file"
              value={value.audio_url} onChange={e => set('audio_url', e.target.value)} />
          </div>
        )}

        {kind === 'reading' && (
          <>
            <div className="st-field">
              <label>Passage {index + 1} title</label>
              <input type="text" value={value.title} placeholder="e.g. Case Study: Tourism New Zealand website"
                onChange={e => set('title', e.target.value)} />
            </div>
            <div className="st-field">
              <label>Passage text <span>empty line between paragraphs · letter (A, B…) on its own line for lettered paragraphs</span></label>
              <textarea className="st-prose" rows={12} value={value.text} onChange={e => set('text', e.target.value)}
                placeholder="Paste the reading passage here" />
            </div>
          </>
        )}

        <div className="st-field">
          <label>
            Questions {kind === 'listening' ? `${first}–${last}` : ''}
            <UploadButton small accept="image/*" label="Add picture"
              onDone={url => insertAtCursor(qRef.current, value.questions, `[img:${url}]`, v => set('questions', v))} />
          </label>
          <textarea ref={qRef} rows={16} value={value.questions} onChange={e => set('questions', e.target.value)}
            placeholder={`Questions ${first || 1}-${last || 13}\nComplete the notes below.\n…`} spellCheck={false} />
        </div>
        <div className="st-field">
          <label>Answer key <span>one per line: 1 choose · 11 B · 14 iv · 8 NG · 3 20 / twenty</span></label>
          <textarea rows={7} value={value.answers} onChange={e => set('answers', e.target.value)}
            placeholder={'1 choose\n2 private\n3 20 / twenty'} spellCheck={false} />
        </div>
        <FormatHelp kind={kind} onExample={() => onChange({ ...value, ...SAMPLES[kind] })} />
      </div>

      <div className="st-preview">
        <div className="st-preview-head">
          <b>What students will see — {unit} {index + 1}</b>
          <span>{parsed.loading ? 'checking…' : `${parsed.questions.length} questions`}</span>
        </div>
        <Problems errors={errors} warnings={parsed.warnings} />
        <ParsedPreview parsed={parsed} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export default function StudioEditor() {
  const { kind, id } = useParams();
  const navigate = useNavigate();
  const meta = KINDS[kind];
  const isNew = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [sections, setSections] = useState(() => (kind === 'writing' ? [] :
    Array.from({ length: meta?.count || 1 }, () => emptySection(kind))));
  const [writing, setWriting] = useState({ task1: '', task1_image: '', task2: '' });
  const [tab, setTab] = useState(0);
  const [audioMode, setAudioMode] = useState('single');
  const [fullAudio, setFullAudio] = useState('');
  const [starts, setStarts] = useState(['', '', '', '']);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState(null);
  const [confirmImport, setConfirmImport] = useState(null);
  const importRef = useRef(null);
  const [status, setStatus] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState(null);
  const [restore, setRestore] = useState(null);
  const draftKey = `studio-draft:${kind}:${id}`;

  useEffect(() => {
    if (isNew || !meta) return;
    api.get(`/studio/${kind}/${id}/`).then(({ data }) => {
      setTitle(data.title);
      setIsActive(data.is_active);
      if (kind === 'writing') setWriting({ task1: data.task1, task1_image: data.task1_image, task2: data.task2 });
      else {
        const list = kind === 'listening' ? data.parts : data.passages;
        const filled = list.map(x => ({ ...emptySection(kind), ...x }));
        while (filled.length < meta.count) filled.push(emptySection(kind));
        if (kind === 'listening') {
          const one = list.length > 1 && list.every(x => baseUrl(x.audio_url) === baseUrl(list[0].audio_url));
          setAudioMode(one || list.length === 1 ? 'single' : 'separate');
          if (one || list.length === 1) {
            setFullAudio(baseUrl(list[0].audio_url));
            setStarts(filled.map((x, i) => (i ? fmtTime(startOf(x.audio_url)) : '')));
            filled.forEach(x => { x.audio_url = ''; });
          }
        }
        setSections(filled);
      }
    }).catch(e => setLoadError(e?.response?.status === 404 ? 'This test was not found, or it belongs to another teacher.' : errText(e)))
      .finally(() => setLoading(false));
  }, [kind, id, isNew, meta]);

  // Unsaved work kept in this browser: offer to bring it back
  useEffect(() => {
    if (loading) return;
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (d && d.at) setRestore(d);
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, draftKey]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), title, sections, writing, audioMode, fullAudio, starts })); } catch { /* full or blocked */ }
    }, 800);
    return () => clearTimeout(t);
  }, [dirty, title, sections, writing, audioMode, fullAudio, starts, draftKey]);

  const forgetDraft = keys => keys.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
  const doRestore = () => {
    setTitle(restore.title || '');
    if (kind === 'writing') setWriting(restore.writing || writing);
    else if (restore.sections?.length) setSections(restore.sections);
    if (restore.audioMode) { setAudioMode(restore.audioMode); setFullAudio(restore.fullAudio || ''); setStarts(restore.starts || ['', '', '', '']); }
    setRestore(null); setDirty(true);
  };

  // warn before closing the tab with unsaved work
  useEffect(() => {
    if (!dirty) return;
    const h = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const onStatus = useCallback((i, s) => setStatus(prev => ({ ...prev, [i]: s })), []);
  const change = fn => { setDirty(true); fn(); };

  // Listening: parts that are completely empty are not sent (a test may have fewer than 4)
  const usedSections = sections.filter((s, i) => i === 0 || s.questions.trim() || s.answers.trim()
    || (s.audio_url || '').trim() || (s.text || '').trim());

  const listeningParts = () => usedSections.map((s, i) => {
    if (audioMode !== 'single') return s;
    const t = parseTime(starts[i]);
    return { ...s, audio_url: fullAudio ? fullAudio + (i > 0 && t ? `#t=${t}` : '') : '' };
  });
  const payload = active => (kind === 'writing'
    ? { title, is_active: active, ...writing }
    : kind === 'listening'
      ? { title, is_active: active, parts: listeningParts() }
      : { title, is_active: active, passages: usedSections });

  /* Import a whole Listening test from the teacher's PDF / Word file */
  const runImport = async file => {
    setImporting(true); setImportNote(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/studio/import/listening/', fd, { timeout: 180000 });
      change(() => setSections(prev => prev.map((s, i) => ({ ...s, ...(data.parts[i] || { questions: '', answers: '' }) }))));
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
      setTab(0);
      setImportNote({ ok: true, warnings: data.warnings || [] });
    } catch (e) {
      setImportNote({ ok: false, warnings: [errText(e)] });
    } finally { setImporting(false); }
  };
  const pickImport = e => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const hasText = sections.some(s => s.questions.trim() || s.answers.trim());
    if (hasText) setConfirmImport(f); else runImport(f);
  };

  const save = async active => {
    if (!title.trim()) { setProblem({ title: 'Write the test title first', errors: ['The title is shown to students, e.g. "Mock Test 5".'] }); return null; }
    if (kind === 'listening' && audioMode === 'single') {
      const bad = starts.map((x, i) => (i && Number.isNaN(parseTime(x)) ? `Part ${i + 1} start time "${x}" is not a time. Write it like 7:32.` : null)).filter(Boolean);
      if (!fullAudio) bad.unshift('Upload the audio file (all parts in one file).');
      if (bad.length && active) { setProblem({ title: "Can't publish yet", errors: bad, canDraft: true }); return null; }
    }
    setSaving(true); setNotice('');
    try {
      const { data } = isNew
        ? await api.post(`/studio/${kind}/`, payload(active))
        : await api.put(`/studio/${kind}/${id}/`, payload(active));
      setIsActive(active);
      setDirty(false);
      forgetDraft([draftKey, `studio-draft:${kind}:new`, `studio-draft:${kind}:${data.id}`]);
      setNotice(active ? 'Published — students can see this test now.' : 'Saved as a draft. Students cannot see it yet.');
      if (data.warnings?.length && !active) setNotice(`Saved as a draft with ${data.warnings.length} problem(s) to fix before publishing.`);
      if (isNew) navigate(`/studio/${kind}/${data.id}`, { replace: true });
      return data.id;
    } catch (e) {
      const errs = e?.response?.data?.errors;
      setProblem({
        title: active ? "Can't publish yet" : "Couldn't save",
        errors: errs || [errText(e)],
        canDraft: active && !!errs,
      });
      return null;
    } finally { setSaving(false); }
  };

  const preview = async () => {
    const w = window.open('', '_blank');
    let testId = isNew ? null : id;
    if (dirty || isNew) testId = await save(isActive);
    if (!testId) { w?.close(); return; }
    const url = `/${kind}/${testId}?preview=1`;
    if (w) w.location.href = url; else window.location.href = url;
  };

  if (!meta) return <div className="container"><p>Unknown test type.</p></div>;
  if (loading) return <div className="container"><p className="text-muted">Loading…</p></div>;
  if (loadError) return <div className="container"><p className="error">{loadError}</p><Link to="/studio">← Back to the studio</Link></div>;

  const totalQ = Object.entries(status).filter(([i]) => Number(i) < usedSections.length || Number(i) === 0)
    .reduce((n, [, s]) => n + (s.count || 0), 0);
  const totalErr = Object.entries(status).filter(([i]) => Number(i) < usedSections.length || Number(i) === 0)
    .reduce((n, [, s]) => n + (s.errors || 0), 0);
  const writingErr = kind === 'writing' ? [!writing.task1.trim(), !writing.task2.trim()].filter(Boolean).length : 0;
  const problems = kind === 'writing' ? writingErr : totalErr;

  return (
    <div className="st-wrap">
      <style>{STUDIO_CSS}</style>
      <div className="st-top">
        <Link to="/studio" className="st-back">← All tests</Link>
        <input className="st-title-in" value={title} placeholder={`${meta.label} test title, e.g. "Mock Test 5"`}
          onChange={e => change(() => setTitle(e.target.value))} />
        <span className={`st-pill ${isActive ? 'st-pill-live' : 'st-pill-draft'}`}>{isActive ? 'Published' : 'Draft'}</span>
      </div>

      {restore && (
        <div className="st-prob-warn" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ flex: 1 }}>You have unsaved work from {new Date(restore.at).toLocaleString()} in this browser.</span>
          <button className="btn btn-primary btn-sm" onClick={doRestore}>Restore it</button>
          <button className="btn btn-outline btn-sm" onClick={() => { forgetDraft([draftKey]); setRestore(null); }}>Discard</button>
        </div>
      )}

      {kind === 'listening' && (
        <>
          <div className="st-import">
            <div style={{ flex: 1, minWidth: 220 }}>
              <b>Have the test as a PDF or Word file?</b>
              <div className="st-muted" style={{ fontSize: 12.5 }}>Upload it: Part 1–4, the answer key and the pictures are put in their places. Transcripts are skipped.</div>
            </div>
            <input ref={importRef} type="file" accept=".pdf,.docx,.txt" hidden onChange={pickImport} />
            <button className="btn btn-primary" disabled={importing} onClick={() => importRef.current?.click()}>
              {importing ? 'Reading the file…' : 'Import from PDF / Word'}
            </button>
          </div>
          {importNote && (
            <div className={importNote.ok ? 'st-import-ok' : 'st-prob-err'} style={{ marginBottom: 14 }}>
              {importNote.ok && <b>Imported. Check each part in the preview on the right.</b>}
              {importNote.warnings.map((w, i) => <div key={i}>{w}</div>)}
              <button className="st-x" onClick={() => setImportNote(null)} aria-label="Close">×</button>
            </div>
          )}
          <AudioPanel mode={audioMode} setMode={m => change(() => setAudioMode(m))}
            full={fullAudio} setFull={u => change(() => setFullAudio(u))}
            starts={starts} setStarts={fn => change(() => setStarts(fn))}
            partsUsed={usedSections.length} />
        </>
      )}

      {kind !== 'writing' && (
        <>
          <div className="st-tabs">
            {sections.map((s, i) => {
              const st = status[i];
              const empty = i > 0 && !usedSections.includes(s);
              const cls = empty ? '' : st?.errors ? 'st-dot-bad' : st?.count ? 'st-dot-ok' : '';
              return (
                <button key={i} className={`st-tab ${tab === i ? 'st-tab-on' : ''}`} onClick={() => setTab(i)}>
                  <span className={`st-dot ${cls}`} />{meta.unit} {i + 1}
                  {!empty && st?.count ? <span className="text-muted" style={{ fontSize: 12 }}>· {st.count}</span> : null}
                </button>
              );
            })}
          </div>
          {sections.map((s, i) => (
            <SectionEditor key={i} kind={kind} index={i} value={s} visible={tab === i} onStatus={onStatus}
              singleAudio={kind === 'listening' && audioMode === 'single'}
              onChange={v => change(() => setSections(prev => prev.map((x, j) => (j === i ? v : x))))} />
          ))}
        </>
      )}

      {kind === 'writing' && (
        <div className="st-cols">
          <div>
            <div className="st-field">
              <label>Task 1 question <span>about 20 minutes, at least 150 words</span></label>
              <textarea className="st-prose" rows={8} value={writing.task1} placeholder={TASK1_HINT}
                onChange={e => change(() => setWriting(w => ({ ...w, task1: e.target.value })))} />
            </div>
            <div className="st-field">
              <label>Task 1 picture <span>chart, table, map, process or diagram</span></label>
              <div className="st-audio">
                <span className="st-muted" style={{ flex: 1 }}>{writing.task1_image ? 'Picture added.' : 'No picture yet.'}</span>
                <UploadButton accept="image/*" label={writing.task1_image ? 'Replace picture' : 'Upload picture'}
                  onDone={url => change(() => setWriting(w => ({ ...w, task1_image: url })))} />
                {writing.task1_image && (
                  <button className="btn btn-ghost btn-sm" onClick={() => change(() => setWriting(w => ({ ...w, task1_image: '' })))}>Remove</button>
                )}
              </div>
            </div>
            <div className="st-field">
              <label>Task 2 question <span>about 40 minutes, at least 250 words</span></label>
              <textarea className="st-prose" rows={8} value={writing.task2} placeholder={TASK2_HINT}
                onChange={e => change(() => setWriting(w => ({ ...w, task2: e.target.value })))} />
            </div>
          </div>
          <div className="st-preview">
            <div className="st-preview-head"><b>What students will see</b></div>
            <Problems errors={[!writing.task1.trim() && 'Write the Task 1 question.', !writing.task2.trim() && 'Write the Task 2 question.'].filter(Boolean)}
              warnings={writing.task1_image ? [] : ['Task 1 has no picture yet.']} />
            <h4 style={{ fontSize: 14, marginBottom: 6 }}>Part 1</h4>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6 }}>{writing.task1 || <span className="st-muted">Task 1 question</span>}</p>
            {writing.task1_image && <img className="st-wimg" src={writing.task1_image} alt="Task 1" />}
            <h4 style={{ fontSize: 14, margin: '18px 0 6px' }}>Part 2</h4>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6 }}>{writing.task2 || <span className="st-muted">Task 2 question</span>}</p>
          </div>
        </div>
      )}

      <div className="st-bar">
        <div className="st-bar-in">
          <div className="st-bar-status">
            {notice ? <span className="st-good">{notice}</span> : (
              <>
                {kind !== 'writing' && <><b>{totalQ}</b>{totalQ !== 40 ? ' of 40' : ''} questions · </>}
                {problems ? <span className="st-bad">{problems} problem{problems > 1 ? 's' : ''} to fix</span>
                  : <span className="st-good">Ready to publish</span>}
                {dirty && ' · unsaved changes'}
              </>
            )}
          </div>
          <button className="btn btn-outline" disabled={saving} onClick={preview}>Preview as student</button>
          {isActive ? (
            <>
              <button className="btn btn-outline" disabled={saving} onClick={() => save(false)}>Unpublish</button>
              <button className="btn btn-primary" disabled={saving} onClick={() => save(true)}>{saving ? 'Saving…' : 'Save changes'}</button>
            </>
          ) : (
            <>
              <button className="btn btn-outline" disabled={saving} onClick={() => save(false)}>{saving ? 'Saving…' : 'Save draft'}</button>
              <button className="btn btn-primary" disabled={saving} onClick={() => save(true)}>Publish</button>
            </>
          )}
        </div>
      </div>

      {confirmImport && (
        <Modal title="Replace the questions typed now?" onClose={() => setConfirmImport(null)} actions={<>
          <button className="btn btn-outline" onClick={() => setConfirmImport(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { const f = confirmImport; setConfirmImport(null); runImport(f); }}>Import and replace</button>
        </>}>
          The questions and answers in Part 1–4 are replaced with the ones from "{confirmImport.name}". The audio stays.
        </Modal>
      )}
      {problem && (
        <Modal title={problem.title} onClose={() => setProblem(null)} actions={<>
          {problem.canDraft && <button className="btn btn-outline" onClick={() => { setProblem(null); save(false); }}>Save as draft</button>}
          <button className="btn btn-primary" onClick={() => setProblem(null)}>OK, I'll fix it</button>
        </>}>
          <ul>{problem.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Modal>
      )}
    </div>
  );
}

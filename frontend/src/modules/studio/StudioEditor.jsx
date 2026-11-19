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

/* ------------------------------------------------------------------ */
/* One Listening part or Reading passage                               */
/* ------------------------------------------------------------------ */
function SectionEditor({ kind, index, value, onChange, onStatus, visible }) {
  const qRef = useRef(null);
  const first = kind === 'listening' ? index * 10 + 1 : undefined;
  const last = kind === 'listening' ? index * 10 + 10 : undefined;
  const parsed = useParsed(kind, value.questions, value.answers, first, last);
  const set = (k, v) => onChange({ ...value, [k]: v });

  const missing = [];
  if (kind === 'listening' && !value.audio_url.trim()) missing.push(`Part ${index + 1}: upload the audio file.`);
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
        {kind === 'listening' && (
          <div className="st-field">
            <label>Audio for Part {index + 1} <span>mp3 or m4a, plays once in the test</span></label>
            <div className="st-audio">
              {value.audio_url
                ? <audio controls preload="none" src={value.audio_url} />
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
  const [status, setStatus] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState(null);

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
        setSections(filled);
      }
    }).catch(e => setLoadError(e?.response?.status === 404 ? 'This test was not found, or it belongs to another teacher.' : errText(e)))
      .finally(() => setLoading(false));
  }, [kind, id, isNew, meta]);

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

  const payload = active => (kind === 'writing'
    ? { title, is_active: active, ...writing }
    : { title, is_active: active, [kind === 'listening' ? 'parts' : 'passages']: usedSections });

  const save = async active => {
    if (!title.trim()) { setProblem({ title: 'Write the test title first', errors: ['The title is shown to students, e.g. "Mock Test 5".'] }); return null; }
    setSaving(true); setNotice('');
    try {
      const { data } = isNew
        ? await api.post(`/studio/${kind}/`, payload(active))
        : await api.put(`/studio/${kind}/${id}/`, payload(active));
      setIsActive(active);
      setDirty(false);
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
                {kind !== 'writing' && <><b>{totalQ}</b> questions · </>}
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

import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAntiCheat } from '../../hooks/useAntiCheat';
import { FullscreenGate, ViolationWarning, BlockedScreen } from '../../components/AntiCheatOverlay';
import { useAuth } from '../../context/AuthContext';
import {
  EXAM_CSS, ZoomableImage, isPreview, PreviewGate, PreviewBadge,
  postWithRetry, examKey, examStore, SendError,
} from '../../components/examKit';

const MIN1 = 150, MIN2 = 250;
const TASK1_MINS = 20, TASK2_MINS = 40;
const wc = t => t.trim().split(/\s+/).filter(Boolean).length;

const TOTAL_MINS = TASK1_MINS + TASK2_MINS; // one shared 60-minute clock, like the real exam

// One countdown for the whole Writing test. It is based on a fixed end time,
// so switching between Task 1 and Task 2 never pauses it.
function useExamTimer(minutes, running, startedAtRef) {
  const [secs, setSecs] = useState(minutes * 60);

  useEffect(() => {
    if (!running) return;
    // counted from the real start time: a reload continues the clock, never resets it
    const end = (startedAtRef.current || Date.now()) + minutes * 60 * 1000;
    const tick = () => setSecs(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [running, minutes, startedAtRef]);

  // Short beep when 5 minutes are left
  useEffect(() => {
    if (secs === 300 && running) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.start();
        setTimeout(() => osc.stop(), 600);
      } catch (e) {}
    }
  }, [secs, running]);

  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return { secs, display: `${m}:${s}`, low: secs < 300, isExpired: secs === 0 };
}

export default function WritingTest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const preview = isPreview(user);
  const [split, setSplit] = useState(50);
  const dragRef = useRef(false);
  const [test, setTest] = useState(null);
  const [task1, setTask1] = useState('');
  const [task2, setTask2] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [activeTask, setActiveTask] = useState(1);
  const [started, setStarted] = useState(false);
  const [confirm, setConfirm] = useState(null); // list of problems before submit
  const [error, setError] = useState('');
  const [sendState, setSendState] = useState('idle');
  const [loadError, setLoadError] = useState(false);
  const startedAtRef = useRef(null);
  const sendingRef = useRef(false);
  const lastReason = useRef('manual');
  const key = examKey('writing', id, user);

  useEffect(() => {
    api.get(`/writing/${id}/`).then(r => setTest(r.data))
      .catch(e => { if (e?.response?.status !== 404) setLoadError(true); })
      .finally(() => setLoading(false));
  }, [id]);

  const timer = useExamTimer(TOTAL_MINS, started && !submitted, startedAtRef);

  // The essays are kept in this browser while the student writes
  useEffect(() => {
    if (!started || submitted || preview) return;
    const t = setTimeout(() => examStore.save(key, { startedAt: startedAtRef.current, task1, task2, activeTask }), 400);
    return () => clearTimeout(t);
  }, [task1, task2, activeTask, started, submitted, preview, key]);

  // How long the student spent on each task (for the teacher's report only)
  const spentRef = useRef({ 1: 0, 2: 0 });
  const segRef = useRef({ task: 1, at: null });
  const closeSegment = () => {
    const seg = segRef.current;
    if (seg.at) { spentRef.current[seg.task] += Date.now() - seg.at; seg.at = Date.now(); }
  };
  useEffect(() => {
    if (!started) return;
    closeSegment();
    segRef.current = { task: activeTask, at: Date.now() };
  }, [activeTask, started]);

  const timeInfo = (finishReason) => (closeSegment(), {
    time_spent: startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : null,
    time_limit: TOTAL_MINS * 60,
    task1_time: Math.round(spentRef.current[1] / 1000),
    task2_time: Math.round(spentRef.current[2] / 1000),
    finish_reason: finishReason,
  });

  // Short or empty tasks are allowed — the student just confirms first,
  // and whatever was written is always sent to the teacher.
  const handleSubmit = () => {
    if (submitting) return;
    const problems = [];
    const n1 = wc(task1), n2 = wc(task2);
    if (n1 === 0) problems.push('Task 1 is empty.');
    else if (n1 < MIN1) problems.push(`Task 1 has ${n1} words (minimum ${MIN1}).`);
    if (n2 === 0) problems.push('Task 2 is empty.');
    else if (n2 < MIN2) problems.push(`Task 2 has ${n2} words (minimum ${MIN2}).`);
    if (problems.length) { setConfirm(problems); return; }
    doSubmit();
  };

  // One way to send, used by the Submit button, the timer and the anti-cheat lock.
  // It retries by itself; if the internet stays down the essays stay saved here.
  const send = async (finishReason) => {
    if (preview || submitted || sendingRef.current) return;
    sendingRef.current = true;
    lastReason.current = finishReason;
    setConfirm(null); setError('');
    setSubmitting(true); setSendState('sending');
    try {
      await postWithRetry(`/writing/${id}/submit/`, { task1_text: task1, task2_text: task2, ...timeInfo(finishReason) });
      examStore.clear(key);
      setSendState('sent');
      setSubmitted(true); window.scrollTo(0, 0);
    } catch {
      setSendState('failed');
      setError('failed');
    } finally { sendingRef.current = false; setSubmitting(false); }
  };
  const doSubmit = () => send('manual');
  const forceSubmit = (finishReason = 'timeout') => send(finishReason);

  // 60 minutes are over -> both tasks are submitted automatically
  useEffect(() => {
    if (started && timer.isExpired) forceSubmit('timeout');
  }, [timer.isExpired, started]);

  const { violations, warning, blocked, dismissWarning, enterFullscreen, exitFullscreen } =
    useAntiCheat({ active: started && !submitted && !preview, onBlocked: () => forceSubmit('blocked'), testType: 'writing', testId: id,
      persistKey: preview ? null : key });

  const handleStart = async () => {
    await enterFullscreen();
    const saved = examStore.load(key);
    startedAtRef.current = saved?.startedAt || Date.now();
    if (saved) { setTask1(saved.task1 || ''); setTask2(saved.task2 || ''); setActiveTask(saved.activeTask || 1); }
    setStarted(true);
  };

  useEffect(() => { if (submitted || blocked) exitFullscreen(); }, [submitted, blocked]);

  // resizable divider between the task and the answer box
  useEffect(() => {
    const move = e => { if (dragRef.current) setSplit(Math.min(70, Math.max(30, (e.clientX / window.innerWidth) * 100))); };
    const up = () => { dragRef.current = false; document.body.style.cursor = ''; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  if (loading) return <div className="container"><p className="text-muted">Loading...</p></div>;
  if (loadError) return (
    <div className="container"><p>The test could not be loaded. Check the internet connection.</p>
      <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>Try again</button></div>
  );
  if (!test) return <div className="container"><p>Test not found.</p></div>;
  if (blocked) return <BlockedScreen status={sendState === 'idle' ? 'sending' : sendState}
    onRetry={() => send(lastReason.current)} onBack={() => navigate('/writing')} />;
  if (!started && preview) return <PreviewGate title={test.title} onStart={() => { startedAtRef.current = Date.now(); setStarted(true); }} />;
  if (!started) return <FullscreenGate title={test.title} resume={!!examStore.load(key)} onStart={handleStart} />;

  if (submitted) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 56px)' }}>
      <div className="card" style={{ maxWidth: 480, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Submitted Successfully!</h2>
        <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          Your essays have been sent to your teacher for review.
        </p>
        <button onClick={() => navigate('/writing')} className="btn btn-primary" style={{ justifyContent: 'center' }}>← Back to Writing Tests</button>
      </div>
    </div>
  );

  const w1 = wc(task1), w2 = wc(task2);
  const t1ImgMatch = (test.task1_question || '').match(/\[img:([^\]]+)\]/);
  const t1Img = test.task1_image || (t1ImgMatch && t1ImgMatch[1]);
  const t1Text = (test.task1_question || '').replace(/\[img:[^\]]+\]\s*/, '');
  const isT1 = activeTask === 1;
  const words = isT1 ? w1 : w2;
  const min = isT1 ? MIN1 : MIN2;

  return (
    <div className="rx-root">
      {preview && <PreviewBadge />}
      <style>{EXAM_CSS}</style>
      <header className="rx-header">
        <div className="rx-brand">IELTS</div>
        <div className="rx-taker">Test taker: <b>{user?.first_name || user?.username}</b></div>
        <div className="rx-title">{test.title}</div>
        <div className={`rx-timer ${timer.low ? 'rx-timer-low' : ''}`}>{timer.display} left</div>
      </header>

      <main className="rx-main">
        <section className="rx-left" style={{ width: `${split}%` }}>
          <div className="rx-partbox">
            <b>Part {activeTask}</b>
            <p>You should spend about {isT1 ? 20 : 40} minutes on this task. Write at least {min} words.</p>
          </div>
          <div className="wx-prompt">{isT1 ? t1Text : test.task2_question}</div>
          {isT1 && t1Img && <ZoomableImage src={t1Img} alt="Task 1 diagram" height={460} />}
        </section>

        <div className="rx-divider" onMouseDown={e => { e.preventDefault(); dragRef.current = true; document.body.style.cursor = 'col-resize'; }}>
          <span />
        </div>

        <section className="rx-right wx-right">
          <textarea
            key={activeTask}
            className="wx-text"
            value={isT1 ? task1 : task2}
            onChange={e => (isT1 ? setTask1 : setTask2)(e.target.value)}
            placeholder={`Write your Task ${activeTask} answer here…`}
            spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
          />
          <div className="wx-count">
            <span>Words: <b className={words >= min ? 'wx-ok' : ''}>{words}</b> / {min}+</span>
            <span>{words >= min ? 'Minimum reached ✓' : `${min - words} more to reach the minimum`}</span>
          </div>
        </section>
      </main>

      <footer className="rx-footer">
        <div className="rx-parts" style={{ justifyContent: 'flex-start', gap: 28 }}>
          {[1, 2].map(n => {
            const w = n === 1 ? w1 : w2, m = n === 1 ? MIN1 : MIN2;
            return activeTask === n ? (
              <div key={n} className="rx-part-on"><b>Part {n}</b><span style={{ fontSize: 14, color: w >= m ? '#16a34a' : '#6b7280' }}>{w} words</span></div>
            ) : (
              <button key={n} className="rx-part-off" onClick={() => setActiveTask(n)}>Part {n} <span>{w} words</span></button>
            );
          })}
        </div>
        <button className="rx-submit" onClick={() => (preview ? window.close() || navigate('/studio') : handleSubmit())} disabled={submitting}>
          {preview ? 'Exit preview' : submitting ? 'Submitting…' : 'Submit'}
        </button>
      </footer>

      {error && <SendError onRetry={() => send(lastReason.current)} />}
      {confirm && !error && (
        <div className="rx-modal-bg">
          <div className="rx-modal">
            <h3>{error ? 'Could not submit' : 'Submit anyway?'}</h3>
            {error
              ? <p>{error}</p>
              : <ul style={{ paddingLeft: 18, fontSize: 14.5, color: '#4b5563', lineHeight: 1.6 }}>{confirm.map(p => <li key={p}>{p}</li>)}</ul>}
            <div className="rx-modal-btns">
              <button onClick={() => { setConfirm(null); setError(''); }}>{error ? 'OK' : 'Keep writing'}</button>
              {!error && <button className="rx-danger" onClick={doSubmit}>Submit</button>}
            </div>
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

import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAntiCheat } from '../../hooks/useAntiCheat';
import { FullscreenGate, ViolationWarning, BlockedScreen } from '../../components/AntiCheatOverlay';

const MIN1 = 150, MIN2 = 250;
const TASK1_MINS = 20, TASK2_MINS = 40;
const wc = t => t.trim().split(/\s+/).filter(Boolean).length;

// Alohida vaqt boshqaruvchi hook
function useTaskTimer(minutes, active) {
  const [secs, setSecs] = useState(minutes * 60);
  const savedSecs = useRef(minutes * 60);

  useEffect(() => {
    if (!active) {
      savedSecs.current = secs;
      return;
    }
    const iv = setInterval(() => {
      setSecs(p => {
        if (p <= 1) { clearInterval(iv); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [active]);

  // Ovozli ogohlantirish — 5 daqiqa qolganda
  useEffect(() => {
    if (secs === 300 && active) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.start();
        setTimeout(() => osc.stop(), 600);
      } catch (e) {}
    }
  }, [secs, active]);

  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  const low = secs < 240; // 4 daqiqa
  const warning5 = secs < 300; // 5 daqiqa

  return { secs, display: `${m}:${s}`, low, warning5, isExpired: secs === 0 };
}

export default function WritingTest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [task1, setTask1] = useState('');
  const [task2, setTask2] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [activeTask, setActiveTask] = useState(1);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    api.get(`/writing/${id}/`).then(r => setTest(r.data)).finally(() => setLoading(false));
  }, [id]);

  // Har task uchun alohida timer — faqat aktiv task vaqti ketadi
  const t1Timer = useTaskTimer(TASK1_MINS, started && activeTask === 1 && !submitted);
  const t2Timer = useTaskTimer(TASK2_MINS, started && activeTask === 2 && !submitted);

  const activeTimer = activeTask === 1 ? t1Timer : t2Timer;

  const handleSubmit = async () => {
    if (submitting) return;
    if (wc(task1) < MIN1) { alert(`Task 1 must be at least ${MIN1} words. Currently: ${wc(task1)}`); return; }
    if (wc(task2) < MIN2) { alert(`Task 2 must be at least ${MIN2} words. Currently: ${wc(task2)}`); return; }
    setSubmitting(true);
    try {
      await api.post(`/writing/${id}/submit/`, { task1_text: task1, task2_text: task2 });
      setSubmitted(true); window.scrollTo(0, 0);
    } catch { alert('Submission failed. Please try again.'); }
    finally { setSubmitting(false); }
  };

  const forceSubmit = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      await api.post(`/writing/${id}/submit/`, { task1_text: task1, task2_text: task2 });
      setSubmitted(true);
    } catch {}
    finally { setSubmitting(false); }
  };

  // Timer tugaganda avtomatik keyingi taskga o'tish yoki submit
  useEffect(() => {
    if (started && activeTask === 1 && t1Timer.isExpired) {
      setActiveTask(2);
    }
    if (started && activeTask === 2 && t2Timer.isExpired) {
      forceSubmit();
    }
  }, [t1Timer.isExpired, t2Timer.isExpired, started]);

  const { violations, warning, blocked, dismissWarning, enterFullscreen, exitFullscreen } =
    useAntiCheat({ active: started && !submitted, onBlocked: forceSubmit, testType: 'writing', testId: id });

  const handleStart = async () => { await enterFullscreen(); setStarted(true); };

  useEffect(() => { if (submitted || blocked) exitFullscreen(); }, [submitted, blocked]);

  if (loading) return <div className="container"><p className="text-muted">Loading...</p></div>;
  if (!test) return <div className="container"><p>Test not found.</p></div>;
  if (blocked) return <BlockedScreen onBack={() => navigate('/writing')} />;
  if (!started) return <FullscreenGate onStart={handleStart} />;

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

  return (
    <div className="container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>Writing Test</div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{test.title}</h2>
        </div>
        {/* Alohida timer */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: activeTask === 1 ? (t1Timer.low ? '#fee2e2' : 'var(--primary-light)') : 'var(--bg2)',
            color: activeTask === 1 ? (t1Timer.low ? '#dc2626' : 'var(--primary)') : 'var(--text2)',
            border: `1px solid ${activeTask === 1 ? (t1Timer.low ? '#fca5a5' : 'var(--border)') : 'var(--border)'}`,
          }}>
            ⏱ T1: {t1Timer.display}
            {t1Timer.warning5 && activeTask === 1 && <span style={{ marginLeft: 6, fontSize: 11 }}>⚠️</span>}
          </div>
          <div style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: activeTask === 2 ? (t2Timer.low ? '#fee2e2' : 'var(--primary-light)') : 'var(--bg2)',
            color: activeTask === 2 ? (t2Timer.low ? '#dc2626' : 'var(--primary)') : 'var(--text2)',
            border: `1px solid ${activeTask === 2 ? (t2Timer.low ? '#fca5a5' : 'var(--border)') : 'var(--border)'}`,
          }}>
            ⏱ T2: {t2Timer.display}
            {t2Timer.warning5 && activeTask === 2 && <span style={{ marginLeft: 6, fontSize: 11 }}>⚠️</span>}
          </div>
        </div>
      </div>

      {/* Pauza xabari */}
      {started && (
        <div style={{ marginBottom: 12, padding: '6px 12px', background: 'var(--yellow-bg)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
          ⏸ Task {activeTask === 1 ? 2 : 1} vaqti <strong>pauza</strong>da — faqat aktiv task vaqti ketadi.
        </div>
      )}

      {/* Task tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[1, 2].map(n => (
          <button key={n} onClick={() => setActiveTask(n)} className={`btn ${activeTask === n ? 'btn-primary' : 'btn-outline'}`}>
            Task {n}
            <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>
              {n === 1 ? `${w1}/${MIN1}` : `${w2}/${MIN2}`} words
            </span>
            {((n === 1 && w1 >= MIN1) || (n === 2 && w2 >= MIN2)) && <span style={{ marginLeft: 4 }}>✓</span>}
          </button>
        ))}
      </div>

      {/* Task 1 */}
      {activeTask === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: test.task1_image ? '1fr 1fr' : '1fr', gap: 16 }}>
          <div>
            {test.task1_image && (
              <div className="card" style={{ marginBottom: 12, padding: 12 }}>
                <img src={test.task1_image} alt="Task 1 chart" style={{ width: '100%', borderRadius: 7, maxHeight: 280, objectFit: 'contain' }} />
              </div>
            )}
            <div className="card" style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)22' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Task 1 — Question</div>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>{test.task1_question}</p>
              <div style={{ marginTop: 10, padding: '6px 10px', background: 'var(--card)', borderRadius: 6, fontSize: 12, color: 'var(--text2)' }}>
                Write at least <strong>150 words</strong> · Recommended time: <strong>20 min</strong>
              </div>
            </div>
          </div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>Your Response</label>
              <span style={{ fontSize: 12, fontWeight: 600, color: w1 >= MIN1 ? 'var(--green)' : 'var(--text2)' }}>
                {w1} words {w1 >= MIN1 ? '✓' : `(need ${MIN1 - w1} more)`}
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 4, marginBottom: 10, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min((w1 / MIN1) * 100, 100)}%`, height: '100%', background: w1 >= MIN1 ? 'var(--green)' : 'var(--primary)', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
            <textarea value={task1} onChange={e => setTask1(e.target.value)} rows={16} className="inp" style={{ resize: 'vertical', lineHeight: 1.75 }} placeholder="Write your Task 1 response here..." />
          </div>
        </div>
      )}

      {/* Task 2 */}
      {activeTask === 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)22' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Task 2 — Question</div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>{test.task2_question}</p>
            <div style={{ marginTop: 10, padding: '6px 10px', background: 'var(--card)', borderRadius: 6, fontSize: 12, color: 'var(--text2)' }}>
              Write at least <strong>250 words</strong> · Recommended time: <strong>40 min</strong>
            </div>
          </div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>Your Response</label>
              <span style={{ fontSize: 12, fontWeight: 600, color: w2 >= MIN2 ? 'var(--green)' : 'var(--text2)' }}>
                {w2} words {w2 >= MIN2 ? '✓' : `(need ${MIN2 - w2} more)`}
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 4, marginBottom: 10, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min((w2 / MIN2) * 100, 100)}%`, height: '100%', background: w2 >= MIN2 ? 'var(--green)' : 'var(--primary)', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
            <textarea value={task2} onChange={e => setTask2(e.target.value)} rows={18} className="inp" style={{ resize: 'vertical', lineHeight: 1.75 }} placeholder="Write your Task 2 response here..." />
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <button onClick={() => navigate('/writing')} className="btn btn-outline">← Back</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            T1: <span style={{ color: w1 >= MIN1 ? 'var(--green)' : 'var(--text2)', fontWeight: 600 }}>{w1}w</span>
            {' · '}
            T2: <span style={{ color: w2 >= MIN2 ? 'var(--green)' : 'var(--text2)', fontWeight: 600 }}>{w2}w</span>
          </div>
          <button onClick={handleSubmit} className="btn btn-primary" disabled={submitting} style={{ minWidth: 140, justifyContent: 'center' }}>
            {submitting ? 'Submitting...' : 'Submit Test ✓'}
          </button>
        </div>
      </div>

      {warning && (
        <ViolationWarning count={warning.count} max={3} onDismiss={async () => { dismissWarning(); await enterFullscreen(); }} />
      )}
    </div>
  );
}

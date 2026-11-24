import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import ScoreCard from '../../components/ScoreCard';
import { useAntiCheat } from '../../hooks/useAntiCheat';
import { FullscreenGate, ViolationWarning, BlockedScreen } from '../../components/AntiCheatOverlay';
import {
  EXAM_CSS, ZoomableImage, useHighlighter, isPreview, PreviewGate, PreviewBadge,
  postWithRetry, examKey, examStore, SendError,
} from '../../components/examKit';

/*
 * Real IELTS listening flow: Part 1-4 on one screen, the recording plays
 * once from start to finish (no pause / rewind), the view follows the part
 * being played, then the student gets 2 minutes to check answers before
 * the test is submitted automatically.
 */

const REVIEW_SECONDS = 120;
const LETTERS = 'ABCDEFGHIJKLMNOP';
const isAnswered = v => v !== undefined && v !== null && String(v).trim() !== '';
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function parseInstruction(raw = '') {
  const img = (raw.match(/\[img:([^\]]+)\]/) || [])[1];
  const box = (raw.match(/\[box:([^\]]*)\]/) || [])[1];
  const text = raw.replace(/\[img:[^\]]+\]\s*/, '').replace(/\[box:[^\]]*\]\s*/, '').trim();
  const lr = text.match(/letter[s]?,?\s*([A-Z])\s*[-–]\s*([A-Z])/i);
  const letters = lr
    ? LETTERS.slice(LETTERS.indexOf(lr[1].toUpperCase()), LETTERS.indexOf(lr[2].toUpperCase()) + 1).split('')
    : null;
  // "Complete the notes below. Write ONE WORD..." -> separate lines
  const lines = text.split('\n').flatMap(l => l.split(/(?<=\.)\s+(?=[A-Z])/)).map(l => l.trim()).filter(Boolean);
  return { img, box, lines, letters };
}

function Instr({ line }) {
  const parts = line.split(/(ONE WORD AND\/OR A NUMBER|ONE WORD ONLY|NO MORE THAN \w+ WORDS?(?: AND\/OR A NUMBER)?)/i);
  return (
    <p className="rx-instr">
      {parts.map((p, i) => (/ONE WORD|NO MORE THAN/i.test(p) ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}
    </p>
  );
}

function buildGroups(questions) {
  const groups = [];
  questions.forEach(q => {
    const last = groups[groups.length - 1];
    const key = `${q.group_title || ''}|${q.group_instruction || ''}`;
    if (last && last.key === key) last.items.push(q);
    else groups.push({ key, title: q.group_title, instruction: q.group_instruction, items: [q] });
  });
  return groups.map(g => {
    const info = parseInstruction(g.instruction);
    const mcqs = g.items.filter(q => q.question_type === 'mcq');
    const sameOpts = mcqs.length === g.items.length && mcqs.length > 1
      && mcqs.every(q => (q.options || []).join('|') === (mcqs[0].options || []).join('|'));
    const style = sameOpts ? 'list' : mcqs.length === g.items.length ? 'choice' : 'gap';
    const first = g.items[0].question_number, last = g.items[g.items.length - 1].question_number;
    return {
      ...g, ...info, style,
      range: g.title || (first === last ? `Question ${first}` : `Questions ${first}–${last}`),
      options: sameOpts ? (mcqs[0].options || []).map((o, i) => ({ code: LETTERS[i], text: o, value: o })) : null,
    };
  });
}

export default function ListeningTest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const preview = isPreview(user);
  const { onMouseUp, toolbarEl, t } = useHighlighter();

  const [parts, setParts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [started, setStarted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState(0);          // part shown on screen
  const [audioIdx, setAudioIdx] = useState(0);  // part being played
  const [audio, setAudio] = useState({ cur: 0, dur: 0, playing: false, failed: false });
  const [volume, setVolume] = useState(1);
  const [review, setReview] = useState(null);   // seconds left after the recording ends
  const [reviewEnds, setReviewEnds] = useState(null);   // when the 2-minute check ends (timestamp)
  const [sendState, setSendState] = useState('idle');
  const [loadError, setLoadError] = useState(false);
  const key = examKey('listening', id, user);
  const lastReason = useRef('manual');
  const resumeAt = useRef(null);       // audio position to continue from after a reload
  const reviewEndsRef = useRef(null);
  reviewEndsRef.current = reviewEnds;
  const [currentQ, setCurrentQ] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');

  const audioRef = useRef(null);
  const startedAt = useRef(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submittingRef = useRef(false);

  useEffect(() => {
    api.get(`/listening/${id}/group/`).then(r => {
      setParts(r.data);
      const q = r.data[0]?.questions?.[0];
      if (q) setCurrentQ(q.question_number);
    }).catch(e => { if (e?.response?.status === 404) setParts([]); else setLoadError(true); })
      .finally(() => setLoading(false));
  }, [id]);

  const allQ = useMemo(() => (parts || []).flatMap((p, pi) =>
    (p.questions || []).slice().sort((a, b) => a.question_number - b.question_number)
      .map(q => ({ ...q, pi, testId: p.id }))), [parts]);

  /* ---------- submit ---------- */
  const submit = useCallback(async (finishReason = 'manual') => {
    if (preview) return;
    if (submittingRef.current || !parts) return;
    submittingRef.current = true;
    lastReason.current = finishReason;
    setSubmitting(true);
    setSendState('sending');
    setError('');
    setConfirmOpen(false);
    audioRef.current?.pause();
    const byTest = {};
    parts.forEach(p => { byTest[p.id] = {}; });
    allQ.forEach(q => {
      const v = answersRef.current[q.question_number];
      if (isAnswered(v)) byTest[q.testId][q.question_number] = v;
    });
    try {
      const res = await postWithRetry('/listening/submit-all/', {
        parts: byTest,
        time_spent: startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : null,
        time_limit: 32 * 60,
        finish_reason: finishReason,
      });
      examStore.clear(key);
      setSendState('sent');
      setResult(res.data);
    } catch {
      submittingRef.current = false;
      setSendState('failed');
      setError('failed');
    } finally {
      setSubmitting(false);
    }
  }, [parts, allQ, key, preview]);

  const submitRef = useRef(submit);
  submitRef.current = submit;

  const { warning, blocked, dismissWarning, enterFullscreen, exitFullscreen } = useAntiCheat({
    active: started && !result && !preview, onBlocked: () => submitRef.current('blocked'),
    testType: 'listening', testId: id, persistKey: preview ? null : key,
  });

  useEffect(() => {
    if (result || blocked) { exitFullscreen(); audioRef.current?.pause(); }
  }, [result, blocked, exitFullscreen]);

  /* ---------- audio: plays once, part after part ---------- */
  const play = () => {
    const a = audioRef.current;
    if (!a) return;
    a.play().then(() => setAudio(s => ({ ...s, failed: false })))
      .catch(() => setAudio(s => ({ ...s, failed: true, playing: false })));
  };

  useEffect(() => {
    if (reviewEndsRef.current) return;   // recording already finished (resumed during the 2-minute check)
    if (started && parts && audioIdx < parts.length) {
      setView(audioIdx);
      const a = audioRef.current;
      if (a) { a.load(); play(); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioIdx, started]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);

  const onEnded = () => {
    if (audioIdx < parts.length - 1) setAudioIdx(i => i + 1);
    else setReviewEnds(Date.now() + REVIEW_SECONDS * 1000);
  };

  // 2-minute check, counted from a fixed end time
  useEffect(() => {
    if (!reviewEnds || result) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((reviewEnds - Date.now()) / 1000));
      setReview(left);
      if (left <= 0) submitRef.current('timeout');
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [reviewEnds, result]);

  // Keep answers and the audio position in this browser while the test runs
  const audioCur = useRef(0);
  audioCur.current = audio.cur;
  useEffect(() => {
    if (!started || result || preview) return;
    const save = () => examStore.save(key, {
      startedAt: startedAt.current, answers: answersRef.current, audioIdx,
      audioTime: audioCur.current, reviewEnds: reviewEndsRef.current,
    });
    save();
    const iv = setInterval(save, 2000);
    return () => clearInterval(iv);
  }, [started, result, preview, key, audioIdx, reviewEnds, answers]);

  /* ---------- navigation ---------- */
  const goTo = n => {
    const q = allQ.find(x => x.question_number === n);
    if (!q) return;
    setView(q.pi);
    setCurrentQ(n);
    setTimeout(() => document.getElementById(`lq-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
  };
  const step = d => {
    const i = allQ.findIndex(q => q.question_number === currentQ);
    if (allQ[i + d]) goTo(allQ[i + d].question_number);
  };
  const setAnswer = (n, v) => { setAnswers(a => ({ ...a, [n]: v })); setCurrentQ(n); };

  /* ---------- screens before / after ---------- */
  if (loading) return <div className="container"><p className="text-muted">Loading test...</p></div>;
  if (loadError) return (
    <div className="container"><p>The test could not be loaded. Check the internet connection.</p>
      <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>Try again</button></div>
  );
  if (!parts || parts.length === 0) return <div className="container"><p>Test not found.</p></div>;
  if (blocked) return <BlockedScreen status={sendState === 'idle' ? 'sending' : sendState}
    onRetry={() => submit(lastReason.current)} onBack={() => navigate('/listening')} />;
  if (result) return (
    <div className="container">
      <ScoreCard kind="listening" title={parts[0].title.replace(/[\s,–—-]*Part\s*\d+\s*$/i, '')}
        score={result.score} total={result.total} detail={result.detail} onBack={() => navigate('/listening')} />
    </div>
  );
  if (!started && preview) return <PreviewGate title={parts[0].title.replace(/[\s,–—-]*Part\s*\d+\s*$/i, '')} onStart={() => { startedAt.current = Date.now(); setStarted(true); }} />;
  if (!started) return (
    <FullscreenGate title="Listening test — the recording plays once" resume={!!examStore.load(key)} onStart={async () => {
      await enterFullscreen();
      const saved = examStore.load(key);
      startedAt.current = saved?.startedAt || Date.now();
      if (saved) {
        setAnswers(saved.answers || {});
        setAudioIdx(Math.min(saved.audioIdx || 0, parts.length - 1));
        resumeAt.current = saved.audioTime || 0;
        if (saved.reviewEnds) { reviewEndsRef.current = saved.reviewEnds; setReviewEnds(saved.reviewEnds); }
      }
      setStarted(true);
    }} />
  );

  /* ---------- exam screen ---------- */
  const part = parts[view];
  const pq = allQ.filter(q => q.pi === view);
  const groups = buildGroups(pq);
  const answeredTotal = allQ.filter(q => isAnswered(answers[q.question_number])).length;

  const gapInput = q => (
    <input
      className={`rx-gap ${currentQ === q.question_number ? 'rx-gap-cur' : ''}`}
      value={answers[q.question_number] || ''}
      placeholder={String(q.question_number)}
      onFocus={() => setCurrentQ(q.question_number)}
      onChange={e => setAnswer(q.question_number, e.target.value)}
      spellCheck={false} autoComplete="off"
    />
  );

  const letterSelect = (q, letters) => (
    <select className="lx-letter" value={answers[q.question_number] || ''}
      onFocus={() => setCurrentQ(q.question_number)}
      onChange={e => setAnswer(q.question_number, e.target.value)}
      style={{ minWidth: 72, height: 30, border: '1px solid #9ca3af', borderRadius: 4, background: '#fff', fontSize: 14, margin: '0 6px' }}>
      <option value="">—</option>
      {letters.map(l => <option key={l} value={l}>{l}</option>)}
    </select>
  );

  const renderGapGroup = g => (
    <div className="rx-notes">
      {g.items.map(q => {
        const lines = (q.question_text || '').split('\n');
        const heads = lines.slice(0, -1).filter(Boolean);
        const [a, b] = lines[lines.length - 1].split('___');
        const field = g.letters ? letterSelect(q, g.letters) : gapInput(q);
        return (
          <div key={q.id} id={`lq-${q.question_number}`}>
          {heads.map((h, i) => <p key={i} className="rx-subhead">{h}</p>)}
          <div className="rx-gapline">
            <span className="rx-bullet">•</span>{' '}
            {g.letters && <span className="rx-num" style={{ marginRight: 6 }}>{q.question_number}</span>}
            {t(`l${q.question_number}a`, a || '')}
            {field}
            {b !== undefined && t(`l${q.question_number}b`, b)}
          </div>
          </div>
        );
      })}
    </div>
  );

  const renderChoice = q => (
    <div key={q.id} id={`lq-${q.question_number}`} className={`rx-q ${currentQ === q.question_number ? 'rx-q-cur' : ''}`}>
      <p className="rx-stem"><span className="rx-num">{q.question_number}</span>{t(`l${q.question_number}`, q.question_text || '')}</p>
      <div className="rx-opts">
        {(q.options || []).map((o, i) => (
          <label key={o} className={`rx-opt ${answers[q.question_number] === o ? 'rx-opt-on' : ''}`}>
            <input type="radio" name={`l${q.question_number}`} checked={answers[q.question_number] === o}
              onChange={() => setAnswer(q.question_number, o)} />
            <b className="rx-letter">{LETTERS[i]}</b><span>{o}</span>
          </label>
        ))}
      </div>
    </div>
  );

  const renderList = g => (
    <>
      <div className="rx-box">
        <b>{g.box || 'Options'}</b>
        {g.options.map(o => <div key={o.value} className="rx-boxrow"><b>{o.code}</b><span>{o.text}</span></div>)}
      </div>
      {g.items.map(q => (
        <div key={q.id} id={`lq-${q.question_number}`} className={`rx-sel ${currentQ === q.question_number ? 'rx-q-cur' : ''}`}>
          <span className="rx-num">{q.question_number}</span>
          <span className="rx-sel-label">{t(`l${q.question_number}`, (q.question_text || '').split('\n').pop().replace('___', '……'))}</span>
          <select value={answers[q.question_number] || ''}
            onFocus={() => setCurrentQ(q.question_number)}
            onChange={e => setAnswer(q.question_number, e.target.value)}>
            <option value="">—</option>
            {g.options.map(o => <option key={o.value} value={o.value}>{o.code}</option>)}
          </select>
        </div>
      ))}
    </>
  );

  const pct = audio.dur ? Math.min(100, (audio.cur / audio.dur) * 100) : 0;

  return (
    <div className="rx-root" onMouseUp={onMouseUp}>
      {preview && <PreviewBadge />}
      <style>{EXAM_CSS}</style>
      <audio ref={audioRef} src={parts[Math.min(audioIdx, parts.length - 1)].audio_url} preload="auto"
        onTimeUpdate={e => setAudio(s => ({ ...s, cur: e.target.currentTime }))}
        onLoadedMetadata={e => {
          setAudio(s => ({ ...s, dur: e.target.duration || 0 }));
          if (resumeAt.current) { e.target.currentTime = resumeAt.current; resumeAt.current = null; }
        }}
        onPlay={() => setAudio(s => ({ ...s, playing: true }))}
        onPause={() => setAudio(s => ({ ...s, playing: false }))}
        onError={() => setAudio(s => ({ ...s, failed: true, playing: false }))}
        onEnded={onEnded} />

      <header className="rx-header">
        <div className="rx-brand">IELTS</div>
        <div className="rx-taker">Test taker: <b>{user?.first_name || user?.username}</b></div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          {review !== null ? (
            <div className="lx-audio"><span className="lx-audio-state">Recording finished · check your answers</span></div>
          ) : (
            <div className="lx-audio">
              <span className="lx-audio-state">
                {audio.failed ? 'Audio stopped' : audio.playing ? `Part ${parts[audioIdx].part} is playing` : 'Loading audio…'}
              </span>
              {audio.failed && <button className="lx-play" onClick={play}>▶ Play</button>}
              <div className="lx-audio-bar"><i style={{ width: `${pct}%` }} /></div>
              <span className="lx-audio-time">{fmt(audio.cur)} / {fmt(audio.dur)}</span>
              <span title="Volume" style={{ fontSize: 14 }}>🔊</span>
              <input type="range" min="0" max="1" step="0.05" value={volume}
                onChange={e => setVolume(Number(e.target.value))} aria-label="Volume" />
            </div>
          )}
        </div>
        {review !== null && (
          <div className={`rx-timer ${review < 30 ? 'rx-timer-low' : ''}`}>{fmt(review)}</div>
        )}
      </header>
      {review !== null && <div className="lx-review">The recording has ended. You have {fmt(review)} to check your answers — the test will then be submitted.</div>}

      <main className="rx-main">
        <section className="rx-right">
          <div className="lx-single">
            <div className="rx-partbox">
              <b>Part {part.part}</b>
              <p>Listen and answer questions {pq[0]?.question_number}–{pq[pq.length - 1]?.question_number}.</p>
            </div>
            {groups.map((g, gi) => (
              <div key={gi} className="rx-group">
                <h3>{g.range}</h3>
                {g.lines.map(l => <Instr key={l} line={l} />)}
                {g.img && <ZoomableImage src={g.img} alt={`Map for ${g.range}`} height={360} />}
                {g.style === 'gap' && renderGapGroup(g)}
                {g.style === 'choice' && g.items.map(renderChoice)}
                {g.style === 'list' && renderList(g)}
              </div>
            ))}
            <div style={{ height: 80 }} />
          </div>
        </section>
      </main>

      <div className="rx-arrows">
        <button onClick={() => step(-1)} disabled={allQ[0]?.question_number === currentQ} aria-label="Previous question">‹</button>
        <button className="rx-arrow-next" onClick={() => step(1)} disabled={allQ[allQ.length - 1]?.question_number === currentQ} aria-label="Next question">›</button>
      </div>

      <footer className="rx-footer">
        <div className="rx-parts">
          {parts.map((p, i) => {
            const qs = allQ.filter(q => q.pi === i);
            const done = qs.filter(q => isAnswered(answers[q.question_number])).length;
            if (i !== view) {
              return (
                <button key={p.id} className="rx-part-off" onClick={() => goTo(qs[0]?.question_number)}>
                  Part {p.part} <span>{done} of {qs.length}</span>
                </button>
              );
            }
            return (
              <div key={p.id} className="rx-part-on">
                <b>Part {p.part}</b>
                {qs.map(q => {
                  const n = q.question_number;
                  const cls = n === currentQ ? 'rx-n rx-n-cur' : isAnswered(answers[n]) ? 'rx-n rx-n-done' : 'rx-n';
                  return <button key={n} className={cls} onClick={() => goTo(n)}>{n}</button>;
                })}
              </div>
            );
          })}
        </div>
        <button className="rx-submit" onClick={() => (preview ? window.close() || navigate('/studio') : setConfirmOpen(true))} disabled={submitting}>
          {preview ? 'Exit preview' : submitting ? 'Submitting…' : 'Submit'}
        </button>
      </footer>

      {toolbarEl}

      {confirmOpen && (
        <div className="rx-modal-bg">
          <div className="rx-modal">
            <h3>Submit your answers?</h3>
            <p>You have answered <b>{answeredTotal} of {allQ.length}</b> questions.
              {review === null && ' The recording is still playing — after submitting you cannot return.'}</p>
            <div className="rx-modal-btns">
              <button onClick={() => setConfirmOpen(false)}>Go back</button>
              <button className="rx-danger" onClick={() => submit('manual')}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {error && <SendError onRetry={() => submit(lastReason.current)} />}

      {warning && (
        <ViolationWarning count={warning.count} deadline={warning.deadline}
          onDismiss={async () => { dismissWarning(); await enterFullscreen(); }} />
      )}
    </div>
  );
}

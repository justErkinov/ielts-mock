import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import ScoreCard from '../../components/ScoreCard';
import Timer from '../../components/Timer';
import { useAntiCheat } from '../../hooks/useAntiCheat';
import { FullscreenGate, ViolationWarning, BlockedScreen } from '../../components/AntiCheatOverlay';

// Renders passage text with highlighted ranges as <mark>.
// ranges: array of {start, end} character offsets into the raw text.
// Clicking a <mark> removes that highlight.
function HighlightableText({ text, ranges, onAddRange, onRemoveRange }) {
  const containerRef = useRef(null);

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) return;
    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;

    // Compute offsets relative to the full text by walking text nodes
    const preRange = document.createRange();
    preRange.selectNodeContents(containerRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const selectedText = sel.toString();
    const end = start + selectedText.length;

    if (selectedText.trim().length > 0) {
      onAddRange(start, end);
    }
    sel.removeAllRanges();
  };

  // Build segments: plain text and highlighted marks, non-overlapping & sorted
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = 0;
  sorted.forEach((r, idx) => {
    if (r.start > cursor) segments.push({ text: text.slice(cursor, r.start), hl: false });
    segments.push({ text: text.slice(r.start, r.end), hl: true, idx });
    cursor = Math.max(cursor, r.end);
  });
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hl: false });

  return (
    <p
      ref={containerRef}
      onMouseUp={handleMouseUp}
      style={{ fontSize: 14, lineHeight: 1.85, color: 'var(--text)', whiteSpace: 'pre-wrap', userSelect: 'text', cursor: 'text' }}
    >
      {segments.map((seg, i) =>
        seg.hl
          ? <mark key={i} className="user-hl" title="Click to remove highlight" onClick={() => onRemoveRange(seg.idx)}>{seg.text}</mark>
          : <span key={i}>{seg.text}</span>
      )}
    </p>
  );
}

export default function ReadingTest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activePassage, setActivePassage] = useState(0);
  const [highlightsByPassage, setHighlightsByPassage] = useState({}); // { passageIdx: [{start,end}] }
  const [started, setStarted] = useState(false);

  useEffect(() => {
    api.get(`/reading/${id}/`).then(r => setTest(r.data)).finally(() => setLoading(false));
  }, [id]);

  const handleAnswer = (num, val) => setAnswers(p => ({ ...p, [num]: val }));

  const addRange = (start, end) => {
    setHighlightsByPassage(p => {
      const current = p[activePassage] || [];
      return { ...p, [activePassage]: [...current, { start, end }] };
    });
  };
  const removeRange = (idx) => {
    setHighlightsByPassage(p => {
      const current = p[activePassage] || [];
      return { ...p, [activePassage]: current.filter((_, i) => i !== idx) };
    });
  };
  const clearAll = () => setHighlightsByPassage(p => ({ ...p, [activePassage]: [] }));

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/reading/${id}/submit/`, { answers });
      setResult(res.data); window.scrollTo(0, 0);
    } catch { alert('Submission failed. Please try again.'); }
    finally { setSubmitting(false); }
  };

  const { violations, warning, blocked, dismissWarning, enterFullscreen, exitFullscreen } =
    useAntiCheat({ active: started && !result, onBlocked: handleSubmit, testType: 'reading', testId: id });

  const handleStart = async () => {
    await enterFullscreen();
    setStarted(true);
  };

  useEffect(() => {
    if (result || blocked) exitFullscreen();
  }, [result, blocked]);

  if (loading) return <div className="container"><p className="text-muted">Loading test...</p></div>;
  if (!test) return <div className="container"><p>Test not found.</p></div>;
  if (blocked) return <BlockedScreen onBack={() => navigate('/reading')} />;
  if (!started) return <FullscreenGate onStart={handleStart} />;
  if (result) return <div className="container"><ScoreCard title={test.title} score={result.score} total={result.total} detail={result.detail} onBack={() => navigate('/reading')} /></div>;

  const passage = test.passages?.[activePassage];
  const allQ = test.passages?.flatMap(p => p.questions || []) || [];
  const answered = Object.keys(answers).length;
  const currentHLs = highlightsByPassage[activePassage] || [];

  return (
    <div className="container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>Reading Test</div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{test.title}</h2>
          <div className="text-muted" style={{ marginTop: 2 }}>{answered}/{allQ.length} answered</div>
        </div>
        <Timer minutes={60} onExpire={handleSubmit} />
      </div>

      {/* Progress */}
      <div style={{ height: 4, background: 'var(--bg2)', borderRadius: 4, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ width: `${(answered / allQ.length) * 100}%`, height: '100%', background: 'var(--green)', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>

      {/* Passage tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {test.passages?.map((p, i) => (
          <button key={p.id} onClick={() => setActivePassage(i)} className={`btn btn-sm ${activePassage === i ? 'btn-primary' : 'btn-outline'}`}>
            Passage {p.passage_number}
          </button>
        ))}
      </div>

      {/* Main layout */}
      {passage && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          {/* Passage text */}
          <div className="card" style={{ maxHeight: '72vh', overflowY: 'auto', position: 'sticky', top: 72 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ fontWeight: 700, fontSize: 15 }}>{passage.title}</h3>
              {currentHLs.length > 0 && (
                <button onClick={clearAll} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
                  ✕ Clear highlights ({currentHLs.length})
                </button>
              )}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 10 }}>
              Select text to highlight it. Click a highlight to remove it.
            </p>
            <HighlightableText
              text={passage.text}
              ranges={currentHLs}
              onAddRange={addRange}
              onRemoveRange={removeRange}
            />
          </div>

          {/* Questions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '72vh', overflowY: 'auto' }}>
            {passage.questions?.map(q => (
              <div key={q.id} className="card" style={{ borderLeft: `3px solid ${answers[q.question_number] ? 'var(--green)' : 'var(--border)'}`, transition: 'border-color 0.2s', padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: answers[q.question_number] ? 'var(--green)' : 'var(--bg2)', color: answers[q.question_number] ? '#fff' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {q.question_number}
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.5 }}>{q.question_text}</p>
                </div>

                {q.question_type === 'tfng' && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['TRUE', 'FALSE', 'NOT GIVEN'].map(opt => (
                      <button key={opt} onClick={() => handleAnswer(q.question_number, opt)} className="btn btn-sm" style={{ fontSize: 12, background: answers[q.question_number] === opt ? 'var(--primary)' : 'var(--bg)', color: answers[q.question_number] === opt ? '#fff' : 'var(--text2)', border: `1px solid ${answers[q.question_number] === opt ? 'var(--primary)' : 'var(--border)'}` }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {q.question_type === 'mcq' && q.options && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {q.options.map((opt, i) => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 10px', borderRadius: 6, background: answers[q.question_number] === opt ? 'var(--primary-light)' : 'transparent', border: `1px solid ${answers[q.question_number] === opt ? 'var(--primary)' : 'transparent'}` }}>
                        <input type="radio" name={`q_${q.question_number}`} value={opt} checked={answers[q.question_number] === opt} onChange={() => handleAnswer(q.question_number, opt)} style={{ display: 'none' }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', minWidth: 16 }}>{String.fromCharCode(65+i)}.</span>
                        <span style={{ fontSize: 13 }}>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {(q.question_type === 'gap_fill' || q.question_type === 'matching') && (
                  <input className="inp" style={{ fontSize: 13 }} placeholder="Your answer..." value={answers[q.question_number] || ''} onChange={e => handleAnswer(q.question_number, e.target.value)} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <button onClick={() => navigate('/reading')} className="btn btn-outline">← Back</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="text-muted">{answered} of {allQ.length} answered</span>
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

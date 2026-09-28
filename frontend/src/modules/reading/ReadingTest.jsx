import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import ScoreCard from '../../components/ScoreCard';
import Timer from '../../components/Timer';
import { useAntiCheat } from '../../hooks/useAntiCheat';
import { FullscreenGate, ViolationWarning, BlockedScreen } from '../../components/AntiCheatOverlay';

// 2 rangli highlight: sariq va qizil
function HighlightableText({ text, ranges, onAddRange, onRemoveRange, selectedColor }) {
  const containerRef = useRef(null);

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) return;
    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;
    const preRange = document.createRange();
    preRange.selectNodeContents(containerRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const selectedText = sel.toString();
    const end = start + selectedText.length;
    if (selectedText.trim().length > 0) {
      onAddRange(start, end, selectedColor);
    }
    sel.removeAllRanges();
  };

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = 0;
  sorted.forEach((r, idx) => {
    if (r.start > cursor) segments.push({ text: text.slice(cursor, r.start), hl: false });
    segments.push({ text: text.slice(r.start, r.end), hl: true, idx, color: r.color });
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
          ? <mark key={i}
              onClick={() => onRemoveRange(seg.idx)}
              title="Click to remove"
              style={{
                background: seg.color === 'red' ? '#fca5a5' : '#fef08a',
                borderRadius: 2, padding: '0 1px', cursor: 'pointer',
                color: '#1a1a1a'
              }}
            >{seg.text}</mark>
          : <span key={i}>{seg.text}</span>
      )}
    </p>
  );
}

// Savol navigatsiyasi pastda
function QuestionNav({ questions, answers, flagged, currentQ, onGoTo }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 150,
      background: 'var(--card)', borderTop: '1px solid var(--border)',
      padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap'
    }}>
      <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>Q:</span>
      {questions.map(q => {
        const num = q.question_number;
        const isAnswered = !!answers[num];
        const isFlagged = flagged.has(num);
        const isCurrent = currentQ === num;
        return (
          <button key={num} onClick={() => onGoTo(num)} style={{
            width: 28, height: 28, borderRadius: 5, border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 700,
            background: isCurrent ? 'var(--primary)' : isFlagged ? '#f4a300' : isAnswered ? '#22c55e' : 'var(--bg2)',
            color: (isCurrent || isFlagged || isAnswered) ? '#fff' : 'var(--text2)',
            outline: isCurrent ? '2px solid var(--primary)' : 'none', outlineOffset: 2,
          }}>{num}</button>
        );
      })}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, fontSize: 10 }}>
        <span style={{ background: '#22c55e', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>✓ Done</span>
        <span style={{ background: '#f4a300', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>🚩 Flag</span>
      </div>
    </div>
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
  const [highlightsByPassage, setHighlightsByPassage] = useState({});
  const [started, setStarted] = useState(false);
  const [hlColor, setHlColor] = useState('yellow'); // 'yellow' | 'red'
  const [flagged, setFlagged] = useState(new Set());
  const [currentQ, setCurrentQ] = useState(null);

  useEffect(() => {
    api.get(`/reading/${id}/`).then(r => {
      setTest(r.data);
      const firstQ = r.data.passages?.[0]?.questions?.[0]?.question_number;
      if (firstQ) setCurrentQ(firstQ);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleAnswer = (num, val) => { setAnswers(p => ({ ...p, [num]: val })); setCurrentQ(num); };

  const addRange = (start, end, color) => {
    setHighlightsByPassage(p => {
      const current = p[activePassage] || [];
      return { ...p, [activePassage]: [...current, { start, end, color }] };
    });
  };
  const removeRange = (idx) => {
    setHighlightsByPassage(p => {
      const current = p[activePassage] || [];
      return { ...p, [activePassage]: current.filter((_, i) => i !== idx) };
    });
  };
  const clearAll = () => setHighlightsByPassage(p => ({ ...p, [activePassage]: [] }));

  const toggleFlag = (num) => {
    setFlagged(prev => { const next = new Set(prev); next.has(num) ? next.delete(num) : next.add(num); return next; });
  };

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

  const handleStart = async () => { await enterFullscreen(); setStarted(true); };
  useEffect(() => { if (result || blocked) exitFullscreen(); }, [result, blocked]);

  const goToQuestion = (num) => {
    setCurrentQ(num);
    const el = document.getElementById(`rq-${num}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Passage ni ham to'g'ri qilish
    test?.passages?.forEach((p, i) => {
      if (p.questions?.find(q => q.question_number === num)) setActivePassage(i);
    });
  };

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
    <div className="container" style={{ paddingBottom: 80 }}>
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
          <div className="card" style={{ maxHeight: '68vh', overflowY: 'auto', position: 'sticky', top: 72 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ fontWeight: 700, fontSize: 15 }}>{passage.title}</h3>
              {/* Highlight rang tanlash */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  onClick={() => setHlColor('yellow')}
                  title="Yellow highlight"
                  style={{
                    width: 22, height: 22, borderRadius: 4, border: `2px solid ${hlColor === 'yellow' ? '#ca8a04' : 'transparent'}`,
                    background: '#fef08a', cursor: 'pointer'
                  }}
                />
                <button
                  onClick={() => setHlColor('red')}
                  title="Red highlight"
                  style={{
                    width: 22, height: 22, borderRadius: 4, border: `2px solid ${hlColor === 'red' ? '#dc2626' : 'transparent'}`,
                    background: '#fca5a5', cursor: 'pointer'
                  }}
                />
                {currentHLs.length > 0 && (
                  <button onClick={clearAll} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
                    ✕ Clear ({currentHLs.length})
                  </button>
                )}
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
              Select text → highlight. Click highlight to remove.
              <span style={{ marginLeft: 8, background: '#fef08a', padding: '1px 6px', borderRadius: 3, color: '#1a1a1a', fontSize: 10 }}>🟡 kerak bo'lishi mumkin</span>
              <span style={{ marginLeft: 4, background: '#fca5a5', padding: '1px 6px', borderRadius: 3, color: '#1a1a1a', fontSize: 10 }}>🔴 muhim</span>
            </p>
            <HighlightableText
              text={passage.text}
              ranges={currentHLs}
              onAddRange={addRange}
              onRemoveRange={removeRange}
              selectedColor={hlColor}
            />
          </div>

          {/* Questions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '68vh', overflowY: 'auto' }}>
            {passage.questions?.map(q => (
              <div
                key={q.id}
                id={`rq-${q.question_number}`}
                className="card"
                style={{
                  borderLeft: `3px solid ${answers[q.question_number] ? 'var(--green)' : currentQ === q.question_number ? 'var(--primary)' : 'var(--border)'}`,
                  transition: 'border-color 0.2s', padding: '12px 14px', scrollMarginTop: 80,
                }}
                onClick={() => setCurrentQ(q.question_number)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: 1 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: answers[q.question_number] ? 'var(--green)' : 'var(--bg2)',
                      color: answers[q.question_number] ? '#fff' : 'var(--text2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0
                    }}>{q.question_number}</div>
                    <p style={{ fontSize: 13, lineHeight: 1.5 }}>{q.question_text}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); toggleFlag(q.question_number); }}
                    style={{
                      background: flagged.has(q.question_number) ? '#f4a300' : 'var(--bg2)',
                      color: flagged.has(q.question_number) ? '#fff' : 'var(--text2)',
                      border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer', flexShrink: 0
                    }}
                  >🚩</button>
                </div>

                {q.question_type === 'tfng' && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['TRUE', 'FALSE', 'NOT GIVEN'].map(opt => (
                      <button key={opt} onClick={() => handleAnswer(q.question_number, opt)} className="btn btn-sm" style={{
                        fontSize: 12,
                        background: answers[q.question_number] === opt ? 'var(--primary)' : 'var(--bg)',
                        color: answers[q.question_number] === opt ? '#fff' : 'var(--text2)',
                        border: `1px solid ${answers[q.question_number] === opt ? 'var(--primary)' : 'var(--border)'}`
                      }}>{opt}</button>
                    ))}
                  </div>
                )}

                {q.question_type === 'mcq' && q.options && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {q.options.map((opt, i) => (
                      <label key={opt} style={{
                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 10px', borderRadius: 6,
                        background: answers[q.question_number] === opt ? 'var(--primary-light)' : 'transparent',
                        border: `1px solid ${answers[q.question_number] === opt ? 'var(--primary)' : 'transparent'}`
                      }}>
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
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
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

      <QuestionNav questions={allQ} answers={answers} flagged={flagged} currentQ={currentQ} onGoTo={goToQuestion} />
    </div>
  );
}

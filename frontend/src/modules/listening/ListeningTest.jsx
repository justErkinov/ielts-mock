import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import ScoreCard from '../../components/ScoreCard';
import Timer from '../../components/Timer';
import { useAntiCheat } from '../../hooks/useAntiCheat';
import { FullscreenGate, ViolationWarning, BlockedScreen } from '../../components/AntiCheatOverlay';

function GapLine({ text, value, onChange, qNumber, answered }) {
  const parts = text.split('___');
  if (parts.length === 1) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14, marginBottom: 6 }}>{text}</div>
        <input className="inp" style={{ maxWidth: 280 }} value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Your answer" />
      </div>
    );
  }
  return (
    <div style={{ fontSize: 14, lineHeight: 2.1, marginBottom: 8 }}>
      {parts[0]}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: '0 4px' }}>
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          background: answered ? 'var(--green)' : 'var(--bg2)',
          color: answered ? '#fff' : 'var(--text2)',
          fontSize: 10, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{qNumber}</span>
        <input
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={{
            width: Math.max(90, (value?.length || 8) * 9),
            padding: '3px 8px', borderRadius: 5,
            border: `1.5px solid ${answered ? 'var(--green)' : 'var(--border)'}`,
            fontSize: 13, fontWeight: 500, background: 'var(--card)', color: 'var(--text)',
            outline: 'none',
          }}
        />
      </span>
      {parts[1]}
    </div>
  );
}

// Savol navigatsiyasi pastda
function QuestionNav({ questions, answers, flagged, currentQ, onGoTo, onFlag }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 150,
      background: 'var(--card)', borderTop: '1px solid var(--border)',
      padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'
    }}>
      <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>Q:</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
        {questions.map(q => {
          const num = q.question_number;
          const isAnswered = !!answers[num];
          const isFlagged = flagged.has(num);
          const isCurrent = currentQ === num;
          return (
            <button
              key={num}
              onClick={() => onGoTo(num)}
              style={{
                width: 28, height: 28, borderRadius: 5, border: 'none',
                cursor: 'pointer', fontSize: 11, fontWeight: 700,
                background: isCurrent ? 'var(--primary)' :
                            isFlagged ? '#f4a300' :
                            isAnswered ? '#22c55e' : 'var(--bg2)',
                color: (isCurrent || isFlagged || isAnswered) ? '#fff' : 'var(--text2)',
                outline: isCurrent ? '2px solid var(--primary)' : 'none',
                outlineOffset: 2,
              }}
            >
              {num}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, fontSize: 10, color: 'var(--text2)' }}>
          <span style={{ background: '#22c55e', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>✓ Done</span>
          <span style={{ background: '#f4a300', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>🚩 Flag</span>
          <span style={{ background: 'var(--primary)', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>▶ Now</span>
        </div>
      </div>
    </div>
  );
}

export default function ListeningTest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [flagged, setFlagged] = useState(new Set());
  const [currentQ, setCurrentQ] = useState(null);
  const questionRefs = {};

  useEffect(() => {
    api.get(`/listening/${id}/`).then(r => {
      setTest(r.data);
      if (r.data.questions?.length > 0) setCurrentQ(r.data.questions[0].question_number);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleAnswer = (num, val) => {
    setAnswers(p => ({ ...p, [num]: val }));
    setCurrentQ(num);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/listening/${id}/submit/`, { answers });
      setResult(res.data); window.scrollTo(0, 0);
    } catch { alert('Submission failed. Please try again.'); }
    finally { setSubmitting(false); }
  };

  const { violations, warning, blocked, dismissWarning, enterFullscreen, exitFullscreen } =
    useAntiCheat({ active: started && !result, onBlocked: handleSubmit, testType: 'listening', testId: id });

  const handleStart = async () => { await enterFullscreen(); setStarted(true); };

  useEffect(() => { if (result || blocked) exitFullscreen(); }, [result, blocked]);

  const goToQuestion = (num) => {
    setCurrentQ(num);
    const el = document.getElementById(`q-${num}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const toggleFlag = (num) => {
    setFlagged(prev => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  };

  if (loading) return <div className="container"><p className="text-muted">Loading test...</p></div>;
  if (!test) return <div className="container"><p>Test not found.</p></div>;
  if (blocked) return <BlockedScreen onBack={() => navigate('/listening')} />;
  if (!started) return <FullscreenGate onStart={handleStart} />;
  if (result) return <div className="container"><ScoreCard title={test.title} score={result.score} total={result.total} detail={result.detail} onBack={() => navigate('/listening')} /></div>;

  const answered = Object.keys(answers).length;
  const total = test.questions?.length || 0;
  const allQuestions = test.questions || [];

  const groups = [];
  allQuestions.forEach(q => {
    const last = groups[groups.length - 1];
    if (last && last.title === (q.group_title || '') && last.instruction === (q.group_instruction || '')) {
      last.items.push(q);
    } else {
      groups.push({ title: q.group_title || '', instruction: q.group_instruction || '', items: [q] });
    }
  });

  return (
    <div className="container" style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>Listening Test</div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{test.title}</h2>
          <div className="text-muted" style={{ marginTop: 2 }}>{answered}/{total} answered</div>
        </div>
        <Timer minutes={30} onExpire={handleSubmit} />
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--bg2)', borderRadius: 4, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ width: `${(answered / total) * 100}%`, height: '100%', background: 'var(--primary)', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>

      {/* Audio */}
      {test.audio_url && (
        <div className="card" style={{ marginBottom: 24, background: 'var(--primary-light)', border: '1px solid var(--primary)22' }}>
          <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🎧</span> Audio Recording
          </div>
          <audio controls style={{ width: '100%', borderRadius: 6 }} src={test.audio_url}>
            Your browser does not support audio.
          </audio>
        </div>
      )}

      {/* Question groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.title && <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{g.title}</h3>}
            {g.instruction && (
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
                {g.instruction.split(/(ONE WORD AND\/OR A NUMBER|ONE WORD ONLY|NO MORE THAN \w+ WORDS?)/i).map((part, i) =>
                  /ONE WORD|NO MORE THAN/i.test(part)
                    ? <strong key={i} style={{ color: 'var(--text)' }}>{part}</strong>
                    : <span key={i}>{part}</span>
                )}
              </p>
            )}
            <div className="card">
              {g.items.map(q => (
                <div key={q.id} id={`q-${q.question_number}`}
                  style={{
                    marginBottom: 14, borderLeft: currentQ === q.question_number ? '3px solid var(--primary)' : '3px solid transparent',
                    paddingLeft: 8, scrollMarginTop: 80,
                  }}
                  onClick={() => setCurrentQ(q.question_number)}
                >
                  {/* Flag tugmasi */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                    <button
                      onClick={e => { e.stopPropagation(); toggleFlag(q.question_number); }}
                      style={{
                        background: flagged.has(q.question_number) ? '#f4a300' : 'var(--bg2)',
                        color: flagged.has(q.question_number) ? '#fff' : 'var(--text2)',
                        border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: 11, cursor: 'pointer'
                      }}
                    >
                      🚩 {flagged.has(q.question_number) ? 'Flagged' : 'Flag'}
                    </button>
                  </div>

                  {q.question_type === 'mcq' && q.options ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: answers[q.question_number] ? 'var(--green)' : 'var(--bg2)',
                          color: answers[q.question_number] ? '#fff' : 'var(--text2)',
                          fontSize: 11, fontWeight: 700, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{q.question_number}</span>
                        <span style={{ fontSize: 14 }}>{q.question_text}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 28 }}>
                        {q.options.map((opt, i) => (
                          <label key={opt} style={{
                            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                            padding: '6px 10px', borderRadius: 6,
                            background: answers[q.question_number] === opt ? 'var(--primary-light)' : 'transparent',
                            border: `1px solid ${answers[q.question_number] === opt ? 'var(--primary)' : 'transparent'}`
                          }}>
                            <input type="radio" name={`q_${q.question_number}`} value={opt} checked={answers[q.question_number] === opt} onChange={() => handleAnswer(q.question_number, opt)} style={{ display: 'none' }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', minWidth: 16 }}>{String.fromCharCode(65 + i)}.</span>
                            <span style={{ fontSize: 13 }}>{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <GapLine text={q.question_text} value={answers[q.question_number]} onChange={v => handleAnswer(q.question_number, v)} qNumber={q.question_number} answered={!!answers[q.question_number]} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Submit */}
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/listening')} className="btn btn-outline">← Back</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="text-muted">{answered} of {total} answered</span>
          <button onClick={handleSubmit} className="btn btn-primary" disabled={submitting} style={{ minWidth: 140, justifyContent: 'center' }}>
            {submitting ? 'Submitting...' : 'Submit Test ✓'}
          </button>
        </div>
      </div>

      {warning && (
        <ViolationWarning count={warning.count} max={3} onDismiss={async () => { dismissWarning(); await enterFullscreen(); }} />
      )}

      {/* Savol navigatsiyasi */}
      <QuestionNav
        questions={allQuestions}
        answers={answers}
        flagged={flagged}
        currentQ={currentQ}
        onGoTo={goToQuestion}
        onFlag={toggleFlag}
      />
    </div>
  );
}

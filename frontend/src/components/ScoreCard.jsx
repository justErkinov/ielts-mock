// Official IELTS raw score (out of 40) -> band
const TABLES = {
  listening: [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]],
  reading: [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]],
};

export default function ScoreCard({ title, score, total, detail, onBack, kind }) {
  const pct = Math.round((score / total) * 100);
  const row = total === 40 && TABLES[kind] ? TABLES[kind].find(([min]) => score >= min) : null;
  const band = TABLES[kind] && total === 40
    ? (row ? row[1] : score >= 2 ? 2 : score >= 1 ? 1 : 0)
    : pct >= 90 ? 9.0 : pct >= 80 ? 8.0 : pct >= 70 ? 7.0 :
      pct >= 60 ? 6.0 : pct >= 50 ? 5.0 : pct >= 40 ? 4.0 : 3.0;

  const correct = Object.values(detail).filter(d => d.is_correct).length;
  const wrong = total - correct;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Score summary */}
      <div className="card" style={{ textAlign: 'center', padding: '36px 24px', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase' }}>
          {title} — Results
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, color: 'var(--primary)', lineHeight: 1 }}>
          {score}<span style={{ fontSize: 28, color: 'var(--text2)', fontWeight: 400 }}>/{total}</span>
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--primary)' }}>Band {band.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Estimated IELTS Band</div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--green)' }}>{pct}%</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Accuracy</div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--green)' }}>{correct}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Correct</div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--accent)' }}>{wrong}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Incorrect</div>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ margin: '20px auto 0', maxWidth: 320, height: 8, background: 'var(--bg2)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct >= 70 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--accent)', borderRadius: 8, transition: 'width 0.8s ease' }} />
        </div>
      </div>

      {/* Detail */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Answer Review</span>
          <span className="text-muted">{total} questions</span>
        </div>
        <div>
          {Object.entries(detail).map(([num, d]) => (
            <div key={num} style={{
              display: 'grid', gridTemplateColumns: '44px 1fr auto',
              alignItems: 'center', padding: '11px 20px', gap: 12,
              borderBottom: '1px solid var(--border)',
              borderLeft: `3px solid ${d.is_correct ? 'var(--green)' : 'var(--accent)'}`,
            }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: d.is_correct ? 'var(--green-bg)' : 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: d.is_correct ? 'var(--green)' : 'var(--accent)' }}>
                {num}
              </div>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--text2)' }}>Your answer: </span>
                <strong style={{ color: d.is_correct ? 'var(--green)' : 'var(--accent)' }}>{d.your_answer || '—'}</strong>
                {!d.is_correct && (
                  <span style={{ marginLeft: 12, color: 'var(--text2)' }}>
                    Correct: <strong style={{ color: 'var(--green)' }}>{d.correct_answer}</strong>
                  </span>
                )}
              </div>
              <span style={{ fontSize: 16 }}>{d.is_correct ? '✅' : '❌'}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <button onClick={onBack} className="btn btn-primary">← Back to tests</button>
      </div>
    </div>
  );
}

import { useState } from 'react';

// Official IELTS raw score (out of 40) -> band
const TABLES = {
  listening: [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]],
  reading: [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]],
};

export default function ScoreCard({ title, score, total, detail, onBack, kind, sections }) {
  const [filter, setFilter] = useState('all');   // all | wrong
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

      {/* Detail: grouped by part / passage, the student's answer and the correct one one under the other */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Answer review</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['all', `All ${total}`], ['wrong', `Mistakes ${wrong}`]].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-outline'}`}>{label}</button>
            ))}
          </div>
        </div>
        {groupDetail(detail, sections, kind).map(sec => {
          const rows = sec.nums.filter(n => detail[n] && (filter === 'all' || !detail[n].is_correct));
          if (!rows.length) return null;
          const ok = sec.nums.filter(n => detail[n]?.is_correct).length;
          return (
            <div key={sec.label}>
              {sec.label && (
                <div style={{ padding: '9px 20px', background: 'var(--bg2)', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{sec.label}</span><span>{ok} / {sec.nums.length}</span>
                </div>
              )}
              {rows.map(num => {
                const d = detail[num];
                return (
                  <div key={num} style={{
                    display: 'grid', gridTemplateColumns: '36px 1fr 24px', alignItems: 'start',
                    padding: '10px 20px', gap: 12, borderBottom: '1px solid var(--border)',
                    borderLeft: `3px solid ${d.is_correct ? 'var(--green)' : 'var(--accent)'}`,
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: d.is_correct ? 'var(--green-bg)' : 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: d.is_correct ? 'var(--green)' : 'var(--accent)' }}>
                      {num}
                    </div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.5, minWidth: 0 }}>
                      <div>
                        <span style={{ color: 'var(--text2)' }}>Your answer: </span>
                        <strong style={{ color: d.is_correct ? 'var(--green)' : 'var(--accent)' }}>{d.your_answer || 'not answered'}</strong>
                      </div>
                      {!d.is_correct && (
                        <div>
                          <span style={{ color: 'var(--text2)' }}>Correct answer: </span>
                          <strong style={{ color: 'var(--green)' }}>{d.correct_answer}</strong>
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 15, paddingTop: 3 }}>{d.is_correct ? '✅' : '❌'}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
        {filter === 'wrong' && wrong === 0 && <p style={{ padding: 20, color: 'var(--green)' }}>No mistakes. Excellent!</p>}
      </div>

      <div style={{ marginTop: 20 }}>
        <button onClick={onBack} className="btn btn-primary">← Back to tests</button>
      </div>
    </div>
  );
}

/* Sections given by the test page (Part 1-4 / Passage 1-3); Listening falls back to tens */
function groupDetail(detail, sections, kind) {
  const nums = Object.keys(detail).sort((a, b) => Number(a) - Number(b));
  if (sections && sections.length) {
    return sections.map(s => ({ label: s.label, nums: s.nums.map(String).filter(n => detail[n]) }))
      .filter(s => s.nums.length);
  }
  if (kind === 'listening') {
    const parts = {};
    nums.forEach(n => { const p = Math.ceil(Number(n) / 10); (parts[p] = parts[p] || []).push(n); });
    return Object.keys(parts).map(p => ({ label: `Part ${p}`, nums: parts[p] }));
  }
  return [{ label: '', nums }];
}

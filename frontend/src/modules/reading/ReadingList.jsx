import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';

export default function ReadingList() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get('/reading/').then(r => setTests(r.data)).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="container"><p className="text-muted">Loading...</p></div>;
  return (
    <div className="container">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>Reading</div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Reading Tests</h2>
        <p className="text-muted" style={{ marginTop: 4 }}>3 passages per test, 40 questions total. 60 minutes.</p>
      </div>
      {tests.length === 0
        ? <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text2)' }}>No tests available yet.</div>
        : <div className="grid-2">
            {tests.map(t => (
              <div key={t.id} className="card" style={{ transition: 'box-shadow 0.15s, transform 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow='var(--shadow-md)'; e.currentTarget.style.transform='translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow='var(--shadow)'; e.currentTarget.style.transform='none'; }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📖</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{t.title}</div>
                    <div className="text-muted">{t.passages?.length || 0} passages · 60 min</div>
                  </div>
                </div>
                <Link to={`/reading/${t.id}`} className="btn btn-primary btn-sm">Start Test →</Link>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

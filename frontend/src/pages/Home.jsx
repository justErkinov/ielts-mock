import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const modules = [
  { path: '/listening', label: 'Listening', desc: 'Audio recordings, MCQ & Gap Fill', icon: '🎧', color: '#e8edf5', active: true, time: '30 min', questions: '40 questions' },
  { path: '/reading', label: 'Reading', desc: 'Passages, True/False/NG, Matching', icon: '📖', color: '#e8f5ee', active: true, time: '60 min', questions: '40 questions' },
  { path: '/writing', label: 'Writing', desc: 'Task 1 & Task 2 essays', icon: '✍️', color: '#fff8e6', active: true, time: '60 min', questions: 'Teacher graded' },
  { path: '/speaking', label: 'Speaking', desc: 'AI interviewer — coming soon', icon: '🎙️', color: 'var(--bg2)', active: false, time: '—', questions: '—' },
];

const books = [
  { title: 'Cambridge IELTS 19', sub: 'Academic', color: '#1d3557', url: 'https://www.google.com/search?tbm=bks&q=Cambridge+IELTS+19+Academic' },
  { title: 'Cambridge IELTS 18', sub: 'General Training', color: '#2a7d4f', url: 'https://www.google.com/search?tbm=bks&q=Cambridge+IELTS+18+General+Training' },
  { title: 'IELTS Trainer 2', sub: '6 Practice Tests', color: '#7b2d8b', url: 'https://www.google.com/search?tbm=bks&q=IELTS+Trainer+2+Six+Practice+Tests' },
  { title: 'Barron\'s IELTS', sub: 'Superpack', color: '#c1440e', url: 'https://www.google.com/search?tbm=bks&q=Barron%27s+IELTS+Superpack' },
  { title: 'Official IELTS Practice', sub: 'Materials Vol.2', color: '#0077b6', url: 'https://www.google.com/search?tbm=bks&q=Official+IELTS+Practice+Materials+Volume+2' },
];

export default function Home() {
  const { user } = useAuth();
  return (
    <div className="container">
      {/* Hero */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
          Welcome back, <strong style={{ color: 'var(--primary)' }}>{user?.username}</strong>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, marginBottom: 8 }}>
          Practice for IELTS<br />the right way
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text2)', maxWidth: 480 }}>
          Full mock tests for Listening, Reading and Writing. Get instant scores and detailed feedback.
        </p>
      </div>

      {/* Books row */}
      <div style={{ marginBottom: 32, overflow: 'hidden' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
          Popular Prep Materials
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {books.map(b => (
            <a key={b.title} href={b.url} target="_blank" rel="noopener noreferrer" style={{
              padding: '8px 14px', borderRadius: 8, textDecoration: 'none', display: 'block',
              background: b.color + '18', border: `1px solid ${b.color}30`,
              transition: 'transform 0.12s, box-shadow 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: b.color }}>{b.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{b.sub}</div>
            </a>
          ))}
        </div>
      </div>

      {/* Modules */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 14 }}>
        Test Modules
      </div>
      <div className="grid-2" style={{ marginBottom: 40 }}>
        {modules.map(m => (
          <div key={m.path} className="card" style={{ opacity: m.active ? 1 : 0.6, position: 'relative', transition: 'box-shadow 0.15s, transform 0.15s' }}
            onMouseEnter={e => { if (m.active) { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'none'; }}>
            {!m.active && <span className="badge badge-gray" style={{ position: 'absolute', top: 14, right: 14 }}>Coming Soon</span>}
            <div style={{ width: 44, height: 44, borderRadius: 10, background: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 12 }}>
              {m.icon}
            </div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>{m.desc}</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>⏱ {m.time}</span>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>📝 {m.questions}</span>
            </div>
            {m.active
              ? <Link to={m.path} className="btn btn-primary btn-sm">Start Test →</Link>
              : <button className="btn btn-outline btn-sm" disabled>Coming Soon</button>}
          </div>
        ))}
      </div>

      {/* Tips */}
      <div className="card" style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)22' }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--primary)' }}>💡 Quick Tips</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {['Read instructions carefully before starting', 'Manage your time — don\'t spend too long on one question', 'In Listening, answer as you hear — don\'t wait', 'In Writing, plan before you write'].map(t => (
            <div key={t} style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', gap: 6 }}>
              <span style={{ color: 'var(--primary)', flexShrink: 0 }}>→</span> {t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';

export default function Timer({ minutes, onExpire }) {
  const [secs, setSecs] = useState(minutes * 60);

  useEffect(() => {
    const iv = setInterval(() => {
      setSecs(p => {
        if (p <= 1) { clearInterval(iv); onExpire?.(); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  const low = secs < 300;
  const pct = (secs / (minutes * 60)) * 100;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 80, height: 5, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: low ? 'var(--accent)' : 'var(--primary)', transition: 'width 1s linear, background 0.3s', borderRadius: 3 }} />
      </div>
      <div style={{
        padding: '5px 12px', borderRadius: 7,
        background: low ? 'var(--accent-light)' : 'var(--primary-light)',
        color: low ? 'var(--accent)' : 'var(--primary)',
        fontSize: 14, fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        border: `1px solid ${low ? '#fbbfc3' : 'var(--border)'}`,
      }}>
        ⏱ {m}:{s}
      </div>
    </div>
  );
}

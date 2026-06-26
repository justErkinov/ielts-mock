import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [hover, setHover] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const navLinks = [
    { path: '/listening', label: 'Listening' },
    { path: '/reading', label: 'Reading' },
    { path: '/writing', label: 'Writing' },
  ];

  return (
    <nav style={{
      background: 'var(--card)',
      borderBottom: '1px solid var(--border)',
      padding: '0 24px',
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 200,
      boxShadow: 'var(--shadow)',
    }}>
      {/* Logo */}
      <Link to="/" className="logo-area" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {/* AL-JABR shield icon — shield + bar chart + coins, like the real school logo */}
        <div style={{ width: 34, height: 34, position: 'relative', flexShrink: 0 }}>
          <svg viewBox="0 0 40 44" width="34" height="37">
            {/* Shield outline */}
            <path d="M20 2 L37 8 L37 24 Q37 36 20 42 Q3 36 3 24 L3 8 Z" fill="var(--primary)" opacity="0.12"/>
            <path d="M20 3 L36 9 L36 24 Q36 35 20 41 Q4 35 4 24 L4 9 Z" fill="none" stroke="var(--primary)" strokeWidth="1.4"/>
            {/* Bar chart with rising arrow */}
            <rect x="11" y="20" width="3" height="8" fill="var(--accent)" opacity="0.85"/>
            <rect x="15.5" y="16" width="3" height="12" fill="var(--accent)" opacity="0.85"/>
            <rect x="20" y="12" width="3" height="16" fill="var(--accent)" opacity="0.85"/>
            <path d="M10 19 L17 13 L22 16 L29 8" fill="none" stroke="var(--primary)" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M25 8 L29 8 L29 12" fill="none" stroke="var(--primary)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            {/* Coins stack */}
            <ellipse cx="20" cy="31" rx="9" ry="2.6" fill="var(--accent)" opacity="0.9"/>
            <ellipse cx="20" cy="28.5" rx="9" ry="2.6" fill="var(--primary)" opacity="0.55"/>
          </svg>
        </div>
        <div style={{ minWidth: 92 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)', lineHeight: 1.1, transition: 'all 0.2s' }}>
            {hover ? 'AL-JABR' : 'IELTS Mock'}
          </div>
          {hover && (
            <div style={{ fontSize: 10, color: 'var(--text2)', letterSpacing: '0.05em' }}>
              International School
            </div>
          )}
        </div>
      </Link>

      {user ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {navLinks.map(l => (
            <Link key={l.path} to={l.path} style={{
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: location.pathname.startsWith(l.path) ? 600 : 400,
              color: location.pathname.startsWith(l.path) ? 'var(--primary)' : 'var(--text2)',
              padding: '6px 12px',
              borderRadius: 7,
              background: location.pathname.startsWith(l.path) ? 'var(--primary-light)' : 'transparent',
              transition: 'all 0.15s',
            }}>{l.label}</Link>
          ))}
          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 6px' }} />
          {/* Dark mode toggle */}
          <button onClick={() => setDark(d => !d)} className="btn btn-ghost btn-sm" title="Toggle dark mode">
            {dark ? '☀️' : '🌙'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--text2)', padding: '0 4px' }}>
            {user.username}
          </span>
          <button onClick={handleLogout} className="btn btn-outline btn-sm">Sign out</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setDark(d => !d)} className="btn btn-ghost btn-sm">{dark ? '☀️' : '🌙'}</button>
          <Link to="/login" className="btn btn-outline btn-sm">Sign in</Link>
          <Link to="/register" className="btn btn-primary btn-sm">Register</Link>
        </div>
      )}
    </nav>
  );
}

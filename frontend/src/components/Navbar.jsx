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

  // No menu on exam pages: students must not navigate away mid-test
  if (/^\/(listening|reading|writing)\/[^/]+/.test(location.pathname)) return null;

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
        <img src="/al-jabr-logo.png" alt="AL-JABR" width="40" height="40"
          style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
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

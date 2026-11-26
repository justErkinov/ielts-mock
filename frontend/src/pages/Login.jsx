import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await api.post('/users/login/', form);
      login(res.data.user, res.data.token);
      const next = new URLSearchParams(window.location.search).get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (err) {
      setError(err.response?.data?.error || 'Incorrect username or password');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/al-jabr-logo.png" alt="AL-JABR" width="96" height="96"
            style={{ width: 96, height: 96, objectFit: 'contain', marginBottom: 12 }} />
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>Welcome back</div>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 4 }}>Sign in to AL-JABR IELTS Mock</div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="Enter username" required autoFocus />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" required />
            </div>
            {!error && new URLSearchParams(window.location.search).get('expired') && (
              <p className="text-muted" style={{ marginBottom: 12 }}>You were signed out. Please sign in again to continue.</p>
            )}
            {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 11 }} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
          </form>
          <p style={{ marginTop: 18, fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>
            Don't have an account? <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 500 }}>Register</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

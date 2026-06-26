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
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Incorrect username or password');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <svg viewBox="0 0 50 56" width="50" height="56" style={{ marginBottom: 12 }}>
            <path d="M25 2 L46 10 L46 32 Q46 48 25 54 Q4 48 4 32 L4 10 Z" fill="var(--primary)" opacity="0.12"/>
            <path d="M25 3 L45 11 L45 32 Q45 47 25 53 Q5 47 5 32 L5 11 Z" fill="none" stroke="var(--primary)" strokeWidth="2"/>
            <text x="25" y="35" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--primary)" fontFamily="Inter">AJ</text>
          </svg>
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

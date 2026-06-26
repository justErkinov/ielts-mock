import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [form, setForm] = useState({ username: '', email: '', password: '', phone: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Auto-generate a valid username from the full name as the user types,
  // e.g. "Qobil Hoshimov" -> "qobil_hoshimov" — no spaces, lowercase.
  const handleFullNameChange = (value) => {
    setFullName(value);
    const suggested = value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_.+-]/g, '');
    setForm(f => ({ ...f, username: suggested }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const payload = { ...form, first_name: fullName.trim() };
      const res = await api.post('/users/register/', payload);
      login(res.data.user, res.data.token);
      navigate('/');
    } catch (err) {
      const d = err.response?.data;
      setError(
        d?.username?.[0] || d?.email?.[0] || d?.password?.[0] ||
        d?.non_field_errors?.[0] || 'Registration failed'
      );
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <svg viewBox="0 0 50 56" width="44" height="50" style={{ marginBottom: 10 }}>
            <path d="M25 2 L46 10 L46 32 Q46 48 25 54 Q4 48 4 32 L4 10 Z" fill="var(--primary)" opacity="0.12"/>
            <path d="M25 3 L45 11 L45 32 Q45 47 25 53 Q5 47 5 32 L5 11 Z" fill="none" stroke="var(--primary)" strokeWidth="2"/>
            <text x="25" y="35" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--primary)" fontFamily="Inter">AJ</text>
          </svg>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>Create account</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>AL-JABR IELTS Mock Platform</div>
        </div>
        <div className="card" style={{ padding: 26 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Full name</label>
              <input
                type="text"
                value={fullName}
                placeholder="e.g. Qobil Hoshimov"
                required
                onChange={e => handleFullNameChange(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Username (auto-generated, you can edit it)</label>
              <input
                type="text"
                value={form.username}
                placeholder="e.g. qobil_hoshimov"
                required
                onChange={e => setForm({ ...form, username: e.target.value.replace(/\s+/g, '_') })}
              />
              <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 4 }}>
                Letters, numbers, and . _ + - only — no spaces.
              </div>
            </div>

            <div className="form-group">
              <label>Email address</label>
              <input
                type="email"
                value={form.email}
                placeholder="you@example.com"
                required
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Phone (optional)</label>
              <input
                type="text"
                value={form.phone}
                placeholder="+998 90 000 00 00"
                onChange={e => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={form.password}
                placeholder="Min. 8 characters"
                required
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
            </div>

            {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 11 }} disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account →'}
            </button>
          </form>
          <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>
            Already registered? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 500 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

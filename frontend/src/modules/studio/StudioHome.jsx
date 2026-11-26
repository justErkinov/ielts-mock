import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { KINDS, Modal, STUDIO_CSS, errText } from './studioKit';

const previewUrl = t => `/${t.kind}/${t.id}?preview=1`;

export default function StudioHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tests, setTests] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(null);
  const [del, setDel] = useState(null);
  const [problem, setProblem] = useState(null);

  const load = () => api.get('/studio/tests/').then(r => setTests(r.data)).catch(() => setTests([]));
  useEffect(() => {
    load();
    api.get('/studio/info/').then(r => setInfo(r.data)).catch(() => {});
  }, []);

  const togglePublish = async t => {
    setBusy(t.id + t.kind);
    try {
      const { data } = await api.get(`/studio/${t.kind}/${t.id}/`);
      await api.put(`/studio/${t.kind}/${t.id}/`, { ...data, is_active: !t.is_active });
      await load();
    } catch (e) {
      const errs = e?.response?.data?.errors;
      setProblem({ test: t, errors: errs || [errText(e)] });
    } finally { setBusy(null); }
  };

  const remove = async () => {
    const t = del;
    setDel(null);
    setBusy(t.id + t.kind);
    try { await api.delete(`/studio/${t.kind}/${t.id}/`); await load(); } catch (e) { setProblem({ test: t, errors: [errText(e)] }); }
    setBusy(null);
  };

  return (
    <div className="st-wrap" style={{ maxWidth: 1100 }}>
      <style>{STUDIO_CSS}</style>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Test studio</h2>
      <p className="text-muted" style={{ marginBottom: 20 }}>
        Add a test from a PDF or Word file, or by pasting the questions and the answer key. Students only see a test after you publish it.
      </p>

      <div className="st-new">
        {Object.entries(KINDS).map(([k, v]) => (
          <Link key={k} to={`/studio/${k}/new`}>
            <div style={{ fontSize: 22 }}>{v.icon}</div>
            <b>New {v.label} test</b>
            <span>{k === 'listening' ? '4 parts · import from PDF / Word · one audio file' : k === 'reading' ? '3 passages, 40 questions' : 'Task 1 with a picture, Task 2'}</span>
          </Link>
        ))}
      </div>

      {user?.is_superuser && info && info.storage === 'database' && (
        <div className="st-prob-warn" style={{ marginBottom: 16 }}>
          Audio and pictures are stored in the database for now. That works, but for many students at once
          connect Cloudinary (free) so files load faster: add CLOUDINARY_URL in the backend settings on Render.
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {tests === null ? <p className="text-muted" style={{ padding: 20 }}>Loading…</p>
          : tests.length === 0 ? <p className="text-muted" style={{ padding: 28, textAlign: 'center' }}>No tests yet. Start with one of the buttons above.</p>
          : (
            <table className="st-table">
              <thead><tr>
                <th>Test</th><th className="st-hide-sm">Contents</th><th>Status</th><th />
              </tr></thead>
              <tbody>
                {tests.map(t => (
                  <tr key={t.kind + t.id}>
                    <td>
                      <div className="st-kind">{KINDS[t.kind].icon} {KINDS[t.kind].label}</div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>{t.title}</div>
                      {t.owner && <div className="text-muted" style={{ fontSize: 12 }}>by {t.owner}</div>}
                    </td>
                    <td className="st-hide-sm text-muted">{t.detail}{t.kind !== 'writing' ? ` · ${t.questions} questions` : ''}</td>
                    <td>
                      <span className={`st-pill ${t.is_active ? 'st-pill-live' : 'st-pill-draft'}`}>
                        {t.is_active ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td>
                      <div className="st-actions">
                        <button className="btn btn-outline btn-sm" onClick={() => navigate(`/studio/${t.kind}/${t.id}`)}>Edit</button>
                        <a className="btn btn-outline btn-sm" href={previewUrl(t)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Preview</a>
                        <button className="btn btn-outline btn-sm" disabled={busy === t.id + t.kind} onClick={() => togglePublish(t)}>
                          {t.is_active ? 'Unpublish' : 'Publish'}
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }} disabled={busy === t.id + t.kind} onClick={() => setDel(t)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {del && (
        <Modal title={`Delete "${del.title}"?`} onClose={() => setDel(null)} actions={<>
          <button className="btn btn-outline" onClick={() => setDel(null)}>Keep it</button>
          <button className="btn btn-primary" style={{ background: 'var(--accent)' }} onClick={remove}>Delete test</button>
        </>}>
          The test and all student results for it are deleted for good. To only hide it from students, use Unpublish instead.
        </Modal>
      )}
      {problem && (
        <Modal title={`"${problem.test.title}" can't be published yet`} onClose={() => setProblem(null)} actions={<>
          <button className="btn btn-outline" onClick={() => setProblem(null)}>Close</button>
          <button className="btn btn-primary" onClick={() => navigate(`/studio/${problem.test.kind}/${problem.test.id}`)}>Open and fix</button>
        </>}>
          <ul>{problem.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Modal>
      )}
    </div>
  );
}

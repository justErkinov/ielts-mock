import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GRACE_SECONDS, MAX_VIOLATIONS } from '../hooks/useAntiCheat';

/**
 * Overlays used with useAntiCheat:
 *  <FullscreenGate>   — exam rules + "Start" button (starts fullscreen)
 *  <ViolationWarning> — shown after a violation, with a GRACE_SECONDS countdown
 *  <BlockedScreen>    — test submitted and locked
 * Exam screens always use a light, official-looking palette.
 */

const backdrop = {
  position: 'fixed', inset: 0, zIndex: 3000, display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 20,
  fontFamily: 'Arial, Helvetica, sans-serif',
};
const box = {
  background: '#fff', color: '#111827', borderRadius: 12, width: '100%',
  boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
};

export function FullscreenGate({ onStart, title, resume }) {
  const navigate = useNavigate();
  const rules = [
    'The test opens in fullscreen. Stay on this screen until you submit.',
    'Right-click, copying and keyboard shortcuts are disabled. Only typing keys work.',
    'Leaving fullscreen or switching to another window gives a warning. You then have ' +
      `${GRACE_SECONDS} seconds to press "Return to test".`,
    `After ${MAX_VIOLATIONS} warnings, or if you do not return in time, your test is submitted automatically.`,
  ];
  return (
    <div style={{ ...backdrop, background: '#f3f4f6' }}>
      <div style={{ ...box, maxWidth: 520, padding: '30px 30px 24px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>
          Exam mode
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>{title || 'Before you start'}</h2>
        <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {rules.map(r => <li key={r} style={{ fontSize: 14, lineHeight: 1.55, color: '#374151' }}>{r}</li>)}
        </ol>
        {resume && (
          <p style={{ background: '#ecfdf5', color: '#047857', borderRadius: 8, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>
            You already started this test. Your answers are saved and the time continues from where it was.
          </p>
        )}
        <button onClick={onStart} style={{
          width: '100%', background: '#111827', color: '#fff', border: 'none', borderRadius: 8,
          padding: '13px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
        }}>
          {resume ? 'Continue the test' : 'I am ready — start the test'}
        </button>
        <button onClick={() => navigate(-1)} style={{
          width: '100%', marginTop: 8, background: 'transparent', color: '#6b7280', border: 'none',
          padding: 8, fontSize: 13, cursor: 'pointer',
        }}>
          ← Go back
        </button>
      </div>
    </div>
  );
}

export function ViolationWarning({ count, max = MAX_VIOLATIONS, onDismiss, deadline }) {
  const [end] = useState(() => deadline || Date.now() + GRACE_SECONDS * 1000);
  const [left, setLeft] = useState(Math.ceil((end - Date.now()) / 1000));

  useEffect(() => {
    const iv = setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 200);
    return () => clearInterval(iv);
  }, [end]);

  return (
    <div style={{ ...backdrop, background: 'rgba(17,24,39,0.75)' }}>
      <div style={{ ...box, maxWidth: 440, padding: 30, textAlign: 'center', borderTop: '6px solid #dc2626' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Warning {count} of {max}
        </p>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '8px 0 10px' }}>You left the test screen</h2>
        <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.55 }}>
          Your teacher has been notified. Return now, or your test will be submitted automatically.
        </p>
        <div style={{ fontSize: 56, fontWeight: 800, color: '#dc2626', margin: '14px 0 4px', fontVariantNumeric: 'tabular-nums' }}>
          {left}
        </div>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 18 }}>seconds left</p>
        <button onClick={onDismiss} style={{
          width: '100%', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8,
          padding: '13px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
        }}>
          Return to test
        </button>
      </div>
    </div>
  );
}

export function BlockedScreen({ onBack, status = 'sent', onRetry }) {
  const text = {
    sending: 'You left the test screen too many times, or did not return in time. Sending your answers to your teacher…',
    sent: 'You left the test screen too many times, or did not return in time. Your answers up to this point have been submitted and sent to your teacher.',
    failed: 'You left the test screen too many times, or did not return in time. Your answers could not be sent because the internet is down. They are saved on this computer — check the Wi-Fi and press Try again.',
  }[status] || '';
  return (
    <div style={{ ...backdrop, background: '#f3f4f6' }}>
      <div style={{ ...box, maxWidth: 460, padding: 34, textAlign: 'center', borderTop: '6px solid #dc2626' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, color: '#dc2626' }}>
          {status === 'sent' ? 'Test submitted and locked' : 'Test locked'}
        </h2>
        <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.6, marginBottom: 22 }}>{text}</p>
        {status === 'failed' && (
          <button onClick={onRetry} style={{
            width: '100%', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8,
            padding: '12px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 8,
          }}>
            Try again
          </button>
        )}
        <button onClick={onBack} disabled={status === 'sending'} style={{
          width: '100%', background: '#111827', color: '#fff', border: 'none', borderRadius: 8,
          padding: '12px 16px', fontSize: 15, fontWeight: 700, cursor: status === 'sending' ? 'wait' : 'pointer',
          opacity: status === 'sending' ? 0.5 : 1,
        }}>
          Back to tests
        </button>
      </div>
    </div>
  );
}

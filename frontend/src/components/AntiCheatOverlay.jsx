/**
 * Two overlays used together with useAntiCheat:
 *
 * <FullscreenGate>  — shown before the test starts; blocks until the
 *                      student clicks "Start in Fullscreen".
 * <ViolationWarning> — shown each time a violation is detected (not the final one).
 * <BlockedScreen>    — shown once MAX_VIOLATIONS is reached; test is locked.
 */

export function FullscreenGate({ onStart }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div className="card" style={{ maxWidth: 460, textAlign: 'center', padding: 36 }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>🔒</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Exam Mode</h2>
        <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 20 }}>
          This test runs in fullscreen mode. Switching tabs, opening other windows,
          or exiting fullscreen will be recorded as a violation. After <strong>3 violations</strong>,
          your test will be automatically submitted and locked.
        </p>
        <button onClick={onStart} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 11 }}>
          Start in Fullscreen →
        </button>
      </div>
    </div>
  );
}

export function ViolationWarning({ count, max, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div className="card" style={{ maxWidth: 420, textAlign: 'center', padding: 32, border: '1px solid var(--accent)' }}>
        <div style={{ fontSize: 38, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: 'var(--accent)' }}>
          Warning {count}/{max}
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 20 }}>
          You left the test screen. This has been recorded.
          {count === max - 1
            ? ' One more violation will submit your test automatically and lock your account from this test.'
            : ' Please stay on this page and remain in fullscreen until you submit.'}
        </p>
        <button onClick={onDismiss} className="btn btn-danger" style={{ width: '100%', justifyContent: 'center', padding: 10 }}>
          I Understand — Return to Test
        </button>
      </div>
    </div>
  );
}

export function BlockedScreen({ onBack }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 1001,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div className="card" style={{ maxWidth: 460, textAlign: 'center', padding: 36, border: '1px solid var(--accent)' }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🚫</div>
        <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 10, color: 'var(--accent)' }}>
          Test Locked
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 20 }}>
          You exceeded the maximum number of violations (leaving the test screen 3 times).
          Your answers up to this point have been automatically submitted and sent to your teacher.
        </p>
        <button onClick={onBack} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
          Back to Tests
        </button>
      </div>
    </div>
  );
}

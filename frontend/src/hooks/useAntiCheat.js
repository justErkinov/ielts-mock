import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../services/api';

const MAX_VIOLATIONS = 3;

/**
 * Anti-cheat hook for exam pages.
 *
 * Detects and blocks:
 *  - Leaving fullscreen
 *  - Switching tabs / apps (visibilitychange)
 *  - Losing window focus, e.g. Alt+Tab (blur)
 *  - Right-click context menu (which enables "Search with Google" etc.)
 *  - Copy / cut of exam content
 *  - DevTools shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U)
 *  - Print (Ctrl+P)
 *
 * Each detected action is reported to the backend immediately (so the
 * teacher's Telegram gets a live violation alert), counted locally, and
 * shown to the student as a warning. On the MAX_VIOLATIONS-th violation,
 * onBlocked() fires so the caller can auto-submit and lock the test.
 */
export function useAntiCheat({ active, onBlocked, testType, testId }) {
  const [violations, setViolations] = useState(0);
  const [warning, setWarning] = useState(null); // { count, reason } | null
  const [blocked, setBlocked] = useState(false);
  const blockedRef = useRef(false);
  const lastViolationAt = useRef(0);

  const reportToServer = useCallback((reason, count) => {
    api.post('/users/report-violation/', {
      test_type: testType,
      test_id: testId,
      reason,
      count,
    }).catch(() => { /* best effort — never block the UI on this */ });
  }, [testType, testId]);

  const registerViolation = useCallback((reason) => {
    if (!active || blockedRef.current) return;

    // Debounce: some actions (e.g. fullscreen-exit + blur) fire together.
    const now = Date.now();
    if (now - lastViolationAt.current < 1200) return;
    lastViolationAt.current = now;

    setViolations(prev => {
      const next = prev + 1;
      reportToServer(reason, next);
      if (next >= MAX_VIOLATIONS) {
        blockedRef.current = true;
        setBlocked(true);
        setWarning(null);
        onBlocked?.(reason);
      } else {
        setWarning({ count: next, reason });
      }
      return next;
    });
  }, [active, onBlocked, reportToServer]);

  useEffect(() => {
    if (!active) return;

    const handleVisibility = () => {
      if (document.hidden) registerViolation('tab_switch');
    };
    const handleBlur = () => {
      registerViolation('window_blur');
    };
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) registerViolation('fullscreen_exit');
    };
    // Right-click opens the context menu, which offers "Search with Google",
    // "Inspect", etc. Block it outright during the exam.
    const handleContextMenu = (e) => {
      e.preventDefault();
      registerViolation('right_click');
    };
    // Block copy/cut so question text can't be pasted elsewhere (e.g. into an AI tool).
    const handleCopy = (e) => {
      e.preventDefault();
      registerViolation('copy_attempt');
    };
    const handleCut = (e) => {
      e.preventDefault();
      registerViolation('copy_attempt');
    };
    // Block common devtools / print shortcuts.
    const handleKeyDown = (e) => {
      const blockedCombo =
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key)) ||
        (e.ctrlKey && ['u', 'U', 'p', 'P', 's', 'S'].includes(e.key));
      if (blockedCombo) {
        e.preventDefault();
        registerViolation('devtools_attempt');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCut);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, registerViolation]);

  const enterFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch {
      // Some browsers require a direct user gesture — the Start button provides that.
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const dismissWarning = useCallback(() => setWarning(null), []);

  return {
    violations,
    warning,
    blocked,
    dismissWarning,
    enterFullscreen,
    exitFullscreen,
    maxViolations: MAX_VIOLATIONS,
  };
}

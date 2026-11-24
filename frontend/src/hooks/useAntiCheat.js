import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../services/api';

export const MAX_VIOLATIONS = 3;
export const GRACE_SECONDS = 5;

const ALLOWED_KEYS = new Set([
  'Backspace', 'Delete', 'Enter', 'Tab', 'Shift', 'Control', 'CapsLock',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Home', 'End', 'PageUp', 'PageDown',
]);

const isEditable = (el) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

/**
 * Exam lockdown for Listening / Reading / Writing.
 *
 * Silently blocked (no warning, nothing happens):
 *   right-click, copy/cut/paste, dragging text, and every key that is not
 *   needed for typing (F1–F12, Esc, Ctrl/Alt/Win shortcuts, Print Screen...).
 *   Letters, numbers, punctuation, Space, Backspace, Delete, Enter, Tab and
 *   arrows keep working. Ctrl+Z / Ctrl+Y / Ctrl+A work inside answer boxes.
 *
 * Counted as violations (warning + Telegram alert):
 *   leaving fullscreen, switching tab/app, the window losing focus.
 *   The student then has GRACE_SECONDS to press "Return to test";
 *   otherwise — or on the MAX_VIOLATIONS-th violation — the test is
 *   submitted and locked via onBlocked().
 *
 * In Chrome, fullscreen + Keyboard Lock also captures Esc and most system
 * shortcuts, so a single Esc press no longer exits fullscreen.
 */
export function useAntiCheat({ active, onBlocked, testType, testId, persistKey }) {
  const vKey = persistKey ? `${persistKey}:violations` : null;
  const stored = () => { try { return Number(localStorage.getItem(vKey)) || 0; } catch { return 0; } };
  const [violations, setViolations] = useState(() => (vKey ? stored() : 0));
  const [warning, setWarning] = useState(null); // { count, reason, deadline } | null
  const [blocked, setBlocked] = useState(false);

  const activeRef = useRef(active);
  const blockedRef = useRef(false);
  const warningRef = useRef(null);
  const countRef = useRef(violations);
  const lastAt = useRef(0);
  const onBlockedRef = useRef(onBlocked);

  useEffect(() => { activeRef.current = active; }, [active]);
  // Always call the latest onBlocked, so auto-submit sends the latest answers
  useEffect(() => { onBlockedRef.current = onBlocked; });

  const report = useCallback((reason, count) => {
    api.post('/users/report-violation/', {
      test_type: testType, test_id: testId, reason, count,
    }).catch(() => {});
  }, [testType, testId]);

  const block = useCallback((reason) => {
    if (blockedRef.current) return;
    blockedRef.current = true;
    warningRef.current = null;
    setWarning(null);
    setBlocked(true);
    onBlockedRef.current?.(reason);
  }, []);

  const registerViolation = useCallback((reason) => {
    if (!activeRef.current || blockedRef.current) return;
    // While a warning is already open the student is still "away" — count once
    if (warningRef.current) return;
    const now = Date.now();
    if (now - lastAt.current < 1500) return; // fullscreen-exit + blur fire together
    lastAt.current = now;

    const next = countRef.current + 1;
    countRef.current = next;
    setViolations(next);
    if (vKey) { try { localStorage.setItem(vKey, String(next)); } catch { /* ignore */ } }
    report(reason, next);

    if (next >= MAX_VIOLATIONS) {
      block(reason);
    } else {
      const w = { count: next, reason, deadline: now + GRACE_SECONDS * 1000 };
      warningRef.current = w;
      setWarning(w);
    }
  }, [report, block, vKey]);

  // Grace period: no "Return to test" click within GRACE_SECONDS -> removed
  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => {
      if (warningRef.current === warning) {
        report('warning_ignored', MAX_VIOLATIONS);
        block('warning_ignored');
      }
    }, Math.max(0, warning.deadline - Date.now()));
    return () => clearTimeout(t);
  }, [warning, report, block]);

  useEffect(() => {
    if (!active) return;

    const onVisibility = () => { if (document.hidden) registerViolation('tab_switch'); };
    const onBlur = () => registerViolation('window_blur');
    const onFullscreen = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        registerViolation('fullscreen_exit');
      }
    };
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    const onCopy = (e) => { if (!isEditable(e.target)) stop(e); };

    const onKeyDown = (e) => {
      const k = e.key;
      // AltGr letters on some layouts arrive as Ctrl+Alt+<char>
      if (k && k.length === 1 && e.getModifierState && e.getModifierState('AltGraph')) return;

      if (e.ctrlKey || e.metaKey || e.altKey) {
        if (k === 'Control' || k === 'Shift') return;
        const lower = (k || '').toLowerCase();
        if (isEditable(e.target) && (e.ctrlKey || e.metaKey) && !e.altKey
            && (lower === 'z' || lower === 'y' || lower === 'a')) return;
        stop(e);
        return;
      }
      if (k && k.length === 1) return; // letters, digits, punctuation, space
      if (ALLOWED_KEYS.has(k)) return;
      stop(e); // F1–F12, Escape, Meta/Win, Alt, PrintScreen, ContextMenu...
    };

    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    const onPopState = () => { window.history.pushState(null, '', window.location.href); };
    window.history.pushState(null, '', window.location.href);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('webkitfullscreenchange', onFullscreen);
    document.addEventListener('contextmenu', stop, true);
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', stop, true);
    document.addEventListener('paste', stop, true);
    document.addEventListener('dragstart', stop, true);
    document.addEventListener('drop', stop, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('webkitfullscreenchange', onFullscreen);
      document.removeEventListener('contextmenu', stop, true);
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', stop, true);
      document.removeEventListener('paste', stop, true);
      document.removeEventListener('dragstart', stop, true);
      document.removeEventListener('drop', stop, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [active, registerViolation]);

  const enterFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      }
      // Chrome: capture Esc and system shortcuts while in fullscreen
      if (navigator.keyboard && navigator.keyboard.lock) {
        await navigator.keyboard.lock().catch(() => {});
      }
    } catch {
      // Needs a direct click — the Start / Return buttons provide it
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    try { navigator.keyboard && navigator.keyboard.unlock && navigator.keyboard.unlock(); } catch {}
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const dismissWarning = useCallback(() => {
    warningRef.current = null;
    lastAt.current = Date.now(); // ignore the blur/focus noise caused by re-entering fullscreen
    setWarning(null);
  }, []);

  return {
    violations, warning, blocked, dismissWarning,
    enterFullscreen, exitFullscreen, maxViolations: MAX_VIOLATIONS,
  };
}

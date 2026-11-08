import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keeps keyboard focus inside a portaled modal while it is open:
 * - the app behind it (#root) is made `inert`, so Tab, clicks and screen readers
 *   can't reach the page underneath;
 * - Tab / Shift+Tab wrap inside the modal;
 * - Escape calls `onEscape`;
 * - focus goes back to whatever opened the modal when it closes.
 */
export function useModalFocus(
  containerRef: React.RefObject<HTMLElement>,
  isOpen: boolean,
  onEscape?: () => void,
) {
  const escRef = useRef(onEscape);
  escRef.current = onEscape;

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const opener = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    // Don't trap the app if the modal somehow lives inside #root
    const canInert = !!root && !root.contains(container) && !root.hasAttribute('inert');
    if (canInert) root!.setAttribute('inert', '');

    if (!container.contains(document.activeElement)) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE);
      (first || container).focus({ preventScroll: true });
    }

    const visible = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escRef.current) {
        // Let an open <select> or a nested dialog handle its own Escape first
        if (e.defaultPrevented) return;
        e.stopPropagation();
        escRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = visible();
      if (!items.length) { e.preventDefault(); container.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !container.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Anything that still pulls focus out (e.g. an autofocus on the page) is sent back
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Node | null;
      if (t && !container.contains(t) && document.body.contains(container)) {
        const first = container.querySelector<HTMLElement>(FOCUSABLE);
        (first || container).focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn);
      if (canInert) root!.removeAttribute('inert');
      if (opener && document.body.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [isOpen, containerRef]);
}

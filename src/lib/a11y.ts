// Sprint 9 T9.5 — small accessibility helpers shared by modal/sheet components.
//
// useDialogA11y(onClose):
//   - Wires up Escape-to-close
//   - Returns a `closeBtnRef` to attach to the dialog's close button. On mount,
//     focus is moved to that button (focus-trap-lite). On unmount, focus
//     returns to the element that was focused right before the dialog opened
//     (the trigger button, by convention).
//
// This is intentionally minimal — no `inert` outside-tree manipulation, no
// full focus trap. Mom's UI is mobile-first so the keyboard surface area is
// small, but axe-core flags missing dialog focus-on-mount and Escape support
// as serious violations regardless of platform.

import { useEffect, useRef } from 'react';

export function useDialogA11y(
  onClose: () => void,
  options?: { initialFocusRef?: React.RefObject<HTMLElement> },
) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;
    // Prefer caller-supplied initial focus (e.g. first form input), else
    // fall back to the close button. Either way we move focus inside the
    // dialog so screen readers announce the new context.
    (options?.initialFocusRef?.current ?? closeBtnRef.current)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Restore focus on close — best-effort; if the trigger was unmounted
      // (e.g. detail page navigated away) focus falls back to <body>.
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  return { closeBtnRef };
}

// useRouteFocus(headingRef):
//   On mount, moves keyboard focus to the main heading and announces the
//   page change to screen readers. The heading element should have
//   `tabIndex={-1}` so it's programmatically focusable but not in the tab
//   order. Apply on top-level page components only — child renders don't
//   need this.
export function useRouteFocus(headingRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    headingRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

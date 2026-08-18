import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

type OverlayElement = HTMLElement & {
  showOverlay?: () => void;
  hideOverlay?: () => void;
};

const HOST_DISMISS_TIMEOUT_MS = 350;

export type UseModalOverlayOptions = {
  /**
   * When false (default), backdrop / host outside-click hide is ignored and the
   * modal is shown again. Close via the header X (`hideOverlay`) or `dismiss()`
   * (Close/Cancel buttons) still works.
   *
   * Set true only for disposable modals that should dismiss on outside click.
   */
  closeOnOutsideClick?: boolean;
};

/**
 * `s-modal` renders hidden until `showOverlay()` is called on the upgraded element,
 * so mounting alone is not enough to display it.
 *
 * When embedded in Admin the element delegates closing to the App Bridge host via
 * `modal.hide(element.id)`, so the modal needs a stable non-empty `id` or the host
 * cannot match it and the dialog stays open.
 *
 * Outside-click and the header X both surface as a `hide` event. Polaris X calls
 * `hideOverlay()` on the element; backdrop dismiss usually does not. We mark
 * `hideOverlay` calls as intentional so X can close while outside clicks stay open.
 */
export function useModalOverlay(
  open: boolean,
  onDismiss: () => void,
  options: UseModalOverlayOptions = {},
) {
  // Default locked: only Close / X closes. Opt in to outside-click with true.
  const closeOnOutsideClick = options.closeOnOutsideClick === true;
  const reactId = useId();
  const id = useMemo(() => `aone-modal-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`, [reactId]);

  const [element, setElement] = useState<OverlayElement | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const fallbackTimer = useRef<number | undefined>(undefined);
  const intentionalDismissRef = useRef(false);
  const reopenTimers = useRef<number[]>([]);

  const ref = useCallback((node: HTMLElement | null) => {
    setElement(node as OverlayElement | null);
  }, []);

  const clearReopenTimers = useCallback(() => {
    for (const t of reopenTimers.current) window.clearTimeout(t);
    reopenTimers.current = [];
  }, []);

  useEffect(() => {
    if (!open || !element) return;

    let cancelled = false;
    const nativeHide = element.hideOverlay?.bind(element);

    // X button → hideOverlay → intentional close.
    // Backdrop / Esc from host → hide event only → reopen when locked.
    if (nativeHide && !closeOnOutsideClick) {
      element.hideOverlay = () => {
        intentionalDismissRef.current = true;
        clearReopenTimers();
        nativeHide();
      };
    }

    const forceShow = () => {
      if (cancelled || intentionalDismissRef.current) return;
      element.showOverlay?.();
    };

    const handleHide = () => {
      if (!closeOnOutsideClick && !intentionalDismissRef.current) {
        // Outside click / host dismiss - keep the dialog open.
        // Re-show immediately and again after host finish (Admin can race the hide).
        forceShow();
        clearReopenTimers();
        reopenTimers.current = [
          window.setTimeout(forceShow, 0),
          window.setTimeout(forceShow, 40),
          window.setTimeout(forceShow, 120),
        ];
        return;
      }
      intentionalDismissRef.current = false;
      clearReopenTimers();
      dismissRef.current();
    };
    element.addEventListener("hide", handleHide);

    const show = () => {
      if (!cancelled) element.showOverlay?.();
    };
    if (typeof customElements !== "undefined") {
      void customElements.whenDefined("s-modal").then(show);
    } else {
      show();
    }

    return () => {
      cancelled = true;
      element.removeEventListener("hide", handleHide);
      if (nativeHide) {
        element.hideOverlay = nativeHide;
      }
      clearReopenTimers();
      window.clearTimeout(fallbackTimer.current);
    };
  }, [open, element, closeOnOutsideClick, clearReopenTimers]);

  const dismiss = useCallback(() => {
    intentionalDismissRef.current = true;
    clearReopenTimers();
    if (!element?.hideOverlay) {
      intentionalDismissRef.current = false;
      dismissRef.current();
      return;
    }
    element.hideOverlay();
    // The host may never call back, which would leave the dialog stuck open.
    window.clearTimeout(fallbackTimer.current);
    fallbackTimer.current = window.setTimeout(() => {
      intentionalDismissRef.current = false;
      dismissRef.current();
    }, HOST_DISMISS_TIMEOUT_MS);
  }, [element, clearReopenTimers]);

  return { id, ref, dismiss };
}

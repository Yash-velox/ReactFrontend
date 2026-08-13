import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

type OverlayElement = HTMLElement & {
  showOverlay?: () => void;
  hideOverlay?: () => void;
};

const HOST_DISMISS_TIMEOUT_MS = 350;

export type UseModalOverlayOptions = {
  /**
   * When false, backdrop / host-initiated hide is ignored and the modal is
   * shown again. The native X button still closes (it calls `hideOverlay`).
   * Explicit `dismiss()` (Close/Cancel) always closes.
   * Default: true.
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
  const closeOnOutsideClick = options.closeOnOutsideClick !== false;
  const reactId = useId();
  const id = useMemo(() => `aone-modal-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`, [reactId]);

  const [element, setElement] = useState<OverlayElement | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const fallbackTimer = useRef<number | undefined>(undefined);
  const intentionalDismissRef = useRef(false);

  const ref = useCallback((node: HTMLElement | null) => {
    setElement(node as OverlayElement | null);
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
        nativeHide();
      };
    }

    const handleHide = () => {
      if (!closeOnOutsideClick && !intentionalDismissRef.current) {
        // Outside click / host dismiss — keep the dialog open without waiting a tick
        // (reduces close-then-reopen flicker).
        element.showOverlay?.();
        return;
      }
      intentionalDismissRef.current = false;
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
      window.clearTimeout(fallbackTimer.current);
    };
  }, [open, element, closeOnOutsideClick]);

  const dismiss = useCallback(() => {
    intentionalDismissRef.current = true;
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
  }, [element]);

  return { id, ref, dismiss };
}

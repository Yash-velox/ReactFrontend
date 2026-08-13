import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

type OverlayElement = HTMLElement & {
  showOverlay?: () => void;
  hideOverlay?: () => void;
};

const HOST_DISMISS_TIMEOUT_MS = 350;

export type UseModalOverlayOptions = {
  /**
   * When false, backdrop / host-initiated hide is ignored and the modal is
   * shown again. Only an explicit `dismiss()` call (Cancel) or unmount closes it.
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
    const handleHide = () => {
      if (!closeOnOutsideClick && !intentionalDismissRef.current) {
        // Outside click / Esc from host — keep the dialog open.
        queueMicrotask(() => {
          if (!cancelled) element.showOverlay?.();
        });
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

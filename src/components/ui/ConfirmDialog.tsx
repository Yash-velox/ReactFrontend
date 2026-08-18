import type { ReactNode } from "react";
import { useModalOverlay } from "./useModalOverlay";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Button label while `busy` is true. */
  busyLabel?: string;
  tone?: "critical" | "auto";
  busy?: boolean;
  /** Disable confirm without showing the loading state (e.g. checkbox not checked). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busyLabel = "Working…",
  tone = "auto",
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: Props) {
  const { id: modalId, ref: modalRef, dismiss } = useModalOverlay(open, onCancel);

  if (!open) return null;

  return (
    <s-modal id={modalId} ref={modalRef} heading={title}>
      <s-stack direction="block" gap="base">
        <s-paragraph>{message}</s-paragraph>
        {children ? <div>{children}</div> : null}
        {busy ? (
          <div className="aone-inline-loader" role="status" aria-live="polite">
            <div className="aone-spinner" aria-hidden="true" />
            <span>{busyLabel}</span>
          </div>
        ) : null}
        <div className="aone-toolbar">
          <s-button onClick={dismiss} disabled={busy}>
            {cancelLabel}
          </s-button>
          <s-button
            variant="primary"
            tone={tone === "critical" ? "critical" : undefined}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? busyLabel : confirmLabel}
          </s-button>
        </div>
      </s-stack>
    </s-modal>
  );
}

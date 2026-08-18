import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  /** When true, Close / X are disabled (e.g. while saving). */
  busy?: boolean;
  children?: ReactNode;
};

/**
 * In-app dialog that is not App Bridge `s-modal`.
 * Outside click and Escape do not close it - only the X or an explicit
 * `onClose` from a Close/Cancel button inside `children` / header.
 */
export default function LockedDialog({ open, title, onClose, busy = false, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="aone-locked-dialog-root" role="presentation">
      {/* Backdrop: visual only - no click handler, so outside click does nothing */}
      <div className="aone-locked-dialog-backdrop" aria-hidden="true" />
      <div
        className="aone-locked-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="aone-locked-dialog-header">
          <h2 className="aone-locked-dialog-title">{title}</h2>
          <button
            type="button"
            className="aone-locked-dialog-close"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="aone-locked-dialog-body">{children}</div>
      </div>
    </div>
  );
}

import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  label: string;
  detail?: string;
};

export default function LoadingOverlay({ open, label, detail }: Props) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="aone-loading-overlay"
      role="alertdialog"
      aria-busy="true"
      aria-live="polite"
      aria-modal="true"
      aria-label={label}
    >
      <div className="aone-loading-card">
        <div className="aone-spinner" aria-hidden="true" />
        <p className="aone-loading-label">{label}</p>
        {detail ? <p className="aone-loading-detail">{detail}</p> : null}
      </div>
    </div>,
    document.body,
  );
}

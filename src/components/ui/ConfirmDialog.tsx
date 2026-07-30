import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "critical" | "auto";
  busy?: boolean;
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
  tone = "auto",
  busy = false,
  onConfirm,
  onCancel,
  children,
}: Props) {
  if (!open) return null;

  return (
    <s-modal heading={title}>
      <s-stack direction="block" gap="base">
        <s-paragraph>{message}</s-paragraph>
        {children ? <div>{children}</div> : null}
        <div className="aone-toolbar">
          <s-button onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </s-button>
          <s-button
            variant="primary"
            tone={tone === "critical" ? "critical" : undefined}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </s-button>
        </div>
      </s-stack>
    </s-modal>
  );
}

import type { ReactNode } from "react";
import { useModalOverlay } from "./useModalOverlay";

export type RowDetailField = {
  label: string;
  value: ReactNode;
};

type Props = {
  open: boolean;
  title: string;
  fields: RowDetailField[];
  onClose: () => void;
};

/** Read-only modal that shows every field for a truncated table row. */
export default function RowDetailDialog({ open, title, fields, onClose }: Props) {
  const { id: modalId, ref: modalRef, dismiss } = useModalOverlay(open, onClose);

  if (!open) return null;

  return (
    <s-modal id={modalId} ref={modalRef} heading={title}>
      <s-stack direction="block" gap="base">
        <dl className="aone-row-detail">
          {fields.map((field) => (
            <div key={field.label} className="aone-row-detail-item">
              <dt className="aone-row-detail-label">{field.label}</dt>
              <dd className="aone-row-detail-value">{field.value ?? "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="aone-toolbar">
          <s-button variant="primary" onClick={dismiss}>
            Close
          </s-button>
        </div>
      </s-stack>
    </s-modal>
  );
}

/** Display helper for empty / null modal values. */
export function detailText(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

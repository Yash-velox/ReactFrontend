import type { ReactNode } from "react";
import LockedDialog from "./LockedDialog";

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

/** Read-only dialog that shows every field for a truncated table row. */
export default function RowDetailDialog({ open, title, fields, onClose }: Props) {
  return (
    <LockedDialog open={open} title={title} onClose={onClose}>
      <dl className="aone-row-detail">
        {fields.map((field) => (
          <div key={field.label} className="aone-row-detail-item">
            <dt className="aone-row-detail-label">{field.label}</dt>
            <dd className="aone-row-detail-value">{field.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="aone-toolbar" style={{ marginTop: "var(--aone-space-4)" }}>
        <s-button variant="primary" onClick={onClose}>
          Close
        </s-button>
      </div>
    </LockedDialog>
  );
}

/** Display helper for empty / null modal values. */
export function detailText(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  caption?: string;
};

export default function DataTable({ children, caption }: Props) {
  return (
    <div className="aone-table-wrap">
      <table className="aone-table">
        {caption ? <caption className="aone-field-hint">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

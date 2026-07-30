import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export default function EmptyState({ title, description, action }: Props) {
  return (
    <div className="aone-empty">
      <p className="aone-empty-title">{title}</p>
      {description ? <p className="aone-empty-description">{description}</p> : null}
      {action}
    </div>
  );
}

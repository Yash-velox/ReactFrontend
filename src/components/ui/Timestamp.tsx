import { formatWhen, formatWhenFull } from "../../utils/format";

type Props = {
  value?: string | null;
  className?: string;
};

/**
 * Local-timezone smart date: relative / Today / date-only, with full date+time on hover.
 */
export default function Timestamp({ value, className }: Props) {
  const display = formatWhen(value);
  if (!value || display === "-") {
    return <span className={className}>-</span>;
  }

  const full = formatWhenFull(value);
  return (
    <span className={className} title={full || undefined}>
      {display}
    </span>
  );
}

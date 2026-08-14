import { toTitleCase } from "../../utils/format";
import { type BadgeTone, MetricToneBadge } from "./StatusBadge";

type Props = {
  label: string;
  value: string | number;
  /** Native tooltip for the value (e.g. full timestamp on hover). */
  valueTitle?: string;
  /** Optional status badge paired with metric — never color-only value */
  badgeTone?: BadgeTone;
  badgeLabel?: string;
  loading?: boolean;
};

export default function MetricCard({
  label,
  value,
  valueTitle,
  badgeTone,
  badgeLabel,
  loading,
}: Props) {
  if (loading) {
    return (
      <div className="aone-metric" aria-hidden="true">
        <div className="aone-skeleton aone-skeleton-line aone-skeleton-line-short" />
        <div className="aone-skeleton aone-skeleton-line" style={{ height: 28, width: "40%" }} />
      </div>
    );
  }

  return (
    <div className="aone-metric">
      <p className="aone-metric-label">{toTitleCase(label)}</p>
      <p className="aone-metric-value" title={valueTitle}>
        {value}
      </p>
      {badgeTone && badgeLabel ? (
        <div className="aone-metric-footer">
          <MetricToneBadge tone={badgeTone} label={toTitleCase(badgeLabel)} />
        </div>
      ) : null}
    </div>
  );
}

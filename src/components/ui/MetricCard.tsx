import { toTitleCase } from "../../utils/format";
import { type BadgeTone, MetricToneBadge } from "./StatusBadge";

type Props = {
  label: string;
  value: string | number;
  /** Native tooltip for the value (e.g. full timestamp on hover). */
  valueTitle?: string;
  /** Explains what the card counts. Shown on hover. */
  hint?: string;
  /** Optional status badge paired with metric — never color-only value */
  badgeTone?: BadgeTone;
  badgeLabel?: string;
  loading?: boolean;
};

function InfoMark() {
  return (
    <span className="aone-metric-info" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.25" />
        <path
          d="M8 7.15v3.4M8 5.35v.01"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export default function MetricCard({
  label,
  value,
  valueTitle,
  hint,
  badgeTone,
  badgeLabel,
  loading,
}: Props) {
  const displayLabel = toTitleCase(label);

  if (loading) {
    return (
      <div className="aone-metric" aria-hidden="true">
        <div className="aone-skeleton aone-skeleton-line aone-skeleton-line-short" />
        <div className="aone-skeleton aone-skeleton-line" style={{ height: 28, width: "40%" }} />
      </div>
    );
  }

  return (
    <div
      className={hint ? "aone-metric has-hint" : "aone-metric"}
      aria-label={hint ? `${displayLabel}. ${hint}` : undefined}
      tabIndex={hint ? 0 : undefined}
    >
      <p className="aone-metric-label">
        <span>{displayLabel}</span>
        {hint ? <InfoMark /> : null}
        {hint ? (
          <span className="aone-metric-tooltip" role="tooltip">
            {hint}
          </span>
        ) : null}
      </p>
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

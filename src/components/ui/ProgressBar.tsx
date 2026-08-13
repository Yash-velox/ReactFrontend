type Props = {
  label: string;
  detail?: string;
  /** 0–100 for a filling bar. Omit (or null) for an indeterminate animated bar. */
  value?: number | null;
};

export default function ProgressBar({ label, detail, value }: Props) {
  const indeterminate = value == null || Number.isNaN(value);
  const clamped = indeterminate ? 0 : Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className="aone-progress" role="status" aria-live="polite">
      <div className="aone-progress-header">
        <span className="aone-progress-label">{label}</span>
        {detail ? <span className="aone-progress-detail">{detail}</span> : null}
      </div>
      <div
        className={`aone-progress-track${indeterminate ? " is-indeterminate" : ""}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(indeterminate ? {} : { "aria-valuenow": clamped })}
      >
        <div
          className="aone-progress-fill"
          style={indeterminate ? undefined : { width: `${clamped}%` }}
        />
      </div>
      {!indeterminate ? (
        <span className="aone-progress-pct">{clamped}%</span>
      ) : null}
    </div>
  );
}

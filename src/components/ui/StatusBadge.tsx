export type BadgeTone = "success" | "critical" | "caution" | "info" | "neutral";

type StatusConfig = {
  tone: BadgeTone;
  label: string;
};

const STATUS_MAP: Record<string, StatusConfig> = {
  // Sync
  RUNNING: { tone: "info", label: "Running" },
  COMPLETED: { tone: "success", label: "Completed" },
  FAILED: { tone: "critical", label: "Failed" },
  PENDING: { tone: "caution", label: "Pending" },
  CANCELLED: { tone: "neutral", label: "Cancelled" },

  // Prompt management
  ENABLED: { tone: "success", label: "Enabled" },
  DISABLED: { tone: "neutral", label: "Disabled" },
  NOT_CONFIGURED: { tone: "caution", label: "Not Configured" },
  NOT_READY: { tone: "caution", label: "Not Ready" },
  SHOPIFY: { tone: "info", label: "Shopify" },
  SYSTEM: { tone: "success", label: "Central" },

  // Secondary queue
  CLAIMED: { tone: "info", label: "Claimed" },
  CONVERTED: { tone: "success", label: "Converted" },
  SKIPPED_NO_ELIGIBLE_IMAGE_DELTA: { tone: "neutral", label: "Skipped" },
  FAILED_CONVERSION: { tone: "critical", label: "Failed" },

  // Batches
  QUEUED: { tone: "caution", label: "Queued" },
  PROCESSING: { tone: "info", label: "Processing" },
  PARTIALLY_COMPLETED: { tone: "caution", label: "Partial" },
  RETRYING: { tone: "caution", label: "Retrying" },

  // Batch products / images
  SKIPPED: { tone: "neutral", label: "Skipped" },
  DOWNLOADING: { tone: "info", label: "Downloading" },
  WAITING_FOR_PROVIDER: { tone: "info", label: "Waiting" },

  // Delta
  INITIAL: { tone: "info", label: "Initial" },
  NEW: { tone: "success", label: "New" },
  REPLACED: { tone: "caution", label: "Replaced" },

  // Triggers
  MANUAL: { tone: "info", label: "Manual" },
  AUTOMATIC: { tone: "neutral", label: "Automatic" },
  RETRY: { tone: "caution", label: "Retry" },

  // Product media rollback
  ROLLING_BACK: { tone: "info", label: "Rolling back" },
  ROLLED_BACK: { tone: "success", label: "Rolled back" },
  ROLLBACK_CONFLICT: { tone: "caution", label: "Conflict" },
  ROLLBACK_FAILED: { tone: "critical", label: "Failed" },
  RESTORE_FAILED: { tone: "critical", label: "Restore failed" },
};

function humanizeStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getStatusConfig(status: string): StatusConfig {
  const key = status.toUpperCase();
  return STATUS_MAP[key] ?? { tone: "neutral", label: humanizeStatus(status) };
}

type Props = {
  status: string;
  /** Show raw enum in the HTML tooltip (do not name this `title` — it can leak onto host elements). */
  showTooltip?: boolean;
};

export default function StatusBadge({ status, showTooltip = true }: Props) {
  const config = getStatusConfig(status);
  const badge = <s-badge tone={config.tone}>{config.label}</s-badge>;
  if (showTooltip && status !== config.label) {
    return <span title={status}>{badge}</span>;
  }
  return badge;
}

export function MetricToneBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  return <s-badge tone={tone}>{label}</s-badge>;
}

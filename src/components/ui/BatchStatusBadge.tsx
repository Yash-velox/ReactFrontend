import { getStatusConfig, type BadgeTone } from "./StatusBadge";

type StatusConfig = {
  tone: BadgeTone;
  label: string;
};

/** Human labels while top-level batch status stays PROCESSING (OpenAI Batch path). */
const PROCESSING_PHASE_MAP: Record<string, StatusConfig> = {
  PREPARING_OPENAI_STAGE: { tone: "info", label: "Preparing AI job" },
  UPLOADING_BATCH_INPUT: { tone: "info", label: "Uploading to AI" },
  OPENAI_BATCH_SUBMITTED: { tone: "info", label: "AI job submitted" },
  WAITING_FOR_OPENAI: { tone: "info", label: "Enhancing image" },
  COLLECTING_OPENAI_RESULTS: { tone: "info", label: "Collecting AI results" },
  IMPORTING_STAGE_RESULTS: { tone: "info", label: "Importing results" },
  RETRYING_FAILED_REQUESTS: { tone: "caution", label: "Retrying AI requests" },
  PREPARING_NEXT_STAGE: { tone: "info", label: "Preparing next step" },
  AI_WORKFLOW_COMPLETE: { tone: "info", label: "AI complete" },
  UPLOADING_TO_SHOPIFY_FILES: { tone: "info", label: "Uploading to Shopify" },
  READY_TO_PUBLISH: { tone: "success", label: "Ready to publish" },
};

export function getBatchStatusDisplay(
  status: string,
  processingPhase?: string | null,
): StatusConfig {
  if (status.toUpperCase() === "PROCESSING" && processingPhase) {
    const phaseKey = processingPhase.toUpperCase();
    return (
      PROCESSING_PHASE_MAP[phaseKey] ?? {
        tone: "info",
        label: processingPhase
          .toLowerCase()
          .split("_")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" "),
      }
    );
  }
  return getStatusConfig(status);
}

type Props = {
  status: string;
  processingPhase?: string | null;
  showTooltip?: boolean;
};

/** Batch row/detail badge: shows processing phase (e.g. Enhancing image) instead of generic Processing. */
export default function BatchStatusBadge({ status, processingPhase, showTooltip = true }: Props) {
  const config = getBatchStatusDisplay(status, processingPhase);
  const badge = <s-badge tone={config.tone}>{config.label}</s-badge>;
  if (!showTooltip) {
    return badge;
  }
  const tooltipParts = [status];
  if (processingPhase && status.toUpperCase() === "PROCESSING") {
    tooltipParts.push(processingPhase);
  }
  const tooltip = tooltipParts.join(" · ");
  if (tooltip !== config.label) {
    return <span title={tooltip}>{badge}</span>;
  }
  return badge;
}

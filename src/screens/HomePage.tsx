import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GettingStartedStepper, {
  type SetupStep,
  type SetupStepStatus,
} from "../components/ui/GettingStartedStepper";
import AonePage from "../components/ui/AonePage";
import MetricCard from "../components/ui/MetricCard";
import PageSkeleton from "../components/ui/PageSkeleton";
import { getStatusConfig } from "../components/ui/StatusBadge";
import { endpoints, tunnelBypassHeaders } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
import type { PromptProductTypeListItem } from "../types/prompts";
import type { BatchSummary, SecondaryQueueSummary, SyncStatus } from "../types/week2";
import { parseApiResponse } from "../utils/api";

type HealthState = "checking" | "ok" | "down";

type DashboardData = {
  syncStatus: SyncStatus;
  secondarySummary: SecondaryQueueSummary;
  batchSummary: BatchSummary;
  hasEnabledPrompt: boolean;
  hasPublishedVersions: boolean;
};

function stepStatuses(flags: boolean[]): SetupStepStatus[] {
  const firstIncomplete = flags.findIndex((done) => !done);
  return flags.map((done, index) => {
    if (done) return "complete";
    if (firstIncomplete === index) return "current";
    return "upcoming";
  });
}

export default function HomePage() {
  const authenticatedFetch = useAuthenticatedFetch();
  const [health, setHealth] = useState<HealthState>("checking");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const pollInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      try {
        const res = await fetch(endpoints.health, { headers: tunnelBypassHeaders });
        if (!cancelled) setHealth(res.ok ? "ok" : "down");
      } catch {
        if (!cancelled) setHealth("down");
      }
    };

    void ping();
    const id = window.setInterval(ping, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (pollInFlight.current) return;
    pollInFlight.current = true;
    try {
      const [syncRes, secondaryRes, batchSummaryRes] = await Promise.all([
        authenticatedFetch(endpoints.syncStatus),
        authenticatedFetch(endpoints.secondaryQueueSummary),
        authenticatedFetch(endpoints.batchesSummary),
      ]);
      const syncStatus = await parseApiResponse<SyncStatus>(syncRes);
      const secondarySummary = await parseApiResponse<SecondaryQueueSummary>(secondaryRes);
      const batchSummary = await parseApiResponse<BatchSummary>(batchSummaryRes);

      const [promptsResult, versionsResult] = await Promise.allSettled([
        authenticatedFetch(`${endpoints.promptProductTypes}?page=1&pageSize=100`).then((res) =>
          parseApiResponse<{ items: PromptProductTypeListItem[] }>(res),
        ),
        authenticatedFetch(`${endpoints.productsWithMediaVersions}?limit=1`).then((res) =>
          parseApiResponse<{ items: unknown[]; count?: number }>(res),
        ),
      ]);

      let hasEnabledPrompt = false;
      let hasPublishedVersions = false;
      if (promptsResult.status === "fulfilled") {
        hasEnabledPrompt = (promptsResult.value.items ?? []).some(
          (item) => item.status === "ENABLED" && item.enabledStepCount > 0,
        );
      }
      if (versionsResult.status === "fulfilled") {
        const versionsPayload = versionsResult.value;
        hasPublishedVersions = (versionsPayload.items?.length ?? versionsPayload.count ?? 0) > 0;
      }

      setData({
        syncStatus,
        secondarySummary,
        batchSummary,
        hasEnabledPrompt,
        hasPublishedVersions,
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      pollInFlight.current = false;
      setLoading(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasActiveWork =
    Boolean(data?.secondarySummary.pending) ||
    Boolean(data?.secondarySummary.claimed) ||
    Boolean(data?.batchSummary.activeBatchCount);

  useEffect(() => {
    if (!hasActiveWork) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [hasActiveWork, refresh]);

  const healthTone = health === "ok" ? "success" : health === "down" ? "critical" : "caution";
  const healthLabel =
    health === "checking" ? "Checking…" : health === "ok" ? "Online" : "Offline";

  const activeBatches = data?.batchSummary.activeBatchCount ?? 0;
  const completedProducts = data?.batchSummary.completedProductCount ?? 0;
  const latestSync = data?.syncStatus.latestRun;
  const syncConfig = latestSync ? getStatusConfig(latestSync.status) : null;

  const setupSteps: SetupStep[] = useMemo(() => {
    const connected = health === "ok";
    const synced = (data?.syncStatus.productCount ?? 0) > 0;
    const promptsReady = Boolean(data?.hasEnabledPrompt);
    const processed =
      (data?.batchSummary.completedProductCount ?? 0) > 0 ||
      (data?.batchSummary.activeBatchCount ?? 0) > 0;
    const published = Boolean(data?.hasPublishedVersions);

    const flags = [connected, synced, promptsReady, processed, published];
    const statuses = stepStatuses(flags);

    const defs: Omit<SetupStep, "status">[] = [
      {
        id: "connect",
        label: "Connect",
        hint: connected ? "Service connected" : "Waiting for service",
      },
      {
        id: "sync",
        label: "Sync",
        hint: "Import products",
        href: "/products",
      },
      {
        id: "prompts",
        label: "Prompts",
        hint: "Configure AI",
        href: "/prompts",
      },
      {
        id: "process",
        label: "Process",
        hint: "Run a job",
        href: "/jobs",
      },
      {
        id: "publish",
        label: "Publish",
        hint: "Send to Shopify",
        href: "/jobs",
      },
    ];

    return defs.map((def, index) => ({
      ...def,
      status: statuses[index] ?? "upcoming",
      hint:
        statuses[index] === "complete"
          ? def.id === "connect"
            ? "Service connected"
            : def.id === "sync"
              ? "Catalog synced"
              : def.id === "prompts"
                ? "Prompts configured"
                : def.id === "process"
                  ? "Processing started"
                  : "Versions ready"
          : def.hint,
    }));
  }, [health, data]);

  return (
    <AonePage heading="Dashboard">
      <s-section heading="Getting started">
        <div className="aone-stepper-status-row">
          <s-text>Service</s-text>
          <s-badge tone={healthTone}>{healthLabel}</s-badge>
        </div>
        <GettingStartedStepper steps={setupSteps} loading={loading && !data} />
        {error ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text tone="critical">{error}</s-text>
          </s-box>
        ) : null}
      </s-section>

      <s-section heading="At a glance">
        {loading ? (
          <PageSkeleton metricCount={4} tableRows={0} />
        ) : (
          <div className="aone-metrics">
            <MetricCard
              label="Products Synced"
              value={data?.syncStatus.productCount ?? 0}
              badgeTone={syncConfig?.tone}
              badgeLabel={syncConfig ? `Sync ${syncConfig.label.toLowerCase()}` : undefined}
            />
            <MetricCard
              label="Secondary Queue Pending"
              value={data?.secondarySummary.pending ?? 0}
              badgeTone={data?.secondarySummary.pending ? "caution" : "neutral"}
              badgeLabel={data?.secondarySummary.pending ? "Awaiting conversion" : "Clear"}
            />
            <MetricCard
              label="Active Batches"
              value={activeBatches}
              badgeTone={activeBatches ? "info" : "neutral"}
              badgeLabel={activeBatches ? "Processing" : "Idle"}
            />
            <MetricCard label="Products Processed" value={completedProducts} />
          </div>
        )}
      </s-section>
    </AonePage>
  );
}

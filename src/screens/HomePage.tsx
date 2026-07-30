import { useCallback, useEffect, useRef, useState } from "react";
import MetricCard from "../components/ui/MetricCard";
import PageSkeleton from "../components/ui/PageSkeleton";
import { getStatusConfig } from "../components/ui/StatusBadge";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
import type { Batch, SecondaryQueueSummary, SyncStatus } from "../types/week2";
import { parseApiResponse } from "../utils/api";
import { appPath } from "../utils/routes";

type HealthState = "checking" | "ok" | "down";

type DashboardData = {
  syncStatus: SyncStatus;
  secondarySummary: SecondaryQueueSummary;
  batches: Batch[];
};

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
        const res = await fetch(endpoints.health);
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
      const [syncRes, secondaryRes, batchesRes] = await Promise.all([
        authenticatedFetch(endpoints.syncStatus),
        authenticatedFetch(endpoints.secondaryQueueSummary),
        authenticatedFetch(`${endpoints.batchesList}?page=1&pageSize=50`),
      ]);
      const syncStatus = await parseApiResponse<SyncStatus>(syncRes);
      const secondarySummary = await parseApiResponse<SecondaryQueueSummary>(secondaryRes);
      const batchesPayload = await parseApiResponse<{ items: Batch[] }>(batchesRes);
      setData({
        syncStatus,
        secondarySummary,
        batches: batchesPayload.items ?? [],
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
    Boolean(data?.batches.some((b) => b.status === "PROCESSING" || b.status === "QUEUED"));

  useEffect(() => {
    if (!hasActiveWork) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [hasActiveWork, refresh]);

  const healthTone = health === "ok" ? "success" : health === "down" ? "critical" : "caution";
  const healthLabel =
    health === "checking" ? "Checking…" : health === "ok" ? "Connected" : "Unreachable";

  const activeBatches = data?.batches.filter((b) => b.status === "PROCESSING" || b.status === "QUEUED").length ?? 0;
  const completedImages =
    data?.batches.reduce((sum, b) => sum + b.completedProductCount, 0) ?? 0;
  const latestSync = data?.syncStatus.latestRun;
  const syncConfig = latestSync ? getStatusConfig(latestSync.status) : null;

  return (
    <s-page heading="Dashboard">
      <s-section heading="Overview">
        <s-paragraph>
          Monitor catalog sync, Secondary Queue intake, and image processing batches for your store.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-text>Backend</s-text>
          <s-badge tone={healthTone}>{healthLabel}</s-badge>
        </s-stack>
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
              label="Products synced"
              value={data?.syncStatus.productCount ?? 0}
              badgeTone={syncConfig?.tone}
              badgeLabel={syncConfig ? `Sync ${syncConfig.label.toLowerCase()}` : undefined}
            />
            <MetricCard
              label="Secondary queue pending"
              value={data?.secondarySummary.pending ?? 0}
              badgeTone={data?.secondarySummary.pending ? "caution" : "neutral"}
              badgeLabel={data?.secondarySummary.pending ? "Awaiting conversion" : "Clear"}
            />
            <MetricCard
              label="Active batches"
              value={activeBatches}
              badgeTone={activeBatches ? "info" : "neutral"}
              badgeLabel={activeBatches ? "Processing" : "Idle"}
            />
            <MetricCard
              label="Products completed"
              value={completedImages}
            />
          </div>
        )}
      </s-section>

      <s-section heading="Quick actions">
        <s-paragraph>Jump to common workflows without leaving the admin.</s-paragraph>
        <div className="aone-toolbar">
          <s-button variant="primary" href={appPath("/products")}>
            Sync products
          </s-button>
          <s-button href={appPath("/jobs")}>Create batch</s-button>
          <s-button href={appPath("/settings")}>Settings</s-button>
          <s-button href={`${appPath("/jobs")}#secondary-queue`}>View secondary queue</s-button>
        </div>
      </s-section>
    </s-page>
  );
}

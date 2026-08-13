import { useCallback, useEffect, useRef, useState } from "react";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import ErrorBanner from "../components/ui/ErrorBanner";
import MetricCard from "../components/ui/MetricCard";
import PageSkeleton from "../components/ui/PageSkeleton";
import ProgressBar from "../components/ui/ProgressBar";
import RowDetailDialog, { detailText } from "../components/ui/RowDetailDialog";
import StatusBadge, { getStatusConfig } from "../components/ui/StatusBadge";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
import type { SyncRun, SyncStatus } from "../types/week2";
import Timestamp from "../components/ui/Timestamp";
import { parseApiResponse } from "../utils/api";
import { formatWhen, formatWhenFull } from "../utils/format";

export default function ProductsPage() {
  const authenticatedFetch = useAuthenticatedFetch();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<SyncRun | null>(null);
  const pollInFlight = useRef(false);
  /** Catalog size when sync became busy — used for % when re-syncing a known catalog. */
  const [syncBaseline, setSyncBaseline] = useState<number | null>(null);

  const refresh = useCallback(
    async (opts?: { force?: boolean }) => {
      // Background polls skip if a fetch is already running; manual Refresh always runs.
      if (pollInFlight.current && !opts?.force) return;
      pollInFlight.current = true;
      if (opts?.force) setRefreshing(true);
      try {
        const [statusRes, runsRes] = await Promise.all([
          authenticatedFetch(endpoints.syncStatus),
          authenticatedFetch(`${endpoints.syncRuns}?limit=20`),
        ]);
        const statusData = await parseApiResponse<SyncStatus>(statusRes);
        const runsData = await parseApiResponse<{ items: SyncRun[] }>(runsRes);
        setStatus(statusData);
        setRuns(runsData.items ?? []);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sync data");
      } finally {
        pollInFlight.current = false;
        setRefreshing(false);
        setLoading(false);
      }
    },
    [authenticatedFetch],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isSyncActive =
    status?.latestRun?.status === "RUNNING" || status?.latestRun?.status === "PENDING";
  const showSyncBusy = syncing || isSyncActive;

  // Snapshot catalog size once when sync starts. Re-sync (>0) → determinate %.
  // First sync (0) → indeterminate bar + live counters only.
  useEffect(() => {
    if (!showSyncBusy) {
      setSyncBaseline(null);
      return;
    }
    setSyncBaseline((prev) => (prev === null ? (status?.productCount ?? 0) : prev));
  }, [showSyncBusy, status?.productCount]);

  // Poll while the Sync POST is in flight or the latest run is still active,
  // so counters update even before the Sync request returns.
  useEffect(() => {
    if (!showSyncBusy) return;
    void refresh({ force: true });
    const timer = window.setInterval(() => {
      void refresh();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [showSyncBusy, refresh]);

  const syncCatalog = async () => {
    // Capture baseline before POST so re-sync % uses the pre-sync catalog size.
    setSyncBaseline(status?.productCount ?? 0);
    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const response = await authenticatedFetch(endpoints.syncCatalog, { method: "POST" });
      const run = await parseApiResponse<SyncRun>(response);
      setMessage(
        run.status === "COMPLETED"
          ? `Sync completed - ${run.productsSynced} products, ${run.mediaSynced} media items.`
          : `Sync finished with status ${run.status}.`,
      );
      await refresh({ force: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Catalog sync failed");
      await refresh({ force: true });
    } finally {
      setSyncing(false);
    }
  };

  const latest = status?.latestRun;
  const latestConfig = latest ? getStatusConfig(latest.status) : null;
  const liveProducts = showSyncBusy ? (latest?.productsSynced ?? 0) : 0;
  const liveMedia = showSyncBusy ? (latest?.mediaSynced ?? 0) : 0;
  const baseline = syncBaseline ?? 0;
  const progressValue =
    showSyncBusy && baseline > 0
      ? Math.min(95, Math.round((liveProducts / Math.max(baseline, liveProducts, 1)) * 100))
      : null;

  return (
    <s-page inline-size="large" heading="Products">
      <s-section heading="Catalog sync">
        <s-paragraph>
          Update your product list and image details from Shopify. Photos stay in your store — this
          only refreshes the information used for processing.
        </s-paragraph>
      </s-section>

      {error ? (
        <s-section>
          <ErrorBanner message={error} onRetry={() => void refresh({ force: true })} />
        </s-section>
      ) : null}

      {message ? (
        <s-section>
          <s-banner tone="success" heading="Sync update">
            <s-paragraph>{message}</s-paragraph>
          </s-banner>
        </s-section>
      ) : null}

      <s-section heading="Sync status">
        {loading ? (
          <PageSkeleton metricCount={3} tableRows={0} />
        ) : (
          <s-stack direction="block" gap="base">
            <div className="aone-metrics">
              <MetricCard
                label="Products in catalog"
                value={status?.productCount ?? 0}
              />
              <MetricCard
                label="Active media"
                value={status?.activeMediaCount ?? 0}
              />
              <MetricCard
                label="Latest run"
                value={latest ? formatWhen(latest.completedAt ?? latest.startedAt) : "-"}
                valueTitle={
                  latest
                    ? formatWhenFull(latest.completedAt ?? latest.startedAt) || undefined
                    : undefined
                }
                badgeTone={latestConfig?.tone}
                badgeLabel={latestConfig?.label}
              />
            </div>

            {showSyncBusy ? (
              <ProgressBar
                label="Syncing catalog…"
                detail={`${liveProducts} products · ${liveMedia} media so far`}
                value={progressValue}
              />
            ) : null}

            {latest ? (
              <div className="aone-stat-grid">
                <div className="aone-stat">
                  <span className="aone-stat-label">Products synced</span>
                  <span className="aone-stat-value">{latest.productsSynced}</span>
                </div>
                <div className="aone-stat">
                  <span className="aone-stat-label">Media synced</span>
                  <span className="aone-stat-value">{latest.mediaSynced}</span>
                </div>
                <div className="aone-stat">
                  <span className="aone-stat-label">Run type</span>
                  <span className="aone-stat-value">{latest.runType}</span>
                </div>
                {latest.errorMessage ? (
                  <div className="aone-stat" style={{ gridColumn: "1 / -1" }}>
                    <span className="aone-stat-label">Error</span>
                    <s-text tone="critical">{latest.errorMessage}</s-text>
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title="No sync jobs yet"
                description="Run your first catalog sync to load product and image details from Shopify."
              />
            )}

            <div className="aone-toolbar">
              <s-button variant="primary" onClick={() => void syncCatalog()} disabled={showSyncBusy}>
                {showSyncBusy ? "Sync in progress" : "Sync products"}
              </s-button>
              <s-button onClick={() => void refresh({ force: true })}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </s-button>
            </div>
          </s-stack>
        )}
      </s-section>

      <s-section heading="Recent sync jobs">
        {loading ? (
          <PageSkeleton metricCount={0} tableRows={4} />
        ) : runs.length === 0 ? (
          <EmptyState
            title="No sync jobs yet"
            description="Sync history will appear here after you run a catalog sync."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Status</th>
                <th>Type</th>
                <th>Products</th>
                <th>Media</th>
                <th>Started</th>
                <th>Completed</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  className="aone-table-row-clickable"
                  onClick={() => setSelectedRun(run)}
                >
                  <td>
                    <StatusBadge status={run.status} />
                  </td>
                  <td>{run.runType}</td>
                  <td>{run.productsSynced}</td>
                  <td>{run.mediaSynced}</td>
                  <td>
                    <Timestamp value={run.startedAt} />
                  </td>
                  <td>
                    <Timestamp value={run.completedAt} />
                  </td>
                  <td className="aone-table-cell-truncate" title={run.errorMessage ?? undefined}>
                    {run.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </s-section>

      <RowDetailDialog
        open={Boolean(selectedRun)}
        title="Sync job details"
        onClose={() => setSelectedRun(null)}
        fields={
          selectedRun
            ? [
                { label: "Status", value: selectedRun.status },
                { label: "Type", value: selectedRun.runType },
                { label: "Products synced", value: selectedRun.productsSynced },
                { label: "Media synced", value: selectedRun.mediaSynced },
                { label: "Cursor", value: detailText(selectedRun.cursor) },
                { label: "Error", value: detailText(selectedRun.errorMessage) },
                { label: "Started", value: detailText(formatWhenFull(selectedRun.startedAt)) },
                { label: "Completed", value: detailText(formatWhenFull(selectedRun.completedAt)) },
                { label: "Created", value: detailText(formatWhenFull(selectedRun.createdAt)) },
                { label: "Updated", value: detailText(formatWhenFull(selectedRun.updatedAt)) },
                { label: "Run ID", value: selectedRun.id },
              ]
            : []
        }
      />
    </s-page>
  );
}

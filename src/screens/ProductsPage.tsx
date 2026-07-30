import { useCallback, useEffect, useRef, useState } from "react";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import ErrorBanner from "../components/ui/ErrorBanner";
import MetricCard from "../components/ui/MetricCard";
import PageSkeleton from "../components/ui/PageSkeleton";
import StatusBadge, { getStatusConfig } from "../components/ui/StatusBadge";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
import type { SyncRun, SyncStatus } from "../types/week2";
import { parseApiResponse } from "../utils/api";
import { formatWhen } from "../utils/format";

export default function ProductsPage() {
  const authenticatedFetch = useAuthenticatedFetch();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const pollInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (pollInFlight.current) return;
    pollInFlight.current = true;
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
      setLoading(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isSyncActive = status?.latestRun?.status === "RUNNING" || status?.latestRun?.status === "PENDING";

  useEffect(() => {
    if (!isSyncActive) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [isSyncActive, refresh]);

  const syncCatalog = async () => {
    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const response = await authenticatedFetch(endpoints.syncCatalog, { method: "POST" });
      const run = await parseApiResponse<SyncRun>(response);
      setMessage(
        run.status === "COMPLETED"
          ? `Sync completed — ${run.productsSynced} products, ${run.mediaSynced} media items.`
          : `Sync finished with status ${run.status}.`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Catalog sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const latest = status?.latestRun;
  const latestConfig = latest ? getStatusConfig(latest.status) : null;

  return (
    <s-page heading="Products">
      <s-section heading="Catalog sync">
        <s-paragraph>
          Sync product and media metadata from Shopify. Image binaries are not downloaded during sync.
        </s-paragraph>
      </s-section>

      {error ? (
        <s-section>
          <ErrorBanner message={error} onRetry={() => void refresh()} />
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
                value={latest ? formatWhen(latest.completedAt ?? latest.startedAt) : "—"}
                badgeTone={latestConfig?.tone}
                badgeLabel={latestConfig?.label}
              />
            </div>

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
                title="No sync runs yet"
                description="Run your first catalog sync to populate local product and media metadata."
              />
            )}

            <div className="aone-toolbar">
              <s-button variant="primary" onClick={() => void syncCatalog()} disabled={syncing || isSyncActive}>
                {syncing || isSyncActive ? "Syncing…" : "Sync products"}
              </s-button>
              <s-button onClick={() => void refresh()} disabled={syncing}>
                Refresh
              </s-button>
            </div>
          </s-stack>
        )}
      </s-section>

      <s-section heading="Recent sync runs">
        {loading ? (
          <PageSkeleton metricCount={0} tableRows={4} />
        ) : runs.length === 0 ? (
          <EmptyState title="No runs recorded" description="Sync history will appear here after the first run." />
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
                <tr key={run.id}>
                  <td>
                    <StatusBadge status={run.status} />
                  </td>
                  <td>{run.runType}</td>
                  <td>{run.productsSynced}</td>
                  <td>{run.mediaSynced}</td>
                  <td>{formatWhen(run.startedAt)}</td>
                  <td>{formatWhen(run.completedAt)}</td>
                  <td className="aone-table-cell-truncate" title={run.errorMessage ?? undefined}>
                    {run.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </s-section>
    </s-page>
  );
}

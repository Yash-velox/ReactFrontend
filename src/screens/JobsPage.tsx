import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import ErrorBanner from "../components/ui/ErrorBanner";
import MetricCard from "../components/ui/MetricCard";
import PageSkeleton from "../components/ui/PageSkeleton";
import ProductPickerDialog from "../components/ui/ProductPickerDialog";
import StatusBadge from "../components/ui/StatusBadge";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
import type { Batch, PaginationMeta, SecondaryQueueItem, SecondaryQueueSummary } from "../types/week2";
import { parseApiResponse } from "../utils/api";
import { formatGid, formatWhen, truncateGid } from "../utils/format";
import { navigateApp } from "../utils/routes";
import { showAppToast } from "../utils/toast";

type PickerProduct = {
  id: string;
  title?: string;
};

const ACTIVE_BATCH_STATUSES = new Set(["QUEUED", "PROCESSING"]);
const PAGE_SIZE = 20;
const DEFAULT_MANUAL_BATCH_LIMIT = 2;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  const n = Math.max(1, size);
  for (let i = 0; i < items.length; i += n) {
    chunks.push(items.slice(i, i + n));
  }
  return chunks;
}

export default function JobsPage() {
  const authenticatedFetch = useAuthenticatedFetch();

  // Secondary queue
  const [secondarySummary, setSecondarySummary] = useState<SecondaryQueueSummary | null>(null);
  const [secondaryItems, setSecondaryItems] = useState<SecondaryQueueItem[]>([]);
  const [secondaryPagination, setSecondaryPagination] = useState<PaginationMeta | null>(null);
  const [secondaryStatusFilter, setSecondaryStatusFilter] = useState("");
  const [secondaryPage, setSecondaryPage] = useState(1);

  // Batches
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchesPagination, setBatchesPagination] = useState<PaginationMeta | null>(null);
  const [batchPage, setBatchPage] = useState(1);

  // Manual batch
  const [pickedProducts, setPickedProducts] = useState<PickerProduct[]>([]);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualBatchLimit, setManualBatchLimit] = useState(DEFAULT_MANUAL_BATCH_LIMIT);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const pollInFlight = useRef(false);
  // Keep latest paging in refs so the poll interval doesn't recreate forever.
  const secondaryPageRef = useRef(secondaryPage);
  const secondaryStatusFilterRef = useRef(secondaryStatusFilter);
  const batchPageRef = useRef(batchPage);
  const lastToastedSecondaryFailedRef = useRef<number | null>(null);
  secondaryPageRef.current = secondaryPage;
  secondaryStatusFilterRef.current = secondaryStatusFilter;
  batchPageRef.current = batchPage;

  const hasActiveWork = useMemo(() => {
    if (!secondarySummary) return false;
    const secondaryActive = secondarySummary.pending > 0 || secondarySummary.claimed > 0;
    const batchesActive = batches.some((b) => ACTIVE_BATCH_STATUSES.has(b.status));
    return secondaryActive || batchesActive;
  }, [secondarySummary, batches]);

  const refresh = useCallback(async () => {
    if (pollInFlight.current) return;
    pollInFlight.current = true;
    const page = secondaryPageRef.current;
    const statusFilter = secondaryStatusFilterRef.current;
    const bPage = batchPageRef.current;
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (statusFilter) params.set("status", statusFilter);

      // Fetch + parse first; only then commit React state. Avoids wiping one list
      // when the other request fails mid-refresh.
      const [summaryRes, listRes, batchesRes] = await Promise.all([
        authenticatedFetch(endpoints.secondaryQueueSummary),
        authenticatedFetch(`${endpoints.secondaryQueueList}?${params}`),
        authenticatedFetch(`${endpoints.batchesList}?page=${bPage}&pageSize=${PAGE_SIZE}`),
      ]);
      const summary = await parseApiResponse<SecondaryQueueSummary>(summaryRes);
      const list = await parseApiResponse<{ items: SecondaryQueueItem[]; pagination: PaginationMeta }>(
        listRes,
      );
      const batchesPayload = await parseApiResponse<{ items: Batch[]; pagination: PaginationMeta }>(
        batchesRes,
      );

      setSecondarySummary(summary);
      setSecondaryItems(list.items ?? []);
      setSecondaryPagination(list.pagination);
      setBatches(batchesPayload.items ?? []);
      setBatchesPagination(batchesPayload.pagination);
      setError("");
    } catch (err) {
      // Keep previous lists on failure so the UI doesn't flash empty.
      setError(err instanceof Error ? err.message : "Failed to refresh monitoring data");
    } finally {
      pollInFlight.current = false;
      setLoading(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    void refresh();
  }, [refresh, secondaryPage, secondaryStatusFilter, batchPage]);

  const loadBatches = useCallback(
    async (page: number) => {
      const response = await authenticatedFetch(
        `${endpoints.batchesList}?page=${page}&pageSize=${PAGE_SIZE}`,
      );
      const payload = await parseApiResponse<{ items: Batch[]; pagination: PaginationMeta }>(response);
      setBatches(payload.items ?? []);
      setBatchesPagination(payload.pagination);
    },
    [authenticatedFetch],
  );

  useEffect(() => {
    if (!hasActiveWork) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasActiveWork, refresh]);

  // Surface Secondary Queue prompt/config failures as a toast (table still shows details).
  useEffect(() => {
    const failed = secondarySummary?.failed ?? 0;
    if (failed <= 0) {
      lastToastedSecondaryFailedRef.current = 0;
      return;
    }
    const previous = lastToastedSecondaryFailedRef.current;
    if (previous === failed) return;
    if (previous === null || failed > previous) {
      showAppToast(
        `${failed} product(s) could not be processed. Check Skip / failure — usually missing Prompt Configuration.`,
        { isError: true, duration: 8000 },
      );
    }
    lastToastedSecondaryFailedRef.current = failed;
  }, [secondarySummary?.failed]);

  const openBatchDetail = (batchId: string) => {
    navigateApp(`/jobs/${batchId}`);
  };

  const openProductPicker = () => {
    setMessage("");
    setError("");
    setPickerOpen(true);
  };

  const createManualBatch = async () => {
    if (!pickedProducts.length || creatingBatch) return;
    setCreatingBatch(true);
    setError("");
    setMessage("");
    try {
      const chunks = chunkArray(pickedProducts, manualBatchLimit);
      const created: Batch[] = [];
      for (const chunk of chunks) {
        const response = await authenticatedFetch(endpoints.batchesManual, {
          method: "POST",
          body: JSON.stringify({ productGids: chunk.map((p) => p.id) }),
        });
        const batch = await parseApiResponse<Batch>(response);
        created.push(batch);
      }
      const totalProducts = created.reduce((sum, b) => sum + b.productCount, 0);
      const totalImages = created.reduce((sum, b) => sum + b.imageCount, 0);
      const last = created[created.length - 1];
      if (created.length === 1) {
        setMessage(
          `Batch created with ${totalProducts} product(s) and ${totalImages} image(s).`,
        );
      } else {
        setMessage(
          `Created ${created.length} batches from ${totalProducts} product(s) (${totalImages} image(s)), split at ${manualBatchLimit} products per batch.`,
        );
      }
      setPickedProducts([]);
      setBatchPage(1);
      await loadBatches(1);
      if (last) openBatchDetail(last.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create batch");
    } finally {
      setCreatingBatch(false);
    }
  };

  return (
    <s-page heading="Jobs">
      <s-section heading="Processing monitor">
        <s-paragraph>
          Create manual batches from Shopify products, monitor webhook-driven Secondary Queue intake, and
          track batch progress. Click a batch row to open its detail page.
        </s-paragraph>
      </s-section>

      {error ? (
        <s-section>
          <ErrorBanner message={error} onRetry={() => void refresh()} />
        </s-section>
      ) : null}

      {message ? (
        <s-section>
          <s-banner tone="success" heading="Update">
            <s-paragraph>{message}</s-paragraph>
          </s-banner>
        </s-section>
      ) : null}

      <s-section heading="Manual batch creation">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Select synced catalog products (search, filter, select all matches), then create one or
            more product-based processing batches. Large selections are split automatically.
          </s-paragraph>

          <div className="aone-toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <s-button variant="primary" onClick={openProductPicker} disabled={creatingBatch}>
              Select products
            </s-button>
            <s-button
              variant="primary"
              onClick={() => void createManualBatch()}
              disabled={creatingBatch || pickedProducts.length === 0}
            >
              {creatingBatch
                ? "Creating…"
                : pickedProducts.length > manualBatchLimit
                  ? `Create ${Math.ceil(pickedProducts.length / manualBatchLimit)} batches`
                  : "Create batch"}
            </s-button>
            {pickedProducts.length > 0 ? (
              <s-badge tone="info">
                {pickedProducts.length} selected
                {pickedProducts.length > manualBatchLimit
                  ? ` · ${Math.ceil(pickedProducts.length / manualBatchLimit)} batches`
                  : ""}
              </s-badge>
            ) : null}
          </div>

          <s-paragraph>
            Products whose product type has no enabled Prompt Configuration are blocked at create time
            with an error — configure prompts first under Prompt Management.
          </s-paragraph>

          {pickedProducts.length > 0 ? (
            <div className="aone-chip-list">
              {pickedProducts.slice(0, 40).map((product) => (
                <span key={product.id} className="aone-chip">
                  {product.title ?? formatGid(product.id)}
                  <button
                    type="button"
                    className="aone-field-hint"
                    aria-label={`Remove ${product.title ?? product.id}`}
                    onClick={() =>
                      setPickedProducts((prev) => prev.filter((p) => p.id !== product.id))
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
              {pickedProducts.length > 40 ? (
                <span className="aone-chip">+{pickedProducts.length - 40} more</span>
              ) : null}
            </div>
          ) : null}
        </s-stack>
      </s-section>

      <ProductPickerDialog
        open={pickerOpen}
        initialSelected={pickedProducts}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(products, limit) => {
          setManualBatchLimit(limit || DEFAULT_MANUAL_BATCH_LIMIT);
          setPickedProducts(products);
          setPickerOpen(false);
          setError("");
        }}
      />

      <div className="aone-jobs-stack">
        <s-section heading="Secondary Queue">
          <div id="secondary-queue" className="aone-section-anchor" />
          {loading && !secondarySummary ? (
            <PageSkeleton metricCount={5} tableRows={4} />
          ) : (
            <s-stack direction="block" gap="base">
              <div className="aone-metrics">
                <MetricCard
                  label="Pending"
                  value={secondarySummary?.pending ?? 0}
                  badgeTone="caution"
                  badgeLabel="Awaiting"
                />
                <MetricCard
                  label="Claimed"
                  value={secondarySummary?.claimed ?? 0}
                  badgeTone="info"
                  badgeLabel="In progress"
                />
                <MetricCard
                  label="Converted"
                  value={secondarySummary?.converted ?? 0}
                  badgeTone="success"
                  badgeLabel="Done"
                />
                <MetricCard
                  label="Skipped"
                  value={secondarySummary?.skipped ?? 0}
                  badgeTone="neutral"
                  badgeLabel="No delta"
                />
                <MetricCard
                  label="Failed"
                  value={secondarySummary?.failed ?? 0}
                  badgeTone="critical"
                  badgeLabel="Errors"
                />
              </div>

              <div className="aone-toolbar aone-toolbar-spread">
                <div className="aone-field-group" style={{ maxWidth: 220 }}>
                  <label className="aone-field-label" htmlFor="sq-status">
                    Status filter
                  </label>
                  <select
                    id="sq-status"
                    className="aone-select"
                    value={secondaryStatusFilter}
                    onChange={(e) => {
                      setSecondaryStatusFilter(e.target.value);
                      setSecondaryPage(1);
                    }}
                  >
                    <option value="">All statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="CLAIMED">Claimed</option>
                    <option value="CONVERTED">Converted</option>
                    <option value="SKIPPED_NO_ELIGIBLE_IMAGE_DELTA">Skipped</option>
                    <option value="FAILED_CONVERSION">Failed</option>
                  </select>
                </div>
              </div>

              {secondaryItems.length === 0 ? (
                <EmptyState
                  title="Secondary Queue is empty"
                  description="Webhook-driven product updates will appear here when eligible changes are received."
                />
              ) : (
                <>
                  <DataTable>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Revision</th>
                        <th>Webhooks</th>
                        <th>First queued</th>
                        <th>Last queued</th>
                        <th>Status</th>
                        <th>Skip / failure</th>
                      </tr>
                    </thead>
                    <tbody>
                      {secondaryItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <s-text type="strong">{formatGid(item.shopifyProductGid)}</s-text>
                            <br />
                            <code className="aone-mono" title={item.shopifyProductGid}>
                              {truncateGid(item.shopifyProductGid)}
                            </code>
                          </td>
                          <td>{item.queueRevision}</td>
                          <td>{item.webhookCount}</td>
                          <td>{formatWhen(item.firstQueuedAt)}</td>
                          <td>{formatWhen(item.lastQueuedAt)}</td>
                          <td>
                            <StatusBadge status={item.status} />
                          </td>
                          <td
                            className="aone-table-cell-truncate"
                            title={item.skipReason ?? item.failureReason ?? undefined}
                          >
                            {item.skipReason ?? item.failureReason ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>

                  {secondaryPagination ? (
                    <div className="aone-pagination">
                      <p className="aone-pagination-meta">
                        Page {secondaryPagination.page} of {secondaryPagination.totalPages || 1} ·{" "}
                        {secondaryPagination.totalItems} items
                      </p>
                      <div className="aone-toolbar">
                        <s-button
                          disabled={secondaryPage <= 1}
                          onClick={() => setSecondaryPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </s-button>
                        <s-button
                          disabled={secondaryPage >= (secondaryPagination.totalPages || 1)}
                          onClick={() => setSecondaryPage((p) => p + 1)}
                        >
                          Next
                        </s-button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </s-stack>
          )}
        </s-section>

        <s-section heading="Batches">
          {loading && batches.length === 0 ? (
            <PageSkeleton metricCount={0} tableRows={4} />
          ) : batches.length === 0 ? (
            <EmptyState
              title="No batches yet"
              description="Create a manual batch above or enable Auto Sync in Settings to process Secondary Queue items."
            />
          ) : (
            <>
              <DataTable>
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th>Products</th>
                    <th>Images</th>
                    <th>Completed</th>
                    <th>Failed</th>
                    <th>Retrying</th>
                    <th>Created</th>
                    <th>Completed at</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr
                      key={batch.id}
                      className="aone-table-row-clickable"
                      onClick={() => openBatchDetail(batch.id)}
                    >
                      <td>
                        <code className="aone-mono">{batch.id.slice(0, 8)}</code>
                      </td>
                      <td>
                        <StatusBadge status={batch.triggerType} />
                      </td>
                      <td>
                        <div className="aone-batch-status-cell">
                          <StatusBadge status={batch.status} />
                        </div>
                      </td>
                      <td>{batch.productCount}</td>
                      <td>{batch.imageCount}</td>
                      <td>{batch.completedProductCount}</td>
                      <td>{batch.failedProductCount}</td>
                      <td>{batch.retryingProductCount}</td>
                      <td>{formatWhen(batch.createdAt)}</td>
                      <td>{formatWhen(batch.completedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>

              {batchesPagination ? (
                <div className="aone-pagination">
                  <p className="aone-pagination-meta">
                    Page {batchesPagination.page} of {batchesPagination.totalPages || 1}
                  </p>
                  <div className="aone-toolbar">
                    <s-button
                      disabled={batchPage <= 1}
                      onClick={() => setBatchPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </s-button>
                    <s-button
                      disabled={batchPage >= (batchesPagination.totalPages || 1)}
                      onClick={() => setBatchPage((p) => p + 1)}
                    >
                      Next
                    </s-button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </s-section>
      </div>
    </s-page>
  );
}

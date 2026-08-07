import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import ErrorBanner from "../components/ui/ErrorBanner";
import ImageCompareDialog from "../components/ui/ImageCompareDialog";
import MetricCard from "../components/ui/MetricCard";
import PageSkeleton from "../components/ui/PageSkeleton";
import ProductPickerDialog from "../components/ui/ProductPickerDialog";
import ReprocessPromptDialog, {
  type ReprocessPreview,
} from "../components/ui/ReprocessPromptDialog";
import StatusBadge from "../components/ui/StatusBadge";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
import type {
  Batch,
  BatchImage,
  BatchProduct,
  PaginationMeta,
  SecondaryQueueItem,
  SecondaryQueueSummary,
} from "../types/week2";
import { parseApiResponse } from "../utils/api";
import { formatGid, formatWhen, truncateGid } from "../utils/format";
import { navigateApp } from "../utils/routes";
import { showAppToast } from "../utils/toast";

type PickerProduct = {
  id: string;
  title?: string;
};

type ReprocessTarget =
  | { scope: "batch"; batchId: string }
  | { scope: "product"; productId: string }
  | { scope: "image"; imageId: string };

const ACTIVE_BATCH_STATUSES = new Set(["QUEUED", "PROCESSING"]);
const TERMINAL_BATCH_STATUSES = new Set(["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"]);
const ACTIVE_PUBLISH_STATUSES = new Set(["QUEUED", "PUBLISHING"]);
const REPROCESSABLE_PRODUCT_STATUSES = new Set([
  "QUEUED",
  "RETRYING",
  "COMPLETED",
  "FAILED",
  "SKIPPED",
]);
const REPROCESSABLE_IMAGE_STATUSES = new Set(["QUEUED", "RETRYING", "COMPLETED", "FAILED"]);
const PAGE_SIZE = 20;
const DEFAULT_MANUAL_BATCH_LIMIT = 2;

function shopifyAdminProductUrl(gid: string): string | null {
  const match = /Product\/(\d+)/.exec(gid);
  return match ? `shopify://admin/products/${match[1]}` : null;
}

function canReprocessProduct(product: BatchProduct): boolean {
  if (product.status === "PROCESSING") return false;
  if (product.publishStatus && ACTIVE_PUBLISH_STATUSES.has(product.publishStatus)) return false;
  return REPROCESSABLE_PRODUCT_STATUSES.has(product.status);
}

function canReprocessImage(image: BatchImage, products: BatchProduct[]): boolean {
  if (!REPROCESSABLE_IMAGE_STATUSES.has(image.status)) return false;
  const product = products.find((p) => p.id === image.batchProductId);
  if (!product) return REPROCESSABLE_IMAGE_STATUSES.has(image.status);
  return canReprocessProduct(product);
}

function publishStageLabel(status: string | null | undefined): string {
  if (!status) return "";
  switch (status) {
    case "READY_TO_PUBLISH":
      return "Ready to publish";
    case "QUEUED":
      return "Publish queued";
    case "PUBLISHING":
      return "Publishing…";
    case "PUBLISHED":
      return "Published";
    case "PUBLISH_FAILED":
      return "Publish failed";
    case "PUBLISH_CONFLICT":
      return "Publish conflict";
    case "RESTORE_FAILED":
      return "Restore failed — review in Shopify";
    default:
      return status;
  }
}

function openaiBatchProgress(batch: {
  status: string;
  processingPhase?: string | null;
  currentWorkflowStep?: number;
  totalWorkflowSteps?: number;
  openaiRequestsTotal?: number;
  openaiRequestsCompleted?: number;
  openaiRequestsFailed?: number;
}): {
  title: string;
  stepLabel: string | null;
  countLabel: string | null;
  completed: number;
  total: number;
  failed: number;
} | null {
  if (batch.status !== "PROCESSING" || !batch.processingPhase) return null;
  const phase = batch.processingPhase;
  const stepLabel =
    batch.totalWorkflowSteps && batch.currentWorkflowStep
      ? `Step ${batch.currentWorkflowStep} of ${batch.totalWorkflowSteps}`
      : null;
  const total = typeof batch.openaiRequestsTotal === "number" ? batch.openaiRequestsTotal : 0;
  const completed = batch.openaiRequestsCompleted ?? 0;
  const failed = batch.openaiRequestsFailed ?? 0;
  const countLabel = total > 0 ? `${completed} of ${total} requests` : null;

  let title: string;
  if (phase === "WAITING_FOR_OPENAI" || phase === "OPENAI_BATCH_SUBMITTED") {
    title = "Waiting for OpenAI Batch";
  } else if (phase === "RETRYING_FAILED_REQUESTS") {
    title = "Retrying failed OpenAI requests";
  } else if (phase === "UPLOADING_TO_SHOPIFY_FILES") {
    title = "Uploading final images to Shopify Files";
  } else if (phase === "IMPORTING_STAGE_RESULTS" || phase === "COLLECTING_OPENAI_RESULTS") {
    title = "Collecting OpenAI Batch results";
  } else {
    title = phase.replaceAll("_", " ");
  }

  return { title, stepLabel, countLabel, completed, total, failed };
}

function OpenAIPhaseLine({
  batch,
}: {
  batch: {
    status: string;
    processingPhase?: string | null;
    currentWorkflowStep?: number;
    totalWorkflowSteps?: number;
    openaiRequestsTotal?: number;
    openaiRequestsCompleted?: number;
    openaiRequestsFailed?: number;
  };
}) {
  const progress = openaiBatchProgress(batch);
  if (!progress) return null;
  const ratio =
    progress.total > 0 ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : null;

  return (
    <div className="aone-phase-line" title={`${progress.title}${progress.countLabel ? ` · ${progress.countLabel}` : ""}`}>
      <p className="aone-phase-title">{progress.title}</p>
      {(progress.stepLabel || progress.countLabel) && (
        <div className="aone-phase-meta">
          {progress.stepLabel ? <span className="aone-phase-chip">{progress.stepLabel}</span> : null}
          {progress.countLabel ? <span className="aone-phase-chip">{progress.countLabel}</span> : null}
          {progress.failed > 0 ? (
            <span className="aone-phase-chip aone-phase-chip-warn">{progress.failed} failed</span>
          ) : null}
        </div>
      )}
      {ratio != null ? (
        <div
          className="aone-phase-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={ratio}
          aria-label="OpenAI batch progress"
        >
          <span className="aone-phase-bar-fill" style={{ width: `${ratio}%` }} />
        </div>
      ) : (
        <div className="aone-phase-bar aone-phase-bar-indeterminate" aria-hidden="true">
          <span className="aone-phase-bar-pulse" />
        </div>
      )}
    </div>
  );
}

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
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchProducts, setBatchProducts] = useState<BatchProduct[]>([]);
  const [batchImages, setBatchImages] = useState<BatchImage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<BatchImage | null>(null);

  // Manual batch
  const [pickedProducts, setPickedProducts] = useState<PickerProduct[]>([]);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualBatchLimit, setManualBatchLimit] = useState(DEFAULT_MANUAL_BATCH_LIMIT);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [publishBusyId, setPublishBusyId] = useState<string | null>(null);
  const [publishAllBusy, setPublishAllBusy] = useState(false);
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(false);
  const [conflictText, setConflictText] = useState("");
  const [reprocessTarget, setReprocessTarget] = useState<ReprocessTarget | null>(null);
  const [reprocessPreview, setReprocessPreview] = useState<ReprocessPreview | null>(null);
  const [reprocessLoading, setReprocessLoading] = useState(false);
  const [reprocessBusy, setReprocessBusy] = useState(false);
  const [reprocessError, setReprocessError] = useState("");

  const pollInFlight = useRef(false);
  const detailInFlight = useRef(false);
  // Keep latest paging/selection in refs so the poll interval doesn't recreate forever.
  const secondaryPageRef = useRef(secondaryPage);
  const secondaryStatusFilterRef = useRef(secondaryStatusFilter);
  const batchPageRef = useRef(batchPage);
  const selectedBatchIdRef = useRef(selectedBatchId);
  const lastToastedSecondaryFailedRef = useRef<number | null>(null);
  secondaryPageRef.current = secondaryPage;
  secondaryStatusFilterRef.current = secondaryStatusFilter;
  batchPageRef.current = batchPage;
  selectedBatchIdRef.current = selectedBatchId;

  const hasActiveWork = useMemo(() => {
    if (!secondarySummary) return false;
    const secondaryActive = secondarySummary.pending > 0 || secondarySummary.claimed > 0;
    const batchesActive = batches.some((b) => ACTIVE_BATCH_STATUSES.has(b.status));
    const publishActive = batchProducts.some((p) => ACTIVE_PUBLISH_STATUSES.has(p.publishStatus ?? ""));
    return secondaryActive || batchesActive || publishActive;
  }, [secondarySummary, batches, batchProducts]);

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
    void (async () => {
      try {
        const response = await authenticatedFetch(endpoints.settings);
        const data = await parseApiResponse<{ autoPublishProcessedImages?: boolean }>(response);
        setAutoPublishEnabled(Boolean(data.autoPublishProcessedImages));
      } catch {
        // Non-blocking: publish buttons still work; Publish All assumes manual mode.
      }
    })();
  }, [authenticatedFetch]);

  const publishSummary = useMemo(() => {
    const counts = {
      ready: 0,
      queued: 0,
      publishing: 0,
      published: 0,
      failed: 0,
      conflict: 0,
      restoreFailed: 0,
    };
    for (const p of batchProducts) {
      switch (p.publishStatus) {
        case "READY_TO_PUBLISH":
          counts.ready += 1;
          break;
        case "QUEUED":
          counts.queued += 1;
          break;
        case "PUBLISHING":
          counts.publishing += 1;
          break;
        case "PUBLISHED":
          counts.published += 1;
          break;
        case "PUBLISH_FAILED":
          counts.failed += 1;
          break;
        case "PUBLISH_CONFLICT":
          counts.conflict += 1;
          break;
        case "RESTORE_FAILED":
          counts.restoreFailed += 1;
          break;
        default:
          break;
      }
    }
    return counts;
  }, [batchProducts]);

  const loadBatchDetail = useCallback(
    async (batchId: string, opts?: { silent?: boolean }) => {
      if (detailInFlight.current) return;
      detailInFlight.current = true;
      if (!opts?.silent) setDetailLoading(true);
      try {
        const [productsRes, imagesRes] = await Promise.all([
          authenticatedFetch(endpoints.batchProducts(batchId)),
          authenticatedFetch(endpoints.batchImages(batchId)),
        ]);
        if (!productsRes.ok || !imagesRes.ok) {
          // Batch gone / unauthorized — drop selection instead of hammering 404s.
          if (productsRes.status === 404 || imagesRes.status === 404) {
            setSelectedBatchId(null);
            setBatchProducts([]);
            setBatchImages([]);
            return;
          }
        }
        const productsPayload = await parseApiResponse<{ items: BatchProduct[] }>(productsRes);
        const imagesPayload = await parseApiResponse<{ items: BatchImage[] }>(imagesRes);
        // Ignore stale responses if the user already opened another batch.
        if (selectedBatchIdRef.current !== batchId) return;
        setBatchProducts(productsPayload.items ?? []);
        setBatchImages(imagesPayload.items ?? []);
      } catch (err) {
        if (!opts?.silent) {
          setError(err instanceof Error ? err.message : "Failed to load batch detail");
        }
      } finally {
        detailInFlight.current = false;
        if (!opts?.silent) setDetailLoading(false);
      }
    },
    [authenticatedFetch],
  );

  // If the selected batch disappears from the list, close detail and stop product/image polls.
  useEffect(() => {
    if (!selectedBatchId) return;
    if (!batches.some((b) => b.id === selectedBatchId)) {
      setSelectedBatchId(null);
      setBatchProducts([]);
      setBatchImages([]);
    }
  }, [batches, selectedBatchId]);

  useEffect(() => {
    if (!hasActiveWork) return;
    const timer = window.setInterval(() => {
      void refresh();
      const batchId = selectedBatchIdRef.current;
      if (batchId) void loadBatchDetail(batchId, { silent: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasActiveWork, refresh, loadBatchDetail]);

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
    setSelectedBatchId(batchId);
    setBatchProducts([]);
    setBatchImages([]);
    void loadBatchDetail(batchId);
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

  const closeReprocessDialog = () => {
    setReprocessTarget(null);
    setReprocessPreview(null);
    setReprocessError("");
    setReprocessLoading(false);
    setReprocessBusy(false);
  };

  const openReprocess = async (target: ReprocessTarget) => {
    setReprocessTarget(target);
    setReprocessPreview(null);
    setReprocessError("");
    setReprocessLoading(true);
    setError("");
    try {
      const url =
        target.scope === "batch"
          ? endpoints.batchReprocessPreview(target.batchId)
          : target.scope === "product"
            ? endpoints.batchProductReprocessPreview(target.productId)
            : endpoints.batchImageReprocessPreview(target.imageId);
      const response = await authenticatedFetch(url);
      const preview = await parseApiResponse<ReprocessPreview>(response);
      setReprocessPreview(preview);
    } catch (err) {
      setReprocessError(err instanceof Error ? err.message : "Failed to load prompt preview");
    } finally {
      setReprocessLoading(false);
    }
  };

  const confirmReprocess = async (steps: { name: string; promptTemplate: string }[]) => {
    if (!reprocessTarget) return;
    setReprocessBusy(true);
    setReprocessError("");
    setError("");
    try {
      const url =
        reprocessTarget.scope === "batch"
          ? endpoints.batchReprocess(reprocessTarget.batchId)
          : reprocessTarget.scope === "product"
            ? endpoints.batchProductReprocess(reprocessTarget.productId)
            : endpoints.batchImageReprocess(reprocessTarget.imageId);
      const response = await authenticatedFetch(url, {
        method: "POST",
        body: JSON.stringify({ steps }),
      });
      const payload = await parseApiResponse<{ retriedCount?: number }>(response);
      if (reprocessTarget.scope === "batch") {
        setMessage(`Queued ${payload.retriedCount ?? 0} product(s) for reprocess.`);
      } else if (reprocessTarget.scope === "product") {
        setMessage("Product queued for reprocess.");
      } else {
        setMessage("Image queued for reprocess.");
      }
      closeReprocessDialog();
      if (selectedBatchId) await loadBatchDetail(selectedBatchId);
      await loadBatches(batchPage);
    } catch (err) {
      setReprocessError(err instanceof Error ? err.message : "Reprocess failed");
    } finally {
      setReprocessBusy(false);
    }
  };

  const publishProduct = async (productId: string) => {
    setPublishBusyId(productId);
    setError("");
    setConflictText("");
    try {
      const payload = await parseApiResponse<{ status?: string; message?: string }>(
        await authenticatedFetch(endpoints.batchProductPublish(productId), { method: "POST" }),
      );
      setMessage(payload.message || "Product publishing has been queued.");
      if (selectedBatchId) await loadBatchDetail(selectedBatchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishBusyId(null);
    }
  };

  const retryPublish = async (productId: string) => {
    setPublishBusyId(productId);
    setError("");
    setConflictText("");
    try {
      const payload = await parseApiResponse<{ message?: string }>(
        await authenticatedFetch(endpoints.batchProductRetryPublish(productId), { method: "POST" }),
      );
      setMessage(payload.message || "Publish retry queued.");
      if (selectedBatchId) await loadBatchDetail(selectedBatchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry publish failed");
    } finally {
      setPublishBusyId(null);
    }
  };

  const publishAllReady = async () => {
    if (!selectedBatchId || publishAllBusy) return;
    setPublishAllBusy(true);
    setError("");
    setConflictText("");
    try {
      const payload = await parseApiResponse<{
        queued?: number;
        alreadyQueued?: number;
        alreadyPublished?: number;
        failedValidation?: number;
      }>(await authenticatedFetch(endpoints.batchPublishReady(selectedBatchId), { method: "POST" }));
      setMessage(
        `Publish All: queued ${payload.queued ?? 0}, already queued ${payload.alreadyQueued ?? 0}, already published ${payload.alreadyPublished ?? 0}, failed validation ${payload.failedValidation ?? 0}.`,
      );
      await loadBatchDetail(selectedBatchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish all failed");
    } finally {
      setPublishAllBusy(false);
    }
  };

  const reviewConflict = async (productId: string) => {
    setError("");
    try {
      const payload = await parseApiResponse<{
        message?: string;
        conflictDetails?: Record<string, unknown>;
      }>(await authenticatedFetch(endpoints.batchProductPublishConflict(productId)));
      const details = payload.conflictDetails
        ? JSON.stringify(payload.conflictDetails, null, 2)
        : "";
      setConflictText(
        `${payload.message || "Shopify product media changed during processing."}${details ? `\n\n${details}` : ""}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conflict details");
    }
  };

  const selectedBatch = batches.find((b) => b.id === selectedBatchId) ?? null;
  const canPublishAll =
    Boolean(selectedBatch) &&
    !autoPublishEnabled &&
    TERMINAL_BATCH_STATUSES.has(selectedBatch?.status ?? "") &&
    publishSummary.ready > 0;

  return (
    <s-page heading="Jobs">
      <s-section heading="Processing monitor">
        <s-paragraph>
          Create manual batches from Shopify products, monitor webhook-driven Secondary Queue intake, and
          track batch progress.
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

      {conflictText ? (
        <s-section>
          <s-banner tone="warning" heading="Publish conflict">
            <s-paragraph>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: "0.85em" }}>{conflictText}</pre>
            </s-paragraph>
            <s-paragraph>
              Sync the catalog and process this product again. Do not force-overwrite merchant changes.
            </s-paragraph>
            <s-button onClick={() => setConflictText("")}>Dismiss</s-button>
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
              <MetricCard label="Pending" value={secondarySummary?.pending ?? 0} badgeTone="caution" badgeLabel="Awaiting" />
              <MetricCard label="Claimed" value={secondarySummary?.claimed ?? 0} badgeTone="info" badgeLabel="In progress" />
              <MetricCard label="Converted" value={secondarySummary?.converted ?? 0} badgeTone="success" badgeLabel="Done" />
              <MetricCard label="Skipped" value={secondarySummary?.skipped ?? 0} badgeTone="neutral" badgeLabel="No delta" />
              <MetricCard label="Failed" value={secondarySummary?.failed ?? 0} badgeTone="critical" badgeLabel="Errors" />
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
                        <td className="aone-table-cell-truncate" title={item.skipReason ?? item.failureReason ?? undefined}>
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
                    className={`aone-table-row-clickable${selectedBatchId === batch.id ? " aone-table-row-selected" : ""}`}
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
                        <OpenAIPhaseLine batch={batch} />
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

        {selectedBatchId && selectedBatch ? (
          <s-section heading="Batch detail">
            <div className="aone-detail-panel">
              <div className="aone-detail-header">
                <s-stack direction="block" gap="small">
                  <s-text>
                    Batch <code className="aone-mono">{selectedBatchId}</code>
                  </s-text>
                  <s-stack direction="inline" gap="small">
                    <StatusBadge status={selectedBatch.triggerType} />
                    <StatusBadge status={selectedBatch.status} />
                  </s-stack>
                  {openaiBatchProgress(selectedBatch) ? (
                    <OpenAIPhaseLine batch={selectedBatch} />
                  ) : null}
                  {selectedBatch.errorSummary ? (
                    <s-text tone="critical">{selectedBatch.errorSummary}</s-text>
                  ) : null}
                </s-stack>
                <div className="aone-toolbar">
                  {canPublishAll ? (
                    <s-button
                      variant="primary"
                      disabled={publishAllBusy}
                      onClick={() => void publishAllReady()}
                    >
                      {publishAllBusy ? "Queuing…" : "Publish All Ready Products"}
                    </s-button>
                  ) : null}
                  {batchProducts.some(canReprocessProduct) ? (
                    <s-button
                      onClick={() =>
                        void openReprocess({ scope: "batch", batchId: selectedBatchId })
                      }
                    >
                      Reprocess batch
                    </s-button>
                  ) : null}
                  <s-button onClick={() => setSelectedBatchId(null)}>Close</s-button>
                </div>
              </div>

              {detailLoading ? (
                <PageSkeleton metricCount={0} tableRows={3} />
              ) : (
                <s-stack direction="block" gap="base">
                  {TERMINAL_BATCH_STATUSES.has(selectedBatch.status) ? (
                    <div className="aone-metrics">
                      <MetricCard label="Ready to Publish" value={publishSummary.ready} />
                      <MetricCard label="Queued" value={publishSummary.queued} />
                      <MetricCard label="Publishing" value={publishSummary.publishing} />
                      <MetricCard label="Published" value={publishSummary.published} badgeTone="success" />
                      <MetricCard label="Publish Failed" value={publishSummary.failed} badgeTone="critical" />
                      <MetricCard label="Conflict" value={publishSummary.conflict} badgeTone="caution" />
                    </div>
                  ) : null}

                  {publishSummary.restoreFailed > 0 ? (
                    <s-banner tone="critical" heading="Restore failed">
                      <s-paragraph>
                        Automatic restoration could not be verified for {publishSummary.restoreFailed}{" "}
                        product(s). Manual Shopify review is required.
                      </s-paragraph>
                    </s-banner>
                  ) : null}

                  <s-heading>Products</s-heading>
                  {batchProducts.length === 0 ? (
                    <EmptyState title="No products" description="This batch has no product records." />
                  ) : (
                    <DataTable>
                      <thead>
                        <tr>
                          <th>Product GID</th>
                          <th>Status</th>
                          <th>Publish</th>
                          <th>Images</th>
                          <th>Retries</th>
                          <th>Error</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchProducts.map((product) => {
                          const adminUrl = shopifyAdminProductUrl(product.shopifyProductGid);
                          const pub = product.publishStatus;
                          const busy = publishBusyId === product.id;
                          return (
                            <tr key={product.id}>
                              <td>
                                <code className="aone-mono" title={product.shopifyProductGid}>
                                  {truncateGid(product.shopifyProductGid)}
                                </code>
                              </td>
                              <td>
                                <StatusBadge status={product.status} />
                              </td>
                              <td>
                                {pub ? (
                                  <StatusBadge status={pub} />
                                ) : (
                                  "—"
                                )}
                                {pub && ACTIVE_PUBLISH_STATUSES.has(pub) ? (
                                  <>
                                    <br />
                                    <s-text tone="neutral">{publishStageLabel(pub)}</s-text>
                                  </>
                                ) : null}
                              </td>
                              <td>{product.imageCount}</td>
                              <td>{product.retryCount}</td>
                              <td className="aone-table-cell-truncate" title={product.errorMessage ?? undefined}>
                                {product.errorMessage ?? "—"}
                              </td>
                              <td>
                                <div className="aone-toolbar" style={{ flexWrap: "wrap", gap: "0.35rem" }}>
                                  {canReprocessProduct(product) ? (
                                    <s-button
                                      onClick={() =>
                                        void openReprocess({ scope: "product", productId: product.id })
                                      }
                                    >
                                      Reprocess
                                    </s-button>
                                  ) : null}
                                  {pub === "READY_TO_PUBLISH" && !autoPublishEnabled ? (
                                    <s-button
                                      variant="primary"
                                      disabled={busy || Boolean(publishBusyId)}
                                      onClick={() => void publishProduct(product.id)}
                                    >
                                      {busy ? "Queuing…" : "Publish to Shopify"}
                                    </s-button>
                                  ) : null}
                                  {pub === "PUBLISH_FAILED" || pub === "RESTORE_FAILED" ? (
                                    <s-button
                                      disabled={busy}
                                      onClick={() => void retryPublish(product.id)}
                                    >
                                      {busy ? "Queuing…" : "Retry Publish"}
                                    </s-button>
                                  ) : null}
                                  {pub === "PUBLISH_CONFLICT" ? (
                                    <s-button onClick={() => void reviewConflict(product.id)}>
                                      Review Conflict
                                    </s-button>
                                  ) : null}
                                  {pub === "PUBLISHED" && adminUrl ? (
                                    <s-link href={adminUrl} target="_blank">
                                      View Shopify Product
                                    </s-link>
                                  ) : null}
                                  {pub === "PUBLISHED" && product.productId ? (
                                    <s-button
                                      onClick={() => navigateApp(`/products/${product.productId}/versions`)}
                                    >
                                      View Versions
                                    </s-button>
                                  ) : null}
                                  {!canReprocessProduct(product) &&
                                  !pub &&
                                  product.status === "PROCESSING"
                                    ? "—"
                                    : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </DataTable>
                  )}

                  <s-heading>Images</s-heading>
                  {batchImages.length === 0 ? (
                    <EmptyState title="No images" description="This batch has no image work items." />
                  ) : (
                    <DataTable>
                      <thead>
                        <tr>
                          <th>Media GID</th>
                          <th>Delta</th>
                          <th>Status</th>
                          <th>Attempts</th>
                          <th>Error</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchImages.map((image) => (
                          <tr key={image.id}>
                            <td>
                              <code className="aone-mono" title={image.shopifyMediaGid}>
                                {truncateGid(image.shopifyMediaGid)}
                              </code>
                            </td>
                            <td>
                              <StatusBadge status={image.deltaType} />
                            </td>
                            <td>
                              <StatusBadge status={image.status} />
                            </td>
                            <td>{image.attemptCount}</td>
                            <td className="aone-table-cell-truncate" title={image.errorMessage ?? undefined}>
                              {image.errorMessage ?? "—"}
                            </td>
                            <td>
                              <div className="aone-toolbar" style={{ flexWrap: "wrap", gap: "0.35rem" }}>
                                {canReprocessImage(image, batchProducts) ? (
                                  <s-button
                                    onClick={() =>
                                      void openReprocess({ scope: "image", imageId: image.id })
                                    }
                                  >
                                    Reprocess
                                  </s-button>
                                ) : null}
                                <s-button onClick={() => setPreviewImage(image)}>View details</s-button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  )}
                </s-stack>
              )}
            </div>
          </s-section>
        ) : null}
      </div>

      <ReprocessPromptDialog
        open={Boolean(reprocessTarget)}
        title={
          reprocessTarget?.scope === "batch"
            ? "Reprocess batch"
            : reprocessTarget?.scope === "product"
              ? "Reprocess product"
              : "Reprocess image"
        }
        preview={reprocessPreview}
        loading={reprocessLoading}
        busy={reprocessBusy}
        error={reprocessError}
        onConfirm={(steps) => void confirmReprocess(steps)}
        onCancel={closeReprocessDialog}
      />

      <ImageCompareDialog image={previewImage} onClose={() => setPreviewImage(null)} />
    </s-page>
  );
}

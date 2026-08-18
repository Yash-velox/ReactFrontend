import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DataTable from "../components/ui/DataTable";
import AonePage from "../components/ui/AonePage";
import EmptyState from "../components/ui/EmptyState";
import ErrorBanner from "../components/ui/ErrorBanner";
import ImageCompareDialog from "../components/ui/ImageCompareDialog";
import MetricCard from "../components/ui/MetricCard";
import OverflowMenu, { type OverflowMenuItem } from "../components/ui/OverflowMenu";
import PageSkeleton from "../components/ui/PageSkeleton";
import ReprocessPromptDialog, {
  type ReprocessPreview,
} from "../components/ui/ReprocessPromptDialog";
import RowDetailDialog, { detailText } from "../components/ui/RowDetailDialog";
import BatchStatusBadge from "../components/ui/BatchStatusBadge";
import StatusBadge from "../components/ui/StatusBadge";
import Timestamp from "../components/ui/Timestamp";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
import type { Batch, BatchImage, BatchProduct } from "../types/week2";
import { parseApiResponse } from "../utils/api";
import { formatWhenFull, truncateGid } from "../utils/format";
import { navigateApp } from "../utils/routes";

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

type Props = {
  /** When rendered from Shopify Remix routes, pass the param explicitly. */
  batchId?: string;
};

function resolveBatchId(prop?: string): string {
  if (prop) return prop;
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/\/jobs\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function productDisplayName(product: BatchProduct): string {
  const title = product.title?.trim();
  return title || "Untitled product";
}

function stopRowClick(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

function externalLink(href: string | null | undefined, label: string, title?: string) {
  if (!href) return "—";
  return (
    <a
      className="aone-text-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
    >
      {label}
    </a>
  );
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

export default function BatchDetailPage({ batchId: batchIdProp }: Props = {}) {
  const batchId = resolveBatchId(batchIdProp);
  const authenticatedFetch = useAuthenticatedFetch();

  const [batch, setBatch] = useState<Batch | null>(null);
  const [batchProducts, setBatchProducts] = useState<BatchProduct[]>([]);
  const [batchImages, setBatchImages] = useState<BatchImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflictText, setConflictText] = useState("");
  const [previewImage, setPreviewImage] = useState<BatchImage | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<BatchProduct | null>(null);
  const [selectedImage, setSelectedImage] = useState<BatchImage | null>(null);
  const [publishBusyId, setPublishBusyId] = useState<string | null>(null);
  const [publishAllBusy, setPublishAllBusy] = useState(false);
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(false);
  const [reprocessTarget, setReprocessTarget] = useState<ReprocessTarget | null>(null);
  const [reprocessPreview, setReprocessPreview] = useState<ReprocessPreview | null>(null);
  const [reprocessLoading, setReprocessLoading] = useState(false);
  const [reprocessBusy, setReprocessBusy] = useState(false);
  const [reprocessError, setReprocessError] = useState("");

  const loadInFlight = useRef(false);
  const batchIdRef = useRef(batchId);
  batchIdRef.current = batchId;

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

  const hasActiveWork = useMemo(() => {
    const batchActive = batch ? ACTIVE_BATCH_STATUSES.has(batch.status) : false;
    const publishActive = batchProducts.some((p) =>
      ACTIVE_PUBLISH_STATUSES.has(p.publishStatus ?? ""),
    );
    return batchActive || publishActive;
  }, [batch, batchProducts]);

  const loadDetail = useCallback(
    async (opts?: { silent?: boolean }) => {
      const id = batchIdRef.current;
      if (!id || loadInFlight.current) return;
      loadInFlight.current = true;
      if (!opts?.silent) {
        setDetailLoading(true);
        setLoading(true);
      }
      try {
        const [batchRes, productsRes, imagesRes] = await Promise.all([
          authenticatedFetch(endpoints.batchDetail(id)),
          authenticatedFetch(endpoints.batchProducts(id)),
          authenticatedFetch(endpoints.batchImages(id)),
        ]);
        if (batchIdRef.current !== id) return;

        if (batchRes.status === 404 || productsRes.status === 404 || imagesRes.status === 404) {
          setBatch(null);
          setBatchProducts([]);
          setBatchImages([]);
          setError("Batch not found or no longer available.");
          return;
        }

        const batchPayload = await parseApiResponse<Batch>(batchRes);
        const productsPayload = await parseApiResponse<{ items: BatchProduct[] }>(productsRes);
        const imagesPayload = await parseApiResponse<{ items: BatchImage[] }>(imagesRes);
        if (batchIdRef.current !== id) return;

        setBatch(batchPayload);
        setBatchProducts(productsPayload.items ?? []);
        setBatchImages(imagesPayload.items ?? []);
        setError("");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load batch detail";
        if (/Invalid session token|Signature has expired/i.test(message)) {
          if (!opts?.silent) {
            window.setTimeout(() => {
              void loadDetail({ silent: true });
            }, 400);
          }
          return;
        }
        if (!opts?.silent) {
          setError(message);
        }
      } finally {
        loadInFlight.current = false;
        if (!opts?.silent) {
          setDetailLoading(false);
          setLoading(false);
        }
      }
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

  useEffect(() => {
    if (!batchId) {
      setLoading(false);
      setError("Missing batch id.");
      return;
    }
    void loadDetail();
  }, [batchId, loadDetail]);

  useEffect(() => {
    if (!hasActiveWork) return;
    const timer = window.setInterval(() => {
      void loadDetail({ silent: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasActiveWork, loadDetail]);

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
      await loadDetail();
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
      await loadDetail();
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
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry publish failed");
    } finally {
      setPublishBusyId(null);
    }
  };

  const publishAllReady = async () => {
    if (!batchId || publishAllBusy) return;
    setPublishAllBusy(true);
    setError("");
    setConflictText("");
    try {
      const payload = await parseApiResponse<{
        queued?: number;
        alreadyQueued?: number;
        alreadyPublished?: number;
        failedValidation?: number;
      }>(await authenticatedFetch(endpoints.batchPublishReady(batchId), { method: "POST" }));
      setMessage(
        `Publish All: queued ${payload.queued ?? 0}, already queued ${payload.alreadyQueued ?? 0}, already published ${payload.alreadyPublished ?? 0}, failed validation ${payload.failedValidation ?? 0}.`,
      );
      await loadDetail();
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

  // Always allow manual publish when products are ready. Auto-publish should not
  // hide the escape hatch if products remain READY_TO_PUBLISH (setting flipped
  // later, enqueue miss, etc.).
  const canPublishAll =
    Boolean(batch) &&
    TERMINAL_BATCH_STATUSES.has(batch?.status ?? "") &&
    publishSummary.ready > 0;

  const heading = batch
    ? `Batch ${batch.id.slice(0, 8)}`
    : batchId
      ? `Batch ${batchId.slice(0, 8)}`
      : "Batch detail";

  if (!batchId) {
    return (
      <AonePage heading="Batch detail">
        <s-section>
          <ErrorBanner message="Missing batch id." />
          <div className="aone-toolbar" style={{ marginTop: "0.75rem" }}>
            <s-button onClick={() => navigateApp("/jobs")}>← Back to Jobs</s-button>
          </div>
        </s-section>
      </AonePage>
    );
  }

  if (loading && !batch) {
    return (
      <AonePage heading={heading}>
        <s-section>
          <div className="aone-toolbar" style={{ marginBottom: "0.75rem" }}>
            <s-button onClick={() => navigateApp("/jobs")}>← Back to Jobs</s-button>
          </div>
          <PageSkeleton metricCount={0} tableRows={4} />
        </s-section>
      </AonePage>
    );
  }

  if (!batch) {
    return (
      <AonePage heading="Batch detail">
        <s-section>
          <ErrorBanner
            message={error || "Batch not found"}
            onRetry={() => void loadDetail()}
          />
          <div className="aone-toolbar" style={{ marginTop: "0.75rem" }}>
            <s-button onClick={() => navigateApp("/jobs")}>← Back to Jobs</s-button>
          </div>
        </s-section>
      </AonePage>
    );
  }

  return (
    <AonePage heading={heading}>
      <s-section>
        <div className="aone-detail-header">
          <s-stack direction="block" gap="small">
            <div className="aone-toolbar">
              <s-button onClick={() => navigateApp("/jobs")}>← Back to Jobs</s-button>
            </div>
            <s-text>
              Batch <code className="aone-mono">{batch.id}</code>
            </s-text>
            <s-stack direction="inline" gap="small">
              <StatusBadge status={batch.triggerType} />
              <BatchStatusBadge
                status={batch.status}
                processingPhase={batch.processingPhase}
              />
            </s-stack>
            <s-text tone="neutral">
              Created <Timestamp value={batch.createdAt} />
              {batch.completedAt ? (
                <>
                  {" "}
                  · Completed <Timestamp value={batch.completedAt} />
                </>
              ) : null}
            </s-text>
            {batch.errorSummary ? (
              <s-text tone="critical">{batch.errorSummary}</s-text>
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
                onClick={() => void openReprocess({ scope: "batch", batchId: batch.id })}
              >
                Reprocess batch
              </s-button>
            ) : null}
          </div>
        </div>
      </s-section>

      {error ? (
        <s-section>
          <ErrorBanner message={error} onRetry={() => void loadDetail()} />
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

      <s-section heading="Batch detail">
        {detailLoading && batchProducts.length === 0 ? (
          <PageSkeleton metricCount={0} tableRows={3} />
        ) : (
          <s-stack direction="block" gap="base">
            {TERMINAL_BATCH_STATUSES.has(batch.status) ? (
              <div className="aone-metrics">
                <MetricCard
                  label="Ready To Publish"
                  value={publishSummary.ready}
                  hint="Enhanced images are finished and waiting to be sent to Shopify."
                />
                <MetricCard
                  label="Queued"
                  value={publishSummary.queued}
                  hint="Publish to Shopify is waiting to start for these products."
                />
                <MetricCard
                  label="Publishing"
                  value={publishSummary.publishing}
                  hint="Enhanced images are being uploaded and attached in Shopify."
                />
                <MetricCard
                  label="Published"
                  value={publishSummary.published}
                  badgeTone="success"
                  hint="Enhanced images are live on the store."
                />
                <MetricCard
                  label="Publish Failed"
                  value={publishSummary.failed}
                  badgeTone="critical"
                  hint="Shopify did not accept the publish. Open the product row for the error."
                />
                <MetricCard
                  label="Conflict"
                  value={publishSummary.conflict}
                  badgeTone="caution"
                  hint="The product's live images changed during publish. Review before retrying."
                />
              </div>
            ) : null}

            {autoPublishEnabled && publishSummary.ready > 0 ? (
              <s-banner tone="warning" heading="Still waiting to publish">
                <s-paragraph>
                  Automatic publish is enabled in Settings, but {publishSummary.ready} product(s) are
                  still Ready to Publish. Use Publish All or Publish to Shopify below.
                </s-paragraph>
              </s-banner>
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
                    <th>Product</th>
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
                    const adminUrl = product.adminUrl;
                    const pub = product.publishStatus;
                    const busy = publishBusyId === product.id;
                    const name = productDisplayName(product);
                    return (
                      <tr
                        key={product.id}
                        className="aone-table-row-clickable"
                        onClick={() => setSelectedProduct(product)}
                      >
                        <td>
                          {product.storefrontUrl ? (
                            <a
                              className="aone-product-title aone-text-link"
                              href={product.storefrontUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open storefront product"
                              onClick={stopRowClick}
                            >
                              {name}
                            </a>
                          ) : (
                            <div className="aone-product-title">{name}</div>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={product.status} />
                        </td>
                        <td>
                          {pub ? <StatusBadge status={pub} /> : "—"}
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
                        <td
                          className="aone-col-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(() => {
                            const canReprocess = canReprocessProduct(product);
                            const showPublish = pub === "READY_TO_PUBLISH";
                            const showRetry =
                              pub === "PUBLISH_FAILED" || pub === "RESTORE_FAILED";
                            const showConflict = pub === "PUBLISH_CONFLICT";
                            const overflowItems: OverflowMenuItem[] = [];
                            if (canReprocess) {
                              overflowItems.push({
                                id: "reprocess",
                                label: "Reprocess",
                                onSelect: () =>
                                  void openReprocess({
                                    scope: "product",
                                    productId: product.id,
                                  }),
                              });
                            }
                            if (adminUrl) {
                              overflowItems.push({
                                id: "shopify",
                                label: "View Shopify Product",
                                href: adminUrl,
                                target: "_blank",
                              });
                            }
                            if (product.productId) {
                              overflowItems.push({
                                id: "versions",
                                label: "View Versions",
                                onSelect: () =>
                                  navigateApp(`/products/${product.productId}/versions`),
                              });
                            }
                            const hasPrimary = showPublish || showRetry || showConflict;
                            if (!hasPrimary && overflowItems.length === 0) {
                              return "—";
                            }
                            return (
                              <div className="aone-step-actions">
                                {showPublish ? (
                                  <s-button
                                    variant="primary"
                                    disabled={busy || Boolean(publishBusyId)}
                                    onClick={() => void publishProduct(product.id)}
                                  >
                                    {busy ? "Queuing…" : "Publish to Shopify"}
                                  </s-button>
                                ) : null}
                                {showRetry ? (
                                  <s-button
                                    disabled={busy}
                                    onClick={() => void retryPublish(product.id)}
                                  >
                                    {busy ? "Queuing…" : "Retry Publish"}
                                  </s-button>
                                ) : null}
                                {showConflict ? (
                                  <s-button onClick={() => void reviewConflict(product.id)}>
                                    Review Conflict
                                  </s-button>
                                ) : null}
                                <OverflowMenu
                                  label={`More actions for ${name}`}
                                  items={overflowItems}
                                />
                              </div>
                            );
                          })()}
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
                    <tr
                      key={image.id}
                      className="aone-table-row-clickable"
                      onClick={() => setSelectedImage(image)}
                    >
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
                      <td onClick={(e) => e.stopPropagation()}>
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
      </s-section>

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

      <RowDetailDialog
        open={Boolean(selectedProduct)}
        title="Batch product details"
        onClose={() => setSelectedProduct(null)}
        fields={
          selectedProduct
            ? [
                {
                  label: "Product",
                  value: selectedProduct.adminUrl
                    ? externalLink(
                        selectedProduct.adminUrl,
                        productDisplayName(selectedProduct),
                        "Open in Shopify Admin",
                      )
                    : productDisplayName(selectedProduct),
                },
                { label: "Status", value: selectedProduct.status },
                { label: "Publish status", value: detailText(selectedProduct.publishStatus) },
                { label: "Images", value: selectedProduct.imageCount },
                { label: "Retries", value: selectedProduct.retryCount },
                { label: "Error code", value: detailText(selectedProduct.errorCode) },
                { label: "Error message", value: detailText(selectedProduct.errorMessage) },
                { label: "Locked by", value: detailText(selectedProduct.lockedBy) },
                { label: "Locked at", value: detailText(formatWhenFull(selectedProduct.lockedAt)) },
                { label: "Claimed at", value: detailText(formatWhenFull(selectedProduct.claimedAt)) },
                { label: "Started", value: detailText(formatWhenFull(selectedProduct.startedAt)) },
                { label: "Completed", value: detailText(formatWhenFull(selectedProduct.completedAt)) },
                {
                  label: "Next retry",
                  value: detailText(formatWhenFull(selectedProduct.nextRetryAt)),
                },
                { label: "Created", value: detailText(formatWhenFull(selectedProduct.createdAt)) },
                { label: "Updated", value: detailText(formatWhenFull(selectedProduct.updatedAt)) },
              ]
            : []
        }
      />

      <RowDetailDialog
        open={Boolean(selectedImage)}
        title="Batch image details"
        onClose={() => setSelectedImage(null)}
        fields={
          selectedImage
            ? [
                { label: "Shopify media GID", value: selectedImage.shopifyMediaGid },
                { label: "Shopify file GID", value: detailText(selectedImage.shopifyFileGid) },
                { label: "CDN URL", value: selectedImage.cdnUrl },
                { label: "Filename", value: detailText(selectedImage.originalFilename) },
                {
                  label: "Size",
                  value:
                    selectedImage.width && selectedImage.height
                      ? `${selectedImage.width} × ${selectedImage.height}`
                      : "—",
                },
                { label: "MIME type", value: detailText(selectedImage.mimeType) },
                { label: "Delta", value: selectedImage.deltaType },
                { label: "Status", value: selectedImage.status },
                { label: "Prompt step", value: selectedImage.currentPromptStep },
                { label: "Attempts", value: selectedImage.attemptCount },
                { label: "Error code", value: detailText(selectedImage.errorCode) },
                { label: "Error message", value: detailText(selectedImage.errorMessage) },
                { label: "Output URL", value: detailText(selectedImage.outputUrl) },
                {
                  label: "Generated CDN URL",
                  value: detailText(selectedImage.generatedShopifyCdnUrl),
                },
                {
                  label: "Generated file GID",
                  value: detailText(selectedImage.generatedShopifyFileGid),
                },
                { label: "Started", value: detailText(formatWhenFull(selectedImage.startedAt)) },
                { label: "Completed", value: detailText(formatWhenFull(selectedImage.completedAt)) },
                { label: "Created", value: detailText(formatWhenFull(selectedImage.createdAt)) },
                { label: "Updated", value: detailText(formatWhenFull(selectedImage.updatedAt)) },
                { label: "Batch product ID", value: selectedImage.batchProductId },
                { label: "Record ID", value: selectedImage.id },
              ]
            : []
        }
      />
    </AonePage>
  );
}

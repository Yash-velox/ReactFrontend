import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthenticatedImage from "../components/poc/AuthenticatedImage";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";

type QueueSummary = {
  total: number;
  pending: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  retryPending: number;
  cancelled?: number;
  activeBatchCount: number;
};

type QueueItem = {
  id: string;
  shopifyProductId: string;
  shopifyMediaId: string;
  shopifyCdnUrl: string;
  originalFilename?: string | null;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  batchId?: string | null;
  errorMessage?: string | null;
  outputUrl?: string | null;
  processingStartedAt?: string | null;
  processingCompletedAt?: string | null;
  createdAt: string;
  attempts?: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    errorMessage?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  }>;
};

type EnqueueResult = {
  productsRequested: number;
  productsFound: number;
  imagesFound: number;
  imagesQueued: number;
  duplicatesSkipped: number;
  errors: Array<{ productId: string; message: string }>;
};

type ProductOption = {
  id: string;
  title: string;
  handle?: string | null;
  status?: string | null;
  imageUrl?: string | null;
};

const EMPTY_SUMMARY: QueueSummary = {
  total: 0,
  pending: 0,
  queued: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  retryPending: 0,
  cancelled: 0,
  activeBatchCount: 0,
};

function statusTone(status: string): "success" | "critical" | "caution" | "info" | "neutral" {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "critical";
    case "PROCESSING":
    case "QUEUED":
      return "info";
    case "RETRY_PENDING":
    case "PENDING":
      return "caution";
    default:
      return "neutral";
  }
}

function formatWhen(value?: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function JobsPage() {
  const authenticatedFetch = useAuthenticatedFetch();
  const [summary, setSummary] = useState<QueueSummary>(EMPTY_SUMMARY);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductOption[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [pickedProducts, setPickedProducts] = useState<ProductOption[]>([]);
  const [enqueueResult, setEnqueueResult] = useState<EnqueueResult | null>(null);
  const [detail, setDetail] = useState<QueueItem | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const pollInFlight = useRef(false);
  const searchTimer = useRef<number | null>(null);

  const hasActive = useMemo(
    () =>
      summary.pending > 0 ||
      summary.queued > 0 ||
      summary.processing > 0 ||
      summary.retryPending > 0 ||
      summary.activeBatchCount > 0,
    [summary],
  );

  const refresh = useCallback(async () => {
    if (pollInFlight.current) return;
    pollInFlight.current = true;
    try {
      const [summaryRes, listRes] = await Promise.all([
        authenticatedFetch(endpoints.queueSummary),
        authenticatedFetch(`${endpoints.queueList}?page=1&pageSize=50&sortBy=created_at&sortDir=desc`),
      ]);
      const summaryJson = await summaryRes.json();
      const listJson = await listRes.json();
      if (!summaryRes.ok || !summaryJson.success) {
        throw new Error(summaryJson?.error?.message || "Failed to load summary");
      }
      if (!listRes.ok || !listJson.success) {
        throw new Error(listJson?.error?.message || "Failed to load queue");
      }
      setSummary(summaryJson.data as QueueSummary);
      setItems((listJson.data?.items || []) as QueueItem[]);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh queue");
    } finally {
      pollInFlight.current = false;
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [hasActive, refresh]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, []);

  const runProductSearch = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (q.length < 2) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const response = await authenticatedFetch(
          `${endpoints.queueProductSearch}?q=${encodeURIComponent(q)}&limit=20`,
        );
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload?.error?.message || "Product search failed");
        }
        setSearchResults((payload.data?.products || []) as ProductOption[]);
        setSearchOpen(true);
        setError("");
      } catch (err) {
        setSearchResults([]);
        setError(err instanceof Error ? err.message : "Product search failed");
      } finally {
        setSearching(false);
      }
    },
    [authenticatedFetch],
  );

  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    setSearchOpen(true);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      void runProductSearch(value);
    }, 300);
  };

  const addProduct = (product: ProductOption) => {
    setPickedProducts((prev) => (prev.some((p) => p.id === product.id) ? prev : [...prev, product]));
    setSearchQuery("");
    setSearchResults([]);
    setSearchOpen(false);
  };

  const removeProduct = (productId: string) => {
    setPickedProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const enqueueProducts = async () => {
    if (!pickedProducts.length) {
      setError("Select at least one product from the search results");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await authenticatedFetch(endpoints.queueEnqueueShopify, {
        method: "POST",
        body: JSON.stringify({ productIds: pickedProducts.map((p) => p.id) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload?.error?.message || "Enqueue failed");
      }
      setEnqueueResult(payload.data as EnqueueResult);
      setMessage(
        `Queued ${payload.data.imagesQueued} image(s); skipped ${payload.data.duplicatesSkipped} duplicate(s).`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enqueue failed");
    } finally {
      setBusy(false);
    }
  };

  const startProcessing = async () => {
    setStarting(true);
    setError("");
    setMessage("");
    try {
      const response = await authenticatedFetch(endpoints.batchesStart, { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload?.error?.message || "Start processing failed");
      }
      if (!payload.data?.batchId) {
        setMessage(payload.message || "No pending Shopify images are available.");
      } else {
        setMessage(`Batch created with ${payload.data.itemCount} item(s).`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Start processing failed");
    } finally {
      window.setTimeout(() => setStarting(false), 600);
    }
  };

  const retryFailed = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(endpoints.queueRetryAllFailed, { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload?.error?.message || "Retry failed");
      }
      setMessage(`Scheduled ${payload.data.retriedCount} failed item(s) for retry.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  };

  const retrySelected = async () => {
    if (!selected.size) return;
    setBusy(true);
    try {
      const response = await authenticatedFetch(endpoints.queueRetrySelected, {
        method: "POST",
        body: JSON.stringify({ itemIds: Array.from(selected) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload?.error?.message || "Retry selected failed");
      }
      setSelected(new Set());
      setMessage(`Scheduled ${payload.data.retriedCount} selected item(s) for retry.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry selected failed");
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (itemId: string) => {
    try {
      const response = await authenticatedFetch(endpoints.queueItem(itemId));
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload?.error?.message || "Failed to load item");
      }
      setDetail(payload.data as QueueItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load item");
    }
  };

  const cancelItem = async (itemId: string) => {
    setBusy(true);
    try {
      const response = await authenticatedFetch(endpoints.queueCancelItem(itemId), { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload?.error?.message || "Cancel failed");
      }
      setMessage("Item cancelled.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <s-page heading="Jobs">
      <s-section heading="Processing queue">
        <s-paragraph>
          Queue Shopify product images, process them in batches, and preview transformed outputs in-app.
          Shopify product media is not replaced in this phase.
        </s-paragraph>
      </s-section>

      {(error || message) && (
        <s-section>
          {error ? (
            <s-banner tone="critical" heading="Error">
              <s-paragraph>{error}</s-paragraph>
            </s-banner>
          ) : null}
          {message ? (
            <s-banner tone="success" heading="Update">
              <s-paragraph>{message}</s-paragraph>
            </s-banner>
          ) : null}
        </s-section>
      )}

      <s-section heading="Summary">
        <div className="jobs-metrics">
          {[
            ["Pending", summary.pending, ""],
            ["Processing", summary.processing, "processing"],
            ["Completed", summary.completed, "completed"],
            ["Failed", summary.failed, "failed"],
            ["Total", summary.total, ""],
            ["Active batches", summary.activeBatchCount, ""],
          ].map(([label, value, tone]) => (
            <div
              key={String(label)}
              className={`jobs-metric${tone ? ` jobs-metric--${tone}` : ""}`}
            >
              <p className="jobs-metric-label">{label}</p>
              <p className="jobs-metric-value">{value}</p>
            </div>
          ))}
        </div>
      </s-section>

      <s-section heading="Add Shopify product images">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Search products by name, select from the dropdown, then add their images to the queue.
          </s-paragraph>

          <div className="jobs-search">
            <input
              className="jobs-search-input"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setSearchOpen(false), 150);
              }}
              placeholder="Search products by name…"
              aria-label="Search Shopify products"
              autoComplete="off"
            />
            {searching ? <p className="jobs-search-hint">Searching…</p> : null}
            {!searching && searchQuery.trim().length >= 2 && searchOpen && searchResults.length === 0 ? (
              <p className="jobs-search-hint">No products found</p>
            ) : null}
            {searchOpen && searchResults.length > 0 ? (
              <ul className="jobs-search-dropdown" role="listbox">
                {searchResults.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      className="jobs-search-option"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addProduct(product)}
                    >
                      {product.imageUrl ? (
                        <img className="jobs-search-thumb" src={product.imageUrl} alt="" />
                      ) : (
                        <div className="jobs-search-thumb-placeholder" />
                      )}
                      <span className="jobs-search-copy">
                        <span className="jobs-search-title">{product.title}</span>
                        <span className="jobs-search-meta">{product.handle || product.id}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {pickedProducts.length > 0 ? (
            <div className="jobs-chips">
              {pickedProducts.map((product) => (
                <div key={product.id} className="jobs-chip">
                  <p className="jobs-chip-label" title={product.title}>
                    {product.title}
                  </p>
                  <button
                    type="button"
                    className="jobs-chip-remove"
                    aria-label={`Remove ${product.title}`}
                    onClick={() => removeProduct(product.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="jobs-toolbar">
            <s-button
              variant="primary"
              onClick={() => void enqueueProducts()}
              disabled={busy || pickedProducts.length === 0}
            >
              Add product images to queue
            </s-button>
            <s-button variant="primary" onClick={() => void startProcessing()} disabled={starting}>
              Start processing
            </s-button>
            <s-button onClick={() => void retryFailed()} disabled={busy || summary.failed === 0}>
              Retry failed
            </s-button>
            <s-button onClick={() => void retrySelected()} disabled={busy || selected.size === 0}>
              Retry selected
            </s-button>
            <s-button onClick={() => void refresh()} disabled={busy}>
              Refresh
            </s-button>
          </div>

          {enqueueResult ? (
            <div className="jobs-stats-grid">
              {[
                ["Products requested", enqueueResult.productsRequested],
                ["Products found", enqueueResult.productsFound],
                ["Images found", enqueueResult.imagesFound],
                ["Images queued", enqueueResult.imagesQueued],
                ["Duplicates skipped", enqueueResult.duplicatesSkipped],
              ].map(([label, value]) => (
                <div key={String(label)} className="jobs-stat">
                  <span className="jobs-stat-label">{label}</span>
                  <span className="jobs-stat-value">{value}</span>
                </div>
              ))}
              {enqueueResult.errors?.length ? (
                <div className="jobs-stat" style={{ gridColumn: "1 / -1" }}>
                  <span className="jobs-stat-label">Errors</span>
                  <s-text tone="critical">
                    {enqueueResult.errors.map((e) => `${e.productId}: ${e.message}`).join("; ")}
                  </s-text>
                </div>
              ) : null}
            </div>
          ) : null}
        </s-stack>
      </s-section>

      <s-section heading="Queue">
        <div className="jobs-table-wrap">
          <table className="jobs-table">
            <thead>
              <tr>
                {[
                  "",
                  "Product",
                  "Image",
                  "Media ID",
                  "Batch",
                  "Status",
                  "Attempts",
                  "Added",
                  "Started",
                  "Completed",
                  "Error",
                  "Actions",
                ].map((h) => (
                  <th key={h || "select"}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="jobs-table-empty" colSpan={12}>
                    No queue items yet. Search and select Shopify products to get started.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        aria-label={`Select ${item.shopifyProductId}`}
                      />
                    </td>
                    <td>
                      <code className="jobs-mono">{item.shopifyProductId}</code>
                    </td>
                    <td>{item.originalFilename || "—"}</td>
                    <td>
                      <code className="jobs-mono">{item.shopifyMediaId}</code>
                    </td>
                    <td>{item.batchId ? String(item.batchId).slice(0, 8) : "—"}</td>
                    <td>
                      <s-badge tone={statusTone(item.status)}>{item.status}</s-badge>
                    </td>
                    <td>
                      {item.attemptCount}/{item.maxAttempts}
                    </td>
                    <td>{formatWhen(item.createdAt)}</td>
                    <td>{formatWhen(item.processingStartedAt)}</td>
                    <td>{formatWhen(item.processingCompletedAt)}</td>
                    <td className="jobs-error-cell" title={item.errorMessage || undefined}>
                      {item.errorMessage || "—"}
                    </td>
                    <td>
                      <div className="jobs-toolbar">
                        <s-button onClick={() => void openDetail(item.id)}>Details</s-button>
                        {item.status === "FAILED" ? (
                          <s-button
                            onClick={() => {
                              void (async () => {
                                setBusy(true);
                                try {
                                  const response = await authenticatedFetch(
                                    endpoints.queueRetryItem(item.id),
                                    { method: "POST" },
                                  );
                                  const payload = await response.json();
                                  if (!response.ok || !payload.success) {
                                    throw new Error(payload?.error?.message || "Retry failed");
                                  }
                                  setMessage("Item scheduled for retry.");
                                  await refresh();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : "Retry failed");
                                } finally {
                                  setBusy(false);
                                }
                              })();
                            }}
                          >
                            Retry
                          </s-button>
                        ) : null}
                        {item.status === "PENDING" || item.status === "RETRY_PENDING" ? (
                          <s-button tone="critical" onClick={() => void cancelItem(item.id)}>
                            Cancel
                          </s-button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </s-section>

      {detail ? (
        <s-section heading="Queue item details">
          <s-stack direction="block" gap="base">
            <s-button onClick={() => setDetail(null)}>Close</s-button>
            <s-text>ID: {detail.id}</s-text>
            <s-text>Status: {detail.status}</s-text>
            <s-text>Product: {detail.shopifyProductId}</s-text>
            <s-text>Media: {detail.shopifyMediaId}</s-text>
            <s-text>
              Attempts: {detail.attemptCount}/{detail.maxAttempts}
            </s-text>
            {detail.errorMessage ? <s-text tone="critical">Error: {detail.errorMessage}</s-text> : null}
            <div className="jobs-detail-grid">
              <div className="jobs-detail-card">
                <s-heading>Source (Shopify CDN)</s-heading>
                <a href={detail.shopifyCdnUrl} target="_blank" rel="noreferrer">
                  Open original
                </a>
                <img className="jobs-detail-image" src={detail.shopifyCdnUrl} alt="Shopify source" />
              </div>
              {detail.status === "COMPLETED" ? (
                <div className="jobs-detail-card">
                  <s-heading>Processed output</s-heading>
                  <AuthenticatedImage
                    src={endpoints.queueItemOutput(detail.id)}
                    alt="Processed output"
                  />
                </div>
              ) : null}
            </div>
            {detail.attempts?.length ? (
              <div className="jobs-detail-card">
                <s-heading>Attempt history</s-heading>
                <s-stack direction="block" gap="small">
                  {detail.attempts.map((a) => (
                    <s-text key={a.id}>
                      #{a.attemptNumber} {a.status}
                      {a.errorMessage ? ` — ${a.errorMessage}` : ""}
                    </s-text>
                  ))}
                </s-stack>
              </div>
            ) : null}
          </s-stack>
        </s-section>
      ) : null}
    </s-page>
  );
}

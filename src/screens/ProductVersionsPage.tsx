import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import ErrorBanner from "../components/ui/ErrorBanner";
import PageSkeleton from "../components/ui/PageSkeleton";
import StatusBadge from "../components/ui/StatusBadge";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
import { parseApiResponse } from "../utils/api";
import { navigateApp } from "../utils/routes";

type MediaItem = {
  mediaGid?: string | null;
  fileGid?: string | null;
  position?: number | null;
  isPrimary?: boolean | null;
  altText?: string | null;
  cdnUrl?: string | null;
  filename?: string | null;
};

type MediaVersion = {
  versionId: string;
  productId: string;
  shopifyProductGid: string;
  versionNumber: number;
  versionType: string;
  isActive: boolean;
  rollbackEligible: boolean;
  unavailableReason?: string | null;
  imageCount: number;
  createdAt?: string | null;
  activatedAt?: string | null;
  media?: MediaItem[];
};

type RollbackPreview = {
  productId: string;
  title?: string | null;
  eligible: boolean;
  unavailableReason?: string | null;
  alreadyActive: boolean;
  warnings?: string[];
  current?: {
    versionNumber: number;
    versionType: string;
    media?: MediaItem[];
  } | null;
  target?: {
    versionNumber: number;
    versionType: string;
    media?: MediaItem[];
  } | null;
};

type RollbackOperation = {
  operationId: string;
  status: string;
  currentStage?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
};

const ACTIVE_ROLLBACK = new Set(["QUEUED", "ROLLING_BACK"]);

type Props = {
  productId?: string;
};

function resolveProductId(prop?: string): string {
  if (prop) return prop;
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/\/products\/([^/]+)\/versions\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function MediaStrip({ media, label }: { media?: MediaItem[]; label: string }) {
  const items = media ?? [];
  return (
    <div>
      <s-text type="strong">{label}</s-text>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
        {items.length === 0 ? (
          <s-text color="subdued">No images</s-text>
        ) : (
          items
            .slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((m, idx) => (
              <div key={`${m.mediaGid || m.fileGid || idx}`} style={{ width: 88 }}>
                {m.cdnUrl ? (
                  <img
                    src={m.cdnUrl}
                    alt={m.altText || m.filename || `Image ${idx + 1}`}
                    style={{
                      width: 88,
                      height: 88,
                      objectFit: "cover",
                      borderRadius: 6,
                      border: m.isPrimary ? "2px solid #2c6ecb" : "1px solid #ddd",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 88,
                      height: 88,
                      background: "#f3f3f3",
                      borderRadius: 6,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 11,
                    }}
                  >
                    No preview
                  </div>
                )}
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  #{m.position ?? idx}
                  {m.isPrimary ? " · Primary" : ""}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

export default function ProductVersionsPage({ productId: productIdProp }: Props = {}) {
  const productId = resolveProductId(productIdProp);
  const authenticatedFetch = useAuthenticatedFetch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [versions, setVersions] = useState<MediaVersion[]>([]);
  const [preview, setPreview] = useState<RollbackPreview | null>(null);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rollbackOp, setRollbackOp] = useState<RollbackOperation | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadVersions = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(endpoints.productMediaVersions(productId));
      const data = await parseApiResponse<{ items: MediaVersion[] }>(res);
      setVersions(data.items ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load versions");
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, productId]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const stopPoll = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const pollOperation = useCallback(
    (operationId: string) => {
      stopPoll();
      const tick = async () => {
        try {
          const res = await authenticatedFetch(endpoints.rollbackOperation(operationId));
          const data = await parseApiResponse<RollbackOperation>(res);
          setRollbackOp(data);
          if (!ACTIVE_ROLLBACK.has(data.status)) {
            stopPoll();
            void loadVersions();
          }
        } catch {
          // keep polling; transient errors are ok
        }
      };
      void tick();
      pollRef.current = window.setInterval(() => void tick(), 2500);
    },
    [authenticatedFetch, loadVersions, stopPoll],
  );

  const openPreview = async (versionId: string) => {
    setBusy(true);
    setConfirmChecked(false);
    try {
      const res = await authenticatedFetch(endpoints.productRollbackPreview(productId, versionId));
      const data = await parseApiResponse<RollbackPreview>(res);
      setPreview(data);
      setPreviewVersionId(versionId);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rollback preview");
    } finally {
      setBusy(false);
    }
  };

  const confirmRollback = async () => {
    if (!previewVersionId || !confirmChecked) return;
    setBusy(true);
    try {
      const res = await authenticatedFetch(endpoints.productRollback(productId, previewVersionId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await parseApiResponse<{ operationId: string; status: string }>(res);
      setPreview(null);
      setPreviewVersionId(null);
      setRollbackOp({
        operationId: data.operationId,
        status: data.status,
        currentStage: "QUEUED",
      });
      pollOperation(data.operationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start rollback");
    } finally {
      setBusy(false);
    }
  };

  const retryRollback = async () => {
    if (!rollbackOp?.operationId) return;
    setBusy(true);
    try {
      const res = await authenticatedFetch(endpoints.rollbackOperationRetry(rollbackOp.operationId), {
        method: "POST",
      });
      const data = await parseApiResponse<{ operationId: string; status: string }>(res);
      setRollbackOp({
        operationId: data.operationId,
        status: data.status,
        currentStage: "QUEUED",
      });
      pollOperation(data.operationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry rollback");
    } finally {
      setBusy(false);
    }
  };

  const heading = useMemo(() => {
    const active = versions.find((v) => v.isActive);
    return active ? `Product Versions · v${active.versionNumber} active` : "Product Versions";
  }, [versions]);

  if (!productId) {
    return (
      <s-page heading="Product Versions">
        <ErrorBanner message="Missing product id." />
        <s-button onClick={() => navigateApp("/products/versions")}>Back to search</s-button>
      </s-page>
    );
  }

  return (
    <s-page heading={heading}>
      <s-stack direction="block" gap="base">
        <div className="aone-toolbar">
          <s-button onClick={() => navigateApp("/products/versions")}>Back to search</s-button>
          <s-button onClick={() => void loadVersions()} disabled={loading}>
            Refresh
          </s-button>
        </div>

        {error ? <ErrorBanner message={error} onRetry={() => void loadVersions()} /> : null}

        {rollbackOp ? (
          <s-banner
            tone={
              rollbackOp.status === "RESTORE_FAILED"
                ? "critical"
                : rollbackOp.status === "ROLLED_BACK"
                  ? "success"
                  : rollbackOp.status === "ROLLBACK_FAILED" || rollbackOp.status === "ROLLBACK_CONFLICT"
                    ? "warning"
                    : "info"
            }
          >
            <s-stack direction="block" gap="small">
              <s-text type="strong">
                Rollback: {rollbackOp.status}
                {rollbackOp.currentStage ? ` · ${rollbackOp.currentStage}` : ""}
              </s-text>
              {rollbackOp.lastErrorMessage ? (
                <s-text>{rollbackOp.lastErrorMessage}</s-text>
              ) : null}
              {rollbackOp.status === "RESTORE_FAILED" ? (
                <s-text>
                  Rollback and automatic recovery could not be verified. Review the product directly
                  in Shopify Admin.
                </s-text>
              ) : null}
              {(rollbackOp.status === "ROLLBACK_FAILED" ||
                rollbackOp.status === "ROLLBACK_CONFLICT" ||
                rollbackOp.status === "RESTORE_FAILED") && (
                <s-button onClick={() => void retryRollback()} disabled={busy}>
                  Retry Rollback
                </s-button>
              )}
            </s-stack>
          </s-banner>
        ) : null}

        {loading ? (
          <PageSkeleton />
        ) : versions.length === 0 ? (
          <EmptyState
            title="No versions"
            description="This product has no media version history yet."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Version</th>
                <th>Type</th>
                <th>Created</th>
                <th>Images</th>
                <th>Active</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.versionId}>
                  <td>v{v.versionNumber}</td>
                  <td>
                    <StatusBadge status={v.versionType} />
                  </td>
                  <td>{v.createdAt ? new Date(v.createdAt).toLocaleString() : "—"}</td>
                  <td>{v.imageCount}</td>
                  <td>{v.isActive ? "Yes" : "No"}</td>
                  <td>
                    {v.isActive ? (
                      "—"
                    ) : v.rollbackEligible ? (
                      <s-button
                        disabled={busy || Boolean(rollbackOp && ACTIVE_ROLLBACK.has(rollbackOp.status))}
                        onClick={() => void openPreview(v.versionId)}
                      >
                        Revert
                      </s-button>
                    ) : (
                      <s-text color="subdued">{v.unavailableReason || "Unavailable"}</s-text>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </s-stack>

      <ConfirmDialog
        open={Boolean(preview && previewVersionId)}
        title="Revert product images"
        message="This restores the complete selected image version for this product on Shopify. Shared files used by other products are not deleted."
        confirmLabel="Revert Product"
        tone="critical"
        busy={busy || !confirmChecked || Boolean(preview && (!preview.eligible || preview.alreadyActive))}
        onConfirm={() => void confirmRollback()}
        onCancel={() => {
          if (!busy) {
            setPreview(null);
            setPreviewVersionId(null);
            setConfirmChecked(false);
          }
        }}
      >
        {preview ? (
          <s-stack direction="block" gap="base">
            {!preview.eligible ? (
              <s-banner tone="warning">
                {preview.unavailableReason || "This version cannot be restored."}
              </s-banner>
            ) : null}
            <MediaStrip media={preview.current?.media} label={`Current (v${preview.current?.versionNumber ?? "—"})`} />
            <MediaStrip media={preview.target?.media} label={`Target (v${preview.target?.versionNumber ?? "—"})`} />
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
              />
              <span>
                I understand this will restore the complete selected image version for this product.
              </span>
            </label>
          </s-stack>
        ) : null}
      </ConfirmDialog>
    </s-page>
  );
}

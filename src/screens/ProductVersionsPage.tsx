import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import ErrorBanner from "../components/ui/ErrorBanner";
import PageSkeleton from "../components/ui/PageSkeleton";
import ReprocessPromptDialog, {
  type ReprocessPreview,
} from "../components/ui/ReprocessPromptDialog";
import SelectLiveImagesDialog from "../components/ui/SelectLiveImagesDialog";
import StatusBadge from "../components/ui/StatusBadge";
import Timestamp from "../components/ui/Timestamp";
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
  linkedImageVersions?: LinkedImageVersion[];
};

type LinkedImageVersion = {
  versionId: string;
  sourceMediaGid: string;
  versionNumber: number;
  versionType: string;
  shopifyFileGid?: string | null;
  shopifyCdnUrl?: string | null;
  fileSizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  isCurrent?: boolean;
  isPublished?: boolean;
  isOriginal?: boolean;
};

type LiveMediaItem = {
  mediaGid?: string | null;
  fileGid?: string | null;
  cdnUrl?: string | null;
  filename?: string | null;
  altText?: string | null;
  position?: number | null;
  isPrimary?: boolean | null;
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

type RollbackConflictDetails = {
  hasConflict?: boolean;
  membershipChanged?: boolean;
  addedMediaIds?: string[];
  removedMediaIds?: string[];
  orderChanged?: boolean;
  altChanges?: unknown[];
  featuredMediaChanged?: boolean;
  variantChanges?: unknown[];
  summary?: string | null;
  forceApplied?: boolean;
  forceRequested?: boolean;
  reprocessRequired?: boolean;
};

type RollbackOperation = {
  operationId: string;
  status: string;
  currentStage?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  conflictDetails?: RollbackConflictDetails | null;
  forceDespiteConflict?: boolean;
};

const ACTIVE_ROLLBACK = new Set(["QUEUED", "ROLLING_BACK"]);

function shortIdentity(identity: string): string {
  if (identity.startsWith("cdn:")) {
    const path = identity.slice(4);
    const name = path.split("/").pop();
    return name || path;
  }
  if (identity.startsWith("file:") || identity.startsWith("media:")) {
    const parts = identity.split("/");
    return parts[parts.length - 1] || identity;
  }
  return identity;
}

function humanizeConflictLines(details?: RollbackConflictDetails | null): string[] {
  if (!details) return [];
  const lines: string[] = [];
  const removed = details.removedMediaIds ?? [];
  const added = details.addedMediaIds ?? [];
  if (removed.length) {
    lines.push(
      `Active version expects image(s) not found on live Shopify: ${removed
        .slice(0, 5)
        .map(shortIdentity)
        .join(", ")}${removed.length > 5 ? ` (+${removed.length - 5} more)` : ""}`,
    );
  }
  if (added.length) {
    lines.push(
      `Live Shopify has extra image(s) not in the active version: ${added
        .slice(0, 5)
        .map(shortIdentity)
        .join(", ")}${added.length > 5 ? ` (+${added.length - 5} more)` : ""}`,
    );
  }
  if (details.orderChanged) {
    lines.push("Image order differs from the active version.");
  }
  if ((details.altChanges?.length ?? 0) > 0) {
    lines.push(`Alt text differs on ${details.altChanges!.length} image(s).`);
  }
  if (details.featuredMediaChanged) {
    lines.push("Featured image differs from the active version.");
  }
  if ((details.variantChanges?.length ?? 0) > 0) {
    lines.push(`Variant image links differ on ${details.variantChanges!.length} variant(s).`);
  }
  if (!lines.length && details.summary) {
    return [details.summary];
  }
  return lines;
}

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
    <div className="aone-media-strip">
      <p className="aone-media-strip-label">{label}</p>
      <div className="aone-media-grid">
        {items.length === 0 ? (
          <p className="aone-field-hint">No images</p>
        ) : (
          items
            .slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((m, idx) => (
              <figure
                key={`${m.mediaGid || m.fileGid || idx}`}
                className={`aone-media-tile${m.isPrimary ? " is-primary" : ""}`}
              >
                {m.cdnUrl ? (
                  <img
                    src={m.cdnUrl}
                    alt={m.altText || m.filename || `Image ${idx + 1}`}
                    className="aone-media-tile-img"
                  />
                ) : (
                  <div className="aone-media-tile-fallback">No preview</div>
                )}
                <figcaption className="aone-media-tile-caption">
                  #{m.position ?? idx}
                  {m.isPrimary ? " · Primary" : ""}
                </figcaption>
              </figure>
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
  const [activeDetail, setActiveDetail] = useState<MediaVersion | null>(null);
  const [preview, setPreview] = useState<RollbackPreview | null>(null);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [forceConfirmChecked, setForceConfirmChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rollbackOp, setRollbackOp] = useState<RollbackOperation | null>(null);
  const [liveMedia, setLiveMedia] = useState<LiveMediaItem[]>([]);
  const [selectedLiveGids, setSelectedLiveGids] = useState<string[]>([]);
  const [selectOpen, setSelectOpen] = useState(false);
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [reprocessPreview, setReprocessPreview] = useState<ReprocessPreview | null>(null);
  const [reprocessLoading, setReprocessLoading] = useState(false);
  const [reprocessBusy, setReprocessBusy] = useState(false);
  const [reprocessError, setReprocessError] = useState("");
  const [message, setMessage] = useState("");
  const [queuedBatchId, setQueuedBatchId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const conflictLines = useMemo(
    () => humanizeConflictLines(rollbackOp?.conflictDetails),
    [rollbackOp?.conflictDetails],
  );

  const loadVersions = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(endpoints.productMediaVersions(productId));
      const data = await parseApiResponse<{ items: MediaVersion[]; liveMedia?: LiveMediaItem[] }>(res);
      const list = data.items ?? [];
      setVersions(list);
      setLiveMedia(data.liveMedia ?? []);
      setSelectedLiveGids([]);
      const active = list.find((v) => v.isActive);
      if (active) {
        try {
          const detailRes = await authenticatedFetch(
            endpoints.productMediaVersion(productId, active.versionId),
          );
          const detail = await parseApiResponse<MediaVersion>(detailRes);
          setActiveDetail(detail);
        } catch {
          setActiveDetail(null);
        }
      } else {
        setActiveDetail(null);
      }
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

  const retryRollback = async (forceDespiteConflict = false) => {
    if (!rollbackOp?.operationId) return;
    if (forceDespiteConflict && !forceConfirmChecked) return;
    setBusy(true);
    try {
      const res = await authenticatedFetch(endpoints.rollbackOperationRetry(rollbackOp.operationId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceDespiteConflict }),
      });
      const data = await parseApiResponse<{ operationId: string; status: string }>(res);
      setForceConfirmChecked(false);
      setRollbackOp({
        operationId: data.operationId,
        status: data.status,
        currentStage: "QUEUED",
        forceDespiteConflict,
      });
      pollOperation(data.operationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry rollback");
    } finally {
      setBusy(false);
    }
  };

  const liveTiles = useMemo(() => {
    if (liveMedia.length > 0) {
      return liveMedia
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((m, idx) => ({
          key: m.mediaGid || m.fileGid || `live-${idx}`,
          mediaGid: m.mediaGid || m.fileGid || "",
          cdnUrl: m.cdnUrl,
          label: `#${m.position ?? idx}${m.isPrimary ? " · Primary" : ""}`,
          title: m.filename || m.altText || `Image ${idx + 1}`,
        }))
        .filter((t) => t.mediaGid);
    }
    const media = activeDetail?.media ?? [];
    return media
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((m, idx) => ({
        key: m.mediaGid || m.fileGid || `snap-${idx}`,
        mediaGid: m.mediaGid || m.fileGid || "",
        cdnUrl: m.cdnUrl,
        label: `#${m.position ?? idx}${m.isPrimary ? " · Primary" : ""}`,
        title: m.filename || m.altText || `Image ${idx + 1}`,
      }))
      .filter((t) => t.mediaGid);
  }, [liveMedia, activeDetail?.media]);

  const toggleLiveImage = (mediaGid: string) => {
    setSelectedLiveGids((prev) =>
      prev.includes(mediaGid) ? prev.filter((id) => id !== mediaGid) : [...prev, mediaGid],
    );
  };

  const continuingToPrompt = useRef(false);

  const reprocessBlocked = busy || Boolean(rollbackOp && ACTIVE_ROLLBACK.has(rollbackOp.status));

  const closeReprocessDialog = () => {
    setReprocessOpen(false);
    setReprocessPreview(null);
    setReprocessError("");
    setReprocessLoading(false);
    setReprocessBusy(false);
  };

  const abortReprocessFlow = () => {
    if (continuingToPrompt.current) {
      continuingToPrompt.current = false;
      setSelectOpen(false);
      return;
    }
    setSelectOpen(false);
    closeReprocessDialog();
    setSelectedLiveGids([]);
  };

  const openSelectDialog = () => {
    if (reprocessBlocked || liveTiles.length === 0) return;
    setMessage("");
    setError("");
    setSelectedLiveGids([]);
    setSelectOpen(true);
  };

  const openLiveReprocess = async () => {
    if (selectedLiveGids.length === 0) return;
    continuingToPrompt.current = true;
    setSelectOpen(false);
    setReprocessPreview(null);
    setReprocessError("");
    setReprocessLoading(true);
    setError("");
    window.setTimeout(() => {
      setReprocessOpen(true);
      continuingToPrompt.current = false;
    }, 360);
    try {
      const res = await authenticatedFetch(endpoints.productLiveReprocessPreview(productId));
      const preview = await parseApiResponse<ReprocessPreview>(res);
      setReprocessPreview({
        ...preview,
        scope: "live",
        imageCount: selectedLiveGids.length,
      });
    } catch (err) {
      setReprocessError(err instanceof Error ? err.message : "Failed to load prompt preview");
    } finally {
      setReprocessLoading(false);
    }
  };

  const backToImageSelect = () => {
    closeReprocessDialog();
    window.setTimeout(() => setSelectOpen(true), 360);
  };

  const confirmLiveReprocess = async (steps: { name: string; promptTemplate: string }[]) => {
    if (selectedLiveGids.length === 0) return;
    setReprocessBusy(true);
    setReprocessError("");
    try {
      const res = await authenticatedFetch(endpoints.productLiveReprocess(productId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaGids: selectedLiveGids, steps }),
      });
      const payload = await parseApiResponse<{ batchId?: string; imageCount?: number }>(res);
      setMessage(
        `Queued ${payload.imageCount ?? selectedLiveGids.length} live image(s) for reprocess. They will publish automatically when processing finishes. This apply cannot be undone — use Revert on a stored version to restore a complete previous image set.`,
      );
      setQueuedBatchId(payload.batchId ?? null);
      closeReprocessDialog();
      setSelectedLiveGids([]);
      void loadVersions();
    } catch (err) {
      setReprocessError(err instanceof Error ? err.message : "Reprocess failed");
    } finally {
      setReprocessBusy(false);
    }
  };

  const activeGeneratedImages = useMemo(() => {
    const linked = activeDetail?.linkedImageVersions ?? [];
    return linked.filter(
      (iv) =>
        String(iv.versionType || "").toUpperCase() === "GENERATED" ||
        (iv.isOriginal === false && String(iv.versionType || "").toUpperCase() !== "ORIGINAL"),
    );
  }, [activeDetail?.linkedImageVersions]);

  const activeSnapshotMedia = useMemo(() => {
    // Prefer generated pipeline outputs when present (e.g. one AI image among a larger gallery).
    if (activeGeneratedImages.length > 0) {
      return activeGeneratedImages.map((iv) => ({
        key: iv.versionId,
        cdnUrl: iv.shopifyCdnUrl,
        label: `${iv.versionType} v${iv.versionNumber}`,
        title: `${iv.versionType} v${iv.versionNumber}`,
        subtitle: undefined as string | undefined,
        isOriginal: Boolean(iv.isOriginal),
        fileSizeBytes: iv.fileSizeBytes,
      }));
    }
    // Fallback: product media version snapshot (full gallery for ORIGINAL-only versions).
    const media = activeDetail?.media ?? [];
    return media
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((m, idx) => {
        const fullName = m.filename || m.altText || `Image ${idx + 1}`;
        const shortName =
          fullName.length > 28 ? `${fullName.slice(0, 12)}…${fullName.slice(-10)}` : fullName;
        return {
          key: `${m.mediaGid || m.fileGid || idx}`,
          cdnUrl: m.cdnUrl,
          label: `#${m.position ?? idx}${m.isPrimary ? " · Primary" : ""}`,
          title: fullName,
          subtitle: shortName,
          isOriginal: false,
          fileSizeBytes: null as number | null,
        };
      });
  }, [activeDetail?.media, activeGeneratedImages]);

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
      <div className="aone-versions-page">
        <div className="aone-toolbar aone-toolbar-spread">
          <div className="aone-toolbar">
            <s-button onClick={() => navigateApp("/products/versions")}>Back to search</s-button>
            <s-button onClick={() => void loadVersions()} disabled={loading}>
              Refresh
            </s-button>
          </div>
          {versions.find((v) => v.isActive) ? (
            <s-badge tone="success">
              Active v{versions.find((v) => v.isActive)?.versionNumber}
            </s-badge>
          ) : null}
        </div>

        {error ? <ErrorBanner message={error} onRetry={() => void loadVersions()} /> : null}

        {message ? (
          <s-banner tone="success" heading="Live reprocess queued">
            <s-paragraph>{message}</s-paragraph>
            {queuedBatchId ? (
              <s-button onClick={() => navigateApp(`/jobs/${queuedBatchId}`)}>View job</s-button>
            ) : null}
          </s-banner>
        ) : null}

        {rollbackOp ? (
          <div
            className={`aone-rollback-panel aone-rollback-panel--${
              rollbackOp.status === "RESTORE_FAILED"
                ? "critical"
                : rollbackOp.status === "ROLLED_BACK"
                  ? "success"
                  : rollbackOp.status === "ROLLBACK_FAILED" || rollbackOp.status === "ROLLBACK_CONFLICT"
                    ? "warning"
                    : "info"
            }`}
          >
            <div className="aone-rollback-panel-header">
              <StatusBadge status={rollbackOp.status} />
              <div className="aone-rollback-panel-titles">
                <p className="aone-rollback-panel-title">
                  {rollbackOp.status === "ROLLBACK_CONFLICT"
                    ? "Rollback blocked — live media differs"
                    : rollbackOp.status === "ROLLED_BACK"
                      ? "Rollback completed"
                      : rollbackOp.status === "RESTORE_FAILED"
                        ? "Rollback restore failed"
                        : rollbackOp.status === "ROLLBACK_FAILED"
                          ? "Rollback failed"
                          : "Rollback in progress"}
                </p>
                {rollbackOp.currentStage && rollbackOp.currentStage !== rollbackOp.status ? (
                  <p className="aone-rollback-panel-stage">Stage: {rollbackOp.currentStage}</p>
                ) : null}
              </div>
            </div>

            {rollbackOp.lastErrorMessage &&
            !(rollbackOp.status === "ROLLBACK_CONFLICT" && conflictLines.length > 0) ? (
              <p className="aone-rollback-panel-message">{rollbackOp.lastErrorMessage}</p>
            ) : null}

            {rollbackOp.status === "ROLLBACK_CONFLICT" && conflictLines.length > 0 ? (
              <div className="aone-rollback-diff">
                <p className="aone-rollback-diff-label">What differs</p>
                <ul className="aone-rollback-diff-list">
                  {conflictLines.map((line) => {
                    const colon = line.indexOf(": ");
                    if (colon > 0 && colon < line.length - 2) {
                      const head = line.slice(0, colon + 1);
                      const detail = line.slice(colon + 2);
                      return (
                        <li key={line}>
                          <span className="aone-rollback-diff-head">{head}</span>
                          <code className="aone-rollback-diff-file">{detail}</code>
                        </li>
                      );
                    }
                    return <li key={line}>{line}</li>;
                  })}
                </ul>
              </div>
            ) : null}

            {rollbackOp.status === "RESTORE_FAILED" ? (
              <p className="aone-rollback-panel-message">
                Rollback and automatic recovery could not be verified. Review the product directly in
                Shopify Admin.
              </p>
            ) : null}

            {rollbackOp.status === "ROLLBACK_CONFLICT" ? (
              <div className="aone-rollback-force">
                <div className="aone-rollback-force-callout" role="note">
                  <p className="aone-rollback-force-callout-title">Force revert overwrites live media</p>
                  <p className="aone-rollback-force-callout-body">
                    This replaces whatever is currently on the Shopify product with the selected
                    historical version, even though live media no longer matches the active version
                    snapshot. Merchant edits on live may be lost.
                  </p>
                </div>
                <label className="aone-checkbox-row aone-rollback-force-check">
                  <input
                    type="checkbox"
                    checked={forceConfirmChecked}
                    onChange={(e) => setForceConfirmChecked(e.target.checked)}
                  />
                  <span>
                    I understand live Shopify media differs from the active version, and I want to
                    force revert anyway.
                  </span>
                </label>
                <div className="aone-rollback-actions">
                  <s-button onClick={() => void retryRollback(false)} disabled={busy}>
                    Retry rollback
                  </s-button>
                  <s-button
                    tone="critical"
                    variant="primary"
                    onClick={() => void retryRollback(true)}
                    disabled={busy || !forceConfirmChecked}
                  >
                    Force revert anyway
                  </s-button>
                </div>
              </div>
            ) : null}

            {(rollbackOp.status === "ROLLBACK_FAILED" ||
              rollbackOp.status === "RESTORE_FAILED") && (
              <div className="aone-rollback-actions">
                <s-button onClick={() => void retryRollback(false)} disabled={busy}>
                  Retry rollback
                </s-button>
              </div>
            )}
          </div>
        ) : null}

        {activeSnapshotMedia.length > 0 ? (
          <s-section heading="Active snapshot">
            <s-paragraph>
              {activeGeneratedImages.length > 0
                ? `Generated image file${activeGeneratedImages.length === 1 ? "" : "s"} in the active version (${activeGeneratedImages.length}).`
                : `Images in the active product version (${activeSnapshotMedia.length}).`}
            </s-paragraph>
            <div className="aone-media-grid aone-media-grid-lg">
              {activeSnapshotMedia.map((tile) => (
                <figure key={tile.key} className="aone-media-tile" title={tile.title}>
                  {tile.cdnUrl ? (
                    <img
                      src={tile.cdnUrl}
                      alt={tile.title}
                      className="aone-media-tile-img"
                    />
                  ) : (
                    <div className="aone-media-tile-fallback">No preview</div>
                  )}
                  <figcaption className="aone-media-tile-caption">
                    <span className="aone-media-tile-type">{tile.label}</span>
                    {tile.subtitle ? (
                      <span className="aone-media-tile-filename" title={tile.title}>
                        {tile.subtitle}
                      </span>
                    ) : null}
                    {tile.isOriginal ? <span className="aone-phase-chip">Original</span> : null}
                    {typeof tile.fileSizeBytes === "number" ? (
                      <span className="aone-field-hint">{Math.round(tile.fileSizeBytes / 1024)} KB</span>
                    ) : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          </s-section>
        ) : null}

        <s-section heading="Version history">
          <s-paragraph>
            Reprocess opens a modal to pick live images, then a prompt editor. Apply publishes those
            images automatically and cannot be undone on its own. Revert restores every image in a
            stored version (v1, v2, v3, …). Historical versions are never deleted.
          </s-paragraph>
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
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.versionId} className={v.isActive ? "aone-table-row-selected" : undefined}>
                    <td>
                      <s-text type="strong">v{v.versionNumber}</s-text>
                    </td>
                    <td>
                      <StatusBadge status={v.versionType} />
                    </td>
                    <td>
                      <Timestamp value={v.createdAt} />
                    </td>
                    <td>{v.imageCount}</td>
                    <td>
                      {v.isActive ? (
                        <s-badge tone="success">Active</s-badge>
                      ) : (
                        <span className="aone-field-hint">Inactive</span>
                      )}
                    </td>
                    <td>
                      <div className="aone-table-actions">
                        <s-button
                          variant={v.isActive ? "primary" : undefined}
                          disabled={reprocessBlocked || liveTiles.length === 0}
                          onClick={openSelectDialog}
                        >
                          Reprocess
                        </s-button>
                        {v.isActive ? null : v.rollbackEligible ? (
                          <s-button
                            disabled={reprocessBlocked}
                            onClick={() => void openPreview(v.versionId)}
                          >
                            Revert
                          </s-button>
                        ) : (
                          <span className="aone-field-hint" title={v.unavailableReason || undefined}>
                            {v.unavailableReason || "Unavailable"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </s-section>
      </div>

      <SelectLiveImagesDialog
        open={selectOpen}
        images={liveTiles}
        selectedGids={selectedLiveGids}
        busy={reprocessBusy}
        onToggle={toggleLiveImage}
        onSelectAll={() => setSelectedLiveGids(liveTiles.map((t) => t.mediaGid))}
        onClear={() => setSelectedLiveGids([])}
        onContinue={() => void openLiveReprocess()}
        onCancel={abortReprocessFlow}
      />

      <ReprocessPromptDialog
        open={reprocessOpen}
        title="Edit prompt"
        preview={reprocessPreview}
        loading={reprocessLoading}
        busy={reprocessBusy}
        error={reprocessError}
        confirmLabel="Apply"
        cancelLabel="Back"
        onConfirm={(steps) => void confirmLiveReprocess(steps)}
        onCancel={backToImageSelect}
      />

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
            <div className="aone-versions-compare">
              <MediaStrip media={preview.current?.media} label={`Current (v${preview.current?.versionNumber ?? "—"})`} />
              <MediaStrip media={preview.target?.media} label={`Target (v${preview.target?.versionNumber ?? "—"})`} />
            </div>
            <label className="aone-checkbox-row">
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

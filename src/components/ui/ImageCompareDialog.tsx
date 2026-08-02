import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../../services/url-schemas";
import { useAuthenticatedFetch } from "../../services/useAuthenticatedFetch";
import type { BatchImage } from "../../types/week2";
import { formatWhen } from "../../utils/format";
import StatusBadge from "./StatusBadge";
import { useModalOverlay } from "./useModalOverlay";

type View = "before" | "after";

type Props = {
  image: BatchImage | null;
  onClose: () => void;
};

export default function ImageCompareDialog({ image, onClose }: Props) {
  const authenticatedFetch = useAuthenticatedFetch();
  const [view, setView] = useState<View>("before");
  const [outputUrl, setOutputUrl] = useState("");
  const [outputLoading, setOutputLoading] = useState(false);
  const [outputError, setOutputError] = useState("");

  const { id: modalId, ref: modalRef, dismiss } = useModalOverlay(Boolean(image), onClose);
  const hasOutput = Boolean(image?.outputStorageKey);

  useEffect(() => {
    setView("before");
    setOutputError("");
  }, [image?.id]);

  // The processed file is served behind session-token auth, so it must be fetched
  // as a blob rather than pointed at directly from an <img src>.
  useEffect(() => {
    if (!image || !hasOutput) return;
    let revoked = false;
    let objectUrl = "";

    setOutputLoading(true);
    setOutputError("");
    void (async () => {
      try {
        const response = await authenticatedFetch(endpoints.batchImageOutput(image.id));
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const blob = await response.blob();
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setOutputUrl(objectUrl);
      } catch {
        if (!revoked) setOutputError("Unable to load the processed image.");
      } finally {
        if (!revoked) setOutputLoading(false);
      }
    })();

    return () => {
      revoked = true;
      setOutputUrl("");
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [authenticatedFetch, hasOutput, image]);

  const downloadOutput = useCallback(() => {
    if (!outputUrl || !image) return;
    const anchor = document.createElement("a");
    anchor.href = outputUrl;
    anchor.download = `${image.originalFilename ?? image.id}-processed.png`;
    anchor.click();
  }, [image, outputUrl]);

  if (!image) return null;

  const showingAfter = view === "after";

  return (
    <s-modal id={modalId} ref={modalRef} heading="Image details" size="large">
      <s-stack direction="block" gap="base">
        <div className="aone-toolbar">
          <s-button
            variant={showingAfter ? undefined : "primary"}
            onClick={() => setView("before")}
          >
            Previous image
          </s-button>
          <s-button
            variant={showingAfter ? "primary" : undefined}
            disabled={!hasOutput}
            onClick={() => setView("after")}
          >
            After image
          </s-button>
        </div>

        <div className="aone-compare-frame aone-checkerboard">
          {showingAfter ? (
            outputLoading ? (
              <s-paragraph>Loading processed image…</s-paragraph>
            ) : outputError ? (
              <s-paragraph tone="critical">{outputError}</s-paragraph>
            ) : outputUrl ? (
              <img className="aone-compare-image" src={outputUrl} alt="Processed result" />
            ) : (
              <s-paragraph>No processed output yet.</s-paragraph>
            )
          ) : (
            <img className="aone-compare-image" src={image.cdnUrl} alt="Original Shopify image" />
          )}
        </div>

        <s-paragraph tone="neutral">
          {showingAfter
            ? "AI processed output (not yet published to Shopify)."
            : "Original image currently on Shopify."}
        </s-paragraph>

        <div className="aone-stat-grid">
          <div className="aone-stat">
            <span className="aone-stat-label">Status</span>
            <span className="aone-stat-value">
              <StatusBadge status={image.status} />
            </span>
          </div>
          <div className="aone-stat">
            <span className="aone-stat-label">Delta</span>
            <span className="aone-stat-value">
              <StatusBadge status={image.deltaType} />
            </span>
          </div>
          <div className="aone-stat">
            <span className="aone-stat-label">Attempts</span>
            <span className="aone-stat-value">{image.attemptCount}</span>
          </div>
          <div className="aone-stat">
            <span className="aone-stat-label">Prompt step</span>
            <span className="aone-stat-value">{image.currentPromptStep || "—"}</span>
          </div>
          <div className="aone-stat">
            <span className="aone-stat-label">Source size</span>
            <span className="aone-stat-value">
              {image.width && image.height ? `${image.width} × ${image.height}` : "—"}
            </span>
          </div>
          <div className="aone-stat">
            <span className="aone-stat-label">Completed</span>
            <span className="aone-stat-value">
              {image.completedAt ? formatWhen(image.completedAt) : "—"}
            </span>
          </div>
        </div>

        {image.errorMessage ? (
          <s-banner tone="critical" heading={image.errorCode ?? "Processing error"}>
            <s-paragraph>{image.errorMessage}</s-paragraph>
          </s-banner>
        ) : null}

        <div className="aone-toolbar aone-toolbar-spread">
          <s-button onClick={dismiss}>Close</s-button>
          <s-button variant="primary" disabled={!outputUrl} onClick={downloadOutput}>
            Download processed
          </s-button>
        </div>
      </s-stack>
    </s-modal>
  );
}

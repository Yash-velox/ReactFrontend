import { useCallback, useEffect, useState } from "react";
import ErrorBanner from "../components/ui/ErrorBanner";
import PageSkeleton from "../components/ui/PageSkeleton";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
import type { Settings } from "../types/week2";
import { parseApiResponse } from "../utils/api";

export default function SettingsPage() {
  const authenticatedFetch = useAuthenticatedFetch();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [validationError, setValidationError] = useState("");

  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoPublishProcessedImages, setAutoPublishProcessedImages] = useState(false);
  const [batchIntervalMinutes, setBatchIntervalMinutes] = useState("15");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(endpoints.settings);
      const data = await parseApiResponse<Settings>(response);
      setAutoSyncEnabled(data.autoSyncEnabled);
      setAutoPublishProcessedImages(Boolean(data.autoPublishProcessedImages));
      setBatchIntervalMinutes(String(data.batchIntervalMinutes));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const validate = (): boolean => {
    const interval = Number(batchIntervalMinutes);

    if (!Number.isFinite(interval) || interval < 1) {
      setValidationError("Batch interval must be at least 1 minute.");
      return false;
    }
    setValidationError("");
    return true;
  };

  const saveSettings = async () => {
    if (!validate()) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await authenticatedFetch(endpoints.settings, {
        method: "PUT",
        body: JSON.stringify({
          autoSyncEnabled,
          autoPublishProcessedImages,
          batchIntervalMinutes: Number(batchIntervalMinutes),
        }),
      });
      const data = await parseApiResponse<Settings>(response);
      setAutoSyncEnabled(data.autoSyncEnabled);
      setAutoPublishProcessedImages(Boolean(data.autoPublishProcessedImages));
      setBatchIntervalMinutes(String(data.batchIntervalMinutes));
      setSuccess("Settings saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <s-page heading="Settings">
      <s-section heading="Processing preferences">
        <s-paragraph>
          Configure automatic batch creation from the Secondary Queue for your store.
        </s-paragraph>
      </s-section>

      {error ? (
        <s-section>
          <ErrorBanner message={error} onRetry={() => void loadSettings()} />
        </s-section>
      ) : null}

      {success ? (
        <s-section>
          <s-banner tone="success" heading="Saved">
            <s-paragraph>{success}</s-paragraph>
          </s-banner>
        </s-section>
      ) : null}

      {validationError ? (
        <s-section>
          <s-banner tone="warning" heading="Validation">
            <s-paragraph>{validationError}</s-paragraph>
          </s-banner>
        </s-section>
      ) : null}

      <s-section heading="Auto Sync">
        {loading ? (
          <PageSkeleton metricCount={0} tableRows={3} />
        ) : (
          <s-stack direction="block" gap="base">
            <label className="aone-checkbox-row">
              <input
                type="checkbox"
                checked={autoSyncEnabled}
                onChange={(e) => setAutoSyncEnabled(e.target.checked)}
              />
              <span>
                <s-text type="strong">Enable Auto Sync</s-text>
                <s-paragraph>
                  When enabled, pending Secondary Queue products are converted into processing batches
                  after the configured wait interval.
                </s-paragraph>
              </span>
            </label>

            {autoSyncEnabled ? (
              <s-banner tone="info" heading="Secondary Queue priority">
                <s-paragraph>
                  Pending Secondary Queue products will be processed first, oldest queued first, before
                  new automatic batches are created.
                </s-paragraph>
              </s-banner>
            ) : null}

            <div className="aone-field-group">
              <label className="aone-field-label" htmlFor="batch-interval">
                Batch interval (minutes)
              </label>
              <input
                id="batch-interval"
                className="aone-input"
                type="number"
                min={1}
                value={batchIntervalMinutes}
                onChange={(e) => setBatchIntervalMinutes(e.target.value)}
              />
              <p className="aone-field-hint">
                How long to wait after the first pending product enters the Secondary Queue before
                creating an automatic batch (includes all pending products at that time).
              </p>
            </div>

            <div className="aone-toolbar">
              <s-button variant="primary" onClick={() => void saveSettings()} disabled={saving || loading}>
                {saving ? "Saving…" : "Save settings"}
              </s-button>
              <s-button onClick={() => void loadSettings()} disabled={saving || loading}>
                Reset
              </s-button>
            </div>
          </s-stack>
        )}
      </s-section>

      <s-section heading="Shopify Publishing">
        {loading ? (
          <PageSkeleton metricCount={0} tableRows={2} />
        ) : (
          <s-stack direction="block" gap="base">
            <s-paragraph>
              When enabled, each product is published to Shopify as soon as its processing finishes —
              you do not wait for the rest of the batch. When disabled, you can review processed
              images and publish them manually from Jobs.
            </s-paragraph>
            <label className="aone-checkbox-row">
              <input
                type="checkbox"
                checked={autoPublishProcessedImages}
                onChange={(e) => setAutoPublishProcessedImages(e.target.checked)}
              />
              <span>
                <s-text type="strong">Automatically publish processed images to Shopify</s-text>
              </span>
            </label>
            {autoPublishProcessedImages ? (
              <s-banner tone="warning" heading="Automatic replacement">
                <s-paragraph>
                  Processed images will automatically replace the product&apos;s current image
                  associations after validation and conflict checks.
                </s-paragraph>
              </s-banner>
            ) : null}
            <div className="aone-toolbar">
              <s-button variant="primary" onClick={() => void saveSettings()} disabled={saving || loading}>
                {saving ? "Saving…" : "Save settings"}
              </s-button>
            </div>
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

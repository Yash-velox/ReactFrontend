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

    if (!Number.isFinite(interval) || !Number.isInteger(interval) || interval < 0) {
      setValidationError("Wait must be 0 or a whole number of minutes.");
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
      setSuccess("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <s-page heading="Settings">
      <div className="aone-settings-page">
        {error ? <ErrorBanner message={error} onRetry={() => void loadSettings()} /> : null}

        {success ? (
          <s-banner tone="success">
            <s-paragraph>{success}</s-paragraph>
          </s-banner>
        ) : null}

        {validationError ? (
          <s-banner tone="warning">
            <s-paragraph>{validationError}</s-paragraph>
          </s-banner>
        ) : null}

        {loading ? (
          <PageSkeleton metricCount={0} tableRows={4} />
        ) : (
          <>
            <s-section heading="Auto Sync">
              <div className="aone-settings-stack">
                <label className="aone-settings-row">
                  <input
                    className="aone-settings-checkbox"
                    type="checkbox"
                    checked={autoSyncEnabled}
                    onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                  />
                  <span className="aone-settings-row-body">
                    <span className="aone-settings-row-title">Enable Auto Sync</span>
                    <span className="aone-settings-row-desc">
                      Automatically batch queued products.
                    </span>
                  </span>
                </label>

                <div className="aone-settings-field">
                  <label className="aone-field-label" htmlFor="batch-interval">
                    Wait before batching (minutes)
                  </label>
                  <input
                    id="batch-interval"
                    className="aone-input aone-settings-input"
                    type="number"
                    min={0}
                    step={1}
                    value={batchIntervalMinutes}
                    onChange={(e) => setBatchIntervalMinutes(e.target.value)}
                    disabled={!autoSyncEnabled}
                  />
                  <p className="aone-field-hint">0 = process as soon as a webhook is queued.</p>
                </div>
              </div>
            </s-section>

            <s-section heading="Publishing">
              <div className="aone-settings-stack">
                <label className="aone-settings-row">
                  <input
                    className="aone-settings-checkbox"
                    type="checkbox"
                    checked={autoPublishProcessedImages}
                    onChange={(e) => setAutoPublishProcessedImages(e.target.checked)}
                  />
                  <span className="aone-settings-row-body">
                    <span className="aone-settings-row-title">Auto-publish to Shopify</span>
                    <span className="aone-settings-row-desc">
                      Publish each product when processing finishes. Replaces live images.
                    </span>
                  </span>
                </label>
              </div>
            </s-section>

            <div className="aone-settings-actions">
              <s-button
                variant="primary"
                onClick={() => void saveSettings()}
                disabled={saving || loading}
              >
                {saving ? "Saving…" : "Save"}
              </s-button>
              <s-button onClick={() => void loadSettings()} disabled={saving || loading}>
                Reset
              </s-button>
            </div>
          </>
        )}
      </div>
    </s-page>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import ErrorBanner from "../components/ui/ErrorBanner";
import PageSkeleton from "../components/ui/PageSkeleton";
import StatusBadge from "../components/ui/StatusBadge";
import { useModalOverlay } from "../components/ui/useModalOverlay";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
import type { PromptListStatus, PromptProductTypeListItem } from "../types/prompts";
import Timestamp from "../components/ui/Timestamp";
import { parseApiResponse } from "../utils/api";
import { navigateApp } from "../utils/routes";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ENABLED", label: "Enabled" },
  { value: "DISABLED", label: "Disabled" },
  { value: "NOT_CONFIGURED", label: "Not Configured" },
  { value: "NOT_READY", label: "Not Ready" },
];

function statusLabel(status: PromptListStatus): string {
  switch (status) {
    case "NOT_CONFIGURED":
      return "Not Configured";
    case "NOT_READY":
      return "Not Ready";
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

export default function PromptsPage() {
  const authenticatedFetch = useAuthenticatedFetch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<PromptProductTypeListItem[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PromptProductTypeListItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const searchTimer = useRef<number | undefined>(undefined);

  const addModal = useModalOverlay(addOpen, () => {
    if (!saving) setAddOpen(false);
  });

  useEffect(() => {
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => window.clearTimeout(searchTimer.current);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter && statusFilter !== "ALL") params.set("status", statusFilter);
      params.set("page", "1");
      params.set("pageSize", "100");
      const response = await authenticatedFetch(`${endpoints.promptProductTypes}?${params}`);
      const data = await parseApiResponse<{ items: PromptProductTypeListItem[] }>(response);
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product types");
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, debouncedSearch, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredEmpty = useMemo(
    () => !loading && items.length === 0,
    [loading, items.length],
  );

  const openConfigure = (item: PromptProductTypeListItem) => {
    navigateApp(`/prompts/${item.id}`);
  };

  const toggleEnabled = async (item: PromptProductTypeListItem, isEnabled: boolean) => {
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      await parseApiResponse(
        await authenticatedFetch(endpoints.promptConfiguration(item.id), {
          method: "PATCH",
          body: JSON.stringify({ isEnabled }),
        }),
      );
      setMessage(`Prompt configuration ${isEnabled ? "enabled" : "disabled"} for ${item.name}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update configuration");
    } finally {
      setBusyId(null);
    }
  };

  const submitAdd = async () => {
    const name = newName.trim();
    if (!name) {
      setAddError("Product type name is required.");
      return;
    }
    setSaving(true);
    setAddError("");
    setError("");
    try {
      await parseApiResponse(
        await authenticatedFetch(endpoints.promptProductTypes, {
          method: "POST",
          body: JSON.stringify({ name }),
        }),
      );
      setAddOpen(false);
      setNewName("");
      setMessage(`Added product type "${name}".`);
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add product type");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setError("");
    try {
      await parseApiResponse(
        await authenticatedFetch(endpoints.promptProductType(deleteTarget.id), { method: "DELETE" }),
      );
      setMessage(`Deleted product type "${deleteTarget.name}".`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete product type");
      setDeleteTarget(null);
    } finally {
      setBusyId(null);
    }
  };

  if (loading && items.length === 0) {
    return (
      <s-page heading="Prompt Management">
        <PageSkeleton />
      </s-page>
    );
  }

  return (
    <s-page heading="Prompt Management">
      <s-section>
        <s-paragraph>
          Configure sequential image-processing prompts for each Shopify product type.
        </s-paragraph>
      </s-section>

      {error ? (
        <s-section>
          <ErrorBanner message={error} onRetry={() => void load()} />
        </s-section>
      ) : null}

      {message ? (
        <s-section>
          <s-banner tone="success" heading="Updated">
            <s-paragraph>{message}</s-paragraph>
          </s-banner>
        </s-section>
      ) : null}

      <s-section>
        <div className="aone-toolbar aone-toolbar-spread">
          <div className="aone-toolbar" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
            <input
              className="aone-input"
              type="search"
              placeholder="Search product type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search product type"
              style={{ minWidth: "14rem" }}
            />
            <select
              className="aone-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Status filter"
            >
              {STATUS_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <s-button
            variant="primary"
            onClick={() => {
              setAddError("");
              setNewName("");
              setAddOpen(true);
            }}
          >
            + Add Product Type
          </s-button>
        </div>
      </s-section>

      <s-section heading="Product types">
        {filteredEmpty ? (
          <EmptyState
            title="No product types yet"
            description="Sync your Shopify catalog or add a product type manually to configure prompts."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Product Type</th>
                <th>Source</th>
                <th>Prompt Steps</th>
                <th>Status</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const canToggle = item.stepCount > 0;
                const configureLabel = item.stepCount === 0 ? "Configure" : "Edit";
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>
                      <StatusBadge status={item.source} />
                    </td>
                    <td>
                      {item.stepCount === 0
                        ? "0 Steps"
                        : `${item.stepCount} Step${item.stepCount === 1 ? "" : "s"}`}
                    </td>
                    <td>
                      <span title={statusLabel(item.status)}>
                        <StatusBadge status={item.status} />
                      </span>
                      {item.status === "NOT_READY" ? (
                        <div className="aone-field-hint">All steps are disabled</div>
                      ) : null}
                    </td>
                    <td>
                      <Timestamp value={item.updatedAt} />
                    </td>
                    <td>
                      <div className="aone-toolbar" style={{ flexWrap: "wrap", gap: "0.35rem" }}>
                        <s-button
                          onClick={() => openConfigure(item)}
                          disabled={busyId === item.id}
                        >
                          {configureLabel}
                        </s-button>
                        {canToggle && item.isEnabled ? (
                          <s-button
                            onClick={() => void toggleEnabled(item, false)}
                            disabled={busyId === item.id}
                          >
                            Disable
                          </s-button>
                        ) : null}
                        {canToggle && !item.isEnabled ? (
                          <s-button
                            onClick={() => void toggleEnabled(item, true)}
                            disabled={busyId === item.id}
                          >
                            Enable
                          </s-button>
                        ) : null}
                        {item.source === "MANUAL" ? (
                          <s-button
                            tone="critical"
                            onClick={() => setDeleteTarget(item)}
                            disabled={busyId === item.id}
                          >
                            Delete
                          </s-button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </s-section>

      {addOpen ? (
        <s-modal id={addModal.id} ref={addModal.ref} heading="Add Product Type">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Manually added types are stored in this app only. They do not change Shopify products.
            </s-paragraph>
            <div className="aone-field-group">
              <label className="aone-field-label" htmlFor="prompt-type-name">
                Product Type Name
              </label>
              <input
                id="prompt-type-name"
                className="aone-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={saving}
                autoFocus
              />
              {addError ? (
                <s-banner tone="critical">
                  <s-paragraph>{addError}</s-paragraph>
                </s-banner>
              ) : null}
            </div>
            <div className="aone-toolbar">
              <s-button onClick={addModal.dismiss} disabled={saving}>
                Cancel
              </s-button>
              <s-button variant="primary" onClick={() => void submitAdd()} disabled={saving}>
                {saving ? "Saving…" : "Add"}
              </s-button>
            </div>
          </s-stack>
        </s-modal>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete product type?"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}" and its saved prompt configuration and steps? Shopify products are not modified.`
            : ""
        }
        confirmLabel="Delete"
        tone="critical"
        busy={busyId === deleteTarget?.id}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </s-page>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import ErrorBanner from "../components/ui/ErrorBanner";
import PageSkeleton from "../components/ui/PageSkeleton";
import StatusBadge from "../components/ui/StatusBadge";
import { useModalOverlay } from "../components/ui/useModalOverlay";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
import type { PromptConfigurationDetail, PromptStep } from "../types/prompts";
import { PROMPT_VARIABLES } from "../types/prompts";
import { parseApiResponse } from "../utils/api";
import { appPath } from "../utils/routes";

const MAX_NAME = 150;
const MAX_PROMPT = 20000;

function truncate(text: string, max = 80): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

type StepFormState = {
  name: string;
  promptText: string;
  isEnabled: boolean;
};

const emptyForm = (): StepFormState => ({
  name: "",
  promptText: "",
  isEnabled: true,
});

type Props = {
  /** When rendered from Shopify Remix routes, pass the param explicitly. */
  productTypeId?: string;
};

function resolveProductTypeId(prop?: string): string {
  if (prop) return prop;
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/\/prompts\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export default function PromptConfigurationPage({ productTypeId: productTypeIdProp }: Props = {}) {
  const productTypeId = resolveProductTypeId(productTypeIdProp);
  const authenticatedFetch = useAuthenticatedFetch();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<PromptConfigurationDetail | null>(null);

  const [stepModalOpen, setStepModalOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<PromptStep | null>(null);
  const [form, setForm] = useState<StepFormState>(emptyForm());
  const [formError, setFormError] = useState("");
  const [deleteStep, setDeleteStep] = useState<PromptStep | null>(null);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [menuStepId, setMenuStepId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const stepModal = useModalOverlay(stepModalOpen, () => {
    if (!saving) setStepModalOpen(false);
  });

  const closeStepMenu = useCallback(() => {
    setMenuStepId(null);
    setMenuPos(null);
  }, []);

  const openStepMenu = useCallback((stepId: string) => {
    const trigger = menuTriggerRefs.current.get(stepId);
    if (!trigger) {
      setMenuStepId(stepId);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 160;
    const menuHeight = 128;
    const gap = 6;
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      window.innerWidth - menuWidth - 8,
    );
    // Prefer opening upward so table overflow never clips the menu.
    let top = rect.top - menuHeight - gap;
    if (top < 8) {
      top = rect.bottom + gap;
    }
    setMenuPos({ top, left });
    setMenuStepId(stepId);
  }, []);

  useEffect(() => {
    if (!menuStepId) return;
    const onDocClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        const trigger = menuTriggerRefs.current.get(menuStepId);
        if (trigger && trigger.contains(event.target as Node)) return;
        closeStepMenu();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeStepMenu();
    };
    const onReposition = () => {
      openStepMenu(menuStepId);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [menuStepId, closeStepMenu, openStepMenu]);
  const load = useCallback(async () => {
    if (!productTypeId) return;
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(endpoints.promptProductType(productTypeId));
      const data = await parseApiResponse<PromptConfigurationDetail>(response);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load configuration");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, productTypeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setConfigEnabled = async (isEnabled: boolean) => {
    if (!detail) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await parseApiResponse(
        await authenticatedFetch(endpoints.promptConfiguration(detail.productTypeId), {
          method: "PATCH",
          body: JSON.stringify({ isEnabled }),
        }),
      );
      setMessage(`Configuration ${isEnabled ? "enabled" : "disabled"}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update configuration");
    } finally {
      setSaving(false);
    }
  };

  const openAddStep = () => {
    setEditingStep(null);
    setForm(emptyForm());
    setFormError("");
    setStepModalOpen(true);
  };

  const openEditStep = (step: PromptStep) => {
    setEditingStep(step);
    setForm({
      name: step.name,
      promptText: step.promptText,
      isEnabled: step.isEnabled,
    });
    setFormError("");
    setStepModalOpen(true);
  };

  const insertVariable = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      setForm((prev) => ({
        ...prev,
        promptText: prev.promptText ? `${prev.promptText} ${token}` : token,
      }));
      return;
    }
    const start = el.selectionStart ?? form.promptText.length;
    const end = el.selectionEnd ?? start;
    const before = form.promptText.slice(0, start);
    const after = form.promptText.slice(end);
    const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
    const insert = `${needsSpaceBefore ? " " : ""}${token}`;
    const next = `${before}${insert}${after}`;
    setForm((prev) => ({ ...prev, promptText: next }));
    requestAnimationFrame(() => {
      const pos = before.length + insert.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const validateForm = (): boolean => {
    const name = form.name.trim();
    if (!name) {
      setFormError("Step name is required.");
      return false;
    }
    if (name.length > MAX_NAME) {
      setFormError(`Step name must be at most ${MAX_NAME} characters.`);
      return false;
    }
    if (!form.promptText.trim()) {
      setFormError("Prompt text is required.");
      return false;
    }
    if (form.promptText.length > MAX_PROMPT) {
      setFormError(`Prompt text must be at most ${MAX_PROMPT} characters.`);
      return false;
    }
    setFormError("");
    return true;
  };

  const saveStep = async () => {
    if (!detail || !validateForm()) return;
    setSaving(true);
    setFormError("");
    setError("");
    try {
      if (editingStep) {
        await parseApiResponse(
          await authenticatedFetch(endpoints.promptStep(editingStep.id), {
            method: "PUT",
            body: JSON.stringify({
              name: form.name.trim(),
              promptText: form.promptText,
              isEnabled: form.isEnabled,
            }),
          }),
        );
        setMessage("Prompt step updated.");
      } else {
        await parseApiResponse(
          await authenticatedFetch(endpoints.promptProductTypeSteps(detail.productTypeId), {
            method: "POST",
            body: JSON.stringify({
              name: form.name.trim(),
              promptText: form.promptText,
              isEnabled: form.isEnabled,
            }),
          }),
        );
        setMessage("Prompt step added.");
      }
      setStepModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save step");
    } finally {
      setSaving(false);
    }
  };

  const setStepEnabled = async (step: PromptStep, isEnabled: boolean) => {
    setBusyStepId(step.id);
    setError("");
    try {
      await parseApiResponse(
        await authenticatedFetch(endpoints.promptStepStatus(step.id), {
          method: "PATCH",
          body: JSON.stringify({ isEnabled }),
        }),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update step status");
    } finally {
      setBusyStepId(null);
    }
  };

  const moveStep = async (step: PromptStep, direction: -1 | 1) => {
    if (!detail) return;
    const ordered = [...detail.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const index = ordered.findIndex((s) => s.id === step.id);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= ordered.length) return;
    const next = [...ordered];
    const tmp = next[index];
    next[index] = next[swapWith];
    next[swapWith] = tmp;
    setBusyStepId(step.id);
    setError("");
    try {
      await parseApiResponse(
        await authenticatedFetch(endpoints.promptProductTypeStepsReorder(detail.productTypeId), {
          method: "PUT",
          body: JSON.stringify({ stepIds: next.map((s) => s.id) }),
        }),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder steps");
    } finally {
      setBusyStepId(null);
    }
  };

  const confirmDeleteStep = async () => {
    if (!deleteStep) return;
    setBusyStepId(deleteStep.id);
    setError("");
    try {
      await parseApiResponse(
        await authenticatedFetch(endpoints.promptStep(deleteStep.id), { method: "DELETE" }),
      );
      setMessage("Prompt step deleted.");
      setDeleteStep(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete step");
      setDeleteStep(null);
    } finally {
      setBusyStepId(null);
    }
  };

  if (loading && !detail) {
    return (
      <s-page heading="Prompt Configuration">
        <PageSkeleton />
      </s-page>
    );
  }

  if (!detail) {
    return (
      <s-page heading="Prompt Configuration">
        <s-section>
          <ErrorBanner message={error || "Configuration not found"} />
          <div className="aone-toolbar" style={{ marginTop: "0.75rem" }}>
            <s-button href={appPath("/prompts")}>← Back to Prompts</s-button>
          </div>
        </s-section>
      </s-page>
    );
  }

  const steps = [...detail.steps].sort((a, b) => a.stepOrder - b.stepOrder);

  return (
    <s-page heading="Prompt Configuration">
      <s-section>
        <div className="aone-toolbar aone-toolbar-spread">
          <s-button href={appPath("/prompts")}>← Back to Prompts</s-button>
          {message ? (
            <s-badge tone="success">{message}</s-badge>
          ) : (
            <span className="aone-field-hint">{saving ? "Saving…" : ""}</span>
          )}
        </div>
      </s-section>

      {error ? (
        <s-section>
          <ErrorBanner message={error} onRetry={() => void load()} />
        </s-section>
      ) : null}

      <s-section heading={detail.name}>
        <div className="aone-toolbar" style={{ flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
          <div>
            <div className="aone-field-hint">Source</div>
            <StatusBadge status={detail.source} />
          </div>
          <div>
            <div className="aone-field-hint">Configuration Status</div>
            <StatusBadge status={detail.status} />
          </div>
          <div>
            <div className="aone-field-hint">Total Steps</div>
            <strong>{detail.stepCount}</strong>
          </div>
          <label className="aone-checkbox-row" style={{ marginLeft: "auto" }}>
            <input
              type="checkbox"
              checked={detail.isEnabled}
              disabled={saving}
              onChange={(e) => void setConfigEnabled(e.target.checked)}
            />
            <span>Prompt Configuration: {detail.isEnabled ? "Enabled" : "Disabled"}</span>
          </label>
        </div>
        {detail.status === "NOT_READY" ? (
          <s-banner tone="warning" heading="Not ready for processing">
            <s-paragraph>
              This configuration is enabled but every step is disabled. Enable at least one step
              before processing products of this type.
            </s-paragraph>
          </s-banner>
        ) : null}
      </s-section>

      <s-section heading="Sequential prompt steps">
        {steps.length === 0 ? (
          <EmptyState
            title="No prompt steps yet"
            description="Add sequential steps that will run in order during image processing."
            action={
              <s-button variant="primary" onClick={openAddStep}>
                + Add Prompt Step
              </s-button>
            }
          />
        ) : (
          <>
            <DataTable>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Step Name</th>
                  <th>Prompt Preview</th>
                  <th>Variables</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((step, index) => (
                  <tr key={step.id}>
                    <td>{step.stepOrder}</td>
                    <td>
                      <strong>{step.name}</strong>
                    </td>
                    <td title={step.promptText}>{truncate(step.promptText)}</td>
                    <td>
                      {step.variables.length
                        ? step.variables.map((v) => `{{${v}}}`).join(", ")
                        : "—"}
                    </td>
                    <td>
                      <StatusBadge status={step.isEnabled ? "ENABLED" : "DISABLED"} />
                    </td>
                    <td>
                      <div className="aone-step-actions">
                        <button
                          type="button"
                          className="aone-icon-btn"
                          title="Move up"
                          aria-label={`Move ${step.name} up`}
                          onClick={() => void moveStep(step, -1)}
                          disabled={index === 0 || busyStepId === step.id}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="aone-icon-btn"
                          title="Move down"
                          aria-label={`Move ${step.name} down`}
                          onClick={() => void moveStep(step, 1)}
                          disabled={index === steps.length - 1 || busyStepId === step.id}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="aone-icon-btn aone-overflow-trigger"
                          title="More actions"
                          aria-label={`More actions for ${step.name}`}
                          aria-haspopup="menu"
                          aria-expanded={menuStepId === step.id}
                          disabled={busyStepId === step.id}
                          ref={(node) => {
                            if (node) menuTriggerRefs.current.set(step.id, node);
                            else menuTriggerRefs.current.delete(step.id);
                          }}
                          onClick={() => {
                            if (menuStepId === step.id) closeStepMenu();
                            else openStepMenu(step.id);
                          }}
                        >
                          ⋮
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <div className="aone-toolbar" style={{ marginTop: "1rem" }}>
              <s-button variant="primary" onClick={openAddStep}>
                + Add Prompt Step
              </s-button>
            </div>
          </>
        )}
      </s-section>

      {menuStepId && menuPos
        ? (() => {
            const step = steps.find((s) => s.id === menuStepId);
            if (!step) return null;
            return (
              <div
                ref={menuRef}
                className="aone-overflow-panel aone-overflow-panel-fixed"
                role="menu"
                style={{ top: menuPos.top, left: menuPos.left }}
              >
                <button
                  type="button"
                  className="aone-overflow-item"
                  role="menuitem"
                  onClick={() => {
                    closeStepMenu();
                    openEditStep(step);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="aone-overflow-item"
                  role="menuitem"
                  onClick={() => {
                    closeStepMenu();
                    void setStepEnabled(step, !step.isEnabled);
                  }}
                >
                  {step.isEnabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  className="aone-overflow-item is-critical"
                  role="menuitem"
                  onClick={() => {
                    closeStepMenu();
                    setDeleteStep(step);
                  }}
                >
                  Delete
                </button>
              </div>
            );
          })()
        : null}

      {stepModalOpen ? (
        <s-modal
          id={stepModal.id}
          ref={stepModal.ref}
          heading={editingStep ? "Edit Prompt Step" : "Add Prompt Step"}
        >
          <s-stack direction="block" gap="base">
            <div className="aone-field-group">
              <label className="aone-field-label" htmlFor="step-name">
                Step Name
              </label>
              <input
                id="step-name"
                className="aone-input"
                value={form.name}
                maxLength={MAX_NAME}
                disabled={saving}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="aone-field-group aone-field-group-wide">
              <label className="aone-field-label" htmlFor="step-prompt">
                Prompt Text
              </label>
              <textarea
                id="step-prompt"
                ref={textareaRef}
                className="aone-input aone-prompt-textarea"
                rows={10}
                value={form.promptText}
                maxLength={MAX_PROMPT}
                disabled={saving}
                onChange={(e) => setForm((p) => ({ ...p, promptText: e.target.value }))}
              />
              <div className="aone-field-hint">
                {form.promptText.length.toLocaleString()} / {MAX_PROMPT.toLocaleString()} characters
              </div>
            </div>
            <div className="aone-field-group">
              <label className="aone-field-label" htmlFor="insert-variable">
                Insert Variable
              </label>
              <select
                id="insert-variable"
                className="aone-select"
                defaultValue=""
                disabled={saving}
                onChange={(e) => {
                  const token = e.target.value;
                  if (token) {
                    insertVariable(token);
                    e.target.value = "";
                  }
                }}
              >
                <option value="">Select a variable…</option>
                {PROMPT_VARIABLES.map((v) => (
                  <option key={v.name} value={v.token}>
                    {v.token}
                  </option>
                ))}
              </select>
            </div>
            <label className="aone-checkbox-row">
              <input
                type="checkbox"
                checked={form.isEnabled}
                disabled={saving}
                onChange={(e) => setForm((p) => ({ ...p, isEnabled: e.target.checked }))}
              />
              <span>Step enabled</span>
            </label>
            {formError ? (
              <s-banner tone="critical">
                <s-paragraph>{formError}</s-paragraph>
              </s-banner>
            ) : null}
            <div className="aone-toolbar">
              <s-button onClick={stepModal.dismiss} disabled={saving}>
                Cancel
              </s-button>
              <s-button variant="primary" onClick={() => void saveStep()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </s-button>
            </div>
          </s-stack>
        </s-modal>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteStep)}
        title="Delete prompt step?"
        message={
          deleteStep
            ? `Delete step "${deleteStep.name}"? Remaining steps will be re-ordered automatically.`
            : ""
        }
        confirmLabel="Delete"
        tone="critical"
        busy={busyStepId === deleteStep?.id}
        onConfirm={() => void confirmDeleteStep()}
        onCancel={() => setDeleteStep(null)}
      />
    </s-page>
  );
}

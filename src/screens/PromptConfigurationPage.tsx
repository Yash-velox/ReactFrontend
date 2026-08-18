import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import AonePage from "../components/ui/AonePage";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import ErrorBanner from "../components/ui/ErrorBanner";
import LockedDialog from "../components/ui/LockedDialog";
import PageSkeleton from "../components/ui/PageSkeleton";
import RowDetailDialog, { detailText } from "../components/ui/RowDetailDialog";
import StatusBadge from "../components/ui/StatusBadge";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
import type { PromptConfigurationDetail, PromptStep } from "../types/prompts";
import { parseApiResponse } from "../utils/api";
import { formatWhenFull } from "../utils/format";
import { navigateApp } from "../utils/routes";

const MAX_NAME = 150;

const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

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

function GripIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true" focusable="false">
      <circle cx="3" cy="3" r="1.35" fill="currentColor" />
      <circle cx="9" cy="3" r="1.35" fill="currentColor" />
      <circle cx="3" cy="8" r="1.35" fill="currentColor" />
      <circle cx="9" cy="8" r="1.35" fill="currentColor" />
      <circle cx="3" cy="13" r="1.35" fill="currentColor" />
      <circle cx="9" cy="13" r="1.35" fill="currentColor" />
    </svg>
  );
}

type SortableStepRowProps = {
  step: PromptStep;
  dragDisabled: boolean;
  menuOpen: boolean;
  busy: boolean;
  onToggleMenu: () => void;
  menuTriggerRef: (node: HTMLButtonElement | null) => void;
};

function SortableStepRow({
  step,
  dragDisabled,
  menuOpen,
  busy,
  onToggleMenu,
  menuTriggerRef,
}: SortableStepRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: step.id,
    disabled: dragDisabled,
  });

  return (
    <tr
      ref={setNodeRef}
      className={isDragging ? "aone-sortable-row is-dragging" : "aone-sortable-row"}
    >
      <td className="aone-col-drag">
        <button
          type="button"
          className="aone-drag-handle"
          title={`Reorder ${step.name}`}
          disabled={dragDisabled}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${step.name}`}
        >
          <GripIcon />
        </button>
      </td>
      <td className="aone-col-order">{step.stepOrder}</td>
      <td>
        <strong>{step.name}</strong>
      </td>
      <td className="aone-col-preview" title={step.promptText}>
        {truncate(step.promptText, 100)}
      </td>
      <td className="aone-col-status">
        <StatusBadge status={step.isEnabled ? "ENABLED" : "DISABLED"} />
      </td>
      <td className="aone-col-actions">
        <div className="aone-step-actions">
          <button
            type="button"
            className="aone-icon-btn aone-overflow-trigger"
            title="More actions"
            aria-label={`More actions for ${step.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={busy}
            ref={menuTriggerRef}
            onClick={onToggleMenu}
          >
            ⋮
          </button>
        </div>
      </td>
    </tr>
  );
}

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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "critical">("success");
  const [detail, setDetail] = useState<PromptConfigurationDetail | null>(null);
  const detailRef = useRef(detail);
  detailRef.current = detail;

  const [stepModalOpen, setStepModalOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<PromptStep | null>(null);
  const [form, setForm] = useState<StepFormState>(emptyForm());
  const [formError, setFormError] = useState("");
  const [deleteStep, setDeleteStep] = useState<PromptStep | null>(null);
  const [detailStep, setDetailStep] = useState<PromptStep | null>(null);
  const [deleteProductTypeOpen, setDeleteProductTypeOpen] = useState(false);
  const [deletingProductType, setDeletingProductType] = useState(false);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const reorderingRef = useRef(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const stepsAtDragStartRef = useRef<PromptStep[] | null>(null);
  const [menuStepId, setMenuStepId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [systemPromptText, setSystemPromptText] = useState("");
  const [systemPromptDirty, setSystemPromptDirty] = useState(false);
  const [systemPromptError, setSystemPromptError] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const closeStepModal = useCallback(() => {
    if (!saving) setStepModalOpen(false);
  }, [saving]);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    if (!productTypeId) return;
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(endpoints.promptProductType(productTypeId));
      const data = await parseApiResponse<PromptConfigurationDetail>(response);
      setDetail(data);
      const isSystem = Boolean(data.isCentral) || data.source === "SYSTEM";
      if (isSystem) {
        const ordered = [...(data.steps ?? [])].sort((a, b) => a.stepOrder - b.stepOrder);
        setSystemPromptText(ordered[0]?.promptText ?? "");
        setSystemPromptDirty(false);
        setSystemPromptError("");
      }
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
      setMessageTone(isEnabled ? "success" : "critical");
      setMessage(isEnabled ? "Enabled" : "Disabled");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update configuration");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteProductType = async () => {
    if (!detail) return;
    setDeletingProductType(true);
    setError("");
    try {
      await parseApiResponse(
        await authenticatedFetch(endpoints.promptProductType(detail.productTypeId), {
          method: "DELETE",
        }),
      );
      setDeleteProductTypeOpen(false);
      navigateApp("/prompts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete product type");
      setDeleteProductTypeOpen(false);
    } finally {
      setDeletingProductType(false);
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

  const validateForm = (): boolean => {
    const name = form.name.trim();
    if (name.length > MAX_NAME) {
      setFormError(`Prompt title must be at most ${MAX_NAME} characters.`);
      return false;
    }
    if (!form.promptText.trim()) {
      setFormError("Prompt text is required.");
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
    const stepName = form.name.trim() || "Untitled prompt";
    try {
      if (editingStep) {
        await parseApiResponse(
          await authenticatedFetch(endpoints.promptStep(editingStep.id), {
            method: "PUT",
            body: JSON.stringify({
              name: stepName,
              promptText: form.promptText,
              isEnabled: form.isEnabled,
            }),
          }),
        );
        setMessageTone("success");
        setMessage("Prompt step updated.");
      } else {
        await parseApiResponse(
          await authenticatedFetch(endpoints.promptProductTypeSteps(detail.productTypeId), {
            method: "POST",
            body: JSON.stringify({
              name: stepName,
              promptText: form.promptText,
              isEnabled: form.isEnabled,
            }),
          }),
        );
        setMessageTone("success");
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

  const saveSystemPrompt = async () => {
    if (!detail) return;
    const text = systemPromptText.trim();
    if (!text) {
      setSystemPromptError("Prompt text is required.");
      return;
    }
    setSaving(true);
    setSystemPromptError("");
    setError("");
    const ordered = [...detail.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const existing = ordered[0] ?? null;
    try {
      if (existing) {
        await parseApiResponse(
          await authenticatedFetch(endpoints.promptStep(existing.id), {
            method: "PUT",
            body: JSON.stringify({
              name: existing.name || "System Prompt",
              promptText: systemPromptText,
              isEnabled: true,
            }),
          }),
        );
      } else {
        await parseApiResponse(
          await authenticatedFetch(endpoints.promptProductTypeSteps(detail.productTypeId), {
            method: "POST",
            body: JSON.stringify({
              name: "System Prompt",
              promptText: systemPromptText,
              isEnabled: true,
            }),
          }),
        );
      }
      setMessageTone("success");
      setMessage("System Prompt saved.");
      setSystemPromptDirty(false);
      await load();
    } catch (err) {
      setSystemPromptError(err instanceof Error ? err.message : "Failed to save System Prompt");
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

  const persistReorder = async (nextSteps: PromptStep[], previousSteps?: PromptStep[]) => {
    const currentDetail = detailRef.current;
    if (!currentDetail || reorderingRef.current) return;
    reorderingRef.current = true;
    setReordering(true);
    const previous = previousSteps
      ? { ...currentDetail, steps: previousSteps }
      : currentDetail;
    const withOrder = nextSteps.map((step, index) => ({
      ...step,
      stepOrder: index + 1,
    }));
    setDetail({ ...currentDetail, steps: withOrder });
    setError("");
    try {
      const data = await parseApiResponse<{ items: PromptStep[] }>(
        await authenticatedFetch(endpoints.promptProductTypeStepsReorder(currentDetail.productTypeId), {
          method: "PUT",
          body: JSON.stringify({ stepIds: withOrder.map((s) => s.id) }),
        }),
      );
      setDetail((current) => (current ? { ...current, steps: data.items } : current));
    } catch (err) {
      setDetail(previous);
      setError(err instanceof Error ? err.message : "Failed to reorder steps");
    } finally {
      reorderingRef.current = false;
      setReordering(false);
    }
  };

  const orderedStepIds = (items: PromptStep[]) =>
    [...items].sort((a, b) => a.stepOrder - b.stepOrder).map((item) => item.id);

  const handleDragStart = (event: DragStartEvent) => {
    closeStepMenu();
    if (!detail) return;
    stepsAtDragStartRef.current = [...detail.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    setActiveDragId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || String(active.id) === String(over.id)) return;
    setDetail((current) => {
      if (!current) return current;
      const ordered = [...current.steps].sort((a, b) => a.stepOrder - b.stepOrder);
      const oldIndex = ordered.findIndex((item) => item.id === String(active.id));
      const newIndex = ordered.findIndex((item) => item.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return current;
      return {
        ...current,
        steps: arrayMove(ordered, oldIndex, newIndex).map((step, index) => ({
          ...step,
          stepOrder: index + 1,
        })),
      };
    });
  };

  const handleDragEnd = (_event: DragEndEvent) => {
    const started = stepsAtDragStartRef.current;
    const current = detailRef.current;
    setActiveDragId(null);
    stepsAtDragStartRef.current = null;
    if (!current || !started) return;
    if (orderedStepIds(current.steps).join() === started.map((item) => item.id).join()) return;
    void persistReorder(current.steps, started);
  };

  const handleDragCancel = () => {
    const started = stepsAtDragStartRef.current;
    setActiveDragId(null);
    stepsAtDragStartRef.current = null;
    if (started) {
      setDetail((current) => (current ? { ...current, steps: started } : current));
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
      setMessageTone("success");
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
      <AonePage heading="Prompt Configuration">
        <PageSkeleton />
      </AonePage>
    );
  }

  if (!detail) {
    return (
      <AonePage heading="Prompt Configuration">
        <s-section>
          <ErrorBanner message={error || "Configuration not found"} />
          <div className="aone-toolbar" style={{ marginTop: "0.75rem" }}>
            <s-button onClick={() => navigateApp("/prompts")}>← Back to Prompts</s-button>
          </div>
        </s-section>
      </AonePage>
    );
  }

  const steps = [...detail.steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const activeDragStep = activeDragId ? steps.find((step) => step.id === activeDragId) : undefined;
  const isCentral = Boolean(detail.isCentral) || detail.source === "SYSTEM";
  const canDeleteProductType = detail.source === "MANUAL" && !isCentral;
  const isEditDirty =
    !editingStep ||
    form.name !== editingStep.name ||
    form.promptText !== editingStep.promptText ||
    form.isEnabled !== editingStep.isEnabled;

  return (
    <AonePage heading={isCentral ? "System Prompt" : "Prompt Configuration"}>
      {error ? (
        <s-section>
          <ErrorBanner message={error} onRetry={() => void load()} />
        </s-section>
      ) : null}

      <s-section heading={detail.name}>
        <div className="aone-config-summary">
          <div className="aone-config-nav">
            <s-button onClick={() => navigateApp("/prompts")}>← Back to Prompts</s-button>
            {message ? (
              <s-badge tone={messageTone}>{message}</s-badge>
            ) : (
              <span className="aone-field-hint">{saving ? "Saving…" : ""}</span>
            )}
          </div>

          <div className="aone-config-meta">
            <div className="aone-config-meta-item">
              <div className="aone-config-meta-label">Source</div>
              <div className="aone-config-meta-value">
                <StatusBadge status={detail.source} />
              </div>
            </div>
            <div className="aone-config-meta-item">
              <div className="aone-config-meta-label">Configuration Status</div>
              <div className="aone-config-meta-value">
                <StatusBadge status={detail.status} />
              </div>
            </div>
            <div className="aone-config-meta-item">
              <div className="aone-config-meta-label">{isCentral ? "Prompt" : "Total Steps"}</div>
              <div className="aone-config-meta-value">
                {isCentral ? (detail.stepCount > 0 ? "Configured" : "Not set") : detail.stepCount}
              </div>
            </div>
            {!isCentral || canDeleteProductType ? (
              <div className="aone-config-actions">
                {!isCentral ? (
                  <label className="aone-config-toggle">
                    <input
                      type="checkbox"
                      checked={detail.isEnabled}
                      disabled={saving || deletingProductType}
                      onChange={(e) => void setConfigEnabled(e.target.checked)}
                    />
                    <span>Prompt Configuration: {detail.isEnabled ? "Enabled" : "Disabled"}</span>
                  </label>
                ) : null}
                {canDeleteProductType ? (
                  <s-button
                    tone="critical"
                    disabled={saving || deletingProductType}
                    onClick={() => setDeleteProductTypeOpen(true)}
                  >
                    {deletingProductType ? "Deleting…" : "Delete"}
                  </s-button>
                ) : null}
              </div>
            ) : null}
          </div>

          {detail.status === "NOT_READY" || (isCentral && detail.stepCount === 0) ? (
            <s-banner tone="warning" heading={isCentral ? "Add a prompt" : "Add a step"}>
              <s-paragraph>
                {isCentral
                  ? "Save a System Prompt before processing products without a ready type prompt."
                  : "Turn on at least one step before processing."}
              </s-paragraph>
            </s-banner>
          ) : null}
        </div>
      </s-section>

      {isCentral ? (
        <s-section heading="System Prompt">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              One shop-wide prompt for this store. Not a sequential workflow.
            </s-paragraph>
            <div className="aone-field-group aone-field-group-wide">
              <label className="aone-field-label" htmlFor="system-prompt-text">
                Prompt text
              </label>
              <textarea
                id="system-prompt-text"
                className="aone-input aone-prompt-textarea"
                rows={12}
                value={systemPromptText}
                disabled={saving}
                onChange={(e) => {
                  setSystemPromptText(e.target.value);
                  setSystemPromptDirty(true);
                }}
              />
              <div className="aone-field-hint">
                {systemPromptText.length.toLocaleString()} characters
              </div>
            </div>
            {systemPromptError ? (
              <s-banner tone="critical">
                <s-paragraph>{systemPromptError}</s-paragraph>
              </s-banner>
            ) : null}
            <div className="aone-toolbar">
              <s-button
                variant="primary"
                onClick={() => void saveSystemPrompt()}
                disabled={saving || !systemPromptDirty}
              >
                {saving ? "Saving…" : "Save System Prompt"}
              </s-button>
            </div>
          </s-stack>
        </s-section>
      ) : (
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              autoScroll={false}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="aone-steps-table">
              <DataTable>
                <thead>
                  <tr>
                    <th className="aone-col-drag" aria-label="Reorder" />
                    <th className="aone-col-order">Order</th>
                    <th>Prompt title</th>
                    <th>Prompt Preview</th>
                    <th className="aone-col-status">Status</th>
                    <th className="aone-col-actions">Actions</th>
                  </tr>
                </thead>
                <SortableContext
                  items={steps.map((step) => step.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody>
                    {steps.map((step) => (
                      <SortableStepRow
                        key={step.id}
                        step={step}
                        dragDisabled={reordering || steps.length < 2}
                        menuOpen={menuStepId === step.id}
                        busy={reordering || busyStepId === step.id}
                        onToggleMenu={() => {
                          if (menuStepId === step.id) closeStepMenu();
                          else openStepMenu(step.id);
                        }}
                        menuTriggerRef={(node) => {
                          if (node) menuTriggerRefs.current.set(step.id, node);
                          else menuTriggerRefs.current.delete(step.id);
                        }}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </DataTable>
              </div>
              <DragOverlay dropAnimation={null}>
                {activeDragStep ? (
                  <div className="aone-step-drag-overlay">
                    <GripIcon />
                    <span className="aone-step-drag-overlay-order">{activeDragStep.stepOrder}</span>
                    <strong>{activeDragStep.name}</strong>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
            <div className="aone-config-steps-footer">
              <s-button variant="primary" onClick={openAddStep}>
                + Add Prompt Step
              </s-button>
            </div>
          </>
        )}
      </s-section>
      )}

      {!isCentral && menuStepId && menuPos
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

      {!isCentral && stepModalOpen ? (
        <LockedDialog
          open={stepModalOpen}
          title={editingStep ? "Edit Prompt Step" : "Add Prompt Step"}
          busy={saving}
          onClose={closeStepModal}
        >
          <s-stack direction="block" gap="base">
            <div className="aone-field-group">
              <label className="aone-field-label" htmlFor="step-name">
                Prompt title
              </label>
              <input
                id="step-name"
                className="aone-input"
                value={form.name}
                maxLength={MAX_NAME}
                disabled={saving}
                placeholder="Optional — defaults to Untitled prompt"
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
              <div className="aone-field-hint">Optional. Leave blank to use “Untitled prompt”.</div>
            </div>
            <div className="aone-field-group aone-field-group-wide">
              <label className="aone-field-label" htmlFor="step-prompt">
                Prompt Text
              </label>
              <textarea
                id="step-prompt"
                className="aone-input aone-prompt-textarea"
                rows={10}
                value={form.promptText}
                disabled={saving}
                onChange={(e) => setForm((p) => ({ ...p, promptText: e.target.value }))}
              />
              <div className="aone-field-hint">
                {form.promptText.length.toLocaleString()} characters
              </div>
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
              <s-button onClick={closeStepModal} disabled={saving}>
                Close
              </s-button>
              <s-button
                variant="primary"
                onClick={() => void saveStep()}
                disabled={saving || (Boolean(editingStep) && !isEditDirty)}
              >
                {saving ? "Saving…" : "Save"}
              </s-button>
            </div>
          </s-stack>
        </LockedDialog>
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

      <ConfirmDialog
        open={deleteProductTypeOpen}
        title="Delete product type?"
        message={`Delete "${detail.name}" and its saved prompt configuration and steps? Shopify products are not modified.`}
        confirmLabel="Delete"
        tone="critical"
        busy={deletingProductType}
        onConfirm={() => void confirmDeleteProductType()}
        onCancel={() => setDeleteProductTypeOpen(false)}
      />

      <RowDetailDialog
        open={Boolean(detailStep)}
        title="Prompt step details"
        onClose={() => setDetailStep(null)}
        fields={
          detailStep
            ? [
                { label: "Order", value: detailStep.stepOrder },
                { label: "Prompt title", value: detailStep.name },
                { label: "Status", value: detailStep.isEnabled ? "ENABLED" : "DISABLED" },
                {
                  label: "Variables",
                  value: detailStep.variables.length
                    ? detailStep.variables.map((v) => `{{${v}}}`).join(", ")
                    : "—",
                },
                { label: "Prompt text", value: detailStep.promptText },
                { label: "Created", value: detailText(formatWhenFull(detailStep.createdAt)) },
                { label: "Updated", value: detailText(formatWhenFull(detailStep.updatedAt)) },
                { label: "Step ID", value: detailStep.id },
              ]
            : []
        }
      />
    </AonePage>
  );
}

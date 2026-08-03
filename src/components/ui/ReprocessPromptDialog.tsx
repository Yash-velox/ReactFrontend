import { useEffect, useState } from "react";
import { useModalOverlay } from "./useModalOverlay";

export type ReprocessPromptStep = {
  step: number;
  name: string;
  promptTemplate: string;
  renderedPrompt?: string;
  variables?: string[];
};

export type ReprocessPreview = {
  scope: "batch" | "product" | "image";
  note?: string;
  steps: ReprocessPromptStep[];
  productCount?: number;
  imageCount?: number;
  productTypes?: string[];
  productType?: string | null;
  oneTimeOverride?: boolean;
};

type EditableStep = {
  step: number;
  name: string;
  promptTemplate: string;
  renderedPrompt?: string;
};

type Props = {
  open: boolean;
  title: string;
  preview: ReprocessPreview | null;
  loading?: boolean;
  busy?: boolean;
  error?: string;
  onConfirm: (steps: { name: string; promptTemplate: string }[]) => void;
  onCancel: () => void;
};

export default function ReprocessPromptDialog({
  open,
  title,
  preview,
  loading = false,
  busy = false,
  error = "",
  onConfirm,
  onCancel,
}: Props) {
  const { id: modalId, ref: modalRef, dismiss } = useModalOverlay(open, onCancel);
  const [steps, setSteps] = useState<EditableStep[]>([]);

  useEffect(() => {
    if (!preview?.steps) {
      setSteps([]);
      return;
    }
    setSteps(
      preview.steps.map((s) => ({
        step: s.step,
        name: s.name,
        promptTemplate: s.promptTemplate,
        renderedPrompt: s.renderedPrompt,
      })),
    );
  }, [preview]);

  if (!open) return null;

  return (
    <s-modal id={modalId} ref={modalRef} heading={title}>
      <s-stack direction="block" gap="base">
        {loading ? (
          <s-text>Loading prompt preview…</s-text>
        ) : (
          <>
            <s-banner tone="info" heading="One-time override">
              <s-paragraph>
                {preview?.note ||
                  "Edits apply to this reprocess only and do not change saved Prompt Configuration."}
              </s-paragraph>
            </s-banner>

            {preview?.scope === "batch" ? (
              <s-text>
                Reprocessing {preview.productCount ?? 0} product(s)
                {preview.imageCount != null ? ` / ${preview.imageCount} image(s)` : ""}
                {preview.productTypes?.length
                  ? ` · types: ${preview.productTypes.join(", ")}`
                  : ""}
              </s-text>
            ) : null}

            {preview?.productType ? (
              <s-text>
                Product type: <strong>{preview.productType}</strong>
              </s-text>
            ) : null}

            {error ? (
              <s-banner tone="critical" heading="Cannot reprocess">
                <s-paragraph>{error}</s-paragraph>
              </s-banner>
            ) : null}

            {steps.map((step, index) => (
              <s-stack key={`${step.step}-${index}`} direction="block" gap="small">
                <s-text>
                  Step {step.step}: {step.name}
                </s-text>
                <label className="aone-field">
                  <span className="aone-field-label">Prompt (editable)</span>
                  <textarea
                    className="aone-input aone-prompt-textarea"
                    rows={5}
                    value={step.promptTemplate}
                    disabled={busy}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSteps((prev) =>
                        prev.map((s, i) => (i === index ? { ...s, promptTemplate: value } : s)),
                      );
                    }}
                  />
                </label>
                {step.renderedPrompt ? (
                  <s-text tone="neutral">
                    Sample with current variables: {step.renderedPrompt}
                  </s-text>
                ) : null}
              </s-stack>
            ))}

            {!error && steps.length === 0 && !loading ? (
              <s-text tone="critical">No prompt steps available for this item.</s-text>
            ) : null}
          </>
        )}

        <div className="aone-toolbar">
          <s-button onClick={dismiss} disabled={busy}>
            Cancel
          </s-button>
          <s-button
            variant="primary"
            disabled={busy || loading || Boolean(error) || steps.length === 0}
            onClick={() =>
              onConfirm(
                steps.map((s) => ({
                  name: s.name,
                  promptTemplate: s.promptTemplate,
                })),
              )
            }
          >
            {busy ? "Queuing…" : "Confirm reprocess"}
          </s-button>
        </div>
      </s-stack>
    </s-modal>
  );
}

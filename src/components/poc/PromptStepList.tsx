import type { PromptStepState } from "./types";
import AuthenticatedImage from "./AuthenticatedImage";

type PromptStepListProps = {
  steps: PromptStepState[];
  canEdit: boolean;
  onChangePrompt: (step: number, prompt: string) => void;
  onRemoveStep: (step: number) => void;
  onAddStep: () => void;
  maxSteps: number;
};

const toneForStatus = (status: PromptStepState["status"]) => {
  if (status === "COMPLETED") return "success";
  if (status === "FAILED") return "critical";
  if (status === "PROCESSING") return "caution";
  return "neutral";
};

const resizePromptTextarea = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

export default function PromptStepList({
  steps,
  canEdit,
  onChangePrompt,
  onRemoveStep,
  onAddStep,
  maxSteps,
}: PromptStepListProps) {
  return (
    <s-section heading="Sequential Prompt Builder">
      <s-stack direction="block" gap="base">
        {steps.map((step) => (
          <s-box key={step.step} padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-stack direction="inline" gap="base">
                <s-heading>Step {step.step}</s-heading>
                <s-badge tone={toneForStatus(step.status)}>{step.status}</s-badge>
              </s-stack>
              <textarea
                className="poc-prompt-textarea"
                value={step.prompt}
                placeholder="Describe the enhancement for this step"
                rows={4}
                disabled={!canEdit}
                ref={resizePromptTextarea}
                onChange={(event) => {
                  resizePromptTextarea(event.currentTarget);
                  onChangePrompt(step.step, event.target.value);
                }}
              />
              {canEdit && step.step > 1 ? (
                <s-button tone="critical" onClick={() => onRemoveStep(step.step)}>
                  Remove step
                </s-button>
              ) : null}
              {step.errorMessage ? <s-text tone="critical">{step.errorMessage}</s-text> : null}
              {step.previewUrl ? (
                <img
                  src={step.previewUrl}
                  alt={`Step ${step.step} output`}
                  className="poc-step-preview"
                />
              ) : step.imageApiUrl ? (
                <AuthenticatedImage
                  src={step.imageApiUrl}
                  alt={`Step ${step.step} output`}
                  className="poc-step-preview"
                />
              ) : step.status === "COMPLETED" ? (
                <s-text>Loading preview…</s-text>
              ) : null}
            </s-stack>
          </s-box>
        ))}

        <s-button disabled={!canEdit || steps.length >= maxSteps} onClick={onAddStep}>
          + Add Next Prompt
        </s-button>
      </s-stack>
    </s-section>
  );
}

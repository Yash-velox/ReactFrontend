import type { PromptStepState } from "./types";

type ProcessingProgressProps = {
  steps: PromptStepState[];
  isRunning?: boolean;
};

export default function ProcessingProgress({ steps, isRunning = false }: ProcessingProgressProps) {
  const activeStep = steps.find((step) => step.status === "PROCESSING");

  return (
    <s-section heading="Processing Progress">
      <s-stack direction="block" gap="small">
        {isRunning && activeStep ? (
          <s-text>Working on step {activeStep.step}…</s-text>
        ) : null}
        {steps.map((step) => (
          <s-text key={step.step}>
            Step {step.step} - {step.status}
          </s-text>
        ))}
      </s-stack>
    </s-section>
  );
}

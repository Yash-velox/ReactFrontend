export type StepStatus = "WAITING" | "PROCESSING" | "COMPLETED" | "FAILED";

export type PromptStepInput = {
  step: number;
  prompt: string;
};

export type PromptStepState = PromptStepInput & {
  status: StepStatus;
  previewUrl?: string;
  imageApiUrl?: string;
  errorMessage?: string;
};

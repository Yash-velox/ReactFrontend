import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FinalResultActions from "../components/poc/FinalResultActions";
import ImageComparisonGallery from "../components/poc/ImageComparisonGallery";
import ImageUploader from "../components/poc/ImageUploader";
import OriginalImagePreview from "../components/poc/OriginalImagePreview";
import ProcessingProgress from "../components/poc/ProcessingProgress";
import PromptStepList from "../components/poc/PromptStepList";
import type { PromptStepState } from "../components/poc/types";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";

type JobResponse = {
  success: boolean;
  data: {
    jobId: string;
    status: "PROCESSING" | "COMPLETED" | "FAILED";
    totalSteps: number;
    completedSteps: number;
    failedStep?: number | null;
    steps?: Array<{
      step: number;
      prompt: string;
      status: PromptStepState["status"];
      outputUrl?: string | null;
      errorMessage?: string | null;
    }>;
  };
};

const MAX_STEPS = 5;
const TEMP_MODE = (import.meta.env.VITE_POC_TEMP_MODE ?? "true") === "true";
const POC_JOB_STORAGE_KEY = "poc-active-job-id";

const createInitialSteps = (): PromptStepState[] => [
  {
    step: 1,
    prompt: "Improve image quality, preserve design, remove background, transparent PNG.",
    status: "WAITING",
  },
];

export default function PocPage() {
  const authenticatedFetch = useAuthenticatedFetch();
  const pollTimerRef = useRef<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string>("");
  const [steps, setSteps] = useState<PromptStepState[]>(createInitialSteps());
  const [jobId, setJobId] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const failedStep = useMemo(() => steps.find((step) => step.status === "FAILED"), [steps]);
  const finalStep = useMemo(() => steps[steps.length - 1], [steps]);
  const canDownload = Boolean(
    !TEMP_MODE ? jobId && finalStep?.status === "COMPLETED" : finalStep?.previewUrl,
  );

  const mapApiSteps = useCallback(
    (currentJobId: string, apiSteps: NonNullable<JobResponse["data"]["steps"]>, prevSteps: PromptStepState[]) =>
      apiSteps.map((step) => ({
        step: step.step,
        prompt: step.prompt,
        status: step.status,
        previewUrl: prevSteps.find((localStep) => localStep.step === step.step)?.previewUrl,
        imageApiUrl: step.outputUrl
          ? endpoints.pocGetStepImage(currentJobId, step.step)
          : undefined,
        errorMessage: step.errorMessage || undefined,
      })) satisfies PromptStepState[],
    [],
  );

  useEffect(() => {
    return () => {
      if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
    };
  }, [originalPreviewUrl]);

  useEffect(() => {
    return () => {
      steps.forEach((step) => {
        if (step.previewUrl && step.previewUrl.startsWith("blob:")) URL.revokeObjectURL(step.previewUrl);
      });
    };
  }, [steps]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    };
  }, []);

  const resetState = useCallback(() => {
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    sessionStorage.removeItem(POC_JOB_STORAGE_KEY);
    setIsRunning(false);
    setErrorMessage("");
    setJobId("");
    setSteps(createInitialSteps());
    setSelectedImage(null);
    setOriginalPreviewUrl("");
  }, []);

  const onSelectFile = useCallback((file: File | null) => {
    setSelectedImage(file);
    setErrorMessage("");
    setSteps(createInitialSteps());
    setJobId("");
    if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
    setOriginalPreviewUrl(file ? URL.createObjectURL(file) : "");
  }, [originalPreviewUrl]);

  const onAddStep = useCallback(() => {
    setSteps((prev) => {
      if (prev.length >= MAX_STEPS) return prev;
      return [...prev, { step: prev.length + 1, prompt: "", status: "WAITING" }];
    });
  }, []);

  const onRemoveStep = useCallback((stepNumber: number) => {
    setSteps((prev) =>
      prev
        .filter((step) => step.step !== stepNumber)
        .map((step, index) => ({ ...step, step: index + 1 })),
    );
  }, []);

  const onChangePrompt = useCallback((stepNumber: number, prompt: string) => {
    setSteps((prev) =>
      prev.map((step) => (step.step === stepNumber ? { ...step, prompt } : step)),
    );
  }, []);

  const validateInputs = useCallback(() => {
    if (!selectedImage) return "Please select an image first.";
    if (!steps.length) return "At least one prompt is required.";
    if (steps.some((step) => !step.prompt.trim())) return "All prompts must be filled.";
    if (steps.length > MAX_STEPS) return `Maximum ${MAX_STEPS} steps are allowed.`;
    return "";
  }, [selectedImage, steps]);

  const createDerivedImage = useCallback(async (sourceFile: Blob) => {
    const bitmap = await createImageBitmap(sourceFile);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");
    ctx.filter = "contrast(1.02) saturate(1.05) brightness(1.02)";
    ctx.drawImage(bitmap, 0, 0);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Could not create simulated output image"));
          return;
        }
        resolve(blob);
      }, "image/png");
    });
  }, []);

  const runTempMode = useCallback(async (fromStepIndex = 0) => {
    if (!selectedImage) return;

    let previousBlob: Blob = selectedImage;
    if (fromStepIndex > 0) {
      const priorStep = steps[fromStepIndex - 1];
      if (priorStep?.previewUrl) {
        const response = await fetch(priorStep.previewUrl);
        previousBlob = await response.blob();
      }
    }

    setIsRunning(true);
    setErrorMessage("");
    setSteps((prev) =>
      prev.map((step, idx) => ({
        ...step,
        status:
          idx < fromStepIndex
            ? "COMPLETED"
            : idx === fromStepIndex
              ? "PROCESSING"
              : "WAITING",
        errorMessage: idx >= fromStepIndex ? undefined : step.errorMessage,
        previewUrl: idx >= fromStepIndex ? undefined : step.previewUrl,
      })),
    );

    for (let index = fromStepIndex; index < steps.length; index += 1) {
      const currentStep = steps[index];
      await new Promise((resolve) => window.setTimeout(resolve, 900));

      if (currentStep.prompt.toLowerCase().includes("fail")) {
        setSteps((prev) =>
          prev.map((step, idx) => {
            if (idx === index) {
              return { ...step, status: "FAILED", errorMessage: `Simulation failed at step ${step.step}.` };
            }
            if (idx > index) return { ...step, status: "WAITING" };
            return step;
          }),
        );
        setIsRunning(false);
        return;
      }

      const derivedBlob = await createDerivedImage(previousBlob);
      previousBlob = derivedBlob;
      const blobUrl = URL.createObjectURL(derivedBlob);
      setSteps((prev) =>
        prev.map((step, idx) => {
          if (idx === index) {
            return { ...step, status: "COMPLETED", previewUrl: blobUrl, errorMessage: undefined };
          }
          if (idx === index + 1) return { ...step, status: "PROCESSING" };
          return step;
        }),
      );
    }
    setIsRunning(false);
  }, [createDerivedImage, selectedImage, steps]);

  const applyJobPayload = useCallback(
    (currentJobId: string, payload: JobResponse["data"]) => {
      if (!payload.steps) return;
      setSteps((prev) => mapApiSteps(currentJobId, payload.steps!, prev));
    },
    [mapApiSteps],
  );

  const pollJobStatus = useCallback((currentJobId: string) => {
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);

    const tick = async () => {
      try {
        const response = await authenticatedFetch(endpoints.pocGetJob(currentJobId));
        const payload = (await response.json()) as JobResponse;
        if (!response.ok || !payload.success || !payload.data?.steps) {
          setErrorMessage(
            `Failed to fetch job status (HTTP ${response.status}). Check backend logs: .run/logs/poc.log`,
          );
          setIsRunning(false);
          if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
          return;
        }

        applyJobPayload(currentJobId, payload.data);

        if (payload.data.status === "COMPLETED" || payload.data.status === "FAILED") {
          setIsRunning(false);
          sessionStorage.removeItem(POC_JOB_STORAGE_KEY);
          if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
        }
      } catch (error) {
        setErrorMessage(
          `Lost connection while checking job status. Check backend logs: .run/logs/poc.log (${String(error)})`,
        );
        setIsRunning(false);
        if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      }
    };

    void tick();
    pollTimerRef.current = window.setInterval(tick, 1500);
  }, [applyJobPayload, authenticatedFetch]);

  const resumeJob = useCallback(
    async (currentJobId: string) => {
      setJobId(currentJobId);
      setIsRunning(true);
      setErrorMessage("");
      const response = await authenticatedFetch(endpoints.pocGetJob(currentJobId));
      const payload = (await response.json()) as JobResponse;
      if (!response.ok || !payload.success || !payload.data.steps) {
        sessionStorage.removeItem(POC_JOB_STORAGE_KEY);
        setIsRunning(false);
        setErrorMessage("Could not restore your previous job. Please run again.");
        return;
      }

      applyJobPayload(currentJobId, payload.data);

      if (payload.data.status === "PROCESSING") {
        pollJobStatus(currentJobId);
        return;
      }

      setIsRunning(false);
      sessionStorage.removeItem(POC_JOB_STORAGE_KEY);
    },
    [applyJobPayload, authenticatedFetch, pollJobStatus],
  );

  useEffect(() => {
    if (TEMP_MODE) return;
    const savedJobId = sessionStorage.getItem(POC_JOB_STORAGE_KEY);
    if (!savedJobId || jobId) return;
    void resumeJob(savedJobId);
  }, [TEMP_MODE, jobId, resumeJob]);

  const runRealMode = useCallback(async () => {
    if (!selectedImage) return;

    const formData = new FormData();
    formData.append("image", selectedImage);
    formData.append(
      "prompts",
      JSON.stringify(steps.map((step, index) => ({ step: index + 1, prompt: step.prompt.trim() }))),
    );

    setIsRunning(true);
    setErrorMessage("");
    setSteps((prev) => prev.map((step, idx) => ({ ...step, status: idx === 0 ? "PROCESSING" : "WAITING", errorMessage: undefined })));

    const response = await authenticatedFetch(endpoints.pocCreateJob, {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json()) as JobResponse;
    if (!response.ok || !payload.success) {
      setErrorMessage("Could not start POC processing job.");
      setIsRunning(false);
      return;
    }
    setJobId(payload.data.jobId);
    sessionStorage.setItem(POC_JOB_STORAGE_KEY, payload.data.jobId);
    pollJobStatus(payload.data.jobId);
  }, [authenticatedFetch, pollJobStatus, selectedImage, steps]);

  const onRun = useCallback(async () => {
    const validationMessage = validateInputs();
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    if (TEMP_MODE) {
      await runTempMode();
      return;
    }
    await runRealMode();
  }, [runRealMode, runTempMode, validateInputs]);

  const onRetry = useCallback(async () => {
    if (!failedStep) return;

    if (TEMP_MODE) {
      await runTempMode(failedStep.step - 1);
      return;
    }

    const response = await authenticatedFetch(endpoints.pocRetryJob(jobId), {
      method: "POST",
      body: JSON.stringify({ fromStep: failedStep.step }),
    });
    if (!response.ok) {
      setErrorMessage("Could not retry failed step.");
      return;
    }
    setIsRunning(true);
    pollJobStatus(jobId);
  }, [authenticatedFetch, failedStep, jobId, pollJobStatus, runTempMode]);

  const onDownload = useCallback(async () => {
    if (!canDownload) return;

    if (TEMP_MODE) {
      const a = document.createElement("a");
      a.href = finalStep.previewUrl || "";
      a.download = "poc-final.png";
      a.click();
      return;
    }

    if (!jobId) return;

    const response = await authenticatedFetch(endpoints.pocDownloadFinal(jobId));
    if (!response.ok) {
      setErrorMessage("Unable to download final image.");
      return;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = "poc-final.png";
    a.click();
    URL.revokeObjectURL(objectUrl);
  }, [authenticatedFetch, canDownload, finalStep.previewUrl, jobId]);

  return (
    <s-page heading="Image Enhancement POC">
      <s-section heading="Mode">
        <s-badge tone={TEMP_MODE ? "caution" : "success"}>
          {TEMP_MODE ? "TEMP MODE (Frontend only)" : "REAL MODE (Backend + OpenAI)"}
        </s-badge>
      </s-section>

      <ImageUploader
        disabled={isRunning}
        onSelectFile={onSelectFile}
        onError={setErrorMessage}
      />
      <OriginalImagePreview previewUrl={originalPreviewUrl} filename={selectedImage?.name} />
      <PromptStepList
        steps={steps}
        canEdit={!isRunning}
        onChangePrompt={onChangePrompt}
        onRemoveStep={onRemoveStep}
        onAddStep={onAddStep}
        maxSteps={MAX_STEPS}
      />
      <s-section>
        <s-button variant="primary" disabled={isRunning} onClick={onRun}>
          Run Sequential Enhancement
        </s-button>
      </s-section>

      <ProcessingProgress steps={steps} isRunning={isRunning} />
      {isRunning ? (
        <s-banner tone="info">
          OpenAI is processing your image. This usually takes 30–90 seconds. Please do not refresh the page.
        </s-banner>
      ) : null}
      {errorMessage ? <s-banner tone="critical">{errorMessage}</s-banner> : null}
      <ImageComparisonGallery originalPreviewUrl={originalPreviewUrl} steps={steps} />
      <FinalResultActions
        canDownload={canDownload}
        onDownloadFinal={onDownload}
        onStartAgain={resetState}
        onRetryFromFailedStep={failedStep ? onRetry : undefined}
      />
    </s-page>
  );
}

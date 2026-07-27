import type { PromptStepState } from "./types";
import AuthenticatedImage from "./AuthenticatedImage";

type ImageComparisonGalleryProps = {
  originalPreviewUrl?: string;
  steps: PromptStepState[];
};

type GalleryItem = {
  key: string;
  label: string;
  src?: string;
  apiSrc?: string;
  alt: string;
};

export default function ImageComparisonGallery({
  originalPreviewUrl,
  steps,
}: ImageComparisonGalleryProps) {
  const completed = steps.filter((step) => step.previewUrl || step.imageApiUrl || step.status === "COMPLETED");
  if (!originalPreviewUrl && completed.length === 0) return null;

  const items: GalleryItem[] = [];

  if (originalPreviewUrl) {
    items.push({
      key: "original",
      label: "Original",
      src: originalPreviewUrl,
      alt: "Original image",
    });
  }

  completed.forEach((step) => {
    const isFinal = step.step === steps.length;
    items.push({
      key: `step-${step.step}`,
      label: isFinal ? `Final (Step ${step.step})` : `Step ${step.step}`,
      src: step.previewUrl,
      apiSrc: step.imageApiUrl,
      alt: `${isFinal ? "Final" : `Step ${step.step}`} image`,
    });
  });

  return (
    <s-section heading="Image Comparison">
      <div className="poc-gallery">
        {items.map((item) => (
          <div key={item.key} className="poc-gallery-card">
            <p className="poc-gallery-label">{item.label}</p>
            <div className="poc-gallery-frame">
              {item.src ? (
                <img src={item.src} alt={item.alt} className="poc-gallery-image" />
              ) : item.apiSrc ? (
                <AuthenticatedImage src={item.apiSrc} alt={item.alt} className="poc-gallery-image" />
              ) : (
                <s-text>Loading preview…</s-text>
              )}
            </div>
          </div>
        ))}
      </div>
    </s-section>
  );
}

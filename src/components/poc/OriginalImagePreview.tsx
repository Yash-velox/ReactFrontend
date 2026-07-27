type OriginalImagePreviewProps = {
  previewUrl?: string;
  filename?: string;
};

export default function OriginalImagePreview({
  previewUrl,
  filename,
}: OriginalImagePreviewProps) {
  if (!previewUrl) return null;

  return (
    <s-section heading="Original Image">
      <s-stack direction="block" gap="base">
        <img
          src={previewUrl}
          alt="Original upload"
          className="poc-original-preview"
        />
        <s-text>Filename: {filename || "selected-image"}</s-text>
      </s-stack>
    </s-section>
  );
}

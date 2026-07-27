import { useCallback, useRef, useState } from "react";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const MAX_SIZE_MB = 10;

type ImageUploaderProps = {
  disabled?: boolean;
  onSelectFile: (file: File | null) => void;
  onError?: (message: string) => void;
};

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return "Unsupported file type. Use PNG, JPG, JPEG, or WEBP.";
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `Image must be ${MAX_SIZE_MB}MB or smaller.`;
  }
  return null;
}

export default function ImageUploader({ disabled, onSelectFile, onError }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      const validationError = validateFile(file);
      if (validationError) {
        onError?.(validationError);
        return;
      }
      onSelectFile(file);
    },
    [onError, onSelectFile],
  );

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] || null;
      if (file) handleFile(file);
      event.target.value = "";
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = event.dataTransfer.files?.[0] || null;
      if (file) handleFile(file);
    },
    [disabled, handleFile],
  );

  return (
    <s-section heading="Upload Product Image">
      <s-stack direction="block" gap="base">
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          style={{
            border: isDragging ? "2px dashed #008060" : "2px dashed #c9cccf",
            borderRadius: "8px",
            padding: "24px",
            textAlign: "center",
            background: isDragging ? "#f1f8f5" : "#fafbfb",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
          onClick={() => {
            if (!disabled) inputRef.current?.click();
          }}
        >
          <s-stack direction="block" gap="small">
            <s-text>Drag and drop image here</s-text>
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                inputRef.current?.click();
              }}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid #c9cccf",
                background: "#fff",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              Select Image
            </button>
          </s-stack>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          disabled={disabled}
          style={{ display: "none" }}
          onChange={onInputChange}
        />

        <s-text tone="neutral">Supported: PNG, JPG, JPEG, WEBP (max {MAX_SIZE_MB}MB)</s-text>
      </s-stack>
    </s-section>
  );
}

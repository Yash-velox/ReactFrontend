import { useEffect, useState } from "react";
import { useAuthenticatedFetch } from "../../services/useAuthenticatedFetch";

type AuthenticatedImageProps = {
  src: string;
  alt: string;
  className?: string;
};

export default function AuthenticatedImage({ src, alt, className }: AuthenticatedImageProps) {
  const authenticatedFetch = useAuthenticatedFetch();
  const [objectUrl, setObjectUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let blobUrl = "";

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 120_000);
        const response = await authenticatedFetch(src, { signal: controller.signal });
        window.clearTimeout(timeout);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        if (cancelled) return;
        blobUrl = URL.createObjectURL(blob);
        setObjectUrl(blobUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load image");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [authenticatedFetch, src]);

  if (loading) {
    return <s-text>Loading image preview…</s-text>;
  }
  if (error) {
    return <s-text tone="critical">Could not load preview ({error})</s-text>;
  }
  return <img src={objectUrl} alt={alt} className={className} />;
}

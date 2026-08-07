type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  code?: string;
  error?: { message?: string; code?: string };
  detail?: string | { msg?: string }[];
};

const BACKEND_DOWN_CODES = new Set([
  "BACKEND_TUNNEL_UNAVAILABLE",
  "BACKEND_UNREACHABLE",
  "BACKEND_URL_MISSING",
  "BACKEND_TIMEOUT",
]);

const BACKEND_DOWN_MESSAGE =
  "Processing backend is currently unavailable. Please verify that the backend service is running.";

export async function parseApiResponse<T>(response: Response): Promise<T> {
  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    if (response.status === 503 || response.status === 504 || response.status === 502) {
      throw new Error(BACKEND_DOWN_MESSAGE);
    }
    throw new Error(response.statusText || "Request failed");
  }

  const code = payload.code || payload.error?.code;
  if (code && BACKEND_DOWN_CODES.has(code)) {
    throw new Error(payload.message || payload.error?.message || BACKEND_DOWN_MESSAGE);
  }

  if (!response.ok || payload.success === false) {
    const detail =
      typeof payload.detail === "string"
        ? payload.detail
        : Array.isArray(payload.detail)
          ? payload.detail.map((d) => d.msg).filter(Boolean).join("; ")
          : undefined;
    throw new Error(payload.error?.message || detail || payload.message || "Request failed");
  }

  return payload.data as T;
}

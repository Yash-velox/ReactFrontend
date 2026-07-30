type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: { message?: string };
  detail?: string | { msg?: string }[];
};

export async function parseApiResponse<T>(response: Response): Promise<T> {
  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new Error(response.statusText || "Request failed");
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

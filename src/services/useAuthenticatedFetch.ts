import { useCallback } from "react";
import { tunnelBypassHeaders } from "./url-schemas";

type ShopifyGlobal = {
  idToken?: () => Promise<string>;
};

const TOKEN_TIMEOUT_MS = 8000;
const EXPIRED_TOKEN_RETRY_DELAY_MS = 250;

function getShopify(): ShopifyGlobal | undefined {
  return (window as Window & { shopify?: ShopifyGlobal }).shopify;
}

function isEmbeddedAdmin(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin parent (Shopify Admin) throws - that means we are embedded.
    return true;
  }
}

async function resolveSessionToken(): Promise<string> {
  const shopify = getShopify();
  if (!shopify?.idToken) {
    if (!isEmbeddedAdmin()) {
      throw new Error(
        "Open the app from Shopify Admin (Apps → Image-Enhancement-UAT on aone-uat). Localhost cannot mint a session token.",
      );
    }
    throw new Error(
      "Shopify App Bridge is not ready (window.shopify.idToken missing). Hard-refresh the Admin app tab.",
    );
  }

  const token = await Promise.race([
    shopify.idToken(),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(
          new Error(
            "Shopify session token timed out. Hard-refresh the app inside Admin, or re-open Apps → Image-Enhancement-UAT.",
          ),
        );
      }, TOKEN_TIMEOUT_MS);
    }),
  ]);

  if (!token?.trim()) {
    throw new Error("Shopify returned an empty session token. Re-open the app from Admin.");
  }
  return token;
}

function isExpiredSessionTokenResponse(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const body = payload as {
    detail?: unknown;
    message?: unknown;
    error?: { message?: unknown };
  };
  const detail =
    typeof body.detail === "string"
      ? body.detail
      : typeof body.message === "string"
        ? body.message
        : typeof body.error?.message === "string"
          ? body.error.message
          : "";
  return /session token|signature has expired/i.test(detail);
}

async function sendWithToken(uri: string, options: RequestInit, token: string): Promise<Response> {
  const headers = new Headers(options.headers || {});
  headers.set("ngrok-skip-browser-warning", tunnelBypassHeaders["ngrok-skip-browser-warning"]);
  headers.set("Authorization", `Bearer ${token}`);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!headers.has("Content-Type") && options.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(uri, {
    ...options,
    headers,
  });
}

/**
 * Attaches Shopify session token (JWT) as Bearer auth - Retention Hub pattern.
 * Uses App Bridge CDN global (`window.shopify`) when embedded in Admin.
 * Retries once with a fresh token when Shopify's ~60s JWT has just expired.
 */
export function useAuthenticatedFetch() {
  return useCallback(async (uri: string, options: RequestInit = {}) => {
    const token = await resolveSessionToken();
    const response = await sendWithToken(uri, options, token);
    if (response.status !== 401) return response;

    let expired = false;
    try {
      expired = isExpiredSessionTokenResponse(await response.clone().json());
    } catch {
      expired = true;
    }
    if (!expired) return response;

    await new Promise((resolve) => window.setTimeout(resolve, EXPIRED_TOKEN_RETRY_DELAY_MS));
    const fresh = await resolveSessionToken();
    return sendWithToken(uri, options, fresh);
  }, []);
}

import { useCallback } from "react";

type ShopifyGlobal = {
  idToken?: () => Promise<string>;
};

/**
 * Attaches Shopify session token (JWT) as Bearer auth — Retention Hub pattern.
 * Uses App Bridge CDN global (`window.shopify`) when embedded in Admin.
 */
export function useAuthenticatedFetch() {
  return useCallback(async (uri: string, options: RequestInit = {}) => {
    const shopify = (window as Window & { shopify?: ShopifyGlobal }).shopify;
    let token: string | undefined;

    try {
      if (shopify?.idToken) {
        token = await shopify.idToken();
      }
    } catch {
      token = undefined;
    }

    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(uri, {
      ...options,
      headers,
    });
  }, []);
}

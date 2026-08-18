/** Resolve in-app paths for ReactFrontend BrowserRouter vs Shopify Remix `/app` routes. */
export function appPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") {
    // Remix home is /app; standalone ReactFrontend home is /
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/app")) {
      return "/app";
    }
    return "/";
  }
  // Only prefix /app when the current URL is already under Remix's /app tree.
  // ReactFrontend-as-application_url uses /prompts, /jobs, etc. (no /app).
  // Prefixing /app there hits the catch-all and redirects to Home ("dashboard").
  const underRemixApp =
    typeof window !== "undefined" && window.location.pathname.startsWith("/app");
  if (underRemixApp) {
    return `/app${normalized}`;
  }
  return normalized;
}

type AppNavigateFn = (to: string) => void;

let registeredNavigate: AppNavigateFn | null = null;

/**
 * Wire React Router's navigate from the app shell (Shopify `app.tsx` or Vite `App.tsx`).
 * Full `window.location.assign` inside Admin iframes can surface a blank page that only
 * shows "200" (auth/session-token.data rendered as a document - shopify-app-js#3112).
 */
export function registerAppNavigate(fn: AppNavigateFn | null): void {
  registeredNavigate = fn;
}

/** Navigate within the embedded app using client-side routing when available. */
export function navigateApp(path: string): void {
  const target = appPath(path);
  if (registeredNavigate) {
    registeredNavigate(target);
    return;
  }
  window.location.assign(target);
}

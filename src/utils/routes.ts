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

/** Navigate within the embedded app using a correctly scoped path. */
export function navigateApp(path: string): void {
  window.location.assign(appPath(path));
}

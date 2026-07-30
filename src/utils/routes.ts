/** Resolve in-app paths for standalone dev vs Shopify embedded admin. */
export function appPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const embedded = typeof window !== "undefined" && Boolean(window.shopify);
  if (embedded && normalized !== "/") {
    return `/app${normalized}`;
  }
  return normalized;
}

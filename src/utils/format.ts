export function formatWhen(value?: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

/** Short display for Shopify GIDs (numeric id when present). */
export function formatGid(gid: string): string {
  const match = gid.match(/\/(\d+)$/);
  return match ? `#${match[1]}` : gid;
}

export function truncateGid(gid: string, max = 28): string {
  if (gid.length <= max) return gid;
  return `${gid.slice(0, max - 1)}…`;
}

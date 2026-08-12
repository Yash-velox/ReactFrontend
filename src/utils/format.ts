const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const RECENT_MS = 6 * HOUR_MS;

const dateOnlyFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const fullFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatTodayYesterday(date: Date, now: Date): string | null {
  const dayDiff = Math.round(
    (startOfLocalDay(date) - startOfLocalDay(now)) / (24 * HOUR_MS),
  );
  const time = timeFormatter.format(date);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === -1) return `Yesterday, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  return null;
}

/** Full local date + time (with seconds) for hover tooltips. */
export function formatWhenFull(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return value ? value : "";
  return fullFormatter.format(date);
}

/**
 * Merchant-friendly local timestamp.
 * Recent → relative / Today·Yesterday + time; older → date only.
 * Pair with formatWhenFull (or <Timestamp>) for hover precision.
 */
export function formatWhen(value?: string | null, nowMs: number = Date.now()): string {
  const date = parseDate(value);
  if (!date) return value ? value : "—";

  const now = new Date(nowMs);
  const diffMs = date.getTime() - nowMs;
  const absMs = Math.abs(diffMs);

  if (absMs < MINUTE_MS) {
    return "Just now";
  }

  if (absMs < RECENT_MS) {
    if (absMs < HOUR_MS) {
      const minutes = Math.round(diffMs / MINUTE_MS);
      return relativeFormatter.format(minutes, "minute");
    }
    const hours = Math.round(diffMs / HOUR_MS);
    return relativeFormatter.format(hours, "hour");
  }

  const nearDay = formatTodayYesterday(date, now);
  if (nearDay) return nearDay;

  return dateOnlyFormatter.format(date);
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

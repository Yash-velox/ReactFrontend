/**
 * Central API base URL + endpoint paths (Retention Hub pattern).
 * Backend public URL comes from VITE_API_BASE_URL (Cloudflare tunnel in dev).
 */

const trimSlash = (value: string) => value.replace(/\/+$/, "");

export const API_BASE_URL = trimSlash(
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8080",
);

export const endpoints = {
  health: `${API_BASE_URL}/health`,
  tenantCheckConfig: `${API_BASE_URL}/tenant/checkConfig`,
} as const;

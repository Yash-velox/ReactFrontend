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
  pocCreateJob: `${API_BASE_URL}/api/poc/image-enhancement/jobs`,
  pocGetJob: (jobId: string) => `${API_BASE_URL}/api/poc/image-enhancement/jobs/${jobId}`,
  pocGetStepImage: (jobId: string, stepNumber: number) =>
    `${API_BASE_URL}/api/poc/image-enhancement/jobs/${jobId}/steps/${stepNumber}/image`,
  pocDownloadFinal: (jobId: string) =>
    `${API_BASE_URL}/api/poc/image-enhancement/jobs/${jobId}/final/download`,
  pocRetryJob: (jobId: string) => `${API_BASE_URL}/api/poc/image-enhancement/jobs/${jobId}/retry`,

  queueSummary: `${API_BASE_URL}/api/processing-queue/summary`,
  queueList: `${API_BASE_URL}/api/processing-queue`,
  queueItem: (itemId: string) => `${API_BASE_URL}/api/processing-queue/${itemId}`,
  queueItemOutput: (itemId: string) => `${API_BASE_URL}/api/processing-queue/${itemId}/output`,
  queueEnqueueShopify: `${API_BASE_URL}/api/processing-queue/shopify-products`,
  queueProductSearch: `${API_BASE_URL}/api/processing-queue/products/search`,
  queueRetryItem: (itemId: string) => `${API_BASE_URL}/api/processing-queue/${itemId}/retry`,
  queueRetrySelected: `${API_BASE_URL}/api/processing-queue/retry-selected`,
  queueRetryAllFailed: `${API_BASE_URL}/api/processing-queue/retry-all-failed`,
  queueCancelItem: (itemId: string) => `${API_BASE_URL}/api/processing-queue/${itemId}/cancel`,
  batchesStart: `${API_BASE_URL}/api/processing-batches/start`,
  batchesList: `${API_BASE_URL}/api/processing-batches`,
  batchDetail: (batchId: string) => `${API_BASE_URL}/api/processing-batches/${batchId}`,
} as const;

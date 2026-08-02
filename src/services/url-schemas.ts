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

  // POC
  pocCreateJob: `${API_BASE_URL}/api/poc/image-enhancement/jobs`,
  pocGetJob: (jobId: string) => `${API_BASE_URL}/api/poc/image-enhancement/jobs/${jobId}`,
  pocGetStepImage: (jobId: string, stepNumber: number) =>
    `${API_BASE_URL}/api/poc/image-enhancement/jobs/${jobId}/steps/${stepNumber}/image`,
  pocDownloadFinal: (jobId: string) =>
    `${API_BASE_URL}/api/poc/image-enhancement/jobs/${jobId}/final/download`,
  pocRetryJob: (jobId: string) => `${API_BASE_URL}/api/poc/image-enhancement/jobs/${jobId}/retry`,

  // Week 2 — catalog sync
  syncCatalog: `${API_BASE_URL}/api/sync/catalog`,
  syncStatus: `${API_BASE_URL}/api/sync/status`,
  syncRuns: `${API_BASE_URL}/api/sync/runs`,
  syncRunDetail: (runId: string) => `${API_BASE_URL}/api/sync/runs/${runId}`,

  // Week 2 — settings
  settings: `${API_BASE_URL}/api/settings`,

  // Week 2 — secondary queue
  secondaryQueueSummary: `${API_BASE_URL}/api/secondary-queue/summary`,
  secondaryQueueList: `${API_BASE_URL}/api/secondary-queue`,
  secondaryQueueItem: (itemId: string) => `${API_BASE_URL}/api/secondary-queue/${itemId}`,

  // Week 2 — batches
  batchesList: `${API_BASE_URL}/api/batches`,
  batchesManual: `${API_BASE_URL}/api/batches/manual`,
  batchDetail: (batchId: string) => `${API_BASE_URL}/api/batches/${batchId}`,
  batchProducts: (batchId: string) => `${API_BASE_URL}/api/batches/${batchId}/products`,
  batchImages: (batchId: string) => `${API_BASE_URL}/api/batches/${batchId}/images`,
  batchImageOutput: (imageId: string) => `${API_BASE_URL}/api/batches/images/${imageId}/output`,
  batchRetryFailed: (batchId: string) => `${API_BASE_URL}/api/batches/${batchId}/retry-failed`,
  batchProductRetry: (productId: string) => `${API_BASE_URL}/api/batches/products/${productId}/retry`,

  // Catalog products (Jobs picker)
  catalogProducts: `${API_BASE_URL}/api/products`,
  catalogProductMatchingGids: `${API_BASE_URL}/api/products/matching-gids`,
  catalogProductTypes: `${API_BASE_URL}/api/products/product-types`,

  // Prompt Management
  promptVariables: `${API_BASE_URL}/api/prompts/variables`,
  promptProductTypes: `${API_BASE_URL}/api/prompts/product-types`,
  promptProductType: (id: string) => `${API_BASE_URL}/api/prompts/product-types/${id}`,
  promptConfiguration: (id: string) => `${API_BASE_URL}/api/prompts/product-types/${id}/configuration`,
  promptProductTypeSteps: (id: string) => `${API_BASE_URL}/api/prompts/product-types/${id}/steps`,
  promptProductTypeStepsReorder: (id: string) =>
    `${API_BASE_URL}/api/prompts/product-types/${id}/steps/reorder`,
  promptStep: (stepId: string) => `${API_BASE_URL}/api/prompts/steps/${stepId}`,
  promptStepStatus: (stepId: string) => `${API_BASE_URL}/api/prompts/steps/${stepId}/status`,

  // Legacy queue (Phase 1 — unused in Week 2 UI)
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
  batchesListLegacy: `${API_BASE_URL}/api/processing-batches`,
  batchDetailLegacy: (batchId: string) => `${API_BASE_URL}/api/processing-batches/${batchId}`,
} as const;

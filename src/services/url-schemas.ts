/**
 * Central API base URL + endpoint paths (Retention Hub pattern).
 *
 * Prefer an empty VITE_API_BASE_URL so the browser calls same-origin
 * `/api`, `/health`, `/tenant`. Vite (local + via ngrok) proxies those
 * to FastAPI on :8080.
 *
 * Do NOT point VITE_API_BASE_URL at the ngrok host for API calls: free
 * ngrok returns ERR_NGROK_6024 interstitial HTML to browser fetches
 * (shows up as "Backend Unreachable" / Failed to fetch).
 */

const trimSlash = (value: string) => value.replace(/\/+$/, "");

export const API_BASE_URL = trimSlash(import.meta.env.VITE_API_BASE_URL || "");

/** Headers that keep free-ngrok tunnels from blocking XHR/fetch. */
export const tunnelBypassHeaders = {
  "ngrok-skip-browser-warning": "true",
} as const;

export const endpoints = {
  health: `${API_BASE_URL}/health`,
  tenantCheckConfig: `${API_BASE_URL}/tenant/checkConfig`,

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
  batchReprocessPreview: (batchId: string) =>
    `${API_BASE_URL}/api/batches/${batchId}/reprocess/preview`,
  batchReprocess: (batchId: string) => `${API_BASE_URL}/api/batches/${batchId}/reprocess`,
  batchProductReprocessPreview: (productId: string) =>
    `${API_BASE_URL}/api/batches/products/${productId}/reprocess/preview`,
  batchProductReprocess: (productId: string) =>
    `${API_BASE_URL}/api/batches/products/${productId}/reprocess`,
  batchImageReprocessPreview: (imageId: string) =>
    `${API_BASE_URL}/api/batches/images/${imageId}/reprocess/preview`,
  batchImageReprocess: (imageId: string) =>
    `${API_BASE_URL}/api/batches/images/${imageId}/reprocess`,
  batchProductPublish: (productId: string) => `${API_BASE_URL}/api/batches/products/${productId}/publish`,
  batchProductRetryPublish: (productId: string) =>
    `${API_BASE_URL}/api/batches/products/${productId}/retry-publish`,
  batchProductPublishConflict: (productId: string) =>
    `${API_BASE_URL}/api/batches/products/${productId}/publish-conflict`,
  batchPublishReady: (batchId: string) => `${API_BASE_URL}/api/batches/${batchId}/publish-ready`,

  // Catalog products (Jobs picker)
  catalogProducts: `${API_BASE_URL}/api/products`,
  catalogProductMatchingGids: `${API_BASE_URL}/api/products/matching-gids`,
  catalogProductTypes: `${API_BASE_URL}/api/products/product-types`,

  // Media versions + rollback
  productsWithMediaVersions: `${API_BASE_URL}/api/products/media-versions`,
  productMediaVersions: (productId: string) =>
    `${API_BASE_URL}/api/products/${productId}/media-versions`,
  productMediaVersion: (productId: string, versionId: string) =>
    `${API_BASE_URL}/api/products/${productId}/media-versions/${versionId}`,
  productRollbackPreview: (productId: string, versionId: string) =>
    `${API_BASE_URL}/api/products/${productId}/media-versions/${versionId}/rollback-preview`,
  productRollback: (productId: string, versionId: string) =>
    `${API_BASE_URL}/api/products/${productId}/media-versions/${versionId}/rollback`,
  rollbackOperation: (operationId: string) =>
    `${API_BASE_URL}/api/rollback-operations/${operationId}`,
  rollbackOperationRetry: (operationId: string) =>
    `${API_BASE_URL}/api/rollback-operations/${operationId}/retry`,
  productLiveReprocessPreview: (productId: string) =>
    `${API_BASE_URL}/api/products/${productId}/live-reprocess/preview`,
  productLiveReprocess: (productId: string) =>
    `${API_BASE_URL}/api/products/${productId}/live-reprocess`,

  // Normalized per-image CDN versions (under product-level snapshots)
  productImageVersions: (productId: string) =>
    `${API_BASE_URL}/api/products/${productId}/image-versions`,
  productImageVersion: (productId: string, versionId: string) =>
    `${API_BASE_URL}/api/products/${productId}/image-versions/${versionId}`,
  productImageVersionEvents: (productId: string, versionId: string) =>
    `${API_BASE_URL}/api/products/${productId}/image-versions/${versionId}/events`,
  imageStorageSummary: `${API_BASE_URL}/api/shops/me/image-storage-summary`,
  batchImageRetryUpload: (imageId: string) =>
    `${API_BASE_URL}/api/batches/images/${imageId}/retry-upload`,

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

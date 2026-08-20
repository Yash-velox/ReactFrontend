export type PaginationMeta = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type Settings = {
  autoSyncEnabled: boolean;
  autoPublishProcessedImages: boolean;
  batchIntervalMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type SyncRun = {
  id: string;
  runType: string;
  status: string;
  productsSynced: number;
  mediaSynced: number;
  cursor?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncStatus = {
  latestRun: SyncRun | null;
  productCount: number;
  activeMediaCount: number;
};

export type SecondaryQueueSummary = {
  pending: number;
  claimed: number;
  converted: number;
  skipped: number;
  failed: number;
  total: number;
};

export type SecondaryQueueItem = {
  id: string;
  shopifyProductGid: string;
  productId?: string | null;
  title?: string | null;
  handle?: string | null;
  adminUrl?: string | null;
  storefrontUrl?: string | null;
  queueRevision: number;
  status: string;
  webhookCount: number;
  firstQueuedAt: string;
  lastQueuedAt: string;
  latestEligibleWebhookId?: string | null;
  claimedAt?: string | null;
  claimedBy?: string | null;
  convertedBatchId?: string | null;
  skipReason?: string | null;
  failureReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Batch = {
  id: string;
  triggerType: string;
  status: string;
  processingPhase?: string | null;
  currentWorkflowStep?: number;
  totalWorkflowSteps?: number;
  openaiRequestsTotal?: number;
  openaiRequestsCompleted?: number;
  openaiRequestsFailed?: number;
  productCount: number;
  imageCount: number;
  pendingProductCount: number;
  processingProductCount: number;
  completedProductCount: number;
  failedProductCount: number;
  publishedProductCount?: number;
  retryingProductCount: number;
  settingsSnapshotJson?: Record<string, unknown> | null;
  errorSummary?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
};

export type BatchProduct = {
  id: string;
  batchId: string;
  shopifyProductGid: string;
  productId?: string | null;
  title?: string | null;
  handle?: string | null;
  adminUrl?: string | null;
  storefrontUrl?: string | null;
  status: string;
  publishStatus?: string | null;
  imageCount: number;
  retryCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  lockedBy?: string | null;
  lockedAt?: string | null;
  claimedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  nextRetryAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BatchImage = {
  id: string;
  batchProductId: string;
  shopifyMediaGid: string;
  shopifyFileGid?: string | null;
  cdnUrl: string;
  originalFilename?: string | null;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
  sourceFingerprint?: string | null;
  deltaType: string;
  currentPromptStep: number;
  status: string;
  attemptCount: number;
  outputStorageKey?: string | null;
  outputUrl?: string | null;
  outputMimeType?: string | null;
  outputChecksum?: string | null;
  generatedShopifyFileGid?: string | null;
  generatedShopifyCdnUrl?: string | null;
  generatedImageVersionId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

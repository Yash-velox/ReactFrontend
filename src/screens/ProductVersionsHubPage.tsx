import { useCallback, useEffect, useState } from "react";
import DataTable from "../components/ui/DataTable";
import AonePage from "../components/ui/AonePage";
import EmptyState from "../components/ui/EmptyState";
import ErrorBanner from "../components/ui/ErrorBanner";
import PageSkeleton from "../components/ui/PageSkeleton";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
import type { PaginationMeta } from "../types/week2";
import { parseApiResponse } from "../utils/api";
import { navigateApp } from "../utils/routes";

type VersionedProduct = {
  productId: string;
  shopifyProductGid: string;
  title?: string | null;
  handle?: string | null;
  productType?: string | null;
  activeVersionId: string;
  activeVersionNumber: number;
  activeVersionType: string;
  imageCount: number;
};

type StorageSummary = {
  estimateOnly?: boolean;
  note?: string;
  totalVersions?: number;
  originalVersionCount?: number;
  generatedVersionCount?: number;
  versionsMissingFileSizeCount?: number;
  totalRecordedFileSizeBytes?: number;
  generatedVersionStorageBytes?: number;
  warnings?: Array<{
    code: string;
    message: string;
    value?: number;
    valueMb?: number;
    threshold?: number;
    thresholdMb?: number;
  }>;
};

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

function formatBytes(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
}

export default function ProductVersionsHubPage() {
  const authenticatedFetch = useAuthenticatedFetch();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<VersionedProduct[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [storage, setStorage] = useState<StorageSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (query.trim()) params.set("search", query.trim());
      const [res, storageRes] = await Promise.all([
        authenticatedFetch(`${endpoints.productsWithMediaVersions}?${params.toString()}`),
        authenticatedFetch(endpoints.imageStorageSummary),
      ]);
      const data = await parseApiResponse<{
        items: VersionedProduct[];
        pagination?: PaginationMeta;
      }>(res);
      setItems(data.items ?? []);
      setPagination(data.pagination ?? null);
      try {
        const summary = await parseApiResponse<StorageSummary>(storageRes);
        setStorage(summary);
      } catch {
        setStorage(null);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load published products");
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, page, pageSize, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSearch = useCallback(() => {
    setPage(1);
    setQuery(search);
  }, [search]);

  const handleClear = useCallback(() => {
    setSearch("");
    setQuery("");
    setPage(1);
  }, []);

  return (
    <AonePage heading="Product Versions">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Search products that have been published through this app. Open a product to revert a
          complete stored version, or reprocess selected live images.
        </s-paragraph>

        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

        {storage?.warnings && storage.warnings.length > 0 ? (
          <s-banner tone="warning">
            <s-stack direction="block" gap="small">
              <s-text type="strong">Estimated version size (not Shopify plan storage)</s-text>
              <s-paragraph>
                {storage.note ||
                  "This estimate uses only our stored file_size_bytes metadata. It is not Shopify account usage. No versions are deleted automatically."}
              </s-paragraph>
              <s-paragraph>
                Recorded size: {formatBytes(storage.totalRecordedFileSizeBytes)}
                {" · "}
                Generated versions: {storage.generatedVersionCount ?? 0}
                {" · "}
                Original baselines: {storage.originalVersionCount ?? storage.totalVersions ?? 0}
                {typeof storage.versionsMissingFileSizeCount === "number" &&
                storage.versionsMissingFileSizeCount > 0
                  ? ` · Missing size metadata: ${storage.versionsMissingFileSizeCount}`
                  : null}
              </s-paragraph>
              {storage.warnings.map((w) => (
                <s-paragraph key={w.code}>{w.message}</s-paragraph>
              ))}
            </s-stack>
          </s-banner>
        ) : null}

        <div className="aone-toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <input
            className="aone-input"
            type="search"
            placeholder="Title, handle, or Shopify product GID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
            aria-label="Search published products"
            style={{ minWidth: "16rem" }}
          />
          <s-button variant="primary" onClick={handleSearch}>
            Search
          </s-button>
          <s-button onClick={handleClear}>Clear</s-button>
        </div>

        {loading ? (
          <PageSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            title="No published versions yet"
            description="Publish a processed product from Jobs first. Products with version history will appear here."
          />
        ) : (
          <>
            <DataTable>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Handle</th>
                  <th>Active version</th>
                  <th>Images</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.productId}>
                    <td>{item.title || item.shopifyProductGid}</td>
                    <td>{item.handle || "-"}</td>
                    <td>
                      v{item.activeVersionNumber} ({item.activeVersionType})
                    </td>
                    <td>{item.imageCount}</td>
                    <td>
                      <s-button onClick={() => navigateApp(`/products/${item.productId}/versions`)}>
                        View Versions
                      </s-button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>

            {pagination ? (
              <div className="aone-pagination">
                <p className="aone-pagination-meta">
                  Page {pagination.page} of {pagination.totalPages || 1} · {pagination.totalItems}{" "}
                  items
                </p>
                <div className="aone-toolbar">
                  <label className="aone-page-size" htmlFor="versions-page-size">
                    <span>Rows</span>
                    <select
                      id="versions-page-size"
                      className="aone-select aone-page-size-select"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <s-button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </s-button>
                  <s-button
                    disabled={page >= (pagination.totalPages || 1)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </s-button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </s-stack>
    </AonePage>
  );
}

import { useCallback, useEffect, useState } from "react";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import ErrorBanner from "../components/ui/ErrorBanner";
import PageSkeleton from "../components/ui/PageSkeleton";
import { endpoints } from "../services/url-schemas";
import { useAuthenticatedFetch } from "../services/useAuthenticatedFetch";
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
  totalRecordedFileSizeBytes?: number;
  warnings?: Array<{ code: string; message: string; value?: number; valueMb?: number }>;
};

export default function ProductVersionsHubPage() {
  const authenticatedFetch = useAuthenticatedFetch();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<VersionedProduct[]>([]);
  const [storage, setStorage] = useState<StorageSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      const [res, storageRes] = await Promise.all([
        authenticatedFetch(`${endpoints.productsWithMediaVersions}?${params.toString()}`),
        authenticatedFetch(endpoints.imageStorageSummary),
      ]);
      const data = await parseApiResponse<{ items: VersionedProduct[] }>(res);
      setItems(data.items ?? []);
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
  }, [authenticatedFetch, query]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <s-page heading="Product Versions">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Search products that have been published through this app, then open version history to
          revert to a previous complete image set.
        </s-paragraph>

        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

        {storage?.warnings && storage.warnings.length > 0 ? (
          <s-banner tone="warning">
            <s-stack direction="block" gap="small">
              <s-text type="strong">Storage usage warning (estimate)</s-text>
              <s-paragraph>
                {storage.note ||
                  "Totals are estimates from stored file-size metadata, not Shopify account usage. No versions are deleted automatically."}
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
            aria-label="Search published products"
            style={{ minWidth: "16rem" }}
          />
          <s-button
            variant="primary"
            onClick={() => setQuery(search)}
          >
            Search
          </s-button>
          <s-button
            onClick={() => {
              setSearch("");
              setQuery("");
            }}
          >
            Clear
          </s-button>
        </div>

        {loading ? (
          <PageSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            title="No published versions yet"
            description="Publish a processed product from Jobs first. Products with version history will appear here."
          />
        ) : (
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
                  <td>{item.handle || "—"}</td>
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
        )}
      </s-stack>
    </s-page>
  );
}

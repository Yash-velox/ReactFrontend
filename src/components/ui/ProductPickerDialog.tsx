import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "./EmptyState";
import { useModalOverlay } from "./useModalOverlay";
import { endpoints } from "../../services/url-schemas";
import { useAuthenticatedFetch } from "../../services/useAuthenticatedFetch";
import { parseApiResponse } from "../../utils/api";
import { formatGid } from "../../utils/format";

export type CatalogProduct = {
  id: string;
  shopifyProductGid: string;
  title?: string | null;
  handle?: string | null;
  status?: string | null;
  productType?: string | null;
  vendor?: string | null;
  imageUrl?: string | null;
};

type ListResponse = {
  items: CatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
  manualBatchProductLimit: number;
};

type MatchingGidsResponse = {
  items: Array<{ shopifyProductGid: string; title?: string | null }>;
  total: number;
  returned: number;
  truncated: boolean;
  cap: number;
  manualBatchProductLimit: number;
};

type Props = {
  open: boolean;
  initialSelected?: Array<{ id: string; title?: string }>;
  onCancel: () => void;
  onConfirm: (products: Array<{ id: string; title?: string }>, batchLimit: number) => void;
};

const PAGE_SIZE = 25;

export default function ProductPickerDialog({
  open,
  initialSelected = [],
  onCancel,
  onConfirm,
}: Props) {
  const authenticatedFetch = useAuthenticatedFetch();
  const { id: modalId, ref: modalRef, dismiss } = useModalOverlay(open, onCancel);

  const [loading, setLoading] = useState(false);
  const [selectAllBusy, setSelectAllBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [batchLimit, setBatchLimit] = useState(2);
  const [productTypes, setProductTypes] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [productType, setProductType] = useState("");
  const [status, setStatus] = useState("");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  const [selected, setSelected] = useState<Map<string, string | undefined>>(new Map());
  const searchTimer = useRef<number | undefined>(undefined);
  const initialized = useRef(false);
  const typeMenuRef = useRef<HTMLDivElement | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(searchTimer.current);
  }, [search]);

  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (!initialized.current) {
      const map = new Map<string, string | undefined>();
      for (const p of initialSelected) map.set(p.id, p.title);
      setSelected(map);
      setSearch("");
      setDebouncedSearch("");
      setProductType("");
      setStatus("");
      setPage(1);
      setError("");
      setNotice("");
      setTypeMenuOpen(false);
      setStatusMenuOpen(false);
      initialized.current = true;
    }
  }, [open, initialSelected]);

  useEffect(() => {
    if (!typeMenuOpen && !statusMenuOpen) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (typeMenuRef.current && !typeMenuRef.current.contains(target)) setTypeMenuOpen(false);
      if (statusMenuRef.current && !statusMenuRef.current.contains(target)) setStatusMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [typeMenuOpen, statusMenuOpen]);

  const loadTypes = useCallback(async () => {
    try {
      const res = await authenticatedFetch(endpoints.catalogProductTypes);
      const data = await parseApiResponse<{ items: string[] }>(res);
      setProductTypes(data.items ?? []);
    } catch {
      // Non-fatal
    }
  }, [authenticatedFetch]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (productType) params.set("productType", productType);
      if (status) params.set("status", status);
      const res = await authenticatedFetch(`${endpoints.catalogProducts}?${params}`);
      const data = await parseApiResponse<ListResponse>(res);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      if (data.manualBatchProductLimit) setBatchLimit(data.manualBatchProductLimit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, page, debouncedSearch, productType, status]);

  useEffect(() => {
    if (!open) return;
    void loadTypes();
  }, [open, loadTypes]);

  useEffect(() => {
    if (!open) return;
    void loadPage();
  }, [open, loadPage]);

  const selectedCount = selected.size;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageAllSelected = useMemo(
    () => items.length > 0 && items.every((p) => selected.has(p.shopifyProductGid)),
    [items, selected],
  );
  const hasFilters = Boolean(productType || status || debouncedSearch);

  const toggleOne = (product: CatalogProduct) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(product.shopifyProductGid)) next.delete(product.shopifyProductGid);
      else next.set(product.shopifyProductGid, product.title ?? undefined);
      return next;
    });
  };

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (pageAllSelected) {
        for (const p of items) next.delete(p.shopifyProductGid);
      } else {
        for (const p of items) next.set(p.shopifyProductGid, p.title ?? undefined);
      }
      return next;
    });
  };

  const selectAllMatching = async () => {
    setSelectAllBusy(true);
    setError("");
    setNotice("");
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (productType) params.set("productType", productType);
      if (status) params.set("status", status);
      const res = await authenticatedFetch(`${endpoints.catalogProductMatchingGids}?${params}`);
      const data = await parseApiResponse<MatchingGidsResponse>(res);
      if (data.manualBatchProductLimit) setBatchLimit(data.manualBatchProductLimit);
      setSelected(() => {
        const next = new Map<string, string | undefined>();
        for (const item of data.items ?? []) {
          next.set(item.shopifyProductGid, item.title ?? undefined);
        }
        return next;
      });
      if (data.truncated) {
        setNotice(
          `Selected the first ${data.returned.toLocaleString()} of ${data.total.toLocaleString()} matching products. Narrow filters to include the rest.`,
        );
      } else {
        setNotice(`Selected ${data.returned.toLocaleString()} matching product${data.returned === 1 ? "" : "s"}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to select all matching products");
    } finally {
      setSelectAllBusy(false);
    }
  };

  const clearFilters = () => {
    setProductType("");
    setStatus("");
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  };

  const confirm = () => {
    const products = Array.from(selected.entries()).map(([id, title]) => ({ id, title }));
    onConfirm(products, batchLimit);
  };

  if (!open) return null;

  const batchHint =
    selectedCount > batchLimit
      ? ` · ${Math.ceil(selectedCount / batchLimit)} batches`
      : "";

  return (
    <s-modal id={modalId} ref={modalRef} heading="Add products" size="large">
      <div className="aone-picker">
        <div className="aone-picker-search-row">
          <div className="aone-picker-search">
            <span className="aone-picker-search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              className="aone-picker-search-input"
              type="search"
              placeholder="Search products"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search products"
            />
          </div>
        </div>

        <div className="aone-picker-filters">
          {productType ? (
            <button
              type="button"
              className="aone-picker-filter-chip"
              onClick={() => {
                setProductType("");
                setPage(1);
              }}
            >
              Types: {productType}
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
          {status ? (
            <button
              type="button"
              className="aone-picker-filter-chip"
              onClick={() => {
                setStatus("");
                setPage(1);
              }}
            >
              Status: {status}
              <span aria-hidden="true">×</span>
            </button>
          ) : null}

          <div className="aone-picker-filter-menu" ref={typeMenuRef}>
            <button
              type="button"
              className={`aone-picker-filter-add${typeMenuOpen ? " is-open" : ""}`}
              aria-expanded={typeMenuOpen}
              aria-haspopup="listbox"
              onClick={() => {
                setTypeMenuOpen((v) => !v);
                setStatusMenuOpen(false);
              }}
            >
              {productType ? "Change type" : "Type"}
              <span aria-hidden="true">+</span>
            </button>
            {typeMenuOpen ? (
              <div className="aone-picker-menu" role="listbox">
                <button
                  type="button"
                  className="aone-picker-menu-item"
                  onClick={() => {
                    setProductType("");
                    setPage(1);
                    setTypeMenuOpen(false);
                  }}
                >
                  All types
                </button>
                {productTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="aone-picker-menu-item"
                    onClick={() => {
                      setProductType(t);
                      setPage(1);
                      setTypeMenuOpen(false);
                    }}
                  >
                    Types: {t}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="aone-picker-filter-menu" ref={statusMenuRef}>
            <button
              type="button"
              className={`aone-picker-filter-add${statusMenuOpen ? " is-open" : ""}`}
              aria-expanded={statusMenuOpen}
              aria-haspopup="listbox"
              onClick={() => {
                setStatusMenuOpen((v) => !v);
                setTypeMenuOpen(false);
              }}
            >
              Status
              <span aria-hidden="true">+</span>
            </button>
            {statusMenuOpen ? (
              <div className="aone-picker-menu" role="listbox">
                {["", "ACTIVE", "DRAFT", "ARCHIVED"].map((value) => (
                  <button
                    key={value || "all"}
                    type="button"
                    className="aone-picker-menu-item"
                    onClick={() => {
                      setStatus(value);
                      setPage(1);
                      setStatusMenuOpen(false);
                    }}
                  >
                    {value ? `Status: ${value}` : "All statuses"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {hasFilters ? (
            <button type="button" className="aone-picker-clear-filters" onClick={clearFilters}>
              Clear all
            </button>
          ) : null}
        </div>

        {(error || notice) && (
          <div className={`aone-picker-banner ${error ? "is-error" : "is-info"}`}>
            {error || notice}
          </div>
        )}

        <div className="aone-picker-list-toolbar">
          <label className="aone-picker-select-all">
            <input
              type="checkbox"
              checked={pageAllSelected}
              onChange={togglePage}
              disabled={items.length === 0}
              aria-label="Select all on this page"
            />
            <span>Page</span>
          </label>
          <button
            type="button"
            className="aone-picker-link-btn"
            onClick={() => void selectAllMatching()}
            disabled={selectAllBusy || total === 0}
          >
            {selectAllBusy ? "Selecting…" : `Select all ${total.toLocaleString()} matching`}
          </button>
          {selectedCount > 0 ? (
            <button type="button" className="aone-picker-link-btn" onClick={() => setSelected(new Map())}>
              Clear selection
            </button>
          ) : null}
        </div>

        <div className="aone-picker-list" aria-busy={loading}>
          {loading && items.length === 0 ? (
            <div className="aone-picker-empty">Loading products…</div>
          ) : items.length === 0 ? (
            <div className="aone-picker-empty">
              <EmptyState
                title="No products found"
                description="Try another search, clear filters, or sync your catalog on the Products page."
              />
            </div>
          ) : (
            items.map((product) => {
              const checked = selected.has(product.shopifyProductGid);
              return (
                <button
                  key={product.shopifyProductGid}
                  type="button"
                  className={`aone-picker-row${checked ? " is-selected" : ""}`}
                  onClick={() => toggleOne(product)}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(product)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${product.title ?? product.shopifyProductGid}`}
                  />
                  <span className="aone-picker-thumb">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="aone-picker-thumb-fallback" aria-hidden="true" />
                    )}
                  </span>
                  <span className="aone-picker-row-body">
                    <span className="aone-picker-row-title">
                      {product.title || formatGid(product.shopifyProductGid)}
                    </span>
                    <span className="aone-picker-row-meta">
                      {[product.productType, product.status].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="aone-picker-pager">
          <span>
            {total.toLocaleString()} product{total === 1 ? "" : "s"}
            {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}
          </span>
          <div className="aone-picker-pager-actions">
            <button
              type="button"
              className="aone-picker-page-btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </button>
            <button
              type="button"
              className="aone-picker-page-btn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Next
            </button>
          </div>
        </div>

        <div className="aone-picker-footer">
          <span className="aone-picker-selected-count">
            {selectedCount.toLocaleString()} product{selectedCount === 1 ? "" : "s"} selected
            {batchHint}
          </span>
          <div className="aone-picker-footer-actions">
            <s-button onClick={dismiss} disabled={selectAllBusy}>
              Cancel
            </s-button>
            <s-button
              variant="primary"
              onClick={confirm}
              disabled={selectedCount === 0 || selectAllBusy}
            >
              Add
            </s-button>
          </div>
        </div>
      </div>
    </s-modal>
  );
}

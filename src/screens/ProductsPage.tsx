/** Products page — same structure as before; Polaris look only. */
export default function ProductsPage() {
  return (
    <s-page heading="Products">
      <s-section heading="Product catalog">
        <s-paragraph>
          Product &amp; image metadata will appear here.
        </s-paragraph>
      </s-section>
      <s-section heading="Coming soon">
        <s-paragraph>
          Fetch from Shopify Admin API via the FastAPI backend.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

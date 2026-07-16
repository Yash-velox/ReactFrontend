/** Settings page — same structure as before; Polaris look only. */
export default function SettingsPage() {
  return (
    <s-page heading="Settings">
      <s-section heading="Store &amp; preferences">
        <s-paragraph>Store connection and AI preferences.</s-paragraph>
      </s-section>
      <s-section heading="Coming soon">
        <s-paragraph>
          OAuth session, matching rules, and provider config.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

import { useEffect, useState } from "react";
import { endpoints } from "../services/url-schemas";

type HealthState = "checking" | "ok" | "down";

/** Home — same content as before; Polaris look only. */
export default function HomePage() {
  const [health, setHealth] = useState<HealthState>("checking");

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      try {
        const res = await fetch(endpoints.health);
        if (!cancelled) setHealth(res.ok ? "ok" : "down");
      } catch {
        if (!cancelled) setHealth("down");
      }
    };

    ping();
    const id = window.setInterval(ping, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const healthTone =
    health === "ok" ? "success" : health === "down" ? "critical" : "caution";
  const healthLabel =
    health === "checking"
      ? "checking…"
      : health === "ok"
        ? "connected"
        : "unreachable";

  return (
    <s-page heading="Dashboard">
      <s-section heading="Overview">
        <s-paragraph>
          Enhance and manage product images for your Shopify store.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-text>Backend:</s-text>
          <s-badge tone={healthTone}>{healthLabel}</s-badge>
        </s-stack>
      </s-section>

      <s-section heading="Status">
        <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small-200">
              <s-text tone="neutral">Products synced</s-text>
              <s-heading>—</s-heading>
            </s-stack>
          </s-box>
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small-200">
              <s-text tone="neutral">Jobs in queue</s-text>
              <s-heading>—</s-heading>
            </s-stack>
          </s-box>
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small-200">
              <s-text tone="neutral">Images processed</s-text>
              <s-heading>—</s-heading>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Get started">
        <s-paragraph>
          Connect the store, fetch products, then run AI image jobs.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button variant="primary">Sync products</s-button>
          <s-button>Create job</s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/**
 * App Bridge is loaded from CDN via index.html (meta shopify-api-key + app-bridge.js).
 * Inside Shopify Admin the global is available; outside Admin we still render children
 * so local `npm run dev` works for UI work.
 */
export function AppBridgeProvider({ children }: Props) {
  return <>{children}</>;
}

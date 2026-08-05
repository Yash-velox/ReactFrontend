import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "html-transform-shopify-meta",
        transformIndexHtml(html) {
          return html
            .replace(/%VITE_SHOPIFY_API_KEY%/g, env.VITE_SHOPIFY_API_KEY || "")
            .replace(/%VITE_SHOPIFY_SHOP_DOMAIN%/g, env.VITE_SHOPIFY_SHOP_DOMAIN || "");
        },
      },
    ],
    server: {
      port: 5173,
      strictPort: true,
      host: true,
      allowedHosts: true,
      hmr: {
        // Works for local + ngrok (client connects via same host as the page)
        clientPort: env.VITE_HMR_CLIENT_PORT
          ? Number(env.VITE_HMR_CLIENT_PORT)
          : undefined,
        protocol: (env.VITE_HMR_PROTOCOL as "ws" | "wss" | undefined) || undefined,
      },
      // Browser calls same-origin /api,/health,/tenant. Vite forwards to FastAPI.
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8080",
          changeOrigin: true,
        },
        "/health": {
          target: "http://127.0.0.1:8080",
          changeOrigin: true,
        },
        "/tenant": {
          target: "http://127.0.0.1:8080",
          changeOrigin: true,
        },
      },
    },
  };
});

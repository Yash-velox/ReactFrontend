import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: "html-transform-shopify-api-key",
      transformIndexHtml(html) {
        return html.replace(
          /%VITE_SHOPIFY_API_KEY%/g,
          process.env.VITE_SHOPIFY_API_KEY || "",
        );
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
      clientPort: process.env.VITE_HMR_CLIENT_PORT
        ? Number(process.env.VITE_HMR_CLIENT_PORT)
        : undefined,
      protocol: process.env.VITE_HMR_PROTOCOL as "ws" | "wss" | undefined,
    },
  },
});

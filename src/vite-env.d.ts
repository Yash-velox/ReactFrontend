/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_SHOPIFY_API_KEY: string;
  readonly VITE_SHOPIFY_APP_HANDLE: string;
  readonly VITE_SHOPIFY_SHOP_DOMAIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

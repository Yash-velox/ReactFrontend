# Image Enhancement — ReactFrontend

Embedded admin UI (Retention Hub shape). Tunnel with **ngrok** in local dev.

## Setup

```bash
npm install
cp .env.example .env
# set VITE_SHOPIFY_API_KEY + VITE_API_BASE_URL (Cloudflare backend URL)
```

## Run

```bash
npm run dev
```

App: [http://127.0.0.1:5173](http://127.0.0.1:5173)

## ngrok (frontend)

```bash
ngrok http 5173
```

For HMR through ngrok, add to `.env`:

```env
VITE_HMR_CLIENT_PORT=443
VITE_HMR_PROTOCOL=wss
```

Then restart `npm run dev`.

Put the ngrok URL into Shopify `application_url` / auth redirects when you switch off automatic CLI URL updates (see root README).

## UI

Dashboard uses **Polaris web components** (`polaris.js` + `s-page` / `s-section` / `s-button` / `s-text-area`, etc.) so it matches other Shopify Admin apps:
https://shopify.dev/docs/api/app-home/web-components

## Used inside Shopify app

`ShopifyApp/image-enhancement` can import `src/screens/Dashboard.tsx` for the same UI. Preferred Retention Hub flow: set `application_url` to this frontend’s **ngrok** URL (do not use `shopify app dev` for tunneling).

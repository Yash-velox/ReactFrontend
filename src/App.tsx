import { useEffect } from "react";
import { NavMenu } from "@shopify/app-bridge-react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppErrorBoundary } from "./components/ui/AppErrorBoundary";
import { AppBridgeProvider } from "./providers/AppBridgeProvider";
import BatchDetailPage from "./screens/BatchDetailPage";
import HomePage from "./screens/HomePage";
import JobsPage from "./screens/JobsPage";
import ProductsPage from "./screens/ProductsPage";
import ProductVersionsHubPage from "./screens/ProductVersionsHubPage";
import ProductVersionsPage from "./screens/ProductVersionsPage";
import PromptConfigurationPage from "./screens/PromptConfigurationPage";
import PromptsPage from "./screens/PromptsPage";
import SettingsPage from "./screens/SettingsPage";
import { registerAppNavigate } from "./utils/routes";
import "./styles/shopify.css";

/**
 * App Bridge NavMenu is a custom-element wrapper (`ui-nav-menu`).
 * It does not require a React Provider — CDN App Bridge registers the element.
 * Render is safe outside Admin; links simply won't appear in the Shopify chrome.
 */
function AppNav() {
  return (
    <NavMenu>
      <a href="/" rel="home">
        Home
      </a>
      <a href="/products">Products</a>
      <a href="/prompts">Prompts</a>
      <a href="/jobs">Jobs</a>
      <a href="/products/versions">Versions</a>
      <a href="/settings">Settings</a>
    </NavMenu>
  );
}

function AppNavigateBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    registerAppNavigate((to) => navigate(to));
    return () => registerAppNavigate(null);
  }, [navigate]);
  return null;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/products/versions" element={<ProductVersionsHubPage />} />
      <Route path="/products/:productId/versions" element={<ProductVersionsPage />} />
      <Route path="/jobs" element={<JobsPage />} />
      <Route path="/jobs/:batchId" element={<BatchDetailPage />} />
      <Route path="/prompts" element={<PromptsPage />} />
      <Route path="/prompts/:productTypeId" element={<PromptConfigurationPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      {/* Safety aliases if a link still carries the Remix /app prefix */}
      <Route path="/app" element={<HomePage />} />
      <Route path="/app/products" element={<ProductsPage />} />
      <Route path="/app/products/versions" element={<ProductVersionsHubPage />} />
      <Route path="/app/products/:productId/versions" element={<ProductVersionsPage />} />
      <Route path="/app/jobs" element={<JobsPage />} />
      <Route path="/app/jobs/:batchId" element={<BatchDetailPage />} />
      <Route path="/app/prompts" element={<PromptsPage />} />
      <Route path="/app/prompts/:productTypeId" element={<PromptConfigurationPage />} />
      <Route path="/app/settings" element={<SettingsPage />} />
      {/* Old POC bookmarks → Home (POC UI removed; Backend POC API still exists) */}
      <Route path="/poc" element={<Navigate to="/" replace />} />
      <Route path="/app/poc" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AppBridgeProvider>
      <AppErrorBoundary>
        <BrowserRouter>
          <AppNavigateBridge />
          <AppNav />
          <AppRoutes />
        </BrowserRouter>
      </AppErrorBoundary>
    </AppBridgeProvider>
  );
}

export default App;

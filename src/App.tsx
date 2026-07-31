import { NavMenu } from "@shopify/app-bridge-react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppBridgeProvider } from "./providers/AppBridgeProvider";
import HomePage from "./screens/HomePage";
import JobsPage from "./screens/JobsPage";
import PocPage from "./screens/PocPage";
import ProductsPage from "./screens/ProductsPage";
import ProductVersionsHubPage from "./screens/ProductVersionsHubPage";
import ProductVersionsPage from "./screens/ProductVersionsPage";
import PromptConfigurationPage from "./screens/PromptConfigurationPage";
import PromptsPage from "./screens/PromptsPage";
import SettingsPage from "./screens/SettingsPage";
import "./styles/shopify.css";

/**
 * App Bridge NavMenu items show under the app in Shopify Admin sidebar
 * (Apps → Image-Enhancement), same pattern as other embedded apps.
 */
function AppNav() {
  return (
    <NavMenu>
      <a href="/" rel="home">
        Home
      </a>
      <a href="/products">Products</a>
      <a href="/products/versions">Versions</a>
      <a href="/jobs">Jobs</a>
      <a href="/prompts">Prompts</a>
      <a href="/settings">Settings</a>
      <a href="/poc">POC</a>
    </NavMenu>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/products/versions" element={<ProductVersionsHubPage />} />
      <Route path="/products/:productId/versions" element={<ProductVersionsPage />} />
      <Route path="/jobs" element={<JobsPage />} />
      <Route path="/prompts" element={<PromptsPage />} />
      <Route path="/prompts/:productTypeId" element={<PromptConfigurationPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/poc" element={<PocPage />} />
      {/* Safety aliases if a link still carries the Remix /app prefix */}
      <Route path="/app" element={<HomePage />} />
      <Route path="/app/products" element={<ProductsPage />} />
      <Route path="/app/products/versions" element={<ProductVersionsHubPage />} />
      <Route path="/app/products/:productId/versions" element={<ProductVersionsPage />} />
      <Route path="/app/jobs" element={<JobsPage />} />
      <Route path="/app/prompts" element={<PromptsPage />} />
      <Route path="/app/prompts/:productTypeId" element={<PromptConfigurationPage />} />
      <Route path="/app/settings" element={<SettingsPage />} />
      <Route path="/app/poc" element={<PocPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AppBridgeProvider>
      <BrowserRouter>
        <AppNav />
        <AppRoutes />
      </BrowserRouter>
    </AppBridgeProvider>
  );
}

export default App;

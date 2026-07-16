import { NavMenu } from "@shopify/app-bridge-react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppBridgeProvider } from "./providers/AppBridgeProvider";
import HomePage from "./screens/HomePage";
import JobsPage from "./screens/JobsPage";
import ProductsPage from "./screens/ProductsPage";
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
      <a href="/jobs">Jobs</a>
      <a href="/settings">Settings</a>
    </NavMenu>
  );
}

function App() {
  return (
    <AppBridgeProvider>
      <BrowserRouter>
        <AppNav />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppBridgeProvider>
  );
}

export default App;

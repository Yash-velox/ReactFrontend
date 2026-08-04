type ToastOptions = {
  duration?: number;
  isError?: boolean;
  action?: string;
  onAction?: () => void;
};

/**
 * Show a Shopify Admin toast when embedded; no-op outside Admin (local UI work).
 */
export function showAppToast(message: string, options: ToastOptions = {}): void {
  const toast = window.shopify?.toast;
  if (!toast?.show) {
    if (import.meta.env.DEV) {
      console.info(`[toast${options.isError ? ":error" : ""}]`, message);
    }
    return;
  }
  toast.show(message, {
    duration: options.duration ?? 5000,
    isError: options.isError,
    action: options.action,
    onAction: options.onAction,
  });
}

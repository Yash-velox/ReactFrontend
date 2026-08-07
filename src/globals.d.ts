/// <reference types="@shopify/polaris-types" />

type ResourcePickerProduct = {
  id: string;
  title?: string;
  handle?: string;
  images?: Array<{ originalSrc?: string; altText?: string }>;
};

type ResourcePickerOptions = {
  type: "product";
  multiple?: boolean;
  action?: "add" | "select";
  filter?: {
    variants?: boolean;
    draft?: boolean;
    archived?: boolean;
    query?: string;
  };
};

type ShopifyGlobal = {
  idToken?: () => Promise<string>;
  resourcePicker?: (options: ResourcePickerOptions) => Promise<ResourcePickerProduct[] | undefined>;
  toast?: {
    show: (
      message: string,
      opts?: {
        duration?: number;
        isError?: boolean;
        action?: string;
        onAction?: () => void;
        onDismiss?: () => void;
      },
    ) => string;
    hide?: (id: string) => void;
  };
};

declare global {
  interface Window {
    shopify?: ShopifyGlobal;
  }
}

export {};

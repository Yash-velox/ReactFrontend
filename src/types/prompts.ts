export type PromptListStatus = "NOT_CONFIGURED" | "ENABLED" | "DISABLED" | "NOT_READY";
export type PromptProductTypeSource = "SHOPIFY" | "MANUAL";

export type PromptProductTypeListItem = {
  id: string;
  name: string;
  source: PromptProductTypeSource;
  stepCount: number;
  enabledStepCount: number;
  status: PromptListStatus;
  isEnabled: boolean;
  updatedAt?: string | null;
  createdAt: string;
};

export type PromptProductTypeListResponse = {
  items: PromptProductTypeListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type PromptStep = {
  id: string;
  name: string;
  promptText: string;
  stepOrder: number;
  isEnabled: boolean;
  variables: string[];
  createdAt: string;
  updatedAt: string;
};

export type PromptConfigurationDetail = {
  id: string;
  productTypeId: string;
  name: string;
  source: PromptProductTypeSource;
  isEnabled: boolean;
  status: PromptListStatus;
  stepCount: number;
  enabledStepCount: number;
  steps: PromptStep[];
  createdAt: string;
  updatedAt: string;
};

export type PromptVariable = {
  name: string;
  token: string;
};

export const PROMPT_VARIABLES: PromptVariable[] = [
  { name: "product_title", token: "{{product_title}}" },
  { name: "product_type", token: "{{product_type}}" },
  { name: "product_vendor", token: "{{product_vendor}}" },
  { name: "product_handle", token: "{{product_handle}}" },
  { name: "product_description", token: "{{product_description}}" },
  { name: "image_filename", token: "{{image_filename}}" },
  { name: "image_position", token: "{{image_position}}" },
  { name: "shop_name", token: "{{shop_name}}" },
];

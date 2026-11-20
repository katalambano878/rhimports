// Foreign-key map for PostgREST-style embeds — RNH Imports.
// Generated from the public schema (FKs into auth.* omitted); regenerate if the schema changes.
export interface FkEdge {
  column: string;
  foreignTable: string;
  foreignColumn: string;
}

export const JSONB_COLUMNS: Record<string, Set<string>> = {
  addresses: new Set(["metadata"]),
  audit_logs: new Set(["details"]),
  categories: new Set(["metadata"]),
  cms_content: new Set(["metadata"]),
  coupons: new Set(["metadata"]),
  customers: new Set(["default_address"]),
  notifications: new Set(["data"]),
  order_items: new Set(["metadata"]),
  orders: new Set(["billing_address", "metadata", "shipping_address"]),
  product_variants: new Set(["metadata"]),
  products: new Set(["metadata", "options"]),
  profiles: new Set(["preferences"]),
  site_settings: new Set(["value"]),
  store_settings: new Set(["value"]),
  support_messages: new Set(["attachments"]),
  support_tickets: new Set(["metadata"]),
};

export const FK_MAP: Record<string, FkEdge[]> = {
  cart_items: [
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
    { column: "variant_id", foreignTable: "product_variants", foreignColumn: "id" },
  ],
  categories: [
    { column: "parent_id", foreignTable: "categories", foreignColumn: "id" },
  ],
  navigation_items: [
    { column: "menu_id", foreignTable: "navigation_menus", foreignColumn: "id" },
    { column: "parent_id", foreignTable: "navigation_items", foreignColumn: "id" },
  ],
  order_items: [
    { column: "order_id", foreignTable: "orders", foreignColumn: "id" },
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
    { column: "variant_id", foreignTable: "product_variants", foreignColumn: "id" },
  ],
  order_status_history: [
    { column: "order_id", foreignTable: "orders", foreignColumn: "id" },
  ],
  product_images: [
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
  ],
  product_variants: [
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
  ],
  products: [
    { column: "category_id", foreignTable: "categories", foreignColumn: "id" },
  ],
  return_items: [
    { column: "order_item_id", foreignTable: "order_items", foreignColumn: "id" },
    { column: "return_request_id", foreignTable: "return_requests", foreignColumn: "id" },
  ],
  return_requests: [
    { column: "order_id", foreignTable: "orders", foreignColumn: "id" },
  ],
  review_images: [
    { column: "review_id", foreignTable: "reviews", foreignColumn: "id" },
  ],
  reviews: [
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
  ],
  support_messages: [
    { column: "ticket_id", foreignTable: "support_tickets", foreignColumn: "id" },
  ],
  wishlist_items: [
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
  ],
};

/**
 * Every table/view in the public schema (from the live schema dump,
 * 2026-11). The browser data API (/rest/v1) only touches these, top-level or
 * embedded: anything else (pg_roles, pg_settings, auth.*, storage.*) is
 * refused before any SQL runs. Add new public tables here when a migration
 * creates them, or the browser cannot reach them.
 */
export const PUBLIC_TABLES: ReadonlySet<string> = new Set([
  "addresses",
  "audit_logs",
  "banners",
  "blog_posts",
  "cart_items",
  "categories",
  "cms_content",
  "contact_submissions",
  "coupons",
  "customers",
  "navigation_items",
  "navigation_menus",
  "newsletter_subscribers",
  "notifications",
  "order_items",
  "order_status_history",
  "orders",
  "pages",
  "product_images",
  "product_variants",
  "products",
  "profiles",
  "return_items",
  "return_requests",
  "review_images",
  "reviews",
  "site_settings",
  "store_modules",
  "store_settings",
  "support_messages",
  "support_tickets",
  "wishlist_items",
]);

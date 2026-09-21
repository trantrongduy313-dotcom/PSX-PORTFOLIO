import type { OrderTab } from "@/app/lib/types/order";

/**
 * Builds the query string used as snapshot cache key for a given tab.
 * Must match exactly between orders-client.tsx (cache reader) and
 * create-order-form.tsx (cache writer) to ensure injection hits the right key.
 */
export function buildSnapshotQuery(tab: OrderTab): string {
  const p = new URLSearchParams();
  p.set("all", "true");
  if (tab === "pre-production") p.set("zone", "PRE_PRODUCTION");
  else if (tab === "master-hub") p.set("zone", "MASTER_HUB");
  return p.toString();
}

/**
 * Returns all snapshot query keys that should include a new order, given its zone.
 * "all" tab always includes everything; zone-specific tab only includes its zone.
 */
export function getSnapshotKeysForNewOrder(loaiDon: "production" | "pre_production"): string[] {
  const allKey = buildSnapshotQuery("all");
  const zoneTab: OrderTab = loaiDon === "pre_production" ? "pre-production" : "master-hub";
  const zoneKey = buildSnapshotQuery(zoneTab);
  return [allKey, zoneKey];
}

/**
 * Builds the query string used as history snapshot cache key for completed/cancelled tabs.
 * Must match exactly between orders-client.tsx (cache reader) and
 * order-detail-panel.tsx (cache writer) to ensure injection hits the right key.
 */
export function buildHistorySnapshotQuery(tab: "completed" | "cancelled", storeId?: string): string {
  const p = new URLSearchParams();
  p.set("all", "true");
  p.set("history", "true");
  if (tab === "completed") p.set("status", "COMPLETED");
  else p.set("status", "CANCELLED");
  if (storeId) p.set("storeId", storeId);
  return p.toString();
}

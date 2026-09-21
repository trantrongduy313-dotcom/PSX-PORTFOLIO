import { Suspense } from "react";
import { requireRole } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { OrdersClient } from "./_components/orders-client";
import { TableSkeleton } from "./_components/table-skeleton";
import type { OrderFilters, OrderTab, OrdersListResponse } from "@/app/lib/types/order";
import { GET as ordersGET } from "@/app/api/orders/route";
import { NextRequest } from "next/server";

export const metadata = {
  title: "Đơn hàng — Kim Hoàn V3",
};

// Tabs có snapshot mode — cần SSR prefetch
const SSR_SNAPSHOT_TABS = new Set<OrderTab>(["all", "pre-production", "master-hub"]);

// Params báo hiệu user đang tương tác → React Query cache đã warm → bỏ qua SSR
const INTERACTION_PARAMS = new Set([
  "search", "orderId", "activeItemId", "status",
  "dateFrom", "dateTo", "datePreset",
  "isPriority", "stageFilter", "storeId",
  "requiredDateFrom", "requiredDateTo", "deadlinePreset",
  "from", // post-create/post-edit navigation — cache already warm, skip SSR
  "_w",  // cache-warm signal — client-side filter navigation, snapshot already cached
]);

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function OrdersPage({ searchParams }: Props) {
  const user = await requireRole(["ORDER", "PRODUCTION", "ADMIN", "SALES", "RND"]);

  // SALES: query assigned stores to display the Store Quick Bar and pre-fetch per-store data
  let userStores: { id: string; code: string; name: string }[] = [];
  try {
    if (user.role === "SALES") {
      const assignments = await prisma.userStore.findMany({
        where: { userId: user.id },
        include: { store: { select: { id: true, code: true, name: true } } },
        orderBy: { store: { code: "asc" } },
      });
      userStores = assignments.map((a) => a.store);
    }
  } catch {
    // DB error fetching stores — render without store bar, client handles fallback
  }

  const params = await searchParams;

  // Helper đọc giá trị string từ searchParams
  const str = (key: string): string | undefined => {
    const v = params[key];
    return typeof v === "string" ? v : undefined;
  };

  // Khởi tạo filter từ URL — dùng làm initialData cho client
  const initialFilters: OrderFilters = {
    tab: (() => {
      const t = (str("tab") as OrderTab) ?? "master-hub";
      return t === "all" ? "master-hub" : t; // tab "all" đã bỏ → PSX
    })(),
    search: str("search"),
    status: str("status") as OrderFilters["status"],
    sortBy: str("sortBy") ?? "orderDate",
    sortDir: (str("sortDir") as "asc" | "desc") ?? "desc",
    page: str("page") ? Number(str("page")) : 1,
    limit: 20,
  };

  // SSR prefetch: gọi trực tiếp handler API (không HTTP round-trip, dùng session từ next/headers)
  // → seed React Query cache trước khi client mount → user thấy data ngay, không skeleton
  //
  // CHỈ chạy khi "fresh load": không có interaction params trong URL.
  // Nếu URL có search/orderId/filter → cache đã warm từ navigation trước → bỏ qua SSR
  // để tránh thêm DB query vào mỗi lần filter/sort/mở panel.
  let ssrSnapshot: OrdersListResponse | null = null;
  let ssrSnapshotKey: string | null = null;
  let ssrTimestamp: number | null = null;

  const initialTab = initialFilters.tab ?? "master-hub";
  const isFreshLoad = !Object.keys(params).some(k => INTERACTION_PARAMS.has(k));

  if (isFreshLoad && SSR_SNAPSHOT_TABS.has(initialTab)) {
    const sp = new URLSearchParams({ all: "true" });
    if (initialTab === "pre-production") sp.set("zone", "PRE_PRODUCTION");
    else if (initialTab === "master-hub")  sp.set("zone", "MASTER_HUB");
    try {
      // NextRequest chỉ cần URL đúng params — auth đọc từ next/headers (session hiện tại)
      const req = new NextRequest(new URL(`/api/orders?${sp}`, "http://localhost"));
      const res = await ordersGET(req);
      if (res.ok) {
        ssrSnapshot    = (await res.json()) as OrdersListResponse;
        ssrSnapshotKey = sp.toString();
        ssrTimestamp   = Date.now();
      }
    } catch {
      // Prefetch lỗi → client tự fetch như bình thường (không ảnh hưởng UX)
    }
  }

  return (
    <Suspense fallback={<TableSkeleton />}>
      <OrdersClient
        initialFilters={initialFilters}
        userRole={user.role}
        userStores={userStores}
        ssrSnapshot={ssrSnapshot}
        ssrSnapshotKey={ssrSnapshotKey}
        ssrTimestamp={ssrTimestamp}
      />
    </Suspense>
  );
}

"use client";

import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { LayoutGrid, Table2, Plus, Loader2, RefreshCw, CheckCircle2, Printer } from "lucide-react";
import { toast } from "sonner";
import { OrdersTable } from "./orders-table";
import { AdvancedFilter } from "./advanced-filter";
import { applyColumnFilters, type ActiveColumnFilters } from "./column-filters";
// So sánh ngày theo NGÀY LỊCH GIỜ VN — nguồn dùng chung (server + client), xem vn-date.ts.
import { vnDayNum } from "@/app/lib/utils/vn-date";
import { OrderCard } from "./order-card";
import { OrdersToolbar } from "./orders-toolbar";
import { OrderDetailPanel } from "./order-detail-panel";
import { PrintReport } from "./print-report";
import {
  ALL_STORES,
  isStoreChipClickable,
  storeChipState,
  storeIdForChip,
} from "@/app/lib/ui/store-filter";
import { buildNextParams, type UrlPatch } from "./order-url-params";
import { scrubFiltersForTab } from "@/app/lib/ui/order-filter-scope";
import { ORDER_LIST_TABS, clampTabKey, visibleTabs } from "@/app/lib/ui/order-tabs";
import { fetchOrderDetail } from "@/app/lib/api/order-panel";
import {
  TAB_LABEL,
  type OrderFilters,
  type OrderStatus,
  type OrderTab,
  type OrderSummary,
  type OrderFirstItem,
  type OrdersListResponse,
} from "@/app/lib/types/order";
import { useLabels } from "@/app/lib/i18n/locale-context";
import { stripVersionSuffix, moSearchVariants } from "@/app/lib/business/order-helpers";
import { sortByCompletedDate } from "@/app/lib/business/orders/completed-sort";
import { isTopPriority } from "@/app/lib/business/priority";
import { toBomStatus } from "@/app/lib/business/bom";
import { buildSnapshotQuery as buildSnapshotQueryUtil, buildHistorySnapshotQuery as buildHistorySnapshotQueryUtil } from "@/app/lib/utils/snapshot-keys";

// Màu dot per store code — dùng cho Store Quick Bar của SALES users
const STORE_DOT: Record<string, string> = {
  CH1: "#E91D79", CH2: "#1E40AF", CH3: "#2D7A4F", ADM1: "#B8860B", ADM2: "#8A8178",
};

// PTK-only statuses — không có nghĩa trong PSX, bỏ qua khi hiển thị MASTER_HUB
const PTK_ONLY_STATUSES = new Set([
  "DRAFT", "PENDING_DESIGN", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED", "DESIGN_COMPLETED",
]);

// PSX-only statuses — PTK items must NOT inherit these from order.status
// (happens in mixed-zone orders where one MO is promoted but siblings remain in PTK)
const PSX_ONLY_STATUSES = new Set(["IN_PRODUCTION", "PENDING_PRODUCTION"]);

// Status hiệu lực per-MO — NGUỒN DUY NHẤT dùng cho cả badge hiển thị lẫn bộ lọc trạng thái.
// Trước đây filter so theo order.status còn badge hiện item.itemStatus ?? order.status → lệch nhau
// (đơn/MO đổi status per-item bị lọc sai). Test: __tests__/orders-row-status.test.ts
export function computeRowStatus(
  item: { zone?: string | null; itemStatus?: string | null },
  order: { status: OrderStatus; isSuspended?: boolean }
): OrderStatus {
  const isPsx = item.zone === "MASTER_HUB";
  const effectiveItemStatus = (isPsx && PTK_ONLY_STATUSES.has(item.itemStatus as string))
    ? null
    : ((item.itemStatus ?? null) as OrderStatus | null);
  const orderStatusFallback: OrderStatus = (item.zone === "PRE_PRODUCTION" && PSX_ONLY_STATUSES.has(order.status))
    ? "DRAFT"
    : order.status;
  const isTerminalItem = effectiveItemStatus === "COMPLETED" || effectiveItemStatus === "CANCELLED";
  if (isTerminalItem) return effectiveItemStatus!;
  const isRowSuspended = effectiveItemStatus === "SUSPENDED" || !!order.isSuspended;
  if (isRowSuspended) return "SUSPENDED";
  return effectiveItemStatus ?? orderStatusFallback;
}

// ─── Cấu hình tabs ─────────────────────────────────────────────────────────────

type TabDef = { key: OrderTab; label: string; description?: string };

// ─── Kiểu mở rộng cho filter ─────────────────────────────────────────────────

export type ExtendedFilters = OrderFilters & {
  isPriority?: boolean;
  datePreset?: number;
  orderId?: string | null;
  activeItemId?: string | null;
  dateFrom?: string;
  dateTo?: string;
  // Deadline filter — lọc theo requiredDate
  requiredDateFrom?: string;
  requiredDateTo?: string;
  deadlinePreset?: "week" | "thisWeek" | "overdue" | null;
  // Ngày Chốt SX filter — lọc theo estimatedDate (per-MO, chỉ tab PSX)
  estimatedDateFrom?: string;
  estimatedDateTo?: string;
  stageFilter?: string;
  // Store filter — lọc theo cửa hàng
  storeId?: string;
  // Phân loại KH filter
  phanLoaiKh?: string;
  // Ngày HT filter — lọc theo completedAt (chỉ dùng trong tab Hoàn tất)
  completedDateFrom?: string;
  completedDateTo?: string;
  // BOM filter — lọc theo specifications.bomStatus per-MO (chỉ tab PTK; business/bom.ts)
  bomFilter?: string;
};

// ─── API helpers ───────────────────────────────────────────────────────────────

// `now` truyền vào được để test tất định nhánh datePreset. Xuất cùng buildMetaQuery:
// __tests__/orders-api-query.test.ts
export function buildApiQuery(filters: ExtendedFilters, now: Date = new Date()): string {
  const p = new URLSearchParams();

  if (filters.tab === "pre-production") p.set("zone", "PRE_PRODUCTION");
  else if (filters.tab === "master-hub") { p.set("zone", "MASTER_HUB"); }
  else if (filters.tab === "completed") { p.set("history", "true"); p.set("status", "COMPLETED"); }
  else if (filters.tab === "cancelled")  { p.set("history", "true"); p.set("status", "CANCELLED"); }

  if (filters.search)           p.set("search", filters.search);
  if (filters.status)           p.set("status", filters.status);
  if (filters.isPriority)       p.set("isPriority", "true");
  if (filters.storeId)          p.set("storeId", filters.storeId);
  if (filters.phanLoaiKh)       p.set("phanLoaiKh", filters.phanLoaiKh);
  if (filters.sortBy)           p.set("sortBy", filters.sortBy);
  if (filters.sortDir)          p.set("sortDir", filters.sortDir);
  if (filters.stageFilter)      p.set("stageFilter", filters.stageFilter);
  // When stageFilter is active, API handles pagination itself — don't send page/limit
  if (!filters.stageFilter && filters.page && filters.page > 1) p.set("page", String(filters.page));
  if (!filters.stageFilter && filters.limit) p.set("limit", String(filters.limit));

  // Custom date range (ngày tạo) overrides preset
  if (filters.dateFrom) {
    p.set("dateFrom", filters.dateFrom);
  } else if (filters.datePreset != null && filters.datePreset >= 0) {
    const from = new Date(now);
    from.setDate(from.getDate() - filters.datePreset);
    from.setHours(0, 0, 0, 0);
    p.set("dateFrom", from.toISOString());
  }
  if (filters.dateTo) p.set("dateTo", filters.dateTo);

  // Deadline filter (requiredDate)
  if (filters.requiredDateFrom) p.set("requiredDateFrom", filters.requiredDateFrom);
  if (filters.requiredDateTo)   p.set("requiredDateTo",   filters.requiredDateTo);

  // Ngày Chốt SX filter (estimatedDate)
  if (filters.estimatedDateFrom) p.set("estimatedDateFrom", filters.estimatedDateFrom);
  if (filters.estimatedDateTo)   p.set("estimatedDateTo",   filters.estimatedDateTo);

  // Ngày HT filter (completedAt)
  if (filters.completedDateFrom) p.set("completedDateFrom", filters.completedDateFrom);
  if (filters.completedDateTo)   p.set("completedDateTo",   filters.completedDateTo);

  return p.toString();
}

// Lightweight query — only tab-level params, no search/sort/pagination
export function buildMetaQuery(filters: ExtendedFilters): string {
  const p = new URLSearchParams();
  if (filters.tab === "pre-production") p.set("zone", "PRE_PRODUCTION");
  else if (filters.tab === "master-hub") p.set("zone", "MASTER_HUB");
  else if (filters.tab === "completed") { p.set("history", "true"); p.set("status", "COMPLETED"); }
  else if (filters.tab === "cancelled") { p.set("history", "true"); p.set("status", "CANCELLED"); }
  // History tabs có snapshot riêng per-store → cần storeId để total khớp
  // Snapshot tabs (all/pre-production/master-hub) là store-agnostic → storeId gây false positive
  // (metaData.total = CH1 only ≠ syncEntry.total = all stores → totalChanged=true mãi → silent patch bị block)
  const isHistoryTabMeta = filters.tab === "completed" || filters.tab === "cancelled";
  if (filters.storeId && isHistoryTabMeta) p.set("storeId", filters.storeId);
  return p.toString();
}

type OrderMeta = {
  total: number;
  lastUpdatedAt: string | null;
  changedCount: number;
  changedOrders: { id: string; orderNumber: string; storeName: string | null; changedItemIds: string[]; changedMoNumbers: string[] }[];
};

async function fetchOrdersMeta(
  filters: ExtendedFilters,
  lastSyncedAt?: Date | null,
): Promise<OrderMeta> {
  const params = new URLSearchParams(buildMetaQuery(filters));
  if (lastSyncedAt) params.set("changedSince", lastSyncedAt.toISOString());
  const res = await fetch(`/api/orders/meta?${params}`);
  if (!res.ok) throw new Error("meta fetch failed");
  const json = await res.json();
  return json.data as OrderMeta;
}

// Combines a React Query cancellation signal with a 9s client timeout.
// Fires before Vercel's 10s hard limit so we can handle the error gracefully.
function withClientTimeout(signal?: AbortSignal, ms = 25000): AbortSignal {
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => ctrl.abort(new DOMException("Request timed out", "TimeoutError")),
    ms,
  );
  signal?.addEventListener("abort", () => { clearTimeout(timer); ctrl.abort(signal.reason); });
  return ctrl.signal;
}

async function fetchOrders(filters: ExtendedFilters, signal?: AbortSignal): Promise<OrdersListResponse> {
  const qs = buildApiQuery(filters);
  const res = await fetch(`/api/orders?${qs}`, { signal: withClientTimeout(signal) });
  if (!res.ok) throw new Error("Không thể tải danh sách đơn hàng");
  return res.json();
}

// Snapshot tabs: load ALL orders at once, client handles filter/sort/pagination
// "all"        → all active orders (bounded: same dataset as PTK + PSX combined)
// "pre-production" → PTK active orders only
// "master-hub" → PSX active orders only
// "completed" / "cancelled" → NOT snapshot (historical, grows unbounded)
const SNAPSHOT_TABS = new Set<OrderTab>(["all", "pre-production", "master-hub"]);

// History tabs: stable archive view — load once, no auto-sync from heartbeat.
// Only refreshes when: (a) user manually clicks sync, or (b) Complete/Cancel action fires.
// Uses ["orders-history"] query key so broad ["orders"] invalidations don't touch them.
const HISTORY_TABS = new Set<OrderTab>(["completed", "cancelled"]);

// Alias local — delegates to shared utility so create-order-form.tsx uses same keys
const buildSnapshotQuery = (tab: OrderTab) => buildSnapshotQueryUtil(tab);

// History snapshot: delegates to shared utility so order-detail-panel.tsx uses same key
const buildHistorySnapshotQuery = (tab: OrderTab, storeId?: string) =>
  buildHistorySnapshotQueryUtil(tab as "completed" | "cancelled", storeId);

async function fetchOrdersSnapshot(snapshotQuery: string, signal?: AbortSignal): Promise<OrdersListResponse> {
  const res = await fetch(`/api/orders?${snapshotQuery}`, { signal: withClientTimeout(signal) });
  if (!res.ok) throw new Error("Không thể tải danh sách đơn hàng");
  return res.json();
}

// ─── Hook đọc/ghi URL ─────────────────────────────────────────────────────────

function useUrlFilters(initialFilters: OrderFilters) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters: ExtendedFilters = {
    tab:        (() => {
      const t = (searchParams.get("tab") as OrderTab) ?? initialFilters.tab ?? "master-hub";
      return t === "all" ? "master-hub" : t; // tab "all" đã bỏ → map về PSX
    })(),
    search:     searchParams.get("search") ?? initialFilters.search,
    status:     (searchParams.get("status") as OrderFilters["status"]) ?? initialFilters.status,
    sortBy:     searchParams.get("sortBy") ?? initialFilters.sortBy ?? "orderDate",
    sortDir:    (searchParams.get("sortDir") as "asc" | "desc") ?? initialFilters.sortDir ?? "desc",
    page:       Number(searchParams.get("page") ?? initialFilters.page ?? 1),
    limit:      (() => {
      const fromUrl = Number(searchParams.get("limit"));
      if (fromUrl > 0) return fromUrl;
      const tab = searchParams.get("tab") ?? "master-hub";
      return (tab === "completed" || tab === "cancelled") ? 50 : 20;
    })(),
    isPriority: searchParams.get("isPriority") === "true",
    datePreset: Number(searchParams.get("datePreset") ?? -1),
    deadlinePreset: (searchParams.get("deadlinePreset") as "week" | "thisWeek" | "overdue" | null) ?? null,
    requiredDateFrom: searchParams.get("requiredDateFrom") ?? undefined,
    requiredDateTo:   searchParams.get("requiredDateTo") ?? undefined,
    estimatedDateFrom: searchParams.get("estimatedDateFrom") ?? undefined,
    estimatedDateTo:   searchParams.get("estimatedDateTo") ?? undefined,
    // Guard against literal "null"/"undefined" strings from broken links (e.g. orderId=null)
    orderId:       (() => { const v = searchParams.get("orderId"); return (v && v !== "null" && v !== "undefined") ? v : null; })(),
    activeItemId:  (() => { const v = searchParams.get("activeItemId"); return (v && v !== "null" && v !== "undefined") ? v : null; })(),
    dateFrom:      searchParams.get("dateFrom") ?? undefined,
    dateTo:        searchParams.get("dateTo") ?? undefined,
    stageFilter:        searchParams.get("stageFilter") ?? undefined,
    storeId:            searchParams.get("storeId") ?? undefined,
    phanLoaiKh:         searchParams.get("phanLoaiKh") ?? undefined,
    completedDateFrom:  searchParams.get("completedDateFrom") ?? undefined,
    completedDateTo:    searchParams.get("completedDateTo") ?? undefined,
    bomFilter:          searchParams.get("bomFilter") ?? undefined,
  };

  const viewMode = (searchParams.get("view") as "table" | "card") ?? "table";

  const updateUrl = useCallback(
    (patch: UrlPatch) => {
      // Toàn bộ luật dựng URL nằm ở order-url-params.ts — HÀM THUẦN, test được. Ở đây chỉ còn
      // việc điều hướng, thứ duy nhất thật sự cần React.
      const p = buildNextParams(searchParams, patch);
      router.push(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return { filters, viewMode, updateUrl };
}

// ─── Component chính ───────────────────────────────────────────────────────────

type Props = {
  initialFilters: OrderFilters;
  userRole: string;
  userStores?: { id: string; code: string; name: string }[];
  // SSR prefetch: data được fetch server-side và truyền xuống để seed React Query cache
  ssrSnapshot?: OrdersListResponse | null;
  ssrSnapshotKey?: string | null;
  ssrTimestamp?: number | null;
};

export function OrdersClient({ initialFilters, userRole, userStores = [], ssrSnapshot, ssrSnapshotKey, ssrTimestamp }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { filters: urlFilters, viewMode, updateUrl } = useUrlFilters(initialFilters);
  const L = useLabels();
  const [showPrint, setShowPrint] = useState(false);

  // Danh sách tab + quyền xem nằm ở app/lib/ui/order-tabs.ts (dữ liệu, có test). Ở đây chỉ
  // gắn NHÃN theo ngôn ngữ — module kia thuần, không biết i18n.
  //
  // ⚠️ `visibleTabs` hiện chưa lọc gì: chưa tab nào khai `roles`. Nối sẵn để lúc thêm vai chỉ
  // là một dòng dữ liệu, không phải sửa JSX ở đây.
  const TABS: TabDef[] = useMemo(
    () => visibleTabs(ORDER_LIST_TABS, userRole).map((t) => ({ key: t.key, label: L.ui.tabs[t.labelKey] })),
    [L, userRole],
  );

  // pendingTab: tab user vừa click — cập nhật local ngay trước khi URL catchup
  const [pendingTab, setPendingTab] = useState<OrderTab | null>(null);
  // pendingTabHasCache: tab đích đã có cache chưa — dùng để quyết định show skeleton hay không
  const [pendingTabHasCache, setPendingTabHasCache] = useState(true);

  // ─── `filters` = Ý ĐỊNH HIỆN TẠI của người dùng, không phải URL ────────────
  //
  // 🔴 VÌ SAO KHÔNG DÙNG THẲNG BẢN TỪ URL:
  //
  // Bấm tab thì `pendingTab` đổi NGAY, còn URL phải chờ `router.push`. Trong cửa sổ đó, bản từ
  // URL vẫn nói "tab cũ" — và thứ gì đọc nó sẽ vẽ theo tab cũ. Đó chính là lỗi người dùng thấy:
  // đổi sang Phòng Sản Xuất mà thanh lọc còn hiện ô BOM (ô chỉ thuộc Phòng Thiết Kế), vài giây
  // sau mới đúng.
  //
  // Trước đây đã có một bản vá cho chuyện này (`filters`) nhưng nó chỉ được dùng cho
  // DỮ LIỆU; toolbar vẫn nhận bản từ URL qua 16 prop. Hai biến gần giống tên nằm cạnh nhau, và
  // dùng nhầm thì KHÔNG có gì báo — màn hình vẫn chạy, chỉ sai trong một khoảnh khắc.
  //
  // Nên nay tên `filters` THUỘC VỀ bản đúng. Muốn bản chậm phải gõ hẳn `urlFilters` — dùng nhầm
  // trở thành một hành động có chủ ý.
  //
  // ⚠️ VÀ PHẢI RỬA, KHÔNG CHỈ GHI ĐÈ `tab`. Bản vá cũ chỉ đổi `tab` + `page`, nên trong cửa sổ
  // chờ khoá truy vấn là "tab Sản Xuất KÈM bomFilter" — vô nghĩa. URL bắt kịp → buildNextParams
  // rửa → khoá đổi → FETCH LẦN HAI. Rửa ở đây bằng CÙNG bảng phạm vi thì hai khoá trùng nhau,
  // chỉ còn một lần gọi mạng và đúng ngay từ đầu.
  const filters: ExtendedFilters = useMemo(
    () => (pendingTab
      ? scrubFiltersForTab({ ...urlFilters, tab: pendingTab, page: 1 }, pendingTab)
      : urlFilters),
    [urlFilters, pendingTab],
  );

  // currentPage: page hiện tại — dùng local state thay vì URL cho tất cả tabs
  // useSearchParams không luôn update ngay khi router.push trong Next.js App Router,
  // đặc biệt khi không có server fetch nào drive React để commit render mới.
  const [currentPage, setCurrentPage] = useState(1);

  // Flash highlight: row vừa được save sẽ nhấp nháy xanh lá 2 giây
  const [flashOrderId, setFlashOrderId] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cross-user flash: rows vừa được silent-patch từ user khác → flash xanh dương 2.5s
  const [crossUserFlashIds, setCrossUserFlashIds] = useState<Set<string>>(new Set());
  const crossUserFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pending indicator: row đang có save mutation in-flight
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  // Sync state per-tab: mỗi tab có baseline riêng tránh false positive khi switch tab
  // at: +3s buffer để hấp thụ clock skew giữa DB server và client
  const [tabSyncState, setTabSyncState] = useState<Map<string, { at: Date; total: number }>>(new Map());
  const [hasChanges, setHasChanges] = useState(false);
  // Lọc nâng cao theo từng trường (client-side, cộng dồn quick-filter).
  const [columnFilters, setColumnFilters] = useState<ActiveColumnFilters>({});
  const prevFetchingRef = useRef(false);
  // Track whether current fetch was triggered by auto-sync (no UI dim) vs. manual sync
  const isAutoSyncRef = useRef(false);

  const lastInteractionRef = useRef<number>(Date.now());
  const handleManualSyncRef = useRef<() => void>(() => {});

  const [pendingStoreId, setPendingStoreId] = useState<string | null>(null);

  // Local closing flag: set true immediately on close click so panel unmounts before router.push completes
  const [isClosingPanel, setIsClosingPanel] = useState(false);

  // Clear pending khi URL đã cập nhật xong
  useEffect(() => {
    setPendingStoreId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.storeId]);

  // Guard: nếu URL có ?orderId=pending-xxx mà không có cache pending-create (vd: sau refresh)
  // → clear URL để tránh panel cố gọi API với tempId không tồn tại trong DB
  useEffect(() => {
    const openOrderId = filters.orderId;
    if (!openOrderId?.startsWith("pending-")) return;
    const hasPending = queryClient.getQueryData(["pending-create"]);
    if (!hasPending) updateUrl({ orderId: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pending create: đơn đang được API tạo ở background sau khi navigate từ /orders/new
  // Set bởi create-order-form.tsx trước khi navigate, xóa khi API xong (thành công hoặc thất bại)
  // Fetch stores for the store filter dropdown
  const { data: storesData } = useQuery<{ data: { id: string; code: string; name: string }[] }>({
    queryKey: ["stores"],
    queryFn: async () => {
      const r = await fetch("/api/stores");
      if (!r.ok) throw new Error("Failed to fetch stores");
      return r.json();
    },
    staleTime: 10 * 60 * 1000,
  });
  const stores = storesData?.data ?? [];

  const { data: pendingCreate } = useQuery<{
    tempId: string; soOdoo: string; tab: string; status: "saving";
    customerName: string; salesName: string | null; nguon: string | null;
    ngayDukien: string | null; uuTien: string; loaiDon: string;
    itemCount: number; createdAt: string;
    formSnapshot: Record<string, unknown>;
    firstItem: { moId: string; tenSp: string; nvl: string; size: string;
      soLuong: string; xiMa: string; loaiHotChu: string;
      thongSoDaChu: string; trongLuongYc: string; } | null;
    allItemsData: { moId: string; tenSp: string; nvl: string; size: string;
      soLuong: string; xiMa: string; loaiHotChu: string;
      thongSoDaChu: string; trongLuongYc: string; }[];
  } | undefined>({ queryKey: ["pending-create"], staleTime: Infinity, gcTime: 5 * 60 * 1000, queryFn: () => undefined as any, enabled: false });

  const { data: pendingCreateFailed } = useQuery<{
    soOdoo: string; errorMessage: string; formSnapshot: Record<string, unknown>;
  } | undefined>({ queryKey: ["pending-create-failed"], staleTime: Infinity, gcTime: 10 * 60 * 1000, queryFn: () => undefined as any, enabled: false });

  // New order flash — signal từ create form sau khi API thành công
  const { data: newOrderFlashId } = useQuery<string | undefined>(
    { queryKey: ["new-order-flash"], staleTime: Infinity, gcTime: 5000, queryFn: () => undefined as any, enabled: false }
  );

  // History-tab signal — set bởi fireNavAction khi Complete/Cancel thành công.
  // Thay vì invalidate (gây reload chậm), chỉ set badge ngay lập tức.
  // Cleared khi user chủ động bấm sync trên history tab.
  const { data: historyTabHasNew } = useQuery<string | undefined>(
    { queryKey: ["history-tab-has-new"], staleTime: Infinity, gcTime: Infinity, queryFn: () => undefined as any, enabled: false }
  );

  // Khi complete/cancel thành công: background-invalidate history snapshot để đơn xuất hiện ngay
  // khi user navigate sang tab Hoàn Tất/Đã Huỷ — không cần bấm badge.
  useEffect(() => {
    if (!historyTabHasNew) return;
    isAutoSyncRef.current = true;
    queryClient.invalidateQueries({ queryKey: ["orders-history-snapshot"], exact: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyTabHasNew]);

  // Khi nhận flash signal từ create form: highlight row mới + auto-resolve panel nếu đang mở pending
  useEffect(() => {
    if (!newOrderFlashId) return;
    // Nếu panel đang mở trên pending row → chuyển sang real orderId
    if (filters.orderId?.startsWith("pending-")) {
      updateUrl({ orderId: newOrderFlashId });
    }
    setFlashOrderId(newOrderFlashId);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setFlashOrderId(null);
      queryClient.removeQueries({ queryKey: ["new-order-flash"] });
    }, 2000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newOrderFlashId]);

  // Tab active = pendingTab (instant) hoặc URL tab (sau khi catchup)
  // Ép về tab hợp lệ của vai: `?tab=…` đến từ URL nên nó không đi qua thanh tab đã lọc.
  const activeTab = clampTabKey(ORDER_LIST_TABS, pendingTab ?? (filters.tab ?? "master-hub"), userRole);

  // Snapshot mode: pre-production / master-hub load all at once — client handles filters
  const isSnapshotTab = SNAPSHOT_TABS.has(activeTab);
  const snapshotQuery = isSnapshotTab ? buildSnapshotQuery(activeTab) : null;
  const isHistoryTab = HISTORY_TABS.has(activeTab);
  const historySnapshotQuery = isHistoryTab ? buildHistorySnapshotQuery(activeTab, filters.storeId) : null;

  // SSR seed: kiểm tra xem snapshot từ server có khớp tab hiện tại không
  // Nếu khớp → dùng làm initialData để React Query không cần fetch lại ngay
  const isSSRMatch = isSnapshotTab && !!ssrSnapshot && snapshotQuery === ssrSnapshotKey;

  // Fix B: check if this tab has EVER loaded successfully (survives error state)
  // Used to decide between full error screen (first-load fail) vs. banner + stale data (refetch fail)
  const activeQueryKey = isSnapshotTab
    ? ["orders-snapshot", snapshotQuery]
    : isHistoryTab
      ? ["orders-history-snapshot", historySnapshotQuery]
      : ["orders", buildApiQuery({ ...filters, page: currentPage })];
  const tabHasEverLoaded = (queryClient.getQueryState(activeQueryKey)?.dataUpdatedAt ?? 0) > 0
    || isSSRMatch;

  // Cho non-snapshot/non-history tabs: dùng currentPage (state) thay vì filters.page (URL)
  // để tránh phụ thuộc vào useSearchParams update
  const queryFilters: ExtendedFilters = (isSnapshotTab || isHistoryTab)
    ? filters
    : { ...filters, page: currentPage };

  const { data, isLoading, isError, isFetching, error } = useQuery({
    queryKey: isSnapshotTab
      ? ["orders-snapshot", snapshotQuery]
      : isHistoryTab
        ? ["orders-history-snapshot", historySnapshotQuery]
        : ["orders", buildApiQuery(queryFilters)],
    queryFn: isSnapshotTab
      ? ({ signal }) => fetchOrdersSnapshot(snapshotQuery!, signal)
      : isHistoryTab
        ? ({ signal }) => fetchOrdersSnapshot(historySnapshotQuery!, signal)
        : ({ signal }) => fetchOrders(queryFilters, signal),
    // Snapshot + history snapshot: keepPreviousData prevents full skeleton during manual sync
    // Non-snapshot tabs: keepPreviousData shows prev page rows while next page loads (no skeleton flash)
    placeholderData: (isSnapshotTab || isHistoryTab)
      ? (pendingTab !== null && !pendingTabHasCache ? undefined : keepPreviousData)
      : keepPreviousData,
    // SSR seed: nếu server đã fetch trước (fresh load) thì dùng làm initialData
    initialData: isSSRMatch ? ssrSnapshot! : undefined,
    initialDataUpdatedAt: isSSRMatch && ssrTimestamp ? ssrTimestamp : undefined,
    // Infinity: heartbeat + manual sync chịu trách nhiệm cập nhật, không cần auto-refetch
    staleTime: Infinity,
    // Giữ cache 30 phút sau khi unmount — tránh loading screen khi switch tab sau 5 phút
    gcTime: (isSnapshotTab || isHistoryTab) ? 30 * 60 * 1000 : undefined,
    // AbortError/TimeoutError = tab switch cancel or slow server → retry up to 2 times
    // Other errors → retry up to 2 times
    retry: (failureCount, err) => {
      if ((err as Error)?.name === "AbortError") return false;
      return failureCount < 2;
    },
    retryDelay: (_attempt, err) =>
      (err as Error)?.name === "TimeoutError" ? 3000 : 1000,
  });

  // Khi user navigate sang history tab: kiểm tra ngay xem có pending signal không.
  // invalidateQueries trên query ACTIVE trigger immediate refetch — khác với việc gọi từ
  // panel (query inactive) hoặc qua historyTabHasNew effect (stale value không trigger lại).
  useEffect(() => {
    if (!isHistoryTab || !historySnapshotQuery) return;
    const hasNew = queryClient.getQueryData(["history-tab-has-new"]);
    if (!hasNew) return;
    isAutoSyncRef.current = true;
    queryClient.invalidateQueries({ queryKey: ["orders-history-snapshot", historySnapshotQuery] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHistoryTab, historySnapshotQuery]);

  // Per-tab sync baseline — used for heartbeat comparison and display
  const tabSyncEntry = tabSyncState.get(activeTab);
  const lastSyncedAt = tabSyncEntry?.at ?? null;

  // Heartbeat — nhẹ, chỉ poll COUNT + MAX(updatedAt) + changedCount, không kéo toàn bộ data
  const { data: metaData } = useQuery({
    queryKey: ["orders-heartbeat", buildMetaQuery(filters), tabSyncEntry?.at.getTime() ?? 0],
    queryFn: () => fetchOrdersMeta(filters, tabSyncEntry?.at ?? null),
    staleTime: 0,
    // Slow down while sidebar is open to avoid interfering with panel data fetch
    refetchInterval: isHistoryTab ? 60_000 : (filters.orderId ? 60_000 : 20_000),
    refetchIntervalInBackground: false,
    enabled: !isFetching,
  });

  // Reset pendingTab khi URL đã catchup và data load xong
  useEffect(() => {
    if (!isFetching) setPendingTab(null);
  }, [isFetching]);

  // Reset currentPage về 1 khi switch tab
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  // Reset currentPage về 1 khi filter thay đổi (search, sort, date…) — chỉ cho non-snapshot/non-history
  // buildApiQuery với page=1 làm "filter signature" — thay đổi khi filter thay đổi, không thay đổi khi chỉ đổi page
  const nonSnapshotFilterSig = (isSnapshotTab || isHistoryTab) ? "" : buildApiQuery({ ...filters, page: 1 });
  const prevFilterSigRef = useRef(nonSnapshotFilterSig);
  useEffect(() => {
    if (!isSnapshotTab && !isHistoryTab && prevFilterSigRef.current !== nonSnapshotFilterSig) {
      prevFilterSigRef.current = nonSnapshotFilterSig;
      setCurrentPage(1);
    }
  });

  // Reset currentPage về 1 khi client-side filter thay đổi trên snapshot tabs + history snapshot tabs
  const snapshotFilterSig = (isSnapshotTab || isHistoryTab)
    ? [filters.search, filters.stageFilter, filters.isPriority,
       filters.bomFilter, filters.dateFrom, filters.dateTo,
       filters.datePreset, filters.requiredDateFrom, filters.requiredDateTo,
       filters.estimatedDateFrom, filters.estimatedDateTo,
       filters.phanLoaiKh].join("|")
    : "";
  const prevSnapshotFilterSigRef = useRef(snapshotFilterSig);
  useEffect(() => {
    if ((isSnapshotTab || isHistoryTab) && prevSnapshotFilterSigRef.current !== snapshotFilterSig) {
      prevSnapshotFilterSigRef.current = snapshotFilterSig;
      setCurrentPage(1);
    }
  });

  // Cập nhật per-tab sync state khi fetch hoàn tất (falling edge của isFetching)
  useEffect(() => {
    if (prevFetchingRef.current && !isFetching && data) {
      const oldKeyTime = tabSyncState.get(activeTab)?.at.getTime() ?? 0;
      // +3s buffer để hấp thụ clock skew giữa DB server và client
      const newAt = new Date(Date.now() + 3_000);
      const newTotal = data.pagination?.total ?? 0;
      setTabSyncState(prev => new Map(prev).set(activeTab, { at: newAt, total: newTotal }));
      setHasChanges(false);
      isAutoSyncRef.current = false;
      // History tab finished loading fresh data — clear badge so user doesn't need to press sync
      if (isHistoryTab) queryClient.removeQueries({ queryKey: ["history-tab-has-new"] });
      // Zero out old heartbeat key so in-flight response doesn't re-trigger pink
      queryClient.setQueryData(
        ["orders-heartbeat", buildMetaQuery(filters), oldKeyTime],
        (old: OrderMeta | undefined) => old ? { ...old, changedCount: 0, changedOrders: [] } : old,
      );
    }
    prevFetchingRef.current = isFetching;
  }, [isFetching, data]);

  // Phát hiện thay đổi từ heartbeat và xử lý:
  // - Silent patch: snapshot tab hoặc history tab (total ↑ ≤5) + đủ IDs → patch ngầm, không badge
  // - Badge: nếu có đơn rời tab (total ↓), hoặc quá nhiều thay đổi (>20) → hiện badge như cũ
  useEffect(() => {
    const syncEntry = tabSyncState.get(activeTab);
    if (!metaData || isFetching || !syncEntry) return;

    const metaLastUpdated = metaData.lastUpdatedAt ? new Date(metaData.lastUpdatedAt) : null;
    const hasDataChanged = !!(metaLastUpdated && metaLastUpdated > syncEntry.at);
    const totalChanged = metaData.total !== syncEntry.total;

    if (!hasDataChanged && !totalChanged) return;

    const totalIncrease = totalChanged && metaData.total > syncEntry.total
      ? metaData.total - syncEntry.total : 0;

    // Silent patch conditions:
    // - Snapshot tabs (all/PTK/PSX): same logic as before (no decrease, ≤5 new)
    // - History tabs (completed/cancelled): allow silent prepend when total ↑ ≤5
    //   (orders completing/cancelling from other users — small batches only)
    const canSilentPatchSnapshot =
      isSnapshotTab &&
      snapshotQuery !== null &&
      (!totalChanged || (totalIncrease > 0 && totalIncrease <= 5)) &&
      metaData.changedCount > 0 &&
      metaData.changedOrders.length >= metaData.changedCount;

    const canSilentPatchHistory =
      isHistoryTab &&
      historySnapshotQuery !== null &&
      totalIncrease > 0 && totalIncrease <= 5 &&
      metaData.changedCount > 0 &&
      metaData.changedOrders.length >= metaData.changedCount;

    const canSilentPatch = canSilentPatchSnapshot || canSilentPatchHistory;

    if (canSilentPatch) {
      const changedIds = metaData.changedOrders.map((o: { id: string }) => o.id);
      const oldKeyTime = syncEntry.at.getTime();
      const newAt = new Date(Date.now() + 3_000);

      // Advance sync baseline — also update total when new orders arrived
      setTabSyncState(prev => new Map(prev).set(activeTab, { at: newAt, total: metaData.total }));
      // Zero out heartbeat data so in-flight response doesn't re-trigger
      queryClient.setQueryData(
        ["orders-heartbeat", buildMetaQuery(filters), oldKeyTime],
        (old: OrderMeta | undefined) => old ? { ...old, changedCount: 0, changedOrders: [] } : old,
      );

      // Fetch only the changed orders (same snapshot format) and patch cache in-place
      const params = new URLSearchParams();
      params.set("all", "true");
      params.set("ids", changedIds.join(","));
      if (canSilentPatchSnapshot) {
        const zone = activeTab === "pre-production" ? "PRE_PRODUCTION"
                   : activeTab === "master-hub"     ? "MASTER_HUB"
                   : undefined;
        if (zone) params.set("zone", zone);
      } else {
        // History tabs: need history + status filter to fetch correct records
        params.set("history", "true");
        if (activeTab === "completed") params.set("status", "COMPLETED");
        else if (activeTab === "cancelled") params.set("status", "CANCELLED");
        if (filters.storeId) params.set("storeId", filters.storeId);
      }

      fetch(`/api/orders?${params}`)
        .then(r => r.ok ? r.json() : null)
        .then((result: OrdersListResponse | null) => {
          if (!result?.data?.length) return;
          const cacheKey: [string, string] = canSilentPatchSnapshot
            ? ["orders-snapshot", snapshotQuery!]
            : ["orders-history-snapshot", historySnapshotQuery!];
          let newOrderIds: string[] = [];
          let updatedOrderIds: string[] = [];
          queryClient.setQueryData(
            cacheKey,
            (old: OrdersListResponse | undefined) => {
              if (!old?.data) return old;
              const updatedMap = new Map(result.data.map((o: OrderSummary) => [o.id, o]));
              const existingIds = new Set(old.data.map((o: OrderSummary) => o.id));
              const newOrders = result.data.filter((o: OrderSummary) => !existingIds.has(o.id));
              newOrderIds = newOrders.map((o: OrderSummary) => o.id);
              updatedOrderIds = result.data
                .filter((o: OrderSummary) => existingIds.has(o.id))
                .map((o: OrderSummary) => o.id);
              return { ...old, data: [...newOrders, ...old.data.map((o: OrderSummary) => updatedMap.get(o.id) ?? o)] };
            },
          );
          // Flash xanh dương cho rows vừa được cập nhật bởi user khác
          if (updatedOrderIds.length > 0) {
            setCrossUserFlashIds(new Set(updatedOrderIds));
            if (crossUserFlashTimerRef.current) clearTimeout(crossUserFlashTimerRef.current);
            crossUserFlashTimerRef.current = setTimeout(() => setCrossUserFlashIds(new Set()), 2500);
          }
          // Toast cho đơn mới xuất hiện trong tab (người khác vừa tạo/chuyển vào)
          if (newOrderIds.length > 0) {
            toast(`${newOrderIds.length} đơn mới`, {
              description: "Vừa được thêm bởi người dùng khác",
              duration: 4000,
            });
          }
        })
        .catch(() => { /* silent fail — stale until next heartbeat */ });
    } else {
      setHasChanges(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaData, isFetching, tabSyncState, activeTab]);

  // Window focus: khi user quay lại tab browser, invalidate heartbeat ngay lập tức
  // thay vì đợi đến tick tiếp theo (tối đa 20s cho active tabs, 60s cho history tabs)
  useEffect(() => {
    const onFocus = () => {
      queryClient.invalidateQueries({ queryKey: ["orders-heartbeat"], exact: false });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // hasChanges từ heartbeat HOẶC signal từ Complete/Cancel action (hiện ngay, không đợi 60s)
  const effectiveHasChanges = hasChanges || (isHistoryTab && historyTabHasNew === activeTab);

  // Phát hiện khi order đang mở trong panel vừa bị thay đổi bởi người khác
  // changedOrders tối đa 5 đơn gần nhất — best-effort, 409 recovery cover trường hợp miss
  // Khi activeItemId có (đang xem MO cụ thể), chỉ stale khi đúng MO đó bị thay đổi
  const panelOrderStale = useMemo(() => {
    if (!filters.orderId || !metaData?.changedOrders?.length) return false;
    const changedSO = (metaData.changedOrders as { id: string; changedItemIds?: string[] }[])
      .find(o => o.id === filters.orderId);
    if (!changedSO) return false;
    const currentItemId = filters.activeItemId ?? null;
    if (currentItemId) {
      const itemIds = changedSO.changedItemIds;
      // Only stale if the specific MO being viewed was changed; order-level changes (empty itemIds) don't trigger
      if (itemIds && itemIds.length > 0) return itemIds.includes(currentItemId);
      return false;
    }
    return true;
  }, [filters.orderId, filters.activeItemId, metaData?.changedOrders]);

  function handleManualSync() {
    isAutoSyncRef.current = true;
    setHasChanges(false);
    if (isSnapshotTab && snapshotQuery) {
      queryClient.invalidateQueries({ queryKey: ["orders-snapshot", snapshotQuery] });
    } else if (isHistoryTab && historySnapshotQuery) {
      queryClient.invalidateQueries({ queryKey: ["orders-history-snapshot", historySnapshotQuery] });
      queryClient.removeQueries({ queryKey: ["history-tab-has-new"] });
    } else {
      queryClient.invalidateQueries({ queryKey: ["orders", buildApiQuery(queryFilters)] });
    }
  }

  // Luôn cập nhật ref để auto-sync effect gọi được phiên bản mới nhất của handleManualSync
  handleManualSyncRef.current = handleManualSync;

  // Track user interaction — dùng cho idle auto-sync (90s)
  useEffect(() => {
    const update = () => { lastInteractionRef.current = Date.now(); };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach(e => window.addEventListener(e, update, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, update));
  }, []);

  // Auto-sync: idle 90s hoặc tab trở lại foreground — chỉ khi badge hiển thị và panel đóng
  useEffect(() => {
    if (!effectiveHasChanges) return;
    const isSafe = () => !filters.orderId && !pendingItemId;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && isSafe()) handleManualSyncRef.current();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const idleCheck = setInterval(() => {
      if (Date.now() - lastInteractionRef.current >= 90_000 && isSafe()) handleManualSyncRef.current();
    }, 15_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(idleCheck);
    };
  }, [effectiveHasChanges, filters.orderId, pendingItemId]);

  // Prefetch các tab còn lại khi trang load — đảm bảo switching instant
  useEffect(() => {
    const allTabs: OrderTab[] = ["pre-production", "master-hub", "completed", "cancelled"];
    const currentTab = filters.tab ?? "master-hub";
    allTabs
      .filter((t) => t !== currentTab)
      .forEach((tab) => {
        if (SNAPSHOT_TABS.has(tab)) {
          const sq = buildSnapshotQuery(tab);
          queryClient.prefetchQuery({
            queryKey: ["orders-snapshot", sq],
            queryFn: () => fetchOrdersSnapshot(sq),
            staleTime: Infinity,
            gcTime: 30 * 60 * 1000,
          });
        } else if (HISTORY_TABS.has(tab)) {
          const hq = buildHistorySnapshotQuery(tab, filters.storeId);
          queryClient.prefetchQuery({
            queryKey: ["orders-history-snapshot", hq],
            queryFn: () => fetchOrdersSnapshot(hq),
            staleTime: Infinity,
            gcTime: 30 * 60 * 1000,
          });
        } else {
          const pf: ExtendedFilters = { ...filters, tab, page: 1 };
          queryClient.prefetchQuery({
            queryKey: ["orders", buildApiQuery(pf)],
            queryFn: () => fetchOrders(pf),
            staleTime: Infinity,
          });
        }
      });
  // Re-run khi storeId đổi — history key bao gồm storeId nên cần prefetch lại cho store mới
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.storeId]);

  // Store filter is now applied client-side on the cached snapshot.
  // No per-store pre-fetch needed — the combined snapshot (without storeId in key) covers all stores.
  //
  // 🔴 ĐÃ XOÁ Ở ĐÂY: khối "Tầng 3 — pre-warm store snapshots". Nó hâm nóng cache cho
  // /dashboard/stores/[id], trang nay đã bị xoá vì không vai nào có lối vào.
  //
  // Cái giá nó đang thu: mỗi lần một SALES mở màn này, nó bắn MỘT request cho MỖI cửa hàng
  // được gán, với `?all=true` — mà app/api/stores/[storeId]/orders viết `all ? {} : { take }`,
  // tức KHÔNG GIỚI HẠN DÒNG. Năm cửa hàng, một trong đó gần 1.000 đơn, cho một đích không tới
  // được. Đây không phải tối ưu thêm; đây là ngừng trả tiền cho hàng đã bỏ.

  const rawSnapshotOrders: OrderSummary[] = (isSnapshotTab || isHistoryTab) ? (data?.data ?? []) : [];

  // Observer queries for inactive tab badge counts (tab "all" đã bỏ → bớt 1 fetch nặng).
  // React Query deduplicates against the main query + prefetched data (no extra requests).
  const _ptSq   = buildSnapshotQuery("pre-production");
  const _mhSq   = buildSnapshotQuery("master-hub");
  const _cmpHq  = buildHistorySnapshotQuery("completed", filters.storeId);
  const _cncHq  = buildHistorySnapshotQuery("cancelled", filters.storeId);
  const _snapCfg = { staleTime: Infinity, gcTime: 30 * 60 * 1000 } as const;
  const { data: _ptSnap  } = useQuery({ queryKey: ["orders-snapshot", _ptSq],  queryFn: ({ signal }) => fetchOrdersSnapshot(_ptSq, signal),  ..._snapCfg });
  const { data: _mhSnap  } = useQuery({ queryKey: ["orders-snapshot", _mhSq],  queryFn: ({ signal }) => fetchOrdersSnapshot(_mhSq, signal),  ..._snapCfg });
  const { data: _cmpSnap } = useQuery({ queryKey: ["orders-history-snapshot", _cmpHq], queryFn: ({ signal }) => fetchOrdersSnapshot(_cmpHq, signal), ..._snapCfg });
  const { data: _cncSnap } = useQuery({ queryKey: ["orders-history-snapshot", _cncHq], queryFn: ({ signal }) => fetchOrdersSnapshot(_cncHq, signal), ..._snapCfg });

  const tabCountMap = useMemo(() => {
    const sid = filters.storeId;
    const countSnap = (orders: OrderSummary[] | undefined) => {
      if (!orders) return 0;
      return sid ? orders.filter(o => o.storeId === sid).length : orders.length;
    };
    // History tabs: count MOs (items) not SOs so the badge matches the in-tab row count.
    // Mirrors the same filter applied in tableRows flatMap for completed/cancelled tabs.
    const countHistoryMOs = (orders: OrderSummary[] | undefined, status: "COMPLETED" | "CANCELLED") => {
      if (!orders) return 0;
      const opposite = status === "COMPLETED" ? "CANCELLED" : "COMPLETED";
      return orders.reduce((sum, o) => {
        const items = o.allItems ?? [];
        if (items.length === 0) return sum;
        const matched = items.filter(item => {
          if (item.itemStatus) return item.itemStatus === status;
          if (item.zone === "PRE_PRODUCTION" && o.zone === "MASTER_HUB") return false;
          if (o.status === opposite) return false;
          return o.status === status;
        });
        return sum + matched.length;
      }, 0);
    };
    const ptCount = countSnap(_ptSnap?.data);
    const mhCount = countSnap(_mhSnap?.data);
    return {
      // "all" = PTK ∪ PSX → tính client-side, không fetch riêng (tab đã bỏ nhưng giữ key cho type)
      "all":            ptCount + mhCount,
      "pre-production": ptCount,
      "master-hub":     mhCount,
      "completed":      countHistoryMOs(_cmpSnap?.data, "COMPLETED"),
      "cancelled":      countHistoryMOs(_cncSnap?.data, "CANCELLED"),
    } as Record<OrderTab, number>;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.storeId, _ptSnap?.data, _mhSnap?.data, _cmpSnap?.data, _cncSnap?.data]);

  // Client-side filter for snapshot tabs + history snapshot tabs (server skips user-level filters in allMode)
  const filteredSnapshotOrders = useMemo(() => {
    if (!isSnapshotTab && !isHistoryTab) return [];
    const f = filters;

    // Compute effective dateFrom (handles datePreset)
    let effectiveDateFrom = f.dateFrom;
    if (!effectiveDateFrom && f.datePreset != null && f.datePreset >= 0) {
      const from = new Date();
      from.setDate(from.getDate() - f.datePreset);
      from.setHours(0, 0, 0, 0);
      effectiveDateFrom = from.toISOString();
    }

    // storeId / phanLoaiKh filter is client-side for snapshot tabs
    const storeIdFilter = isSnapshotTab ? f.storeId : undefined;
    const phanLoaiKhFilter = isSnapshotTab ? f.phanLoaiKh : undefined;
    const hasAnyFilter = f.search || f.status || f.isPriority || effectiveDateFrom || f.dateTo
      || f.requiredDateFrom || f.requiredDateTo || f.estimatedDateFrom || f.estimatedDateTo
      || f.stageFilter || storeIdFilter || phanLoaiKhFilter;
    if (!hasAnyFilter) return rawSnapshotOrders;

    const q = f.search?.trim().toLowerCase() ?? "";
    // MO# có thể lưu "." (dữ liệu cũ) hoặc "_" (dữ liệu mới) — sinh cả 2 biến thể của
    // chuỗi gõ để so khớp allMoNumbers bất kể user gõ dấu nào (dùng chung logic với
    // server search — xem searchOrderIds() trong order-search.ts).
    const qMoVariants = q ? moSearchVariants(q) : [];
    // 1 SO có thể lưu thành NHIỀU Order row riêng biệt, mỗi row mang hậu tố phiên bản
    // CẤP SO (".N"/"_N", khác version MO) — UI hiển thị dạng base (đã strip suffix) nên
    // gõ đúng SO gốc phải khớp được TẤT CẢ Order row cùng gốc, không chỉ row trùng literal.
    const qSoBase = q ? stripVersionSuffix(q).toLowerCase() : "";

    // Exact-first: if query exactly matches any MO# or SO#, show only those orders.
    // Fallback to contains when no exact match found (e.g. partial customer name).
    let textFiltered = rawSnapshotOrders;
    if (q) {
      const exactMatches = rawSnapshotOrders.filter((order) =>
        order.orderNumber.toLowerCase() === q ||
        stripVersionSuffix(order.orderNumber).toLowerCase() === qSoBase ||
        order.allMoNumbers.some((mo) => qMoVariants.includes(mo.toLowerCase()))
      );
      textFiltered = exactMatches.length > 0
        ? exactMatches
        : rawSnapshotOrders.filter((order) =>
            order.orderNumber.toLowerCase().includes(q) ||
            order.customerName.toLowerCase().includes(q) ||
            (order.customerPhone ?? "").includes(q) ||
            order.allMoNumbers.some((mo) => qMoVariants.some((v) => mo.toLowerCase().includes(v)))
          );
    }

    return textFiltered.filter((order) => {
      // Store filter (client-side for snapshot tabs)
      if (storeIdFilter && order.storeId !== storeIdFilter) return false;
      // Phân loại KH filter (client-side for snapshot tabs)
      if (phanLoaiKhFilter) {
        const match = order.phanLoaiKh === phanLoaiKhFilter
          || (phanLoaiKhFilter === "SR" && (order.allItems as any[])?.some((it: any) => it.isShowroom === true));
        if (!match) return false;
      }
      // Status filter (snapshot allMode skips server-side status query — apply client-side here)
      if (f.status) {
        if (f.status === "SUSPENDED") {
          const hasSuspendedItem = (order.allItems as { itemStatus?: string; congDoanStatus?: string }[] | undefined)
            ?.some(item => item.itemStatus === "SUSPENDED" || item.congDoanStatus === "hold");
          if (!order.isSuspended && !hasSuspendedItem) return false;
        } else {
          // Khớp theo status hiệu lực per-MO (giống badge), không phải order.status —
          // giữ đơn nếu CÓ ít nhất 1 MO đúng trạng thái lọc. Đơn không có item → fallback order.status.
          const items = (order.allItems ?? []) as { zone?: string | null; itemStatus?: string | null }[];
          const anyMatch = items.length > 0
            ? items.some(item => computeRowStatus(item, order) === f.status)
            : order.status === f.status;
          if (!anyMatch) return false;
        }
      }
      // Priority flags — lọc theo priorityCode PER-MO (option B: "Ưu tiên" = chỉ UT1), giữ đơn
      // nếu CÓ ≥1 MO khớp (giống cách lọc status ở trên). KHÔNG dùng order.isPriority (SO-level)
      // vì nó khiến mọi MO — kể cả Normal — trong SO có cờ ưu tiên đều lọt qua.
      if (f.isPriority) {
        const items = (order.allItems ?? []) as { priorityCode?: string | null }[];
        const anyTop = items.length > 0
          ? items.some((it) => isTopPriority(it.priorityCode))
          : isTopPriority(order.priorityCode);
        if (!anyTop) return false;
      }
      // BOM filter (tab PTK) — per-MO: giữ đơn nếu CÓ ≥1 MO đúng trạng thái BOM đang lọc.
      if (f.bomFilter) {
        const items = (order.allItems ?? []) as { bomStatus?: string | null }[];
        if (!items.some((it) => toBomStatus(it.bomStatus) === f.bomFilter)) return false;
      }
      // orderDate range — checked at item level so the filter matches NGÀY TẠO column (item.orderDate ?? order.orderDate)
      // So sánh theo NGÀY giờ VN (vnDayNum) để không lệch 1 ngày vì dữ liệu lưu khác múi giờ.
      if (effectiveDateFrom || f.dateTo) {
        const fromDay = vnDayNum(effectiveDateFrom);
        const toDay = vnDayNum(f.dateTo);
        if ((order.allItems?.length ?? 0) > 0) {
          const anyInRange = order.allItems.some(item => {
            const day = vnDayNum(item.orderDate ?? order.orderDate);
            if (day === null) return false;
            if (fromDay !== null && day < fromDay) return false;
            if (toDay !== null && day > toDay) return false;
            return true;
          });
          if (!anyInRange) return false;
        } else {
          const day = vnDayNum(order.orderDate);
          if (day === null) return false;
          if (fromDay !== null && day < fromDay) return false;
          if (toDay !== null && day > toDay) return false;
        }
      }
      // requiredDate range — checked at item level. Không fallback về order.requiredDate:
      // MO chưa tự có requiredDate nghĩa là Google Sheet chưa nhập ngày HT riêng cho MO đó,
      // không nên bị coi là "khớp" tuần lọc chỉ vì SO cha có ngày (gây match sai như SO 26.10720).
      if (f.requiredDateFrom || f.requiredDateTo) {
        const reqFromDay = vnDayNum(f.requiredDateFrom);
        const reqToDay = vnDayNum(f.requiredDateTo);
        if ((order.allItems?.length ?? 0) > 0) {
          const anyInRange = order.allItems.some(item => {
            const day = vnDayNum(item.requiredDate);
            if (day === null) return false;
            if (reqFromDay !== null && day < reqFromDay) return false;
            if (reqToDay !== null && day > reqToDay) return false;
            return true;
          });
          if (!anyInRange) return false;
        } else if (order.requiredDate) {
          const day = vnDayNum(order.requiredDate);
          if (day === null) return false;
          if (reqFromDay !== null && day < reqFromDay) return false;
          if (reqToDay !== null && day > reqToDay) return false;
        } else {
          return false;
        }
      }
      // estimatedDate range (Ngày Chốt SX) — checked at item level, KHÔNG fallback về
      // order.estimatedDate: MO chưa có ngày chốt riêng không nên khớp lọc chỉ vì SO cha có.
      if (f.estimatedDateFrom || f.estimatedDateTo) {
        const estFromDay = vnDayNum(f.estimatedDateFrom);
        const estToDay = vnDayNum(f.estimatedDateTo);
        if ((order.allItems?.length ?? 0) > 0) {
          const anyInRange = order.allItems.some(item => {
            const day = vnDayNum(item.estimatedDate);
            if (day === null) return false;
            if (estFromDay !== null && day < estFromDay) return false;
            if (estToDay !== null && day > estToDay) return false;
            return true;
          });
          if (!anyInRange) return false;
        } else if (order.estimatedDate) {
          const day = vnDayNum(order.estimatedDate);
          if (day === null) return false;
          if (estFromDay !== null && day < estFromDay) return false;
          if (estToDay !== null && day > estToDay) return false;
        } else {
          return false;
        }
      }
      // Stage filter (pre-computed by server in allMode)
      if (f.stageFilter && order.stageMatchKeys) {
        if (!order.stageMatchKeys.includes(f.stageFilter)) return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSnapshotTab, isHistoryTab, rawSnapshotOrders, filters.search, filters.status, filters.isPriority, filters.bomFilter, filters.dateFrom, filters.datePreset, filters.dateTo, filters.requiredDateFrom, filters.requiredDateTo, filters.estimatedDateFrom, filters.estimatedDateTo, filters.stageFilter, filters.storeId, filters.phanLoaiKh]);



  const orders = (isSnapshotTab || isHistoryTab) ? filteredSnapshotOrders : (data?.data ?? []);

  // Flatten: mỗi MO item thành một dòng riêng; dùng itemStatus của item nếu có
  const tableRows = useMemo(() => {
    const q = (isSnapshotTab || isHistoryTab)
      ? (filters.search?.trim().toLowerCase() ?? "")
      : "";
    // Cùng logic biến thể "."/"_"  với bộ lọc order ở trên — để việc chọn ĐÚNG 1 dòng MO
    // trong 1 SO nhiều MO cũng nhận diện được cả 2 dạng lưu.
    const qMoVariants = q ? moSearchVariants(q) : [];
    // Base SO (đã strip suffix ".N"/"_N" cấp SO) — dùng để nhận diện "q chính là SO gốc
    // của order này" dù order.orderNumber mang suffix (1 SO có thể tách thành nhiều Order
    // row, xem ghi chú ở bộ lọc order phía trên).
    const qSoBase = q ? stripVersionSuffix(q).toLowerCase() : "";
    // Compute effective date bounds (SỐ NGÀY giờ VN — xem vnDayNum) for item-level date
    // filtering on snapshot/history tabs. So theo NGÀY thay vì timestamp thô để không lệch
    // 1 ngày do dữ liệu lưu khác múi giờ (nửa đêm UTC vs nửa đêm giờ VN).
    let _itemDateFromDay: number | null = null;
    let _itemDateToDay: number | null = null;
    if (isSnapshotTab || isHistoryTab) {
      let _df = filters.dateFrom ?? null;
      if (!_df && filters.datePreset != null && filters.datePreset >= 0) {
        const from = new Date();
        from.setDate(from.getDate() - filters.datePreset);
        from.setHours(0, 0, 0, 0);
        _df = from.toISOString();
      }
      _itemDateFromDay = vnDayNum(_df);
      _itemDateToDay = vnDayNum(filters.dateTo);
    }
    let _itemReqFromDay: number | null = null;
    let _itemReqToDay: number | null = null;
    if ((isSnapshotTab || isHistoryTab) && (filters.requiredDateFrom || filters.requiredDateTo)) {
      _itemReqFromDay = vnDayNum(filters.requiredDateFrom);
      _itemReqToDay = vnDayNum(filters.requiredDateTo);
    }
    let _itemEstFromDay: number | null = null;
    let _itemEstToDay: number | null = null;
    if ((isSnapshotTab || isHistoryTab) && (filters.estimatedDateFrom || filters.estimatedDateTo)) {
      _itemEstFromDay = vnDayNum(filters.estimatedDateFrom);
      _itemEstToDay = vnDayNum(filters.estimatedDateTo);
    }
    return orders.flatMap((order) => {
    if (!order.allItems || order.allItems.length === 0) return [order];

    let filteredItems = order.allItems;

    // Exact MO# search: when q exactly matches a specific MO#, show only that MO row.
    // Skip when q matches the SO# itself (hoặc base SO của order này) — nghĩa là show
    // toàn bộ MO của SO đó, dù order này là 1 trong nhiều Order row cùng gốc SO.
    if (q && order.orderNumber.toLowerCase() !== q && stripVersionSuffix(order.orderNumber).toLowerCase() !== qSoBase) {
      const exactMoMatches = filteredItems.filter(item => qMoVariants.includes(item.moNumber?.toLowerCase() ?? ""));
      if (exactMoMatches.length > 0) filteredItems = exactMoMatches;
    }

    if (activeTab === "pre-production") {
      // Filter by zone AND exclude terminal items (they belong to Hoàn tất/Đã hủy tabs)
      filteredItems = filteredItems.filter((item) => {
        if (item.zone !== "PRE_PRODUCTION") return false;
        const eff = item.itemStatus ?? order.status;
        return eff !== "COMPLETED" && eff !== "CANCELLED";
      });
      if (filteredItems.length === 0) return [];
    } else if (activeTab === "all") {
      // "Tất cả": ẩn MO đã terminal — chúng thuộc tab Hoàn tất / Đã hủy
      // Giữ lại MOs đang active (không COMPLETED/CANCELLED)
      filteredItems = filteredItems.filter((item) => {
        const eff = item.itemStatus ?? order.status;
        return eff !== "COMPLETED" && eff !== "CANCELLED";
      });
      if (filteredItems.length === 0) return [];
    } else if (activeTab === "master-hub") {
      // Ẩn MO đã COMPLETED/CANCELLED khỏi Master Hub — chúng thuộc tab Lịch sử
      filteredItems = filteredItems.filter((item) => {
        const eff = item.itemStatus ?? order.status;
        return item.zone === "MASTER_HUB" && eff !== "COMPLETED" && eff !== "CANCELLED";
      });
      if (filteredItems.length === 0) return [];
    } else if (activeTab === "completed" || activeTab === "cancelled") {
      const targetStatus = activeTab === "completed" ? "COMPLETED" : "CANCELLED";
      const oppositeStatus = activeTab === "completed" ? "CANCELLED" : "COMPLETED";
      // Always filter at item level.
      // Guard only applies to items with NO explicit itemStatus (they inherit order status):
      // if they'd inherit the opposite terminal, exclude them.
      // Items with explicit itemStatus always go to their own tab regardless of order status.
      filteredItems = filteredItems.filter((item) => {
        // Per-MO item with explicit terminal status → match exactly, ignore zone and order.status.
        // Must run BEFORE the PRE_PRODUCTION zone guard: a PRE_PRODUCTION item inside a MASTER_HUB
        // order can have an explicit itemStatus (e.g. individually cancelled MO).
        if (item.itemStatus) return item.itemStatus === targetStatus;
        // PTK items that landed in a MASTER_HUB order (via import Case B) must not
        // appear in history tabs — they have no explicit terminal status of their own
        // and would incorrectly inherit the PSX order's CANCELLED/COMPLETED status.
        if (item.zone === "PRE_PRODUCTION" && order.zone === "MASTER_HUB") return false;
        // Item with no per-item status: guard against inheriting opposite terminal
        if (order.status === oppositeStatus) return false;
        // Otherwise inherit order.status
        return order.status === targetStatus;
      });
      if (filteredItems.length === 0) return [];
    }

    // Per-MO status filter — lọc theo status hiệu lực per-MO (giống badge), ẩn MO anh-em
    // không khớp. Trước đây chỉ lọc cấp đơn (order.status) nên MO đổi status per-item bị lọc sai.
    if ((isSnapshotTab || isHistoryTab) && filters.status) {
      const st = filters.status;
      if (st === "SUSPENDED") {
        filteredItems = filteredItems.filter((item) =>
          (item as Record<string, unknown>).itemStatus === "SUSPENDED" || item.congDoanStatus === "hold" || order.isSuspended
        );
      } else {
        filteredItems = filteredItems.filter((item) => computeRowStatus(item, order) === st);
      }
      if (filteredItems.length === 0) return [];
    }

    // Per-MO priority filter — nút "Ưu tiên" (option B) chỉ hiện MO UT1. Lọc TỪNG MO theo
    // priorityCode để MO Normal anh em trong cùng SO KHÔNG bị expand thành dòng.
    if (filters.isPriority) {
      filteredItems = filteredItems.filter((item) => isTopPriority(item.priorityCode));
      if (filteredItems.length === 0) return [];
    }

    // Per-MO BOM filter (tab PTK) — chỉ expand MO đúng trạng thái BOM đang lọc.
    if (filters.bomFilter) {
      filteredItems = filteredItems.filter((item) => toBomStatus(item.bomStatus) === filters.bomFilter);
      if (filteredItems.length === 0) return [];
    }

    // Item-level date filter: each MO checked against item.orderDate ?? order.orderDate
    // so the "7 ngày / 30 ngày" filter matches exactly what NGÀY TẠO column displays.
    if (_itemDateFromDay !== null || _itemDateToDay !== null) {
      filteredItems = filteredItems.filter(item => {
        const day = vnDayNum(item.orderDate ?? order.orderDate);
        if (day === null) return _itemDateFromDay === null;
        if (_itemDateFromDay !== null && day < _itemDateFromDay) return false;
        if (_itemDateToDay !== null && day > _itemDateToDay) return false;
        return true;
      });
      if (filteredItems.length === 0) return [];
    }

    // Ngày HT filter — dùng DUY NHẤT Order.completedDate (ngày nhập trong form sản xuất).
    // Không fallback về completedAt để tránh backfill data làm nhiễu kết quả.
    // Items không có completedDate (panel NGÀY HT trống) → không xuất hiện khi filter.
    // Parse as Vietnam midnight (+07:00) to match DD/MM/YYYY user input.
    if (activeTab === "completed" && (filters.completedDateFrom || filters.completedDateTo)) {
      const fromMs = filters.completedDateFrom ? new Date(filters.completedDateFrom + "T00:00:00+07:00").getTime() : null;
      const toMs   = filters.completedDateTo   ? new Date(filters.completedDateTo   + "T23:59:59+07:00").getTime() : null;
      filteredItems = filteredItems.filter((item) => {
        // Ngày HT PER-MO — chỉ dùng completedDate của chính MO, KHÔNG fallback order.completedDate.
        const d = (item as any).completedDate ?? null;
        if (!d) return false;
        const t = new Date(d).getTime();
        if (fromMs !== null && t < fromMs) return false;
        if (toMs   !== null && t > toMs)   return false;
        return true;
      });
      if (filteredItems.length === 0) return [];
    }

    // Item-level requiredDate filter. Không fallback về order.requiredDate: MO chưa có
    // ngày riêng nghĩa là GS chưa cập nhật cho MO đó, không nên khớp lọc theo tuần/khoảng ngày
    // chỉ vì SO cha đã có ngày (tránh lặp lỗi SO 26.10720 — MO chưa xong bị lọc nhầm vào "Tuần này").
    if (_itemReqFromDay !== null || _itemReqToDay !== null) {
      filteredItems = filteredItems.filter(item => {
        const day = vnDayNum(item.requiredDate);
        if (day === null) return false;
        if (_itemReqFromDay !== null && day < _itemReqFromDay) return false;
        if (_itemReqToDay !== null && day > _itemReqToDay) return false;
        return true;
      });
      if (filteredItems.length === 0) return [];
    }

    // Item-level estimatedDate filter (Ngày Chốt SX). Không fallback về order.estimatedDate:
    // MO chưa có ngày chốt riêng không nên khớp lọc chỉ vì SO cha có ngày.
    if (_itemEstFromDay !== null || _itemEstToDay !== null) {
      filteredItems = filteredItems.filter(item => {
        const day = vnDayNum(item.estimatedDate);
        if (day === null) return false;
        if (_itemEstFromDay !== null && day < _itemEstFromDay) return false;
        if (_itemEstToDay !== null && day > _itemEstToDay) return false;
        return true;
      });
      if (filteredItems.length === 0) return [];
    }

    // Per-MO stage filter: stageMatchKeys (SO-level) only determines which SOs are included.
    // Sibling MOs in the same SO that don't match the filter must be hidden here.
    if (filters.stageFilter) {
      const sf = filters.stageFilter;
      if (sf === "SUSPENDED") {
        // Keep MOs that are explicitly SUSPENDED or have a per-stage hold (Tạm ngưng tại khâu)
        filteredItems = filteredItems.filter((item) =>
          (item as Record<string, unknown>).itemStatus === "SUSPENDED" || item.congDoanStatus === "hold"
        );
        if (filteredItems.length === 0) return [];
      } else {
        const ORDER_LEVEL_SF = new Set(["COMPLETED", "CANCELLED"]);
        if (!ORDER_LEVEL_SF.has(sf)) {
          const colonIdx = sf.lastIndexOf(":");
          const filterCode   = colonIdx >= 0 ? sf.slice(0, colonIdx) : null;
          const filterStatus = colonIdx >= 0 ? sf.slice(colonIdx + 1) : null;
          const isActiveFilter = filterStatus === "active";
          if (filterCode) {
            filteredItems = filteredItems.filter((item) => {
              if (!item.congDoanCode) return false;
              if (item.congDoanCode !== filterCode) return false;
              return isActiveFilter || item.congDoanStatus === filterStatus;
            });
            if (filteredItems.length === 0) return [];
          }
        }
      }
    }

    return filteredItems.map((item) => {
      // Per-MO production summary: prefer item-level data (if saved via perItem fix),
      // fall back to order-level for backward compat with pre-fix data
      const productionSummary = order.productionSummary ? {
        ...order.productionSummary,
        tl3d:        item.tl3d        ?? order.productionSummary.tl3d,
        tlXuong:     item.tlXuong     ?? order.productionSummary.tlXuong,
        qd24k:       item.qd24k       ?? order.productionSummary.qd24k,
        qdPt:        item.qdPt        ?? order.productionSummary.qdPt,
        qdBac:       item.qdBac       ?? order.productionSummary.qdBac,
        tlThucTeHt:  item.tlThucTeHt  ?? order.productionSummary.tlThucTeHt,
        danhGiaTl:   item.danhGiaTl   ?? order.productionSummary.danhGiaTl,
        pctChenLech: item.pctChenLech ?? order.productionSummary.pctChenLech,
        thongTinHt:  item.thongTinHt  ?? order.productionSummary.thongTinHt,
        // Ngày HT PER-MO — thiếu dòng này khiến cột "NGÀY HT" trên bảng hiện chung 1 ngày
        // cấp SO (lây từ MO khác đã hoàn tất trong cùng đơn) cho MỌI MO, kể cả MO chưa
        // từng có Ngày HT thật (sidebar đọc đúng completedDate rỗng cho các MO đó).
        ngayHoanTat: item.completedDate ?? order.productionSummary.ngayHoanTat,
        // Per-item only — no SO-level fallback to prevent sibling MO contamination
        congDoan:       item.congDoan,
        congDoanCode:   item.congDoanCode,
        congDoanStatus: item.congDoanStatus,
      } : null;

      // Per-item zone determines PSX/PTK display — not the order-level zone.
      // An order can be in a mixed state (some items PSX, some PTK).
      const isPsx = item.zone === "MASTER_HUB";

      // PTK statuses (IN_DESIGN, DESIGN_APPROVED…) have no meaning in PSX rows
      const effectiveItemStatus = (isPsx && PTK_ONLY_STATUSES.has(item.itemStatus as string))
        ? null
        : item.itemStatus;

      // order.isSuspended propagates to all non-terminal rows
      const isTerminalItem = effectiveItemStatus === "COMPLETED" || effectiveItemStatus === "CANCELLED";
      const isRowSuspended = !isTerminalItem && (effectiveItemStatus === "SUSPENDED" || order.isSuspended);

      return {
        ...order,
        // Per-item zone overrides order.zone for mixed-zone rows.
        // order.zone stays PRE_PRODUCTION after per-MO promote; item.zone reflects actual location.
        zone: item.zone,
        // Per-item ngày lên đơn PTK — override order-level orderDate if item has its own
        orderDate: item.orderDate ?? order.orderDate,
        // Ghi đè riêng theo MO (item.* đã resolve override ?? SO ở tầng API) — Nguồn không có override.
        customerName: item.customerName,
        salesName: item.salesName,
        donHang3Sao: item.donHang3Sao,
        linkChat: item.linkChat,
        // Ưu tiên là cột per-MO thật (item.priorityCode) — không ăn theo order.priorityCode (SO-level),
        // tránh lệch với sidebar (vốn đọc trực tiếp item.priorityCode).
        priorityCode: item.priorityCode,
        firstItem: {
          ...item,
          moNumber: item.moNumber,
        },
        // Explicit per-row item ID — used by row click handler to open the correct MO.
        // Do NOT rely on firstItem?.itemId since ...order spread may shadow it.
        activeItemId: item.itemId,
        productionSummary,
        // Dùng chung computeRowStatus để badge và bộ lọc luôn nhất quán.
        status: computeRowStatus(item, order),
        isSuspended: isRowSuspended,
      };
    });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, activeTab, isSnapshotTab, isHistoryTab, filters.search, filters.status, filters.isPriority, filters.bomFilter, filters.datePreset, filters.dateFrom, filters.dateTo, filters.requiredDateFrom, filters.requiredDateTo, filters.estimatedDateFrom, filters.estimatedDateTo, filters.completedDateFrom, filters.completedDateTo]);

  // Re-sort flat rows so versions appear immediately under their parent MO.
  // Problem: a multi-item base order (e.g. items mo=26.33331 and mo=26.33332) expands to
  // two rows at the same DB position, so both bases appear before any versions.
  // Fix: sort by [orderDate, effectiveMoBase, versionNumber] where effectiveMoBase comes
  // from item.moNumber — each item "belongs to" its own MO family regardless of order.sortKey.
  // Only applied for the default orderDate sort (the MO-grouping view mode).
  //
  // HAI TAB TERMINAL ĐI NHÁNH RIÊNG. Ở đó cột NGÀY LÊN ĐƠN không tồn tại (bộ cột riêng, gọn — xem
  // buildPreProductionColumns), nên gom theo orderDate là sắp theo một trường KHÔNG HIỆN TRÊN
  // BẢNG: thứ tự trông như ngẫu nhiên với người đang tra đơn đã xong. Nhánh này cũng chính là
  // chỗ đã XOÁ thứ tự completedDate mà API vừa sắp — chi tiết trong completed-sort.ts.
  const effectiveSortBy = filters.sortBy ?? "orderDate";
  const effectiveSortDir = filters.sortDir ?? "desc";
  // "orderDate" là GIÁ TRỊ MẶC ĐỊNH, không phải lựa chọn của user (filters.sortBy luôn có giá
  // trị). Dùng đúng quy ước API đang dùng cho tab history để hai tầng không lệch nhau.
  // Mỗi tab sắp theo ĐÚNG cột ngày mà chính nó đang hiện: Hoàn tất → NGÀY HT, Đã hủy → NGÀY HỦY.
  // Tab Đã hủy giờ có cột NGÀY HỦY nên nếu vẫn để nó gom theo orderDate thì tái hiện y nguyên
  // lỗi vừa sửa ở tab Hoàn tất — sắp theo một trường không hiện trên bảng.
  const terminalDateField = activeTab === "completed" ? "completedDate"
    : activeTab === "cancelled" ? "cancelledAt"
    : null;
  const useCompletedOrder = terminalDateField !== null && effectiveSortBy === "orderDate";
  const sortedTableRows = useMemo(() => useCompletedOrder
    ? sortByCompletedDate(tableRows, effectiveSortDir, terminalDateField!)
    : effectiveSortBy === "orderDate"
    ? [...tableRows].sort((a, b) => {
        const dateA = new Date(a.orderDate).getTime();
        const dateB = new Date(b.orderDate).getTime();
        if (dateA !== dateB) return effectiveSortDir === "asc" ? dateA - dateB : dateB - dateA;
        const moA = stripVersionSuffix(a.firstItem?.moNumber ?? a.orderNumber);
        const moB = stripVersionSuffix(b.firstItem?.moNumber ?? b.orderNumber);
        if (moA !== moB) return moA.localeCompare(moB);
        const vnA = a.versionNumber ?? -1;
        const vnB = b.versionNumber ?? -1;
        return vnA - vnB;
      })
    : tableRows,
  [tableRows, effectiveSortBy, effectiveSortDir, useCompletedOrder, terminalDateField]);

  // Lọc nâng cao theo từng trường — áp sau sort, trước phân trang. Pure + memo.
  const filteredTableRows = useMemo(
    () => applyColumnFilters(sortedTableRows, columnFilters),
    [sortedTableRows, columnFilters]
  );

  // ── Dòng tổng của PSX: số MO + tổng TL 3D ───────────────────────────────────
  //
  // Trước đây nằm trong thanh sub-tab MASTER_HUB. Thanh đó đã bỏ (PSX chỉ còn một view), nên
  // số này chuyển vào toolbar — GIỮ NGUYÊN HÀNG ĐÃ CÓ, không thêm hàng mới. Thêm hàng riêng là
  // đúng cái làm tab PSX thấp hơn ba tab còn lại.
  //
  // Đếm trên filteredTableRows, KHÔNG phải pagination.total: tổng TL 3D vốn cộng theo các dòng
  // đang hiện, nên số MO phải cùng phạm vi. Hai con số cạnh nhau mà khác phạm vi thì người đọc
  // sẽ chia hai số cho nhau và ra một trung bình vô nghĩa.
  const psxSummary = useMemo(() => {
    if (activeTab !== "master-hub") return null;
    // Cùng nguồn với cột TL 3D (productionSummary đã merge per-MO) để tổng khớp bảng
    const totalTl3d = filteredTableRows.reduce((sum, r) => {
      const v = parseFloat(r.productionSummary?.tl3d ?? "");
      return isNaN(v) ? sum : sum + v;
    }, 0);
    return { moCount: filteredTableRows.length, totalTl3d };
  }, [activeTab, filteredTableRows]);

  // currentPage (local state) dùng cho cả snapshot, history snapshot, lẫn non-snapshot
  const clientLimit = filters.limit ?? 20;
  const pagedTableRows = (isSnapshotTab || isHistoryTab)
    ? filteredTableRows.slice((currentPage - 1) * clientLimit, currentPage * clientLimit)
    : filteredTableRows;

  // Pending create placeholder — hiển thị ngay ở đầu danh sách, bị lock cho đến khi API xong
  const pendingCreateRow = useMemo((): OrderSummary | null => {
    if (!pendingCreate) return null;
    const showOnTab = activeTab === "all" || activeTab === pendingCreate.tab;
    if (!showOnTab) return null;
    const zone = pendingCreate.loaiDon === "pre_production" ? "PRE_PRODUCTION" : "MASTER_HUB";
    const ts = pendingCreate.createdAt;
    const fi = pendingCreate.firstItem;

    const buildItemRow = (
      item: { moId: string; tenSp: string; nvl: string; size: string;
        soLuong: string; xiMa: string; loaiHotChu: string;
        thongSoDaChu: string; trongLuongYc: string; } | null,
      idx: number,
    ): OrderFirstItem => ({
      itemId: `${pendingCreate.tempId}-item-${idx}`,
      moNumber: item?.moId || pendingCreate.soOdoo,
      zone,
      // Đơn vừa tạo luôn ở PTK; mã số mẫu chỉ có ở PSX.
      masoMau: null,
      // ⚠️ DỮ LIỆU, không phải bộ lọc. Nút lọc "Hỏa tốc" đã bỏ, nhưng cột `isRush` vẫn tồn tại
      // và vẫn đúng — nó suy từ priorityCode và nuôi cờ "Gấp" ở màn chi tiết. Đơn tạm phải khai
      // đủ trường, nếu không thì kiểu OrderFirstItem không khớp.
      isRush: false,
      itemStatus: null,
      // Đơn đang tạo, chưa lưu — chưa thể có kết quả thiết kế 3D nào.
      design3dReviewStatus: null,
      design3dCompletedAt: null,
      design3dKpiStatus: null,
      productName: item?.tenSp || "…",
      nvl: item?.nvl || null,
      size: item?.size || null,
      mainStoneType: item?.loaiHotChu || null,
      mainStoneSize: item?.thongSoDaChu || null,
      ghiChuSp: null,
      techNote: null,
      loaiSp: null,
      techClassification: [],
      platingType: item?.xiMa || null,
      designFileUrl: null,
      designImageUrl: null,
      weightGram: item?.trongLuongYc || null,
      chiTietDaTam: null,
      quantity: parseInt(item?.soLuong ?? "1") || 1,
      isShowroom: false,
      bomStatus: null,
      bomDate: null,
      orderDate: null,
      estimatedDate: null,
      requiredDate: pendingCreate.ngayDukien ?? null,
      completedAt: null,
      saleNote: null,
      priorityCode: pendingCreate.uuTien || "Normal",
      isPriority: false,
      customerName: pendingCreate.customerName || "…",
      salesName: pendingCreate.salesName ?? null,
      donHang3Sao: false,
      linkChat: null,
      ownAlertTitle: null,
      ownAlertCount: 0,
      tl3d: null, tlXuong: null, qd24k: null, qdPt: null, qdBac: null,
      tlThucTeHt: null, danhGiaTl: null, pctChenLech: null, thongTinHt: null, completedDate: null,
      congDoan: null, congDoanCode: null, congDoanStatus: null,
    });

    const allItems: OrderFirstItem[] = (pendingCreate.allItemsData?.length ?? 0) > 0
      ? pendingCreate.allItemsData.map((item, idx) => buildItemRow(item, idx))
      : [buildItemRow(fi, 0)];

    const firstItem = allItems[0];

    return {
      id: pendingCreate.tempId,
      orderNumber: pendingCreate.soOdoo,
      allMoNumbers: allItems.map(it => it.moNumber ?? pendingCreate.soOdoo),
      customerName: pendingCreate.customerName || "…",
      customerPhone: null, customerEmail: null, saleNote: null,
      nguon: pendingCreate.nguon ?? null, phanLoaiKh: null,
      donHang3Sao: false, linkChat: null,
      salesName: pendingCreate.salesName ?? null,
      priorityCode: pendingCreate.uuTien || "Normal",
      status: zone === "PRE_PRODUCTION" ? "DRAFT" : "IN_PRODUCTION",
      zone,
      isSuspended: false, isPriority: false, isRush: false,
      orderDate: ts,
      requiredDate: pendingCreate.ngayDukien ?? null,
      estimatedDate: null, estimatedTotal: null, depositAmount: null,
      version: 1, sortKey: pendingCreate.soOdoo,
      versionNumber: null, baseOrderNumber: null, completedDate: null,
      createdBy: null, assignedTo: null,
      _count: { items: pendingCreate.itemCount || 1, alerts: 0 },
      firstItem,
      allItems,
      productionSummary: null,
      stageMatchKeys: [],
      activeAlertTitle: null,
      storeId: null,
      createdAt: ts, updatedAt: ts,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCreate, activeTab]);

  const displayRows = useMemo(() => {
    if (!pendingCreateRow) return pagedTableRows;
    // Expand each item into its own row — mirrors the flatMap that real orders go through.
    // pendingCreateRow bypasses that flatMap (it's injected directly), so we expand here.
    const expandedPending = pendingCreateRow.allItems.length <= 1
      ? [pendingCreateRow]
      : pendingCreateRow.allItems.map(item => ({
          ...pendingCreateRow,
          firstItem: item,
          zone: item.zone as typeof pendingCreateRow.zone,
          activeItemId: item.itemId,
        }));
    return [...expandedPending, ...pagedTableRows];
  }, [pendingCreateRow, pagedTableRows]);

  const pagination = (isSnapshotTab || isHistoryTab)
    ? {
        page: currentPage,
        limit: clientLimit,
        total: filteredTableRows.length,
        totalPages: Math.ceil(filteredTableRows.length / clientLimit) || 1,
      }
    : data
      ? { ...data.pagination, page: currentPage }
      : { page: currentPage, limit: clientLimit, total: 0, totalPages: 0 };

  function handleSortChange(sortStr: string) {
    const [field, dir] = sortStr.split(":");
    updateUrl({ sortBy: field, sortDir: dir as "asc" | "desc", page: 1 });
  }

  function handleOpenPanel(orderId: string, itemId?: string) {
    setIsClosingPanel(false);  // reset immediately — don't wait for URL to arrive
    updateUrl({ orderId, activeItemId: itemId ?? null });
  }

  function handleClosePanel() {
    setIsClosingPanel(true);   // immediate — panel unmounts without waiting for router.push
    updateUrl({ orderId: null, _w: "1" }); // _w=1 prevents isFreshLoad SSR prefetch on panel close
  }

  const selectedOrderId = filters.orderId ?? null;
  const activeItemId = filters.activeItemId ?? null;

  // Reset closing flag when a new panel is opened (new orderId arrives from URL)
  const prevSelectedOrderIdRef = useRef(selectedOrderId);
  if (prevSelectedOrderIdRef.current !== selectedOrderId) {
    prevSelectedOrderIdRef.current = selectedOrderId;
    if (selectedOrderId && isClosingPanel) setIsClosingPanel(false);
  }

  const panelOrderId = isClosingPanel ? null : selectedOrderId;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--cream)" }}>

      {/* ── Recovery banner: tạo đơn thất bại ──────────────────────── */}
      {pendingCreateFailed && (
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: "10px",
          padding: "10px 20px", background: "rgba(220,38,38,0.08)",
          borderBottom: "1px solid rgba(220,38,38,0.2)",
          fontSize: "12px",
        }}>
          <span style={{ flex: 1, color: "#991b1b", fontWeight: 500 }}>
            Tạo đơn <strong>{pendingCreateFailed.soOdoo}</strong> thất bại — {pendingCreateFailed.errorMessage}
          </span>
          <button
            type="button"
            onClick={() => {
              queryClient.setQueryData(["pending-create-restore"], { formSnapshot: pendingCreateFailed.formSnapshot });
              queryClient.removeQueries({ queryKey: ["pending-create-failed"] });
              router.push("/dashboard/orders/new");
            }}
            style={{ padding: "4px 12px", fontSize: "11px", fontWeight: 600, cursor: "pointer", background: "#dc2626", color: "#fff", border: "none", borderRadius: "4px" }}
          >
            Thử lại
          </button>
          <button
            type="button"
            onClick={() => queryClient.removeQueries({ queryKey: ["pending-create-failed"] })}
            style={{ padding: "4px 10px", fontSize: "11px", fontWeight: 500, cursor: "pointer", background: "none", color: "#991b1b", border: "1px solid rgba(220,38,38,0.3)", borderRadius: "4px" }}
          >
            Bỏ qua
          </button>
        </div>
      )}

      {/* ── Thanh tiêu đề ─────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--cream-card)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h1 style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: "22px", fontWeight: 400, color: "var(--ink)", margin: 0 }}>
            {L.ui.pageTitle}
          </h1>
          {isFetching && !isLoading && !isAutoSyncRef.current && (
            <Loader2 className="animate-spin" style={{ width: "14px", height: "14px", color: "var(--ink-muted)" }} />
          )}
        </div>
        {userRole !== "SALES" && (
          <button
            type="button"
            onClick={() => router.push(`/dashboard/orders/new?from=${activeTab}`)}
// Prefetch stores on hover to improve UX
            onMouseEnter={() => {
              queryClient.prefetchQuery({
                queryKey: ['stores'],
                queryFn: async () => {
                  const r = await fetch('/api/stores');
                  if (!r.ok) throw new Error('Failed to fetch stores');
                  return r.json();
                },
              });
            }}
            className="psx-btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Plus style={{ width: "13px", height: "13px" }} />
            {L.ui.createOrder}
          </button>
        )}
      </div>

      {/* ── Store Quick Bar (SALES only) ─────────────────────────── */}
      {userRole === "SALES" && userStores.length > 0 && (
        <div style={{
          // `flexWrap`: hôm nay 5 cửa hàng thì vừa một dòng, nhưng một Sales được gán 12 cửa
          // hàng là tràn ngang và các chip cuối biến mất. Một dòng, chặn một lỗi chưa xảy ra.
          flexShrink: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px",
          padding: "8px 20px", borderBottom: "1px solid var(--border)", background: "var(--cream-card)",
        }}>
          <span style={{ fontSize: "10px", fontWeight: 500, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginRight: "4px", flexShrink: 0 }}>
            Cửa hàng:
          </span>
          {/* 🔴 CHIP "TẤT CẢ" LÀ ĐƯỜNG QUAY LẠI, VÀ TRƯỚC ĐÂY KHÔNG CÓ ĐƯỜNG NÀO.
              Sales chọn một cửa hàng rồi kẹt: bấm lại chip đang chọn không làm gì, "Xóa lọc"
              chừa storeId lại, đổi tab thì nó đi theo. Lối ra duy nhất là bấm lại mục sidebar
              cho URL sạch — không ai đoán ra.

              Và vì sao là một CHIP chứ không phải "bấm lại để tắt": vấn đề không phải không
              tắt được, mà là không ai đoán ra cách tắt. Một hành vi ẩn thì sửa xong vẫn không
              ai tìm thấy. `ALL_STORES` cho nó đi chung một đường với các chip khác. */}
          {[{ id: ALL_STORES, code: "Tất cả" }, ...userStores].map((store) => {
            const chipState = storeChipState({
              chipId: store.id,
              selectedStoreId: filters.storeId,
              pendingStoreId,
            });
            const highlight = chipState === "active" || chipState === "pending";
            // Chip "Tất cả" không phải một cửa hàng nên không mang màu cửa hàng nào.
            const color = store.id === ALL_STORES ? "var(--ink)" : (STORE_DOT[store.code] ?? "#888");
            const tinted = store.id !== ALL_STORES;
            return (
              <button
                key={store.id}
                type="button"
                onClick={() => {
                  if (!isStoreChipClickable(chipState)) return;
                  setPendingStoreId(store.id);
                  updateUrl({ storeId: storeIdForChip(store.id) });
                }}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "4px 12px", fontSize: "12px",
                  fontWeight: highlight ? 600 : 400,
                  background: highlight ? (tinted ? color + "18" : "var(--cream-dark)") : "var(--cream-dark)",
                  color: highlight ? color : "var(--ink-muted)",
                  border: `1px solid ${highlight ? (tinted ? color + "55" : "var(--ink)") : "var(--border)"}`,
                  borderRadius: "4px",
                  cursor: isStoreChipClickable(chipState) ? "pointer" : "default",
                  opacity: chipState === "dimmed" ? 0.45 : 1,
                  transition: "all 0.12s",
                }}
              >
                {tinted && (
                  <span style={{
                    width: "7px", height: "7px", borderRadius: "50%",
                    background: color, flexShrink: 0,
                    animation: chipState === "pending" ? "spin 0.7s linear infinite" : "none",
                  }} />
                )}
                {store.code}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Tab bar + view toggle ─────────────────────────────────── */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center",
        borderBottom: "1px solid var(--border)", background: "var(--cream-card)",
        overflowX: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", padding: "0 20px" }}>
          {TABS.map(({ key, label }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  const cacheKey = SNAPSHOT_TABS.has(key)
                    ? ["orders-snapshot", buildSnapshotQuery(key)]
                    : HISTORY_TABS.has(key)
                      ? ["orders-history-snapshot", buildHistorySnapshotQuery(key, filters.storeId)]
                      : ["orders", buildApiQuery({ ...filters, tab: key, page: 1 })];
                  const cached = queryClient.getQueryData(cacheKey);
                  setPendingTabHasCache(cached !== undefined);
                  setPendingTab(key);
                  updateUrl({ tab: key, page: 1 });
                }}
                style={{
                  position: "relative", padding: "10px 16px",
                  fontSize: "13px", fontWeight: active ? 500 : 400, whiteSpace: "nowrap",
                  borderBottom: active ? "2px solid var(--pink)" : "2px solid transparent",
                  marginBottom: "-1px",
                  color: active ? "var(--ink)" : "var(--ink-muted)",
                  background: "none", border: "none",
                  borderBottomWidth: "2px",
                  borderBottomStyle: "solid",
                  borderBottomColor: active ? "var(--pink)" : "transparent",
                  cursor: "pointer", transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {label}
                {active && isFetching && !isLoading && !isAutoSyncRef.current ? (
                  <Loader2 className="animate-spin" style={{ marginLeft: "6px", width: "10px", height: "10px", color: "var(--ink-muted)", verticalAlign: "middle" }} />
                ) : (() => {
                  const n = active ? pagination.total : (tabCountMap[key] ?? 0);
                  return n > 0 ? (
                    <span style={{
                      marginLeft: "6px", fontSize: "10px", fontWeight: 700,
                      background: active ? "var(--cream-dark)" : "var(--cream)",
                      color: active ? "var(--ink-muted)" : "var(--ink-muted)",
                      border: "1px solid var(--border)", padding: "1px 5px",
                    }}>
                      {n > 999 ? "999+" : n}
                    </span>
                  ) : null;
                })()}
              </button>
            );
          })}
        </div>

        {/* Toggle Table / Card view */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "2px", padding: "6px 16px" }}>
          <ViewToggle
            active={viewMode === "table"}
            onClick={() => updateUrl({ view: "table" })}
            title={L.ui.tableView}
            icon={<Table2 style={{ width: "15px", height: "15px" }} />}
          />
          <ViewToggle
            active={viewMode === "card"}
            onClick={() => updateUrl({ view: "card" })}
            title={L.ui.cardView}
            icon={<LayoutGrid style={{ width: "15px", height: "15px" }} />}
          />
        </div>
      </div>

      {/* ── Toolbar lọc / tìm kiếm ─────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: "8px 20px", background: "var(--cream-dark)", borderBottom: "1px solid var(--border)" }}>
        <OrdersToolbar
          filters={filters}
          isPriority={filters.isPriority}
          datePreset={filters.datePreset as -1 | 0 | 7 | 30}
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          deadlinePreset={filters.deadlinePreset ?? null}
          requiredDateFrom={filters.requiredDateFrom}
          requiredDateTo={filters.requiredDateTo}
          estimatedDateFrom={filters.estimatedDateFrom}
          estimatedDateTo={filters.estimatedDateTo}
          completedDateFrom={filters.completedDateFrom}
          completedDateTo={filters.completedDateTo}
          stageFilter={filters.stageFilter}
          phanLoaiKh={filters.phanLoaiKh}
          bomFilter={filters.bomFilter}
          stores={stores}
          storeId={filters.storeId}
          onFiltersChange={(patch) => updateUrl({ ...patch, page: 1, ...(isSnapshotTab ? { _w: "1" } : {}) })}
          totalCount={pagination.total}
          psxSummary={psxSummary}
          lastSyncedAt={lastSyncedAt}
          hasChanges={effectiveHasChanges}
          changedCount={effectiveHasChanges ? (metaData?.changedCount ?? 0) : 0}
          isSyncing={isFetching}
          onManualSync={handleManualSync}
          changedOrders={effectiveHasChanges ? (metaData?.changedOrders ?? []) : []}
          isHistoryTab={isHistoryTab}
          historyLastUpdatedAt={isHistoryTab ? (metaData?.lastUpdatedAt ?? null) : null}
          hideStorePicker={userStores.length > 0}
        />
        {(isSnapshotTab || isHistoryTab) && (
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", marginTop: "6px" }}>
            <AdvancedFilter rows={sortedTableRows} filters={columnFilters} onChange={setColumnFilters} />
            <button
              type="button"
              onClick={() => setShowPrint(true)}
              title="Lọc rồi in / xuất PDF danh sách hiện tại"
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "4px 12px", height: "28px", fontSize: "11px", fontWeight: 600,
                color: "var(--ink)", background: "var(--cream-card)",
                border: "1px solid var(--border)", borderRadius: "5px", cursor: "pointer",
              }}
            >
              <Printer className="w-3 h-3" /> In / Xuất PDF ({filteredTableRows.length})
            </button>
          </div>
        )}
      </div>

      <PrintReport
        open={showPrint}
        onClose={() => setShowPrint(false)}
        rows={filteredTableRows}
        filters={filters as unknown as Record<string, any>}
      />

      {/* ── Nội dung chính ─────────────────────────────────────────── */}
      {/* Dim chỉ khi user-initiated sync (isAutoSyncRef = false), không dim khi auto-sync ngầm */}
      <div style={{
        flex: 1, minHeight: 0, overflow: "hidden", position: "relative",
        opacity: (isFetching && !isLoading && !isAutoSyncRef.current) ? 0.55 : 1,
        transition: "opacity 0.15s ease",
        pointerEvents: (isFetching && !isLoading && !isAutoSyncRef.current) ? "none" : "auto",
      }}>
        {/* Store switch overlay — hiện khi đang chuyển store, ẩn khi URL cập nhật xong */}
        {pendingStoreId && (() => {
          // ⚠️ `pendingStoreId === ALL_STORES` thì KHÔNG tìm ra cửa hàng nào — đó là đúng, không
          // phải lỗi. Thiếu nhánh này thì lớp phủ hiện "Đang chuyển sang" rồi bỏ trống tên, và
          // đúng thao tác vừa được thêm vào lại là thao tác trông như hỏng.
          const toAll = pendingStoreId === ALL_STORES;
          const ps = toAll ? null : userStores.find(s => s.id === pendingStoreId);
          const color = toAll ? "var(--ink)" : (STORE_DOT[ps?.code ?? ""] ?? "#888");
          const label = toAll ? "Tất cả cửa hàng" : ps?.code;
          return (
            <div style={{
              position: "absolute", inset: 0, zIndex: 20,
              background: "rgba(250,248,245,0.78)",
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "10px 22px",
                background: "var(--cream-card)",
                border: `1px solid ${color}55`,
                boxShadow: `0 4px 20px ${color}22`,
              }}>
                <span style={{
                  width: "8px", height: "8px", borderRadius: "50%",
                  background: color, flexShrink: 0,
                  animation: "spin 0.7s linear infinite",
                }} />
                <span style={{ fontSize: "13px", color: "var(--ink)", fontWeight: 400 }}>
                  Đang chuyển sang{" "}
                  <span style={{ color, fontWeight: 700 }}>{label}</span>
                </span>
              </div>
            </div>
          );
        })()}
        <>
            {isError && (error as Error)?.name !== "AbortError" && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 16px", background: "rgba(220,38,38,0.07)",
                borderBottom: "1px solid rgba(220,38,38,0.18)", flexShrink: 0,
              }}>
                <span style={{ fontSize: "12px", color: "#dc2626" }}>
                  Lỗi kết nối — {tabHasEverLoaded ? "đang hiển thị dữ liệu cũ" : "không thể tải dữ liệu"}
                </span>
                <button
                  type="button"
                  onClick={() => isHistoryTab
                    ? queryClient.invalidateQueries({ queryKey: ["orders-history-snapshot"] })
                    : isSnapshotTab
                      ? queryClient.invalidateQueries({ queryKey: ["orders-snapshot"] })
                      : queryClient.invalidateQueries({ queryKey: ["orders"] })
                  }
                  style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "#dc2626", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                >
                  <RefreshCw style={{ width: "12px", height: "12px" }} />
                  Thử lại
                </button>
              </div>
            )}
            {viewMode === "card" ? (
              <CardGrid
                orders={pendingTab !== null && !pendingTabHasCache ? [] : displayRows}
                pagination={pagination}
                isLoading={isLoading}
                activeTab={activeTab}
                onPageChange={(p) => { setCurrentPage(p); if (!isSnapshotTab) updateUrl({ page: p }); }}
                onCardClick={(id) => {
                  const row = displayRows.find((r) => r.id === id);
                  handleOpenPanel(id, (row as any)?.activeItemId ?? row?.firstItem?.itemId ?? undefined);
                }}
              />
            ) : (
              <OrdersTable
                data={pendingTab !== null && !pendingTabHasCache ? [] : displayRows}
                pagination={pagination}
                tab={activeTab}
                sortBy={filters.sortBy ?? "orderDate"}
                sortDir={filters.sortDir ?? "desc"}
                onSortChange={handleSortChange}
                onPageChange={(p) => { setCurrentPage(p); if (!isSnapshotTab) updateUrl({ page: p }); }}
                onLimitChange={(l) => updateUrl({ limit: l })}
                onRowClick={handleOpenPanel}
                onRowHover={(id) => queryClient.prefetchQuery({ queryKey: ["order-panel", id], queryFn: () => fetchOrderDetail(id), staleTime: 5 * 60_000 })}
                isLoading={isLoading || (pendingTab !== null && !pendingTabHasCache)}
                flashOrderId={flashOrderId}
                crossUserFlashIds={crossUserFlashIds}
                pendingOrderId={pendingItemId ?? null}
                pendingCreateTempId={pendingCreate?.tempId ?? null}
                hasActiveFilters={!!(filters.search || filters.isPriority || filters.dateFrom || filters.datePreset != null)}
                onClearFilters={() => updateUrl({ search: undefined, isPriority: undefined, dateFrom: undefined, dateTo: undefined, datePreset: undefined, deadlinePreset: null, requiredDateFrom: undefined, requiredDateTo: undefined, page: 1, ...(isSnapshotTab ? { _w: "1" } : {}) } as any)}
              />
            )}
          </>
      </div>

      {/* Panel chi tiết đơn */}
      <OrderDetailPanel
        orderId={panelOrderId}
        placeholderData={panelOrderId ? (data?.data?.find((r) => r.id === panelOrderId) ?? null) : null}
        activeItemId={activeItemId}
        onClose={handleClosePanel}
        onOrderUpdated={(opts) => {
          if (!opts?.skipSnapshotInvalidation) {
            // Promote/rollback/resolve: snapshot must be invalidated (orders moved between zones)
            isAutoSyncRef.current = true;
            if (isSnapshotTab && snapshotQuery) {
              queryClient.invalidateQueries({ queryKey: ["orders-snapshot", snapshotQuery] });
            } else {
              queryClient.invalidateQueries({ queryKey: ["orders", buildApiQuery(filters)] });
            }
          }
          // Flash highlight: highlight dòng vừa save trong 2 giây
          if (selectedOrderId) {
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
            setFlashOrderId(selectedOrderId);
            flashTimerRef.current = setTimeout(() => setFlashOrderId(null), 2000);
          }
        }}
        onNavigateAfterAction={({ tab, orderId: targetOrderId }) => {
          // Switch to destination tab then flash-highlight the order
          updateUrl({ tab: tab as typeof filters.tab, orderId: null });
          setTimeout(() => {
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
            setFlashOrderId(targetOrderId);
            flashTimerRef.current = setTimeout(() => setFlashOrderId(null), 2500);
          }, 400);
        }}
        readOnly={userRole === "SALES"}
        currentUserRole={userRole}
        onSavePending={(id) => setPendingItemId(id)}
        onSaveDone={() => setPendingItemId(null)}
        onReopenOrder={(id) => updateUrl({ orderId: id, activeItemId: null })}
        externallyUpdated={panelOrderStale}
        isSavePending={!!pendingItemId}
      />

    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ViewToggle({
  active,
  onClick,
  title,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        padding: "5px", border: "none", cursor: "pointer", transition: "all 0.15s",
        background: active ? "var(--cream-dark)" : "transparent",
        color: active ? "var(--ink)" : "var(--ink-muted)",
      }}
    >
      {icon}
    </button>
  );
}

function CardGrid({
  orders,
  pagination,
  isLoading,
  activeTab,
  onPageChange,
  onCardClick,
}: {
  orders: OrderSummary[];
  pagination: { page: number; totalPages: number; total: number; limit: number };
  isLoading: boolean;
  activeTab: string;
  onPageChange: (p: number) => void;
  onCardClick?: (id: string) => void;
}) {
  const L = useLabels();
  const { page, totalPages, total, limit } = pagination;
  const from = Math.min((page - 1) * limit + 1, total);
  const to = Math.min(page * limit, total);
  // Ẩn zone badge khi đang lọc theo tab đơn zone — thông tin thừa
  const hideZoneBadge = activeTab === "pre-production" || activeTab === "master-hub";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {isLoading ? (
          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ border: "1px solid var(--border)", background: "var(--cream-card)", padding: "16px" }} className="psx-shimmer">
                <div style={{ height: "12px", width: "70px", background: "var(--cream-dark)", marginBottom: "8px" }} />
                <div style={{ height: "14px", width: "120px", background: "var(--cream-dark)", marginBottom: "10px" }} />
                <div style={{ height: "10px", width: "60px", background: "var(--cream-dark)" }} />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: "13px", color: "var(--ink-muted)" }}>
            {L.ui.noOrdersFound}
          </div>
        ) : (
          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onCardClick={onCardClick} hideZoneBadge={hideZoneBadge} />
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 20px", borderTop: "1px solid var(--border)", background: "var(--cream-card)",
          fontSize: "12px",
        }}>
          <span style={{ color: "var(--ink-muted)" }}>
            {from}–{to} / {total.toLocaleString("vi-VN")} {L.ui.orders}
          </span>
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="psx-btn-secondary"
              style={{ height: "28px", fontSize: "11px", padding: "0 10px" }}
            >
              {L.ui.prev}
            </button>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="psx-btn-secondary"
              style={{ height: "28px", fontSize: "11px", padding: "0 10px" }}
            >
              {L.ui.next}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

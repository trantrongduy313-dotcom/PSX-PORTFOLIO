"use client";

import { Search, X, SlidersHorizontal, Star, ChevronDown, RefreshCw, Loader2 } from "lucide-react";
import { useRef, useState, useEffect, type CSSProperties } from "react";
import { normalizeSearch } from "@/app/lib/utils";
import { useLabels } from "@/app/lib/i18n/locale-context";
import { STAGE_FILTER_DEFS } from "@/app/lib/utils/order-helpers";
import { BOM_STATUSES, BOM_STATUS_LABELS } from "@/app/lib/business/bom";
// ⚠️ Ô nào hiện ở tab nào KHÔNG còn viết thẳng trong JSX nữa. Cùng bảng này quyết định việc rửa
// bộ lọc khi đổi tab (order-url-params.ts) — một nguồn, nên "ô biến mất" và "giá trị bị rửa"
// không thể lệch nhau. Trước đây chúng lệch, và đó là lỗi bộ-lọc-vô-hình.
import { isFilterOnTab } from "@/app/lib/ui/order-filter-scope";
import { DateInput } from "./date-input";
import {
  STATUS_LABEL,
  type OrderStatus,
  type OrderFilters,
  type OrderTab,
} from "@/app/lib/types/order";
import type { Labels } from "@/app/lib/i18n/labels";
import {
  DATE_FILTER_FIELDS,
  defaultDateFilterKey,
  type DateFilterKey,
  type DateFilterFromParam,
  type DateFilterToParam,
} from "./date-filter-fields";
import { deadlineRangeFor, type DeadlinePreset } from "@/app/lib/business/orders/deadline-preset";

type DateFilterValues = Partial<Record<DateFilterFromParam | DateFilterToParam, string | undefined>>;

// Xuất để test đọc thẳng, không chép lại: __tests__/orders-deadline-preset.test.ts
export const STATUS_BY_TAB: Record<OrderTab, OrderStatus[]> = {
  // Tab "Tất cả" chỉ hiển thị đơn non-terminal — loại COMPLETED/CANCELLED để tránh
  // user chọn status không có kết quả (tab này đã filter bỏ 2 status đó rồi)
  all: [
    "DRAFT", "PENDING_DESIGN", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED", "DESIGN_COMPLETED",
    "IN_PRODUCTION", "SUSPENDED",
  ],
  "pre-production": [
    "DRAFT", "PENDING_DESIGN", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED", "DESIGN_COMPLETED",
  ],
  "master-hub": [
    "IN_PRODUCTION", "SUSPENDED",
  ],
  suspended: ["SUSPENDED"],
  priority: [
    "DRAFT", "IN_DESIGN", "IN_PRODUCTION",
  ],
  history:   ["COMPLETED", "CANCELLED"],
  completed: ["COMPLETED"],
  cancelled: ["CANCELLED"],
};

// Màu dot per store code — khớp với sidebar
const STORE_DOT: Record<string, string> = {
  CH1:  "#E91D79",
  CH2:  "#1E40AF",
  CH3:  "#2D7A4F",
  ADM1: "#B8860B",
  ADM2: "#8A8178",
};

type DatePreset = -1 | 0 | 7 | 30;


// Patch dùng chung cho mọi onFiltersChange — gom các field UI-only (preset, range ngày)
// không thuộc OrderFilters gốc. Dùng lại cho cả Props lẫn các sub-component (DateRangeFilter).
type FilterPatch = Partial<OrderFilters & {
  isPriority?: boolean;
  bomFilter?: string;
  datePreset?: DatePreset;
  dateFrom?: string;
  dateTo?: string;
  deadlinePreset?: DeadlinePreset;
  requiredDateFrom?: string;
  requiredDateTo?: string;
  estimatedDateFrom?: string;
  estimatedDateTo?: string;
  completedDateFrom?: string;
  completedDateTo?: string;
  stageFilter?: string;
  storeId?: string;
  phanLoaiKh?: string;
}>;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type Props = {
  filters: OrderFilters;
  onFiltersChange: (patch: FilterPatch) => void;
  totalCount: number;
  /**
   * Dòng tổng của PSX — chỉ tab Phòng Sản Xuất truyền, các tab khác là null.
   *
   * Trước đây số này nằm ở thanh sub-tab MASTER_HUB. Thanh đó đã bỏ nên nó về đây, DÙNG LẠI
   * hàng đã có chứ không thêm hàng mới — thêm hàng là đúng cái làm tab PSX thấp hơn tab khác.
   *
   * Khi có giá trị, `moCount` THAY CHO totalCount: nó đếm theo các dòng đang hiện (đã lọc),
   * cùng phạm vi với tổng TL 3D. Hiện totalCount (chưa lọc) cạnh một tổng đã lọc là để hai con
   * số cạnh nhau nói về hai tập khác nhau.
   */
  psxSummary?: { moCount: number; totalTl3d: number } | null;
  isPriority?: boolean;
  datePreset?: DatePreset;
  dateFrom?: string;
  dateTo?: string;
  deadlinePreset?: DeadlinePreset;
  requiredDateFrom?: string;
  requiredDateTo?: string;
  estimatedDateFrom?: string;
  estimatedDateTo?: string;
  completedDateFrom?: string;
  completedDateTo?: string;
  stageFilter?: string;
  phanLoaiKh?: string;
  // BOM filter (chỉ tab PTK) — giá trị BomStatus hoặc undefined (tắt)
  bomFilter?: string;
  stores?: { id: string; code: string; name: string }[];
  storeId?: string;
  lastSyncedAt?: Date | null;
  hasChanges?: boolean;
  changedCount?: number;
  changedOrders?: { id: string; orderNumber: string; storeName: string | null; changedItemIds?: string[]; changedMoNumbers?: string[] }[];
  isSyncing?: boolean;
  onManualSync?: () => void;
  isHistoryTab?: boolean;
  historyLastUpdatedAt?: string | null;
  hideStorePicker?: boolean;
};

// Bộ lọc ngày gộp: 1 dropdown chọn trục ngày + 1 cặp Từ...Đến dùng chung.
// Component "câm" — chỉ render + emit patch; toàn bộ khác biệt định dạng/side-effect
// giữa các trục ngày do DATE_FILTER_FIELDS (descriptor) đảm nhận.
function DateRangeFilter({ L, tab, values, selectedKey, onSelectKey, onFiltersChange }: {
  L: Labels;
  tab: string | undefined;
  values: DateFilterValues;
  selectedKey: DateFilterKey;
  onSelectKey: (key: DateFilterKey) => void;
  // Patch chỉ chứa các key ngày hợp lệ (do descriptor sinh ra) — parent thu hẹp về FilterPatch.
  onFiltersChange: (patch: Record<string, unknown>) => void;
}) {
  // Trục ngày nào hiện ở tab này — đọc CÙNG bảng phạm vi với mọi bộ lọc khác.
  const visibleFields = DATE_FILTER_FIELDS.filter((f) => isFilterOnTab(f.fromParam, tab));
  const def = visibleFields.find((f) => f.key === selectedKey) ?? visibleFields[0];
  if (!def) return null;

  const fromStored = values[def.fromParam];
  const toStored = values[def.toParam];
  const fromYmd = fromStored ? def.decode(fromStored) : undefined;
  const toYmd = toStored ? def.decode(toStored) : undefined;

  const handleFrom = (v: string | undefined) => {
    const patch: Record<string, unknown> = {
      ...def.sideEffectPatch,
      [def.fromParam]: v ? def.encode(v) : undefined,
      page: 1,
    };
    // Chọn 1 ngày ở ô "Từ" khi "Đến" trống → tự điền Đến = Từ (tìm 1 ngày cụ thể, 1 chạm)
    if (v && !toStored) patch[def.toParam] = def.encode(v);
    onFiltersChange(patch);
  };
  const handleTo = (v: string | undefined) => {
    onFiltersChange({
      ...def.sideEffectPatch,
      [def.toParam]: v ? def.encode(v) : undefined,
      page: 1,
    });
  };
  const handleSelect = (nextKey: DateFilterKey) => {
    onSelectKey(nextKey);
    // Chỉ 1 trục ngày active: xoá range của mọi trục khác (giữ nguyên preset nhanh).
    const clearPatch: Record<string, unknown> = { page: 1 };
    for (const f of DATE_FILTER_FIELDS) {
      if (f.key !== nextKey) {
        clearPatch[f.fromParam] = undefined;
        clearPatch[f.toParam] = undefined;
      }
    }
    onFiltersChange(clearPatch);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
      <span className="psx-label" style={{ whiteSpace: "nowrap" }}>Lọc theo ngày</span>
      <select
        value={def.key}
        onChange={(e) => handleSelect(e.target.value as DateFilterKey)}
        className="psx-input"
        style={{ width: "auto", fontSize: "11px" }}
      >
        {visibleFields.map((f) => (
          <option key={f.key} value={f.key}>{f.getLabel(L)}</option>
        ))}
      </select>
      <span className="psx-label" style={{ whiteSpace: "nowrap" }}>từ</span>
      <DateInput
        value={fromYmd ?? ""}
        onChange={(v) => handleFrom(v || undefined)}
        className="psx-input"
        style={{ width: "110px", fontSize: "11px" }}
      />
      <span className="psx-label" style={{ whiteSpace: "nowrap" }}>đến</span>
      <DateInput
        value={toYmd ?? ""}
        onChange={(v) => handleTo(v || undefined)}
        className="psx-input"
        style={{ width: "110px", fontSize: "11px" }}
      />
    </div>
  );
}

export function OrdersToolbar({
  filters,
  onFiltersChange,
  totalCount,
  psxSummary = null,
  isPriority = false,
  bomFilter,
  datePreset = -1,
  dateFrom,
  dateTo,
  deadlinePreset = null,
  requiredDateFrom,
  requiredDateTo,
  estimatedDateFrom,
  estimatedDateTo,
  completedDateFrom,
  completedDateTo,
  stageFilter,
  phanLoaiKh,
  stores = [],
  storeId,
  lastSyncedAt,
  hasChanges = false,
  changedCount = 0,
  changedOrders = [],
  isSyncing = false,
  onManualSync,
  isHistoryTab = false,
  historyLastUpdatedAt = null,
  hideStorePicker = false,
}: Props) {
  const L = useLabels();
  const DATE_PRESETS = [
    { label: L.ui.toolbar.today, days: 0 as DatePreset },
    { label: L.ui.toolbar.days7, days: 7 as DatePreset },
    { label: L.ui.toolbar.days30, days: 30 as DatePreset },
    { label: L.ui.toolbar.allDates, days: -1 as DatePreset },
  ];
  const [showFilters, setShowFilters] = useState(false);
  const [showStagePanel, setShowStagePanel] = useState(false);
  const [showStorePanel, setShowStorePanel] = useState(false);
  // Bộ lọc ngày gộp: trục ngày đang chọn trong dropdown "Lọc theo ngày".
  // Khởi tạo: ưu tiên trục nào đang có range; nếu không → mặc định theo tab.
  const dateFilterValues: DateFilterValues = {
    dateFrom, dateTo,
    requiredDateFrom, requiredDateTo,
    estimatedDateFrom, estimatedDateTo,
    completedDateFrom, completedDateTo,
  };
  const [dateFilterKey, setDateFilterKey] = useState<DateFilterKey>(() => {
    const active = DATE_FILTER_FIELDS.find((f) => dateFilterValues[f.fromParam] || dateFilterValues[f.toParam]);
    return active?.key ?? defaultDateFilterKey(filters.tab);
  });
  // ⚠️ TỪNG CÓ MỘT `useEffect` Ở ĐÂY và nó đã được BỎ HẲN, không phải chuyển đi nơi khác.
  //
  // Nó đặt lại trục ngày khi đổi sang tab không có trục đó. Nhưng nó chỉ đặt lại CÁI DROPDOWN,
  // không xoá GIÁ TRỊ — nên người dùng thấy dropdown nhảy về "Ngày tạo" trong khi
  // `completedDateFrom` vẫn đang lọc. Chữa cháy nửa vời, và nửa còn lại mới là nửa quan trọng.
  //
  // Nay giá trị được rửa ngay ở nguồn (order-url-params.ts), còn `DateRangeFilter` vốn ĐÃ tự
  // lùi về trục hợp lệ đầu tiên (`?? visibleFields[0]`, và `<select value={def.key}>`). Không
  // còn gì để effect này làm — giữ lại chỉ là một lượt render dây chuyền và một lỗi eslint.
  const stagePanelRef = useRef<HTMLDivElement>(null);
  const storePanelRef = useRef<HTMLDivElement>(null);

  // Pulse animation khi changedCount tăng (có thêm đơn thay đổi mới)
  const [isPulsing, setIsPulsing] = useState(false);
  const prevChangedCountRef = useRef(changedCount);
  useEffect(() => {
    if (changedCount > prevChangedCountRef.current) {
      setIsPulsing(true);
      const t = setTimeout(() => setIsPulsing(false), 1500);
      prevChangedCountRef.current = changedCount;
      return () => clearTimeout(t);
    }
    if (!hasChanges) prevChangedCountRef.current = 0;
  }, [changedCount, hasChanges]);

  const [localSearch, setLocalSearch] = useState(filters.search ?? "");
  const debouncedSearch = useDebounce(localSearch, 400);
  const searchRef = useRef<HTMLInputElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const normalized = debouncedSearch ? normalizeSearch(debouncedSearch) : undefined;
    onFiltersChange({ search: normalized || undefined, page: 1 });
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showStagePanel) return;
    function handleOutside(e: MouseEvent) {
      if (stagePanelRef.current && !stagePanelRef.current.contains(e.target as Node)) {
        setShowStagePanel(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showStagePanel]);

  useEffect(() => {
    if (!showStorePanel) return;
    function handleOutside(e: MouseEvent) {
      if (storePanelRef.current && !storePanelRef.current.contains(e.target as Node)) {
        setShowStorePanel(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showStorePanel]);

  const activeStore = storeId ? stores.find((s) => s.id === storeId) : null;

  // ─── Huy hiệu số trên nút LỌC ─────────────────────────────────────────────
  //
  // 🔴 CHỈ ĐẾM BỘ LỌC CÓ Ý NGHĨA Ở TAB ĐANG MỞ. Một URL cũ (bookmark, link dán tay) vẫn có thể
  // mang `stageFilter` vào tab Thiết kế; đếm nó là hiện "LỌC 1" rồi để người dùng mở panel ra
  // tìm mãi không thấy gì để tắt. Con số phải mô tả thứ họ BẤM ĐƯỢC.
  const scopedFilters: Array<[param: string, value: unknown]> = [
    ["status", filters.status],
    ["deadlinePreset", deadlinePreset],
    ["requiredDateFrom", requiredDateFrom],
    ["requiredDateTo", requiredDateTo],
    ["estimatedDateFrom", estimatedDateFrom],
    ["estimatedDateTo", estimatedDateTo],
    ["completedDateFrom", completedDateFrom],
    ["completedDateTo", completedDateTo],
    ["stageFilter", stageFilter],
    ["bomFilter", bomFilter],
  ];

  const activeFilterCount = [
    isPriority,
    datePreset !== -1,
    dateFrom,
    dateTo,
    // ⚠️ CỐ Ý KHÔNG ĐẾM khi thanh chọn cửa hàng nằm ở nơi khác (vai SALES) — và đây là chỗ
    // `hideStorePicker` VẪN ĐÚNG, khác với `clearAll` bên dưới.
    //
    // Huy hiệu này chú thích cho CÁI PANEL mà nút LỌC mở ra. Với Sales, ô chọn cửa hàng không
    // nằm trong panel đó. Đếm nó là chỉ người ta vào một panel không có thứ họ đang tìm.
    !hideStorePicker && storeId,
    phanLoaiKh,
    ...scopedFilters.filter(([param]) => isFilterOnTab(param, filters.tab)).map(([, v]) => v),
  ].filter(Boolean).length;

  function clearAll() {
    setLocalSearch("");
    onFiltersChange({
      search: undefined, status: undefined,
      isPriority: false,
      datePreset: -1, dateFrom: undefined, dateTo: undefined,
      deadlinePreset: null, requiredDateFrom: undefined, requiredDateTo: undefined,
      estimatedDateFrom: undefined, estimatedDateTo: undefined,
      completedDateFrom: undefined, completedDateTo: undefined,
      stageFilter: undefined,
      phanLoaiKh: undefined,
      bomFilter: undefined,
      // 🔴 XOÁ LUÔN CỬA HÀNG, KỂ CẢ KHI THANH CHỌN NẰM Ở NƠI KHÁC.
      //
      // Dòng này từng là `...(hideStorePicker ? {} : { storeId: undefined })`, và nó là một
      // trong BA lối thoát bị đóng khiến nhân viên Sales kẹt trong một cửa hàng: bấm lại chip
      // đang chọn không làm gì, đổi tab thì storeId đi theo, và "Xóa lọc" thì chừa nó lại.
      // Không còn đường nào trong trang để quay về xem tất cả.
      //
      // ⚠️ `hideStorePicker` chỉ được phép trả lời MỘT câu: "có vẽ ô chọn cửa hàng ở toolbar
      // không". Nó từng gánh thêm hai câu nữa (có xoá không, có đếm không) — ba câu hỏi khác
      // nhau dùng chung một biến, và đó mới là chỗ hỏng thật.
      //
      // "Xóa lọc" là nút DỌN SẠCH. Chừa lại đúng một thứ mà không nói gì là cách chắc nhất để
      // người dùng nhìn một danh sách thiếu và tưởng là đủ.
      storeId: undefined,
      page: 1,
    });
  }

  // Build grouped options from STAGE_FILTER_DEFS
  const stageFilterGroups = STAGE_FILTER_DEFS.reduce<Record<string, typeof STAGE_FILTER_DEFS>>((acc, def) => {
    if (!acc[def.group]) acc[def.group] = [];
    acc[def.group].push(def);
    return acc;
  }, {});
  const stageFilterLabel = stageFilter
    ? (STAGE_FILTER_DEFS.find((d) => d.key === stageFilter)?.label ?? stageFilter)
    : undefined;

  const statusOptions = STATUS_BY_TAB[filters.tab ?? "all"] ?? STATUS_BY_TAB.all;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Thanh tìm kiếm + toggle filter */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>

        {/* Ô tìm kiếm */}
        <div style={{ position: "relative", flex: 1, maxWidth: "380px" }}>
          <Search style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: "13px", height: "13px", color: "var(--ink-muted)", pointerEvents: "none" }} />
          <input
            ref={searchRef}
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={L.ui.toolbar.searchPlaceholder}
            style={{
              width: "100%", paddingLeft: "30px", paddingRight: "28px",
              background: "var(--cream-card)", border: "none",
              borderBottom: "1px solid var(--border)",
              padding: "4px 28px 4px 30px",
              fontSize: "12px", color: "var(--ink-body)",
              outline: "none", transition: "border-color 0.15s",
            }}
            onFocus={e => { e.currentTarget.style.borderBottomWidth = "2px"; e.currentTarget.style.borderBottomColor = "var(--pink)"; }}
            onBlur={e => { e.currentTarget.style.borderBottomWidth = "1px"; e.currentTarget.style.borderBottomColor = "var(--border)"; }}
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => {
                setLocalSearch("");
                onFiltersChange({ search: undefined, page: 1 });
              }}
              style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", display: "flex" }}
            >
              <X style={{ width: "12px", height: "12px" }} />
            </button>
          )}
        </div>

        {/* Toggle Ưu tiên */}
        <button
          type="button"
          onClick={() => onFiltersChange({ isPriority: !isPriority, page: 1 })}
          title={L.ui.toolbar.priority}
          style={{
            display: "flex", alignItems: "center", gap: "5px",
            padding: "4px 12px", fontSize: "11px", fontWeight: 500,
            textTransform: "uppercase", letterSpacing: "0.06em",
            cursor: "pointer", transition: "all 0.15s",
            background: isPriority ? "var(--cream-card)" : "transparent",
            border: `1px solid ${isPriority ? "var(--s-gold)" : "var(--border)"}`,
            color: isPriority ? "var(--s-gold)" : "var(--ink-muted)",
          }}
        >
          <Star style={{ width: "11px", height: "11px", fill: isPriority ? "var(--s-gold)" : "none" }} />
          {L.ui.toolbar.priority}
        </button>

        {/* Filter BOM — chỉ tab Phòng Thiết Kế (theo dõi BOM per-MO, business/bom.ts) */}
        {isFilterOnTab("bomFilter", filters.tab) && (
          <select
            value={bomFilter ?? ""}
            onChange={(e) => onFiltersChange({ bomFilter: e.target.value || undefined, page: 1 })}
            title="Lọc theo trạng thái BOM"
            style={{
              height: "30px", padding: "0 8px", fontSize: "11px", fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer",
              background: bomFilter ? "var(--cream-card)" : "transparent",
              border: `1px solid ${bomFilter ? "var(--s-gold)" : "var(--border)"}`,
              color: bomFilter ? "var(--s-gold)" : "var(--ink-muted)",
              maxWidth: "210px",
            }}
          >
            <option value="">BOM</option>
            {BOM_STATUSES.map((s) => (
              <option key={s} value={s}>{BOM_STATUS_LABELS[s]}</option>
            ))}
          </select>
        )}

        {/* Store filter dropdown */}
        {stores.length > 0 && !hideStorePicker && (
          <div ref={storePanelRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowStorePanel(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: "5px",
                padding: "4px 10px", fontSize: "11px", fontWeight: 500,
                textTransform: "uppercase", letterSpacing: "0.06em",
                cursor: "pointer", transition: "all 0.15s",
                background: storeId ? "var(--cream-card)" : "transparent",
                border: `1px solid ${storeId ? "var(--pink)" : showStorePanel ? "var(--ink-muted)" : "var(--border)"}`,
                color: storeId ? "var(--pink)" : "var(--ink-muted)",
              }}
            >
              {activeStore ? (
                <>
                  <span style={{
                    width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0,
                    background: STORE_DOT[activeStore.code] ?? "var(--pink)",
                  }} />
                  {activeStore.code}
                  <X
                    style={{ width: "10px", height: "10px", flexShrink: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFiltersChange({ storeId: undefined, page: 1 });
                      setShowStorePanel(false);
                    }}
                  />
                </>
              ) : (
                <>
                  CỬA HÀNG
                  <ChevronDown style={{ width: "10px", height: "10px", flexShrink: 0 }} />
                </>
              )}
            </button>

            {showStorePanel && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0,
                background: "var(--cream-card)",
                border: "1px solid var(--border)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                zIndex: 100,
                minWidth: "170px",
              }}>
                {/* "Tất cả" option */}
                <button
                  type="button"
                  onClick={() => {
                    onFiltersChange({ storeId: undefined, page: 1 });
                    setShowStorePanel(false);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    width: "100%", textAlign: "left",
                    padding: "7px 14px",
                    fontSize: "12px",
                    background: !storeId ? "rgba(233,29,121,0.06)" : "transparent",
                    color: !storeId ? "var(--pink)" : "var(--ink-muted)",
                    fontWeight: !storeId ? 600 : 400,
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => { if (storeId) e.currentTarget.style.background = "var(--cream-dark)"; }}
                  onMouseLeave={e => { if (storeId) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--border-md)", flexShrink: 0 }} />
                  Tất cả cửa hàng
                </button>
                {stores.map((store) => {
                  const selected = storeId === store.id;
                  return (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => {
                        onFiltersChange({ storeId: store.id, page: 1 });
                        setShowStorePanel(false);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        width: "100%", textAlign: "left",
                        padding: "7px 14px",
                        fontSize: "12px",
                        background: selected ? "rgba(233,29,121,0.06)" : "transparent",
                        color: selected ? "var(--pink)" : "var(--ink)",
                        fontWeight: selected ? 600 : 400,
                        border: "none",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--cream-dark)"; }}
                      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{
                        width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0,
                        background: STORE_DOT[store.code] ?? "var(--ink-muted)",
                      }} />
                      <span style={{ fontWeight: 600 }}>{store.code}</span>
                      <span style={{ fontSize: "11px", color: "var(--ink-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{store.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Phân loại KH — dropdown filter */}
        {(() => {
          const PHAN_LOAI_OPTIONS = ["VIP", "KH", "SR", "PK"];
          const active = !!phanLoaiKh;
          return (
            <div style={{ position: "relative" }}>
              <select
                value={phanLoaiKh ?? ""}
                onChange={(e) => onFiltersChange({ phanLoaiKh: e.target.value || undefined, page: 1 })}
                style={{
                  appearance: "none",
                  padding: "4px 22px 4px 10px",
                  fontSize: "11px", fontWeight: 500,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  cursor: "pointer",
                  background: active ? "var(--cream-card)" : "transparent",
                  border: `1px solid ${active ? "var(--pink)" : "var(--border)"}`,
                  color: active ? "var(--pink)" : "var(--ink-muted)",
                  borderRadius: "3px",
                  outline: "none",
                  minWidth: "80px",
                }}
              >
                <option value="">PHÂN LOẠI</option>
                {PHAN_LOAI_OPTIONS.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <ChevronDown style={{
                position: "absolute", right: "5px", top: "50%", transform: "translateY(-50%)",
                width: "10px", height: "10px", pointerEvents: "none",
                color: active ? "var(--pink)" : "var(--ink-muted)",
              }} />
            </div>
          );
        })()}

        {/* Tiến độ — chỉ hiển thị ở tab PSX (master-hub) */}
        {isFilterOnTab("stageFilter", filters.tab) && <div ref={stagePanelRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setShowStagePanel(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "4px 10px", fontSize: "11px", fontWeight: 500,
              textTransform: "uppercase", letterSpacing: "0.06em",
              cursor: "pointer", transition: "all 0.15s",
              background: stageFilter ? "var(--cream-card)" : "transparent",
              border: `1px solid ${stageFilter ? "var(--pink)" : showStagePanel ? "var(--ink-muted)" : "var(--border)"}`,
              color: stageFilter ? "var(--pink)" : "var(--ink-muted)",
            }}
          >
            {stageFilter ? (stageFilterLabel ?? stageFilter) : "TIẾN ĐỘ"}
            {stageFilter ? (
              <X
                style={{ width: "10px", height: "10px", flexShrink: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onFiltersChange({ stageFilter: undefined, page: 1 });
                  setShowStagePanel(false);
                }}
              />
            ) : (
              <ChevronDown style={{ width: "10px", height: "10px", flexShrink: 0 }} />
            )}
          </button>

          {showStagePanel && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0,
              background: "var(--cream-card)",
              border: "1px solid var(--border)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              zIndex: 100,
              minWidth: "180px",
              maxHeight: "340px",
              overflowY: "auto",
            }}>
              {Object.entries(stageFilterGroups).map(([group, defs]) => (
                <div key={group}>
                  <div style={{
                    padding: "5px 12px 4px",
                    fontSize: "9px", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.12em",
                    color: "var(--ink-muted)",
                    background: "var(--cream-dark)",
                    borderBottom: "1px solid var(--border)",
                    borderTop: "1px solid var(--border)",
                  }}>
                    {group}
                  </div>
                  {defs.map(d => {
                    const selected = stageFilter === d.key;
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => {
                          onFiltersChange({ stageFilter: selected ? undefined : d.key, page: 1 });
                          setShowStagePanel(false);
                        }}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "7px 14px",
                          fontSize: "12px",
                          background: selected ? "rgba(233,29,121,0.06)" : "transparent",
                          color: selected ? "var(--pink)" : "var(--ink)",
                          fontWeight: selected ? 600 : 400,
                          border: "none",
                          borderBottom: "1px solid var(--border)",
                          cursor: "pointer",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--cream-dark)"; }}
                        onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>}

        {/* Nút mở panel lọc nâng cao */}
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: "5px",
            padding: "4px 12px", fontSize: "11px", fontWeight: 500,
            textTransform: "uppercase", letterSpacing: "0.06em",
            cursor: "pointer", transition: "all 0.15s",
            background: (showFilters || activeFilterCount > 0) ? "var(--cream-card)" : "transparent",
            border: `1px solid ${(showFilters || activeFilterCount > 0) ? "var(--ink)" : "var(--border)"}`,
            color: (showFilters || activeFilterCount > 0) ? "var(--ink)" : "var(--ink-muted)",
          }}
        >
          <SlidersHorizontal style={{ width: "11px", height: "11px" }} />
          {L.ui.toolbar.filter}
          {activeFilterCount > 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: "16px", height: "16px",
              background: "var(--ink)", color: "var(--cream)",
              fontSize: "9px", fontWeight: 700,
            }}>
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Xoá tất cả filter */}
        {(activeFilterCount > 0 || localSearch) && (
          <button
            type="button"
            onClick={clearAll}
            style={{ fontSize: "11px", color: "var(--ink-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px" }}
          >
            {L.ui.toolbar.clearFilter}
          </button>
        )}

        {/* Sync controls + tổng số đơn */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
          {isHistoryTab ? (
            /* History tabs: nút sync luôn hiển thị với ngày đơn mới nhất trong tab */
            <button
              type="button"
              onClick={onManualSync}
              disabled={isSyncing}
              title="Đồng bộ ngay"
              style={{
                display: "flex", alignItems: "center", gap: "5px",
                padding: "3px 10px", fontSize: "11px", fontWeight: 500,
                background: hasChanges ? "rgba(233,29,121,0.07)" : "transparent",
                border: `1px solid ${hasChanges ? "var(--pink)" : "var(--border)"}`,
                color: hasChanges ? "var(--pink)" : "var(--ink-muted)",
                cursor: isSyncing ? "not-allowed" : "pointer",
                opacity: isSyncing ? 0.6 : 1,
                transition: "border-color 0.15s, color 0.15s, background 0.15s",
                animation: (hasChanges && isPulsing) ? "psx-pulse-bg 0.5s ease 3" : undefined,
              }}
            >
              {hasChanges && <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--pink)", flexShrink: 0 }} />}
              {isSyncing
                ? <Loader2 className="animate-spin" style={{ width: "11px", height: "11px" }} />
                : <RefreshCw style={{ width: "11px", height: "11px" }} />
              }
              {historyLastUpdatedAt
                ? new Date(historyLastUpdatedAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                : "Đồng bộ"
              }
            </button>
          ) : (
            <div style={{ position: "relative" }} className="psx-sync-wrap">
              <style>{`
                @keyframes psx-pulse-bg {
                  0%,100% { background: rgba(233,29,121,0.07); }
                  50%      { background: rgba(233,29,121,0.22); }
                }
                .psx-sync-tooltip { display: none; }
                .psx-sync-wrap:hover .psx-sync-tooltip { display: block; }
              `}</style>
              <button
                type="button"
                onClick={onManualSync}
                disabled={isSyncing}
                title="Đồng bộ ngay"
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "3px 10px", fontSize: "11px", fontWeight: 500,
                  background: hasChanges ? "rgba(233,29,121,0.07)" : "transparent",
                  border: `1px solid ${hasChanges ? "var(--pink)" : "var(--border)"}`,
                  color: hasChanges ? "var(--pink)" : "var(--ink-muted)",
                  cursor: isSyncing ? "not-allowed" : "pointer",
                  opacity: isSyncing ? 0.6 : 1,
                  transition: "border-color 0.15s, color 0.15s, background 0.15s",
                  animation: (hasChanges && isPulsing) ? "psx-pulse-bg 0.5s ease 3" : undefined,
                }}
              >
                {hasChanges && <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--pink)", flexShrink: 0 }} />}
                {isSyncing
                  ? <Loader2 className="animate-spin" style={{ width: "11px", height: "11px" }} />
                  : <RefreshCw style={{ width: "11px", height: "11px" }} />
                }
                {lastSyncedAt
                  ? `Sync ${lastSyncedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
                  : "Sync"
                }
              </button>
              {changedOrders.length > 0 && hasChanges && (
                <div className="psx-sync-tooltip" style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
                  background: "var(--cream-card)", border: "1px solid var(--border)",
                  borderRadius: "6px", padding: "8px 0", minWidth: "200px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                  <div style={{ padding: "4px 12px 6px", fontSize: "10px", fontWeight: 600, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Đơn vừa thay đổi
                  </div>
                  {changedOrders.map(o => (
                    <div key={o.id} style={{ padding: "4px 12px", fontSize: "12px", color: "var(--ink)", display: "flex", gap: "6px", alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, color: "var(--pink)" }}>{o.orderNumber}</span>
                      {o.storeName && <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>{o.storeName}</span>}
                      {o.changedMoNumbers && o.changedMoNumbers.filter(m => m !== o.orderNumber).length > 0 && (
                        <span style={{ fontSize: "10px", color: "var(--ink-muted)", background: "var(--cream-dark)", padding: "1px 5px", borderRadius: "3px" }}>
                          MO: {o.changedMoNumbers.filter(m => m !== o.orderNumber).join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <span style={{ fontSize: "11px", color: "var(--ink-muted)", whiteSpace: "nowrap" }}>
            {psxSummary ? (
              <>
                <strong style={{ color: "var(--ink)" }}>{psxSummary.moCount.toLocaleString()}</strong>
                {" "}{L.ui.toolbar.orders}
                {" · "}Tổng TL 3D:{" "}
                <strong style={{ color: "var(--ink)", fontFamily: "monospace" }}>
                  {psxSummary.totalTl3d.toFixed(2)}g
                </strong>
              </>
            ) : (
              <>{totalCount.toLocaleString()} {L.ui.toolbar.orders}</>
            )}
          </span>
        </div>
      </div>

      {/* Panel lọc nâng cao */}
      {showFilters && (
        <div style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px 24px",
          padding: "10px 14px", background: "var(--cream-card)", border: "1px solid var(--border)",
        }}>

          {/* Lọc trạng thái */}
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
            <span className="psx-label" style={{ whiteSpace: "nowrap" }}>{L.ui.toolbar.statusLabel}</span>
            <select
              value={filters.status ?? ""}
              onChange={(e) => onFiltersChange({ status: (e.target.value as OrderStatus) || undefined, page: 1 })}
              className="psx-input"
              style={{ width: "auto", fontSize: "12px" }}
            >
              <option value="">{L.ui.toolbar.allStatuses}</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>

          {/* ⚠️ TỪNG CÓ MỘT TOGGLE "HỎA TỐC" Ở ĐÂY. Bỏ hẳn, không chuyển đi đâu.
              Nó lọc ra ĐÚNG cùng tập với nút "Ưu tiên" ở hàng trên: api/orders/route.ts dùng
              một câu `if (isPriority || isRush)` → cùng `priorityCode = UT1`. Hai nút khác tên,
              đặt ở hai chỗ khác nhau, ra một kết quả — nên không ai có cơ hội nhận ra chúng
              trùng nhau. Bỏ nó là hệ thống thành thật hơn, không phải nghèo đi.

              ⚠️ Cột dữ liệu `isRush` VẪN CÒN và vẫn đúng — nó suy từ priorityCode
              (order-helpers.ts `priorityToFlags`) và đang nuôi cờ "Gấp" ở màn chi tiết đơn. */}

          {/* Lọc ngày tạo — preset nhanh */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
            <span className="psx-label" style={{ whiteSpace: "nowrap" }}>{L.ui.toolbar.dateCreated}</span>
            <div style={{ display: "flex", gap: "3px" }}>
              {DATE_PRESETS.map((p) => {
                const active = !dateFrom && !dateTo && datePreset === p.days;
                return (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => onFiltersChange({ datePreset: p.days as DatePreset, dateFrom: undefined, dateTo: undefined, page: 1 })}
                    style={{
                      padding: "2px 10px", fontSize: "11px", cursor: "pointer",
                      transition: "all 0.15s",
                      background: active ? "var(--ink)" : "var(--cream-card)",
                      color: active ? "var(--cream)" : "var(--ink-muted)",
                      border: `1px solid ${active ? "var(--ink)" : "var(--border)"}`,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Hoàn tất: preset nhanh theo NGÀY HOÀN THÀNH (completedDate) — đúng trực giác
              "hàng hoàn thành trong tuần". Khác cụm Deadline (requiredDate) vốn dành cho
              đơn đang chạy; deadline không hợp ngữ cảnh đơn đã xong nên ẩn ở tab này. */}
          {isFilterOnTab("completedDateFrom", filters.tab) && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
              <span className="psx-label" style={{ whiteSpace: "nowrap" }}>Ngày HT</span>
              <div style={{ display: "flex", gap: "3px" }}>
                {(() => {
                  // Neo cứng giờ VN để biên ngày khớp bộ lọc completedDate (parse +07:00).
                  const vnYmd = (d: Date) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(d);
                  const todayYmd = vnYmd(new Date());
                  const base = new Date(todayYmd + "T00:00:00Z"); // chỉ dùng để cộng/trừ ngày lịch
                  const ymd = (dt: Date) => dt.toISOString().slice(0, 10);
                  const shift = (n: number) => { const d = new Date(base); d.setUTCDate(base.getUTCDate() + n); return d; };
                  const dow = base.getUTCDay() || 7; // Chủ nhật (0) → 7
                  const monday = shift(-(dow - 1));
                  const sunday = shift(-(dow - 1) + 6);
                  const presets = [
                    { key: "today",    label: "Hôm nay",  from: todayYmd,        to: todayYmd },
                    { key: "last7",    label: "7 ngày",   from: ymd(shift(-6)),  to: todayYmd },
                    { key: "thisWeek", label: "Tuần này", from: ymd(monday),     to: ymd(sunday) },
                  ];
                  return presets.map((p) => {
                    const active = completedDateFrom === p.from && completedDateTo === p.to;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => onFiltersChange(active
                          ? { completedDateFrom: undefined, completedDateTo: undefined, page: 1 }
                          : { completedDateFrom: p.from, completedDateTo: p.to, page: 1 })}
                        style={{
                          padding: "2px 10px", fontSize: "11px", cursor: "pointer", transition: "all 0.15s",
                          background: active ? "var(--ink)" : "var(--cream-card)",
                          color: active ? "var(--cream)" : "var(--ink-muted)",
                          border: `1px solid ${active ? "var(--ink)" : "var(--border)"}`,
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Lọc theo Deadline (requiredDate) — chỉ cho đơn đang chạy, ẩn ở tab Hoàn tất */}
          {isFilterOnTab("deadlinePreset", filters.tab) && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
            <span className="psx-label" style={{ whiteSpace: "nowrap" }}>{L.ui.toolbar.deadline}</span>
            <div style={{ display: "flex", gap: "3px" }}>
              {([
                { label: L.ui.toolbar.next7Days, value: "week" as DeadlinePreset },
                { label: "Tuần này", value: "thisWeek" as DeadlinePreset },
                { label: L.ui.toolbar.overdueLabel, value: "overdue" as DeadlinePreset },
              ]).map((p) => {
                const active = deadlinePreset === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      if (active) {
                        // Bỏ filter nếu click lại
                        onFiltersChange({ deadlinePreset: null, requiredDateFrom: undefined, requiredDateTo: undefined, page: 1 });
                        return;
                      }
                      onFiltersChange({
                        deadlinePreset: p.value,
                        ...deadlineRangeFor(p.value, new Date()),
                        page: 1,
                      });
                    }}
                    style={{
                      padding: "2px 10px", fontSize: "11px", cursor: "pointer",
                      transition: "all 0.15s",
                      background: active ? (p.value === "overdue" ? "var(--s-red)" : "var(--ink)") : "var(--cream-card)",
                      color: active ? "var(--cream)" : "var(--ink-muted)",
                      border: `1px solid ${active ? (p.value === "overdue" ? "var(--s-red)" : "var(--ink)") : "var(--border)"}`,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* Bộ lọc ngày gộp: dropdown chọn trục ngày (Ngày tạo / DK HT / Chốt SX /
              Hoàn thành theo tab) + 1 cặp Từ...Đến. Thay cho các ô range rời rạc trước đây.
              Các nút preset nhanh (NGÀY TẠO, DEADLINE) vẫn giữ ở trên cho thao tác 1 chạm. */}
          <DateRangeFilter
            L={L}
            tab={filters.tab}
            values={dateFilterValues}
            selectedKey={dateFilterKey}
            onSelectKey={setDateFilterKey}
            onFiltersChange={(patch) => onFiltersChange(patch as FilterPatch)}
          />

          {/* Sắp xếp */}
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
            <span className="psx-label" style={{ whiteSpace: "nowrap" }}>{L.ui.toolbar.sort}</span>
            <select
              value={`${filters.sortBy ?? "orderDate"}:${filters.sortDir ?? "desc"}`}
              onChange={(e) => {
                const [field, dir] = e.target.value.split(":");
                onFiltersChange({ sortBy: field, sortDir: dir as "asc" | "desc", page: 1 });
              }}
              className="psx-input"
              style={{ width: "auto", fontSize: "12px" }}
            >
              <option value="orderDate:desc">{L.ui.toolbar.sortOrderDateDesc}</option>
              <option value="orderDate:asc">{L.ui.toolbar.sortOrderDateAsc}</option>
              <option value="requiredDate:asc">{L.ui.toolbar.sortRequiredDateAsc}</option>
              <option value="requiredDate:desc">{L.ui.toolbar.sortRequiredDateDesc}</option>
              <option value="customerName:asc">{L.ui.toolbar.sortCustomerNameAsc}</option>
              <option value="estimatedTotal:desc">{L.ui.toolbar.sortEstimatedTotalDesc}</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

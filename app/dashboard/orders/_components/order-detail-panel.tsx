"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X, ChevronRight, ChevronDown, AlertCircle, AlertTriangle,
  Loader2, Info, Package, History, ToggleLeft,
  CheckCircle2, ClipboardList, Wrench, BarChart2, ListChecks, RotateCcw, ExternalLink, ArrowRight, Pencil,
} from "lucide-react";
import { cn, formatDate } from "@/app/lib/utils";
import { toast } from "sonner";
import { ZoneBadge } from "./status-badge";
import type { OrderDetail, OrderSummary, OrderStatus, Design3DAssignmentRow } from "@/app/lib/types/order";
import { STAGE_DEFS, STAGE_STATUS_CLS, STAGE_STATUS_LABEL, getStageStatusLabel, type PanelForm, type ItemForm, type ProductionForm, type StageEntry, type StageRecord, type ResinFail, getISOWeek, calcAutoProduction, computeHotStoneBreakdown, toFormState, toItemForm, toProductionForm, toStageForms, getBaseSoNumber } from "@/app/lib/utils/order-helpers";
// `formatVersionedDisplay` = bản KHÔNG cần cờ isFromWebapp — dùng cho SO# của bản PSX anh em:
// đó là orderNumber của một đơn KHÁC, panel không có cờ của đơn đó và cũng không nên đi hỏi
// chỉ để in một dấu gạch dưới.
import { stripVersionSuffix, formatMoVersionedDisplay, formatVersionedDisplay } from "@/app/lib/business/order-helpers";
import { toDesign3DAssignmentView } from "@/app/lib/business/kpi-3d/review";
import { resolveDesignerName } from "@/app/lib/business/kpi-3d/designer-name";
import { DESIGN_REQUEST_OPTIONS } from "@/app/lib/business/kpi-3d/design-request";
import { STAGES_WITH_RECORDS, shouldExpandStage, stageSummary, hasIncompleteRecords } from "@/app/lib/business/stage-collapse";
import {
  Banner, Field, ReadOnlyCtx, SectionLabel, inputCls,
} from "./panel-atoms";
import { PhanLoaiKtSelect, StoneTypeTagDropdown } from "./panel-controls";
import { PreItemsTab, HistoryTab } from "./panel-tabs";
import {
  ClosedAttemptCard, Designer3DCard,
  type ContinueContext,
} from "./panel-designer-3d";
import { HOT_STONE_TYPE_OPTIONS, LOAI_HANG_OPTIONS } from "./panel-options";
import { useOrderPanelData } from "./use-order-panel-data";
import { useOrderActionMutations } from "./use-order-action-mutations";
import { selectableStatuses } from "@/app/lib/business/orders/status-transitions";
import {
  carryStageMatchKeys, dropMoFromZoneSnapshot, insertOrderOnce, mhSavePatch,
  patchItemInOrder, patchOrderInList, removeOrderFromList,
  type PanelListRow,
} from "@/app/lib/business/orders/list-cache";
import { calcKetQua, calcSoNgayHT } from "@/app/lib/business/kpi-3d/legacy-ket-qua";
import { fetchJson, jsonBody } from "@/app/lib/utils/fetch-json";
import { toVnYmd, toVnHm, formatVnDateTime } from "@/app/lib/utils/vn-date";
import { isCriticalFieldLocked, isMoInProduction } from "@/app/lib/business/orders/critical-field-lock";
import { BOM_STATUSES, BOM_STATUS_LABELS, BOM_DATE_LABELS } from "@/app/lib/business/bom";
import { DateInput, todayVnYmd } from "./date-input";
// Ô giờ dùng chung, LUÔN 24h — `<input type="time">` trần hiện "09:35 AM" trên máy đặt vùng Mỹ,
// lệch với mọi chữ app tự vẽ. Nhầm AM/PM lệch đúng 12 tiếng và không có gì báo lỗi.
import { TimeInput } from "./time-input";
import { DesignFilePreview } from "./design-file-preview";
import { SampleImagesUploader } from "./sample-images-uploader";
import { MH_PANEL_TABS, PTK_PANEL_TABS, clampTabKey, visibleTabs } from "@/app/lib/ui/order-tabs";
import { canEditMaSoMau, normalizeMaSoMau } from "@/app/lib/business/orders/ma-so-mau";
import { isPartialWriteRole } from "@/app/lib/business/orders/item-writable-fields";
import { computeFromItemStages } from "@/app/lib/business/production-stage";
import { buildOptimisticSummary } from "@/app/lib/utils/optimistic-summary";
import { useLabels } from "@/app/lib/i18n/locale-context";
import { calculate3DKpiDeadline } from "@/app/lib/business/kpi-3d-deadline";
import {
  activeAttempts,
} from "@/app/lib/business/kpi-3d/attempt-chain";
import { cleanCarriedItemData } from "@/app/lib/business/kpi-3d/version-carryover";
import {
} from "@/app/lib/business/kpi-3d/attempt-fields";
import {
  closedAttemptBlocks,
} from "@/app/lib/business/kpi-3d/designer-blocks";
import { overtimeBlocksForItem, totalOvertimeMinutes } from "@/app/lib/business/kpi-3d/overtime-blocks";
// Dùng lại cách viết số phút của chính module tăng ca — tab Tăng ca và khối này phải nói giống
// hệt nhau, nếu không cùng một bản ghi sẽ hiện "2 giờ" ở chỗ này và "120 phút" ở chỗ kia.
import { formatMinutes } from "@/app/lib/business/kpi-3d/overtime";
import {
  DESIGN_PRIORITY_CODES,
  DESIGN_PRIORITY_LABELS,
  designPriorityNeedsAttention,
  toDesignPriority,
} from "@/app/lib/business/kpi-3d/design-priority";
import {
  firstEditableBlockNo,
} from "@/app/lib/business/kpi-3d/designer-blocks";
import {
  toPauseSpans,
} from "@/app/lib/business/kpi-3d/pause-view";
import {
} from "@/app/lib/business/kpi-3d/actual-minutes";
import {
  configuredCalendarToWorkingCalendar,
  formatDateOnly,
  parseWallDateTime,
} from "@/app/lib/business/kpi-3d/calendar-adapter";

// ─── V2 PRE_PRODUCTION status map ─────────────────────────────────────────────
const PRE_STATUSES: Array<{ value: OrderStatus; label: string }> = [
  { value: "DRAFT",           label: "Chưa thiết kế" },
  { value: "PENDING_DESIGN",  label: "Làm INFO" },
  { value: "IN_DESIGN",       label: "Đang thiết kế" },
  { value: "DESIGN_REVIEW",   label: "Chờ khách duyệt" },
  { value: "DESIGN_APPROVED", label: "Chốt 3D — Chuyển xưởng" },
  { value: "DESIGN_COMPLETED", label: "Hoàn tất 3D" },
  { value: "CANCELLED",       label: "Hủy" },
];


// V2 ref: MO_STATUS cho MASTER_HUB — chỉ trạng thái trung gian có thể chọn qua form.
// COMPLETED/CANCELLED là terminal action — chỉ thực hiện qua action buttons (có confirmation dialog).
const MH_STATUSES: Array<{ value: string; label: string }> = [
  { value: "IN_PRODUCTION", label: "Đang sản xuất" },
  { value: "SUSPENDED",     label: "Tạm ngưng" },
];

// V2 ref: CAP_DO_UU_TIEN
// Phân loại KH — danh mục chuẩn (khớp create-order-form + bộ lọc toolbar)
const PHAN_LOAI_KH_OPTIONS = ["VIP", "KH", "SR", "PK"];

const PRIORITY_OPTIONS = [
  { value: "UT1",    label: "UT1 — Siêu gấp" },
  { value: "UT2",    label: "UT2 — Gấp" },
  { value: "Normal", label: "Normal" },
  { value: "SR",     label: "SR — Đặc biệt" },
];

// PK = Phụ Kiện nội bộ (đơn hàng của Phòng Sản Xuất / R&D)
const PHAN_LOAI_OPTIONS = ["VIP", "KH", "SR", "PK"];
const NGUON_OPTIONS = ["CH1", "CH2", "CH3", "ADM1", "ADM2", "PSX", "R&D"];

// NVL_OPTIONS gom về nguồn dùng chung (app/lib/business/product-options) — dùng qua NvlSelect
// (checkbox chọn nhiều), các tổ hợp cứng cũ đã bỏ khỏi danh sách chọn.

// XI_MA_OPTIONS gom về nguồn dùng chung (app/lib/business/product-options).


// V2 ref: PHAN_LOAI_KT — raw CSV tokens (multi-select checkboxes)

// V2 ref: LOAI_HANG — loại hàng kỹ thuật sản xuất


// V2 ref: HINH_DANG_HOT / PHAN_LOAI_SX — hình dáng hột

// V2 ref: result.tenSp — danh sách tên sản phẩm chuẩn từ cfg_Dropdowns
// Phải khớp CHÍNH XÁC thứ tự với LABELS.vi.tenSp (labels.ts) và TEN_SP_OPTIONS ở
// create-order-form.tsx/orders-table.tsx — đây là mảng dùng để tra idx → nhãn hiển thị
// (L.tenSp[idx]), thiếu/thừa 1 phần tử sẽ làm lệch toàn bộ tên hiển thị sau đó.

// Loại SP — user chọn tay để phân loại thống kê (khớp cột "Loại SP" ở tab Tổng quan),
// không suy đoán từ tên sản phẩm nữa.


// ─── DesignForm options ────────────────────────────────────────────────────────
// Danh mục "Yêu cầu thiết kế" nay ở app/lib/business/kpi-3d/design-request.ts — cùng nơi giữ
// luật đọc trường này. Màn Việc thiết kế 3D dùng CHUNG danh mục đó khi NV báo lại thực tế đã
// làm; giữ một mảng cứng riêng ở đây là để hai màn lệch nhau vào ngày thêm mục thứ chín.
// (Đã bỏ PHAN_NHOM_3D_OPTIONS — danh sách Nhóm KPI 3D cứng. Nó từng được dùng làm giá trị
// dự phòng khi chưa cấu hình nhóm nào, khiến dropdown trông đầy đủ nhưng server không tạo
// được assignment và im lặng bỏ qua. Nay chỉ dùng nhóm đã cấu hình thật, xem kpi3DGroupOptions.)
const NHOM_SP_3D_OPTIONS = ["Trang sức", "Tượng thú"];
const DONG_SP_TRANG_SUC = ["Dây chuyền", "Bông tai", "Mặt dây", "Nhẫn", "Vòng tay", "Vòng cổ", "Lắc tay", "Charm", "Khác"];

/**
 * Hiện cảnh báo khi server báo KHÔNG tạo được lượt giao việc 3D dù đã điền đủ ô.
 * Lưu vẫn thành công nên dùng toast cảnh báo (không phải lỗi), để lâu hơn toast thường
 * vì người dùng cần đọc kỹ và đi sửa cấu hình.
 */
function notifyKpi3DWarning(res: unknown) {
  const warning = (res as { kpi3DWarning?: string } | null | undefined)?.kpi3DWarning;
  if (!warning) return;
  toast.warning(`Chưa tạo được lượt giao việc 3D: ${warning}`, { duration: 12000 });
}


// ─── DesignForm — tab Thiết kế (PTK) ──────────────────────────────────────────
type DesignForm = {
  yeucauThietKe: string;
  yeucauKyThuat: string;
  phanNhom3D: string;
  nhomSP3D: string;
  dongSP3D: string;
  tho3d: string;
  ngayGiao3D: string;
  gioGiao3D: string;
  soGioDuKien: string;
  // KHÔNG CÒN Ô NHẬP NÀO — đã bỏ khỏi giao diện vì mỗi NV 3D nay có Deadline KPI riêng, chính
  // xác hơn (có giờ, tính theo lịch làm việc) so với một ngày gõ tay chung cho cả MO.
  //
  // Vẫn giữ trong form để giá trị cũ NẠP VÀO rồi GỬI LẠI y nguyên. Bỏ hẳn khỏi payload thì lần
  // lưu kế tiếp sẽ ghi null đè lên mọi MO lịch sử — mất dữ liệu không lấy lại được.
  hoanTatDuKien: string;
  deadline: string;
  ngayHoanThanh3D: string;
  gioThucTe: string;
  soNgayHTThucTe: string;
  ketQua: string;
};

const DESIGN_FORM_INIT: DesignForm = {
  yeucauThietKe: "", yeucauKyThuat: "", phanNhom3D: "", nhomSP3D: "", dongSP3D: "", tho3d: "",
  ngayGiao3D: "", gioGiao3D: "", soGioDuKien: "", hoanTatDuKien: "",
  deadline: "", ngayHoanThanh3D: "", gioThucTe: "",
  soNgayHTThucTe: "", ketQua: "",
};

// ─── NV 3D thứ 2 trở đi cho CÙNG một MO ──────────────────────────────────────
//
// Một MO có thể cần nhiều người thiết kế, và KPI của mỗi người được chấm RIÊNG theo ngày/giờ
// giao của chính họ. Vì vậy đây là một khối trường đầy đủ, không phải thêm một cái tên vào
// danh sách: hai người cùng MO gần như luôn có mốc giao khác nhau.
//
// Người THỨ NHẤT vẫn nằm ở DesignForm như cũ (perItem[id].design + .tho3d) — không nhân bản
// sang mảng này. Nhờ vậy báo cáo cũ, xuất Excel và toàn bộ dữ liệu lịch sử đọc y như trước,
// và không có chuyện "cùng một sự thật ở hai chỗ" rồi phải đoán chỗ nào mới đúng.
type ExtraDesigner3D = {
  tho3d: string;
  phanNhom3D: string;
  ngayGiao3D: string;
  gioGiao3D: string;
  gioThucTe: string;
  /** Server ghi ngược sau lần lưu đầu — mối liên kết tường minh tới đúng lượt giao việc. */
  kpi3DAssignmentId: string;
};

/** Tải công việc của một NV 3D — khuôn khớp /api/designers-3d/workload. */

const EXTRA_DESIGNER_INIT: ExtraDesigner3D = {
  tho3d: "", phanNhom3D: "", ngayGiao3D: "", gioGiao3D: "", gioThucTe: "", kpi3DAssignmentId: "",
};

/**
 * Số ngày HT của khối tóm tắt MASTER_HUB (trường `soNgayHTThucTe` trong JSON).
 *
 * TRƯỚC ĐÂY CHIA CỨNG CHO 8 GIỜ. Lịch làm việc admin đang cấu hình có ngày làm 470 phút
 * (≈7,83 giờ) nên hằng số 8 làm lệch ~2%, và lệch nhiều hơn mỗi lần admin sửa ca. Từ khi ô
 * "Số ngày HT" ở khối NV 3D đổi sang chia theo lịch, để nguyên hàm này nghĩa là hai màn hiện
 * hai con số khác nhau cho cùng một việc — đúng loại lỗi tách-đôi-định-nghĩa vừa dọn xong.
 *
 * Nay uỷ thác cho module dùng chung. Vẫn trả chuỗi vì nơi gọi lưu vào JSON dạng chuỗi.
 */

// V2 ref: CRITICAL_FIELDS — khóa khi đã vào sản xuất.
// Luật + lý do đầy đủ ở business/orders/critical-field-lock.ts (có unit test riêng). Trước đây
// mảng này nằm ở đây và được so với `order.status` — tức trạng thái CẢ SO — nên một MO xuống sản
// xuất là khoá luôn các MO anh em còn đang ở Phòng Thiết Kế.

const PRIORITY_DOT: Record<string, string> = {
  UT1:    "bg-amber-500",
  UT2:    "bg-blue-700",
  SR:     "bg-red-600",
  Normal: "bg-gray-300",
};

import { buildSnapshotQuery, buildHistorySnapshotQuery } from "@/app/lib/utils/snapshot-keys";

// ─── API helpers (extracted to app/lib/api/order-panel.ts) ────────────────────
import {
  fetchOrderDetail,
  patchOrder,
  patchItem,
  patchProduction,
  patchItemStatus,
  resolveActionApi,
} from "@/app/lib/api/order-panel";

// ─── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  orderId: string | null;
  activeItemId?: string | null;
  onClose: () => void;
  onOrderUpdated?: (opts?: { skipSnapshotInvalidation?: boolean }) => void;
  readOnly?: boolean;
  /** Called after a state-changing action so the parent can switch tab + flash the order */
  onNavigateAfterAction?: (opts: { tab: string; orderId: string }) => void;
  /** Called when a save mutation starts — parent can show pending indicator on the row.
   *  Passes activeItemId (khi save per-MO) để chỉ block đúng row đó, không block cả order. */
  onSavePending?: (itemOrOrderId: string) => void;
  /** Called when a save mutation finishes (success or error) */
  onSaveDone?: () => void;
  /** Called when user clicks "Mở lại" in error toast — parent reopens the panel */
  onReopenOrder?: (orderId: string) => void;
  /** True khi heartbeat phát hiện order này vừa bị thay đổi bởi người khác */
  externallyUpdated?: boolean;
  /** Role của user hiện tại — dùng để kiểm soát quyền edit KT khi đơn đã vào xưởng */
  currentUserRole?: string;
  /** OrderSummary từ snapshot — hiển thị ngay lập tức trong khi panel load full detail */
  placeholderData?: OrderSummary | null;
  /** True khi đơn này đang có save mutation in-flight ở background */
  isSavePending?: boolean;
};

// ─── Icon của từng tab panel ─────────────────────────────────────────────────
//
// Ở LẠI ĐÂY, không vào app/lib/ui/order-tabs.ts: module đó THUẦN (không React) để test trực
// tiếp, còn icon là JSX. Cùng lý do `badge` trong nav-model.ts là một KHOÁ chứ không phải một
// con số — model không được biết về lớp hiển thị.
//
// Gộp cả hai bộ tab (PTK + PSX) vào một bảng: `key` trùng nhau ở bốn tab đầu, và hai bảng
// riêng sẽ là hai chỗ phải nhớ sửa khi đổi icon.
const PANEL_TAB_ICON: Record<string, React.ReactNode> = {
  info:    <Info          className="w-3 h-3" />,
  items:   <Package       className="w-3 h-3" />,
  thietke: <Pencil        className="w-3 h-3" />,
  status:  <ClipboardList className="w-3 h-3" />,
  history: <History       className="w-3 h-3" />,
  kythuat: <Wrench        className="w-3 h-3" />,
  sanxuat: <BarChart2     className="w-3 h-3" />,
  tiendo:  <ListChecks    className="w-3 h-3" />,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function OrderDetailPanel({ orderId, activeItemId, onClose, onOrderUpdated, readOnly = false, onNavigateAfterAction, onSavePending, onSaveDone, onReopenOrder, externallyUpdated = false, currentUserRole, placeholderData, isSavePending = false }: Props) {
  const queryClient = useQueryClient();
  const L = useLabels();

  // Pending-create: đơn chưa có trong DB, chỉ render từ placeholderData
  const isPendingCreate = orderId?.startsWith("pending-") ?? false;

  // PRE_PRODUCTION state
  // ⚠️ ĐỌC `activeTab` (đã clamp) BÊN DƯỚI, KHÔNG PHẢI `activeTabRaw`.
  //
  // Đổi tên state có chủ ý: `activeTab` được so sánh ở nhiều chỗ trong file này, và nếu clamp là
  // một biến MỚI đặt cạnh thì bỏ sót một chỗ = một mục nội dung không bao giờ hiện, im lặng.
  // Đổi tên nguồn thì mọi chỗ đọc cũ tự động ăn giá trị đã clamp, và tsc chỉ ra chỗ nào còn sót.
  const [activeTabRaw, setActiveTab] = useState<"info" | "items" | "thietke" | "status" | "history">("info");
  const [form, setForm] = useState<PanelForm | null>(null);
  const [itemForms, setItemForms] = useState<Record<string, ItemForm>>({});
  const [dirtyItemIds, setDirtyItemIds] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [staleWarningDismissed, setStaleWarningDismissed] = useState(false);

  // Reset dismissed khi phát hiện cập nhật mới từ bên ngoài
  useEffect(() => {
    if (externallyUpdated) setStaleWarningDismissed(false);
  }, [externallyUpdated]);

  // Admin Override: tắt chế độ + xoá lý do khi đổi MO/đơn khác — tránh dính nhầm lý do
  // của MO trước sang MO đang mở, hoặc để sót chế độ mở khoá khi chuyển đơn.
  useEffect(() => {
    setAdminOverrideActive(false);
    setAdminOverrideReason("");
    setShowAdminOverrideReasonPrompt(false);
  }, [orderId, activeItemId]);
  const [conflictError, setConflictError] = useState(false);
  // Admin Override — cho phép ADMIN sửa dữ liệu trên MO đã Hoàn tất/Hủy, KHÔNG đổi trạng
  // thái. Bắt buộc lý do khi lưu nếu THẬT SỰ có field đổi (không log nếu không đổi gì).
  const [adminOverrideActive, setAdminOverrideActive] = useState(false);
  const [adminOverrideReason, setAdminOverrideReason] = useState("");
  const [showAdminOverrideReasonPrompt, setShowAdminOverrideReasonPrompt] = useState(false);
  const [promoteComment, setPromoteComment] = useState("");
  const [showPromoteConfirm, setShowPromoteConfirm] = useState(false);
  const [promoteIsForced, setPromoteIsForced] = useState(false);
  const [createVersionToggle, setCreateVersionToggle] = useState(false);

  // Track last patched version to avoid redundant snapshot updates
  const prevSnapshotPatchRef = useRef<string | null>(null);

  // Fix A — id đơn đã init form gần nhất; dùng để phân biệt "mở/đổi đơn" (phải re-init)
  // với "refetch nền cùng đơn" (không được ghi đè khi user đang sửa dở).
  const lastInitedOrderIdRef = useRef<string | null>(null);

  // MASTER_HUB state
  // Cùng lý do với `activeTabRaw` ở trên — đọc `mhTab` đã clamp, không đọc biến này.
  const [mhTabRaw, setMhTab] = useState<"info" | "items" | "thietke" | "kythuat" | "sanxuat" | "tiendo">("info");

  // ─── Tab: TAB ĐƯỢC THẤY vs TAB ĐANG MỞ ─────────────────────────────────────
  //
  // Hai nguồn khác nhau, và không có gì buộc chúng khớp: bộ tab lọc theo vai, còn tab đang mở
  // đến từ `useState("info")` viết cứng ngay trên. Ẩn "Đơn hàng" khỏi R&D mà thiếu clamp là
  // panel TRẮNG — thanh tab vẽ một nút, nội dung hỏi `mhTab === "items"` và không khớp.
  //
  // Hoisted lên đây thay vì gọi thẳng trong JSX: tính một lần, và có `.length` để hỏi (thanh tab
  // một nút là một điều khiển không làm được gì — xem chỗ render).
  const ptkTabs = visibleTabs(PTK_PANEL_TABS, currentUserRole);
  const mhTabs  = visibleTabs(MH_PANEL_TABS, currentUserRole);
  const activeTab = clampTabKey(PTK_PANEL_TABS, activeTabRaw, currentUserRole);
  const mhTab     = clampTabKey(MH_PANEL_TABS, mhTabRaw, currentUserRole);
  const [productionForm, setProductionForm] = useState<ProductionForm | null>(null);
  const [holdReason, setHoldReason] = useState<"" | "CHO_DX_NL" | "CHO_NL">("");
  const [stageForms, setStageForms] = useState<StageEntry[]>([]);
  const [expandedTimeRows, setExpandedTimeRows] = useState<Set<string>>(new Set());
  // Khâu nào người dùng đã TỰ bấm mở/gọn ở tab Tiến độ. Chỉ chứa những khâu đã bấm — khâu
  // vắng mặt ở đây thì lấy mặc định suy ra từ trạng thái (xem business/stage-collapse.ts).
  //
  // CỐ Ý KHÔNG lưu xuống localStorage/DB: mặc định đã suy ra được từ trạng thái thật, lưu
  // thêm là dựng ra một nguồn thứ hai sẽ lệch khi khâu đổi trạng thái. Và chính vì không
  // lưu nên "lần sau mở panel, khâu xong tự gọn lại" đúng mà không phải làm gì thêm.
  const [manualStageOpen, setManualStageOpen] = useState<Record<string, boolean>>({});
  const [productionMethod, setProductionMethod] = useState<"HANDCRAFT" | "MACHINE" | "MIXED" | null>(null);
  const [isProductionDirty, setIsProductionDirty] = useState(false);
  const [designForm, setDesignForm] = useState<DesignForm>(DESIGN_FORM_INIT);
  // NV 3D thứ 2 trở đi của CÙNG MO này (xem ExtraDesigner3D). Rỗng = chỉ một người, đúng như
  // trước — phần lớn MO sẽ ở trạng thái này và giao diện không đổi gì.
  const [extraDesigners, setExtraDesigners] = useState<ExtraDesigner3D[]>([]);
  // Khối NV 3D nào đang thu gọn. Khoá là VỊ TRÍ ("0" = người thứ nhất, "1" = người thứ hai…).
  // Chỉ là trạng thái hiển thị tạm, không lưu xuống server.
  const [collapsedDesigners, setCollapsedDesigners] = useState<Set<string>>(new Set());
  // Deadline KPI tính tạm ở trình duyệt, ĐẦY ĐỦ GIỜ — chỉ để HIỂN THỊ trước khi MO có lượt
  // giao việc (design3DView chưa tồn tại). designForm.deadline vẫn giữ dạng "YYYY-MM-DD" cho
  // việc lưu/so sánh cũ (calcKetQua) — tách riêng để không đổi định dạng lưu trữ đang dùng.
  const [deadlinePreview, setDeadlinePreview] = useState<Date | null>(null);
  const [isDesignDirty, setIsDesignDirty] = useState(false);

  /**
   * Panel đang có thay đổi CHƯA LƯU ở bất kỳ đâu.
   *
   * MỘT chỗ khai, vì HAI nơi phải trả lời giống hệt nhau: effect nạp form dùng nó để quyết định
   * có ghi đè form hay không, còn dải cảnh báo dùng nó để nói ra rằng bản mới đang bị giữ lại.
   * Hai nơi tự viết lại điều kiện thì lệch một cờ là dải cảnh báo nói một đằng còn hệ thống làm
   * một nẻo — và người dùng tin dải cảnh báo.
   */
  const hasUnsavedEdits = isDirty || isProductionDirty || isDesignDirty || dirtyItemIds.size > 0;

  // Không còn state kpi3DAssignmentId đọc từ extraData: dữ liệu lượt giao việc 3D giờ lấy
  // thẳng từ order.design3DAssignments (xem design3DView bên dưới) — một nguồn sự thật.
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  // MO có thể có nhiều NV 3D, mỗi người một lượt giao việc kiểm riêng. Giữ ID của lượt đang
  // mở ô "lý do làm lại" thay vì một cờ boolean: cờ boolean sẽ mở ô đó ở MỌI khối cùng lúc,
  // rồi Order gõ lý do vào khối này mà bấm xác nhận ở khối kia.
  const [reworkForId, setReworkForId] = useState<string | null>(null);
  const [reworkReason, setReworkReason] = useState("");

  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [rollbackReason, setRollbackReason] = useState("");
  // Mở lại đơn terminal (ADMIN/ORDER) — về PSX hoặc PTK, giữ nguyên dữ liệu.
  const [showReopen, setShowReopen] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<"PSX" | "PTK">("PSX");
  const [reopenReason, setReopenReason] = useState("");
  // V2 ref: targetStatus khi rollback — mặc định "Đang thiết kế"
  const [rollbackTarget, setRollbackTarget] = useState<"DRAFT" | "PENDING_DESIGN" | "IN_DESIGN" | "DESIGN_REVIEW">("IN_DESIGN");
  // V2 ref: MO# mặc định = SO# — user có thể đổi trước khi chuyển xưởng
  const [mhProductionCode, setMhProductionCode] = useState("");
  // V2 parity: confirm dialog cho Hủy & Bàn giao
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showShowroomConfirm, setShowShowroomConfirm] = useState(false);

  const {
    order, isLoading, isError, isPlaceholderData, refetch,
    craftsmen, designers3D, storeOptions, workloadByName,
    kpi3DGroups, defaultKpi3DCalendar, kpi3DWorkingCalendar,
    canViewOvertimeRecord, canReadKpi3DConfig, canEditSoMeta,
  } = useOrderPanelData({ orderId, isPendingCreate, placeholderData, currentUserRole });

  // CHỈ lấy nhóm đã cấu hình thật. Trước đây khi chưa có nhóm nào active thì rơi về danh
  // sách cứng PHAN_NHOM_3D_OPTIONS — dropdown trông vẫn đầy đủ nên người dùng chọn bình
  // thường, nhưng server không tạo được assignment và im lặng bỏ qua, khiến việc không hiện
  // ở màn "Việc thiết kế 3D" mà không rõ nguyên nhân. Thà để trống kèm cảnh báo còn hơn.
  //
  // Giá trị cũ đã lưu trên đơn vẫn được giữ trong danh sách để không âm thầm mất dữ liệu.
  const kpi3DGroupOptions = useMemo(() => {
    const names = kpi3DGroups.map((group) => group.name);
    return designForm.phanNhom3D && !names.includes(designForm.phanNhom3D)
      ? [...names, designForm.phanNhom3D]
      : names;
  }, [designForm.phanNhom3D, kpi3DGroups]);

  const kpi3DNotConfigured = canReadKpi3DConfig && kpi3DGroups.length === 0;

  useEffect(() => {
    const selectedGroup = kpi3DGroups.find(
      (group) => group.name === designForm.phanNhom3D || group.code === designForm.phanNhom3D,
    );

    if (!selectedGroup) return;

    const nextHours = String(Math.round((selectedGroup.standardMinutes / 60) * 100) / 100);
    let nextDeadline = designForm.deadline;
    let nextDeadlinePreview: Date | null = null;

    if (designForm.ngayGiao3D && designForm.gioGiao3D && defaultKpi3DCalendar) {
      try {
        const deadlineDate = calculate3DKpiDeadline(
          parseWallDateTime(designForm.ngayGiao3D, designForm.gioGiao3D),
          selectedGroup.standardMinutes,
          configuredCalendarToWorkingCalendar(defaultKpi3DCalendar),
        );
        nextDeadline = formatDateOnly(deadlineDate);
        nextDeadlinePreview = deadlineDate;
      } catch {
        nextDeadline = "";
      }
    }
    setDeadlinePreview(nextDeadlinePreview);

    setDesignForm((prev) => {
      if (prev.soGioDuKien === nextHours && prev.deadline === nextDeadline) return prev;
      const next = { ...prev, soGioDuKien: nextHours, deadline: nextDeadline };
      next.ketQua = calcKetQua(next.ngayHoanThanh3D, next.deadline, next.gioThucTe, next.soGioDuKien);
      return next;
    });
  }, [
    defaultKpi3DCalendar,
    designForm.deadline,
    designForm.gioGiao3D,
    designForm.ngayGiao3D,
    designForm.phanNhom3D,
    kpi3DGroups,
  ]);

  /**
   * Số giờ KPI + Deadline hiển thị TẠM cho một NV 3D bổ sung, tính ngay ở trình duyệt.
   *
   * Cố ý KHÔNG lưu vào state như designForm.soGioDuKien/deadline: hai giá trị này SUY RA hoàn
   * toàn từ (nhóm KPI, ngày giao, giờ giao) nên giữ thêm một bản trong state chỉ tạo cơ hội
   * cho nó lệch. Sau khi lưu, con số chính thức lấy từ bản ghi server (`row.deadlineAt`).
   */
  const previewExtraDesigner = (x: ExtraDesigner3D): { hours: string; deadline: Date | null } => {
    const group = kpi3DGroups.find((g) => g.name === x.phanNhom3D || g.code === x.phanNhom3D);
    if (!group) return { hours: "", deadline: null };

    const hours = String(Math.round((group.standardMinutes / 60) * 100) / 100);
    if (!x.ngayGiao3D || !x.gioGiao3D || !defaultKpi3DCalendar) return { hours, deadline: null };

    try {
      return {
        hours,
        deadline: calculate3DKpiDeadline(
          parseWallDateTime(x.ngayGiao3D, x.gioGiao3D),
          group.standardMinutes,
          configuredCalendarToWorkingCalendar(defaultKpi3DCalendar),
        ),
      };
    } catch {
      return { hours, deadline: null };
    }
  };

  // `formatTho3d` đã xoá: nó sinh ra để tab Thiết kế bên PSX tra ngược tên → "code - name",
  // vì khối vẽ tay ở đó chỉ có mỗi cái tên trong JSON. Nay PSX dùng chung khối của PTK, và
  // khối đó nhận cả bản ghi nhân viên nên tự hiện mã — không còn ai cần tra ngược.

  // Lock all editing when order is in a terminal state (cấp SO — dùng cho các việc thuộc
  // về CẢ SO: banner đồng bộ, tự invalidate snapshot khi SO chuyển terminal...).
  // Khoá panel chỉnh sửa (isReadOnly) KHÔNG dùng biến này trực tiếp — xem effectiveTerminal
  // bên dưới (sau khi có activeItem) để khoá đúng theo MO đang xem, không phải theo SO.
  const isTerminal = order?.status === "COMPLETED" || order?.status === "CANCELLED";

  // Cải tiến 2: Khi panel phát hiện đơn đã terminal, tự invalidate snapshot PSX/PTK
  // để đơn biến khỏi danh sách active mà không cần user bấm Sync thủ công.
  const prevTerminalRef = useRef(false);
  useEffect(() => {
    if (isTerminal && !prevTerminalRef.current) {
      queryClient.invalidateQueries({ queryKey: ["orders-snapshot"] });
    }
    prevTerminalRef.current = !!isTerminal;
  }, [isTerminal]);

  // Sync form khi order load / đổi orderId
  useEffect(() => {
    if (order) {
      // Fix A — KHÔNG ghi đè form khi user đang sửa dở: một refetch nền (heartbeat phát hiện
      // user khác sửa, quay lại tab, query invalidate) trả về `order` mới tham chiếu sẽ khiến
      // effect này chạy lại và reset toàn bộ form + xoá dirty → mất giá trị vừa gõ (VD Tên KH/
      // Sale) chưa kịp Lưu. Chỉ re-init khi: (a) mở/đổi sang đơn KHÁC, hoặc (b) cùng đơn nhưng
      // user KHÔNG có sửa dở (mở lần đầu, hoặc sau khi Lưu — onMutate đã clear dirty trước refetch).
      const isSameOrder = lastInitedOrderIdRef.current === order.id;
      if (isSameOrder && hasUnsavedEdits) return;
      lastInitedOrderIdRef.current = order.id;

      const ai = activeItemId ? (order.items.find((i) => i.id === activeItemId) as any) : null;
      const itemZone: string = (ai?.zone ?? order.zone) as string;

      const baseForm = toFormState(order);
      if (itemZone === "PRE_PRODUCTION" && activeItemId) {
        const resolvedStatus = ((ai?.itemStatus ?? order.status) as OrderStatus);
        setForm({ ...baseForm, status: resolvedStatus });
      } else {
        setForm(baseForm);
      }
      const forms: Record<string, ItemForm> = {};
      order.items.forEach((item) => { forms[item.id] = toItemForm(item, order); });
      setItemForms(forms);
      setDirtyItemIds(new Set());
      setIsDirty(false);
      setSaveError(null);
      setConflictError(false);

      // Load design form for PTK — per-MO nếu có activeItemId, fallback shared extraData.design
      const pdExtraAll = (order.productionDetail?.extraData as Record<string, unknown>) ?? {};
      const perItemAll = (pdExtraAll.perItem as Record<string, unknown>) ?? {};
      const perItemData = activeItemId ? ((perItemAll[activeItemId] as Record<string, unknown>) ?? {}) : {};
      const perItemDesign = (perItemData.design as Record<string, unknown>) ?? null;
      const sharedDesign = (pdExtraAll.design as Record<string, unknown>) ?? {};
      const designData = perItemDesign ?? sharedDesign;
      {
        // ─── BẢNG THẮNG JSON cho thông số ĐÃ ĐÓNG DẤU của lượt đang chạy ─────
        //
        // LỖI ĐANG SỬA — và nó ghi sai dữ liệu, không chỉ hiện sai:
        //
        // Khi hệ thống TỰ tạo một lượt mới (mở lại sau tạm dừng), nó ghi mốc giao và ngân sách
        // giờ MỚI vào bảng. JSON extraData không đổi, nên form vẫn giữ mốc và suất giờ của lượt
        // CŨ. Đến đây mới chỉ là hiện sai. Nhưng lần Order bấm Lưu đơn hàng tiếp theo — không sửa
        // gì cả — thì matchAssignment khớp khối này vào lượt MỚI (qua nhánh "cùng nhân viên") và
        // GHI ĐÈ mốc giao + ngân sách của nó bằng mấy giá trị cũ đó. Deadline sai, ngân sách sai,
        // không một thông báo nào.
        //
        // Chặn tận gốc: có lượt trong bảng thì bảng là nguồn. JSON chỉ còn để seed khi CHƯA có
        // lượt nào (Order vừa gõ, chưa lưu) và để giữ các ô bảng không có (giờ thực tế sửa tay).
        const activeRow = activeAttempts(order.design3DAssignments ?? [])
          .find((r) => r.orderItemId === activeItemId) ?? null;
        const rowAssignedAt = activeRow ? new Date(activeRow.assignedAt) : null;
        const rowMomentOk = rowAssignedAt != null && Number.isFinite(rowAssignedAt.getTime());

        const ngayGiao3D      = rowMomentOk ? toVnYmd(rowAssignedAt) : ((designData.ngayGiao3D as string) ?? "");
        const gioGiao3D       = rowMomentOk ? toVnHm(rowAssignedAt)  : ((designData.gioGiao3D  as string) ?? "");
        const ngayHoanThanh3D = (designData.ngayHoanThanh3D as string) ?? "";
        const deadline        = (designData.deadline        as string) ?? "";
        const gioThucTe       = designData.gioThucTe != null ? String(designData.gioThucTe) : "";
        // Suất giờ và nhóm KPI cũng lấy từ lượt: `standardMinutesSnapshot` là số ĐÃ ĐÓNG DẤU vào
        // lượt, cố ý không đọc theo cấu hình nhóm hiện tại (admin sửa nhóm về sau không được đổi
        // ngân sách của lượt đã giao). Mở lại sau tạm dừng còn đặt suất RIÊNG — phần còn lại —
        // nên đọc theo nhóm ở đây sẽ ra nguyên suất, tức sai hẳn.
        const soGioDuKien = activeRow
          ? String(Math.round((activeRow.standardMinutesSnapshot / 60) * 100) / 100)
          : (designData.soGioDuKien != null ? String(designData.soGioDuKien) : "");
        setDesignForm({
          yeucauThietKe:  (designData.yeucauThietKe  as string) ?? "",
          yeucauKyThuat:  (designData.yeucauKyThuat  as string) ?? "",
          phanNhom3D:     activeRow?.kpiGroup?.name ?? ((designData.phanNhom3D as string) ?? ""),
          nhomSP3D:       (designData.nhomSP3D       as string) ?? "",
          dongSP3D:       (designData.dongSP3D       as string) ?? "",
          // Thợ 3D: lượt giao việc → perItem[itemId].tho3d → extraData.tho3d (chỗ lưu cũ).
          // Thứ tự này nằm ở kpi-3d/designer-name.ts để tab Thiết kế bên PSX dùng CHUNG —
          // trước đây bên đó tự đọc mỗi extraData.tho3d nên mọi đơn mới hiện "—".
          tho3d:          resolveDesignerName({
            assignmentDesignerName: activeRow?.designer3D?.name,
            perItemTho3d: perItemData.tho3d,
            rootTho3d: pdExtraAll.tho3d,
          }),
          ngayGiao3D,
          gioGiao3D,
          soGioDuKien,
          hoanTatDuKien:  (designData.hoanTatDuKien  as string) ?? "",
          deadline,
          ngayHoanThanh3D,
          gioThucTe,
          soNgayHTThucTe: calcSoNgayHT(gioThucTe),
          ketQua:         calcKetQua(ngayHoanThanh3D, deadline, gioThucTe, soGioDuKien),
        });
        // NV 3D thứ 2 trở đi. Bỏ qua phần tử rác/không phải object thay vì để nguyên — một
        // phần tử hỏng sẽ làm lệch chỉ số slot của TẤT CẢ người phía sau khi lưu.
        const rawExtras = Array.isArray(perItemData.designers) ? perItemData.designers : [];
        setExtraDesigners(
          rawExtras.map((entry) => {
            const e = (entry ?? {}) as Record<string, unknown>;
            return {
              tho3d:             (e.tho3d             as string) ?? "",
              phanNhom3D:        (e.phanNhom3D        as string) ?? "",
              ngayGiao3D:        (e.ngayGiao3D        as string) ?? "",
              gioGiao3D:         (e.gioGiao3D         as string) ?? "",
              gioThucTe:         e.gioThucTe != null ? String(e.gioThucTe) : "",
              kpi3DAssignmentId: (e.kpi3DAssignmentId as string) ?? "",
            };
          }),
        );
        setReworkForId(null);
        setReworkReason("");
      }
      setIsDesignDirty(false);

      if (itemZone === "MASTER_HUB") {
        const pf = toProductionForm(order, activeItemId);
        if (activeItemId && ai?.itemStatus) {
          const isTerminalItem = ai.itemStatus === "COMPLETED" || ai.itemStatus === "CANCELLED";
          pf.moStatus = (!isTerminalItem && order.isSuspended) ? "SUSPENDED" : ai.itemStatus;
        }
        setProductionForm(pf);
        setStageForms(toStageForms(order.productionDetail, activeItemId));
        setExpandedTimeRows(new Set());
        // Đổi MO thì bỏ hết lựa chọn tay — mỗi MO mở ra là một lần "lần sau mở lên", phải
        // về đúng mặc định. Giữ lại sẽ khiến MO mới thừa hưởng khâu đang mở của MO cũ.
        setManualStageOpen({});
        const pdExtra = (order.productionDetail?.extraData as Record<string, unknown>) ?? {};
        setHoldReason((pdExtra.holdReason as "" | "CHO_DX_NL" | "CHO_NL") ?? "");
        {
          const perItemExtra = (pdExtra.perItem as Record<string, unknown>) ?? {};
          const itemExtra = activeItemId ? ((perItemExtra[activeItemId] as Record<string, unknown>) ?? {}) : pdExtra;
          setProductionMethod((itemExtra.productionMethod as "HANDCRAFT" | "MACHINE" | "MIXED") ?? null);
        }
        setIsProductionDirty(false);
      }
      if (itemZone === "PRE_PRODUCTION") {
        setMhProductionCode(getBaseSoNumber(order.items[0]?.moNumber ?? order.orderNumber));
      }
    }
  }, [order]);

  // Reset state khi mở panel mới
  useEffect(() => {
    if (orderId) {
      setActiveTab("info");
      setMhTab("info");
      setShowPromoteConfirm(false);
      setPromoteIsForced(false);
      setShowRollbackConfirm(false);
      setPromoteComment("");
      setRollbackReason("");
      setRollbackTarget("IN_DESIGN");
      setMhProductionCode("");
      setCreateVersionToggle(false);
      setIsProductionDirty(false);
      setProductionMethod(null);
      setIsDesignDirty(false);
    }
  }, [orderId]);

  // Reset UI state khi chuyển sang MO khác cùng SO (activeItemId thay đổi)
  useEffect(() => {
    if (activeItemId) {
      setSaveError(null);
      setShowCancelConfirm(false);
      setShowRollbackConfirm(false);
      setShowShowroomConfirm(false);
      if (order) {
        const ai = order.items.find((i) => i.id === activeItemId) as any;
        const itemZone: string = (ai?.zone ?? order.zone) as string;
        const rawStatus = (ai?.itemStatus ?? order.status) as OrderStatus;
        const isTerminalRaw = rawStatus === "COMPLETED" || rawStatus === "CANCELLED";
        const resolvedStatus: OrderStatus = (!isTerminalRaw && order.isSuspended) ? "SUSPENDED" : rawStatus;
        if (itemZone === "MASTER_HUB") {
          const pf = toProductionForm(order, activeItemId);
          pf.moStatus = resolvedStatus;
          setProductionForm(pf);
          setIsProductionDirty(false);
        }
        if (itemZone === "PRE_PRODUCTION") {
          setForm((prev) => prev ? { ...prev, status: resolvedStatus } : prev);
        }
      }
    }
  }, [activeItemId, order]);

  // Đóng khi nhấn Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && orderId) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [orderId, onClose]);

  // All query key prefixes that hold order lists — optimistic updates apply to all
  //
  // ⚠️ ĐÃ BỎ `store-orders` và `store-orders-snapshot`: hai khoá đó chỉ do /dashboard/stores
  // sinh ra, và trang đó đã bị xoá. Giữ lại là vá một cache không bao giờ tồn tại — code chết
  // trông y như đang chạy.
  const ORDER_LIST_PREFIXES = [["orders"], ["orders-snapshot"]] as const;

  /** Áp một phép vá lên MỌI cache danh sách — bảng chính và cả snapshot của từng tab. */
  const patchAllLists = useCallback((patch: (cache: unknown) => unknown) => {
    for (const prefix of [["orders"], ["orders-snapshot"]]) {
      queryClient.setQueriesData({ queryKey: prefix, exact: false }, patch);
    }
  }, [queryClient]);

  // Khi panel load dữ liệu thực từ server (không phải placeholder), vá snapshot cache ngay lập tức.
  // Giải quyết mismatch 0-20s: panel đã fetch fresh nên thấy status mới, bảng vẫn dùng snapshot cũ.
  // Thay vì chờ heartbeat (≤20s), tận dụng data panel đã có sẵn để update bảng luôn.
  useEffect(() => {
    if (!order || isPlaceholderData || !orderId) return;
    const patchKey = `${orderId}:${order.updatedAt}`;
    if (prevSnapshotPatchRef.current === patchKey) return;
    prevSnapshotPatchRef.current = patchKey;
    for (const prefix of ORDER_LIST_PREFIXES) {
      queryClient.setQueriesData({ queryKey: prefix, exact: false }, (cache) =>
        patchOrderInList<PanelListRow>(cache, orderId!, (row) => ({
          ...row,
          status: order.status,
          isSuspended: order.isSuspended,
          // `stageMatchKeys` do bảng tự tính, bản detail không có — giữ lại của dòng cũ.
          allItems: carryStageMatchKeys(order.allItems ?? row.allItems ?? [], row.allItems ?? []),
          activeAlertTitle: order.activeAlertTitle ?? row.activeAlertTitle,
        })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, isPlaceholderData, orderId]);

  // ── PRE_PRODUCTION Save mutation ──────────────────────────────────────────
  const saveMutation = useMutation({
    onMutate: async (vars: { dirtySnapshot: string[]; formsSnapshot: Record<string, ItemForm>; designSnapshot?: DesignForm; designSnapshotExtras?: ExtraDesigner3D[]; capturedOrderId: string; capturedActiveItemId: string | null; capturedOrder: any; capturedForm: any; capturedCreateVersionToggle: boolean; promoteFollows?: boolean }) => {
      await Promise.all([
        ...ORDER_LIST_PREFIXES.map(p => queryClient.cancelQueries({ queryKey: p })),
        queryClient.cancelQueries({ queryKey: ["order-panel", orderId] }),
      ]);

      // Snapshot ALL matching order list queries for rollback
      const previousOrdersEntries = ORDER_LIST_PREFIXES.flatMap(p =>
        queryClient.getQueriesData({ queryKey: p, exact: false })
      );
      const previousOrderDetail = queryClient.getQueryData(["order-panel", orderId]);

      // TRUE OPTIMISTIC UPDATE: update list immediately with ALL visible field values
      const optimisticStatus = form?.status ?? null;
      const currentItemForm = activeItemId ? itemForms[activeItemId] : null;
      const toIso = (d: string) => d ? new Date(d + "T00:00:00Z").toISOString() : null;

      const applyOptimistic = (cache: unknown) =>
        patchOrderInList<PanelListRow>(cache, orderId!, (o) => {

            // Order-level patches (PanelForm fields visible in table)
            const orderPatch: Record<string, unknown> = {};
            if (form?.linkChat !== undefined) orderPatch.linkChat = form.linkChat || null;
            if (form?.donHang3Sao !== undefined) orderPatch.donHang3Sao = form.donHang3Sao;

            if (activeItemId) {
              // Per-MO edit: spread FULL ItemForm onto item — never miss a field
              const newAllItems = (o.allItems ?? []).map((item: any) => {
                if (item.itemId !== activeItemId) return item;
                const itemPatch: Record<string, unknown> = {};
                if (optimisticStatus) itemPatch.itemStatus = optimisticStatus;
                if (currentItemForm) {
                  // loaiHang, hinhDangHot → stored in specifications (not in OrderFirstItem)
                  // techNote → not visible in list table
                  const { estimatedDate, requiredDate, weightGram, loaiHang, hinhDangHot, techNote, ...directFields } = currentItemForm;
                  Object.assign(itemPatch, directFields);
                  itemPatch.estimatedDate = toIso(estimatedDate);
                  itemPatch.requiredDate  = toIso(requiredDate);
                  itemPatch.weightGram    = weightGram || null;
                  itemPatch.isPriority    = ["UT1", "UT2"].includes(directFields.priorityCode);
                }
                return { ...item, ...itemPatch };
              });
              return { ...o, ...orderPatch, allItems: newAllItems };
            }
            // Order-level edit (no specific MO)
            if (optimisticStatus) orderPatch.status = optimisticStatus;
          return { ...o, ...orderPatch };
        });

      for (const prefix of ORDER_LIST_PREFIXES) {
        queryClient.setQueriesData({ queryKey: prefix, exact: false }, applyOptimistic);
      }

      // Optimistic clear to unblock UI
      setIsDirty(false);
      setDirtyItemIds(new Set());
      setSaveError(null);
      setConflictError(false);

      // Hybrid: nếu tạo version → chèn row tạm với id pending-v-<orderId> NGAY LẬP TỨC.
      // Số version chưa biết nên clone từ row nguồn (hiện cùng số). Sau khi patchOrder
      // trả về (~400ms), mutationFn thay thế bằng row thật mang số version đúng.
      // onError khôi phục previousOrdersEntries → row tạm biến mất tự động khi lỗi.
      if (vars.capturedCreateVersionToggle) {
        const tempVersionId = `pending-v-${vars.capturedOrderId}`;
        const sourceRow = queryClient
          .getQueriesData<{ data: OrderSummary[] }>({ queryKey: ["orders-snapshot"], exact: false })
          .flatMap(([, d]) => d?.data ?? [])
          .find((o) => o.id === vars.capturedOrderId);
        if (sourceRow) {
          // Strip version suffix khỏi moNumber để ô MO# không hiện số cũ (_2) trong khi
          // server chưa trả về số mới (_3). Table sẽ nhận diện _optimistic và hiện "…" thay thế.
          const stripVer = (mo: string | null | undefined): string => stripVersionSuffix(mo ?? "");
          const tempRow = {
            ...sourceRow,
            id: tempVersionId,
            _optimistic: true,
            firstItem: sourceRow.firstItem
              ? { ...sourceRow.firstItem, moNumber: stripVer(sourceRow.firstItem.moNumber) }
              : sourceRow.firstItem,
            allItems: (sourceRow.allItems ?? []).map((item: any) => ({ ...item, moNumber: stripVer(item.moNumber) })),
            allMoNumbers: (sourceRow.allMoNumbers ?? []).map(stripVer),
          } as OrderSummary;
          queryClient.setQueriesData<{ data: OrderSummary[] }>(
            { queryKey: ["orders-snapshot"], exact: false },
            (old) => {
              if (!old?.data) return old;
              if (old.data.some((o) => o.id === tempVersionId)) return old;
              const idx = old.data.findIndex((o) => o.id === vars.capturedOrderId);
              const next = [...old.data];
              if (idx !== -1) next.splice(idx + 1, 0, tempRow);
              else next.unshift(tempRow);
              return { ...old, data: next };
            }
          );
        }
      }
      return { previousOrdersEntries, previousOrderDetail };
    },
    mutationFn: async (vars: { dirtySnapshot: string[]; formsSnapshot: Record<string, ItemForm>; designSnapshot?: DesignForm; designSnapshotExtras?: ExtraDesigner3D[]; capturedOrderId: string; capturedActiveItemId: string | null; capturedOrder: any; capturedForm: any; capturedCreateVersionToggle: boolean; promoteFollows?: boolean }) => {
      // All values from vars snapshot — NOT closure (closure is stale after onClose() re-render with orderId=null)
      const { dirtySnapshot, formsSnapshot, designSnapshot, designSnapshotExtras = [], capturedOrderId, capturedActiveItemId, capturedOrder: order, capturedForm: form, capturedCreateVersionToggle: createVersionToggle } = vars;
      if (!form || !order) throw new Error("Không có dữ liệu");

      const activeItemInOrder = capturedActiveItemId ? (order.items.find((i: any) => i.id === capturedActiveItemId) as any) : null;
      const activeItemZoneInMutation = (activeItemInOrder?.zone ?? order.zone) as string;
      const isPerMoEdit = !!(capturedActiveItemId && activeItemZoneInMutation === "PRE_PRODUCTION");
      const isCreateVersion = createVersionToggle && activeItemZoneInMutation === "PRE_PRODUCTION";

      // Cảnh báo cấu hình KPI 3D do server trả về khi lưu phần Thiết kế (nếu có).
      let kpi3DWarning: string | null = null;

      // form now only contains: status, linkChat, donHang3Sao (shared fields)
      // locked fields (customerName, salesName, nguon, phanLoaiKh) are not in form
      // per-MO fields (estimatedDate, requiredDate, saleNote, priorityCode) are in itemForms

      // Only call Order PATCH if SO-level fields actually changed, or if creating a version.
      // Skipping it avoids bumping Order.version unnecessarily — which caused 409 conflicts
      // when two users edited different MOs in the same SO simultaneously.
      // Note: when isPerMoEdit=true, form.status is item-level (not SO-level), so exclude it.
      const isOrderFieldsDirty =
        (!isPerMoEdit && form.status !== order.status) ||
        (form.linkChat ?? "") !== (order.linkChat ?? "") ||
        form.donHang3Sao !== (order.donHang3Sao ?? false) ||
        (form.phanLoaiKh ?? "") !== (order.phanLoaiKh ?? "") ||
        (form.nguon ?? "") !== (order.nguon ?? "");
      const shouldPatchOrder = isOrderFieldsDirty || isCreateVersion;

      const updatedOrder = shouldPatchOrder
        ? await patchOrder(capturedOrderId, {
            ...form,
            // Phân loại KH / Nguồn: rỗng = không đổi (tránh ghi "" / lookup store code rỗng).
            // Route đã chặn role ngoài ADMIN/ORDER.
            phanLoaiKh: form.phanLoaiKh || undefined,
            nguon:      form.nguon || undefined,
            // Exclude status from Order-level when editing a specific MO
            ...(isPerMoEdit ? { status: undefined } : {}),
            version: order.version,
            createVersion: isCreateVersion,
            versionReason: createVersionToggle ? "Tạo phiên bản từ sidebar" : undefined,
            // Per-MO independence: scope version creation to this item only
            ...(isCreateVersion && capturedActiveItemId ? { activeItemId: capturedActiveItemId } : {}),
          })
        : order;

      // Find the corresponding item in the new versioned order by comparing the
      // version-stripped base MO# of BOTH sides. Stripping only the new item's suffix
      // failed when the source order was already a version (e.g. _6 → _7), because
      // origMoNumber still carried its own "_6" suffix and never matched.
      const stripMoVersion = (mo: string | null | undefined): string => stripVersionSuffix(mo ?? "");
      const findVersionedItem = (origMoNumber: string | null | undefined) => {
        if (!origMoNumber) return null;
        const origBase = stripMoVersion(origMoNumber);
        return updatedOrder.items.find((ni: any) => stripMoVersion(ni.moNumber) === origBase) ?? null;
      };

      // ── Hybrid: fast-surface — thay row tạm (pending-v-) bằng row THẬT ──────────
      // onMutate đã chèn row tạm NGAY LẬP TỨC. Khi patchOrder trả về số version THẬT,
      // ta thay thế row tạm tại chỗ → số đúng xuất hiện 1 lần, không nhấp nháy.
      // KHÔNG gọi onReopenOrder → sidebar không tự mở. User tự click nếu muốn.
      if (isCreateVersion && updatedOrder.id !== capturedOrderId) {
        const newRow = { ...buildOptimisticSummary(updatedOrder as any), _optimistic: true } as OrderSummary;
        const tempVersionId = `pending-v-${capturedOrderId}`;
        queryClient.setQueriesData<{ data: OrderSummary[] }>(
          { queryKey: ["orders-snapshot"], exact: false },
          (old) => {
            if (!old?.data) return old;
            if (old.data.some((o) => o.id === newRow.id)) return old;
            // Thay row tạm bằng row thật (số version đúng). Fall back: chèn sau row nguồn.
            const tempIdx = old.data.findIndex((o) => o.id === tempVersionId);
            const next = [...old.data];
            if (tempIdx !== -1) {
              next.splice(tempIdx, 1, newRow);
            } else {
              const srcIdx = next.findIndex((o) => o.id === capturedOrderId);
              if (srcIdx !== -1) next.splice(srcIdx + 1, 0, newRow);
              else next.unshift(newRow);
            }
            return { ...old, data: next };
          }
        );
        // Khóa edit/promote trên bản mới (sidebar nếu user tự mở sẽ thấy isSavePending)
        const newActiveItem = capturedActiveItemId
          ? findVersionedItem((activeItemInOrder as any)?.moNumber)
          : updatedOrder.items[0];
        if (newActiveItem) onSavePending?.(newActiveItem.id);
      }

      // Save this MO's status to item-level — does not affect sibling MOs
      //
      // 🔴 BỎ QUA VỚI VAI GHI-MỘT-PHẦN. Lời gọi này chạy ở MỌI lần lưu per-MO, kể cả khi trạng
      // thái không đổi — nó chỉ gửi lại giá trị đang có. Vô hại với vai đủ quyền; với R&D thì
      // route TỪ CHỐI 403 (itemStatus có side effect nên không được lọc âm thầm), và cả lần lưu
      // hỏng chỉ vì một field họ không hề đụng tới.
      if (isPerMoEdit && form.status && !isPartialWriteRole(currentUserRole)) {
        if (isCreateVersion) {
          const origItem = order.items.find((i: any) => i.id === capturedActiveItemId);
          const newItem = findVersionedItem((origItem as any)?.moNumber);
          if (newItem) await patchItemStatus(updatedOrder.id, newItem.id, form.status);
        } else {
          await patchItemStatus(capturedOrderId, capturedActiveItemId!, form.status);
        }
      }

      if (dirtySnapshot.length > 0) {
        const itemSaves = dirtySnapshot.map((itemId) => {
          const f = formsSnapshot[itemId];
          if (!f) return Promise.resolve();
          const { chiTietDaTam, ghiChuSp, weightGram, estimatedDate, requiredDate, loaiHang, hinhDangHot, loaiSp, customerName, salesName, bomStatus, bomDates, bomDienGiai, design3DPriorityCode, ...rest } = f;

          // ═══ KHUÔN MẪU: FIELD CÓ CHỐT-CHẶN-CẢ-REQUEST PHẢI GỬI CÓ ĐIỀU KIỆN ═══
          //
          // 🔴 BA FIELD, BA LẦN CÙNG MỘT BẪY. Nó không còn là tai nạn, nên nó có tên ở đây.
          //
          // Lần lưu này gửi CẢ CỤM field (`...rest`) cho MỌI MO đang dirty. Một số route KHÔNG
          // lọc âm thầm field không đủ quyền mà TỪ CHỐI CẢ REQUEST (403) — đúng, vì lọc âm thầm
          // sinh ra "MO bị huỷ bởi vai không có quyền huỷ, API trả 200". Hai luật đó gặp nhau
          // thành: một field người dùng KHÔNG HỀ ĐỤNG TỚI làm hỏng cả lần lưu.
          //
          //   · design3DPriorityCode — chặn theo VAI  → gửi khi đủ quyền VÀ giá trị đổi
          //   · itemStatus           — chặn theo VAI  → bỏ qua với vai ghi-một-phần (dòng ~1385)
          //   · masoMau              — chặn theo ZONE → gửi khi canEditMaSoMau (ngay dưới)
          //
          // ⚠️ THÊM FIELD THUỘC LOẠI NÀY THÌ PHẢI GỬI CÓ ĐIỀU KIỆN. `masoMau` được thêm vào
          // giữa hai field trên mà không có chốt, và hậu quả là mọi lần lưu một MO ở PTK đều
          // 403 — kể cả lần tự-lưu ngay trước khi chuyển xưởng.
          // ═══════════════════════════════════════════════════════════════════════

          // ── ƯU TIÊN THIẾT KẾ 3D: TÁCH KHỎI `rest`, gửi CÓ ĐIỀU KIỆN ─────────────
          //
          // Route TỪ CHỐI CẢ REQUEST (403) khi field này có mặt mà người gửi không phải
          // ADMIN/ORDER — chốt chặn đó là đúng. Nhưng lần lưu này gửi `...rest` cho MỌI MO đang
          // dirty, nên nếu để nó trong `rest` thì một người PRODUCTION chỉ sửa NVL cũng bị chặn.
          //
          // Chỉ gửi khi CẢ HAI đúng:
          //   · người dùng có quyền đặt, VÀ
          //   · giá trị THẬT SỰ khác giá trị đang lưu trên server.
          //
          // Điều kiện thứ hai cắt luôn nguồn nhiễu thông báo: sidebar gửi cả cụm field mỗi lần
          // bấm Lưu, nên không có nó thì MỌI lần lưu đơn đều thành một lần "đổi ưu tiên" và Space
          // đầy tin vô nghĩa — rồi không ai đọc tin nào nữa, kể cả tin thật.
          const canSetDesignPriority = currentUserRole === "ADMIN" || currentUserRole === "ORDER";
          // Chỉ khai đúng hai trường cần dùng: `order` ở đây chưa được gõ type, và một `as any`
          // sẽ che mất lỗi nếu tên cột đổi.
          type DesignPriorityLookup = { id: string; design3DPriorityCode?: string | null };
          const serverDesignPriority =
            (order.items as DesignPriorityLookup[]).find((i) => i.id === itemId)?.design3DPriorityCode || "Normal";
          const designPriorityPatch =
            canSetDesignPriority && design3DPriorityCode !== serverDesignPriority
              ? { design3DPriorityCode }
              : {};

          // Ghi đè riêng theo MO: khác giá trị SO → set override; giống SO → null (xoá override,
          // MO tiếp tục ăn theo SO nếu sau này SO đổi).
          // Fix B: chuẩn hoá trước khi ghi override — trim, và chỉ set override khi có giá trị
          // THẬT và KHÁC giá trị SO; rỗng/khoảng-trắng/trùng SO → null (không lưu "" để tránh
          // che mất giá trị SO khi hiển thị). MO không override sẽ tiếp tục ăn theo SO.
          const custTrim = (customerName ?? "").trim();
          const soCustTrim = (order.customerName ?? "").trim();
          const customerNameOverride = custTrim && custTrim !== soCustTrim ? custTrim : null;
          const salesTrim = (salesName ?? "").trim();
          const soSalesTrim = (order.salesName ?? "").trim();
          const salesNameOverride = salesTrim && salesTrim !== soSalesTrim ? salesTrim : null;
          const hasBomData = !!(bomStatus || bomDates.CHO_BOM || bomDates.CHO_THONG_TIN || bomDates.DA_GUI || bomDienGiai);
          // MÃ SỐ MẪU: chỉ gửi khi vai này NHẬP ĐƯỢC nó cho đúng MO này — xem khuôn mẫu ở trên.
          //
          // ⚠️ Hỏi `canEditMaSoMau`, KHÔNG hỏi `shouldShowMaSoMau`. Cái sau chỉ trả lời "ô có
          // hiện không" và bỏ lọt ca một người PRODUCTION lưu một MO đang ở PSX: ô hiện (chỉ
          // đọc), nhưng vai họ không nhập được, nên gửi lên là 403.
          //
          // Chuẩn hoá "chưa có mã": ô rỗng phải thành NULL, không phải chuỗi rỗng — nếu không DB
          // có hai cách nói "trống" và mọi phép đếm/lọc sau này phải nhớ cả hai.
          const itemZoneForSave = (order.items as { id: string; zone?: string | null }[])
            .find((i) => i.id === itemId)?.zone;
          const maSoMauPatch = canEditMaSoMau(currentUserRole, itemZoneForSave)
            ? { masoMau: normalizeMaSoMau(rest.masoMau ?? "") }
            : {};

          const payload = {
            ...rest, // includes techNote, techClassification, saleNote, priorityCode etc.
            ...maSoMauPatch,
            ...designPriorityPatch, // CHỈ có mặt khi đủ quyền VÀ giá trị thật sự đổi (xem trên)
            weightGram: weightGram !== "" ? parseFloat(weightGram) : null,
            specifications: {
              chiTietDaTam, ghiChuSp, loaiHang, hinhDangHot, loaiSp,
              customerName: customerNameOverride, salesName: salesNameOverride,
              // BOM per-MO — mỗi trạng thái 1 ô ngày riêng, chuyển trạng thái KHÔNG xoá ngày cũ.
              bom: hasBomData ? { status: bomStatus || null, dates: bomDates, dienGiai: bomDienGiai || "" } : null,
              bomStatus: null, bomSentDate: null, // dọn key phẳng cũ (đã gộp vào bom)
            },
            estimatedDate: estimatedDate ? new Date(estimatedDate + "T00:00:00Z").toISOString() : null,
            requiredDate:  requiredDate  ? new Date(requiredDate  + "T00:00:00Z").toISOString() : null,
          };
          if (isCreateVersion) {
            const origItem = order.items.find((i: any) => i.id === itemId);
            const newItem = findVersionedItem((origItem as any)?.moNumber);
            return newItem
              ? patchItem(updatedOrder.id, newItem.id, { ...payload, version: updatedOrder.version })
              : patchItem(capturedOrderId, itemId, { ...payload, version: order.version });
          }
          return patchItem(capturedOrderId, itemId, { ...payload, version: updatedOrder.version });
        });
        await Promise.all(itemSaves);
      }

      // Save design data (PTK tab) — per-MO khi có activeItemId, shared khi không có
      if (designSnapshot) {
        const d = designSnapshot;
        // Tính từ `order` thay vì dùng design3DView (khai báo sau trong component body) —
        // tránh phụ thuộc thứ tự khai báo, và đây là hàm chạy khi bấm Lưu nên đọc order là đủ.
        // activeAttempts: một MO từng bị đổi người mà lượt mới đã bị huỷ thì nó KHÔNG còn lượt
        // hiệu lực nào — coi là "đã có lượt giao việc" sẽ làm form bỏ qua bước tạo lượt mới.
        const hasDesign3DAssignment = !!(
          capturedActiveItemId &&
          activeAttempts<Design3DAssignmentRow>(order.design3DAssignments ?? []).some(
            (r) => r.orderItemId === capturedActiveItemId,
          )
        );
        const designPayload = {
          yeucauThietKe:   d.yeucauThietKe   || null,
          yeucauKyThuat:   d.yeucauKyThuat   || null,
          phanNhom3D:      d.phanNhom3D      || null,
          nhomSP3D:        d.nhomSP3D        || null,
          dongSP3D:        d.dongSP3D        || null,
          ngayGiao3D:      d.ngayGiao3D      || null,
          gioGiao3D:       d.gioGiao3D       || null,
          soGioDuKien:     d.soGioDuKien     ? parseFloat(d.soGioDuKien)     : null,
          hoanTatDuKien:   d.hoanTatDuKien   || null,
          deadline:        d.deadline        || null,
          gioThucTe:       d.gioThucTe       ? parseFloat(d.gioThucTe)       : null,
          soNgayHTThucTe:  d.soNgayHTThucTe  ? parseFloat(d.soNgayHTThucTe)  : null,
          // MO đã có lượt giao việc 3D → ngày hoàn tất và kết quả KPI do SERVER chốt, KHÔNG
          // gửi lên nữa. Nếu vẫn gửi, `ketQua` do calcKetQua tính lại ở trình duyệt sẽ ghi đè
          // phán quyết của server ("Đúng hạn" thành "Hoàn tất sớm") ngay lần lưu kế tiếp.
          // MO cũ chưa có lượt giao việc thì vẫn gửi như trước — không phá tương thích.
          ...(hasDesign3DAssignment
            ? {}
            : {
                ngayHoanThanh3D: d.ngayHoanThanh3D || null,
                ketQua:          d.ketQua          || null,
              }),
        };
        // Khi tạo version: design data phải lưu dưới ID item MỚI của phiên bản mới,
        // không phải capturedActiveItemId (ID item cũ) — nếu không panel mở phiên bản
        // mới sẽ đọc perItem[newItemId] và thấy rỗng.
        let designItemKey = capturedActiveItemId;
        // MO# của bản CŨ — nhãn cho cờ kế thừa bên dưới. Phải lấy TRƯỚC khi designItemKey bị
        // trỏ sang item mới, vì sau đó không còn đường nào tìm lại bản cũ.
        let carriedFromMo: string | null = null;
        if (isCreateVersion && capturedActiveItemId) {
          const origItem = order.items.find(
            (i: { id: string; moNumber?: string | null }) => i.id === capturedActiveItemId,
          );
          carriedFromMo = origItem?.moNumber ?? null;
          const newItem = findVersionedItem(origItem?.moNumber);
          if (newItem) designItemKey = newItem.id;
        }
        // Thợ 3D độc lập theo từng MO/phiên bản (perItem[itemId].tho3d) — không còn dùng chung
        // cấp SO (root), tránh sửa 1 MO đè Thợ 3D của các MO anh em khác.
        // NV 3D thứ 2 trở đi — gửi nguyên MẢNG, kể cả rỗng, để việc XÓA một người có hiệu lực.
        // Giữ đúng thứ tự đang hiện trên màn: chỉ số ở đây chính là `slot - 1` mà server dùng
        // để ghi bản vá về, lệch một ô là gán deadline của người này sang người kia.
        const designersPayload = designSnapshotExtras.map((x) => ({
          tho3d:             x.tho3d      || null,
          phanNhom3D:        x.phanNhom3D || null,
          ngayGiao3D:        x.ngayGiao3D || null,
          gioGiao3D:         x.gioGiao3D  || null,
          gioThucTe:         x.gioThucTe  ? parseFloat(x.gioThucTe) : null,
          kpi3DAssignmentId: x.kpi3DAssignmentId || null,
        }));
        // ⚠️ TẠO PHIÊN BẢN: PHẢI làm sạch payload bằng ĐÚNG hàm mà server dùng khi copy.
        //
        // Server đã bỏ mốc giao / giờ thực tế / id lượt khi copy extraData sang bản mới. Nhưng
        // NGAY SAU ĐÓ client gửi tiếp khối thiết kế dựng từ FORM — mà form đang giữ giá trị của
        // bản _1 — và ghi thẳng vào item MỚI. Không làm sạch ở đây thì lần ghi này ĐÈ LẠI bản đã
        // sạch, khối lại đủ 4 trường, và một lượt thứ hai được tạo: đúng cái KPI cộng đôi mà cả
        // đường sửa này chặn.
        //
        // Dùng LẠI cleanCarriedItemData chứ không tự xoá field ở đây: hai chỗ tự xoá theo danh
        // sách riêng thì sớm muộn lệch nhau, và bên nào sót một field là bên đó mở lại lỗ.
        const rawItemPayload = {
          design: designPayload,
          tho3d: d.tho3d || null,
          designers: designersPayload,
        };
        const itemPayload = isCreateVersion
          ? cleanCarriedItemData(rawItemPayload, carriedFromMo ?? "bản trước")
          : rawItemPayload;
        const extraDataPayload = designItemKey
          ? { perItem: { [designItemKey]: itemPayload } }
          : { design: designPayload, tho3d: d.tho3d || null };
        const designRes = await patchProduction(isCreateVersion ? updatedOrder.id : capturedOrderId, {
          version: updatedOrder.version,
          extraData: extraDataPayload,
          // ⚠️ GỬI `scopedItemId` — THIẾU NÓ LÀ MỘT LỖ THẬT, KHÔNG PHẢI MỘT TỐI ƯU.
          //
          // Route có sẵn HAI nhánh khoá "MO đã chốt", và chỉ một nhánh đo đúng cấp:
          //   có scopedItemId → `scopedItem.itemStatus ?? order.status`  (cấp MO)
          //   không có        → `order.status`                           (cấp SO)
          //
          // Lệnh này trước đây chỉ gửi { version, extraData } nên rơi vào nhánh cấp SO. Hệ quả:
          // SO có 3 MO, MO#1 đã COMPLETED mà `order.status` vẫn IN_PRODUCTION vì hai MO kia chưa
          // xong → sửa được thông số thiết kế của MO#1 ĐÃ CHỐT, trong khi cùng thao tác đó qua
          // route items/[itemId] thì bị chặn.
          //
          // Gửi kèm còn sửa luôn PHẠM VI AUDIT: route dùng scopedItemId để so `perItem[id]` cũ với
          // mới. Không có nó, nhật ký thay đổi của một lần sửa thiết kế per-MO lại đối chiếu ở gốc
          // extraData — tức ghi lại một sự thay đổi không đúng chỗ nó xảy ra.
          ...(designItemKey ? { scopedItemId: designItemKey } : {}),
        });
        // Server báo: đã điền đủ ô giao việc 3D nhưng cấu hình thiếu nên KHÔNG tạo được
        // assignment (nhóm chưa bật / chưa nhập số giờ / không tìm thấy NV…). Lưu vẫn thành
        // công, nhưng phải nói cho người dùng biết — nếu không, việc sẽ không hiện ở màn
        // "Việc thiết kế 3D" mà không rõ vì sao.
        kpi3DWarning = (designRes as { kpi3DWarning?: string })?.kpi3DWarning ?? null;
      }

      // Fetch fresh order data AFTER all item patches complete so onSuccess
      // gets the latest per-MO field values (estimatedDate, requiredDate, saleNote, priorityCode).
      // patchOrder() response has stale item data (item patches run after it).
      const detail = await fetchOrderDetail(isCreateVersion ? updatedOrder.id : capturedOrderId);
      return kpi3DWarning ? { ...detail, kpi3DWarning } : detail;
    },
    onSuccess: (updated, variables) => {
      // Khi promote chạy ngay sau save (Chuyển Xưởng có sửa data): KHÔNG tự dọn/refetch
      // danh sách ở đây. Promote là người làm chủ cache (đã optimistic xóa đơn khỏi PTK
      // + sẽ invalidate 1 lần khi xong). Tránh save "xác nhận lại" đơn vào PTK gây giật.
      if ((variables as { promoteFollows?: boolean }).promoteFollows) return;
      // Confirm server-computed fields (isSuspended) into all list caches.
      // onMutate already set all form fields optimistically — only isSuspended
      // can differ (server auto-suspends on CRITICAL alerts).
      const confirmSave = (cache: unknown) =>
        patchOrderInList<PanelListRow>(cache, updated.id, (row) => ({ ...row, isSuspended: updated.isSuspended }));
      for (const prefix of ORDER_LIST_PREFIXES) {
        queryClient.setQueriesData({ queryKey: prefix, exact: false }, confirmSave);
      }
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      // Ghi DETAIL ĐẦY ĐỦ vừa fetch vào cache (thay vì invalidate → refetch) → mở lại
      // sidebar hiện NGAY dữ liệu mới, đủ field, không cần màn hình loading.
      queryClient.setQueryData(["order-panel", updated.id], updated);

      // Use variables.capturedOrderId (captured before onClose() re-render) — closure orderId is null at this point
      const isNewVersion = updated.id !== variables.capturedOrderId;
      if (isNewVersion) {
        // Row bản mới đã được chèn trong mutationFn (Option A) bằng số THẬT. Ở đây chỉ
        // RECONCILE: thay bằng buildOptimisticSummary từ detail ĐẦY ĐỦ (đã có design/
        // production), gỡ cờ _optimistic → mở khóa visual. Nếu chưa có (vd insert sớm bị
        // refetch ghi đè) thì chèn lại sau row nguồn.
        const newRow = buildOptimisticSummary(updated);
        queryClient.setQueriesData<{ data: OrderSummary[] }>(
          { queryKey: ["orders-snapshot"], exact: false },
          (old) => {
            if (!old?.data) return old;
            const idx = old.data.findIndex((o) => o.id === newRow.id);
            if (idx !== -1) {
              const next = [...old.data];
              next.splice(idx, 1, newRow); // upgrade row tạm → detail đầy đủ, bỏ _optimistic
              return { ...old, data: next };
            }
            const srcIdx = old.data.findIndex((o) => o.id === variables.capturedOrderId);
            const next = [...old.data];
            if (srcIdx !== -1) next.splice(srcIdx + 1, 0, newRow);
            else next.unshift(newRow);
            return { ...old, data: next };
          }
        );
        // Background refetch to reconcile computed fields and sort order.
        onOrderUpdated?.();
      } else {
        // skipSnapshotInvalidation: snapshot already up-to-date via setQueriesData above,
        // no background refetch needed — prevents spinner flicker in tab header.
        onOrderUpdated?.({ skipSnapshotInvalidation: true });
      }
      // toast handled by handleSave
    },
    onError: (err: Error & { tag?: string }, variables, context: any) => {
      // Rollback ALL matching orders queries to pre-mutation state
      if (context?.previousOrdersEntries) {
        for (const [key, data] of context.previousOrdersEntries) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.previousOrderDetail) queryClient.setQueryData(["order-panel", variables.capturedOrderId], context.previousOrderDetail);
      // toast.error handled by handleSave
    },
  });

  // ── MASTER_HUB Save mutation ───────────────────────────────────────────────
  const mhSaveMutation = useMutation({
    onMutate: async (variables: any) => {
      await Promise.all([
        ...ORDER_LIST_PREFIXES.map(p => queryClient.cancelQueries({ queryKey: p })),
        queryClient.cancelQueries({ queryKey: ["order-panel", orderId] }),
      ]);

      // Snapshot ALL matching order list queries for rollback
      const previousOrdersEntries = ORDER_LIST_PREFIXES.flatMap(p =>
        queryClient.getQueriesData({ queryKey: p, exact: false })
      );
      const previousOrderDetail = queryClient.getQueryData(["order-panel", orderId]);

      // TRUE OPTIMISTIC UPDATE: update list immediately with ALL visible MASTER_HUB field values
      // skipItemStatusOptimistic=true khi gọi từ handleComplete → giữ nguyên itemStatus COMPLETED đã set trước đó
      const optimisticMoStatus = variables.skipItemStatusOptimistic ? null : ((productionForm?.moStatus as OrderStatus) ?? null);
      const currentItemForm = activeItemId ? itemForms[activeItemId] : null;
      const toIso = (d: string) => d ? new Date(d + "T00:00:00Z").toISOString() : null;

      const applyOptimistic = (cache: unknown) =>
        patchOrderInList<PanelListRow>(cache, orderId!, (o) => {

            // Order-level patches
            const orderPatch: Record<string, unknown> = {};
            if (form?.linkChat !== undefined) orderPatch.linkChat = form.linkChat || null;
            if (form?.donHang3Sao !== undefined) orderPatch.donHang3Sao = form.donHang3Sao;

            if (activeItemId) {
              const newAllItems = (o.allItems ?? []).map((item: any) => {
                if (item.itemId !== activeItemId) return item;
                const itemPatch: Record<string, unknown> = {};
                if (optimisticMoStatus) itemPatch.itemStatus = optimisticMoStatus;
                if (productionForm?.canhBaoDacBiet !== undefined) {
                  itemPatch.saleNote = productionForm.canhBaoDacBiet || null;
                }
                if (currentItemForm) {
                  const { estimatedDate, requiredDate, weightGram, loaiHang, hinhDangHot, techNote, ...directFields } = currentItemForm;
                  Object.assign(itemPatch, directFields);
                  itemPatch.estimatedDate = toIso(estimatedDate);
                  itemPatch.requiredDate  = toIso(requiredDate);
                  itemPatch.weightGram    = weightGram || null;
                  itemPatch.isPriority    = ["UT1", "UT2"].includes(directFields.priorityCode);
                }
                // Production fields visible in MASTER_HUB table
                if (productionForm) {
                  itemPatch.tl3d       = productionForm.tl3d || null;
                  itemPatch.tlXuong    = productionForm.tlXuong || null;
                  itemPatch.tlThucTeHt = productionForm.tlThucTeHt || null;
                }
                // Optimistic congDoan — compute from current stageForms so table updates immediately
                if (stageForms.length > 0) {
                  const stagesRecord = Object.fromEntries(stageForms.map(s => [s.code, { stageStatus: s.stageStatus }]));
                  const cd = computeFromItemStages(stagesRecord);
                  itemPatch.congDoan       = cd.congDoan;
                  itemPatch.congDoanCode   = cd.congDoanCode;
                  itemPatch.congDoanStatus = cd.congDoanStatus;
                }
                return { ...item, ...itemPatch };
              });
              return { ...o, ...orderPatch, allItems: newAllItems };
            }
            // Order-level edit
            if (optimisticMoStatus) orderPatch.status = optimisticMoStatus;
            if (productionForm && o.productionSummary) {
              orderPatch.productionSummary = {
                ...o.productionSummary,
                tl3d:       productionForm.tl3d || null,
                tlXuong:    productionForm.tlXuong || null,
                tlThucTeHt: productionForm.tlThucTeHt || null,
              };
            }
          return { ...o, ...orderPatch };
        });

      for (const prefix of ORDER_LIST_PREFIXES) {
        queryClient.setQueriesData({ queryKey: prefix, exact: false }, applyOptimistic);
      }

      // Optimistic clear to unblock UI
      setIsProductionDirty(false);
      setIsDirty(false);
      setDirtyItemIds(new Set());
      setSaveError(null);
      setConflictError(false);

      return { previousOrdersEntries, previousOrderDetail };
    },
    mutationFn: async (vars: { dirtySnapshot: string[]; formsSnapshot: Record<string, ItemForm>; capturedOrderId: string; capturedActiveItemId: string | null; capturedOrder: any; capturedProductionForm: any; capturedForm: any; capturedStageForms: any[]; capturedHoldReason: string; capturedProductionMethod: string | null; capturedAdminOverride?: boolean; capturedAdminOverrideReason?: string }): Promise<{ updated: OrderDetail; savedItemStatus: OrderStatus | null }> => {
      // All values from vars snapshot — NOT closure (stale after onClose() re-render)
      const { dirtySnapshot: mhDirtySnapshot, formsSnapshot: mhFormsSnapshot, capturedOrderId, capturedActiveItemId,
        capturedOrder: order, capturedProductionForm: productionForm, capturedForm: form,
        capturedStageForms: stageForms, capturedHoldReason: holdReason, capturedProductionMethod: productionMethod,
        capturedAdminOverride: adminOverride, capturedAdminOverrideReason: overrideReason } = vars;
      if (!productionForm || !order) throw new Error("Không có dữ liệu");

      const newMoStatus = productionForm.moStatus as OrderStatus;

      // Per-MO isolation: when editing a specific MO, nest extraData under perItem[activeItemId]
      // so sibling MOs in the same SO are not affected.
      const moFields: Record<string, unknown> = {
        tl3d:        productionForm.tl3d,
        tlXuong:     productionForm.tlXuong,
        qd24k:       productionForm.qd24k,
        qdPt:        productionForm.qdPt,
        qdBac:       productionForm.qdBac,
        tlThucTeHt:  productionForm.tlThucTeHt,
        danhGiaTl:   productionForm.danhGiaTl,
        pctChenLech: productionForm.pctChenLech,
        thongTinHt:  productionForm.thongTinHt,
        tho3d:       productionForm.tho3d,
        sku:         productionForm.sku,
        chiTietKt:   productionForm.chiTietKt,
        productionMethod: productionMethod ?? null,
        // Ngày HT PER-MO — lưu riêng cho MO này (extraData.perItem[id]), sibling KHÔNG bị đổi.
        completedDate: productionForm.completedDate || null,
      };
      const extraData: Record<string, unknown> = capturedActiveItemId
        ? { perItem: { [capturedActiveItemId]: moFields } }
        : moFields;

      // Khi đang edit 1 MO cụ thể: KHÔNG gửi status và order-level fields vào patchProduction
      // (tránh trigger auto-pause và đổi Order.status ảnh hưởng các MO khác cùng SO).
      // Status được lưu riêng vào item.itemStatus bên dưới.
      // patchProduction first — contains the version check. Item saves run after using
      // the fresh version it returns, so they never conflict with this same save action.
      const updated = await patchProduction(capturedOrderId, {
        version:       order.version,
        // Khi edit 1 MO cụ thể: Ngày HT đã lưu per-MO qua extraData.perItem → KHÔNG gửi
        // top-level (tránh ghi order.completedDate cấp SO, lây sang MO anh em).
        completedDate: capturedActiveItemId ? undefined : (productionForm.completedDate || null),
        saleNote:      productionForm.canhBaoDacBiet,
        internalNote:  productionForm.internalNote,
        // Trạng thái chung của đơn hàng KHÔNG cập nhật khi đang edit một MO cụ thể
        status:       capturedActiveItemId ? undefined : newMoStatus,

        // Shared fields only — customerName/salesName locked (per-MO override qua item endpoint),
        // per-MO fields (estimatedDate, requiredDate, priorityCode) saved via item endpoint
        linkChat:     form?.linkChat,
        donHang3Sao:  form?.donHang3Sao,
        // Phân loại KH / Nguồn: chỉ gửi khi user có quyền (route chặn role khác) và có giá trị
        ...(canEditSoMeta ? {
          phanLoaiKh: form?.phanLoaiKh || undefined,
          nguon:      form?.nguon || undefined,
        } : {}),
        extraData,
        // Lý do tạm ngưng: chỉ gửi khi đang SUSPENDED, ngược lại xóa (empty string)
        holdReason: newMoStatus === "SUSPENDED" ? holdReason : "",
        // Per-MO independence: truyền scopedItemId để route lưu stages vào perItem, không shared columns
        ...(capturedActiveItemId ? { scopedItemId: capturedActiveItemId } : {}),
        // Admin Override — sửa dữ liệu trên MO đã Hoàn tất/Hủy, KHÔNG đổi trạng thái.
        ...(adminOverride ? { adminOverride: true, overrideReason: overrideReason ?? "" } : {}),
        stages: stageForms.map((s) => {
          const recs: StageRecord[] = (s.records ?? []) as StageRecord[];
          const isMulti = s.code === "NGUOI" || s.code === "HOT" || s.code === "DUC" || s.code === "RESIN" || s.code === "TC_NGUOI";
          // Tóm tắt suy từ records (GĐ1) → ghi vào trường scalar cũ để KPI / Đánh giá Khâu /
          // hiển thị tiếp tục hoạt động. Lần "Không đạt" làm chất lượng tóm tắt = "Không đạt"
          // (câu 3 của KH). Giờ KPI tóm tắt = tổng giờ các bản ghi.
          const recCrafters = [...new Set(recs.map((r) => r.crafter).filter(Boolean))];
          const nguoiQuality = recs.some((r) => r.ketQua === "Không đạt") ? "Không đạt"
            : recs.some((r) => r.ketQua === "Đạt") ? "Đạt" : null;
          const nguoiTime = recs.some((r) => r.thoiGianOk === "Không đạt") ? "Không đạt"
            : recs.some((r) => r.thoiGianOk === "Đạt") ? "Đạt" : null;
          const sumGio = recs.reduce((t, r) => t + (parseFloat(r.gioKpi ?? "") || 0), 0);
          const sumStoneQty = recs.reduce((t, r) => t + (r.stoneQty ?? 0), 0);
          // Thời gian khâu (multi) suy từ records: bắt đầu sớm nhất → hoàn thành muộn nhất
          const recStarts = recs.map((r) => r.startAt).filter((x): x is string => !!x).sort();
          const recDones = recs.map((r) => r.doneAt).filter((x): x is string => !!x).sort();
          const failReasons = [...new Set(recs.filter((r) => r.ketQua === "Không đạt").map((r) => r.lyDo).filter(Boolean))].join("; ");
          const ghiChuJoin = [...new Set(recs.map((r) => r.ghiChu).filter(Boolean))].join("; ");
          const firstBac = recs.find((r) => r.bachSP)?.bachSP ?? null;
          return {
            code:         s.code,
            crafter:      isMulti && recCrafters.length ? recCrafters.join(", ") : s.crafter,
            stageStatus:  s.stageStatus,
            startAt:      isMulti ? (recStarts[0] ?? null)                    : (s.startAt ?? null),
            doneAt:       isMulti ? (recDones[recDones.length - 1] ?? null)   : (s.doneAt  ?? null),
            durationNote: s.durationNote ?? null,
            ...(s.stageStatus === "hold" && s.holdReason ? { holdReason: s.holdReason } : {}),
            ...(isMulti ? { records: recs } : {}),
            ...(s.code === "NGUOI" ? {
              coldworkQuality: nguoiQuality,
              coldworkTimeOk:  nguoiTime,
              coldworkReason:  failReasons || null,
              bachSP:          firstBac,
              gioKpi:          sumGio > 0 ? String(sumGio) : null,
              ghiChuNguoi:     ghiChuJoin || null,
            } : {}),
            ...(s.code === "KHOA" ? { coldworkQuality: s.coldworkQuality ?? null, coldworkTimeOk: s.coldworkTimeOk ?? null, coldworkReason: s.coldworkReason ?? null, bachSP: s.bachSP ?? null, gioKpi: s.gioKpi ?? null } : {}),
            ...(s.code === "TC_DAY" ? { workGroup: s.workGroup ?? null } : {}),
            // Đúc: ghi chú chung cả khâu (stage-level). records[] đã được lưu qua isMulti.
            ...(s.code === "DUC" ? { ghiChuDuc: s.ghiChuDuc ?? null } : {}),
            // Hột: Loại hột ở mức khâu (s.stoneType); SL hột tổng + ghi chú suy từ records
            ...(s.code === "HOT" ? { settingNote: ghiChuJoin || null, stoneType: s.stoneType ?? null, stoneQty: sumStoneQty > 0 ? sumStoneQty : null } : {}),
            // Resin: records[] là nguồn chính (mỗi lần đủ trường). Tóm tắt cấp-khâu suy từ
            // lần ĐẠT cuối (hoặc lần cuối) để KPI/hiển thị cũ hoạt động; resinFails suy từ các lần không đạt.
            ...(s.code === "RESIN" ? (() => {
              const passRecs = recs.filter((r) => r.ketQua === "Đạt");
              const finalRec = (passRecs[passRecs.length - 1] ?? recs[recs.length - 1] ?? null) as (StageRecord & Record<string, unknown>) | null;
              return {
                resinQualityOk: finalRec?.ketQua ?? null,
                resinWeightOk:  (finalRec?.resinWeightOk as string | null) ?? null,
                resinDetailQty: (finalRec?.resinDetailQty as number | null) ?? null,
                resinWeightRaw: (finalRec?.resinWeightRaw as number | null) ?? null,
                resinWeightTy:  (finalRec?.resinWeightTy as number | null) ?? null,
                resinReason:    null,
                resinFails:     recs.filter((r) => r.ketQua === "Không đạt").map((r, i) => ({ lan: i + 1, ngay: r.doneAt ?? null, lyDo: r.lyDo ?? null })),
              };
            })() : {}),
          };
        }),
      });

      const itemSaves: Promise<unknown>[] = [];

      // Lưu status vào item.itemStatus khi đang edit MO cụ thể — không ảnh hưởng MO khác.
      // CHỈ gọi khi status THẬT SỰ đổi — trước đây gọi lại vô điều kiện dù không đổi gì,
      // khiến Admin Override báo "Lưu thất bại" giả: patchProduction (có adminOverride) đã
      // lưu field xong, nhưng lệnh set-lại-status-cũ này lại chạm khoá terminal riêng của
      // route items/[itemId] (route đó không biết về adminOverride) → Promise.all reject.
      const activeItemCurrentStatus = capturedActiveItemId
        ? ((order.items.find((i: any) => i.id === capturedActiveItemId) as any)?.itemStatus ?? order.status)
        : null;
      if (capturedActiveItemId && newMoStatus !== activeItemCurrentStatus) {
        itemSaves.push(patchItemStatus(capturedOrderId, capturedActiveItemId, newMoStatus, adminOverride ? { adminOverride: true } : undefined));
      }

      if (mhDirtySnapshot.length > 0) {
        mhDirtySnapshot.forEach((itemId) => {
          const f = mhFormsSnapshot[itemId];
          if (!f) return;
          // `design3DPriorityCode` bị TÁCH RA và KHÔNG gửi ở đường này. Đây là đường lưu của
          // PSX/Sản xuất, nơi ưu tiên thiết kế không sửa được — mà route TỪ CHỐI CẢ REQUEST (403)
          // khi field có mặt và người gửi không phải ADMIN/ORDER. Để nó nằm trong `rest` thì một
          // người PRODUCTION chỉ sửa NVL cũng bị chặn, mất luôn field họ vốn được sửa.
          const { chiTietDaTam, ghiChuSp, weightGram, estimatedDate, requiredDate, loaiHang, hinhDangHot, loaiSp, customerName, salesName, bomStatus, bomDates, bomDienGiai, design3DPriorityCode: _unusedDesignPriority, ...rest } = f;
          void _unusedDesignPriority;
          // Fix B: chuẩn hoá trước khi ghi override — trim, và chỉ set override khi có giá trị
          // THẬT và KHÁC giá trị SO; rỗng/khoảng-trắng/trùng SO → null (không lưu "" để tránh
          // che mất giá trị SO khi hiển thị). MO không override sẽ tiếp tục ăn theo SO.
          const custTrim = (customerName ?? "").trim();
          const soCustTrim = (order.customerName ?? "").trim();
          const customerNameOverride = custTrim && custTrim !== soCustTrim ? custTrim : null;
          const salesTrim = (salesName ?? "").trim();
          const soSalesTrim = (order.salesName ?? "").trim();
          const salesNameOverride = salesTrim && salesTrim !== soSalesTrim ? salesTrim : null;
          const hasBomData = !!(bomStatus || bomDates.CHO_BOM || bomDates.CHO_THONG_TIN || bomDates.DA_GUI || bomDienGiai);
          itemSaves.push(patchItem(capturedOrderId, itemId, {
            ...rest,
            weightGram: weightGram !== "" ? parseFloat(weightGram) : null,
            specifications: {
              chiTietDaTam, ghiChuSp, loaiHang, hinhDangHot, loaiSp,
              customerName: customerNameOverride, salesName: salesNameOverride,
              bom: hasBomData ? { status: bomStatus || null, dates: bomDates, dienGiai: bomDienGiai || "" } : null,
              bomStatus: null, bomSentDate: null, // dọn key phẳng cũ (đã gộp vào bom)
            },
            estimatedDate: estimatedDate ? new Date(estimatedDate + "T00:00:00Z").toISOString() : null,
            requiredDate:  requiredDate  ? new Date(requiredDate  + "T00:00:00Z").toISOString() : null,
            version: updated.version,
          }));
        });
      }

      if (itemSaves.length > 0) await Promise.all(itemSaves);

      // Fetch fresh data after all saves so onSuccess gets updated per-MO fields
      const freshOrder = await fetchOrderDetail(capturedOrderId);

      // Lớp Verify: đối chiếu giá trị GỬI ĐI với giá trị SERVER XÁC NHẬN cho các field quan
      // trọng (KH/Sale/ngày) của từng MO vừa lưu. fetchOrderDetail không throw KHÔNG có nghĩa
      // là dữ liệu đã lưu đúng — nếu server no-op/validation âm thầm bỏ field, freshOrder vẫn
      // trả về 200 nhưng giá trị KHÔNG đổi. Không đối chiếu, toggle "Đã lưu" sẽ báo sai.
      const verifyTargets = new Set<string>([...mhDirtySnapshot]);
      for (const itemId of verifyTargets) {
        const sentForm = mhFormsSnapshot[itemId];
        if (!sentForm) continue;
        const freshItem = freshOrder.items.find((i: any) => i.id === itemId);
        if (!freshItem) continue; // item version hoá (id đổi) — không so sánh được, bỏ qua
        const savedForm = toItemForm(freshItem, freshOrder);
        const mismatches: string[] = [];
        const sentCust = (sentForm.customerName ?? "").trim();
        const sentSales = (sentForm.salesName ?? "").trim();
        if (sentCust && sentCust !== (savedForm.customerName ?? "").trim()) mismatches.push("Khách hàng");
        if (sentSales && sentSales !== (savedForm.salesName ?? "").trim()) mismatches.push("Sales");
        if (sentForm.estimatedDate && sentForm.estimatedDate !== savedForm.estimatedDate) mismatches.push("Ngày DK HT");
        if (sentForm.requiredDate && sentForm.requiredDate !== savedForm.requiredDate) mismatches.push("Ngày yêu cầu");
        // BOM per-MO — đối chiếu status + 3 ngày + diễn giải để bắt "báo lưu nhưng chưa lưu".
        if ((sentForm.bomStatus ?? "") !== (savedForm.bomStatus ?? "")) mismatches.push("Trạng thái BOM");
        for (const bs of BOM_STATUSES) {
          if ((sentForm.bomDates?.[bs] ?? "") !== (savedForm.bomDates?.[bs] ?? "")) { mismatches.push(`BOM · ${BOM_DATE_LABELS[bs]}`); break; }
        }
        if ((sentForm.bomDienGiai ?? "").trim() !== (savedForm.bomDienGiai ?? "").trim()) mismatches.push("BOM · Diễn giải");
        if (mismatches.length > 0) {
          throw new Error(`Lưu không thành công cho MO này — dữ liệu server không khớp: ${mismatches.join(", ")}. Vui lòng thử lại.`);
        }
      }

      // Verify Ngày HT (completedDate) per-MO: đối chiếu giá trị GỬI ĐI với giá trị SERVER
      // xác nhận. Bắt case "báo đã lưu nhưng thực tế rỗng/khác" → báo lỗi + tracking (throw
      // → toast) thay vì âm thầm mất dữ liệu.
      {
        const sentCd = (productionForm.completedDate ?? "").trim();
        const savedProd = toProductionForm(freshOrder, capturedActiveItemId ?? undefined);
        const savedCd = (savedProd.completedDate ?? "").trim();
        if (sentCd !== savedCd) {
          throw new Error(`Lưu Ngày HT không thành công — server ghi nhận "${savedCd || "(trống)"}" khác giá trị đã nhập "${sentCd || "(trống)"}". Vui lòng thử lại.`);
        }
      }

      return { updated: freshOrder, savedItemStatus: capturedActiveItemId ? newMoStatus : null };
    },
    onSuccess: ({ updated, savedItemStatus }, variables) => {
      // Confirm server data into ALL list caches (including snapshots) — no refetch needed.
      patchAllLists((cache) =>
        patchOrderInList(cache, variables.capturedOrderId, (row) =>
          mhSavePatch(row, {
            activeItemId: variables.capturedActiveItemId,
            savedItemStatus,
            skipItemStatus: !!(variables as { skipItemStatusOptimistic?: boolean }).skipItemStatusOptimistic,
            orderStatus: updated.status,
            isSuspended: updated.isSuspended,
          }),
        ),
      );
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      // Ghi detail đầy đủ vào cache → mở lại sidebar hiện ngay, không loading.
      queryClient.setQueryData(["order-panel", updated.id], updated);
      onOrderUpdated?.({ skipSnapshotInvalidation: true });
      // toast handled by handleMhSave
    },
    onError: (err: Error & { tag?: string }, variables, context: any) => {
      // Rollback ALL matching orders queries to pre-mutation state
      if (context?.previousOrdersEntries) {
        for (const [key, data] of context.previousOrdersEntries) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.previousOrderDetail) queryClient.setQueryData(["order-panel", variables.capturedOrderId], context.previousOrderDetail);
      // toast.error handled by handleMhSave
    },
  });

  const {
    promoteMutation, rollbackMutation, itemStatusMutation,
    resolveActionMutation, showroomMutation, isWorking,
  } = useOrderActionMutations({ order, patchAllLists, onOrderUpdated });

  // Active item in the panel (when opened by clicking a specific MO row)
  const activeItem = activeItemId ? order?.items.find((i) => i.id === activeItemId) ?? null : null;

  // Kết quả 3D đọc THẲNG từ bảng design_3d_assignments (qua API đơn hàng), KHÔNG từ bản sao
  // trong extraData. Bản sao cũ gây ba lỗi: ISO đầy đủ nhét vào ô ngày "YYYY-MM-DD" nên hiển
  // thị sai, `ketQua` bị trình duyệt tính lại rồi ghi đè phán quyết server, và trạng thái kiểm
  // nằm ở hai nơi. Đọc từ bảng còn khiến MO hoàn tất từ TRƯỚC khi có tính năng cũng hiện đúng
  // ngay — trạng thái kiểm được SUY RA, không cần script backfill.
  //
  // Tách RIÊNG bản ghi thô ra khỏi view: khối Thiết kế cần cả `pauses` để hiện trạng thái tạm
  // dừng, mà view thì cố ý không mang mảng đó theo. Tìm dòng ở HAI nơi là mở đường cho hai nơi
  // chọn hai lượt khác nhau — cùng một MO mà banner nói của người này, số giờ của người kia.
  const design3DRow = useMemo(() => {
    if (!activeItemId) return null;
    // activeAttempts BẮT BUỘC: API nay trả về cả lượt đã đóng (để dựng lịch sử các lần), nên
    // không lọc ở đây thì `rows.find` có thể trả về một lượt đã bị thay và cả khối Kết quả 3D
    // hiện số của người không còn làm đơn này.
    const rows = activeAttempts(order?.design3DAssignments ?? []);
    // API sắp createdAt TĂNG dần và loại các lượt đã đóng → phần tử đầu của MO là NGƯỜI THỨ
    // NHẤT, ứng với khối trường chính phía trên. Các lượt còn lại của cùng MO là NV 3D bổ sung,
    // mỗi khối tự tra bản ghi của mình theo kpi3DAssignmentId.
    return rows.find((r) => r.orderItemId === activeItemId) ?? null;
  }, [order?.design3DAssignments, activeItemId]);

  // Các lượt ĐÃ ĐÓNG của MO này, mỗi lượt một khối chỉ đọc. Luật "lượt nào xứng đáng một khối"
  // nằm ở kpi-3d/designer-blocks.ts — không viết `filter` tại đây, vì nó phải khớp với cách đánh
  // số khối và có test riêng.
  const closedDesignerBlocks = useMemo(() => {
    if (!activeItemId) return [];
    const rows = (order?.design3DAssignments ?? []).filter((r) => r.orderItemId === activeItemId);
    return closedAttemptBlocks(rows);
  }, [order?.design3DAssignments, activeItemId]);

  /**
   * Giờ tăng ca ĐÃ DUYỆT của MO này — khối RIÊNG, không bao giờ cộng vào khối nào.
   *
   * Bản ghi tăng ca gắn với LƯỢT GIAO VIỆC, nên nó tự biết thuộc MO nào và của ai. Gom từ mọi
   * lượt của MO — kể cả lượt đã đóng: người làm thêm cho một lượt sau đó bị giao lại thì công đó
   * vẫn là của họ.
   *
   * ⚠️ CHỈ ADMIN/ĐẶT ĐƠN THẤY (VIEW_OVERTIME_RECORD): đây là dữ liệu lương. Truy vấn đã lọc sẵn
   * `APPROVED`, nên ở đây chỉ còn lọc theo vai.
   */
  const overtimeBlocks = useMemo(() => {
    if (!activeItemId || !canViewOvertimeRecord) return [];
    const rows = (order?.design3DAssignments ?? [])
      .filter((r) => r.orderItemId === activeItemId)
      .flatMap((r) =>
        (r.overtimeRequests ?? []).map((ot) => ({
          id: ot.id,
          orderItemId: r.orderItemId,
          designer3DId: ot.designer3D?.id ?? r.designer3DId,
          designerName: ot.designer3D?.name ?? r.designer3D?.name ?? null,
          startAt: ot.startAt,
          endAt: ot.endAt,
          minutes: ot.minutes,
          reason: ot.reason,
          approvedByName: ot.approvedBy?.name ?? null,
        })),
      );
    return overtimeBlocksForItem(rows, activeItemId);
  }, [order?.design3DAssignments, activeItemId, canViewOvertimeRecord]);

  const design3DView = useMemo(() => {
    // Truyền lịch để lượt hoàn tất TRƯỚC khi có cột actualMinutes vẫn suy ra được giờ thực tế
    // — nếu không, đơn đã duyệt xong vẫn hiện "—" mãi. Xem toDesign3DAssignmentView.
    //
    // ⚠️ `pauses` KHÔNG ĐƯỢC BỎ. Tham số này mặc định là [] nên quên nó thì hàm vẫn chạy, vẫn
    // trả về một con số trông hợp lý — chỉ là số đó KHÔNG trừ thời gian bị gác, còn màn Việc
    // thiết kế 3D thì có trừ. Đó là cách lỗi này đã sống sót từ đầu.
    return toDesign3DAssignmentView(
      design3DRow,
      toVnYmd,
      kpi3DWorkingCalendar,
      toPauseSpans(design3DRow?.pauses),
    );
  }, [design3DRow, kpi3DWorkingCalendar]);
  // Lock action buttons when the ACTIVE ITEM itself is already COMPLETED/CANCELLED
  // Bản PSX anh em của MO ĐANG XEM. Server tính (business/orders/psx-sibling.ts, dùng chung với
  // bảng Danh sách đơn hàng) — panel chỉ đọc, không tự suy luận lại từ mã MO.
  const psxSiblingOfActiveItem = activeItemId
    ? ((activeItem as { psxSibling?: { orderNumber: string; status: string } | null } | null)?.psxSibling ?? null)
    : null;
  const isActiveItemTerminal = activeItem
    ? ((activeItem as any).itemStatus === "COMPLETED" || (activeItem as any).itemStatus === "CANCELLED")
    : isTerminal;
  // 1 SO có thể đã Hoàn tất/Đã hủy nhưng MO đang xem (VD: MO mới thêm để SX tiếp) vẫn
  // Đang SX — không nên khoá cả panel theo SO. Đang xem 1 MO cụ thể (activeItemId) → khoá
  // theo TRẠNG THÁI CỦA CHÍNH MO đó; đang xem SO tổng (không chọn MO nào) → khoá theo SO.
  const effectiveTerminal = activeItemId ? isActiveItemTerminal : isTerminal;
  // Trạng thái dùng để hiển thị banner/nội dung — ưu tiên itemStatus của MO đang xem,
  // rơi về order.status khi MO chưa có itemStatus riêng (dữ liệu cũ ăn theo SO).
  const effectiveTerminalStatus: string | undefined = activeItemId
    ? (((activeItem as any)?.itemStatus as string | undefined) ?? order?.status)
    : order?.status;
  // Zone lock: khi MO ĐANG XEM đã vào xưởng (IN_PRODUCTION + MASTER_HUB), chỉ ADMIN,
  // PRODUCTION và ORDER được phép chỉnh sửa. Dùng zone/status của CHÍNH MO đang mở
  // (activeItem), không phải order.zone/status cấp SO — 1 SO có thể còn "hóa thạch"
  // MASTER_HUB/IN_PRODUCTION từ các MO KHÁC đã hủy trong khi MO đang xem là MO PTK
  // độc lập, hoàn toàn mới (VD tạo lại sau khi hủy bản cũ).
  const effectiveZone = ((activeItem as any)?.zone ?? order?.zone) as "PRE_PRODUCTION" | "MASTER_HUB" | undefined;
  const isZoneLocked = effectiveZone === "MASTER_HUB"
    && effectiveTerminalStatus === "IN_PRODUCTION"
    && currentUserRole !== "ADMIN"
    && currentUserRole !== "PRODUCTION"
    && currentUserRole !== "ORDER";
  // Admin Override: ADMIN bấm "Sửa dữ liệu (Admin)" trên MO đã Hoàn tất/Hủy → mở khoá
  // panel, KHÔNG đổi effectiveTerminal (banner/trạng thái hiển thị vẫn đúng thực tế).
  const isAdminOverrideAllowed = currentUserRole === "ADMIN" && effectiveTerminal;
  // 🔴 R&D CHỈ-ĐỌC TOÀN PANEL. Một dòng ở đây phủ 116 chỗ đọc `isReadOnly` — và quan trọng hơn,
  // phủ CẢ HAI khối footer (chúng đều gate trên `!isReadOnly`), tức các nút Chuyển xưởng /
  // Hủy MO / Thiết kế lại biến mất luôn. Những nút đó KHÔNG tự kiểm `isReadOnly` mà chỉ kiểm
  // `isWorking`; nếu để lọt một trong hai footer thì chúng vẫn bấm được.
  //
  // ⚠️ Ô "Mã số mẫu" là ngoại lệ DUY NHẤT, và nó KHÔNG đi qua cờ này: nó hỏi `canEditMaSoMau`
  // riêng. Cho R&D thấy bất kỳ ô nào khác ở dạng sửa được là dựng lại đúng regression đã ghi
  // trong item-writable-fields.ts — API trả 200, toast "Đã lưu", F5 mất sạch.
  const isRnd = currentUserRole === "RND";
  const isReadOnly = readOnly || isRnd || (effectiveTerminal && !(adminOverrideActive && isAdminOverrideAllowed)) || isZoneLocked;
  const activeItemSuspended: boolean = (() => {
    if (!activeItem) return (order?.status === "SUSPENDED" || order?.isSuspended) ?? false;
    const iStatus = (activeItem as any).itemStatus;
    const itemZone = (activeItem as any).zone as string;
    const isTerminalItem = iStatus === "COMPLETED" || iStatus === "CANCELLED";
    if (itemZone === "PRE_PRODUCTION") {
      // PTK items: suspension tracked only via itemStatus or order-level status.
      // Do NOT check order.isSuspended — it may have been set by a sibling PSX item's suspension.
      return iStatus === "SUSPENDED" || (!iStatus && order?.status === "SUSPENDED");
    }
    return iStatus === "SUSPENDED" ||
      (!iStatus && order?.status === "SUSPENDED") ||
      (!isTerminalItem && (order?.isSuspended ?? false));
  })();

  // ── Khoá Khách hàng / Sales ────────────────────────────────────────────────
  //
  // BA CỜ, KHÔNG PHẢI MỘT, vì chúng trả lời những câu khác nhau:
  //
  //   · `isMoInProductionStage` — MO này đã vào sản xuất chưa? Dùng cho BANNER. Là sự thật về MO,
  //     không phụ thuộc ô nào đang trống. Gộp vào cờ khoá thì banner biến mất chỉ vì tên khách
  //     còn trống — đúng lúc người dùng cần biết nhất.
  //   · `customerLocked` / `salesLocked` — ô CỤ THỂ này có sửa được không? Khoá chỉ khi ô ĐÃ CÓ
  //     giá trị: mục đích của khoá là "đừng đổi cái đã in ra phiếu", không phải "đừng điền chỗ
  //     còn trống". Đơn nhập từ script thường trống tên khách, và trước đây tới lúc phát hiện thì
  //     MO đã xuống sản xuất — ô mờ vĩnh viễn, không còn đường nào nhập vào.
  //
  // Cả ba đo TRẠNG THÁI HIỆU DỤNG CỦA MO đang xem (`itemStatus ?? order.status`), KHÔNG phải
  // `order.status` — cùng khuôn mẫu với `activeItemSuspended` ngay phía trên.
  const effectiveItemStatusForLock = (activeItem as { itemStatus?: string | null } | null)?.itemStatus ?? null;
  const isMoInProductionStage = order
    ? isMoInProduction({ itemStatus: effectiveItemStatusForLock, orderStatus: order.status })
    : false;
  const customerLocked = order
    ? isCriticalFieldLocked({
        itemStatus: effectiveItemStatusForLock,
        orderStatus: order.status,
        // Đo giá trị ĐÃ LƯU (activeItem/order), KHÔNG phải giá trị trên form: đo form thì người
        // dùng vừa gõ một chữ là ô tự khoá lại ngay giữa lúc đang gõ.
        currentValue: (activeItem as { customerName?: string | null } | null)?.customerName ?? order.customerName,
      })
    : false;
  const salesLocked = order
    ? isCriticalFieldLocked({
        itemStatus: effectiveItemStatusForLock,
        orderStatus: order.status,
        currentValue: (activeItem as { salesName?: string | null } | null)?.salesName ?? order.salesName,
      })
    : false;
  const isFormDirty = isDirty || dirtyItemIds.size > 0 || isDesignDirty;
  const isMhDirty = isProductionDirty || isDirty || dirtyItemIds.size > 0;

  function updateForm<K extends keyof PanelForm>(key: K, value: PanelForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setIsDirty(true);
    setSaveError(null);
  }

  // MO mà productionForm đang phản ánh: MO đang xem, hoặc item đầu khi xem cấp SO.
  const productionNvlOwnerId = activeItemId ?? order?.items?.[0]?.id;

  // NVL hiệu lực để tính quy đổi — ưu tiên giá trị ĐANG SỬA trên form, sau đó mới tới giá trị
  // đã lưu trong DB. Trước đây chỉ đọc activeItem.nvl (DB) nên đổi NVL xong quy đổi không đổi.
  function currentNvl(): string {
    const fromForm = productionNvlOwnerId ? itemForms[productionNvlOwnerId]?.nvl : undefined;
    return fromForm ?? activeItem?.nvl ?? order?.items[0]?.nvl ?? "";
  }

  // Tính lại TOÀN BỘ field auto-calc theo NVL truyền vào (gồm cả qdBac — trước đây bị bỏ sót).
  function recalcProductionForNvl(nvl: string) {
    setProductionForm((prev) => {
      if (!prev) return prev;
      const auto = calcAutoProduction(
        nvl,
        parseFloat(prev.tl3d) || 0,
        parseFloat(prev.tlThucTeHt) || 0,
        parseFloat(prev.tlXuong) || 0
      );
      return {
        ...prev,
        qd24k: auto.qd24k, qdPt: auto.qdPt, qdBac: auto.qdBac,
        pctChenLech: auto.pctChenLech, danhGiaTl: auto.danhGiaTl,
      };
    });
    setIsProductionDirty(true);
  }

  function updateItemForm(itemId: string, patch: Partial<ItemForm>) {
    setItemForms((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
    setDirtyItemIds((prev) => new Set(prev).add(itemId));
    setSaveError(null);
    // Đổi NVL của đúng MO mà productionForm đang phản ánh → tính lại quy đổi NGAY.
    // Trước đây không hề tính lại: QĐ giữ số cũ theo NVL cũ cho tới khi user tình cờ sửa TL.
    if (patch.nvl !== undefined && itemId === productionNvlOwnerId) {
      recalcProductionForNvl(patch.nvl);
    }
  }

  // V2 ref: updateProductionField + recalcAutoFields — tự động tính QĐ/Đánh giá khi đổi TL
  function updateProductionForm(key: keyof ProductionForm, value: string | boolean) {
    const nvl = currentNvl();
    setProductionForm((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, [key]: value };
      // Tính lại QĐ 24K / QĐ PT / QĐ Bạc khi đổi TL (qdBac trước đây bị bỏ sót → hàng bạc
      // sửa TL 3D thì QĐ Bạc giữ số cũ và bị lưu sai).
      if (key === "tl3d" || key === "tlXuong" || key === "tlThucTeHt") {
        const auto = calcAutoProduction(
          nvl,
          parseFloat(updated.tl3d) || 0,
          parseFloat(updated.tlThucTeHt) || 0,
          parseFloat(updated.tlXuong) || 0
        );
        updated.qd24k = auto.qd24k;
        updated.qdPt  = auto.qdPt;
        updated.qdBac = auto.qdBac;
        updated.pctChenLech = auto.pctChenLech;
        updated.danhGiaTl   = auto.danhGiaTl;
      }
      return updated;
    });
    setIsProductionDirty(true);
    setSaveError(null);
  }

  function updateDesignForm(key: keyof DesignForm, value: string) {
    setDesignForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "gioThucTe")
        next.soNgayHTThucTe = calcSoNgayHT(next.gioThucTe);
      if (key === "ngayHoanThanh3D" || key === "deadline" || key === "gioThucTe" || key === "soGioDuKien")
        next.ketQua = calcKetQua(next.ngayHoanThanh3D, next.deadline, next.gioThucTe, next.soGioDuKien);
      return next;
    });
    setIsDesignDirty(true);
    setSaveError(null);
  }

  function updateExtraDesigner(index: number, key: keyof ExtraDesigner3D, value: string) {
    setExtraDesigners((prev) => prev.map((x, i) => (i === index ? { ...x, [key]: value } : x)));
    setIsDesignDirty(true);
    setSaveError(null);
  }

  function addExtraDesigner() {
    setExtraDesigners((prev) => [...prev, { ...EXTRA_DESIGNER_INIT }]);
    setIsDesignDirty(true);
    setSaveError(null);
  }

  function removeExtraDesigner(index: number) {
    setExtraDesigners((prev) => prev.filter((_, i) => i !== index));
    // Xoá một người làm mọi vị trí phía sau dồn lên một bậc, nên trạng thái thu gọn cũ sẽ
    // rơi vào nhầm khối. Mở lại tất cả — rẻ và không bao giờ sai, còn xoá người thì hiếm.
    setCollapsedDesigners(new Set());
    setIsDesignDirty(true);
    setSaveError(null);
  }

  function toggleDesignerCollapsed(key: string) {
    setCollapsedDesigners((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function updateStageForm(code: string, patch: Partial<StageEntry>) {
    setStageForms((prev) =>
      prev.map((s) => (s.code === code ? { ...s, ...patch } : s))
    );
    setIsProductionDirty(true);
    setSaveError(null);
  }

  // ── Bản ghi nhiều thợ / nhiều lần cho khâu Nguội & Hột ───────────────────────
  function addStageRecord(code: string) {
    setStageForms((prev) =>
      prev.map((s) => {
        if (s.code !== code) return s;
        const recs = s.records ?? [];
        const nextLan = recs.length ? Math.max(...recs.map((r) => r.lan ?? 1)) : 1;
        return { ...s, records: [...recs, { crafter: "", phan: null, lan: recs.length === 0 ? 1 : nextLan, ketQua: null, lyDo: null, gioKpi: null, bachSP: null, ghiChu: null, startAt: null, doneAt: null, ...(s.code === "HOT" && s.stoneType ? { stoneType: s.stoneType } : {}) }] };
      })
    );
    setIsProductionDirty(true);
    setSaveError(null);
  }
  function updateStageRecord(code: string, idx: number, patch: Partial<StageRecord>) {
    setStageForms((prev) =>
      prev.map((s) => {
        if (s.code !== code) return s;
        const recs = [...(s.records ?? [])];
        if (!recs[idx]) return s;
        recs[idx] = { ...recs[idx], ...patch };
        return { ...s, records: recs };
      })
    );
    setIsProductionDirty(true);
    setSaveError(null);
  }
  function removeStageRecord(code: string, idx: number) {
    setStageForms((prev) =>
      prev.map((s) => (s.code === code ? { ...s, records: (s.records ?? []).filter((_, i) => i !== idx) } : s))
    );
    setIsProductionDirty(true);
    setSaveError(null);
  }

  function toggleTimeRow(code: string) {
    setExpandedTimeRows(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  const HANDCRAFT_STAGES = ["TC_DAY", "TC_NGUOI", "KHOA", "HOT"];
  const MACHINE_STAGES   = ["MOC"];

  function applyPreset(method: "HANDCRAFT" | "MACHINE" | "MIXED") {
    const toCancel   = method === "HANDCRAFT" ? MACHINE_STAGES
                     : method === "MACHINE"   ? HANDCRAFT_STAGES
                     : [];
    const toRestore  = method === "HANDCRAFT" ? HANDCRAFT_STAGES
                     : method === "MACHINE"   ? MACHINE_STAGES
                     : [...HANDCRAFT_STAGES, ...MACHINE_STAGES];
    setProductionMethod(method);
    setStageForms(prev => prev.map(s => {
      if (toCancel.includes(s.code) && (s.stageStatus === "pending" || s.stageStatus === "doing" || s.stageStatus === "hold"))
        return { ...s, stageStatus: "cancelled" as const, holdReason: undefined };
      if (toRestore.includes(s.code) && s.stageStatus === "cancelled")
        return { ...s, stageStatus: "pending" as const };
      return s;
    }));
    setIsProductionDirty(true);
    setSaveError(null);
  }

  function handleSave() {
    if (!form || !order) return;
    const orderNumber = order.orderNumber;
    const displayNumber = activeItem?.moNumber ?? orderNumber;
    const savedOrderId = orderId!;
    const snapshot = {
      dirtySnapshot: Array.from(dirtyItemIds),
      formsSnapshot: { ...itemForms },
      ...(isDesignDirty ? { designSnapshot: { ...designForm }, designSnapshotExtras: extraDesigners.map((x) => ({ ...x })) } : {}),
      capturedOrderId: orderId!,
      capturedActiveItemId: activeItemId ?? null,
      capturedOrder: order,
      capturedForm: { ...form },
      capturedCreateVersionToggle: createVersionToggle,
    };
    onSavePending?.(activeItemId ?? savedOrderId); // block chỉ MO đang save, không block cả order
    onClose();
    saveMutation.mutateAsync(snapshot)
      .then((res) => {
        onSaveDone?.();
        toast.success(`Đã lưu đơn ${displayNumber}`);
        notifyKpi3DWarning(res);
      })
      .catch((err: Error & { tag?: string }) => {
        onSaveDone?.();
        const msg = err.tag === "CONFLICT"
          ? "Đơn đang được xử lý, vui lòng đợi 1-2 giây và thử lại"
          : err.message ?? "Vui lòng thử lại";
        toast.error(`Lưu thất bại — ${displayNumber}: ${msg}`, {
          duration: 8000,
          action: { label: "Mở lại", onClick: () => onReopenOrder?.(savedOrderId) },
        });
      });
  }

  function handleMhSave() {
    if (!productionForm || !order) return;
    // Admin Override: bắt buộc nhập lý do trước khi lưu — hỏi qua prompt riêng, không lưu
    // ngay khi lý do còn trống (chỉ áp dụng khi đang ở chế độ override).
    if (adminOverrideActive && !adminOverrideReason.trim()) {
      setShowAdminOverrideReasonPrompt(true);
      return;
    }
    const orderNumber = order.orderNumber;
    const displayNumber = activeItem?.moNumber ?? orderNumber;
    const savedOrderId = orderId!;
    const snapshot = {
      dirtySnapshot: Array.from(dirtyItemIds),
      formsSnapshot: { ...itemForms },
      capturedOrderId: orderId!,
      capturedActiveItemId: activeItemId ?? null,
      capturedOrder: order,
      capturedProductionForm: { ...productionForm },
      capturedForm: form ? { ...form } : null,
      capturedStageForms: stageForms.map(s => ({ ...s })),
      capturedHoldReason: holdReason,
      capturedProductionMethod: productionMethod ?? null,
      capturedAdminOverride: adminOverrideActive,
      capturedAdminOverrideReason: adminOverrideReason,
    };
    onSavePending?.(activeItemId ?? savedOrderId); // block chỉ MO đang save, không block cả order
    onClose();
    setAdminOverrideActive(false);
    setAdminOverrideReason("");
    mhSaveMutation.mutateAsync(snapshot)
      .then(() => {
        onSaveDone?.();
        toast.success(`Đã lưu đơn ${displayNumber}`);
      })
      .catch((err: Error & { tag?: string }) => {
        onSaveDone?.();
        const msg = err.tag === "CONFLICT"
          ? "Đơn đang được xử lý, vui lòng đợi 1-2 giây và thử lại"
          : err.message ?? "Vui lòng thử lại";
        toast.error(`Lưu thất bại — ${displayNumber}: ${msg}`, {
          duration: 8000,
          action: { label: "Mở lại", onClick: () => onReopenOrder?.(savedOrderId) },
        });
      });
  }

  // Zone-transition helper: removes order from cache immediately, fires API in background,
  // then shows a rich success toast (with description + "Xem →" fallback button) and auto-navigates.
  function fireNavAction({
    promise, success, successDetail, navLabel, duration, destTab, destOrderId, errorPrefix,
    autoNavigate = true,
    removeFromSource = false,
    rollbackSnapshot = false,
    afterSuccess,
  }: {
    promise: Promise<unknown>;
    success: string;
    successDetail?: string;
    navLabel?: string;
    duration?: number;
    destTab: string;
    destOrderId: string;
    errorPrefix: string;
    // false = ở lại tab hiện tại, chỉ hiện toast với nút điều hướng thủ công
    autoNavigate?: boolean;
    // true = xóa đơn khỏi source snapshot ngay lập tức (chỉ dùng khi toàn bộ đơn rời zone)
    removeFromSource?: boolean;
    // true = rollback snapshot on failure (dùng khi đã optimistic update item-level)
    rollbackSnapshot?: boolean;
    // inject đơn vào destination cache sau API thành công
    afterSuccess?: () => void;
  }) {
    // Xóa đơn khỏi paginated cache ngay lập tức — không cần đợi API
    queryClient.setQueriesData({ queryKey: ["orders"], exact: false }, (cache) =>
      removeOrderFromList(cache, destOrderId));
    // Xóa khỏi snapshot caches ngay lập tức (chỉ khi full-order rời zone hoàn toàn)
    if (removeFromSource) {
      queryClient.setQueriesData({ queryKey: ["orders-snapshot"], exact: false }, (cache) =>
        removeOrderFromList(cache, destOrderId));
    }
    promise
      .then(() => {
        toast.success(success, {
          description: successDetail,
          duration: duration ?? 8000,
          action: navLabel && onNavigateAfterAction
            ? {
                label: navLabel,
                onClick: () => onNavigateAfterAction({ tab: destTab, orderId: destOrderId }),
              }
            : undefined,
        });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        // History destinations: invalidate snapshot directly (signal alone is unreliable —
        // setQueryData with same value skips useEffect) + update badge.
        if (destTab === "completed" || destTab === "cancelled") {
          queryClient.invalidateQueries({ queryKey: ["orders-history-snapshot"], exact: false });
          queryClient.setQueryData(["history-tab-has-new"], destTab);
        }
        queryClient.invalidateQueries({ queryKey: ["order-panel", destOrderId] });
        afterSuccess?.();
        if (autoNavigate) {
          onNavigateAfterAction?.({ tab: destTab, orderId: destOrderId });
        }
      })
      .catch((e: Error) => {
        const isConflict = e.message?.toLowerCase().includes("conflict") || e.message?.includes("409") || e.message?.includes("modified by another");
        if (isConflict) {
          toast.error("Đơn hàng vừa được cập nhật bởi người khác.", {
            description: "Dữ liệu đã được tải lại — vui lòng kiểm tra và thử lại.",
            duration: 8000,
          });
          // Tải lại panel với data mới nhất để user thấy phiên bản hiện tại
          queryClient.invalidateQueries({ queryKey: ["order-panel", destOrderId] });
        } else {
          toast.error(`${errorPrefix}: ${e.message ?? "Vui lòng thử lại"}`);
        }
        // Hoàn nguyên: refetch để restore đơn về đúng tab nguồn
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        if (removeFromSource || rollbackSnapshot) {
          queryClient.invalidateQueries({ queryKey: ["orders-snapshot"] });
            }
      });
  }

  // Dựng MỘT dòng OrderSummary HỢP LỆ để tiêm vào snapshot cache khi promote/rollback/
  // complete/cancel. QUAN TRỌNG: `order` ở panel là OrderDetail (có `items`, KHÔNG có
  // `allItems`). Nếu spread thô `...order` thì `allItems` = undefined → một thao tác cache/
  // render sau đó gọi `.map` trên undefined → crash → "Không thể tải trang" (đặc biệt khi
  // chuyển nhiều đơn liên tục). buildOptimisticSummary luôn trả về allItems là mảng.
  const buildNavInjectedRow = (
    srcOrder: any,
    itemFn: (item: any) => any,
    orderOverrides?: Record<string, unknown>,
  ): OrderSummary => {
    const base = buildOptimisticSummary(srcOrder);
    const allItems = (base.allItems ?? []).map(itemFn);
    return { ...base, ...(orderOverrides ?? {}), allItems, firstItem: allItems[0] ?? base.firstItem };
  };

  async function handlePromote() {
    if (!order || !form) return;
    // Đang có 1 lượt lưu/tạo phiên bản chạy ngầm → khóa promote, yêu cầu đợi.
    if (isSavePending) { toast.info("Đang lưu dữ liệu, vui lòng đợi…"); return; }
    // "Tạo phiên bản" và "Chuyển Xưởng" mâu thuẫn ý định — không thể vừa fork bản mới
    // ở lại PTK vừa đẩy bản này sang PSX. Chặn promote khi toggle đang bật.
    if (createVersionToggle) {
      toast.info("Đang bật chế độ tạo phiên bản — tắt toggle trước khi chuyển xưởng.");
      return;
    }
    // ── Capture mọi giá trị TRƯỚC onClose()/await — sau onClose() orderId=null,
    //    closure các state khác cũng stale. Đây là điều kiện để chain an toàn.
    const { orderNumber, id: oid } = order;
    const capturedOrderId = orderId!;
    const capturedActiveItemId = activeItemId ?? null;
    const displayNumber = activeItem?.moNumber ?? orderNumber;
    const psx_key = buildSnapshotQuery("master-hub");
    const ptk_key = buildSnapshotQuery("pre-production");
    const productionCode = mhProductionCode.trim() || order.orderNumber;
    const comment = promoteComment || undefined;
    const forced = promoteIsForced;
    const dirty = isFormDirty;
    const promotedOrderBase = order;

    // Snapshot để auto-save (nếu dirty). createVersion ÉP false: "chuyển xưởng"
    // không phải "tạo phiên bản" → đơn giữ nguyên id/item id, không cần remap.
    const saveSnapshot = {
      dirtySnapshot: Array.from(dirtyItemIds),
      formsSnapshot: { ...itemForms },
      ...(isDesignDirty ? { designSnapshot: { ...designForm }, designSnapshotExtras: extraDesigners.map((x) => ({ ...x })) } : {}),
      capturedOrderId,
      capturedActiveItemId,
      capturedOrder: order,
      capturedForm: { ...form },
      capturedCreateVersionToggle: false,
      promoteFollows: true,
    };

    onClose();

    // Optimistic NGAY khi click (cả 2 path: chỉ chuyển / vừa sửa vừa chuyển) — chỉ tác động
    // snapshot PTK để đơn/MO biến mất tức thì, nhất quán, không chờ refetch.
    //   • per-MO: bỏ item được chuyển khỏi allItems; nếu không còn item PTK nào → bỏ cả đơn.
    //   • full-order: bỏ cả đơn khỏi PTK.
    // Promote thất bại → fireNavAction invalidate snapshot khôi phục lại đúng trạng thái.
    queryClient.setQueryData(["orders-snapshot", ptk_key], (cache) =>
      capturedActiveItemId
        ? dropMoFromZoneSnapshot(cache, oid, capturedActiveItemId, "PRE_PRODUCTION")
        : removeOrderFromList(cache, oid));

    // Promote thực sự — gọi với version đã chốt (mới sau save, hoặc hiện tại nếu không dirty)
    const runPromote = (version: number) => {
      const promotedOrder = buildNavInjectedRow(
        promotedOrderBase,
        (item: any) => (!capturedActiveItemId || item.itemId === capturedActiveItemId ? { ...item, zone: "MASTER_HUB" } : item),
        // Chuyển cả đơn → set sẵn zone/status để dòng hiện đúng "Đang sản xuất" tức thì.
        capturedActiveItemId ? undefined : { zone: "MASTER_HUB", status: "IN_PRODUCTION" },
      );
      // Tiêm dòng vào PSX NGAY (optimistic) — không chờ API (~2-3s). API thành công →
      // refetch reconcile; thất bại → fireNavAction invalidate snapshot gỡ dòng tạm.
      queryClient.setQueryData(["orders-snapshot", psx_key], (cache) =>
        insertOrderOnce(cache, promotedOrder));
      const promoteBody = {
        version,
        productionCode,
        comment,
        ...(capturedActiveItemId ? { activeItemId: capturedActiveItemId } : {}),
        ...(forced ? { force: true } : {}),
        capturedOrderId,
      };
      fireNavAction({
        // TRÙNG MO Ở PSX LÀ CÂU HỎI, KHÔNG PHẢI LỖI.
        //
        // Server trả 428 kèm code PRECONDITION_REQUIRED khi cùng một MO đã có phiên bản khác CÒN
        // HIỆU LỰC bên PSX. Trước đây đó là 400 dứt khoát và người dùng bị khoá; nghiệp vụ thì cho
        // phép, chỉ cần biết mà quyết. Nên ở đây: hỏi, rồi gửi lại kèm cờ đồng ý.
        //
        // Bắt theo `code`, KHÔNG theo nội dung câu thông báo — đọc câu chữ là hỏng ngay lần ai đó
        // sửa lại lời văn.
        promise: (async () => {
          try {
            return await promoteMutation.mutateAsync(promoteBody);
          } catch (err: unknown) {
            const e = err as { code?: string; message?: string };
            if (e?.code !== "PRECONDITION_REQUIRED") throw err;
            if (!window.confirm(`${e.message ?? "Có phiên bản khác của MO này ở PSX."}

Vẫn chuyển xưởng?`)) {
              throw err;
            }
            return await promoteMutation.mutateAsync({ ...promoteBody, allowDuplicateMo: true });
          }
        })(),
        success: `${displayNumber} → Phòng Sản Xuất`,
        successDetail: "Chờ sản xuất",
        navLabel: "Xem tại PSX →",
        destTab: "master-hub",
        destOrderId: oid,
        errorPrefix: "Chuyển xưởng thất bại",
        autoNavigate: false,
        removeFromSource: !capturedActiveItemId,
        rollbackSnapshot: !!capturedActiveItemId,
        afterSuccess: () => {
          queryClient.setQueryData(["orders-snapshot", psx_key], (cache) =>
            insertOrderOnce(cache, promotedOrder));
        },
      });
    };

    if (dirty) {
      // Auto-save trước → lấy version mới từ kết quả save → rồi promote.
      // saveMutation tự lo optimistic update + rollback của riêng nó nếu fail.
      try {
        const updated = await saveMutation.mutateAsync(saveSnapshot);
        notifyKpi3DWarning(updated);
        runPromote(updated.version);
      } catch (err: any) {
        // Save fail → promote không chạy → khôi phục đơn về PTK (đã optimistic xóa trước await)
        queryClient.invalidateQueries({ queryKey: ["orders-snapshot"], exact: false });
        toast.error(`Lưu thất bại trước khi chuyển — ${displayNumber}: ${err?.message ?? "Vui lòng thử lại"}`, {
          duration: 8000,
          action: { label: "Mở lại", onClick: () => onReopenOrder?.(capturedOrderId) },
        });
      }
      return;
    }
    runPromote(order.version);
  }

  function handleRollback() {
    if (!order || !rollbackReason.trim()) return;
    if (isSavePending) { toast.info("Đang đồng bộ, vui lòng chờ…"); return; }
    const { orderNumber, version, id: oid } = order;
    const displayNumber = activeItem?.moNumber ?? orderNumber;
    const reason = rollbackReason;
    // Construct injected order trước async — closure capture an toàn dù component unmount
    const ptk_key = buildSnapshotQuery("pre-production");
    const rollbackOrder = buildNavInjectedRow(
      order,
      (item: any) => (!activeItemId || item.itemId === activeItemId ? { ...item, zone: "PRE_PRODUCTION" } : item),
    );
    setShowRollbackConfirm(false);
    setRollbackReason("");
    onClose();
    // Optimistic per-MO: mark item zone → PRE_PRODUCTION in snapshot → PSX row disappears immediately
    if (activeItemId) {
      queryClient.setQueriesData({ queryKey: ["orders-snapshot"], exact: false }, (cache) =>
        patchItemInOrder(cache, oid, activeItemId, (item) => ({ ...item, zone: "PRE_PRODUCTION" })));
    }
    fireNavAction({
      promise: rollbackMutation.mutateAsync({ version, reason, targetStatus: rollbackTarget, createSnapshot: !activeItemId, ...(activeItemId ? { activeItemId } : {}), capturedOrderId: orderId! }),
      success: `${displayNumber} → Phòng Thiết Kế`,
      successDetail: "Đang thiết kế lại",
      navLabel: "Xem tại PTK →",
      destTab: "pre-production",
      destOrderId: oid,
      errorPrefix: "Thiết kế lại thất bại",
      autoNavigate: false,
      removeFromSource: !activeItemId,
      rollbackSnapshot: !!activeItemId,
      afterSuccess: () => {
        queryClient.setQueryData(["orders-snapshot", ptk_key], (cache) =>
            insertOrderOnce(cache, rollbackOrder));
      },
    });
  }

  function handleReopen() {
    if (!order) return;
    const reason = reopenReason.trim();
    if (!reason) { toast.error("Vui lòng nhập lý do mở lại."); return; }
    const oid = orderId!;
    const target = reopenTarget;
    const displayNumber = activeItem?.moNumber ?? order.orderNumber;
    setShowReopen(false);
    onClose();
    toast.promise(
      resolveActionApi(oid, {
        action: "REOPEN",
        target,
        reason,
        ...(activeItemId ? { scopedItemId: activeItemId } : {}),
        version: order.version,
      }),
      {
        loading: "Đang mở lại đơn…",
        success: () => {
          // Đơn đổi zone/status → làm mới toàn bộ list + snapshot để hiện lại đúng tab.
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          queryClient.invalidateQueries({ queryKey: ["orders-snapshot"] });
          queryClient.invalidateQueries({ queryKey: ["orders-history-snapshot"] });
          onOrderUpdated?.({});
          return `${displayNumber} đã mở lại về ${target === "PSX" ? "Phòng Sản Xuất" : "Phòng Thiết Kế"}`;
        },
        error: (e: Error) => `Mở lại thất bại: ${e?.message ?? "Vui lòng thử lại"}`,
      }
    );
  }

  // Kiểm kết quả 3D nội bộ (Order/Admin) — KHÁC nút Duyệt thiết kế (DESIGN_REVIEW → khách).
  // Đây là bước Order/Admin xác nhận trước, dựa trên module business kpi-3d/review.ts ở server.
  // `assignmentId` do CHÍNH khối bấm nút truyền vào. Trước đây hàm tự lấy
  // design3DView.assignmentId — luôn là người thứ nhất — nên kết quả của NV 3D thứ 2 trở đi
  // không có cách nào kiểm được.
  async function handleReviewDecision(assignmentId: string, decision: "ACCEPT" | "REWORK") {
    if (!assignmentId) return;
    if (decision === "REWORK" && !reworkReason.trim()) {
      toast.error("Vui lòng nhập lý do yêu cầu làm lại.");
      return;
    }
    setReviewSubmitting(true);
    try {
      // fetchJson lo việc đọc text rồi mới parse — res.json() trên body rỗng (500 không có body)
      // sẽ ném "Failed to execute 'json'" và che mất lý do thật của server.
      await fetchJson(
        `/api/design-3d/assignments/${assignmentId}/review`,
        jsonBody({ decision, note: decision === "REWORK" ? reworkReason.trim() : null }),
      );

      // KHÔNG tự đặt trạng thái ở client — làm mới truy vấn để đọc lại từ bảng assignment,
      // giữ đúng nguyên tắc một nguồn sự thật.
      setReworkForId(null);
      setReworkReason("");
      toast.success(decision === "ACCEPT" ? "Đã nhận kết quả thiết kế 3D" : "Đã yêu cầu Thiết kế 3D làm lại");
      queryClient.invalidateQueries({ queryKey: ["order-panel", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      onOrderUpdated?.({});
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReviewSubmitting(false);
    }
  }

  /**
   * ĐÓNG lượt hiện tại và giao GIAI ĐOẠN TIẾP THEO — cùng người hay người khác đều được.
   *
   * VÌ SAO CẦN CỬA NÀY Ở SIDEBAR: trước đó chỉ có hai đường tạo lượt tiếp theo, và cả hai đều đòi
   * một điều kiện — đơn đang tạm dừng (Mở lại việc), hoặc đang chờ kiểm (Không duyệt → đổi người).
   * Đơn đang làm bình thường mà muốn giao thêm một lượt thì KHÔNG có cửa nào, nên người dùng với
   * lấy "+ Thêm NV 3D" — nút đó tạo lượt SONG SONG và đụng chốt chặn "người này đã được chọn".
   *
   * KHÔNG tự đặt trạng thái ở client: làm mới truy vấn để đọc lại từ bảng, giữ một nguồn sự thật.
   * Lượt cũ sẽ hiện lại thành khối ClosedAttemptCard chỉ đọc, lượt mới thành khối đang chạy.
   */
  async function handleContinueAttempt(
    assignmentId: string,
    body: { designer3DId: string; standardMinutes: number; startedAt?: string; kpiGroupId?: string },
  ) {
    await fetchJson(`/api/design-3d/assignments/${assignmentId}/continue`, jsonBody(body));
    toast.success("Đã chốt lượt hiện tại và giao lượt tiếp theo");
    queryClient.invalidateQueries({ queryKey: ["order-panel", orderId] });
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    onOrderUpdated?.({});
  }

  /**
   * Khối này có được giao lượt tiếp theo không, và với dữ liệu gì.
   *
   * BA ĐIỀU KIỆN GIỐNG HỆT server (deniedReasonForContinuation): vai Admin/Đặt đơn, lượt chưa
   * đóng, lượt chưa được duyệt. Kiểm lại ở client KHÔNG phải để bảo mật — mà để người dùng không
   * thấy một cái nút rồi bấm vào và bị chối.
   */
  const buildContinueContext = (
    row: Design3DAssignmentRow,
    view: ReturnType<typeof toDesign3DAssignmentView>,
  ): ContinueContext | undefined => {
    if (currentUserRole !== "ADMIN" && currentUserRole !== "ORDER") return undefined;
    if (row.status === "REASSIGNED" || row.status === "CANCELLED") return undefined;
    if (row.reviewStatus === "ACCEPTED") return undefined;

    return {
      assignmentId: row.id,
      standardMinutes: row.standardMinutesSnapshot,
      // Giờ đã ghi nhận cho người đang làm. `systemActualMinutes` đã gồm cả nhánh "số chốt ở lần
      // tạm dừng" (xem review.ts), nên không cần tính lại ở đây — và không được tính lại, vì hai
      // phép đo cho một con số sẽ lệch nhau ngay khi ai đó sửa một bên.
      creditedMinutes: view?.systemActualMinutes ?? 0,
      currentDesignerName: row.designer3D?.name ?? "",
      currentGroupName: row.kpiGroup?.name ?? "",
      calendar: kpi3DWorkingCalendar,
      groups: kpi3DGroups.map((g) => ({ id: g.id, name: g.name, standardMinutes: g.standardMinutes })),
      designers: designers3D.map((d) => ({ id: d.id, name: d.name })),
      onSubmit: (body) => handleContinueAttempt(row.id, body),
    };
  };

  function handleComplete() {
    if (!order) return;
    if (isSavePending) { toast.info("Đang đồng bộ, vui lòng chờ…"); return; }
    const { orderNumber, version, id: oid } = order;
    const displayNumber = activeItem?.moNumber ?? orderNumber;
    // Capture trước onClose — closure an toàn dù component unmount
    const completed_key = buildHistorySnapshotQuery("completed");
    const completedOrder = buildNavInjectedRow(
      order,
      (item: any) => (!activeItemId || item.itemId === activeItemId ? { ...item, itemStatus: "COMPLETED" } : item),
      !activeItemId ? { status: "COMPLETED" } : undefined,
    );

    // Optimistic per-MO: mark itemStatus → COMPLETED in snapshot immediately (before any API).
    // MO disappears from PSX tab at once; rollbackSnapshot restores it on failure.
    if (activeItemId) {
      queryClient.setQueriesData({ queryKey: ["orders-snapshot"], exact: false }, (cache) =>
        patchItemInOrder(cache, oid, activeItemId, (item) => ({ ...item, itemStatus: "COMPLETED" })));
    }

    function fireComplete() {
      fireNavAction({
        promise: activeItemId
          ? itemStatusMutation.mutateAsync({ itemId: activeItemId, itemStatus: "COMPLETED", capturedOrderId: orderId! })
          : resolveActionMutation.mutateAsync({ action: "RESUME", version, forceStatus: "COMPLETED", capturedOrderId: orderId! }),
        success: `${displayNumber} đã Hoàn tất`,
        navLabel: "Xem tại Hoàn tất →",
        destTab: "completed",
        destOrderId: oid,
        errorPrefix: "Hoàn tất thất bại",
        autoNavigate: false,
        removeFromSource: !activeItemId,
        rollbackSnapshot: !!activeItemId,
        afterSuccess: () => {
          queryClient.setQueryData(["orders-history-snapshot", completed_key], (cache) =>
            insertOrderOnce(cache, completedOrder));
        },
      });
    }

    // Có thay đổi chưa lưu → save trước (fire-and-forget), chain complete sau khi save xong
    if (isMhDirty && productionForm) {
      const savedOrderId = orderId!;
      const saveSnapshot = {
        dirtySnapshot: Array.from(dirtyItemIds),
        formsSnapshot: { ...itemForms },
        capturedOrderId: orderId!,
        capturedActiveItemId: activeItemId ?? null,
        capturedOrder: order,
        capturedProductionForm: { ...productionForm },
        capturedForm: form ? { ...form } : null,
        capturedStageForms: stageForms.map(s => ({ ...s })),
        capturedHoldReason: holdReason,
        capturedProductionMethod: productionMethod ?? null,
        // Skip itemStatus optimistic trong onMutate + onSuccess — COMPLETED đã được set ở trên
        skipItemStatusOptimistic: true,
      };
      onClose();
      mhSaveMutation.mutateAsync(saveSnapshot)
        .then(() => { fireComplete(); })
        .catch((err: Error & { tag?: string }) => {
          // Rollback optimistic COMPLETED nếu save thất bại
          queryClient.invalidateQueries({ queryKey: ["orders-snapshot"] });
          const msg = err?.tag === "CONFLICT"
            ? "Đơn đang được xử lý, vui lòng đợi 1-2 giây và thử lại"
            : err?.message ?? "Vui lòng thử lại";
          toast.error(`Lưu thất bại — ${displayNumber}: ${msg}`, {
            duration: 8000,
            action: { label: "Mở lại", onClick: () => onReopenOrder?.(savedOrderId) },
          });
        });
      return;
    }

    // Không dirty → complete trực tiếp (giống logic gốc)
    onClose();
    fireComplete();
  }

  function handleResume() {
    if (!order) return;
    const { orderNumber, version, id: oid } = order;
    const displayNumber = activeItem?.moNumber ?? orderNumber;
    onClose();
    fireNavAction({
      promise: activeItemId
        ? itemStatusMutation.mutateAsync({ itemId: activeItemId, itemStatus: "IN_PRODUCTION", capturedOrderId: orderId! })
        : resolveActionMutation.mutateAsync({ action: "RESUME", version, capturedOrderId: orderId! }),
      success: `${displayNumber} tiếp tục sản xuất`,
      successDetail: "Đang sản xuất",
      navLabel: "Xem →",
      duration: 5000,
      destTab: "master-hub",
      destOrderId: oid,
      errorPrefix: "Tiếp tục thất bại",
      autoNavigate: false,
    });
  }

  function handleShowroomConfirmed() {
    if (!order) return;
    const { orderNumber, version, id: oid } = order;
    const displayNumber = activeItem?.moNumber ?? orderNumber;
    setShowShowroomConfirm(false);
    onClose();
    fireNavAction({
      promise: activeItemId
        ? showroomMutation.mutateAsync({ itemId: activeItemId, moNumber: activeItem?.moNumber ?? "", capturedOrderId: orderId! })
        : resolveActionMutation.mutateAsync({ action: "RESUME", version, convertToShowroom: true, capturedOrderId: orderId! }),
      success: `${displayNumber} → Showroom`,
      navLabel: "Xem →",
      duration: 5000,
      destTab: "master-hub",
      destOrderId: oid,
      errorPrefix: "Chuyển Showroom thất bại",
      autoNavigate: false,
    });
  }

  function handleCancelConfirmed() {
    if (!order || !cancelReason.trim()) return;
    if (isSavePending) { toast.info("Đang đồng bộ, vui lòng chờ…"); return; }
    const { orderNumber, version, id: oid } = order;
    const displayNumber = activeItem?.moNumber ?? orderNumber;
    const reason = cancelReason;
    // Construct injected order trước async — closure capture an toàn dù component unmount
    const cancelled_key = buildHistorySnapshotQuery("cancelled");
    const cancelledOrder = buildNavInjectedRow(
      order,
      (item: any) => (!activeItemId || item.itemId === activeItemId ? { ...item, itemStatus: "CANCELLED" } : item),
      !activeItemId ? { status: "CANCELLED" } : undefined,
    );
    setShowCancelConfirm(false);
    setCancelReason("");
    onClose();
    // Optimistic per-MO: mark item CANCELLED in snapshot → PSX row disappears immediately
    if (activeItemId) {
      queryClient.setQueriesData({ queryKey: ["orders-snapshot"], exact: false }, (cache) =>
        patchItemInOrder(cache, oid, activeItemId, (item) => ({ ...item, itemStatus: "CANCELLED" })));
    }
    fireNavAction({
      promise: activeItemId
        // statusReason: TRƯỚC ĐÂY BỊ MẤT Ở ĐÚNG DÒNG NÀY. Dialog bắt buộc nhập lý do
        // (handleCancelConfirmed return sớm khi rỗng) nhưng nhánh per-MO không truyền đi, nên
        // hủy từng MO — đường dùng thường xuyên nhất trong PSX — không lưu lý do ở đâu cả.
        ? itemStatusMutation.mutateAsync({ itemId: activeItemId, itemStatus: "CANCELLED", capturedOrderId: orderId!, statusReason: reason })
        : resolveActionMutation.mutateAsync({ action: "CANCEL", version, reason, capturedOrderId: orderId! }),
      success: `${displayNumber} đã Hủy`,
      navLabel: "Xem tại Đã hủy →",
      destTab: "cancelled",
      destOrderId: oid,
      errorPrefix: "Hủy thất bại",
      autoNavigate: false,
      removeFromSource: !activeItemId,
      rollbackSnapshot: !!activeItemId,
      afterSuccess: () => {
        queryClient.setQueryData(["orders-history-snapshot", cancelled_key], (cache) =>
            insertOrderOnce(cache, cancelledOrder));
      },
    });
  }

  // ⚠️ HIỆN KHÔNG ĐƯỢC GỌI Ở ĐÂU. Mọi nút Hủy trên panel đều mở dialog (setShowCancelConfirm)
  // rồi đi qua handleCancelConfirmed — đường DUY NHẤT, và nó bắt buộc nhập lý do. Giữ lại vì
  // chưa rõ có chủ ý dùng lại; nếu nối dây lại thì phải thêm dialog lý do, KHÔNG nhét chuỗi
  // mặc định vào statusReason (xem ghi chú trong thân hàm).
  function handleDirectCancel() {
    if (!order) return;
    if (isSavePending) { toast.info("Đang đồng bộ, vui lòng chờ…"); return; }
    const { orderNumber, version, id: oid } = order;
    const displayNumber = activeItem?.moNumber ?? orderNumber;
    // Construct injected order trước async — closure capture an toàn dù component unmount
    const cancelled_key = buildHistorySnapshotQuery("cancelled");
    const cancelledOrder = buildNavInjectedRow(
      order,
      (item: any) => (!activeItemId || item.itemId === activeItemId ? { ...item, itemStatus: "CANCELLED" } : item),
      !activeItemId ? { status: "CANCELLED" } : undefined,
    );
    onClose();
    // Optimistic per-MO: mark item CANCELLED in snapshot → PSX row disappears immediately
    if (activeItemId) {
      queryClient.setQueriesData({ queryKey: ["orders-snapshot"], exact: false }, (cache) =>
        patchItemInOrder(cache, oid, activeItemId, (item) => ({ ...item, itemStatus: "CANCELLED" })));
    }
    fireNavAction({
      promise: activeItemId
        // CỐ Ý KHÔNG truyền statusReason: hàm này không có dialog nên người dùng KHÔNG hề gõ
        // lý do nào. Bản trước tôi nhét sẵn chuỗi "Hủy trực tiếp" — đó lại đúng lớp lỗi vừa
        // phải sửa hai lần: một chuỗi hệ thống hiện ở cột "Lý do hủy" trông y như câu do người
        // viết. Không có lý do thì để trống, bảng hiện "—" và người đọc biết là không có.
        ? itemStatusMutation.mutateAsync({ itemId: activeItemId, itemStatus: "CANCELLED", capturedOrderId: orderId! })
        : resolveActionMutation.mutateAsync({ action: "CANCEL", version, reason: "Hủy trực tiếp", capturedOrderId: orderId! }),
      success: `${displayNumber} đã Hủy`,
      navLabel: "Xem tại Đã hủy →",
      destTab: "cancelled",
      destOrderId: oid,
      errorPrefix: "Hủy thất bại",
      autoNavigate: false,
      removeFromSource: !activeItemId,
      rollbackSnapshot: !!activeItemId,
      afterSuccess: () => {
        queryClient.setQueryData(["orders-history-snapshot", cancelled_key], (cache) =>
            insertOrderOnce(cache, cancelledOrder));
      },
    });
  }

  const isOpen = !!orderId;

  // ─── Derived values ────────────────────────────────────────────────────────
  // effectiveZone khai báo sớm hơn (gần effectiveTerminal/isZoneLocked) — dùng chung ở đây.
  const isMhOrder = effectiveZone === "MASTER_HUB";

  // Per-MO fields: read from active item's form, fall back to first item
  const effectiveItemId = activeItemId ?? order?.items[0]?.id ?? null;
  const effectiveItemForm = effectiveItemId ? itemForms[effectiveItemId] : null;

  const tuanDuKien = useCallback(() => {
    const rd = effectiveItemForm?.requiredDate;
    if (!rd) return null;
    const d = new Date(rd + "T00:00:00Z");
    if (isNaN(d.getTime())) return null;
    const w = getISOWeek(d);
    return `Tuần ${w} / ${d.getFullYear()}`;
  }, [effectiveItemForm]);
  const mo = order?.productionDetail;
  // Per-MO: effective status of the active item (falls back to order-level status)
  const activeItemEffectiveStatus: string | undefined = activeItem
    ? ((activeItem as any).itemStatus ?? order?.status)
    : order?.status;
  // Trạng thái SẼ có sau khi auto-save (form.status là giá trị sắp lưu).
  // Dùng để quyết định force + màu nút: nếu user đổi dropdown sang "Chốt 3D"
  // nhưng chưa lưu, promote vẫn đi luồng thường (auto-save persist trước).
  const promoteEffectiveStatus = form?.status ?? activeItemEffectiveStatus;
  const promoteWillBeApproved = promoteEffectiveStatus === "DESIGN_APPROVED";

  // Cụm theo dõi BOM — DÙNG CHUNG cho sidebar PTK lẫn PSX (BOM đi theo MO qua các zone,
  // per-MO trong specifications). Mỗi trạng thái có ô ngày riêng (không bắt buộc), chuyển
  // trạng thái KHÔNG xoá ngày cũ → 3 dòng ngày là lịch sử. Nhãn Deadline/Ngày gửi làm rõ ý nghĩa.
  const bomCluster = (
    <div className="space-y-1 rounded-lg p-3" style={{ background: "var(--cream-dark)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="psx-label">BOM</p>
        <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--s-gold)", background: "rgba(138,106,26,0.1)", border: "1px solid rgba(138,106,26,0.3)", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Riêng theo MO
        </span>
      </div>
      <div className="space-y-2 text-xs" data-fieldname="bom trạng thái ngày">
        <Field label="Trạng thái BOM">
          <select
            value={effectiveItemForm?.bomStatus ?? ""}
            disabled={activeItemSuspended || isWorking || isReadOnly || !effectiveItemId}
            onChange={(e) => effectiveItemId && updateItemForm(effectiveItemId, { bomStatus: e.target.value })}
            className={inputCls(activeItemSuspended)}
          >
            <option value="">— Chưa phân loại —</option>
            {BOM_STATUSES.map((s) => (
              <option key={s} value={s}>{BOM_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>
        <div className="space-y-1">
          {BOM_STATUSES.map((s) => {
            const isCurrent = effectiveItemForm?.bomStatus === s;
            return (
              <div key={s}>
                <div className="grid grid-cols-2 gap-3 items-center px-2 py-1 rounded"
                  style={isCurrent ? { background: "rgba(138,106,26,0.08)", border: "1px solid rgba(138,106,26,0.3)" } : { border: "1px solid transparent" }}>
                  <span style={{ fontSize: "11px", fontWeight: isCurrent ? 700 : 400, color: isCurrent ? "var(--s-gold)" : "var(--ink-muted)" }}>
                    {BOM_STATUS_LABELS[s]}{isCurrent ? " ●" : ""}
                    <span style={{ display: "block", fontSize: "9px", fontWeight: 400, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {BOM_DATE_LABELS[s]}
                    </span>
                  </span>
                  <DateInput
                    value={effectiveItemForm?.bomDates?.[s] ?? ""}
                    disabled={activeItemSuspended || isWorking || isReadOnly || !effectiveItemId}
                    onChange={(iso) => effectiveItemId && effectiveItemForm && updateItemForm(effectiveItemId, {
                      bomDates: { ...effectiveItemForm.bomDates, [s]: iso || "" },
                    })}
                    className={inputCls(activeItemSuspended)} />
                </div>
                {s === "CHO_THONG_TIN" && (
                  <div className="px-2 pb-1 pt-1">
                    <Field label="Diễn giải">
                      <textarea
                        value={effectiveItemForm?.bomDienGiai ?? ""}
                        disabled={activeItemSuspended || isWorking || isReadOnly || !effectiveItemId}
                        onChange={(e) => effectiveItemId && updateItemForm(effectiveItemId, { bomDienGiai: e.target.value })}
                        rows={2}
                        placeholder="Mô tả thông tin BOM còn thiếu…"
                        className={inputCls(activeItemSuspended)}
                        style={{ width: "100%", resize: "vertical" }} />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ─── KHỐI "NHÂN VIÊN THIẾT KẾ 3D" — MỘT BẢN, HAI MÀN DÙNG CHUNG ─────────────
  //
  // Đây là DỮ LIỆU CHẤM KPI, nên PSX phải thấy ĐỦ mọi lần thiết kế của MO, không phải
  // một bản tóm tắt. Trước đây tab Thiết kế bên PSX tự vẽ MỘT khối lấy từ JSON, nên MO
  // làm 2 lần chỉ hiện 1 — và tệ hơn là hiện TRỘN: tên người của lần đang chạy (đọc từ
  // bảng) nằm cạnh ngày giao và kết quả của lần đầu (đọc từ JSON, mà route continue/
  // reassign không hề ghi lại). Một hàng số liệu không tồn tại trong thực tế.
  //
  // KHÔNG chép bản thứ hai cho PSX: chú thích ngay dưới đây kể rằng section này ĐÃ TỪNG
  // có hai bản viết tay và chúng lệch nhau 6 trường, nặng nhất là người thứ hai không có
  // nút Kiểm nội bộ. Nên một bản duy nhất, PSX gọi với ro=true.
  //
  // `ro` KHÔNG phải isReadOnly của panel: bên PSX phần sản xuất vẫn sửa được, riêng khối
  // thiết kế thì luôn chỉ đọc — việc thiết kế thuộc về PTK và màn Việc thiết kế 3D.
  const renderDesignerBlocks = (ro: boolean) => (
    <>
                  <SectionLabel editable={!ro}>Nhân viên Thiết kế 3D</SectionLabel>

                  <div className="space-y-3" data-fieldname="nhân viên 3d nhóm kpi ngày giao giờ giao deadline ngày hoàn thành giờ thực tế kết quả kiểm nội bộ file render">
                    {/* CÁC LƯỢT ĐÃ ĐÓNG ĐỨNG TRƯỚC, mỗi lượt một khối chỉ đọc.
                        Chúng chiếm dãy số đầu, nên khối JSON slot 0 KHÔNG còn luôn là "#1" —
                        đánh số qua firstEditableBlockNo để hai chỗ không tự cộng rồi lệch nhau. */}
                    {closedDesignerBlocks.map((b) => (
                      <ClosedAttemptCard
                        key={b.attempt.id}
                        row={b.attempt}
                        blockNo={b.blockNo}
                        closedReason={b.closedReason}
                        // ĐẢO NGƯỢC có chủ ý: `collapsedDesigners` là tập "đã bấm", và với khối
                        // chỉ đọc thì mặc định phải là THU GỌN. Dùng thuận chiều như các khối ô
                        // nhập sẽ khiến đơn làm 4 lần bung ra bốn khối đầy trường ngay khi mở
                        // panel, đẩy khối đang-làm xuống dưới màn hình.
                        collapsed={!collapsedDesigners.has(`closed-${b.attempt.id}`)}
                        onToggleCollapse={() => toggleDesignerCollapsed(`closed-${b.attempt.id}`)}
                        calendar={kpi3DWorkingCalendar}
                      />
                    ))}

                    {/* ─── TĂNG CA ĐÃ DUYỆT — KHỐI RIÊNG, KHÔNG CỘNG VÀO KHỐI NÀO ───────────
                        Đặt SAU các lượt đã đóng và TRƯỚC khối đang làm: đọc theo thứ tự thời gian
                        thì đây là công phát sinh thêm trên những gì đã xảy ra.
                        Nó KHÔNG mang số hiệu khối (#1, #2…) — dãy số đó là của các LƯỢT GIAO VIỆC,
                        và tăng ca không phải một lượt: không có deadline, không có phán quyết
                        Đúng/Trễ hạn, không đếm vào tải công việc. Xem kpi-3d/overtime-blocks.ts. */}
                    {overtimeBlocks.length > 0 && (
                      <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                            Tăng ca đã duyệt
                          </span>
                          <span className="text-[11px] font-semibold text-amber-800 tabular-nums">
                            {formatMinutes(totalOvertimeMinutes(overtimeBlocks))}
                          </span>
                        </div>
                        <div className="mt-1.5 space-y-1.5">
                          {overtimeBlocks.map((b) => (
                            <div key={b.id} className="text-[11px] leading-relaxed text-amber-900">
                              <span className="font-semibold">{b.designerName}</span>
                              {" · "}
                              <span className="tabular-nums">
                                {toVnHm(b.startAt)}–{toVnHm(b.endAt)} {formatVnDateTime(b.startAt).slice(6)}
                              </span>
                              {" · "}
                              <span className="font-semibold tabular-nums">{formatMinutes(b.minutes)}</span>
                              {b.approvedByName && (
                                <span className="text-amber-700"> · duyệt bởi {b.approvedByName}</span>
                              )}
                              {b.reason && <div className="text-amber-700">{b.reason}</div>}
                            </div>
                          ))}
                        </div>
                        {/* Câu này TỒN TẠI ĐỂ CHỐNG MỘT PHÉP CỘNG SAI. Người đọc panel rất dễ tự
                            cộng giờ tăng ca vào "Giờ thực tế" của khối bên dưới rồi đối chiếu KPI
                            bằng tổng đó — hai con số này thuộc hai sổ khác nhau. */}
                        <div className="mt-1.5 text-[10.5px] text-amber-700">
                          Tính lương riêng — KHÔNG cộng vào Giờ thực tế và không ảnh hưởng Deadline KPI.
                        </div>
                      </div>
                    )}

                    <Designer3DCard
                      title={`Nhân viên 3D #${firstEditableBlockNo(closedDesignerBlocks.length)}`}
                      value={{
                        phanNhom3D: designForm.phanNhom3D,
                        tho3d: designForm.tho3d,
                        ngayGiao3D: designForm.ngayGiao3D,
                        gioGiao3D: designForm.gioGiao3D,
                        gioThucTe: designForm.gioThucTe,
                      }}
                      onChange={(key, v) => updateDesignForm(key, v)}
                      collapsed={collapsedDesigners.has("0")}
                      onToggleCollapse={() => toggleDesignerCollapsed("0")}
                      groupOptions={kpi3DGroupOptions}
                      designerOptions={designers3D}
                      workloadByName={workloadByName}
                      showGroupWarning={kpi3DNotConfigured}
                      /* Số giờ KPI/Deadline của người #1 do effect tính sẵn vào designForm —
                         giữ nguyên đường đi cũ, không tính lại ở đây để tránh hai kết quả. */
                      standardHours={designForm.soGioDuKien}
                      deadlineAt={design3DView?.deadlineAt ?? deadlinePreview}
                      view={design3DView}
                      pauses={design3DRow?.pauses}
                      continueContext={
                        design3DRow ? buildContinueContext(design3DRow, design3DView) : undefined
                      }
                      legacyCompletedDate={designForm.ngayHoanThanh3D}
                      onLegacyCompletedDateChange={(v) => updateDesignForm("ngayHoanThanh3D", v)}
                      legacyKetQua={designForm.ketQua}
                      canReview={currentUserRole === "ADMIN" || currentUserRole === "ORDER"}
                      reviewSubmitting={reviewSubmitting}
                      reworkOpen={reworkForId === design3DView?.assignmentId}
                      reworkReason={reworkReason}
                      onReworkReasonChange={setReworkReason}
                      onOpenRework={() => setReworkForId(design3DView?.assignmentId ?? null)}
                      onCancelRework={() => { setReworkForId(null); setReworkReason(""); }}
                      onDecision={(d) => void handleReviewDecision(design3DView?.assignmentId ?? "", d)}
                      disabled={isWorking}
                      readOnly={ro}
                    />

                    {extraDesigners.map((x, index) => {
                      const preview = previewExtraDesigner(x);
                      const row = x.kpi3DAssignmentId
                        ? (order?.design3DAssignments ?? []).find((r) => r.id === x.kpi3DAssignmentId) ?? null
                        : null;
                      // `pauses` bắt buộc — xem ghi chú ở design3DView.
                      const view = toDesign3DAssignmentView(row, toVnYmd, kpi3DWorkingCalendar, toPauseSpans(row?.pauses));
                      return (
                        <Designer3DCard
                          key={x.kpi3DAssignmentId || `new-${index}`}
                          title={`Nhân viên 3D #${firstEditableBlockNo(closedDesignerBlocks.length) + index + 1}`}
                          onRemove={() => removeExtraDesigner(index)}
                          value={x}
                          onChange={(key, v) => updateExtraDesigner(index, key, v)}
                          collapsed={collapsedDesigners.has(String(index + 1))}
                          onToggleCollapse={() => toggleDesignerCollapsed(String(index + 1))}
                          groupOptions={kpi3DGroupOptions}
                          designerOptions={designers3D}
                      workloadByName={workloadByName}
                          standardHours={preview.hours}
                          deadlineAt={row ? new Date(row.deadlineAt) : preview.deadline}
                          view={view}
                          pauses={row?.pauses}
                          continueContext={row ? buildContinueContext(row, view) : undefined}
                          canReview={currentUserRole === "ADMIN" || currentUserRole === "ORDER"}
                          reviewSubmitting={reviewSubmitting}
                          reworkOpen={!!view && reworkForId === view.assignmentId}
                          reworkReason={reworkReason}
                          onReworkReasonChange={setReworkReason}
                          onOpenRework={() => setReworkForId(view?.assignmentId ?? null)}
                          onCancelRework={() => { setReworkForId(null); setReworkReason(""); }}
                          onDecision={(d) => void handleReviewDecision(view?.assignmentId ?? "", d)}
                          disabled={isWorking}
                          readOnly={ro}
                        />
                      );
                    })}

                    {/* Khối "Lịch sử các lần thiết kế" ĐÃ BỎ. Nó ra đời khi các lượt đã đóng
                        không có chỗ nào hiện ra, nên phải kể lại thành một danh sách một dòng
                        mỗi lần. Nay mỗi lượt đã đóng có khối ClosedAttemptCard riêng — giữ cả
                        hai là nói cùng một chuyện hai lần ở hai mức chi tiết, và người đọc sẽ
                        phải tự đối chiếu xem chúng có khớp nhau không. */}

                    {!ro && (
                      <button
                        type="button"
                        disabled={isWorking}
                        onClick={addExtraDesigner}
                        className="psx-btn text-xs h-8 disabled:opacity-50"
                      >
                        + Thêm NV 3D
                      </button>
                    )}
                  </div>
    </>
  );

  return (
    <ReadOnlyCtx.Provider value={isReadOnly}>
    <>
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} aria-hidden />
      )}

      <div
        className={cn(
          "fixed top-0 right-0 z-40 h-screen w-[520px] flex flex-col",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        style={{ background: "var(--cream-card)", boxShadow: "0 8px 40px rgba(42,39,37,0.18)", borderLeft: "1px solid var(--border)" }}
      >
        {/* ── Banner: đơn đang được lưu (pending-create) ───────────────── */}
        {isPendingCreate && (
          <div style={{
            flexShrink: 0, display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 16px", background: "rgba(234,179,8,0.12)",
            borderBottom: "1px solid rgba(234,179,8,0.3)",
            fontSize: "12px", fontWeight: 500, color: "#92400e",
          }}>
            <Loader2 className="animate-spin" style={{ width: "14px", height: "14px", flexShrink: 0 }} />
            <span>Đơn đang được lưu lên hệ thống — vui lòng đợi</span>
          </div>
        )}

        {/* ── Banner: đơn đang được lưu ở background ───────────────────── */}
        {isSavePending && !isPendingCreate && (
          <div style={{
            flexShrink: 0, display: "flex", alignItems: "center", gap: "10px",
            padding: "8px 16px", background: "rgba(59,130,246,0.08)",
            borderBottom: "1px solid rgba(59,130,246,0.2)",
            fontSize: "12px", fontWeight: 500, color: "#1d4ed8",
          }}>
            <Loader2 className="animate-spin" style={{ width: "13px", height: "13px", flexShrink: 0 }} />
            <span>Đang đồng bộ nền — vẫn xem &amp; sửa được; chờ đồng bộ xong mới lưu/chuyển được</span>
          </div>
        )}

        {/* ── Header ───────────────────────────────────────────────────────── */}
        {isLoading && !isPendingCreate && (
          <div className="shrink-0 px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-32 rounded animate-pulse" style={{ background: "var(--cream-dark)" }} />
              <div className="h-3 w-44 rounded animate-pulse" style={{ background: "var(--cream-dark)" }} />
            </div>
            <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: "6px" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Header đơn đang pending-create (chưa có trong DB) */}
        {isPendingCreate && !isLoading && placeholderData && (
          <div className="shrink-0 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span style={{ fontFamily: "monospace", fontSize: "15px", fontWeight: 700, color: "var(--ink)" }}>
                  {/* Khung chờ trong lúc tải. Phải ĐỊNH DẠNG GIỐNG HỆT bản đã tải (dòng
                      ~3300), nếu không mã sẽ NHẢY ngay trước mắt user khi dữ liệu về. */}
                  {formatMoVersionedDisplay(placeholderData.firstItem?.moNumber, placeholderData.firstItem?.isFromWebapp ?? false) || placeholderData.orderNumber}
                </span>
                <p style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "2px" }}>
                  {placeholderData.customerName}
                </p>
              </div>
              <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: "6px", flexShrink: 0 }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {order && !isLoading && (
          <div className="shrink-0 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={cn(
                    "inline-block w-2.5 h-2.5 rounded-full shrink-0 mt-0.5",
                    PRIORITY_DOT[order.priorityCode] ?? "bg-gray-300"
                  )}
                  title={order.priorityCode}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* MO# — ưu tiên activeItem khi mở từ một MO cụ thể */}
                    {(() => {
                      const displayMo = activeItem?.moNumber ?? (effectiveZone === "MASTER_HUB" ? (mo?.productionCode ?? order.orderNumber) : (order.items[0]?.moNumber ?? order.orderNumber));
                      const soNum = getBaseSoNumber(order.orderNumber);
                      const showSo = displayMo !== soNum;
                      return (
                        <>
                          <span style={{ fontFamily: "monospace", fontSize: "15px", fontWeight: 700, color: "var(--ink)" }}>
                            {formatMoVersionedDisplay(displayMo, order?.createdBy != null)}
                          </span>
                          {showSo && (
                            <span style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--ink-muted)" }}>SO: {soNum}</span>
                          )}
                        </>
                      );
                    })()}
                    <ZoneBadge zone={effectiveZone ?? order.zone} />
                    {activeItemSuspended && (
                      <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded border border-red-200 uppercase tracking-wide">
                        {holdReason === "CHO_DX_NL" ? "Chờ ĐX NL" :
                         holdReason === "CHO_NL"    ? "Chờ NL"     :
                         "Tạm ngưng"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">
                    {order.customerName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: "6px", flexShrink: 0 }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Search filter bar ─────────────────────────────────────────────── */}
        {order && !isLoading && (
          <div className="shrink-0 px-4 py-2" style={{ borderBottom: "1px solid var(--border)", background: "var(--cream-dark)" }}>
            <input
              type="search"
              placeholder="Tìm trường thông tin..."
              className="psx-input"
              style={{ fontSize: "12px" }}
              onChange={(e) => {
                const term = e.target.value.trim().toLowerCase();
                const panel = document.getElementById("panel-body-content");
                if (!panel) return;
                panel.querySelectorAll<HTMLElement>("[data-fieldname]").forEach((el) => {
                  const name = (el.dataset.fieldname ?? "").toLowerCase();
                  el.style.display = !term || name.includes(term) ? "" : "none";
                });
              }}
            />
          </div>
        )}

        {/* ── Cảnh báo đơn vừa bị thay đổi bởi người khác ────────────────── */}
        {externallyUpdated && !staleWarningDismissed && order && (
          <div className="shrink-0" style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "7px 16px",
            background: "rgba(234,179,8,0.07)",
            borderBottom: "1px solid rgba(234,179,8,0.25)",
            borderLeft: "3px solid #eab308",
            fontSize: "12px",
          }}>
            <AlertTriangle style={{ width: "13px", height: "13px", color: "#eab308", flexShrink: 0 }} />
            {/* ⚠️ NÚT "Tải lại" TRƯỚC ĐÂY KHÔNG LÀM GÌ KHI ĐANG CÓ SỬA DỞ.
                Nó `invalidateQueries` → dữ liệu mới VỀ TỚI MÁY thật, nhưng effect nạp form có
                chốt "đang sửa dở thì KHÔNG ghi đè" (đúng — ghi đè lên chữ người ta đang gõ còn
                tệ hơn). Kết quả: bấm xong màn hình y nguyên, và một nút bấm không phản hồi thì
                người dùng kết luận là hệ thống hỏng.
                Nay nói thẳng đang vướng gì, và cho một lối đi thật. */}
            <span style={{ flex: 1, color: "var(--ink-body, #374151)" }}>
              {hasUnsavedEdits
                ? "Đơn này vừa được cập nhật bởi người khác — bản mới đang bị giữ lại vì bạn có thay đổi chưa lưu."
                : "Đơn này vừa được cập nhật bởi người khác."}
            </span>
            <button
              type="button"
              onClick={() => {
                setStaleWarningDismissed(true);
                // Xoá cờ sửa dở TRƯỚC khi invalidate: chốt "không ghi đè" đọc chính các cờ này,
                // nên còn cờ thì dữ liệu mới về rồi vẫn không được nạp lên form.
                if (hasUnsavedEdits) {
                  setIsDirty(false);
                  setIsProductionDirty(false);
                  setIsDesignDirty(false);
                  setDirtyItemIds(new Set());
                }
                queryClient.invalidateQueries({ queryKey: ["order-panel", orderId] });
              }}
              style={{ fontSize: "11px", fontWeight: 600, color: "#eab308", background: "none", border: "none", cursor: "pointer", padding: "0", textDecoration: "underline", whiteSpace: "nowrap" }}
            >
              {hasUnsavedEdits ? "Bỏ thay đổi & tải lại" : "Tải lại"}
            </button>
            <button
              type="button"
              onClick={() => setStaleWarningDismissed(true)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: "0", display: "flex" }}
            >
              <X style={{ width: "12px", height: "12px" }} />
            </button>
          </div>
        )}

        {/* ── Banner cảnh báo đơn đang sản xuất (IN_PRODUCTION + MASTER_HUB) ── */}
        {order && effectiveZone === "MASTER_HUB" && effectiveTerminalStatus === "IN_PRODUCTION" && !effectiveTerminal && (
          <div className="shrink-0" style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "8px 14px",
            background: "rgba(234,179,8,0.07)",
            borderBottom: "1px solid #fde68a",
            borderLeft: "3px solid #d97706",
          }}>
            <AlertTriangle style={{ width: "13px", height: "13px", flexShrink: 0, color: "#d97706" }} />
            <span style={{ fontSize: "12px", flex: 1, color: "#92400e" }}>
              {/* ⚠️ NHÁNH THỨ BA CHO VAI GHI-MỘT-PHẦN. Câu "chỉ Phòng Sản Xuất, Xử lý đơn hàng
                  và Admin được chỉnh sửa" là SAI với R&D — họ CÓ sửa được Mã số mẫu. Nó bảo họ
                  đừng thử, đúng lúc họ đang đi tìm chỗ nhập. */}
              {isPartialWriteRole(currentUserRole)
                ? "Bạn chỉ nhập được Mã số mẫu; các thông số khác chỉ để xem."
                : isZoneLocked
                ? "Đơn này đang trong sản xuất — chỉ Phòng Sản Xuất, Xử lý đơn hàng và Admin được chỉnh sửa."
                : "Đơn này đang trong sản xuất — chỉnh sửa KT sẽ ảnh hưởng đến quy trình đang chạy."}
            </span>
          </div>
        )}

        {/* ── MO NÀY ĐÃ CÓ BẢN BÊN PSX ─────────────────────────────────────────
             Bảng Danh sách đơn hàng đã hiện huy hiệu này từ lâu; sidebar thì không, vì route
             chi tiết trước đây không tính `psxSibling`. Người ở PTK mở một MO đã chuyển sang
             sản xuất mà không có gì nói cho họ biết — họ sửa, tưởng mình đang sửa cái đang
             chạy ngoài xưởng.

             CHỈ BÁO, KHÔNG KHOÁ: bản PTK là một phiên bản riêng, sửa nó là hợp lệ. Khoá lại sẽ
             chặn cả những lần sửa chính đáng — đúng kiểu bực mà ô Khách hàng bị khoá oan đã gây
             ra trên production.

             Câu thứ hai ("không ảnh hưởng bản đang sản xuất") là phần đáng giá nhất của dải
             này: nó trả lời thẳng câu hỏi người dùng sẽ tự hỏi ngay sau khi đọc câu thứ nhất.

             Chỉ hiện khi ĐANG XEM MỘT MO: ở mức SO tổng, các MO có thể mỗi cái một tình trạng
             nên một câu chung sẽ đúng với MO này và sai với MO kia. */}
        {psxSiblingOfActiveItem && (
          <div className="shrink-0" style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "8px 14px",
            background: "rgba(37,99,235,0.06)",
            borderBottom: "1px solid #bfdbfe",
            borderLeft: "3px solid #2563eb",
          }}>
            <Info style={{ width: "13px", height: "13px", flexShrink: 0, color: "#2563eb" }} />
            <span style={{ fontSize: "12px", flex: 1, color: "#1e40af" }}>
              MO này <strong>đã chuyển sang PSX</strong>
              {" ("}
              <span style={{ fontFamily: "monospace" }}>
                {formatVersionedDisplay(psxSiblingOfActiveItem.orderNumber)}
              </span>
              {" · "}
              {L.status[psxSiblingOfActiveItem.status as OrderStatus] ?? psxSiblingOfActiveItem.status}
              {") — sửa ở đây "}
              <strong>không ảnh hưởng</strong>
              {" bản đang sản xuất."}
            </span>
          </div>
        )}

        {/* ── Banner trạng thái terminal (COMPLETED / CANCELLED) — theo MO đang xem,
             không phải theo SO (1 SO có thể đã Hoàn tất/Đã hủy nhưng MO đang xem vẫn Đang SX) */}
        {effectiveTerminal && order && (
          <div className="shrink-0" style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "8px 14px",
            background: effectiveTerminalStatus === "COMPLETED" ? "rgba(22,163,74,0.07)" : "rgba(220,38,38,0.07)",
            borderBottom: `1px solid ${effectiveTerminalStatus === "COMPLETED" ? "#86efac" : "#fca5a5"}`,
            borderLeft: `3px solid ${effectiveTerminalStatus === "COMPLETED" ? "#16a34a" : "#dc2626"}`,
          }}>
            <CheckCircle2 style={{
              width: "13px", height: "13px", flexShrink: 0,
              color: effectiveTerminalStatus === "COMPLETED" ? "#16a34a" : "#dc2626",
            }} />
            <span style={{
              fontSize: "12px", flex: 1,
              color: effectiveTerminalStatus === "COMPLETED" ? "#15803d" : "#b91c1c",
            }}>
              {effectiveTerminalStatus === "COMPLETED"
                ? (activeItemId ? "MO này đã Hoàn tất — không thể chỉnh sửa." : "Đơn này đã Hoàn tất — không thể chỉnh sửa. Đơn sẽ tự biến khỏi danh sách sau khi đồng bộ.")
                : (activeItemId ? "MO này đã bị Hủy — không thể chỉnh sửa." : "Đơn này đã bị Hủy — không thể chỉnh sửa.")}
            </span>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["orders-snapshot"] })}
              style={{
                fontSize: "11px", fontWeight: 600,
                color: effectiveTerminalStatus === "COMPLETED" ? "#16a34a" : "#dc2626",
                background: "none", border: "none", cursor: "pointer",
                padding: "0", textDecoration: "underline", whiteSpace: "nowrap",
              }}
            >
              Đồng bộ ngay
            </button>
            {(currentUserRole === "ADMIN" || currentUserRole === "ORDER") && (
              <button
                type="button"
                onClick={() => { setReopenReason(""); setReopenTarget("PSX"); setShowReopen(true); }}
                className="psx-btn-secondary"
                style={{ height: "26px", fontSize: "11px", whiteSpace: "nowrap", flexShrink: 0 }}
              >
                Mở lại đơn
              </button>
            )}
          </div>
        )}

        {/* ── Admin Override trigger — tách RIÊNG khỏi dòng nút chính (Mở lại đơn là hành
             động state-machine chính; Override là "cửa sau" ít dùng, cố ý để nhạt hơn để
             không cạnh tranh visual weight với luồng thao tác thông thường). ── */}
        {effectiveTerminal && order && currentUserRole === "ADMIN" && !adminOverrideActive && (
          <div className="shrink-0" style={{
            display: "flex", justifyContent: "flex-end",
            padding: "4px 14px", background: "var(--cream-card, #fff)",
            borderBottom: "1px solid var(--border-light, #f0ede8)",
          }}>
            <button
              type="button"
              onClick={() => setAdminOverrideActive(true)}
              title="Sửa lại dữ liệu nhập sai — KHÔNG đổi trạng thái Hoàn tất/Hủy. Bắt buộc ghi lý do."
              style={{
                fontSize: "10.5px", color: "var(--ink-muted)",
                background: "none", border: "none", cursor: "pointer",
                padding: "2px 0", textDecoration: "underline", whiteSpace: "nowrap",
              }}
            >
              🔓 Sửa dữ liệu nhập sai (Admin)
            </button>
          </div>
        )}

        {/* ── Banner "đang ở chế độ Admin Override" — nhắc rõ đang sửa MO đã chốt ── */}
        {adminOverrideActive && (
          <div className="shrink-0" style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "8px 14px", background: "rgba(147,51,234,0.07)",
            borderBottom: "1px solid #d8b4fe", borderLeft: "3px solid #9333ea",
          }}>
            <span style={{ fontSize: "12px", flex: 1, color: "#7e22ce" }}>
              🔓 Đang sửa dữ liệu MO đã chốt (Admin Override). Khi Lưu, bạn sẽ được yêu cầu nhập lý do — mọi thay đổi sẽ được ghi vào Lịch sử thay đổi để soát cuối tháng.
            </span>
            <button
              type="button"
              onClick={() => { setAdminOverrideActive(false); setAdminOverrideReason(""); setShowAdminOverrideReasonPrompt(false); }}
              style={{
                fontSize: "11px", fontWeight: 600, color: "#7e22ce",
                background: "none", border: "none", cursor: "pointer",
                padding: "0", textDecoration: "underline", whiteSpace: "nowrap",
              }}
            >
              Thoát chế độ sửa
            </button>
          </div>
        )}

        {/* ── Dialog bắt buộc nhập lý do trước khi lưu Admin Override ── */}
        {showAdminOverrideReasonPrompt && (
          <div className="shrink-0" style={{
            padding: "12px 14px", background: "rgba(147,51,234,0.06)",
            borderBottom: "1px solid #d8b4fe", borderLeft: "3px solid #9333ea",
            display: "flex", flexDirection: "column", gap: "8px",
          }}>
            <p style={{ fontSize: "12px", fontWeight: 600, color: "#7e22ce", margin: 0 }}>
              Lý do sửa dữ liệu {activeItemId ? `MO ${activeItem?.moNumber ?? ""}` : "đơn hàng"} đã chốt (bắt buộc):
            </p>
            <textarea value={adminOverrideReason} onChange={(e) => setAdminOverrideReason(e.target.value)}
              placeholder="VD: User chọn nhầm ngày, sửa lại theo yêu cầu…" rows={2}
              className="psx-input" style={{ fontSize: "12px", resize: "none" }} autoFocus />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowAdminOverrideReasonPrompt(false)}
                className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                {L.ui.panel.cancel}
              </button>
              <button type="button"
                onClick={() => { setShowAdminOverrideReasonPrompt(false); handleMhSave(); }}
                disabled={!adminOverrideReason.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50">
                Xác nhận lưu
              </button>
            </div>
          </div>
        )}

        {/* ── Dialog "Mở lại đơn" (ADMIN/ORDER) — đưa MO terminal về PSX hoặc PTK ── */}
        {showReopen && order && (
          <div className="shrink-0" style={{
            padding: "12px 14px", background: "#eff6ff",
            borderBottom: "1px solid #bfdbfe", borderLeft: "3px solid #2563eb",
            display: "flex", flexDirection: "column", gap: "8px",
          }}>
            <p style={{ fontSize: "12px", fontWeight: 600, color: "#1d4ed8", margin: 0 }}>
              Mở lại {activeItemId ? `MO ${activeItem?.moNumber ?? ""}` : "đơn hàng"} về:
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              {(["PSX", "PTK"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setReopenTarget(t)}
                  style={{
                    padding: "4px 12px", fontSize: "12px", cursor: "pointer", borderRadius: "6px",
                    background: reopenTarget === t ? "#2563eb" : "#fff",
                    color: reopenTarget === t ? "#fff" : "#334155",
                    border: `1px solid ${reopenTarget === t ? "#2563eb" : "#cbd5e1"}`,
                  }}>
                  {t === "PSX" ? "Phòng Sản Xuất" : "Phòng Thiết Kế"}
                </button>
              ))}
            </div>
            {reopenTarget === "PTK" && effectiveZone === "MASTER_HUB" && (
              <p style={{ fontSize: "11px", color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", padding: "6px 8px", margin: 0 }}>
                ⚠ Về Phòng Thiết Kế: các dữ liệu sản xuất (tiến độ, kỹ thuật, kết quả, đánh giá khâu, Ngày HT…) sẽ <strong>không hiển thị/sửa được</strong> ở PTK. Dữ liệu <strong>vẫn được lưu giữ</strong> và hiện lại nếu chuyển MO về PSX.
              </p>
            )}
            <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Lý do mở lại (bắt buộc)…" rows={2}
              className="psx-input" style={{ fontSize: "12px", resize: "none" }} />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowReopen(false)}
                className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                {L.ui.panel.cancel}
              </button>
              <button type="button" onClick={handleReopen} disabled={!reopenReason.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                Xác nhận mở lại
              </button>
            </div>
          </div>
        )}

        {/* ── Cảnh Báo ĐB sticky banner (MASTER_HUB only) ─────────────────── */}
        {/* Sticky banner: hiển thị khi có alert chưa giải quyết (từ hệ thống Cảnh báo) */}
        {order && !isLoading && (() => {
          const activeAlerts = (order.alerts || []).filter((a) => !a.isResolved);
          if (activeAlerts.length === 0) return null;
          const first = activeAlerts[0];
          return (
            <div style={{
              flexShrink: 0, display: "flex", alignItems: "flex-start", gap: "8px",
              padding: "8px 14px", background: "#FFFBEB",
              borderBottom: "1px solid #FCD34D", borderLeft: "3px solid #F59E0B",
            }}>
              <span style={{ fontSize: "14px", flexShrink: 0, marginTop: "1px" }}>⚠</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#92400E", margin: "0 0 2px" }}>
                  Cảnh báo đặc biệt {activeAlerts.length > 1 ? `(${activeAlerts.length})` : ""}
                </p>
                <p style={{ fontSize: "12px", color: "#78350F", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                  {first.title}{first.description ? ` — ${first.description}` : ""}
                </p>
              </div>
            </div>
          );
        })()}

        {/* ── Tab bar ──────────────────────────────────────────────────────────
             `length > 1`: một vai chỉ thấy đúng một tab thì thanh tab là một điều khiển không
             làm được gì, và nó chiếm đúng chỗ ta đang muốn đưa họ tới (xem R&D ở panel PSX). */}
        {order && !isLoading && !isMhOrder && ptkTabs.length > 1 && (
          <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border)", background: "var(--cream-card)" }}>
            {ptkTabs.map((t) => ({
              key: t.key,
              label: t.raw ? t.label : (L.ui.panel as Record<string, string>)[t.label],
              icon: PANEL_TAB_ICON[t.key],
            })).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                  padding: "10px 4px", fontSize: "10px", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  background: "transparent", border: "none", cursor: "pointer",
                  borderBottom: activeTab === tab.key ? "2px solid var(--pink)" : "2px solid transparent",
                  color: activeTab === tab.key ? "var(--ink)" : "var(--ink-muted)",
                  marginBottom: "-1px", transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {tab.icon}
                {tab.label}
                {tab.key === "items" && dirtyItemIds.size > 0 && (
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--pink)", marginLeft: "2px" }} />
                )}
                {tab.key === "thietke" && isDesignDirty && (
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--pink)", marginLeft: "2px" }} />
                )}
                {tab.key === "history" && (order.workflowHistory || []).length > 0 && (
                  <span style={{ fontSize: "9px", background: "var(--cream-dark)", color: "var(--ink-muted)", padding: "0 4px", marginLeft: "2px" }}>
                    {(order.workflowHistory || []).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── MASTER_HUB Tab bar ────────────────────────────────────────────── */}
        {order && !isLoading && isMhOrder && mhTabs.length > 1 && (
          <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border)", background: "var(--cream-card)" }}>
            {mhTabs.map((t) => ({
              key: t.key,
              label: t.raw ? t.label : (L.ui.panel as Record<string, string>)[t.label],
              icon: PANEL_TAB_ICON[t.key],
            })).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMhTab(tab.key)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                  padding: "10px 4px", fontSize: "9px", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  background: "transparent", border: "none", cursor: "pointer",
                  borderBottom: mhTab === tab.key ? "2px solid var(--pink)" : "2px solid transparent",
                  color: mhTab === tab.key ? "var(--ink)" : "var(--ink-muted)",
                  marginBottom: "-1px", transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div id="panel-body-content" className="flex-1 overflow-y-auto">

          {isError && (
            <div style={{ padding: "32px", textAlign: "center" }}>
              <AlertCircle style={{ width: "32px", height: "32px", color: "var(--s-red)", margin: "0 auto 8px" }} />
              <p style={{ fontSize: "13px", color: "var(--ink-muted)", marginBottom: "12px" }}>{L.ui.panel.loadError}</p>
              <button type="button" onClick={() => refetch()} style={{ fontSize: "12px", color: "var(--pink)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                {L.ui.panel.retry}
              </button>
            </div>
          )}

          {isLoading && (
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div className="psx-shimmer" style={{ height: "10px", width: "80px", background: "var(--cream-dark)" }} />
                  <div className="psx-shimmer" style={{ height: "28px", width: "100%", background: "var(--cream-dark)" }} />
                </div>
              ))}
            </div>
          )}

          {order && form && !isLoading && !isMhOrder && (
            <>
              {/* ══ PRE_PRODUCTION: TAB ĐƠN HÀNG ═════════════════════════ */}
              {activeTab === "info" && (
                <div className="p-4 space-y-5">
                  {activeItemSuspended && (
                    <Banner variant="red">Đơn đang TẠM NGƯNG — không thể cập nhật hoặc chuyển xưởng.</Banner>
                  )}
                  {isMoInProductionStage && (
                    <Banner variant="amber">
                      {/* Câu chữ phải khớp với luật thật, nếu không nó là một lời nói dối trên màn
                          hình: ô còn TRỐNG vẫn điền được. Bản cũ ghi "không thể thay đổi" cả khi
                          MO này còn chưa vào sản xuất — người dùng tin rồi đi tìm cách khác. */}
                      MO này đã vào sản xuất — Khách hàng và Sales đã có thì không đổi được nữa, còn trống thì vẫn điền được.
                    </Banner>
                  )}

                  {/* V2 ref: col 3 MO# định danh chính; col 2 SO# phụ */}
                  <div className="grid grid-cols-2 gap-3 text-xs p-3" style={{ background: "var(--cream-dark)", border: "1px solid var(--border)" }}>
                    <div>
                      <p className="psx-label" style={{ marginBottom: "2px" }}>MO#</p>
                      <p style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--ink)" }}>
                        {formatMoVersionedDisplay((activeItem?.moNumber ?? order.items[0]?.moNumber) ?? order.orderNumber, order.createdBy != null)}
                      </p>
                      {(activeItem?.moNumber ?? order.items[0]?.moNumber) && (activeItem?.moNumber ?? order.items[0]?.moNumber) !== order.orderNumber && (
                        <p style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--ink-muted)", marginTop: "2px" }}>SO: {getBaseSoNumber(order.orderNumber)}</p>
                      )}
                    </div>
                    <div>
                      <p className="psx-label" style={{ marginBottom: "2px" }}>{L.ui.panel.fieldCreatedDate}</p>
                      <p style={{ color: "var(--ink-body)", fontSize: "12px" }}>{formatDate(activeItem?.orderDate ?? order.orderDate)}</p>
                    </div>
                  </div>

                  {/* Khách hàng/Sales — riêng theo MO, mặc định ăn theo SO nếu không sửa */}
                  <div className="space-y-1 rounded-lg p-3" style={{ background: "var(--cream-dark)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="psx-label">{L.ui.panel.sectionCustomer}</p>
                      <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--s-gold)", background: "rgba(138,106,26,0.1)", border: "1px solid rgba(138,106,26,0.3)", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Riêng theo MO
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs" data-fieldname="khách hàng sales">
                      <Field label={L.ui.panel.fieldCustomer}>
                        <input type="text" value={effectiveItemForm?.customerName ?? ""}
                          disabled={activeItemSuspended || isWorking || isReadOnly || customerLocked || !effectiveItemId}
                          onChange={(e) => effectiveItemId && updateItemForm(effectiveItemId, { customerName: e.target.value })}
                          className={inputCls(activeItemSuspended)} />
                      </Field>
                      <Field label={L.ui.panel.fieldSales}>
                        <input type="text" value={effectiveItemForm?.salesName ?? ""}
                          disabled={activeItemSuspended || isWorking || isReadOnly || salesLocked || !effectiveItemId}
                          onChange={(e) => effectiveItemId && updateItemForm(effectiveItemId, { salesName: e.target.value })}
                          className={inputCls(activeItemSuspended)} />
                      </Field>
                    </div>
                  </div>

                  {/* Theo dõi BOM — dùng chung cụm bomCluster (PTK + PSX) */}
                  {bomCluster}

                  {/* Phân loại KH / Nguồn — dùng chung cho cả SO, chỉ ADMIN/Bộ phận đặt đơn sửa được */}
                  <div className="space-y-1 rounded-lg p-3" style={{ background: "var(--cream-dark)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="psx-label">&nbsp;</p>
                      {canEditSoMeta ? (
                        <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--s-gold)", background: "#FEF3C7", border: "1px solid #FCD34D", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {L.ui.panel.canEdit} — chung SO
                        </span>
                      ) : (
                        <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--s-red)", background: "#FEE2E2", border: "1px solid #FCA5A5", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {L.ui.panel.cantEdit} — chung SO
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs" data-fieldname="phân loại kh nguồn">
                      {canEditSoMeta ? (
                        <>
                          <Field label={L.ui.panel.fieldCustomerType}>
                            <select value={form.phanLoaiKh ?? ""}
                              disabled={activeItemSuspended || isWorking || isReadOnly}
                              onChange={(e) => updateForm("phanLoaiKh", e.target.value)}
                              className={inputCls(activeItemSuspended)}>
                              <option value="">{L.ui.form.select}</option>
                              {/* Giá trị cũ ngoài danh mục (VD "SR.CH1") — hiện nguyên trạng để không mất */}
                              {form.phanLoaiKh && !PHAN_LOAI_KH_OPTIONS.includes(form.phanLoaiKh) && (
                                <option value={form.phanLoaiKh}>{form.phanLoaiKh}</option>
                              )}
                              {PHAN_LOAI_KH_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </Field>
                          <Field label={L.ui.panel.fieldSource}>
                            <select value={form.nguon ?? ""}
                              disabled={activeItemSuspended || isWorking || isReadOnly}
                              onChange={(e) => updateForm("nguon", e.target.value)}
                              className={inputCls(activeItemSuspended)}>
                              <option value="">{L.ui.form.select}</option>
                              {form.nguon && !storeOptions.some((s) => s.code === form.nguon) && (
                                <option value={form.nguon}>{form.nguon}</option>
                              )}
                              {storeOptions.map((s) => <option key={s.id} value={s.code}>{s.code}</option>)}
                            </select>
                          </Field>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="psx-label" style={{ marginBottom: "2px" }}>{L.ui.panel.fieldCustomerType}</p>
                            <p style={{ color: "var(--ink-body)", fontSize: "12px" }}>{order.phanLoaiKh || "—"}</p>
                          </div>
                          <div>
                            <p className="psx-label" style={{ marginBottom: "2px" }}>{L.ui.panel.fieldSource}</p>
                            <p style={{ color: "var(--ink-body)", fontSize: "12px" }}>{order.nguon || "—"}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* SHARED fields — editable, áp dụng cho cả SO */}
                  <SectionLabel editable>{L.ui.panel.sectionGeneral}</SectionLabel>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3" data-fieldname="3 sao link chat">
                      <Field label={L.ui.panel.fieldStarOrder}>
                        <select value={form.donHang3Sao ? "true" : "false"}
                          disabled={activeItemSuspended || isWorking || isReadOnly}
                          onChange={(e) => updateForm("donHang3Sao", e.target.value === "true")}
                          className={inputCls(activeItemSuspended)}>
                          <option value="false">{L.ui.panel.no}</option>
                          <option value="true">{L.ui.panel.yes}</option>
                        </select>
                      </Field>
                    </div>
                    <div data-fieldname="link chat">
                      <Field label={L.ui.panel.fieldChatLink}>
                        <input type="text" value={form.linkChat}
                          disabled={activeItemSuspended || isWorking || isReadOnly}
                          onChange={(e) => updateForm("linkChat", e.target.value)}
                          className={inputCls(activeItemSuspended)}
                          placeholder="https://zalo.me/..." />
                      </Field>
                    </div>
                  </div>

                  {/* PER-MO fields — mỗi MO độc lập */}
                  <hr className="border-gray-100" />
                  <SectionLabel editable>{L.ui.panel.sectionTimeline}</SectionLabel>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3" data-fieldname="ưu tiên">
                      <Field label={L.ui.panel.fieldPriority}>
                        <select value={effectiveItemForm?.priorityCode || "Normal"}
                          disabled={activeItemSuspended || isWorking || isReadOnly || !effectiveItemId}
                          onChange={(e) => effectiveItemId && updateItemForm(effectiveItemId, { priorityCode: e.target.value })}
                          className={inputCls(activeItemSuspended)}>
                          {PRIORITY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{L.priority[opt.value] ?? opt.label}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3" data-fieldname="ngày chốt sx ngày dự kiến hoàn thành">
                      <Field label={L.ui.panel.fieldCommitDate}>
                        <DateInput
                          value={effectiveItemForm?.estimatedDate ?? ""}
                          disabled={activeItemSuspended || isWorking || isReadOnly || !effectiveItemId}
                          onChange={(v) => effectiveItemId && updateItemForm(effectiveItemId, { estimatedDate: v })}
                          className={inputCls(activeItemSuspended)} />
                      </Field>
                      <Field label={L.ui.panel.fieldRequiredDate}>
                        <DateInput
                          value={effectiveItemForm?.requiredDate ?? ""}
                          disabled={activeItemSuspended || isWorking || isReadOnly || !effectiveItemId}
                          onChange={(v) => effectiveItemId && updateItemForm(effectiveItemId, { requiredDate: v })}
                          className={inputCls(activeItemSuspended)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3" data-fieldname="tuần dự kiến">
                      <Field label={L.ui.panel.fieldEstWeek}>
                        <input type="text" value={tuanDuKien() ?? "—"} readOnly disabled
                          className={inputCls(true)} placeholder="—" />
                      </Field>
                    </div>
                  </div>
                </div>
              )}

              {/* ══ PRE_PRODUCTION: TAB SẢN PHẨM ═════════════════════════ */}
              {activeTab === "items" && (
                <PreItemsTab
                  order={order}
                  itemForms={itemForms}
                  dirtyItemIds={dirtyItemIds}
                  isWorking={isWorking}
                  updateItemForm={updateItemForm}
                  activeItemId={activeItemId}
                  activeItemSuspended={activeItemSuspended}
                  currentUserRole={currentUserRole}
                  onItemSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ["order-panel", orderId] });
                    // 🔴 VÀ BÁO CHO DANH SÁCH. Làm mới mỗi panel là lỗi đã xảy ra thật: R&D lưu
                    // Mã số mẫu xong, panel hiện đúng nhưng cột ở bảng vẫn "—" vì bảng đọc một
                    // khoá React Query KHÁC. Nhìn từ ngoài, "lưu hỏng" và "lưu xong nhưng bảng
                    // đứng yên" không phân biệt được với nhau.
                    //
                    // Dùng kênh ĐÃ CÓ chứ không dựng cái thứ hai: `onOrderUpdated` vừa vô hiệu
                    // snapshot của tab đang mở, vừa nhấp nháy dòng vừa đổi — người dùng THẤY
                    // dòng nào vừa cập nhật.
                    onOrderUpdated?.();
                  }}
                />
              )}

              {/* ══ PRE_PRODUCTION: TAB THIẾT KẾ ══════════════════════════ */}
              {activeTab === "thietke" && (
                <div className="p-4 space-y-5">

                  {/* Section 1: Thông tin nhận việc */}
                  <SectionLabel editable>Thông tin nhận việc</SectionLabel>

                  <div className="space-y-3">
                    {/* ─── ƯU TIÊN THIẾT KẾ 3D ────────────────────────────────────────
                        ĐẶT Ở ĐẦU TAB THIẾT KẾ, không ở tab Đơn hàng cạnh ô "Ưu tiên" của đơn.
                        Hai ô cùng tên nằm cạnh nhau thì người dùng đọc thành "một ô bị lặp" và
                        sẽ đặt sai một trong hai. Ở đây ngữ cảnh tự nói lên nó là ưu tiên của
                        việc thiết kế — và đây cũng là nơi người ta đang giao việc.

                        Chỉ ADMIN/ORDER sửa được: NV 3D không tự xếp thứ tự việc của mình. Với
                        role khác thì hiện dạng chỉ đọc — họ VẪN CẦN THẤY (thợ nguội, sản xuất
                        cần biết MO nào đang được ưu tiên dựng), chỉ không được đổi. */}
                    {effectiveItemId && effectiveItemForm && (
                      <div data-fieldname="ưu tiên thiết kế 3d ut1 ut2">
                        <Field label="Ưu tiên thiết kế 3D">
                          {(currentUserRole === "ADMIN" || currentUserRole === "ORDER") ? (
                            <select
                              value={effectiveItemForm.design3DPriorityCode || "Normal"}
                              disabled={isWorking || isReadOnly}
                              onChange={(e) => updateItemForm(effectiveItemId, { design3DPriorityCode: e.target.value })}
                              className={inputCls(false)}
                            >
                              {DESIGN_PRIORITY_CODES.map((code) => (
                                <option key={code} value={code}>{DESIGN_PRIORITY_LABELS[code]}</option>
                              ))}
                            </select>
                          ) : (
                            <div className={inputCls(true)} style={{ minHeight: "36px", lineHeight: "36px" }}>
                              {DESIGN_PRIORITY_LABELS[toDesignPriority(effectiveItemForm.design3DPriorityCode)]}
                            </div>
                          )}
                          {/* Đơn GẤP với khách mà thiết kế chưa được xếp ưu tiên → nó nằm giữa
                              hàng như việc thường và KHÔNG có gì trên màn hình nói ra điều đó.
                              Chỉ nhắc, KHÔNG tự nâng hộ: nâng hộ là đồng bộ ngầm giữa hai trục
                              độc lập, đúng thứ đã loại bỏ khi thiết kế tính năng này. */}
                          {designPriorityNeedsAttention({
                            orderPriorityCode: effectiveItemForm.priorityCode,
                            designPriorityCode: effectiveItemForm.design3DPriorityCode,
                          }) && (
                            <p className="mt-1.5 text-[11px]" style={{ color: "var(--accent-warn, #b45309)" }}>
                              Đơn hàng đang {effectiveItemForm.priorityCode} với khách, nhưng thiết kế chưa được xếp ưu tiên.
                            </p>
                          )}
                        </Field>
                      </div>
                    )}

                    <div data-fieldname="yêu cầu thiết kế">
                      <Field label="Yêu cầu thiết kế">
                        <select
                          value={designForm.yeucauThietKe}
                          disabled={isWorking || isReadOnly}
                          onChange={(e) => updateDesignForm("yeucauThietKe", e.target.value)}
                          className={inputCls(false)}
                        >
                          <option value="">—</option>
                          {DESIGN_REQUEST_OPTIONS.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <div data-fieldname="yêu cầu chi tiết kỹ thuật">
                      <Field label="Yêu cầu chi tiết KT">
                        <textarea
                          value={designForm.yeucauKyThuat}
                          disabled={isWorking || isReadOnly}
                          rows={2}
                          onChange={(e) => updateDesignForm("yeucauKyThuat", e.target.value)}
                          className={inputCls(false)}
                          placeholder="Chi tiết kỹ thuật..."
                          style={{ resize: "vertical" }}
                        />
                      </Field>
                    </div>

                    {/* ─── Tài liệu tham khảo gửi NV 3D ────────────────────────────────
                        Ở ĐÂY, ngoài các khối nhân viên: đây là thuộc tính của SẢN PHẨM, không
                        phải của người làm. MO có nhiều NV 3D thì cả hai phải nhìn cùng một bộ —
                        đặt vào từng khối thì người thứ hai phải nhập lại, và tệ hơn là hai
                        người có thể đang nhìn hai bộ khác nhau mà không ai biết.

                        Lưu vào OrderItem (không phải extraData) nên đi theo đường lưu của tab
                        Sản phẩm — updateItemForm, cùng một lần bấm Lưu. */}
                    {effectiveItemId && effectiveItemForm && (
                      /* ─── HAI TRƯỜNG XẾP DỌC, KHÔNG PHẢI LƯỚI 2 CỘT ──────────────────
                         Bản trước dùng `grid grid-cols-2` và nhét cả cụm kéo-thả vào NỬA
                         bên trái, cạnh một ô nhập một dòng. Lưới 2 cột chỉ đẹp khi hai ô
                         CÙNG NHỊP; ở đây ô trái cao gấp ba ô phải và hai ô nhập không thẳng
                         hàng nhau — đúng chỗ người dùng chỉ ra là "lệch".

                         Panel này đã có sẵn hai khuôn, và đây là chỗ dùng nhầm khuôn:
                           grid grid-cols-2  → hai Ô NHẬP một dòng, cùng chiều cao
                           div full width    → trường PHỨC HỢP, nhiều thành phần xếp chồng

                         Tính năng anh em "Ảnh / File 3D" (cũng gồm link + ô upload) đã nằm
                         full width từ trước. Theo đúng nó: không còn hai cột thì không thể
                         lệch — sửa nguyên nhân, không cân bằng thủ công từng pixel. */
                      <div className="flex flex-col gap-3">
                        <div data-fieldname="ảnh mẫu tài liệu tham khảo 3d">
                          <Field label="Ảnh mẫu">
                            <SampleImagesUploader
                              orderId={order.id}
                              orderItemId={effectiveItemId}
                              uploads={effectiveItemForm.sampleImageUploads}
                              linkUrl={effectiveItemForm.sampleImageUrl}
                              disabled={isWorking || isReadOnly}
                              onUploadsChange={(next) => updateItemForm(effectiveItemId, { sampleImageUploads: next })}
                              onLinkChange={(v) => updateItemForm(effectiveItemId, { sampleImageUrl: v })}
                            />
                          </Field>
                        </div>

                        {/* FOLDER MẪU — thay cho "Video thực tế".
                            Ý nghĩa đã đổi: không còn là một video mà là một folder Drive chứa
                            nhiều ảnh + video, cho ca Order cần đưa nhiều thông tin cho NV 3D.
                            Ô ảnh mẫu bên trên lo ca phổ biến (một hai tấm); ô này lo ca nặng. */}
                        <div data-fieldname="folder mẫu video thực tế">
                          <Field label="Folder mẫu">
                            <input
                              type="text"
                              value={effectiveItemForm.sampleFolderUrl}
                              disabled={isWorking || isReadOnly}
                              onChange={(e) => updateItemForm(effectiveItemId, { sampleFolderUrl: e.target.value })}
                              className={inputCls(false)}
                              placeholder="https://drive.google.com/drive/folders/..."
                            />
                            {/* Đường mở nhanh, dạng liên kết chữ — KHÔNG bọc hộp có viền như
                                bản trước: một hộp viền cạnh một ô nhập đọc như hai control,
                                trong khi nó chỉ là lối ra của chính ô ngay trên. */}
                            {effectiveItemForm.sampleFolderUrl.trim() && (
                              <a
                                href={effectiveItemForm.sampleFolderUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                Mở folder mẫu
                              </a>
                            )}
                          </Field>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3" data-fieldname="nhóm sản phẩm dòng sản phẩm">
                      <Field label="Nhóm SP">
                        <select
                          value={designForm.nhomSP3D}
                          disabled={isWorking || isReadOnly}
                          onChange={(e) => updateDesignForm("nhomSP3D", e.target.value)}
                          className={inputCls(false)}
                        >
                          <option value="">—</option>
                          {NHOM_SP_3D_OPTIONS.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Dòng SP">
                        <select
                          value={designForm.dongSP3D}
                          disabled={isWorking || isReadOnly || designForm.nhomSP3D !== "Trang sức"}
                          onChange={(e) => updateDesignForm("dongSP3D", e.target.value)}
                          className={inputCls(false)}
                        >
                          <option value="">—</option>
                          {designForm.nhomSP3D === "Trang sức" && DONG_SP_TRANG_SUC.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </Field>
                    </div>

                  </div>

                  <hr className="border-gray-100" />

                  {/* ─── Section 2: NHÂN VIÊN THIẾT KẾ 3D ─────────────────────────────
                      Một MO có thể cần nhiều người thiết kế, mỗi người có mốc giao riêng và
                      được chấm KPI riêng. Nên mỗi người là MỘT khối đầy đủ: giao việc → kết
                      quả → kiểm nội bộ.

                      Trước đây người thứ nhất nằm rải trong section "Thông tin nhận việc" rồi
                      nửa còn lại ở section "Kết quả thực hiện", trong khi người thứ hai là một
                      khối riêng viết tay lần nữa. Hai bản viết tay lệch nhau 6 trường — nặng
                      nhất là người thứ hai không có nút Kiểm nội bộ nên Order không duyệt được
                      kết quả của họ. Nay tất cả dùng chung Designer3DCard. */}
                  {renderDesignerBlocks(isReadOnly)}
                </div>
              )}

              {/* ══ PRE_PRODUCTION: TAB TRẠNG THÁI ════════════════════════ */}
              {activeTab === "status" && (
                <div className="p-4 space-y-5">
                  <div>
                    <SectionLabel editable>{L.ui.panel.sectionStatus}</SectionLabel>
                    <div className="mt-3 space-y-3">
                      <div data-fieldname="trạng thái mo">
                        <Field label={L.ui.panel.fieldStatusMo}>
                          <select value={form.status}
                            disabled={activeItemSuspended || isWorking || isReadOnly}
                            onChange={(e) => updateForm("status", e.target.value as OrderStatus)}
                            className={cn(
                              inputCls(activeItemSuspended),
                              form.status === "DESIGN_APPROVED" ? "border-green-400 bg-green-50 text-green-800 font-semibold" :
                              form.status === "CANCELLED" ? "border-red-300 bg-red-50 text-red-700" : ""
                            )}>
                            {(() => {
                              const isKnownPtkStatus = PRE_STATUSES.some((s) => s.value === form.status);
                              const opts = isKnownPtkStatus
                                ? PRE_STATUSES.filter(
                                    (s) => selectableStatuses(form.status, "PRE_PRODUCTION").includes(s.value)
                                  )
                                : PRE_STATUSES;
                              return (
                                <>
                                  {!isKnownPtkStatus && (
                                    <option value={form.status} disabled>{L.ui.panel.statusPlaceholder}</option>
                                  )}
                                  {opts.map((s) => (
                                    <option key={s.value} value={s.value}>{L.status[s.value] ?? s.label}</option>
                                  ))}
                                </>
                              );
                            })()}
                          </select>
                        </Field>
                      </div>
                    </div>
                  </div>

                  <hr className="border-gray-100" />

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <p className="psx-label">{L.ui.panel.sectionAlerts}</p>
                      {/* Cảnh báo chỉ dành cho PSX — không hiện nút tạo ở PTK */}
                    </div>
                    <div data-fieldname="cảnh báo đặc biệt ghi chú sales" className="space-y-1.5">
                      {(() => {
                        const latest = (order.alerts || []).filter((a) => !a.isResolved)[0];
                        const total = (order.alerts || []).filter((a) => !a.isResolved).length;
                        if (!latest) return (
                          <p style={{ fontSize: "12px", color: "var(--ink-muted)", fontStyle: "italic" }}>
                            Không có cảnh báo — vào <strong>mục Cảnh báo</strong> để tạo.
                          </p>
                        );
                        return (
                          <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-red-700">{latest.title}</p>
                                {total > 1 && <span style={{ fontSize: "9px", color: "var(--s-red)", border: "1px solid var(--s-red)", padding: "0 4px" }}>{total} {L.ui.panel.alertCount}</span>}
                              </div>
                              {latest.description && <p className="text-red-500 mt-0.5">{latest.description}</p>}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {effectiveZone === "PRE_PRODUCTION" && (
                    <>
                      <hr className="border-gray-100" />
                      <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 space-y-2">
                        <p className="text-xs font-bold text-teal-800 uppercase tracking-wider">{L.ui.panel.sectionPromote}</p>
                        <p className="text-xs text-teal-700 leading-relaxed">
                          Chốt thiết kế xong → chuyển đơn hàng này sang tab <strong>Sản xuất</strong> để
                          bắt đầu chế tác. Hàng sẽ được thêm vào danh sách với trạng thái <strong>Đang sản xuất</strong>.
                        </p>
                        {isFormDirty && (
                          <p className="text-xs font-semibold text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            Nhớ lưu mọi thay đổi trước khi chuyển.
                          </p>
                        )}
                        {form.status !== "DESIGN_APPROVED" && !isFormDirty && (
                          <p className="text-xs text-teal-600">
                            Đổi trạng thái sang <strong>Chốt 3D — Chuyển xưởng</strong> để kích hoạt nút chuyển.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ══ PRE_PRODUCTION: TAB LỊCH SỬ ════════════════════════════ */}
              {activeTab === "history" && (
                <HistoryTab order={order} />
              )}
            </>
          )}

          {/* ══════════════════ MASTER_HUB TABS ════════════════════════════ */}
          {order && form && productionForm && !isLoading && isMhOrder && (
            <>
              {/* ── MH TAB ĐƠN HÀNG ──────────────────────────────────────── */}
              {mhTab === "info" && (
                <div className="p-4 space-y-5">
                  {/* SO# + MO# */}
                  <div className="grid grid-cols-2 gap-3 text-xs p-3" style={{ background: "var(--cream-dark)", border: "1px solid var(--border)" }}>
                    <div>
                      <p className="psx-label" style={{ marginBottom: "2px" }}>SO#</p>
                      <p style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--ink)" }}>{getBaseSoNumber(order.orderNumber)}</p>
                    </div>
                    <div>
                      <p className="psx-label" style={{ marginBottom: "2px" }}>MO#</p>
                      <p style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--ink)" }}>{formatMoVersionedDisplay(activeItem?.moNumber ?? mo?.productionCode, order.createdBy != null) || "—"}</p>
                    </div>
                    <div>
                      <p className="psx-label" style={{ marginBottom: "2px" }}>{L.ui.panel.fieldCreatedDate}</p>
                      <p style={{ color: "var(--ink-body)", fontSize: "12px" }}>{formatDate(activeItem?.orderDate ?? order.orderDate)}</p>
                    </div>
                    <div>
                      <p className="psx-label" style={{ marginBottom: "2px" }}>{L.ui.panel.fieldCommitDate}</p>
                      <p style={{ color: "var(--ink-body)", fontSize: "12px" }}>{effectiveItemForm?.estimatedDate ? formatDate(effectiveItemForm.estimatedDate) : "—"}</p>
                    </div>
                    <div>
                      <p className="psx-label" style={{ marginBottom: "2px" }}>{L.ui.panel.fieldRequiredDate}</p>
                      <p style={{ color: "var(--ink-body)", fontSize: "12px" }}>{effectiveItemForm?.requiredDate ? formatDate(effectiveItemForm.requiredDate) : "—"}</p>
                    </div>
                    <div>
                      <p className="psx-label" style={{ marginBottom: "2px" }}>Tuần DK hoàn thành</p>
                      <p style={{ color: "var(--ink-body)", fontSize: "12px" }}>
                        {effectiveItemForm?.requiredDate ? (() => {
                          const d = new Date(effectiveItemForm.requiredDate);
                          return isNaN(d.getTime()) ? "—" : `Tuần ${getISOWeek(d)} / ${d.getFullYear()}`;
                        })() : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Khách hàng/Sales — riêng theo MO, mặc định ăn theo SO nếu không sửa */}
                  <div className="space-y-1 rounded-lg p-3" style={{ background: "var(--cream-dark)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="psx-label">{L.ui.panel.sectionCustomer}</p>
                      <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--s-gold)", background: "rgba(138,106,26,0.1)", border: "1px solid rgba(138,106,26,0.3)", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Riêng theo MO
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs" data-fieldname="khách hàng sales">
                      <Field label={L.ui.panel.fieldCustomer}>
                        <input type="text" value={effectiveItemForm?.customerName ?? ""}
                          disabled={activeItemSuspended || isWorking || isReadOnly || customerLocked || !effectiveItemId}
                          onChange={(e) => effectiveItemId && updateItemForm(effectiveItemId, { customerName: e.target.value })}
                          className={inputCls(activeItemSuspended)} />
                      </Field>
                      <Field label={L.ui.panel.fieldSales}>
                        <input type="text" value={effectiveItemForm?.salesName ?? ""}
                          disabled={activeItemSuspended || isWorking || isReadOnly || salesLocked || !effectiveItemId}
                          onChange={(e) => effectiveItemId && updateItemForm(effectiveItemId, { salesName: e.target.value })}
                          className={inputCls(activeItemSuspended)} />
                      </Field>
                    </div>
                  </div>

                  {/* Theo dõi BOM — hiện cả ở PSX: BOM đi theo MO qua các zone (cùng cụm bomCluster với PTK) */}
                  {bomCluster}

                  {/* Phân loại KH / Nguồn — dùng chung cho cả SO, chỉ ADMIN/Bộ phận đặt đơn sửa được */}
                  <div className="space-y-1 rounded-lg p-3" style={{ background: "var(--cream-dark)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="psx-label">&nbsp;</p>
                      {canEditSoMeta ? (
                        <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--s-gold)", background: "#FEF3C7", border: "1px solid #FCD34D", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {L.ui.panel.canEdit} — chung SO
                        </span>
                      ) : (
                        <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--s-red)", background: "#FEE2E2", border: "1px solid #FCA5A5", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {L.ui.panel.cantEdit} — chung SO
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs" data-fieldname="phân loại kh nguồn">
                      {canEditSoMeta ? (
                        <>
                          <Field label={L.ui.panel.fieldCustomerType}>
                            <select value={form.phanLoaiKh ?? ""}
                              disabled={activeItemSuspended || isWorking || isReadOnly}
                              onChange={(e) => updateForm("phanLoaiKh", e.target.value)}
                              className={inputCls(activeItemSuspended)}>
                              <option value="">{L.ui.form.select}</option>
                              {/* Giá trị cũ ngoài danh mục (VD "SR.CH1") — hiện nguyên trạng để không mất */}
                              {form.phanLoaiKh && !PHAN_LOAI_KH_OPTIONS.includes(form.phanLoaiKh) && (
                                <option value={form.phanLoaiKh}>{form.phanLoaiKh}</option>
                              )}
                              {PHAN_LOAI_KH_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </Field>
                          <Field label={L.ui.panel.fieldSource}>
                            <select value={form.nguon ?? ""}
                              disabled={activeItemSuspended || isWorking || isReadOnly}
                              onChange={(e) => updateForm("nguon", e.target.value)}
                              className={inputCls(activeItemSuspended)}>
                              <option value="">{L.ui.form.select}</option>
                              {form.nguon && !storeOptions.some((s) => s.code === form.nguon) && (
                                <option value={form.nguon}>{form.nguon}</option>
                              )}
                              {storeOptions.map((s) => <option key={s.id} value={s.code}>{s.code}</option>)}
                            </select>
                          </Field>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="psx-label" style={{ marginBottom: "2px" }}>{L.ui.panel.fieldCustomerType}</p>
                            <p style={{ color: "var(--ink-body)", fontSize: "12px" }}>{order.phanLoaiKh || "—"}</p>
                          </div>
                          <div>
                            <p className="psx-label" style={{ marginBottom: "2px" }}>{L.ui.panel.fieldSource}</p>
                            <p style={{ color: "var(--ink-body)", fontSize: "12px" }}>{order.nguon || "—"}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Per-MO fields editable */}
                  <SectionLabel editable>{L.ui.panel.sectionTimeline}</SectionLabel>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3" data-fieldname="ưu tiên ngày chốt sx">
                      <Field label={L.ui.panel.fieldPriority}>
                        <select value={effectiveItemForm?.priorityCode || "Normal"}
                          disabled={isWorking || isReadOnly || !effectiveItemId}
                          onChange={(e) => effectiveItemId && updateItemForm(effectiveItemId, { priorityCode: e.target.value })}
                          className={inputCls(false)}>
                          {PRIORITY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{L.priority[opt.value] ?? opt.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label={L.ui.panel.fieldCommitDate}>
                        <DateInput
                          value={effectiveItemForm?.estimatedDate ?? ""}
                          disabled={isWorking || isReadOnly || !effectiveItemId}
                          onChange={(v) => effectiveItemId && updateItemForm(effectiveItemId, { estimatedDate: v })}
                          className={inputCls(false)} />
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3" data-fieldname="ngày dk ht">
                      <Field label={L.ui.panel.fieldRequiredDate}>
                        <DateInput
                          value={effectiveItemForm?.requiredDate ?? ""}
                          disabled={isWorking || isReadOnly || !effectiveItemId}
                          onChange={(v) => effectiveItemId && updateItemForm(effectiveItemId, { requiredDate: v })}
                          className={inputCls(false)} />
                      </Field>
                    </div>

                    <div data-fieldname="link chat">
                      <Field label={L.ui.panel.fieldChatLink}>
                        <input type="text" value={form.linkChat}
                          disabled={isWorking || isReadOnly}
                          onChange={(e) => updateForm("linkChat", e.target.value)}
                          className={inputCls(false)}
                          placeholder="https://zalo.me/..." />
                      </Field>
                    </div>
                  </div>

                  {/* Xưởng sản xuất info */}
                  {(mo?.workshopName || mo?.supervisorName) && (
                    <>
                      <hr className="border-gray-100" />
                      <SectionLabel>{L.ui.panel.sectionWorkshop}</SectionLabel>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {mo.workshopName && (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{L.ui.panel.fieldWorkshop}</p>
                            <p className="text-gray-700">{mo.workshopName}</p>
                          </div>
                        )}
                        {mo.supervisorName && (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{L.ui.panel.fieldSupervisor}</p>
                            <p className="text-gray-700">{mo.supervisorName}</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── MH TAB SẢN PHẨM ──────────────────────────────────────── */}
              {mhTab === "items" && (
                <PreItemsTab
                  order={order}
                  itemForms={itemForms}
                  dirtyItemIds={dirtyItemIds}
                  isWorking={isWorking}
                  updateItemForm={updateItemForm}
                  activeItemId={activeItemId}
                  activeItemSuspended={activeItemSuspended}
                  currentUserRole={currentUserRole}
                  onItemSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ["order-panel", orderId] });
                    // 🔴 VÀ BÁO CHO DANH SÁCH. Làm mới mỗi panel là lỗi đã xảy ra thật: R&D lưu
                    // Mã số mẫu xong, panel hiện đúng nhưng cột ở bảng vẫn "—" vì bảng đọc một
                    // khoá React Query KHÁC. Nhìn từ ngoài, "lưu hỏng" và "lưu xong nhưng bảng
                    // đứng yên" không phân biệt được với nhau.
                    //
                    // Dùng kênh ĐÃ CÓ chứ không dựng cái thứ hai: `onOrderUpdated` vừa vô hiệu
                    // snapshot của tab đang mở, vừa nhấp nháy dòng vừa đổi — người dùng THẤY
                    // dòng nào vừa cập nhật.
                    onOrderUpdated?.();
                  }}
                />
              )}

              {/* ── MH TAB THIẾT KẾ (read-only) ─────────────────────────── */}
              {mhTab === "thietke" && (() => {
                const pdEx = (order.productionDetail?.extraData as Record<string, unknown>) ?? {};
                const perItemAll2 = (pdEx.perItem as Record<string, unknown>) ?? {};
                const perItemData2 = activeItemId ? ((perItemAll2[activeItemId] as Record<string, unknown>) ?? {}) : {};
                const perItemDesign2 = (perItemData2.design as Record<string, unknown>) ?? null;
                const sharedDesign2 = (pdEx.design as Record<string, unknown>) ?? {};
                const d = perItemDesign2 ?? sharedDesign2;
                // CÙNG luật với tab Thiết kế bên PTK (xem kpi-3d/designer-name.ts). Bản trước
                // chỉ đọc `pdEx.tho3d` ở GỐC — chỗ lưu cũ hồi thợ 3D dùng chung cả SO. Dữ liệu
                // mới ghi theo từng MO nên ô đó vĩnh viễn rỗng: PSX hiện "—" trong khi PTK hiện
                // đúng tên, cùng một MO. Không mất dữ liệu, chỉ đọc sai chỗ.
                const tho3dVal = resolveDesignerName({
                  assignmentDesignerName: design3DRow?.designer3D?.name,
                  perItemTho3d: perItemData2.tho3d,
                  rootTho3d: pdEx.tho3d,
                });
                const ro = inputCls(true);
                // `fmtNum`/`fmtDate` đã xoá cùng khối vẽ tay — chúng chỉ tồn tại để hiện số liệu
                // lấy từ JSON. Khối dùng chung tự lo phần định dạng, và giữ hàm không ai gọi là
                // để ngỏ đường nhét lại các ô JSON đó mà không phải nghĩ lại vì sao đã bỏ.
                //
                // Có DÒNG GIAO VIỆC là có dữ liệu, kể cả khi JSON trống trơn: MO giao qua màn
                // Việc thiết kế 3D không ghi gì vào JSON, mà đó mới là dữ liệu chấm KPI.
                const hasAnyData = Object.values(d).some(v => v != null && v !== "")
                  || !!tho3dVal
                  || !!design3DRow
                  || closedDesignerBlocks.length > 0;
                return (
                  <div className="p-4 space-y-5">
                    <SectionLabel>Thông tin nhận việc</SectionLabel>

                    {!hasAnyData && (
                      <p className="text-xs text-gray-400 italic">Đơn hàng này chưa có dữ liệu thiết kế.</p>
                    )}

                    {hasAnyData && (
                      <>
                        <div className="space-y-3">
                          <Field label="Yêu cầu thiết kế">
                            <input type="text" disabled value={(d.yeucauThietKe as string) ?? ""} className={ro} placeholder="—" />
                          </Field>

                          <Field label="Yêu cầu chi tiết KT">
                            <textarea disabled rows={2} value={(d.yeucauKyThuat as string) ?? ""} className={ro} placeholder="—" style={{ resize: "none" }} />
                          </Field>

                        </div>

                        <hr className="border-gray-100" />

                        {/* ─── ĐỦ MỌI LẦN THIẾT KẾ — CÙNG MỘT BẢN VỚI PTK ───────────────────
                            Đây là dữ liệu CHẤM KPI cho nhân viên, nên không được rút gọn: MO
                            thiết kế 2 lần thì phải thấy cả 2, mỗi lần một khối đầy đủ, kèm lý do
                            vì sao lần trước đã đóng.

                            Bản trước vẽ tay MỘT khối lấy từ JSON. Hai hỏng cùng lúc:
                              · MO nhiều lần chỉ hiện một — công của lần trước không có ô nào đọc.
                              · Và hiện TRỘN: tên người lấy từ bảng (lần đang chạy) đứng cạnh ngày
                                giao/kết quả lấy từ JSON (lần đầu) — route continue/reassign không
                                ghi lại JSON, đã kiểm cả hai. Một hàng số liệu không có thật.

                            Nay gọi đúng khối của PTK với ro=true. Không còn hai nguồn để trộn, và
                            không có bản viết tay thứ hai để lệch. */}
                        {renderDesignerBlocks(true)}
                      </>
                    )}
                  </div>
                );
              })()}

              {/* ── MH TAB KỸ THUẬT ──────────────────────────────────────── */}
              {mhTab === "kythuat" && (() => {
                const firstItem = activeItemId
                  ? (order.items.find((i) => i.id === activeItemId) ?? order.items[0])
                  : order.items[0];
                const fItem = firstItem ? itemForms[firstItem.id] : null;
                const specs = (firstItem?.specifications ?? {}) as Record<string, unknown>;
                return (
                  <div className="p-4 space-y-4">
                    <SectionLabel editable>{L.ui.panel.sectionTechnicalInfo}</SectionLabel>

                    <div className="space-y-3">
                      {/* Phân loại KT — editable (không có trong sale form, PTK/PSX tự điền) */}
                      <div data-fieldname="phân loại kỹ thuật">
                        <Field label={L.ui.panel.fieldTechClass}>
                          <PhanLoaiKtSelect
                            value={fItem?.techClassification ?? []}
                            onChange={(next) => firstItem && updateItemForm(firstItem.id, { techClassification: next })}
                            disabled={isWorking || isReadOnly}
                          />
                        </Field>
                      </div>

                      {/* Loại hàng + Hình dáng hột — editable (V2: LOAI_HANG + HINH_DANG_HOT) */}
                      <div className="grid grid-cols-2 gap-3" data-fieldname="loại hàng hình dáng hột">
                        <Field label={L.ui.panel.fieldLoaiHang}>
                          <select
                            value={fItem?.loaiHang ?? ""}
                            disabled={isWorking || isReadOnly}
                            onChange={(e) => firstItem && updateItemForm(firstItem.id, { loaiHang: e.target.value })}
                            className={inputCls(false)}>
                            <option value="">— Chọn —</option>
                            {LOAI_HANG_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                            {fItem?.loaiHang && !LOAI_HANG_OPTIONS.includes(fItem.loaiHang) && (
                              <option value={fItem.loaiHang}>{fItem.loaiHang}</option>
                            )}
                          </select>
                        </Field>
                        <Field label={L.ui.panel.fieldStoneShape}>
                          <select
                            value={fItem?.hinhDangHot ?? ""}
                            disabled={isWorking || isReadOnly}
                            onChange={(e) => firstItem && updateItemForm(firstItem.id, { hinhDangHot: e.target.value })}
                            className={inputCls(false)}>
                            <option value="">— Chọn —</option>
                            {L.hinhDangHot.map((v) => <option key={v} value={v}>{v}</option>)}
                            {fItem?.hinhDangHot && !L.hinhDangHot.includes(fItem.hinhDangHot) && (
                              <option value={fItem.hinhDangHot}>{fItem.hinhDangHot}</option>
                            )}
                          </select>
                        </Field>
                      </div>

                      {/* Fields dưới đây chỉ đọc — đã chốt khi vào PSX */}
                      <div className="grid grid-cols-2 gap-3" data-fieldname="loại hột chủ đá chủ">
                        <Field label={L.ui.form.mainStone}>
                          <input type="text" value={fItem?.mainStoneType || "—"}
                            readOnly disabled className={inputCls(true)} />
                        </Field>
                        <Field label={L.ui.panel.fieldMainStone}>
                          <input type="text" value={fItem?.mainStoneSize || "—"}
                            readOnly disabled className={inputCls(true)} />
                        </Field>
                      </div>

                      <div data-fieldname="đá tấm chi tiết">
                        <Field label={L.ui.panel.fieldSlabStone}>
                          <input type="text"
                            value={(specs.chiTietDaTam as string) || fItem?.chiTietDaTam || "—"}
                            readOnly disabled className={inputCls(true)} />
                        </Field>
                      </div>

                      {firstItem?.designFileUrl && (
                        <div data-fieldname="ảnh 3d file link">
                          <Field label={L.ui.form.designFile}>
                            <DesignFilePreview
                              url={firstItem.designFileUrl}
                              linkLabel={L.ui.panel.viewFile3d}
                            />
                          </Field>
                        </div>
                      )}
                    </div>

                    <hr className="border-gray-100" />
                    <SectionLabel editable>{L.ui.panel.sectionProductionDetail}</SectionLabel>

                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3" data-fieldname="sku">
                        <Field label={L.ui.panel.fieldSku}>
                          <input type="text" value={productionForm.sku}
                            disabled={isWorking || isReadOnly}
                            onChange={(e) => updateProductionForm("sku", e.target.value)}
                            className={inputCls(false)}
                            placeholder={L.ui.panel.phSku} />
                        </Field>
                      </div>

                      <div data-fieldname="chi tiết kỹ thuật ghi chú">
                        <Field label={L.ui.panel.fieldChiTietKt}>
                          <textarea value={productionForm.chiTietKt}
                            disabled={isWorking || isReadOnly}
                            onChange={(e) => updateProductionForm("chiTietKt", e.target.value)}
                            rows={3}
                            className={cn(inputCls(false), "resize-none")}
                            placeholder={L.ui.panel.phChiTietKt} />
                        </Field>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── MH TAB SẢN XUẤT ──────────────────────────────────────── */}
              {mhTab === "sanxuat" && (
                <div className="p-4 space-y-4">
                  <SectionLabel editable>{L.ui.panel.sectionWeightStatus}</SectionLabel>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3" data-fieldname="trạng thái mo sản xuất công đoạn hiện tại">
                      <Field label={L.ui.panel.fieldMoStatus}>
                        {(productionForm.moStatus === "COMPLETED" || productionForm.moStatus === "CANCELLED") ? (
                          <div className={cn(
                            inputCls(false),
                            "flex items-center cursor-default select-none",
                            productionForm.moStatus === "COMPLETED" ? "border-green-400 bg-green-50 text-green-800 font-semibold" : "border-gray-300 bg-gray-50 text-gray-500"
                          )}>
                            {L.status[productionForm.moStatus] ?? (productionForm.moStatus === "COMPLETED" ? "Hoàn tất" : "Hủy")}
                          </div>
                        ) : (
                        <select value={productionForm.moStatus}
                          disabled={isWorking || isReadOnly}
                          onChange={(e) => updateProductionForm("moStatus", e.target.value)}
                          className={cn(
                            inputCls(false),
                            productionForm.moStatus === "SUSPENDED"     ? "border-red-300 bg-red-50 text-red-700" :
                            productionForm.moStatus === "IN_PRODUCTION" ? "border-blue-300 bg-blue-50 text-blue-700" : ""
                          )}>
                          {MH_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{L.status[s.value] ?? s.label}</option>
                          ))}
                        </select>
                        )}
                        {productionForm.moStatus === "SUSPENDED" && (
                          <div style={{ display: "flex", gap: "4px", marginTop: "5px", flexWrap: "wrap" }}>
                            {([ ["", "Tạm ngưng"], ["CHO_DX_NL", "Chờ ĐX NL"], ["CHO_NL", "Chờ NL"] ] as const).map(([val, lbl]) => (
                              <button
                                key={val}
                                type="button"
                                disabled={isWorking || isReadOnly}
                                onClick={() => { setHoldReason(val); setIsProductionDirty(true); }}
                                style={{
                                  fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
                                  border: "1px solid",
                                  cursor: isWorking || isReadOnly ? "not-allowed" : "pointer",
                                  fontWeight: holdReason === val ? 700 : 400,
                                  background: holdReason === val ? "var(--s-red, #dc2626)" : "transparent",
                                  color: holdReason === val ? "#fff" : "var(--ink-muted, #6b7280)",
                                  borderColor: holdReason === val ? "var(--s-red, #dc2626)" : "rgba(0,0,0,0.15)",
                                }}
                              >{lbl}</button>
                            ))}
                          </div>
                        )}
                      </Field>
                      <Field label={L.ui.panel.fieldCurrentStage}>
                        {(() => {
                          const doingStage = stageForms.find(s => s.stageStatus === "doing" || s.stageStatus === "qc");
                          const holdStage  = stageForms.find(s => s.stageStatus === "hold");
                          const lastDoneIdx = [...stageForms].map(s => s.stageStatus).lastIndexOf("done");
                          const nextAfterDone = lastDoneIdx >= 0
                            ? (stageForms.slice(lastDoneIdx + 1).find(s => s.stageStatus !== "cancelled") ?? null)
                            : null;
                          const activeStage = doingStage ?? holdStage ?? nextAfterDone;
                          const activeDef = activeStage ? STAGE_DEFS.find(d => d.code === activeStage.code) : null;
                          if (!activeStage || !activeDef) {
                            return <p className={cn(inputCls(true), "flex items-center")} style={{ color: "var(--ink-muted)" }}>{L.ui.panel.notStarted}</p>;
                          }
                          const isDoing = activeStage.stageStatus === "doing";
                          const dotColor = isDoing ? "var(--s-blue)" : "#d97706";
                          const textColor = isDoing ? "var(--s-blue)" : "#b45309";
                          return (
                            <div className={inputCls(true)} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{
                                width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0,
                                background: dotColor,
                              }} />
                              <span style={{ fontSize: "12px", fontWeight: 500, color: textColor }}>
                                {L.stage[activeDef.code] ?? activeDef.label}
                              </span>
                            </div>
                          );
                        })()}
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3" data-fieldname="tl 3d tl xuống xưởng">
                      <Field label={L.ui.table.tl3d}>
                        <input type="number" step="0.001" min="0"
                          value={productionForm.tl3d}
                          disabled={isWorking || isReadOnly}
                          onChange={(e) => updateProductionForm("tl3d", e.target.value)}
                          className={inputCls(false)} placeholder="0.000" />
                      </Field>
                      <Field label={L.ui.columns.workshopWeight}>
                        <input type="number" step="0.001" min="0"
                          value={productionForm.tlXuong}
                          disabled={isWorking || isReadOnly}
                          onChange={(e) => updateProductionForm("tlXuong", e.target.value)}
                          className={inputCls(false)} placeholder="0.000" />
                      </Field>
                    </div>

                    {/* Auto-calc fields — readonly. QĐ 24K/PT/Bạc TÁCH RIÊNG (khác mốc tinh
                        khiết chuẩn từng kim loại: vàng 9999, bạc 999) — không gộp chung 1 ô. */}
                    <div className="grid grid-cols-3 gap-3" data-fieldname="quy đổi 24k platinum bạc">
                      <Field label={<span>{L.ui.panel.fieldQd24k} <span style={{ fontSize: "9px", color: "var(--ink-muted)", fontWeight: 400, letterSpacing: "0.02em" }}>{L.ui.panel.autoCalc}</span></span>}>
                        <input type="text" value={productionForm.qd24k || "—"}
                          readOnly disabled className={cn(inputCls(true), "text-indigo-700 font-semibold")}
                          title="Tự động tính từ TL 3D và NVL" />
                      </Field>
                      <Field label={<span>{L.ui.panel.fieldQdPt} <span style={{ fontSize: "9px", color: "var(--ink-muted)", fontWeight: 400, letterSpacing: "0.02em" }}>{L.ui.panel.autoCalc}</span></span>}>
                        <input type="text" value={productionForm.qdPt || "—"}
                          readOnly disabled className={cn(inputCls(true), "text-indigo-700 font-semibold")}
                          title="Tự động tính từ TL 3D và NVL" />
                      </Field>
                      <Field label={<span>{L.ui.panel.fieldQdBac} <span style={{ fontSize: "9px", color: "var(--ink-muted)", fontWeight: 400, letterSpacing: "0.02em" }}>{L.ui.panel.autoCalc}</span></span>}>
                        <input type="text" value={productionForm.qdBac || "—"}
                          readOnly disabled className={cn(inputCls(true), "text-indigo-700 font-semibold")}
                          title="Tự động tính từ TL 3D và NVL (bạc quy về 999)" />
                      </Field>
                    </div>
                  </div>

                  <hr className="border-gray-100" />
                  <SectionLabel editable>{L.ui.panel.sectionResults}</SectionLabel>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3" data-fieldname="trọng lượng thực tế hoàn tất ngày">
                      <Field label={L.ui.table.weightActual}>
                        <input type="number" step="0.001" min="0"
                          value={productionForm.tlThucTeHt}
                          disabled={isWorking || isReadOnly}
                          onChange={(e) => updateProductionForm("tlThucTeHt", e.target.value)}
                          className={inputCls(false)} placeholder="0.000" />
                      </Field>
                      <Field label={L.ui.table.completedDate}>
                        {/* Ngày HT cho user tự nhập (ngày thực tế, có thể lùi ngày). Lưu per-MO
                            qua "Đã lưu" kể cả khi chưa chuyển Hoàn tất. Để trống nếu chưa có. */}
                        <DateInput
                          value={productionForm.completedDate}
                          disabled={isWorking || isReadOnly}
                          onChange={(v) => updateProductionForm("completedDate", v)}
                          showTodayShortcut
                          className={inputCls(false)} />
                      </Field>
                    </div>

                    {/* Auto-calc: đánh giá TL + % chênh lệch */}
                    <div className="grid grid-cols-2 gap-3" data-fieldname="đánh giá trọng lượng chênh lệch">
                      <Field label={L.ui.table.weightEval}>
                        <div className={cn(
                          "w-full border rounded-lg px-3 py-2 text-sm font-semibold",
                          productionForm.danhGiaTl === "Đạt" ? "bg-green-50 border-green-300 text-green-700" :
                          productionForm.danhGiaTl === "Không đạt" ? "bg-red-50 border-red-300 text-red-700" :
                          "bg-gray-50 border-gray-100 text-gray-400"
                        )}>
                          {productionForm.danhGiaTl || "—"}
                        </div>
                      </Field>
                      <Field label={L.ui.table.pctDiff}>
                        <div className={cn(
                          "w-full border rounded-lg px-3 py-2 text-sm font-mono font-semibold",
                          productionForm.pctChenLech
                            ? Math.abs(parseFloat(productionForm.pctChenLech)) <= 5
                              ? "bg-green-50 border-green-200 text-green-700"
                              : "bg-red-50 border-red-200 text-red-700"
                            : "bg-gray-50 border-gray-100 text-gray-400"
                        )}>
                          {productionForm.pctChenLech ? `${productionForm.pctChenLech}%` : "—"}
                        </div>
                      </Field>
                    </div>

                    <div data-fieldname="thông tin chi tiết hoàn tất">
                      <Field label={L.ui.table.completionInfo}>
                        <textarea value={productionForm.thongTinHt}
                          disabled={isWorking || isReadOnly}
                          onChange={(e) => updateProductionForm("thongTinHt", e.target.value)}
                          rows={2}
                          className={cn(inputCls(false), "resize-none")}
                          placeholder={L.ui.panel.phCompletionInfo} />
                      </Field>
                    </div>

                    <div data-fieldname="cảnh báo đặc biệt sales note">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="psx-label">{L.ui.table.specialAlert}</p>
                        <a
                          href={`/dashboard/alerts?orderId=${order.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: "10px", fontWeight: 600, color: "var(--s-red)", border: "1px solid var(--s-red)", padding: "2px 8px", textDecoration: "none", letterSpacing: "0.04em", textTransform: "uppercase" }}
                        >
                          + Tạo cảnh báo
                        </a>
                      </div>
                      <div className="space-y-1.5">
                        {(() => {
                          const latest = (order.alerts || []).filter((a) => !a.isResolved)[0];
                          const total = (order.alerts || []).filter((a) => !a.isResolved).length;
                          if (!latest) return (
                            <p style={{ fontSize: "12px", color: "var(--ink-muted)", fontStyle: "italic" }}>
                              Không có cảnh báo — vào <strong>mục Cảnh báo</strong> để tạo.
                            </p>
                          );
                          return (
                            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-red-700">{latest.title}</p>
                                  {total > 1 && <span style={{ fontSize: "9px", color: "var(--s-red)", border: "1px solid var(--s-red)", padding: "0 4px" }}>{total} {L.ui.panel.alertCount}</span>}
                                </div>
                                {latest.description && <p className="text-red-500 mt-0.5">{latest.description}</p>}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div data-fieldname="ghi chú nội bộ xưởng">
                      <Field label={L.ui.panel.fieldInternalNote}>
                        <textarea value={productionForm.internalNote}
                          disabled={isWorking || isReadOnly}
                          onChange={(e) => updateProductionForm("internalNote", e.target.value)}
                          rows={2}
                          className={cn(inputCls(false), "resize-none")}
                          placeholder={L.ui.panel.phInternalNote} />
                      </Field>
                    </div>
                  </div>
                </div>
              )}

              {/* ── MH TAB TIẾN ĐỘ ───────────────────────────────────────── */}
              {mhTab === "tiendo" && (
                <div className="p-4 space-y-3">
                  <SectionLabel editable>{L.ui.panel.sectionProgress}</SectionLabel>

                  {/* Preset loại sản xuất */}
                  {!isReadOnly && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Loại SX:
                      </span>
                      {(["HANDCRAFT", "MACHINE", "MIXED"] as const).map((method) => {
                        const label = method === "HANDCRAFT" ? "Thủ công" : method === "MACHINE" ? "Máy" : "Cả hai";
                        const active = productionMethod === method;
                        return (
                          <button
                            key={method}
                            type="button"
                            disabled={isWorking}
                            onClick={() => applyPreset(method)}
                            style={{
                              fontSize: "11px", fontWeight: active ? 700 : 500,
                              padding: "3px 10px",
                              border: `1px solid ${active ? "var(--s-blue)" : "var(--border)"}`,
                              background: active ? "rgba(30,64,175,0.08)" : "transparent",
                              color: active ? "var(--s-blue)" : "var(--ink-muted)",
                              cursor: isWorking ? "not-allowed" : "pointer",
                              opacity: isWorking ? 0.5 : 1,
                              transition: "all 0.15s",
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                      {productionMethod && (
                        <span style={{ fontSize: "10px", color: "var(--ink-muted)", marginLeft: "2px" }}>
                          — Nhấn Lưu để áp dụng
                        </span>
                      )}
                    </div>
                  )}

                  {/* Banner: tình trạng hiện tại — tính từ stageForms */}
                  {(() => {
                    const doingIdx = stageForms.findIndex(s => s.stageStatus === "doing");
                    const holdIdx  = stageForms.findIndex(s => s.stageStatus === "hold");
                    const lastDoneIdx = [...stageForms].map(s => s.stageStatus).lastIndexOf("done");
                    const nextNonCancelledIdx = lastDoneIdx >= 0
                      ? stageForms.findIndex((s, i) => i > lastDoneIdx && s.stageStatus !== "cancelled")
                      : -1;
                    const activeIdx = doingIdx !== -1 ? doingIdx : holdIdx !== -1 ? holdIdx : nextNonCancelledIdx;
                    if (activeIdx === -1) return null;
                    const activeStage = stageForms[activeIdx];
                    const activeDef = STAGE_DEFS[activeIdx];
                    const isDoing = activeStage.stageStatus === "doing";
                    const isHold  = activeStage.stageStatus === "hold";
                    const accentColor = isDoing ? "var(--s-blue)" : isHold ? "#92400e" : "#d97706";
                    const bgColor = isDoing ? "rgba(30,64,175,0.06)" : isHold ? "rgba(146,64,14,0.06)" : "rgba(217,119,6,0.06)";
                    const borderColor = isDoing ? "rgba(30,64,175,0.2)" : isHold ? "rgba(146,64,14,0.2)" : "rgba(217,119,6,0.2)";
                    return (
                      <div style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "10px 14px",
                        background: bgColor,
                        border: `1px solid ${borderColor}`,
                        borderLeft: `3px solid ${accentColor}`,
                      }}>
                        <div style={{
                          width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                          background: accentColor,
                          animation: isDoing ? "pulse 2s infinite" : "none",
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: accentColor, margin: 0 }}>
                            {isDoing ? L.ui.panel.bannerInStage : L.ui.panel.bannerLastStage}
                          </p>
                          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)", margin: "2px 0 0" }}>
                            {L.stage[activeDef?.code ?? ""] ?? activeDef?.label ?? activeStage.code}
                            {activeStage.crafter && (
                              <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--ink-muted)", marginLeft: "8px" }}>
                                — {activeStage.crafter}
                              </span>
                            )}
                          </p>
                        </div>
                        <span style={{
                          fontSize: "10px", fontWeight: 700, padding: "2px 8px",
                          background: isDoing ? "rgba(30,64,175,0.12)" : "rgba(217,119,6,0.12)",
                          color: isDoing ? "var(--s-blue)" : "#d97706",
                        }}>
                          {isDoing ? L.stageStatus.doing : isHold ? "TẠM NGƯNG" : L.stageStatus.pending}
                        </span>
                      </div>
                    );
                  })()}

                  <div style={{ border: "1px solid var(--border)", overflow: "hidden" }}>
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_100px_90px] gap-2 px-3 py-2" style={{ background: "var(--cream-dark)", borderBottom: "1px solid var(--border)" }}>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{L.ui.panel.colStage}</p>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{L.ui.panel.colCrafter}</p>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{L.ui.table.status}</p>
                    </div>

                    {stageForms.map((stage, idx) => {
                      const def = STAGE_DEFS[idx];

                      // Format duration between two ISO timestamps
                      function fmtDur(startIso: string | null | undefined, doneIso: string | null | undefined): string {
                        if (!startIso || !doneIso) return "";
                        const s = new Date(startIso), e = new Date(doneIso);
                        if ((s.getHours() === 0 && s.getMinutes() === 0) || (e.getHours() === 0 && e.getMinutes() === 0)) return "";
                        const ms = e.getTime() - s.getTime();
                        if (ms <= 0) return "";
                        const totalMin = Math.round(ms / 60000);
                        const days  = Math.floor(totalMin / 1440);
                        const hours = Math.floor((totalMin % 1440) / 60);
                        const mins  = totalMin % 60;
                        if (days > 0)  return hours > 0 ? `${days}n ${hours}h` : `${days}n`;
                        if (hours > 0) return mins  > 0 ? `${hours}h ${mins}p` : `${hours}h`;
                        return `${mins}p`;
                      }

                      const showTimeRow = expandedTimeRows.has(stage.code);
                      const autoDur = fmtDur(stage.startAt, stage.doneAt);
                      const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50/50";
                      const hasTimestamp = !!stage.startAt && ["doing","qc","hold","done"].includes(stage.stageStatus);

                      // Split ISO → date "YYYY-MM-DD" + time "HH:mm" for separate inputs
                      function isoToDate(iso: string | null | undefined): string {
                        if (!iso) return "";
                        const d = new Date(iso);
                        const pad = (n: number) => String(n).padStart(2,"0");
                        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
                      }
                      function isoToTime(iso: string | null | undefined): string {
                        if (!iso) return "";
                        const d = new Date(iso);
                        if (d.getHours() === 0 && d.getMinutes() === 0) return "";
                        return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
                      }
                      // Merge date + time parts back to ISO (local time)
                      function partsToIso(datePart: string, timePart: string): string | null {
                        if (!datePart) return null;
                        return new Date(`${datePart}T${timePart || "00:00"}`).toISOString();
                      }
                      // Short timestamp "HH:mm DD/MM" for inline chip
                      function isoToShort(iso: string | null | undefined): string {
                        if (!iso) return "";
                        const d = new Date(iso);
                        const pad = (n: number) => String(n).padStart(2,"0");
                        return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
                      }

                      // ─── THU GỌN KHÂU ĐÃ XONG / CHƯA TỚI ───────────────────────────
                      // Luật + lý do đầy đủ ở business/stage-collapse.ts (có unit test riêng).
                      // Chỉ 5 khâu có bảng thợ mới có gì để gọn; các khâu còn lại vốn đã là một
                      // hàng đơn nên không cần mũi tên — thêm vào chỉ là nút bấm không làm gì.
                      const hasRecordTable = (STAGES_WITH_RECORDS as readonly string[]).includes(stage.code);
                      const stageOpen = shouldExpandStage({
                        stageCode: stage.code,
                        stageStatus: stage.stageStatus,
                        records: stage.records ?? [],
                        manual: manualStageOpen[stage.code],
                      });
                      const summaryLine = hasRecordTable && !stageOpen
                        ? stageSummary(stage.code, stage.records ?? [])
                        : null;
                      // Khâu ghi "Xong" mà còn thẻ khuyết dữ liệu — shouldExpandStage đã ép mở,
                      // nhưng phải NÓI RA vì sao, nếu không người dùng chỉ thấy một khâu bướng
                      // bỉnh không chịu gọn như các khâu khác.
                      const doneButIncomplete = hasRecordTable
                        && stage.stageStatus === "done"
                        && hasIncompleteRecords(stage.code, stage.records ?? []);

                      return (
                        <div
                          key={stage.code}
                          className={cn(rowBg, idx < STAGE_DEFS.length - 1 ? "border-b border-gray-100" : "")}
                        >
                          {/* Main row */}
                          <div className="grid grid-cols-[1fr_100px_90px] gap-2 px-3 py-2.5 items-center">
                            {/* Công đoạn name — click để mở/đóng time editor */}
                            <button
                              type="button"
                              onClick={() => toggleTimeRow(stage.code)}
                              className="flex items-center gap-2 min-w-0 text-left w-full hover:opacity-75 transition-opacity"
                            >
                              <span className={cn(
                                "w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0",
                                stage.stageStatus === "done"      ? "bg-green-100 text-green-700" :
                                stage.stageStatus === "doing"     ? "bg-blue-100 text-blue-700" :
                                stage.stageStatus === "cancelled" ? "bg-gray-100 text-gray-400" :
                                "bg-gray-100 text-gray-500"
                              )}>
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <span className={cn(
                                  "text-xs font-medium truncate block",
                                  stage.stageStatus === "cancelled" ? "text-gray-400 line-through" :
                                  stage.stageStatus === "done"      ? "text-green-700" :
                                  stage.stageStatus === "doing"     ? "text-blue-700" :
                                  "text-gray-700"
                                )}>
                                  {L.stage[def.code] ?? def.label}
                                </span>
                                {hasTimestamp && (
                                  <span className="text-[10px] text-gray-400 block leading-tight mt-0.5">
                                    {stage.stageStatus === "done" && stage.doneAt
                                      ? `${isoToShort(stage.startAt)} → ${isoToShort(stage.doneAt)}${autoDur ? ` · ${autoDur}` : ""}`
                                      : `Bắt đầu: ${isoToShort(stage.startAt)}`
                                    }
                                  </span>
                                )}
                                {/* HỘT — tóm tắt loại hột + SL từng loại + tổng (read-only,
                                    hiện ngay ở tab Tiến độ, không phụ thuộc đơn đã hoàn tất hay chưa) */}
                                {stage.code === "HOT" && (() => {
                                  const { byType, total } = computeHotStoneBreakdown(stage.records);
                                  if (byType.length === 0 && !total) return null;
                                  const parts = byType.map((b) => `${b.type}: ${b.qty}`);
                                  return (
                                    <span className="text-[10px] text-gray-500 block leading-tight mt-0.5">
                                      {parts.length ? `${parts.join(" · ")} · ` : ""}Tổng: {total}
                                    </span>
                                  );
                                })()}
                              </div>
                            </button>

                            {/* Thợ phụ trách / Người xác nhận */}
                            {stage.code === "DUYET_NK" ? (
                              <input
                                type="text"
                                value={stage.crafter}
                                placeholder="Người xác nhận"
                                disabled={isWorking || stage.stageStatus === "cancelled"}
                                onChange={(e) => updateStageForm(stage.code, { crafter: e.target.value })}
                                className={cn(
                                  "psx-input text-xs w-full",
                                  stage.stageStatus === "cancelled" ? "opacity-40 cursor-not-allowed" : "",
                                  !stage.crafter ? "text-gray-400" : ""
                                )}
                              />
                            ) : (stage.code === "NGUOI" || stage.code === "HOT" || stage.code === "DUC" || stage.code === "RESIN" || stage.code === "TC_NGUOI") ? (
                              <div
                                title="Bảng thợ ở bên dưới"
                                className={cn(
                                  "psx-input text-xs w-full truncate flex items-center",
                                  stage.stageStatus === "cancelled" ? "opacity-40" : "",
                                  !(stage.records ?? []).some((r) => r.crafter) ? "text-gray-400" : ""
                                )}
                                style={{ background: "transparent", border: "none", padding: "0" }}
                              >
                                {(() => {
                                  const names = [...new Set((stage.records ?? []).map((r) => r.crafter).filter(Boolean))];
                                  return names.length === 0 ? "Thêm thợ ↓" : names.length === 1 ? names[0] : `${names.length} thợ`;
                                })()}
                              </div>
                            ) : (
                              <div className="relative">
                                <select
                                  value={stage.crafter}
                                  disabled={isWorking || stage.stageStatus === "cancelled"}
                                  onChange={(e) => updateStageForm(stage.code, { crafter: e.target.value })}
                                  className={cn(
                                    "psx-input text-xs appearance-none pr-7 w-full",
                                    stage.stageStatus === "cancelled" ? "opacity-40 cursor-not-allowed" : "",
                                    !stage.crafter ? "text-gray-400" : ""
                                  )}
                                >
                                  <option value="">{L.ui.panel.phCrafter}</option>
                                  {(["Nguội", "Hột", "TC Dây", "ĐBXM", "Đúc", "QC", "Resin", "AZ", "Dây lắc", "Khác", ""] as const).map(khau => {
                                    const group = craftsmen.filter(c => (c.khau ?? "") === khau);
                                    if (!group.length) return null;
                                    const groupLabel = khau || "Chưa phân khâu";
                                    return (
                                      <optgroup key={khau || "__none__"} label={groupLabel}>
                                        {group.map(c => {
                                          const lvShort = c.level ? ` · ${c.level.replace("Bậc ", "B")}` : "";
                                          return (
                                            <option key={c.id} value={c.name}>{c.name}{lvShort}</option>
                                          );
                                        })}
                                      </optgroup>
                                    );
                                  })}
                                  {stage.crafter && !craftsmen.some((c) => c.name === stage.crafter) && (
                                    <option value={stage.crafter}>{stage.crafter}</option>
                                  )}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-gray-400" />
                              </div>
                            )}

                            {/* Trạng thái */}
                            {(() => {
                              const SIMPLE_STAGES = ["CHO_DX_NL", "CHO_NL"];
                              const HOLD_STAGES   = ["DUC","NGUOI","TC_DAY","TC_NGUOI","KHOA","HOT","MOC","DBXM","QC","DUYET_NK"];
                              // KHÔNG gồm "QC": khâu QC không có sub-status "qc" riêng (sẽ
                              // trùng option "Đang QC" với "doing"). RESIN/DUC mới cần "qc"
                              // (QC output của khâu đó — "QC Resin"/"QC đúc").
                              const QC_STAGES     = ["RESIN","DUC"];
                              const isSimple     = SIMPLE_STAGES.includes(stage.code);
                              const supportsHold = !isSimple && HOLD_STAGES.includes(stage.code);
                              const supportsQc   = !isSimple && QC_STAGES.includes(stage.code);
                              const selectValue = stage.stageStatus === "hold" && stage.holdReason
                                ? `hold:${stage.holdReason}`
                                : stage.stageStatus;
                              return (
                                <select
                                  value={selectValue}
                                  disabled={isWorking || isReadOnly}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "hold") {
                                      updateStageForm(stage.code, { stageStatus: "hold", holdReason: undefined });
                                    } else {
                                      updateStageForm(stage.code, { stageStatus: val as StageEntry["stageStatus"], holdReason: undefined });
                                    }
                                  }}
                                  className={cn(
                                    "psx-input text-xs font-semibold",
                                    STAGE_STATUS_CLS[stage.stageStatus] ?? ""
                                  )}
                                >
                                  {isSimple ? (
                                    <>
                                      <option value="pending">{getStageStatusLabel(stage.code, "pending")}</option>
                                      <option value="done">{getStageStatusLabel(stage.code, "done")}</option>
                                      <option value="cancelled">{getStageStatusLabel(stage.code, "cancelled")}</option>
                                    </>
                                  ) : (
                                    <>
                                      {(["pending","doing","qc","done","cancelled"] as const)
                                        .filter(v => v !== "qc" || supportsQc)
                                        .map((v) => (
                                          <option key={v} value={v}>{getStageStatusLabel(stage.code, v)}</option>
                                        ))}
                                      {supportsHold && <option value="hold">Tạm ngưng</option>}
                                    </>
                                  )}
                                </select>
                              );
                            })()}
                          </div>

                          {/* ─── KHÂU ĐANG GỌN — một dòng tóm tắt, bấm vào là mở ────────────
                              CHÍNH DÒNG NÀY là chỗ bấm, không phải tên khâu: khi gọn thì tiêu đề
                              "Thợ thực hiện (N)" cũng biến mất theo, không còn gì khác để bấm.
                              Và tên khâu đã mang sẵn một việc khác (mở ô sửa giờ) — chồng thêm
                              việc thứ hai lên cùng một chỗ bấm thì không ai đoán được nó làm gì.

                              THÁO HẲN khỏi cây chứ không ẩn bằng `display:none`: ô "Tìm trường
                              thông tin" đang ghi thẳng vào `style.display` của các phần tử, hai
                              cơ chế giành cùng một thuộc tính sẽ giẫm nhau. Tháo ra vẫn an toàn
                              vì số liệu nằm ở `stageForms` (state), không nằm trong DOM. */}
                          {hasRecordTable && !stageOpen && (
                            <button
                              type="button"
                              onClick={() => setManualStageOpen((p) => ({ ...p, [stage.code]: true }))}
                              style={{
                                display: "flex", alignItems: "center", gap: "6px", width: "100%",
                                padding: "5px 12px 5px 36px", borderTop: "1px dashed var(--border)",
                                background: "var(--stage-subbg)", border: "none", cursor: "pointer",
                                textAlign: "left", fontSize: "10px", color: "var(--ink-muted)",
                              }}
                            >
                              <ChevronRight style={{ width: "11px", height: "11px", flexShrink: 0 }} />
                              <span>{summaryLine ?? "Chưa có thợ"}</span>
                            </button>
                          )}

                          {/* NGUỘI / HỘT — Bảng nhiều thợ / nhiều lần */}
                          {hasRecordTable && stageOpen && (
                            <div style={{ padding: "4px 12px 8px 36px", borderTop: "1px dashed var(--border)", background: "var(--stage-subbg)" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0" }}>
                                <button
                                  type="button"
                                  onClick={() => setManualStageOpen((p) => ({ ...p, [stage.code]: false }))}
                                  style={{
                                    display: "flex", alignItems: "center", gap: "5px",
                                    background: "none", border: "none", padding: 0, cursor: "pointer",
                                    fontSize: "10px", color: "var(--ink-muted)", fontWeight: 600,
                                  }}
                                >
                                  <ChevronDown style={{ width: "11px", height: "11px", flexShrink: 0 }} />
                                  Thợ thực hiện ({(stage.records ?? []).length})
                                </button>
                                {/* Khâu ghi Xong nhưng còn thẻ khuyết — nó bị ép mở, phải nói ra
                                    vì sao. Không có câu này thì nó chỉ trông như một khâu bướng
                                    bỉnh không chịu gọn giống các khâu khác. */}
                                {doneButIncomplete && (
                                  <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--s-red)" }}>
                                    Ghi Xong nhưng thẻ thợ còn thiếu
                                  </span>
                                )}
                                {!isReadOnly && (
                                  <button
                                    type="button"
                                    disabled={isWorking || stage.stageStatus === "cancelled"}
                                    onClick={() => addStageRecord(stage.code)}
                                    style={{ fontSize: "10px", fontWeight: 600, color: "var(--pink)", background: "none", border: "none", cursor: "pointer" }}
                                  >
                                    + Thêm thợ/lần
                                  </button>
                                )}
                              </div>
                              {(stage.records ?? []).length === 0 && (
                                <p style={{ fontSize: "10px", color: "var(--ink-muted)", fontStyle: "italic", margin: 0 }}>Chưa có thợ — bấm “+ Thêm thợ/lần”.</p>
                              )}
                              {(stage.records ?? []).map((rec, ri) => {
                                const recCrafterSelect = (
                                  <div className="relative" style={{ flex: "1 1 130px", minWidth: "120px" }}>
                                    <select
                                      value={rec.crafter}
                                      disabled={isWorking || isReadOnly}
                                      onChange={(e) => updateStageRecord(stage.code, ri, { crafter: e.target.value })}
                                      className={cn("psx-input text-xs appearance-none pr-7 w-full", !rec.crafter ? "text-gray-400" : "")}
                                    >
                                      <option value="">{L.ui.panel.phCrafter}</option>
                                      {(["Nguội", "Hột", "TC Dây", "ĐBXM", "Đúc", "QC", "Resin", "AZ", "Dây lắc", "Khác", ""] as const).map((khau) => {
                                        const group = craftsmen.filter((c) => (c.khau ?? "") === khau);
                                        if (!group.length) return null;
                                        return (
                                          <optgroup key={khau || "__none__"} label={khau || "Chưa phân khâu"}>
                                            {group.map((c) => (
                                              <option key={c.id} value={c.name}>{c.name}{c.level ? ` · ${c.level.replace("Bậc ", "B")}` : ""}</option>
                                            ))}
                                          </optgroup>
                                        );
                                      })}
                                      {rec.crafter && !craftsmen.some((c) => c.name === rec.crafter) && (
                                        <option value={rec.crafter}>{rec.crafter}</option>
                                      )}
                                    </select>
                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-gray-400" />
                                  </div>
                                );
                                const lbl: React.CSSProperties = { fontSize: "9px", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "2px", display: "block" };
                                const grpLbl: React.CSSProperties = { fontSize: "9px", fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" };
                                const unit: React.CSSProperties = { fontSize: "11px", color: "var(--ink-muted)", flexShrink: 0 };
                                const grpBox: React.CSSProperties = { marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--border)" };
                                const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" };
                                // Số giờ thực tế: lưu chuỗi "Hg Mp" — parse ra giờ/phút để nhập tay.
                                // Phần "g" nhận cả số thập phân ("2.5g") — nếu chỉ bắt số nguyên, regex
                                // sẽ khớp nhầm phần lẻ sau dấu chấm (2.5g → bắt "5g" → sai gấp đôi).
                                const parseGioTT = (raw: string | null | undefined) => {
                                  if (!raw) return { h: 0, m: 0 };
                                  let total = 0;
                                  const dh = raw.match(/(\d+(?:\.\d+)?)g/); if (dh) total += parseFloat(dh[1]) * 60;
                                  const dm = raw.match(/(\d+)p/); if (dm) total += parseInt(dm[1], 10);
                                  return { h: Math.floor(total / 60), m: total % 60 };
                                };
                                const fmtGioTT = (h: number, m: number): string | null =>
                                  (h === 0 && m === 0) ? null : h === 0 ? `${m}p` : m === 0 ? `${h}g` : `${h}g ${m}p`;
                                const ttParts = parseGioTT(rec.gioThucTe);
                                const showTTh = rec.gioThucTe ? String(ttParts.h) : "";
                                const showTTm = rec.gioThucTe ? String(ttParts.m) : "";
                                return (
                                  <div key={ri} style={{ border: "1px solid var(--border)", borderRadius: "4px", background: "var(--cream)", padding: "8px", marginBottom: "6px" }}>
                                    {/* Header: Thợ #N + xóa */}
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                      <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--ink)" }}>Thợ #{ri + 1}</span>
                                      {!isReadOnly && (
                                        <button
                                          type="button" disabled={isWorking} onClick={() => removeStageRecord(stage.code, ri)} title="Xóa thợ"
                                          style={{ fontSize: "12px", color: "var(--s-red)", background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}
                                        >✕</button>
                                      )}
                                    </div>
                                    {/* Nhóm 1 — Thông tin: Tên thợ · Phần */}
                                    <div style={grid2}>
                                      <div>
                                        <label style={lbl}>Tên thợ</label>
                                        {recCrafterSelect}
                                      </div>
                                      <div>
                                        <label style={lbl}>Phần phụ trách</label>
                                        <input
                                          type="text" placeholder="vd: chi tiết A, nửa dây…" value={rec.phan ?? ""} disabled={isWorking || isReadOnly}
                                          onChange={(e) => updateStageRecord(stage.code, ri, { phan: e.target.value || null })}
                                          className="psx-input text-xs w-full"
                                        />
                                      </div>
                                    </div>

                                    {/* Nhóm 2 — Đánh giá */}
                                    <div style={grpBox}>
                                      <p style={grpLbl}>Đánh giá</p>
                                      {(stage.code === "NGUOI" || stage.code === "TC_NGUOI") ? (
                                        <div style={grid2}>
                                          <div>
                                            <label style={lbl}>Chất lượng SP</label>
                                            <select value={rec.ketQua ?? ""} disabled={isWorking || isReadOnly}
                                              onChange={(e) => updateStageRecord(stage.code, ri, { ketQua: e.target.value || null })}
                                              className="psx-input text-xs w-full">
                                              <option value="">-- Chọn --</option>
                                              <option value="Đạt">Đạt</option>
                                              <option value="Không đạt">Không đạt</option>
                                            </select>
                                          </div>
                                          <div>
                                            <label style={lbl}>Thời gian SX</label>
                                            <select value={rec.thoiGianOk ?? ""} disabled={isWorking || isReadOnly}
                                              onChange={(e) => updateStageRecord(stage.code, ri, { thoiGianOk: e.target.value || null })}
                                              className="psx-input text-xs w-full">
                                              <option value="">-- Chọn --</option>
                                              <option value="Đạt">Đạt</option>
                                              <option value="Không đạt">Không đạt</option>
                                            </select>
                                          </div>
                                          <div>
                                            <label style={lbl}>Bậc SP</label>
                                            <select value={rec.bachSP ?? ""} disabled={isWorking || isReadOnly}
                                              onChange={(e) => updateStageRecord(stage.code, ri, { bachSP: e.target.value || null })}
                                              className="psx-input text-xs w-full">
                                              <option value="">-- Chọn --</option>
                                              {["1", "2", "3", "4", "5"].map((v) => <option key={v} value={v}>Bậc {v}</option>)}
                                            </select>
                                          </div>
                                          <div>
                                            <label style={lbl}>Giờ KPI</label>
                                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                              <input type="number" min={0} step={0.5} placeholder="0"
                                                value={rec.gioKpi ? (parseFloat(rec.gioKpi) || "") : ""} disabled={isWorking || isReadOnly}
                                                onChange={(e) => { const v = parseFloat(e.target.value); updateStageRecord(stage.code, ri, { gioKpi: !isNaN(v) && v > 0 ? String(v) : null }); }}
                                                className="psx-input text-xs" style={{ flex: 1, minWidth: 0, textAlign: "right" }}
                                              />
                                              <span style={unit}>giờ</span>
                                            </div>
                                          </div>
                                        </div>
                                      ) : stage.code === "DUC" ? (
                                        <div>
                                          <label style={lbl}>Kết quả đúc</label>
                                          <select value={rec.ketQua ?? ""} disabled={isWorking || isReadOnly}
                                            onChange={(e) => updateStageRecord(stage.code, ri, { ketQua: e.target.value || null })}
                                            className="psx-input text-xs w-full">
                                            <option value="">-- Chọn --</option>
                                            <option value="Đạt">Đạt</option>
                                            <option value="Không đạt">Không đạt</option>
                                          </select>
                                        </div>
                                      ) : stage.code === "RESIN" ? (() => {
                                        // RESIN per-record: SL chi tiết + TL (chưa cắt ty/ty/còn lại) + KQ trọng lượng + KQ chất lượng + lý do
                                        const rRaw = (rec as any).resinWeightRaw ?? null;
                                        const rTy = (rec as any).resinWeightTy ?? null;
                                        const rConLai = rRaw != null && rTy != null ? Math.round((rRaw - rTy) * 1000) / 1000 : null;
                                        const numOrNull = (v: string) => { const n = parseFloat(v); return v === "" || isNaN(n) ? null : n; };
                                        return (
                                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                            <div style={grid2}>
                                              <div>
                                                <label style={lbl}>SL chi tiết</label>
                                                <input type="number" min={0} placeholder="0" value={(rec as any).resinDetailQty ?? ""} disabled={isWorking || isReadOnly}
                                                  onChange={(e) => updateStageRecord(stage.code, ri, { resinDetailQty: e.target.value ? parseInt(e.target.value, 10) : null } as any)}
                                                  className="psx-input text-xs w-full" style={{ textAlign: "right" }} />
                                              </div>
                                              <div>
                                                <label style={lbl}>KQ trọng lượng</label>
                                                <select value={(rec as any).resinWeightOk ?? ""} disabled={isWorking || isReadOnly}
                                                  onChange={(e) => updateStageRecord(stage.code, ri, { resinWeightOk: e.target.value || null } as any)}
                                                  className="psx-input text-xs w-full">
                                                  <option value="">-- Chọn --</option>
                                                  <option value="Đạt">Đạt</option>
                                                  <option value="Không đạt">Không đạt</option>
                                                </select>
                                              </div>
                                            </div>
                                            <div>
                                              <label style={lbl}>Trọng lượng resin (g)</label>
                                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                                                <div>
                                                  <span style={{ fontSize: "9px", color: "var(--ink-muted)" }}>Chưa cắt ty</span>
                                                  <input type="number" min={0} step="any" placeholder="0" value={rRaw ?? ""} disabled={isWorking || isReadOnly}
                                                    onChange={(e) => updateStageRecord(stage.code, ri, { resinWeightRaw: numOrNull(e.target.value) } as any)}
                                                    className="psx-input text-xs w-full" style={{ textAlign: "right" }} />
                                                </div>
                                                <div>
                                                  <span style={{ fontSize: "9px", color: "var(--ink-muted)" }}>Ty</span>
                                                  <input type="number" min={0} step="any" placeholder="0" value={rTy ?? ""} disabled={isWorking || isReadOnly}
                                                    onChange={(e) => updateStageRecord(stage.code, ri, { resinWeightTy: numOrNull(e.target.value) } as any)}
                                                    className="psx-input text-xs w-full" style={{ textAlign: "right" }} />
                                                </div>
                                                <div>
                                                  <span style={{ fontSize: "9px", color: "var(--ink-muted)" }}>Còn lại</span>
                                                  <input type="text" disabled value={rConLai != null ? String(rConLai) : "—"}
                                                    className="psx-input text-xs w-full" style={{ textAlign: "right", background: "var(--stage-subbg)" }} />
                                                </div>
                                              </div>
                                            </div>
                                            <div>
                                              <label style={lbl}>KQ chất lượng</label>
                                              <select value={rec.ketQua ?? ""} disabled={isWorking || isReadOnly}
                                                onChange={(e) => updateStageRecord(stage.code, ri, { ketQua: e.target.value || null })}
                                                className="psx-input text-xs w-full">
                                                <option value="">-- Chọn --</option>
                                                <option value="Đạt">Đạt</option>
                                                <option value="Không đạt">Không đạt</option>
                                              </select>
                                            </div>
                                          </div>
                                        );
                                      })() : (() => {
                                        // HOT: per-record stoneType + per-type qty inputs + manual stoneQty
                                        // Fallback về stage.stoneType nếu record chưa có (backward compat)
                                        const recStoneType = (rec as any).stoneType ?? stage.stoneType ?? null;
                                        const stoneTypes = (recStoneType ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
                                        const qtyByType = ((rec as any).stoneQtyByType ?? {}) as Record<string, number>;
                                        // Có loại hột được chọn → Tổng SL LUÔN tự tính từ tổng SL từng loại
                                        // (không cho nhập tay riêng, tránh lệch số như trước).
                                        const hasTypes = stoneTypes.length > 0;
                                        const handleByType = (type: string, rawVal: string) => {
                                          const val = rawVal ? parseInt(rawVal, 10) : null;
                                          const next: Record<string, number> = { ...qtyByType };
                                          if (!val || val <= 0) delete next[type]; else next[type] = val;
                                          const sum = Object.values(next).reduce((a, b) => a + b, 0);
                                          updateStageRecord(stage.code, ri, {
                                            stoneQtyByType: Object.keys(next).length ? next : null,
                                            stoneQty: sum > 0 ? sum : null,
                                          } as any);
                                        };
                                        return (
                                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                            {/* Loại hột per-record */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                              <label style={{ ...lbl, width: "58px", flexShrink: 0, marginBottom: 0 }}>Loại hột</label>
                                              <div style={{ flex: 1 }}>
                                                <StoneTypeTagDropdown
                                                  value={recStoneType}
                                                  disabled={isWorking || isReadOnly}
                                                  options={HOT_STONE_TYPE_OPTIONS}
                                                  onChange={(val) => {
                                                    // Khi đổi loại hột: xóa stoneQtyByType của type không còn
                                                    const newTypes = (val ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
                                                    const newQtyByType = Object.fromEntries(
                                                      Object.entries(qtyByType).filter(([k]) => newTypes.includes(k))
                                                    );
                                                    const newSum = Object.values(newQtyByType).reduce((a, b) => a + b, 0);
                                                    updateStageRecord(stage.code, ri, {
                                                      stoneType: val || null,
                                                      stoneQtyByType: Object.keys(newQtyByType).length ? newQtyByType : null,
                                                      // Vẫn còn loại → tự tính lại tổng; bỏ hết loại → cho nhập tay lại (giữ giá trị cũ)
                                                      ...(newTypes.length > 0 ? { stoneQty: newSum > 0 ? newSum : null } : {}),
                                                    } as any);
                                                  }}
                                                />
                                              </div>
                                            </div>
                                            {/* SL theo từng loại */}
                                            {stoneTypes.map((type: string) => (
                                              <div key={type} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <label style={{ ...lbl, width: "58px", flexShrink: 0, marginBottom: 0 }}>{type}</label>
                                                <input type="number" min={0} placeholder=""
                                                  value={qtyByType[type] ?? ""}
                                                  disabled={isWorking || isReadOnly}
                                                  onChange={(e) => handleByType(type, e.target.value)}
                                                  className="psx-input text-xs" style={{ flex: 1, textAlign: "right" }}
                                                />
                                              </div>
                                            ))}
                                            {/* Tổng SL — có loại hột thì TỰ TÍNH từ tổng SL từng loại (readOnly).
                                                Chưa chọn loại (dữ liệu cũ / chưa breakdown) → vẫn nhập tay như trước. */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px", ...(stoneTypes.length > 0 ? { borderTop: "1px dashed var(--border)", paddingTop: "4px" } : {}) }}>
                                              <label style={{ ...lbl, width: "58px", flexShrink: 0, marginBottom: 0, fontWeight: 600 }}>Tổng SL</label>
                                              <input type="number" min={0} placeholder="—"
                                                title={hasTypes ? "Tự tính từ tổng SL từng loại" : "Tổng SL hột — nhập tay"}
                                                value={rec.stoneQty ?? ""}
                                                disabled={isWorking || isReadOnly || hasTypes}
                                                readOnly={hasTypes}
                                                onChange={(e) => updateStageRecord(stage.code, ri, { stoneQty: e.target.value ? parseInt(e.target.value, 10) : null })}
                                                className="psx-input text-xs" style={{ flex: 1, textAlign: "right", ...(hasTypes ? { background: "var(--stage-subbg)" } : {}) }}
                                              />
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>

                                    {/* Nhóm 3 — Thời gian. RESIN: chỉ cần NGÀY HT cho từng lần. */}
                                    {stage.code === "RESIN" ? (
                                      <div style={grpBox}>
                                        <label style={lbl}>Ngày HT</label>
                                        <DateInput value={isoToDate(rec.doneAt)} disabled={isWorking || isReadOnly}
                                          onChange={(v) => updateStageRecord(stage.code, ri, { doneAt: v ? partsToIso(v, "00:00") : null })}
                                          className="psx-input text-xs w-full"
                                        />
                                      </div>
                                    ) : (
                                    <div style={grpBox}>
                                      <p style={grpLbl}>Thời gian</p>
                                      <div style={{ marginBottom: "8px" }}>
                                        <label style={lbl}>Số giờ thực tế</label>
                                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                          <input
                                            type="number" min={0} max={999} placeholder="0" value={showTTh} disabled={isWorking || isReadOnly}
                                            onChange={(e) => { const nh = e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0); updateStageRecord(stage.code, ri, { gioThucTe: fmtGioTT(nh, ttParts.m) }); }}
                                            className="psx-input text-xs" style={{ width: "56px", textAlign: "right" }}
                                          />
                                          <span style={unit}>giờ</span>
                                          <input
                                            type="number" min={0} max={59} placeholder="0" value={showTTm} disabled={isWorking || isReadOnly}
                                            onChange={(e) => { const nm = e.target.value === "" ? 0 : Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)); updateStageRecord(stage.code, ri, { gioThucTe: fmtGioTT(ttParts.h, nm) }); }}
                                            className="psx-input text-xs" style={{ width: "56px", textAlign: "right" }}
                                          />
                                          <span style={unit}>phút</span>
                                        </div>
                                      </div>
                                      <div style={grid2}>
                                        <div>
                                          <label style={lbl}>Bắt đầu</label>
                                          <div style={{ display: "flex", gap: "4px" }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <DateInput value={isoToDate(rec.startAt)} disabled={isWorking || isReadOnly}
                                                onChange={(v) => updateStageRecord(stage.code, ri, { startAt: v ? partsToIso(v, isoToTime(rec.startAt) || "00:00") : null })}
                                                className="psx-input text-xs w-full"
                                              />
                                            </div>
                                            <TimeInput value={isoToTime(rec.startAt)} disabled={isWorking || isReadOnly || !isoToDate(rec.startAt)}
                                              onChange={(v) => { const d = isoToDate(rec.startAt); if (d) updateStageRecord(stage.code, ri, { startAt: partsToIso(d, v || "00:00") }); }}
                                              className="psx-input text-xs" style={{ width: "78px" }}
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <label style={lbl}>Hoàn thành</label>
                                          <div style={{ display: "flex", gap: "4px" }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <DateInput value={isoToDate(rec.doneAt)} disabled={isWorking || isReadOnly}
                                                onChange={(v) => updateStageRecord(stage.code, ri, { doneAt: v ? partsToIso(v, isoToTime(rec.doneAt) || "00:00") : null })}
                                                className="psx-input text-xs w-full"
                                              />
                                            </div>
                                            <TimeInput value={isoToTime(rec.doneAt)} disabled={isWorking || isReadOnly || !isoToDate(rec.doneAt)}
                                              onChange={(v) => { const d = isoToDate(rec.doneAt); if (d) updateStageRecord(stage.code, ri, { doneAt: partsToIso(d, v || "00:00") }); }}
                                              className="psx-input text-xs" style={{ width: "78px" }}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    )}

                                    {/* Nhóm 4 — Ghi chú */}
                                    <div style={grpBox}>
                                      {(stage.code === "NGUOI" || stage.code === "DUC" || stage.code === "RESIN" || stage.code === "TC_NGUOI") && (
                                        <div style={(stage.code === "DUC" || stage.code === "RESIN") ? undefined : { marginBottom: "8px" }}>
                                          <label style={lbl}>Lý do (nếu không đạt)</label>
                                          <input type="text" placeholder="Lý do..." value={rec.lyDo ?? ""} disabled={isWorking || isReadOnly}
                                            onChange={(e) => updateStageRecord(stage.code, ri, { lyDo: e.target.value || null })}
                                            className="psx-input text-xs w-full"
                                          />
                                        </div>
                                      )}
                                      {/* Ghi chú per-record: Nguội/Hột. Đúc dùng ghi chú CHUNG ở dưới bảng (stage-level). */}
                                      {stage.code !== "DUC" && (
                                        <div>
                                          <label style={lbl}>Ghi chú</label>
                                          <input type="text" placeholder="Ghi chú..." value={rec.ghiChu ?? ""} disabled={isWorking || isReadOnly}
                                            onChange={(e) => updateStageRecord(stage.code, ri, { ghiChu: e.target.value || null })}
                                            className="psx-input text-xs w-full"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                              {(stage.code === "NGUOI" || stage.code === "DUC" || stage.code === "RESIN" || stage.code === "TC_NGUOI") && (stage.records ?? []).some((r) => r.ketQua === "Không đạt") && (
                                <p style={{ fontSize: "10px", color: "var(--s-red)", margin: "2px 0 0" }}>Có lần “Không đạt” — cần làm lại.</p>
                              )}
                              {/* ĐÚC — Ghi chú chung cho cả khâu (stage-level, không per-record) */}
                              {stage.code === "DUC" && (
                                <div style={{ marginTop: "8px" }}>
                                  <label style={{ fontSize: "9px", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "2px", display: "block" }}>Ghi chú (cả khâu Đúc)</label>
                                  <input type="text" placeholder="Ghi chú chung khâu Đúc..." value={stage.ghiChuDuc ?? ""} disabled={isWorking || isReadOnly}
                                    onChange={(e) => updateStageForm(stage.code, { ghiChuDuc: e.target.value || null })}
                                    className="psx-input text-xs w-full"
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {/* DÂY LẮC — Nhóm công việc (always visible) */}
                          {stage.code === "TC_DAY" && (
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 12px 4px 36px" }}>
                              <span style={{ fontSize: "10px", color: "var(--ink-muted)", width: "68px", flexShrink: 0 }}>Nhóm CV</span>
                              <div className="relative" style={{ flex: 1 }}>
                                <select
                                  value={stage.workGroup ?? ""}
                                  disabled={isWorking || isReadOnly}
                                  onChange={(e) => updateStageForm(stage.code, { workGroup: e.target.value || null })}
                                  className="psx-input text-xs appearance-none pr-7 w-full"
                                >
                                  <option value="">-- Chọn --</option>
                                  <option value="MÓC MÁY">Móc máy</option>
                                  <option value="DÂY LẮC">Dây lắc</option>
                                  <option value="NẤU NL">Nấu NL</option>
                                  <option value="CÁN KÉO">Cán kéo</option>
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-gray-400" />
                              </div>
                            </div>
                          )}

                          {/* HỘT — Loại hột mặc định ở mức khâu (dùng làm default khi thêm thợ mới) */}
                          {stage.code === "HOT" && (
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 12px 4px 36px" }}>
                              <span style={{ fontSize: "10px", color: "var(--ink-muted)", width: "68px", flexShrink: 0 }}>Mặc định</span>
                              <StoneTypeTagDropdown
                                value={stage.stoneType ?? null}
                                disabled={isWorking || isReadOnly}
                                options={HOT_STONE_TYPE_OPTIONS}
                                onChange={(val) => updateStageForm(stage.code, { stoneType: val })}
                              />
                            </div>
                          )}

                          {/* HỘT — Tóm tắt loại hột đã gắn + SL từng loại + tổng (read-only).
                              Surface dữ liệu đã có ở records (mỗi record: loại hột + SL) để user
                              thấy rõ đã gắn loại nào, bao nhiêu — không chỉ tổng SL. */}
                          {stage.code === "HOT" && (() => {
                            const { byType, total } = computeHotStoneBreakdown(stage.records);
                            if (byType.length === 0 && !total) return null;
                            return (
                              <div style={{ display: "flex", alignItems: "flex-start", gap: "4px", padding: "3px 12px 6px 36px" }}>
                                <span style={{ fontSize: "10px", color: "var(--ink-muted)", width: "68px", flexShrink: 0, marginTop: "3px" }}>Đã gắn</span>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", flex: 1, alignItems: "center" }}>
                                  {byType.map(({ type, qty }) => (
                                    <span key={type} style={{ fontSize: "11px", padding: "1px 8px", background: "var(--cream-card)", border: "1px solid var(--border)", borderRadius: "10px", whiteSpace: "nowrap" }}>
                                      {type}: <strong>{qty}</strong>
                                    </span>
                                  ))}
                                  <span style={{ fontSize: "11px", padding: "1px 6px", fontWeight: 700, whiteSpace: "nowrap" }}>Tổng: {total}</span>
                                </div>
                              </div>
                            );
                          })()}


                          {/* Time tracking sub-rows — Nguội/Hột/TC Nguội tính thời gian theo TỪNG THỢ
                              (trong thẻ records ở trên), nên bỏ thời gian mức khâu ở đây. */}
                          {showTimeRow && stage.code !== "NGUOI" && stage.code !== "HOT" && stage.code !== "RESIN" && stage.code !== "TC_NGUOI" && (() => {
                            const inputCls2 = "psx-input text-xs";
                            const labelStyle: React.CSSProperties = {
                              fontSize: "10px", color: "var(--ink-muted)",
                              width: "68px", flexShrink: 0, whiteSpace: "nowrap",
                            };
                            const rowStyle: React.CSSProperties = {
                              display: "flex", alignItems: "center", gap: "4px",
                              padding: "3px 12px 0 36px",
                            };
                            // Ngày khâu — SINGLE SOURCE OF TRUTH = stage.startAt/doneAt.
                            // Chọn ngày mà chưa nhập giờ → mặc định "00:00" (ô giờ vẫn hiện
                            // trống để user biết CHƯA điền giờ). Luôn ghi thẳng vào stage state,
                            // không "park" ở state phụ — tránh lỗi khi sửa lại ngày (giá trị cũ
                            // được giữ, ngày mới bị bỏ qua lúc lưu). Áp dụng đồng nhất cho MỌI
                            // khâu single-record (TC Dây, Khóa, Móc, ĐBXM, QC, Duyệt NK...).
                            const startDateVal = isoToDate(stage.startAt);
                            const doneDateVal  = isoToDate(stage.doneAt);
                            const startTimeVal = isoToTime(stage.startAt);
                            const doneTimeVal  = isoToTime(stage.doneAt);

                            function handleStartDateChange(v: string) {
                              if (!v) { updateStageForm(stage.code, { startAt: null }); return; }
                              updateStageForm(stage.code, { startAt: partsToIso(v, isoToTime(stage.startAt) || "00:00") });
                            }
                            function handleStartTimeChange(t: string) {
                              const dateStr = isoToDate(stage.startAt);
                              if (dateStr) updateStageForm(stage.code, { startAt: partsToIso(dateStr, t) });
                            }
                            function handleDoneDateChange(v: string) {
                              if (!v) { updateStageForm(stage.code, { doneAt: null }); return; }
                              updateStageForm(stage.code, { doneAt: partsToIso(v, isoToTime(stage.doneAt) || "00:00") });
                            }
                            function handleDoneTimeChange(t: string) {
                              const dateStr = isoToDate(stage.doneAt);
                              if (dateStr) updateStageForm(stage.code, { doneAt: partsToIso(dateStr, t) });
                            }

                            return (
                              <div style={{ borderTop: "1px dashed var(--border)", background: "var(--stage-subbg)", paddingBottom: "6px" }}>
                                {/* Bắt đầu */}
                                <div style={rowStyle}>
                                  <span style={labelStyle}>Bắt đầu</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <DateInput
                                      value={startDateVal}
                                      disabled={isWorking || isReadOnly}
                                      onChange={handleStartDateChange}
                                      className={inputCls2}
                                    />
                                  </div>
                                  <TimeInput
                                    value={startTimeVal}
                                    disabled={isWorking || isReadOnly}
                                    onChange={handleStartTimeChange}
                                    className={inputCls2}
                                    style={{ width: "72px", flexShrink: 0 }}
                                  />
                                </div>

                                {/* Hoàn thành — chỉ khi done */}
                                {stage.stageStatus === "done" && (
                                  <div style={{ ...rowStyle, marginTop: "3px" }}>
                                    <span style={labelStyle}>Hoàn thành</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <DateInput
                                        value={doneDateVal}
                                        disabled={isWorking || isReadOnly}
                                        onChange={handleDoneDateChange}
                                        className={inputCls2}
                                      />
                                    </div>
                                    <TimeInput
                                      value={doneTimeVal}
                                      disabled={isWorking || isReadOnly}
                                      onChange={handleDoneTimeChange}
                                      className={inputCls2}
                                      style={{ width: "72px", flexShrink: 0 }}
                                    />
                                  </div>
                                )}

                                {/* Thời gian — giờ + phút number inputs */}
                                {(() => {
                                  // Phần "g" nhận cả số thập phân ("2.5g") — chỉ bắt số nguyên sẽ khớp
                                  // nhầm phần lẻ sau dấu chấm (2.5g → bắt "5g" → sai gấp đôi).
                                  function parseDur(s: string | null | undefined): { h: number; m: number } {
                                    if (!s) return { h: 0, m: 0 };
                                    let total = 0;
                                    const dn = s.match(/(\d+)n/); if (dn) total += parseInt(dn[1]) * 1440;
                                    const dh = s.match(/(\d+(?:\.\d+)?)g/); if (dh) total += parseFloat(dh[1]) * 60;
                                    const dm = s.match(/(\d+)p/); if (dm) total += parseInt(dm[1]);
                                    return { h: Math.floor(total / 60), m: total % 60 };
                                  }
                                  function fmtManual(h: number, m: number): string | null {
                                    if (h === 0 && m === 0) return null;
                                    if (h === 0) return `${m}p`;
                                    if (m === 0) return `${h}g`;
                                    return `${h}g ${m}p`;
                                  }
                                  const isAuto = !stage.durationNote && !!autoDur;
                                  const raw = stage.durationNote ?? autoDur;
                                  const { h, m } = parseDur(raw);
                                  const showH = raw ? String(h) : "";
                                  const showM = raw ? String(m) : "";
                                  return (
                                    <div style={{ ...rowStyle, marginTop: "3px" }}>
                                      <span style={labelStyle}>Thời gian</span>
                                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
                                        <input
                                          type="number" min={0} max={999}
                                          value={showH}
                                          placeholder="0"
                                          disabled={isWorking || isReadOnly}
                                          onChange={(e) => {
                                            const newH = e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value) || 0);
                                            updateStageForm(stage.code, { durationNote: fmtManual(newH, m) });
                                          }}
                                          className={inputCls2}
                                          style={{ width: "52px", flexShrink: 0, textAlign: "right" }}
                                        />
                                        <span style={{ fontSize: "11px", color: "var(--ink-muted)", flexShrink: 0 }}>giờ</span>
                                        <input
                                          type="number" min={0} max={59}
                                          value={showM}
                                          placeholder="0"
                                          disabled={isWorking || isReadOnly}
                                          onChange={(e) => {
                                            const newM = e.target.value === "" ? 0 : Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                                            updateStageForm(stage.code, { durationNote: fmtManual(h, newM) });
                                          }}
                                          className={inputCls2}
                                          style={{ width: "44px", flexShrink: 0, textAlign: "right" }}
                                        />
                                        <span style={{ fontSize: "11px", color: "var(--ink-muted)", flexShrink: 0 }}>phút</span>
                                        {isAuto && (
                                          <span style={{
                                            fontSize: "10px", fontWeight: 600, color: "#16a34a",
                                            background: "rgba(22,163,74,0.08)", borderRadius: "3px",
                                            padding: "2px 5px", whiteSpace: "nowrap", flexShrink: 0,
                                          }}>auto</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* KHÓA — chất lượng SP, thời gian SX, lý do, bậc SP, giờ KPI.
                                    (NGUỘI đã chuyển sang bảng nhiều thợ/lần ở trên.) */}
                                {stage.code === "KHOA" && (
                                  <>
                                    <div style={{ ...rowStyle, marginTop: "3px" }}>
                                      <span style={labelStyle}>Chất lượng SP</span>
                                      <select
                                        value={stage.coldworkQuality ?? ""}
                                        disabled={isWorking || isReadOnly}
                                        onChange={(e) => updateStageForm(stage.code, { coldworkQuality: e.target.value || null })}
                                        className={inputCls2}
                                        style={{ flex: 1 }}
                                      >
                                        <option value="">-- Chọn --</option>
                                        <option value="Đạt">Đạt</option>
                                        <option value="Không đạt">Không đạt</option>
                                      </select>
                                    </div>
                                    <div style={{ ...rowStyle, marginTop: "3px" }}>
                                      <span style={labelStyle}>Thời gian SX</span>
                                      <select
                                        value={stage.coldworkTimeOk ?? ""}
                                        disabled={isWorking || isReadOnly}
                                        onChange={(e) => updateStageForm(stage.code, { coldworkTimeOk: e.target.value || null })}
                                        className={inputCls2}
                                        style={{ flex: 1 }}
                                      >
                                        <option value="">-- Chọn --</option>
                                        <option value="Đạt">Đạt</option>
                                        <option value="Không đạt">Không đạt</option>
                                      </select>
                                    </div>
                                    <div style={{ ...rowStyle, marginTop: "3px" }}>
                                      <span style={labelStyle}>Lý do</span>
                                      <input
                                        type="text"
                                        value={stage.coldworkReason ?? ""}
                                        placeholder="Ghi chú..."
                                        disabled={isWorking || isReadOnly}
                                        onChange={(e) => updateStageForm(stage.code, { coldworkReason: e.target.value || null })}
                                        className={inputCls2}
                                        style={{ flex: 1 }}
                                      />
                                    </div>
                                    <div style={{ ...rowStyle, marginTop: "3px" }}>
                                      <span style={labelStyle}>Bậc SP</span>
                                      <div className="relative" style={{ flex: 1 }}>
                                        <select
                                          value={stage.bachSP ?? ""}
                                          disabled={isWorking || isReadOnly}
                                          onChange={(e) => updateStageForm(stage.code, { bachSP: e.target.value || null })}
                                          className={`${inputCls2} appearance-none pr-7 w-full`}
                                        >
                                          <option value="">-- Chọn --</option>
                                          {["1","2","3","4","5"].map(v => (
                                            <option key={v} value={v}>Bậc {v}</option>
                                          ))}
                                        </select>
                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-gray-400" />
                                      </div>
                                    </div>
                                    <div style={{ ...rowStyle, marginTop: "3px" }}>
                                      <span style={labelStyle}>Giờ KPI</span>
                                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
                                        <input
                                          type="number" min={0} max={999} step={0.5}
                                          value={stage.gioKpi ? (parseFloat(stage.gioKpi) || "") : ""}
                                          placeholder="0"
                                          disabled={isWorking || isReadOnly}
                                          onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            updateStageForm(stage.code, { gioKpi: !isNaN(v) && v > 0 ? String(v) : null });
                                          }}
                                          className={inputCls2}
                                          style={{ width: "52px", flexShrink: 0, textAlign: "right" }}
                                        />
                                        <span style={{ fontSize: "11px", color: "var(--ink-muted)", flexShrink: 0 }}>giờ chuẩn</span>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>

                  {/* Lịch sử workflow bên dưới tiến độ */}
                  {(order.workflowHistory || []).length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{L.ui.panel.sectionHistoryTitle}</p>
                      <HistoryTab order={order} compact />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer CHỈ-ĐỌC ──────────────────────────────────────────────────
            🔴 `isReadOnly` TỪNG LÀ NHỊ PHÂN: chỉ-đọc ⇒ KHÔNG CÓ FOOTER NÀO CẢ, chỉ nút Đóng.
            Đúng với SALES (họ không ghi được gì), SAI với R&D — họ chỉ-đọc mọi ô TRỪ Mã số mẫu,
            nên họ gõ được nhưng không có nút nào để lưu. Người dùng đọc điều đó thành "hệ thống
            không cho tôi cập nhật", và đúng như vậy.

            Hai khái niệm bị gộp làm một: "khoá mọi ô" ≠ "không có gì để lưu". Tách ra ở đây. */}
        {order && isReadOnly && (
          <div style={{ flexShrink: 0, padding: "12px 16px", borderTop: "1px solid var(--border)", background: "var(--cream-card)", display: "flex", alignItems: "center", gap: "8px" }}>
            <button type="button" onClick={onClose} className="psx-btn-secondary" style={{ height: "32px", fontSize: "11px" }}>
              {L.ui.panel.close}
            </button>
            {isPartialWriteRole(currentUserRole) && (
              <>
                <div style={{ flex: 1 }} />
                {isFormDirty && (
                  <span style={{ fontSize: "11px", color: "var(--s-gold, #b45309)" }}>Có thay đổi chưa lưu</span>
                )}
                <button type="button"
                  onClick={() => { if (isSavePending) { toast.info("Đang lưu dữ liệu, vui lòng đợi..."); return; } handleSave(); }}
                  disabled={!isFormDirty || isWorking}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "0 14px", height: "32px", fontSize: "11px", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    background: "var(--s-green)", color: "var(--cream)", border: "none",
                    cursor: !isFormDirty || isWorking ? "not-allowed" : "pointer",
                    opacity: !isFormDirty || isWorking ? 0.4 : 1,
                  }}>
                  {saveMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                  {L.ui.panel.save}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── PRE_PRODUCTION Footer ─────────────────────────────────────────── */}
        {order && !isReadOnly && !isMhOrder && !activeItemSuspended && (
          <div className="shrink-0" style={{ borderTop: "1px solid var(--border)", background: "var(--cream-card)" }}>
            {saveError && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">{saveError}</span>
                {conflictError && (
                  <button type="button" onClick={() => { refetch(); setConflictError(false); setSaveError(null); }}
                    className="px-2 py-0.5 text-xs font-semibold bg-red-100 hover:bg-red-200 rounded border border-red-300 text-red-700 whitespace-nowrap">
                    {L.ui.panel.reload}
                  </button>
                )}
                <button type="button" onClick={() => { setSaveError(null); setConflictError(false); }} className="text-red-400 hover:text-red-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {isFormDirty && form?.status === "DESIGN_APPROVED" && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Bạn có thay đổi chưa lưu. Hãy <strong className="mx-0.5">{L.ui.panel.save}</strong> trước khi Chốt đơn.
              </div>
            )}

            {activeItemEffectiveStatus === "DESIGN_APPROVED" && !isFormDirty && !showPromoteConfirm && (
              <div className="flex items-center gap-2.5 px-4 py-2.5 bg-green-50 border-b border-green-200 text-xs text-green-800">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-green-600" />
                <span className="flex-1">Đơn đã <strong>Chốt 3D</strong>. Nhấn <strong>{L.ui.panel.promoteBtn}</strong> để đưa sang Xưởng sản xuất.</span>
              </div>
            )}

            {showPromoteConfirm && (
              <div className={`px-4 py-3 border-b space-y-2.5 ${promoteIsForced ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
                {promoteIsForced ? (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-amber-800">⚠️ Chuyển xưởng khi chưa Chốt 3D?</p>
                    <p className="text-[11px] text-amber-700">
                      Trạng thái hiện tại là <strong>
                        {PRE_STATUSES.find(s => s.value === promoteEffectiveStatus)?.label ?? promoteEffectiveStatus}
                      </strong>, chưa phải &quot;Chốt 3D — Chuyển xưởng&quot;.
                      Bạn có chắc muốn chuyển sang Sản Xuất ngay bây giờ?
                    </p>
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-green-800">Xác nhận chuyển đơn sang Xưởng sản xuất?</p>
                )}
                {isFormDirty && (
                  <p className="text-[11px] text-gray-500">
                    Thay đổi chưa lưu sẽ được <strong>lưu tự động</strong> trước khi chuyển.
                  </p>
                )}
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    MO# <span className="normal-case font-normal text-gray-400">{L.ui.panel.moDefaultHint}</span>
                  </label>
                  <input
                    type="text"
                    value={mhProductionCode}
                    onChange={(e) => setMhProductionCode(e.target.value)}
                    className={`w-full text-xs font-mono border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 bg-white ${promoteIsForced ? "border-amber-300 focus:ring-amber-200" : "border-green-300 focus:ring-green-200"}`}
                    placeholder={order?.orderNumber ?? ""}
                  />
                </div>
                <textarea value={promoteComment}
                  onChange={(e) => setPromoteComment(e.target.value)}
                  rows={2}
                  className={`w-full text-xs border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 resize-none bg-white ${promoteIsForced ? "border-amber-300 focus:ring-amber-200" : "border-green-300 focus:ring-green-200"}`}
                  placeholder={L.ui.panel.promoteNotePlaceholder} />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => { setShowPromoteConfirm(false); setPromoteIsForced(false); }} disabled={isWorking || isReadOnly}
                    className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                    {L.ui.panel.cancel}
                  </button>
                  <button type="button" onClick={handlePromote} disabled={isWorking || isReadOnly || saveMutation.isPending}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50 ${promoteIsForced ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"}`}>
                    {(promoteMutation.isPending || saveMutation.isPending) && <Loader2 className="w-3 h-3 animate-spin" />}
                    {(promoteMutation.isPending || saveMutation.isPending) ? L.ui.panel.processing : (promoteIsForced ? "Xác nhận chuyển" : L.ui.panel.confirmPromote)}
                  </button>
                </div>
              </div>
            )}

            <div className="px-4 pt-3 pb-1">
              <label className="flex items-center gap-3 cursor-pointer select-none group">
                <div onClick={() => setCreateVersionToggle((v) => !v)}
                  className={cn("relative w-9 h-5 rounded-full transition-colors shrink-0",
                    createVersionToggle ? "bg-blue-600" : "bg-gray-300")}>
                  <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                    createVersionToggle ? "translate-x-4" : "translate-x-0.5")} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-700">{L.ui.panel.versionToggle}</p>
                  <p className="text-[10px] text-gray-400">
                    {createVersionToggle ? L.ui.panel.versionToggleOn : L.ui.panel.versionToggleOff}
                  </p>
                </div>
                {createVersionToggle
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0 ml-auto" />
                  : <ToggleLeft   className="w-3.5 h-3.5 text-gray-300 shrink-0 ml-auto" />
                }
              </label>
            </div>

            {/* Xác nhận Hủy — inline confirm panel (PTK) */}
            {showCancelConfirm && (
              <div className="px-4 py-3 bg-red-50 border-b border-red-200 space-y-2.5">
                <p className="text-xs font-semibold text-red-800">
                  Xác nhận hủy đơn hàng? Hành động này không thể hoàn tác.
                </p>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={2}
                  className="w-full text-xs border border-red-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-200 resize-none bg-white"
                  placeholder="Lý do hủy (bắt buộc)..."
                />
                <div className="flex gap-2 justify-end">
                  <button type="button"
                    onClick={() => { setShowCancelConfirm(false); setCancelReason(""); }}
                    disabled={isWorking}
                    className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                    {L.ui.panel.cancel}
                  </button>
                  <button type="button"
                    onClick={handleCancelConfirmed}
                    disabled={!cancelReason.trim() || isWorking}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                    {isWorking && <Loader2 className="w-3 h-3 animate-spin" />}
                    Xác nhận hủy
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px" }}>
              {/* --- TRÁI: close + destructive --- */}
              <button type="button" onClick={onClose} disabled={isWorking} className="psx-btn-secondary" style={{ height: "32px", fontSize: "11px" }}>
                {L.ui.panel.close}
              </button>

              {!effectiveTerminal && !showPromoteConfirm && !showCancelConfirm && (
                <button type="button"
                  onClick={() => { setShowCancelConfirm(true); setShowPromoteConfirm(false); setSaveError(null); }}
                  disabled={isWorking}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "0 12px", height: "32px", fontSize: "11px", fontWeight: 600,
                    color: "var(--s-red)", background: "transparent",
                    border: "1px solid var(--s-red)", cursor: "pointer",
                    opacity: isWorking ? 0.4 : 1,
                  }}>
                  <X className="w-3 h-3" />
                  Hủy
                </button>
              )}

              {/* SPACER */}
              <div style={{ flex: 1 }} />

              {/* --- PHẢI: primary actions --- */}
              {!isMhOrder && !showPromoteConfirm && !showCancelConfirm && (
                <button type="button"
                  onClick={() => {
                    // Không còn chặn dirty: nếu có thay đổi, handlePromote sẽ auto-save trước.
                    // force tính theo trạng thái SẼ lưu (form.status), không phải server cũ.
                    setPromoteIsForced(!promoteWillBeApproved);
                    setShowPromoteConfirm(true);
                  }}
                  disabled={isWorking || saveMutation.isPending || isSavePending || createVersionToggle}
                  title={
                    createVersionToggle
                      ? "Tắt 'Tạo phiên bản' trước khi chuyển xưởng"
                      : isSavePending
                        ? "Đang lưu dữ liệu, vui lòng đợi…"
                        : undefined
                  }
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "0 14px", height: "32px", fontSize: "11px", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    background: promoteWillBeApproved ? "var(--s-green)" : "var(--s-amber, #d97706)",
                    color: "var(--cream)", border: "none", cursor: "pointer",
                    opacity: (isWorking || saveMutation.isPending || isSavePending || createVersionToggle) ? 0.4 : 1,
                  }}>
                  {(promoteMutation.isPending || saveMutation.isPending) && <Loader2 className="w-3 h-3 animate-spin" />}
                  {L.ui.panel.promoteBtn}
                </button>
              )}

              <button type="button"
                onClick={() => { if (isSavePending) { toast.info("Đang lưu dữ liệu, vui lòng đợi..."); return; } handleSave(); }}
                disabled={!isFormDirty || isWorking}
                title={isSavePending ? "Đang lưu dữ liệu, vui lòng đợi..." : undefined}
                className={isFormDirty && !isWorking && !isSavePending ? "psx-btn-primary" : "psx-btn-secondary"}
                style={{ height: "32px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px", opacity: (!isFormDirty || isWorking || isSavePending) ? 0.4 : 1 }}>
                {isSavePending ? <><Loader2 className="w-3 h-3 animate-spin" /> Đang lưu...</> : !isFormDirty ? <><CheckCircle2 className="w-3 h-3" /> {L.ui.panel.saved}</> : L.ui.panel.save}
              </button>
            </div>
          </div>
        )}

        {/* ── MASTER_HUB Footer ─────────────────────────────────────────────── */}
        {order && !isReadOnly && isMhOrder && !activeItemSuspended && (
          <div className="shrink-0" style={{ borderTop: "1px solid var(--border)", background: "var(--cream-card)" }}>
            {saveError && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">{saveError}</span>
                {conflictError && (
                  <button type="button" onClick={() => { refetch(); setConflictError(false); setSaveError(null); }}
                    className="px-2 py-0.5 text-xs font-semibold bg-red-100 hover:bg-red-200 rounded border border-red-300 text-red-700 whitespace-nowrap">
                    {L.ui.panel.reload}
                  </button>
                )}
                <button type="button" onClick={() => { setSaveError(null); setConflictError(false); }} className="text-red-400 hover:text-red-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Rollback confirm panel */}
            {showRollbackConfirm && (
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 space-y-2.5">
                <p className="text-xs font-semibold text-amber-800">
                  Thiết kế lại? Đơn sẽ quay về Phòng Thiết Kế.
                </p>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Trạng thái sau khi hoàn trả
                  </label>
                  <select
                    value={rollbackTarget}
                    onChange={(e) => setRollbackTarget(e.target.value as typeof rollbackTarget)}
                    disabled={isWorking || isReadOnly}
                    className="w-full text-xs border border-amber-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-200 bg-white"
                  >
                    <option value="DRAFT">Chưa thiết kế</option>
                    <option value="PENDING_DESIGN">Làm INFO</option>
                    <option value="IN_DESIGN">Đang thiết kế (mặc định)</option>
                    <option value="DESIGN_REVIEW">Chờ khách duyệt</option>
                  </select>
                </div>
                <textarea value={rollbackReason}
                  onChange={(e) => setRollbackReason(e.target.value)}
                  rows={2}
                  className="w-full text-xs border border-amber-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none bg-white"
                  placeholder="Lý do thiết kế lại (bắt buộc)..." />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowRollbackConfirm(false)} disabled={isWorking || isReadOnly}
                    className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                    {L.ui.panel.cancel}
                  </button>
                  <button type="button" onClick={handleRollback}
                    disabled={!rollbackReason.trim() || isWorking}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50">
                    {rollbackMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                    {L.ui.panel.confirmRollback}
                  </button>
                </div>
              </div>
            )}

            {/* Xác nhận Hủy — inline confirm panel (non-suspended MH) */}
            {showCancelConfirm && (
              <div className="px-4 py-3 bg-red-50 border-b border-red-200 space-y-2.5">
                <p className="text-xs font-semibold text-red-800">
                  Xác nhận hủy {activeItemId ? `MO ${activeItem?.moNumber ?? ""}` : "đơn hàng"}? Hành động này không thể hoàn tác.
                </p>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={2}
                  className="w-full text-xs border border-red-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-200 resize-none bg-white"
                  placeholder="Lý do hủy (bắt buộc)..."
                />
                <div className="flex gap-2 justify-end">
                  <button type="button"
                    onClick={() => { setShowCancelConfirm(false); setCancelReason(""); }}
                    disabled={isWorking}
                    className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                    {L.ui.panel.cancel}
                  </button>
                  <button type="button"
                    onClick={handleCancelConfirmed}
                    disabled={!cancelReason.trim() || isWorking}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                    {isWorking && <Loader2 className="w-3 h-3 animate-spin" />}
                    Xác nhận hủy
                  </button>
                </div>
              </div>
            )}

            {/* Xác nhận Hoàn tất — inline confirm panel (non-suspended MH) */}
            {showCompleteConfirm && (
              <div className="px-4 py-3 bg-green-50 border-b border-green-200 space-y-2.5">
                <p className="text-xs font-semibold text-green-800">
                  Xác nhận hoàn tất {activeItemId ? `MO ${activeItem?.moNumber ?? ""}` : "đơn hàng"}?
                  Đơn sẽ chuyển sang tab <strong>Hoàn tất</strong>.
                </p>
                {productionForm && !(productionForm.completedDate ?? "").trim() && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-center justify-between gap-2">
                    <span>
                      ⚠ Bạn chưa nhập <strong>Ngày HT</strong>. Vẫn hoàn tất thì Ngày HT sẽ để <strong>trống</strong>
                      {" "}(KPI/lọc theo Ngày HT sẽ không tính đơn này).
                    </span>
                    <button type="button"
                      onClick={() => updateProductionForm("completedDate", todayVnYmd())}
                      className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded border border-amber-300 bg-white hover:bg-amber-100"
                    >
                      Điền hôm nay
                    </button>
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button type="button"
                    onClick={() => setShowCompleteConfirm(false)}
                    disabled={isWorking}
                    className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                    {L.ui.panel.cancel}
                  </button>
                  <button type="button"
                    onClick={() => { setShowCompleteConfirm(false); handleComplete(); }}
                    disabled={isWorking}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                    {isWorking && <Loader2 className="w-3 h-3 animate-spin" />}
                    Xác nhận Hoàn tất
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px" }}>
              {/* --- TRÁI: navigation / destructive --- */}
              <button type="button" onClick={onClose} disabled={isWorking} className="psx-btn-secondary" style={{ height: "32px", fontSize: "11px" }}>
                {L.ui.panel.close}
              </button>

              {!showRollbackConfirm && !showCancelConfirm && (
                <button type="button"
                  onClick={() => { setShowRollbackConfirm(true); setShowCancelConfirm(false); setCancelReason(""); setSaveError(null); }}
                  disabled={isWorking}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "0 12px", height: "32px", fontSize: "11px", fontWeight: 600,
                    color: "var(--s-gold)", background: "transparent",
                    border: "1px solid var(--s-gold)", cursor: "pointer",
                    opacity: isWorking ? 0.4 : 1,
                  }}>
                  <RotateCcw className="w-3 h-3" />
                  Thiết kế lại
                </button>
              )}

              {!isActiveItemTerminal && !showRollbackConfirm && !showCancelConfirm && (
                <button type="button"
                  onClick={() => { setShowCancelConfirm(true); setShowRollbackConfirm(false); setSaveError(null); }}
                  disabled={isWorking}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "0 12px", height: "32px", fontSize: "11px", fontWeight: 600,
                    color: "var(--s-red)", background: "transparent",
                    border: "1px solid var(--s-red)", cursor: "pointer",
                    opacity: isWorking ? 0.4 : 1,
                  }}>
                  <X className="w-3 h-3" />
                  Hủy
                </button>
              )}

              {/* SPACER */}
              <div style={{ flex: 1 }} />

              {/* --- PHẢI: primary actions --- */}
              {!isActiveItemTerminal && !showRollbackConfirm && !showCancelConfirm && !showCompleteConfirm && (
                <button type="button"
                  onClick={() => { setShowCompleteConfirm(true); setSaveError(null); }}
                  disabled={isWorking}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "0 14px", height: "32px", fontSize: "11px", fontWeight: 600,
                    color: "var(--cream)", background: "var(--s-green)",
                    border: "none", cursor: "pointer",
                    opacity: isWorking ? 0.4 : 1,
                  }}>
                  <CheckCircle2 className="w-3 h-3" />
                  Hoàn tất
                </button>
              )}

              <button type="button"
                onClick={() => { if (isSavePending) { toast.info("Đang lưu dữ liệu, vui lòng đợi..."); return; } handleMhSave(); }}
                disabled={!isMhDirty || isWorking}
                title={isSavePending ? "Đang lưu dữ liệu, vui lòng đợi..." : undefined}
                className={isMhDirty && !isWorking && !isSavePending ? "psx-btn-primary" : "psx-btn-secondary"}
                style={{ height: "32px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px", opacity: (!isMhDirty || isWorking || isSavePending) ? 0.4 : 1 }}>
                {isSavePending ? <><Loader2 className="w-3 h-3 animate-spin" /> Đang lưu...</> : !isMhDirty ? <><CheckCircle2 className="w-3 h-3" /> {L.ui.panel.saved}</> : L.ui.panel.save}
              </button>
            </div>
          </div>
        )}

        {/* Footer khi TẠM NGƯNG — hiển thị khi MO active bị tạm ngưng */}
        {order && !isReadOnly && activeItemSuspended && (
          <div className="shrink-0" style={{ borderTop: "1px solid var(--s-red)", background: "rgba(155,45,45,0.04)" }}>
            {/* Label */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px 8px", borderBottom: "1px solid rgba(155,45,45,0.15)" }}>
              <AlertTriangle style={{ width: "13px", height: "13px", color: "var(--s-red)", flexShrink: 0 }} />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--s-red)" }}>
                {activeItemId
                  ? `MO ${activeItem?.moNumber ?? ""} đang TẠM NGƯNG`
                  : "Đơn đang TẠM NGƯNG do Cảnh báo đặc biệt"}
              </span>
            </div>

            {saveError && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", background: "rgba(155,45,45,0.08)", borderBottom: "1px solid rgba(155,45,45,0.15)", fontSize: "12px", color: "var(--s-red)" }}>
                <AlertCircle style={{ width: "13px", height: "13px", flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{saveError}</span>
                {conflictError && (
                  <button type="button" onClick={() => { refetch(); setConflictError(false); setSaveError(null); }}
                    style={{ padding: "2px 8px", fontSize: "11px", fontWeight: 600, background: "rgba(155,45,45,0.15)", border: "1px solid rgba(155,45,45,0.3)", borderRadius: "4px", cursor: "pointer", color: "var(--s-red)", whiteSpace: "nowrap" }}>
                    {L.ui.panel.reload}
                  </button>
                )}
                <button type="button" onClick={() => { setSaveError(null); setConflictError(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--s-red)", padding: "2px" }}>
                  <X style={{ width: "13px", height: "13px" }} />
                </button>
              </div>
            )}

            {/* Cancel confirm */}
            {showCancelConfirm && (
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "8px" }}>
                <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--s-red)", margin: 0 }}>
                  Xác nhận hủy {activeItemId ? `MO ${activeItem?.moNumber ?? ""}` : "đơn hàng"}? Vàng đang chế tác sẽ cần thu hồi.
                </p>
                <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2}
                  className={`${inputCls(false)} resize-none`} placeholder="Lý do hủy (bắt buộc)..." />
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setShowCancelConfirm(false)} disabled={isWorking} className="psx-btn-secondary" style={{ height: "30px", fontSize: "11px" }}>{L.ui.panel.close}</button>
                  <button type="button"
                    onClick={handleCancelConfirmed}
                    disabled={!cancelReason.trim() || isWorking}
                    className="psx-btn-primary"
                    style={{ height: "30px", fontSize: "11px" }}>
                    Xác nhận hủy
                  </button>
                </div>
              </div>
            )}

            {/* Rollback confirm */}
            {showRollbackConfirm && (
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "8px" }}>
                <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--s-gold)", margin: 0 }}>Thiết kế lại? Đơn sẽ quay về Phòng Thiết Kế.</p>
                <select value={rollbackTarget} onChange={(e) => setRollbackTarget(e.target.value as typeof rollbackTarget)}
                  disabled={isWorking} className={inputCls(false)} style={{ fontSize: "12px" }}>
                  <option value="DRAFT">Chưa thiết kế</option>
                  <option value="PENDING_DESIGN">Làm INFO</option>
                  <option value="IN_DESIGN">Đang thiết kế (mặc định)</option>
                  <option value="DESIGN_REVIEW">Chờ khách duyệt</option>
                </select>
                <textarea value={rollbackReason} onChange={(e) => setRollbackReason(e.target.value)} rows={2}
                  className={`${inputCls(false)} resize-none`} placeholder="Lý do thiết kế lại (bắt buộc)..." />
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setShowRollbackConfirm(false)} disabled={isWorking} className="psx-btn-secondary" style={{ height: "30px", fontSize: "11px" }}>{L.ui.panel.close}</button>
                  <button type="button" onClick={handleRollback} disabled={!rollbackReason.trim() || isWorking}
                    className="psx-btn-primary" style={{ height: "30px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}>
                    {rollbackMutation.isPending && <Loader2 style={{ width: "12px", height: "12px" }} className="animate-spin" />}
                    {L.ui.panel.confirmRollback}
                  </button>
                </div>
              </div>
            )}

            {/* Showroom confirm */}
            {showShowroomConfirm && (
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "8px" }}>
                <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--s-gold)", margin: 0 }}>
                  Chuyển MO <strong>{activeItem?.moNumber ?? activeItemId}</strong> sang Hàng Showroom?
                  MO này sẽ tiếp tục sản xuất và được đánh dấu <strong>SR</strong> — các MO khác cùng SO không bị ảnh hưởng.
                </p>
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setShowShowroomConfirm(false)} disabled={isWorking}
                    className="psx-btn-secondary" style={{ height: "30px", fontSize: "11px" }}>{L.ui.panel.close}</button>
                  <button type="button"
                    onClick={handleShowroomConfirmed}
                    disabled={isWorking}
                    className="psx-btn-primary"
                    style={{ height: "30px", fontSize: "11px" }}>
                    Xác nhận Showroom
                  </button>
                </div>
              </div>
            )}

            {/* 4 action buttons theo logic hệ thống cũ — ẩn khi đã hoàn tất/hủy */}
            {!effectiveTerminal && !showCancelConfirm && !showRollbackConfirm && !showShowroomConfirm && (
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>

                {/* Hoàn tất ẨN khi đang TẠM NGƯNG — order có vấn đề chưa giải quyết.
                    User phải Tiếp tục SX trước, rồi mới Hoàn tất qua panel bình thường. */}

                {/* 1b. TIẾP TỤC SẢN XUẤT */}
                <button type="button" onClick={handleResume}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                    height: "36px", background: "transparent", color: "var(--s-green)",
                    border: "1px solid var(--s-green)",
                    fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em",
                    cursor: "pointer", transition: "opacity 0.15s",
                  }}>
                  Tiếp tục sản xuất
                </button>

                {/* 2. CHUYỂN SANG SHOWROOM */}
                <button type="button"
                  onClick={() => { setShowShowroomConfirm(true); setShowCancelConfirm(false); setShowRollbackConfirm(false); setSaveError(null); }}
                  disabled={isWorking}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                    height: "36px", background: "transparent", color: "var(--s-gold)",
                    border: "1px solid var(--s-gold)", fontSize: "11px", fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    cursor: "pointer", opacity: isWorking ? 0.4 : 1,
                  }}>
                  <ArrowRight style={{ width: "12px", height: "12px" }} />
                  Chuyển sang Showroom
                </button>

                <div style={{ display: "flex", gap: "8px" }}>
                  {/* 3. THIẾT KẾ LẠI — hiện cho cả per-MO lẫn SO-level */}
                  {isMhOrder && (
                    <button type="button"
                      onClick={() => { setShowRollbackConfirm(true); setShowCancelConfirm(false); setShowShowroomConfirm(false); setSaveError(null); }}
                      disabled={isWorking}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                        height: "36px", background: "transparent", color: "var(--ink-muted)",
                        border: "1px solid var(--border-md)", fontSize: "11px", fontWeight: 600,
                        textTransform: "uppercase", letterSpacing: "0.08em",
                        cursor: "pointer", opacity: isWorking ? 0.4 : 1,
                      }}>
                      <RotateCcw style={{ width: "12px", height: "12px" }} />
                      Thiết kế lại
                    </button>
                  )}

                  {/* 4. HỦY & TRẢ VÀNG — mở confirm panel */}
                  <button type="button"
                    onClick={() => { setShowCancelConfirm(true); setShowRollbackConfirm(false); setShowShowroomConfirm(false); setSaveError(null); }}
                    disabled={isWorking}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                      height: "36px", background: "transparent", color: "var(--s-red)",
                      border: "1px solid var(--s-red)", fontSize: "11px", fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer",
                      opacity: isWorking ? 0.4 : 1,
                    }}>
                    <X style={{ width: "12px", height: "12px" }} />
                    {activeItemId ? "Hủy MO & Trả vàng" : "Hủy & Bàn giao"}
                  </button>

                  <button type="button" onClick={onClose} disabled={isWorking} className="psx-btn-secondary" style={{ height: "36px", fontSize: "11px" }}>
                    Đóng
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
    </ReadOnlyCtx.Provider>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────


// Wrapper hiển thị DD/MM/YYYY, dùng showPicker() để mở calendar khi click.
// Reliable hơn overlay opacity-0 trong panel position:fixed.
// ─── Shared Items Tab (used by both PRE and MH) ───────────────────────────────

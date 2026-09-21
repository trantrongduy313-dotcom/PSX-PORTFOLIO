export type OrderStatus =
  | "DRAFT"
  | "PENDING_DESIGN"
  | "IN_DESIGN"
  | "DESIGN_REVIEW"
  | "DESIGN_APPROVED"
  | "DESIGN_COMPLETED"
  | "PENDING_PRODUCTION"
  | "IN_PRODUCTION"
  | "QUALITY_CHECK"
  | "COMPLETED"
  | "SUSPENDED"
  | "CANCELLED";

export type OrderZone = "PRE_PRODUCTION" | "MASTER_HUB";

export type OrderUser = {
  id: string;
  name: string;
  role: string;
};

// V2 ref: COL_GROUPS — dữ liệu sản phẩm đầu tiên hiển thị trên bảng danh sách
export type OrderFirstItem = {
  itemId: string;                    // OrderItem.id — dùng để mở panel per-item
  moNumber: string | null;           // V2: MO# col 3 — định danh chính cho mỗi dòng
  zone: OrderZone;                   // Per-MO zone — PRE_PRODUCTION or MASTER_HUB
  itemStatus: OrderStatus | null;    // per-item status override; null = kế thừa Order.status
  productName: string;
  nvl: string | null;            // V2: NVL col 22
  size: string | null;           // V2: SIZE col 24
  mainStoneType: string | null;  // V2: LOAI_HOT_CHU col 26
  mainStoneSize: string | null;  // V2: DA_CHU col 27 ("5.4mm x 1v")
  ghiChuSp: string | null;       // V2: GHI_CHU_SP col 29 (từ specifications)
  techNote: string | null;       // V2: DIEN_GIAI_SP — Diễn giải SP (cột DIỄN GIẢI trên GS)
  // Mã số mẫu — R&D nhập khi MO đã sang PSX. PER-MO; xem business/orders/ma-so-mau.ts.
  masoMau: string | null;
  // Loại SP — user chọn tay (RI/PD/ER/BL/BG/NL/CH/CH-TAY/BL-TAY/BG-TAY/ACC/O), không suy đoán
  loaiSp: string | null;
  // Extended fields for MASTER_HUB Kỹ thuật tab
  techClassification: string[];       // V2: PHAN_LOAI_KT col 19 — raw CSV tokens
  platingType: string | null;        // V2: XI_MA col 25
  designFileUrl: string | null;      // V2: ANH_FILE_3D col 17
  designImageUrl: string | null;     // Ảnh đại diện upload trực tiếp (Supabase Storage) — song song với link Drive
  // Kết quả thiết kế 3D ĐÃ ĐƯỢC Order/Admin duyệt. Chưa duyệt thì null — bản nộp còn có thể
  // bị bác, hiện ra bảng sớm sẽ khiến Order đọc một kết quả chưa được chấp nhận.
  // Dấu hiệu cho Order biết đơn đang ở đâu trong luồng 3D. null = chưa ai nộp gì.
  design3dReviewStatus: "PENDING_REVIEW" | "ACCEPTED" | "REWORK" | null;
  // Số liệu CHỈ có khi đã duyệt — bản vừa nộp còn có thể bị bác.
  design3dCompletedAt: string | null;
  design3dKpiStatus: "ON_TIME" | "LATE" | null;
  weightGram: string | null;         // V2: TRONG_LUONG_YC col 14 = TL 3D (g)
  chiTietDaTam: string | null;       // V2: CHI_TIET_DA_TAM col 28 (từ specifications)
  quantity: number;                  // V2: SO_LUONG col 23
  // V2 ref: PHAN_LOAI_KH = "SR" per-MO (specifications.isShowroom)
  isShowroom: boolean;
  // Ngày lên đơn PTK — từ cột NGÀY LÊN ĐƠN của đúng row MO trong T06
  orderDate: string | null;
  // Per-MO scheduling & priority fields
  estimatedDate: string | null;
  requiredDate: string | null;
  completedAt: string | null;
  saleNote: string | null;
  priorityCode: string;
  isPriority: boolean;
  isRush: boolean;
  // Theo dõi BOM per-MO (PTK) — specifications.bom (business/bom.ts); null = chưa phân loại.
  // bomDate = ngày của trạng thái HIỆN TẠI (mỗi trạng thái có ô ngày riêng, xem readBomState).
  bomStatus: string | null;
  bomDate: string | null;
  // Ghi đè riêng theo MO (specifications.*Override ?? giá trị chung của SO).
  // Nguồn KHÔNG có override — luôn dùng chung SO, không khai báo ở đây.
  customerName: string;
  salesName: string | null;
  donHang3Sao: boolean;
  linkChat: string | null;
  // Per-item alert info — only this item's own alert (not all order alerts)
  ownAlertTitle: string | null;
  ownAlertCount: number;
  // Per-item production data (extraData.perItem[itemId]) — populated for MASTER_HUB only
  tl3d: string | null;
  tlXuong: string | null;
  qd24k: string | null;
  qdPt: string | null;
  qdBac: string | null;
  tlThucTeHt: string | null;
  danhGiaTl: string | null;
  pctChenLech: string | null;
  thongTinHt: string | null;
  // Ngày HT PER-MO (extraData.perItem[id].completedDate ?? OrderItem.completedAt)
  completedDate: string | null;
  // Per-item congDoan — computed from this item's stages only (not SO-level aggregate)
  congDoan: string | null;
  congDoanCode: string | null;
  congDoanStatus: string | null;
  // MO này đã có bản ở PSX chưa (gắn theo TỪNG MO — không phải theo cả SO). null = chưa.
  psxSibling?: { orderNumber: string; status: string; version: number } | null;
  // Order cha được tạo qua webapp (createdById != null) hay import từ script (null)?
  // Dùng để quyết định có hiện "_N" phiên bản 1 ngầm định cho MO bare hay không — xem
  // getMoVersionDisplay/formatMoVersionedDisplay trong order-helpers.ts.
  isFromWebapp?: boolean;
  // ── Thông tin hủy — CHỈ có ở tab Đã hủy ─────────────────────────────────────
  // Đọc ngược từ workflowHistory (không có cột nào trong schema; completedDate bị set null
  // khi hủy). Optional vì các tab khác không tốn query để lấy — undefined ở đó nghĩa là
  // "chưa hỏi", khác với null nghĩa là "đã hỏi và không có bản ghi".
  cancelledAt?: string | null;
  cancelReason?: string | null;
};

// V2 ref: TIẾN ĐỘ + KẾT QUẢ — dữ liệu sản xuất từ productionDetail
export type OrderProductionSummary = {
  // V2: TL_3D col 30 — cân nặng 3D design (lưu trong extraData)
  tl3d: string | null;
  // V2: TL_XUONG col 31 — cân sau đúc khuôn
  tlXuong: string | null;
  // V2: QD_24K col 32 — quy đổi 24K (tính tự động)
  qd24k: string | null;
  // V2: QD_PT col 33 — quy đổi Platinum
  qdPt: string | null;
  // Quy đổi Bạc (999) — TÁCH RIÊNG qd24k/qdPt, mốc tinh khiết bạc khác vàng.
  qdBac: string | null;
  // V2: CONG_DOAN_HIEN_TAI col 38 — công đoạn đang làm (tính từ stage dates)
  congDoan: string | null;
  congDoanCode: string | null;
  congDoanStatus: string | null;
  // V2: NGAY_HOAN_TAT col 34
  ngayHoanTat: string | null;
  // V2: TL_THUC_TE_HT col 35 — cân thực tế khi hoàn tất
  tlThucTeHt: string | null;
  // V2: DANH_GIA_TL col 36 — "Đạt" / "Không đạt"
  danhGiaTl: string | null;
  // V2: % CHÊNH LỆCH (in DATA_JSON) — tính tự động
  pctChenLech: string | null;
  // V2: THONG_TIN_CHI_TIET_HT col 39
  thongTinHt: string | null;
  // V2: CANH_BAO_DAC_BIET col 41 — cảnh báo đặc biệt
  canhBaoDacBiet: string | null;
};

export type OrderSummary = {
  id: string;
  orderNumber: string;
  // V2: tất cả MO# của đơn — dùng để hiển thị khi có nhiều sản phẩm
  allMoNumbers: string[];
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  saleNote: string | null;
  nguon: string | null;
  phanLoaiKh: string | null;
  donHang3Sao: boolean;
  linkChat: string | null;
  // V2 parity: text sales name (no FK)
  salesName: string | null;
  // V2: CAP_DO_UU_TIEN — "UT1" | "UT2" | "Normal" | "SR"
  priorityCode: string;
  status: OrderStatus;
  zone: OrderZone;
  isSuspended: boolean;
  isPriority: boolean;
  isRush: boolean;
  orderDate: string;
  requiredDate: string | null;
  estimatedDate: string | null;
  estimatedTotal: string | null;
  depositAmount: string | null;
  version: number;
  // MO-level grouping fields — set on create/version; used for client-side sort
  sortKey: string;
  versionNumber: number | null;
  baseOrderNumber: string | null;
  // Phiên bản anh em đang ở PSX (MASTER_HUB) — chỉ set khi xem tab PTK, để báo
  // "MO này đã có phiên bản chuyển sang sản xuất". null nếu không có.
  psxSibling?: { versionNumber: number | null; status: OrderStatus; orderNumber: string } | null;
  completedDate: string | null;
  createdBy: OrderUser | null;
  assignedTo: OrderUser | null;
  _count: { items: number; alerts: number };
  // V2: dữ liệu sản phẩm đầu tiên dùng hiển thị cột NVL, Size, Đá chủ, Ghi chú SP
  firstItem: OrderFirstItem | null;
  // Tất cả MO items — dùng để hiển thị mỗi MO một dòng trên bảng
  allItems: OrderFirstItem[];
  // V2: dữ liệu sản xuất — chỉ có khi zone=MASTER_HUB
  productionSummary: OrderProductionSummary | null;
  // Pre-computed stage filter keys for client-side filtering (snapshot mode, PSX only)
  stageMatchKeys?: string[];
  // Latest unresolved alert title — shown in PSX table Cảnh báo column
  activeAlertTitle: string | null;
  storeId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrdersListResponse = {
  data: OrderSummary[];
  pagination: Pagination;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type OrderTab =
  | "all"
  | "pre-production"
  | "master-hub"
  | "suspended"
  | "priority"
  | "history"
  | "completed"
  | "cancelled";

// ⚠️ KHÔNG CÒN DÙNG Ở MÀN ĐƠN HÀNG. Tab Phòng Sản Xuất trước có 5 nhóm cột; bốn nhóm Tiến độ /
// Đơn hàng / Kỹ thuật / Kết quả đã bỏ, PSX giờ chỉ còn một bảng duy nhất.
//
// Giữ type lại vì màn Cửa hàng (stores/[storeId]) vẫn có bốn view đó — nhưng nó KHAI BÁO
// MhView RIÊNG của nó (không có "tongquan") và không import từ đây. Hai chỗ độc lập hoàn toàn.
export type MhView = "tongquan" | "tiendo" | "dondang" | "kythuat" | "ketqua";

export type OrderFilters = {
  tab?: OrderTab;
  search?: string;
  status?: OrderStatus;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  stageFilter?: string;
  phanLoaiKh?: string;
};

// ─── Alert types ─────────────────────────────────────────────────────────────

export type AlertType =
  | "SPECIAL"
  | "MATERIAL_SHORTAGE"
  | "RUSH_ORDER"
  | "QUALITY_ISSUE"
  | "DESIGN_CHANGE"
  | "CUSTOMER_COMPLAINT";

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type OrderAlert = {
  id: string;
  orderId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  resolvedNote: string | null;
  autoSuspended: boolean;
  raisedById: string;
  createdAt: string;
  updatedAt: string;
};

// ─── Order Item (full) ────────────────────────────────────────────────────────

export type OrderItem = {
  id: string;
  orderId: string;
  lineNumber: number;
  // V2 ref: MO# col 3 — định danh chính cho mỗi sản phẩm
  moNumber: string | null;
  zone: OrderZone;
  productName: string;
  category: string;
  quantity: number;
  material: string | null;
  // V2: NVL col 22 MASTER_HUB — free-text gold alloy code
  nvl: string | null;
  weightGram: string | null;
  size: string | null;
  color: string | null;
  engraving: string | null;
  specifications: Record<string, unknown> | null;
  // V2: ThongTinChiTiet jewelry technical fields
  techClassification: string[];
  mainStoneType: string | null;
  mainStoneSize: string | null;
  mainStoneQty: number | null;
  platingType: string | null;
  techNote: string | null;
  /** "Mã số mẫu" — R&D nhập khi MO đã sang PSX. Xem business/orders/ma-so-mau.ts. */
  masoMau: string | null;
  designFileUrl: string | null;
  designImageUrl: string | null;
  // Tài liệu tham khảo gửi kèm khi giao việc cho NV 3D — xem OrderItem trong schema.prisma.
  sampleImageUrl: string | null;
  /** Ảnh mẫu upload thẳng, ≤2 — chỉ route sample-images ghi. Xem schema.prisma. */
  sampleImageUploads: string[];
  /** ⚠️ Đang ngừng dùng — đã chép sang `sampleFolderUrl`. Chỉ đọc để lùi về cho dòng cũ. */
  sampleVideoUrl: string | null;
  /** "Folder mẫu" — link Drive tới folder nhiều ảnh + video. */
  sampleFolderUrl: string | null;
  /** Ưu tiên của việc thiết kế 3D — trục riêng; xem kpi-3d/design-priority.ts. */
  design3DPriorityCode?: string | null;
  approvedDesign: string | null;
  crafterName: string | null;
  craftingNote: string | null;
  qualityNote: string | null;
  unitPrice: string | null;
  // Ngày lên đơn PTK — từ cột NGÀY LÊN ĐƠN của đúng row MO trong T06
  orderDate: string | null;
  estimatedDate: string | null;
  requiredDate: string | null;
  saleNote: string | null;
  priorityCode: string;
  isPriority: boolean;
  isRush: boolean;
  createdAt: string;
  updatedAt: string;
};

// ─── Production Detail ────────────────────────────────────────────────────────

export type ProductionDetail = {
  id: string;
  orderId: string;
  // V2 ref: MO# — sinh khi promote sang MASTER_HUB (e.g. MO-2605-0001)
  productionCode: string | null;
  workshopCode: string | null;
  workshopName: string | null;
  supervisorName: string | null;
  // V2 stage 1: RESIN
  resinStartAt: string | null;
  resinDoneAt: string | null;
  resinCrafter: string | null;
  // V2 stage 2: DUC (casting)
  castingStartAt: string | null;
  castingDoneAt: string | null;
  castingCrafter: string | null;
  // V2 stage 3: THU CONG (handcraft)
  handcraftStartAt: string | null;
  handcraftDoneAt: string | null;
  handcraftCrafter: string | null;
  // V2 stage 4: NGUOI (coldwork)
  coldworkStartAt: string | null;
  coldworkDoneAt: string | null;
  coldworkCrafter: string | null;
  // V3 extra: polishing
  polishingStartAt: string | null;
  polishingDoneAt: string | null;
  polishingCrafter: string | null;
  // V2 stage 5: HOT (setting)
  settingStartAt: string | null;
  settingDoneAt: string | null;
  settingCrafter: string | null;
  // V2 stage 6: MOC MAY (machine)
  machineStartAt: string | null;
  machineDoneAt: string | null;
  machineCrafter: string | null;
  // V2 stage 7: DBXM (plating)
  platingStartAt: string | null;
  platingDoneAt: string | null;
  platingCrafter: string | null;
  // V2 stage 8: QC
  qcStartAt: string | null;
  qcDoneAt: string | null;
  qcCrafter: string | null;
  packagingDoneAt: string | null;
  materialReceived: boolean;
  materialNote: string | null;
  qcResult: string | null;
  qcNote: string | null;
  reworkCount: number;
  shippingCarrier: string | null;
  trackingNumber: string | null;
  deliveredAt: string | null;
  internalNote: string | null;
  extraData: Record<string, unknown> | null;
};

// ─── Workflow History ─────────────────────────────────────────────────────────

export type WorkflowEntry = {
  id: string;
  orderId: string;
  action: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  fromZone: OrderZone | null;
  toZone: OrderZone | null;
  comment: string | null;
  metadata: Record<string, unknown> | null;
  performedBy: OrderUser;
  performedAt: string;
};

// ─── Order Detail (full) ──────────────────────────────────────────────────────

export type OrderDetail = OrderSummary & {
  finalTotal: string | null;
  currency: string;
  estimatedDate: string | null;
  completedDate: string | null;
  designBriefUrl: string | null;
  referenceUrls: string[];
  productionNote: string | null;
  items: OrderItem[];
  productionDetail: ProductionDetail | null;
  /**
   * Lượt giao việc 3D còn hiệu lực của đơn — NGUỒN SỰ THẬT cho ngày hoàn tất, kết quả KPI
   * và trạng thái kiểm nội bộ. Sidebar đọc từ đây thay vì từ bản sao trong extraData JSON.
   */
  design3DAssignments?: Design3DAssignmentRow[];
  alerts: OrderAlert[];
  workflowHistory: WorkflowEntry[];
  _count: { items: number; alerts: number; versions: number };
};

export type Design3DAssignmentRow = {
  id: string;
  orderItemId: string;
  status: string;
  assignedAt: string;
  deadlineAt: string;
  completedAt: string | null;
  kpiStatus: "ON_TIME" | "LATE" | null;
  // `kpiDeltaMinutes` đã bỏ khỏi kiểu này vì API không còn gửi nó — xem chú thích ở
  // api/orders/[id]/route.ts. Khai một trường mà API không gửi là một lời nói dối trong kiểu:
  // TypeScript bảo đảm nó có, người đọc tin, rồi lúc chạy nó là undefined.
  standardMinutesSnapshot: number;
  acknowledgedAt: string | null;
  notifiedAt: string | null;
  reviewStatus: "PENDING_REVIEW" | "ACCEPTED" | "REWORK" | null;
  reviewNote: string | null;
  reworkCount: number;
  /**
   * Lượt này tiếp nối lượt nào — null nghĩa là lần 1 của một chuỗi.
   *
   * API đơn hàng nay trả về CẢ lượt đã đóng để sidebar dựng được lịch sử các lần. Chỗ nào dựng
   * khối trường theo từng NV 3D phải lọc qua activeAttempts() trước — xem kpi-3d/attempt-chain.
   */
  reassignedFromId: string | null;
  continuationReason: "REJECT_REASSIGN" | "MANUAL_REASSIGN" | "PAUSE_RESUME" | null;
  progressLogs: Array<{ renderInfoUrl: string | null; createdAt: string }>;
  /**
   * Các khoảng bị tạm dừng của lượt này.
   *
   * ⚠️ KHÔNG PHẢI DỮ LIỆU TRANG TRÍ. Giờ thực tế phải TRỪ phần bị gác; thiếu mảng này thì
   * sidebar hiện một con số phồng lên trong khi màn Việc thiết kế 3D hiện số đã trừ — cùng một
   * lượt, hai màn hình hai con số, và không màn nào báo là mình sai.
   *
   * `resumedAt = null` nghĩa là ĐANG dừng. `confirmedMinutes` là số giờ người duyệt chốt tại
   * mốc dừng, dùng để ghi công vào KPI của tháng đó (xem hours-ledger.ts).
   */
  pauses: Array<{
    id: string;
    pausedAt: string;
    resumedAt: string | null;
    confirmedMinutes: number | null;
    reason: string | null;
  }>;
  /**
   * Giờ tăng ca ĐÃ DUYỆT của lượt này — chỉ `APPROVED`, đã lọc ở tầng truy vấn.
   *
   * ⚠️ KHÔNG BAO GIỜ CỘNG VÀO `actualMinutes`. Đây là hai loại giờ khác nhau: `actualMinutes` là
   * công trong giờ, do hệ thống đo và dùng chấm Đúng/Trễ hạn; giờ tăng ca là công NGOÀI giờ, do
   * người duyệt xác nhận và dùng tính lương. Gộp lại thì vừa sai phán quyết KPI vừa sai bảng
   * lương, và không còn cách nào tách ngược ra.
   */
  overtimeRequests: Array<{
    id: string;
    startAt: string;
    endAt: string;
    minutes: number;
    reason: string | null;
    designer3D: { id: string; name: string } | null;
    approvedBy: { name: string } | null;
  }>;
  // Một MO có thể có nhiều NV 3D cùng làm — panel cần biết lượt này của AI mới dựng được
  // khối trường cho từng người, và cần giờ thực tế RIÊNG của người đó.
  actualMinutes: number | null;
  designer3DId: string;
  designer3D: { id: string; name: string; code: string | null } | null;
  /** Nhóm KPI của LƯỢT (đã đóng dấu), không phải nhóm đang cấu hình. */
  kpiGroup: { id: string; name: string } | null;
};

// ─── Display helpers ─────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Chưa thiết kế",
  PENDING_DESIGN: "Làm INFO",
  IN_DESIGN: "Đang thiết kế",
  DESIGN_REVIEW: "Chờ khách duyệt",
  DESIGN_APPROVED: "Chốt 3D — Chuyển xưởng",
  DESIGN_COMPLETED: "Hoàn tất 3D",
  PENDING_PRODUCTION: "Đang chờ",
  IN_PRODUCTION: "Đang sản xuất",
  QUALITY_CHECK: "Tạm ngưng - Chờ duyệt",
  COMPLETED: "Hoàn tất",
  SUSPENDED: "Tạm ngưng",
  CANCELLED: "Đã hủy",
};

export const ZONE_LABEL: Record<OrderZone, string> = {
  PRE_PRODUCTION: "Phòng Thiết Kế",
  MASTER_HUB: "Phòng Sản Xuất",
};

export const TAB_LABEL: Record<OrderTab, string> = {
  all: "Tất cả",
  "pre-production": "Phòng Thiết Kế",
  "master-hub": "Phòng Sản Xuất",
  suspended: "Tạm ngưng",
  priority: "Ưu tiên",
  history: "Lịch sử",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

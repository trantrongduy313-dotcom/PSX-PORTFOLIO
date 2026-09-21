import * as z from "zod";

// Nguồn duy nhất của thang ưu tiên thiết kế 3D — không khai lại mảng ["UT1","UT2","Normal"] ở đây.
import { DESIGN_PRIORITY_CODES } from "@/app/lib/business/kpi-3d/design-priority";

// ─── Shared enum literals ───────────────────────────────────────────────────

const OrderStatusEnum = z.enum([
  "DRAFT",
  "PENDING_DESIGN",
  "IN_DESIGN",
  "DESIGN_REVIEW",
  "DESIGN_APPROVED",
  "DESIGN_COMPLETED",
  "PENDING_PRODUCTION",
  "IN_PRODUCTION",
  "QUALITY_CHECK",
  "COMPLETED",
  "SUSPENDED",
  "CANCELLED",
]);

const OrderZoneEnum = z.enum(["PRE_PRODUCTION", "MASTER_HUB"]);

const ProductCategoryEnum = z.enum([
  "NECKLACE",
  "RING",
  "EARRING",
  "BRACELET",
  "PENDANT",
  "BROOCH",
  "OTHER",
]);

const MaterialTypeEnum = z.enum([
  "GOLD_18K",
  "GOLD_24K",
  "SILVER_925",
  "PLATINUM",
  "DIAMOND",
  "GEMSTONE",
  "PEARL",
  "OTHER",
]);

// ─── GET /api/orders — query params ─────────────────────────────────────────

const boolParam = z
  .enum(["true", "false"])
  .optional()
  .transform((v): boolean | undefined => (v === undefined ? undefined : v === "true"));

export const SORT_FIELDS = [
  "orderDate",
  "requiredDate",
  "customerName",
  "orderNumber",
  "updatedAt",
  "estimatedTotal",
] as const;

export const ordersQuerySchema = z.object({
  // Filters
  zone: OrderZoneEnum.optional(),
  status: OrderStatusEnum.optional(),
  isSuspended: boolParam,
  isPriority: boolParam,
  isRush: boolParam,
  assignedToId: z.string().optional(),
  search: z.string().min(1).max(100).optional(),

  // Date range filter on orderDate (ISO string or YYYY-MM-DD)
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),

  // Date range filter on requiredDate (deadline) — for deadline presets
  requiredDateFrom: z.string().optional(),
  requiredDateTo: z.string().optional(),

  // History mode — show COMPLETED + CANCELLED only
  history: z.coerce.boolean().optional().default(false),

  // PSX active mode — show IN_PRODUCTION + SUSPENDED only (Phòng Sản Xuất working queue)
  psxActive: z.coerce.boolean().optional().default(false),

  // Sorting
  sortBy: z.enum(SORT_FIELDS).optional().default("orderDate"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),

  // Pagination
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),

  // Stage filter — "CODE:substatus" (e.g. "RESIN:qc") or status key (e.g. "SUSPENDED")
  stageFilter: z.string().max(50).optional(),

  // Snapshot mode — return ALL orders for the tab, skip pagination & user-level filters
  all: z.coerce.boolean().optional().default(false),

  // Batch fetch by IDs — used by silent patch to refresh specific orders in snapshot cache
  ids: z.string().max(2000).optional(),

  // Store filter — lọc đơn hàng theo cửa hàng cụ thể (ADMIN/PRODUCTION/ORDER roles)
  storeId: z.string().optional(),

  // Phân loại KH filter — "VIP" | "KH" | "SR" | "PK"
  phanLoaiKh: z.string().max(20).optional(),
});

export type OrdersQuery = z.infer<typeof ordersQuerySchema>;

// V2: CAP_DO_UU_TIEN — UT1 (+7d) / UT2 (+14d) / Normal (+21d) / SR (+30d)
export const PriorityCodeEnum = z.enum(["UT1", "UT2", "Normal", "SR"]);
export type PriorityCode = z.infer<typeof PriorityCodeEnum>;

// ─── POST /api/orders — create body ─────────────────────────────────────────

export const orderItemCreateSchema = z.object({
  productName: z.string().min(1).max(255),
  // V2 ref: MO# per item — auto-generated if omitted; may have suffix (VD: 26.10680 or 26.10680-2)
  moNumber: z.string().max(100).regex(/^\d{2}\..{3,}/, "MO# không đúng định dạng — VD: 26.10680").optional(),
  // Zone RIÊNG cho MO này khi thêm vào SO đã có (theo lựa chọn PSX/PTK lúc tạo trên UI) —
  // không có thì server dùng zone hiện tại của SO (hành vi cũ, tương thích ngược).
  zone: z.enum(["PRE_PRODUCTION", "MASTER_HUB"]).optional(),
  category: ProductCategoryEnum.optional().default("OTHER"),
  quantity: z.number().int().min(1).optional().default(1),
  material: MaterialTypeEnum.optional(),
  weightGram: z.number().positive("TL yêu cầu phải > 0").optional(),
  size: z.string().max(100).optional(),
  color: z.string().max(100).optional(),
  engraving: z.string().max(200).optional(),
  specifications: z.record(z.string(), z.unknown()).optional(),
  unitPrice: z.number().nonnegative().optional(),
  // V2: NVL — cột DB riêng (col 22 MASTER_HUB), không gộp vào specifications
  nvl: z.string().max(100).optional(),
  // Jewelry technical fields (V2 ThongTinChiTiet)
  techClassification: z.array(z.string().max(50)).optional(),
  mainStoneType: z.string().max(100).optional(),
  mainStoneSize: z.string().max(100).optional(),
  mainStoneQty: z.number().int().min(1).optional(),
  platingType: z.string().max(100).optional(),
  techNote: z.string().max(2000).optional(),
  // V2: ANH_FILE_3D col 17 — direct DB column (not in specifications JSON)
  designFileUrl: z.string().max(500).nullable().optional(),
  // Tài liệu tham khảo gửi kèm khi giao việc cho NV 3D (xem OrderItem trong schema.prisma).
  // Không dùng z.string().url(): Order dán link Drive/Youtube copy tay, một dấu cách thừa hay
  // thiếu "https://" sẽ chặn cả lệnh lưu vì một trường phụ — chuẩn hoá ở tầng hiển thị tốt hơn.
  sampleImageUrl: z.string().max(1000).nullable().optional(),
  sampleVideoUrl: z.string().max(1000).nullable().optional(),
  sampleFolderUrl: z.string().max(1000).nullable().optional(),
  // Per-MO scheduling & priority — cột riêng trên OrderItem, độc lập giữa các MO cùng SO.
  // Khi thêm MO vào SO đã có: nếu bỏ trống thì kế thừa giá trị hiện tại của SO (server tự điền).
  estimatedDate: z.string().datetime().optional(),
  requiredDate: z.string().datetime().optional(),
  saleNote: z.string().max(2000).optional(),
  priorityCode: PriorityCodeEnum.optional(),
  // Ghi đè riêng cho MO này (KHÔNG áp dụng cho Nguồn — Nguồn luôn dùng chung cả SO).
  // Không có cột DB riêng → lưu vào specifications.customerName/salesName (đúng key mà
  // sidebar đã dùng sẵn cho Sales per-MO); đọc "override ?? giá trị SO" khi hiển thị.
  customerNameOverride: z.string().max(255).optional(),
  salesNameOverride: z.string().max(100).optional(),
  donHang3SaoOverride: z.boolean().optional(),
  linkChatOverride: z.string().max(500).optional(),
});

export const createOrderSchema = z.object({
  // V2 ref: SO# từ Odoo — user bắt buộc nhập, không tự sinh
  // Format: YY.NNNNN+ — VD: 26.10680
  orderNumber: z.string().min(1).max(100).regex(/^\d{2}\.\d{4,}$/, "SO# không đúng định dạng — VD: 26.10680"),
  customerName: z.string().min(1).max(255),
  saleNote: z.string().max(2000).optional(),

  // V2: NGUON, PHAN_LOAI_KH, DON_HANG_3_SAO, LINK_CHAT — cột riêng thay vì gộp saleNote
  nguon:       z.string().max(100).optional(),
  phanLoaiKh:  z.string().max(100).optional(),
  donHang3Sao: z.boolean().optional().default(false),
  linkChat:    z.string().max(500).optional(),

  // isPriority / isRush are derived server-side from priorityCode; kept for read compatibility
  isPriority: z.boolean().optional().default(false),
  isRush: z.boolean().optional().default(false),
  priorityCode: PriorityCodeEnum.optional().default("Normal"),

  // If omitted, server auto-calculates from priorityCode + orderDate
  requiredDate: z.string().datetime().optional(),
  estimatedDate: z.string().datetime().optional(),
  estimatedTotal: z.number().nonnegative().optional(),
  depositAmount: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional().default("VND"),

  designBriefUrl: z.string().url().optional(),
  referenceUrls: z.array(z.string().url()).optional().default([]),

  // V2 parity: free-text sales name stored in order; FK set when auth is ready
  salesName: z.string().min(1).max(100).optional(),
  createdById: z.string().min(1).optional(),
  assignedToId: z.string().optional(),

  // V2 ref: loaiDon — "production" → MASTER_HUB trực tiếp; "pre_production" → PRE_PRODUCTION
  // 02_MasterHub.js: targetSheetName = isPreProd ? SHEETS.PRE_PRODUCTION : SHEETS.MASTER_HUB
  loaiDon: z.enum(["production", "pre_production"]).optional().default("pre_production"),

  // FK tới store — bắt buộc để đơn hiển thị đúng trang cửa hàng
  storeId: z.string().optional(),

  items: z.array(orderItemCreateSchema).min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ─── PATCH /api/orders/[id] — update body ────────────────────────────────────

export const updateOrderSchema = z.object({
  // Must echo the current version for optimistic concurrency
  version: z.number().int().min(1),

  // Editable fields (customerName, salesName are locked after creation — per-MO override qua specifications)
  donHang3Sao: z.boolean().optional(),
  linkChat:    z.string().max(500).optional(),
  // SO-wide: chỉ ADMIN/ORDER (PATCH route đã chặn role). Nguồn đổi → server đồng bộ storeId.
  phanLoaiKh:  z.string().max(20).optional(),
  nguon:       z.string().max(20).optional(),
  estimatedTotal: z.number().nonnegative().optional(),
  depositAmount: z.number().nonnegative().optional(),
  finalTotal: z.number().nonnegative().optional(),
  designBriefUrl: z.string().url().optional(),
  referenceUrls: z.array(z.string().url()).optional(),
  assignedToId: z.string().optional(),

  // Workflow
  status: OrderStatusEnum.optional(),

  // Metadata for audit (server resolves from session — client may omit)
  updatedById: z.string().min(1).optional(),
  comment: z.string().max(1000).optional(),

  // Set true to snapshot current state as a new OrderVersion before applying changes
  createVersion: z.boolean().optional().default(false),
  versionReason: z.string().max(500).optional(),

  // Per-MO independence: scope createVersion to a single item only
  activeItemId: z.string().optional(),
});

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

// ─── PATCH /api/orders/[id]/items/[itemId] ───────────────────────────────────

export const updateOrderItemSchema = z.object({
  // Optimistic concurrency — client sends the version it last read; rejected if stale
  version: z.number().int().min(1).optional(),
  // Per-item status override (null clears override, undefined = no change)
  itemStatus: OrderStatusEnum.nullable().optional(),
  // Lý do đổi trạng thái — hiện chỉ dùng cho HỦY MO.
  //
  // Dialog hủy ĐÃ bắt buộc người dùng nhập lý do từ trước, nhưng nhánh hủy per-MO không
  // truyền nó đi đâu cả: người dùng gõ vào một ô rồi lý do biến mất. Nhánh hủy cả SO thì
  // truyền qua resolve-action và lưu được. Trường này đóng lại chênh lệch đó.
  statusReason: z.string().max(1000).optional(),
  // MO# — cập nhật khi chuyển SR hoặc versioning
  moNumber: z.string().max(100).optional(),
  // V2: TEN_SP col 16
  productName: z.string().min(1).max(255).optional(),
  // V2: NVL col 22
  nvl: z.string().max(100).nullable().optional(),
  // V2: XI_MA col 25
  platingType: z.string().max(100).nullable().optional(),
  // V2: SIZE col 24
  size: z.string().max(100).nullable().optional(),
  // V2: TRONG_LUONG_YC col 14 (TL yêu cầu gram)
  weightGram: z.number().nonnegative().nullable().optional(),
  // V2: LOAI_HOT_CHU col 26 (loại đá chủ)
  mainStoneType: z.string().max(100).nullable().optional(),
  // V2: DA_CHU col 27 (text mô tả đá, VD: "5.4mm x 1v")
  mainStoneSize: z.string().max(200).nullable().optional(),
  // V2: ANH_FILE_3D col 17
  designFileUrl: z.string().max(500).nullable().optional(),
  sampleImageUrl: z.string().max(1000).nullable().optional(),
  sampleVideoUrl: z.string().max(1000).nullable().optional(),
  sampleFolderUrl: z.string().max(1000).nullable().optional(),
  // V2: GHI_CHU_SP col 29 → specifications.ghiChuSp
  // V2: CHI_TIET_DA_TAM col 28 → specifications.chiTietDaTam
  specifications: z.record(z.string(), z.unknown()).optional(),
  // Per-MO scheduling & priority fields
  estimatedDate: z.string().datetime().nullable().optional(),
  requiredDate: z.string().datetime().nullable().optional(),
  saleNote: z.string().max(2000).nullable().optional(),
  priorityCode: PriorityCodeEnum.optional(),
  // Ưu tiên của VIỆC THIẾT KẾ 3D — trục RIÊNG, KHÔNG phải bản sao của priorityCode ở trên.
  // Lý do tồn tại hai trường sát nhau mà không đồng bộ: xem chú thích đầu file
  // app/lib/business/kpi-3d/design-priority.ts. Enum ở đó CỐ Ý không có "SR".
  // Chỉ ADMIN/ORDER được ghi — chốt chặn ở route, không ở đây (zod không biết người gọi là ai).
  design3DPriorityCode: z.enum(DESIGN_PRIORITY_CODES).optional(),
  // V2: PHAN_LOAI_KT — raw CSV tokens array (direct OrderItem column)
  techClassification: z.array(z.string().max(50)).nullable().optional(),
  // V2: DIEN_GIAI_SP — stored in OrderItem.techNote
  techNote: z.string().max(2000).nullable().optional(),
  // Mã số mẫu — R&D nhập khi MO đã sang PSX. KHÔNG @unique và không kiểm định dạng: R&D đang
  // đánh mã theo quy ước riêng của họ, chưa chốt; ép khuôn bây giờ là đoán hộ.
  masoMau: z.string().max(100).nullable().optional(),
  // Admin Override — lớp an toàn thứ 2: cho phép ADMIN ghi lại field trên MO đã
  // Hoàn tất/Hủy (route production đã check role + lý do; ở đây chỉ bypass khoá terminal).
  adminOverride: z.boolean().optional(),
});

export type UpdateOrderItemInput = z.infer<typeof updateOrderItemSchema>;

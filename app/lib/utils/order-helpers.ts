import type { OrderDetail, OrderItem, OrderStatus, ProductionDetail } from "@/app/lib/types/order";
import { readBomState, type BomDates } from "@/app/lib/business/bom";
import { toVnYmd } from "@/app/lib/utils/vn-date";

// Ngày → "YYYY-MM-DD" theo múi giờ VN. Định nghĩa gốc đã gom về app/lib/utils/vn-date.ts
// (nguồn duy nhất, dùng chung được cả server lẫn client) — giữ alias nội bộ để không phải
// đổi hàng chục chỗ gọi trong file này.
const toLocalYMD = toVnYmd;

// ─── 11 công đoạn sản xuất (Phase 1.5) ────────────────────────────────────────
// TC_NGUOI, KHOA, DUYET_NK không có cột DB — lưu trong extraData.perItem[id].stages
// TC_DAY map vào cột handcraft* (backward compat — dữ liệu cũ của TC hiển thị dưới TC_DAY)
export const STAGE_DEFS: Array<{
  code: string;
  label: string;
  crafterField?: keyof ProductionDetail;
  startField?: keyof ProductionDetail;
  doneField?: keyof ProductionDetail;
}> = [
  { code: "RESIN",      label: "Resin",                 crafterField: "resinCrafter",     startField: "resinStartAt",     doneField: "resinDoneAt"     },
  { code: "CHO_DX_NL", label: "Chờ ĐX NL" },
  { code: "CHO_NL",    label: "Chờ NL" },
  { code: "DUC",        label: "Đúc kim loại",          crafterField: "castingCrafter",   startField: "castingStartAt",   doneField: "castingDoneAt"   },
  { code: "NGUOI",    label: "Nguội",                  crafterField: "coldworkCrafter",  startField: "coldworkStartAt",  doneField: "coldworkDoneAt"  },
  { code: "TC_DAY",   label: "Thủ công dây",           crafterField: "handcraftCrafter", startField: "handcraftStartAt", doneField: "handcraftDoneAt" },
  { code: "TC_NGUOI", label: "Thủ công nguội" },
  { code: "KHOA",     label: "Khóa" },
  { code: "HOT",      label: "Gắn đá (Hột)",          crafterField: "settingCrafter",   startField: "settingStartAt",   doneField: "settingDoneAt"   },
  { code: "MOC",      label: "Móc máy",                crafterField: "machineCrafter",   startField: "machineStartAt",   doneField: "machineDoneAt"   },
  { code: "DBXM",     label: "ĐBXM (Mạ)",              crafterField: "platingCrafter",   startField: "platingStartAt",   doneField: "platingDoneAt"   },
  { code: "QC",       label: "QC - Chờ nhập kho",     crafterField: "qcCrafter",        startField: "qcStartAt",        doneField: "qcDoneAt"        },
  { code: "DUYET_NK", label: "Chờ duyệt nhập kho" },
];

// Sub-status labels theo từng công đoạn (Phase 1.6)
// Falls back to STAGE_STATUS_LABEL for any unlisted key
export const STAGE_SUBSTATUS_LABEL: Record<string, Record<string, string>> = {
  RESIN:      { pending: "Chờ in",            doing: "IN",               qc: "QC Resin",    done: "Xong", cancelled: "Bỏ qua" },
  CHO_DX_NL:  { pending: "Đang chờ ĐX NL",                                                            done: "Xong", cancelled: "Bỏ qua" },
  CHO_NL:     { pending: "Đang chờ NL",                                                                done: "Xong", cancelled: "Bỏ qua" },
  DUC:        { pending: "Chờ đúc",        doing: "Đang đúc",         qc: "QC đúc",      done: "Xong", cancelled: "Bỏ qua" },
  NGUOI:    { pending: "Chờ nguội",      doing: "Đang nguội",                           done: "Xong", cancelled: "Bỏ qua" },
  TC_DAY:   { pending: "Chờ làm",        doing: "Đang làm",                             done: "Xong", cancelled: "Bỏ qua" },
  TC_NGUOI: { pending: "Chờ làm",        doing: "Đang làm",                             done: "Xong", cancelled: "Bỏ qua" },
  KHOA:     { pending: "Chờ làm khóa",   doing: "Đang làm khóa",                        done: "Xong", cancelled: "Bỏ qua" },
  HOT:      { pending: "Chờ gắn",        doing: "Đang gắn",                             done: "Xong", cancelled: "Bỏ qua" },
  MOC:      { pending: "Chờ móc máy",    doing: "Đang móc máy",                         done: "Xong", cancelled: "Bỏ qua" },
  DBXM:     { pending: "Chờ mạ",         doing: "Đang mạ",                              done: "Xong", cancelled: "Bỏ qua" },
  QC:       { pending: "Chờ QC",         doing: "Đang QC",                              done: "Xong", cancelled: "Bỏ qua" },
  DUYET_NK: { pending: "Chờ duyệt",      doing: "Đang duyệt",                           done: "Đã duyệt", cancelled: "Bỏ qua" },
};

export function getStageStatusLabel(stageCode: string, status: string): string {
  return STAGE_SUBSTATUS_LABEL[stageCode]?.[status] ?? STAGE_STATUS_LABEL[status] ?? status;
}

// ─── Form types ────────────────────────────────────────────────────────────────

export type PanelForm = {
  status: OrderStatus;
  linkChat: string;
  donHang3Sao: boolean;
  // SO-wide, chỉ ADMIN/ORDER sửa được (API PATCH đã chặn role khác).
  // Nguồn đổi sẽ đồng bộ storeId ở server — ảnh hưởng quyền truy cập của SALES.
  phanLoaiKh: string;
  nguon: string;
};

export type ItemForm = {
  productName: string;
  nvl: string;
  platingType: string;
  size: string;
  weightGram: string;
  mainStoneType: string;
  mainStoneSize: string;
  chiTietDaTam: string;
  ghiChuSp: string;
  designFileUrl: string;
  designImageUrl: string | null;
  /** Tài liệu tham khảo cho NV 3D — xem OrderItem trong schema.prisma. */
  sampleImageUrl: string;
  /**
   * Ảnh mẫu đã upload (≤2). Ở TRONG FORM chỉ để HIỂN THỊ — route sample-images mới là nơi ghi,
   * và cột này CỐ Ý nằm ngoài danh sách trắng của PATCH item (có test canh). Cùng khuôn với
   * `designImageUrl` ngay trên.
   */
  sampleImageUploads: string[];
  /** "Folder mẫu" — thay cho `sampleVideoUrl` cũ. Xem schema.prisma. */
  sampleFolderUrl: string;
  estimatedDate: string;
  requiredDate: string;
  saleNote: string;
  priorityCode: string;
  /**
   * Ưu tiên của VIỆC THIẾT KẾ 3D — trục riêng, KHÔNG phải bản sao của `priorityCode` ở trên.
   * Đứng cạnh nhau trong cùng một form nên rất dễ bị đọc thành "hai chỗ lưu một thứ";
   * lý do chúng độc lập nằm ở đầu file app/lib/business/kpi-3d/design-priority.ts.
   */
  design3DPriorityCode: string;
  // V2: PHAN_LOAI_KT — raw CSV tokens array
  techClassification: string[];
  // V2: LOAI_HANG — stored in specifications.loaiHang
  loaiHang: string;
  // V2: HINH_DANG_HOT — stored in specifications.hinhDangHot
  hinhDangHot: string;
  // V2: DIEN_GIAI_SP — stored in OrderItem.techNote (direct column)
  techNote: string;
  /**
   * "Mã số mẫu" — R&D nhập khi MO đã sang PSX. Ở TRONG FORM như mọi ô khác: nó đi theo nút Lưu
   * chung, chịu chung cơ chế "chưa lưu", và KHÔNG có đường ghi riêng.
   *
   * ⚠️ Bản đầu cho ô này tự lưu khi rời ô. Người dùng bác: một ô ghi ngay cả khi họ không bấm
   * Lưu là một luật riêng phải học thuộc, và nó ghi cả những giá trị họ chỉ gõ thử.
   */
  masoMau: string;
  // Ghi đè riêng theo MO (specifications.customerName/salesName ?? giá trị chung SO).
  // Giá trị đã resolve sẵn (override ?? SO) — so lại với SO lúc lưu để quyết định
  // set override hay xoá override (không sửa gì thì tiếp tục ăn theo SO).
  customerName: string;
  salesName: string;
  // Loại SP — user chọn tay (RI/PD/ER/BL/BG/NL/CH/CH-TAY/BL-TAY/BG-TAY/ACC/O), lưu
  // specifications.loaiSp. Không còn suy đoán từ tên sản phẩm.
  loaiSp: string;
  // Theo dõi BOM per-MO (PTK) — specifications.bom (business/bom.ts). "" = chưa phân loại.
  // Mỗi trạng thái có ô ngày RIÊNG (không bắt buộc) — chuyển trạng thái không xoá ngày cũ.
  bomStatus: string;
  bomDates: BomDates;
  // Diễn giải BOM — field RIÊNG (không dùng chung Diễn giải SP/techNote), gắn với trạng
  // thái Chờ thông tin BOM nhưng giữ nguyên khi đổi sang trạng thái khác (không mất dữ liệu).
  bomDienGiai: string;
};

// V2 ref: DATA_JSON fields cho MASTER_HUB
export type ProductionForm = {
  moStatus: string;
  tl3d: string;
  tlXuong: string;
  qd24k: string;       // readonly, auto-calc
  qdPt: string;        // readonly, auto-calc
  qdBac: string;       // readonly, auto-calc — quy đổi bạc ròng (999), TÁCH RIÊNG qd24k/qdPt
  tlThucTeHt: string;
  completedDate: string;
  danhGiaTl: string;   // readonly, auto-calc
  pctChenLech: string; // readonly, auto-calc
  thongTinHt: string;
  canhBaoDacBiet: string; // = order.saleNote trong MASTER_HUB
  internalNote: string;
  tho3d: string;
  sku: string;
  chiTietKt: string;
};

// Một LẦN thực hiện của một thợ trong một khâu. Cho phép:
//   • Nhiều thợ cùng 1 khâu (mỗi người làm 1 "phần" — tự ghi)        → case 1, 2
//   • Làm lại nhiều lần (mỗi lần 1 bản ghi, giữ cả lần "không đạt")  → case 3
// KPI/giờ do quản lý tự nhập cho từng bản ghi (không tự chia tỉ lệ).
// additive: `crafter`/`coldworkQuality`... ở StageEntry vẫn giữ làm "tóm tắt" để
// reader cũ (đánh giá khâu, KPI, hiển thị) không vỡ trong giai đoạn 1.
export type StageRecord = {
  crafter: string;            // thợ
  phan?: string | null;       // phần/chi tiết (tự ghi) — phân biệt nhiều thợ song song
  lan?: number | null;        // lần thực hiện (1, 2, …) — cho trường hợp làm lại
  ketQua?: string | null;     // Chất lượng SP: "Đạt" | "Không đạt" (Nguội)
  thoiGianOk?: string | null; // Thời gian SX: "Đạt" | "Không đạt" (Nguội)
  lyDo?: string | null;       // lý do (vd: lý do không đạt) (Nguội)
  gioKpi?: string | null;     // giờ KPI chuẩn/định mức — nhập tay (Nguội)
  gioThucTe?: string | null;  // SỐ GIỜ THỰC TẾ thợ đã làm — nhập tay "Hg Mp" (Nguội & Hột)
  bachSP?: string | null;     // bậc thợ áp cho lần này (Nguội)
  stoneType?: string | null;       // Loại hột của riêng thợ này — CSV "XOÀN,XOÀN LAB" (Hột per-record)
  stoneQty?: number | null;        // SL hột phần thợ đó gắn — tổng, user tự nhập tay (Hột)
  stoneQtyByType?: Record<string, number> | null; // SL hột theo từng loại { "XOÀN": 12, "ĐÁ MÀU": 5 } (Hột)
  // RESIN per-record — mỗi lần resin có bộ số liệu RIÊNG (lần 1 khác lần 2)
  resinDetailQty?: number | null;  // SL chi tiết (Resin)
  resinWeightRaw?: number | null;  // TL Resin chưa cắt ty (gram)
  resinWeightTy?: number | null;   // TL ty (gram) — Còn lại = raw − ty (tự tính)
  resinWeightOk?: string | null;   // KQ trọng lượng: "Đạt" | "Không đạt" (Resin)
  ghiChu?: string | null;     // ghi chú
  startAt?: string | null;    // Bắt đầu (ngày/giờ, tùy chọn)
  doneAt?: string | null;     // Hoàn thành (ngày/giờ, tùy chọn)
  reviewedAt?: string | null; // Thời điểm quản lý đánh giá bản ghi này (Đánh giá Khâu)
};

export type StageEntry = {
  code: string;
  crafter: string;
  // Danh sách bản ghi thực hiện (nhiều thợ / nhiều lần). Trống/không có ⇒ dữ liệu cũ
  // (chỉ có `crafter` đơn). Khi có records, các trường scalar bên dưới = tóm tắt suy ra.
  records?: StageRecord[];
  stageStatus: "pending" | "doing" | "qc" | "done" | "cancelled" | "hold";
  holdReason?: "CHO_DX_NL" | "CHO_NL";
  startAt?: string | null;
  doneAt?: string | null;
  durationNote?: string | null;
  // NGUOI
  coldworkQuality?: string | null;
  coldworkTimeOk?: string | null;
  coldworkReason?: string | null;
  bachSP?: string | null;
  gioKpi?: string | null;
  ghiChuNguoi?: string | null;
  // TC_DAY
  workGroup?: string | null;
  // DUC — ghi chú chung cho cả khâu Đúc (stage-level, không per-record)
  ghiChuDuc?: string | null;
  // HOT
  settingNote?: string | null;
  stoneType?: string | null;
  stoneQty?: number | null;
  // RESIN
  resinWeightOk?: string | null;
  resinQualityOk?: string | null;
  resinReason?: string | null;          // (legacy) lý do đơn — vẫn đọc để tương thích ngược
  resinDetailQty?: number | null;       // Số lượng chi tiết resin
  resinWeightRaw?: number | null;       // TL Resin chưa cắt ty (gram)
  resinWeightTy?: number | null;        // TL ty (gram) — "Còn lại" = raw − ty (tự tính, không lưu)
  resinFails?: ResinFail[];             // Nhật ký các lần không đạt — giữ lịch sử, không ghi đè
};

// Một lần Resin không đạt — mỗi lần 1 bản ghi độc lập để tracking đầy đủ.
export type ResinFail = {
  lan: number;                // lần thứ mấy (1, 2, …)
  ngay?: string | null;       // ngày ghi nhận không đạt (YYYY-MM-DD hoặc ISO)
  lyDo?: string | null;       // lý do không đạt
};

// Gộp SL hột theo từng loại từ records của khâu HỘT — dùng cho hiển thị tóm tắt read-only.
// Ưu tiên stoneQtyByType (SL đã tách theo loại); nếu record chưa có → suy từ stoneType + stoneQty
// (đa số dữ liệu: mỗi record 1 loại). Record gộp nhiều loại không tách được → giữ nhãn gộp.
// Tổng = tổng stoneQty các record (khớp với summary đã lưu).
export function computeHotStoneBreakdown(
  records: StageRecord[] | undefined | null
): { byType: { type: string; qty: number }[]; total: number } {
  const map = new Map<string, number>();
  let total = 0;
  for (const r of records ?? []) {
    total += r.stoneQty ?? 0;
    const qbt = r.stoneQtyByType;
    if (qbt && Object.keys(qbt).length) {
      for (const [t, q] of Object.entries(qbt)) map.set(t, (map.get(t) ?? 0) + (q ?? 0));
      continue;
    }
    const types = (r.stoneType ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (types.length === 1) {
      map.set(types[0], (map.get(types[0]) ?? 0) + (r.stoneQty ?? 0));
    } else if (types.length > 1) {
      const label = types.join(", ");
      map.set(label, (map.get(label) ?? 0) + (r.stoneQty ?? 0));
    }
  }
  return { byType: [...map.entries()].map(([type, qty]) => ({ type, qty })), total };
}

// ─── Tuần dự kiến (ISO week number) ───────────────────────────────────────────
// Strip version suffix from orderNumber to get the base SO# for display.
// "26.432432.1" → "26.432432"; "26.432432" → "26.432432" (unchanged)
// Only strips when there are ≥3 parts AND the last part is a pure integer
// (avoids stripping Odoo 2-part numbers like "26.12312312").
export function getBaseSoNumber(orderNumber: string): string {
  const parts = orderNumber.split(".");
  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) {
      return parts.slice(0, -1).join(".");
    }
  }
  return orderNumber;
}

export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// V2 ref: calcAutoFields() — tính QĐ 24K, QĐ PT, QĐ Bạc, % Chênh lệch, Đánh giá TL
export function calcAutoProduction(nvl: string, tl3d: number, tlThucTeHt: number, tlXuong: number) {
  const G = 0.9999; // độ tinh khiết chuẩn VÀNG (vàng ròng "4 số 9") — CHỈ dùng cho QĐ 24K

  // NVL có thể là TỔ HỢP nhiều loại ("24K/18KY", "PT900/18KW", "18KW/18KY"…). Với mỗi họ kim
  // loại, lấy giá trị LỚN NHẤT trong các token thay vì "match đầu tiên" như trước.
  // Lý do: NVL giờ do user tick checkbox nên THỨ TỰ trong chuỗi không còn cố định — rule
  // "match đầu tiên" sẽ cho kết quả khác nhau giữa "24K/18KY" (k=24) và "18KY/24K" (k=18).
  // Rule MAX làm kết quả ĐỘC LẬP với thứ tự. Đã kiểm chứng trên 42 giá trị NVL hiện có
  // (option 2 file + toàn bộ giá trị thật trong DB): 0 giá trị lệch so với rule cũ, vì các
  // tổ hợp cũ đều được viết "kim loại cao nhất trước".
  const karats = [...nvl.matchAll(/(\d+)K/gi)].map((m) => parseInt(m[1], 10));
  const karat = karats.length ? Math.max(...karats) : 0;
  const ptRates = [...nvl.matchAll(/PT(\d+)/gi)].map((m) => parseInt(m[1], 10) / 1000);
  const ptRate = ptRates.length ? Math.max(...ptRates) : 0;
  // Bạc: "BAC925" → độ tinh khiết 0.925; "BAC" trơn (không ghi số) → quy ước bạc 999 (bạc ròng).
  const silverPurities = [...nvl.matchAll(/BAC(\d+)?/gi)].map((m) => (m[1] ? parseInt(m[1], 10) / 1000 : 0.999));
  const silverPurity = silverPurities.length ? Math.max(...silverPurities) : 0;

  const qd24k = karat > 0 && tl3d > 0 ? (tl3d * karat / 24 / G).toFixed(3) : "";
  const qdPt  = ptRate > 0 && tl3d > 0 ? (tl3d * ptRate).toFixed(3) : "";
  // QĐ Bạc = TL3D thực tế × độ tinh khiết — KHÔNG chia thêm cho mốc chuẩn (khác vàng ở trên).
  // Xác nhận theo đúng công thức nghiệp vụ thực tế: "Bạc 925 → Quy đổi = TL thực tế × 0.925".
  const qdBac = silverPurity > 0 && tl3d > 0 ? (tl3d * silverPurity).toFixed(3) : "";

  let pctChenLech = "";
  let danhGiaTl = "";
  if (tlXuong > 0 && tlThucTeHt > 0) {
    const pct = ((tlThucTeHt - tlXuong) / tlXuong) * 100;
    pctChenLech = pct.toFixed(2);
    // V2 ref: |%| ≤ 5 → "Đạt"
    danhGiaTl = Math.abs(pct) <= 5 ? "Đạt" : "Không đạt";
  }

  return { qd24k, qdPt, qdBac, pctChenLech, danhGiaTl };
}

// ─── Init helpers ─────────────────────────────────────────────────────────────

export function toFormState(order: OrderDetail): PanelForm {
  return {
    status:      order.status,
    linkChat:    order.linkChat ?? "",
    donHang3Sao: order.donHang3Sao ?? false,
    phanLoaiKh:  order.phanLoaiKh ?? "",
    nguon:       order.nguon ?? "",
  };
}

// Fix B: trả về chuỗi khi có nội dung thật (khác rỗng/khoảng trắng), ngược lại undefined —
// để `?? SO` fallback đúng cả khi override bị lưu là "" (nullish `??` không bắt chuỗi rỗng).
export function nonEmpty(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

export function toItemForm(item: OrderItem, order?: { customerName: string; salesName: string | null }): ItemForm {
  const specs = (item.specifications ?? {}) as Record<string, unknown>;
  return {
    // Ghi đè riêng theo MO — hiển thị override nếu có, không thì ăn theo SO.
    // Fix B: coi override RỖNG/khoảng-trắng như "không override" (dùng nonEmpty thay ??), tránh
    // trường hợp override "" che mất giá trị SO → hiện trắng (?? chỉ fallback null/undefined).
    customerName: nonEmpty(specs.customerName) ?? (order?.customerName ?? ""),
    salesName:    nonEmpty(specs.salesName) ?? (order?.salesName ?? ""),
    productName:   item.productName ?? "",
    nvl:           item.nvl ?? "",
    platingType:   item.platingType ?? "",
    size:          item.size ?? "",
    weightGram:    item.weightGram != null ? String(item.weightGram) : "",
    mainStoneType: item.mainStoneType ?? "",
    mainStoneSize: item.mainStoneSize ?? "",
    // Backward compat: old orders stored chiTietDaTam as specs.datam (wrong key)
    chiTietDaTam:  ((specs.chiTietDaTam ?? specs.datam) as string) ?? "",
    ghiChuSp:      (specs.ghiChuSp as string) ?? "",
    // Backward compat: old orders stored designFileUrl inside specs.file3d (wrong field)
    designFileUrl: item.designFileUrl ?? ((specs.file3d as string) || ""),
    designImageUrl: item.designImageUrl ?? null,
    sampleImageUrl: item.sampleImageUrl ?? "",
    sampleImageUploads: item.sampleImageUploads ?? [],
    // Đọc cột mới, LÙI VỀ cột cũ cho những dòng chưa được chép sang. Bản chép đã chạy trên
    // production (39/39), nhưng dòng tạo sau đó vẫn có thể chỉ có cột cũ nếu code cũ còn chạy
    // ở đâu đó — rẻ hơn nhiều so với một ô trống không ai giải thích được.
    sampleFolderUrl: item.sampleFolderUrl ?? item.sampleVideoUrl ?? "",
    techClassification: item.techClassification ?? [],
    loaiHang:           (specs.loaiHang as string) ?? "",
    hinhDangHot:        (specs.hinhDangHot as string) ?? "",
    loaiSp:             (specs.loaiSp as string) ?? "",
    techNote:           item.techNote ?? "",
    masoMau:            item.masoMau ?? "",
    // Use local date (not UTC) to avoid timezone off-by-one: "2026-05-09T00:00:00Z" → "2026-05-09" local
    estimatedDate: item.estimatedDate ? toLocalYMD(new Date(item.estimatedDate)) : "",
    requiredDate:  item.requiredDate  ? toLocalYMD(new Date(item.requiredDate)) : "",
    saleNote:      item.saleNote      ?? "",
    priorityCode:  item.priorityCode  || "Normal",
    // MO tạo trước khi có cột này → null/rỗng, về "Normal". Không kế thừa từ priorityCode: kế
    // thừa một chiều nghĩa là mỗi lần mở form lại ghi đè lựa chọn quản lý đã đặt tay.
    design3DPriorityCode: item.design3DPriorityCode || "Normal",
    // Theo dõi BOM per-MO — readBomState hiểu cả định dạng mới (specs.bom) lẫn phẳng cũ.
    ...(() => { const b = readBomState(specs); return { bomStatus: b.status ?? "", bomDates: b.dates, bomDienGiai: b.dienGiai }; })(),
  };
}

export function toProductionForm(order: OrderDetail, activeItemId?: string | null): ProductionForm {
  const extra = (order.productionDetail?.extraData ?? {}) as Record<string, unknown>;
  // Per-MO isolation: read item-specific data from perItem[activeItemId] when available
  const perItem = (extra.perItem as Record<string, Record<string, unknown>> | undefined) ?? {};
  const itemData = activeItemId ? (perItem[activeItemId] ?? {}) : {};
  const get = (key: string): unknown => (itemData[key] !== undefined ? itemData[key] : extra[key]);

  // Compute QĐ 24K / QĐ PT / QĐ Bạc on load if not stored (imported data only has tl3d)
  const tl3dVal      = String(get("tl3d")    ?? "");
  const tlXuongVal   = String(get("tlXuong") ?? "");
  const tlHtVal      = String(get("tlThucTeHt") ?? "");
  const storedQd24k  = String(get("qd24k")   ?? "");
  const storedQdPt   = String(get("qdPt")    ?? "");
  const storedQdBac  = String(get("qdBac")   ?? "");
  const nvl = activeItemId
    ? ((order.items as any[]).find((i: any) => i.id === activeItemId)?.nvl ?? (order.items as any[])[0]?.nvl ?? "")
    : ((order.items as any[])[0]?.nvl ?? "");
  const initAuto = (!storedQd24k && !storedQdPt && !storedQdBac && tl3dVal)
    ? calcAutoProduction(nvl, parseFloat(tl3dVal) || 0, parseFloat(tlHtVal) || 0, parseFloat(tlXuongVal) || 0)
    : { qd24k: storedQd24k, qdPt: storedQdPt, qdBac: storedQdBac };

  return {
    moStatus:        order.status,
    tl3d:            tl3dVal,
    tlXuong:         tlXuongVal,
    qd24k:           initAuto.qd24k,
    qdPt:            initAuto.qdPt,
    qdBac:           initAuto.qdBac,
    tlThucTeHt:      tlHtVal,
    // Ngày HT PER-MO: đọc từ extraData.perItem[id].completedDate (giá trị user nhập cho MO này),
    // fallback về OrderItem.completedAt (ngày hoàn tất thật per-MO — khôi phục đúng ngày riêng).
    // KHÔNG dùng order.completedDate (cấp SO, dùng chung → gây hiện cùng ngày cho mọi MO).
    completedDate:   (() => {
      const cd = get("completedDate");
      if (cd) return toLocalYMD(new Date(cd as string));
      const ai = activeItemId ? (order.items as any[]).find((i: any) => i.id === activeItemId) : null;
      if (ai?.completedAt) return toLocalYMD(new Date(ai.completedAt));
      return "";
    })(),
    danhGiaTl:       String(get("danhGiaTl") ?? ""),
    pctChenLech:     String(get("pctChenLech") ?? ""),
    thongTinHt:      String(get("thongTinHt") ?? ""),
    canhBaoDacBiet: (() => {
      if (activeItemId) {
        const item = (order.items as any[]).find((i: any) => i.id === activeItemId);
        if (item?.saleNote != null) return item.saleNote;
      }
      // Fallback to first item, then order level
      const firstItem = (order.items as any[])[0];
      return firstItem?.saleNote ?? order.saleNote ?? "";
    })(),
    internalNote:    order.productionDetail?.internalNote ?? "",
    tho3d:           String(get("tho3d") ?? ""),
    sku:             String(get("sku") ?? ""),
    chiTietKt:       String(get("chiTietKt") ?? ""),
  };
}

export function toStageForms(pd: ProductionDetail | null, itemId?: string | null): StageEntry[] {
  if (!pd) {
    return STAGE_DEFS.map((s) => ({ code: s.code, crafter: "", stageStatus: "pending" as const }));
  }

  const extra = (pd.extraData as Record<string, unknown>) ?? {};

  // Per-MO: đọc stages từ perItem[itemId].stages nếu có (ưu tiên hơn shared columns)
  if (itemId) {
    const perItem = (extra.perItem as Record<string, unknown>) ?? {};
    const itemData = (perItem[itemId] as Record<string, unknown>) ?? {};
    const itemStages = (itemData.stages as Record<string, unknown>) ?? {};
    if (Object.keys(itemStages).length > 0) {
      return STAGE_DEFS.map((s) => {
        const st = (itemStages[s.code] as Record<string, unknown>) ?? {};
        return {
          code: s.code,
          crafter: (st.crafter as string) ?? "",
          stageStatus: (st.stageStatus as StageEntry["stageStatus"]) ?? "pending",
          startAt: (st.startAt as string | null) ?? null,
          doneAt: (st.doneAt as string | null) ?? null,
          durationNote: (st.durationNote as string | null) ?? null,
          ...(st.holdReason ? { holdReason: st.holdReason as "CHO_DX_NL" | "CHO_NL" } : {}),
          ...((s.code === "NGUOI" || s.code === "KHOA") ? {
            coldworkQuality: (st.coldworkQuality as string | null) ?? null,
            coldworkTimeOk:  (st.coldworkTimeOk  as string | null) ?? null,
            coldworkReason:  (st.coldworkReason  as string | null) ?? null,
            bachSP:          (st.bachSP          as string | null) ?? null,
            gioKpi:          (st.gioKpi          as string | null) ?? null,
            ...(s.code === "NGUOI" ? { ghiChuNguoi: (st.ghiChuNguoi as string | null) ?? null } : {}),
          } : {}),
          ...(s.code === "TC_DAY" ? {
            workGroup: (st.workGroup as string | null) ?? null,
          } : {}),
          ...(s.code === "DUC" ? {
            ghiChuDuc: (st.ghiChuDuc as string | null) ?? null,
          } : {}),
          ...(s.code === "HOT" ? {
            settingNote: (st.settingNote as string | null) ?? null,
            stoneType:   (st.stoneType   as string | null) ?? null,
            stoneQty:    (st.stoneQty    as number | null) ?? null,
          } : {}),
          ...(s.code === "RESIN" ? {
            resinWeightOk: (st.resinWeightOk as string | null) ?? null,
            resinQualityOk: (st.resinQualityOk as string | null) ?? null,
            resinReason:   (st.resinReason   as string | null) ?? null,
            resinDetailQty: (st.resinDetailQty as number | null) ?? null,
            resinWeightRaw: (st.resinWeightRaw as number | null) ?? null,
            resinWeightTy:  (st.resinWeightTy  as number | null) ?? null,
            // Nhật ký không đạt: có resinFails → dùng; chưa có nhưng có resinReason cũ →
            // gói thành lần 1 để tương thích ngược (không mất dữ liệu).
            resinFails: Array.isArray(st.resinFails)
              ? (st.resinFails as ResinFail[])
              : ((st.resinReason as string | null)
                  ? [{ lan: 1, ngay: (st.doneAt as string | null) ?? null, lyDo: st.resinReason as string }]
                  : []),
          } : {}),
          // Nhiều thợ / nhiều lần (Nguội, Hột, Đúc, TC Nguội). Có records → dùng; chưa có nhưng
          // có crafter cũ → gói thành 1 bản ghi để hiển thị tương thích ngược (không mất dữ liệu).
          ...((s.code === "NGUOI" || s.code === "HOT" || s.code === "DUC" || s.code === "TC_NGUOI") ? {
            records: Array.isArray(st.records)
              ? (st.records as StageRecord[])
              : ((st.crafter as string)
                  ? [{
                      crafter: (st.crafter as string),
                      phan: null,
                      lan: 1,
                      // Nguội: chất lượng/thời gian/bậc/lý do; Hột: SL hột. Trường không
                      // liên quan để null. Ghi chú gộp từ ghiChuNguoi (Nguội) hoặc settingNote (Hột).
                      ketQua:     (st.coldworkQuality as string | null) ?? null,
                      thoiGianOk: (st.coldworkTimeOk  as string | null) ?? null,
                      lyDo:       (st.coldworkReason   as string | null) ?? null,
                      gioKpi:     (st.gioKpi           as string | null) ?? null,
                      gioThucTe:  (st.durationNote     as string | null) ?? null,
                      bachSP:     (st.bachSP           as string | null) ?? null,
                      stoneQty:   (st.stoneQty         as number | null) ?? null,
                      ghiChu:     ((st.ghiChuNguoi as string | null) ?? (st.settingNote as string | null)) ?? null,
                      startAt: (st.startAt as string | null) ?? null,
                      doneAt:  (st.doneAt  as string | null) ?? null,
                    }]
                  : []),
          } : {}),
          // RESIN multi-record: mỗi lần đủ trường. Dữ liệu cũ (resinFails + field cấp-khâu)
          // → bọc thành records để không mất (mỗi fail 1 record; lần Đạt/trạng thái cuối 1 record).
          ...(s.code === "RESIN" ? {
            records: (Array.isArray(st.records) && (st.records as unknown[]).length)
              ? (st.records as StageRecord[])
              : (() => {
                  const out: StageRecord[] = [];
                  const fails = Array.isArray(st.resinFails) ? (st.resinFails as { lan?: number; ngay?: string | null; lyDo?: string | null }[]) : [];
                  for (const f of fails) out.push({ crafter: (st.crafter as string) ?? "", lan: f.lan ?? out.length + 1, ketQua: "Không đạt", lyDo: f.lyDo ?? null, doneAt: f.ngay ?? null });
                  const q = (st.resinQualityOk as string | null) ?? null;
                  const hasStageData = st.resinWeightRaw != null || st.resinDetailQty != null || st.resinWeightTy != null;
                  if (q === "Đạt" || (out.length === 0 && (q || hasStageData))) {
                    out.push({
                      crafter: (st.crafter as string) ?? "",
                      lan: out.length + 1,
                      ketQua: q,
                      doneAt: (st.doneAt as string | null) ?? null,
                      resinDetailQty: (st.resinDetailQty as number | null) ?? null,
                      resinWeightRaw: (st.resinWeightRaw as number | null) ?? null,
                      resinWeightTy:  (st.resinWeightTy  as number | null) ?? null,
                      resinWeightOk:  (st.resinWeightOk  as string | null) ?? null,
                    } as StageRecord);
                  }
                  return out;
                })(),
          } : {}),
        };
      });
    }
  }

  // Fallback: shared columns (backward compat — dữ liệu cũ chưa có perItem.stages)
  // Stages without crafterField/startField/doneField (TC_NGUOI, KHOA) default to "pending"
  const p = pd as Record<string, unknown>;
  const stageStatuses = (extra.stageStatuses as Record<string, string>) ?? {};

  return STAGE_DEFS.map((s) => {
    const doneAt  = s.doneField  ? p[s.doneField]  : undefined;
    const startAt = s.startField ? p[s.startField] : undefined;
    const crafter = s.crafterField ? ((p[s.crafterField] as string | null) ?? "") : "";
    let stageStatus: StageEntry["stageStatus"] = "pending";

    if (stageStatuses[s.code] === "cancelled") {
      stageStatus = "cancelled";
    } else if (doneAt) {
      stageStatus = "done";
    } else if (startAt) {
      stageStatus = "doing";
    }

    return {
      code: s.code,
      crafter,
      stageStatus,
      startAt: startAt ? (startAt as Date).toISOString() : null,
      doneAt:  doneAt  ? (doneAt  as Date).toISOString() : null,
    };
  });
}

// V2 ref: WF_STATUS — Đang chờ / Đang làm / Đang QC / Xong / Bỏ qua
export const STAGE_STATUS_LABEL: Record<string, string> = {
  pending:   "Đang chờ",
  doing:     "Đang làm",
  qc:        "Đang QC",
  done:      "Xong",
  cancelled: "Bỏ qua",
  hold:      "Tạm ngưng",
};

// ─── Stage filter definitions (17 options) ────────────────────────────────────
// key: used as URL param value; group: for optgroup in dropdown
// DUC giữ granular (pending/doing/qc) vì là khâu quan trọng.
// Các khâu còn lại gộp "Chờ"+"Đang" thành :active để giảm độ dài danh sách.
export const STAGE_FILTER_DEFS: Array<{ key: string; label: string; group: string }> = [
  { key: "RESIN:doing",       label: "Resin (Đang in)",          group: "Resin" },
  { key: "RESIN:qc",          label: "QC Resin",                 group: "Resin" },
  { key: "DUC:pending",       label: "Chuẩn bị đúc",             group: "Đúc" },
  { key: "DUC:doing",         label: "Đúc",                      group: "Đúc" },
  { key: "DUC:qc",            label: "QC đúc",                   group: "Đúc" },
  { key: "NGUOI:active",      label: "Nguội",                    group: "Nguội" },
  { key: "TC_DAY:active",     label: "Thủ công dây",             group: "Thủ công" },
  { key: "TC_NGUOI:active",   label: "Thủ công nguội",           group: "Thủ công" },
  { key: "KHOA:active",       label: "Khóa",                     group: "Thủ công" },
  { key: "HOT:active",        label: "Gắn hột",                  group: "Hột" },
  { key: "MOC:active",        label: "Móc máy",                  group: "Hoàn thiện" },
  { key: "DBXM:active",       label: "ĐBXM (Mạ)",                group: "Hoàn thiện" },
  { key: "QC:active",         label: "QC – Nhập kho",            group: "Hoàn thiện" },
  { key: "DUYET_NK:active",   label: "Chờ duyệt NK",             group: "Hoàn thiện" },
  { key: "CHO_DX_NL:active",   label: "Chờ ĐX NL",                group: "Chờ NL" },
  { key: "CHO_NL:active",      label: "Chờ NL",                   group: "Chờ NL" },
  { key: "SUSPENDED",          label: "Tạm ngưng",                group: "Trạng thái" },
];

export const STAGE_STATUS_CLS: Record<string, string> = {
  pending:   "text-gray-500 bg-gray-100 border-gray-200",
  doing:     "text-blue-700 bg-blue-50 border-blue-200",
  qc:        "text-purple-700 bg-purple-50 border-purple-200",
  done:      "text-green-700 bg-green-50 border-green-300",
  cancelled: "text-red-600 bg-red-50 border-red-200",
  hold:      "text-amber-700 bg-amber-50 border-amber-300",
};

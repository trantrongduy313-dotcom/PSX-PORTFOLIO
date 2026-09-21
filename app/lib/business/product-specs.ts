// ─── Thông số sản phẩm gọn thành từng dòng để hiển thị ───────────────────────
//
// VÌ SAO CÓ FILE NÀY: NV 3D mở việc của mình chỉ thấy TÊN sản phẩm, khách hàng, deadline và
// ảnh mẫu. Nhưng để dựng được mẫu thì họ cần NVL, size, trọng lượng yêu cầu, loại đá chủ và
// thông số đá, xi mạ, phân loại kỹ thuật, ghi chú kỹ thuật — toàn bộ đã nằm sẵn trong
// OrderItem do Order nhập ở tab Sản phẩm, chỉ là chưa ai nối dây sang màn 3D.
//
// Hệ quả của việc thiếu: NV 3D phải hỏi lại qua chat, và câu trả lời không lưu ở đâu cả — nên
// người thứ hai làm cùng MO lại hỏi lần nữa, và hai người có thể đang dựng theo hai bộ thông
// số khác nhau mà không ai biết.
//
// NHÃN LẤY TỪ app/lib/i18n/labels.ts, KHÔNG gõ lại: cùng một trường phải cùng một tên ở mọi
// màn, nếu không thì Order và NV 3D nói về hai thứ khác nhau khi đọc cùng một ô.
//
// File thuần (không React, không prisma) để test trực tiếp.

/** Phần thông tin sản phẩm cần để dựng mẫu — chỉ những trường thật sự dùng tới. */
export type ProductSpecSource = {
  /**
   * "Diễn giải SP" — cột `OrderItem.techNote`.
   *
   * 🔴 KHÔNG NHẦM VỚI `yeucauKyThuat` (khối "Yêu cầu chi tiết KT" ngay dưới khối này trên màn
   * 3D). Hai thứ khác nguồn, khác người điền, và màn Việc thiết kế 3D TỪNG HIỆN NHẦM cái này
   * vào chỗ cái kia — xem cảnh báo dài ở business/kpi-3d/design-request.ts.
   *
   *   techNote       cột thật của OrderItem · PTK/PSX điền ở tab Kỹ thuật · mô tả sản phẩm
   *   yeucauKyThuat  trong JSON khối thiết kế · ORDER điền khi giao việc · đề bài cho NV 3D
   *
   * Nay CẢ HAI cùng hiện, mỗi thứ dưới nhãn riêng của nó. Lỗi cũ là dán nhãn sai, không phải
   * việc hiện techNote — nên đừng đọc ghi chú kia thành "cấm hiện techNote ở màn 3D".
   */
  techNote?: string | null;
  nvl?: string | null;
  size?: string | null;
  weightGram?: number | string | null;
  quantity?: number | null;
  platingType?: string | null;
  mainStoneType?: string | null;
  mainStoneSize?: string | null;
  mainStoneQty?: number | null;
  techClassification?: string[] | null;
  color?: string | null;
  engraving?: string | null;
};

export type ProductSpecRow = {
  label: string;
  value: string;
};

/** Nhãn hiển thị — giữ khớp với app/lib/i18n/labels.ts (ui.form / ui.panel). */
const LABELS = {
  // Đúng con chữ dùng ở bảng Đơn hàng và ở bản in báo cáo — cùng một trường phải cùng một tên
  // ở mọi màn, nếu không Order và NV 3D nói về hai thứ khác nhau khi đọc cùng một ô.
  dienGiai: "Diễn giải SP",
  nvl: "NVL",
  size: "Size",
  weight: "TL YC (g)",
  quantity: "SL",
  plating: "Xi mạ",
  mainStone: "Đá chủ",
  techClass: "Phân loại KT",
  color: "Màu",
  engraving: "Khắc",
} as const;

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
};

/**
 * Trọng lượng: bỏ số 0 vô nghĩa ở cuối.
 *
 * Prisma trả Decimal ra chuỗi "3.500" — hiện nguyên vậy thì trông như độ chính xác tới miligram
 * trong khi thực tế Order chỉ gõ "3.5".
 */
function formatWeight(value: number | string | null | undefined): string | null {
  const raw = text(value);
  if (raw === null) return null;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;

  return `${Math.round(n * 1000) / 1000}`;
}

/**
 * Đá chủ gộp một dòng: loại + thông số + số lượng.
 *
 * CỐ Ý GỘP, khác với nguyên tắc "một cột một dữ liệu" của bảng danh sách. Ở đây không có ai
 * quét dọc theo từng chiều — người đọc cần trả lời MỘT câu "đá chủ là gì" chứ không so sánh
 * loại đá giữa các sản phẩm. Tách ba dòng chỉ làm panel dài thêm mà không thêm thông tin.
 */
function formatMainStone(source: ProductSpecSource): string | null {
  const parts = [
    text(source.mainStoneType),
    text(source.mainStoneSize),
    source.mainStoneQty && source.mainStoneQty > 0 ? `${source.mainStoneQty} viên` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Đổi thông số sản phẩm thành danh sách dòng để hiển thị.
 *
 * BỎ HẲN DÒNG TRỐNG thay vì hiện "—": khối này có tới chín trường mà một MO thường chỉ nhập
 * bốn năm cái. Hiện đủ chín dòng thì hơn nửa khối là dấu gạch ngang, và NV 3D phải đọc qua
 * chúng để tìm thứ có thật — đúng bệnh vừa dọn ở khối giao việc bên sidebar.
 */
export function productSpecRows(source: ProductSpecSource | null | undefined): ProductSpecRow[] {
  if (!source) return [];

  const candidates: Array<[string, string | null]> = [
    // ĐỨNG ĐẦU, theo đúng thứ tự cột của bảng Đơn hàng (DIỄN GIẢI SP trước NVL/SIZE): nó nói
    // sản phẩm LÀ GÌ, các thông số phía dưới chỉ định lượng cho nó.
    [LABELS.dienGiai, text(source.techNote)],
    [LABELS.nvl, text(source.nvl)],
    [LABELS.size, text(source.size)],
    [LABELS.weight, formatWeight(source.weightGram)],
    // SL chỉ nêu khi KHÁC 1: gần như mọi MO đều là 1 sản phẩm, nên "SL 1" là một dòng không
    // mang tin. Số khác 1 thì lại là thứ NV 3D phải biết ngay.
    [LABELS.quantity, source.quantity && source.quantity !== 1 ? String(source.quantity) : null],
    [LABELS.plating, text(source.platingType)],
    [LABELS.mainStone, formatMainStone(source)],
    [LABELS.techClass, source.techClassification?.filter((v) => text(v)).join(", ") || null],
    [LABELS.color, text(source.color)],
    [LABELS.engraving, text(source.engraving)],
  ];

  return candidates
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([label, value]) => ({ label, value }));
}

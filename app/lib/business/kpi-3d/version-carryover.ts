// Nâng phiên bản MO: khối thiết kế được KẾ THỪA, không phải đã giao việc.
//
// Luật có test: __tests__/kpi-3d-version-carryover.test.ts
// Sự cố nó bịt (KPI cộng đôi): docs/04_ENGINEERING_GUIDELINES.md § Nâng phiên bản MO và KPI 3D
//
// Bỏ bốn mốc thời gian của bản cũ, GIỮ đề xuất (tho3d, phanNhom3D). Khối thiếu trường thì
// `readDesign3DBlocks` không nhận → không lượt nào được tạo → trùng KPI bất khả thi VỀ CẤU TRÚC.
// Cờ `carriedFromVersion` nằm trong DỮ LIỆU, không phải một hộp thoại: hộp thoại bấm qua là mất.

/** Khoá của cờ trong khối thiết kế — bản này kế thừa từ phiên bản nào. */
export const CARRIED_FROM_KEY = "carriedFromVersion";

/**
 * Các trường thuộc về LƯỢT GIAO của bản cũ — phải bỏ khi copy sang bản mới.
 *
 * `gioThucTe` cũng nằm đây và đó là chủ ý: giờ thực tế là công đã bỏ ra cho bản _1. Mang sang
 * _2 là khai một số giờ chưa ai làm, và số đó lại đúng là số nuôi cột "Tổng giờ TT".
 */
export const LOT_SCOPED_DESIGN_FIELDS = [
  "kpi3DAssignmentId",
  "ngayGiao3D",
  "gioGiao3D",
  "gioThucTe",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Bỏ các trường thuộc lượt giao khỏi MỘT khối thiết kế, và đóng dấu nguồn kế thừa. */
function cleanDesignBlock(block: Record<string, unknown>, carriedFrom: string): Record<string, unknown> {
  const out = { ...block };
  for (const key of LOT_SCOPED_DESIGN_FIELDS) delete out[key];
  out[CARRIED_FROM_KEY] = carriedFrom;
  return out;
}

/**
 * Khối này có đáng đóng dấu kế thừa không.
 *
 * CHỈ khi có TÊN NGƯỜI: khối trống hoàn toàn thì chẳng có gì để kế thừa, và đóng dấu vào đó chỉ
 * sinh ra một cảnh báo không nói về việc gì — người dùng học cách bỏ qua cảnh báo, và lần sau
 * cảnh báo thật cũng bị bỏ qua theo.
 */
function worthFlagging(designerName: string): boolean {
  return designerName.length > 0;
}

/**
 * Làm sạch dữ liệu per-MO của MỘT item khi copy sang phiên bản mới.
 *
 * Xử lý CẢ khối gốc (`design`) và mảng người thứ 2 trở đi (`designers[]`) — một MO có thể có
 * nhiều NV 3D cùng làm, và bỏ sót mảng đó thì những người sau vẫn mang mốc giao của bản cũ.
 *
 * @param carriedFrom Nhãn bản cũ để hiện cho người dùng (VD "26.42341_1").
 */
export function cleanCarriedItemData(
  itemData: Record<string, unknown>,
  carriedFrom: string,
): Record<string, unknown> {
  const out = { ...itemData };
  const rootName = asText(out.tho3d);

  const design = asRecord(out.design);
  if (design && worthFlagging(rootName || asText(design.tho3d))) {
    out.design = cleanDesignBlock(design, carriedFrom);
  }

  if (Array.isArray(out.designers)) {
    out.designers = out.designers.map((entry) => {
      const raw = asRecord(entry);
      if (!raw || !worthFlagging(asText(raw.tho3d))) return entry;
      return cleanDesignBlock(raw, carriedFrom);
    });
  }

  return out;
}

/** Một khối đang mang dấu kế thừa mà CHƯA được giao lại. */
export type CarriedBlock = {
  orderItemId: string;
  /** Nhãn bản cũ, VD "26.42341_1". */
  carriedFrom: string;
  designerName: string;
};

/**
 * Quét toàn bộ payload tìm những khối kế thừa CHƯA có mốc giao mới.
 *
 * ⚠️ PHẢI QUÉT RIÊNG, KHÔNG DÙNG `resolveDesign3DSyncTargets`. Hàm đó chỉ trả về MO có khối ĐỦ
 * 4 TRƯỜNG — mà khối kế thừa vừa bị bỏ mốc giao nên chắc chắn không đủ, tức nó bị loại trước
 * khi có ai kịp cảnh báo. Đó đúng là kiểu bỏ qua im lặng mà cả module này sinh ra để chấm dứt.
 */
export function carriedBlocksAwaitingAssign(
  extraData: Record<string, unknown> | null | undefined,
  validItemIds: readonly string[],
): CarriedBlock[] {
  const extra = asRecord(extraData);
  const perItem = extra ? asRecord(extra.perItem) : null;
  if (!perItem) return [];

  const valid = new Set(validItemIds);
  const out: CarriedBlock[] = [];

  for (const [orderItemId, rawItem] of Object.entries(perItem)) {
    if (!valid.has(orderItemId)) continue;
    const itemData = asRecord(rawItem);
    if (!itemData) continue;

    const candidates: Array<{ raw: Record<string, unknown>; name: string }> = [];
    const design = asRecord(itemData.design);
    if (design) candidates.push({ raw: design, name: asText(itemData.tho3d) || asText(design.tho3d) });
    if (Array.isArray(itemData.designers)) {
      for (const entry of itemData.designers) {
        const raw = asRecord(entry);
        if (raw) candidates.push({ raw, name: asText(raw.tho3d) });
      }
    }

    for (const { raw, name } of candidates) {
      const carriedFrom = asText(raw[CARRIED_FROM_KEY]);
      if (!carriedFrom) continue;
      // Đã có mốc giao mới nghĩa là NGƯỜI DÙNG ĐÃ QUYẾT — khối đi đường bình thường, và lần lưu
      // đó cũng là lần cờ được xoá. Cảnh báo tiếp là nhắc một việc đã làm xong.
      if (asText(raw.ngayGiao3D)) continue;
      out.push({ orderItemId, carriedFrom, designerName: name });
    }
  }

  return out;
}

/**
 * Câu cảnh báo cho một khối kế thừa chưa giao lại.
 *
 * Nói ĐỦ BA điều, vì thiếu điều nào người đọc cũng kết luận sai:
 *   · dữ liệu đến từ đâu     → không phải hệ thống mất dữ liệu;
 *   · hiện chưa có gì xảy ra → thợ chưa biết, KPI chưa tính;
 *   · phải làm gì để đi tiếp → gõ ngày giao, hoặc để trống nếu không cần thiết kế lại.
 */
export function carryOverWarning(block: CarriedBlock): string {
  const who = block.designerName ? ` (${block.designerName})` : "";
  return `Thông tin thiết kế${who} đang KẾ THỪA từ ${block.carriedFrom} — chưa giao việc, `
    + `thợ chưa được thông báo và KPI chưa tính. Cần thiết kế lại thì nhập "Ngày giao 3D" mới; `
    + `chỉ sửa thông số sản phẩm thì bỏ qua khối này.`;
}

/**
 * Lượt của bản CŨ đang ở đâu — quyết định mức độ cần cảnh báo khi nâng phiên bản.
 *
 * `KPI_BANKED` dùng ĐÚNG điều kiện của `closedAttemptBlocks` ("lượt có thứ gì để đối chiếu
 * KPI") thay vì khai một luật thứ hai: hai chỗ cùng hỏi "lượt này đã có công chưa" mà trả lời
 * khác nhau thì sớm muộn một chỗ sai, và không có gì phát hiện ra.
 */
export type OldAttemptClass = "NONE" | "IN_FLIGHT" | "KPI_BANKED";

export function classifyOldAttempts(
  rows: readonly { completedAt: Date | string | null; actualMinutes: number | null }[],
): OldAttemptClass {
  if (rows.length === 0) return "NONE";
  const banked = rows.some(
    (r) => r.completedAt != null || (typeof r.actualMinutes === "number" && r.actualMinutes > 0),
  );
  return banked ? "KPI_BANKED" : "IN_FLIGHT";
}

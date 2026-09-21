// ─── Ngày hủy + Lý do hủy, đọc ngược từ workflowHistory ──────────────────────
//
// VÌ SAO PHẢI ĐỌC NGƯỢC: schema KHÔNG có `cancelledAt` hay `cancelReason`. Khi hủy, code còn
// set `completedDate: null` — nên không có cột nào giữ mốc thời gian hủy. Dấu vết duy nhất là
// workflowHistory. Đọc từ đó thay vì thêm cột: không cần migration trên DB production, và
// đây đã là nơi lưu dấu vết của mọi hành động khác (SUSPENDED, RESUMED, STATUS_CHANGED) —
// thêm cột mới sẽ tạo nguồn thứ hai cho cùng một loại dữ liệu.
//
// HAI ĐƯỜNG HỦY GHI HAI KIỂU BẢN GHI:
//   - Hủy TỪNG MO  → có `metadata.scopedItemId` = MO bị hủy
//   - Hủy CẢ SO    → KHÔNG có scopedItemId, áp cho mọi MO của đơn
//
// File thuần (không prisma, không React) để test trực tiếp — mấy quy tắc ưu tiên dưới đây là
// chỗ dễ sai nhất và không thể kiểm bằng mắt.

export type CancelHistoryEntry = {
  orderId: string;
  /** Chuỗi người dùng gõ, nằm ở metadata.reason. NGUỒN DUY NHẤT của lý do — xem cảnh báo dưới. */
  metadata?: Record<string, unknown> | null;
  performedAt: Date;
};

// ⚠️ KHÔNG DÙNG workflowHistory.comment LÀM LÝ DO HỦY.
//
// `comment` là trường của HỆ THỐNG trong codebase này. Ba chỗ ghi bản ghi hủy:
//
//   1. Hủy 1 MO       → metadata.reason = lý do thật ✔
//   2. Hủy cả SO      → metadata.reason = lý do thật ✔, còn comment BỊ GHI ĐÈ thành
//                       "Hủy — Trả vàng Xg về xưởng" khi đơn đã vào sản xuất
//   3. Rollup tự động → KHÔNG có metadata, comment = "Tất cả MO đã hủy"
//
// Chỗ (3) chạy khi MO cuối cùng của SO thành terminal. Bản đầu của file này lấy comment làm
// dự phòng khi thiếu metadata.reason, nên với MỌI đơn hủy per-MO cũ thì cột "Lý do hủy" hiện
// đúng câu "Tất cả MO đã hủy" — một câu hệ thống trông y như câu do người viết.
//
// Đây cùng một lớp lỗi với việc lấy `updatedAt` làm ngày hủy (đã từ chối bên dưới): MỘT GIÁ
// TRỊ SAI TRÔNG Y NHƯ MỘT GIÁ TRỊ ĐÚNG, và người đọc sẽ tin nó. Không có lý do thì để null
// để bảng hiện "—" — người đọc biết là không có.
//
// Bỏ dự phòng này KHÔNG MẤT GÌ THẬT: nhánh (2) luôn ghi metadata.reason song song, nên không
// có trường hợp nào comment là nơi duy nhất giữ lý do người dùng.

export type CancelInfo = {
  cancelledAt: string;
  cancelReason: string | null;
};

export type CancelInfoIndex = {
  byItem: Map<string, CancelInfo>;
  byOrder: Map<string, CancelInfo>;
};

const clean = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s === "" ? null : s;
};

/**
 * Gom danh sách bản ghi hủy thành hai bảng tra: theo MO và theo đơn.
 *
 * ⚠️ ĐẦU VÀO PHẢI SẮP THEO performedAt TĂNG DẦN. Bản ghi sau ghi đè bản ghi trước, nên với
 * một MO bị hủy nhiều lần (hủy → admin mở lại → hủy lại) thì kết quả là LẦN HỦY CUỐI —
 * lần đang có hiệu lực. Sắp giảm dần sẽ cho ra lần hủy đầu tiên, tức một lý do đã lỗi thời.
 */
export function indexCancelHistory(entries: readonly CancelHistoryEntry[]): CancelInfoIndex {
  const byItem = new Map<string, CancelInfo>();
  const byOrder = new Map<string, CancelInfo>();

  for (const entry of entries) {
    const meta = entry.metadata ?? {};
    // CHỈ metadata.reason. Không rơi về comment — xem cảnh báo ở đầu file.
    const cancelReason = clean(meta.reason);
    // NGÀY vẫn lấy từ mọi bản ghi, kể cả bản rollup không có lý do: một mốc thời gian là một
    // mốc thời gian, còn thiếu lý do không có nghĩa là thiếu luôn thời điểm hủy.
    const info: CancelInfo = { cancelledAt: entry.performedAt.toISOString(), cancelReason };

    const scopedItemId = clean(meta.scopedItemId);
    if (scopedItemId) byItem.set(scopedItemId, info);
    else byOrder.set(entry.orderId, info);
  }

  return { byItem, byOrder };
}

/**
 * Thông tin hủy của một MO cụ thể.
 *
 * BẢN GHI CỦA CHÍNH MO THẮNG BẢN GHI CẤP SO: một MO có thể bị hủy riêng (có lý do riêng) rồi
 * sau đó cả SO bị hủy vì lý do khác. Lấy bản cấp SO cho MO đó là gán sai lý do cho một MO đã
 * có lý do đúng của nó.
 *
 * Trả về null khi không có bản ghi nào — bảng sẽ hiện "—". CỐ Ý KHÔNG rơi về `updatedAt`:
 * MO đã hủy bị khoá sửa nên updatedAt gần đúng thời điểm hủy, nhưng admin override vẫn ghi
 * được, và một ngày SAI trông y như một ngày đúng. Trống thì người đọc biết là không có.
 */
export function resolveCancelInfo(
  index: CancelInfoIndex,
  itemId: string,
  orderId: string,
): CancelInfo | null {
  return index.byItem.get(itemId) ?? index.byOrder.get(orderId) ?? null;
}

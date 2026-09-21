import type { StageRecord } from "@/app/lib/utils/order-helpers";

// ─── Thu gọn công đoạn ở tab Tiến độ ─────────────────────────────────────────
//
// VẤN ĐỀ: bảng "Thợ thực hiện" LUÔN bung sẵn cho 5 khâu (Resin, Đúc, Nguội, TC Nguội,
// Hột), mỗi thẻ thợ ~14 ô. Một MO bình thường có 5 thẻ như vậy → tab Tiến độ dài ra rất
// nhanh, và người dùng KHÔNG có cách nào đóng lại: không hề có nút thu gọn nào.
//
// ─── VÌ SAO SUY RA CHỨ KHÔNG LƯU ────────────────────────────────────────────
//
// Cách hay bị chọn là ghi nhớ "khâu nào đang gọn" vào localStorage/DB. Đó lại là hai nơi
// lưu cùng một sự thật: user đổi khâu từ Xong về Đang làm thì cái đã ghi nhớ vẫn bảo
// "gọn", và không có gì phát hiện ra.
//
// Suy ra từ chính trạng thái khâu thì yêu cầu "lần sau mở lên, khâu xong tự gọn" đúng
// MIỄN PHÍ — mỗi lần mở panel là tính lại từ trạng thái thật. Không có gì để lệch.
//
// File THUẦN: không React, không prisma.

/** Các khâu có bảng "Thợ thực hiện" — chỉ những khâu này mới có gì để thu gọn. */
export const STAGES_WITH_RECORDS = ["NGUOI", "HOT", "DUC", "RESIN", "TC_NGUOI"] as const;

/** Trạng thái khâu mặc định THU GỌN: đã xong, đã huỷ, hoặc chưa tới. */
const COLLAPSED_BY_DEFAULT = new Set(["done", "cancelled", "pending"]);

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const FAILED = "Không đạt";

/** Bản ghi này có bị coi là KHÔNG ĐẠT ở bất kỳ tiêu chí nào không. */
export function isRecordFailed(rec: StageRecord): boolean {
  return txt(rec.ketQua) === FAILED
    || txt(rec.resinWeightOk) === FAILED
    || txt(rec.thoiGianOk) === FAILED;
}

/**
 * Thẻ thợ đã điền đủ chưa — dùng cho luật an toàn bên dưới.
 *
 * Mỗi khâu có ô kết quả riêng (Nguội/TC Nguội: Chất lượng SP · Đúc: Kết quả đúc ·
 * Resin: KQ trọng lượng). Hột CHỈ đòi tên thợ: số hột nhập theo từng loại, không có một
 * ô "kết quả" nào để dựa vào, và đòi thêm sẽ báo thiếu oan.
 */
export function isRecordComplete(stageCode: string, rec: StageRecord): boolean {
  if (!txt(rec.crafter)) return false;
  switch (stageCode) {
    case "NGUOI":
    case "TC_NGUOI":
    case "DUC":
      return !!txt(rec.ketQua);
    case "RESIN":
      return !!txt(rec.resinWeightOk);
    default:
      return true;
  }
}

/** Khâu này có thẻ thợ nào còn khuyết dữ liệu không. */
export function hasIncompleteRecords(stageCode: string, records: readonly StageRecord[] = []): boolean {
  return records.some((r) => !isRecordComplete(stageCode, r));
}

/**
 * Khâu này nên MỞ hay GỌN.
 *
 * ⚠️ LUẬT AN TOÀN: khâu để "Xong" nhưng còn thẻ khuyết dữ liệu thì VẪN MỞ. Thu gọn lúc đó
 * là giấu mất một lỗi — và giấu đúng chỗ người ta cần thấy nhất. Thà dài thêm một khâu.
 *
 * Lựa chọn TAY của người dùng thắng mọi luật: mở một khâu đã xong ra sửa thì nó phải ở
 * yên, kể cả sau khi Lưu. Trạng thái tay đó chỉ sống trong phiên mở panel — đóng mở lại
 * là về mặc định, đúng như "lần sau mở lên thì khâu xong tự gọn".
 */
export function shouldExpandStage(params: {
  stageCode: string;
  stageStatus: string;
  records?: readonly StageRecord[];
  /** undefined = người dùng chưa bấm gì cho khâu này. */
  manual?: boolean;
}): boolean {
  if (params.manual !== undefined) return params.manual;
  if (!COLLAPSED_BY_DEFAULT.has(params.stageStatus)) return true;
  if (params.stageStatus === "done" && hasIncompleteRecords(params.stageCode, params.records ?? [])) {
    return true;
  }
  return false;
}

/**
 * Dòng tóm tắt hiện khi khâu đang gọn. `null` = chưa có gì để tóm tắt.
 *
 * NHIỀU HƠN MỘT THỢ → GHI CHUNG CHUNG ("2 thợ"), muốn xem chi tiết thì mở ra. Nhồi cả hai
 * người vào một dòng sẽ tràn, và tràn thì phải cắt — một dòng bị cắt giữa chừng còn khó
 * đọc hơn không có dòng nào.
 *
 * NHƯNG "chung chung" KHÔNG được nuốt mất một lần KHÔNG ĐẠT: đó là thứ người đọc cần biết
 * mà không phải mở từng khâu. Nên vẫn kèm cảnh báo, chỉ giấu chi tiết ai/bao nhiêu.
 *
 * Hột KHÔNG có phần số ở đây: khâu đó đã có sẵn dòng tóm tắt loại hột + tổng ngay dưới tên
 * khâu. Thêm nữa là nói cùng một chuyện hai lần.
 */
export function stageSummary(stageCode: string, records: readonly StageRecord[] = []): string | null {
  if (records.length === 0) return null;

  const failed = records.filter(isRecordFailed).length;

  if (records.length > 1) {
    const parts = [`${records.length} thợ`];
    if (failed > 0) parts.push(`có ${failed} lần KHÔNG ĐẠT`);
    return parts.join(" · ");
  }

  const rec = records[0];
  const parts: string[] = [];
  if (txt(rec.crafter)) parts.push(txt(rec.crafter));

  switch (stageCode) {
    case "NGUOI":
    case "TC_NGUOI": {
      if (txt(rec.ketQua)) parts.push(txt(rec.ketQua));
      if (txt(rec.gioThucTe)) parts.push(`${txt(rec.gioThucTe)} thực tế`);
      break;
    }
    case "DUC": {
      if (txt(rec.ketQua)) parts.push(txt(rec.ketQua));
      break;
    }
    case "RESIN": {
      if (txt(rec.resinWeightOk)) parts.push(txt(rec.resinWeightOk));
      // "Còn lại" là số người ta thật sự nhìn — nó là trọng lượng sau khi trừ ty, tức phần
      // dùng được. Ô này KHÔNG có trong dữ liệu: màn hình tự tính raw − ty, nên tính lại y
      // hệt ở đây thay vì đọc một cột không tồn tại.
      const raw = rec.resinWeightRaw;
      const ty = rec.resinWeightTy;
      if (typeof raw === "number") {
        const left = raw - (typeof ty === "number" ? ty : 0);
        parts.push(`${Number(left.toFixed(2))}g còn lại`);
      }
      break;
    }
    default:
      break;
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

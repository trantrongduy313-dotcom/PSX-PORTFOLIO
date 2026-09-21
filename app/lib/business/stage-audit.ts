import { STAGE_HAS_RECORDS } from "@/app/lib/business/production-stage";

// ─── Diff khâu sản xuất → dòng Lịch sử thay đổi ──────────────────────────────
//
// VÌ SAO TÁCH RA KHỎI ROUTE: logic này trước nằm trong app/api/orders/[id]/production/route.ts.
// Next.js chỉ cho phép route file export các HTTP verb, nên hàm buộc phải là private — và vì
// không export được thì cũng KHÔNG TEST ĐƯỢC. Đó chính là lý do một bug sống sót lâu ở đây:
// bản khai "khâu nào nhiều thợ" trong route thiếu TC_NGUOI, khiến mọi thay đổi records[] của
// khâu TC Nguội không bao giờ được ghi vào Lịch sử — không lỗi biên dịch, không lỗi chạy,
// chỉ đơn giản là không có dòng nào xuất hiện. Không ai phát hiện ra cho tới khi rà tay.
//
// Nay là module thuần (không import prisma, không đụng request) — cùng quy ước với
// kpi-3d/progress.ts và kpi-3d/review.ts — nên test được trực tiếp.

const STAGE_VN: Record<string, string> = {
  RESIN: "RESIN", DUC: "ĐÚC", NGUOI: "NGUỘI", TC_DAY: "TC DÂY", TC_NGUOI: "TC NGUỘI",
  KHOA: "KHÓA", HOT: "HỘT", MOC: "MÓC", DBXM: "ĐBXM", QC: "QC", DUYET_NK: "DUYỆT NK",
  CHO_DX_NL: "Chờ ĐX NL", CHO_NL: "Chờ NL",
};

const STAGE_STATUS_VN: Record<string, string> = {
  pending: "Chờ", doing: "Đang làm", qc: "QC", done: "Hoàn thành", cancelled: "Hủy", hold: "Tạm giữ",
};

const STAGE_FIELD_VN: Record<string, string> = {
  stageStatus: "Trạng thái", crafter: "Thợ", startAt: "Bắt đầu", doneAt: "Hoàn thành",
  durationNote: "Ghi chú TG", holdReason: "Lý do tạm giữ", workGroup: "Nhóm làm",
  settingNote: "Ghi chú gắn", ghiChuDuc: "Ghi chú đúc", ghiChuNguoi: "Ghi chú nguội",
  phan: "Phần", lan: "Lần", ketQua: "Kết quả", thoiGianOk: "Thời gian", lyDo: "Lý do",
  gioKpi: "Giờ KPI", gioThucTe: "Giờ thực tế", bachSP: "Bậc SP",
  stoneType: "Loại hột", stoneQty: "SL hột", stoneQtyByType: "SL theo loại",
  resinDetailQty: "SL chi tiết", resinWeightRaw: "TL chưa cắt ty", resinWeightTy: "TL ty",
  resinWeightOk: "KQ trọng lượng", ghiChu: "Ghi chú",
};

const STAGE_DATE_FIELDS = new Set(["startAt", "doneAt", "reviewedAt", "ngay"]);

// Field ghi vào records[] cho khâu nhiều thợ — là nguồn sự thật
// (scalar cấp khâu là tóm tắt suy diễn nên bỏ).
const STAGE_RECORD_FIELDS = [
  "crafter", "phan", "lan", "ketQua", "thoiGianOk", "lyDo", "gioKpi", "gioThucTe", "bachSP",
  "stoneType", "stoneQty", "stoneQtyByType", "resinDetailQty", "resinWeightRaw", "resinWeightTy",
  "resinWeightOk", "ghiChu", "startAt", "doneAt",
] as const;

export type AuditChange = { field: string; old: string; new: string };

const norm = (v: unknown): string => {
  if (v == null || v === "") return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

const normDate = (v: unknown): string => {
  if (v == null || v === "") return "";
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return String(v);
  // Format theo giờ VN (UTC+7), dd/mm/yyyy — tránh toISOString() lùi 1 ngày do UTC
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);
};

const fval = (f: string, v: unknown): string =>
  STAGE_DATE_FIELDS.has(f) ? normDate(v)
    : f === "stageStatus" ? (v == null ? "" : (STAGE_STATUS_VN[String(v)] ?? String(v)))
    : norm(v);

/**
 * So sánh hai ảnh chụp `stages` và trả về các dòng thay đổi để ghi Lịch sử.
 *
 * Khâu nhiều thợ (`STAGE_HAS_RECORDS`) bỏ qua các scalar tóm tắt cấp khâu — chúng chỉ là giá
 * trị suy diễn từ records[], đưa vào diff sẽ sinh nhiễu trùng lặp — và so từng dòng records[]
 * theo INDEX ("Thợ #N"). Chèn/xóa ở giữa danh sách vì thế có thể sinh diff nhiễu; đây là đánh
 * đổi có chủ ý để tránh phải gắn id ổn định cho từng record.
 */
export function diffStages(
  oldStages: Record<string, Record<string, unknown>>,
  newStages: Record<string, Record<string, unknown>>,
  codes: string[],
): AuditChange[] {
  const out: AuditChange[] = [];

  for (const code of codes) {
    const label = STAGE_VN[code] ?? code;
    const o = oldStages[code] ?? {};
    const n = newStages[code] ?? {};
    const isMulti = STAGE_HAS_RECORDS.has(code);

    const levelFields = isMulti
      ? ["stageStatus", "startAt", "doneAt", "durationNote", "holdReason", "settingNote", "ghiChuDuc", "ghiChuNguoi", "workGroup"]
      : ["stageStatus", "crafter", "startAt", "doneAt", "durationNote", "holdReason", "settingNote", "ghiChuDuc", "ghiChuNguoi", "workGroup"];

    for (const f of levelFields) {
      if (o[f] === undefined && n[f] === undefined) continue;
      const ov = fval(f, o[f]); const nv = fval(f, n[f]);
      if (ov !== nv) out.push({ field: `${label} · ${STAGE_FIELD_VN[f] ?? f}`, old: ov, new: nv });
    }

    if (isMulti) {
      const oldRecs = Array.isArray(o.records) ? (o.records as Record<string, unknown>[]) : [];
      const newRecs = Array.isArray(n.records) ? (n.records as Record<string, unknown>[]) : [];
      const max = Math.max(oldRecs.length, newRecs.length);
      for (let i = 0; i < max; i++) {
        const who = `${label} · Thợ #${i + 1}`;
        const or = oldRecs[i]; const nr = newRecs[i];
        if (or && !nr) { out.push({ field: who, old: "có bản ghi", new: "(đã xóa)" }); continue; }
        const orr = or ?? {}; const nrr = nr ?? {};
        for (const f of STAGE_RECORD_FIELDS) {
          if (orr[f] === undefined && nrr[f] === undefined) continue;
          const ov = fval(f, orr[f]); const nv = fval(f, nrr[f]);
          if (ov !== nv) out.push({ field: `${who} · ${STAGE_FIELD_VN[f] ?? f}`, old: ov, new: nv });
        }
      }
    }
  }
  return out;
}

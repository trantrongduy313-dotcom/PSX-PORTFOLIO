// ─────────────────────────────────────────────────────────────────────────────
// KPI Thợ Nguội — các hàm tính thuần (pure). Mỗi hàm làm ĐÚNG 1 việc, không side-effect,
// để dễ test & bảo trì. Dùng chung cho UI (production-stats) và có thể cho API sau này.
//
// Quy tắc (chốt với nghiệp vụ):
//   SL quy về nhóm chuẩn = Tổng giờ thực tế ÷ 4      (1 đơn vị chuẩn = 4 giờ)
//   ĐM/Tháng             = ngày công thực tế × 2      (2 đơn vị chuẩn/ngày)
//   ngày công thực tế    = số nhập tay lúc kiểm kê, RIÊNG từng thợ
//                          — chưa nhập thì dùng mặc định theo lịch:
//                            số ngày trong tháng − Chủ Nhật − ngày lễ
//   Kết quả (%)          = SL quy chuẩn ÷ ĐM × 100
// ─────────────────────────────────────────────────────────────────────────────

/** Số giờ để hoàn thành 1 đơn vị chuẩn. */
export const HOURS_PER_UNIT = 4;
/**
 * Số đơn vị chuẩn định mức cho 1 ngày công.
 *
 * 🔴 MỘT NÚM VẶN DUY NHẤT CHO CẢ HỆ THỐNG. Toàn bộ phần "chính sách" của module nằm ở đây.
 *
 * 📌 VÀ NÓ ĐÃ ĐƯỢC DÙNG ĐÚNG MỤC ĐÍCH: ngày 24/08/2026 hệ số bị đổi thành 0.5 (theo một phát
 * biểu "ngày công ÷ 2"), rồi phát hiện là nhầm và trả về 2 ngay trong ngày. Vì cả hệ thống chỉ
 * đọc MỘT hằng số này — và test bám vào chính nó chứ không vào con số 50 — việc đảo lại là sửa
 * một dòng, không phải đi tìm dấu chia rải khắp nơi.
 *
 * Giữ nguyên tính chất đó: mọi nơi cần ĐM phải gọi `monthlyQuota`, KHÔNG tự nhân/chia.
 */
export const QUOTA_PER_WORKDAY = 2;

/** Tổng số ngày trong tháng (month: 1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Đếm số Chủ Nhật trong tháng (month: 1–12). */
export function countSundays(year: number, month: number): number {
  const total = daysInMonth(year, month);
  let count = 0;
  for (let day = 1; day <= total; day++) {
    if (new Date(year, month - 1, day).getDay() === 0) count++;
  }
  return count;
}

/**
 * Ngày công MẶC ĐỊNH của tháng = số ngày trong tháng − Chủ Nhật − ngày lễ (không âm).
 *
 * Dùng cho thợ CHƯA được điền ngày công thực tế. Nhờ có mặc định này, ngày đầu triển khai không
 * ô nào trống — việc điền tay lúc kiểm kê là chỉnh cho khớp thực tế, không phải điều kiện để
 * bảng chạy được.
 */
export function workingDays(year: number, month: number, holidayDays: number): number {
  const raw = daysInMonth(year, month) - countSundays(year, month) - Math.max(0, holidayDays);
  return Math.max(0, raw);
}

/**
 * ĐM/Tháng = ngày công × hệ số. Làm tròn 2 chữ số thập phân — hệ số hiện là số nguyên nên phép
 * nhân ra số tròn, nhưng giữ phép làm tròn để hệ số lẻ (đã từng là 0.5) không sinh nhiễu số
 * thực trước khi đem chia ở `resultPercent`.
 */
export function monthlyQuota(workDays: number): number {
  return Math.round(Math.max(0, workDays) * QUOTA_PER_WORKDAY * 100) / 100;
}

/**
 * Ngày công hiệu lực của 1 thợ: số đã nhập lúc kiểm kê, chưa nhập thì dùng mặc định theo lịch.
 *
 * 🎯 ĐÂY LÀ CHỖ THAY THẾ `resolveQuota` CŨ, và khác biệt là điểm chính của cả thay đổi này:
 * trước đây thứ được cá biệt hoá là ĐM (KẾT QUẢ), nay là ngày công (NGUYÊN LIỆU). Lưu nguyên
 * liệu rồi suy ra kết quả thì chỉ có MỘT đường tính; lưu kết quả rồi cho sửa tay là hai nguồn
 * cho cùng một con số, và sớm muộn chúng lệch.
 */
export function resolveWorkDays(defaultWorkDays: number, entered: number | null | undefined): number {
  return entered != null && entered >= 0 ? entered : defaultWorkDays;
}

/** SL quy về nhóm chuẩn = tổng giờ thực tế ÷ 4 (làm tròn 2 chữ số thập phân). */
export function standardUnits(totalHours: number): number {
  return Math.round((totalHours / HOURS_PER_UNIT) * 100) / 100;
}

/** Kết quả (%) = SL quy chuẩn ÷ ĐM × 100 (làm tròn số nguyên). null nếu ĐM = 0. */
export function resultPercent(unitsStandard: number, quota: number): number | null {
  if (quota <= 0) return null;
  return Math.round((unitsStandard / quota) * 100);
}

// ─── Lắp ráp dòng tổng KPI ───────────────────────────────────────────────────
//
// VÌ SAO Ở ĐÂY: các nguyên tử ở trên vốn đã dùng chung, nhưng việc GHÉP chúng thành một dòng
// tổng lại nằm trong `buildNguoiPrintRow` — hàm cục bộ của production-stats.tsx. Sắp có nơi
// thứ ba cần đúng dòng đó (bảng tổng ở cuối bản in Đánh giá Khâu).
//
// Nếu mỗi nơi tự ghép, chỉ cần một chỗ quên `resolveQuota` (dùng thẳng ĐM chung, bỏ qua ghi
// đè riêng của thợ) là hai màn hình hiện HAI con số khác nhau cho cùng một thợ, cùng một
// tháng. Với báo cáo dùng để đánh giá nhân sự, sai lệch kiểu này rất khó phát hiện vì nó chỉ
// xuất hiện ở các thợ có ĐM ghi đè.
//
// Gom lại một hàm → số liệu giống nhau DO CẤU TRÚC, không phải do người viết nhớ giữ cho giống.

/** Cấu hình ĐM của tháng: ngày công mặc định (theo lịch) + ngày công thực tế theo tên thợ. */
export type NguoiQuotaConfig = {
  /** Ngày công theo lịch của tháng — dùng cho thợ chưa được điền. */
  defaultWorkDays: number;
  /** { [tênThợ]: ngày công thực tế } nhập lúc kiểm kê. */
  workDays: Record<string, number>;
};

/** Nguồn tối thiểu để dựng dòng tổng — khớp tập con của NguoiRow (app/lib/types/kpi-report.ts). */
export type NguoiKpiInput = {
  crafter: string;
  /** Mã thợ. "" khi chưa có mã hoặc thợ không khớp tên trong danh mục — như `level`. */
  code: string;
  level: string;
  totalHours: number;
  moCount: number;
  qualityFail: number;
  timeFail: number;
};

/** Dòng tổng KPI ở dạng SỐ — chưa định dạng, để test so sánh chính xác và tái dùng được. */
export type NguoiKpiSummary = {
  crafter: string;
  code: string;
  level: string;
  totalHours: number;
  moCount: number;
  /** SL quy về nhóm chuẩn. */
  units: number;
  /** Ngày công thực tế đang áp dụng cho thợ này (đã nhập, hoặc mặc định theo lịch). */
  workDays: number;
  /** ĐM/tháng = ngày công × QUOTA_PER_WORKDAY. */
  quota: number;
  /** Kết quả %; null khi ĐM = 0 (không chia được). */
  resultPct: number | null;
  qualityFail: number;
  timeFail: number;
};

/** Ghép NguoiRow + cấu hình ĐM thành dòng tổng. Thuần, không định dạng, không I/O. */
export function buildNguoiKpiSummary(row: NguoiKpiInput, cfg: NguoiQuotaConfig): NguoiKpiSummary {
  const units    = standardUnits(row.totalHours);
  const workDays = resolveWorkDays(cfg.defaultWorkDays, cfg.workDays[row.crafter]);
  const quota    = monthlyQuota(workDays);
  return {
    crafter: row.crafter,
    code: row.code,
    level: row.level,
    totalHours: row.totalHours,
    moCount: row.moCount,
    units,
    workDays,
    quota,
    resultPct: resultPercent(units, quota),
    qualityFail: row.qualityFail,
    timeFail: row.timeFail,
  };
}

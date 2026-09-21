// ─── Gọi API báo cáo KPI từ phía client ──────────────────────────────────────
//
// VÌ SAO GOM Ở ĐÂY: hai endpoint này sắp có nơi thứ hai gọi tới (bản in Đánh giá Khâu, ngoài
// màn Thống kê). Nếu mỗi nơi tự viết chuỗi URL và tự đọc JSON thì chỉ cần một bên đổi tên
// tham số hay quên `?? {}` là hai màn hình lệch nhau — mà TypeScript không bắt được, vì
// `res.json()` trả `any`.
//
// Ở đây làm đúng hai việc: dựng URL và ép kiểu response về hợp đồng đã khai báo.
// KHÔNG chứa React, không state → dùng được cả trong hook lẫn ngoài.

import type { StageReportData } from "@/app/lib/types/kpi-report";
import type { KpiConfig } from "@/app/api/admin/kpi-config/route";
import type { NguoiQuotaConfig } from "@/app/lib/business/kpi-nguoi";
import { workingDays } from "@/app/lib/business/kpi-nguoi";

/** Chuẩn hoá cấu hình thô từ API — API cũ/lỗi có thể thiếu trường. */
export function normalizeKpiConfig(raw: unknown): KpiConfig {
  const o = (raw ?? {}) as Partial<KpiConfig>;
  const holidayDays = Number.isFinite(o.holidayDays) ? Math.max(0, Number(o.holidayDays)) : 0;
  return { holidayDays, workDays: o.workDays ?? {} };
}

/** KpiConfig (ngày lễ + ngày công đã nhập) → NguoiQuotaConfig (ngày công mặc định + đã nhập). */
export function toQuotaConfig(cfg: KpiConfig, year: number, month: number): NguoiQuotaConfig {
  return {
    defaultWorkDays: workingDays(year, month, cfg.holidayDays),
    workDays: cfg.workDays,
  };
}

export async function fetchStageReport(year: number, month: number): Promise<StageReportData> {
  const res = await fetch(`/api/reports/stages?year=${year}&month=${month}`);
  if (!res.ok) throw new Error(`Không tải được báo cáo khâu (HTTP ${res.status})`);
  return res.json() as Promise<StageReportData>;
}

export async function fetchKpiConfig(year: number, month: number): Promise<KpiConfig> {
  const res = await fetch(`/api/admin/kpi-config?year=${year}&month=${month}`);
  if (!res.ok) throw new Error(`Không tải được cấu hình ĐM (HTTP ${res.status})`);
  return normalizeKpiConfig(await res.json());
}

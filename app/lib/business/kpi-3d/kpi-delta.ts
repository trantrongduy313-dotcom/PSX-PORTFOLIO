import {
  evaluate3DKpiCompletion,
  type Kpi3DResultStatus,
  type WorkingCalendar,
} from "@/app/lib/business/kpi-3d-deadline";

// ─── "Sớm / Trễ" là DỮ LIỆU PHÁI SINH, không phải bản sao ────────────────────
//
// 🔴 VÌ SAO FILE NÀY TỒN TẠI:
//
// `Design3DAssignment.kpiDeltaMinutes` là một cột LƯU TRONG DB, đóng dấu một lần lúc hoàn tất.
// Nhưng nó suy ra được HOÀN TOÀN từ ba giá trị đã đóng băng của chính lượt đó:
//
//     deadlineAt · completedAt · lịch làm việc của lượt đó
//
// Lưu một giá trị suy ra được là tạo bản sao — và CLAUDE.md mục 4 nói đúng điều sẽ xảy ra:
// "hai nơi lưu cùng một sự thật thì sớm muộn lệch". Nó đã lệch, và lệch theo cách tệ nhất:
//
//   Lỗi trộn đơn vị (trừ giờ tường thay vì giờ làm việc) được sửa ở evaluate3DKpiCompletion,
//   nhưng cột đã lưu KHÔNG tự sửa. Lượt 26.37669_1 hiện "Sớm 18 giờ 6 phút" ngay cạnh
//   "Dùng giờ KPI 16% (39 phút / 4 giờ)" — một việc 4 giờ, làm 39 phút, mà sớm 18 giờ. Hai dòng
//   không thể cùng đúng, và người đọc không có cách nào tự hoà giải.
//
// 🎯 NÊN GIAO DIỆN THÔI ĐỌC CỘT. Nó suy ra khi đọc, từ dữ liệu đã đóng băng. Một sự thật, một
// đường tính, và mọi lượt cũ tự đúng mà không phải ghi vào production database.
//
// ⚠️ LUẬT KÈM THEO: cột `kpiDeltaMinutes` GIỮ NGUYÊN trong DB làm dấu vết lịch sử, nhưng KHÔNG
// route nào được trả nó ra cho giao diện nữa. Trả cả hai là đúng lại cái bản sao vừa dẹp.
//
// ⚠️ VÀ MỘT HẠN CHẾ CHƯA GIẢI: `workingCalendarId` neo ĐƯỢC LỊCH NÀO, nhưng nội dung lịch (các
// ca) vẫn sửa được. Admin sửa ca → con số lịch sử đổi theo. Cách chốt hẳn là chụp ảnh nội dung
// lịch vào từng lượt, đúng như `standardMinutesSnapshot` đang làm — cần một migration, và để
// sau: hiện chưa có bằng chứng lịch bị sửa thường xuyên.

/** Phần của một lượt giao việc cần để suy ra Sớm/Trễ — chỉ đúng những trường được dùng. */
export type KpiDeltaSource = {
  deadlineAt: Date;
  completedAt: Date | null;
  /** null = lượt cũ chưa gắn lịch → rơi về lịch mặc định. */
  workingCalendarId: string | null;
};

export type DerivedKpiDelta = {
  kpiStatus: Kpi3DResultStatus;
  kpiDeltaMinutes: number;
};

/**
 * Suy ra Sớm/Trễ cho MỘT lượt. `null` khi chưa hoàn tất — chưa xong thì không có gì để chấm.
 *
 * `calendar` là lịch CỦA CHÍNH LƯỢT NÀY, không phải lịch đang active. Cùng luật đã ghi ở
 * api/design-3d/assignments/[id]/progress/route.ts: admin đổi lịch giữa lúc giao và lúc xong thì
 * đo bằng lịch mới sẽ ra con số không khớp với deadline đã chốt bằng lịch cũ.
 *
 * ⚠️ `kpiStatus` suy ra ở đây LUÔN KHỚP với cột đã lưu, và đó không phải may mắn: bản cũ xét
 * `deltaMinutes <= 0` trên hiệu số giờ tường, tức cũng chỉ là phép so hai mốc thời gian. Chỉ ĐỘ
 * LỚN từng sai đơn vị, còn "đúng hạn hay trễ" thì chưa bao giờ sai. Nên đợt này KHÔNG đảo phán
 * quyết của bất kỳ lượt nào — chỉ sửa con số đi kèm.
 */
export function deriveKpiDelta(
  row: KpiDeltaSource,
  calendar: WorkingCalendar | undefined,
): DerivedKpiDelta | null {
  if (!row.completedAt) return null;
  const evaluated = evaluate3DKpiCompletion(row.deadlineAt, row.completedAt, calendar);
  return { kpiStatus: evaluated.status, kpiDeltaMinutes: evaluated.deltaMinutes };
}

/**
 * Gắn Sớm/Trễ đã suy ra vào từng dòng, thay thế giá trị cũ.
 *
 * Nhận `Map` thay vì tự đi lấy lịch: file này phải THUẦN để test được mà không cần database. Việc
 * đọc lịch là của tầng server (app/lib/kpi-3d/calendars.ts), và nó đọc MỘT LẦN cho cả danh sách —
 * join theo từng dòng sẽ tải lại cùng một bộ ca hai trăm lần cho một bảng hai trăm dòng.
 *
 * Lượt CHƯA hoàn tất giữ nguyên `kpiStatus`/`kpiDeltaMinutes` đang có (thường là null) — không
 * ghi đè bằng null một cách vô cớ, để chỗ gọi không phải phân biệt hai loại null.
 */
export function withDerivedKpiDelta<
  T extends KpiDeltaSource & { kpiStatus: Kpi3DResultStatus | null; kpiDeltaMinutes: number | null },
>(rows: readonly T[], calendarsById: ReadonlyMap<string, WorkingCalendar>): T[] {
  return rows.map((row) => {
    const derived = deriveKpiDelta(
      row,
      row.workingCalendarId ? calendarsById.get(row.workingCalendarId) : undefined,
    );
    return derived ? { ...row, ...derived } : row;
  });
}

/** Các id lịch cần đọc cho một danh sách — bỏ trùng, bỏ null. */
export function calendarIdsOf(rows: readonly KpiDeltaSource[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) if (row.workingCalendarId) ids.add(row.workingCalendarId);
  return [...ids];
}

import { describe, expect, it } from "vitest";

import {
  calendarIdsOf,
  deriveKpiDelta,
  withDerivedKpiDelta,
} from "@/app/lib/business/kpi-3d/kpi-delta";
import { DEFAULT_3D_WORKING_CALENDAR, type WorkingCalendar } from "@/app/lib/business/kpi-3d-deadline";

const vn = (iso: string) => new Date(`${iso}+07:00`);

/** Lượt thật đã phát hiện ra lỗi: giao 15:10 20/08, KPI 4 giờ → deadline 10:10 21/08. */
const REAL = {
  deadlineAt: vn("2026-08-21T10:10"),
  completedAt: vn("2026-08-20T16:03"),
  workingCalendarId: "cal-default",
  kpiStatus: "ON_TIME" as const,
  // Con số SAI đang nằm trong DB — đo bằng giờ tường.
  kpiDeltaMinutes: -1086,
};

const CALS = new Map<string, WorkingCalendar>([["cal-default", DEFAULT_3D_WORKING_CALENDAR]]);

describe("deriveKpiDelta — lượt thật 26.37669_1", () => {
  it("🔴 suy ra 3 giờ 7 phút, thay cho 18 giờ 6 phút đang lưu", () => {
    // 57 phút còn lại của chiều 20/08 + 130 phút sáng 21/08 = 187.
    expect(deriveKpiDelta(REAL, DEFAULT_3D_WORKING_CALENDAR)).toEqual({
      kpiStatus: "ON_TIME",
      kpiDeltaMinutes: -187,
    });
  });

  it("chưa hoàn tất thì KHÔNG suy ra gì", () => {
    // Chưa xong thì không có gì để chấm. Trả null để chỗ gọi giữ nguyên giá trị đang có, thay vì
    // ghi đè bằng một con số vô nghĩa.
    expect(deriveKpiDelta({ ...REAL, completedAt: null }, DEFAULT_3D_WORKING_CALENDAR)).toBeNull();
  });

  it("KHÔNG có lịch thì rơi về lịch mặc định, không nổ", () => {
    // Lượt cũ chưa gắn lịch, hoặc lịch đã bị xoá (quan hệ là onDelete: SetNull). Ném lỗi ở đây là
    // làm trắng cả bảng việc vì một cột phụ.
    expect(deriveKpiDelta(REAL, undefined)?.kpiDeltaMinutes).toBe(-187);
  });

  it("dùng ĐÚNG lịch được truyền vào, không phải lịch mặc định", () => {
    // Lịch không có giờ nghỉ trưa và làm tới 18:00 → khoảng cách tới deadline khác hẳn.
    const roundTheClock: WorkingCalendar = {
      weeklyDaysOff: [],
      holidays: [],
      sessions: [{ start: "00:00", end: "23:59" }],
    };
    expect(deriveKpiDelta(REAL, roundTheClock)?.kpiDeltaMinutes).not.toBe(-187);
  });
});

describe("🎯 KHÔNG đảo phán quyết Đúng hạn / Trễ hạn của lượt nào", () => {
  it.each([
    ["nộp trước deadline", vn("2026-08-20T16:03"), "ON_TIME"],
    ["nộp sau deadline", vn("2026-08-21T11:00"), "LATE"],
    ["nộp đúng khoảnh khắc deadline", vn("2026-08-21T10:10"), "ON_TIME"],
  ] as const)("%s → %s", (_l, completedAt, expected) => {
    // Đây là bất biến quan trọng nhất của đợt sửa này: chỉ ĐỘ LỚN từng sai đơn vị, còn "đúng hạn
    // hay trễ" chưa bao giờ sai — bản cũ xét `deltaMinutes <= 0` trên hiệu số giờ tường, tức cũng
    // chỉ là phép so hai mốc thời gian.
    //
    // Nếu test này đỏ thì đợt sửa đang ĐẢO PHÁN QUYẾT về công việc của một người, và đó là việc
    // phải được quyết định ở tầng nghiệp vụ, không phải hệ quả phụ của một phép sửa đơn vị.
    expect(deriveKpiDelta({ ...REAL, completedAt }, DEFAULT_3D_WORKING_CALENDAR)?.kpiStatus).toBe(expected);
  });
});

describe("withDerivedKpiDelta", () => {
  it("thay con số sai đang lưu bằng con số suy ra", () => {
    const [row] = withDerivedKpiDelta([REAL], CALS);
    expect(row.kpiDeltaMinutes).toBe(-187);
  });

  it("giữ nguyên MỌI trường khác", () => {
    // Hàm này chạy trên đường trả về của API. Làm rơi một trường ở đây là một ô trống trên màn
    // hình mà không có lỗi nào — loại lỗi khó tìm nhất.
    const [row] = withDerivedKpiDelta([{ ...REAL, id: "asg-1", productName: "Vỏ nhẫn" }], CALS);
    expect(row.id).toBe("asg-1");
    expect(row.productName).toBe("Vỏ nhẫn");
  });

  it("lượt CHƯA hoàn tất giữ nguyên, không bị ghi null", () => {
    const rows = [{ ...REAL, completedAt: null, kpiStatus: null, kpiDeltaMinutes: null }];
    const [row] = withDerivedKpiDelta(rows, CALS);
    expect(row.kpiStatus).toBeNull();
    expect(row.kpiDeltaMinutes).toBeNull();
  });

  it("id lịch không có trong Map → rơi về lịch mặc định", () => {
    // Lịch bị xoá thì id vẫn còn trỏ vào chỗ trống. Phải ra số, không phải ra lỗi.
    const [row] = withDerivedKpiDelta([{ ...REAL, workingCalendarId: "da-bi-xoa" }], new Map());
    expect(row.kpiDeltaMinutes).toBe(-187);
  });

  it("danh sách rỗng thì trả rỗng", () => {
    expect(withDerivedKpiDelta([], CALS)).toEqual([]);
  });
});

describe("calendarIdsOf — đọc lịch MỘT LẦN cho cả danh sách", () => {
  it("bỏ trùng: 200 dòng dùng chung một lịch → đọc đúng 1", () => {
    // Đây là lý do hàm này tồn tại. Join theo từng dòng sẽ trả về 200 bản sao của cùng một bộ ca.
    const rows = Array.from({ length: 200 }, () => ({ ...REAL }));
    expect(calendarIdsOf(rows)).toEqual(["cal-default"]);
  });

  it("bỏ null", () => {
    expect(calendarIdsOf([{ ...REAL, workingCalendarId: null }])).toEqual([]);
  });

  it("giữ nhiều lịch khác nhau", () => {
    expect(
      calendarIdsOf([REAL, { ...REAL, workingCalendarId: "cal-2" }, { ...REAL, workingCalendarId: "cal-2" }]),
    ).toEqual(["cal-default", "cal-2"]);
  });
});

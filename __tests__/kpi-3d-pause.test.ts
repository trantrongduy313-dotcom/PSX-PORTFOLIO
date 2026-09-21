import { describe, expect, it } from "vitest";

import {
  addWorkingMinutes,
  deniedReasonForPause,
  deniedReasonForPauseAt,
  deniedReasonForResumeAt,
  isPaused,
  netWorkingMinutes,
  openPause,
  pausedWorkingMinutes,
  shiftDeadlineByPauses,
  type PauseSpan,
} from "@/app/lib/business/kpi-3d/pause";
import {
  countWorkingMinutesBetween,
  DEFAULT_3D_WORKING_CALENDAR,
} from "@/app/lib/business/kpi-3d-deadline";

// Giờ Việt Nam (+07:00) — mọi mốc trong file này viết tường minh để không phụ thuộc TZ máy chạy.
const vn = (s: string) => new Date(`${s}+07:00`);

const span = (pausedAt: string, resumedAt: string | null): PauseSpan => ({
  pausedAt: vn(pausedAt),
  resumedAt: resumedAt ? vn(resumedAt) : null,
});

describe("openPause / isPaused", () => {
  it("khoảng chưa mở lại là khoảng đang dừng", () => {
    const pauses = [span("2026-08-03T09:00", "2026-08-04T09:00"), span("2026-08-05T09:00", null)];
    expect(isPaused(pauses)).toBe(true);
    expect(openPause(pauses)?.pausedAt).toEqual(vn("2026-08-05T09:00"));
  });

  it("đã mở lại hết thì không còn dừng", () => {
    expect(isPaused([span("2026-08-03T09:00", "2026-08-04T09:00")])).toBe(false);
    expect(openPause([])).toBeNull();
  });

  it("nhiều khoảng mở (dữ liệu hỏng) → lấy khoảng MỚI NHẤT", () => {
    // API chặn dừng-khi-đang-dừng, nhưng hàm tính KPI không nên tin điều đó.
    const pauses = [span("2026-08-01T09:00", null), span("2026-08-06T09:00", null)];
    expect(openPause(pauses)?.pausedAt).toEqual(vn("2026-08-06T09:00"));
  });
});

describe("pausedWorkingMinutes — đo bằng PHÚT LÀM VIỆC, không phải wall-clock", () => {
  // Đây là cái bẫy trung tâm của cả mảng KPI 3D. Deadline tính bằng phút làm việc theo lịch ca;
  // trừ thời gian dừng bằng giờ đồng hồ thì hai con số không bao giờ khớp.
  it("dừng trọn một ngày làm việc = số phút của ngày đó, KHÔNG phải 1440", () => {
    const got = pausedWorkingMinutes(
      [span("2026-08-03T00:00", "2026-08-04T00:00")],
      vn("2026-08-03T00:00"),
      vn("2026-08-10T00:00"),
    );
    const oneWorkingDay = countWorkingMinutesBetween(vn("2026-08-03T00:00"), vn("2026-08-04T00:00"));
    expect(got).toBe(oneWorkingDay);
    expect(got).toBeLessThan(1440);
  });

  it("dừng trọn ngoài giờ làm → trừ 0 phút", () => {
    // Gác lúc 22h và mở lại lúc 5h sáng: đồng hồ vốn không chạy khoảng đó, nên không có gì để trừ.
    const got = pausedWorkingMinutes(
      [span("2026-08-03T22:00", "2026-08-04T05:00")],
      vn("2026-08-01T00:00"),
      vn("2026-08-10T00:00"),
    );
    expect(got).toBe(0);
  });

  it("dừng qua cuối tuần chỉ ăn phần ngày làm việc", () => {
    // 2026-08-08 là thứ Bảy, 09 là Chủ nhật. Dừng từ trưa T7 tới sáng T2 là ~42 giờ đồng hồ.
    const got = pausedWorkingMinutes(
      [span("2026-08-08T12:00", "2026-08-10T08:00")],
      vn("2026-08-01T00:00"),
      vn("2026-08-15T00:00"),
    );
    expect(got).toBeLessThan(42 * 60);
  });
});

describe("Cắt khoảng dừng vào trong [from, until]", () => {
  it("khoảng dừng bắt đầu TRƯỚC mốc nhận việc chỉ tính từ mốc nhận việc", () => {
    // Không cắt thì sẽ trừ cả thời gian nhân viên chưa hề bắt đầu → net ra số âm.
    const pauses = [span("2026-08-01T08:00", "2026-08-05T17:00")];
    const from = vn("2026-08-03T08:00");
    const until = vn("2026-08-07T17:00");
    expect(pausedWorkingMinutes(pauses, from, until))
      .toBe(countWorkingMinutesBetween(from, vn("2026-08-05T17:00")));
  });

  it("khoảng dừng CÒN MỞ được chốt tại `until`, không kéo vô hạn", () => {
    const pauses = [span("2026-08-03T08:00", null)];
    const from = vn("2026-08-03T08:00");
    const until = vn("2026-08-05T08:00");
    expect(pausedWorkingMinutes(pauses, from, until))
      .toBe(countWorkingMinutesBetween(from, until));
  });

  it("khoảng dừng nằm hoàn toàn ngoài phạm vi → 0", () => {
    const pauses = [span("2026-09-01T08:00", "2026-09-02T08:00")];
    expect(pausedWorkingMinutes(pauses, vn("2026-08-01T08:00"), vn("2026-08-10T08:00"))).toBe(0);
  });
});

describe("Khoảng dừng chồng nhau chỉ được trừ MỘT lần", () => {
  it("hai khoảng trùng nhau không bị trừ hai lần", () => {
    const a = span("2026-08-03T08:00", "2026-08-05T17:00");
    const b = span("2026-08-04T08:00", "2026-08-05T17:00"); // nằm trong a
    const from = vn("2026-08-03T08:00");
    const until = vn("2026-08-07T17:00");
    expect(pausedWorkingMinutes([a, b], from, until))
      .toBe(pausedWorkingMinutes([a], from, until));
  });

  it("hai khoảng RỜI nhau thì cộng cả hai", () => {
    const a = span("2026-08-03T08:00", "2026-08-03T17:00");
    const b = span("2026-08-06T08:00", "2026-08-06T17:00");
    const from = vn("2026-08-03T00:00");
    const until = vn("2026-08-07T17:00");
    const both = pausedWorkingMinutes([a, b], from, until);
    expect(both).toBe(
      pausedWorkingMinutes([a], from, until) + pausedWorkingMinutes([b], from, until),
    );
    expect(both).toBeGreaterThan(0);
  });
});

describe("netWorkingMinutes", () => {
  it("không có khoảng dừng → bằng đúng tổng quãng", () => {
    const from = vn("2026-08-03T08:00");
    const to = vn("2026-08-05T17:00");
    expect(netWorkingMinutes(from, to, [])).toBe(countWorkingMinutesBetween(from, to));
  });

  it("trừ đúng phần bị dừng", () => {
    const from = vn("2026-08-03T08:00");
    const to = vn("2026-08-07T17:00");
    const pauses = [span("2026-08-04T08:00", "2026-08-05T17:00")];
    expect(netWorkingMinutes(from, to, pauses))
      .toBe(countWorkingMinutesBetween(from, to) - pausedWorkingMinutes(pauses, from, to));
  });

  it("BẤT BIẾN: phần bị dừng không bao giờ vượt tổng quãng → net không bao giờ âm", () => {
    // Đây mới là thứ thật sự bảo vệ cột "Giờ thực tế" khỏi số âm — chứ không phải Math.max(0).
    // Bước cắt vào [from, to] trong pausedWorkingMinutes mới là chốt thật; mutation test cho
    // thấy bỏ Math.max(0) không làm đổ test nào, nên đừng nhầm nó là lớp bảo vệ.
    const cases: Array<[string, string, PauseSpan[]]> = [
      ["2026-08-03T08:00", "2026-08-04T08:00", [span("2026-07-01T00:00", "2026-09-01T00:00")]],
      ["2026-08-03T08:00", "2026-08-07T17:00", [span("2026-08-01T00:00", "2026-08-05T00:00")]],
      ["2026-08-03T08:00", "2026-08-07T17:00", [span("2026-08-06T00:00", null)]],
      ["2026-08-03T08:00", "2026-08-07T17:00", [
        span("2026-08-03T00:00", "2026-08-06T00:00"),
        span("2026-08-04T00:00", "2026-08-09T00:00"),
      ]],
    ];
    for (const [f, t, pauses] of cases) {
      const from = vn(f); const to = vn(t);
      const gross = countWorkingMinutesBetween(from, to);
      expect(pausedWorkingMinutes(pauses, from, to)).toBeLessThanOrEqual(gross);
      expect(netWorkingMinutes(from, to, pauses)).toBeGreaterThanOrEqual(0);
    }
  });

  it("dừng gần trọn quãng → 0, và 0 là ĐO ĐƯỢC chứ không phải không đo được", () => {
    // 0 khác null. Nhầm hai thứ này từng là gốc của một bug sống sót qua ba lần sửa.
    const from = vn("2026-08-03T08:00");
    const to = vn("2026-08-03T17:00");
    expect(netWorkingMinutes(from, to, [span("2026-08-03T08:00", "2026-08-03T17:00")])).toBe(0);
  });
});

describe("addWorkingMinutes — nhảy qua ngày nghỉ và giờ ngoài ca", () => {
  it("là hàm NGƯỢC của countWorkingMinutesBetween", () => {
    // Hai hàm phải khớp nhau, nếu không deadline dời sẽ lệch so với deadline gốc.
    const start = vn("2026-08-03T08:00");
    for (const minutes of [30, 120, 470, 940, 2000]) {
      const end = addWorkingMinutes(start, minutes);
      expect(countWorkingMinutesBetween(start, end)).toBe(minutes);
    }
  });

  it("cộng 0 hoặc số âm thì giữ nguyên mốc", () => {
    const start = vn("2026-08-03T08:00");
    expect(addWorkingMinutes(start, 0)).toEqual(start);
    expect(addWorkingMinutes(start, -60)).toEqual(start);
  });

  it("nhảy qua Chủ nhật thay vì đáp xuống ngày nghỉ", () => {
    // Lịch mặc định CHỈ nghỉ Chủ nhật — thứ Bảy vẫn làm. Bắt đầu trưa thứ Bảy 08/08 và cộng
    // trọn một ngày làm việc thì phần dư buộc phải rơi sang thứ Hai 10/08, nhảy qua Chủ nhật.
    const perDay = countWorkingMinutesBetween(vn("2026-08-03T00:00"), vn("2026-08-04T00:00"));
    const end = addWorkingMinutes(vn("2026-08-08T12:00"), perDay);

    expect(end.getTime()).toBeGreaterThan(vn("2026-08-10T00:00").getTime());
    // Và tổng vẫn đúng bằng số phút yêu cầu — Chủ nhật không được cộng thêm phút nào.
    expect(countWorkingMinutesBetween(vn("2026-08-08T12:00"), end)).toBe(perDay);
  });
});

describe("shiftDeadlineByPauses", () => {
  it("không có khoảng dừng → deadline giữ nguyên", () => {
    const dl = vn("2026-08-06T17:00");
    expect(shiftDeadlineByPauses(dl, [], vn("2026-08-03T08:00"), vn("2026-08-05T08:00")))
      .toEqual(dl);
  });

  it("dời đúng bằng số PHÚT LÀM VIỆC đã dừng, không phải mili-giây trôi qua", () => {
    // Cộng thẳng mili-giây sẽ đẩy deadline vào Chủ nhật hoặc giữa đêm.
    const dl = vn("2026-08-06T17:00");
    const from = vn("2026-08-03T08:00");
    const until = vn("2026-08-07T17:00");
    const pauses = [span("2026-08-04T08:00", "2026-08-05T17:00")];
    const paused = pausedWorkingMinutes(pauses, from, until);
    const shifted = shiftDeadlineByPauses(dl, pauses, from, until);
    expect(countWorkingMinutesBetween(dl, shifted)).toBe(paused);
    // và KHÁC hẳn cách cộng wall-clock
    const wallClock = new Date(dl.getTime() + (vn("2026-08-05T17:00").getTime() - vn("2026-08-04T08:00").getTime()));
    expect(shifted.getTime()).not.toBe(wallClock.getTime());
  });

  it("dừng trọn ngoài giờ làm → deadline KHÔNG dời", () => {
    const dl = vn("2026-08-06T17:00");
    const shifted = shiftDeadlineByPauses(
      dl,
      [span("2026-08-04T22:00", "2026-08-05T05:00")],
      vn("2026-08-03T08:00"),
      vn("2026-08-07T17:00"),
    );
    expect(shifted).toEqual(dl);
  });
});

describe("Lịch làm việc tuỳ biến vẫn được tôn trọng", () => {
  it("dùng lịch truyền vào chứ không phải lịch mặc định", () => {
    // 2026-08-04 là thứ Ba. Lịch này nghỉ luôn thứ Ba → dừng hôm đó là 0 phút làm việc.
    const tueOff = { ...DEFAULT_3D_WORKING_CALENDAR, weeklyDaysOff: [0, 2] };
    const pauses = [span("2026-08-04T08:00", "2026-08-04T12:00")];
    const from = vn("2026-08-01T00:00");
    const until = vn("2026-08-10T00:00");

    expect(pausedWorkingMinutes(pauses, from, until, tueOff)).toBe(0);
    // Cùng dữ liệu, lịch mặc định (thứ Ba có làm) thì phải ra khác 0 — chứng minh tham số
    // calendar thật sự được dùng chứ không bị bỏ qua.
    expect(pausedWorkingMinutes(pauses, from, until)).toBeGreaterThan(0);
  });

  it("ngày lễ cũng không tính là thời gian dừng", () => {
    const withHoliday = { ...DEFAULT_3D_WORKING_CALENDAR, holidays: ["2026-08-04"] };
    const pauses = [span("2026-08-04T08:00", "2026-08-04T12:00")];
    expect(pausedWorkingMinutes(pauses, vn("2026-08-01T00:00"), vn("2026-08-10T00:00"), withHoliday))
      .toBe(0);
  });
});

// ─── Mốc dừng / mở lại do người dùng chọn ─────────────────────────────────────
//
// `pausedAt` quyết định giờ công chốt vào KPI THÁNG NÀO (hours-ledger.ts). Quản lý quên gác đơn
// ngày 31/8 rồi bấm ngày 02/9 thì 20 giờ của tháng 8 chạy sang tháng 9 — nên mốc phải sửa được.
// Nhưng sửa tự do thì nó thành thứ bịa được, nên có luật.

describe("Mốc tạm dừng", () => {
  const now = new Date("2026-09-02T03:00:00Z");
  const assignedAt = new Date("2026-08-10T02:00:00Z");
  const base = { assignedAt, acknowledgedAt: null, now, pauses: [] as PauseSpan[] };

  it("lùi về cuối tháng trước → HỢP LỆ, đây là ca chính cần cho sửa", () => {
    expect(deniedReasonForPauseAt({ ...base, pausedAt: new Date("2026-08-31T10:00:00Z") })).toBeNull();
  });

  it("ở tương lai → chặn", () => {
    expect(deniedReasonForPauseAt({ ...base, pausedAt: new Date("2026-09-05T03:00:00Z") })).not.toBeNull();
  });

  // Nới 2 phút cho lệch đồng hồ máy: chặn tới từng giây thì người bấm đúng lúc cũng bị từ chối.
  it("lệch một phút so với đồng hồ máy → vẫn cho qua", () => {
    expect(deniedReasonForPauseAt({ ...base, pausedAt: new Date("2026-09-02T03:01:00Z") })).toBeNull();
  });

  it("sớm hơn lúc bắt đầu việc → chặn, vì số giờ đã làm sẽ ra âm", () => {
    expect(deniedReasonForPauseAt({ ...base, pausedAt: new Date("2026-08-01T02:00:00Z") })).not.toBeNull();
  });

  it("mốc bắt đầu lấy theo lúc NHẬN VIỆC nếu có, không phải lúc giao", () => {
    const acknowledgedAt = new Date("2026-08-20T02:00:00Z");
    // Giữa lúc giao và lúc nhận việc → chặn.
    expect(deniedReasonForPauseAt({
      ...base, acknowledgedAt, pausedAt: new Date("2026-08-15T02:00:00Z"),
    })).not.toBeNull();
  });

  // Chồng nhau thì hours-ledger đọc ra hai lần chốt ngược thứ tự và phần chênh bị bỏ.
  it("lùi trước lần mở lại gần nhất → chặn", () => {
    const pauses: PauseSpan[] = [{
      pausedAt: new Date("2026-08-12T02:00:00Z"),
      resumedAt: new Date("2026-08-25T02:00:00Z"),
    }];
    expect(deniedReasonForPauseAt({ ...base, pauses, pausedAt: new Date("2026-08-20T02:00:00Z") })).not.toBeNull();
    expect(deniedReasonForPauseAt({ ...base, pauses, pausedAt: new Date("2026-08-28T02:00:00Z") })).toBeNull();
  });

  it("mốc rác → chặn", () => {
    expect(deniedReasonForPauseAt({ ...base, pausedAt: new Date("khong-phai-ngay") })).not.toBeNull();
  });
});

describe("Mốc mở lại", () => {
  const now = new Date("2026-09-10T03:00:00Z");
  const pausedAt = new Date("2026-08-31T10:00:00Z");

  it("sang tháng sau → HỢP LỆ, đây là ca cần tính KPI cho tháng mới", () => {
    expect(deniedReasonForResumeAt({ resumedAt: new Date("2026-09-01T02:00:00Z"), pausedAt, now })).toBeNull();
  });

  it("ở tương lai → chặn, deadline sẽ bị dời theo một khoảng chưa xảy ra", () => {
    expect(deniedReasonForResumeAt({ resumedAt: new Date("2026-09-20T02:00:00Z"), pausedAt, now })).not.toBeNull();
  });

  it("trước mốc dừng → chặn", () => {
    expect(deniedReasonForResumeAt({ resumedAt: new Date("2026-08-30T02:00:00Z"), pausedAt, now })).not.toBeNull();
  });

  // Khoảng dừng dài 0 phút không dời deadline, không trừ giờ — chỉ là một dòng lịch sử rỗng nghĩa.
  it("TRÙNG mốc dừng → chặn", () => {
    expect(deniedReasonForResumeAt({ resumedAt: pausedAt, pausedAt, now })).not.toBeNull();
  });
});

// ─── NỘP KẾT QUẢ CÙNG LÚC ADMIN GÁC ĐƠN ──────────────────────────────────────
//
// Ca có thật vì hệ thống CỐ Ý cho NV 3D nộp kết quả khi đang bị gác (tạm dừng chỉ dừng đồng hồ,
// không khoá việc). Route progress tự đóng các khoảng dừng đang mở TẠI mốc hoàn tất — nhưng một
// khoảng được tạo SAU đó thì không còn ai đóng: nó nằm mở vĩnh viễn trên một việc đã xong, và mọi
// màn hình đọc theo `resumedAt === null` sẽ hiện "Tạm dừng" cho một MO đã hoàn thành.
describe("deniedReasonForPause — việc đã nộp kết quả", () => {
  const base = {
    status: "SENT_RESULT",
    reviewStatus: "PENDING_REVIEW" as string | null,
    completedAt: null as Date | null,
    pauses: [] as Array<{ pausedAt: Date; resumedAt: Date | null }>,
  };

  it("đã có completedAt → CHẶN", () => {
    const reason = deniedReasonForPause("ADMIN", {
      ...base,
      completedAt: new Date("2026-08-10T03:00:00.000Z"),
    });
    expect(reason).not.toBeNull();
    expect(reason).toContain("đã gửi kết quả");
  });

  // ⚠️ KHÔNG suy được từ `status`: lượt đã hoàn tất mang SENT_RESULT — CÙNG giá trị với lượt vừa
  // nộp và đang chờ kiểm. Nên nếu chỉ xét status thì hoặc chặn oan, hoặc không chặn được.
  it("cùng status SENT_RESULT mà CHƯA có completedAt → vẫn gác được", () => {
    expect(deniedReasonForPause("ADMIN", base)).toBeNull();
  });
});

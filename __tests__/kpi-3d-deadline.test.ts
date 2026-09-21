import { describe, expect, it } from "vitest";
import {
  DEFAULT_3D_WORKING_CALENDAR,
  calculate3DKpiDeadline,
  countWorkingMinutesBetween,
  evaluate3DKpiCompletion,
  type WorkingCalendar,
} from "@/app/lib/business/kpi-3d-deadline";
import { formatKpiDelta } from "@/app/lib/business/kpi-3d/progress";

// Ngày giờ trong test LUÔN ghi rõ là giờ Việt Nam.
//
// Bản trước dùng `new Date(y, m, d, h, min)` (giờ máy) cho cả đầu vào lẫn kỳ vọng, nên test
// pass ở mọi múi giờ mà KHÔNG hề kiểm chứng yêu cầu thật: "khung giờ làm việc là giờ VN".
// Đó là lý do lỗi lệch 7 tiếng trên Vercel lọt qua được. Nay vitest chạy ở TZ=UTC (giống
// Vercel) và test neo cứng giờ VN — sai múi giờ là đỏ ngay.
function vn(year: number, month: number, day: number, hour: number, minute: number) {
  const p = (n: number) => String(n).padStart(2, "0");
  return new Date(`${year}-${p(month)}-${p(day)}T${p(hour)}:${p(minute)}:00+07:00`);
}

function expectVnParts(date: Date, parts: [number, number, number, number, number]) {
  const w = new Date(date.getTime() + 7 * 60 * 60 * 1000); // đọc theo giờ tường VN
  expect([
    w.getUTCFullYear(),
    w.getUTCMonth() + 1,
    w.getUTCDate(),
    w.getUTCHours(),
    w.getUTCMinutes(),
  ]).toEqual(parts);
}

describe("neo múi giờ", () => {
  it("khung giờ làm việc tính theo giờ VN, KHÔNG theo giờ máy chủ", () => {
    // 09:00 VN thứ Hai = 02:00 UTC. Nếu thuật toán chạy theo giờ máy chủ (UTC) thì 02:00 nằm
    // ngoài mọi ca làm việc và deadline sẽ bị đẩy sang 08:00 UTC (15:00 VN) — sai.
    const deadline = calculate3DKpiDeadline(vn(2026, 8, 3, 9, 0), 60, DEFAULT_3D_WORKING_CALENDAR);
    expectVnParts(deadline, [2026, 8, 3, 10, 0]);
  });
});

describe("calculate3DKpiDeadline", () => {
  it("matches the requested Saturday example and skips Sunday", () => {
    const deadline = calculate3DKpiDeadline(
      vn(2026, 8, 1, 16, 30),
      4 * 60,
      DEFAULT_3D_WORKING_CALENDAR,
    );

    expectVnParts(deadline, [2026, 8, 3, 11, 30]);
  });

  it("does not count lunch break", () => {
    const deadline = calculate3DKpiDeadline(
      vn(2026, 8, 3, 11, 30),
      60,
      DEFAULT_3D_WORKING_CALENDAR,
    );

    expectVnParts(deadline, [2026, 8, 3, 13, 30]);
  });

  it("does not count the 15:00-15:10 break", () => {
    const deadline = calculate3DKpiDeadline(
      vn(2026, 8, 3, 14, 50),
      30,
      DEFAULT_3D_WORKING_CALENDAR,
    );

    expectVnParts(deadline, [2026, 8, 3, 15, 30]);
  });

  it("moves assignments outside working hours to the next valid session", () => {
    const deadline = calculate3DKpiDeadline(
      vn(2026, 8, 3, 18, 45),
      30,
      DEFAULT_3D_WORKING_CALENDAR,
    );

    expectVnParts(deadline, [2026, 8, 4, 8, 30]);
  });

  it("skips configured company holidays", () => {
    const calendar: WorkingCalendar = {
      ...DEFAULT_3D_WORKING_CALENDAR,
      holidays: ["2026-08-03"],
    };

    const deadline = calculate3DKpiDeadline(
      vn(2026, 8, 1, 16, 30),
      4 * 60,
      calendar,
    );

    expectVnParts(deadline, [2026, 8, 4, 11, 30]);
  });

  it("uses sessions configured for the assignment day", () => {
    const calendar: WorkingCalendar = {
      weeklyDaysOff: [0],
      holidays: [],
      sessions: [
        { dayOfWeek: 1, start: "09:00", end: "10:00" },
        { dayOfWeek: 2, start: "08:00", end: "12:00" },
      ],
    };

    const deadline = calculate3DKpiDeadline(vn(2026, 8, 3, 9, 30), 90, calendar);

    expectVnParts(deadline, [2026, 8, 4, 9, 0]);
  });
});

describe("evaluate3DKpiCompletion", () => {
  it("marks completion before deadline as on time and reports early minutes", () => {
    const result = evaluate3DKpiCompletion(
      vn(2026, 8, 3, 11, 30),
      vn(2026, 8, 3, 10, 45),
    );

    expect(result).toEqual({
      status: "ON_TIME",
      deltaMinutes: -45,
      earlyMinutes: 45,
      lateMinutes: 0,
    });
  });

  it("nộp sau deadline là trễ, và số phút KHÔNG tính giờ nghỉ trưa", () => {
    // Deadline 11:30, nộp 12:05. Giờ tường là 35 phút — nhưng 12:00→12:05 là giờ nghỉ trưa
    // (ca sáng kết ở 12:00, ca chiều mở lúc 13:00), nên chỉ có 30 phút LÀM VIỆC ở giữa.
    //
    // Bản trước của test này kỳ vọng 35, và nó xanh — vì cả hàm lẫn test đều trừ giờ tường.
    // Hai bản cùng sai một cách nhất quán thì test không bắt được gì.
    const result = evaluate3DKpiCompletion(
      vn(2026, 8, 3, 11, 30),
      vn(2026, 8, 3, 12, 5),
    );

    expect(result).toEqual({
      status: "LATE",
      deltaMinutes: 30,
      earlyMinutes: 0,
      lateMinutes: 30,
    });
  });
});

// ─── Lỗi trộn hai đơn vị — lượt thật đã phát hiện ra nó ──────────────────────
//
// 🔴 Deadline được sinh ra bằng cách BƯỚC QUA LỊCH LÀM VIỆC. Trừ thẳng hai mốc thời gian là đem
// một số đo bằng giờ tường so với một mốc đo bằng giờ làm việc — hai đơn vị khác nhau.
//
// Lượt 26.37669_1 làm lỗi này lộ ra: giao 15:10 20/08, KPI 4 giờ, nộp 16:03 cùng ngày. Màn hình
// hiện "Sớm 18 giờ 6 phút" cho một việc 4 giờ — phần lớn 18 giờ đó là buổi đêm.
describe("Sớm / Trễ đo bằng GIỜ LÀM VIỆC — lượt thật 26.37669_1", () => {
  const assignedAt = vn(2026, 8, 20, 15, 10);
  const KPI_MINUTES = 240;

  it("deadline vẫn đúng: 15:10 + 4 giờ làm việc → 10:10 hôm sau", () => {
    // Chốt lại mốc này trước, vì mọi con số bên dưới đo từ nó. 15:10→17:00 = 110 phút, còn 130
    // phút → 08:00→10:10 sáng hôm sau.
    expectVnParts(calculate3DKpiDeadline(assignedAt, KPI_MINUTES), [2026, 8, 21, 10, 10]);
  });

  it("🔴 nộp 16:03 cùng ngày → sớm 3 giờ 7 phút, KHÔNG phải 18 giờ 6 phút", () => {
    const deadline = calculate3DKpiDeadline(assignedAt, KPI_MINUTES);
    const result = evaluate3DKpiCompletion(deadline, vn(2026, 8, 20, 16, 3));

    // 57 phút còn lại của chiều 20/08 (16:03→17:00) + 130 phút sáng 21/08 (08:00→10:10) = 187.
    expect(result.earlyMinutes).toBe(187);
    expect(result.status).toBe("ON_TIME");

    // Con số cũ, để đọc test là thấy ngay khoảng lệch.
    const wallClockMinutes = Math.round(
      (deadline.getTime() - vn(2026, 8, 20, 16, 3).getTime()) / 60_000,
    );
    expect(wallClockMinutes).toBe(1087); // 18 giờ 7 phút
  });

  it("🎯 bằng ĐÚNG 'KPI trừ giờ thực làm' — hai định nghĩa, một con số", () => {
    // Không phải trùng hợp: vì deadline = giao + KPI (giờ làm việc), nên "giờ làm việc còn lại
    // tới deadline" và "KPI trừ giờ đã dùng" LÀ CÙNG MỘT ĐẠI LƯỢNG.
    //
    // Đây là bất biến đáng chốt nhất của cả đợt sửa: nó chứng minh công thức người dùng đề xuất
    // và cách sửa lỗi đơn vị dẫn tới cùng một kết quả — nên hàm này tự động neo vào MỐC GIAO,
    // không cần thêm tham số nào.
    const completedAt = vn(2026, 8, 20, 16, 3);
    const deadline = calculate3DKpiDeadline(assignedAt, KPI_MINUTES);

    const workedMinutes = countWorkingMinutesBetween(assignedAt, completedAt);
    expect(workedMinutes).toBe(53);
    expect(evaluate3DKpiCompletion(deadline, completedAt).earlyMinutes).toBe(KPI_MINUTES - workedMinutes);
  });
});

describe("⚠️ trễ nhưng KHÔNG có phút làm việc nào ở giữa", () => {
  it("nộp 18:00 khi deadline là 17:00 vẫn là TRỄ, với 0 phút", () => {
    // Ca mới do việc đổi đơn vị sinh ra: giữa 17:00 và 18:00 không có phút làm việc nào (ca
    // chiều kết ở 17:00), nên độ lớn là 0 — nhưng nộp muộn thì vẫn là muộn.
    //
    // `status` CỐ Ý so bằng mốc thời gian thật, không bằng số phút làm việc. Suy status từ số
    // phút là biến lượt này thành "đúng hạn", và đây là con số dùng để chấm điểm người.
    const result = evaluate3DKpiCompletion(vn(2026, 8, 20, 17, 0), vn(2026, 8, 20, 18, 0));
    expect(result.status).toBe("LATE");
    expect(result.lateMinutes).toBe(0);
    expect(result.earlyMinutes).toBe(0);
  });

  it("nộp đúng khoảnh khắc deadline là ĐÚNG HẠN", () => {
    const at = vn(2026, 8, 20, 15, 0);
    expect(evaluate3DKpiCompletion(at, at)).toEqual({
      status: "ON_TIME",
      deltaMinutes: 0,
      earlyMinutes: 0,
      lateMinutes: 0,
    });
  });
});

describe("formatKpiDelta phải nói đúng ca 0 phút", () => {
  it("trễ với 0 phút KHÔNG được gọi là đúng hạn", () => {
    // Bản trước gặp `abs === 0` là trả "Đúng hạn (vừa kịp)" BẤT KỂ status — tức là gọi một lượt
    // TRỄ thành đúng hạn. Nói sai theo chiều có lợi cũng là nói sai.
    expect(formatKpiDelta("LATE", 0)).toContain("Trễ");
    expect(formatKpiDelta("ON_TIME", 0)).toContain("Đúng hạn");
  });

  it("vẫn định dạng giờ/phút như cũ", () => {
    expect(formatKpiDelta("ON_TIME", -187)).toBe("Sớm 3 giờ 7 phút");
    expect(formatKpiDelta("LATE", 45)).toBe("Trễ 45 phút");
  });
});

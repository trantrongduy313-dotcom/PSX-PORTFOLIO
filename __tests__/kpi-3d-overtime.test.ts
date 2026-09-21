import { describe, expect, it } from "vitest";

import { DEFAULT_3D_WORKING_CALENDAR } from "@/app/lib/business/kpi-3d-deadline";
import {
  deniedReasonForOvertimeCreate,
  deniedReasonForOvertimeDecision,
  formatMinutes,
  invalidRangeReason,
  isOvertimeApprover,
  MAX_OVERTIME_MINUTES,
  minutesInsideWorkingHours,
  overtimeCreateSchema,
  overtimeMinutes,
  pendingOvertimeScope,
  statusAfterDecision,
  type OvertimeSnapshot,
} from "@/app/lib/business/kpi-3d/overtime";

// Ngày giờ trong test LUÔN ghi rõ là giờ Việt Nam (vitest chạy ở TZ=UTC giống Vercel).
function vn(iso: string) {
  return new Date(`${iso}+07:00`);
}

function request(overrides: Partial<OvertimeSnapshot> = {}): OvertimeSnapshot {
  return {
    id: "ot-1",
    designer3DId: "designer-1",
    requestedById: "user-designer",
    status: "PENDING",
    ...overrides,
  };
}

describe("Khai báo tăng ca — kiểm tra khoảng thời gian", () => {
  it("tính số phút từ mốc bắt đầu/kết thúc", () => {
    const start = vn("2026-08-03T18:00:00");
    const end = vn("2026-08-03T20:30:00");
    expect(overtimeMinutes(start, end)).toBe(150);
  });

  it("chặn giờ kết thúc trước giờ bắt đầu", () => {
    const reason = invalidRangeReason(vn("2026-08-03T20:00:00"), vn("2026-08-03T18:00:00"));
    expect(reason).toBe("Giờ kết thúc phải sau giờ bắt đầu.");
  });

  it("chặn khai báo dài phi lý (gõ nhầm ngày/năm)", () => {
    const reason = invalidRangeReason(vn("2026-08-03T18:00:00"), vn("2026-08-05T18:00:00"));
    expect(reason).toContain(`${MAX_OVERTIME_MINUTES / 60} giờ`);
  });

  it("schema từ chối endAt <= startAt ngay từ tầng nhập liệu", () => {
    const bad = overtimeCreateSchema.safeParse({
      assignmentId: "asg-1",
      startAt: "2026-08-03T20:00:00+07:00",
      endAt: "2026-08-03T20:00:00+07:00",
    });
    expect(bad.success).toBe(false);

    const good = overtimeCreateSchema.safeParse({
      assignmentId: "asg-1",
      startAt: "2026-08-03T18:00:00+07:00",
      endAt: "2026-08-03T20:00:00+07:00",
      reason: "Gấp đơn khách",
    });
    expect(good.success).toBe(true);
  });
});

describe("Đối chiếu với giờ hành chính (chỉ cảnh báo, không chặn)", () => {
  it("làm buổi tối sau 17h → không đè giờ hành chính", () => {
    const overlap = minutesInsideWorkingHours(
      vn("2026-08-03T18:00:00"), // thứ Hai
      vn("2026-08-03T21:00:00"),
      DEFAULT_3D_WORKING_CALENDAR,
    );
    expect(overlap).toBe(0);
  });

  it("làm Chủ nhật → không đè giờ hành chính (Chủ nhật là ngày nghỉ)", () => {
    const overlap = minutesInsideWorkingHours(
      vn("2026-08-02T09:00:00"), // Chủ nhật
      vn("2026-08-02T12:00:00"),
      DEFAULT_3D_WORKING_CALENDAR,
    );
    expect(overlap).toBe(0);
  });

  it("khai nhầm vào giờ hành chính → phát hiện được số phút bị đè", () => {
    const overlap = minutesInsideWorkingHours(
      vn("2026-08-03T10:00:00"), // thứ Hai, trong ca sáng 08:00-12:00
      vn("2026-08-03T11:00:00"),
      DEFAULT_3D_WORKING_CALENDAR,
    );
    expect(overlap).toBe(60);
  });

  it("khoảng vắt qua cuối giờ chiều chỉ tính phần nằm trong ca", () => {
    const overlap = minutesInsideWorkingHours(
      vn("2026-08-03T16:30:00"), // ca 15:10-17:00 → đè 30 phút
      vn("2026-08-03T19:00:00"),
      DEFAULT_3D_WORKING_CALENDAR,
    );
    expect(overlap).toBe(30);
  });

  it("giờ nghỉ trưa 12:00-13:00 không tính là giờ hành chính", () => {
    const overlap = minutesInsideWorkingHours(
      vn("2026-08-03T12:00:00"),
      vn("2026-08-03T13:00:00"),
      DEFAULT_3D_WORKING_CALENDAR,
    );
    expect(overlap).toBe(0);
  });
});

describe("Phân quyền khai báo", () => {
  it("NV 3D khai cho đơn CỦA MÌNH → được", () => {
    const reason = deniedReasonForOvertimeCreate(
      { role: "DESIGN_3D", designer3DId: "designer-1", userId: "u1" },
      { designer3DId: "designer-1" },
    );
    expect(reason).toBeNull();
  });

  it("NV 3D khai cho đơn của NGƯỜI KHÁC → bị chặn", () => {
    const reason = deniedReasonForOvertimeCreate(
      { role: "DESIGN_3D", designer3DId: "designer-2", userId: "u2" },
      { designer3DId: "designer-1" },
    );
    expect(reason).toContain("do mình phụ trách");
  });

  it("role ngoài danh sách (SALES) → bị chặn", () => {
    const reason = deniedReasonForOvertimeCreate(
      { role: "SALES", designer3DId: null, userId: "u3" },
      { designer3DId: "designer-1" },
    );
    expect(reason).not.toBeNull();
  });
});

describe("Phê duyệt (Leader/Giám sát)", () => {
  it("chỉ ADMIN và PRODUCTION là người duyệt", () => {
    expect(isOvertimeApprover("ADMIN")).toBe(true);
    expect(isOvertimeApprover("PRODUCTION")).toBe(true);
    expect(isOvertimeApprover("ORDER")).toBe(false);
    expect(isOvertimeApprover("DESIGN_3D")).toBe(false);
  });

  it("NV 3D không tự duyệt được yêu cầu của mình", () => {
    const reason = deniedReasonForOvertimeDecision(
      { role: "DESIGN_3D", designer3DId: "designer-1", userId: "user-designer" },
      request(),
      "APPROVE",
    );
    expect(reason).toContain("Leader/Giám sát");
  });

  it("Leader không tự duyệt yêu cầu do CHÍNH MÌNH khai báo", () => {
    const reason = deniedReasonForOvertimeDecision(
      { role: "PRODUCTION", designer3DId: null, userId: "user-leader" },
      request({ requestedById: "user-leader" }),
      "APPROVE",
    );
    expect(reason).toBe("Không thể tự phê duyệt yêu cầu do chính mình khai báo.");
  });

  it("Leader duyệt yêu cầu của người khác → được", () => {
    const reason = deniedReasonForOvertimeDecision(
      { role: "PRODUCTION", designer3DId: null, userId: "user-leader" },
      request(),
      "APPROVE",
    );
    expect(reason).toBeNull();
  });

  it("yêu cầu đã chốt thì không đổi được nữa (tránh sửa số liệu đã tính lương)", () => {
    for (const status of ["APPROVED", "REJECTED", "CANCELLED"] as const) {
      const reason = deniedReasonForOvertimeDecision(
        { role: "ADMIN", designer3DId: null, userId: "admin" },
        request({ status }),
        "APPROVE",
      );
      expect(reason).toContain("không thể thay đổi");
    }
  });

  it("người khai tự hủy yêu cầu đang chờ → được", () => {
    const reason = deniedReasonForOvertimeDecision(
      { role: "DESIGN_3D", designer3DId: "designer-1", userId: "user-designer" },
      request(),
      "CANCEL",
    );
    expect(reason).toBeNull();
  });

  it("người khác không hủy hộ được", () => {
    const reason = deniedReasonForOvertimeDecision(
      { role: "DESIGN_3D", designer3DId: "designer-2", userId: "u2" },
      request(),
      "CANCEL",
    );
    expect(reason).toContain("Chỉ người khai báo");
  });

  it("ánh xạ hành động sang trạng thái", () => {
    expect(statusAfterDecision("APPROVE")).toBe("APPROVED");
    expect(statusAfterDecision("REJECT")).toBe("REJECTED");
    expect(statusAfterDecision("CANCEL")).toBe("CANCELLED");
  });
});

describe("Hiển thị", () => {
  it("gộp giờ và phút", () => {
    expect(formatMinutes(150)).toBe("2 giờ 30 phút");
    expect(formatMinutes(120)).toBe("2 giờ");
    expect(formatMinutes(45)).toBe("45 phút");
    expect(formatMinutes(0)).toBe("0 phút");
  });
});

// ─── HUY HIỆU "TĂNG CA CHỜ DUYỆT" ────────────────────────────────────────────
//
// Khai báo tăng ca là luồng DUY NHẤT cần người duyệt mà không phát ra tín hiệu nào — quản lý phải
// tự nhớ mà bấm vào tab. Con số này là tín hiệu đó, nên nó phải đếm ĐÚNG thứ người xem hành động
// được; đếm sai một lần là người dùng học cách bỏ qua nó vĩnh viễn.
describe("pendingOvertimeScope", () => {
  it("người duyệt → thấy con số", () => {
    expect(pendingOvertimeScope({ role: "ADMIN", userId: "u1" })).toEqual({
      visible: true,
      excludeRequestedById: "u1",
    });
  });

  // ⚠️ TRỪ ĐI YÊU CẦU CỦA CHÍNH MÌNH — deniedReasonForOvertimeDecision cấm tự phê duyệt, nên nếu
  // đếm cả chúng thì huy hiệu hiện "1 việc cần bạn" mà mở ra không bấm được gì. Một huy hiệu
  // không thể xoá bằng cách làm việc thì tệ hơn không có huy hiệu.
  it("loại yêu cầu do chính người xem khai — vì họ không tự duyệt được", () => {
    const scope = pendingOvertimeScope({ role: "PRODUCTION", userId: "u9" });
    expect(scope).toEqual({ visible: true, excludeRequestedById: "u9" });
  });

  // ⚠️ ORDER ĐỌC ĐƯỢC màn 3D (READ_PROGRESS) nhưng KHÔNG duyệt được tăng ca (APPROVE_OVERTIME chỉ
  // ADMIN/PRODUCTION). Đúng vai dễ nhầm nhất: họ mở màn hình mỗi ngày, nên nếu huy hiệu hiện cho
  // họ thì đó là một con số họ nhìn hoài mà không bao giờ làm gì được.
  it("ORDER đọc được màn 3D nhưng KHÔNG duyệt tăng ca → không thấy huy hiệu", () => {
    expect(pendingOvertimeScope({ role: "ORDER", userId: "u4" })).toEqual({ visible: false });
  });

  it("NV 3D → KHÔNG thấy: họ không duyệt được nên đây là con số không hành động được", () => {
    expect(pendingOvertimeScope({ role: "DESIGN_3D", userId: "u2" })).toEqual({ visible: false });
  });

  it("vai lạ / chưa đăng nhập → không thấy", () => {
    expect(pendingOvertimeScope({ role: undefined, userId: null })).toEqual({ visible: false });
    expect(pendingOvertimeScope({ role: "SALES", userId: "u3" })).toEqual({ visible: false });
  });

  // Quyền duyệt phải đi từ MỘT nguồn (permissions.ts). Nếu hai hàm này lệch nhau thì có vai nhìn
  // thấy con số mà bấm vào lại bị từ chối.
  it("dùng chung một nguồn quyền với isOvertimeApprover", () => {
    for (const role of ["ADMIN", "ORDER", "DESIGN_3D", "SALES", "PRODUCTION", undefined]) {
      expect(pendingOvertimeScope({ role, userId: "u" }).visible).toBe(isOvertimeApprover(role));
    }
  });
});

// ─── MÚI GIỜ: CHUỖI KHÔNG CÓ OFFSET PHẢI BỊ TỪ CHỐI ──────────────────────────
//
// Đây là chốt chặn quan trọng nhất của cả luồng tăng ca, và trước bản này KHÔNG CÓ TEST NÀO giữ nó.
//
// Vercel chạy UTC. Nếu client gửi "2026-08-14T09:10" (chuỗi trần của <input type="datetime-local">)
// thì `new Date()` ở server hiểu là 09:10 UTC = 16:10 giờ VN — lệch 7 tiếng, trên một con số dùng
// TÍNH LƯƠNG, và không có gì đỏ để ai nhận ra.
//
// ⚠️ Ai đó đổi sang `z.coerce.date()` cho "tiện" là mất chốt này mà mọi test khác vẫn xanh. Nên
// phải có một test nói thẳng: KHÔNG offset thì KHÔNG nhận.
describe("overtimeCreateSchema — mốc thời gian bắt buộc mang múi giờ", () => {
  const ask = (startAt: string) =>
    overtimeCreateSchema.safeParse({
      assignmentId: "asg-1",
      startAt,
      endAt: "2026-08-14T23:10:00+07:00",
    }).success;

  it("có offset +07:00 → NHẬN", () => {
    expect(ask("2026-08-14T09:10:00+07:00")).toBe(true);
  });

  it("có hậu tố Z → NHẬN (mốc tuyệt đối, không nhập nhằng)", () => {
    expect(ask("2026-08-14T09:10:00Z")).toBe(true);
  });

  it("KHÔNG có múi giờ → TỪ CHỐI, kể cả khi trông giống ISO", () => {
    expect(ask("2026-08-14T09:10:00")).toBe(false);
    // Đúng dạng mà <input type="datetime-local"> trả về.
    expect(ask("2026-08-14T09:10")).toBe(false);
  });

  it("chuỗi rác → TỪ CHỐI", () => {
    expect(ask("14/08/2026 09:10")).toBe(false);
    expect(ask("")).toBe(false);
  });
});

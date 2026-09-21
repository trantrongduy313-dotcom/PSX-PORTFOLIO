import { describe, expect, it } from "vitest";

import {
  blockedReasonForProgress,
  canReadProgress,
  deniedReasonForProgressWrite,
  formatKpiDelta,
  progressEntryInputSchema,
  resolveAssignmentStateAfterProgress,
  type AssignmentSnapshot,
} from "@/app/lib/business/kpi-3d/progress";

// ⚠️ NEO CỨNG GIỜ VN (+07:00). Trước đây file này dùng `new Date("2026-08-03T11:30:00")` —
// KHÔNG có múi giờ, nên vitest (chạy TZ=UTC) đọc thành 18:30 giờ VN, tức ngoài mọi ca làm việc.
//
// Nó vẫn xanh, vì bản cũ của evaluate3DKpiCompletion chỉ trừ hai mốc thời gian và phép trừ đó
// không phụ thuộc múi giờ. Test xanh vì LÝ DO SAI. Ngay khi phép tính biết tới lịch làm việc thì
// mọi con số thành 0, và đó là lúc chỗ hở lộ ra. Cùng bài học đã ghi ở kpi-3d-deadline.test.ts.
const DEADLINE = new Date("2026-08-03T11:30:00+07:00");

function assignment(overrides: Partial<AssignmentSnapshot> = {}): AssignmentSnapshot {
  return {
    id: "asg-1",
    designer3DId: "designer-1",
    deadlineAt: DEADLINE,
    status: "ASSIGNED",
    completedAt: null,
    // Mặc định ĐÃ nhận việc: phần lớn test ở đây kiểm quy tắc KPI, không phải cửa vào.
    acknowledgedAt: new Date("2026-08-03T08:00:00+07:00"),
    assignedAt: new Date("2026-08-03T08:00:00+07:00"),
    ...overrides,
  };
}

describe("Ghi nhận hoàn tất & đánh giá KPI (yêu cầu #6, #7)", () => {
  it("chuyển 'Đã gửi kết quả' TRƯỚC deadline → đóng dấu giờ hoàn tất, kết quả Đúng hạn", () => {
    const now = new Date("2026-08-03T10:00:00+07:00"); // sớm 90 phút
    const patch = resolveAssignmentStateAfterProgress(assignment(), { status: "SENT_RESULT" }, now);

    expect(patch.status).toBe("SENT_RESULT");
    expect(patch.completedAt).toEqual(now);
    expect(patch.kpiStatus).toBe("ON_TIME");
    expect(patch.kpiDeltaMinutes).toBe(-90);
  });

  it("chuyển 'Đã gửi kết quả' SAU deadline → kết quả Trễ hạn kèm số phút trễ", () => {
    // Deadline 11:30, nộp 12:15 → giờ tường 45 phút, nhưng chỉ 30 phút LÀM VIỆC: ca sáng kết ở
    // 12:00, nên 12:00→12:15 là giờ nghỉ trưa. Xem evaluate3DKpiCompletion.
    const now = new Date("2026-08-03T12:15:00+07:00");
    const patch = resolveAssignmentStateAfterProgress(assignment(), { status: "SENT_RESULT" }, now);

    expect(patch.kpiStatus).toBe("LATE");
    expect(patch.kpiDeltaMinutes).toBe(30);
  });

  it("trạng thái chưa xong (Đang thiết kế) → KHÔNG đóng dấu giờ hoàn tất", () => {
    const patch = resolveAssignmentStateAfterProgress(
      assignment(),
      { status: "IN_PROGRESS" },
      new Date("2026-08-03T09:00:00+07:00"),
    );

    expect(patch.status).toBe("IN_PROGRESS");
    expect(patch.completedAt).toBeUndefined();
    expect(patch.kpiStatus).toBeUndefined();
  });

  it("gửi kết quả LẦN 2 → giữ nguyên mốc hoàn tất gốc, không dời kết quả KPI", () => {
    const already = new Date("2026-08-03T10:00:00+07:00");
    const patch = resolveAssignmentStateAfterProgress(
      assignment({ completedAt: already, status: "SENT_RESULT" }),
      { status: "SENT_RESULT" },
      new Date("2026-08-04T16:00:00+07:00"), // gửi lại hôm sau
    );

    expect(patch.completedAt).toBeUndefined(); // không ghi đè
    expect(patch.kpiStatus).toBeUndefined();
  });

  it("hoàn tất ĐÚNG phút deadline vẫn tính Đúng hạn", () => {
    const patch = resolveAssignmentStateAfterProgress(assignment(), { status: "SENT_RESULT" }, DEADLINE);
    expect(patch.kpiStatus).toBe("ON_TIME");
    expect(patch.kpiDeltaMinutes).toBe(0);
  });
});

describe("Đóng dấu GIỜ THỰC TẾ lúc hoàn tất", () => {
  // Mốc viết bằng giờ VN cho đọc được. Lịch mặc định: nghỉ Chủ nhật, ca 08:00–12:00,
  // 13:00–15:00, 15:10–17:00.
  const vn = (iso: string) => new Date(`${iso}+07:00`);

  const asg = (o: Partial<AssignmentSnapshot> = {}): AssignmentSnapshot => ({
    id: "asg-1",
    designer3DId: "designer-1",
    deadlineAt: vn("2026-08-10T16:00"),
    status: "IN_PROGRESS",
    completedAt: null,
    acknowledgedAt: vn("2026-08-10T09:00"),
    assignedAt: vn("2026-08-10T09:00"),
    ...o,
  });

  it("đo từ MỐC NHẬN VIỆC, không phải mốc Order giao", () => {
    // Quyết định của user: Order giao 06:00 mà NV chỉ nhận việc 09:00 thì 3 giờ đó không phải
    // lỗi của NV. Nếu đo từ assignedAt sẽ ra 60 phút nhiều hơn (08:00→09:00).
    const patch = resolveAssignmentStateAfterProgress(
      asg({ assignedAt: vn("2026-08-10T06:00"), acknowledgedAt: vn("2026-08-10T09:00") }),
      { status: "SENT_RESULT" },
      vn("2026-08-10T11:00"),
    );
    expect(patch.actualMinutes).toBe(120);
  });

  it("CHƯA nhận việc (dữ liệu cũ / PRODUCTION ghi hộ) → rơi về mốc giao", () => {
    // Thà đo hơi rộng còn hơn để trống: ô "Giờ thực tế" trống ở một đơn đã xong là vô nghĩa.
    const patch = resolveAssignmentStateAfterProgress(
      asg({ acknowledgedAt: null, assignedAt: vn("2026-08-10T09:00") }),
      { status: "SENT_RESULT" },
      vn("2026-08-10T11:00"),
    );
    expect(patch.actualMinutes).toBe(120);
  });

  it("BỎ GIỜ NGHỈ TRƯA — không tính công cho giờ không ai làm", () => {
    const patch = resolveAssignmentStateAfterProgress(
      asg({ acknowledgedAt: vn("2026-08-10T11:00") }),
      { status: "SENT_RESULT" },
      vn("2026-08-10T14:00"),
    );
    expect(patch.actualMinutes).toBe(120); // không phải 180
  });

  it("QUA CUỐI TUẦN: giờ tường 65 tiếng nhưng giờ làm việc thật ít hơn nhiều", () => {
    // Đây là lý do KHÔNG lấy hiệu số giờ tường. 14/08/2026 là thứ Sáu, 16 là Chủ nhật.
    const patch = resolveAssignmentStateAfterProgress(
      asg({ acknowledgedAt: vn("2026-08-14T16:00") }),
      { status: "SENT_RESULT" },
      vn("2026-08-17T09:00"),
    );
    expect(patch.actualMinutes).toBe(590); // 60 (thứ 6) + 470 (thứ 7) + 0 (CN) + 60 (thứ 2)
  });

  it("KHÔNG đóng dấu lại ở lần gửi thứ hai — cùng quy tắc một lần với completedAt", () => {
    const patch = resolveAssignmentStateAfterProgress(
      asg({ completedAt: vn("2026-08-10T11:00"), status: "SENT_RESULT" }),
      { status: "SENT_RESULT" },
      vn("2026-08-11T16:00"),
    );
    expect(patch.actualMinutes).toBeUndefined();
  });

  it("chỉ đóng dấu khi trạng thái là 'Đã gửi kết quả'", () => {
    const patch = resolveAssignmentStateAfterProgress(
      asg(), { status: "IN_PROGRESS" }, vn("2026-08-10T11:00"),
    );
    expect(patch.actualMinutes).toBeUndefined();
  });

  it("mốc nhận việc NẰM SAU mốc hoàn tất → 0, không phải số âm", () => {
    // Dữ liệu thật có ca này: lượt giao lại dời assignedAt về sau. Số âm sẽ lặng lẽ chảy vào
    // báo cáo KPI và làm tổng giờ của nhân viên bị trừ đi.
    const patch = resolveAssignmentStateAfterProgress(
      asg({ acknowledgedAt: vn("2026-08-18T09:00"), assignedAt: vn("2026-08-18T09:00") }),
      { status: "SENT_RESULT" },
      vn("2026-08-10T11:00"),
    );
    expect(patch.actualMinutes).toBe(0);
  });

  it("dùng LỊCH TRUYỀN VÀO, không phải lịch mặc định", () => {
    // Lịch của chính lượt đó (workingCalendarId đã lưu lúc giao việc) mới đúng: nếu admin đổi
    // lịch giữa lúc giao và lúc xong thì đo bằng lịch mới sẽ không khớp deadline đã chốt.
    const patch = resolveAssignmentStateAfterProgress(
      asg({ acknowledgedAt: vn("2026-08-10T09:00") }),
      { status: "SENT_RESULT" },
      vn("2026-08-10T14:00"),
      { weeklyDaysOff: [0], holidays: [], sessions: [{ start: "08:00", end: "18:00" }] },
    );
    // Lịch này không có giờ nghỉ trưa → trọn 5 giờ, khác hẳn 240 phút của lịch mặc định.
    expect(patch.actualMinutes).toBe(300);
  });
});

describe("Phân quyền cập nhật tiến độ (yêu cầu #5)", () => {
  it("NV 3D cập nhật đơn CỦA MÌNH → được phép", () => {
    const reason = deniedReasonForProgressWrite(
      { role: "DESIGN_3D", designer3DId: "designer-1" },
      assignment(),
    );
    expect(reason).toBeNull();
  });

  it("NV 3D cập nhật đơn của NGƯỜI KHÁC → bị chặn", () => {
    const reason = deniedReasonForProgressWrite(
      { role: "DESIGN_3D", designer3DId: "designer-2" },
      assignment(),
    );
    // Chốt Ý NGHĨA chứ không chốt nguyên văn: câu từ chối giờ dùng chung cho mọi trục
    // (kpi-3d/permissions.ts) nên chỉnh câu chữ ở một nơi không được làm vỡ test ở bốn nơi.
    expect(reason).toContain("do mình phụ trách");
  });

  it("tài khoản DESIGN_3D chưa gắn hồ sơ NV 3D → bị chặn kèm lý do rõ ràng", () => {
    const reason = deniedReasonForProgressWrite(
      { role: "DESIGN_3D", designer3DId: null },
      assignment(),
    );
    expect(reason).toBe("Tài khoản của bạn chưa được gắn với hồ sơ Nhân viên Thiết kế 3D.");
  });

  it("ADMIN / ORDER / PRODUCTION ghi được mọi assignment", () => {
    for (const role of ["ADMIN", "ORDER", "PRODUCTION"]) {
      expect(deniedReasonForProgressWrite({ role, designer3DId: null }, assignment())).toBeNull();
    }
  });

  it("role ngoài danh sách (SALES) → không được ghi", () => {
    expect(deniedReasonForProgressWrite({ role: "SALES", designer3DId: null }, assignment())).not.toBeNull();
    expect(canReadProgress("SALES")).toBe(false);
  });

  it("assignment đã giao lại / đã hủy → chặn ghi thêm tiến độ", () => {
    expect(blockedReasonForProgress(assignment({ status: "REASSIGNED" }))).not.toBeNull();
    expect(blockedReasonForProgress(assignment({ status: "CANCELLED" }))).not.toBeNull();
    expect(blockedReasonForProgress(assignment({ status: "IN_PROGRESS" }))).toBeNull();
  });

  it("CHƯA xác nhận nhận việc → CHẶN, nêu rõ phải bấm nút nào", () => {
    // Nhận việc là CỬA VÀO, không phải một trục song song. Trước đây hai thứ chạy độc lập nên
    // NV ghi tiến độ được mà chưa từng nhận việc, và mốc nhận việc mất hết ý nghĩa: Đặt đơn
    // nhìn vào thấy "Chưa nhận việc" trong khi người ta đã làm xong.
    const reason = blockedReasonForProgress(assignment({ acknowledgedAt: null }));
    expect(reason).not.toBeNull();
    expect(reason).toContain("Xác nhận nhận việc");
  });

  it("lượt đã đóng thì báo lý do ĐÓNG, không phải lý do chưa nhận việc", () => {
    // Thứ tự kiểm quan trọng: lượt đã huỷ mà báo "hãy bấm nhận việc" sẽ đẩy người dùng đi làm
    // một việc vô nghĩa — nút đó cũng không còn hiện nữa.
    const reason = blockedReasonForProgress(assignment({ status: "CANCELLED", acknowledgedAt: null }));
    expect(reason).toContain("đã đóng");
  });
});

describe("Kiểm tra dữ liệu đầu vào", () => {
  it("nhận link Share Drive hợp lệ", () => {
    const r = progressEntryInputSchema.safeParse({
      status: "IN_PROGRESS",
      progressPercent: 40,
      renderInfoUrl: "https://drive.google.com/file/d/abc/view",
    });
    expect(r.success).toBe(true);
  });

  it("chặn link javascript: (nguy cơ XSS khi render thành thẻ <a>)", () => {
    const r = progressEntryInputSchema.safeParse({
      status: "IN_PROGRESS",
      renderInfoUrl: "javascript:alert(1)",
    });
    expect(r.success).toBe(false);
  });

  it("chặn % tiến độ ngoài khoảng 0–100", () => {
    expect(progressEntryInputSchema.safeParse({ status: "IN_PROGRESS", progressPercent: 120 }).success).toBe(false);
    expect(progressEntryInputSchema.safeParse({ status: "IN_PROGRESS", progressPercent: -1 }).success).toBe(false);
  });

  it("chặn trạng thái không nằm trong 3 giá trị cho phép", () => {
    expect(progressEntryInputSchema.safeParse({ status: "DONE" }).success).toBe(false);
  });

  it("cho phép dòng chỉ có trạng thái (chưa có % và link)", () => {
    expect(progressEntryInputSchema.safeParse({ status: "WAITING_INFO" }).success).toBe(true);
  });
});

describe("Hiển thị mức sớm/trễ", () => {
  it("gộp giờ và phút đúng", () => {
    expect(formatKpiDelta("ON_TIME", -90)).toBe("Sớm 1 giờ 30 phút");
    expect(formatKpiDelta("LATE", 45)).toBe("Trễ 45 phút");
    expect(formatKpiDelta("LATE", 120)).toBe("Trễ 2 giờ");
  });

  it("vừa kịp deadline và trường hợp chưa có dữ liệu", () => {
    expect(formatKpiDelta("ON_TIME", 0)).toBe("Đúng hạn (vừa kịp)");
    expect(formatKpiDelta(null, null)).toBe("—");
  });
});

// ─── ĐANG BỊ GÁC: GHI TIẾN ĐỘ ĐƯỢC, GỬI KẾT QUẢ THÌ KHÔNG ────────────────────
//
// ⚠️ ĐÂY LÀ ĐẢO NGƯỢC MỘT QUYẾT ĐỊNH CŨ, và lý do cũ vẫn đáng đọc: bản trước cố ý cho nộp khi đang
// dừng vì "làm xong rồi mà không nộp được thì phải đi xin mở lại — một ngõ cụt do hệ thống tự tạo".
//
// Nghiệp vụ đã đổi: TẠM DỪNG NAY LÀ CHỐT SỔ CHO PHIÊN ĐÓ. Giờ công được xác nhận ngay tại mốc dừng
// (Design3DPause.confirmedMinutes) và vào KPI tháng đó. Cho gửi kết quả sau đó nghĩa là đóng dấu
// completedAt + phán quyết Đúng/Trễ hạn lên một phiên đã chốt bằng con số khác — HAI LẦN CHỐT trên
// cùng một lượt, và không ai đọc được cái nào mới là thật.
describe("blockedReasonForProgress — khi đơn đang tạm dừng", () => {
  const paused = {
    id: "a-1",
    designer3DId: "d-1",
    deadlineAt: new Date("2026-08-20T02:00:00.000Z"),
    status: "IN_PROGRESS",
    completedAt: null,
    acknowledgedAt: new Date("2026-08-13T02:00:00.000Z"),
    assignedAt: new Date("2026-08-13T02:00:00.000Z"),
    pauses: [{ pausedAt: new Date("2026-08-14T02:00:00.000Z"), resumedAt: null }],
  };

  it("GỬI KẾT QUẢ → CHẶN, và chỉ đường sang tab Thiết kế", () => {
    const reason = blockedReasonForProgress(paused, "SENT_RESULT");
    expect(reason).not.toBeNull();
    expect(reason).toContain("tạm dừng");
    // Chặn mà không chỉ đường thì nhân viên chỉ còn cách đi hỏi.
    expect(reason).toContain("tab Thiết kế");
  });

  // Ghi File Render / ghi chú trong lúc bị gác là VÔ HẠI: không đụng giờ công, không đụng deadline.
  // Và đó là thứ nghiệp vụ muốn được ghi nhận.
  it("ghi tiến độ thường → CHO PHÉP", () => {
    expect(blockedReasonForProgress(paused, "IN_PROGRESS")).toBeNull();
    expect(blockedReasonForProgress(paused, "WAITING_INFO")).toBeNull();
  });

  it("KHÔNG bị gác → gửi kết quả vẫn được, không chặn oan", () => {
    expect(blockedReasonForProgress({ ...paused, pauses: [] }, "SENT_RESULT")).toBeNull();
  });

  // Khoảng dừng ĐÃ ĐÓNG không chặn gì — chỉ khoảng đang mở mới có nghĩa.
  it("khoảng dừng đã mở lại → gửi kết quả được", () => {
    const resumed = {
      ...paused,
      pauses: [{ pausedAt: new Date("2026-08-14T02:00:00.000Z"), resumedAt: new Date("2026-08-15T02:00:00.000Z") }],
    };
    expect(blockedReasonForProgress(resumed, "SENT_RESULT")).toBeNull();
  });

  // Không truyền trạng thái dòng ghi → chỉ xét các luật cũ. Giữ tương thích cho chỗ gọi nào chỉ
  // muốn hỏi "lượt này có ghi được không" mà chưa biết sẽ ghi gì.
  it("không truyền entryStatus → không chặn vì lý do tạm dừng", () => {
    expect(blockedReasonForProgress(paused)).toBeNull();
  });
});

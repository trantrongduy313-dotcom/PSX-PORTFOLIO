import { describe, expect, it } from "vitest";

import {
  continuationNote,
  deniedReasonForContinuation,
  deniedReasonForContinueAt,
  continuationInputSchema,
  suggestedRemainingMinutes,
} from "@/app/lib/business/kpi-3d/continuation";

// Mở lại sau tạm dừng có thể là "sang tháng khác" hoặc "người khác làm tiếp". Một lượt duy nhất
// không diễn đạt nổi hai người, hai tháng, hai ngân sách — nên giai đoạn tiếp theo là lượt riêng.

describe("suggestedRemainingMinutes", () => {
  it("còn lại = suất gốc trừ phần đã ghi nhận", () => {
    expect(suggestedRemainingMinutes({ standardMinutes: 360, creditedMinutes: 240 })).toBe(120);
  });

  it("chưa tiêu gì → còn nguyên suất", () => {
    expect(suggestedRemainingMinutes({ standardMinutes: 360, creditedMinutes: 0 })).toBe(360);
  });

  // ⚠️ TEST QUAN TRỌNG NHẤT FILE NÀY.
  // 0 giờ nghĩa là hạn chót rơi ngay vào lúc giao, tức người làm tiếp trễ hạn từ giây đầu tiên
  // — một phán quyết sai do hệ thống tự sinh ra. null nghĩa là "hệ thống không có ý kiến, người
  // giao phải tự đặt số", và form đọc null thành ô TRỐNG bắt buộc điền.
  it("tiêu hết ngân sách → null, KHÔNG phải 0", () => {
    expect(suggestedRemainingMinutes({ standardMinutes: 360, creditedMinutes: 360 })).toBeNull();
  });

  it("tiêu vượt ngân sách → null, không trả số âm", () => {
    expect(suggestedRemainingMinutes({ standardMinutes: 360, creditedMinutes: 500 })).toBeNull();
  });

  it("không biết suất gốc → null", () => {
    expect(suggestedRemainingMinutes({ standardMinutes: null, creditedMinutes: 100 })).toBeNull();
  });

  it("suất gốc 0 (chưa cấu hình) → null", () => {
    expect(suggestedRemainingMinutes({ standardMinutes: 0, creditedMinutes: 0 })).toBeNull();
  });

  it("số giờ đã ghi nhận âm (dữ liệu hỏng) coi như 0, không cộng thêm ngân sách", () => {
    expect(suggestedRemainingMinutes({ standardMinutes: 360, creditedMinutes: -120 })).toBe(360);
  });

  it("NaN không lan ra kết quả", () => {
    expect(suggestedRemainingMinutes({ standardMinutes: 360, creditedMinutes: Number.NaN })).toBe(360);
    expect(suggestedRemainingMinutes({ standardMinutes: Number.NaN, creditedMinutes: 0 })).toBeNull();
  });

  // Luật ở ĐÂY ngược hẳn luật của reassign.ts (không duyệt → đổi người nhận NGUYÊN suất, vì họ
  // làm LẠI từ đầu). Ở đây người mới KẾ THỪA phần đã làm; cho nguyên suất nữa thì một MO 6 giờ
  // tiêu 12 giờ ngân sách và người thứ hai gần như không thể trễ hạn. Test này khoá điều đó.
  it("KHÔNG bao giờ trả về nguyên suất khi đã có giờ ghi nhận", () => {
    const standard = 360;
    for (const credited of [1, 60, 180, 359]) {
      const got = suggestedRemainingMinutes({ standardMinutes: standard, creditedMinutes: credited });
      expect(got).not.toBeNull();
      expect(got).toBeLessThan(standard);
    }
  });
});

describe("continuationInputSchema", () => {
  const base = { designer3DId: "d1", standardMinutes: 120 };

  it("nhận đầu vào tối thiểu", () => {
    expect(continuationInputSchema.safeParse(base).success).toBe(true);
  });

  // Cố ý KHÔNG có `.default()`: đây là con số quyết định người làm tiếp đúng hay trễ hạn. Để hệ
  // thống tự điền một mặc định là để nó ra phán quyết thay người quản lý mà không ai biết.
  it("thiếu số giờ → từ chối, KHÔNG tự điền mặc định", () => {
    const r = continuationInputSchema.safeParse({ designer3DId: "d1" });
    expect(r.success).toBe(false);
  });

  it("0 giờ bị từ chối — hạn chót sẽ rơi ngay vào lúc giao", () => {
    expect(continuationInputSchema.safeParse({ ...base, standardMinutes: 0 }).success).toBe(false);
  });

  it("số giờ âm bị từ chối", () => {
    expect(continuationInputSchema.safeParse({ ...base, standardMinutes: -60 }).success).toBe(false);
  });

  it("thiếu người nhận → từ chối", () => {
    expect(continuationInputSchema.safeParse({ standardMinutes: 120 }).success).toBe(false);
  });

  it("người nhận chỉ có khoảng trắng → từ chối", () => {
    expect(continuationInputSchema.safeParse({ ...base, designer3DId: "   " }).success).toBe(false);
  });

  // "Vẫn người đó, nhưng là một giai đoạn khác" là tình huống người dùng nêu thẳng — không được
  // chặn trùng người như luồng đổi-người-vì-không-duyệt.
  it("CHO PHÉP giao lại cho chính người đang làm", () => {
    const r = continuationInputSchema.safeParse({ designer3DId: "same", standardMinutes: 60 });
    expect(r.success).toBe(true);
  });

  it("mốc bắt đầu đọc được từ chuỗi ISO", () => {
    const r = continuationInputSchema.safeParse({ ...base, startedAt: "2026-09-01T01:00:00Z" });
    expect(r.success && r.data.startedAt instanceof Date).toBe(true);
  });
});

describe("deniedReasonForContinueAt — mốc bắt đầu lượt mới", () => {
  const now = new Date("2026-08-13T03:00:00Z");
  const previousStartedAt = new Date("2026-08-13T01:00:00Z");
  const at = (o: Partial<Parameters<typeof deniedReasonForContinueAt>[0]> = {}) =>
    deniedReasonForContinueAt({
      startedAt: new Date("2026-08-13T02:00:00Z"),
      previousStartedAt,
      pausedAt: null,
      now,
      ...o,
    });

  // ⚠️ TÌNH HUỐNG MỚI CỦA BẢN NÀY: đơn KHÔNG bị gác vẫn giao được lượt tiếp theo. Trước đây route
  // chặn thẳng "không đang tạm dừng", nên không có cửa nào để giao lần nữa cho chính người đó.
  it("KHÔNG đang tạm dừng vẫn hợp lệ", () => {
    expect(at({ pausedAt: null })).toBeNull();
  });

  it("đang tạm dừng, mốc sau mốc dừng → hợp lệ", () => {
    expect(at({ pausedAt: new Date("2026-08-13T01:30:00Z") })).toBeNull();
  });

  // Chồng thời gian nghĩa là giờ của khoảng chồng thuộc về CẢ HAI người — không phép tính nào
  // chia được nó, và cuối tháng cả hai đều thấy số của mình đúng.
  it("mốc sớm hơn mốc tạm dừng → chặn", () => {
    expect(at({ pausedAt: new Date("2026-08-13T02:30:00Z") })).not.toBeNull();
  });

  it("mốc sớm hơn lúc giao lượt trước → chặn", () => {
    expect(at({ startedAt: new Date("2026-08-13T00:30:00Z") })).not.toBeNull();
  });

  it("mốc ở tương lai → chặn", () => {
    expect(at({ startedAt: new Date("2026-08-14T03:00:00Z") })).not.toBeNull();
  });

  // Nới 2 phút cho lệch đồng hồ máy — cùng độ nới với deniedReasonForPauseAt, cố ý giống nhau để
  // hai form không hành xử khác nhau ở cùng một tình huống.
  it("lệch đồng hồ 1 phút vẫn nhận", () => {
    expect(at({ startedAt: new Date("2026-08-13T03:01:00Z") })).toBeNull();
  });

  it("mốc rác → chặn, không ném lỗi", () => {
    expect(at({ startedAt: new Date("khong-phai-ngay") })).not.toBeNull();
  });

  it("đúng bằng mốc giao lượt trước → hợp lệ, không phải chồng", () => {
    expect(at({ startedAt: previousStartedAt })).toBeNull();
  });
});

describe("deniedReasonForContinuation", () => {
  const okAssignment = { status: "IN_PROGRESS", reviewStatus: "PENDING_REVIEW" as string | null };

  it("ADMIN mở được", () => {
    expect(deniedReasonForContinuation("ADMIN", okAssignment)).toBeNull();
  });

  it("NV 3D KHÔNG mở được — họ tự mở thì KPI vô nghĩa", () => {
    expect(deniedReasonForContinuation("DESIGN_3D", okAssignment)).not.toBeNull();
  });

  it("không có vai trò → chặn", () => {
    expect(deniedReasonForContinuation(undefined, okAssignment)).not.toBeNull();
  });

  it("lượt đã bị chuyển đi → chặn", () => {
    expect(deniedReasonForContinuation("ADMIN", { ...okAssignment, status: "REASSIGNED" })).not.toBeNull();
  });

  it("lượt đã huỷ → chặn", () => {
    expect(deniedReasonForContinuation("ADMIN", { ...okAssignment, status: "CANCELLED" })).not.toBeNull();
  });

  // Đã duyệt thì giờ đã đóng băng và MO coi như xong; mở tiếp một giai đoạn nữa là dựng ra công
  // việc cho một thứ đã kết thúc.
  it("lượt đã được duyệt → chặn", () => {
    expect(deniedReasonForContinuation("ADMIN", { ...okAssignment, reviewStatus: "ACCEPTED" })).not.toBeNull();
  });

  it("chưa kiểm gì (reviewStatus null) vẫn mở được", () => {
    expect(deniedReasonForContinuation("ADMIN", { ...okAssignment, reviewStatus: null })).toBeNull();
  });
});

describe("continuationNote", () => {
  it("nói rõ kế thừa của ai và bao nhiêu giờ đã ghi nhận", () => {
    const note = continuationNote({
      fromDesignerName: "AN",
      creditedMinutes: 270,
      pauseReason: "Chờ khách xác nhận mẫu",
    });
    expect(note).toContain("AN");
    expect(note).toContain("4.5 giờ");
    expect(note).toContain("Chờ khách xác nhận mẫu");
  });

  it("không có lý do dừng thì bỏ hẳn câu đó, không để đuôi lửng", () => {
    const note = continuationNote({ fromDesignerName: "AN", creditedMinutes: 60, pauseReason: null });
    expect(note).not.toContain("tạm dừng vì");
    expect(note.trim()).toBe(note);
  });

  it("lý do chỉ có khoảng trắng cũng bị bỏ", () => {
    expect(continuationNote({ fromDesignerName: "AN", creditedMinutes: 60, pauseReason: "  " }))
      .not.toContain("tạm dừng vì");
  });

  it("giờ âm (dữ liệu hỏng) không in ra số âm cho người đọc", () => {
    expect(continuationNote({ fromDesignerName: "AN", creditedMinutes: -60, pauseReason: null }))
      .toContain("0 giờ");
  });
});

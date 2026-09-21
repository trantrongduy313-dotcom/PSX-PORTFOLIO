import { describe, expect, it } from "vitest";

import {
  assignmentStatusAfterReviewDecision,
  deniedReasonForReview,
  deriveReviewStatus,
  resolveDesignFilePush,
  summarizeDesign3DForOrder,
  reviewDecisionInputSchema,
  reviewHistoryComment,
  reviewStatusAfterDecision,
  resolveActualMinutesFreeze,
  toDesign3DAssignmentView,
  type RawAssignmentForView,
  type ReviewableAssignment,
} from "@/app/lib/business/kpi-3d/review";
import { toVnYmd } from "@/app/lib/utils/vn-date";

// Kiểm kết quả 3D nội bộ (Order/Admin) — KHÁC OrderStatus.DESIGN_REVIEW (chờ khách duyệt).
// Điểm mấu chốt cần test: quy tắc KPI khi bị yêu cầu làm lại GIỮ NGUYÊN theo lần gửi đầu
// tiên — module này không đụng tới completedAt/kpiStatus, chỉ đổi reviewStatus/status.

function assignment(overrides: Partial<ReviewableAssignment> = {}): ReviewableAssignment {
  return { id: "asg-1", status: "SENT_RESULT", completedAt: new Date("2026-08-04T09:20:00+07:00"), ...overrides };
}

describe("Phân quyền kiểm kết quả 3D", () => {
  it("ADMIN kiểm được", () => {
    expect(deniedReasonForReview("ADMIN", assignment())).toBeNull();
  });

  it("ORDER kiểm được", () => {
    expect(deniedReasonForReview("ORDER", assignment())).toBeNull();
  });

  it("PRODUCTION KHÔNG kiểm được — ghi tiến độ hộ khác với kiểm kết quả", () => {
    const reason = deniedReasonForReview("PRODUCTION", assignment());
    expect(reason).toContain("không có quyền");
  });

  it("DESIGN_3D không tự kiểm được kết quả của chính mình", () => {
    const reason = deniedReasonForReview("DESIGN_3D", assignment());
    expect(reason).not.toBeNull();
  });

  it("chưa có kết quả (completedAt null) → chặn, dù đúng role", () => {
    const reason = deniedReasonForReview("ADMIN", assignment({ completedAt: null }));
    expect(reason).toContain("chưa gửi kết quả");
  });
});

describe("Ánh xạ quyết định kiểm", () => {
  it("ACCEPT → ACCEPTED", () => {
    expect(reviewStatusAfterDecision("ACCEPT")).toBe("ACCEPTED");
  });

  it("REWORK → REWORK", () => {
    expect(reviewStatusAfterDecision("REWORK")).toBe("REWORK");
  });

  it("REWORK mở lại assignment về IN_PROGRESS để NV 3D thấy việc cần xử lý tiếp", () => {
    expect(assignmentStatusAfterReviewDecision("REWORK")).toBe("IN_PROGRESS");
  });

  it("ACCEPT không đổi status của assignment (null = giữ nguyên)", () => {
    expect(assignmentStatusAfterReviewDecision("ACCEPT")).toBeNull();
  });
});

describe("Schema đầu vào — bắt buộc lý do khi yêu cầu làm lại", () => {
  it("ACCEPT không cần note", () => {
    expect(reviewDecisionInputSchema.safeParse({ decision: "ACCEPT" }).success).toBe(true);
  });

  it("REWORK thiếu note → từ chối ngay từ tầng nhập liệu", () => {
    const bad = reviewDecisionInputSchema.safeParse({ decision: "REWORK" });
    expect(bad.success).toBe(false);
  });

  it("REWORK có note → hợp lệ", () => {
    const good = reviewDecisionInputSchema.safeParse({ decision: "REWORK", note: "Sai kích thước" });
    expect(good.success).toBe(true);
  });
});

describe("deriveReviewStatus — SUY RA thay vì đòi dữ liệu phải có sẵn", () => {
  // Các lượt giao việc hoàn tất TRƯỚC khi có tính năng kiểm đều mang reviewStatus = NULL.
  // Suy ra được thì không cần script backfill — cùng nguyên tắc đã dùng cho `scopedItemId`.
  it("đã hoàn tất nhưng chưa có phán quyết → PENDING_REVIEW (không cần backfill)", () => {
    expect(deriveReviewStatus(null, new Date("2026-08-04T09:20:00+07:00"))).toBe("PENDING_REVIEW");
  });

  it("chưa hoàn tất → null, KHÔNG bịa ra là đang chờ kiểm", () => {
    expect(deriveReviewStatus(null, null)).toBeNull();
  });

  it.each([
    ["ACCEPTED", "ACCEPTED"],
    ["REWORK", "REWORK"],
    ["PENDING_REVIEW", "PENDING_REVIEW"],
  ])("đã có phán quyết %s → giữ nguyên, không ghi đè", (stored, expected) => {
    expect(deriveReviewStatus(stored, new Date())).toBe(expected);
  });

  it("giá trị lạ trong DB → coi như chưa phán quyết, suy ra theo completedAt", () => {
    expect(deriveReviewStatus("TRANG_THAI_LA", new Date())).toBe("PENDING_REVIEW");
  });
});

describe("toDesign3DAssignmentView — sidebar đọc từ BẢNG, không từ bản sao JSON", () => {
  // Bản sao cũ (legacyPatchFromCompletion, đã xoá) gây ba lỗi, các test dưới chốt lại từng cái.
  const raw = (overrides: Partial<RawAssignmentForView> = {}): RawAssignmentForView => ({
    id: "asg-1",
    completedAt: "2026-08-04T02:20:00.000Z", // = 09:20 giờ VN
    kpiStatus: "ON_TIME",
    reviewStatus: null,
    reviewNote: null,
    reworkCount: 0,
    progressLogs: [{ renderInfoUrl: "https://drive.google.com/abc" }],
    ...overrides,
  });

  it("LỖI CŨ 1: ngày hoàn tất phải là YYYY-MM-DD, không phải ISO đầy đủ", () => {
    // Bản cũ ghi completedAt.toISOString() vào ô ngày; DateInput split("-") cho
    // dd = "04T02:20:00.000Z" → render ra "04T02:20:00.000Z/08/2026".
    const view = toDesign3DAssignmentView(raw(), toVnYmd);
    expect(view?.completedYmd).toBe("2026-08-04");
    expect(view?.completedYmd).not.toContain("T");
  });

  it("LỖI CŨ 2: kết quả lấy nhãn KPI của server, không phải từ vựng của calcKetQua", () => {
    expect(toDesign3DAssignmentView(raw(), toVnYmd)?.ketQuaLabel).toBe("Đúng hạn");
    expect(toDesign3DAssignmentView(raw({ kpiStatus: "LATE" }), toVnYmd)?.ketQuaLabel).toBe("Trễ hạn");
  });

  it("MO hoàn tất từ trước khi có tính năng kiểm → hiện Chờ kiểm ngay, không cần backfill", () => {
    expect(toDesign3DAssignmentView(raw({ reviewStatus: null }), toVnYmd)?.reviewStatus).toBe("PENDING_REVIEW");
  });

  // ─── Giờ thực tế của lượt CŨ ───────────────────────────────────────────────
  // Cột actualMinutes chỉ được đóng dấu từ lúc tính năng lên, nên mọi lượt hoàn tất TRƯỚC đó
  // có cột trống — và sidebar hiện "—" cho một đơn đã duyệt xong. Đây chính là lỗi user báo.

  it("LỖI USER BÁO LẦN 2: cột = 0 (rác do code cũ chiếu từ JSON) → KHÔNG chặn nhánh suy ra", () => {
    // Code cũ chiếu `gioThucTe` từ JSON vào cột, mà ô nhập để trống lưu thành 0 — nên rất nhiều
    // lượt đang có actualMinutes = 0. Bản trước chỉ xét `typeof === "number"` nên nhận số 0 đó
    // rồi DỪNG, không bao giờ suy ra. Kết quả: đơn đã duyệt xong vẫn hiện "—".
    const view = toDesign3DAssignmentView(
      raw({
        actualMinutes: 0,
        acknowledgedAt: "2026-08-04T01:00:00.000Z", // 08:00 giờ VN
        completedAt: "2026-08-04T04:00:00.000Z",    // 11:00 giờ VN
      }),
      toVnYmd,
    );
    expect(view?.systemActualMinutes).toBe(180);
  });

  it("cột âm cũng không tin — dữ liệu rác không được thắng phép đo thật", () => {
    const view = toDesign3DAssignmentView(
      raw({
        actualMinutes: -60,
        acknowledgedAt: "2026-08-04T01:00:00.000Z",
        completedAt: "2026-08-04T04:00:00.000Z",
      }),
      toVnYmd,
    );
    expect(view?.systemActualMinutes).toBe(180);
  });

  it("cột actualMinutes ĐÃ đóng dấu → dùng luôn, không tính lại", () => {
    // Con số đã đóng dấu đo bằng lịch ĐANG DÙNG LÚC ĐÓ. Tính lại bây giờ thì dùng lịch hiện
    // tại, mà admin có thể đã sửa ca từ dạo đó — số lịch sử sẽ trôi.
    const view = toDesign3DAssignmentView(raw({ actualMinutes: 115 }), toVnYmd);
    expect(view?.systemActualMinutes).toBe(115);
  });

  it("LỖI USER BÁO: cột trống + đã hoàn tất → SUY RA từ mốc nhận việc, không hiện trống", () => {
    const view = toDesign3DAssignmentView(
      raw({
        actualMinutes: null,
        acknowledgedAt: "2026-08-04T01:00:00.000Z", // 08:00 giờ VN
        completedAt: "2026-08-04T04:00:00.000Z",    // 11:00 giờ VN
      }),
      toVnYmd,
    );
    expect(view?.systemActualMinutes).toBe(180);
  });

  it("suy ra BỎ giờ nghỉ trưa — cùng thước đo với lúc đóng dấu", () => {
    const view = toDesign3DAssignmentView(
      raw({
        actualMinutes: null,
        acknowledgedAt: "2026-08-04T04:00:00.000Z", // 11:00 giờ VN
        completedAt: "2026-08-04T07:00:00.000Z",    // 14:00 giờ VN
      }),
      toVnYmd,
    );
    expect(view?.systemActualMinutes).toBe(120); // không phải 180
  });

  it("chưa có mốc nhận việc → rơi về mốc giao, đúng quy tắc lúc đóng dấu", () => {
    const view = toDesign3DAssignmentView(
      raw({
        actualMinutes: null,
        acknowledgedAt: null,
        progressLogs: [],
        assignedAt: "2026-08-04T01:00:00.000Z",  // 08:00 giờ VN
        completedAt: "2026-08-04T03:00:00.000Z", // 10:00 giờ VN
      }),
      toVnYmd,
    );
    expect(view?.systemActualMinutes).toBe(120);
  });

  it("CHƯA hoàn tất → KHÔNG suy ra", () => {
    // Tính tới thời điểm hiện tại sẽ ra một con số cứ lớn dần mỗi lần mở sidebar, và "giờ thực
    // tế" của một việc chưa xong thì chưa có nghĩa.
    const view = toDesign3DAssignmentView(
      raw({ actualMinutes: null, completedAt: null, acknowledgedAt: "2026-08-04T01:00:00.000Z", progressLogs: [] }),
      toVnYmd,
    );
    expect(view?.systemActualMinutes).toBeNull();
  });

  it("không có mốc nào để đo → null, không phải 0", () => {
    const view = toDesign3DAssignmentView(
      raw({ actualMinutes: null, acknowledgedAt: null, assignedAt: null, progressLogs: [] }),
      toVnYmd,
    );
    expect(view?.systemActualMinutes).toBeNull();
  });

  it("làm TRỌN NGOÀI giờ hành chính → 0, KHÔNG phải null", () => {
    // ĐỔI CÓ CHỦ Ý: "đo được và ra 0" khác "không đo được". Việc làm buổi tối thì số phút làm
    // việc theo lịch đúng bằng 0 — hiện "0 giờ" là nói thật theo định nghĩa của lịch, hiện "—"
    // là nói dối rằng không biết.
    // Đây cũng là lý do thật khiến ô vẫn trống khi NV nhận việc rồi gửi kết quả trong cùng phút.
    const view = toDesign3DAssignmentView(
      raw({
        actualMinutes: null,
        acknowledgedAt: "2026-08-04T13:00:00.000Z", // 20:00 giờ VN
        completedAt: "2026-08-04T15:00:00.000Z",    // 22:00 giờ VN
      }),
      toVnYmd,
    );
    expect(view?.systemActualMinutes).toBe(0);
  });

  it("nhận việc rồi gửi kết quả trong CÙNG một phút → 0, không phải trống", () => {
    const view = toDesign3DAssignmentView(
      raw({
        actualMinutes: null,
        acknowledgedAt: "2026-08-04T04:32:10.000Z", // 11:32:10 giờ VN
        completedAt: "2026-08-04T04:32:40.000Z",    // 11:32:40 giờ VN
      }),
      toVnYmd,
    );
    expect(view?.systemActualMinutes).not.toBeNull();
  });

  it("dùng LỊCH TRUYỀN VÀO khi suy ra", () => {
    const view = toDesign3DAssignmentView(
      raw({
        actualMinutes: null,
        acknowledgedAt: "2026-08-04T04:00:00.000Z", // 11:00 giờ VN
        completedAt: "2026-08-04T07:00:00.000Z",    // 14:00 giờ VN
      }),
      toVnYmd,
      { weeklyDaysOff: [0], holidays: [], sessions: [{ start: "08:00", end: "18:00" }] },
    );
    // Lịch này không có giờ nghỉ trưa → trọn 3 giờ.
    expect(view?.systemActualMinutes).toBe(180);
  });

  it("lấy link render từ dòng tiến độ mới nhất CÓ link, bỏ qua dòng không có", () => {
    const view = toDesign3DAssignmentView(
      raw({ progressLogs: [{ renderInfoUrl: null }, { renderInfoUrl: "https://drive.google.com/xyz" }] }),
      toVnYmd,
    );
    expect(view?.renderInfoUrl).toBe("https://drive.google.com/xyz");
  });

  it("chưa hoàn tất → không có ngày, không có kết quả, không chờ kiểm", () => {
    const view = toDesign3DAssignmentView(raw({ completedAt: null, kpiStatus: null }), toVnYmd);
    expect(view?.completedYmd).toBe("");
    expect(view?.ketQuaLabel).toBe("");
    expect(view?.reviewStatus).toBeNull();
    expect(view?.isCompleted).toBe(false);
  });

  // ─── Đơn đang tạm dừng: giờ đã chốt phải ĐỌC LẠI ĐƯỢC ───────────────────────
  //
  // LỖ HỔNG ĐÃ BỊT: Admin gác đơn và xác nhận "nhân viên đã làm 4,2 giờ" — con số đó đi thẳng vào
  // KPI của tháng đó qua hours-ledger. Nhưng nhánh `if (!completedAt) return null` khiến
  // systemActualMinutes = null, nên hasDesign3DResult = false và CẢ khối kết quả không render:
  // sidebar hiện một đơn đang tạm dừng mà không có số giờ nào, trong khi KPI đã tính rồi.
  //
  // Số đã dùng để tính lương mà không chỗ nào đọc lại được là kiểu sai tệ nhất ở mảng này.
  describe("chưa nộp kết quả nhưng đã chốt giờ ở lần tạm dừng", () => {
    const paused = (confirmedMinutes: number | null) => toDesign3DAssignmentView(
      raw({ completedAt: null, kpiStatus: null, actualMinutes: null }),
      toVnYmd,
      undefined,
      [{ pausedAt: new Date("2026-08-13T01:20:00Z"), resumedAt: null, confirmedMinutes }],
    );

    it("lấy số đã chốt làm giờ thực tế", () => {
      expect(paused(252)?.systemActualMinutes).toBe(252);
    });

    it("và NÓI RA rằng số đó đến từ mốc tạm dừng", () => {
      expect(paused(252)?.actualMinutesFromPause).toBe(true);
    });

    // Chú thích mặc định nói "hệ thống đo từ lúc nhận việc đến lúc GỬI KẾT QUẢ" — sai hẳn ở đây.
    // Cờ này là thứ duy nhất cho giao diện biết phải nói khác đi.
    it("chưa từng chốt giờ → vẫn null, và KHÔNG bật cờ", () => {
      expect(paused(null)?.systemActualMinutes).toBeNull();
      expect(paused(null)?.actualMinutesFromPause).toBe(false);
    });

    // ⚠️ 0 phải ra null, không phải 0. alreadyCreditedMinutes trả 0 cho cả "chưa từng chốt", nên
    // nhận số 0 ở đây sẽ khiến MỌI lượt chưa nộp kết quả hiện "0 giờ" — nói dối rằng đã đo được
    // và nhân viên chưa làm gì.
    it("chốt 0 phút → null, không hiện 0 giờ cho mọi đơn chưa xong", () => {
      expect(paused(0)?.systemActualMinutes).toBeNull();
      expect(paused(0)?.actualMinutesFromPause).toBe(false);
    });

    it("nhiều lần chốt → lấy lần CAO NHẤT, không phải lần cuối", () => {
      const view = toDesign3DAssignmentView(
        raw({ completedAt: null, kpiStatus: null, actualMinutes: null }),
        toVnYmd,
        undefined,
        [
          { pausedAt: new Date("2026-07-20T01:00:00Z"), resumedAt: new Date("2026-07-21T01:00:00Z"), confirmedMinutes: 300 },
          // Lần sau chốt THẤP hơn (người duyệt sửa tay xuống). Lấy lần cuối sẽ RÚT LẠI giờ đã ghi
          // cho tháng 7 — hours-ledger cấm đúng chuyện đó.
          { pausedAt: new Date("2026-08-13T01:00:00Z"), resumedAt: null, confirmedMinutes: 120 },
        ],
      );
      expect(view?.systemActualMinutes).toBe(300);
    });

    // Cột đã đóng dấu vẫn THẮNG: nó là số cuối, còn số ở mốc dừng chỉ là chốt giữa đường.
    it("cột actualMinutes đã đóng dấu thắng số ở mốc dừng, và cờ KHÔNG bật", () => {
      const view = toDesign3DAssignmentView(
        raw({ completedAt: null, kpiStatus: null, actualMinutes: 400 }),
        toVnYmd,
        undefined,
        [{ pausedAt: new Date("2026-08-13T01:20:00Z"), resumedAt: null, confirmedMinutes: 252 }],
      );
      expect(view?.systemActualMinutes).toBe(400);
      expect(view?.actualMinutesFromPause).toBe(false);
    });

    // Đã hoàn tất thì số cuối đo từ mốc nhận việc tới mốc hoàn tất (đã trừ thời gian gác) — số ở
    // mốc dừng không còn vai trò gì, và cờ phải tắt để chú thích quay về bản mặc định.
    it("đã hoàn tất → cờ tắt, dùng phép đo tới mốc hoàn tất", () => {
      const view = toDesign3DAssignmentView(
        raw({ actualMinutes: null, acknowledgedAt: "2026-08-04T01:00:00.000Z" }),
        toVnYmd,
        undefined,
        [{ pausedAt: new Date("2026-08-04T01:30:00Z"), resumedAt: new Date("2026-08-04T02:00:00Z"), confirmedMinutes: 30 }],
      );
      expect(view?.actualMinutesFromPause).toBe(false);
    });

    it("không truyền pauses → cờ tắt, không ném lỗi", () => {
      const view = toDesign3DAssignmentView(raw({ completedAt: null, actualMinutes: null }), toVnYmd);
      expect(view?.actualMinutesFromPause).toBe(false);
      expect(view?.systemActualMinutes).toBeNull();
    });
  });

  it("MO chưa có lượt giao việc → null (sidebar quay về ô nhập tay như cũ)", () => {
    expect(toDesign3DAssignmentView(null, toVnYmd)).toBeNull();
    expect(toDesign3DAssignmentView(undefined, toVnYmd)).toBeNull();
  });

  it("completedAt rác → không ném lỗi, coi như chưa hoàn tất", () => {
    const view = toDesign3DAssignmentView(raw({ completedAt: "khong-phai-ngay" }), toVnYmd);
    expect(view?.isCompleted).toBe(false);
    expect(view?.completedYmd).toBe("");
  });

  it("giữ lý do và số lần làm lại để sidebar hiện cho Order/Admin thấy", () => {
    const view = toDesign3DAssignmentView(
      raw({ reviewStatus: "REWORK", reviewNote: "Sai kích thước", reworkCount: 2 }),
      toVnYmd,
    );
    expect(view?.reviewStatus).toBe("REWORK");
    expect(view?.reviewNote).toBe("Sai kích thước");
    expect(view?.reworkCount).toBe(2);
  });

  it("progressLogs thiếu/rỗng → link rỗng, không ném lỗi", () => {
    expect(toDesign3DAssignmentView(raw({ progressLogs: [] }), toVnYmd)?.renderInfoUrl).toBe("");
    expect(toDesign3DAssignmentView(raw({ progressLogs: null }), toVnYmd)?.renderInfoUrl).toBe("");
  });

  // LỖI MỚI PHÁT HIỆN (sidebar Đơn hàng "Deadline KPI" thiếu giờ): view model trước đây không
  // mang deadlineAt, nên nơi hiển thị chỉ còn cách đọc bản JSON extraData.design.deadline —
  // dạng "YYYY-MM-DD" cắt mất giờ. Thêm deadlineAt vào view để có đường lấy giá trị ĐẦY ĐỦ GIỜ
  // từ cùng cột deadlineAt mà màn NV 3D đang đọc.
  it("mang deadlineAt ĐẦY ĐỦ GIỜ — cùng nguồn với màn NV 3D, không phải bản đã cắt giờ", () => {
    const view = toDesign3DAssignmentView(raw({ deadlineAt: "2026-08-10T07:00:00.000Z" }), toVnYmd);
    // 07:00 UTC = 14:00 giờ VN — đúng giờ, không phải "00:00" (lỗi cắt ngày trần cũ).
    expect(view?.deadlineAt?.toISOString()).toBe("2026-08-10T07:00:00.000Z");
  });

  it("thiếu deadlineAt (dữ liệu cũ) → null, không ném lỗi", () => {
    expect(toDesign3DAssignmentView(raw({ deadlineAt: null }), toVnYmd)?.deadlineAt).toBeNull();
    expect(toDesign3DAssignmentView(raw({ deadlineAt: undefined }), toVnYmd)?.deadlineAt).toBeNull();
  });

  it("deadlineAt rác → null, không ném lỗi (cùng quy tắc với completedAt rác)", () => {
    expect(toDesign3DAssignmentView(raw({ deadlineAt: "khong-phai-ngay" }), toVnYmd)?.deadlineAt).toBeNull();
  });
});

describe("Duyệt xong thì CHỐT giờ thực tế, không để nó tính lại", () => {
  // Giờ thực tế của lượt cũ được SUY RA lúc hiển thị, và suy ra thì dùng lịch ĐANG ACTIVE — nên
  // admin sửa ca là con số của một đơn ĐÃ DUYỆT đổi theo. Số liệu đã chốt mà vẫn trôi.
  const vn = (iso: string) => new Date(`${iso}+07:00`);

  const freeze = (o: Partial<Parameters<typeof resolveActualMinutesFreeze>[0]> = {}) =>
    resolveActualMinutesFreeze({
      decision: "ACCEPT",
      actualMinutes: null,
      completedAt: vn("2026-08-10T11:00"),
      acknowledgedAt: vn("2026-08-10T09:00"),
      assignedAt: vn("2026-08-10T08:00"),
      ...o,
    });

  it("ACCEPT + cột trống → đóng dấu con số đo được", () => {
    expect(freeze()).toBe(120);
  });

  it("đo từ mốc NHẬN VIỆC, cùng gốc với lúc NV gửi kết quả", () => {
    // Nếu chốt bằng mốc giao mà lúc gửi kết quả lại đóng dấu bằng mốc nhận việc thì cùng một
    // lượt sẽ có hai con số tuỳ đường nào chạy trước.
    expect(freeze({ acknowledgedAt: vn("2026-08-10T10:00") })).toBe(60);
  });

  it("chưa có mốc nhận việc → rơi về mốc giao", () => {
    expect(freeze({ acknowledgedAt: null })).toBe(180);
  });

  it("cột ĐÃ có số dương → KHÔNG ghi đè", () => {
    // Số đó đóng dấu lúc NV gửi kết quả, đo bằng lịch của chính lượt đó. Ghi lại bây giờ bằng
    // lịch hiện tại là làm trôi đúng con số vừa cố định.
    expect(freeze({ actualMinutes: 95 })).toBeNull();
  });

  it("cột = 0 (rác code cũ) → VẪN ghi, vì 0 không phải phép đo", () => {
    expect(freeze({ actualMinutes: 0 })).toBe(120);
  });

  it("REWORK → không chốt gì, việc còn phải làm lại", () => {
    expect(freeze({ decision: "REWORK" })).toBeNull();
  });

  it("chưa hoàn tất → không có gì để chốt", () => {
    expect(freeze({ completedAt: null })).toBeNull();
  });

  it("không có mốc nào để đo → null, không ghi 0 vào cột", () => {
    expect(freeze({ acknowledgedAt: null, assignedAt: null })).toBeNull();
  });

  it("khoảng đo nằm trọn ngoài giờ làm → null, không đóng dấu 0", () => {
    expect(freeze({
      acknowledgedAt: vn("2026-08-10T20:00"),
      completedAt: vn("2026-08-10T22:00"),
    })).toBeNull();
  });

  it("dùng lịch của CHÍNH lượt đó khi được truyền vào", () => {
    expect(freeze({
      acknowledgedAt: vn("2026-08-10T11:00"),
      completedAt: vn("2026-08-10T14:00"),
      calendar: { weeklyDaysOff: [0], holidays: [], sessions: [{ start: "08:00", end: "18:00" }] },
    })).toBe(180); // lịch này không nghỉ trưa; lịch mặc định sẽ ra 120
  });
});

describe("Nhãn ghi vào Lịch sử thay đổi của đơn", () => {
  it("khác nhau giữa hai quyết định", () => {
    expect(reviewHistoryComment("ACCEPT")).not.toBe(reviewHistoryComment("REWORK"));
  });
});

// ─── Duyệt xong → File Render thành file chính thức của MO ───────────────────
//
// Ghi đè designFileUrl là hành động MẤT DỮ LIỆU nếu quyết định sai, và nó chạy tự động sau
// lưng người dùng. Nên từng nhánh quyết định phải có test.
describe("Đẩy File Render về MO sau khi duyệt", () => {
  const base = { renderInfoUrl: "https://drive.google.com/file/d/RENDER/view", currentDesignFileUrl: null };

  it("ACCEPT + có link render → trả link để ghi vào MO", () => {
    expect(resolveDesignFilePush({ ...base, decision: "ACCEPT" })).toBe(base.renderInfoUrl);
  });

  it("REWORK → KHÔNG ghi: chưa được chấp nhận thì chưa phải bản chính thức", () => {
    expect(resolveDesignFilePush({ ...base, decision: "REWORK" })).toBeNull();
  });

  it("NV chưa nộp link nào → không có gì để đẩy", () => {
    expect(resolveDesignFilePush({ decision: "ACCEPT", renderInfoUrl: null, currentDesignFileUrl: "https://cu" })).toBeNull();
    expect(resolveDesignFilePush({ decision: "ACCEPT", renderInfoUrl: "   ", currentDesignFileUrl: null })).toBeNull();
  });

  it("link y hệt link MO đang có → không ghi, tránh dòng lịch sử rỗng nghĩa", () => {
    expect(resolveDesignFilePush({
      decision: "ACCEPT",
      renderInfoUrl: "  https://x/y  ",
      currentDesignFileUrl: "https://x/y",
    })).toBeNull();
  });

  it("MO đã có file cũ khác → GHI ĐÈ (bản vừa duyệt mới là bản chính thức)", () => {
    expect(resolveDesignFilePush({
      decision: "ACCEPT",
      renderInfoUrl: "https://moi",
      currentDesignFileUrl: "https://cu",
    })).toBe("https://moi");
  });
});

// ─── Tóm tắt kết quả 3D cho bảng Danh sách đơn hàng ──────────────────────────
//
// Ba giá trị gộp theo ba cách khác nhau, và gộp sai thì cột hiện ra một con số/nhãn trông hợp
// lệ mà nói dối — không có gì báo lỗi. Nên từng quy tắc gộp phải có test.
describe("Tóm tắt kết quả 3D của một MO cho bảng đơn hàng", () => {
  const d = (iso: string) => new Date(iso);
  const acc = (completedAt: Date, kpi: "ON_TIME" | "LATE") =>
    ({ reviewStatus: "ACCEPTED" as const, completedAt, kpiStatus: kpi });

  it("chưa ai nộp gì → null hết, cột để trống", () => {
    const s = summarizeDesign3DForOrder([{ reviewStatus: null, completedAt: null, kpiStatus: null }]);
    expect(s.reviewStatus).toBeNull();
    expect(s.completedAt).toBeNull();
  });

  it("ĐÃ NỘP nhưng CHƯA DUYỆT → hiện 'Chờ kiểm', KHÔNG để trống", () => {
    // Đây là lỗ hổng của bản trước: chỉ nhận lượt đã duyệt nên trạng thái cần Order hành động
    // nhất lại hiện y hệt "chưa ai làm gì".
    const s = summarizeDesign3DForOrder([
      { reviewStatus: "PENDING_REVIEW", completedAt: d("2026-08-04T10:00:00Z"), kpiStatus: "ON_TIME" },
    ]);
    expect(s.reviewStatus).toBe("PENDING_REVIEW");
  });

  it("chưa duyệt thì KHÔNG đẩy số liệu ra bảng", () => {
    const s = summarizeDesign3DForOrder([
      { reviewStatus: "PENDING_REVIEW", completedAt: d("2026-08-04T10:00:00Z"), kpiStatus: "LATE" },
    ]);
    expect(s.completedAt).toBeNull();
    expect(s.kpiStatus).toBeNull();
  });

  it("dữ liệu cũ: có kết quả mà reviewStatus null → suy ra 'Chờ kiểm'", () => {
    const s = summarizeDesign3DForOrder([
      { reviewStatus: null, completedAt: d("2026-08-04T10:00:00Z"), kpiStatus: "ON_TIME" },
    ]);
    expect(s.reviewStatus).toBe("PENDING_REVIEW");
  });

  it("một người chờ duyệt + một người làm lại → 'Chờ kiểm' (việc của Order nổi lên)", () => {
    const s = summarizeDesign3DForOrder([
      { reviewStatus: "REWORK", completedAt: d("2026-08-03T10:00:00Z"), kpiStatus: "LATE" },
      { reviewStatus: "PENDING_REVIEW", completedAt: d("2026-08-05T10:00:00Z"), kpiStatus: "ON_TIME" },
    ]);
    expect(s.reviewStatus).toBe("PENDING_REVIEW");
  });

  it("một người đã duyệt + một người còn chờ → KHÔNG báo 'Đã duyệt'", () => {
    const s = summarizeDesign3DForOrder([
      acc(d("2026-08-03T10:00:00Z"), "ON_TIME"),
      { reviewStatus: "PENDING_REVIEW", completedAt: d("2026-08-05T10:00:00Z"), kpiStatus: "ON_TIME" },
    ]);
    expect(s.reviewStatus).toBe("PENDING_REVIEW");
  });

  it("mọi người đã duyệt → ngày HT lấy MUỘN NHẤT", () => {
    const s = summarizeDesign3DForOrder([
      acc(d("2026-08-04T10:00:00Z"), "ON_TIME"),
      acc(d("2026-08-06T09:00:00Z"), "ON_TIME"),
    ]);
    expect(s.reviewStatus).toBe("ACCEPTED");
    expect(s.completedAt).toEqual(d("2026-08-06T09:00:00Z"));
  });

  it("mọi người đã duyệt → TRỄ nếu có BẤT KỲ ai trễ, kể cả người cuối đúng hạn", () => {
    // Lấy theo người cuối sẽ giấu mất người trễ và cột KPI hoá ra nói dối.
    const s = summarizeDesign3DForOrder([
      acc(d("2026-08-04T10:00:00Z"), "LATE"),
      acc(d("2026-08-06T09:00:00Z"), "ON_TIME"),
    ]);
    expect(s.kpiStatus).toBe("LATE");
  });
});

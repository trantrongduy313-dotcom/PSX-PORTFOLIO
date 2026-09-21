import { describe, expect, it } from "vitest";

import {
  countPendingReview,
  design3DPanelAction,
  isPendingReview,
  isReviewAccepted,
  isReworkRequested,
  type PanelActionRow,
  type ReviewQueueRow,
} from "@/app/lib/business/kpi-3d/review-queue";

// Thẻ đếm "Chờ kiểm" là một LỜI NHẮC VIỆC. Đếm thiếu thì Order tưởng đã duyệt hết và đơn nằm
// đó không ai biết; đếm thừa thì họ đi tìm một việc không tồn tại rồi thôi không tin nó nữa.
// Cả hai kiểu sai đều IM LẶNG — không có lỗi nào bật ra. Nên từng quy tắc phải có test.

const row = (o: Partial<ReviewQueueRow> = {}): ReviewQueueRow => ({
  status: "SENT_RESULT",
  completedAt: new Date("2026-08-09T10:00:00.000Z"),
  reviewStatus: "PENDING_REVIEW",
  ...o,
});

describe("Đang chờ Order/Admin duyệt", () => {
  it("đã nộp, đã đánh dấu chờ kiểm → có", () => {
    expect(isPendingReview(row())).toBe(true);
  });

  it("DỮ LIỆU CŨ: có kết quả mà reviewStatus NULL vẫn là đang chờ duyệt", () => {
    // Mọi lượt hoàn tất TRƯỚC khi có tính năng kiểm đều mang NULL. Đọc thẳng cột thì đúng
    // những việc tồn đọng lâu nhất lại vô hình — hỏng đúng mục đích của thẻ đếm.
    expect(isPendingReview(row({ reviewStatus: null }))).toBe(true);
  });

  it("chưa nộp kết quả → không phải việc của Order", () => {
    expect(isPendingReview(row({ completedAt: null, reviewStatus: null }))).toBe(false);
  });

  it("đã duyệt rồi → không còn chờ", () => {
    expect(isPendingReview(row({ reviewStatus: "ACCEPTED" }))).toBe(false);
  });

  it("đã trả về làm lại → chờ NV 3D, KHÔNG chờ Order", () => {
    // Gộp vào thẻ đếm sẽ cho Order một con số họ không thể tự đưa về 0 — và một lời nhắc
    // không xử lý hết được thì người ta học cách phớt lờ nó.
    expect(isPendingReview(row({ reviewStatus: "REWORK" }))).toBe(false);
  });

  it("lượt ĐÃ HUỶ / ĐÃ GIAO LẠI dù có kết quả cũng không ai phải duyệt", () => {
    expect(isPendingReview(row({ status: "CANCELLED" }))).toBe(false);
    expect(isPendingReview(row({ status: "REASSIGNED", reviewStatus: null }))).toBe(false);
  });

  it("nhận chuỗi ISO như API trả về, không chỉ Date", () => {
    expect(isPendingReview(row({ completedAt: "2026-08-09T10:00:00.000Z", reviewStatus: null }))).toBe(true);
  });
});

describe("Hai trục còn lại", () => {
  it("đã nhận kết quả", () => {
    expect(isReviewAccepted(row({ reviewStatus: "ACCEPTED" }))).toBe(true);
    expect(isReviewAccepted(row())).toBe(false);
  });

  it("đang bị trả về làm lại", () => {
    expect(isReworkRequested(row({ reviewStatus: "REWORK" }))).toBe(true);
    expect(isReworkRequested(row())).toBe(false);
  });

  it("lượt đã huỷ không nằm trong 'đang làm lại'", () => {
    expect(isReworkRequested(row({ status: "CANCELLED", reviewStatus: "REWORK" }))).toBe(false);
  });

  it("BA TRỤC LOẠI TRỪ NHAU — một lượt không bao giờ rơi vào hai nhóm", () => {
    const rows = [
      row(),
      row({ reviewStatus: "ACCEPTED" }),
      row({ reviewStatus: "REWORK" }),
      row({ completedAt: null, reviewStatus: null }),
    ];
    for (const r of rows) {
      const hits = [isPendingReview(r), isReviewAccepted(r), isReworkRequested(r)].filter(Boolean);
      expect(hits.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("Đếm cho thẻ ở đầu màn", () => {
  it("chỉ đếm lượt đang chờ duyệt", () => {
    expect(countPendingReview([
      row(),
      row({ reviewStatus: null }),          // dữ liệu cũ — vẫn tính
      row({ reviewStatus: "ACCEPTED" }),
      row({ reviewStatus: "REWORK" }),
      row({ status: "CANCELLED" }),
      row({ completedAt: null, reviewStatus: null }),
    ])).toBe(2);
  });

  it("danh sách rỗng → 0, không phải NaN", () => {
    expect(countPendingReview([])).toBe(0);
  });
});

describe("Khối nào hiện trong panel chi tiết", () => {
  const panel = (o: Partial<PanelActionRow> = {}): PanelActionRow => ({
    status: "IN_PROGRESS",
    completedAt: null,
    reviewStatus: null,
    acknowledgedAt: new Date("2026-08-01T10:00:00.000Z"),
    ...o,
  });

  it("LỖI ĐÃ SỬA: đã nộp kết quả mà chưa từng bấm nhận việc → KHÔNG hiện nút nhận việc", () => {
    // Bước "xác nhận nhận việc" thêm về sau, nên mọi lượt hoàn tất trước đó mang
    // acknowledgedAt = NULL vĩnh viễn. Mời người ta nhận một việc đã làm xong là vô nghĩa.
    expect(design3DPanelAction(panel({
      status: "SENT_RESULT",
      completedAt: new Date("2026-08-03T18:10:00.000Z"),
      acknowledgedAt: null,
    }))).toBe("AWAITING_REVIEW");
  });

  it("đã nộp, đã nhận việc → cũng là đang chờ duyệt", () => {
    expect(design3DPanelAction(panel({
      status: "SENT_RESULT",
      completedAt: new Date("2026-08-03T18:10:00.000Z"),
      reviewStatus: "PENDING_REVIEW",
    }))).toBe("AWAITING_REVIEW");
  });

  it("BỊ TRẢ VỀ LÀM LẠI → mở lại form, dù completedAt vẫn còn nguyên", () => {
    // Quy tắc "đóng dấu một lần" GIỮ completedAt của lần nộp đầu. Nếu chặn theo completedAt
    // thì lượt bị trả về sẽ không bao giờ hiện lại form và NV 3D hết đường nộp bản sửa.
    expect(design3DPanelAction(panel({
      status: "IN_PROGRESS",
      completedAt: new Date("2026-08-03T18:10:00.000Z"),
      reviewStatus: "REWORK",
    }))).toBe("PROGRESS");
  });

  it("bị trả về làm lại nhưng CHƯA nhận việc → vẫn phải xác nhận trước", () => {
    // Server chặn ghi tiến độ khi chưa nhận việc; hiện form ở đây là mời làm việc sẽ bị chối.
    expect(design3DPanelAction(panel({
      completedAt: new Date("2026-08-03T18:10:00.000Z"),
      reviewStatus: "REWORK",
      acknowledgedAt: null,
    }))).toBe("ACKNOWLEDGE");
  });

  it("chưa làm gì, chưa nhận việc → hiện nút nhận việc", () => {
    expect(design3DPanelAction(panel({ status: "ASSIGNED", acknowledgedAt: null }))).toBe("ACKNOWLEDGE");
  });

  it("đang làm, đã nhận việc → hiện form", () => {
    expect(design3DPanelAction(panel())).toBe("PROGRESS");
  });

  it("lượt đã đóng thắng mọi nhánh khác", () => {
    expect(design3DPanelAction(panel({
      status: "CANCELLED",
      completedAt: new Date("2026-08-03T18:10:00.000Z"),
      acknowledgedAt: null,
    }))).toBe("CLOSED");
  });

  it("đã được duyệt xong mà chưa từng nhận việc → CŨNG không hiện nút nhận việc", () => {
    // Cùng lớp lỗi với ca đầu: duyệt xong rồi thì mời "nhận việc" lại càng vô nghĩa.
    expect(design3DPanelAction(panel({
      status: "SENT_RESULT",
      completedAt: new Date("2026-08-03T18:10:00.000Z"),
      reviewStatus: "ACCEPTED",
      acknowledgedAt: null,
    }))).toBe("DONE");
  });

  it("đã duyệt xong thì KHOÁ form — sửa tiếp phải đi qua 'Yêu cầu làm lại'", () => {
    // Sau khi Order nhận kết quả, File Render đã thành File 3D chính thức của MO. Cho sửa
    // tiếp mà không ai duyệt lại là âm thầm đổi thứ đã được chấp nhận.
    expect(design3DPanelAction(panel({
      status: "SENT_RESULT",
      completedAt: new Date("2026-08-03T18:10:00.000Z"),
      reviewStatus: "ACCEPTED",
    }))).toBe("DONE");
  });
});

import { describe, expect, it } from "vitest";

import {
  acknowledgeBadge,
  design3DLifecycleBadge,
  formatDeadlineDistance,
  formatElapsed,
  kpiResultBadge,
  progressBadge,
  reviewBadge,
  type LifecycleRow,
} from "@/app/lib/business/kpi-3d/display";
import { TONE_CHIP, TONE_HEX, TONE_TEXT_CLASS } from "@/app/lib/ui/status-tone";

// VÌ SAO CÓ TEST NÀY: nhãn đã gom về module business nhưng MÀU thì hardcode tại từng chỗ dùng
// — `#15803d` bốn lần trong design-3d-client, `text-green-700` rải khắp order-detail-panel, và
// hai màn dùng hai hệ style khác nhau nên cùng một trạng thái hiện ra hai sắc xanh.
//
// Tệ hơn, panel từng quyết định màu bằng cách SO SÁNH CHUỖI NHÃN:
//     ketQuaLabel === "Đúng hạn" ? "text-green-700" : ...
// Đổi một chữ trong nhãn là màu vỡ âm thầm. Test dưới chốt lại: nhãn và tông là HAI thứ, UI
// tra tông chứ không suy từ chữ.

describe("Kết quả KPI", () => {
  it("đúng hạn → tông positive, trễ hạn → critical", () => {
    expect(kpiResultBadge("ON_TIME")).toEqual({ label: "Đúng hạn", tone: "positive" });
    expect(kpiResultBadge("LATE")).toEqual({ label: "Trễ hạn", tone: "critical" });
  });

  it("chưa có kết quả → neutral, nhãn gạch ngang", () => {
    expect(kpiResultBadge(null)).toEqual({ label: "—", tone: "neutral" });
    expect(kpiResultBadge(undefined).tone).toBe("neutral");
  });
});

describe("Kiểm nội bộ", () => {
  it("chờ kiểm → WARNING chứ không phải neutral: đây là việc CẦN AI ĐÓ LÀM", () => {
    // Neutral sẽ khiến nó lẫn vào các ô trống, Order không thấy mà xử lý.
    expect(reviewBadge("PENDING_REVIEW")).toEqual({ label: "Chờ kiểm", tone: "warning" });
  });

  it("đã nhận → positive, yêu cầu làm lại → critical", () => {
    expect(reviewBadge("ACCEPTED").tone).toBe("positive");
    expect(reviewBadge("REWORK").tone).toBe("critical");
  });

  it("chưa có phán quyết → neutral", () => {
    expect(reviewBadge(null).tone).toBe("neutral");
  });
});

describe("Trạng thái thực hiện — tách 'chưa nhận việc' khỏi 'đã nhận, chưa bắt đầu'", () => {
  // Trước đây CẢ HAI đều hiện "Chưa bắt đầu" màu xám, nên Order không phân biệt được người
  // chưa hề biết có việc với người đang đọc yêu cầu.
  it("chưa nhận việc → 'Chưa nhận việc', tông warning (cần nhắc)", () => {
    expect(progressBadge({ assignmentStatus: "ASSIGNED", acknowledged: false })).toEqual({
      label: "Chưa nhận việc",
      tone: "warning",
    });
  });

  it("đã nhận nhưng chưa ghi tiến độ → nhãn KHÁC, tông info (bình thường)", () => {
    expect(progressBadge({ assignmentStatus: "ASSIGNED", acknowledged: true })).toEqual({
      label: "Đã nhận, chưa bắt đầu",
      tone: "info",
    });
  });

  it("đã có dòng tiến độ → lấy nhãn theo dòng mới nhất", () => {
    expect(progressBadge({ assignmentStatus: "IN_PROGRESS", latestProgressStatus: "IN_PROGRESS", acknowledged: true }))
      .toEqual({ label: "Đang thiết kế", tone: "info" });
    expect(progressBadge({ assignmentStatus: "WAITING_INFO", latestProgressStatus: "WAITING_INFO", acknowledged: true }).tone)
      .toBe("warning");
    expect(progressBadge({ assignmentStatus: "SENT_RESULT", latestProgressStatus: "SENT_RESULT", acknowledged: true }).tone)
      .toBe("positive");
  });

  it.each([
    ["CANCELLED", "Đã hủy"],
    ["REASSIGNED", "Đã giao lại"],
  ])("lượt đã đóng (%s) → nhãn %s, tông neutral, KHÔNG bị nhãn tiến độ ghi đè", (status, label) => {
    // Lượt đã giao lại vẫn còn dòng tiến độ cũ; trạng thái đóng phải thắng.
    const badge = progressBadge({ assignmentStatus: status, latestProgressStatus: "SENT_RESULT", acknowledged: true });
    expect(badge).toEqual({ label, tone: "neutral" });
  });
});

describe("Nhận việc", () => {
  it("có mốc → positive, chưa có → warning để Order đi nhắc", () => {
    expect(acknowledgeBadge(new Date())).toEqual({ label: "Đã nhận việc", tone: "positive" });
    expect(acknowledgeBadge(null)).toEqual({ label: "Chưa nhận việc", tone: "warning" });
  });
});

describe("Bảng tông — mỗi tông phải có biểu diễn ở CẢ HAI hệ style", () => {
  it("không tông nào bị thiếu, tránh undefined lọt vào style", () => {
    const tones = Object.keys(TONE_HEX) as Array<keyof typeof TONE_HEX>;
    for (const tone of tones) {
      expect(TONE_HEX[tone], `TONE_HEX thiếu ${tone}`).toBeTruthy();
      expect(TONE_TEXT_CLASS[tone], `TONE_TEXT_CLASS thiếu ${tone}`).toBeTruthy();
    }
    // Hai bảng phải cùng bộ khoá — lệch nhau là một màn thiếu màu cho một trạng thái.
    expect(Object.keys(TONE_TEXT_CLASS).sort()).toEqual(tones.sort());
  });

  it("bảng chip cũng phải đủ tông, và đủ CẢ BA phần nền/chữ/viền", () => {
    for (const tone of Object.keys(TONE_HEX) as Array<keyof typeof TONE_HEX>) {
      const chip = TONE_CHIP[tone];
      expect(chip, `TONE_CHIP thiếu ${tone}`).toBeTruthy();
      // Thiếu một phần thì chip ra nền trong suốt hoặc viền mất — lỗi chỉ thấy bằng mắt.
      expect(chip.bg).toBeTruthy();
      expect(chip.fg).toBeTruthy();
      expect(chip.border).toBeTruthy();
    }
  });
});

// ─── Một thang trạng thái duy nhất ───────────────────────────────────────────
// Bảng từng có HAI cột trạng thái, và khi NV vừa nộp bài chúng sơn CÙNG MỘT thời điểm bằng
// hai màu đối nghịch: "Đã gửi kết quả" tone positive (xanh, nghĩa xong) cạnh "Chờ kiểm" tone
// warning (hổ phách, nghĩa cần xử lý). Test dưới chốt lại: một thời điểm, một nhãn, một tông.

describe("Thang trạng thái của cột Tình trạng", () => {
  const row = (o: Partial<LifecycleRow> = {}): LifecycleRow => ({
    status: "IN_PROGRESS",
    completedAt: null,
    reviewStatus: null,
    acknowledgedAt: new Date("2026-08-01T10:00:00.000Z"),
    latestProgressStatus: "IN_PROGRESS",
    ...o,
  });

  it("vừa nộp bài → MỘT nhãn 'Chờ kiểm' tone warning, KHÔNG còn 'Đã gửi kết quả' màu xanh", () => {
    // Đây là lỗi đọc thật của bản hai cột: mắt bắt xanh lá trước rồi kết luận việc đã xong,
    // trong khi thực tế đang có người phải duyệt.
    expect(design3DLifecycleBadge(row({
      status: "SENT_RESULT",
      completedAt: new Date("2026-08-03T18:10:00.000Z"),
      reviewStatus: "PENDING_REVIEW",
      latestProgressStatus: "SENT_RESULT",
    }))).toEqual({ label: "Chờ kiểm", tone: "warning" });
  });

  it("DỮ LIỆU CŨ: đã nộp mà reviewStatus NULL vẫn ra 'Chờ kiểm'", () => {
    expect(design3DLifecycleBadge(row({
      status: "SENT_RESULT",
      completedAt: new Date("2026-08-03T18:10:00.000Z"),
      latestProgressStatus: "SENT_RESULT",
    })).label).toBe("Chờ kiểm");
  });

  it("nộp rồi mà completedAt chưa kịp có → vẫn 'Chờ kiểm', không tụt về 'Chưa bắt đầu'", () => {
    // Sai một chặng về phía an toàn thì hơn là làm mất việc khỏi hàng đợi duyệt.
    expect(design3DLifecycleBadge(row({
      latestProgressStatus: "SENT_RESULT",
      completedAt: null,
    })).label).toBe("Chờ kiểm");
  });

  it("đã duyệt → positive; bị trả về → critical", () => {
    expect(design3DLifecycleBadge(row({
      completedAt: new Date("2026-08-03T18:10:00.000Z"),
      reviewStatus: "ACCEPTED",
    }))).toEqual({ label: "Đã duyệt", tone: "positive" });
    expect(design3DLifecycleBadge(row({
      completedAt: new Date("2026-08-03T18:10:00.000Z"),
      reviewStatus: "REWORK",
      latestProgressStatus: "SENT_RESULT",
    }))).toEqual({ label: "Yêu cầu làm lại", tone: "critical" });
  });

  it("TRỤC KIỂM THẮNG TRỤC TIẾN ĐỘ: bị trả về thì không hiện 'Đã gửi kết quả'", () => {
    // Dòng tiến độ mới nhất vẫn là SENT_RESULT của lần nộp đầu; thứ cần biết là ai phải
    // hành động tiếp, không phải NV đã làm gì lần trước.
    expect(design3DLifecycleBadge(row({
      completedAt: new Date("2026-08-03T18:10:00.000Z"),
      reviewStatus: "REWORK",
      latestProgressStatus: "SENT_RESULT",
    })).label).not.toBe("Đã gửi kết quả");
  });

  it("chưa nhận việc thắng trục tiến độ — đó mới là việc cần làm", () => {
    expect(design3DLifecycleBadge(row({ acknowledgedAt: null }))).toEqual({
      label: "Chưa nhận việc", tone: "warning",
    });
  });

  it("nhãn bảng NGẮN: 'Chờ phản hồi', không phải câu đầy đủ ở panel", () => {
    const badge = design3DLifecycleBadge(row({ latestProgressStatus: "WAITING_INFO" }));
    expect(badge).toEqual({ label: "Chờ phản hồi", tone: "warning" });
    expect(badge.label).not.toContain("thông tin");
  });

  it("đang thiết kế → info; chưa có dòng nào → 'Chưa bắt đầu'", () => {
    expect(design3DLifecycleBadge(row())).toEqual({ label: "Đang thiết kế", tone: "info" });
    expect(design3DLifecycleBadge(row({ latestProgressStatus: null })).label).toBe("Chưa bắt đầu");
  });

  it("đã huỷ / đã giao lại thắng mọi nhánh khác", () => {
    expect(design3DLifecycleBadge(row({
      status: "CANCELLED",
      completedAt: new Date("2026-08-03T18:10:00.000Z"),
      reviewStatus: "PENDING_REVIEW",
    }))).toEqual({ label: "Đã hủy", tone: "neutral" });
    expect(design3DLifecycleBadge(row({ status: "REASSIGNED" })).label).toBe("Đã giao lại");
  });
});

describe("Nhãn không được đụng nghĩa nhau", () => {
  it("ACCEPTED là 'Đã duyệt', KHÔNG phải 'Đã nhận'", () => {
    // Nhãn cũ đụng với "nhận việc" của NV 3D: panel từng có ba trường cùng dùng chữ "nhận"
    // với ba nghĩa khác nhau, người đọc không phân biệt được bằng mắt.
    expect(reviewBadge("ACCEPTED").label).toBe("Đã duyệt");
    expect(reviewBadge("ACCEPTED").label).not.toContain("nhận");
  });

  it("nhãn nhận việc vẫn nói về việc bàn giao, không lẫn sang trục kiểm", () => {
    expect(acknowledgeBadge(null).label).toBe("Chưa nhận việc");
    expect(acknowledgeBadge(new Date()).label).toBe("Đã nhận việc");
  });
});

describe("Đã trôi qua bao lâu", () => {
  const now = new Date("2026-08-10T10:00:00.000Z");

  it("phút / giờ / ngày", () => {
    expect(formatElapsed(new Date("2026-08-10T09:55:00.000Z"), now)).toBe("5 phút");
    expect(formatElapsed(new Date("2026-08-10T07:00:00.000Z"), now)).toBe("3 giờ");
    expect(formatElapsed(new Date("2026-08-08T10:00:00.000Z"), now)).toBe("2 ngày");
  });

  it("mốc ở TƯƠNG LAI không ra số âm", () => {
    // Lệch giờ giữa máy chủ và trình duyệt có thể cho assignedAt nhỏ hơn now vài giây.
    // "đã -1 phút kể từ lúc giao" là câu vô nghĩa lọt thẳng ra mặt người dùng.
    expect(formatElapsed(new Date("2026-08-10T10:05:00.000Z"), now)).toBe("0 phút");
  });
});

describe("Khoảng cách tới deadline", () => {
  const now = new Date("2026-08-10T10:00:00.000Z");
  const at = (iso: string) => formatDeadlineDistance(new Date(iso), now);

  it("còn hạn → 'còn …'; quá hạn → 'trễ …'", () => {
    expect(at("2026-08-12T10:00:00.000Z")).toBe("còn 2 ngày");
    expect(at("2026-08-10T13:00:00.000Z")).toBe("còn 3 giờ");
    expect(at("2026-08-10T07:00:00.000Z")).toBe("trễ 3 giờ");
    expect(at("2026-08-07T10:00:00.000Z")).toBe("trễ 3 ngày");
  });

  it("dưới một giờ nói theo PHÚT — 'còn 0 giờ' là câu vô nghĩa đúng lúc gấp nhất", () => {
    expect(at("2026-08-10T10:40:00.000Z")).toBe("còn 40 phút");
    expect(at("2026-08-10T09:45:00.000Z")).toBe("trễ 15 phút");
  });

  it("đúng ranh giới không nhảy sang đơn vị lớn hơn", () => {
    expect(at("2026-08-10T11:00:00.000Z")).toBe("còn 1 giờ");
    expect(at("2026-08-11T10:00:00.000Z")).toBe("còn 1 ngày");
  });
});

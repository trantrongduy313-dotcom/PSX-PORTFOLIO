import { describe, expect, it } from "vitest";

import {
  DESIGN_PRIORITY_CODES,
  designPriorityChipLabel,
  designPriorityNeedsAttention,
  designPriorityRank,
  isUrgentDesign,
  toDesignPriority,
} from "@/app/lib/business/kpi-3d/design-priority";
import { compareAssignmentsForQueue, type QueueRow } from "@/app/lib/business/kpi-3d/queue-order";

// Ưu tiên THIẾT KẾ là trục RIÊNG, không phải bản sao ưu tiên đơn hàng: hai con số trả lời hai câu
// khác nhau, do hai người khác nhau đặt. Toàn bộ file canh việc chúng không dính vào nhau.

describe("toDesignPriority", () => {
  it("ba bậc hợp lệ giữ nguyên", () => {
    expect(toDesignPriority("UT1")).toBe("UT1");
    expect(toDesignPriority("UT2")).toBe("UT2");
    expect(toDesignPriority("Normal")).toBe("Normal");
  });

  // ⚠️ Thang này CHỈ có ba bậc. "SR" là của thang đơn hàng — nếu ai đó chép giá trị từ trục kia
  // sang thì nó phải rơi về Normal, không được làm vỡ giao diện hay lọt vào ô chọn.
  it('"SR" của đơn hàng → Normal, không lọt sang trục thiết kế', () => {
    expect(toDesignPriority("SR")).toBe("Normal");
    expect(DESIGN_PRIORITY_CODES).not.toContain("SR");
  });

  it("rỗng / null / rác → Normal, để dữ liệu cũ xếp y như trước", () => {
    expect(toDesignPriority(null)).toBe("Normal");
    expect(toDesignPriority(undefined)).toBe("Normal");
    expect(toDesignPriority("")).toBe("Normal");
    expect(toDesignPriority("ut1")).toBe("Normal"); // phân biệt chữ hoa — đúng như cột lưu
  });
});

describe("designPriorityChipLabel", () => {
  // Trên cùng một dòng còn có chip ưu tiên ĐƠN HÀNG, cũng ghi "UT1". Hai chip trơ giống nhau thì
  // người dùng đọc sai đúng lúc cần đọc đúng.
  it("luôn mang chữ 3D để không lẫn với chip ưu tiên đơn", () => {
    expect(designPriorityChipLabel("UT1")).toBe("3D · UT1");
    expect(designPriorityChipLabel("UT2")).toBe("3D · UT2");
  });

  it("Normal → null: không dán chip lên mọi dòng", () => {
    expect(designPriorityChipLabel("Normal")).toBeNull();
    expect(designPriorityChipLabel(null)).toBeNull();
  });
});

describe("isUrgentDesign", () => {
  it("chỉ UT1/UT2 là gấp", () => {
    expect(isUrgentDesign("UT1")).toBe(true);
    expect(isUrgentDesign("UT2")).toBe(true);
    expect(isUrgentDesign("Normal")).toBe(false);
    expect(isUrgentDesign(null)).toBe(false);
  });
});

// ⚠️ CÁI BẪY CỦA CẢ TÍNH NĂNG: ưu tiên 3D là trục riêng nên PHẢI CÓ NGƯỜI ĐẶT. Một MO gấp với
// khách mà chưa ai xếp ưu tiên thiết kế sẽ nằm giữa danh sách như đơn thường.
describe("designPriorityNeedsAttention — đơn gấp mà thiết kế chưa xếp ưu tiên", () => {
  it("đơn UT1 + thiết kế Normal → CẦN để ý", () => {
    expect(designPriorityNeedsAttention({ orderPriorityCode: "UT1", designPriorityCode: "Normal" })).toBe(true);
  });

  it("đơn UT2 + thiết kế chưa đặt → CẦN để ý", () => {
    expect(designPriorityNeedsAttention({ orderPriorityCode: "UT2", designPriorityCode: null })).toBe(true);
  });

  // Đã có người xếp rồi thì thôi — kể cả xếp thấp hơn đơn. Đó là quyết định của quản lý, không
  // phải sai sót: một đơn gấp với khách có thể chỉ cần sửa nhẹ bản 3D cũ.
  it("thiết kế đã được xếp gấp → KHÔNG nhắc nữa", () => {
    expect(designPriorityNeedsAttention({ orderPriorityCode: "UT1", designPriorityCode: "UT2" })).toBe(false);
  });

  it("đơn thường → không nhắc gì", () => {
    expect(designPriorityNeedsAttention({ orderPriorityCode: "Normal", designPriorityCode: "Normal" })).toBe(false);
    expect(designPriorityNeedsAttention({ orderPriorityCode: "SR", designPriorityCode: "Normal" })).toBe(false);
  });
});

// ─── THỨ TỰ HÀNG ĐỢI ─────────────────────────────────────────────────────────

const row = (over: Partial<QueueRow> = {}): QueueRow => ({
  status: "IN_PROGRESS",
  assignedAt: "2026-08-10T02:00:00.000Z",
  deadlineAt: "2026-08-20T02:00:00.000Z",
  completedAt: null,
  acknowledgedAt: "2026-08-10T03:00:00.000Z",
  ...over,
});

describe("compareAssignmentsForQueue — ưu tiên thiết kế chen vào đâu", () => {
  it("UT1 đứng trên UT2, UT2 trên Normal", () => {
    const rows = [
      row({ designPriorityCode: "Normal" }),
      row({ designPriorityCode: "UT1" }),
      row({ designPriorityCode: "UT2" }),
    ];
    expect([...rows].sort(compareAssignmentsForQueue).map((r) => r.designPriorityCode))
      .toEqual(["UT1", "UT2", "Normal"]);
  });

  // ⚠️ CÁI GIÁ CỦA ƯU TIÊN TAY, khoá lại bằng test để không ai "sửa cho hợp lý" mà không biết.
  it("UT1 hạn tuần sau đứng TRÊN Normal đã quá hạn — đúng định nghĩa ưu tiên tay", () => {
    const overdueNormal = row({ deadlineAt: "2026-08-01T02:00:00.000Z", designPriorityCode: "Normal" });
    const urgentLater = row({ deadlineAt: "2026-09-01T02:00:00.000Z", designPriorityCode: "UT1" });
    expect([overdueNormal, urgentLater].sort(compareAssignmentsForQueue)[0]).toBe(urgentLater);
  });

  // "Chưa nhận việc" KHÔNG phải công việc — nó là một cái bấm 5 giây. Nếu ưu tiên đè được nó thì
  // một đơn vừa giao có thể nằm ngoài tầm mắt cả ngày và người giao không biết NV đã thấy chưa.
  it("chưa nhận việc vẫn lên đầu, kể cả khi đơn khác là UT1", () => {
    const brandNew = row({ acknowledgedAt: null, designPriorityCode: "Normal" });
    const urgent = row({ designPriorityCode: "UT1" });
    expect([urgent, brandNew].sort(compareAssignmentsForQueue)[0]).toBe(brandNew);
  });

  it("đã hoàn tất vẫn dồn xuống cuối, kể cả UT1", () => {
    const doneUrgent = row({ completedAt: "2026-08-12T02:00:00.000Z", designPriorityCode: "UT1" });
    const running = row({ designPriorityCode: "Normal" });
    expect([doneUrgent, running].sort(compareAssignmentsForQueue)[0]).toBe(running);
  });

  it("không có ưu tiên → xếp y như trước (hạn gần nhất trước)", () => {
    const som = row({ deadlineAt: "2026-08-15T02:00:00.000Z" });
    const muon = row({ deadlineAt: "2026-08-25T02:00:00.000Z" });
    expect([muon, som].sort(compareAssignmentsForQueue)).toEqual([som, muon]);
  });

  it("cùng ưu tiên → hạn gần nhất trước", () => {
    const som = row({ deadlineAt: "2026-08-15T02:00:00.000Z", designPriorityCode: "UT1" });
    const muon = row({ deadlineAt: "2026-08-25T02:00:00.000Z", designPriorityCode: "UT1" });
    expect([muon, som].sort(compareAssignmentsForQueue)).toEqual([som, muon]);
  });
});

describe("designPriorityRank", () => {
  it("số nhỏ hơn = gấp hơn, nên sort tăng dần là đúng thứ tự cần làm", () => {
    expect(designPriorityRank("UT1")).toBeLessThan(designPriorityRank("UT2"));
    expect(designPriorityRank("UT2")).toBeLessThan(designPriorityRank("Normal"));
  });
});

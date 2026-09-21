import { describe, expect, it } from "vitest";

import {
  formatWorkloadLoad,
  workloadHours,
  isClosedAssignment,
  isOpenAssignment,
  isOverdueAssignment,
  summarizeDesignerWorkload,
  type WorkloadAssignment,
} from "@/app/lib/business/kpi-3d/workload";

// Tải công việc sai KHÔNG ném lỗi — nó chỉ hiện một con số trông hợp lệ, rồi Order dựa vào đó
// dồn việc cho nhầm người. Nên từng quy tắc gộp phải có test.

const NOW = new Date("2026-08-10T10:00:00.000Z");
const past = new Date("2026-08-09T10:00:00.000Z");
const future = new Date("2026-08-12T10:00:00.000Z");

function asg(o: Partial<WorkloadAssignment> = {}): WorkloadAssignment {
  return {
    status: "ASSIGNED",
    completedAt: null,
    deadlineAt: future,
    acknowledgedAt: new Date("2026-08-08T10:00:00.000Z"),
    standardMinutesSnapshot: 120,
    ...o,
  };
}

describe("Lượt nào còn là việc đang gánh", () => {
  it("đang giao, chưa xong → đang mở", () => {
    expect(isOpenAssignment(asg())).toBe(true);
  });

  it("đã giao lại / đã huỷ → KHÔNG còn là việc của ai", () => {
    expect(isClosedAssignment("REASSIGNED")).toBe(true);
    expect(isClosedAssignment("CANCELLED")).toBe(true);
    expect(isOpenAssignment(asg({ status: "REASSIGNED" }))).toBe(false);
  });

  it("đã nộp kết quả, đang CHỜ KIỂM → không tính vào tải của NV 3D", () => {
    // Việc còn lại là của Order/Admin. Tính vào tải NV là đổ oan — và nghịch lý là Order càng
    // chậm duyệt thì người đó trông càng bận, càng ít được giao việc mới.
    expect(isOpenAssignment(asg({ status: "SENT_RESULT", completedAt: past }))).toBe(false);
  });
});

describe("Quá hạn", () => {
  it("đang mở + qua deadline → quá hạn", () => {
    expect(isOverdueAssignment(asg({ deadlineAt: past }), NOW)).toBe(true);
  });

  it("đang mở + deadline còn xa → chưa quá hạn", () => {
    expect(isOverdueAssignment(asg({ deadlineAt: future }), NOW)).toBe(false);
  });

  it("LỖI CŨ ĐÃ SỬA: lượt ĐÃ HUỶ mà qua ngày thì KHÔNG phải quá hạn", () => {
    // Bản trong design-3d-client chỉ xét `!completedAt && deadline < now`, không loại lượt đã
    // đóng — nên việc đã huỷ vẫn bị đếm là quá hạn. Việc đã huỷ thì không thể trễ.
    expect(isOverdueAssignment(asg({ status: "CANCELLED", deadlineAt: past }), NOW)).toBe(false);
  });

  it("đã hoàn tất muộn → không còn là quá hạn (đó là việc của KPI, không phải của tải)", () => {
    expect(isOverdueAssignment(asg({ completedAt: past, deadlineAt: past }), NOW)).toBe(false);
  });
});

describe("Cộng tải của một nhân viên", () => {
  it("cộng số việc và TỔNG GIỜ, không chỉ đếm đầu việc", () => {
    // Một người ôm 1 việc 8 giờ nặng hơn người ôm 3 việc 1 giờ — đếm đầu việc sẽ xếp hạng ngược.
    const w = summarizeDesignerWorkload(
      [asg({ standardMinutesSnapshot: 480 }), asg({ standardMinutesSnapshot: 120 })],
      NOW,
    );
    expect(w.openCount).toBe(2);
    expect(w.openMinutes).toBe(600);
  });

  it("bỏ qua lượt đã đóng và lượt đã hoàn tất", () => {
    const w = summarizeDesignerWorkload(
      [asg(), asg({ status: "CANCELLED" }), asg({ completedAt: past })],
      NOW,
    );
    expect(w.openCount).toBe(1);
    expect(w.openMinutes).toBe(120);
  });

  it("đếm riêng việc quá hạn và việc chưa nhận", () => {
    const w = summarizeDesignerWorkload(
      [asg({ deadlineAt: past }), asg({ acknowledgedAt: null }), asg()],
      NOW,
    );
    expect(w.overdueCount).toBe(1);
    expect(w.unackedCount).toBe(1);
    expect(w.openCount).toBe(3);
  });

  it("số giờ chuẩn âm/rác không kéo tổng xuống dưới 0", () => {
    const w = summarizeDesignerWorkload(
      [asg({ standardMinutesSnapshot: -600 }), asg({ standardMinutesSnapshot: 120 })],
      NOW,
    );
    expect(w.openMinutes).toBe(120);
  });

  it("không có việc nào → tất cả bằng 0", () => {
    expect(summarizeDesignerWorkload([], NOW)).toEqual({
      openCount: 0, openMinutes: 0, overdueCount: 0, unackedCount: 0,
    });
  });
});

describe("Phần tải hiện bên phải tên trong ô chọn", () => {
  const w = (o: Partial<{ openCount: number; openMinutes: number; overdueCount: number; unackedCount: number }>) =>
    ({ openCount: 0, openMinutes: 0, overdueCount: 0, unackedCount: 0, ...o });

  it("không có việc → 'Sẵn sàng', không phải '0 việc · 0h'", () => {
    expect(formatWorkloadLoad(w({}))).toBe("Sẵn sàng");
  });

  it("có việc → số việc và số giờ", () => {
    expect(formatWorkloadLoad(w({ openCount: 2, openMinutes: 360 }))).toBe("2 việc · 6h");
  });

  it("KHÔNG kèm số quá hạn — đó là cảnh báo, phải tô đỏ tách riêng", () => {
    // Gộp vào cùng một chuỗi chữ xám là đúng cái làm bản <option> cũ trông như dữ liệu thô.
    const s = formatWorkloadLoad(w({ openCount: 5, openMinutes: 1080, overdueCount: 2 }));
    expect(s).toBe("5 việc · 18h");
    expect(s).not.toContain("quá hạn");
  });

  it("có việc nhưng nhóm KPI chưa nhập giờ → chỉ nêu số việc, không hiện '0h'", () => {
    expect(formatWorkloadLoad(w({ openCount: 3, openMinutes: 0 }))).toBe("3 việc");
  });

  it("giờ lẻ làm tròn tới 0.1", () => {
    expect(workloadHours(w({ openMinutes: 100 }))).toBe(1.7);
    expect(formatWorkloadLoad(w({ openCount: 1, openMinutes: 100 }))).toBe("1 việc · 1.7h");
  });
});

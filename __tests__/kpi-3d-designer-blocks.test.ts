import { describe, expect, it } from "vitest";

import {
  closedAttemptBlocks,
  firstEditableBlockNo,
} from "@/app/lib/business/kpi-3d/designer-blocks";
import type { AttemptInput } from "@/app/lib/business/kpi-3d/attempt-chain";

// Danh sách khối "Nhân viên 3D #N" do JSON extraData quyết định, còn lượt giao việc nằm ở bảng.
// Khi hệ thống TỰ tạo một lượt mới (mở lại sau tạm dừng) thì số khối không tăng, và khối #1 im
// lặng chuyển sang hiển thị lượt mới — kết quả lần 1 không còn ô nào đọc được.

const a = (o: Partial<AttemptInput> & { id: string }): AttemptInput => ({
  orderItemId: "i1",
  status: "ASSIGNED",
  assignedAt: "2026-08-01T02:00:00Z",
  completedAt: null,
  kpiStatus: null,
  standardMinutesSnapshot: 180,
  actualMinutes: null,
  reviewStatus: null,
  reviewNote: null,
  reassignedFromId: null,
  continuationReason: null,
  designer3D: { id: "d1", name: "AN" },
  ...o,
});

describe("closedAttemptBlocks — lượt nào xứng đáng một khối riêng", () => {
  it("chưa có lượt nào đóng → không khối chỉ đọc nào", () => {
    expect(closedAttemptBlocks([a({ id: "x" })])).toEqual([]);
  });

  // ⚠️ TÌNH HUỐNG CHÍNH: tạm dừng rồi mở lại. Route resume-continuation đóng băng số giờ đã chốt
  // vào actualMinutes của lượt cũ, nên lượt cũ luôn thoả điều kiện "có gì để đối chiếu KPI".
  it("mở lại sau tạm dừng → lượt cũ có khối riêng, mang lý do đóng", () => {
    const rows = [
      a({ id: "l1", status: "REASSIGNED", actualMinutes: 252 }),
      a({ id: "l2", assignedAt: "2026-08-13T03:00:00Z", reassignedFromId: "l1", continuationReason: "PAUSE_RESUME" }),
    ];
    const blocks = closedAttemptBlocks(rows);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attempt.id).toBe("l1");
    expect(blocks[0].blockNo).toBe(1);
    // Lý do lấy từ LƯỢT KẾ TIẾP — đọc trên chính l1 sẽ luôn ra null.
    expect(blocks[0].closedReason).toBe("PAUSE_RESUME");
  });

  it("khối đang chạy bắt đầu từ số sau các khối chỉ đọc", () => {
    expect(firstEditableBlockNo(1)).toBe(2);
    expect(firstEditableBlockNo(0)).toBe(1);
    expect(firstEditableBlockNo(3)).toBe(4);
  });

  // Đây chính là mớ lộn xộn mà activeAttempts() đã dọn đi — không được mời nó quay lại.
  it("lượt bị bác NGAY khi vừa giao (chưa giờ, chưa xong) → KHÔNG có khối", () => {
    const rows = [
      a({ id: "l1", status: "REASSIGNED", actualMinutes: null, completedAt: null }),
      a({ id: "l2", reassignedFromId: "l1", continuationReason: "REJECT_REASSIGN" }),
    ];
    expect(closedAttemptBlocks(rows)).toEqual([]);
  });

  it("lượt bị bác NHƯNG đã có giờ ghi nhận → có khối, vì cuối tháng vẫn phải đối chiếu", () => {
    const rows = [
      a({ id: "l1", status: "REASSIGNED", actualMinutes: 120 }),
      a({ id: "l2", reassignedFromId: "l1", continuationReason: "REJECT_REASSIGN" }),
    ];
    const blocks = closedAttemptBlocks(rows);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].closedReason).toBe("REJECT_REASSIGN");
  });

  it("lượt đã HOÀN TẤT rồi mới bị đóng → có khối dù actualMinutes trống", () => {
    const rows = [
      a({ id: "l1", status: "REASSIGNED", actualMinutes: null, completedAt: "2026-08-05T02:00:00Z" }),
      a({ id: "l2", reassignedFromId: "l1", continuationReason: "REJECT_REASSIGN" }),
    ];
    expect(closedAttemptBlocks(rows)).toHaveLength(1);
  });

  // actualMinutes = 0 tràn khắp dữ liệu cũ (JSON gioThucTe để trống lưu thành 0), nên nhận 0 sẽ
  // dựng một khối chỉ đọc cho mọi lượt cũ từng bị đổi người — panel dài ra mà không nói gì thêm.
  it("actualMinutes = 0 KHÔNG tính là có giờ", () => {
    expect(closedAttemptBlocks([a({ id: "l1", status: "REASSIGNED", actualMinutes: 0 })])).toEqual([]);
  });

  // Đơn bị huỷ giữa lúc đang làm thì công của nhân viên vẫn là công thật.
  it("lượt CANCELLED đã có giờ → vẫn có khối, closedReason null vì không có lượt kế tiếp", () => {
    const blocks = closedAttemptBlocks([a({ id: "l1", status: "CANCELLED", actualMinutes: 90 })]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].closedReason).toBeNull();
  });

  it("chuỗi ba lần → hai khối chỉ đọc, đánh số 1 và 2 theo thứ tự thời gian", () => {
    const rows = [
      a({ id: "l1", status: "REASSIGNED", actualMinutes: 100 }),
      a({ id: "l2", status: "REASSIGNED", actualMinutes: 200, assignedAt: "2026-08-05T02:00:00Z", reassignedFromId: "l1", continuationReason: "PAUSE_RESUME" }),
      a({ id: "l3", assignedAt: "2026-08-09T02:00:00Z", reassignedFromId: "l2", continuationReason: "PAUSE_RESUME" }),
    ];
    const blocks = closedAttemptBlocks(rows);
    expect(blocks.map((b) => [b.attempt.id, b.blockNo])).toEqual([["l1", 1], ["l2", 2]]);
    expect(firstEditableBlockNo(blocks.length)).toBe(3);
  });

  // Hai người cùng làm một MO là hai chuỗi ĐỘC LẬP — số hiệu khối phải chạy theo chuỗi, không
  // trộn lẫn, nếu không thứ tự khối trên panel không khớp thứ tự người.
  it("hai chuỗi song song → số hiệu chạy theo từng chuỗi", () => {
    const rows = [
      a({ id: "p1", status: "REASSIGNED", actualMinutes: 60 }),
      a({ id: "p1b", assignedAt: "2026-08-06T02:00:00Z", reassignedFromId: "p1", continuationReason: "PAUSE_RESUME" }),
      a({ id: "p2", designer3D: { id: "d2", name: "BÌNH" }, status: "REASSIGNED", actualMinutes: 80, assignedAt: "2026-08-02T02:00:00Z" }),
      a({ id: "p2b", designer3D: { id: "d2", name: "BÌNH" }, assignedAt: "2026-08-07T02:00:00Z", reassignedFromId: "p2", continuationReason: "PAUSE_RESUME" }),
    ];
    expect(closedAttemptBlocks(rows).map((b) => [b.attempt.id, b.blockNo]))
      .toEqual([["p1", 1], ["p2", 2]]);
  });

  // Trả về DÒNG GỐC, không phải bản sao của attempt-chain: chỗ gọi cần cả deadlineAt, pauses,
  // kpiGroup… những trường AttemptInput không khai. Trả bản sao sẽ âm thầm mất chúng.
  it("trả về dòng gốc, giữ nguyên các trường ngoài AttemptInput", () => {
    const row = { ...a({ id: "l1", status: "REASSIGNED", actualMinutes: 252 }), deadlineAt: "2026-08-13T04:00:00Z" };
    const rows = [row, a({ id: "l2", reassignedFromId: "l1", continuationReason: "PAUSE_RESUME" })];
    const blocks = closedAttemptBlocks(rows);
    expect(blocks[0].attempt).toBe(row);
    expect((blocks[0].attempt as typeof row).deadlineAt).toBe("2026-08-13T04:00:00Z");
  });

  it("danh sách rỗng không ném lỗi", () => {
    expect(closedAttemptBlocks([])).toEqual([]);
  });
});

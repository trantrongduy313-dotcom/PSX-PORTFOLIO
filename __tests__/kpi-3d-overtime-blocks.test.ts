import { describe, expect, it } from "vitest";

import {
  overtimeBlocksForItem,
  overtimeMinutesByDesigner,
  overtimeMinutesByMonth,
  totalOvertimeMinutes,
  type ApprovedOvertime,
} from "@/app/lib/business/kpi-3d/overtime-blocks";
import { hasCapability } from "@/app/lib/business/kpi-3d/permissions";

// Giờ tăng ca là GIỜ NGOÀI, tính lương; giờ thực tế là giờ trong, chấm Đúng/Trễ hạn. Toàn bộ file
// này canh đúng một điều: hai sổ đó không được chạm vào nhau.

const vn = (iso: string) => new Date(`${iso}+07:00`);

const ot = (over: Partial<ApprovedOvertime> = {}): ApprovedOvertime => ({
  id: "ot-1",
  orderItemId: "item-1",
  designer3DId: "d-1",
  designerName: "N8N",
  startAt: vn("2026-08-13T20:00:00"),
  endAt: vn("2026-08-13T22:00:00"),
  minutes: 120,
  reason: null,
  approvedByName: "Duy",
  ...over,
});

describe("overtimeBlocksForItem", () => {
  it("chỉ lấy tăng ca của ĐÚNG MO đang mở", () => {
    const blocks = overtimeBlocksForItem(
      [ot(), ot({ id: "ot-2", orderItemId: "item-khac" })],
      "item-1",
    );
    expect(blocks.map((b) => b.id)).toEqual(["ot-1"]);
  });

  it("cũ trước mới sau — đọc theo dòng thời gian", () => {
    const blocks = overtimeBlocksForItem(
      [
        ot({ id: "muon", startAt: vn("2026-08-15T20:00:00") }),
        ot({ id: "som", startAt: vn("2026-08-13T20:00:00") }),
      ],
      "item-1",
    );
    expect(blocks.map((b) => b.id)).toEqual(["som", "muon"]);
  });

  // Một khối nói sai về thời gian còn tệ hơn không có khối: người đối chiếu lương sẽ tin nó.
  it("mốc hỏng → BỎ QUA, không dựng khối", () => {
    expect(overtimeBlocksForItem([ot({ startAt: "khong-phai-ngay" })], "item-1")).toHaveLength(0);
  });

  it("thiếu tên nhân viên → vẫn hiện khối, nói rõ là chưa rõ", () => {
    const [b] = overtimeBlocksForItem([ot({ designerName: null })], "item-1");
    expect(b.designerName).toContain("chưa rõ");
  });

  it("nhiều lần tăng ca trên một MO → NHIỀU khối, không gộp thành một", () => {
    const blocks = overtimeBlocksForItem(
      [ot(), ot({ id: "ot-2", startAt: vn("2026-08-14T20:00:00"), minutes: 60 })],
      "item-1",
    );
    expect(blocks).toHaveLength(2);
    expect(totalOvertimeMinutes(blocks)).toBe(180);
  });
});

describe("overtimeMinutesByMonth — ghi vào tháng BẮT ĐẦU LÀM", () => {
  // ⚠️ ĐÂY LÀ QUYẾT ĐỊNH QUAN TRỌNG NHẤT VỀ SỐ LIỆU CỦA FILE NÀY.
  //
  // Nghiệp vụ cho khai lùi (tháng 12 khai cho việc tháng 1) vì đằng nào cũng phải qua người
  // duyệt. Nếu cộng vào tháng DUYỆT thì con số nhảy theo lúc quản lý rảnh tay; nếu cộng vào tháng
  // đơn hoàn tất thì một tháng đã chốt sổ tự nhiên to ra. Chỉ mốc BẮT ĐẦU LÀM là bất biến và
  // đúng với công sức thật.
  it("khai tháng 12 cho việc làm tháng 8 → ghi vào tháng 8", () => {
    const byMonth = overtimeMinutesByMonth([ot({ startAt: vn("2026-08-13T20:00:00") })]);
    expect(byMonth.get("2026-08")).toBe(120);
    expect(byMonth.get("2026-12")).toBeUndefined();
  });

  it("làm xuyên đêm 31/08 → tính vào tháng 8 (mốc bắt đầu), không phải tháng 9", () => {
    const byMonth = overtimeMinutesByMonth([
      ot({ startAt: vn("2026-08-31T22:00:00"), endAt: vn("2026-09-01T02:00:00"), minutes: 240 }),
    ]);
    expect(byMonth.get("2026-08")).toBe(240);
    expect(byMonth.get("2026-09")).toBeUndefined();
  });

  it("cộng dồn nhiều lần trong cùng tháng", () => {
    const byMonth = overtimeMinutesByMonth([ot(), ot({ id: "ot-2", minutes: 60 })]);
    expect(byMonth.get("2026-08")).toBe(180);
  });

  it("số phút không dương → bỏ qua, không tạo tháng rỗng", () => {
    expect(overtimeMinutesByMonth([ot({ minutes: 0 })]).size).toBe(0);
  });
});

describe("overtimeMinutesByDesigner", () => {
  it("tách theo từng người trong đúng một tháng", () => {
    const rows = [
      ot({ designer3DId: "d-1", minutes: 120 }),
      ot({ id: "ot-2", designer3DId: "d-2", minutes: 60 }),
      ot({ id: "ot-3", designer3DId: "d-1", startAt: vn("2026-09-02T20:00:00"), minutes: 999 }),
    ];
    const m = overtimeMinutesByDesigner(rows, "2026-08");
    expect(m.get("d-1")).toBe(120);
    expect(m.get("d-2")).toBe(60);
  });
});

// ⚠️ DỮ LIỆU LƯƠNG. Khối tăng ca hiện trên ĐƠN HÀNG nên nó nằm cạnh dữ liệu của người khác —
// hẹp hơn quyền xem đơn là có chủ ý.
describe("ai được xem khối tăng ca trên đơn hàng", () => {
  it("Admin và Đặt đơn → xem được", () => {
    expect(hasCapability("VIEW_OVERTIME_RECORD", "ADMIN")).toBe(true);
    expect(hasCapability("VIEW_OVERTIME_RECORD", "ORDER")).toBe(true);
  });

  it("Sales, Sản xuất, NV 3D → KHÔNG", () => {
    expect(hasCapability("VIEW_OVERTIME_RECORD", "SALES")).toBe(false);
    expect(hasCapability("VIEW_OVERTIME_RECORD", "PRODUCTION")).toBe(false);
    // NV 3D vẫn xem khai báo CỦA CHÍNH MÌNH ở tab Tăng ca — năng lực này chỉ nói về khối trên
    // đơn hàng, nơi có cả dữ liệu của đồng nghiệp.
    expect(hasCapability("VIEW_OVERTIME_RECORD", "DESIGN_3D")).toBe(false);
  });
});

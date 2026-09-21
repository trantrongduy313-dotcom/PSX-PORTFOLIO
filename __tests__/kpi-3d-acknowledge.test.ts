import { describe, expect, it } from "vitest";

import {
  blockedReasonForAcknowledge,
  deriveAcknowledgedAt,
  handoverDelayMinutes,
  isAcknowledgedEarly,
  type AcknowledgeableAssignment,
} from "@/app/lib/business/kpi-3d/acknowledge";

// Ngày giờ trong test LUÔN ghi rõ giờ Việt Nam (vitest chạy TZ=UTC giống Vercel).
const vn = (iso: string) => new Date(`${iso}+07:00`);

function assignment(overrides: Partial<AcknowledgeableAssignment> = {}): AcknowledgeableAssignment {
  return {
    id: "asg-1",
    designer3DId: "designer-1",
    status: "ASSIGNED",
    assignedAt: vn("2026-08-10T09:27:00"),
    acknowledgedAt: null,
    ...overrides,
  };
}

describe("Chặn xác nhận nhận việc khi không hợp lệ", () => {
  it("lượt giao việc đang mở, chưa nhận → cho phép", () => {
    expect(blockedReasonForAcknowledge(assignment())).toBeNull();
  });

  it.each([["REASSIGNED"], ["CANCELLED"]])("lượt đã đóng (%s) → chặn", (status) => {
    expect(blockedReasonForAcknowledge(assignment({ status }))).toContain("đã đóng");
  });

  it("đã xác nhận trước đó → chặn, không cho bấm hai lần", () => {
    const reason = blockedReasonForAcknowledge(assignment({ acknowledgedAt: vn("2026-08-10T10:00:00") }));
    expect(reason).toContain("đã được xác nhận");
  });
});

describe("Độ trễ bàn giao — phương án (c): đo RIÊNG, không đụng KPI", () => {
  it("nhận sau 93 phút → 93", () => {
    expect(handoverDelayMinutes(vn("2026-08-10T09:27:00"), vn("2026-08-10T11:00:00"))).toBe(93);
  });

  it("nhận đúng lúc giao → 0", () => {
    const t = vn("2026-08-10T09:27:00");
    expect(handoverDelayMinutes(t, t)).toBe(0);
  });

  it("assignedAt Ở TƯƠNG LAI (Order lên kế hoạch trước) → trả 0, KHÔNG để số âm vào báo cáo", () => {
    // Tình huống thật: MO 26.42432_1 có "Giao lúc 10/08" trong khi hôm nay mới 04/08.
    const delay = handoverDelayMinutes(vn("2026-08-10T09:27:00"), vn("2026-08-04T09:20:00"));
    expect(delay).toBe(0);
    expect(delay).toBeGreaterThanOrEqual(0);
  });

  it("phân biệt 'nhận trước hạn giao' với 'nhận đúng 0 phút'", () => {
    expect(isAcknowledgedEarly(vn("2026-08-10T09:27:00"), vn("2026-08-04T09:20:00"))).toBe(true);
    const t = vn("2026-08-10T09:27:00");
    expect(isAcknowledgedEarly(t, t)).toBe(false);
  });

  it("ngày rác → 0, không ném lỗi và không trả NaN vào báo cáo", () => {
    expect(handoverDelayMinutes(new Date("rac"), vn("2026-08-10T10:00:00"))).toBe(0);
  });
});

describe("deriveAcknowledgedAt — SUY RA cho dữ liệu cũ, không cần script backfill", () => {
  it("đã có mốc rõ ràng → dùng mốc đó", () => {
    const explicit = vn("2026-08-10T09:30:00");
    expect(deriveAcknowledgedAt(explicit, vn("2026-08-10T11:00:00"))?.getTime()).toBe(explicit.getTime());
  });

  it("chưa có mốc nhưng ĐÃ có dòng tiến độ → suy ra từ dòng đầu tiên", () => {
    // Lượt giao việc tạo trước khi có tính năng này đều mang acknowledgedAt = NULL. Nhưng đã
    // ghi tiến độ thì hiển nhiên NV đã biết có việc.
    const first = vn("2026-08-04T09:20:00");
    expect(deriveAcknowledgedAt(null, first)?.getTime()).toBe(first.getTime());
  });

  it("chưa có mốc, chưa có dòng tiến độ nào → null (đúng là chưa nhận)", () => {
    expect(deriveAcknowledgedAt(null, null)).toBeNull();
  });

  it("nhận chuỗi ISO cũng được (dữ liệu qua API là chuỗi)", () => {
    expect(deriveAcknowledgedAt("2026-08-04T02:20:00.000Z", null)).toBeInstanceOf(Date);
  });

  it.each([
    ["chuỗi rác", "khong-phai-ngay"],
    ["chuỗi rỗng", ""],
    ["undefined", undefined],
  ])("%s → null, không ném lỗi", (_label, value) => {
    expect(deriveAcknowledgedAt(value, null)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  freezeMinutesOnHandover,
  handoverClosureData,
} from "@/app/lib/business/kpi-3d/handover-freeze";

// TEST CHO ĐÚNG LỖ ĐÃ TÌM RA: có HAI cửa đổi người thiết kế, và chỉ MỘT cửa chốt giờ.
// Đường lưu form ghi đúng một dòng `status: "REASSIGNED"` — không chốt giờ, không reassignedAt,
// không đóng khoảng dừng. Hệ quả: giờ của người đã rời đơn còn phình ra theo thời gian NGƯỜI MỚI
// làm, và báo cáo coi họ là "đang chờ buông" một đơn họ không còn cách nào hoàn thành.

const ASSIGNED = new Date("2026-08-03T02:00:00.000Z"); // 09:00 giờ VN
const NOW = new Date("2026-08-03T06:00:00.000Z"); // 13:00 giờ VN — 4 tiếng sau

const base = {
  actualMinutes: null,
  completedAt: null,
  acknowledgedAt: null,
  assignedAt: ASSIGNED,
  calendar: undefined,
  pauses: [],
  now: NOW,
};

describe("freezeMinutesOnHandover — CÁI BẪY: chưa nộp kết quả không có nghĩa là 0 giờ", () => {
  it("đã có số giờ tốt + đã hoàn tất → null nghĩa là ĐỪNG GHI ĐÈ, không phải 'đo được 0'", () => {
    // Quy ước của freezeActualMinutes: null = "không có gì cần ghi", vì cột đã mang số đúng rồi.
    // handoverClosureData đọc đúng quy ước đó nên nó bỏ khoá actualMinutes ra khỏi lệnh update.
    expect(freezeMinutesOnHandover({ ...base, actualMinutes: 300, completedAt: new Date() })).toBeNull();
  });

  it("QUIRK CÓ SẴN (giữ nguyên hành vi route reassign): chưa hoàn tất thì số nhập tay BỊ ĐO ĐÈ", () => {
    // Order đã gõ 300 phút nhưng lượt chưa hoàn tất → phép đo vẫn chạy và ghi đè con số đó.
    // KHÔNG phải hành vi mới: route reassign đã làm đúng như vậy từ trước, và module này chỉ gom
    // hai đường về một phép đo. Ghi lại ở đây để lần sau ai muốn đổi thì biết mình đang đổi gì
    // — và biết là phải đổi cho CẢ HAI đường cùng lúc.
    const minutes = freezeMinutesOnHandover({ ...base, actualMinutes: 300 });
    expect(minutes).not.toBe(300);
    expect(minutes).toBeGreaterThan(0);
  });

  it("CHƯA nộp kết quả (không completedAt) → VẪN đo được, không trả 0", () => {
    // freezeActualMinutes có dòng `if (!completedAt) return null` — hợp lý cho luồng duyệt nhưng
    // SAI ở đây: bị lấy đơn GIỮA LÚC ĐANG LÀM là ca phổ biến nhất của việc đổi người. Chỉ dựa vào
    // hàm đó thì người cũ nhận 0 giờ và nút "Có tính KPI" thành vô nghĩa về mặt giờ.
    const minutes = freezeMinutesOnHandover(base);
    expect(minutes).not.toBeNull();
    expect(minutes).toBeGreaterThan(0);
  });

  it("đã ghi công ở lần tạm dừng gần nhất → dùng đúng con số đó, không đo lại", () => {
    const minutes = freezeMinutesOnHandover({
      ...base,
      pauses: [{ pausedAt: new Date("2026-08-03T04:00:00.000Z"), resumedAt: null, confirmedMinutes: 90 }],
    });
    expect(minutes).toBe(90);
  });

  it("đã hoàn tất, chưa có số → ĐO từ mốc nhận việc tới lúc hoàn tất", () => {
    // 02:00Z → 05:00Z = 3 tiếng. Không có lịch làm việc nên không trừ gì.
    expect(freezeMinutesOnHandover({ ...base, completedAt: new Date("2026-08-03T05:00:00.000Z") })).toBe(180);
  });
});

describe("handoverClosureData — những gì PHẢI ghi lên lượt cũ", () => {
  it("có reassignedAt — thiếu nó là báo cáo coi người cũ đang 'chờ buông'", () => {
    // isReassignedAway = reassignedAt != null. Thiếu mốc này thì donChuaHT của người cũ không bao
    // giờ được trừ, và họ gánh vĩnh viễn một đơn đã có người khác tiếp quản.
    expect(handoverClosureData({ frozenMinutes: 240, now: NOW }).reassignedAt).toEqual(NOW);
  });

  it("status là REASSIGNED", () => {
    expect(handoverClosureData({ frozenMinutes: null, now: NOW }).status).toBe("REASSIGNED");
  });

  it("kpiCounted mặc định TRUE — chưa ai quyết định thì không lặng lẽ cắt công", () => {
    expect(handoverClosureData({ frozenMinutes: null, now: NOW }).kpiCounted).toBe(true);
  });

  it("có giờ đo được → ghi actualMinutes", () => {
    expect(handoverClosureData({ frozenMinutes: 240, now: NOW }).actualMinutes).toBe(240);
  });

  it("không đo được (null) hoặc bằng 0 → KHÔNG ghi đè actualMinutes", () => {
    expect(handoverClosureData({ frozenMinutes: null, now: NOW })).not.toHaveProperty("actualMinutes");
    expect(handoverClosureData({ frozenMinutes: 0, now: NOW })).not.toHaveProperty("actualMinutes");
  });

  it("KHÔNG đóng dấu phán quyết kiểm — đường lưu form không có ai kiểm cả", () => {
    const data = handoverClosureData({ frozenMinutes: 240, now: NOW });
    expect(data).not.toHaveProperty("reviewStatus");
    expect(data).not.toHaveProperty("reviewedById");
    expect(data).not.toHaveProperty("reviewedAt");
  });
});

describe("HAI đường đổi người dùng CHUNG một phép đo", () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
  const reassignRoute = read("app", "api", "design-3d", "assignments", "[id]", "reassign", "route.ts");
  const syncModule = read("app", "lib", "business", "kpi-3d", "assignment.ts");

  it("route reassign gọi module dùng chung", () => {
    expect(reassignRoute).toContain("freezeMinutesOnHandover(");
  });

  it("đường lưu form cũng gọi module dùng chung", () => {
    expect(syncModule).toContain("freezeMinutesOnHandover(");
  });

  it("route reassign KHÔNG còn giữ bản chép tay của phép đo", () => {
    // Bản chép cũ ghép tay freezeActualMinutes ?? (alreadyCreditedMinutes || workedMinutesUntil).
    // Còn nó nghĩa là hai đường lại có hai bản, và lần lệch đầu tiên là hai màn hình nói hai con
    // số khác nhau về tiền của một người.
    expect(reassignRoute).not.toContain("alreadyCreditedMinutes(");
    expect(reassignRoute).not.toContain("workedMinutesUntil(");
  });

  it("đường lưu form KHÔNG còn đóng lượt bằng đúng một dòng status", () => {
    // Đây là hình dạng cũ chính xác của lỗi: data: { status: "REASSIGNED" } và không gì khác.
    expect(syncModule).not.toMatch(/data:\s*\{\s*status:\s*"REASSIGNED"\s*\}/);
    expect(syncModule).toContain("handoverClosureData(");
  });

  it("đường lưu form có đóng nốt khoảng tạm dừng còn mở", () => {
    // Lượt đã đóng mà còn khoảng dừng chưa mở lại thì mọi màn hình đọc theo resumedAt = null sẽ
    // hiện nó "đang tạm dừng" vĩnh viễn.
    expect(syncModule).toContain("design3DPause.updateMany");
  });
});

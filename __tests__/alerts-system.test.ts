// Schema của cảnh báo — đọc THẲNG từ hai route, không chép lại.
//
// 🔴 Bản chép cũ ở đây LỆCH so với API thật:
//   • `resolvedNote` bản chép bắt BẮT BUỘC và không rỗng; API thật để OPTIONAL
//   • `severity` bản chép không có mặc định; API thật mặc định "HIGH"
//   • `resumeOrder` bản chép optional; API thật mặc định false
//
// 🔴 Và phần mô phỏng vòng đời cảnh báo (~480 dòng) đã XOÁ, vì nó không phải bản chép lệch
// nhẹ — nó là MỘT HỆ THỐNG KHÁC. So với app/api/orders/[id]/alerts/route.ts:
//   • route CHẶN tạo cảnh báo cho đơn không ở Phòng Sản Xuất — bản mô phỏng không có luật này
//   • route CHẶN scopedItemId không thuộc đơn / không ở PSX — bản mô phỏng bỏ qua
//   • route tự gỡ cảnh báo cũ bằng cách tra workflowHistory.metadata; bản mô phỏng so thẳng
//     `alert.scopedItemId` — hai cơ chế khác nhau
//   • bản mô phỏng chặn cảnh báo trên đơn đã hủy; route KHÔNG có luật đó
//
// Bốn luật thật ở trên HIỆN KHÔNG CÓ TEST. Ghi ra để không ai tưởng là có.

import { describe, expect, it, vi } from "vitest";

// Hai route kéo theo next-auth qua auth-helpers; test này chỉ cần schema nên chặn ở biên.
vi.mock("@/app/lib/auth-helpers", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/app/lib/prisma", () => ({ prisma: {} }));

import { RaiseAlertSchema } from "@/app/api/orders/[id]/alerts/route";
import { ResolveSchema } from "@/app/api/alerts/[id]/route";


// ─── 1. Schema validation ─────────────────────────────────────────────────────

describe("RaiseAlertSchema — validation", () => {
  it("hợp lệ khi có đủ type, severity, title", () => {
    const result = RaiseAlertSchema.safeParse({
      type: "QUALITY_ISSUE",
      severity: "HIGH",
      title: "Lỗi xi mạ",
    });
    expect(result.success).toBe(true);
  });

  it("hợp lệ khi có description và scopedItemId", () => {
    const result = RaiseAlertSchema.safeParse({
      type: "MATERIAL_SHORTAGE",
      severity: "CRITICAL",
      title: "Thiếu vàng 18k",
      description: "Hết nguyên liệu trong kho",
      scopedItemId: "item_1",
    });
    expect(result.success).toBe(true);
  });

  it("lỗi khi type không hợp lệ", () => {
    const result = RaiseAlertSchema.safeParse({ type: "UNKNOWN", severity: "HIGH", title: "test" });
    expect(result.success).toBe(false);
  });

  it("lỗi khi severity không hợp lệ", () => {
    const result = RaiseAlertSchema.safeParse({ type: "RUSH_ORDER", severity: "URGENT", title: "test" });
    expect(result.success).toBe(false);
  });

  it("lỗi khi title rỗng", () => {
    const result = RaiseAlertSchema.safeParse({ type: "RUSH_ORDER", severity: "LOW", title: "" });
    expect(result.success).toBe(false);
  });

  it("lỗi khi title quá 200 ký tự", () => {
    const result = RaiseAlertSchema.safeParse({ type: "RUSH_ORDER", severity: "LOW", title: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("lỗi khi description quá 2000 ký tự", () => {
    const result = RaiseAlertSchema.safeParse({
      type: "RUSH_ORDER", severity: "LOW", title: "test",
      description: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("chấp nhận tất cả 6 alert types hợp lệ", () => {
    const types = ["SPECIAL", "MATERIAL_SHORTAGE", "RUSH_ORDER", "QUALITY_ISSUE", "DESIGN_CHANGE", "CUSTOMER_COMPLAINT"];
    for (const type of types) {
      const result = RaiseAlertSchema.safeParse({ type, severity: "MEDIUM", title: "test" });
      expect(result.success, `Type ${type} should be valid`).toBe(true);
    }
  });

  it("chấp nhận tất cả 4 severity levels hợp lệ", () => {
    const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    for (const severity of severities) {
      const result = RaiseAlertSchema.safeParse({ type: "SPECIAL", severity, title: "test" });
      expect(result.success, `Severity ${severity} should be valid`).toBe(true);
    }
  });
});

describe("ResolveSchema — gỡ cảnh báo", () => {
  // 🔴 Bản chép cũ bắt `resolvedNote` BẮT BUỘC và không rỗng, rồi test rằng để trống bị chặn.
  // API thật để OPTIONAL — luật đó chưa bao giờ tồn tại.
  it("không có ghi chú → VẪN hợp lệ", () => {
    expect(ResolveSchema.safeParse({}).success).toBe(true);
  });

  // Không khai thì KHÔNG tự tiếp tục đơn: gỡ cảnh báo và cho chạy lại là hai quyết định khác
  // nhau, mặc định phải là cái an toàn hơn.
  it("không khai resumeOrder → mặc định KHÔNG tiếp tục đơn", () => {
    const parsed = ResolveSchema.safeParse({});
    expect(parsed.success && parsed.data.resumeOrder).toBe(false);
  });

  it("ghi chú quá 1000 ký tự → chặn", () => {
    expect(ResolveSchema.safeParse({ resolvedNote: "a".repeat(1001) }).success).toBe(false);
  });
});

describe("mức độ mặc định", () => {
  // Bản chép cũ không có mặc định nên không test được điều này. Thiếu mặc định là cảnh báo
  // rơi vào một mức không xác định và lọt khỏi mọi bộ lọc theo mức độ.
  it("không khai severity → mặc định HIGH", () => {
    const parsed = RaiseAlertSchema.safeParse({ type: "SPECIAL", title: "Thiếu đá" });
    expect(parsed.success && parsed.data.severity).toBe("HIGH");
  });
});

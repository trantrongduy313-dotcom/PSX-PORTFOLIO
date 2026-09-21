import { describe, it, expect } from "vitest";

import { updateOrderSchema } from "@/app/lib/schemas/order";
import { canTransition, suspendedFlagFor } from "@/app/lib/business/orders/status-transitions";

// PATCH /api/orders/[id] — đọc THẲNG từ module thật, không chép lại.
//
// Bản chép cũ ở đây (348 dòng) đã lệch BỐN chỗ, và mỗi chỗ một kiểu:
//
//   1. 🔴 `stripVersionSuffix` / `parseSoVersion` của nó chỉ biết dấu ".". Hệ thống đã chuyển
//      sang "_" (NEW_VERSION_SEPARATOR) cho mọi phiên bản tạo từ nay, nên bản chép MÙ với toàn
//      bộ dữ liệu mới. Đúng lớp lỗi route promote đã ghi lại là "hậu tố _ từng bị bỏ quên".
//      Bản THẬT (parseVersionSuffix) nhận cả hai và đã có test: __tests__/mo-version-separator.
//   2. 🔴 Khoá đơn đã chốt đo ở CẤP SO (`currentStatus === COMPLETED`). Luật thật đo ở CẤP MO
//      (`itemStatus ?? orderStatus`) — chính cái sai mà terminal-lock.ts sinh ra để sửa. Test
//      thật: __tests__/orders-terminal-lock.test.ts.
//   3. 🔴 Nó khẳng định SUSPENDED → SUSPENDED "vẫn đặt cờ true". Route KHÔNG BAO GIỜ tới nhánh
//      đó: cả khối nằm trong `if (newStatus !== fromStatus)`. Nay luật là `suspendedFlagFor`.
//   4. `version: min(0)` — thật là `min(1)`; `Order.version` mặc định 1 nên 0 không phải
//      "trạng thái khởi tạo" như nó ghi, mà là con số không đơn nào mang. Nó cũng khai
//      `customerName`/`salesName` sửa được ở cấp SO (thật: khoá) và `referenceUrls` là chuỗi
//      bất kỳ (thật: phải là URL).
//   5. Bảng chuyển trạng thái riêng — đã nối vào module thật ở lần sửa trước; bản chép đó từng
//      lệch với CẢ UI lẫn route và người dùng gặp lỗi 400 thật khi lưu.
//
// Còn thiếu lưới, ghi ra để không ai tưởng là có: THỨ TỰ bốn cửa của route
// (NOT_FOUND → CONFLICT → LOCKED → INVALID_TRANSITION) xen giữa các lần đọc DB nên chưa tách
// ra được. Bản chép cũ mô phỏng thứ tự đó bằng một hàm `validatePatch` tự bịa.

describe("updateOrderSchema", () => {
  it("bắt buộc có version — không có thì không biết đang sửa trên bản nào", () => {
    expect(updateOrderSchema.safeParse({}).success).toBe(false);
  });

  // 🔴 Bản chép cũ khai `min(0)` và có hẳn một test "version 0 hợp lệ (initial state)".
  // `Order.version` mặc định là 1 trong schema Prisma, nên 0 KHÔNG phải trạng thái khởi tạo —
  // nó là một con số không đơn nào từng mang. Bản chép nới rộng luật hơn cả server.
  it("version 0 bị từ chối — không đơn nào mang số đó", () => {
    expect(updateOrderSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(updateOrderSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it("chỉ cần version + một trường là đủ — không phải gửi lại cả đơn", () => {
    expect(updateOrderSchema.safeParse({ version: 3, donHang3Sao: true }).success).toBe(true);
  });

  it("trạng thái lạ bị từ chối", () => {
    expect(updateOrderSchema.safeParse({ version: 1, status: "UNKNOWN" }).success).toBe(false);
  });

  // Tiền âm lọt vào là báo cáo doanh thu sai mà không có gì kêu.
  it("các trường tiền không nhận số âm", () => {
    for (const field of ["estimatedTotal", "depositAmount", "finalTotal"]) {
      expect(updateOrderSchema.safeParse({ version: 1, [field]: -100 }).success, field).toBe(false);
      expect(updateOrderSchema.safeParse({ version: 1, [field]: 0 }).success, field).toBe(true);
    }
  });

  // Bản chép khai `z.array(z.string())` — thật là `z.string().url()`. Chuỗi rác lọt vào đây là
  // giao diện dựng một thẻ <a> trỏ đi đâu không ai biết.
  it("referenceUrls phải là URL thật, không phải chuỗi bất kỳ", () => {
    expect(updateOrderSchema.safeParse({ version: 1, referenceUrls: ["https://a.com"] }).success)
      .toBe(true);
    expect(updateOrderSchema.safeParse({ version: 1, referenceUrls: ["khong-phai-url"] }).success)
      .toBe(false);
  });

  // customerName / salesName KHOÁ sau khi tạo — sửa riêng theo MO qua `specifications`. Bản chép
  // có cả hai trường này, tức là nó cho phép một thao tác server không nhận.
  it("không nhận sửa Khách hàng / Sales ở cấp SO", () => {
    const parsed = updateOrderSchema.safeParse({ version: 1, customerName: "Tên mới" });
    expect(parsed.success && "customerName" in parsed.data).toBe(false);
  });
});

describe("cờ isSuspended đi theo trạng thái", () => {
  it("chuyển SANG tạm ngưng → bật cờ", () => {
    expect(suspendedFlagFor("IN_DESIGN", "SUSPENDED")).toBe(true);
  });

  it("chuyển RA KHỎI tạm ngưng → tắt cờ", () => {
    expect(suspendedFlagFor("SUSPENDED", "IN_DESIGN")).toBe(false);
  });

  it("không liên quan tạm ngưng → không đụng cờ", () => {
    expect(suspendedFlagFor("DRAFT", "IN_DESIGN")).toBeUndefined();
  });

  // 🔴 Bản chép cũ khẳng định chỗ này trả về true. Route không bao giờ tới đó — cả khối nằm
  // trong `if (newStatus !== fromStatus)`. Giữ lời khai đó là mô tả một nhánh không tồn tại.
  it("trạng thái không đổi → không đụng cờ, kể cả SUSPENDED → SUSPENDED", () => {
    expect(suspendedFlagFor("SUSPENDED", "SUSPENDED")).toBeUndefined();
    expect(suspendedFlagFor("DRAFT", "DRAFT")).toBeUndefined();
  });

  // Cờ và trạng thái là HAI NƠI LƯU CÙNG MỘT SỰ THẬT. Lệch nhau thì huy hiệu nói một đằng, bộ
  // lọc nói một nẻo — nên chỉ có đúng một hàm được quyền đặt cờ.
  it("mọi đường vào/ra SUSPENDED đều có kết luận, không rơi vào undefined", () => {
    for (const other of ["DRAFT", "IN_DESIGN", "DESIGN_APPROVED", "IN_PRODUCTION", "COMPLETED"]) {
      expect(suspendedFlagFor(other, "SUSPENDED"), `${other}→SUSPENDED`).toBe(true);
      expect(suspendedFlagFor("SUSPENDED", other), `SUSPENDED→${other}`).toBe(false);
    }
  });
});

describe("bảng chuyển trạng thái PTK — module thật, không phải bản chép", () => {
  it("cho đi những bước hợp lệ", () => {
    expect(canTransition("DRAFT", "PENDING_DESIGN", "PRE_PRODUCTION")).toBe(true);
    expect(canTransition("DRAFT", "CANCELLED", "PRE_PRODUCTION")).toBe(true);
  });

  // 🔴 Bốn bước UI từng cho chọn mà server từ chối — người dùng bấm Lưu và nhận lỗi 400. Nay UI
  // và server đọc chung một bảng, nên lệch lại là build đỏ chứ không phải người dùng phát hiện.
  it("chặn những bước server không nhận", () => {
    expect(canTransition("DESIGN_REVIEW", "DRAFT", "PRE_PRODUCTION")).toBe(false);
    expect(canTransition("DESIGN_APPROVED", "CANCELLED", "PRE_PRODUCTION")).toBe(false);
  });

  // Trạng thái PSX không nằm trong bảng PTK: route PTK không được tự ý phán về chúng, vùng
  // MASTER_HUB có bảng riêng.
  it("trạng thái ngoài vùng → bảng PTK không có ý kiến", () => {
    expect(canTransition("IN_PRODUCTION", "COMPLETED", "PRE_PRODUCTION")).toBe(true);
  });
});

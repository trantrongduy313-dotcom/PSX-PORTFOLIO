import { describe, expect, it } from "vitest";

import {
  isMasterHubOnlyRole,
  scopeOrdersQueryForRole,
} from "@/app/lib/business/orders/query-scope";
import { USER_ROLE_VALUES } from "@/app/lib/roles";
import { ordersQuerySchema } from "@/app/lib/schemas/order";

// ─── Siết phạm vi dữ liệu đơn hàng theo vai ──────────────────────────────────
//
// 🔴 ĐÂY LÀ CÁI KHOÁ, KHÔNG PHẢI TẤM RÈM. Lọc tab ở order-tabs.ts chỉ quyết định vẽ gì; ai gõ
// thẳng `/api/orders?zone=PRE_PRODUCTION` là đi vòng qua nó hoàn toàn. Test dưới đây nói về
// tầng mà tham số thật sự bị chặn.

describe("isMasterHubOnlyRole", () => {
  it("RND bị hạn chế", () => {
    expect(isMasterHubOnlyRole("RND")).toBe(true);
  });

  // Suy từ nguồn: thêm vai thứ bảy mà vô tình cho nó vào danh sách hạn chế thì test này đỏ.
  it("mọi vai KHÁC đều KHÔNG bị hạn chế", () => {
    for (const r of USER_ROLE_VALUES) {
      if (r === "RND") continue;
      expect(isMasterHubOnlyRole(r), r).toBe(false);
    }
  });

  it("vai rỗng / lạ không được coi là vai hạn chế — chặn thật nằm ở getCurrentUser", () => {
    for (const r of [undefined, null, "", "VAI_LA"]) {
      expect(isMasterHubOnlyRole(r as string | undefined), String(r)).toBe(false);
    }
  });
});

describe("Vai KHÔNG bị hạn chế đi qua nguyên vẹn", () => {
  it.each(USER_ROLE_VALUES.filter((r) => r !== "RND"))("%s giữ nguyên zone và history", (role) => {
    const s = scopeOrdersQueryForRole(role, { zone: "PRE_PRODUCTION", history: true });
    expect(s.denied).toBe(false);
    if (s.denied) return;
    expect(s.zone).toBe("PRE_PRODUCTION");
    expect(s.history).toBe(true);
  });

  it("không truyền zone thì vẫn là không truyền — KHÔNG tự đặt mặc định", () => {
    const s = scopeOrdersQueryForRole("ADMIN", {});
    expect(s.denied).toBe(false);
    if (s.denied) return;
    expect(s.zone).toBeUndefined();
    expect(s.history).toBe(false);
  });
});

describe("RND chỉ thấy Phòng Sản Xuất", () => {
  it.each(["PRE_PRODUCTION", "MASTER_HUB", undefined])("zone=%s bị ÉP về MASTER_HUB", (zone) => {
    const s = scopeOrdersQueryForRole("RND", { zone });
    expect(s.denied).toBe(false);
    if (s.denied) return;
    expect(s.zone).toBe("MASTER_HUB");
  });

  // ⚠️ ÉP chứ không TỪ CHỐI với zone, có chủ ý: giao diện vẫn có thể gửi kèm một zone khác lúc
  // khởi tạo, và ném 403 ở đó là biến chi tiết kỹ thuật thành màn hình đỏ.
  it("zone lạ cũng bị ép, không làm rò dữ liệu ngoài PSX", () => {
    const s = scopeOrdersQueryForRole("RND", { zone: "KHONG_CO_ZONE_NAY" });
    expect(s.denied).toBe(false);
    if (s.denied) return;
    expect(s.zone).toBe("MASTER_HUB");
  });

  // 🔴 NHƯNG history thì TỪ CHỐI. Tab Hoàn tất / Đã hủy bị ẩn khỏi giao diện của họ, nên tham
  // số này chỉ tới được bằng cách gõ tay. Ép âm thầm là trả về một danh sách trông như hợp lệ
  // cho người đang dò tìm — một lỗi im lặng đúng nghĩa.
  it("history=true bị TỪ CHỐI, không ép âm thầm", () => {
    const s = scopeOrdersQueryForRole("RND", { history: true });
    expect(s.denied).toBe(true);
    if (!s.denied) return;
    expect(s.reason.length).toBeGreaterThan(0);
  });

  it("history vắng mặt hoặc false thì không sao", () => {
    for (const history of [undefined, null, false]) {
      expect(scopeOrdersQueryForRole("RND", { history }).denied, String(history)).toBe(false);
    }
  });
});

// 🔴 BẤT BIẾN LIÊN MODULE. Clamp viết chuỗi "MASTER_HUB" thẳng; nếu tên zone đổi trong schema
// thì không có gì báo — API sẽ lọc theo một zone không tồn tại và R&D thấy một danh sách RỖNG,
// im lặng. Kiểm nó bằng chính bộ kiểm tham số của API.
describe("Giá trị ép ra phải là một zone HỢP LỆ của API", () => {
  it("ordersQuerySchema chấp nhận zone mà clamp trả về", () => {
    const s = scopeOrdersQueryForRole("RND", {});
    expect(s.denied).toBe(false);
    if (s.denied) return;
    expect(ordersQuerySchema.safeParse({ zone: s.zone }).success).toBe(true);
  });
});

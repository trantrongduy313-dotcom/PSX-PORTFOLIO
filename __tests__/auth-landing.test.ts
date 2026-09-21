import { describe, expect, it } from "vitest";

import {
  landingPathForRole,
  NEUTRAL_LANDING,
  shouldRedirectFromDashboard,
} from "@/app/lib/business/auth/landing";
import { NAV_SECTIONS, visibleSections } from "@/app/lib/ui/nav-model";
import { USER_ROLE_VALUES } from "@/app/lib/roles";

// Lỗi thật: nút "Vào hệ thống" trỏ cứng tới /dashboard/orders — trang chỉ cho
// ["ORDER","PRODUCTION","ADMIN","SALES"]. Nhân viên 3D bấm là ra 403, lần nào cũng vậy.
//
// Bảng dưới đây chép lại requireRole của các trang đích. Nó CỐ Ý trùng lặp với trang thật:
// nếu ai đó siết quyền một trang mà quên bảng landing, test này đổ và chỉ đúng chỗ — thay vì
// người dùng phát hiện hộ bằng một màn 403.
const PAGE_GUARDS: Record<string, readonly string[]> = {
  "/dashboard/design-3d": ["ADMIN", "ORDER", "PRODUCTION", "DESIGN_3D"],
  "/dashboard/orders": ["ORDER", "PRODUCTION", "ADMIN", "SALES", "RND"],
  // /dashboard không chặn theo vai — mọi tài khoản đã đăng nhập đều vào.
  "/dashboard": [...USER_ROLE_VALUES],
};

// 🔴 SUY TỪ NGUỒN, KHÔNG CHÉP TAY. Bản trước là một mảng viết cứng năm vai, và khi vai thứ sáu
// (RND) ra đời thì CẢ FILE NÀY VẪN XANH — nó chỉ đơn giản không kiểm vai mới. Một test tự nhận
// là "mọi vai" mà bỏ sót đúng cái vai vừa thêm là tệ hơn không có test: nó phát tín hiệu an toàn.
const ALL_ROLES = USER_ROLE_VALUES;

describe("Lối vào theo vai trò", () => {
  // ⚠️ TEST QUAN TRỌNG NHẤT FILE NÀY — nó phát biểu đúng cái bất biến đã bị vi phạm.
  it.each(ALL_ROLES)("%s được đưa tới trang mà chính họ vào được", (role) => {
    const target = landingPathForRole(role);
    const allowed = PAGE_GUARDS[target];
    expect(allowed, `Chưa khai quyền của trang đích ${target}`).toBeDefined();
    expect(allowed).toContain(role);
  });

  it("NV 3D KHÔNG bị đưa vào Danh sách đơn hàng", () => {
    expect(landingPathForRole("DESIGN_3D")).toBe("/dashboard/design-3d");
    expect(landingPathForRole("DESIGN_3D")).not.toBe("/dashboard/orders");
  });

  // Chưa đăng nhập / chưa đọc được quyền: đoán bừa một vai là lại rơi vào 403. Điểm trung lập
  // thì vai nào cũng qua được, và chính nó điều hướng tiếp sau khi đăng nhập.
  it.each([[undefined], [null], [""], ["ROLE_LA"]])("vai không xác định (%j) → điểm trung lập", (role) => {
    expect(landingPathForRole(role as string | undefined)).toBe(NEUTRAL_LANDING);
  });
});

describe("Điều hướng khi đang đứng ở /dashboard", () => {
  it("NV 3D bị chuyển sang màn việc của họ", () => {
    expect(shouldRedirectFromDashboard("DESIGN_3D")).toBe("/dashboard/design-3d");
  });

  // Đích cũ là /dashboard/stores — một trang không có mục nào trong menu, nay đã xoá.
  it("SALES được chuyển tới Danh sách đơn hàng — mục duy nhất trong menu của họ", () => {
    expect(shouldRedirectFromDashboard("SALES")).toBe("/dashboard/orders");
  });

  // Nếu hàm này trả về "/dashboard" thì trang tự chuyển về chính nó — treo cứng trình duyệt.
  it.each([["ADMIN"], ["ORDER"], ["PRODUCTION"], [undefined]])(
    "%s ở lại Dashboard, KHÔNG tự chuyển về chính nó",
    (role) => {
      expect(shouldRedirectFromDashboard(role)).toBeNull();
    },
  );

  it("không bao giờ trả về chính điểm trung lập", () => {
    for (const role of [...ALL_ROLES, undefined, null, "LA"]) {
      expect(shouldRedirectFromDashboard(role as string)).not.toBe(NEUTRAL_LANDING);
    }
  });
});

// ─── Nhà của một vai phải CÓ TRONG MENU của vai đó ───────────────────────────
//
// 🔴 VÌ SAO CẦN BẤT BIẾN THỨ HAI, TRONG KHI ĐÃ CÓ `PAGE_GUARDS` Ở TRÊN:
//
// `PAGE_GUARDS` đo "vai này có VÀO được trang đích không" — nó chống màn 403. Nhưng đã có một
// lỗi thật LỌT QUA nó: SALES đăng nhập vào /dashboard/stores, một trang họ vào được nhưng
// KHÔNG có mục nào trong menu. Bấm sang chỗ khác một lần là hết đường quay lại, trừ khi đăng
// xuất hoặc tự gõ URL. Test ở trên xanh suốt thời gian đó — vì nó đo một tính chất khác.
//
// Tính chất còn thiếu, viết thành một câu: NHÀ CỦA MỘT VAI PHẢI LÀ MỘT MỤC TRONG MENU CỦA
// CHÍNH VAI ĐÓ.
//
// ⚠️ VÀ NÓ KHÔNG DÙNG BẢNG CHÉP TAY. `PAGE_GUARDS` ở trên tự nhận là bản sao của requireRole —
// hữu ích, nhưng phải nhớ sửa. Khối này SUY từ hai nguồn đã có (`landingPathForRole` +
// `visibleSections`), nên thêm vai thứ sáu hay dời một mục menu về sau đều được canh sẵn,
// không ai phải nhớ cập nhật gì.
describe("Nhà của một vai phải nằm trong menu của vai đó", () => {
  const menuHrefs = (role: string) =>
    visibleSections(role).flatMap((s) => s.items.map((i) => i.href));

  it.each(ALL_ROLES)("%s quay lại nhà của mình được từ menu", (role) => {
    const target = landingPathForRole(role);

    // MIỄN TRỪ DUY NHẤT, và có chủ ý: điểm trung lập là nơi người CHƯA biết vai đi qua rồi
    // được điều hướng tiếp — nó không cần là nhà của ai. Miễn trừ tường minh để người đọc sau
    // biết đây là quyết định, không phải chỗ sót.
    if (target === NEUTRAL_LANDING) return;

    expect(
      menuHrefs(role),
      `${role} về ${target} nhưng menu của họ không có mục nào trỏ tới đó — vào được mà không quay lại được`,
    ).toContain(target);
  });

  // Chặn ca "trang đích đã bị xoá nhưng bảng landing còn trỏ tới": href không có trong menu
  // của BẤT KỲ vai nào là một đường dẫn không còn ai đi tới được.
  it("mọi đích không-trung-lập đều là một href CÓ THẬT trong NAV_SECTIONS", () => {
    const allHrefs = new Set(NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href)));
    for (const role of ALL_ROLES) {
      const target = landingPathForRole(role);
      if (target === NEUTRAL_LANDING) continue;
      expect([...allHrefs], `${role} → ${target}`).toContain(target);
    }
  });
});

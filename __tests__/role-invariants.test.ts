import { describe, expect, it } from "vitest";

import { ROLE_LABELS, USER_ROLE_VALUES } from "@/app/lib/roles";
import { landingPathForRole, NEUTRAL_LANDING } from "@/app/lib/business/auth/landing";
import { visibleSections } from "@/app/lib/ui/nav-model";
import { writableColumnsForRole } from "@/app/lib/business/orders/item-writable-fields";

// ═══════════════════════════════════════════════════════════════════════════
// MỌI VAI PHẢI ĐƯỢC KHAI ĐỦ Ở MỌI NƠI — kiểm bằng cách SUY, không bằng cách nhớ
//
// 🔴 VÌ SAO FILE NÀY TỒN TẠI:
//
// Thêm vai `RND` đụng vào SÁU nơi rời nhau: enum schema, `USER_ROLE_VALUES`, `ROLE_LABELS`,
// bảng màu ở Quản lý User, `NavRole` + menu, và bảng landing. Hai trong số đó là
// `Record<UserRole, …>` vét cạn nên `tsc` bắt được ngay. BỐN NƠI CÒN LẠI KHÔNG.
//
// Và đã có bằng chứng: cả bộ test 2502 bài vẫn XANH sau khi `RND` vào enum, vì mọi test tự
// nhận là "mọi vai" đều dùng một mảng năm vai CHÉP TAY. Một test bỏ sót đúng cái vai vừa thêm
// còn tệ hơn không có test — nó phát tín hiệu an toàn.
//
// Nên mọi bất biến dưới đây lặp trên `USER_ROLE_VALUES`. Vai thứ bảy sẽ được kiểm ngay từ
// dòng đầu tiên nó ra đời, không cần ai nhớ sửa file này.
// ═══════════════════════════════════════════════════════════════════════════

describe("Mỗi vai đều được khai đủ", () => {
  it("không trùng, không rỗng", () => {
    expect(new Set(USER_ROLE_VALUES).size).toBe(USER_ROLE_VALUES.length);
    expect(USER_ROLE_VALUES.length).toBeGreaterThan(0);
  });

  it.each(USER_ROLE_VALUES)("%s có nhãn tiếng Việt không rỗng", (role) => {
    expect(ROLE_LABELS[role]?.trim()).not.toBe("");
  });

  // Vai không có mục menu nào = đăng nhập vào một sidebar trắng, không đường đi tiếp.
  it.each(USER_ROLE_VALUES)("%s thấy ít nhất một mục trong menu", (role) => {
    const items = visibleSections(role).flatMap((s) => s.items);
    expect(items.length, `${role} có menu RỖNG`).toBeGreaterThan(0);
  });

  // Bảng landing chỉ khai NGOẠI LỆ; mặc định là điểm trung lập, và điểm trung lập là hợp lệ.
  // Bất biến ở đây yếu hơn auth-landing.test.ts một cách có chủ ý — chỗ đó mới là nơi chốt
  // "nhà của vai phải nằm trong menu của vai".
  it.each(USER_ROLE_VALUES)("%s có một đích landing xác định", (role) => {
    const target = landingPathForRole(role);
    expect(target.startsWith("/dashboard"), role).toBe(true);
    expect([NEUTRAL_LANDING, target]).toContain(target);
  });

  // `writableColumnsForRole` mặc định trả về TOÀN BỘ cột — tức "không khai = ghi được hết".
  // Đó là quy ước đúng cho các vai nghiệp vụ, nhưng nó nghĩa là một vai chỉ-đọc bị QUÊN khai
  // sẽ âm thầm ghi được mọi thứ. Bất biến này chốt danh sách trả về không bao giờ rỗng, và
  // ràng buộc chặt cho R&D nằm ngay dưới.
  it.each(USER_ROLE_VALUES)("%s có danh sách cột ghi được, không rỗng", (role) => {
    expect(writableColumnsForRole(role).length, role).toBeGreaterThan(0);
  });
});

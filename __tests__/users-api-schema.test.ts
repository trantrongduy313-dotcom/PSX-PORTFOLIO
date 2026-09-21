// Ba schema của /api/users — đọc THẲNG từ route, không chép lại.
//
// Thay cho __tests__/user-management.test.ts (443 dòng). File đó tự khai lại cả ba schema rồi
// test bản khai lại của chính nó, và bản chép ĐÃ LỆCH NẶNG:
//
//   • Danh sách vai trò chép cứng 4 giá trị. Hệ thống có SÁU (thêm DESIGN_3D và RND). Bản chép
//     sẽ TỪ CHỐI hai vai trò đang dùng thật, mà test vẫn xanh vì nó test chính bản chép.
//   • updateUserSchema chép thiếu hẳn trường `email` — tức là thiếu đúng thao tác nhạy cảm
//     nhất của route đó (đổi định danh đăng nhập).
//
// 🔴 Sáu hàm còn lại của file cũ — canCreateUser, canDeleteUser, canDeactivateSelf,
// isSalesRole, getStoreAccessLabel, simulateCreateUser — KHÔNG TỒN TẠI trong app. Chúng là
// luật do chính file test bịa ra. Ba điều bịa đáng kể:
//   1. `canDeleteUser` mô tả một guard chặn xoá VIRTUAL_ADMIN kèm thông báo tử tế. Route thật
//      KHÔNG có guard đó — VIRTUAL_ADMIN không có hàng trong bảng users nên lệnh update ném
//      lỗi và trả về 500.
//   2. `simulateCreateUser` khẳng định email trùng thì LUÔN lỗi. Route thật KHÔI PHỤC tài
//      khoản đã xoá mềm nếu email trùng với nó.
//   3. `getStoreAccessLabel` sinh ra các chuỗi ("Chưa gán cửa hàng", "2 cửa hàng") không xuất
//      hiện ở đâu trong giao diện thật.
// Đã xoá cả sáu. Luật xoá/khôi phục nằm trong route và bám vào truy vấn DB nên chưa có test —
// ghi ra đây để không ai tưởng là có.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/lib/auth-helpers", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/app/lib/prisma", () => ({ prisma: {} }));

import { USER_ROLE_VALUES } from "@/app/lib/roles";
import { createUserSchema } from "@/app/api/users/route";
import { updateUserSchema } from "@/app/api/users/[id]/route";
import { putStoresSchema } from "@/app/api/users/[id]/stores/route";

const validUser = { name: "Nguyễn Văn A", email: "a@example.com", role: "SALES" };

describe("createUserSchema", () => {
  it("đủ name + email + role là hợp lệ", () => {
    expect(createUserSchema.safeParse(validUser).success).toBe(true);
  });

  // 🔴 Chính vết lệch của bản chép cũ: nó chỉ biết 4 vai trò. Lấy danh sách từ nguồn duy nhất
  // để thêm vai trò mới mà quên chỗ nào là ĐỎ, không phải là 400 khi tạo tài khoản.
  it("nhận MỌI vai trò trong USER_ROLE_VALUES, kể cả DESIGN_3D và RND", () => {
    for (const role of USER_ROLE_VALUES) {
      expect(createUserSchema.safeParse({ ...validUser, role }).success, role).toBe(true);
    }
    expect(USER_ROLE_VALUES).toContain("DESIGN_3D");
    expect(USER_ROLE_VALUES).toContain("RND");
  });

  it("vai trò ngoài danh sách bị từ chối", () => {
    expect(createUserSchema.safeParse({ ...validUser, role: "MANAGER" }).success).toBe(false);
  });

  it("tên rỗng → báo đúng câu người dùng đọc được", () => {
    const parsed = createUserSchema.safeParse({ ...validUser, name: "" });
    expect(parsed.error?.issues[0].message).toBe("Tên không được để trống");
  });

  it("email sai định dạng → báo đúng câu người dùng đọc được", () => {
    const parsed = createUserSchema.safeParse({ ...validUser, email: "not-an-email" });
    expect(parsed.error?.issues[0].message).toBe("Email không hợp lệ");
  });

  // storeId cấp User là cửa hàng MẶC ĐỊNH, khác với bảng UserStore (nhiều cửa hàng cho SALES).
  // Bắt buộc nó là chặn tạo tài khoản cho mọi vai trò không gắn cửa hàng nào.
  it("storeId không bắt buộc, và nhận null", () => {
    expect(createUserSchema.safeParse(validUser).success).toBe(true);
    expect(createUserSchema.safeParse({ ...validUser, storeId: null }).success).toBe(true);
  });
});

describe("updateUserSchema", () => {
  it("mọi trường đều optional — sửa một thứ không phải gửi lại cả hồ sơ", () => {
    expect(updateUserSchema.safeParse({}).success).toBe(true);
    expect(updateUserSchema.safeParse({ role: "PRODUCTION" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  // 🔴 Bản chép cũ KHÔNG có trường này. Đổi email là đổi cách nhân viên đăng nhập (Google
  // OAuth đối chiếu bằng email), nên nó là thao tác nhạy cảm nhất của route — và là đúng thứ
  // bản chép bỏ sót.
  it("nhận email, và vẫn chặn email sai định dạng", () => {
    expect(updateUserSchema.safeParse({ email: "moi@psx.com" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ email: "khong-phai-email" }).success).toBe(false);
  });

  it("cùng danh sách vai trò với lúc tạo — không lệch giữa hai route", () => {
    for (const role of USER_ROLE_VALUES) {
      expect(updateUserSchema.safeParse({ role }).success, role).toBe(true);
    }
    expect(updateUserSchema.safeParse({ role: "GUEST" }).success).toBe(false);
  });

  it("isActive phải là boolean thật, không nhận chuỗi 'true'", () => {
    expect(updateUserSchema.safeParse({ isActive: "true" }).success).toBe(false);
  });
});

describe("putStoresSchema — gán cửa hàng cho SALES", () => {
  // Mảng rỗng là GỠ HẾT cửa hàng, không phải "không đổi gì". Chặn nó là không còn cách thu hồi
  // quyền xem cửa hàng của một nhân viên.
  it("mảng rỗng là hợp lệ — đó là cách gỡ hết cửa hàng", () => {
    expect(putStoresSchema.safeParse({ storeIds: [] }).success).toBe(true);
  });

  it("nhận danh sách mã cửa hàng", () => {
    expect(putStoresSchema.safeParse({ storeIds: ["store_a", "store_b"] }).success).toBe(true);
  });

  it("một chuỗi đơn lẻ KHÔNG được coi là danh sách một phần tử", () => {
    expect(putStoresSchema.safeParse({ storeIds: "store_a" }).success).toBe(false);
  });
});

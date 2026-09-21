import { describe, expect, it } from "vitest";

import { resolveSessionState } from "@/app/lib/business/auth/session-state";

// Lỗi thật đã xảy ra trên preview: nhân viên 3D vào lần đầu ra trang 403, F5 thì vào được.
// Nguyên nhân là session callback mặc định role về "SALES" khi chưa đọc được từ DB, mà SALES
// là role DUY NHẤT không nằm trong danh sách được vào màn Việc thiết kế 3D.
//
// Các test dưới đây khoá đúng chỗ đó: thiếu role phải ra một trạng thái RIÊNG, không được lẫn
// vào "chưa đăng nhập" cũng không được biến thành một role nào cả.

describe("Ba trạng thái của session", () => {
  it("không có userId → chưa đăng nhập", () => {
    expect(resolveSessionState({ userId: null, role: "ADMIN" })).toBe("ANONYMOUS");
    expect(resolveSessionState(null)).toBe("ANONYMOUS");
    expect(resolveSessionState(undefined)).toBe("ANONYMOUS");
  });

  it("có userId + có role → hợp lệ", () => {
    expect(resolveSessionState({ userId: "u1", role: "DESIGN_3D" })).toBe("OK");
  });

  // ⚠️ TEST QUAN TRỌNG NHẤT FILE NÀY.
  // Nếu ai đó đưa lại một giá trị mặc định vào đường này, ba khẳng định dưới đây đổ.
  it.each([[null], [undefined], [""], ["   "]])(
    "có userId nhưng role = %j → CHƯA XÁC ĐỊNH, không phải ANONYMOUS và không phải OK",
    (role) => {
      const state = resolveSessionState({ userId: "u1", role: role as string | null });
      expect(state).toBe("ROLE_UNAVAILABLE");
      expect(state).not.toBe("ANONYMOUS");
      expect(state).not.toBe("OK");
    },
  );

  // "Chưa đăng nhập" dẫn tới màn login, "chưa đọc được quyền" dẫn tới màn Thử lại. Gộp hai
  // cái này là đá một người ĐANG đăng nhập về màn login — mà vì họ còn session, màn login lại
  // đẩy ngược vào: một vòng lặp.
  it("thiếu role KHÁC thiếu đăng nhập", () => {
    expect(resolveSessionState({ userId: "u1", role: null }))
      .not.toBe(resolveSessionState({ userId: null, role: null }));
  });

  it("không tự suy ra role từ việc đã đăng nhập", () => {
    // Người đã đăng nhập KHÔNG mặc nhiên là SALES, cũng không mặc nhiên là gì cả.
    expect(resolveSessionState({ userId: "u1" })).toBe("ROLE_UNAVAILABLE");
  });
});

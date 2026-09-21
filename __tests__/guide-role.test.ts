import { describe, expect, it } from "vitest";

import {
  allowedGuideRoles,
  clampGuideRole,
  defaultGuideRoleFor,
} from "@/app/lib/guide/guide-role";
import type { GuideRole } from "@/app/lib/guide/content";

// ─── AI ĐƯỢC MỞ BỘ HƯỚNG DẪN NÀO ─────────────────────────────────────────────
//
// 🔴 VÌ SAO PHẢI CÓ TEST CHO MỘT LUẬT BA DÒNG:
//
// Đây là luật ẨN GIAO DIỆN, và cả hai chiều sai của nó đều IM LẶNG:
//
//   · Ẩn nhầm  → một người mất bộ hướng dẫn của chính họ. Không lỗi, không log; họ chỉ thấy
//                trang trống rỗng hơn hôm qua và không biết hỏi ai.
//   · Hở nhầm  → Sales lại thấy bộ Quản lý, tức đúng thứ vừa được yêu cầu bỏ đi.
//
// Không có gì ở tầng nào khác bắt được hai ca này: bộ hướng dẫn không phải dữ liệu có phân
// quyền, nên `requireRole` không đụng tới, và trang vẫn render bình thường trong cả hai ca.

const ALL: GuideRole[] = ["employee", "manager", "design3d"];

describe("allowedGuideRoles — ai thấy bộ nào", () => {
  it("SALES chỉ thấy bộ của mình", () => {
    expect(allowedGuideRoles(defaultGuideRoleFor("SALES"))).toEqual(["employee"]);
  });

  it("NV 3D chỉ thấy bộ của mình", () => {
    expect(allowedGuideRoles(defaultGuideRoleFor("DESIGN_3D"))).toEqual(["design3d"]);
  });

  // ⚠️ CHỦ Ý, KHÔNG PHẢI SÓT: quản lý là người đi hỗ trợ Sales và NV 3D. Muốn trả lời được thì
  // phải đọc được ĐÚNG THỨ người kia đang đọc. Test này tồn tại để lần dọn dẹp sau không ai
  // "thống nhất cho gọn" bằng cách khoá luôn cả họ.
  it("ADMIN / ORDER / PRODUCTION thấy CẢ BA bộ", () => {
    for (const r of ["ADMIN", "ORDER", "PRODUCTION"]) {
      expect(allowedGuideRoles(defaultGuideRoleFor(r)), r).toEqual(ALL);
    }
  });

  it("vai lạ rơi về bộ Sales và bị khoá ở đó", () => {
    expect(allowedGuideRoles(defaultGuideRoleFor("VAI_CHUA_CO"))).toEqual(["employee"]);
  });

  it("không bao giờ trả về danh sách rỗng — rỗng là không đọc được gì", () => {
    for (const r of ["ADMIN", "ORDER", "PRODUCTION", "SALES", "DESIGN_3D", "???"]) {
      expect(allowedGuideRoles(defaultGuideRoleFor(r)).length, r).toBeGreaterThan(0);
    }
  });

  it("bộ mặc định LUÔN nằm trong tập được phép", () => {
    // Nếu luật nào đó khiến hai thứ này lệch nhau thì người dùng mở trang ra là rơi ngay vào
    // một bộ không được phép — và bị kẹp về chính nó, thành vòng lặp.
    for (const r of ["ADMIN", "ORDER", "PRODUCTION", "SALES", "DESIGN_3D", "???"]) {
      const d = defaultGuideRoleFor(r);
      expect(allowedGuideRoles(d), r).toContain(d);
    }
  });
});

describe("clampGuideRole — dọn lựa chọn cũ còn sót trong localStorage", () => {
  // 🔴 CA QUAN TRỌNG NHẤT CỦA CẢ FILE. Trước khi ẩn tab, một Sales hoàn toàn có thể đã bấm sang
  // bộ Quản lý — và giá trị "manager" NẰM LẠI trong localStorage của họ. Chỉ ẩn nút thì lần mở
  // kế tiếp họ vào thẳng bộ Quản lý và không còn nút nào để quay ra.
  //
  // Nghĩa là cái bẫy này chỉ dính đúng những người đã dùng nhiều nhất.
  it("Sales từng lưu bộ Quản lý → bị kéo về bộ Sales", () => {
    expect(clampGuideRole("manager", "employee")).toBe("employee");
  });

  it("NV 3D từng lưu bộ Sales → bị kéo về bộ 3D", () => {
    expect(clampGuideRole("employee", "design3d")).toBe("design3d");
  });

  it("quản lý giữ nguyên lựa chọn của họ — cả ba bộ", () => {
    for (const saved of ALL) {
      expect(clampGuideRole(saved, "manager"), saved).toBe(saved);
    }
  });

  it("lựa chọn hợp lệ thì KHÔNG bị đụng vào", () => {
    expect(clampGuideRole("employee", "employee")).toBe("employee");
    expect(clampGuideRole("design3d", "design3d")).toBe("design3d");
  });

  it("kẹp hai lần cũng ra một kết quả", () => {
    // Hàm chạy ở mỗi lượt render; không ổn định là trạng thái nhảy qua lại giữa hai giá trị.
    for (const d of ALL) {
      for (const saved of ALL) {
        const once = clampGuideRole(saved, d);
        expect(clampGuideRole(once, d), `${saved}→${d}`).toBe(once);
      }
    }
  });
});

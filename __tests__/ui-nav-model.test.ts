import { describe, expect, it } from "vitest";

import {
  NAV_SECTIONS,
  navLabel,
  sectionBadgeTotal,
  visibleSections,
  type NavRole,
} from "@/app/lib/ui/nav-model";
import { USER_ROLE_VALUES } from "@/app/lib/roles";

// ═══════════════════════════════════════════════════════════════════════════
// TEST ĐẶC TÍNH — chốt hành vi ĐANG CHẠY của menu trước khi đổi cách dựng nó
//
// 🔴 VÌ SAO PHẢI CÓ FILE NÀY:
//
// Quyền xem menu trước đây là các CỜ MỆNH LỆNH lồng nhau, rải trong ~100 dòng JSX của
// components/Sidebar.tsx:
//
//     isSalesOnly ? [orders] : isDesign3DOnly ? [design3DLink] : [ … sáu mục … ]
//     {!isSalesOnly && !isDesign3DOnly && <Cảnh báo/>}
//     {(role === "ADMIN" || role === "ORDER") && <nhóm Admin>{role === "ADMIN" && …}</…>}
//
// Chuyển nó thành `roles: [...]` nghĩa là phải SUY RA ma trận quyền — và suy sai một ô là một
// người mất một mục menu, hoặc thấy mục không được phép thấy. Không có gì báo.
//
// Nên các danh sách dưới đây là ma trận CHÉP TỪ hành vi cũ, không phải chép từ model. Test đỏ
// nghĩa là phép chuyển vừa ĐỔI QUYỀN XEM của một vai — một quyết định, không phải chi tiết.
//
// ⚠️ Đây chỉ là lớp ẨN GIAO DIỆN. Chặn thật ở `requireRole` của từng trang và ở API. Nhưng menu
// sai vẫn là lỗi thật: nó dẫn người ta tới một trang sẽ từ chối họ.
// ═══════════════════════════════════════════════════════════════════════════

const hrefsFor = (role: string): string[] =>
  visibleSections(role).flatMap((s) => s.items.map((i) => i.href));

const DOCS = [
  // Trung tâm trợ giúp THAY CHỖ "Hướng dẫn sử dụng" trong menu — Hướng dẫn thành một trang bên
  // trong nó. Nhóm này vẫn đúng ba mục: menu KHÔNG dài thêm.
  "/dashboard/help",
  "/dashboard/feedback",
  "/dashboard/whats-new",
];

const OPS_MAIN = [
  "/dashboard",
  "/dashboard/orders",
  "/dashboard/orders/new",
  "/dashboard/statistics",
  "/dashboard/design-3d",
  "/dashboard/admin/kpi-3d",
  "/dashboard/alerts",
];

const ADMIN_SHARED = [
  "/dashboard/admin/craftsmen",
  "/dashboard/admin/designers-3d",
  "/dashboard/admin/stage-reviews",
];

const ADMIN_ONLY = [
  "/dashboard/admin/users",
  "/dashboard/admin/change-history",
  "/dashboard/admin/changelog",
  "/dashboard/admin/feedback",
];

describe("visibleSections — ma trận quyền chốt theo hành vi cũ", () => {
  it("ADMIN thấy đủ 17 mục", () => {
    expect(hrefsFor("ADMIN")).toEqual([...OPS_MAIN, ...DOCS, ...ADMIN_SHARED, ...ADMIN_ONLY]);
  });

  // ORDER vào được nhóm Admin nhưng KHÔNG thấy bốn mục cuối — cũ: `role === "ADMIN" &&` lồng
  // bên trong `(role === "ADMIN" || role === "ORDER")`.
  it("ORDER thấy nhóm Admin nhưng KHÔNG thấy 4 mục ADMIN-only", () => {
    expect(hrefsFor("ORDER")).toEqual([...OPS_MAIN, ...DOCS, ...ADMIN_SHARED]);
  });

  it("PRODUCTION không thấy nhóm Admin nào", () => {
    expect(hrefsFor("PRODUCTION")).toEqual([...OPS_MAIN, ...DOCS]);
  });

  // cũ: isSalesOnly → mainMenu CHỈ có Danh sách đơn hàng, và KHÔNG có Cảnh báo.
  it("SALES chỉ thấy Danh sách đơn hàng + nhóm Tài liệu", () => {
    expect(hrefsFor("SALES")).toEqual(["/dashboard/orders", ...DOCS]);
  });

  // cũ: isDesign3DOnly → mainMenu CHỈ có Việc thiết kế 3D. NV 3D không được thấy Đơn hàng /
  // Thống kê / Cảnh báo.
  // R&D vào hệ thống để làm ĐÚNG MỘT việc: nhập Mã số mẫu cho MO đã sang Phòng Sản Xuất. Mọi
  // mục khác đều là cửa họ không có việc gì để mở.
  it("RND chỉ thấy Danh sách đơn hàng + nhóm Tài liệu", () => {
    expect(hrefsFor("RND")).toEqual(["/dashboard/orders", ...DOCS]);
  });

  it("DESIGN_3D chỉ thấy Việc thiết kế 3D + nhóm Tài liệu", () => {
    expect(hrefsFor("DESIGN_3D")).toEqual(["/dashboard/design-3d", ...DOCS]);
  });

  it("vai không xác định / chưa đăng nhập → KHÔNG thấy gì", () => {
    expect(visibleSections(undefined)).toEqual([]);
    expect(visibleSections("KHONG_CO_VAI_NAY")).toEqual([]);
  });
});

describe("visibleSections — bỏ nhóm rỗng", () => {
  // PRODUCTION không có mục nào trong nhóm Admin. Giữ nhóm rỗng là hiện một tiêu đề "ADMIN"
  // trống trơn, và câu hỏi "vì sao có tiêu đề mà không có mục" sẽ phải trả lời ở chỗ render —
  // tức luật rời khỏi model.
  it("nhóm không còn mục nào thì BỎ HẲN, không trả về tiêu đề trống", () => {
    expect(visibleSections("PRODUCTION").map((s) => s.key)).toEqual(["main", "docs"]);
  });

  it("SALES, DESIGN_3D và RND cũng chỉ còn hai nhóm", () => {
    for (const r of ["SALES", "DESIGN_3D", "RND"]) {
      expect(visibleSections(r).map((s) => s.key), r).toEqual(["main", "docs"]);
    }
  });
});

describe("tính toàn vẹn của NAV_SECTIONS", () => {
  const items = NAV_SECTIONS.flatMap((s) => s.items);

  it("không trùng key", () => {
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("không trùng href", () => {
    const hrefs = items.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("không trùng key nhóm", () => {
    const keys = NAV_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Một mục không vai nào thấy là code chết trông như đang chạy — thứ không ai phát hiện vì nó
  // không hiện ra ở đâu để mà thiếu.
  it("mọi mục phải có ít nhất một vai thấy được", () => {
    for (const i of items) expect(i.roles.length, i.key).toBeGreaterThan(0);
  });

  // Nhãn rỗng ở một ngôn ngữ thì menu có một dòng trống bấm được — lỗi im lặng điển hình.
  it("mọi mục có nhãn CẢ HAI ngôn ngữ, không rỗng", () => {
    for (const i of items) {
      expect(navLabel(i.label, "vi").trim(), i.key).not.toBe("");
      expect(navLabel(i.label, "en").trim(), i.key).not.toBe("");
    }
  });

  it("mọi href nằm trong /dashboard", () => {
    for (const i of items) expect(i.href.startsWith("/dashboard"), i.key).toBe(true);
  });

  it("nhóm đầu KHÔNG có tiêu đề; các nhóm sau thì CÓ", () => {
    expect(NAV_SECTIONS[0].title).toBeNull();
    for (const s of NAV_SECTIONS.slice(1)) expect(s.title, s.key).not.toBeNull();
  });
});

describe("sectionBadgeTotal — huy hiệu nổi lên tiêu đề nhóm", () => {
  const admin = NAV_SECTIONS.find((s) => s.key === "admin")!;
  const docs = NAV_SECTIONS.find((s) => s.key === "docs")!;
  const main = NAV_SECTIONS.find((s) => s.key === "main")!;

  it("cộng huy hiệu server của các mục trong nhóm", () => {
    expect(sectionBadgeTotal(admin, { feedback: 2 })).toBe(2);
  });

  it("không có số nào thì bằng 0 — nhóm không hiện huy hiệu", () => {
    expect(sectionBadgeTotal(admin, {})).toBe(0);
  });

  it("nhóm chính cộng được Cảnh báo", () => {
    expect(sectionBadgeTotal(main, { alerts: 5 })).toBe(5);
  });

  // ⚠️ Huy hiệu "Có gì mới" đếm từ localStorage — CHỈ CLIENT biết. Server không đếm được, nên
  // hàm này KHÔNG cộng nó. Chỗ render truyền một ReactNode riêng cho ca đó.
  it("KHÔNG cộng huy hiệu changelog — server không đếm được nó", () => {
    expect(sectionBadgeTotal(docs, { alerts: 9, feedback: 9 })).toBe(0);
  });

  it("số đếm cho một loại KHÔNG nằm trong nhóm thì bị bỏ qua", () => {
    // `alerts` thuộc nhóm chính, không thuộc nhóm Admin.
    expect(sectionBadgeTotal(admin, { alerts: 7 })).toBe(0);
  });
});

describe("mọi vai đều đọc được nhãn", () => {
  it("không vai nào ra menu rỗng ngoài vai không xác định", () => {
    // Suy từ USER_ROLE_VALUES: thêm vai thứ bảy mà quên khai menu thì test này đỏ ngay, thay vì
    // người đó đăng nhập vào một sidebar trắng.
    for (const r of USER_ROLE_VALUES as readonly NavRole[]) {
      expect(hrefsFor(r).length, r).toBeGreaterThan(0);
    }
  });
});

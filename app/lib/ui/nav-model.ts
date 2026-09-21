import type { Locale } from "@/app/lib/i18n/labels";

// ─── MÔ HÌNH MENU ĐIỀU HƯỚNG — nguồn duy nhất ────────────────────────────────
//
// 🔴 VÌ SAO FILE NÀY TỒN TẠI:
//
// Trước đây cấu trúc menu LÀ JSX. Thứ tự, phân nhóm, quyền xem và nhãn — tất cả nằm trong
// `return (...)` của một hàm ~100 dòng ở components/Sidebar.tsx. Hệ quả:
//
//   · Đổi menu = sửa JSX. Không có gì kiểm được, và quyền xem nằm trong các cờ mệnh lệnh lồng
//     nhau (`isSalesOnly`, `isDesign3DOnly`, `role === "ADMIN"`) rải khắp cây JSX.
//   · NHÃN CÓ HAI NGUỒN, và không nguồn nào đầy đủ: 6 nhãn lấy từ `LABELS[locale].ui.nav`, số
//     còn lại là ternary `locale === "vi" ? … : …` viết thẳng trong JSX. Đúng thứ CLAUDE.md mục 4
//     cảnh báo, áp lên chính cái menu mọi người nhìn cả ngày.
//
// Nay menu là DỮ LIỆU. Đổi tên nhóm / dời mục / thêm mục = sửa mảng NAV_SECTIONS bên dưới, và
// test nói ngay ai vừa bị đổi quyền xem.
//
// ⚠️ ĐÂY CHỈ LÀ LỚP ẨN GIAO DIỆN. Chặn thật nằm ở `requireRole` của từng trang và ở API. Nhưng
// menu sai vẫn là lỗi thật: nó dẫn người ta tới một trang sẽ từ chối họ.
//
// File THUẦN: không React, không prisma. Vì thế `badge` là một KHOÁ, không phải con số — model
// không được phép biết `unresolvedAlerts` bằng bao nhiêu.

/** Các vai của hệ thống. Trùng với UserRole trong schema. */
export type NavRole = "ADMIN" | "ORDER" | "PRODUCTION" | "SALES" | "DESIGN_3D" | "RND";

/**
 * Loại huy hiệu đếm.
 *
 * ⚠️ `changelog` CỐ Ý KHÔNG có trong `NavBadgeCounts`: nó tính từ localStorage nên CHỈ CLIENT
 * biết. Server không đếm được, và `sectionBadgeTotal` cũng không cộng nó — xem chú thích ở đó.
 */
export type NavBadgeKey = "alerts" | "feedback" | "changelog";

/** Số đếm do SERVER tính, truyền vào lúc render. */
export type NavBadgeCounts = Partial<Record<Exclude<NavBadgeKey, "changelog">, number>>;

export type NavLabel = { vi: string; en: string };

export type NavItem = {
  /** Khoá bền, dùng cho React key và cho test. KHÔNG đổi khi đổi nhãn hay đường dẫn. */
  key: string;
  href: string;
  /** Khớp chính xác đường dẫn thay vì `startsWith` — cho các trang là tiền tố của trang khác. */
  exact?: boolean;
  label: NavLabel;
  /** Vai nào THẤY mục này. Rỗng là không ai thấy — test chặn ca đó. */
  roles: readonly NavRole[];
  badge?: NavBadgeKey;
};

export type NavSection = {
  key: string;
  /** `null` = nhóm đầu, không có tiêu đề (và vì thế không gập được). */
  title: NavLabel | null;
  items: readonly NavItem[];
};

const ALL_ROLES: readonly NavRole[] = ["ADMIN", "ORDER", "PRODUCTION", "SALES", "DESIGN_3D", "RND"];
/** Các vai làm việc trên đơn hàng — KHÔNG gồm SALES và DESIGN_3D. */
const OPS_ROLES: readonly NavRole[] = ["ADMIN", "ORDER", "PRODUCTION"];

// ─── ĐỊNH NGHĨA MENU ─────────────────────────────────────────────────────────
//
// ⚠️ MA TRẬN QUYỀN DƯỚI ĐÂY ĐƯỢC SUY RA TỪ CÁC CỜ MỆNH LỆNH CŨ, và nó được chốt bằng test đặc
// tính (__tests__/ui-nav-model.test.ts) viết theo hành vi ĐANG CHẠY. Test đó đỏ nghĩa là phép
// chuyển này vừa đổi quyền xem menu của một vai — không phải một chi tiết kỹ thuật.
//
//   cũ: isSalesOnly        → chỉ thấy Danh sách đơn hàng
//   cũ: isDesign3DOnly     → chỉ thấy Việc thiết kế 3D
//   cũ: !isSalesOnly && !isDesign3DOnly → thấy Cảnh báo
//   cũ: nhóm Tài liệu      → MỌI vai
//   cũ: nhóm Admin         → ADMIN hoặc ORDER; bốn mục cuối ADMIN-only
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    key: "main",
    title: null,
    items: [
      { key: "dashboard", href: "/dashboard", exact: true, roles: OPS_ROLES,
        label: { vi: "Dashboard", en: "Dashboard" } },
      // SALES và RND thấy đúng một mục này, nên nó không dùng OPS_ROLES.
      //
      // R&D: đây là mục DUY NHẤT ngoài nhóm Tài liệu. Họ vào để nhập "Mã số mẫu" cho MO đã
      // sang Phòng Sản Xuất — phạm vi dữ liệu bị siết ở API (xem business/orders/query-scope.ts),
      // KHÔNG phải ở đây. Menu chỉ quyết định thấy hay không thấy cánh cửa.
      { key: "orders", href: "/dashboard/orders", roles: [...OPS_ROLES, "SALES", "RND"],
        label: { vi: "Danh sách đơn hàng", en: "Orders" } },
      { key: "new-order", href: "/dashboard/orders/new", roles: OPS_ROLES,
        label: { vi: "Tạo đơn mới", en: "New Order" } },
      { key: "statistics", href: "/dashboard/statistics", roles: OPS_ROLES,
        label: { vi: "Thống kê", en: "Statistics" } },
      // DESIGN_3D thấy đúng một mục này.
      { key: "design-3d", href: "/dashboard/design-3d", roles: [...OPS_ROLES, "DESIGN_3D"],
        label: { vi: "Việc thiết kế 3D", en: "3D Design Work" } },
      { key: "kpi-3d", href: "/dashboard/admin/kpi-3d", roles: OPS_ROLES,
        label: { vi: "KPI NV 3D", en: "3D KPI" } },
      { key: "alerts", href: "/dashboard/alerts", roles: OPS_ROLES, badge: "alerts",
        label: { vi: "Cảnh báo", en: "Alerts" } },
    ],
  },
  {
    key: "docs",
    title: { vi: "Tài liệu", en: "Docs" },
    items: [
      // ⚠️ TRUNG TÂM TRỢ GIÚP THAY CHỖ "Hướng dẫn sử dụng", KHÔNG thêm vào bên cạnh.
      //
      // Hướng dẫn thành một trang BÊN TRONG trung tâm đó, nên nhóm này vẫn đúng ba mục. Người
      // dùng vừa phàn nàn menu phải kéo mới thấy hết — thêm một dòng để "gom cho gọn" là đi
      // ngược đúng lời họ nói.
      //
      // `exact` = true: /dashboard/help không được sáng khi đang ở /dashboard/guide, vì Hướng dẫn
      // KHÔNG nằm dưới đường dẫn đó (nó vẫn là /dashboard/guide).
      { key: "help", href: "/dashboard/help", exact: true, roles: ALL_ROLES,
        label: { vi: "Trung tâm trợ giúp", en: "Help Center" } },
      // Nửa "đóng vòng" của tính năng góp ý: người gửi thấy lại trạng thái và câu trả lời.
      // Thiếu nó thì sau lần thứ hai không hồi âm họ quay về nhắn tin.
      { key: "my-feedback", href: "/dashboard/feedback", exact: true, roles: ALL_ROLES,
        label: { vi: "Góp ý của tôi", en: "My Feedback" } },
      // Trang này tồn tại vì Hướng dẫn không theo kịp: nó mô tả TRẠNG THÁI HIỆN TẠI nên mỗi lần
      // hệ thống đổi là một đoạn thành sai, còn changelog chỉ GHI THÊM nên mục cũ thành lịch sử
      // chứ không thành sai.
      { key: "whats-new", href: "/dashboard/whats-new", exact: true, roles: ALL_ROLES,
        badge: "changelog", label: { vi: "Có gì mới", en: "What's New" } },
    ],
  },
  {
    key: "admin",
    title: { vi: "Admin", en: "Admin" },
    items: [
      { key: "craftsmen", href: "/dashboard/admin/craftsmen", roles: ["ADMIN", "ORDER"],
        label: { vi: "Quản lý Thợ", en: "Craftsmen" } },
      { key: "designers-3d", href: "/dashboard/admin/designers-3d", roles: ["ADMIN", "ORDER"],
        label: { vi: "Quản lý NV 3D", en: "3D Designers" } },
      { key: "stage-reviews", href: "/dashboard/admin/stage-reviews", roles: ["ADMIN", "ORDER"],
        label: { vi: "Đánh giá Khâu", en: "Stage Reviews" } },
      { key: "users", href: "/dashboard/admin/users", roles: ["ADMIN"],
        label: { vi: "Quản lý User", en: "User Management" } },
      { key: "change-history", href: "/dashboard/admin/change-history", roles: ["ADMIN"],
        label: { vi: "Lịch sử thay đổi", en: "Change History" } },
      { key: "changelog", href: "/dashboard/admin/changelog", roles: ["ADMIN"],
        label: { vi: "Ghi nhận cải tiến", en: "Changelog" } },
      // Huy hiệu này LÀ THỨ GIỮ TÍNH NĂNG SỐNG — không có email hay lời nhắc nào khác. Đề xuất
      // cải tiến CỐ Ý không bắn chuông Chat (feedback/kind.ts), nên con số này là kênh duy nhất.
      //
      // 🔴 VÀ NÓ TỪNG BỊ CHÔN DƯỚI FOLD: mục cuối cùng của menu dài nhất, phải kéo mới thấy —
      // tức kênh duy nhất đó vô hình theo mặc định. Xem `sectionBadgeTotal`.
      { key: "admin-feedback", href: "/dashboard/admin/feedback", roles: ["ADMIN"], badge: "feedback",
        label: { vi: "Phản hồi người dùng", en: "User Feedback" } },
    ],
  },
];

/** Nhãn theo ngôn ngữ. Một hàm để chỗ gọi không rải `locale === "vi" ? … : …` khắp JSX. */
export function navLabel(label: NavLabel, locale: Locale): string {
  return locale === "vi" ? label.vi : label.en;
}

/**
 * Các nhóm mà một vai nhìn thấy — nhóm rỗng bị BỎ HẲN.
 *
 * Bỏ nhóm rỗng ở TẦNG NÀY, không để giao diện tự kiểm: nếu không, PRODUCTION sẽ thấy một tiêu
 * đề "ADMIN" trống trơn, và câu hỏi "vì sao có tiêu đề mà không có mục nào" sẽ được trả lời ở
 * chỗ render — tức luật lại rời khỏi model.
 */
export function visibleSections(role: string | undefined): NavSection[] {
  const r = role as NavRole | undefined;
  if (!r) return [];
  return NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(r)) }))
    .filter((s) => s.items.length > 0);
}

/**
 * Tổng huy hiệu của một nhóm — để hiện trên TIÊU ĐỀ nhóm.
 *
 * 🎯 VÌ SAO CẦN: nhóm gập lại (hoặc nằm dưới fold) thì huy hiệu bên trong vô hình. Với
 * "Phản hồi người dùng" đó không phải chuyện thẩm mỹ — con số đó là kênh thông báo DUY NHẤT của
 * tính năng góp ý. Nổi tổng lên tiêu đề thì cuộn ở đâu, gập hay không, người duyệt vẫn thấy còn
 * việc chờ.
 *
 * ⚠️ KHÔNG CỘNG `changelog`: nó đếm từ localStorage nên chỉ client biết. Chỗ render truyền một
 * `ReactNode` riêng cho ca đó (xem prop `badge` của SidebarSection) — cố ý thiết kế slot ngay từ
 * đầu thay vì chữa sau.
 */
export function sectionBadgeTotal(section: NavSection, counts: NavBadgeCounts): number {
  let total = 0;
  for (const item of section.items) {
    if (!item.badge || item.badge === "changelog") continue;
    total += counts[item.badge] ?? 0;
  }
  return total;
}

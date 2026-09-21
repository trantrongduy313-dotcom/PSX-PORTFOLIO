// ─── Mỗi vai trò vào hệ thống ở đâu ──────────────────────────────────────────
//
// LỖI ĐÃ XẢY RA: nút "Vào hệ thống" ở trang chủ trỏ CỨNG tới /dashboard/orders, mà trang đó
// chỉ cho ["ORDER","PRODUCTION","ADMIN","SALES"]. Nhân viên 3D bấm vào là ăn 403 — lần nào
// cũng vậy, không phải trục trặc. Họ phải bấm "Về trang chủ" để lạc sang /dashboard rồi mới
// tự tìm đường. Giao diện mời người ta đi vào một cánh cửa khoá.
//
// Sidebar THÌ ĐÃ BIẾT điều này từ lâu: nó dựng menu riêng cho từng vai, và mục đầu tiên chính
// là nhà của vai đó. Nhưng kiến thức ấy nằm kẹt trong JSX của sidebar, nên nút ở trang chủ và
// trang /dashboard mỗi nơi tự đoán một kiểu. Ba nơi, ba ý kiến, và hai trong số đó sai.
//
// Khai một lần ở đây. Thêm vai mới về sau = thêm MỘT DÒNG, không phải đi sửa ba chỗ.
//
// File THUẦN: không prisma, không React. Test trực tiếp.

/** Nơi mọi người đi qua khi CHƯA biết vai trò — chính nó sẽ điều hướng tiếp. */
export const NEUTRAL_LANDING = "/dashboard";

/**
 * Trang mở đầu của một vai trò.
 *
 * ⚠️ MỌI GIÁ TRỊ TRẢ VỀ PHẢI LÀ TRANG MÀ VAI ĐÓ THẬT SỰ VÀO ĐƯỢC.
 * Đây là bảng duy nhất nói điều đó, nên sai ở đây là đẩy thẳng người dùng vào trang 403 —
 * đúng lỗi vừa phải đi sửa. Đổi requireRole của một trang thì kiểm lại bảng này.
 *
 * `undefined` (chưa đăng nhập, hoặc chưa đọc được quyền) → điểm trung lập. KHÔNG đoán bừa một
 * vai: đoán sai là lại rơi vào 403, mà /dashboard thì vai nào cũng qua được.
 */
export function landingPathForRole(role: string | undefined | null): string {
  switch (role) {
    // Chỉ có đúng một mục trong sidebar của họ — đưa thẳng tới đó.
    case "DESIGN_3D":
      return "/dashboard/design-3d";

    // SALES chỉ có ĐÚNG MỘT mục trong sidebar — đưa thẳng tới đó, cùng lý do với DESIGN_3D.
    //
    // 🔴 ĐÍCH CŨ LÀ /dashboard/stores, VÀ ĐÓ LÀ MỘT LỖI ĐÃ SỐNG LÂU: trang đó KHÔNG có mục nào
    // trong NAV_SECTIONS. Sale đăng nhập rơi vào đó, bấm sang Danh sách đơn hàng một lần là
    // hết đường quay lại — trừ khi đăng xuất hoặc tự gõ URL. Vào được, nhưng không quay lại
    // được; nên bảng PAGE_GUARDS trong test (chỉ đo "vào được") xanh suốt thời gian đó.
    //
    // Nay có bất biến thứ hai suy từ chính NAV_SECTIONS canh ca này — xem __tests__/auth-landing.
    // Trang /dashboard/stores đã bị xoá cùng lần sửa này.
    case "SALES":
      return "/dashboard/orders";

    // R&D cũng chỉ có ĐÚNG MỘT mục ngoài nhóm Tài liệu. Không cho họ rơi vào /dashboard: trang
    // đó vẽ số liệu toàn hệ thống mà họ không có việc gì với nó, và sidebar của họ không có
    // mục nào trỏ về đó — lại đúng cái bẫy "vào được mà không quay lại được" của SALES ngày trước.
    case "RND":
      return "/dashboard/orders";

    default:
      return NEUTRAL_LANDING;
  }
}

/** Có cần điều hướng đi nơi khác khi đang đứng ở /dashboard không. */
export function shouldRedirectFromDashboard(role: string | undefined | null): string | null {
  const target = landingPathForRole(role);
  // Chốt chặn vòng lặp: /dashboard tự chuyển về /dashboard là treo cứng trình duyệt.
  return target === NEUTRAL_LANDING ? null : target;
}

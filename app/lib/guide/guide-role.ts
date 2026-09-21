import type { GuideRole } from "./content";

// ─── Vai trò tài khoản → bộ hướng dẫn ────────────────────────────────────────
//
// ⚠️ TÁCH RA VÌ NAY CÓ HAI NGƯỜI DÙNG, VÀ HAI BẢN LỆCH NHAU SẼ RẤT KHÓ THẤY:
//
//   1. Trang Hướng dẫn — mở sẵn đúng bộ cho người đọc.
//   2. Trợ lý "Hỏi trợ lý" — chọn bộ kiến thức được cấp cho lượt hỏi.
//
// Hai bản lệch nhau nghĩa là một nhân viên 3D ĐỌC bộ 3D nhưng ĐƯỢC TRẢ LỜI bằng kiến thức của
// Sales. Không có lỗi nào nổ ra; chỉ là câu trả lời nói về những màn họ không vào được, và họ
// kết luận trợ lý vô dụng.
//
// Đây đúng nghĩa "hai nơi lưu cùng một sự thật thì sớm muộn lệch" — nên một nơi.

/**
 * CHỈ là điểm khởi đầu ở trang Hướng dẫn: người dùng vẫn đổi tab được và lựa chọn của họ được
 * lưu lại (xem guide-state-store.ts).
 *
 * Với trợ lý thì nó là quyết định CUỐI CÙNG — người hỏi không chọn được bộ kiến thức, và không
 * nên chọn được: đó là phạm vi, không phải sở thích.
 *
 * PRODUCTION xếp vào bộ Quản lý vì họ đọc dữ liệu sản xuất và xử lý cảnh báo — gần nội dung bộ
 * đó hơn là bộ Nhân viên bán hàng.
 */
export function defaultGuideRoleFor(role: string): GuideRole {
  switch (role) {
    case "DESIGN_3D":
      return "design3d";
    case "ADMIN":
    case "ORDER":
    case "PRODUCTION":
      return "manager";
    default:
      // SALES, và bất kỳ vai trò thêm về sau mà chưa ai xếp chỗ. Bộ Nhân viên là bộ tổng quát
      // nhất, nên đoán sai về phía này là ít thiệt hại nhất.
      return "employee";
  }
}

/**
 * Những bộ hướng dẫn một người ĐƯỢC PHÉP mở.
 *
 * 🔴 VÌ SAO KHÔNG PHẢI AI CŨNG THẤY CẢ BA: một nhân viên Sales mở Hướng dẫn thấy ba tab, trong
 * đó hai tab nói về những màn họ không vào được. Đó không phải "thêm lựa chọn" — đó là mời họ
 * đọc nhầm rồi tự kết luận mình dùng sai phần mềm.
 *
 * ⚠️ QUẢN LÝ VẪN THẤY ĐỦ BA, VÀ ĐÓ LÀ CHỦ Ý — không phải sót. ADMIN/ORDER/PRODUCTION là người đi
 * hỗ trợ Sales và NV 3D; muốn trả lời được thì phải đọc được ĐÚNG THỨ người kia đang đọc. Khoá
 * luôn cả họ là biến một tính năng thành một trở ngại.
 *
 * Suy từ `defaultGuideRoleFor` chứ không nhận thêm tham số vai trò: hai đường tính cùng một
 * quyền thì sớm muộn lệch, và bản lệch sẽ là bản ít người đọc hơn.
 */
export function allowedGuideRoles(defaultRole: GuideRole): GuideRole[] {
  return defaultRole === "manager" ? ["employee", "manager", "design3d"] : [defaultRole];
}

/**
 * Kẹp lựa chọn ĐÃ LƯU về tập được phép.
 *
 * 🔴 KHÔNG ĐƯỢC BỎ HÀM NÀY VÀ CHỈ ẨN NÚT. Tab đang mở lưu ở localStorage (guide-state-store.ts).
 * Một Sales đã từng bấm sang tab "Quản lý" thì giá trị `manager` VẪN CÒN ĐÓ — ẩn nút xong họ mở
 * Hướng dẫn ra và rơi vào một bộ không còn nút nào để thoát. Ẩn lối vào mà quên dữ liệu cũ là
 * cách tạo ra một cái bẫy chỉ dính đúng những người đã dùng nhiều nhất.
 */
export function clampGuideRole(saved: GuideRole, defaultRole: GuideRole): GuideRole {
  return allowedGuideRoles(defaultRole).includes(saved) ? saved : defaultRole;
}

import { requireUser } from "@/app/lib/auth-helpers";
import { defaultGuideRoleFor } from "@/app/lib/guide/guide-role";
import { loadChangelogPublishedAt } from "@/app/lib/changelog/published-dates";
import { GuideClient } from "./_components/guide-client";

export const metadata = { title: "Hướng dẫn sử dụng — PSX" };

// ─── Hướng dẫn sử dụng ───────────────────────────────────────────────────────
//
// VÌ SAO TRANG NÀY THÀNH SERVER COMPONENT: nó cần biết vai trò của tài khoản để mở đúng bộ
// hướng dẫn ngay từ đầu. Dự án KHÔNG có `SessionProvider`, nên client không đọc được vai trò —
// chỉ server đọc được qua `requireUser()`.
//
// Trước đây có hai bộ (Nhân viên / Quản lý) và mặc định luôn là Nhân viên. Từ khi có bộ thứ ba
// cho `DESIGN_3D` thì mặc định đó thành một vấn đề thật: một nhân viên 3D mở Hướng dẫn ra sẽ đọc
// nội dung của SALES — nói về cửa hàng, bộ lọc đơn, tab Phòng Sản Xuất — tức là những thứ họ
// KHÔNG có quyền thấy. Họ sẽ kết luận hướng dẫn không dành cho mình rồi đóng lại.
//
// `requireUser` chứ không `requireRole`: MỌI vai trò đều được đọc hướng dẫn, kể cả bộ của vai
// trò khác. Đó là tài liệu, không phải dữ liệu.
//
// Phép ánh xạ vai trò → bộ nằm ở app/lib/guide/guide-role.ts vì trợ lý "Hỏi trợ lý" cũng dùng
// đúng phép đó để chọn bộ kiến thức. Hai bản lệch nhau là người đọc bộ này mà được trả lời bằng
// bộ khác.

export default async function GuidePage() {
  const user = await requireUser();
  // Mốc đăng của các mục "Có gì mới" — để mỗi chương nói được "đã có N thay đổi kể từ lần rà".
  // Dùng CHUNG helper với Sidebar: hai câu truy vấn giống nhau ở hai file là hai con số lệch nhau
  // về cùng một dữ liệu, và không có lỗi nào.
  const changelogPublishedAt = await loadChangelogPublishedAt();
  return (
    <GuideClient
      defaultRole={defaultGuideRoleFor(user.role)}
      changelogPublishedAt={changelogPublishedAt}
    />
  );
}

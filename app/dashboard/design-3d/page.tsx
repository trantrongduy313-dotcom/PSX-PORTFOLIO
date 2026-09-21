import { requireRole } from "@/app/lib/auth-helpers";
import { hasCapability } from "@/app/lib/business/kpi-3d/permissions";
import { Design3DClient } from "./_components/design-3d-client";

export const metadata = { title: "Việc thiết kế 3D - PSX" };

// Màn hình làm việc của Nhân viên Thiết kế 3D (yêu cầu #5).
//
// ADMIN/ORDER/PRODUCTION cũng vào được để theo dõi và xử lý hộ khi NV vắng mặt; phạm vi dữ
// liệu do API quyết định (tài khoản DESIGN_3D chỉ nhận về assignment của chính mình), không
// dựa vào việc ẩn/hiện ở giao diện.
export default async function Design3DPage() {
  const user = await requireRole(["ADMIN", "ORDER", "PRODUCTION", "DESIGN_3D"]);
  const isDesigner = user.role === "DESIGN_3D";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--cream)" }}>
      <div style={{ flexShrink: 0, padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--cream-card)" }}>
        <h1 style={{
          fontFamily: "var(--font-cormorant), Georgia, serif",
          fontSize: "22px", fontWeight: 400, color: "var(--ink)", margin: 0,
        }}>
          {isDesigner ? "Việc thiết kế 3D của tôi" : "Việc thiết kế 3D"}
        </h1>
      </div>

      <Design3DClient
        isDesigner={isDesigner}
        // Leader/Giám sát duyệt tăng ca — khớp OVERTIME_APPROVER_ROLES ở tầng API.
        // Đây chỉ là lớp ẩn nút; chặn thật nằm ở API.
        canApproveOvertime={user.role === "ADMIN" || user.role === "PRODUCTION"}
        // Kiểm kết quả 3D nội bộ — tra đúng bảng năng lực dùng chung thay vì gõ lại danh
        // sách role ở đây; chặn thật vẫn nằm ở API (review/route.ts gọi deniedReasonForReview).
        canReview={hasCapability("REVIEW_RESULT", user.role)}
      />
    </div>
  );
}

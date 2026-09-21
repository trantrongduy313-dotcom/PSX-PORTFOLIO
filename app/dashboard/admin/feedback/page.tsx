import { requireRole } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { FEEDBACK_SELECT, toFeedbackRow } from "@/app/dashboard/_components/feedback/feedback-query";
import { FeedbackAdminList } from "./_components/feedback-admin-list";

export const metadata = { title: "Phản hồi người dùng — PSX" };

// ─── Hộp thư phản hồi của admin ──────────────────────────────────────────────
//
// Nơi các báo cáo THẬT SỰ Ở. Chuông Google Chat chỉ dẫn tới đây (xem notify-feedback.ts) —
// chuông là chuông cửa, trang này là tủ hồ sơ.
//
// Giới hạn 200 hàng, KHÔNG phân trang. Với khoảng 8 nhân viên thì đó là nhiều tháng dữ liệu,
// và một bộ phân trang chưa ai cần là code phải bảo trì mà không đổi lấy gì. Ghi lại hạn mức
// ở đây để lần sau không phải đoán vì sao danh sách dừng lại.
const LIMIT = 200;

export default async function AdminFeedbackPage() {
  await requireRole(["ADMIN"]);

  const rows = await prisma.feedbackReport.findMany({
    // Chưa xử lý lên trước, trong mỗi nhóm thì mới nhất lên trước. Sắp theo `createdAt` thuần
    // sẽ đẩy những phản hồi chưa ai xem xuống dưới đống đã xử lý — đúng thứ cần thấy lại bị
    // vùi sâu nhất.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: LIMIT,
    select: FEEDBACK_SELECT,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--cream)" }}>
      <div
        style={{
          flexShrink: 0,
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--cream-card)",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-cormorant), Georgia, serif",
            fontSize: "22px",
            fontWeight: 400,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          Phản hồi người dùng
        </h1>
        <p style={{ margin: "3px 0 0", fontSize: "11px", color: "var(--ink-muted)" }}>
          Báo lỗi và đề xuất cải tiến do nhân viên gửi trực tiếp trong hệ thống.
        </p>
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <FeedbackAdminList rows={rows.map(toFeedbackRow)} />
      </div>
    </div>
  );
}

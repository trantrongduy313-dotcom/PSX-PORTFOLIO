import { requireUser } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { FeedbackCard } from "../_components/feedback/feedback-card";
import { FEEDBACK_SELECT, toFeedbackRow } from "../_components/feedback/feedback-query";

export const metadata = { title: "Góp ý của tôi — PSX" };

// ─── "Góp ý của tôi" — NỬA CÒN LẠI CỦA VIỆC ĐÓNG VÒNG ────────────────────────
//
// 🔴 TRANG NÀY KHÔNG PHẢI TÙY CHỌN. Không có nó thì người gửi không bao giờ biết chuyện gì xảy
// ra với báo cáo của mình, và sau lần thứ hai không hồi âm họ quay về Zalo — nơi CÓ người trả
// lời. Lúc đó ta có một cái bảng chết trong database và hai kênh song song.
//
// `requireUser` — MỌI role, không giới hạn. Đây là trang của chính người dùng.

export default async function MyFeedbackPage() {
  const user = await requireUser();

  // VIRTUAL_ADMIN không có hàng trong `users` nên không có phản hồi "của mình" — danh sách
  // rỗng chứ không phải lỗi. Xem auth-helpers.ts về `dbId`.
  const rows = user.dbId
    ? await prisma.feedbackReport.findMany({
        where: { reporterId: user.dbId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: FEEDBACK_SELECT,
      })
    : [];

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
          Góp ý của tôi
        </h1>
        <p style={{ margin: "3px 0 0", fontSize: "11px", color: "var(--ink-muted)" }}>
          Những gì bạn đã gửi, và admin đã xử lý tới đâu.
        </p>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {rows.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--ink-muted)", margin: 0 }}>
            Bạn chưa gửi góp ý nào. Bấm nút <strong>Góp ý</strong> ở cạnh phải màn hình để gửi.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "820px" }}>
            {rows.map((row) => (
              <FeedbackCard key={row.id} row={toFeedbackRow(row)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

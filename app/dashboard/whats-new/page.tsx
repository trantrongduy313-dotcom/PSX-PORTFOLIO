import { requireUser } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { ChangelogList } from "../_components/changelog/changelog-list";
import { CHANGELOG_SELECT, toChangelogRow } from "../_components/changelog/changelog-query";

export const metadata = { title: "Có gì mới — PSX" };

// ─── "Có gì mới" ─────────────────────────────────────────────────────────────
//
// Trang này tồn tại vì trang HƯỚNG DẪN không thể theo kịp. Hai thứ có kinh tế bảo trì trái
// ngược nhau:
//
//   · Hướng dẫn mô tả TRẠNG THÁI HIỆN TẠI → mỗi lần hệ thống đổi là phải đi tìm mọi đoạn bị
//     ảnh hưởng trong 1457 dòng × 2 ngôn ngữ. Mục cũ trở thành SAI. (Bằng chứng: content.tsx
//     lần cuối sửa 08/06/2026, 717 commit trước, và nó vẫn dạy "26.12345.1" trong khi giao
//     diện luôn hiện "26.12345_1".)
//
//   · Changelog mô tả MỘT VIỆC ĐÃ XẢY RA → mỗi lần đổi là thêm ba dòng vào cuối. Mục cũ trở
//     thành LỊCH SỬ, vẫn đúng mãi.
//
// "Ngày 20/08 đã thêm nút Góp ý" không bao giờ sai, kể cả năm sau nút đã đổi chỗ.
//
// `requireUser` — MỌI role. Đây là thứ cả nhóm cần đọc.
//
// Giới hạn 200 mục, KHÔNG phân trang: với nhịp một vài mục mỗi tuần thì đó là nhiều năm dữ liệu,
// và một bộ phân trang chưa ai cần là code phải bảo trì mà không đổi lấy gì. Ghi hạn mức ở đây
// để lần sau không phải đoán vì sao danh sách dừng lại.
const LIMIT = 200;

export default async function WhatsNewPage() {
  await requireUser();

  const rows = await prisma.changelogEntry.findMany({
    // CHỈ mục đã đăng. Nháp là nội dung viết nửa vời — người dùng đọc được một mục nháp là đọc
    // một lời thông báo chưa ai định nói.
    where: { isPublished: true },
    orderBy: { publishedAt: "desc" },
    take: LIMIT,
    select: CHANGELOG_SELECT,
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
          Có gì mới
        </h1>
        <p style={{ margin: "3px 0 0", fontSize: "11px", color: "var(--ink-muted)" }}>
          Những cải tiến đã được đưa vào hệ thống, mới nhất ở trên.
        </p>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        <ChangelogList rows={rows.map(toChangelogRow)} />
      </div>
    </div>
  );
}

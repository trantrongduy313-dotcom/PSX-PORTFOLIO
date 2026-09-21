import { requireRole } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import {
  CHANGELOG_ADMIN_SELECT,
  toChangelogRow,
} from "@/app/dashboard/_components/changelog/changelog-query";
import { ChangelogEditor } from "./_components/changelog-editor";
import { ChangelogAdminList, type AdminChangelogRow } from "./_components/changelog-admin-list";

export const metadata = { title: "Ghi nhận cải tiến — PSX" };

// ─── Nơi admin ghi nhận cải tiến ─────────────────────────────────────────────
//
// Luồng: gõ vài mục trong ngày (mỗi mục lưu thành NHÁP) → cuối ngày bấm "Đăng n mục" → cả nhóm
// nhận MỘT tin Google Chat và chấm đỏ ở Sidebar sáng lên.
//
// Vì sao có bước nháp: người dùng gom trong ngày. Không có nháp thì mỗi dòng viết nửa vời là
// một lần bắn thông báo cho cả nhóm.

const LIMIT = 200;

export default async function AdminChangelogPage() {
  await requireRole(["ADMIN"]);

  const rows = await prisma.changelogEntry.findMany({
    // Nháp lên trước: đó là thứ đang chờ được xử lý. Sắp theo `createdAt` thuần sẽ vùi nháp
    // xuống dưới đống đã đăng — đúng thứ cần thấy lại bị chôn sâu nhất.
    orderBy: [{ isPublished: "asc" }, { createdAt: "desc" }],
    take: LIMIT,
    select: CHANGELOG_ADMIN_SELECT,
  });

  const list: AdminChangelogRow[] = rows.map((r) => ({
    ...toChangelogRow(r),
    isPublished: r.isPublished,
    notifiedAt: r.notifiedAt ? r.notifiedAt.toISOString() : null,
  }));

  const draftCount = list.filter((r) => !r.isPublished).length;

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
          Ghi nhận cải tiến
        </h1>
        <p style={{ margin: "3px 0 0", fontSize: "11px", color: "var(--ink-muted)" }}>
          Ghi lại trong ngày, đăng một lượt. Người dùng thấy ở mục “Có gì mới”.
        </p>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: "18px" }}>
        <ChangelogEditor draftCount={draftCount} />
        <ChangelogAdminList rows={list} />
      </div>
    </div>
  );
}

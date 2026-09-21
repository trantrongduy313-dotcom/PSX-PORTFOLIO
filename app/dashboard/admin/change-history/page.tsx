import { requireRole } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { ChangeHistoryClient } from "./_components/change-history-client";

export const metadata = { title: "Lịch sử thay đổi — PSX" };

export default async function ChangeHistoryPage() {
  await requireRole(["ADMIN"]);

  // Danh sách user để lọc theo người thực hiện
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--cream)" }}>
      <div style={{
        flexShrink: 0,
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--cream-card)",
      }}>
        <h1 style={{
          fontFamily: "var(--font-cormorant), Georgia, serif",
          fontSize: "22px", fontWeight: 400, color: "var(--ink)", margin: 0,
        }}>
          Lịch sử thay đổi
        </h1>
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <ChangeHistoryClient users={users} />
      </div>
    </div>
  );
}

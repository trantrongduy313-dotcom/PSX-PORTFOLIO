import { requireRole } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { CraftsmenClient } from "./_components/craftsmen-client";

export const metadata = { title: "Quản lý Thợ — PSX" };

export default async function CraftsmenPage() {
  await requireRole(["ADMIN", "ORDER"]);

  const craftsmen = await prisma.craftsman.findMany({
    orderBy: [{ levelRank: "desc" }, { name: "asc" }],
    select: { id: true, name: true, code: true, level: true, khau: true, levelRank: true, isActive: true },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--cream)" }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--cream-card)",
      }}>
        <h1 style={{
          fontFamily: "var(--font-cormorant), Georgia, serif",
          fontSize: "22px", fontWeight: 400, color: "var(--ink)", margin: "0 0 2px",
        }}>
          Quản lý Thợ sản xuất
        </h1>
        <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: 0 }}>
          {craftsmen.filter(c => c.isActive).length} thợ đang hoạt động
        </p>
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <CraftsmenClient initialCraftsmen={craftsmen} />
      </div>
    </div>
  );
}

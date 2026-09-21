import { requireRole } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { UsersClient } from "./_components/users-client";

export const metadata = { title: "Quản lý User — PSX" };

export default async function AdminUsersPage() {
  await requireRole(["ADMIN"]);

  const [rawUsers, stores] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        isActive: true,
        storeId: true,
        store: { select: { id: true, code: true, name: true } },
        createdAt: true,
        storeAssignments: {
          select: { store: { select: { id: true, code: true, name: true } } },
          orderBy: { store: { code: "asc" } },
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const users = rawUsers.map(({ storeAssignments, ...u }) => ({
    ...u,
    storeAssignments: storeAssignments.map((a) => a.store),
  }));

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
          Quản lý User
        </h1>
        <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: 0 }}>
          {users.length} tài khoản trong hệ thống
        </p>
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <UsersClient initialUsers={users} stores={stores} />
      </div>
    </div>
  );
}

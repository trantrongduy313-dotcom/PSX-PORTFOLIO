import { requireRole } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { Designers3DClient } from "./_components/designers-3d-client";

export const metadata = { title: "Quản lý Nhân viên 3D — PSX" };

export default async function Designers3DPage() {
  await requireRole(["ADMIN", "ORDER"]);

  // Tài khoản role DESIGN_3D để admin gắn vào hồ sơ nhân viên — không có bước gắn này thì
  // NV 3D đăng nhập được nhưng hệ thống không biết họ ứng với nhân viên nào, nên không thấy
  // việc được giao (xem app/lib/business/kpi-3d/actor.ts).
  const [designers, design3DUsers] = await Promise.all([
    prisma.designer3D.findMany({
      orderBy: [{ code: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, code: true, isActive: true,
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "DESIGN_3D", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

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
          fontSize: "22px", fontWeight: 400, color: "var(--ink)", margin: "0 0 2px",
        }}>
          Quản lý Nhân viên 3D
        </h1>
        <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: 0 }}>
          {designers.filter(d => d.isActive).length} nhân viên đang hoạt động
        </p>
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Designers3DClient initialDesigners={designers} design3DUsers={design3DUsers} />
      </div>
    </div>
  );
}

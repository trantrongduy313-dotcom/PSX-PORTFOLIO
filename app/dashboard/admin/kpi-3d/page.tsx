import { requireRole } from "@/app/lib/auth-helpers";
import { Kpi3DShellClient } from "./_components/kpi-3d-shell-client";

export const metadata = { title: "KPI Nhân viên 3D - PSX" };

export default async function Kpi3dPage() {
  const user = await requireRole(["ADMIN", "ORDER", "PRODUCTION"]);

  const now = new Date();
  const defaultMonth = now.getMonth() + 1;
  const defaultYear = now.getFullYear();

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
          fontSize: "22px",
          fontWeight: 400,
          color: "var(--ink)",
          margin: 0,
        }}>
          KPI Nhân viên 3D
        </h1>
      </div>

      <Kpi3DShellClient defaultMonth={defaultMonth} defaultYear={defaultYear} currentUserRole={user.role} />
    </div>
  );
}

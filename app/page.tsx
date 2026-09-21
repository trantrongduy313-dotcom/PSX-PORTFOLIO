import Link from "next/link";

import { auth } from "@/auth";
import { landingPathForRole } from "@/app/lib/business/auth/landing";

export default async function HomePage() {
  // Nút "Vào hệ thống" từng trỏ CỨNG tới /dashboard/orders — trang mà nhân viên 3D không có
  // quyền vào, nên họ bấm là ra 403. Nay hỏi đúng bảng phân vai.
  //
  // Chưa đăng nhập thì landingPathForRole trả về điểm trung lập /dashboard: middleware sẽ đưa
  // sang màn login kèm callbackUrl, đăng nhập xong /dashboard mới điều hướng theo vai. Nhờ vậy
  // người đăng nhập lần đầu cũng không bị ném vào cửa khoá.
  const session = await auth();
  const entryHref = landingPathForRole(session?.user?.role);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--cream)",
        fontFamily: "var(--font-body), sans-serif",
      }}
    >
      <div style={{ textAlign: "center", padding: "40px 32px", maxWidth: "480px" }}>

        {/* ── Logo Production Management ── */}
        <div style={{ marginBottom: "32px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          {/* Diamond SVG */}
          <svg width="56" height="52" viewBox="0 0 56 52" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="28,2 54,18 28,50 2,18" fill="none" stroke="#9B2D6F" strokeWidth="1.5"/>
            <polygon points="28,2 54,18 28,20 2,18" fill="none" stroke="#9B2D6F" strokeWidth="1.2"/>
            <line x1="2"  y1="18" x2="28" y2="20" stroke="#9B2D6F" strokeWidth="1"/>
            <line x1="54" y1="18" x2="28" y2="20" stroke="#9B2D6F" strokeWidth="1"/>
            <line x1="28" y1="2"  x2="28" y2="20" stroke="#9B2D6F" strokeWidth="1"/>
            <line x1="28" y1="20" x2="28" y2="50" stroke="#9B2D6F" strokeWidth="1"/>
            <line x1="14" y1="10" x2="28" y2="20" stroke="#9B2D6F" strokeWidth="0.8" opacity="0.5"/>
            <line x1="42" y1="10" x2="28" y2="20" stroke="#9B2D6F" strokeWidth="0.8" opacity="0.5"/>
          </svg>

          {/* Brand name */}
          <div style={{ letterSpacing: "0.2em", lineHeight: 1 }}>
            <div style={{
              fontFamily: "var(--font-cormorant), Georgia, serif",
              fontSize: "22px",
              fontWeight: 600,
              color: "var(--ink)",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
            }}>
              Production Management
            </div>
            <div style={{
              fontSize: "10px",
              fontWeight: 500,
              color: "var(--ink-muted)",
              letterSpacing: "0.35em",
              textTransform: "uppercase",
              marginTop: "3px",
            }}>
              — SYSTEM —
            </div>
          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{
          width: "40px",
          height: "1px",
          background: "var(--pink)",
          margin: "0 auto 28px",
          opacity: 0.6,
        }} />

        {/* ── System title ── */}
        <h1 style={{
          fontFamily: "var(--font-cormorant), Georgia, serif",
          fontSize: "clamp(26px, 5vw, 36px)",
          fontWeight: 400,
          color: "var(--ink)",
          lineHeight: 1.3,
          letterSpacing: "0.02em",
          marginBottom: "10px",
        }}>
          Hệ thống quản lý<br />
          đơn hàng trang sức
        </h1>

        <p style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--pink)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: "36px",
        }}>
          PSX Management
        </p>

        {/* ── CTA Button ── */}
        <Link href={entryHref} className="psx-home-btn">
          Vào hệ thống
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </Link>

        {/* ── Footer note ── */}
        <p style={{
          marginTop: "40px",
          fontSize: "11px",
          color: "var(--border-md)",
          letterSpacing: "0.08em",
        }}>
          © 2026 · Portfolio Demonstration
        </p>
      </div>
    </div>
  );
}

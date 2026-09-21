"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import Image from "next/image";
import { useLocale, useLabels } from "@/app/lib/i18n/locale-context";
import { setLocaleAction } from "@/app/lib/i18n/set-locale-action";

interface Props {
  name: string | null | undefined;
  email: string | null | undefined;
  image: string | null | undefined;
  roleLabel: string;
}

export function SidebarUserMenu({ name, email, image, roleLabel }: Props) {
  const locale = useLocale();
  const L = useLabels();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggleLocale() {
    const next = locale === "vi" ? "en" : "vi";
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  }

  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "12px" }}>
      {/* Locale toggle */}
      <button
        type="button"
        onClick={toggleLocale}
        disabled={isPending}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 8px",
          marginBottom: "4px",
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--ink-muted)",
          background: "transparent",
          border: "1px solid var(--border)",
          cursor: isPending ? "default" : "pointer",
          opacity: isPending ? 0.6 : 1,
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => { if (!isPending) (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--pink)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
          {locale === "vi" ? "Tiếng Việt" : "English"}
        </span>
        <span style={{
          fontSize: "10px", fontWeight: 700,
          color: "var(--pink)",
          border: "1px solid var(--pink)",
          padding: "1px 6px",
          letterSpacing: "0.1em",
        }}>
          {L.ui.lang}
        </span>
      </button>

      {/* User info */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 6px 4px" }}>
        {image ? (
          <Image
            src={image}
            alt={name ?? ""}
            width={30}
            height={30}
            style={{ borderRadius: "50%", flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: "30px",
            height: "30px",
            borderRadius: "50%",
            background: "var(--cream-dark)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--ink)",
              fontFamily: "var(--font-cormorant), Georgia, serif",
            }}>
              {name?.charAt(0).toUpperCase() ?? "?"}
            </span>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            margin: 0,
          }}>
            {name}
          </p>
          <p style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--ink-muted)",
            margin: 0,
          }}>
            {roleLabel}
          </p>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={() => signOut({ callbackUrl: "/auth/login" })}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 8px",
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--ink-muted)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          transition: "color 0.15s",
          textAlign: "left",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--s-red)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}
      >
        <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        {locale === "vi" ? "Đăng xuất" : "Sign out"}
      </button>
    </div>
  );
}

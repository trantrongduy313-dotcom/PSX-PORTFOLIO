"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

interface Props {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
}

export function SidebarNavLink({ href, children, exact = false }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const isActive = exact ? pathname === href : pathname.startsWith(href);

  // Khi navigate về /dashboard/orders từ section khác, thêm _w=1 để
  // orders/page.tsx bỏ qua SSR DB query và dùng React Query cache hiện có.
  const effectiveHref =
    href === "/dashboard/orders" && !pathname.startsWith("/dashboard/orders")
      ? "/dashboard/orders?_w=1"
      : href;

  return (
    <Link
      href={effectiveHref}
      onMouseEnter={() => router.prefetch(effectiveHref)}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "9px 14px",
        marginBottom: "2px",
        fontSize: "13px",
        color: isActive ? "var(--ink)" : "var(--ink-body)",
        textDecoration: "none",
        background: isActive ? "var(--cream-dark)" : "transparent",
        borderLeft: isActive ? "2px solid var(--pink)" : "2px solid transparent",
        transition: "background 0.15s, color 0.15s",
        fontWeight: isActive ? 500 : 400,
      }}
    >
      {children}
    </Link>
  );
}

// SidebarStoreLink ĐÃ XOÁ. Phần "Stores" trong sidebar bị bỏ từ trước ("store filter is now in
// the orders toolbar"), nên component này không còn ai gọi — nhưng nó vẫn nằm đây kèm cả phần
// prefetch React Query khá công phu, và một component không ai gọi trong `components/` là mời
// người sau tưởng nó đang chạy. Git giữ được nó nếu cần lấy lại phép prefetch đó.

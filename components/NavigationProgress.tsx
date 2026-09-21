"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  // Khi pathname/searchParams thay đổi → navigation hoàn thành → ẩn bar
  useEffect(() => {
    setWidth(100);
    const hide = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 300);
    return () => clearTimeout(hide);
  }, [pathname, searchParams]);

  // Bắt click trên <a> internal → bắt đầu progress
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto") || href.startsWith("#")) return;

      // Chỉ trigger nếu href khác pathname hiện tại
      const currentPath = window.location.pathname + window.location.search;
      if (href === currentPath) return;

      // Bắt đầu animate
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      setVisible(true);
      setWidth(0);

      // Chạy từ 0 → 85% trong 800ms (dừng ở 85% chờ navigation xong)
      let start: number | null = null;
      const animate = (ts: number) => {
        if (!start) start = ts;
        const elapsed = ts - start;
        const pct = Math.min(85, (elapsed / 800) * 85);
        setWidth(pct);
        if (pct < 85) {
          rafRef.current = requestAnimationFrame(animate);
        }
      };
      rafRef.current = requestAnimationFrame(animate);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: `${width}%`,
        height: "2px",
        background: "var(--pink)",
        zIndex: 9999,
        transition: width === 100 ? "width 0.2s ease-out, opacity 0.3s 0.1s" : "width 0.1s linear",
        opacity: width === 100 ? 0 : 1,
        pointerEvents: "none",
      }}
    />
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

// Module-level: nhớ thời điểm auto-reset gần nhất giữa các lần boundary remount.
// Nếu lỗi lặp lại trong vòng RESET_WINDOW thì coi là lỗi thật → hiện UI thay vì reset vô hạn.
let lastAutoReset = 0;
const RESET_WINDOW = 8000;

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [recovering, setRecovering] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    console.error("[Dashboard]", error);
    const elapsed = Date.now() - lastAutoReset;
    // Lỗi thoáng qua (lần đầu, hoặc đã lâu kể từ lần auto-reset trước) → tự phục hồi 1 lần
    if (elapsed > RESET_WINDOW) {
      lastAutoReset = Date.now();
      setRecovering(true);
      timerRef.current = setTimeout(() => reset(), 800);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [error, reset]);

  if (recovering) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", background: "var(--cream)",
      }}>
        <RefreshCw style={{ width: "22px", height: "22px", color: "var(--ink-muted)", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: "16px",
      textAlign: "center",
      padding: "0 24px",
      background: "var(--cream)",
    }}>
      <AlertTriangle style={{ width: "36px", height: "36px", color: "var(--s-red)" }} />
      <div>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)", margin: "0 0 4px" }}>
          Không thể tải trang
        </p>
        <p style={{ fontSize: "12px", color: "var(--ink-muted)", margin: 0 }}>
          Lỗi kết nối máy chủ. Vui lòng thử lại.
        </p>
        {error.digest && (
          <p style={{ fontSize: "10px", color: "var(--ink-muted)", opacity: 0.6, margin: "4px 0 0", fontFamily: "monospace" }}>
            {error.digest}
          </p>
        )}
      </div>
      <button
        onClick={reset}
        className="psx-btn-secondary"
        style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
      >
        <RefreshCw style={{ width: "13px", height: "13px" }} />
        Thử lại
      </button>
    </div>
  );
}

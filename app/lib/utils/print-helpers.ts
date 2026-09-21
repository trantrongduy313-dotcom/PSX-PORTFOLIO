"use client";

import { useEffect, useState } from "react";

/**
 * usePrintFlow — logic dùng chung cho các tính năng "In / Xuất PDF" (window.print()).
 * Dùng chung bởi PrintReport (đơn hàng), PrintStageReview (Đánh giá Khâu),
 * PrintProductionStats (KPI Thợ SX) — tránh lặp lại setTimeout/afterprint ở 3 nơi.
 *
 * Cách dùng: gọi requestPrint() sau khi user xác nhận trong modal chọn trường/thợ.
 * `printing` bật lên render #print-report (CSS ẩn/hiện theo @media print, xem globals.css),
 * sau khi trình duyệt đóng hộp thoại in (afterprint) thì tự tắt + gọi onDone (thường là đóng modal).
 */
export function usePrintFlow(onDone: () => void) {
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return;
    const done = () => { setPrinting(false); onDone(); };
    window.addEventListener("afterprint", done, { once: true });
    const t = setTimeout(() => window.print(), 60);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printing]);

  return { printing, requestPrint: () => setPrinting(true) };
}

export function formatExportedAt(): string {
  return new Date().toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}

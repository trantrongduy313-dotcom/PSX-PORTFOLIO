"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

import {
  dismissBanner,
  getDismissedBannerSnapshot,
  getSeenServerSnapshot,
  subscribeBanner,
} from "./changelog-seen-store";

// ─── Băng thông báo cho mục QUAN TRỌNG ───────────────────────────────────────
//
// TẦNG ỒN THỨ HAI, và cố ý là tầng DUY NHẤT có quyền cắt ngang. Chấm đỏ ở Sidebar lo mọi mục;
// băng này chỉ dành cho những mục mà không biết thì làm sai việc.
//
// ⚠️ VÌ SAO KHÔNG DÙNG HỘP THOẠI CHẶN NGANG LÚC ĐĂNG NHẬP: nó xin sự chú ý TRƯỚC khi người ta
// kịp vào việc, và đúng một tuần sau mọi người bấm X theo phản xạ mà không đọc. Lúc đó cả hai
// tầng đều mất tác dụng — vì cú bấm X đó cũng là cú bấm duy nhất họ còn làm.
//
// Một dải mảnh nằm trong luồng trang thì đọc được mà không chặn ai, và bỏ qua nó không phá thứ gì.
//
// CHỈ HIỆN MỘT MỤC — mục quan trọng mới nhất. Ba dải xếp chồng là ba dải bị bỏ qua cùng lúc.

export type ImportantNotice = { id: string; title: string };

export function ChangelogImportantBanner({ notice }: { notice: ImportantNotice | null }) {
  // `useSyncExternalStore` thay cho `useEffect` + `setState`: đây là trạng thái NGOÀI React
  // (localStorage), và gọi setState đồng bộ trong effect tạo một lượt render dây chuyền.
  //
  // Bản cho server trả null → lượt vẽ đầu HIỆN băng. Cố ý: với người chưa đóng nó thì đó là
  // trạng thái đúng, và với người đã đóng thì nó tắt ngay khi hydrate. Chọn hướng ngược lại (ẩn
  // trước rồi hiện sau) là để một thông báo quan trọng nhấp nháy xuất hiện ở đúng chỗ mắt đang
  // nhìn — tệ hơn hẳn.
  const dismissed = useSyncExternalStore(subscribeBanner, getDismissedBannerSnapshot, getSeenServerSnapshot);

  if (!notice) return null;
  if (dismissed === notice.id) return null;

  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 16px",
        background: "rgba(234,179,8,0.12)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <AlertTriangle style={{ width: "14px", height: "14px", flexShrink: 0, color: "var(--s-gold)" }} />

      <span style={{ flex: 1, fontSize: "12px", color: "var(--ink)", lineHeight: 1.5 }}>
        {notice.title}
      </span>

      {/* Link đứng cạnh nội dung, KHÔNG phải chỉ có nút X: một dải thông báo mà đường duy nhất
          là "đóng lại" thì người đọc không có chỗ nào để tìm hiểu thêm. */}
      <Link
        href="/dashboard/whats-new"
        style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink)", textDecoration: "underline", flexShrink: 0 }}
      >
        Xem
      </Link>

      <button
        type="button"
        onClick={() => dismissBanner(notice.id)}
        aria-label="Đóng thông báo"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", lineHeight: 0, flexShrink: 0 }}
      >
        <X style={{ width: "13px", height: "13px" }} />
      </button>
    </div>
  );
}

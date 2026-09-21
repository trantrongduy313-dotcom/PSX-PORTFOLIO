"use client";

import { useEffect, useSyncExternalStore } from "react";

import { latestPublishedAt, seenMarkFor } from "@/app/lib/business/changelog/seen";
import { ChangelogEntryCard, type ChangelogRow } from "./changelog-entry-card";
import {
  getSeenBaseline,
  getSeenServerSnapshot,
  subscribeNever,
  writeChangelogSeen,
} from "./changelog-seen-store";

// ─── Danh sách "Có gì mới" ───────────────────────────────────────────────────
//
// Client Component vì hai việc đều cần localStorage: đánh dấu mục nào MỚI với người này, và ghi
// lại mốc đã đọc.
//
// ⚠️ THỨ TỰ HAI VIỆC ĐÓ LÀ CHỖ DỄ VIẾT NGƯỢC NHẤT:
//
//   1. ĐỌC mốc cũ trước, giữ vào state
//   2. rồi mới GHI mốc mới
//
// Làm ngược lại thì mốc mới ghi xong, phép so ra "không có gì mới", và không mục nào được gắn
// nhãn MỚI — người dùng mở trang ra thấy một danh sách phẳng, đúng lúc họ cần biết cái nào là
// cái vừa thay đổi. Lỗi này không nổ, không có log, chỉ âm thầm làm trang mất hết giá trị.

export function ChangelogList({ rows }: { rows: ChangelogRow[] }) {
  // BƯỚC 1 — mốc đã đọc LÚC MỞ TRANG. `getSeenBaseline` chụp một lần rồi đóng băng cả phiên,
  // nên nó KHÔNG bị thay đổi bởi chính việc ghi mốc ở bước 2. Đọc từ mốc "hiện tại" là mọi nhãn
  // MỚI biến mất ngay sau khi ghi — người dùng mở trang ra thấy một danh sách phẳng, đúng lúc
  // họ cần biết cái nào vừa thay đổi. Lỗi đó không nổ và không có log.
  const seenAtBefore = useSyncExternalStore(subscribeNever, getSeenBaseline, getSeenServerSnapshot);

  // BƯỚC 2 — ghi mốc mới, theo mục mới nhất ĐANG ĐƯỢC HIỂN THỊ. Chạy trong effect nên luôn sau
  // bước 1 (render xong mới tới effect).
  //
  // `seenMarkFor` cố ý trả về mốc của mục mới nhất chứ không phải `new Date()`: một mục đăng
  // trong cùng giây người dùng đang mở trang sẽ bị đánh dấu đã đọc trong khi họ chưa hề thấy nó.
  useEffect(() => {
    writeChangelogSeen(seenMarkFor(latestPublishedAt(rows)));
  }, [rows]);

  const seen = seenAtBefore ? Date.parse(seenAtBefore) : null;

  const isNew = (row: ChangelogRow): boolean => {
    if (!row.publishedAt) return false;
    const t = Date.parse(row.publishedAt);
    if (!Number.isFinite(t)) return false;
    if (seen === null || !Number.isFinite(seen)) return true; // chưa từng đọc → mọi thứ đều mới
    return t > seen;
  };

  if (rows.length === 0) {
    return (
      <p style={{ fontSize: "12px", color: "var(--ink-muted)", margin: 0 }}>
        Chưa có cập nhật nào được ghi nhận.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "820px" }}>
      {rows.map((row) => (
        <ChangelogEntryCard key={row.id} row={row} isNew={isNew(row)} />
      ))}
    </div>
  );
}

"use client";

import { useSyncExternalStore } from "react";

import { CountBadge } from "@/components/CountBadge";
import {
  getSeenServerSnapshot,
  getSeenSnapshot,
  subscribeSeen,
} from "./changelog-seen-store";

// ─── Huy hiệu "Có gì mới" ────────────────────────────────────────────────────
//
// Client Component vì mốc "đã đọc" nằm ở localStorage — Sidebar là Server Component nên không
// biết được người này đã đọc tới đâu.
//
// Server truyền xuống DANH SÁCH MỐC ĐĂNG, không truyền một con số. Đó là điểm chính: chỉ client
// biết mốc đã đọc, nên chỉ client đếm được. Danh sách vài chục chuỗi ISO là không đáng kể, và
// đổi lại ta có một CON SỐ THẬT thay vì một chấm chung chung — thống nhất với hai huy hiệu còn
// lại trên Sidebar (Cảnh báo, Phản hồi người dùng), và dùng lại `CountBadge` nên ba con số đỏ
// trên cùng một sidebar không thể lệch nhau.
//
// `useSyncExternalStore` chứ không phải `useEffect` + `setState`: đây là trạng thái NGOÀI React,
// và API này lo cả ba việc — bản cho server (không có localStorage), đăng ký nghe thay đổi, và
// không tạo lượt render dây chuyền.

export function ChangelogUnreadBadge({ publishedAtList }: { publishedAtList: string[] }) {
  const seenAt = useSyncExternalStore(subscribeSeen, getSeenSnapshot, getSeenServerSnapshot);

  const seen = seenAt ? Date.parse(seenAt) : null;
  const unread =
    seen === null || !Number.isFinite(seen)
      ? // Chưa từng đọc → mọi mục đều mới. Cũng là ca của lần render trên server (snapshot null),
        // nên số hiện ra trước khi hydrate là số ĐÚNG cho người chưa đọc gì.
        publishedAtList.length
      : publishedAtList.filter((iso) => {
          const t = Date.parse(iso);
          return Number.isFinite(t) && t > seen;
        }).length;

  return <CountBadge count={unread} />;
}

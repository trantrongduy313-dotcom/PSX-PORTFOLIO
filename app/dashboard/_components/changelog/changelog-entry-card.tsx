import { AlertTriangle } from "lucide-react";

import { CHANGELOG_AREA_LABELS, type ChangelogArea } from "@/app/lib/business/changelog/area";

// ─── Một mục changelog ───────────────────────────────────────────────────────
//
// DÙNG CHUNG cho trang "Có gì mới" và trang admin. Một component, vì phần hiển thị là giống
// nhau — khác nhau chỉ ở phần thao tác, và phần đó truyền vào qua `actions`. Cùng cách đã làm
// với `FeedbackCard`, và cùng lý do: chép thành hai bản là ngày nào đó nhãn khu vực ở hai trang
// hiện khác nhau cho cùng một mục.
//
// Server Component: không state, không sự kiện.

export type ChangelogRow = {
  id: string;
  title: string;
  body: string;
  area: ChangelogArea;
  isImportant: boolean;
  publishedAt: string | null;
  authorName: string;
};

export function ChangelogEntryCard({
  row,
  isNew,
  actions,
}: {
  row: ChangelogRow;
  /** Đăng sau lần đọc gần nhất của người này. Chỉ để làm dấu, không đổi nội dung. */
  isNew?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        // Mục mới được nhấn bằng một vạch bên trái, KHÔNG bằng màu nền: đọc 10 mục mà 4 mục có
        // nền khác thì trang trông vá chằng đụp. Một vạch mảnh đủ để mắt bắt được khi quét dọc.
        borderLeft: isNew ? "3px solid var(--pink)" : "1px solid var(--border)",
        background: "var(--cream-card)",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
        {row.isImportant && (
          <AlertTriangle style={{ width: "13px", height: "13px", flexShrink: 0, color: "var(--s-gold)" }} />
        )}

        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--ink-muted)",
          }}
        >
          {CHANGELOG_AREA_LABELS[row.area]}
        </span>

        {isNew && (
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              background: "var(--pink)",
              color: "#fff",
              padding: "1px 6px",
              borderRadius: "999px",
            }}
          >
            MỚI
          </span>
        )}

        <span style={{ flex: 1 }} />

        <span style={{ fontSize: "10px", color: "var(--ink-muted)", fontVariantNumeric: "tabular-nums" }}>
          {row.publishedAt ? formatVn(row.publishedAt) : "Nháp"}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--ink)", lineHeight: 1.5 }}>
        {row.title}
      </p>

      {row.body && (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: "12px",
            color: "var(--ink-body)",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
          }}
        >
          {row.body}
        </p>
      )}

      {actions && <div style={{ marginTop: "12px" }}>{actions}</div>}
    </div>
  );
}

/** "20/08/2026" theo giờ Việt Nam — không phải giờ máy chủ. */
function formatVn(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

"use client";

import { Bug, Lightbulb } from "lucide-react";

import { FEEDBACK_KIND_LABELS, type FeedbackKind } from "@/app/lib/business/feedback/kind";
import { statusLabel, statusTone, type FeedbackStatus } from "@/app/lib/business/feedback/status";

// ─── Một thẻ phản hồi ────────────────────────────────────────────────────────
//
// DÙNG CHUNG cho trang "Góp ý của tôi" và trang admin. Một component, vì phần hiển thị là
// GIỐNG NHAU — khác nhau chỉ ở chỗ admin có thêm phần thao tác, và phần đó được truyền vào qua
// `actions`. Chép thành hai bản là ngày nào đó nhãn trạng thái ở hai trang hiện khác nhau cho
// cùng một phản hồi.

export type FeedbackRow = {
  id: string;
  kind: FeedbackKind;
  status: FeedbackStatus;
  summary: string;
  detail: string;
  imageUrls: string[];
  reporterName: string;
  reporterEmail: string;
  reporterRole: string;
  pageUrl: string | null;
  orderNumber: string | null;
  moNumber: string | null;
  orderVersion: number | null;
  commitSha: string | null;
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
};

const TONE_COLOR: Record<ReturnType<typeof statusTone>, string> = {
  new: "var(--s-red)",
  active: "var(--s-blue)",
  done: "var(--s-green)",
  muted: "var(--ink-muted)",
};

export function FeedbackCard({
  row,
  showReporter,
  actions,
}: {
  row: FeedbackRow;
  showReporter?: boolean;
  actions?: React.ReactNode;
}) {
  const Icon = row.kind === "BUG" ? Bug : Lightbulb;
  const tone = statusTone(row.status);

  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--cream-card)", padding: "14px 16px" }}>
      {/* ── Dòng đầu: loại · trạng thái · thời điểm ─────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
        <Icon style={{ width: "13px", height: "13px", flexShrink: 0, color: "var(--ink-muted)" }} />
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink)" }}>
          {FEEDBACK_KIND_LABELS[row.kind]}
        </span>

        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: "#fff",
            background: TONE_COLOR[tone],
            padding: "1px 7px",
            borderRadius: "999px",
          }}
        >
          {statusLabel(row.kind, row.status)}
        </span>

        <span style={{ flex: 1 }} />

        <span style={{ fontSize: "10px", color: "var(--ink-muted)", fontVariantNumeric: "tabular-nums" }}>
          {formatVn(row.createdAt)}
        </span>
      </div>

      {showReporter && (
        <p style={{ margin: "0 0 6px", fontSize: "11px", color: "var(--ink-muted)" }}>
          {row.reporterName} · {row.reporterRole}
          {row.reporterEmail ? ` · ${row.reporterEmail}` : ""}
        </p>
      )}

      <p style={{ margin: 0, fontSize: "13px", color: "var(--ink)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
        {row.summary}
      </p>

      {row.detail && (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: "12px",
            color: "var(--ink-body)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {row.detail}
        </p>
      )}

      {/* ── Ảnh ────────────────────────────────────────────────────────── */}
      {row.imageUrls.length > 0 && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
          {row.imageUrls.map((url) => (
            // Mở tab mới để xem cỡ thật. `rel="noreferrer"` vì đây là link ra storage.
            <a key={url} href={url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Ảnh kèm phản hồi"
                loading="lazy"
                style={{ width: "68px", height: "68px", objectFit: "cover", border: "1px solid var(--border)" }}
              />
            </a>
          ))}
        </div>
      )}

      {/* ── Bối cảnh tự động — thứ làm nó hơn một tin nhắn ──────────────── */}
      <ContextLine row={row} />

      {/* ── Câu trả lời của admin: nửa còn lại của việc đóng vòng ───────── */}
      {row.adminReply && (
        <div
          style={{
            marginTop: "10px",
            padding: "8px 10px",
            background: "var(--row-zebra)",
            borderLeft: "2px solid var(--ink)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--ink-muted)",
            }}
          >
            Trả lời
          </p>
          <p style={{ margin: "3px 0 0", fontSize: "12px", color: "var(--ink)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {row.adminReply}
          </p>
        </div>
      )}

      {actions && <div style={{ marginTop: "12px" }}>{actions}</div>}
    </div>
  );
}

function ContextLine({ row }: { row: FeedbackRow }) {
  const bits: string[] = [];
  if (row.moNumber) bits.push(`MO ${row.moNumber}`);
  if (row.orderNumber) bits.push(`SO ${row.orderNumber}`);
  if (row.orderVersion != null) bits.push(`phiên bản ${row.orderVersion}`);
  if (row.commitSha) bits.push(`bản ${row.commitSha}`);

  if (bits.length === 0 && !row.pageUrl) return null;

  return (
    <p
      style={{
        margin: "10px 0 0",
        fontSize: "10px",
        color: "var(--ink-muted)",
        fontFamily: "var(--font-mono), monospace",
        wordBreak: "break-all",
      }}
    >
      {/* pageUrl đã được chốt chặn ở server (chỉ http/https hoặc đường dẫn tương đối) — xem
          business/feedback/context.ts:safeUrl. Không có chốt đó thì một chuỗi `javascript:`
          gửi lên sẽ thành mã chạy trong trình duyệt của ADMIN ngay tại thẻ <a> dưới đây. */}
      {row.pageUrl && (
        <a href={row.pageUrl} style={{ color: "var(--ink-muted)", textDecoration: "underline" }}>
          {row.pageUrl}
        </a>
      )}
      {bits.length > 0 && (row.pageUrl ? ` · ${bits.join(" · ")}` : bits.join(" · "))}
    </p>
  );
}

/** "14:27 20/08/2026" theo giờ Việt Nam — không phải giờ máy chủ. */
function formatVn(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

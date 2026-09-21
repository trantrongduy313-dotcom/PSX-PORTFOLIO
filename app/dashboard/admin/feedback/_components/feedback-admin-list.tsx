"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { fetchJson } from "@/app/lib/utils/fetch-json";
import { FEEDBACK_KIND_LABELS, FEEDBACK_KINDS } from "@/app/lib/business/feedback/kind";
import {
  isOpenStatus,
  requiresReply,
  statusLabel,
  statusesFor,
  type FeedbackStatus,
} from "@/app/lib/business/feedback/status";
import { FeedbackCard, type FeedbackRow } from "@/app/dashboard/_components/feedback/feedback-card";

// ─── Danh sách phản hồi cho admin ────────────────────────────────────────────
//
// Phần hiển thị dùng LẠI `FeedbackCard` (chung với trang "Góp ý của tôi"); file này chỉ thêm
// bộ lọc và phần thao tác. Nhờ vậy nhãn trạng thái ở hai trang không thể lệch nhau.
//
// Các trạng thái chọn được LẤY THEO LOẠI của đúng phản hồi đó (`statusesFor(row.kind)`) —
// KHÔNG phải một danh sách chung. Đó là điều ngăn một đề xuất cải tiến bị gán "Đã sửa".

type Filter = "open" | "all" | "BUG" | "IDEA";

export function FeedbackAdminList({ rows }: { rows: FeedbackRow[] }) {
  const [filter, setFilter] = useState<Filter>("open");

  const shown = rows.filter((r) => {
    if (filter === "open") return isOpenStatus(r.status);
    if (filter === "BUG" || filter === "IDEA") return r.kind === filter;
    return true;
  });

  const openCount = rows.filter((r) => isOpenStatus(r.status)).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          gap: "6px",
          padding: "10px 24px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Tab active={filter === "open"} onClick={() => setFilter("open")}>
          Chưa xử lý ({openCount})
        </Tab>
        {FEEDBACK_KINDS.map((k) => (
          <Tab key={k} active={filter === k} onClick={() => setFilter(k)}>
            {FEEDBACK_KIND_LABELS[k]}
          </Tab>
        ))}
        <Tab active={filter === "all"} onClick={() => setFilter("all")}>
          Tất cả ({rows.length})
        </Tab>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {shown.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--ink-muted)", margin: 0 }}>Không có phản hồi nào.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "820px" }}>
            {shown.map((row) => (
              <FeedbackCard
                key={row.id}
                row={row}
                showReporter
                actions={<AdminActions row={row} />}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminActions({ row }: { row: FeedbackRow }) {
  const router = useRouter();
  const [reply, setReply] = useState(row.adminReply ?? "");
  const [busy, setBusy] = useState(false);

  const send = async (payload: { status?: FeedbackStatus; reply?: string }) => {
    setBusy(true);
    try {
      await fetchJson(`/api/feedback/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // `router.refresh()` chứ không tự sửa state: trang là Server Component, và một bản sao
      // state ở client là chỗ hai nơi giữ cùng một sự thật rồi lệch nhau.
      router.refresh();
      toast.success("Đã cập nhật");
    } catch (err) {
      toast.error((err as Error).message || "Không cập nhật được");
    } finally {
      setBusy(false);
    }
  };

  const replyChanged = reply.trim() !== (row.adminReply ?? "").trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
      <textarea
        className="psx-input"
        rows={2}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        disabled={busy}
        placeholder="Trả lời người gửi — một dòng cũng hơn im lặng."
        style={{ resize: "vertical", fontSize: "12px" }}
      />

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
        {replyChanged && (
          <button type="button" className="psx-btn-secondary" disabled={busy} onClick={() => send({ reply })}>
            Lưu câu trả lời
          </button>
        )}

        {/* CHỈ các trạng thái thuộc ĐÚNG loại của phản hồi này. */}
        {statusesFor(row.kind)
          .filter((s) => s !== row.status)
          .map((s) => (
            <button
              key={s}
              type="button"
              className="psx-btn-secondary"
              disabled={busy}
              onClick={() => {
                // Chốt chặn phía server vẫn là chốt thật (route trả 400) — kiểm ở đây chỉ để
                // đỡ một vòng mạng và để câu nhắc đến ngay lúc admin đang gõ.
                if (requiresReply(s) && reply.trim().length === 0) {
                  toast.error("Hãy ghi một dòng lý do trước khi chốt.");
                  return;
                }
                send({ status: s, ...(replyChanged && { reply }) });
              }}
            >
              → {statusLabel(row.kind, s)}
            </button>
          ))}

        {busy && <Loader2 className="animate-spin" style={{ width: "13px", height: "13px", color: "var(--ink-muted)" }} />}
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "5px 12px",
        fontSize: "11px",
        fontWeight: active ? 600 : 400,
        color: active ? "var(--cream)" : "var(--ink-body)",
        background: active ? "var(--ink)" : "transparent",
        border: `1px solid ${active ? "var(--ink)" : "var(--border-md)"}`,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

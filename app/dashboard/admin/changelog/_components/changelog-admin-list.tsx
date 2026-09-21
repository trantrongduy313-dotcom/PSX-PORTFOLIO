"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { fetchJson } from "@/app/lib/utils/fetch-json";
import { ChangelogEntryCard, type ChangelogRow } from "@/app/dashboard/_components/changelog/changelog-entry-card";

// ─── Danh sách mục changelog cho admin ───────────────────────────────────────
//
// Phần hiển thị dùng LẠI `ChangelogEntryCard` (chung với trang "Có gì mới"); file này chỉ thêm
// phần thao tác. Nhờ vậy nhãn khu vực và cách hiện ngày ở hai trang không thể lệch nhau.

export type AdminChangelogRow = ChangelogRow & {
  isPublished: boolean;
  /** Đã từng loan báo cho cả nhóm hay chưa. Quyết định câu chữ ở nút, không phải ẩn/hiện nút. */
  notifiedAt: string | null;
};

export function ChangelogAdminList({ rows }: { rows: AdminChangelogRow[] }) {
  const drafts = rows.filter((r) => !r.isPublished);
  const published = rows.filter((r) => r.isPublished);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "820px" }}>
      <Section title={`Nháp (${drafts.length})`} empty="Không có nháp nào.">
        {drafts.map((row) => (
          <ChangelogEntryCard key={row.id} row={row} actions={<AdminActions row={row} />} />
        ))}
      </Section>

      <Section title={`Đã đăng (${published.length})`} empty="Chưa đăng mục nào.">
        {published.map((row) => (
          <ChangelogEntryCard key={row.id} row={row} actions={<AdminActions row={row} />} />
        ))}
      </Section>
    </div>
  );
}

function AdminActions({ row }: { row: AdminChangelogRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const call = async (init: RequestInit, okMsg: string) => {
    setBusy(true);
    try {
      await fetchJson(`/api/changelog/${row.id}`, init);
      // `router.refresh()` chứ không tự sửa state: trang là Server Component, và một bản sao
      // state ở client là chỗ hai nơi giữ cùng một sự thật rồi lệch nhau.
      router.refresh();
      toast.success(okMsg);
    } catch (err) {
      toast.error((err as Error).message || "Không thực hiện được");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        flexWrap: "wrap",
        alignItems: "center",
        borderTop: "1px solid var(--border)",
        paddingTop: "10px",
      }}
    >
      {row.isPublished ? (
        <>
          <button
            type="button"
            className="psx-btn-secondary"
            disabled={busy}
            onClick={() =>
              call(
                { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unpublish: true }) },
                "Đã đưa về nháp",
              )
            }
          >
            Bỏ đăng
          </button>

          {/* Nói rõ điều KHÔNG hiển nhiên: bỏ đăng rồi đăng lại sẽ KHÔNG bắn thông báo lần hai.
              Không nói thì admin tưởng Chat lỗi, rồi đi tìm một lỗi không tồn tại. */}
          {row.notifiedAt && (
            <span style={{ fontSize: "10px", color: "var(--ink-muted)" }}>
              Đã thông báo — đăng lại sẽ không bắn tin lần hai
            </span>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            className="psx-btn-secondary"
            disabled={busy}
            onClick={() => {
              // `window.confirm` vì đây là hành động không lấy lại được. Cùng cách đã dùng cho
              // xác nhận trùng MO ở panel đơn hàng — không dựng một hộp thoại riêng cho một câu.
              if (!window.confirm("Xoá nháp này? Không lấy lại được.")) return;
              void call({ method: "DELETE" }, "Đã xoá nháp");
            }}
          >
            Xoá nháp
          </button>

          {row.notifiedAt && (
            <span style={{ fontSize: "10px", color: "var(--ink-muted)" }}>
              Mục này đã từng được thông báo
            </span>
          )}
        </>
      )}

      {busy && <Loader2 className="animate-spin" style={{ width: "13px", height: "13px", color: "var(--ink-muted)" }} />}
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <div>
      <p
        style={{
          margin: "0 0 8px",
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--ink-muted)",
        }}
      >
        {title}
      </p>
      {children.length === 0 ? (
        <p style={{ fontSize: "12px", color: "var(--ink-muted)", margin: 0 }}>{empty}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>{children}</div>
      )}
    </div>
  );
}

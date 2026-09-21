"use client";

import { useState } from "react";
import { DateInput } from "@/app/dashboard/orders/_components/date-input";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ChangeRow } from "@/app/api/admin/change-history/route";
import { auditFieldLabel, auditActionLabel, auditDisplayValue } from "@/app/lib/utils/audit-labels";
import { IMPORTANT_FIELD_LABELS } from "@/app/lib/business/suspicious-clear";

// ── Styles ──────────────────────────────────────────────────────────────────
const TH: React.CSSProperties = {
  padding: "8px 10px", fontSize: "10px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.07em",
  color: "var(--ink-muted)", background: "var(--cream-dark, #f0ebe3)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", textAlign: "left",
};
const TD: React.CSSProperties = {
  padding: "8px 10px", fontSize: "12px", verticalAlign: "top",
  borderBottom: "1px solid var(--border-light, #f0ede8)", textAlign: "left",
};
const INPUT: React.CSSProperties = {
  padding: "6px 10px", fontSize: "12px", border: "1px solid var(--border)",
  borderRadius: "4px", background: "var(--cream-card)", color: "var(--ink)",
};

const ACTION_OPTIONS = [
  { val: "", label: "Tất cả thao tác" },
  { val: "FIELD_UPDATED", label: "Sửa thông tin" },
  { val: "STATUS_CHANGED", label: "Đổi trạng thái" },
  { val: "SUSPENDED", label: "Tạm ngưng" },
  { val: "RESUMED", label: "Tiếp tục" },
  { val: "CREATED", label: "Tạo mới" },
  { val: "COMMENT_ADDED", label: "Ghi chú" },
  { val: "ADMIN_OVERRIDE", label: "Sửa dữ liệu MO đã chốt (Admin)" },
];

type ApiResp = { data: ChangeRow[]; total: number; page: number; limit: number; totalPages: number };

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** "YYYY-MM-DD" → "dd/mm/yyyy" (chuỗi thuần, không parse Date để khỏi lệch múi giờ). */
function fmtYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (ymd || "—");
}

// Số MO hiển thị tối đa trên 1 dòng lịch sử — dư thì cắt bớt kèm "…+K nữa" để không vỡ layout.
const MO_LIST_LIMIT = 5;

// Câu tóm tắt cho thao tác tạo đơn / thêm MO — "Đã tạo N MO: ..." hoặc "Đã thêm N MO: ...".
// Hàm thuần, hiển thị MO# dạng raw (theo yêu cầu). Trả "" nếu không có danh sách MO.
export function formatMoListDetail(action: string, moNumbers: string[] | null, addedCount: number | null): string {
  if (!moNumbers || moNumbers.length === 0) return "";
  const verb = action === "CREATED" ? "Đã tạo" : "Đã thêm";
  const count = addedCount ?? moNumbers.length;
  const shown = moNumbers.slice(0, MO_LIST_LIMIT).join(", ");
  const rest = moNumbers.length - MO_LIST_LIMIT;
  const suffix = rest > 0 ? ` …+${rest} nữa` : "";
  return `${verb} ${count} MO: ${shown}${suffix}`;
}

export function ChangeHistoryClient({ users }: { users: { id: string; name: string | null }[] }) {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [onlyCleared, setOnlyCleared] = useState(false);
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (userId) qs.set("userId", userId);
  if (action) qs.set("action", action);
  if (dateFrom) qs.set("dateFrom", dateFrom);
  if (dateTo) qs.set("dateTo", dateTo);
  if (onlyCleared) qs.set("onlyCleared", "1");
  qs.set("page", String(page));

  const { data, isLoading, isError } = useQuery<ApiResp>({
    queryKey: ["change-history", search, userId, action, dateFrom, dateTo, onlyCleared, page],
    queryFn: async () => {
      const res = await fetch(`/api/admin/change-history?${qs.toString()}`);
      if (!res.ok) throw new Error("Không tải được lịch sử");
      return res.json();
    },
    placeholderData: keepPreviousData,
  });

  const resetPageThen = (fn: () => void) => { setPage(1); fn(); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Filter bar */}
      <div style={{ flexShrink: 0, display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", padding: "12px 24px", borderBottom: "1px solid var(--border)" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); resetPageThen(() => setSearch(searchInput.trim())); }}
          style={{ display: "flex", gap: "6px" }}
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm SO# hoặc MO#…"
            style={{ ...INPUT, width: "180px" }}
          />
          <button type="submit" className="psx-btn-primary" style={{ fontSize: "12px", padding: "6px 14px" }}>Tìm</button>
        </form>

        <select value={userId} onChange={(e) => resetPageThen(() => setUserId(e.target.value))} style={INPUT}>
          <option value="">Tất cả người sửa</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? "(không tên)"}</option>)}
        </select>

        <select value={action} onChange={(e) => resetPageThen(() => setAction(e.target.value))} style={INPUT}>
          {ACTION_OPTIONS.map((o) => <option key={o.val} value={o.val}>{o.label}</option>)}
        </select>

        <label style={{ fontSize: "11px", color: "var(--ink-muted)" }}>Từ</label>
        <DateInput value={dateFrom} onChange={(v) => resetPageThen(() => setDateFrom(v))} style={INPUT} />
        <label style={{ fontSize: "11px", color: "var(--ink-muted)" }}>Đến</label>
        <DateInput value={dateTo} onChange={(v) => resetPageThen(() => setDateTo(v))} style={INPUT} />

        <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", cursor: "pointer", padding: "6px 10px", borderRadius: "4px", border: `1px solid ${onlyCleared ? "var(--s-red)" : "var(--border)"}`, background: onlyCleared ? "rgba(200,50,50,0.08)" : "var(--cream-card)", color: onlyCleared ? "var(--s-red)" : "var(--ink-body)", fontWeight: onlyCleared ? 600 : 400 }}>
          <input type="checkbox" checked={onlyCleared} onChange={(e) => resetPageThen(() => setOnlyCleared(e.target.checked))} />
          ⚠ Chỉ hiện xoá trắng dữ liệu quan trọng
        </label>

        {(search || userId || action || dateFrom || dateTo || onlyCleared) && (
          <button
            onClick={() => { setSearch(""); setSearchInput(""); setUserId(""); setAction(""); setDateFrom(""); setDateTo(""); setOnlyCleared(false); setPage(1); }}
            style={{ ...INPUT, cursor: "pointer", color: "var(--ink-muted)" }}
          >
            Xóa lọc
          </button>
        )}

        <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--ink-muted)" }}>
          {data ? `${data.total} bản ghi` : ""}
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {isError ? (
          <p style={{ padding: "24px", color: "var(--s-red)", fontSize: "13px" }}>Lỗi tải dữ liệu.</p>
        ) : isLoading ? (
          <p style={{ padding: "24px", color: "var(--ink-muted)", fontSize: "13px" }}>Đang tải…</p>
        ) : !data || data.data.length === 0 ? (
          <p style={{ padding: "24px", color: "var(--ink-muted)", fontSize: "13px" }}>Không có bản ghi nào khớp bộ lọc.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr>
                <th style={{ ...TH, width: "130px" }}>Thời gian</th>
                <th style={{ ...TH, width: "150px" }}>SO / MO</th>
                <th style={{ ...TH, width: "120px" }}>Người sửa</th>
                <th style={{ ...TH, width: "110px" }}>Thao tác</th>
                <th style={TH}>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...TD, whiteSpace: "nowrap", color: "var(--ink-muted)" }}>{fmtTime(r.performedAt)}</td>
                  <td style={{ ...TD, fontFamily: "monospace" }}>
                    <div style={{ fontWeight: 600, color: "var(--ink)" }}>{r.moNumber ?? r.orderNumber}</div>
                    {r.moNumber && <div style={{ fontSize: "10px", color: "var(--ink-muted)" }}>SO: {r.orderNumber}</div>}
                    {r.suspiciousClear && (
                      <div style={{ marginTop: "3px", fontFamily: "inherit", display: "inline-block", fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "3px", background: "var(--s-red)", color: "#fff", whiteSpace: "normal", lineHeight: 1.3 }}>
                        ⚠ Xoá trắng: {r.clearedFields.map((f) => IMPORTANT_FIELD_LABELS[f] ?? f).join(", ")}
                      </div>
                    )}
                    {r.lifecycle === "VOID" && (
                      <div style={{ marginTop: "3px", fontFamily: "inherit", display: "inline-block", fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "3px", background: "#8a6a1a", color: "#fff", whiteSpace: "normal", lineHeight: 1.3 }}>
                        🗑 Đã xóa nhầm (nhả số phiên bản)
                      </div>
                    )}
                    {r.affectsMultipleMo && (
                      <div style={{ marginTop: "3px", fontFamily: "inherit", display: "inline-block", fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "3px", background: "#b45309", color: "#fff", whiteSpace: "normal", lineHeight: 1.3 }}>
                        ⚠ Sửa cấp SO — ảnh hưởng {r.affectedMoCount} MO
                      </div>
                    )}
                    {r.dateMismatch && (
                      <div style={{ marginTop: "3px", fontFamily: "inherit", fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "3px", background: "#b45309", color: "#fff", whiteSpace: "normal", lineHeight: 1.35 }}>
                        ⚠ Lệch Ngày HT với Google Sheet
                        {r.dateMismatchDetail.slice(0, 5).map((d) => (
                          <div key={d.mo} style={{ fontWeight: 500 }}>
                            {d.mo}: webapp {fmtYmd(d.webapp)} ≠ sheet {fmtYmd(d.sheet)}
                          </div>
                        ))}
                        {r.dateMismatchDetail.length > 5 && (
                          <div style={{ fontWeight: 500 }}>… và {r.dateMismatchDetail.length - 5} MO khác</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={TD}>{r.performedByName ?? "—"}</td>
                  <td style={TD}>
                    <span style={{
                      fontSize: "11px", fontWeight: 600, padding: "2px 7px", borderRadius: "3px",
                      background: r.action === "FIELD_UPDATED" ? "rgba(138,106,26,0.1)" : "var(--cream-dark)",
                      color: r.action === "FIELD_UPDATED" ? "var(--s-gold)" : "var(--ink-body)",
                    }}>
                      {auditActionLabel(r.action)}
                    </span>
                  </td>
                  <td style={TD}>
                    {r.action === "STATUS_CHANGED" && r.fromStatus && r.toStatus && r.changes.length === 0 ? (
                      <span style={{ fontSize: "12px" }}>{r.fromStatus} → {r.toStatus}</span>
                    ) : r.changes.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        {r.changes.map((c, i) => (
                          <div key={i} style={{ fontSize: "12px" }}>
                            <span style={{ fontWeight: 600, color: "var(--ink)" }}>{auditFieldLabel(c.field)}: </span>
                            <span style={{ color: "var(--s-red)", textDecoration: "line-through" }}>{auditDisplayValue(c.old)}</span>
                            <span style={{ color: "var(--ink-muted)" }}> → </span>
                            <span style={{ color: "var(--s-green)", fontWeight: 500 }}>{auditDisplayValue(c.new)}</span>
                          </div>
                        ))}
                      </div>
                    ) : r.moNumbers && r.moNumbers.length > 0 ? (
                      <span style={{ fontSize: "12px", color: "var(--ink-body)" }}>
                        {formatMoListDetail(r.action, r.moNumbers, r.addedCount)}
                      </span>
                    ) : r.comment ? (
                      <span style={{ fontSize: "12px", color: "var(--ink-body)" }}>{r.comment}</span>
                    ) : (
                      <span style={{ fontSize: "12px", color: "var(--ink-muted)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div style={{ flexShrink: 0, display: "flex", gap: "8px", alignItems: "center", justifyContent: "center", padding: "10px", borderTop: "1px solid var(--border)" }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{ ...INPUT, cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.5 : 1 }}
          >
            ← Trước
          </button>
          <span style={{ fontSize: "12px", color: "var(--ink-muted)" }}>Trang {data.page} / {data.totalPages}</span>
          <button
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={{ ...INPUT, cursor: page >= data.totalPages ? "not-allowed" : "pointer", opacity: page >= data.totalPages ? 0.5 : 1 }}
          >
            Sau →
          </button>
        </div>
      )}
    </div>
  );
}

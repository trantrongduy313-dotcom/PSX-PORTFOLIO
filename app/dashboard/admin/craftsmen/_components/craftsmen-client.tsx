"use client";

import { useState, useTransition } from "react";

import {
  CRAFTSMAN_CODE_MAX,
  CRAFTSMAN_LEVELS as LEVELS,
  KHAU_OPTIONS,
  type CraftsmanLevel as Level,
  type CraftsmanKhau as Khau,
} from "@/app/lib/business/craftsman";

export type CraftsmanRow = {
  id: string;
  name: string;
  /** Mã thợ — TÙY CHỌN. "" nghĩa là chưa có, và đó là giá trị hợp lệ. */
  code: string;
  level: string;
  khau: string;
  levelRank: number;
  isActive: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: "9px 14px", fontSize: "10px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.08em",
  color: "var(--ink-muted)", background: "var(--cream-dark, #f0ebe3)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", textAlign: "left",
};
const TD: React.CSSProperties = {
  padding: "10px 14px", fontSize: "13px", borderBottom: "1px solid var(--border-light, #f0ede8)",
};

const LEVEL_COLOR: Record<string, string> = {
  "KTSX":    "#7c3aed",
  "Bậc 5":   "#1d4ed8",
  "Bậc 4":   "#0369a1",
  "Bậc 3":   "#15803d",
  "Bậc 2":   "#92400e",
  "Bậc 1":   "#374151",
  "ĐBXM":    "#0f766e",
  "AZ":      "#0f766e",
  "Resin":   "#0f766e",
  "Dây lắc": "#0f766e",
  "Đúc":     "#0f766e",
};

const KHAU_COLOR: Record<string, string> = {
  "Nguội":   "#0369a1",
  "Hột":     "#7c3aed",
  "TC Dây":  "#92400e",
  "ĐBXM":    "#0f766e",
  "Đúc":     "#b45309",
  "QC":      "#15803d",
  "Resin":   "#6b7280",
  "AZ":      "#6b7280",
  "Dây lắc": "#6b7280",
  "Khác":    "#6b7280",
};

function shortLevel(level: string): string {
  if (!level) return "";
  return level.replace("Bậc ", "B");
}

// ─── Modal ────────────────────────────────────────────────────────────────────

type ModalProps = {
  initial?: CraftsmanRow | null;
  onClose: () => void;
  onSaved: (c: CraftsmanRow) => void;
};

function CraftsmanModal({ initial, onClose, onSaved }: ModalProps) {
  const isEdit = !!initial;
  const [name,  setName]  = useState(initial?.name  ?? "");
  // ⚠️ MỘT modal cho cả TẠO lẫn SỬA (`initial = null` là tạo). Nhờ đó thêm một trường là tự
  // có ở CẢ HAI luồng — bên Quản lý NV 3D dùng hai form nên ô email lọt khỏi form SỬA, và sự
  // bất đối xứng đó đã tạo ra một hồ sơ nhân viên trùng.
  const [code,  setCode]  = useState(initial?.code  ?? "");
  const [level, setLevel] = useState<Level>((initial?.level as Level) ?? "");
  const [khau,  setKhau]  = useState<Khau>((initial?.khau as Khau) ?? "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function submit() {
    setError("");
    if (!name.trim()) { setError("Vui lòng nhập tên thợ"); return; }

    startTransition(async () => {
      const url    = isEdit ? `/api/craftsmen/${initial!.id}` : "/api/craftsmen";
      const method = isEdit ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), code: code.trim(), level, khau }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Lỗi không xác định");
        return;
      }
      onSaved(json.data);
    });
  }

  const btnBase: React.CSSProperties = {
    padding: "5px 12px", fontSize: "12px", cursor: "pointer",
    border: "1px solid", borderRadius: "4px",
    transition: "all 0.12s",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center",
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--cream-card)", border: "1px solid var(--border)",
        width: "380px", maxWidth: "calc(100vw - 32px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>
            {isEdit ? "Sửa thông tin thợ" : "Thêm thợ mới"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "var(--ink-muted)", lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          {/* Mã thợ — TÙY CHỌN, và KHÔNG có dấu * : dấu sao là hợp đồng thị giác của trường bắt
              buộc trong form này (xem ô Tên ngay dưới). Đặt nhầm một dấu sao là nói dối. */}
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--ink-muted)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Mã thợ
              <span style={{ marginLeft: "6px", textTransform: "none", letterSpacing: 0, fontWeight: 400, opacity: 0.75 }}>
                (không bắt buộc)
              </span>
            </label>
            <input
              type="text"
              value={code}
              maxLength={CRAFTSMAN_CODE_MAX}
              onChange={e => setCode(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="VD: 265"
              style={{
                width: "100%", padding: "7px 10px", fontSize: "13px",
                fontFamily: "monospace",
                border: "1px solid var(--border)", borderRadius: "4px",
                background: "var(--cream)", color: "var(--ink)", outline: "none",
              }}
            />
          </div>

          {/* Tên */}
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--ink-muted)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Tên thợ <span style={{ color: "var(--s-red, #dc2626)" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="Nguyễn Văn A"
              className="psx-input"
              style={{ width: "100%", fontSize: "13px" }}
              autoFocus
            />
          </div>

          {/* Khâu */}
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--ink-muted)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Khâu <span style={{ fontSize: "10px", fontWeight: 400, textTransform: "none" }}>(không bắt buộc)</span>
            </label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setKhau("")}
                style={{
                  ...btnBase,
                  borderColor: khau === "" ? "#374151" : "var(--border)",
                  background:  khau === "" ? "#37415115" : "transparent",
                  color:       khau === "" ? "#374151" : "var(--ink-muted)",
                  fontWeight:  khau === "" ? 700 : 400,
                }}
              >
                Không
              </button>
              {KHAU_OPTIONS.map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKhau(k)}
                  style={{
                    ...btnBase,
                    borderColor: khau === k ? (KHAU_COLOR[k] ?? "#374151") : "var(--border)",
                    background:  khau === k ? `${KHAU_COLOR[k] ?? "#374151"}15` : "transparent",
                    color:       khau === k ? (KHAU_COLOR[k] ?? "#374151") : "var(--ink-muted)",
                    fontWeight:  khau === k ? 700 : 400,
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* Bậc */}
          <div style={{ marginBottom: "6px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--ink-muted)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Bậc thợ <span style={{ fontSize: "10px", fontWeight: 400, textTransform: "none" }}>(không bắt buộc)</span>
            </label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setLevel("")}
                style={{
                  ...btnBase,
                  borderColor: level === "" ? "#374151" : "var(--border)",
                  background:  level === "" ? "#37415115" : "transparent",
                  color:       level === "" ? "#374151" : "var(--ink-muted)",
                  fontWeight:  level === "" ? 700 : 400,
                }}
              >
                Không
              </button>
              {LEVELS.map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel(l)}
                  style={{
                    ...btnBase,
                    borderColor: level === l ? (LEVEL_COLOR[l] ?? "#374151") : "var(--border)",
                    background:  level === l ? `${LEVEL_COLOR[l] ?? "#374151"}15` : "transparent",
                    color:       level === l ? (LEVEL_COLOR[l] ?? "#374151") : "var(--ink-muted)",
                    fontWeight:  level === l ? 700 : 400,
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p style={{ fontSize: "12px", color: "var(--s-red, #dc2626)", marginTop: "10px" }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button onClick={onClose} className="psx-btn-secondary" style={{ fontSize: "12px", height: "32px" }}>
            Hủy
          </button>
          <button
            onClick={submit}
            disabled={isPending}
            className="psx-btn-primary"
            style={{ fontSize: "12px", height: "32px", minWidth: "80px" }}
          >
            {isPending ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function CraftsmenClient({ initialCraftsmen }: { initialCraftsmen: CraftsmanRow[] }) {
  const [craftsmen, setCraftsmen] = useState<CraftsmanRow[]>(initialCraftsmen);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState<CraftsmanRow | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [, startTransition] = useTransition();

  const displayed = showInactive ? craftsmen : craftsmen.filter(c => c.isActive);

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(c: CraftsmanRow) { setEditing(c); setModalOpen(true); }
  function onSaved(updated: CraftsmanRow) {
    setCraftsmen(prev => {
      const exists = prev.find(c => c.id === updated.id);
      return exists
        ? prev.map(c => c.id === updated.id ? updated : c)
        : [...prev, updated];
    });
    setModalOpen(false);
  }

  function toggleActive(c: CraftsmanRow) {
    startTransition(async () => {
      const res = await fetch(`/api/craftsmen/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      if (res.ok) {
        const json = await res.json();
        setCraftsmen(prev => prev.map(x => x.id === c.id ? json.data : x));
      }
    });
  }

  const activeCount   = craftsmen.filter(c => c.isActive).length;
  const inactiveCount = craftsmen.filter(c => !c.isActive).length;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
            <strong style={{ color: "var(--ink)" }}>{activeCount}</strong> đang hoạt động
            {inactiveCount > 0 && (
              <> · <strong style={{ color: "var(--ink-muted)" }}>{inactiveCount}</strong> đã ẩn</>
            )}
          </span>
          {inactiveCount > 0 && (
            <button
              onClick={() => setShowInactive(v => !v)}
              style={{
                fontSize: "11px", background: "none", border: "1px solid var(--border)",
                cursor: "pointer", padding: "3px 10px", borderRadius: "4px",
                color: "var(--ink-muted)",
              }}
            >
              {showInactive ? "Ẩn thợ đã ẩn" : "Xem tất cả"}
            </button>
          )}
        </div>
        <button onClick={openCreate} className="psx-btn-primary" style={{ fontSize: "12px", height: "34px" }}>
          + Thêm thợ mới
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "var(--cream-card)", border: "1px solid var(--border)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: "40px", textAlign: "center" }}>#</th>
              <th style={{ ...TH, width: "90px" }}>Mã</th>
              <th style={TH}>Tên thợ</th>
              <th style={TH}>Khâu · Bậc</th>
              <th style={{ ...TH, textAlign: "center" }}>Trạng thái</th>
              <th style={{ ...TH, textAlign: "right" }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...TD, textAlign: "center", color: "var(--ink-muted)", padding: "40px" }}>
                  Chưa có thợ nào
                </td>
              </tr>
            )}
            {displayed.map((c, i) => (
              <tr key={c.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.012)", opacity: c.isActive ? 1 : 0.55 }}>
                <td style={{ ...TD, textAlign: "center", color: "var(--ink-muted)", fontSize: "11px" }}>{i + 1}</td>
                <td style={{ ...TD, fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "var(--ink-muted)" }}>
                  {/* Rỗng hiện "—": người đọc biết là CHƯA CÓ, khác hẳn một ô trắng trông như lỗi tải. */}
                  {c.code || "—"}
                </td>
                <td style={TD}>
                  <span style={{ fontWeight: 500, color: "var(--ink)" }}>{c.name}</span>
                </td>
                <td style={TD}>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
                    {c.khau && (
                      <span style={{
                        fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "3px",
                        background: `${KHAU_COLOR[c.khau] ?? "#374151"}18`,
                        color: KHAU_COLOR[c.khau] ?? "#374151",
                      }}>
                        {c.khau}
                      </span>
                    )}
                    {c.level && (
                      <span style={{
                        fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "3px",
                        background: `${LEVEL_COLOR[c.level] ?? "#374151"}18`,
                        color: LEVEL_COLOR[c.level] ?? "#374151",
                      }}>
                        {shortLevel(c.level)}
                      </span>
                    )}
                    {!c.khau && !c.level && (
                      <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>—</span>
                    )}
                  </div>
                </td>
                <td style={{ ...TD, textAlign: "center" }}>
                  <span style={{
                    fontSize: "11px", fontWeight: 600,
                    color: c.isActive ? "var(--s-green, #16a34a)" : "var(--ink-muted)",
                  }}>
                    {c.isActive ? "● Hoạt động" : "○ Đã ẩn"}
                  </span>
                </td>
                <td style={{ ...TD, textAlign: "right" }}>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => openEdit(c)}
                      className="psx-btn-secondary"
                      style={{ fontSize: "11px", height: "28px", padding: "0 10px" }}
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => toggleActive(c)}
                      style={{
                        fontSize: "11px", height: "28px", padding: "0 10px",
                        border: "1px solid var(--border)", borderRadius: "4px",
                        background: "transparent", cursor: "pointer",
                        color: c.isActive ? "var(--s-red, #dc2626)" : "var(--s-green, #16a34a)",
                      }}
                    >
                      {c.isActive ? "Ẩn" : "Kích hoạt"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <CraftsmanModal
          initial={editing}
          onClose={() => setModalOpen(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";

export type Designer3DRow = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  // Tài khoản đăng nhập gắn với hồ sơ này — null nếu chưa gắn (NV chưa dùng được hệ thống).
  user?: { id: string; name: string; email: string; role: string } | null;
};

export type Design3DUserOption = { id: string; name: string; email: string };

const TH: React.CSSProperties = {
  padding: "9px 14px", fontSize: "10px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.08em",
  color: "var(--ink-muted)", background: "var(--cream-dark, #f0ebe3)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", textAlign: "left",
};
const TD: React.CSSProperties = {
  padding: "10px 14px", fontSize: "13px", borderBottom: "1px solid var(--border-light, #f0ede8)",
};

type ModalProps = {
  initial?: Designer3DRow | null;
  userOptions: Design3DUserOption[];
  takenUserIds: Set<string>;
  onClose: () => void;
  onSaved: (d: Designer3DRow) => void;
};

function DesignerModal({ initial, userOptions, takenUserIds, onClose, onSaved }: ModalProps) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [userId, setUserId] = useState(initial?.user?.id ?? "");
  // Chỉ dùng lúc TẠO MỚI: nhập email để gắn/tạo tài khoản ngay trong 1 lần lưu, thay vì phải
  // tạo hồ sơ trước rồi quay lại Sửa mới gắn được tài khoản.
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function submit() {
    setError("");
    if (!name.trim()) { setError("Vui lòng nhập tên nhân viên"); return; }
    if (!code.trim()) { setError("Vui lòng nhập mã nhân viên"); return; }

    startTransition(async () => {
      const url    = isEdit ? `/api/designers-3d/${initial!.id}` : "/api/designers-3d";
      const method = isEdit ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim(),
          // userId chỉ gửi khi SỬA (chọn từ tài khoản có sẵn); email chỉ gửi khi TẠO MỚI
          // (gắn hoặc tự tạo tài khoản luôn trong 1 lần lưu) — hai cách nhập cho hai tình huống.
          ...(isEdit ? { userId: userId || null } : { email: email.trim() || null }),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Lỗi không xác định"); return; }
      onSaved(json.data);
    });
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center",
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--cream-card)", border: "1px solid var(--border)",
        width: "360px", maxWidth: "calc(100vw - 32px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>
            {isEdit ? "Sửa thông tin nhân viên" : "Thêm nhân viên 3D mới"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "var(--ink-muted)", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "20px" }}>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--ink-muted)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Mã nhân viên
            </label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="265"
              className="psx-input"
              style={{ width: "100%", fontSize: "13px" }}
              autoFocus
            />
          </div>

          <div style={{ marginBottom: "6px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--ink-muted)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Tên nhân viên
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="Nguyễn Văn A"
              className="psx-input"
              style={{ width: "100%", fontSize: "13px" }}
            />
          </div>

          {!isEdit && (
            <div style={{ marginBottom: "6px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--ink-muted)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Email tài khoản đăng nhập (tuỳ chọn)
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ten.nhanvien@congty.com"
                className="psx-input"
                style={{ width: "100%", fontSize: "13px" }}
              />
              <p style={{ fontSize: "10px", color: "var(--ink-muted)", marginTop: "4px", fontStyle: "italic" }}>
                Nếu email chưa có tài khoản, hệ thống sẽ tự tạo (vai trò Nhân viên Thiết kế 3D)
                và gắn ngay vào hồ sơ này. Bỏ trống nếu chưa cần đăng nhập.
              </p>
            </div>
          )}

          {isEdit && (
            <div style={{ marginTop: "14px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--ink-muted)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Tài khoản đăng nhập
              </label>
              <select
                value={userId}
                onChange={e => setUserId(e.target.value)}
                className="psx-input"
                style={{ width: "100%", fontSize: "13px" }}
              >
                <option value="">— Chưa gắn —</option>
                {userOptions
                  // Ẩn tài khoản đã gắn cho NV khác để admin không chọn rồi mới bị báo lỗi.
                  .filter(u => u.id === initial?.user?.id || !takenUserIds.has(u.id))
                  .map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
              </select>
              <p style={{ fontSize: "10px", color: "var(--ink-muted)", marginTop: "4px", fontStyle: "italic" }}>
                {userOptions.length === 0
                  ? "Chưa có tài khoản nào có vai trò Nhân viên Thiết kế 3D. Tạo ở mục Quản lý người dùng trước."
                  : "Chưa gắn tài khoản thì nhân viên không thấy được việc giao cho mình."}
              </p>
            </div>
          )}

          {error && <p style={{ fontSize: "12px", color: "var(--s-red, #dc2626)", marginTop: "10px" }}>{error}</p>}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button onClick={onClose} className="psx-btn-secondary" style={{ fontSize: "12px", height: "32px" }}>Hủy</button>
          <button onClick={submit} disabled={isPending} className="psx-btn-primary" style={{ fontSize: "12px", height: "32px", minWidth: "80px" }}>
            {isPending ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Designers3DClient({
  initialDesigners,
  design3DUsers = [],
}: {
  initialDesigners: Designer3DRow[];
  design3DUsers?: Design3DUserOption[];
}) {
  const [designers, setDesigners] = useState<Designer3DRow[]>(initialDesigners);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState<Designer3DRow | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [, startTransition] = useTransition();

  const displayed = showInactive ? designers : designers.filter(d => d.isActive);

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(d: Designer3DRow) { setEditing(d); setModalOpen(true); }
  function onSaved(updated: Designer3DRow) {
    setDesigners(prev => {
      const exists = prev.find(d => d.id === updated.id);
      return exists ? prev.map(d => d.id === updated.id ? updated : d) : [...prev, updated];
    });
    setModalOpen(false);
  }

  function toggleActive(d: Designer3DRow) {
    startTransition(async () => {
      const res = await fetch(`/api/designers-3d/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !d.isActive }),
      });
      if (res.ok) {
        const json = await res.json();
        setDesigners(prev => prev.map(x => x.id === d.id ? json.data : x));
      }
    });
  }

  const activeCount   = designers.filter(d => d.isActive).length;
  const inactiveCount = designers.filter(d => !d.isActive).length;
  // Tài khoản đã gắn cho NV khác — dùng để ẩn khỏi dropdown, tránh chọn xong mới báo lỗi.
  const takenUserIds = new Set(designers.map(d => d.user?.id).filter((v): v is string => !!v));

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
            <strong style={{ color: "var(--ink)" }}>{activeCount}</strong> đang hoạt động
            {inactiveCount > 0 && <> · <strong style={{ color: "var(--ink-muted)" }}>{inactiveCount}</strong> đã ẩn</>}
          </span>
          {inactiveCount > 0 && (
            <button
              onClick={() => setShowInactive(v => !v)}
              style={{ fontSize: "11px", background: "none", border: "1px solid var(--border)", cursor: "pointer", padding: "3px 10px", borderRadius: "4px", color: "var(--ink-muted)" }}
            >
              {showInactive ? "Ẩn nhân viên đã ẩn" : "Xem tất cả"}
            </button>
          )}
        </div>
        <button onClick={openCreate} className="psx-btn-primary" style={{ fontSize: "12px", height: "34px" }}>
          + Thêm nhân viên mới
        </button>
      </div>

      <div style={{ background: "var(--cream-card)", border: "1px solid var(--border)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: "40px", textAlign: "center" }}>#</th>
              <th style={{ ...TH, width: "80px" }}>Mã NV</th>
              <th style={TH}>Tên nhân viên</th>
              <th style={TH}>Tài khoản đăng nhập</th>
              <th style={{ ...TH, textAlign: "center" }}>Trạng thái</th>
              <th style={{ ...TH, textAlign: "right" }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...TD, textAlign: "center", color: "var(--ink-muted)", padding: "40px" }}>
                  Chưa có nhân viên nào
                </td>
              </tr>
            )}
            {displayed.map((d, i) => (
              <tr key={d.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.012)", opacity: d.isActive ? 1 : 0.55 }}>
                <td style={{ ...TD, textAlign: "center", color: "var(--ink-muted)", fontSize: "11px" }}>{i + 1}</td>
                <td style={TD}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-muted)", fontFamily: "monospace" }}>{d.code}</span>
                </td>
                <td style={TD}>
                  <span style={{ fontWeight: 500, color: "var(--ink)" }}>{d.name}</span>
                </td>
                <td style={TD}>
                  {d.user ? (
                    <span style={{ fontSize: "12px" }}>{d.user.email}</span>
                  ) : (
                    <span style={{ fontSize: "11px", color: "#b45309", fontStyle: "italic" }}>Chưa gắn tài khoản</span>
                  )}
                </td>
                <td style={{ ...TD, textAlign: "center" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: d.isActive ? "var(--s-green, #16a34a)" : "var(--ink-muted)" }}>
                    {d.isActive ? "● Hoạt động" : "○ Đã ẩn"}
                  </span>
                </td>
                <td style={{ ...TD, textAlign: "right" }}>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button onClick={() => openEdit(d)} className="psx-btn-secondary" style={{ fontSize: "11px", height: "28px", padding: "0 10px" }}>Sửa</button>
                    <button
                      onClick={() => toggleActive(d)}
                      style={{ fontSize: "11px", height: "28px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "4px", background: "transparent", cursor: "pointer", color: d.isActive ? "var(--s-red, #dc2626)" : "var(--s-green, #16a34a)" }}
                    >
                      {d.isActive ? "Ẩn" : "Kích hoạt"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <DesignerModal
          initial={editing}
          userOptions={design3DUsers}
          takenUserIds={takenUserIds}
          onClose={() => setModalOpen(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

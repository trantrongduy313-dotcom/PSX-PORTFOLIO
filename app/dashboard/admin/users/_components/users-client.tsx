"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Loader2, X, Pencil, Trash2 } from "lucide-react";
import { ROLE_LABELS } from "@/app/lib/roles";
import type { UserRole } from "@/app/generated/prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Store = { id: string; code: string; name: string };

type UserRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: UserRole;
  isActive: boolean;
  storeId: string | null;
  store: Store | null;
  storeAssignments: Store[];
  createdAt: Date | string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const ROLES: UserRole[] = ["ADMIN", "SALES", "ORDER", "PRODUCTION", "DESIGN_3D", "RND"];

const ROLE_COLOR: Record<UserRole, { color: string; border: string }> = {
  ADMIN:      { color: "var(--s-red)",   border: "var(--s-red)" },
  SALES:      { color: "var(--s-blue)",  border: "var(--s-blue)" },
  ORDER:      { color: "#7C3AED",        border: "#7C3AED" },
  PRODUCTION: { color: "var(--s-green)", border: "var(--s-green)" },
  DESIGN_3D:  { color: "#A21CAF",        border: "#A21CAF" },
  RND:        { color: "#0F766E",        border: "#0F766E" },
};

const selectStyle: React.CSSProperties = {
  fontSize: "11px",
  border: "1px solid var(--border)",
  padding: "3px 8px",
  background: "var(--cream-card)",
  color: "var(--ink-body)",
  cursor: "pointer",
  appearance: "auto",
};

// ─── Store Assignment Modal ───────────────────────────────────────────────────

function StoreAssignModal({
  user,
  stores,
  onClose,
  onSave,
}: {
  user: UserRow;
  stores: Store[];
  onClose: () => void;
  onSave: (storeIds: string[]) => Promise<void>;
}) {
  const isSales = user.role === "SALES";
  const [selected, setSelected] = useState<Set<string>>(
    new Set(user.storeAssignments.map((s) => s.id))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(Array.from(selected));
      onClose();
    } catch {
      setError("Không thể lưu. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(42,39,37,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--cream-card)",
        border: "1px solid var(--border)",
        width: "100%",
        maxWidth: "360px",
        boxShadow: "0 8px 48px rgba(42,39,37,.10)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--cream-dark)",
        }}>
          <div>
            <h2 style={{
              fontFamily: "var(--font-cormorant), Georgia, serif",
              fontSize: "17px", fontWeight: 400, color: "var(--ink)", margin: 0,
            }}>
              Gán cửa hàng
            </h2>
            <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: "2px 0 0" }}>
              {user.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: "4px" }}
          >
            <X style={{ width: "15px", height: "15px" }} />
          </button>
        </div>

        {/* Body — phân nhánh theo role */}
        {!isSales ? (
          /* Non-SALES: hiển thị thông báo "Tất cả cửa hàng", không cần chọn */
          <div style={{ padding: "20px" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "12px 14px",
              border: "1px solid var(--s-green)",
              background: "rgba(34,197,94,0.04)",
            }}>
              <span style={{
                fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
                color: "var(--s-green)", whiteSpace: "nowrap",
              }}>
                TẤT CẢ
              </span>
              <span style={{ fontSize: "12px", color: "var(--ink-body)" }}>
                Tất cả cửa hàng ({stores.length})
              </span>
              <span style={{
                marginLeft: "auto", fontSize: "9px", fontWeight: 700,
                letterSpacing: "0.1em", color: "var(--s-green)",
              }}>
                ✓
              </span>
            </div>
            <p style={{ fontSize: "10px", color: "var(--ink-muted)", margin: "10px 0 0", lineHeight: 1.5 }}>
              Vai trò <strong>{ROLE_LABELS[user.role]}</strong> tự động xem được tất cả cửa hàng.
              Không cần gán thủ công.
            </p>
          </div>
        ) : (
          /* SALES: danh sách checkbox như cũ */
          <>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {stores.length === 0 && (
                <p style={{ fontSize: "12px", color: "var(--ink-muted)", margin: 0 }}>Chưa có cửa hàng nào.</p>
              )}
              {stores.map((store) => {
                const checked = selected.has(store.id);
                return (
                  <label
                    key={store.id}
                    style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      padding: "8px 10px",
                      cursor: "pointer",
                      border: `1px solid ${checked ? "var(--s-blue)" : "var(--border)"}`,
                      background: checked ? "rgba(59,130,246,0.04)" : "transparent",
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(store.id)}
                      style={{ accentColor: "var(--s-blue)", width: "14px", height: "14px", cursor: "pointer" }}
                    />
                    <span style={{
                      fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
                      color: "var(--ink-muted)", minWidth: "34px",
                    }}>
                      {store.code}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--ink-body)", flex: 1 }}>
                      {store.name}
                    </span>
                    {checked && (
                      <span style={{
                        fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
                        textTransform: "uppercase", color: "var(--s-blue)",
                      }}>
                        ✓
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {/* Note chỉ hiện với SALES */}
            <div style={{ padding: "0 20px 12px" }}>
              <p style={{ fontSize: "10px", color: "var(--ink-muted)", margin: 0 }}>
                Chọn 0 store → Kinh doanh không thể xem đơn hàng nào
              </p>
            </div>
          </>
        )}

        {error && (
          <div style={{ margin: "0 20px 12px", padding: "8px 12px", border: "1px solid var(--s-red)", fontSize: "12px", color: "var(--s-red)" }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          background: "var(--cream-dark)",
        }}>
          {isSales ? (
            <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
              {selected.size} / {stores.length} đã chọn
            </span>
          ) : (
            <span style={{ fontSize: "11px", color: "var(--s-green)", fontWeight: 500 }}>
              Tất cả cửa hàng
            </span>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" onClick={onClose} className="psx-btn-secondary">
              {isSales ? "Hủy" : "Đóng"}
            </button>
            {isSales && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="psx-btn-primary"
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                {saving && <Loader2 style={{ width: "11px", height: "11px", animation: "spin 1s linear infinite" }} />}
                {saving ? "Đang lưu..." : "Lưu"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Single user row ──────────────────────────────────────────────────────────

function UserRowItem({
  user, stores, onSave, onSaveStores, onDelete,
}: {
  user: UserRow;
  stores: Store[];
  onSave: (id: string, patch: { role?: UserRole; storeId?: string | null; isActive?: boolean; email?: string }) => Promise<void>;
  onSaveStores: (id: string, storeIds: string[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  async function handleChange(patch: { role?: UserRole; storeId?: string | null; isActive?: boolean; email?: string }) {
    setSaveState("saving");
    try {
      await onSave(user.id, patch);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }

  async function handleSaveStores(storeIds: string[]) {
    setSaveState("saving");
    try {
      await onSaveStores(user.id, storeIds);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
      throw new Error("Save failed");
    }
  }

  const isPending = !user.image && new Date(user.createdAt) > new Date(Date.now() - 1000 * 60);

  return (
    <>
      {showStoreModal && (
        <StoreAssignModal
          user={user}
          stores={stores}
          onClose={() => setShowStoreModal(false)}
          onSave={handleSaveStores}
        />
      )}
      {showDeleteModal && (
        <ConfirmDeleteModal
          user={user}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => onDelete(user.id)}
        />
      )}
      {showEmailModal && (
        <ChangeEmailModal
          user={user}
          onClose={() => setShowEmailModal(false)}
          onConfirm={(email) => onSave(user.id, { email })}
        />
      )}
      <tr className="psx-tr" style={{ opacity: user.isActive ? 1 : 0.45 }}>
        {/* Avatar + Name/Email */}
        <td className="psx-td">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {user.image ? (
              <Image src={user.image} alt={user.name} width={30} height={30} style={{ borderRadius: "50%", flexShrink: 0 }} />
            ) : (
              <div style={{
                width: "30px", height: "30px", borderRadius: "50%",
                background: "var(--cream-dark)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-cormorant), Georgia, serif" }}>
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.name}
                </p>
                {isPending && (
                  <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--s-gold)", border: "1px solid var(--s-gold)", padding: "1px 5px" }}>
                    Chờ login
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0 }}>
                <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.email}
                </p>
                {/* Đổi email = đổi định danh đăng nhập → luôn qua hộp thoại xác nhận, không
                    bao giờ sửa trực tiếp trên dòng như role/trạng thái. */}
                <button
                  type="button"
                  onClick={() => setShowEmailModal(true)}
                  title="Đổi email đăng nhập"
                  style={{
                    flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                    padding: "1px 2px", color: "var(--ink-muted)", lineHeight: 0,
                  }}
                >
                  <Pencil style={{ width: "11px", height: "11px" }} />
                </button>
              </div>
            </div>
          </div>
        </td>

        {/* Role — dropdown tô màu theo role hiện tại, không cần badge riêng */}
        <td className="psx-td">
          <select
            value={user.role}
            onChange={(e) => handleChange({ role: e.target.value as UserRole })}
            disabled={saveState === "saving"}
            style={{
              ...selectStyle,
              color: ROLE_COLOR[user.role].color,
              borderColor: ROLE_COLOR[user.role].border,
              opacity: saveState === "saving" ? 0.5 : 1,
            }}
          >
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </td>

        {/* Store assignments — multi-store */}
        <td className="psx-td">
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
            {user.storeAssignments.length === 0 ? (
              <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>—</span>
            ) : (
              user.storeAssignments.map((s) => (
                <span
                  key={s.id}
                  className="psx-badge"
                  style={{ fontSize: "10px", color: "var(--s-blue)", borderColor: "var(--s-blue)" }}
                >
                  {s.code}
                </span>
              ))
            )}
            <button
              type="button"
              title="Chỉnh sửa cửa hàng"
              onClick={() => setShowStoreModal(true)}
              disabled={saveState === "saving"}
              style={{
                background: "none", border: "1px solid var(--border)",
                cursor: "pointer", padding: "2px 5px", color: "var(--ink-muted)",
                display: "flex", alignItems: "center",
                opacity: saveState === "saving" ? 0.4 : 1,
              }}
            >
              <Pencil style={{ width: "10px", height: "10px" }} />
            </button>
          </div>
        </td>

        {/* Active toggle + delete */}
        <td className="psx-td">
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              onClick={() => handleChange({ isActive: !user.isActive })}
              disabled={saveState === "saving"}
              className="psx-badge"
              style={{
                color: user.isActive ? "var(--s-green)" : "var(--ink-muted)",
                borderColor: user.isActive ? "var(--s-green)" : "var(--border)",
                background: "transparent",
                cursor: "pointer",
                opacity: saveState === "saving" ? 0.5 : 1,
              }}
            >
              {user.isActive ? "Active" : "Inactive"}
            </button>
            {/* Nút xóa — chỉ hiện khi user đang Inactive */}
            {!user.isActive && (
              <button
                type="button"
                title="Xóa khỏi hệ thống"
                onClick={() => setShowDeleteModal(true)}
                disabled={saveState === "saving"}
                style={{
                  background: "none",
                  border: "1px solid var(--s-red)",
                  cursor: "pointer",
                  padding: "2px 5px",
                  color: "var(--s-red)",
                  display: "flex", alignItems: "center",
                  opacity: saveState === "saving" ? 0.4 : 1,
                }}
              >
                <Trash2 style={{ width: "10px", height: "10px" }} />
              </button>
            )}
          </div>
        </td>

        {/* Save state */}
        <td className="psx-td" style={{ width: "60px", textAlign: "right" }}>
          {saveState === "saving" && <Loader2 style={{ width: "13px", height: "13px", color: "var(--ink-muted)", animation: "spin 1s linear infinite", marginLeft: "auto" }} />}
          {saveState === "saved"  && <span style={{ fontSize: "11px", color: "var(--s-green)" }}>Đã lưu</span>}
          {saveState === "error"  && <span style={{ fontSize: "11px", color: "var(--s-red)" }}>Lỗi</span>}
        </td>

        {/* Joined */}
        <td className="psx-td" style={{ fontSize: "11px", color: "var(--ink-muted)", whiteSpace: "nowrap" }}>
          {new Date(user.createdAt).toLocaleDateString("vi-VN")}
        </td>
      </tr>
    </>
  );
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────

function ConfirmDeleteModal({
  user,
  onClose,
  onConfirm,
}: {
  user: UserRow;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch {
      setError("Không thể xóa. Vui lòng thử lại.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(42,39,37,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--cream-card)",
        border: "1px solid var(--s-red)",
        width: "100%",
        maxWidth: "360px",
        boxShadow: "0 8px 48px rgba(42,39,37,.15)",
      }}>
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--cream-dark)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <h2 style={{
            fontFamily: "var(--font-cormorant), Georgia, serif",
            fontSize: "17px", fontWeight: 400, color: "var(--s-red)", margin: 0,
          }}>
            Xóa khỏi hệ thống
          </h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: "4px" }}>
            <X style={{ width: "15px", height: "15px" }} />
          </button>
        </div>

        <div style={{ padding: "20px" }}>
          <p style={{ fontSize: "13px", color: "var(--ink-body)", margin: "0 0 8px", lineHeight: 1.6 }}>
            Bạn sắp xóa tài khoản{" "}
            <strong style={{ color: "var(--ink)" }}>{user.name}</strong>{" "}
            (<span style={{ fontFamily: "monospace", fontSize: "12px" }}>{user.email}</span>).
          </p>
          <ul style={{ fontSize: "12px", color: "var(--ink-muted)", margin: "0 0 0 16px", padding: 0, lineHeight: 1.8 }}>
            <li>Tài khoản biến mất hoàn toàn khỏi hệ thống</li>
            <li>Lịch sử đơn hàng vẫn được giữ lại</li>
            <li>Hành động này <strong style={{ color: "var(--s-red)" }}>không thể hoàn tác</strong></li>
          </ul>
          {error && (
            <div style={{ marginTop: "12px", padding: "8px 12px", border: "1px solid var(--s-red)", fontSize: "12px", color: "var(--s-red)" }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          display: "flex", justifyContent: "flex-end", gap: "8px",
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          background: "var(--cream-dark)",
        }}>
          <button type="button" onClick={onClose} className="psx-btn-secondary">
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "6px 14px", fontSize: "12px", fontWeight: 500,
              background: "var(--s-red)", color: "#fff", border: "none", cursor: "pointer",
              opacity: deleting ? 0.6 : 1,
            }}
          >
            {deleting && <Loader2 style={{ width: "11px", height: "11px", animation: "spin 1s linear infinite" }} />}
            {deleting ? "Đang xóa..." : "Xóa tài khoản"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Change Email Modal ───────────────────────────────────────────────────────
// Đổi email = đổi ĐỊNH DANH ĐĂNG NHẬP (hệ thống dùng Google OAuth, callback signIn đối chiếu
// bằng email). Vì vậy luôn qua hộp thoại riêng có cảnh báo, không sửa trực tiếp trên dòng như
// role/trạng thái — đây là thao tác không được phép lỡ tay.

function ChangeEmailModal({
  user,
  onClose,
  onConfirm,
}: {
  user: UserRow;
  onClose: () => void;
  onConfirm: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState(user.email);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = email.trim().toLowerCase();
  const unchanged = normalized === user.email.trim().toLowerCase();

  async function handleConfirm() {
    if (unchanged) { onClose(); return; }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(normalized);
      onClose();
    } catch (err) {
      setError((err as Error).message || "Không thể đổi email. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(42,39,37,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--cream-card)",
        border: "1px solid var(--border)",
        width: "100%",
        maxWidth: "400px",
        boxShadow: "0 8px 48px rgba(42,39,37,.15)",
      }}>
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--cream-dark)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <h2 style={{
            fontFamily: "var(--font-cormorant), Georgia, serif",
            fontSize: "17px", fontWeight: 400, color: "var(--ink)", margin: 0,
          }}>
            Đổi email đăng nhập
          </h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: "4px" }}>
            <X style={{ width: "15px", height: "15px" }} />
          </button>
        </div>

        <div style={{ padding: "20px" }}>
          <p style={{ fontSize: "13px", color: "var(--ink-body)", margin: "0 0 12px", lineHeight: 1.6 }}>
            Tài khoản <strong style={{ color: "var(--ink)" }}>{user.name}</strong>
          </p>

          <label style={{
            display: "block", fontSize: "10px", fontWeight: 400,
            textTransform: "uppercase", letterSpacing: "0.14em",
            color: "var(--ink-muted)", marginBottom: "5px",
          }}>
            Email mới
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            className="psx-input"
            style={{ width: "100%", fontSize: "13px" }}
            autoFocus
          />

          <div style={{
            marginTop: "14px", padding: "10px 12px",
            background: "#fffbeb", border: "1px solid #fde68a",
            fontSize: "11.5px", color: "#92400e", lineHeight: 1.6,
          }}>
            <strong>Sau khi đổi:</strong>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              <li>Nhân viên phải đăng nhập bằng <strong>email mới</strong>.</li>
              <li>Tài khoản Google cũ <strong>mất quyền truy cập</strong>.</li>
              <li>Phiên đang đăng nhập vẫn chạy tới khi hết hạn — cần cắt ngay thì tắt rồi bật lại trạng thái hoạt động.</li>
              <li>Toàn bộ lịch sử thao tác của tài khoản được giữ nguyên.</li>
            </ul>
          </div>

          {error && (
            <div style={{ marginTop: "12px", padding: "8px 12px", border: "1px solid var(--s-red)", fontSize: "12px", color: "var(--s-red)" }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          display: "flex", justifyContent: "flex-end", gap: "8px",
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          background: "var(--cream-dark)",
        }}>
          <button type="button" onClick={onClose} className="psx-btn-secondary">
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || unchanged || !normalized}
            className="psx-btn-primary"
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              opacity: saving || unchanged || !normalized ? 0.55 : 1,
            }}
          >
            {saving && <Loader2 style={{ width: "11px", height: "11px", animation: "spin 1s linear infinite" }} />}
            {saving ? "Đang đổi..." : "Đổi email"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add User Modal ───────────────────────────────────────────────────────────

function AddUserModal({
  stores,
  onClose,
  onCreated,
}: {
  stores: Store[];
  onClose: () => void;
  onCreated: (user: UserRow) => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", role: "SALES" as UserRole });
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isSales = form.role === "SALES";

  function toggleStore(id: string) {
    setSelectedStores((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleRoleChange(role: UserRole) {
    setForm((f) => ({ ...f, role }));
    setSelectedStores(new Set()); // reset khi đổi role
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // Bước 1: Tạo user (không gửi storeId vì legacy field không có hiệu lực)
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          role: form.role,
          storeId: null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? json.message ?? "Không thể tạo user");
        return;
      }
      const created = json.data ?? json;

      // Bước 2: Gán cửa hàng vào UserStore (chỉ với SALES + có chọn cửa hàng)
      let assignedStores: Store[] = [];
      if (isSales && selectedStores.size > 0) {
        const storeRes = await fetch(`/api/users/${created.id}/stores`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeIds: Array.from(selectedStores) }),
        });
        if (storeRes.ok) {
          const storeJson = await storeRes.json();
          assignedStores = (storeJson.data ?? storeJson) as Store[];
        }
      }

      onCreated({ ...created, storeAssignments: assignedStores });
      onClose();
    } catch {
      setError("Lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border)",
    padding: "6px 0",
    fontSize: "13px",
    color: "var(--ink-body)",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "10px",
    fontWeight: 400,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: "var(--ink-muted)",
    marginBottom: "4px",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(42,39,37,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--cream-card)",
        border: "1px solid var(--border)",
        width: "100%",
        maxWidth: "440px",
        boxShadow: "0 8px 48px rgba(42,39,37,.10)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--cream-dark)",
        }}>
          <div>
            <h2 style={{
              fontFamily: "var(--font-cormorant), Georgia, serif",
              fontSize: "18px", fontWeight: 400, color: "var(--ink)", margin: 0,
            }}>
              Thêm User mới
            </h2>
            <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: "2px 0 0" }}>
              User sẽ tự đăng nhập bằng Google lần đầu
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: "4px" }}
          >
            <X style={{ width: "16px", height: "16px" }} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Tên */}
            <div>
              <label style={labelStyle}>Tên hiển thị *</label>
              <input
                type="text"
                required
                placeholder="Nguyễn Văn A"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={inputStyle}
                onFocus={e => (e.target.style.borderBottomColor = "var(--pink)")}
                onBlur={e => (e.target.style.borderBottomColor = "var(--border)")}
              />
            </div>

            {/* Email */}
            <div>
              <label style={labelStyle}>Email Google *</label>
              <input
                type="email"
                required
                placeholder="email@gmail.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                style={inputStyle}
                onFocus={e => (e.target.style.borderBottomColor = "var(--pink)")}
                onBlur={e => (e.target.style.borderBottomColor = "var(--border)")}
              />
              <p style={{ fontSize: "10px", color: "var(--ink-muted)", marginTop: "4px" }}>
                Phải trùng khớp với tài khoản Google họ sẽ dùng để đăng nhập
              </p>
            </div>

            {/* Role */}
            <div>
              <label style={labelStyle}>Role *</label>
              <select
                required
                value={form.role}
                onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                style={{ ...inputStyle, appearance: "auto", paddingLeft: "0" }}
                onFocus={e => (e.target.style.borderBottomColor = "var(--pink)")}
                onBlur={e => (e.target.style.borderBottomColor = "var(--border)")}
              >
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>

            {/* Cửa hàng — phân nhánh theo role */}
            <div>
              <label style={labelStyle}>
                {isSales ? "Cửa hàng được xem" : "Cửa hàng"}
              </label>

              {!isSales ? (
                /* Non-SALES: badge tất cả, chỉ đọc */
                <div style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "8px 12px",
                  border: "1px solid var(--s-green)",
                  background: "rgba(34,197,94,0.04)",
                  marginTop: "4px",
                }}>
                  <span style={{
                    fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--s-green)",
                  }}>
                    TẤT CẢ
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--ink-body)" }}>
                    Tất cả cửa hàng ({stores.length})
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: "9px", fontWeight: 700, color: "var(--s-green)" }}>
                    ✓
                  </span>
                </div>
              ) : (
                /* SALES: checkbox multi-select */
                <div style={{
                  border: "1px solid var(--border)",
                  maxHeight: "160px",
                  overflowY: "auto",
                  marginTop: "4px",
                }}>
                  {stores.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "var(--ink-muted)", margin: "10px 12px" }}>
                      Chưa có cửa hàng nào.
                    </p>
                  ) : (
                    stores.map((store) => {
                      const checked = selectedStores.has(store.id);
                      return (
                        <label
                          key={store.id}
                          style={{
                            display: "flex", alignItems: "center", gap: "10px",
                            padding: "7px 10px",
                            cursor: "pointer",
                            borderBottom: "1px solid var(--border)",
                            background: checked ? "rgba(59,130,246,0.04)" : "transparent",
                            userSelect: "none",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStore(store.id)}
                            style={{ accentColor: "var(--s-blue)", width: "13px", height: "13px", cursor: "pointer", flexShrink: 0 }}
                          />
                          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--ink-muted)", minWidth: "34px" }}>
                            {store.code}
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--ink-body)", flex: 1 }}>
                            {store.name}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              )}

              {isSales && (
                <p style={{ fontSize: "10px", color: "var(--ink-muted)", marginTop: "5px" }}>
                  {selectedStores.size === 0
                    ? "Chưa chọn — Kinh doanh sẽ không xem được đơn hàng nào"
                    : `${selectedStores.size} / ${stores.length} cửa hàng được chọn`}
                </p>
              )}
            </div>

            {/* Lưu ý */}
            <div style={{ padding: "10px 14px", background: "var(--cream-dark)", border: "1px solid var(--border)", fontSize: "11px", color: "var(--ink-muted)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--ink)", fontWeight: 600 }}>Lưu ý:</strong> User được tạo sẽ ở trạng thái{" "}
              <span style={{ color: "var(--s-gold)", fontWeight: 600 }}>Chờ login</span>.
              {isSales
                ? " Có thể gán thêm hoặc thay đổi cửa hàng sau khi tạo."
                : " Vai trò này tự động xem được tất cả cửa hàng."}
            </div>

            {error && (
              <div style={{ padding: "8px 12px", border: "1px solid var(--s-red)", fontSize: "12px", color: "var(--s-red)" }}>
                {error}
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--border)" }}>
            <button type="button" onClick={onClose} className="psx-btn-secondary">Hủy</button>
            <button
              type="submit"
              disabled={saving}
              className="psx-btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              {saving && <Loader2 style={{ width: "12px", height: "12px", animation: "spin 1s linear infinite" }} />}
              {saving ? "Đang tạo..." : "Tạo User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UsersClient({
  initialUsers,
  stores,
}: {
  initialUsers: UserRow[];
  stores: Store[];
}) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [showAdd, setShowAdd] = useState(false);
  const [, startTransition] = useTransition();

  async function handleSave(
    id: string,
    patch: { role?: UserRole; storeId?: string | null; isActive?: boolean; email?: string }
  ) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      // Giữ nguyên thông báo từ server (VD "Email này đã thuộc về tài khoản X") thay vì nuốt
      // thành lỗi chung — người dùng cần biết đích danh vì sao không đổi được.
      const err = await res.json().catch(() => null);
      throw new Error(err?.error?.message ?? "Save failed");
    }
    const json = await res.json();
    const updated: UserRow = { ...(json.data ?? json), storeAssignments: users.find(u => u.id === id)?.storeAssignments ?? [] };
    startTransition(() => {
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    });
  }

  async function handleSaveStores(userId: string, storeIds: string[]) {
    const res = await fetch(`/api/users/${userId}/stores`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeIds }),
    });
    if (!res.ok) throw new Error("Save stores failed");
    const json = await res.json();
    const newAssignments: Store[] = (json.data ?? json) as Store[];
    startTransition(() => {
      setUsers((prev) =>
        prev.map((u) => u.id === userId ? { ...u, storeAssignments: newAssignments } : u)
      );
    });
  }

  async function handleDelete(userId: string) {
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
    startTransition(() => {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    });
  }

  function handleCreated(newUser: UserRow) {
    startTransition(() => {
      setUsers((prev) => [newUser, ...prev]);
    });
  }

  const active   = users.filter((u) => u.isActive);
  const inactive = users.filter((u) => !u.isActive);

  return (
    <>
      {showAdd && (
        <AddUserModal
          stores={stores}
          onClose={() => setShowAdd(false)}
          onCreated={handleCreated}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Toolbar */}
        <div style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--cream-dark)",
        }}>
          <p style={{ fontSize: "12px", color: "var(--ink-muted)", margin: 0 }}>
            {active.length} active · {inactive.length} inactive
          </p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="psx-btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            + Thêm User
          </button>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
              <tr>
                <th className="psx-th" style={{ textAlign: "left" }}>Tài khoản</th>
                <th className="psx-th" style={{ textAlign: "left" }}>Role</th>
                <th className="psx-th" style={{ textAlign: "left" }}>Cửa hàng</th>
                <th className="psx-th" style={{ textAlign: "left" }}>Trạng thái</th>
                <th className="psx-th" />
                <th className="psx-th" style={{ textAlign: "left", whiteSpace: "nowrap" }}>Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {active.map((u) => (
                <UserRowItem key={u.id} user={u} stores={stores} onSave={handleSave} onSaveStores={handleSaveStores} onDelete={handleDelete} />
              ))}
              {inactive.length > 0 && (
                <>
                  <tr>
                    <td colSpan={6} style={{
                      padding: "8px 16px",
                      fontSize: "10px", fontWeight: 400, textTransform: "uppercase",
                      letterSpacing: "0.14em", color: "var(--ink-muted)",
                      background: "var(--cream-dark)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
                    }}>
                      Đã tắt ({inactive.length})
                    </td>
                  </tr>
                  {inactive.map((u) => (
                    <UserRowItem key={u.id} user={u} stores={stores} onSave={handleSave} onSaveStores={handleSaveStores} onDelete={handleDelete} />
                  ))}
                </>
              )}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "48px 16px", textAlign: "center", fontSize: "13px", color: "var(--ink-muted)" }}>
                    Chưa có user nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
// Ô ngày dùng chung — LUÔN dd/mm/yyyy. Ngày nghỉ đặt sai một tháng thì dời deadline KPI của cả
// phòng, nên đây không phải chỗ để người dùng phải tự dịch mm/dd trong đầu.
import { DateInput } from "@/app/dashboard/orders/_components/date-input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import type { UserRole } from "@/app/generated/prisma/client";

import {
  activeSessions, buildCalendarPayload, calendarToForm, createSessionDraft,
  validateCalendarForm,
  type CalendarFormState, type CalendarHolidayDraft, type CalendarSessionDraft,
} from "@/app/lib/business/kpi-3d/calendar-form";
import {
  CALENDAR_NOTE,
  DAY_OPTIONS,
  STANDARD_MINUTES_NOTE,
  diffKpi3DGroups,
  diffWorkingCalendar,
  minutesToHoursText,
  type Kpi3DGroupSnapshot,
  type WorkingCalendarSnapshot,
} from "@/app/lib/business/kpi-3d/config-changes";

// ─── Cấu hình KPI 3D (Nhóm KPI + Working Calendar) ───────────────────────────
//
// HAI MÀN NÀY SỬA THỨ QUYẾT ĐỊNH DEADLINE KPI CỦA MỌI LƯỢT GIAO VIỆC VỀ SAU. Bản trước cho
// sửa trực tiếp: mọi ô là <input> sống ngay khi trang tải xong, không có bước nào phân biệt
// "tôi đang đọc cấu hình" với "tôi đang sửa cấu hình". Một cú click lạc là số giờ KPI đổi.
//
// Nay theo khuôn XEM → CHỈNH SỬA → XÁC NHẬN:
//   1. Mặc định là chế độ XEM, giá trị hiện bằng CHỮ — không có ô nào để bấm nhầm vào.
//   2. Bấm "Chỉnh sửa" mới mở khoá, và có "Hủy" để hoàn tác (trước đây phải tải lại trang).
//   3. Bấm Lưu thì hiện DANH SÁCH THAY ĐỔI cụ thể, không phải "Bạn có chắc?" — một câu hỏi
//      không mang thông tin thì ai cũng bấm Đồng ý theo phản xạ.
//
// Danh sách thay đổi tính ở module thuần kpi-3d/config-changes.ts (có test).

type Kpi3DGroup = {
  id: string;
  code: string;
  name: string;
  standardMinutes: number;
  description: string | null;
  isActive: boolean;
};

type CalendarSession = {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  label: string | null;
  sortOrder: number;
};

type CalendarHoliday = {
  id: string;
  date: string;
  name: string;
};

type WorkingCalendar = {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  isActive: boolean;
  sessions: CalendarSession[];
  holidays: CalendarHoliday[];
};

const TH: React.CSSProperties = {
  padding: "9px 12px",
  fontSize: "10px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: "var(--ink-muted)",
  background: "var(--cream-dark, #f0ebe3)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
  textAlign: "left",
};

const TD: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "12px",
  borderBottom: "1px solid var(--border-light, #f0ede8)",
  verticalAlign: "middle",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: "32px",
  border: "1px solid var(--border)",
  background: "var(--cream)",
  color: "var(--ink)",
  padding: "0 9px",
  fontSize: "12px",
};

type FormMessage = {
  type: "success" | "error";
  text: string;
};

type CalendarView = "overview" | "sessions" | "holidays";

function createDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatApiError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Không thể tải dữ liệu cấu hình";
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message ?? json?.error ?? "Request failed";
    throw new Error(message);
  }
  return json as T;
}

/**
 * Trạng thái ở CHẾ ĐỘ XEM — chữ thường khi bình thường, chip khi bất thường.
 *
 * VÌ SAO KHÔNG DÙNG StatusPill Ở ĐÂY: gần như mọi nhóm đều đang dùng, nên sáu chip xanh viền
 * xanh xếp dọc là sáu lần nhấn mạnh một điều không có gì đáng nhấn. Thông tin thật nằm ở nhóm
 * bị TẠM ẨN — và giữa sáu chip giống nhau thì đúng cái ngoại lệ đó lại khó thấy nhất.
 *
 * Nay bình thường là chữ xám nhạt, ngoại lệ mới thành chip hổ phách. Chip vẫn giữ ở chế độ
 * CHỈNH SỬA (cạnh checkbox) vì lúc đó người dùng đang thao tác và cần phản hồi rõ ràng.
 */
function StatusText({ active }: { active: boolean }) {
  if (active) return <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>Đang dùng</span>;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600,
      background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a",
    }}>
      Tạm ẩn
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      height: 22,
      padding: "0 8px",
      border: `1px solid ${active ? "var(--s-green, #16a34a)" : "var(--border)"}`,
      color: active ? "var(--s-green, #16a34a)" : "var(--ink-muted)",
      fontSize: "11px",
      fontWeight: 600,
      background: active ? "rgba(22,163,74,0.05)" : "transparent",
    }}>
      {active ? "Đang dùng" : "Tạm ẩn"}
    </span>
  );
}

// ─── Hộp xác nhận kèm danh sách thay đổi ─────────────────────────────────────
//
// CỐ Ý KHÔNG PHẢI "Bạn có chắc?": câu hỏi chung chung không mang thông tin, nên người dùng
// bấm Đồng ý theo phản xạ và hộp xác nhận trở thành một cú click thừa chứ không phải một lớp
// bảo vệ. Liệt kê đích xác từng dòng sắp đổi mới cho họ cơ hội nhận ra thứ mình không định làm.
//
// Khuôn hình theo ConfirmDeleteModal ở màn Quản lý User để hai hộp xác nhận trong app trông
// cùng một họ.

function ConfirmChangesDialog({
  title,
  changes,
  note,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  changes: string[];
  note: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(42,39,37,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !pending) onCancel(); }}
    >
      <div style={{
        background: "var(--cream-card)",
        border: "1px solid var(--border)",
        width: "100%",
        maxWidth: 520,
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
            fontSize: 17, fontWeight: 400, color: "var(--ink)", margin: 0,
          }}>
            {title}
          </h2>
          <button type="button" onClick={onCancel} disabled={pending} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: 4 }}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <div style={{ padding: 20, maxHeight: "56vh", overflow: "auto" }}>
          <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: "0 0 10px" }}>
            {changes.length} thay đổi sắp được lưu:
          </p>
          <ul style={{ margin: "0 0 0 16px", padding: 0, fontSize: 13, color: "var(--ink-body)", lineHeight: 1.9 }}>
            {changes.map((change) => (
              <li key={change} style={{ overflowWrap: "anywhere" }}>{change}</li>
            ))}
          </ul>
          <div style={{ marginTop: 14, padding: "9px 12px", background: "var(--cream-dark)", fontSize: 11.5, color: "var(--ink-muted)", lineHeight: 1.6 }}>
            {note}
          </div>
        </div>

        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          background: "var(--cream-dark)",
        }}>
          <button type="button" onClick={onCancel} disabled={pending} className="psx-btn-secondary" style={{ height: 32, fontSize: 12 }}>
            Quay lại
          </button>
          <button type="button" onClick={onConfirm} disabled={pending} className="psx-btn-primary" style={{ height: 32, fontSize: 12, minWidth: 120 }}>
            {pending ? "Đang lưu..." : "Xác nhận lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Thanh tiêu đề chung cho cả hai panel: Chỉnh sửa / Hủy / Lưu + badge "Chưa lưu". */
function EditToolbar({
  canEdit,
  editing,
  dirty,
  pending,
  onStart,
  onCancel,
  onSave,
}: {
  canEdit: boolean;
  editing: boolean;
  dirty: boolean;
  pending: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (!canEdit) return null;

  if (!editing) {
    return (
      <button type="button" className="psx-btn-secondary" onClick={onStart} style={{ height: 32, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Pencil style={{ width: 13, height: 13 }} />
        Chỉnh sửa
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {dirty && (
        <span style={{ border: "1px solid var(--s-amber, #d97706)", color: "var(--s-amber, #d97706)", padding: "5px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
          Chưa lưu
        </span>
      )}
      <button type="button" className="psx-btn-secondary" onClick={onCancel} disabled={pending} style={{ height: 32, fontSize: 12 }}>
        Hủy
      </button>
      {/* Lưu mờ khi chưa đổi gì — bản trước nút Lưu LUÔN bật, nên bấm Lưu mà không sửa gì
          vẫn ghi vào DB. */}
      <button type="button" className="psx-btn-primary" onClick={onSave} disabled={pending || !dirty} style={{ height: 32, fontSize: 12, minWidth: 124 }}>
        Lưu thay đổi
      </button>
    </div>
  );
}

function MessageBox({ message }: { message: FormMessage }) {
  const color = message.type === "success" ? "var(--s-green, #16a34a)" : "var(--s-red, #dc2626)";
  return (
    <div style={{ border: `1px solid ${color}`, color, padding: 12, fontSize: 12 }}>
      {message.text}
    </div>
  );
}

// ─── Panel Nhóm KPI 3D ────────────────────────────────────────────────────────

type GroupDraft = { hours: string; isActive: boolean };

function draftsFromGroups(groups: readonly Kpi3DGroup[]): Record<string, GroupDraft> {
  return Object.fromEntries(groups.map((g) => [g.id, { hours: String(g.standardMinutes / 60), isActive: g.isActive }]));
}

function KpiGroupsPanel({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const groupsQuery = useQuery<{ data: Kpi3DGroup[] }>({
    queryKey: ["kpi-3d-groups"],
    queryFn: () => fetchJson("/api/admin/kpi-3d/groups?includeInactive=true"),
  });

  const bootstrap = useMutation({
    mutationFn: () => fetchJson("/api/admin/kpi-3d/bootstrap", { method: "POST" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["kpi-3d-groups"] }),
        queryClient.invalidateQueries({ queryKey: ["kpi-3d-calendars"] }),
      ]);
    },
  });

  const groups = groupsQuery.data?.data ?? [];
  const hasGroups = groups.length > 0;

  // MỘT state cho cả panel, không phải state riêng trong từng dòng.
  //
  // Bản trước mỗi dòng tự giữ `useState(String(group.standardMinutes / 60))` — useState chỉ
  // nhận giá trị LẦN ĐẦU, nên khi query refetch mang số mới về thì ô input vẫn giữ số cũ, mà
  // nút Lưu của dòng đó luôn bật. Người khác đổi Nhóm 3 thành 8 giờ, bạn bấm Lưu (dù không
  // sửa gì) là ghi 6 trở lại, xoá thay đổi của họ, không một lời cảnh báo.
  //
  // Nay nháp được nạp đúng lúc bấm "Chỉnh sửa", và danh sách thay đổi luôn so với dữ liệu
  // server MỚI NHẤT — nên nếu có ai vừa đổi gì, nó hiện ra thành một dòng bạn không định làm.
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, GroupDraft>>({});
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const before: Kpi3DGroupSnapshot[] = groups.map((g) => ({
    code: g.code, name: g.name, standardMinutes: g.standardMinutes, isActive: g.isActive,
  }));

  const invalidNames = groups
    .filter((g) => {
      const draft = drafts[g.id];
      if (!draft) return false;
      const hours = Number(draft.hours);
      return !Number.isFinite(hours) || hours < 0 || draft.hours.trim() === "";
    })
    .map((g) => g.name);

  const after: Kpi3DGroupSnapshot[] = groups.map((g) => {
    const draft = drafts[g.id];
    const hours = draft ? Number(draft.hours) : g.standardMinutes / 60;
    const valid = Number.isFinite(hours) && hours >= 0;
    return {
      code: g.code,
      name: g.name,
      standardMinutes: draft && valid ? Math.round(hours * 60) : g.standardMinutes,
      isActive: draft ? draft.isActive : g.isActive,
    };
  });

  const changes = editing ? diffKpi3DGroups(before, after) : [];

  function startEdit() {
    setDrafts(draftsFromGroups(groups));
    setMessage(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDrafts({});
    setMessage(null);
  }

  function patchDraft(id: string, patch: Partial<GroupDraft>) {
    setMessage(null);
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function requestSave() {
    if (invalidNames.length > 0) {
      setMessage({ type: "error", text: `Số giờ KPI không hợp lệ: ${invalidNames.join(", ")}` });
      return;
    }
    setConfirmOpen(true);
  }

  function commit() {
    startTransition(async () => {
      try {
        // Chỉ gửi nhóm THẬT SỰ đổi — gửi cả 6 nhóm thì 5 lần ghi vô nghĩa, và mỗi lần ghi là
        // một cơ hội ghi đè thay đổi của người khác.
        const changed = groups.filter((g, i) => (
          before[i].standardMinutes !== after[i].standardMinutes || before[i].isActive !== after[i].isActive
        ));

        for (const group of changed) {
          const next = after[groups.indexOf(group)];
          await fetchJson<{ data: Kpi3DGroup }>(`/api/admin/kpi-3d/groups/${group.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ standardMinutes: next.standardMinutes, isActive: next.isActive }),
          });
        }

        await queryClient.invalidateQueries({ queryKey: ["kpi-3d-groups"] });
        setConfirmOpen(false);
        setEditing(false);
        setDrafts({});
        setMessage({ type: "success", text: `Đã lưu ${changed.length} thay đổi cấu hình Nhóm KPI` });
      } catch (err) {
        setConfirmOpen(false);
        setMessage({ type: "error", text: formatApiError(err) });
      }
    });
  }

  return (
    /* GIỚI HẠN CHIỀU RỘNG Ở CẢ CỤM, không riêng cái bảng.
       Bản trước chỉ bó cái bảng lại 680px, còn hàng tiêu đề vẫn `space-between` trên toàn
       chiều rộng màn — nên nút "Chỉnh sửa" neo vào lề màn hình 1900px và nằm cách bảng gần
       600px. Nút trôi lơ lửng xa đúng thứ nó tác động, trông như đặt sai chỗ. Bó cả cụm thì
       nút tự nằm đúng mép phải của thẻ. */
    <section style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 620 }}>
      {/* ĐÃ BỎ tiêu đề <h2> "Nhóm KPI 3D": thẻ điều hướng ngay phía trên đã ghi đúng chữ đó,
          hai nhãn giống hệt nhau cách nhau 20px là một cái thừa. Giữ lại đúng câu mô tả —
          nó nói điều thẻ không nói.
          Câu mô tả cũng viết lại bằng tiếng Việt thường: bản trước dùng chữ "snapshot", thuật
          ngữ của người viết code chứ không phải của người dùng màn này. */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-muted)", maxWidth: 300 }}>
          Số giờ chuẩn để tính Deadline KPI của từng nhóm sản phẩm.
        </p>
        {/* KHÔNG còn nút "Bootstrap cấu hình" ở đây. Đó là hành động CÀI ĐẶT LẦN ĐẦU — nó
            upsert 6 nhóm mặc định và tạo lịch nếu chưa có. Khi đã có nhóm rồi thì bấm vào
            không đổi gì cả, nên để nó nằm thường trực chỉ tạo một nút mà người dùng không
            biết dùng để làm gì và không dám bấm. Nút đó giờ chỉ hiện khi màn chưa có nhóm. */}
        {hasGroups && (
          <EditToolbar
            canEdit={canEdit}
            editing={editing}
            dirty={changes.length > 0}
            pending={isPending}
            onStart={startEdit}
            onCancel={cancelEdit}
            onSave={requestSave}
          />
        )}
      </div>

      {groupsQuery.isError && (
        <MessageBox message={{ type: "error", text: `${formatApiError(groupsQuery.error)}. Nếu đây là staging mới, hãy chạy migration trước.` }} />
      )}
      {bootstrap.isError && <MessageBox message={{ type: "error", text: formatApiError(bootstrap.error) }} />}
      {message && <MessageBox message={message} />}

      <div style={{ border: "1px solid var(--border)", background: "var(--cream-card)", overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 420, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={TH}>Nhóm</th>
              <th style={{ ...TH, width: 130, textAlign: "right" }}>Số giờ KPI</th>
              <th style={{ ...TH, width: 130 }}>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {!hasGroups && !groupsQuery.isLoading && (
              <tr>
                <td colSpan={3} style={{ ...TD, padding: 28, textAlign: "center", color: "var(--ink-muted)" }}>
                  <div>Chưa có nhóm KPI nào.</div>
                  {canEdit && (
                    // Nhãn nói RÕ nút làm gì, thay cho chữ "Bootstrap". Đây là lần cài đặt đầu
                    // tiên, người bấm cần biết mình sắp tạo ra cái gì.
                    <button type="button" className="psx-btn-primary" onClick={() => bootstrap.mutate()} disabled={bootstrap.isPending} style={{ height: 30, fontSize: 12, marginTop: 10 }}>
                      {bootstrap.isPending ? "Đang tạo..." : "Tạo 6 nhóm KPI mặc định"}
                    </button>
                  )}
                </td>
              </tr>
            )}
            {groups.map((group) => {
              const draft = drafts[group.id];
              return (
                <tr key={group.id}>
                  {/* ĐÃ BỎ dòng mã "GROUP_1" dưới tên nhóm: đó là mã trong database, người
                      dùng màn này không tra cứu theo nó. Nó chỉ làm mỗi dòng cao gấp đôi và
                      thêm một cỡ chữ thứ ba vào bảng. */}
                  <td style={{ ...TD, fontWeight: 600, color: "var(--ink)" }}>{group.name}</td>
                  <td style={{ ...TD, textAlign: "right" }}>
                    {/* Chế độ xem hiện CHỮ, không phải ô input bị disabled: một ô xám vẫn mời
                        người ta bấm vào, còn chữ thì không. */}
                    {editing && draft ? (
                      <input
                        value={draft.hours}
                        onChange={(e) => patchDraft(group.id, { hours: e.target.value })}
                        style={{ ...inputStyle, maxWidth: 84, textAlign: "right" }}
                        inputMode="decimal"
                        aria-label={`Số giờ KPI ${group.name}`}
                      />
                    ) : (
                      <span style={{ color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                        {minutesToHoursText(group.standardMinutes)}
                      </span>
                    )}
                  </td>
                  <td style={TD}>
                    {editing && draft ? (
                      <label style={{ display: "inline-flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                        <input type="checkbox" checked={draft.isActive} onChange={(e) => patchDraft(group.id, { isActive: e.target.checked })} />
                        <StatusPill active={draft.isActive} />
                      </label>
                    ) : (
                      <StatusText active={group.isActive} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmOpen && (
        <ConfirmChangesDialog
          title="Xác nhận cấu hình Nhóm KPI"
          changes={changes}
          note={STANDARD_MINUTES_NOTE}
          pending={isPending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={commit}
        />
      )}
    </section>
  );
}

// ─── Panel Working Calendar ───────────────────────────────────────────────────

function WorkingCalendarEditor({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const calendarsQuery = useQuery<{ data: WorkingCalendar[] }>({
    queryKey: ["kpi-3d-calendars"],
    queryFn: () => fetchJson("/api/admin/kpi-3d/working-calendars?includeInactive=true"),
  });

  // Lấy trực tiếp trong useMemo: `?? []` tạo một mảng MỚI mỗi lần render, nên để nó làm
  // dependency thì useMemo tính lại liên tục — và ở đây `defaultCalendar` là dependency của
  // effect nạp form, nên nó sẽ nạp lại nháp và xoá thứ admin đang gõ.
  const defaultCalendar = useMemo(() => {
    const list = calendarsQuery.data?.data ?? [];
    return list.find((calendar) => calendar.isDefault) ?? list[0] ?? null;
  }, [calendarsQuery.data]);
  const [form, setForm] = useState<CalendarFormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>("overview");
  const [expandedDays, setExpandedDays] = useState<Set<number>>(() => new Set([1]));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const initializedCalendarIdRef = useRef<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!defaultCalendar || initializedCalendarIdRef.current === defaultCalendar.id) return;
    initializedCalendarIdRef.current = defaultCalendar.id;
    const nextForm = calendarToForm(defaultCalendar);
    const firstWorkingDay = DAY_OPTIONS.find((day) => (
      nextForm.sessions.some((session) => session.dayOfWeek === day.value)
    ))?.value ?? 1;
    const timeoutId = window.setTimeout(() => {
      setForm(nextForm);
      setMessage(null);
      setExpandedDays(new Set([firstWorkingDay]));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [defaultCalendar]);

  const editable = canEdit && editing;

  const sessionsByDay = useMemo(() => {
    const byDay = new Map<number, CalendarSessionDraft[]>();
    for (const day of DAY_OPTIONS) byDay.set(day.value, []);
    for (const session of form?.sessions ?? []) {
      byDay.get(session.dayOfWeek)?.push(session);
    }
    for (const sessions of byDay.values()) {
      sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return byDay;
  }, [form?.sessions]);

  const persistedForm = useMemo(
    () => defaultCalendar ? calendarToForm(defaultCalendar) : null,
    [defaultCalendar],
  );

  const changes = useMemo(() => {
    if (!editing || !form || !persistedForm) return [];
    return diffWorkingCalendar(
      buildCalendarPayload(persistedForm) as WorkingCalendarSnapshot,
      buildCalendarPayload(form) as WorkingCalendarSnapshot,
    );
  }, [editing, form, persistedForm]);

  const isDisabledDay = (day: number) => form?.disabledDays.includes(day) ?? false;
  /** Ngày có được tính KPI hay không — có ca VÀ không bị tắt. */
  const isWorkingDay = (day: number) => (sessionsByDay.get(day)?.length ?? 0) > 0 && !isDisabledDay(day);

  const calendarStats = useMemo(() => {
    const working = DAY_OPTIONS.filter((day) => isWorkingDay(day.value));
    const off = DAY_OPTIONS.filter((day) => !isWorkingDay(day.value));
    return {
      workingDayCount: working.length,
      offDayText: off.length > 0 ? off.map((day) => day.label).join(", ") : "Không có",
      sessionCount: form ? activeSessions(form).length : 0,
      holidayCount: form?.holidays.length ?? 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.holidays.length, form?.sessions, form?.disabledDays, sessionsByDay]);

  function patchForm(patch: Partial<CalendarFormState>) {
    setMessage(null);
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  function updateSession(draftId: string, patch: Partial<CalendarSessionDraft>) {
    setMessage(null);
    setForm((current) => current ? {
      ...current,
      sessions: current.sessions.map((session) => (
        session.draftId === draftId ? { ...session, ...patch } : session
      )),
    } : current);
  }

  function addSession(dayOfWeek: number) {
    setMessage(null);
    setForm((current) => current ? {
      ...current,
      // Thêm ca vào một ngày đang tắt thì hiển nhiên là muốn bật lại ngày đó.
      disabledDays: current.disabledDays.filter((day) => day !== dayOfWeek),
      sessions: [...current.sessions, createSessionDraft(dayOfWeek, current.sessions.length + 1, createDraftId())],
    } : current);
  }

  function removeSession(draftId: string) {
    setMessage(null);
    setForm((current) => current ? {
      ...current,
      sessions: current.sessions.filter((session) => session.draftId !== draftId),
    } : current);
  }

  /**
   * Bật/tắt một ngày làm việc — KHÔNG xoá ca.
   *
   * Bản trước tắt ngày là lọc bỏ toàn bộ session của ngày đó, và bật lại chỉ tạo một ca mặc
   * định 08:00–12:00. Nghĩa là một cú tick làm mất cả "Sáng / Chiều 1 / Chiều 2" và không có
   * đường lấy lại — control nguy hiểm nhất trên màn mà trông như một checkbox vô hại.
   */
  function toggleWorkingDay(dayOfWeek: number, enabled: boolean) {
    setMessage(null);
    setForm((current) => {
      if (!current) return current;
      if (!enabled) {
        return { ...current, disabledDays: [...new Set([...current.disabledDays, dayOfWeek])] };
      }
      const next = { ...current, disabledDays: current.disabledDays.filter((day) => day !== dayOfWeek) };
      // Chỉ tạo ca mặc định khi ngày đó THẬT SỰ chưa có ca nào được giữ.
      if (next.sessions.some((session) => session.dayOfWeek === dayOfWeek)) return next;
      return { ...next, sessions: [...next.sessions, createSessionDraft(dayOfWeek, next.sessions.length + 1, createDraftId())] };
    });
    if (enabled) setExpandedDays((current) => new Set(current).add(dayOfWeek));
  }

  function toggleDayPanel(dayOfWeek: number) {
    setExpandedDays((current) => {
      const next = new Set(current);
      if (next.has(dayOfWeek)) next.delete(dayOfWeek);
      else next.add(dayOfWeek);
      return next;
    });
  }

  function addHolidayDraft() {
    setMessage(null);
    setForm((current) => current ? {
      ...current,
      holidays: [...current.holidays, { draftId: createDraftId(), date: "", name: "" }],
    } : current);
  }

  function updateHoliday(draftId: string, patch: Partial<CalendarHolidayDraft>) {
    setMessage(null);
    setForm((current) => current ? {
      ...current,
      holidays: current.holidays.map((holiday) => (
        holiday.draftId === draftId ? { ...holiday, ...patch } : holiday
      )),
    } : current);
  }

  function removeHoliday(draftId: string) {
    setMessage(null);
    setForm((current) => current ? {
      ...current,
      holidays: current.holidays.filter((holiday) => holiday.draftId !== draftId),
    } : current);
  }

  function startEdit() {
    if (persistedForm) setForm(persistedForm);
    setMessage(null);
    setEditing(true);
  }

  function cancelEdit() {
    // Hoàn tác thật sự về bản đã lưu. Trước đây không có nút này: muốn bỏ thay đổi phải tải
    // lại trang, và phải kịp nhận ra là mình cần bỏ.
    if (persistedForm) setForm(persistedForm);
    setEditing(false);
    setMessage(null);
  }

  function requestSave() {
    if (!form) return;
    const validationError = validateCalendarForm(form);
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }
    setConfirmOpen(true);
  }

  function commit() {
    if (!form) return;
    startTransition(async () => {
      try {
        await fetchJson<{ data: WorkingCalendar }>(`/api/admin/kpi-3d/working-calendars/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildCalendarPayload(form)),
        });
        // Buộc nạp lại từ server: ca của ngày đã tắt không được gửi lên, nên nháp trong máy
        // không còn khớp thứ database đang giữ. Giữ nháp cũ sẽ hiện một lịch không tồn tại.
        initializedCalendarIdRef.current = null;
        await queryClient.invalidateQueries({ queryKey: ["kpi-3d-calendars"] });
        setConfirmOpen(false);
        setEditing(false);
        setMessage({ type: "success", text: `Đã lưu ${changes.length} thay đổi lịch làm việc` });
      } catch (err) {
        setConfirmOpen(false);
        setMessage({ type: "error", text: formatApiError(err) });
      }
    });
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ĐÃ BỎ tiêu đề <h2>: chữ "Lịch làm việc" từng xuất hiện BA lần trong cùng một màn —
          thẻ điều hướng, tiêu đề mục này, và tiêu đề thẻ tóm tắt bên dưới. Giữ lại đúng câu
          mô tả, nó nói điều mà không nhãn nào nói. */}
      <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-muted)" }}>
        Deadline KPI chỉ tính trong ca hợp lệ — không tính ngày nghỉ tuần, ngày lễ và giờ nghỉ giữa ca.
      </p>

      {calendarsQuery.isError && (
        <MessageBox message={{ type: "error", text: `${formatApiError(calendarsQuery.error)}. Nếu đây là staging mới, hãy chạy migration trước.` }} />
      )}

      {!form && !calendarsQuery.isLoading && (
        <div style={{ border: "1px solid var(--border)", background: "var(--cream-card)", padding: 18, color: "var(--ink-muted)", fontSize: 12 }}>
          Chưa có lịch làm việc. Sang thẻ “Nhóm KPI 3D” và bấm “Tạo 6 nhóm KPI mặc định” — lịch làm việc tiêu chuẩn sẽ được tạo cùng lúc.
        </div>
      )}

      {form && (
        <>
          <div style={{
            position: "sticky", top: 0, zIndex: 5,
            border: "1px solid var(--border)",
            background: "var(--cream-card)",
            padding: 14,
            boxShadow: "0 6px 14px rgba(0, 0, 0, 0.04)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                {/* Tên LỊCH CỤ THỂ làm tiêu đề, không lặp lại chữ "Lịch làm việc" — đây mới
                    là thông tin: đang xem lịch nào, múi giờ nào. */}
                <h3 style={{ margin: 0, fontSize: 14, color: "var(--ink)" }}>{form.name}</h3>
                <p style={{ margin: "3px 0 0", color: "var(--ink-muted)", fontSize: 11 }}>
                  {form.timezone}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                <StatusPill active={form.isActive} />
                {form.isDefault && (
                  <span style={{ border: "1px solid var(--border)", padding: "5px 9px", fontSize: 11, fontWeight: 700, color: "var(--ink-muted)", whiteSpace: "nowrap" }}>
                    Mặc định
                  </span>
                )}
                <EditToolbar
                  canEdit={canEdit}
                  editing={editing}
                  dirty={changes.length > 0}
                  pending={isPending}
                  onStart={startEdit}
                  onCancel={cancelEdit}
                  onSave={requestSave}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 12 }}>
              {[
                ["Ngày làm", `${calendarStats.workingDayCount}/7`],
                ["Ca mỗi tuần", `${calendarStats.sessionCount}`],
                ["Ngày nghỉ lễ", `${calendarStats.holidayCount}`],
                ["Ngày nghỉ tuần", calendarStats.offDayText],
              ].map(([label, value]) => (
                <div key={label} style={{ border: "1px solid var(--border-light, #f0ede8)", background: "var(--cream)", padding: "9px 10px", minHeight: 48 }}>
                  <div style={{ color: "var(--ink-muted)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                  <div style={{ marginTop: 4, color: "var(--ink)", fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {message && <MessageBox message={message} />}

          {editable && (
            <div style={{ border: "1px solid var(--border)", background: "var(--cream-card)", padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) minmax(180px, 240px) auto auto", gap: 10, alignItems: "end" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, color: "var(--ink-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                  Tên lịch
                  <input value={form.name} onChange={(e) => patchForm({ name: e.target.value })} style={inputStyle} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, color: "var(--ink-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                  Múi giờ
                  <input value={form.timezone} onChange={(e) => patchForm({ timezone: e.target.value })} style={inputStyle} />
                </label>
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--ink)", minHeight: 32, whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={form.isActive} onChange={(e) => patchForm({ isActive: e.target.checked })} />
                  Đang dùng
                </label>
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--ink)", minHeight: 32, whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={form.isDefault} onChange={(e) => patchForm({ isDefault: e.target.checked })} />
                  Mặc định
                </label>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([["overview", "Tổng quan tuần"], ["sessions", "Chỉnh ca"], ["holidays", "Ngày nghỉ"]] as const).map(([view, label]) => (
              <button
                key={view}
                type="button"
                className={calendarView === view ? "psx-btn-primary" : "psx-btn-secondary"}
                onClick={() => setCalendarView(view)}
                style={{ height: 32, fontSize: 12, minWidth: 128 }}
              >
                {label}
              </button>
            ))}
          </div>

          {calendarView === "overview" && (
            <div style={{ border: "1px solid var(--border)", background: "var(--cream-card)", padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: 13, color: "var(--ink)" }}>Tổng quan tuần</h3>
                <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>Deadline KPI chỉ tính các khung giờ đang hiển thị.</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                {DAY_OPTIONS.map((day) => {
                  const daySessions = sessionsByDay.get(day.value) ?? [];
                  const working = isWorkingDay(day.value);
                  return (
                    <div key={day.value} style={{
                      border: "1px solid var(--border)",
                      background: working ? "var(--cream)" : "var(--cream-dark, #f0ebe3)",
                      padding: 12,
                      minHeight: 128,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 10 }}>
                        <strong style={{ fontSize: 13, color: "var(--ink)" }}>{day.label}</strong>
                        <span style={{
                          border: "1px solid var(--border)",
                          color: working ? "var(--ink)" : "var(--ink-muted)",
                          padding: "3px 7px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
                        }}>
                          {working ? `${daySessions.length} ca` : "Nghỉ"}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {!working ? (
                          <>
                            <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>Không tính KPI</span>
                            {/* Nói rõ ca vẫn còn: không nói thì admin tưởng đã mất và đi nhập lại. */}
                            {daySessions.length > 0 && (
                              <span style={{ color: "var(--s-amber, #d97706)", fontSize: 11 }}>
                                Còn giữ {daySessions.length} ca — bật lại là dùng được
                              </span>
                            )}
                          </>
                        ) : daySessions.map((session) => (
                          <div key={session.draftId} style={{ border: "1px solid var(--border-light, #f0ede8)", padding: "7px 8px", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", minHeight: 34 }}>
                            <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--ink)", whiteSpace: "nowrap" }}>{session.startTime} - {session.endTime}</span>
                            <span style={{ fontSize: 11, color: "var(--ink-muted)", textAlign: "right", overflowWrap: "anywhere" }}>{session.label || "Ca"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {calendarView === "sessions" && (
            <div style={{ border: "1px solid var(--border)", background: "var(--cream-card)", padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: 13, color: "var(--ink)" }}>Ca làm việc</h3>
                <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>{calendarStats.sessionCount} ca trong tuần</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {DAY_OPTIONS.map((day) => {
                  const daySessions = sessionsByDay.get(day.value) ?? [];
                  const working = isWorkingDay(day.value);
                  const isExpanded = expandedDays.has(day.value);
                  return (
                    <div key={day.value} style={{ border: "1px solid var(--border)", background: "var(--cream)", overflow: "hidden" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) auto auto", gap: 8, alignItems: "center", padding: 10, borderBottom: isExpanded ? "1px solid var(--border-light, #f0ede8)" : "none" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 32, fontSize: 13, fontWeight: 700, color: "var(--ink)", cursor: editable ? "pointer" : "default" }}>
                          <input type="checkbox" checked={working} onChange={(e) => toggleWorkingDay(day.value, e.target.checked)} disabled={!editable} />
                          {day.label}
                          <span style={{ color: "var(--ink-muted)", fontSize: 11, fontWeight: 500 }}>
                            {working ? `${daySessions.length} ca` : daySessions.length > 0 ? `Nghỉ · còn giữ ${daySessions.length} ca` : "Nghỉ"}
                          </span>
                        </label>
                        {editable ? (
                          <button
                            type="button"
                            className="psx-btn-secondary"
                            onClick={() => addSession(day.value)}
                            title={`Thêm ca ${day.label}`}
                            style={{ height: 30, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}
                          >
                            <Plus style={{ width: 14, height: 14 }} />
                            Thêm ca
                          </button>
                        ) : <span />}
                        <button
                          type="button"
                          className="psx-btn-secondary"
                          onClick={() => toggleDayPanel(day.value)}
                          aria-label={isExpanded ? `Thu gọn ${day.label}` : `Mở chi tiết ${day.label}`}
                          style={{ width: 32, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                        >
                          <ChevronDown style={{ width: 15, height: 15, transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 120ms ease" }} />
                        </button>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: 10 }}>
                          {daySessions.length === 0 ? (
                            <div style={{ color: "var(--ink-muted)", fontSize: 12, padding: "8px 0" }}>Ngày này đang nghỉ, deadline KPI sẽ bỏ qua toàn bộ ngày.</div>
                          ) : (
                            <div style={{ border: "1px solid var(--border-light, #f0ede8)", overflowX: "auto", background: "var(--cream-card)", opacity: working ? 1 : 0.55 }}>
                              <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", tableLayout: "fixed" }}>
                                <thead>
                                  <tr>
                                    <th style={{ ...TH, width: 56 }}>Ca</th>
                                    <th style={{ ...TH, width: 120 }}>Bắt đầu</th>
                                    <th style={{ ...TH, width: 120 }}>Kết thúc</th>
                                    <th style={TH}>Tên ca</th>
                                    {editable && <th style={{ ...TH, width: 72, textAlign: "right" }}>Xóa</th>}
                                  </tr>
                                </thead>
                                <tbody>
                                  {daySessions.map((session, sessionIndex) => (
                                    <tr key={session.draftId}>
                                      <td style={{ ...TD, color: "var(--ink-muted)" }}>{sessionIndex + 1}</td>
                                      {editable ? (
                                        <>
                                          <td style={TD}>
                                            <input
                                              value={session.startTime}
                                              onChange={(e) => updateSession(session.draftId, { startTime: e.target.value })}
                                              placeholder="HH:mm"
                                              inputMode="numeric"
                                              maxLength={5}
                                              aria-label={`Giờ bắt đầu ca ${sessionIndex + 1} ${day.label}`}
                                              style={{ ...inputStyle, maxWidth: 96, textAlign: "center", fontFamily: "monospace" }}
                                            />
                                          </td>
                                          <td style={TD}>
                                            <input
                                              value={session.endTime}
                                              onChange={(e) => updateSession(session.draftId, { endTime: e.target.value })}
                                              placeholder="HH:mm"
                                              inputMode="numeric"
                                              maxLength={5}
                                              aria-label={`Giờ kết thúc ca ${sessionIndex + 1} ${day.label}`}
                                              style={{ ...inputStyle, maxWidth: 96, textAlign: "center", fontFamily: "monospace" }}
                                            />
                                          </td>
                                          <td style={TD}>
                                            <input
                                              value={session.label}
                                              onChange={(e) => updateSession(session.draftId, { label: e.target.value })}
                                              placeholder="Tên ca"
                                              aria-label={`Tên ca ${sessionIndex + 1} ${day.label}`}
                                              style={inputStyle}
                                            />
                                          </td>
                                          <td style={{ ...TD, textAlign: "right" }}>
                                            <button
                                              type="button"
                                              className="psx-btn-secondary"
                                              onClick={() => removeSession(session.draftId)}
                                              aria-label={`Xóa ca ${sessionIndex + 1} ${day.label}`}
                                              style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                                            >
                                              <Trash2 style={{ width: 14, height: 14 }} />
                                            </button>
                                          </td>
                                        </>
                                      ) : (
                                        <>
                                          <td style={{ ...TD, fontFamily: "monospace", color: "var(--ink)" }}>{session.startTime}</td>
                                          <td style={{ ...TD, fontFamily: "monospace", color: "var(--ink)" }}>{session.endTime}</td>
                                          <td style={TD}>{session.label || <span style={{ color: "var(--ink-muted)" }}>—</span>}</td>
                                        </>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {calendarView === "holidays" && (
            <div style={{ border: "1px solid var(--border)", background: "var(--cream-card)", padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: 13, color: "var(--ink)" }}>Ngày nghỉ Lễ/Tết</h3>
                {editable && (
                  <button type="button" className="psx-btn-secondary" onClick={addHolidayDraft} style={{ height: 30, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                    <Plus style={{ width: 14, height: 14 }} />
                    Thêm ngày nghỉ
                  </button>
                )}
              </div>
              {form.holidays.length === 0 ? (
                <div style={{ border: "1px dashed var(--border)", padding: 18, color: "var(--ink-muted)", fontSize: 12 }}>
                  Chưa có ngày nghỉ. Thêm ngày nghỉ để deadline KPI tự bỏ qua ngày đó.
                </div>
              ) : (
                <div style={{ border: "1px solid var(--border)", overflowX: "auto", background: "var(--cream)" }}>
                  <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 170 }}>Ngày</th>
                        <th style={TH}>Tên ngày nghỉ</th>
                        {editable && <th style={{ ...TH, width: 100, textAlign: "right" }}>Thao tác</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {form.holidays.map((holiday) => (
                        <tr key={holiday.draftId}>
                          {editable ? (
                            <>
                              <td style={TD}>
                                <DateInput value={holiday.date} onChange={(v) => updateHoliday(holiday.draftId, { date: v })} style={inputStyle} />
                              </td>
                              <td style={TD}>
                                <input value={holiday.name} onChange={(e) => updateHoliday(holiday.draftId, { name: e.target.value })} placeholder="Tên ngày nghỉ" style={inputStyle} aria-label="Tên ngày nghỉ" />
                              </td>
                              <td style={{ ...TD, textAlign: "right" }}>
                                <button
                                  type="button"
                                  className="psx-btn-secondary"
                                  onClick={() => removeHoliday(holiday.draftId)}
                                  aria-label="Xóa ngày nghỉ"
                                  style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                                >
                                  <Trash2 style={{ width: 14, height: 14 }} />
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ ...TD, fontFamily: "monospace", color: "var(--ink)" }}>{holiday.date || "—"}</td>
                              <td style={TD}>{holiday.name || <span style={{ color: "var(--ink-muted)" }}>—</span>}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {confirmOpen && (
            <ConfirmChangesDialog
              title="Xác nhận lịch làm việc"
              changes={changes}
              note={CALENDAR_NOTE}
              pending={isPending}
              onCancel={() => setConfirmOpen(false)}
              onConfirm={commit}
            />
          )}
        </>
      )}
    </section>
  );
}

export function Kpi3DConfigClient({ currentUserRole }: { currentUserRole: UserRole }) {
  const [activePanel, setActivePanel] = useState<"groups" | "calendar">("groups");
  const canEdit = currentUserRole === "ADMIN";

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setActivePanel("groups")}
            className={activePanel === "groups" ? "psx-btn-primary" : "psx-btn-secondary"}
            style={{ height: 32, fontSize: 12 }}
          >
            Nhóm KPI 3D
          </button>
          <button
            type="button"
            onClick={() => setActivePanel("calendar")}
            className={activePanel === "calendar" ? "psx-btn-primary" : "psx-btn-secondary"}
            style={{ height: 32, fontSize: 12 }}
          >
            {/* "Working Calendar" là tên bảng trong database, không phải tên người dùng gọi
                nó. Cùng loại vấn đề với chữ "Bootstrap": chữ của người viết code lọt ra mặt
                người dùng. */}
            Lịch làm việc
          </button>
        </div>
        {!canEdit && (
          <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
            Chỉ admin được chỉnh cấu hình.
          </span>
        )}
      </div>

      {activePanel === "groups" ? <KpiGroupsPanel canEdit={canEdit} /> : <WorkingCalendarEditor canEdit={canEdit} />}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { MomentFields } from "./moment-fields";
import { SubLabel } from "./panel-atoms";
import { formatVnDateTime, vnWallToInstant } from "@/app/lib/utils/vn-date";
// Hậu tố phiên bản hiện bằng "_" — cùng khuôn với bảng Việc thiết kế ngay bên cạnh.
import { formatVersionedDisplay } from "@/app/lib/business/order-helpers";
import { RefreshCw } from "lucide-react";

import {
  formatMinutes,
  OVERTIME_STATUS_LABELS,
  type OvertimeStatus,
} from "@/app/lib/business/kpi-3d/overtime";

// Khai báo & duyệt giờ làm thêm (yêu cầu #8).
// Tách hẳn khỏi phần tiến độ/KPI để nhìn là biết ngay: tăng ca KHÔNG ảnh hưởng Deadline KPI.

type OvertimeRow = {
  id: string;
  startAt: string;
  endAt: string;
  minutes: number;
  reason: string | null;
  status: OvertimeStatus;
  approvedAt: string | null;
  designer3D: { id: string; name: string; code: string } | null;
  requestedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  assignment: {
    id: string;
    order: { id: string; orderNumber: string } | null;
    orderItem: { id: string; moNumber: string | null; productName: string | null } | null;
  } | null;
};

type AssignmentOption = {
  id: string;
  orderItem: { moNumber: string | null; productName: string | null } | null;
  order: { orderNumber: string } | null;
};

// Định dạng mốc thời gian dùng HÀM CHUNG, không tự khai `Intl.DateTimeFormat` ở đây nữa.
//
// Bản trước file này có một `dtf` riêng với `timeZone: "Asia/Ho_Chi_Minh"`. Nó KHÔNG SAI — tôi đã
// chạy so, hai bên cho ra chuỗi giống hệt ("06:26 13/08/2026"). Nhưng giống nhau do trùng hợp chứ
// không do cấu trúc: sửa `formatVnDateTime` một cái là màn này lặng lẽ ở lại định dạng cũ, và
// người dùng thấy hai kiểu ngày trong cùng một hệ thống mà không có gì báo lỗi.
const fmt = (iso: string) => formatVnDateTime(iso);

const STATUS_COLOR: Record<OvertimeStatus, string> = {
  PENDING: "#b45309",
  APPROVED: "#15803d",
  REJECTED: "#b91c1c",
  CANCELLED: "#6b7280",
};

export function OvertimePanel({ canApprove }: { canApprove: boolean }) {
  const queryClient = useQueryClient();

  // ─── HAI useQuery, KHÔNG một hàm load() tự viết ─────────────────────────────
  //
  // Bản trước dùng `useState` + `useCallback` + `useEffect(() => { void load(); })`. Eslint chặn
  // đúng (`react-hooks/set-state-in-effect`), và cảnh báo đó đang chỉ vào một chuyện lớn hơn một
  // dòng code: file này TỰ FETCH BẰNG TAY trong khi cả dự án dùng react-query — chính nó đã
  // `import { useQueryClient }` để invalidate, tức nửa dùng khuôn nửa không.
  //
  // Đổi sang useQuery bỏ được năm thứ một lượt: hai `useState` cho dữ liệu server (dữ liệu server
  // KHÔNG phải state của component), `loading`, `error`, và cả cặp useCallback + useEffect.
  //
  // ⚠️ VÀ TÁCH THÀNH HAI QUERY, không phải một. Bản cũ để hai `fetch` trong CÙNG một
  // `Promise.all` không có `.catch()` riêng — `Promise.all` THẤT BẠI THEO CỤM, nên endpoint
  // assignments lỗi là kéo chết luôn danh sách tăng ca, thứ mà người ta mở tab này để xem.
  // Hai query thì danh sách tăng ca vẫn hiện dù ô chọn đơn không nạp được.
  const otQuery = useQuery<{ data: OvertimeRow[] }>({
    queryKey: ["design-3d-overtime"],
    queryFn: async () => {
      const res = await fetch("/api/design-3d/overtime?limit=100", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Không tải được danh sách tăng ca");
      return json;
    },
  });

  // Chỉ để đổ vào ô chọn của form khai báo. Lỗi ở đây KHÔNG được làm trắng cả tab, nên nó không
  // tham gia vào nhánh `error` bên dưới — ô chọn rỗng, phần còn lại vẫn dùng được.
  const asgQuery = useQuery<{ data: AssignmentOption[] }>({
    queryKey: ["design-3d-overtime-assignment-options"],
    queryFn: async () => {
      const res = await fetch("/api/design-3d/assignments?limit=100", { cache: "no-store" });
      if (!res.ok) throw new Error("Không tải được danh sách lượt giao việc");
      return res.json();
    },
  });

  const rows = otQuery.data?.data ?? [];
  const assignments = asgQuery.data?.data ?? [];
  const loading = otQuery.isPending;
  const error = otQuery.error ? (otQuery.error as Error).message : null;

  /** Nạp lại cả hai. Trả Promise để chỗ gọi `await` được, đúng như `load()` cũ. */
  const reload = async () => {
    await Promise.all([
      otQuery.refetch(),
      // Ô chọn hỏng không được làm cú làm mới thất bại — cùng lý do đã tách hai query.
      asgQuery.refetch().catch(() => undefined),
    ]);
  };

  const decide = async (id: string, action: "APPROVE" | "REJECT" | "CANCEL") => {
    try {
      const res = await fetch(`/api/design-3d/overtime/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Thao tác thất bại");
      toast.success(
        action === "APPROVE" ? "Đã duyệt tăng ca" : action === "REJECT" ? "Đã từ chối" : "Đã hủy yêu cầu",
      );
      await reload();
      // Huy hiệu trên nhãn tab lấy số từ heartbeat 20 giây. Không giục nó ở đây thì vừa duyệt
      // xong con số vẫn đứng nguyên tới 20 giây — người dùng sẽ tưởng thao tác chưa ăn và bấm lại.
      void queryClient.invalidateQueries({ queryKey: ["design-3d-assignments-meta"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading) {
    return <div style={{ padding: "24px", fontSize: "13px", color: "var(--ink-muted)" }}>Đang tải…</div>;
  }

  if (error) {
    return (
      <div style={{ padding: "24px" }}>
        <div style={{ padding: "12px 14px", borderRadius: "6px", fontSize: "13px", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ fontSize: "11px", color: "var(--ink-muted)", background: "var(--cream-dark)", padding: "8px 12px", borderRadius: "5px" }}>
        Giờ làm thêm chỉ dùng để ghi nhận và tính lương tăng ca — <strong>không ảnh hưởng tới Deadline KPI</strong>.
        Mọi khai báo phải được Leader/Giám sát phê duyệt.
      </div>

      <DeclareForm assignments={assignments} onSaved={reload} />

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <span style={{ fontSize: "12px", color: "var(--ink-muted)" }}>{rows.length} yêu cầu</span>
          <button
            type="button"
            onClick={() => void reload()}
            className="psx-btn-secondary"
            style={{ marginLeft: "auto", height: "28px", fontSize: "11px", display: "flex", alignItems: "center", gap: "5px" }}
          >
            <RefreshCw className="w-3 h-3" /> Tải lại
          </button>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: "28px", textAlign: "center", fontSize: "13px", color: "var(--ink-muted)" }}>
            Chưa có khai báo tăng ca nào.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {rows.map((r) => (
              <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: "6px", background: "var(--cream-card)", padding: "10px 12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr 0.8fr 1fr auto", gap: "12px", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 700 }}>
                      {formatVersionedDisplay(r.assignment?.orderItem?.moNumber ?? r.assignment?.order?.orderNumber) || "—"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--ink-muted)" }}>{r.designer3D?.name ?? "—"}</div>
                  </div>

                  <div style={{ fontSize: "12px" }}>
                    {fmt(r.startAt)} → {fmt(r.endAt)}
                  </div>

                  <div style={{ fontSize: "13px", fontWeight: 600 }}>{formatMinutes(r.minutes)}</div>

                  <div>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: STATUS_COLOR[r.status] }}>
                      {OVERTIME_STATUS_LABELS[r.status]}
                    </span>
                    {r.approvedBy && (
                      <div style={{ fontSize: "10px", color: "var(--ink-muted)" }}>bởi {r.approvedBy.name}</div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    {r.status === "PENDING" && canApprove && (
                      <>
                        <button type="button" onClick={() => void decide(r.id, "APPROVE")} className="psx-btn-primary" style={{ height: "28px", fontSize: "11px", padding: "0 10px" }}>Duyệt</button>
                        <button type="button" onClick={() => void decide(r.id, "REJECT")} className="psx-btn-secondary" style={{ height: "28px", fontSize: "11px", padding: "0 10px" }}>Từ chối</button>
                      </>
                    )}
                    {r.status === "PENDING" && !canApprove && (
                      <button type="button" onClick={() => void decide(r.id, "CANCEL")} className="psx-btn-secondary" style={{ height: "28px", fontSize: "11px", padding: "0 10px" }}>Hủy</button>
                    )}
                  </div>
                </div>

                {r.reason && (
                  <div style={{ fontSize: "11px", color: "var(--ink-muted)", marginTop: "6px" }}>Lý do: {r.reason}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeclareForm({ assignments, onSaved }: { assignments: AssignmentOption[]; onSaved: () => Promise<void> }) {
  const [assignmentId, setAssignmentId] = useState("");
  // ─── CẶP Ô NGÀY + GIỜ, KHÔNG PHẢI `datetime-local` ────────────────────────
  //
  // Đây từng là màn DUY NHẤT trong app còn dùng `<input type="datetime-local">`; màn Việc thiết kế
  // 3D đã cố ý tách đôi từ lâu. Tách đôi được hai thứ:
  //
  //   · Dùng lại `vnWallToInstant` — hàm đọc giờ tường VN đã có, thay vì tự nối chuỗi "+07:00".
  //     Bản trước nối tay `${start}:00+07:00`: đúng hôm nay, nhưng là bản thứ hai của cùng một
  //     quy tắc, và nó vỡ ngay nếu ai thêm `step` (ô trả thêm giây → "09:10:30:00+07:00").
  //   · Cùng một thao tác với mọi form khác trong app.
  const [startYmd, setStartYmd] = useState("");
  const [startHm, setStartHm] = useState("");
  const [endYmd, setEndYmd] = useState("");
  const [endHm, setEndHm] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const startAt = vnWallToInstant(startYmd, startHm);
  const endAt = vnWallToInstant(endYmd, endHm);

  const submit = async () => {
    if (!assignmentId || !startAt || !endAt) {
      toast.error("Chọn đơn và nhập đủ ngày giờ bắt đầu / kết thúc");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/design-3d/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `toISOString()` ra chuỗi có hậu tố Z — mốc TUYỆT ĐỐI, không còn chỗ nào để hiểu nhầm.
        // Múi giờ đã được `vnWallToInstant` xử lý xong ở trên, đúng một lần.
        body: JSON.stringify({
          assignmentId,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          reason: reason.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Khai báo thất bại");

      toast.success("Đã gửi khai báo tăng ca — chờ Leader duyệt");
      if (json?.data?.warning) toast.warning(json.data.warning, { duration: 10000 });
      setStartYmd(""); setStartHm(""); setEndYmd(""); setEndHm(""); setReason("");
      await onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "12px", background: "var(--cream-card)", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ fontSize: "10px", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Khai báo giờ làm thêm
      </div>

      <div>
        <SubLabel>Đơn hàng</SubLabel>
        <select value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)} className="psx-input" style={{ width: "100%", fontSize: "13px" }}>
          <option value="">— Chọn đơn —</option>
          {assignments.map((a) => (
            <option key={a.id} value={a.id}>
              {formatVersionedDisplay(a.orderItem?.moNumber ?? a.order?.orderNumber) || a.id}
              {a.orderItem?.productName ? ` · ${a.orderItem.productName}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <MomentFields label="Bắt đầu" ymd={startYmd} hm={startHm} onYmd={setStartYmd} onHm={setStartHm} />
        <MomentFields label="Kết thúc" ymd={endYmd} hm={endHm} onYmd={setEndYmd} onHm={setEndHm} />
      </div>

      {/* TỔNG GIỜ, tính ngay tại chỗ. Đây là con số dùng TÍNH LƯƠNG nên người khai phải thấy nó
          TRƯỚC khi bấm gửi — không phải sau khi khai xong rồi đọc lại trong danh sách. Server vẫn
          tính lại từ hai mốc và KHÔNG nhận số này từ client. */}
      {startAt && endAt && (
        <div style={{ fontSize: "11px", color: endAt > startAt ? "var(--ink-body)" : "#b91c1c" }}>
          {endAt > startAt
            ? `Tổng: ${formatMinutes(Math.round((endAt.getTime() - startAt.getTime()) / 60_000))}`
            : "Giờ kết thúc phải sau giờ bắt đầu"}
        </div>
      )}

      <div>
        <SubLabel>Lý do (tùy chọn)</SubLabel>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Gấp đơn khách" className="psx-input" style={{ width: "100%", fontSize: "13px" }} />
      </div>

      <button type="button" onClick={() => void submit()} disabled={saving} className="psx-btn-primary" style={{ alignSelf: "flex-start", height: "32px", fontSize: "12px" }}>
        {saving ? "Đang gửi…" : "Gửi khai báo"}
      </button>
    </div>
  );
}

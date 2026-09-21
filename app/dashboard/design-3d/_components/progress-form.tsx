"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  COMPLETION_STATUS,
  deniedReasonForSendResult,
  MANUAL_PROGRESS_STATUSES,
  PROGRESS_STATUS_LABELS,
  type Design3DProgressStatus,
} from "@/app/lib/business/kpi-3d/progress";
import { DESIGN_REQUEST_OPTIONS } from "@/app/lib/business/kpi-3d/design-request";
import { Label, SubLabel } from "./panel-atoms";
import type { Assignment, ProgressLog, SavedAssignment } from "./types";

// ─── Form cập nhật tiến độ / nộp kết quả của NV Thiết kế 3D ───────────────────
//
// Tách khỏi design-3d-client.tsx (3.259 dòng, trần dự án là 300) theo một đường nối THẬT: cả ba
// khối dưới đây chỉ nói về một việc — NV 3D ghi một dòng tiến độ, và có thể chốt lượt bằng
// "Đã gửi kết quả". Không khối nào ở đây quan tâm tới bảng danh sách, bộ lọc, hay thống kê.
//
// ⚠️ ĐÂY LÀ MỘT NHÁT CẮT ĐÚNG, KHÔNG PHẢI NHÁT CẮT CUỐI. File cha vẫn còn ~3.000 dòng và vẫn xa
// trần. Đừng đọc file này như bằng chứng vấn đề kích thước đã xong.

/**
 * State + hành động của form cập nhật tiến độ, TÁCH KHỎI phần hiển thị.
 *
 * VÌ SAO TÁCH: hai nút của NV 3D ("Lưu cập nhật", "Hoàn tất & gửi kết quả") nay nằm ở THANH HÀNH
 * ĐỘNG dưới đáy panel, còn các ô nhập vẫn ở trong dòng cuộn. Hai chỗ khác nhau trong DOM thì
 * không thể cùng nằm trong một component — nên state đi lên panel, và cả hai chỗ đọc từ đây.
 *
 * Trước đây hai nút bị ngăn bởi một đường kẻ + một câu chữ ngay giữa chúng. Ý định là hạ bậc nút
 * không-quay-lại-được, nhưng cái giá là hai nút của CÙNG một người, CÙNG một lúc bị đẩy xa nhau.
 * Thứ bậc nay thể hiện bằng MÀU (một đầy, một viền) — đúng cách để hạ bậc mà không đày nó ra xa.
 */
export function useProgressForm({
  assignmentId,
  latest,
  designRequest,
  onSaved,
}: {
  assignmentId: string;
  /** Dòng cập nhật gần nhất — mồi sẵn trạng thái và link render, để NV xem lại thấy đúng cái đã lưu. */
  latest: ProgressLog | null;
  /**
   * "Yêu cầu thiết kế" Đặt đơn đã ghi — chỉ để HIỆN RA cho NV đối chiếu, không phải để sửa.
   *
   * Có nó thì câu hỏi trở thành "thực tế có khác cái này không", trả lời được bằng một cái nhìn.
   * Không có nó thì NV phải tự nhớ Đặt đơn yêu cầu gì, và phần lớn sẽ bỏ qua ô.
   */
  designRequest: string | null;
  /** Nhận NGUYÊN số của server để vá lên màn — đồng bộ, không await. */
  onSaved: (patch: Partial<Assignment>, log: ProgressLog) => void;
}) {
  // Mồi bằng trạng thái cũ, nhưng KHÔNG mồi bằng SENT_RESULT: nó không còn nằm trong ô thả
  // xuống, để lại là chọn một giá trị không có trong danh sách.
  const [status, setStatus] = useState<Design3DProgressStatus>(
    latest?.status && latest.status !== COMPLETION_STATUS ? latest.status : "IN_PROGRESS",
  );
  const [percent, setPercent] = useState("");
  const [url, setUrl] = useState(latest?.renderInfoUrl ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // ─── Gửi kết quả: một chiều, nên có bước xác nhận riêng ─────────────────────
  //
  // "Đã gửi kết quả" đóng dấu completedAt và chốt luôn phán quyết Đúng hạn / Trễ hạn vào KPI,
  // MỘT LẦN và vĩnh viễn. Bấm nhầm không thêm một dòng vô hại — nó quyết định KPI.
  const [confirmSend, setConfirmSend] = useState(false);
  const [ackNoFile, setAckNoFile] = useState(false);

  // ─── NV báo lại thực tế đã làm ──────────────────────────────────────────────
  //
  // ⚠️ KHỞI TẠO RỖNG, CỐ Ý KHÔNG mồi bằng `designRequest`. Mồi sẵn thì `null` gửi lên server sẽ
  // KHÔNG còn phân biệt được "NV xác nhận đúng yêu cầu" với "NV không chạm vào ô" — hai chuyện
  // rất khác nhau khi về sau đọc số liệu. Rỗng = không báo gì, một nghĩa duy nhất.
  const [reportedRequest, setReportedRequest] = useState("");

  const hasRenderLink = url.trim() !== "";
  const sendBlocked = deniedReasonForSendResult({
    hasRenderLink,
    acknowledgedMissingFile: ackNoFile,
  });

  const submit = async (override?: Design3DProgressStatus) => {
    const sendStatus = override ?? status;
    setSaving(true);
    try {
      const res = await fetch(`/api/design-3d/assignments/${assignmentId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: sendStatus,
          progressPercent: percent.trim() === "" ? null : Number(percent),
          renderInfoUrl: url.trim() || null,
          note: note.trim() || null,
          reportedDesignRequest: reportedRequest || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Lưu thất bại");

      // Route trả về { log, assignment } đã ghi — chính là thứ cần để vá màn hình ngay.
      const saved = json?.data as { log: ProgressLog; assignment: SavedAssignment } | undefined;

      toast.success(
        sendStatus === COMPLETION_STATUS
          ? "Đã ghi nhận kết quả — hệ thống đã đóng dấu giờ hoàn tất"
          : "Đã lưu cập nhật tiến độ",
      );
      // % tiến độ và ghi chú mang tính "lần này" nên xóa trắng lại; trạng thái và link giữ
      // nguyên giá trị vừa lưu để NV xem lại thấy đúng cái vừa gửi, không phải ô trống.
      setPercent(""); setNote("");
      setConfirmSend(false); setAckNoFile(false); setReportedRequest("");

      if (saved) {
        const s = saved.assignment;
        onSaved(
          {
            status: s.status,
            completedAt: s.completedAt,
            acknowledgedAt: s.acknowledgedAt,
            kpiStatus: s.kpiStatus,
            kpiDeltaMinutes: s.kpiDeltaMinutes,
            reviewStatus: s.reviewStatus,
            // Nộp kết quả khi đang bị gác thì server TỰ ĐÓNG khoảng dừng (xem route progress).
            // Không mang mảng này về là chip "Tạm dừng" còn nguyên trên một việc đã xong.
            pauses: s.pauses,
            // Cùng luật với server: link mới nhất KHÁC RỖNG mới thay, dòng ghi chú không kèm
            // link thì giữ link cũ. Suy khác đi là bảng và panel nói hai điều về một MO.
            ...(saved.log.renderInfoUrl ? { latestRenderInfoUrl: saved.log.renderInfoUrl } : {}),
            // CÙNG LUẬT: chỉ thay khi dòng vừa ghi THẬT SỰ có báo cáo. Dòng cập nhật không kèm
            // báo cáo mà ghi đè null thì huy hiệu lệch biến mất khỏi màn dù server vẫn giữ nó.
            ...(saved.log.reportedDesignRequest
              ? { latestReportedDesignRequest: saved.log.reportedDesignRequest }
              : {}),
          },
          saved.log,
        );
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return {
    status, setStatus, percent, setPercent, url, setUrl, note, setNote,
    saving, confirmSend, setConfirmSend, ackNoFile, setAckNoFile,
    hasRenderLink, sendBlocked, submit,
    designRequest, reportedRequest, setReportedRequest,
  };
}

export type ProgressFormState = ReturnType<typeof useProgressForm>;

/**
 * CÁC Ô NHẬP của form cập nhật — nằm trong dòng cuộn; hai cái nút thì ở thanh hành động đáy
 * panel. Xem chú thích ở useProgressForm về việc vì sao state phải đi lên panel.
 */
export function ProgressFields({ f }: { f: ProgressFormState }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <Label>Thêm dòng cập nhật</Label>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr", gap: "10px" }}>
        <div>
          <SubLabel>Trạng thái mới</SubLabel>
          <select
            value={f.status}
            onChange={(e) => f.setStatus(e.target.value as Design3DProgressStatus)}
            className="psx-input"
            style={{ width: "100%", fontSize: "13px" }}
          >
            {/* CHỈ hai giá trị — "Đã gửi kết quả" đi qua nút riêng có bước xác nhận. Để nó ở
                đây thì người dùng bấm ô thả xuống là bỏ qua được lớp bảo vệ, và lớp đó thành
                trang trí. Xem MANUAL_PROGRESS_STATUSES ở kpi-3d/progress.ts. */}
            {MANUAL_PROGRESS_STATUSES.map((v) => (
              <option key={v} value={v}>{PROGRESS_STATUS_LABELS[v]}</option>
            ))}
          </select>
        </div>
        <div>
          <SubLabel>% tiến độ</SubLabel>
          {/* Ô CHỌN, không phải ô gõ. `min`/`max` trên <input type="number"> chỉ dùng cho
              validation form — nó KHÔNG chặn gõ, nên người dùng nhập được "12121" rồi bấm Lưu
              mới bị server từ chối (schema chặn 0–100). Giao diện mời họ điền một giá trị hệ
              thống sẽ chối.
              Bước 10%: % tiến độ là con số nhân viên TỰ ƯỚC, không ai thật sự muốn nói 37%.
              Mười một lựa chọn phủ đủ, và giá trị sai trở thành KHÔNG THỂ nhập thay vì bị kiểm
              sau. */}
          <select
            value={f.percent}
            onChange={(e) => f.setPercent(e.target.value)}
            className="psx-input"
            style={{ width: "100%", fontSize: "13px" }}
          >
            <option value="">—</option>
            {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => (
              <option key={v} value={String(v)}>{v}%</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <SubLabel>File Render / Info (link Share Drive)</SubLabel>
        <input
          type="url"
          value={f.url}
          onChange={(e) => f.setUrl(e.target.value)}
          placeholder="https://drive.google.com/..."
          className="psx-input"
          style={{ width: "100%", fontSize: "13px" }}
        />
      </div>

      <div>
        <SubLabel>Ghi chú (tùy chọn)</SubLabel>
        <input
          type="text"
          value={f.note}
          onChange={(e) => f.setNote(e.target.value)}
          className="psx-input"
          style={{ width: "100%", fontSize: "13px" }}
        />
      </div>
    </div>
  );
}

/** Bước xác nhận gửi kết quả — mount trong thanh hành động, ngay trên hai cái nút. */
export function ProgressConfirmSheet({ f }: { f: ProgressFormState }) {
  return (
        <div style={{
          border: "1px solid #fcd34d", background: "#fffbeb", borderRadius: "6px",
          padding: "12px", display: "flex", flexDirection: "column", gap: "8px",
        }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>
            Gửi kết quả cho MO này?
          </div>

          {/* Nói ĐÚNG hai hệ quả, không nói chung chung "bạn có chắc không". Câu đầu là lý do
              thật để dừng lại nghĩ: nó chốt KPI. */}
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--ink-body)", lineHeight: 1.6 }}>
            {/* 🔴 CÂU NÀY KHÔNG ĐƯỢC CẮT NGẮN, dù cả sheet đang được rút gọn. Nó là chướng
                ngại DUY NHẤT trước một hành động vĩnh viễn quyết định KPI của một người. Nó dài
                vì nó cần dài — cắt là đổi chữ lấy rủi ro thật.

                Gạch đầu dòng thứ hai ("Đơn chuyển sang chờ Đặt đơn / Quản lý duyệt") ĐÃ BỎ: đó là
                chuyện đương nhiên và không có hậu quả nào, nên nó chỉ làm loãng câu ở trên. */}
            <li>Hệ thống chốt giờ hoàn tất và kết quả Đúng hạn / Trễ hạn — <strong>không sửa lại được</strong>.</li>
          </ul>

          {/* ─── BÁO LẠI THỰC TẾ ĐÃ LÀM ─────────────────────────────────────────
              Đặt ở ĐÂY, không ở ProgressFields: khối ô nhập kia dùng cho MỌI dòng cập nhật
              (đang làm / chờ thông tin), còn câu hỏi này chỉ có nghĩa lúc CHỐT lượt. Để nó
              trên đó là mời người ta trả lời một câu chưa tới lúc hỏi, mỗi lần ghi tiến độ. */}
          <div style={{ borderTop: "1px dashed #fcd34d", paddingTop: "8px" }}>
            <SubLabel>
              Đặt đơn yêu cầu:{" "}
              <strong style={{ color: "var(--ink)" }}>{f.designRequest ?? "— chưa ghi"}</strong>
            </SubLabel>
            <select
              value={f.reportedRequest}
              onChange={(e) => f.setReportedRequest(e.target.value)}
              className="psx-input"
              style={{ width: "100%", fontSize: "13px" }}
            >
              {/* Mục đầu là MẶC ĐỊNH và nói rõ hệ quả của việc không chọn gì, thay vì một dấu
                  "—" không nghĩa. Không chọn thì gửi luôn — ô này tùy chọn. */}
              <option value="">Đúng như yêu cầu — không cần báo</option>
              {DESIGN_REQUEST_OPTIONS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            {/* Chỉ hiện khi THẬT SỰ lệch. Hiện cả lúc trùng thì dòng cảnh báo mất giá trị báo
                động, và NV học cách bỏ qua nó. */}
            {f.reportedRequest && f.reportedRequest !== f.designRequest ? (
              // "Đặt đơn và Quản lý sẽ thấy phần này lệch" ĐÃ BỎ: người dùng vừa CHỦ ĐỘNG
              // chọn một giá trị khác, nên việc nó được ai xem là điều hiển nhiên. Phần còn lại
              // thì GIỮ — "giờ KPI không đổi" là thứ NV không suy ra được, và không nói ra thì
              // họ có lý do để không dám báo.
              <div style={{ fontSize: "11px", color: "#92400e", marginTop: "4px" }}>
                <strong>Giờ KPI không đổi.</strong>
              </div>
            ) : null}
          </div>

          {f.hasRenderLink ? (
            <div style={{ fontSize: "12px", color: "var(--s-green, #16a34a)", fontWeight: 600 }}>
              Đã có File Render trong ô phía trên.
            </div>
          ) : (
            // Bấm một nút dễ hơn chọn ô thả xuống, nên nó cũng làm việc "gửi mà chưa có file"
            // dễ hơn — và đó là một ngõ cụt thật: người duyệt bấm Nhận mà hệ thống không có gì
            // để đẩy về File 3D của MO. Ô tích là chướng ngại đủ để dừng lại, không phải chặn
            // cứng (có ca thật cần gửi trước, nộp file sau).
            <label style={{ display: "flex", gap: "6px", alignItems: "flex-start", fontSize: "12px", color: "#92400e", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={f.ackNoFile}
                onChange={(e) => f.setAckNoFile(e.target.checked)}
                style={{ marginTop: "2px" }}
              />
              {/* Rút từ ba câu còn một. GIỮ đủ hai thứ: nói RÕ đang thiếu gì, và biến ô tích
                  thành một lời cam kết ("nộp file sau") chứ không phải một ô tích cho qua. */}
              <span>
                <strong>Chưa có File Render.</strong> Gửi trước, nộp file sau.
              </span>
            </label>
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => void f.submit(COMPLETION_STATUS)}
              disabled={f.saving || !!f.sendBlocked}
              className="psx-btn-primary"
              style={{ height: "32px", fontSize: "12px", opacity: f.saving || f.sendBlocked ? 0.5 : 1 }}
            >
              {f.saving ? "Đang gửi…" : "Xác nhận gửi kết quả"}
            </button>
            <button
              type="button"
              onClick={() => { f.setConfirmSend(false); f.setAckNoFile(false); }}
              disabled={f.saving}
              className="psx-btn-secondary"
              style={{ height: "32px", fontSize: "12px" }}
            >
              Huỷ
            </button>
          </div>
        </div>
  );
}

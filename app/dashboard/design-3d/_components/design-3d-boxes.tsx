"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { calculate3DKpiDeadline } from "@/app/lib/business/kpi-3d-deadline";
import { configuredCalendarToWorkingCalendar } from "@/app/lib/business/kpi-3d/calendar-adapter";
import {
  designRequestMismatchLabel,
  type DesignRequestMismatch,
} from "@/app/lib/business/kpi-3d/design-request";
import { hoursBudgetLabel, pauseWarnings } from "@/app/lib/business/kpi-3d/pause-view";
import { fetchJson, jsonBody } from "@/app/lib/utils/fetch-json";
import { formatVnDateTime, toVnHm, toVnYmd, vnWallToInstant } from "@/app/lib/utils/vn-date";

import { DateInput, todayVnYmd } from "../../orders/_components/date-input";
import { SubLabel } from "./panel-atoms";
import { TimeInput } from "../../orders/_components/time-input";
import {
  fmtDateTime, fmtHours,
  type ConfiguredCalendar, type Designer3DOption, type Kpi3DGroupOption,
} from "./design-3d-atoms";
import type { Assignment } from "./types";

// Ba hộp thao tác của panel "Việc thiết kế 3D": tạm dừng, nộp/duyệt kết quả, và thông báo
// khi lượt đã chuyển sang người khác. Tách khỏi design-3d-client.tsx — cả ba đã có prop
// interface riêng từ trước, nên đây là chuyển nhà chứ không đổi hành vi.

/**
 * Khối TẠM DỪNG / MỞ LẠI — chỉ Admin/Order thấy.
 *
 * VÌ SAO KHÔNG CHO NV 3D: tạm dừng vừa trừ giờ thực tế vừa dời deadline. Cho người ĐƯỢC CHẤM
 * ĐIỂM tự bấm thì KPI hết nghĩa — chỉ cần bấm dừng mỗi khi rời bàn là mọi đơn đều đúng hạn.
 * Server chặn bằng PAUSE_ASSIGNMENT; ở đây ẩn nút để không mời người ta làm việc sẽ bị chối.
 *
 * LÝ DO BẮT BUỘC khi dừng: cuối tháng đối chiếu KPI phải trả lời được vì sao đơn này được trừ
 * giờ. Nút Lưu khoá cho tới khi có chữ — chặn ở đây thay vì để server trả lỗi sau khi bấm.
 */
/** "2026-08-31" → "tháng 08/2026". Nhãn tháng KPI, viết ra chữ để không ai phải tự suy. */
function monthLabelOf(ymd: string): string {
  const [y, m] = ymd.split("-");
  return y && m ? `tháng ${m}/${y}` : "—";
}

/**
 * Khối TẠM DỪNG / MỞ LẠI — chỉ Admin/Order thấy.
 *
 * VÌ SAO KHÔNG CHO NV 3D: tạm dừng vừa trừ giờ thực tế vừa dời deadline. Cho người ĐƯỢC CHẤM
 * ĐIỂM tự bấm thì KPI hết nghĩa — chỉ cần bấm dừng mỗi khi rời bàn là mọi đơn đều đúng hạn.
 * Server chặn bằng PAUSE_ASSIGNMENT; ở đây ẩn nút để không mời người ta làm việc sẽ bị chối.
 *
 * CHỈ MOUNT KHI ĐANG MỞ — không còn nút bấm bên trong, và không còn trạng thái đóng/mở.
 *
 * VÌ SAO ĐỔI: trước đây component tự giữ `formOpen`, nên khi đóng nó vẫn chiếm một dải trong
 * dòng cuộn chỉ để đặt một cái nút. Nặng hơn: form tiến độ của NV 3D và form tạm dừng có thể MỞ
 * CÙNG LÚC — hai chỗ nhập liệu cho hai vai khác nhau bày ra một lúc. Nay panel giữ đúng MỘT
 * `sheet` đang mở, và các nút bấm nằm ở thanh hành động dưới đáy.
 *
 * Mount-khi-mở còn bỏ luôn được `useEffect` khởi tạo ngày/giờ: `useState(() => …)` chạy đúng một
 * lần lúc mount, không cần đồng bộ theo prop và không đụng luật cấm setState trong effect.
 *
 * MỐC THỜI GIAN SỬA ĐƯỢC, không chỉ để xem. `pausedAt` quyết định giờ công chốt vào KPI THÁNG
 * NÀO (kpi-3d/hours-ledger.ts): quản lý quên gác đơn ngày 31/8 rồi bấm ngày 02/9 thì 20 giờ
 * của tháng 8 chạy sang tháng 9. `resumedAt` cũng vậy — nó là mốc bắt đầu đoạn làm việc tiếp
 * theo, và nó quyết định deadline được dời bao nhiêu.
 *
 * Và khối này NÓI RA tháng sẽ được ghi nhận, không để người dùng tự suy từ ngày.
 */
export function PauseBox({
  assignmentId,
  standardMinutes,
  hasRenderLink,
  creditedMinutes,
  onClose,
  onSaved,
}: {
  assignmentId: string;
  // `mode` ĐÃ BỎ: chỉ còn một chế độ. Giữ một union hai giá trị mà một nhánh không bao giờ
  // chạy tới là mời người sau viết thêm code cho nhánh chết.
  //
  // `openPause`, `currentDesignerId`, `currentGroupId` cũng bỏ theo — cả ba chỉ phục vụ form
  // mở lại (điền sẵn người/nhóm cũ, và chặn mốc mở lại không được sớm hơn mốc dừng).
  /** Ngân sách KPI của lượt — để đối chiếu với số giờ sắp chốt. */
  standardMinutes: number | null;
  /** Lúc dừng đã có ảnh render chưa. Chỉ CẢNH BÁO, không chặn — xem pauseChecks. */
  hasRenderLink: boolean;
  /** Giờ đã chốt cho lượt này — trừ khỏi ngân sách để gợi ý phần còn lại khi mở lại. */
  creditedMinutes: number;
  /** Đóng sheet — panel giữ trạng thái, component này không tự đóng mình. */
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Toàn bộ state của luồng MỞ LẠI đã xoá cùng nhánh JSX ở dưới: mốc mở lại, người/nhóm kế
  // tiếp, ngân sách giờ còn lại, ba lần nạp danh mục (nhân viên / nhóm KPI / lịch làm việc),
  // và bản xem trước deadline.
  //
  // Đáng chú ý: khối này còn kéo theo BA request mỗi lần sheet mount. Chúng phục vụ một màn
  // hình không còn ai mở được — tức ba lần gọi mạng cho hư không, nếu để lại.
  // ─── Giờ đã làm, chốt tại thời điểm dừng ────────────────────────────────────
  //
  // Người gác đơn thường CHƯA BIẾT ngày nào mở lại, nên đây là mốc chốt sổ KPI của tháng này.
  // Không có nó thì giờ công dồn hết về tháng đơn hoàn tất và tháng này của nhân viên trống
  // trơn (xem kpi-3d/hours-ledger.ts).
  //
  // Số do SERVER đo, không tính ở trình duyệt: phép đo cần lịch làm việc và toàn bộ lịch sử
  // dừng. Và con số hiện ra đây chính là con số server dùng khi ô để trống — cùng một endpoint,
  // nên không thể lệch nhau.
  const [hoursText, setHoursText] = useState("");
  // Khởi tạo `true` ngay từ đầu: sheet chỉ mount khi mở, nên "đang tính…" là trạng thái đúng ở
  // render đầu tiên. Không cần setState trong effect (luật react-hooks/set-state-in-effect).
  const [loadingHours, setLoadingHours] = useState(true);

  useEffect(() => {
    let alive = true;
    void fetchJson<{ suggestedMinutes: number }>(`/api/design-3d/assignments/${assignmentId}/pause`)
      .then((res) => {
        if (!alive) return;
        setHoursText(String(Math.round((res.suggestedMinutes / 60) * 100) / 100));
      })
      .catch(() => {
        // Không chặn việc gác đơn vì không đo được giờ: để trống thì server tự đo lúc ghi.
        if (alive) toast.error("Không lấy được số giờ đề xuất — để trống thì hệ thống tự tính.");
      })
      .finally(() => { if (alive) setLoadingHours(false); });
    return () => { alive = false; };
  }, [assignmentId]);

  // `hoursText` nay CHỈ đến từ server (GET .../pause), người dùng không gõ được nữa.
  //
  // Hai chốt cũ — `hoursInvalid` và `hoursBelowCredited` — đã bỏ. Chúng gác một con số mà người
  // bấm nút không còn tác động được, nên nếu chúng chạy thì hậu quả là nút Tạm dừng bị khoá và
  // KHÔNG có cách nào mở, chỉ vì hai phép đo của chính hệ thống lệch nhau. Sàn cộng dồn nay do
  // server kẹp bằng Math.max ngay tại chỗ ghi — nơi duy nhất biết đủ để xử lý.
  const hoursValue = hoursText.trim() === "" ? null : Number(hoursText);

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setSaving(true);
    try {
      await fn();
      toast.success(okMsg);
      setReason("");
      setHoursText("");
      onClose();
      await onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const CARD: React.CSSProperties = {
    width: "100%", border: "1px solid var(--border)", background: "var(--cream-card)",
    borderRadius: "6px", padding: "12px",
    display: "flex", flexDirection: "column", gap: "10px",
  };

  // ─── MỞ LẠI ─────────────────────────────────────────────────────────────────
  // Nhánh "MỞ LẠI VIỆC" ĐÃ XOÁ (~170 dòng).
  //
  // Nút mở ra nó đã bỏ ở 1e8c701: tạm dừng là CHỐT SỐ, coi như lượt đã xong, và việc giao
  // tiếp phải về đúng MỘT chỗ — sidebar tab Thiết kế → "+ Giao lượt tiếp theo", nút đó gọi
  // thẳng /continue. Từ lúc ấy `sheet` không còn nhận giá trị "RESUME" nên khối này không có
  // cửa nào mở ra được.
  //
  // Xoá thay vì để lại: một nhánh chết vẫn đọc như một tính năng đang chạy, và người sửa sau
  // sẽ cập nhật nó cho "nhất quán" — tốn công cho thứ không ai thấy, rồi tưởng đã có hai
  // đường giao việc trong khi chủ đích là chỉ còn một.

  // ─── TẠM DỪNG ───────────────────────────────────────────────────────────────

  // Chỉ còn MỘT điều kiện: có lý do. Mốc dừng luôn là bây giờ nên không còn gì để dựng sai.
  //
  // Chốt "dựng được mốc" cũ đã bỏ cùng ô ngày/giờ. Nó gác đúng một lỗi: người dùng gõ
  // "2026-02-31" — chuỗi khác rỗng nên nút bật, nhưng payload rơi mất mốc và server ghi hôm
  // nay. Không còn ô để gõ thì không còn lỗi đó.
  const pauseReady = !!reason.trim();

  // Tách ra biến vì nó nằm trong một biểu thức JSX đã đủ rối; và để dòng chú thích dưới ô chỉ còn
  // một chỗ ghép chuỗi, không phải hai nhánh cùng gọi hàm.
  const budgetLine = hoursBudgetLabel({
    confirmedMinutes: hoursValue !== null ? Math.round(hoursValue * 60) : null,
    standardMinutes,
  }) ?? "";

  return (
    <div style={CARD}>
      {/* ─── MỘT CÂU HỎI, KHÔNG PHẢI MỘT BIỂU MẪU ────────────────────────────────
          "TẠM DỪNG VIỆC" viết hoa là NHÃN của một trang nhập liệu — mà trang nhập liệu thì
          người ta điền cho xong. "Tạm dừng MO …?" là một câu hỏi, và câu hỏi thì người ta
          đọc. Cùng số lần bấm, khác hẳn mức độ cân nhắc. Đây chính là thứ chống bấm nhầm,
          không phải thêm một bước nữa.

          Số giờ và tháng KPI nằm TRONG câu dẫn chứ không còn là ô riêng: chúng là HẬU QUẢ
          của cú bấm, không phải dữ liệu để nhập. Từ khi hệ thống tự đo, chúng không còn là
          thứ người dùng tác động được. */}
      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>
        {/* KHÔNG nhắc lại mã MO: tiêu đề panel ngay ba dòng phía trên đã in nó to và đậm.
            Lặp lại trong cùng một khung nhìn không làm câu hỏi rõ hơn, chỉ dài hơn. */}
        Tạm dừng việc này?
      </div>
      <div style={{ fontSize: "11.5px", lineHeight: 1.5, color: "var(--ink-body)" }}>
        Đồng hồ KPI sẽ ngừng ngay. Hệ thống ghi nhận{" "}
        <strong>{loadingHours ? "…" : hoursText === "" ? "—" : `${hoursText} giờ`}</strong>{" "}
        vào KPI <strong>{monthLabelOf(todayVnYmd())}</strong>
        {budgetLine && ` · ${budgetLine}`}
        {creditedMinutes > 0 && ` · lần trước ${fmtHours(creditedMinutes)}`}.
      </div>

      {/* NHÃN THẬT, không phải một câu văn nhét vào placeholder. Bản trước placeholder là
          "Lý do tạm dừng (bắt buộc) — VD: ưu tiên đơn gấp 26.11040": nhãn + dấu bắt buộc + ví dụ
          gộp thành một dòng chữ, và nó BIẾN MẤT ngay khi người dùng gõ chữ đầu tiên — tức lúc cần
          đối chiếu "ô này là ô gì" thì không còn gì để đọc. */}
      <div>
        <SubLabel>Lý do tạm dừng *</SubLabel>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="VD: ưu tiên đơn gấp 26.11040"
          rows={2}
          style={{
            width: "100%", fontSize: "12px", padding: "6px 8px", resize: "vertical",
            border: "1px solid var(--border)", borderRadius: "5px", background: "var(--cream)",
          }}
        />
      </div>

      {/* Lưới NGÀY & GIỜ TẠM DỪNG đã BỎ — mốc dừng luôn là BÂY GIỜ.

         Client thôi gửi `pausedAt`; server mặc định lấy thời điểm nhận request (schema đã ghi
         bỏ trống = bây giờ), nên không cần đổi gì ở API.

         ⚠️ CÁI GIÁ, ghi lại để người sau không tưởng đây là dọn dẹp vô hại: ô đó tồn tại cho ca
         quản lý QUÊN gác đơn — bấm ngày 02/9 cho việc dừng từ 31/8 thì giờ công của tháng 8
         chạy sang tháng 9, sai ở CẢ HAI tháng. Nay ca đó không còn cách xử lý, vì số đã chốt
         thì không sửa lại được. Đây là lựa chọn có ý thức: đổi độ chính xác của ca hiếm lấy
         một hộp xác nhận mà người ta thật sự đọc. */}

      {/* CHỈ NHỮNG GÌ BẤT THƯỜNG — dạng CHIP, không phải dòng chữ.
          Bản trước khối này luôn có hai dòng: một dòng nhắc lại hai con số đang hiện ngay trên
          nó, một dòng xanh nói "Đã có link ảnh render". Bốn dòng chữ cho ba cái ô, và chúng đọc
          như nhau nên mắt bỏ qua cả bốn — kể cả cái cảnh báo thật. Xem pauseWarnings. */}
      {(() => {
        const warnings = pauseWarnings({
          confirmedMinutes: hoursValue !== null ? Math.round(hoursValue * 60) : null,
          standardMinutes,
          hasRenderLink,
        });
        if (warnings.length === 0) return null;
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {warnings.map((w) => (
              <span
                key={w.key}
                style={{
                  fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "999px",
                  color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d",
                }}
              >
                ⚠ {w.text}
              </span>
            ))}
          </div>
        );
      })()}

      {/* HAI NÚT, và đây là ĐỔI Ý so với bản trước.
          Bản trước chỉ có một nút, lý do ghi là "đã có ← Quay lại ở đầu thân panel". Đúng với
          một BIỂU MẪU, sai với một HỘP XÁC NHẬN: đường lùi phải nằm NGAY CẠNH đường tiến, nếu
          không thì lối thoát duy nhất lại ở tận đầu panel — xa hơn chính cái nút nguy hiểm.
          Đó mới là thứ chống bấm nhầm, không phải thêm một bước nữa. */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="psx-btn"
          style={{ height: "34px", fontSize: "12px", opacity: saving ? 0.5 : 1 }}
        >
          Huỷ
        </button>
        <button
          type="button"
          disabled={saving || !pauseReady}
          onClick={() => run(
            () => fetchJson(
              `/api/design-3d/assignments/${assignmentId}/pause`,
              jsonBody({
                reason: reason.trim(),
                // KHÔNG gửi `pausedAt`: mốc dừng luôn là BÂY GIỜ, server lấy thời điểm nhận
                // request. Ô ngày/giờ đã bỏ — xem chú thích ở chỗ lưới cũ.
                //
                // KHÔNG gửi `confirmedMinutes`: server tự đo. Client từng gửi ngược lại chính
                // con số server vừa đưa sang, tức hai bên cùng giữ một sự thật.
              }),
            ),
            "Đã tạm dừng — đồng hồ KPI đã ngừng, giờ đã làm được chốt vào tháng này",
          )}
          className="psx-btn-primary"
          style={{ height: "34px", fontSize: "12px", opacity: saving || !pauseReady ? 0.5 : 1 }}
        >
          Xác nhận tạm dừng
        </button>
      </div>
    </div>
  );
}

/**
 * Đơn này đã bị lấy đi giao người khác — nói đủ BA điều cho người cũ.
 *
 * Trước bản này họ chỉ thấy mỗi chip "Đã giao lại". Ba câu hỏi họ chắc chắn sẽ hỏi — chuyển
 * cho ai, vì sao, công của mình có được tính không — đều không có câu trả lời ở bất kỳ màn
 * hình nào. Câu thứ ba thậm chí đã nằm sẵn trong DB (kpiCounted) mà chưa từng ra tới client.
 *
 * HIỆN CẢ VỚI NHÂN VIÊN, không chỉ Admin. Giấu "không tính KPI" không làm quyết định biến
 * mất, chỉ dời tranh cãi sang cuối tháng — lúc không ai còn nhớ đơn đó vì sao bị bác.
 */
export function ReassignedNotice({ assignment: a }: { assignment: Assignment }) {
  const next = a.reassignedTo[0]?.designer3D?.name;
  const counted = a.kpiCounted;

  return (
    <div style={{
      border: "1px solid var(--border)", background: "var(--cream-dark, #f0ebe3)",
      borderRadius: "6px", padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: "5px", fontSize: "12px",
    }}>
      <div style={{ fontWeight: 600, color: "var(--ink)" }}>
        Đơn này đã chuyển{next ? ` cho ${next}` : " cho nhân viên khác"}
        {a.reassignedAt ? ` lúc ${fmtDateTime(a.reassignedAt)}` : ""}
      </div>

      {a.reviewNote && (
        <div style={{ color: "var(--ink-body)" }}>Lý do không duyệt: {a.reviewNote}</div>
      )}

      {/* Câu quan trọng nhất của khối này — tô đậm và tách dòng, không nhét vào cuối một đoạn. */}
      <div style={{ fontWeight: 700, color: counted ? "var(--s-green, #16a34a)" : "var(--s-red, #dc2626)" }}>
        {counted
          ? "Công của bạn ở lượt này VẪN được tính KPI."
          : "Lượt này KHÔNG được tính vào KPI của bạn."}
      </div>
    </div>
  );
}

export function ReviewBox({
  assignmentId,
  currentGroupId,
  sheet,
  onCloseSheet,
  renderInfoUrl,
  mismatch,
  onSaved,
}: {
  assignmentId: string;
  /** Nhóm KPI của lượt đang làm — dùng làm giá trị mặc định khi đổi người. */
  currentGroupId: string | null;
  /** Sheet đang mở. Panel quyết định, không phải component này. */
  sheet: "ACCEPT" | "REWORK" | "REASSIGN";
  onCloseSheet: () => void;
  /** Link Render NV đã nộp — thứ Order phải xem TRƯỚC khi quyết. */
  renderInfoUrl: string | null;
  /** Lệch đáng nói, hoặc null. Luật ở kpi-3d/design-request.ts — KHÔNG tự so ở đây. */
  mismatch: DesignRequestMismatch | null;
  onSaved: () => Promise<void>;
}) {
  // ĐIỀU KHIỂN TỪ PANEL, không còn state đóng/mở của riêng mình: panel giữ đúng MỘT sheet mở tại
  // một thời điểm. Trước đây mỗi component tự giữ cờ mở của nó, nên form tiến độ và form tạm
  // dừng bày ra cùng lúc — hai chỗ nhập liệu cho hai vai khác nhau trên cùng một màn.
  const reworkOpen = sheet === "REWORK";
  const reassignOpen = sheet === "REASSIGN";
  const confirmAccept = sheet === "ACCEPT";
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // ─── Không duyệt → đổi người ────────────────────────────────────────────────
  // `countKpi` khởi tạo là null, KHÔNG phải true/false: người duyệt PHẢI tự chọn. Đặt sẵn một
  // giá trị nghĩa là hệ thống âm thầm quyết định thu nhập của một nhân viên khi người duyệt
  // bấm nhanh cho xong — xem kpi-3d/reassign.ts.
  const [designers, setDesigners] = useState<Designer3DOption[]>([]);
  const [groups, setGroups] = useState<Kpi3DGroupOption[]>([]);
  const [calendar, setCalendar] = useState<ConfiguredCalendar | null>(null);
  const [newDesignerId, setNewDesignerId] = useState("");
  // Mặc định: giữ nhóm KPI của lượt đang làm, mốc giao là BÂY GIỜ. Sửa được cả hai — cùng bốn ô
  // với khối Giao việc ở Danh sách đơn hàng, để hai đường không cho ra hai kiểu dữ liệu khác nhau
  // rồi báo cáo phải đoán.
  //
  // Điền sẵn bằng KHỞI TẠO useState, không bằng một hàm mở form: component chỉ mount khi sheet
  // được mở, nên initializer chạy đúng một lần và đúng lúc.
  const [groupId, setGroupId] = useState(currentGroupId ?? "");
  const [assignedYmd, setAssignedYmd] = useState(() => toVnYmd(new Date()));
  const [assignedHm, setAssignedHm] = useState(() => toVnHm(new Date()));
  const [reason, setReason] = useState("");
  const [countKpi, setCountKpi] = useState<boolean | null>(null);

  // Nạp danh sách khi MỞ hộp, không nạp sẵn lúc dựng: đổi người là việc hiếm, còn khối duyệt
  // này hiện trên MỌI lượt đang chờ kiểm — nạp sẵn là N lượt × ba request cho việc gần như
  // không ai bấm.
  //
  // ⚠️ fetchJson ĐÃ TỰ BÓC `body.data`. Bản đầu tôi bóc thêm một lần nữa (`res.data`) nên
  // dropdown luôn rỗng — không báo lỗi, chỉ đơn giản là không có lựa chọn nào.
  useEffect(() => {
    if (!reassignOpen || designers.length > 0) return;
    let alive = true;
    void Promise.all([
      fetchJson<Designer3DOption[]>("/api/designers-3d"),
      fetchJson<Kpi3DGroupOption[]>("/api/admin/kpi-3d/groups"),
      fetchJson<ConfiguredCalendar[]>("/api/admin/kpi-3d/working-calendars"),
    ])
      .then(([ds, gs, cals]) => {
        if (!alive) return;
        setDesigners(ds ?? []);
        setGroups((gs ?? []).filter((g) => g.isActive));
        const list = cals ?? [];
        setCalendar(list.find((c) => c.isActive && c.isDefault) ?? list.find((c) => c.isActive) ?? null);
      })
      .catch(() => { if (alive) toast.error("Không tải được danh sách nhân viên / nhóm KPI 3D."); });
    return () => { alive = false; };
  }, [reassignOpen, designers.length]);


  const closeReassign = () => {
    onCloseSheet();
    setNewDesignerId("");
    setGroupId("");
    setAssignedYmd("");
    setAssignedHm("");
    setReason("");
    setCountKpi(null);
  };

  const selectedGroup = groups.find((g) => g.id === groupId) ?? null;

  // ⚠️ KHÔNG dùng `new Date(assignedAtLocal)`. Chuỗi của <input type="datetime-local"> không
  // mang ký hiệu múi giờ, nên JavaScript hiểu theo giờ MÁY chạy nó. Đó đúng là lỗi dự án đã
  // sửa một lần rồi (xem vn-date.ts): "09:00" người dùng nhập bị lệch khi máy không ở VN.
  // vnWallToInstant đọc đúng theo giờ Việt Nam bất kể máy đặt múi giờ nào.
  const assignedAtDate = useMemo(
    () => (assignedYmd && assignedHm ? vnWallToInstant(assignedYmd, assignedHm) : null),
    [assignedYmd, assignedHm],
  );

  // Xem trước deadline bằng CHÍNH hàm server sẽ dùng, không viết bản thứ hai — hai bộ tính
  // deadline cho cùng một bài toán chắc chắn lệch nhau khi ai đó sửa lịch làm việc.
  const deadlinePreview = useMemo(() => {
    if (!selectedGroup || !assignedAtDate) return null;
    try {
      return calculate3DKpiDeadline(
        assignedAtDate,
        selectedGroup.standardMinutes,
        calendar ? configuredCalendarToWorkingCalendar(calendar) : undefined,
      );
    } catch {
      return null; // nhóm cấu hình sai số phút — để server từ chối, không dựng số giả ở đây
    }
  }, [selectedGroup, assignedAtDate, calendar]);

  const reassignReady =
    !!newDesignerId && !!reason.trim() && countKpi !== null && !!selectedGroup && !!deadlinePreview;

  const submitReassign = async () => {
    if (!reassignReady) return;
    setSaving(true);
    try {
      await fetchJson(
        `/api/design-3d/assignments/${assignmentId}/reassign`,
        jsonBody({
          designer3DId: newDesignerId,
          reason: reason.trim(),
          countKpiForPrevious: countKpi,
          kpiGroupId: groupId,
          assignedAt: assignedAtDate?.toISOString(),
        }),
      );
      toast.success(
        countKpi
          ? "Đã chuyển sang nhân viên khác — người cũ vẫn được tính công"
          : "Đã chuyển sang nhân viên khác — người cũ không được tính KPI",
      );
      closeReassign();
      await onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const submit = async (decision: "ACCEPT" | "REWORK") => {
    setSaving(true);
    try {
      await fetchJson(
        `/api/design-3d/assignments/${assignmentId}/review`,
        jsonBody({ decision, note: decision === "REWORK" ? note.trim() : null }),
      );
      toast.success(decision === "ACCEPT" ? "Đã nhận kết quả thiết kế" : "Đã trả về cho NV 3D làm lại");
      await onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // KHÔNG còn thẻ viền vàng và tiêu đề riêng ở đây — ReviewerDecisions bọc ngoài lo phần đó.
  //
  // VÌ SAO CHUYỂN RA NGOÀI: `Tạm dừng` cũng là quyết định của người duyệt, nhưng nó nằm trong thẻ
  // trạng thái ở ĐẦU panel còn khối này ở cuối — cùng một vai, quyết định bị xé ra hai đầu màn
  // hình. Gộp lại thì phải có MỘT thẻ chứa cả bốn nút, nên thẻ đó thuộc về khối bọc ngoài.
  return (
    <>
      {/* Nói thẳng khi KHÔNG có file để xem. Trước đây ô này im lặng, nên Order dễ bấm Nhận
          cho một lượt chưa có gì để nhận — và route duyệt sẽ không đẩy được file nào về MO. */}
      {!renderInfoUrl && (
        <div style={{ fontSize: "12px", color: "#92400e" }}>
          NV 3D chưa nộp link File Render — nhận kết quả sẽ không cập nhật được File 3D của MO.
        </div>
      )}

      {/* ─── NV 3D BÁO THỰC TẾ KHÁC YÊU CẦU ─────────────────────────────────
          Đặt TRƯỚC các nút quyết định, không phải sau: đọc sau khi đã bấm thì không còn là
          thông tin để quyết định nữa.

          KHÔNG có nút "sửa yêu cầu" ở đây, và đó là chủ ý: trường đó thuộc form Thiết kế bên
          Danh sách đơn hàng, nơi Đặt đơn thấy cả ngữ cảnh của đơn. Nhét một ô sửa nhanh vào
          đây là tạo đường ghi thứ hai cho một trường vốn chỉ có một chủ. */}
      {mismatch && (
        <div style={{
          border: "1px solid #fcd34d", background: "#fffbeb", borderRadius: "6px",
          padding: "8px 10px", fontSize: "12px", color: "#92400e", lineHeight: 1.55,
        }}>
          <strong>{designRequestMismatchLabel(mismatch)}</strong>
          <div style={{ marginTop: "2px" }}>
            Xem lại &ldquo;Yêu cầu thiết kế&rdquo; của MO nếu cần — sửa ở form Thiết kế bên Danh
            sách đơn hàng. Giờ KPI của lượt này không đổi theo.
          </div>
        </div>
      )}

      {reassignOpen ? (
        <>
          <div>
            <SubLabel>Nhân viên Thiết kế 3D</SubLabel>
            {/* Chỉ hiện TÊN, ô trống là "—" — đúng quy ước của khối Giao việc ở Danh sách đơn
                hàng. Bản đầu tôi ghép thêm mã ("GROUP_1 — Nhóm 1", "NV01 — An"): mã là thứ chỉ
                admin cấu hình cần, người giao việc hằng ngày đọc tên. Hai màn hình cùng làm
                một việc mà hiển thị hai kiểu thì người dùng phải học lại từ đầu ở màn thứ hai. */}
            <select
              value={newDesignerId}
              onChange={(e) => setNewDesignerId(e.target.value)}
              className="psx-input"
              style={{ width: "100%", fontSize: "13px" }}
            >
              <option value="">—</option>
              {designers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {designers.length === 0 && (
              // Nói thẳng khi danh sách rỗng. Bản trước im lặng, nên một lỗi nạp dữ liệu trông
              // y hệt "công ty không có nhân viên 3D nào".
              <div style={{ fontSize: "11px", color: "#92400e", marginTop: "4px" }}>
                Đang tải danh sách nhân viên…
              </div>
            )}
          </div>

          {/* Bốn ô dưới đây CỐ Ý giống khối Giao việc ở Danh sách đơn hàng. Hai đường cùng tạo
              ra một lượt giao việc; đường này thiếu ô thì KPI của người mới sẽ mang thông số
              suy ra chứ không phải thông số người giao chọn — rồi không ai giải thích được
              vì sao hai lượt cùng loại lại khác ngân sách giờ. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <SubLabel>Nhóm KPI 3D</SubLabel>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="psx-input"
                style={{ width: "100%", fontSize: "13px" }}
              >
                <option value="">—</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            {/* Ngày và Giờ là HAI ô riêng, đúng như khối Giao việc — không gộp thành một ô
                datetime-local. Gộp lại thì tiện hơn một chút nhưng bắt người dùng đổi thao tác
                giữa hai màn hình làm cùng một việc. */}
            <div>
              <SubLabel>Ngày giao 3D</SubLabel>
              <DateInput
                value={assignedYmd}
                onChange={setAssignedYmd}
                className="psx-input"
                style={{ fontSize: "13px" }}
              />
            </div>

            <div>
              <SubLabel>Giờ giao 3D</SubLabel>
              <TimeInput
                value={assignedHm}
                onChange={setAssignedHm}
                className="psx-input"
                style={{ fontSize: "13px" }}
              />
            </div>

            <div>
              <SubLabel>Số giờ KPI</SubLabel>
              {/* Số trần, không kèm chữ "giờ" — nhãn ô đã nói rồi, và khối Giao việc cũng vậy. */}
              <div style={{ fontSize: "13px", padding: "6px 0", fontWeight: 600 }}>
                {selectedGroup
                  ? Math.round((selectedGroup.standardMinutes / 60) * 100) / 100
                  : "—"}
              </div>
            </div>

            <div>
              <SubLabel>Deadline KPI</SubLabel>
              {/* formatVnDateTime: cùng hàm khối Giao việc dùng, nên hai màn hình không hiện
                  một mốc thời gian theo hai định dạng khác nhau. Nó tự trả "—" khi rỗng. */}
              <div style={{ fontSize: "13px", padding: "6px 0", fontWeight: 600 }}>
                {formatVnDateTime(deadlinePreview)}
              </div>
            </div>
          </div>

          <div>
            <SubLabel>Lý do không duyệt (bắt buộc)</SubLabel>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Người nhận bàn giao sẽ đọc đúng đoạn này…"
              className="psx-input"
              style={{ width: "100%", fontSize: "13px", resize: "vertical" }}
            />
          </div>

          {/* HAI NÚT, KHÔNG CÓ NÚT NÀO ĐƯỢC CHỌN SẴN. Đây là chỗ quyết định người cũ có được
              tính công hay không — để sẵn một lựa chọn là quyết hộ họ. */}
          <div>
            <SubLabel>Có tính KPI cho nhân viên cũ?</SubLabel>
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              {[
                { value: true, label: "Có tính", hint: "Giờ đã làm vẫn được ghi nhận" },
                { value: false, label: "Không tính", hint: "Loại đơn này khỏi KPI của họ" },
              ].map((opt) => {
                const active = countKpi === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setCountKpi(opt.value)}
                    title={opt.hint}
                    style={{
                      flex: 1, padding: "7px 10px", fontSize: "12px", cursor: "pointer",
                      fontWeight: active ? 700 : 500, borderRadius: "5px",
                      color: active ? "var(--cream)" : "var(--ink-body)",
                      background: active ? "var(--ink)" : "var(--cream)",
                      border: `1px solid ${active ? "var(--ink)" : "var(--border)"}`,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* CHỈ GIỮ PHẦN CHẶN. Câu "Nhân viên mới nhận nguyên số giờ chuẩn và deadline tính
              lại từ bây giờ" nhắc lại đúng hai ô Số giờ KPI và Deadline KPI đang hiện ngay trên
              nó — người đọc đã thấy cả hai con số rồi. */}
          {countKpi === null && (
            <div style={{ fontSize: "11px", color: "#92400e", lineHeight: 1.5 }}>
              Phải chọn một trong hai mục trên mới gửi được.
            </div>
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              disabled={saving || !reassignReady}
              onClick={() => void submitReassign()}
              className="psx-btn-primary"
              style={{ height: "32px", fontSize: "12px", opacity: saving || !reassignReady ? 0.5 : 1 }}
            >
              {saving ? "Đang chuyển…" : "Xác nhận chuyển người"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={closeReassign}
              className="psx-btn-secondary"
              style={{ height: "32px", fontSize: "12px" }}
            >
              Hủy
            </button>
          </div>
        </>
      ) : reworkOpen ? (
        <>
          <div>
            <SubLabel>Lý do trả về (bắt buộc)</SubLabel>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Nêu cụ thể chỗ cần sửa để NV 3D làm đúng ngay lần sau…"
              className="psx-input"
              style={{ width: "100%", fontSize: "13px", resize: "vertical" }}
            />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              disabled={saving || !note.trim()}
              onClick={() => void submit("REWORK")}
              className="psx-btn-primary"
              style={{ height: "32px", fontSize: "12px" }}
            >
              {saving ? "Đang gửi…" : "Gửi yêu cầu làm lại"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => { setNote(""); onCloseSheet(); }}
              className="psx-btn-secondary"
              style={{ height: "32px", fontSize: "12px" }}
            >
              Hủy
            </button>
          </div>
        </>
      ) : confirmAccept ? (
        /* ─── BƯỚC XÁC NHẬN CHO "NHẬN KẾT QUẢ" ────────────────────────────────
           BẤT NHẤT ĐANG SỬA: "Hoàn tất & gửi kết quả" của NV 3D CÓ bước xác nhận vì nó đóng
           dấu vĩnh viễn. "Nhận kết quả" cũng đóng dấu vĩnh viễn — File Render thành File 3D
           của MO, đơn chuyển sang chờ khách duyệt, và số giờ bị khoá (deniedReasonForPause
           chặn tạm dừng sau khi đã duyệt) — nhưng lại gửi ngay khi bấm. Cùng một loại hành
           động, hai màn hình đối xử khác nhau. */
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "12px", color: "#92400e", lineHeight: 1.5 }}>
            Nhận kết quả sẽ đưa File Render thành <strong>File 3D chính thức của MO</strong>, chốt
            phán quyết Đúng hạn / Trễ hạn vào KPI và chuyển đơn sang chờ khách duyệt.{" "}
            <strong>Không sửa lại được.</strong>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit("ACCEPT")}
              className="psx-btn-primary"
              style={{ height: "32px", fontSize: "12px" }}
            >
              {saving ? "Đang lưu…" : "Xác nhận nhận kết quả"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onCloseSheet}
              className="psx-btn-secondary"
              style={{ height: "32px", fontSize: "12px" }}
            >
              Hủy
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
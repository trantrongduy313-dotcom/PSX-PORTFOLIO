"use client";

// Khoi "Nhan vien Thiet ke 3D" cua OrderDetailPanel.
//
// MOT BAN, HAI MAN DUNG CHUNG (PTK va PSX). Section nay DA TUNG co hai ban viet tay va chung
// lech nhau 6 truong — nang nhat la nguoi thu hai khong co nut Kiem noi bo.

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { cn, formatDate } from "@/app/lib/utils";
import { formatVnDateTime, toVnHm, toVnYmd, vnWallToInstant } from "@/app/lib/utils/vn-date";
import type { Design3DAssignmentRow } from "@/app/lib/types/order";
import { calculate3DKpiDeadline, type WorkingCalendar } from "@/app/lib/business/kpi-3d-deadline";
import { CONTINUATION_LABELS } from "@/app/lib/business/kpi-3d/attempt-chain";
import { attemptSummaryLead } from "@/app/lib/business/kpi-3d/attempt-summary";
import {
  ATTEMPT_FIELD_LABELS,
  showsVerdictFields,
  type AttemptFieldKey,
} from "@/app/lib/business/kpi-3d/attempt-fields";
import { suggestedRemainingMinutes } from "@/app/lib/business/kpi-3d/continuation";
import { formatKpiMonth, pauseStateOf, toPauseSpans } from "@/app/lib/business/kpi-3d/pause-view";
import { toDesign3DAssignmentView } from "@/app/lib/business/kpi-3d/review";
import { acknowledgeBadge, kpiResultBadge, reviewBadge } from "@/app/lib/business/kpi-3d/display";
import {
  actualMinutesHint,
  actualMinutesToHours,
  hasDesign3DResult,
  resolveActualMinutes,
  workingDaysFromMinutes,
} from "@/app/lib/business/kpi-3d/actual-minutes";
import { TONE_TEXT_CLASS } from "@/app/lib/ui/status-tone";
import { Field, SummaryBadge, inputCls } from "./panel-atoms";
import { DateInput, todayVnYmd } from "./date-input";
import { TimeInput } from "./time-input";
import { Designer3DSelect } from "./designer-3d-select";

/** Tai cong viec cua mot NV 3D — tra theo TEN o o chon. */
export type Designer3DWorkloadRow = {
  id: string;
  name: string;
  code: string;
  workload: { openCount: number; openMinutes: number; overdueCount: number; unackedCount: number };
  items: Array<{
    id: string;
    moNumber: string | null;
    productName: string | null;
    deadlineAt: string;
    isOverdue: boolean;
    acknowledged: boolean;
  }>;
  moreCount: number;
};

/** Cac o Order tu nhap cho MOT nhan vien 3D. */
/** Các ô Order tự nhập cho MỘT nhân viên 3D. */
export type Designer3DCardValue = {
  phanNhom3D: string;
  tho3d: string;
  ngayGiao3D: string;
  gioGiao3D: string;
  gioThucTe: string;
};

export type Designer3DCardProps = {
  title: string;
  /** Có hàm này thì hiện nút Xóa — người thứ nhất không xóa được (là khối gốc của MO). */
  onRemove?: () => void;

  /**
   * Thu gọn còn một dòng tóm tắt. MO nhiều người khiến sidebar dài ra rất nhanh.
   *
   * MẶC ĐỊNH LUÔN MỞ, người dùng tự thu — không tự động thu theo số lượng hay theo trạng thái:
   * đa số MO chỉ có một người, tự thu sẽ bắt họ bấm thêm một lần mỗi ngày để làm đúng việc
   * vẫn làm.
   *
   * An toàn khi thu: giá trị đang gõ nằm ở state của component cha, không nằm trong khối này,
   * nên tháo phần thân ra khỏi DOM không mất chữ đang nhập dở.
   */
  collapsed: boolean;
  onToggleCollapse: () => void;

  value: Designer3DCardValue;
  onChange: (key: keyof Designer3DCardValue, value: string) => void;

  groupOptions: string[];
  designerOptions: Array<{ id: string; name: string; code: string | null }>;
  /**
   * Tải công việc của từng NV 3D, tra theo TÊN. Rỗng khi người dùng không có quyền xem
   * (chỉ ADMIN/ORDER) — lúc đó ô chọn hiện y như trước, không có gì hỏng.
   */
  workloadByName?: Map<string, Designer3DWorkloadRow>;
  /** Cảnh báo chưa cấu hình Nhóm KPI — chỉ hiện ở khối đầu, nói một lần là đủ. */
  showGroupWarning?: boolean;

  /** Suy ra từ nhóm KPI + mốc giao. Rỗng/null khi chưa đủ dữ liệu để tính. */
  standardHours: string;
  deadlineAt: Date | null;

  /** Bản ghi lượt giao việc trong DB. null = chưa lưu, hoặc MO cũ chưa có lượt. */
  view: ReturnType<typeof toDesign3DAssignmentView>;

  /**
   * Các khoảng bị tạm dừng của lượt này — để khối nói được "đơn đang bị gác".
   *
   * Trước bản này sidebar hoàn toàn không biết chuyện tạm dừng: màn Việc thiết kế 3D hiện
   * "Đang tạm dừng từ …" còn ở đây thì im lặng, nên người duyệt đọc khối này tưởng nhân viên
   * vẫn đang làm.
   */
  pauses?: Design3DAssignmentRow["pauses"];

  /**
   * Cho phép khối này giao LƯỢT TIẾP THEO. undefined = không hiện nút.
   *
   * Chỉ có khi khối ứng với một lượt thật, chưa đóng, và người dùng là Admin/Đặt đơn — cùng ba
   * điều kiện server kiểm ở deniedReasonForContinuation, để người dùng không bấm rồi mới bị chối.
   */
  continueContext?: ContinueContext;

  /**
   * MO cũ CHƯA có lượt giao việc thì Ngày HT vẫn phải nhập tay được — dữ liệu lịch sử chỉ
   * sống trong JSON. Có lượt rồi thì server chốt, ô thành chỉ đọc.
   * Chỉ khối gốc truyền hai prop này; khối thêm mới luôn có lượt nên không cần.
   */
  legacyCompletedDate?: string;
  onLegacyCompletedDateChange?: (value: string) => void;
  legacyKetQua?: string;

  canReview: boolean;
  reviewSubmitting: boolean;
  reworkOpen: boolean;
  reworkReason: string;
  onReworkReasonChange: (value: string) => void;
  onOpenRework: () => void;
  onCancelRework: () => void;
  onDecision: (decision: "ACCEPT" | "REWORK") => void;

  disabled: boolean;
  readOnly: boolean;
};

/**
 * MỘT nhân viên 3D trên tab Thiết kế: giao việc → kết quả → kiểm nội bộ.
 *
 * VÌ SAO GOM THÀNH MỘT COMPONENT: trước đây người thứ nhất được viết thẳng trong tab và bị
 * XÉ LÀM ĐÔI qua hai section ("Thông tin nhận việc" và "Kết quả thực hiện"), còn người thứ hai
 * là một khối riêng viết tay lần nữa. Hai bản viết tay lệch nhau 6 trường — nặng nhất là người
 * thứ hai KHÔNG có nút Kiểm nội bộ, nên họ gửi kết quả xong thì Order không duyệt được.
 *
 * Một khuôn dùng chung thì không còn chỗ cho loại lệch đó: thêm trường là mọi người cùng có.
 *
 * Ở MODULE SCOPE, không khai báo trong component cha: khai báo bên trong sẽ tạo type mới mỗi
 * lần render, React tháo và dựng lại toàn bộ ô nhập, và con trỏ nhảy ra khỏi ô đang gõ.
 */

/** Dữ liệu để khối đang chạy giao được lượt tiếp theo. Gom thành MỘT prop thay vì bảy. */
export type ContinueContext = {
  assignmentId: string;
  /** Suất giờ ĐÃ ĐÓNG DẤU của lượt hiện tại — mẫu số của phép trừ ra phần còn lại. */
  standardMinutes: number;
  /** Giờ đã ghi nhận cho người đang làm (chốt ở lần tạm dừng, hoặc hệ thống đo). */
  creditedMinutes: number;
  currentDesignerName: string;
  currentGroupName: string;
  /** Lịch làm việc để xem trước Deadline KPI bằng chính hàm server dùng. */
  calendar?: WorkingCalendar;
  /** Nhóm KPI kèm SỐ PHÚT — ô chọn nhóm ở khối trên chỉ có tên, không đủ để suy ngân sách. */
  groups: Array<{ id: string; name: string; standardMinutes: number }>;
  designers: Array<{ id: string; name: string }>;
  onSubmit: (body: {
    designer3DId: string; standardMinutes: number; startedAt?: string; kpiGroupId?: string;
  }) => Promise<void>;
};

/**
 * GIAO LƯỢT TIẾP THEO cho một MO — đóng lượt đang chạy rồi mở một lượt mới.
 *
 * SÁU Ô GIỐNG HỆT khối Giao việc phía trên, cùng nhãn cùng thứ tự: đây LÀ một lần giao việc, nên
 * bắt người dùng học một bố cục thứ hai cho cùng hành động là chỗ họ sẽ điền sai.
 *
 * ⚠️ KHÁC đúng một điểm, và là điểm quan trọng nhất: "Số giờ KPI" NHẬP ĐƯỢC, điền sẵn phần CÒN
 * LẠI. Người làm tiếp kế thừa phần đã làm chứ không làm lại từ đầu — cho nguyên suất thì một MO
 * 6 giờ tiêu 12 giờ ngân sách và người thứ hai gần như không thể trễ hạn.
 *
 * Hết ngân sách thì để TRỐNG, không điền 0: 0 giờ nghĩa là hạn chót rơi ngay vào lúc giao.
 */
export function NextAttemptForm({ ctx, disabled }: { ctx: ContinueContext; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [designerId, setDesignerId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [ymd, setYmd] = useState("");
  const [hm, setHm] = useState("");
  const [hoursText, setHoursText] = useState("");

  const openForm = () => {
    const now = new Date();
    setYmd(toVnYmd(now));
    setHm(toVnHm(now));
    // Điền sẵn NGƯỜI CŨ và NHÓM CŨ — "vẫn người đó làm tiếp" là tình huống thường nhất, và bắt
    // chọn lại từ đầu mỗi lần là mời chọn sai.
    setDesignerId(ctx.designers.find((d) => d.name === ctx.currentDesignerName)?.id ?? "");
    setGroupId(ctx.groups.find((g) => g.name === ctx.currentGroupName)?.id ?? "");
    const suggest = suggestedRemainingMinutes({
      standardMinutes: ctx.standardMinutes,
      creditedMinutes: ctx.creditedMinutes,
    });
    setHoursText(suggest == null ? "" : String(actualMinutesToHours(suggest) ?? ""));
    setOpen(true);
  };

  const hours = hoursText.trim() === "" ? null : Number(hoursText);
  const hoursBad = hours !== null && (!Number.isFinite(hours) || hours <= 0);

  // Mốc đọc bằng vnWallToInstant, KHÔNG `new Date(chuỗi)`: chuỗi của input date/time không mang
  // múi giờ nên JS hiểu theo giờ MÁY — đúng lỗi dự án đã sửa một lần (xem vn-date.ts).
  const startedAt = ymd && hm ? vnWallToInstant(ymd, hm) : null;

  // Xem trước deadline bằng CHÍNH hàm server dùng, không viết bản thứ hai.
  const deadlinePreview = (() => {
    if (!startedAt || hours === null || hoursBad) return null;
    try {
      return calculate3DKpiDeadline(startedAt, Math.round(hours * 60), ctx.calendar);
    } catch {
      return null;
    }
  })();

  const ready = !!designerId && hours !== null && !hoursBad && !!deadlinePreview;

  if (!open) {
    return (
      <div className="pt-1">
        <button
          type="button"
          disabled={disabled}
          onClick={openForm}
          className="text-[11px] font-medium text-gray-600 hover:text-gray-900 hover:underline disabled:opacity-50"
        >
          + Giao lượt tiếp theo
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      await ctx.onSubmit({
        designer3DId: designerId,
        standardMinutes: Math.round((hours ?? 0) * 60),
        startedAt: startedAt?.toISOString(),
        ...(groupId ? { kpiGroupId: groupId } : {}),
      });
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 rounded-md border border-gray-300 bg-white p-3 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        Giao lượt tiếp theo
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label={ATTEMPT_FIELD_LABELS.kpiGroup}>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className={inputCls(false)}
          >
            <option value="">—</option>
            {ctx.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label={ATTEMPT_FIELD_LABELS.designer}>
          <select
            value={designerId}
            onChange={(e) => setDesignerId(e.target.value)}
            className={inputCls(false)}
          >
            <option value="">—</option>
            {ctx.designers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label={ATTEMPT_FIELD_LABELS.assignedDate}>
          {/* Cùng luật với khối Nhân viên 3D — xem chú thích ở đó. */}
          <DateInput value={ymd} min={todayVnYmd()} onChange={setYmd} className={inputCls(false)} />
        </Field>
        <Field label={ATTEMPT_FIELD_LABELS.assignedTime}>
          <TimeInput value={hm} onChange={setHm} className={inputCls(false)} />
        </Field>
        <Field label={ATTEMPT_FIELD_LABELS.standardHours}>
          <input
            type="number"
            min="0.25"
            step="0.25"
            value={hoursText}
            onChange={(e) => setHoursText(e.target.value)}
            className={cn(inputCls(false), hoursBad && "border-red-500")}
            placeholder="—"
          />
        </Field>
        <Field label={ATTEMPT_FIELD_LABELS.deadline}>
          <div className="psx-input text-sm select-none flex items-center font-medium text-gray-700">
            {formatVnDateTime(deadlinePreview)}
          </div>
        </Field>
      </div>

      {/* Vì sao ô Số giờ KPI được điền sẵn con số đó, và vì sao nó sửa được: "làm được một nửa" là
          đánh giá của con người, không suy ra được từ đồng hồ. */}
      <p className="text-[10px] text-gray-500 italic leading-snug">
        Đề xuất = suất gốc {actualMinutesToHours(ctx.standardMinutes) ?? "—"} giờ trừ{" "}
        {actualMinutesToHours(ctx.creditedMinutes) ?? 0} giờ đã ghi nhận cho {ctx.currentDesignerName || "người đang làm"}.
        Lượt đang chạy sẽ được ĐÓNG và chốt số giờ đó; lượt mới tính KPI theo tháng của mốc giao ở trên.
      </p>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-2.5 py-1 text-[11px] border border-gray-300 rounded hover:bg-gray-50"
        >
          Huỷ
        </button>
        <button
          type="button"
          disabled={saving || !ready}
          onClick={() => void submit()}
          className="px-3 py-1 text-[11px] font-semibold rounded bg-gray-900 text-white disabled:opacity-50"
        >
          Chốt & giao lượt mới
        </button>
      </div>
    </div>
  );
}

/**
 * Một lượt ĐÃ ĐÓNG của MO — khối riêng, CHỈ ĐỌC, dựng thẳng từ bảng.
 *
 * Số khối "Nhân viên 3D #N" do JSON extraData quyết định, nên khi hệ thống tự tạo lượt mới (mở
 * lại sau tạm dừng) thì khối #1 im lặng chuyển sang lượt mới và kết quả lần 1 không còn ô nào
 * đọc được. Test: kpi-3d-designer-blocks "mở lại sau tạm dừng → lượt cũ có khối riêng".
 */
export function ClosedAttemptCard({
  row,
  blockNo,
  closedReason,
  collapsed,
  onToggleCollapse,
  calendar,
}: {
  row: Design3DAssignmentRow;
  blockNo: number;
  closedReason: "REJECT_REASSIGN" | "MANUAL_REASSIGN" | "PAUSE_RESUME" | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  calendar?: Parameters<typeof toDesign3DAssignmentView>[2];
}) {
  const view = toDesign3DAssignmentView(row, toVnYmd, calendar, toPauseSpans(row.pauses));
  const minutes = view?.systemActualMinutes ?? null;
  const hours = actualMinutesToHours(minutes);
  const assignedAt = new Date(row.assignedAt);

  const why = closedReason ? CONTINUATION_LABELS[closedReason] : "đã đóng";
  const standardHours = actualMinutesToHours(row.standardMinutesSnapshot);
  // MỘT ngữ pháp cho mọi khối — luật ở attempt-summary.ts. Bản trước mỗi khối tự ghép chuỗi, nên
  // khối này hiện [người · giờ · phán quyết] còn khối đang chạy hiện [người · nhóm · hạn · kiểm]:
  // cùng một loại khối, hai bộ trường và hai thứ tự.
  const summary = attemptSummaryLead({
    designerName: row.designer3D?.name,
    kpiGroupName: row.kpiGroup?.name,
    isClosed: true,
    actualHours: hours,
    standardHours,
  });
  // Phán quyết KPI là chip có màu, TÁCH khỏi chuỗi chữ: một chuỗi đã ghép thì không tô màu từng
  // phần được nữa, và đó chính là cách màu trạng thái bị mất khi thu gọn.
  const summaryBadge = kpiResultBadge(view?.kpiStatus ?? null);

  // Số ngày HT chia theo số phút MỘT NGÀY LÀM VIỆC của lịch — cùng hàm khối đang chạy dùng, nên
  // hai khối cạnh nhau không quy đổi cùng một số giờ ra hai số ngày khác nhau.
  const soNgayHT = workingDaysFromMinutes(minutes);
  // Lượt bị đóng ngay tại mốc tạm dừng thì chưa có phán quyết nào — ẩn cả hàng thay vì bày ba
  // dấu gạch. Luật thuộc TRẠNG THÁI nên khai chung ở business, không viết lại theo từng khối.
  const showVerdict = showsVerdictFields({ isPausedSnapshot: !!view?.actualMinutesFromPause });

  const ro = "psx-input text-sm select-none flex items-center text-gray-700";

  // ⚠️ ĐÂY LÀ CHỐT AN TOÀN CỦA CẢ BẢN SỬA NÀY, KHÔNG PHẢI MỘT CÁCH VIẾT GỌN.
  //
  // Kiểu `Record<AttemptFieldKey, …>` đòi ĐỦ MỌI key khai ở attempt-fields.ts. Thêm một trường
  // vào khối đang chạy mà quên khối này thì `tsc` ĐỎ NGAY — đúng chỗ lỗi cũ đã lọt qua ba lần
  // trong im lặng. Một test có thể bị bỏ qua; trình biên dịch thì không.
  const cells: Record<AttemptFieldKey, React.ReactNode> = {
    kpiGroup:      <div className={ro}>{row.kpiGroup?.name || "—"}</div>,
    designer:      <div className={ro}>{row.designer3D?.name || "—"}</div>,
    assignedDate:  <div className={ro}>{formatDate(toVnYmd(assignedAt))}</div>,
    assignedTime:  <div className={ro}>{toVnHm(assignedAt)}</div>,
    standardHours: <div className={ro}>{actualMinutesToHours(row.standardMinutesSnapshot) ?? "—"}</div>,
    deadline:      <div className={ro}>{formatVnDateTime(row.deadlineAt ? new Date(row.deadlineAt) : null) || "—"}</div>,
    // formatDate: cùng hàm khối ô nhập dùng cho ô này, nên hai khối cạnh nhau không hiện một
    // ngày theo hai định dạng.
    completedDate: <div className={ro}>{view?.completedYmd ? formatDate(view.completedYmd) : "—"}</div>,
    actualHours: (
      <>
        {/* Số này CHÍNH LÀ số đã vào KPI của tháng đó. Hiện "—" ở đây nghĩa là công của nhân
            viên biến mất khỏi mọi màn hình — đúng lỗi mà khối chỉ đọc sinh ra để bịt. */}
        <div className="psx-input text-sm select-none flex items-center font-semibold text-gray-800">
          {hours != null ? hours : "—"}
        </div>
        {/* Chú thích: nói cho người duyệt biết con số này ĐO TỪ ĐÂU. Nó cùng cặp với ô "NV 3D
            nhận việc" bên dưới — hai ô cùng trả lời "vì sao ra số này". */}
        <div className="text-[10px] mt-0.5 italic leading-snug text-gray-400">
          {actualMinutesHint("SYSTEM")}
        </div>
      </>
    ),
    // "0 ngày" cho 0.03 giờ thì đúng về số mà vô nghĩa về tin — nhưng ở khối đã chốt, số giờ đã
    // là số CUỐI, nên đây là một câu trả lời thật chứ không phải một số đang chạy.
    workingDays: <div className={cn(ro, "italic")}>{soNgayHT != null ? `${soNgayHT} ngày` : "—"}</div>,
    ketQua: (
      <div className={cn(
        "psx-input text-sm select-none flex items-center font-medium",
        TONE_TEXT_CLASS[kpiResultBadge(view?.kpiStatus ?? null).tone],
      )}>
        {view?.ketQuaLabel || "—"}
      </div>
    ),
    reviewStatus: (
      <div className={cn(
        "psx-input text-sm select-none flex items-center font-medium",
        TONE_TEXT_CLASS[reviewBadge(view?.reviewStatus ?? null).tone],
      )}>
        {reviewBadge(view?.reviewStatus ?? null).label}
      </div>
    ),
    renderInfo: view?.renderInfoUrl ? (
      <a
        href={view.renderInfoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="psx-input text-sm flex items-center gap-1.5 text-blue-700 hover:underline truncate"
      >
        <ExternalLink className="w-3.5 h-3.5 shrink-0" /> Mở file Render
      </a>
    ) : (
      <div className="psx-input text-sm text-gray-400 flex items-center">—</div>
    ),
    acknowledgedAt: (
      <div className={cn(
        "psx-input text-sm select-none flex items-center font-medium",
        TONE_TEXT_CLASS[acknowledgeBadge(view?.acknowledgedAt ?? null).tone],
      )}>
        {view?.acknowledgedAt ? formatVnDateTime(view.acknowledgedAt) : acknowledgeBadge(null).label}
      </div>
    ),
  };

  return (
    <div className="rounded-md border border-gray-200 bg-gray-100/70 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-400" />
            : <ChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-400" />}
          <span className="text-xs font-semibold text-gray-500 shrink-0">
            Nhân viên 3D #{blockNo}
          </span>
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-gray-200 text-gray-600 border border-gray-300">
            Đã chốt
          </span>
          {collapsed && summary && (
            <span className="text-xs text-gray-500 truncate">{summary}</span>
          )}
          {collapsed && <SummaryBadge badge={summaryBadge} />}
        </button>
      </div>

      {/* Lý do lượt này đóng — lấy từ LƯỢT KẾ TIẾP, vì continuationReason trả lời "vì sao có lượt
          NÀY". Đây là câu đầu tiên người duyệt sẽ hỏi khi thấy hai khối cho một MO.
          CHỈ CÒN LÝ DO: phần "số giờ đã ghi vào KPI và không sửa được ở đây" thì chip ĐÃ CHỐT ở
          tiêu đề khối đã nói, và mọi ô trong khối đều là ô chỉ đọc nên tự nói tiếp. */}
      <div className="text-[11px] text-gray-500 italic leading-snug">{why}</div>

      {collapsed ? null : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label={ATTEMPT_FIELD_LABELS.kpiGroup}>{cells.kpiGroup}</Field>
            <Field label={ATTEMPT_FIELD_LABELS.designer}>{cells.designer}</Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* TÁCH NGÀY VÀ GIỜ, y như khối đang chạy. Bản trước gộp thành một ô "Giao lúc" —
                cùng một sự thật mang tên khác và cắt thành hình khác, ngay cạnh khối kia trong
                cùng một panel, nên người đọc phải dịch qua lại giữa hai khối. */}
            <Field label={ATTEMPT_FIELD_LABELS.assignedDate}>{cells.assignedDate}</Field>
            <Field label={ATTEMPT_FIELD_LABELS.assignedTime}>{cells.assignedTime}</Field>
            <Field label={ATTEMPT_FIELD_LABELS.standardHours}>{cells.standardHours}</Field>
            <Field label={ATTEMPT_FIELD_LABELS.deadline}>{cells.deadline}</Field>
          </div>

          {/* Tiêu đề nhóm — khối đang chạy có, khối này trước đây không, nên tám ô nằm thành một
              khối phẳng và không có gì phân biệt "đã giao gì" với "làm ra sao". */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 pt-1">
            Kết quả thực hiện
          </p>

          <div className={showVerdict ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-3"}>
            <Field label={ATTEMPT_FIELD_LABELS.completedDate}>{cells.completedDate}</Field>
            <Field label={ATTEMPT_FIELD_LABELS.actualHours}>{cells.actualHours}</Field>
            {showVerdict && (
              <Field label={ATTEMPT_FIELD_LABELS.workingDays}>{cells.workingDays}</Field>
            )}
          </div>

          {/* Phán quyết ẩn theo TRẠNG THÁI, không theo khối — luật ở showsVerdictFields(). Lượt
              đã chốt gần như luôn có phán quyết, nhưng lượt bị đóng ngay tại mốc tạm dừng thì
              không, và lúc đó hai ô này chỉ là hai dấu gạch. */}
          {showVerdict && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={ATTEMPT_FIELD_LABELS.ketQua}>{cells.ketQua}</Field>
              <Field label={ATTEMPT_FIELD_LABELS.reviewStatus}>{cells.reviewStatus}</Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={ATTEMPT_FIELD_LABELS.renderInfo}>{cells.renderInfo}</Field>
            {/* MỐC GIẢI THÍCH ĐƯỢC CON SỐ. Giờ thực tế đo TỪ lúc nhận việc, nên lượt chưa từng
                được nhận thì phép đo không có điểm bắt đầu và ra 0. Thiếu ô này thì "Giờ thực tế
                0" đọc như dữ liệu bị mất, trong khi nó có thể hoàn toàn đúng — người duyệt không
                có cách nào phân biệt. Đây là lý do thật để thêm ô, không phải cho đủ bộ. */}
            <Field label={ATTEMPT_FIELD_LABELS.acknowledgedAt}>{cells.acknowledgedAt}</Field>
          </div>

          {/* Lý do người duyệt — HỘP CÓ NHÃN, y như khối đang chạy. Bản trước in "↳ Làm dùm"
              thành một dòng trơ không nhãn: cùng một dữ liệu, một bên là hộp đỏ "Lý do làm lại",
              một bên là một câu lửng không ai biết là gì. */}
          {row.reviewNote && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-xs text-red-800">
                <span className="font-semibold">
                  Lý do làm lại{row.reworkCount > 1 ? ` (lần ${row.reworkCount})` : ""}:
                </span>{" "}
                {row.reviewNote}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Đơn đang bị gác — nói rõ giờ công đã chốt vào THÁNG NÀO.
 *
 * ⚠️ CỐ Ý KHÔNG gọi đây là "đã hoàn tất", dù người dùng mô tả nó gần như vậy ("ghi ngày giờ như
 * một đơn đã hoàn thành để tính KPI"). Đóng dấu completedAt sẽ đẩy lượt vào cột "Đơn HT trong
 * tháng" của báo cáo và sinh ra một phán quyết Đúng/Trễ hạn cho việc chưa xong — tỷ lệ đúng hạn
 * của nhân viên bị pha loãng bằng những đơn không phải kết quả thật.
 *
 * Thứ thật sự cần — giờ công vào đúng tháng — đã chạy sẵn qua confirmedMinutes + hours-ledger.
 * Khối này chỉ HIỆN nó ra, không tạo thêm sự thật nào.
 *
 * Chưa chốt giờ (`confirmedMinutes = null`) thì nói thẳng là chưa chốt. Hiện 0 giờ ở đó là bịa:
 * "chưa đo" và "đo được và bằng 0" là hai chuyện khác nhau, và nhầm chúng từng là gốc của một
 * bug sống sót qua ba lần sửa trong chính mảng này.
 */
export function PausedBanner({
  pause,
  standardHours,
}: {
  pause: ReturnType<typeof pauseStateOf>;
  standardHours: string;
}) {
  const hours = pause.confirmedMinutes != null ? actualMinutesToHours(pause.confirmedMinutes) : null;

  // MỘT DÒNG DỮ KIỆN + một dòng lý do. Bản trước là BỐN dòng, và hai trong số đó không mang tin:
  //
  //   "Đồng hồ hạn chót đang dừng"  — chip TẠM DỪNG ở tiêu đề khối đã nói đúng điều đó.
  //   "Mở lại ở màn Việc thiết kế 3D" — chỉ đường bằng chữ mà không có đường dẫn nào để bấm. Câu
  //   chỉ đường không kèm link thì người đọc vẫn phải tự đi tìm, tức nó chỉ chiếm chỗ.
  //
  // Còn dòng "Đã chốt X giờ / KPI Y giờ vào KPI tháng MM" thì TRÙNG với ô "Giờ thực tế" ở khối
  // ngay bên dưới — cùng một con số, hai cách diễn đạt, cách nhau cả một khối trường. Đó là kiểu
  // trùng tệ nhất: nếu hai chỗ lệch nhau thì không ai biết chỗ nào đúng. Ở đây giữ lại vì nó là
  // thứ DUY NHẤT nói ra THÁNG, còn ô bên dưới đã bỏ chú thích ba dòng của nó.
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 space-y-0.5">
      <div className="flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-amber-900">
        <span className="font-bold">Tạm dừng</span>
        <span className="text-amber-800">từ {formatVnDateTime(pause.pausedAt)}</span>
        {pause.pauseCount > 1 && <span className="text-amber-700">· lần {pause.pauseCount}</span>}
        {hours != null ? (
          <>
            <span className="text-amber-700">·</span>
            <span>đã chốt <strong>{hours}</strong>{standardHours ? `/${standardHours}` : ""} giờ</span>
            <span className="text-amber-700">→ KPI {formatKpiMonth(pause.kpiMonth)}</span>
          </>
        ) : (
          // "Chưa chốt" là BẤT THƯỜNG — server luôn tự đo khi ô để trống, nên gặp null nghĩa là
          // dữ liệu cũ hoặc có gì sai. Nói ngắn và đậm, không cần hai dòng giải thích.
          <span className="font-semibold">· chưa chốt số giờ</span>
        )}
      </div>

      {pause.reason && (
        <div className="text-[12px] text-amber-800">{pause.reason}</div>
      )}
    </div>
  );
}

export function Designer3DCard(props: Designer3DCardProps) {
  const { value, view, disabled, readOnly, collapsed } = props;

  // Giờ thực tế: số hệ thống đo (cột actualMinutes) vs số Order sửa tay (JSON gioThucTe).
  // Quy tắc chọn khai ở kpi-3d/actual-minutes.ts — dùng chung với báo cáo KPI, không viết lại.
  const actual = resolveActualMinutes({
    systemMinutes: view?.systemActualMinutes ?? null,
    manualHours: value.gioThucTe !== "" ? parseFloat(value.gioThucTe) : null,
  });
  // Chuỗi đổ vào ô nhập, đi qua ĐÚNG quy tắc chọn số ở trên. Chưa có gì thì để TRỐNG —
  // KHÔNG hiện "0" thô từ JSON như bản trước, vì lúc đó chú thích và ô Số ngày HT đều đang
  // nói "chưa có gì" và ba widget hoá ra kể ba câu chuyện khác nhau.
  const actualHoursText = actual.minutes == null
    ? ""
    : String(actualMinutesToHours(actual.minutes) ?? "");
  // Số ngày HT chia theo số phút MỘT NGÀY LÀM VIỆC của lịch, không phải hằng số 8 giờ.
  const soNgayHT = workingDaysFromMinutes(actual.minutes);

  // Khối "Kết quả thực hiện" chỉ hiện khi CÓ GÌ ĐỂ HIỆN — điều kiện khai ở module business
  // (hasDesign3DResult) để bố cục và nhãn cùng đọc một nguồn.
  //
  // `manualResultOpen` là đường vào cho MO CŨ chưa có lượt giao việc: Order bấm "Nhập kết quả
  // thủ công" để ghi tay ngày hoàn tất. Ẩn mặc định chứ không bỏ — bỏ hẳn là những đơn làm
  // xong từ trước khi có luồng giao việc mới sẽ mất luôn đường ghi.
  const [manualResultOpen, setManualResultOpen] = useState(false);
  const hasResult = hasDesign3DResult({
    hasAssignment: !!view,
    completedYmd: view?.completedYmd,
    ketQuaLabel: view?.ketQuaLabel,
    minutes: actual.minutes,
  });
  // Đơn cũ đã có ngày hoàn tất ghi tay trong JSON thì vẫn phải thấy, dù không có lượt giao việc.
  const hasLegacyResult = !view && (!!props.legacyCompletedDate || !!props.legacyKetQua);
  const showResultBlock = hasResult || hasLegacyResult || manualResultOpen;
  // ĐANG TẠM DỪNG = KHOÁ HẾT, y như một lượt đã xong. Số giờ đã chốt tại thời điểm dừng; sửa
  // nhóm KPI hay mốc giao bây giờ là dời deadline của một lượt đã đóng dấu.
  //
  // Cố ý KHÔNG gộp vào `readOnly`: `readOnly` còn ẩn cả form "+ Giao lượt tiếp theo" — mà đó
  // chính là CỬA DUY NHẤT để đi tiếp sau khi tạm dừng. Khoá luôn cửa thoát thì người dùng kẹt
  // hẳn, và đó là cách một chốt chặn đúng biến thành một lỗi.
  const pause = pauseStateOf(props.pauses);
  const editable = !disabled && !readOnly && !pause.isPaused;

  // Dòng tóm tắt phải đủ để KHÔNG cần mở ra: ai, nhóm nào, hạn khi nào, đang chờ ai xử lý.
  // Bỏ các ô trống thay vì hiện "—" liên tiếp — khối chưa nhập gì thì tóm tắt cũng trống.
  //
  // "Đang tạm dừng" đứng ĐẦU tóm tắt: nó phủ định mọi thứ đứng sau nó (hạn chót đang bị treo,
  // trạng thái kiểm đang đứng yên), nên đọc được nó sau cùng thì đọc sai cả dòng.
  //
  // CÙNG hàm với khối đã chốt (attempt-summary.ts) — hai khối nằm sát nhau trong một panel thì
  // phải cùng một ngữ pháp, nếu không người đọc phải học lại cấu trúc ở dòng thứ hai.
  //
  // Hạn chót rút xuống dd/MM: bản trước in cả "09:22 19/08/2026" — chuỗi DÀI NHẤT trong dòng và
  // là thứ ít cần chính xác tới phút nhất khi đang liếc. Nó còn đẩy trạng thái ra cuối, đúng chỗ
  // `truncate` cắt trước.
  const summary = attemptSummaryLead({
    designerName: value.tho3d,
    kpiGroupName: value.phanNhom3D,
    isClosed: false,
    isPaused: pause.isPaused,
    deadlineYmd: props.deadlineAt ? toVnYmd(props.deadlineAt) : null,
  });
  // Trạng thái kiểm thành chip có màu, TÁCH khỏi chuỗi chữ — xem SummaryBadge.
  const summaryBadge = view ? reviewBadge(view.reviewStatus) : null;

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={props.onToggleCollapse}
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-400" />
            : <ChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-400" />}
          <span className="text-xs font-semibold text-gray-600 shrink-0">{props.title}</span>
          {/* Hiện CẢ khi đang mở, không chỉ khi thu gọn: khối mở ra dài vài màn hình, người
              đọc tới ô Giờ thực tế ở giữa khối sẽ không còn thấy dòng tóm tắt nữa. */}
          {pause.isPaused && (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-300">
              Tạm dừng
            </span>
          )}
          {collapsed && summary && (
            <span className="text-xs text-gray-500 truncate">{summary}</span>
          )}
          {collapsed && <SummaryBadge badge={summaryBadge} />}
        </button>
        {/* `editable` chứ không phải `!readOnly`: xoá khối của một lượt đang tạm dừng là xoá
            luôn số giờ đã chốt — đó cũng là "sửa", và nó là kiểu sửa không hoàn tác được. */}
        {props.onRemove && editable && (
          <button
            type="button"
            disabled={disabled}
            onClick={props.onRemove}
            className="text-xs text-red-600 hover:underline disabled:opacity-50 shrink-0"
          >
            Xóa
          </button>
        )}
      </div>

      {collapsed ? null : (
      <>
      {pause.isPaused && <PausedBanner pause={pause} standardHours={props.standardHours} />}
      {/* ─── GIAO VIỆC ───────────────────────────────────────────────────────
          Bốn ô Order phải điền, rồi hai ô hệ thống suy ra. Tách khỏi khối kết quả vì hai nhóm
          này thuộc HAI THỜI ĐIỂM và HAI NGƯỜI khác nhau: Order lúc giao, NV 3D sau khi làm.
          Trước đây chúng nằm chung một dãy lưới phẳng, cùng cỡ chữ cùng kiểu viền, nên không
          có gì phân biệt "ô tôi phải điền" với "ô sẽ tự có". */}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        Giao việc
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={ATTEMPT_FIELD_LABELS.kpiGroup}>
          <select
            value={value.phanNhom3D}
            disabled={!editable}
            onChange={(e) => props.onChange("phanNhom3D", e.target.value)}
            className={inputCls(false)}
          >
            <option value="">—</option>
            {props.groupOptions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          {props.showGroupWarning && (
            <p style={{ fontSize: "10px", color: "#b45309", marginTop: "3px", lineHeight: 1.35 }}>
              Chưa cấu hình Nhóm KPI 3D — giao việc sẽ không tính được Deadline.
              Liên hệ quản trị viên (KPI NV 3D → Cấu hình 3D KPI).
            </p>
          )}
        </Field>
        <Field label={ATTEMPT_FIELD_LABELS.designer}>
          {/* Ô chọn tuỳ biến, KHÔNG phải <select> gốc — lý do đầy đủ ở designer-3d-select.tsx.
              Tóm tắt: <option> không nhận màu nên tải công việc buộc phải là chuỗi phẳng và
              cảnh báo quá hạn chìm lẫn vào chữ xám; tệ hơn, ô khi ĐÓNG hiển thị nguyên văn
              option đã chọn nên giá trị bị dính thêm "· rảnh" dù đã quyết định xong. */}
          <Designer3DSelect
            value={value.tho3d}
            onChange={(v) => props.onChange("tho3d", v)}
            options={props.designerOptions}
            workloadByName={props.workloadByName}
            disabled={!editable}
            className={inputCls(false)}
          />
        </Field>
      </div>

      {/* ─── KHỐI "NGƯỜI VỪA CHỌN ĐANG LÀM GÌ" ĐÃ BỎ ─────────────────────────────
          Nó liệt kê từng MO người đó đang làm kèm hạn chót. Ba lý do bỏ:

          1. Ô CHỌN ĐÃ NÓI RỒI. Designer3DSelect mở ra là mỗi dòng có "2 việc · 1 quá hạn"
             hoặc "rảnh", quá hạn tô đỏ — đúng lúc đang cân nhắc chọn ai. Khối này kể lại
             cùng một chuyện ở mức chi tiết hơn, nên người đọc phải tự đối chiếu hai bên.

          2. NÓ BÁM THEO NGƯỜI ĐANG ĐƯỢC CHỌN, KHÔNG THEO HÀNH ĐỘNG CHỌN. Trên một MO đã
             giao xong từ lâu, mở sidebar ra là nó vẫn nằm đó — không liên quan gì tới việc
             người dùng đang làm.

          3. KHÔNG BỊ KHOÁ THEO QUYỀN SỬA. Từ khi PSX dùng chung khối Nhân viên 3D của PTK
             (ff3b500), nó hiện cả bên PSX — nơi chỉ đọc và không ai giao việc.

          Cái mất: sắc thái "1 việc nhưng mai tới hạn". Chấp nhận được — ca nguy hiểm thật
          (quá hạn) đã tô đỏ sẵn trong ô chọn, còn muốn xem ai đang làm gì thì màn Việc thiết
          kế 3D có đủ và lọc được theo nhân viên.

          KHÔNG chuyển sang "chỉ hiện khi có việc quá hạn": một khối xuất hiện rồi biến mất
          theo trạng thái ẩn thì người dùng không đoán được khi nào nó ra. */}

      <div className="grid grid-cols-2 gap-3">
        <Field label={ATTEMPT_FIELD_LABELS.assignedDate}>
          {/* `min` = hôm nay: KHÔNG giao lùi về ngày cũ. Luật thật nằm ở server
              (kpi-3d/assigned-at-lock.ts) — ô này chỉ để người dùng khỏi gõ rồi mới bị từ chối.

              Ràng buộc CHỈ MỘT PHÍA: ngày mai trở đi vẫn cho, vì xếp việc trước cho tuần sau là
              nghiệp vụ có thật. Trần 365 ngày để riêng cho server: gắn `max` ở đây sẽ chặn cả
              thao tác cuộn lịch, còn cái cần chặn chỉ là gõ nhầm năm. */}
          <DateInput
            value={value.ngayGiao3D}
            min={todayVnYmd()}
            disabled={!editable}
            onChange={(v) => props.onChange("ngayGiao3D", v)}
            className={inputCls(false)}
          />
        </Field>
        <Field label={ATTEMPT_FIELD_LABELS.assignedTime}>
          <TimeInput
            value={value.gioGiao3D}
            disabled={!editable}
            onChange={(v) => props.onChange("gioGiao3D", v)}
            className={inputCls(false)}
          />
        </Field>
        <Field label={ATTEMPT_FIELD_LABELS.standardHours}>
          <div className="psx-input text-sm select-none flex items-center text-gray-700">
            {props.standardHours || "—"}
          </div>
        </Field>
        <Field label={ATTEMPT_FIELD_LABELS.deadline}>
          {/* Ưu tiên deadlineAt server đã chốt — cùng nguồn với màn NV 3D. Chưa lưu thì dùng
              bản tính tạm ở trình duyệt, CÓ GIỜ đầy đủ. */}
          <div className="psx-input text-sm select-none flex items-center text-gray-700">
            {formatVnDateTime(props.deadlineAt) || "—"}
          </div>
        </Field>
      </div>

      {/* ─── KẾT QUẢ THỰC HIỆN ───────────────────────────────────────────────
          ẨN HẲN KHI CHƯA CÓ GÌ. Trước đây bốn ô này luôn hiện, nên lúc Order GIAO việc chúng
          bày ra `dd/mm/yyyy`, `0`, `—`, `—` chen vào giữa bốn ô Order đang phải điền: cần điền
          4 ô mà form hiện 10. Và có một câu văn ở cuối khối phải đứng ra giải thích vì sao mấy
          ô kia rỗng — khi phải viết đoạn văn để bù cho bố cục thì chính bố cục là chỗ sai.

          Đây cũng đúng bệnh đã chữa ở panel NV 3D (design-3d-client) mà lần đó tôi chỉ chữa
          một bên: cụm kết quả chỉ hiện khi đã hoàn tất.

          MO CŨ vẫn có đường vào: nút "Nhập kết quả thủ công" bên dưới mở khối này ra để ghi
          tay cho đơn làm xong từ trước khi có luồng giao việc mới. Ẩn mặc định chứ không bỏ —
          bỏ hẳn là những đơn đó mất luôn đường ghi ngày hoàn tất. */}
      {showResultBlock && (
      <>
      {/* Đơn đang tạm dừng thì khối này KHÔNG phải "kết quả" — nó là số chốt giữa đường. Gọi tên
          sai ở tiêu đề khiến mọi ô bên dưới bị đọc sai theo, kể cả ô Ngày HT đang trống. */}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 pt-1">
        {view?.actualMinutesFromPause ? "Ghi nhận tại lần tạm dừng" : "Kết quả thực hiện"}
      </p>
      <div className="grid grid-cols-3 gap-3">
        {/* ─── ẨN Ô CHỈ CÓ NGHĨA KHI ĐÃ HOÀN TẤT ─────────────────────────────
            Đơn đang tạm dừng thì Ngày HT / Kết quả / Kiểm nội bộ / Số ngày HT đều là "—" theo
            ĐÚNG CẤU TRÚC, không phải vì chưa ai điền: chúng chỉ có giá trị khi lượt hoàn tất.
            Bản trước vẫn bày cả bốn ô kèm một câu giải thích vì sao ô trống ("Hệ thống tự ghi
            khi NV 3D gửi kết quả") — tức khối "Ghi nhận tại lần tạm dừng" có 1 con số thật và
            4 ô rỗng, mà ô rỗng lại là thứ chiếm nhiều chữ nhất.

            Dự án đã có sẵn nguyên tắc này ở PanelRow: "panel nên nói những gì nó biết; thứ chưa
            biết thì không cần một dòng để tuyên bố là chưa biết". Chỗ này đang phá nó. */}
        {!view?.actualMinutesFromPause && (
        <Field label={ATTEMPT_FIELD_LABELS.completedDate}>
          {view ? (
            <>
              <div className="psx-input text-sm select-none flex items-center text-gray-700">
                {view.completedYmd ? formatDate(view.completedYmd) : "—"}
              </div>
              <p style={{ fontSize: "10px", color: "var(--ink-muted)", marginTop: "3px", fontStyle: "italic" }}>
                Hệ thống tự ghi khi NV 3D gửi kết quả
              </p>
            </>
          ) : props.onLegacyCompletedDateChange ? (
            <DateInput
              value={props.legacyCompletedDate ?? ""}
              disabled={!editable}
              onChange={props.onLegacyCompletedDateChange}
              className={inputCls(false)}
            />
          ) : (
            <div className="psx-input text-sm select-none flex items-center text-gray-400">—</div>
          )}
        </Field>
        )}
        {/* ─── Giờ thực tế ────────────────────────────────────────────────────
            TRƯỚC ĐÂY LÀ Ô NHẬP TAY THUẦN, và không một dòng code nào tính nó — nên đơn đã
            duyệt xong vẫn hiện "0", và "Số ngày HT" phái sinh từ nó nên hiện "—".
            Nay hệ thống tự đo (từ lúc NV nhận việc đến lúc gửi kết quả, CHỈ tính giờ làm
            việc theo Working Calendar) và đóng dấu vào cột actualMinutes. Ô này hiện số đó,
            nhưng vẫn cho Order sửa — số sửa tay thắng, và chú thích nói rõ đang đọc số nào.
            Quy tắc chọn số nằm ở kpi-3d/actual-minutes.ts, dùng chung với báo cáo KPI. */}
        <Field label={ATTEMPT_FIELD_LABELS.actualHours}>
          {/* LỖI ĐÃ SỬA: ô này từng đọc THẲNG `gioThucTe` thô từ JSON, mà JSON đang lưu 0 ở
              toàn bộ dữ liệu cũ — nên ô hiện "0" trong khi chú thích ngay dưới nói "Hệ thống tự
              ghi khi NV 3D gửi kết quả" và ô Số ngày HT hiện "—". Ba widget kể ba câu chuyện
              khác nhau về CÙNG một giá trị.
              Nay cả ba cùng đi qua resolveActualMinutes: chưa có gì thì ô để TRỐNG. */}
          <input
            type="number"
            min="0"
            step="0.5"
            value={actualHoursText}
            disabled={!editable}
            onChange={(e) => props.onChange("gioThucTe", e.target.value)}
            className={inputCls(false)}
            placeholder="—"
          />
          {/* CHIP thay cho một câu ba dòng.
              Chú thích MẶC ĐỊNH ("hệ thống đo từ lúc nhận việc đến lúc gửi kết quả") SAI HẲN khi
              số này đến từ mốc tạm dừng — đơn chưa gửi kết quả. Nhưng bản trước tôi thay nó bằng
              một câu dài hơn cả con số nó giải thích, VÀ lặp lại đúng nội dung banner tạm dừng ở
              trên ("đã tính vào KPI tháng đó"). Nay: một chữ `tạm tính` — nghĩa "chưa phải số
              cuối" nằm trong chính từ đó, còn THÁNG thì banner đã nói. */}
          {view?.actualMinutesFromPause && actual.source === "SYSTEM" ? (
            <span className="inline-block mt-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
              tạm tính
            </span>
          ) : (
            <div className="text-[10px] mt-0.5 italic leading-snug text-gray-400">
              {actualMinutesHint(actual.source)}
            </div>
          )}
        </Field>
        {/* "0 ngày" cho 0.03 giờ thì đúng về số mà vô nghĩa về tin, và nó đọc như một đơn đã
            hoàn tất trong 0 ngày. Số ngày chỉ có nghĩa khi giờ đã là số CUỐI. */}
        {!view?.actualMinutesFromPause && (
        <Field label={ATTEMPT_FIELD_LABELS.workingDays}>
          <div className="psx-input text-sm select-none flex items-center text-gray-700 italic">
            {soNgayHT != null ? `${soNgayHT} ngày` : "—"}
          </div>
        </Field>
        )}
      </div>

      {/* Kết quả + Kiểm nội bộ là PHÁN QUYẾT — chưa hoàn tất thì chưa có phán quyết nào, nên hai ô
          này luôn "—" khi đang tạm dừng. Ẩn cả hàng thay vì bày hai ô rỗng. */}
      {!view?.actualMinutesFromPause && (
      <div className="grid grid-cols-2 gap-3">
        <Field label={ATTEMPT_FIELD_LABELS.ketQua}>
          {/* Có lượt giao việc → lấy phán quyết KPI do SERVER chốt, KHÔNG dùng calcKetQua tính
              lại ở trình duyệt: calcKetQua so ngày trần nên mất giờ của deadline và dùng từ
              vựng khác ("Hoàn tất sớm" vs "Đúng hạn") — hai câu trả lời cho một câu hỏi.
              Màu tra từ TÔNG ngữ nghĩa, không so sánh chuỗi nhãn. */}
          <div className={cn(
            "psx-input text-sm select-none flex items-center font-medium",
            view
              ? TONE_TEXT_CLASS[kpiResultBadge(view.kpiStatus).tone]
              : (props.legacyKetQua === "Hoàn tất sớm" ? "text-green-700"
                 : props.legacyKetQua === "Hoàn tất trễ" ? "text-red-600"
                 : "text-gray-400"),
          )}>
            {view ? (view.ketQuaLabel || "—") : (props.legacyKetQua || "—")}
          </div>
        </Field>
        {view && (
          <Field label={ATTEMPT_FIELD_LABELS.reviewStatus}>
            <div className={cn(
              "psx-input text-sm select-none flex items-center font-medium",
              TONE_TEXT_CLASS[reviewBadge(view.reviewStatus).tone],
            )}>
              {reviewBadge(view.reviewStatus).label}
            </div>
          </Field>
        )}
      </div>
      )}
      </>
      )}

      {view && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label={ATTEMPT_FIELD_LABELS.renderInfo}>
              {view.renderInfoUrl ? (
                <a
                  href={view.renderInfoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="psx-input text-sm flex items-center gap-1.5 text-blue-700 hover:underline truncate"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" /> Mở file Render
                </a>
              ) : (
                <div className="psx-input text-sm text-gray-400 flex items-center">—</div>
              )}
            </Field>
            {/* Nhận việc — để Đặt đơn biết việc đã thật sự bàn giao chưa. Deadline tính từ
                "Giao lúc" (giá trị Order gõ tay, có thể ở tương lai), nên mốc này là bằng
                chứng duy nhất cho thời điểm NV thật sự biết. */}
            {/* CÓ GIỜ, không chỉ ngày. Mốc này để đối chiếu với "Giao lúc" — mà Deadline KPI
                tính theo giờ, và giờ thực tế cũng đo từ đây. Chỉ hiện ngày thì không thấy được
                giao 08:52 mà nhận việc 14:00, tức mất đúng thông tin cần dùng. */}
            <Field label={ATTEMPT_FIELD_LABELS.acknowledgedAt}>
              <div className={cn(
                "psx-input text-sm select-none flex items-center font-medium",
                TONE_TEXT_CLASS[acknowledgeBadge(view.acknowledgedAt).tone],
              )}>
                {view.acknowledgedAt
                  ? formatVnDateTime(view.acknowledgedAt)
                  : acknowledgeBadge(null).label}
              </div>
            </Field>
          </div>

          {/* ĐÃ BỎ ô "Thông báo Chat" (yêu cầu của user).
              Nó chiếm trọn một dòng cho một việc Order hiếm khi hành động theo, và mốc gửi
              thông báo không phải mốc nghiệp vụ — nó nói hệ thống đã chạy hay chưa.
              Thông tin đó KHÔNG mất: màn "Việc thiết kế 3D" vẫn nêu trong khối cảnh báo
              "Chưa nhận việc", đúng chỗ nó có ích — khi cần biết vì sao NV chưa mở việc thì
              phân biệt được "hệ thống chưa gửi được" với "NV chưa xem". */}

          {view.reviewStatus === "REWORK" && view.reviewNote && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-xs text-red-800">
                <span className="font-semibold">
                  Lý do làm lại{view.reworkCount > 1 ? ` (lần ${view.reworkCount})` : ""}:
                </span>{" "}
                {view.reviewNote}
              </p>
            </div>
          )}

          {props.canReview && view.reviewStatus === "PENDING_REVIEW" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-xs text-amber-800">
                Thiết kế 3D đã gửi kết quả — kiểm trước khi chuyển sang chờ khách duyệt.
              </p>
              {props.reworkOpen ? (
                <div className="space-y-2">
                  <textarea
                    value={props.reworkReason}
                    onChange={(e) => props.onReworkReasonChange(e.target.value)}
                    placeholder="Lý do yêu cầu làm lại (bắt buộc)…"
                    className="psx-input text-sm w-full"
                    rows={2}
                    disabled={props.reviewSubmitting}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={props.reviewSubmitting}
                      onClick={() => props.onDecision("REWORK")}
                      className="psx-btn text-xs h-8 bg-red-600 text-white hover:bg-red-700"
                    >
                      {props.reviewSubmitting ? "Đang gửi…" : "Xác nhận yêu cầu làm lại"}
                    </button>
                    <button
                      type="button"
                      disabled={props.reviewSubmitting}
                      onClick={props.onCancelRework}
                      className="psx-btn text-xs h-8"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={props.reviewSubmitting}
                    onClick={() => props.onDecision("ACCEPT")}
                    className="psx-btn-primary text-xs h-8"
                  >
                    {props.reviewSubmitting ? "Đang lưu…" : "Nhận kết quả 3D"}
                  </button>
                  <button
                    type="button"
                    disabled={props.reviewSubmitting}
                    onClick={props.onOpenRework}
                    className="psx-btn text-xs h-8 border-red-300 text-red-600 hover:bg-red-50"
                  >
                    Yêu cầu làm lại
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ĐÃ BỎ đoạn văn giải thích vì sao mấy ô kia rỗng.
          Câu cũ là: "Điền đủ Nhóm KPI, Nhân viên, Ngày và Giờ giao rồi bấm Lưu — các ô Nhận
          việc, Kiểm nội bộ và File Render sẽ hiện sau đó."
          Nó tồn tại vì bố cục không tự nói được điều đó. Nay các ô chưa tới lúc thì KHÔNG hiện,
          nên không còn gì phải giải thích — bố cục nói thay đoạn văn.

          Còn lại đúng một dòng ngắn nêu việc CẦN LÀM TIẾP, và đường vào cho MO cũ. */}
      {!view && !readOnly && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p style={{ fontSize: "10px", color: "var(--ink-muted)", fontStyle: "italic" }}>
            Điền đủ 4 ô trên rồi bấm Lưu để giao việc.
          </p>
          {!showResultBlock && props.onLegacyCompletedDateChange && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setManualResultOpen(true)}
              className="text-[10px] text-gray-500 hover:text-gray-700 hover:underline disabled:opacity-50 shrink-0"
            >
              Nhập kết quả thủ công
            </button>
          )}
        </div>
      )}

      {/* GIAO LƯỢT TIẾP THEO — đóng lượt này rồi mở một lượt mới, cùng người hay người khác.
          Đặt ở CUỐI khối của chính lượt đó, không phải một nút chung ở đầu tab: nó hành động lên
          MỘT lượt cụ thể, và một MO có thể có nhiều lượt song song. */}
      {props.continueContext && !readOnly && (
        <NextAttemptForm ctx={props.continueContext} disabled={disabled} />
      )}
      </>
      )}
    </div>
  );
}

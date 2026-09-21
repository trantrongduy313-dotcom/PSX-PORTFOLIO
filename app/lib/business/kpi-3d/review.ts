import { z } from "zod";

import { KPI_RESULT_LABELS, PROGRESS_STATUS_LABELS } from "@/app/lib/business/kpi-3d/progress";
import { deniedReasonFor, hasCapability } from "@/app/lib/business/kpi-3d/permissions";
import { deriveAcknowledgedAt } from "@/app/lib/business/kpi-3d/acknowledge";
import { netWorkingMinutes, type PauseSpan } from "@/app/lib/business/kpi-3d/pause";
import { alreadyCreditedMinutes } from "@/app/lib/business/kpi-3d/hours-ledger";
import {
  type Kpi3DResultStatus,
  type WorkingCalendar,
} from "@/app/lib/business/kpi-3d-deadline";

// ─── Kiểm kết quả 3D nội bộ (Order/Admin) ────────────────────────────────────
//
// KHÁC với OrderStatus.DESIGN_REVIEW ("chờ khách duyệt"): bước này là Order/Admin kiểm
// nội bộ NGAY SAU khi NV 3D bấm "Đã gửi kết quả", TRƯỚC khi gửi khách. Không tái dùng
// DESIGN_REVIEW vì hai việc khác nghĩa nhau — trộn chung sẽ không phân biệt được "đang
// chờ mình kiểm" với "đang chờ khách trả lời".
//
// Quy tắc KPI khi bị yêu cầu làm lại (quyết định của user, không phải suy đoán): GIỮ NGUYÊN
// completedAt/kpiStatus của lần gửi đầu tiên — quy tắc "đóng dấu một lần" đã có ở progress.ts
// áp dụng đúng cho việc này luôn, không cần sửa. Chất lượng (số lần bị trả về) đo RIÊNG bằng
// reworkCount, không trộn vào KPI tiến độ.
//
// File này CỐ Ý thuần (không import prisma) — cùng pattern với progress.ts/overtime.ts.

export const REVIEW_DECISION_VALUES = ["ACCEPT", "REWORK"] as const;
export type Design3DReviewDecision = (typeof REVIEW_DECISION_VALUES)[number];

/**
 * ACCEPTED là "Đã duyệt", KHÔNG phải "Đã nhận".
 *
 * Nhãn cũ đụng nghĩa với "nhận việc" của NV 3D: trong panel chi tiết có lúc ba trường cùng
 * dùng chữ "nhận" với ba nghĩa khác nhau — Tình trạng "Đã nhận" (Order đã duyệt kết quả),
 * "Nhận việc" (NV đã bấm xác nhận), và Kiểm nội bộ "Đã nhận" (lặp lại cái đầu). Người đọc
 * không có cách nào phân biệt bằng mắt. "Đã duyệt" nói đúng việc đã xảy ra và không đụng
 * với việc bàn giao.
 *
 * Khai MỘT chỗ nên đổi ở đây là đổi đồng loạt cả ba màn đang hiện nhãn này: panel Việc thiết
 * kế 3D, cột KẾT QUẢ 3D ở Danh sách đơn hàng, và sidebar đơn hàng.
 */
export const REVIEW_STATUS_LABELS = {
  PENDING_REVIEW: "Chờ kiểm",
  ACCEPTED: "Đã duyệt",
  REWORK: "Yêu cầu làm lại",
} as const;

export const reviewDecisionInputSchema = z.object({
  decision: z.enum(REVIEW_DECISION_VALUES),
  // Bắt buộc phải có lý do khi yêu cầu làm lại — NV 3D cần biết cụ thể để sửa đúng chỗ.
  note: z.string().trim().max(2000).nullable().optional(),
}).refine(
  (data) => data.decision !== "REWORK" || !!data.note?.trim(),
  { message: "Phải nêu lý do khi yêu cầu làm lại.", path: ["note"] },
);

export type ReviewDecisionInput = z.infer<typeof reviewDecisionInputSchema>;

/** Ảnh chụp assignment cần cho việc quyết định kiểm — chỉ các trường thật sự dùng tới. */
export type ReviewableAssignment = {
  id: string;
  status: string;
  completedAt: Date | null;
};

// ─── Phân quyền ───────────────────────────────────────────────────────────────
// Chỉ ADMIN và ORDER kiểm — khớp với nhóm được phép APPROVE_DESIGN của đơn hàng.
// PRODUCTION ghi được tiến độ hộ NV 3D khi vắng mặt, nhưng KHÔNG kiểm kết quả —
// hai việc khác vai trò nhau.

// Danh sách role xem CAPABILITIES.REVIEW_RESULT trong kpi-3d/permissions.ts — không khai lại ở đây.

export function isReviewer(role: string | undefined): boolean {
  return hasCapability("REVIEW_RESULT", role);
}

/** Vì sao KHÔNG được kiểm — trả null nếu hợp lệ. */
export function deniedReasonForReview(role: string | undefined, assignment: ReviewableAssignment): string | null {
  const denied = deniedReasonFor("REVIEW_RESULT", { role, designer3DId: null });
  if (denied) return denied;
  // Ràng buộc riêng của trục kiểm: phải có kết quả rồi mới kiểm được.
  if (!assignment.completedAt) {
    return "Lượt giao việc này chưa có kết quả để kiểm — NV 3D chưa gửi kết quả.";
  }
  return null;
}

/** Ánh xạ quyết định kiểm → trạng thái mới của assignment. */
export function reviewStatusAfterDecision(decision: Design3DReviewDecision): "ACCEPTED" | "REWORK" {
  return decision === "ACCEPT" ? "ACCEPTED" : "REWORK";
}

/**
 * Khi "Yêu cầu làm lại": mở lại assignment để NV 3D thấy việc cần xử lý tiếp — chuyển về
 * IN_PROGRESS. KHÔNG xóa completedAt/kpiStatus — giữ nguyên quy tắc đóng dấu một lần.
 * Khi "Nhận kết quả": không đổi status của assignment, chỉ đổi reviewStatus.
 */
export function assignmentStatusAfterReviewDecision(decision: Design3DReviewDecision): "IN_PROGRESS" | null {
  return decision === "REWORK" ? "IN_PROGRESS" : null;
}

/**
 * Duyệt xong → File Render của NV 3D thành file chính thức của MO.
 *
 * Trả link cần ghi vào `OrderItem.designFileUrl`, hoặc null nếu không đổi gì. MO nhiều NV 3D thì
 * người được duyệt SAU CÙNG là bản chính thức — có chủ ý; link cũ vẫn nằm trong Lịch sử thay đổi.
 */
export function resolveDesignFilePush(params: {
  decision: Design3DReviewDecision;
  /** Link Render mới nhất NV 3D đã nộp cho lượt giao việc này. */
  renderInfoUrl: string | null | undefined;
  /** designFileUrl MO đang có. */
  currentDesignFileUrl: string | null | undefined;
}): string | null {
  if (params.decision !== "ACCEPT") return null;

  const next = params.renderInfoUrl?.trim();
  if (!next) return null;

  return next === params.currentDesignFileUrl?.trim() ? null : next;
}

/**
 * DUYỆT XONG → CHỐT LUÔN GIỜ THỰC TẾ, không để nó tính lại mỗi lần mở sidebar.
 *
 * VÌ SAO CẦN: giờ thực tế của lượt cũ được SUY RA lúc hiển thị (xem toDesign3DAssignmentView).
 * Suy ra thì dùng lịch làm việc ĐANG ACTIVE, nên nếu admin sửa ca về sau, con số của một đơn
 * ĐÃ DUYỆT sẽ đổi theo — số liệu đã chốt mà vẫn trôi. Đó là điều không được xảy ra: duyệt
 * nghĩa là chốt.
 *
 * Nên ở đúng thời điểm duyệt, ta đóng dấu con số vào cột. Từ đó trở đi nhánh suy ra không bao
 * giờ chạy cho lượt này nữa, và mọi người đọc cùng một con số bất kể lịch có đổi.
 *
 * TRẢ null KHI KHÔNG CẦN GHI — ba trường hợp:
 *   - Không phải quyết định ACCEPT: bị trả về làm lại thì chưa chốt gì.
 *   - Cột đã có số dương: đã đóng dấu lúc NV gửi kết quả, không ghi đè.
 *   - Chưa hoàn tất hoặc không có mốc để đo: không có gì để chốt.
 */
export function resolveActualMinutesFreeze(params: {
  decision: Design3DReviewDecision;
  /** Cột actualMinutes hiện tại. */
  actualMinutes: number | null | undefined;
  completedAt: Date | null;
  acknowledgedAt: Date | null;
  assignedAt: Date | null;
  calendar?: WorkingCalendar;
  /** Khoảng bị Admin/Order bắt tạm dừng — TRỪ khỏi phép đo, xem kpi-3d/pause.ts. */
  pauses?: readonly PauseSpan[];
}): number | null {
  if (params.decision !== "ACCEPT") return null;
  return freezeActualMinutes(params);
}

/**
 * Phép chốt giờ, TÁCH KHỎI điều kiện "đã duyệt".
 *
 * Duyệt không phải lần duy nhất một lượt bị đóng vĩnh viễn: bị lấy đơn giao người khác cũng
 * đóng nó lại (xem kpi-3d/reassign.ts). Cả hai đường đều PHẢI chốt, nếu không con số vẫn được
 * suy ra lúc hiển thị và sẽ trôi theo lịch làm việc mà admin sửa về sau.
 *
 * Viết lại phép đo ở đường thứ hai là cách chắc chắn nhất để hai con số lệch nhau — nên nó
 * nằm ở đây, một chỗ, và hai đường cùng gọi vào.
 */
export function freezeActualMinutes(params: {
  actualMinutes: number | null | undefined;
  completedAt: Date | null;
  acknowledgedAt: Date | null;
  assignedAt: Date | null;
  calendar?: WorkingCalendar;
  pauses?: readonly PauseSpan[];
}): number | null {
  // Cùng quy tắc "chỉ tin số dương" với lúc hiển thị: 0 trong cột là rác do code cũ chiếu từ
  // JSON, phải được ghi lại bằng số đo thật.
  if (typeof params.actualMinutes === "number" && params.actualMinutes > 0) return null;
  if (!params.completedAt) return null;

  const from = params.acknowledgedAt ?? params.assignedAt;
  if (!from) return null;

  // TRỪ thời gian bị tạm dừng: không trừ thì ba tuần bị Admin bắt gác cũng được đóng dấu thành
  // công sức của nhân viên, và con số này bị ĐÓNG BĂNG vĩnh viễn ngay tại đây.
  const minutes = netWorkingMinutes(from, params.completedAt, params.pauses ?? [], params.calendar);
  return minutes > 0 ? minutes : null;
}

/** Kết quả thiết kế 3D của một MO, gọn về một dòng cho bảng Danh sách đơn hàng. */
export type Design3DOrderSummary = {
  /** Dấu hiệu cho Order: null = chưa ai nộp gì. */
  reviewStatus: Design3DReviewStatusValue | null;
  /** CHỈ có khi đã duyệt — xem chú thích bên dưới. */
  completedAt: Date | null;
  kpiStatus: Kpi3DResultStatus | null;
};

/**
 * Tóm tắt kết quả 3D của MỘT MO cho bảng Danh sách đơn hàng.
 *
 * Ba giá trị gộp theo BA cách khác nhau vì trả lời ba câu khác nhau: `reviewStatus` theo mức cần
 * hành động (không theo thời gian), `completedAt` lấy muộn nhất, `kpiStatus` trễ nếu có bất kỳ ai
 * trễ. Sáu test ở kpi-3d-review khoá từng cách gộp.
 */
export function summarizeDesign3DForOrder(
  assignments: Array<{
    reviewStatus: Design3DReviewStatusValue | null;
    completedAt: Date | null;
    kpiStatus: Kpi3DResultStatus | null;
  }>,
): Design3DOrderSummary {
  let anyPending = false;
  let anyRework = false;
  let anyAccepted = false;

  let completedAt: Date | null = null;
  let anyLate = false;
  let anyResult = false;

  for (const a of assignments) {
    // Suy ra cho dữ liệu cũ: đã có kết quả mà chưa ai phán quyết CHÍNH LÀ đang chờ kiểm.
    const review = deriveReviewStatus(a.reviewStatus, a.completedAt);
    if (review === "PENDING_REVIEW") anyPending = true;
    else if (review === "REWORK") anyRework = true;
    else if (review === "ACCEPTED") anyAccepted = true;

    if (review !== "ACCEPTED") continue;

    if (a.completedAt && (!completedAt || a.completedAt > completedAt)) completedAt = a.completedAt;
    if (a.kpiStatus) {
      anyResult = true;
      if (a.kpiStatus === "LATE") anyLate = true;
    }
  }

  const reviewStatus: Design3DReviewStatusValue | null =
    anyPending ? "PENDING_REVIEW" :
    anyRework  ? "REWORK" :
    anyAccepted ? "ACCEPTED" :
    null;

  return { reviewStatus, completedAt, kpiStatus: anyResult ? (anyLate ? "LATE" : "ON_TIME") : null };
}

// ─── Ghi ngược vào sidebar Danh sách đơn hàng ────────────────────────────────
// ─── Đọc kết quả 3D để hiển thị ở sidebar Danh sách đơn hàng ─────────────────
//
// TRƯỚC ĐÂY LÀM SAI: chiếu (ghi bản sao) ngày hoàn tất / kết quả KPI / trạng thái kiểm
// sang extraData JSON để sidebar đọc. Cách đó có ba lỗi, phát hiện khi rà lại:
//
//   1. `completedAt.toISOString()` bị nhét vào ô ngày mà DateInput chỉ nhận "YYYY-MM-DD" —
//      split("-") cho dd = "04T02:20:00.000Z" → render ra "04T02:20:00.000Z/08/2026".
//   2. Form KHÔNG đọc `ketQua` đã lưu mà tính lại bằng calcKetQua rồi gửi ngược lên khi
//      lưu → phán quyết "Đúng hạn" của server bị trình duyệt ghi đè bằng "Hoàn tất sớm".
//      calcKetQua còn so NGÀY TRẦN nên mất giờ của deadline (14:27 thành 00:00).
//   3. Trạng thái kiểm tồn tại ở hai nơi (bảng + JSON) → chắc chắn có ngày lệch nhau.
//
// Nay ĐỌC THẲNG từ bảng design_3d_assignments, không chiếu nữa. Hệ quả tốt kèm theo: MO
// hoàn tất từ trước khi có tính năng này cũng hiện đúng ngay, KHÔNG cần backfill.

export type Design3DAssignmentView = {
  assignmentId: string;
  /** Trạng thái kiểm ĐÃ SUY RA — không bao giờ null khi đã có kết quả để kiểm. */
  reviewStatus: Design3DReviewStatusValue | null;
  reviewNote: string | null;
  reworkCount: number;
  /** "YYYY-MM-DD" theo giờ VN — đúng định dạng ô ngày đang dùng, không phải ISO đầy đủ. */
  completedYmd: string;
  /** Nhãn kết quả KPI do SERVER chốt. Rỗng khi chưa có kết quả. */
  ketQuaLabel: string;
  /** Giữ nguyên mã trạng thái để UI tra TÔNG màu, thay vì so sánh chuỗi nhãn. */
  kpiStatus: Kpi3DResultStatus | null;
  renderInfoUrl: string;
  /** Đã hoàn tất chưa — quyết định việc khoá ô nhập tay ở sidebar. */
  isCompleted: boolean;
  /**
   * Số phút làm việc HỆ THỐNG ĐO được, đóng dấu lúc NV gửi kết quả.
   *
   * Đưa ra sidebar để ô "Giờ thực tế" hiện số này thay vì để trống — trước đây ô đó chỉ đọc
   * `gioThucTe` trong JSON, mà JSON thì không ai ghi tự động, nên đơn đã duyệt vẫn hiện 0.
   *
   * ƯU TIÊN cột `actualMinutes` đã đóng dấu; nếu cột trống thì SUY RA từ mốc nhận việc và mốc
   * hoàn tất — xem chú thích ở toDesign3DAssignmentView.
   */
  systemActualMinutes: number | null;
  /**
   * `systemActualMinutes` đang là số CHỐT TẠI LẦN TẠM DỪNG, chưa phải số cuối của cả đơn.
   *
   * Cần một cờ riêng chứ không để giao diện tự đoán: cùng một con số nhưng hai nghĩa khác nhau,
   * và chú thích mặc định ("hệ thống đo từ lúc nhận việc đến lúc gửi kết quả") sẽ SAI HẲN ở đây
   * — đơn chưa gửi kết quả. Một chú thích sai còn tệ hơn không có chú thích.
   */
  actualMinutesFromPause: boolean;
  /** Mốc NV 3D xác nhận nhận việc — null nghĩa là chưa nhận, Order cần đi nhắc. */
  acknowledgedAt: Date | null;
  /** Mốc đã gửi thông báo Google Chat — null nghĩa là chưa gửi được, Order phải biết. */
  notifiedAt: Date | null;
  /**
   * Deadline KPI ĐẦY ĐỦ GIỜ, đọc thẳng từ deadlineAt của bảng — không phải bản đã cắt giờ ở
   * JSON extraData.design.deadline (ô ngày "YYYY-MM-DD", xem lịch sử lỗi ở đầu file). Cùng
   * giá trị màn "Việc thiết kế 3D" của NV 3D đang hiện, tránh lệch số giữa hai màn.
   */
  deadlineAt: Date | null;
};

export type Design3DReviewStatusValue = "PENDING_REVIEW" | "ACCEPTED" | "REWORK";

/** Dữ liệu thô của assignment lấy từ API đơn hàng — chỉ các trường thật sự dùng tới. */
export type RawAssignmentForView = {
  id: string;
  completedAt: string | Date | null;
  kpiStatus: Kpi3DResultStatus | null;
  reviewStatus: string | null;
  reviewNote: string | null;
  reworkCount: number | null;
  acknowledgedAt?: string | Date | null;
  notifiedAt?: string | Date | null;
  deadlineAt?: string | Date | null;
  actualMinutes?: number | null;
  /** Mốc Order giao việc — mốc dự phòng khi lượt chưa có mốc nhận việc. */
  assignedAt?: string | Date | null;
  progressLogs?: Array<{ renderInfoUrl: string | null; createdAt?: string | Date | null }> | null;
};

/**
 * SUY RA trạng thái kiểm thay vì bắt dữ liệu phải có sẵn.
 *
 * Các lượt giao việc hoàn tất TRƯỚC khi có tính năng kiểm đều mang reviewStatus = NULL.
 * Nhưng "đã có kết quả mà chưa ai phán quyết" CHÍNH LÀ đang chờ kiểm — suy ra được từ dữ
 * liệu, nên không cần script backfill. Cùng nguyên tắc đã dùng để sửa lỗi `scopedItemId`.
 */
export function deriveReviewStatus(
  reviewStatus: string | null | undefined,
  completedAt: string | Date | null | undefined,
): Design3DReviewStatusValue | null {
  if (reviewStatus === "ACCEPTED" || reviewStatus === "REWORK" || reviewStatus === "PENDING_REVIEW") {
    return reviewStatus;
  }
  return completedAt ? "PENDING_REVIEW" : null;
}

/**
 * Gộp mọi thứ sidebar cần từ MỘT assignment. Trả null khi MO chưa có lượt giao việc.
 *
 * GIỜ THỰC TẾ CÓ ĐƯỜNG SUY RA, KHÔNG CẦN SCRIPT BACKFILL.
 *
 * Cột `actualMinutes` chỉ được đóng dấu từ lúc tính năng này lên, nên MỌI lượt hoàn tất TRƯỚC
 * đó đều có cột trống — và sidebar hiện "—" cho một đơn đã duyệt xong. Nhưng hai mốc cần thiết
 * (nhận việc / hoàn tất) đã nằm sẵn trong bảng từ đầu, nên tính lại được ngay.
 *
 * THỨ TỰ CÓ CHỦ Ý: cột đã đóng dấu THẮNG. Đóng dấu là con số đo bằng lịch ĐANG DÙNG LÚC ĐÓ;
 * suy ra bây giờ thì dùng lịch hiện tại, mà admin có thể đã sửa ca từ dạo đó. Nên suy ra chỉ
 * là đường dự phòng cho dữ liệu cũ, không phải cách tính chính.
 *
 * Cùng nguyên tắc đã dùng cho `deriveReviewStatus` và `deriveAcknowledgedAt`: suy ra từ dữ liệu
 * có sẵn thay vì viết script sửa hàng loạt.
 */
export function toDesign3DAssignmentView(
  assignment: RawAssignmentForView | null | undefined,
  toYmd: (date: Date) => string,
  /** Lịch làm việc để suy ra giờ thực tế cho lượt cũ. Thiếu thì dùng lịch mặc định. */
  calendar?: WorkingCalendar,
  /** Khoảng bị tạm dừng — TRỪ khỏi giờ thực tế. Không truyền = coi như chưa từng bị dừng. */
  pauses: readonly PauseSpan[] = [],
): Design3DAssignmentView | null {
  if (!assignment) return null;

  const completedAt = assignment.completedAt ? new Date(assignment.completedAt) : null;
  const valid = completedAt && !Number.isNaN(completedAt.getTime()) ? completedAt : null;

  // Suy ra mốc nhận việc cho dữ liệu cũ: đã có dòng tiến độ thì hiển nhiên NV đã biết có việc.
  const acknowledgedAt = deriveAcknowledgedAt(
    assignment.acknowledgedAt,
    // API sắp progressLogs giảm dần theo createdAt nên dòng CŨ NHẤT nằm ở cuối.
    assignment.progressLogs?.length ? assignment.progressLogs[assignment.progressLogs.length - 1]?.createdAt : null,
  );

  return {
    assignmentId: assignment.id,
    reviewStatus: deriveReviewStatus(assignment.reviewStatus, valid),
    reviewNote: assignment.reviewNote ?? null,
    reworkCount: assignment.reworkCount ?? 0,
    completedYmd: valid ? toYmd(valid) : "",
    ketQuaLabel: assignment.kpiStatus ? KPI_RESULT_LABELS[assignment.kpiStatus] : "",
    kpiStatus: assignment.kpiStatus ?? null,
    renderInfoUrl: assignment.progressLogs?.find((log) => log.renderInfoUrl)?.renderInfoUrl ?? "",
    isCompleted: !!valid,
    systemActualMinutes: resolveSystemActualMinutes(assignment, valid, acknowledgedAt, calendar, pauses),
    // Số đến từ mốc tạm dừng CHỈ KHI đơn chưa hoàn tất và cột actualMinutes chưa được đóng dấu —
    // đúng hai điều kiện mà resolveSystemActualMinutes rơi xuống nhánh giờ-đã-chốt.
    actualMinutesFromPause:
      !valid
      && !(typeof assignment.actualMinutes === "number" && assignment.actualMinutes > 0)
      && creditedPauseMinutes(pauses) > 0,
    acknowledgedAt,
    notifiedAt: toDateOrNull(assignment.notifiedAt),
    deadlineAt: toDateOrNull(assignment.deadlineAt),
  };
}

/**
 * Số phút hệ thống đo: lấy cột đã đóng dấu, hoặc suy ra cho lượt cũ.
 *
 * CHỈ SUY RA KHI ĐÃ HOÀN TẤT: chưa xong thì "giờ thực tế" chưa có nghĩa, và tính tới thời điểm
 * hiện tại sẽ ra một con số cứ lớn dần mỗi lần mở sidebar.
 *
 * Đo từ mốc NHẬN VIỆC (rơi về mốc giao khi chưa có), đúng cùng quy tắc với lúc đóng dấu ở
 * resolveAssignmentStateAfterProgress — nếu hai chỗ đo khác gốc thì lượt cũ và lượt mới sẽ
 * không so được với nhau.
 */
/**
 * Giờ đã chốt tại các lần tạm dừng — 0 nghĩa là chưa lần nào chốt.
 *
 * MỘT CHỖ DUY NHẤT, vì hai chỗ dùng nó (số giờ, và cờ nói số đó từ đâu ra) phải luôn đồng ý với
 * nhau: lệch một điều kiện là ô hiện số mà chú thích nói "hệ thống đo tới lúc gửi kết quả".
 */
function creditedPauseMinutes(pauses: readonly PauseSpan[]): number {
  return alreadyCreditedMinutes(
    pauses.map((p) => ({ pausedAt: p.pausedAt, confirmedMinutes: p.confirmedMinutes ?? null })),
  );
}

function resolveSystemActualMinutes(
  assignment: RawAssignmentForView,
  completedAt: Date | null,
  acknowledgedAt: Date | null,
  calendar?: WorkingCalendar,
  pauses: readonly PauseSpan[] = [],
): number | null {
  // CHỈ TIN SỐ ĐÃ ĐÓNG DẤU KHI NÓ DƯƠNG.
  //
  // Code cũ (assignment.ts, đã bỏ ở 09772cf) chiếu `gioThucTe` từ JSON vào cột này, và ô nhập
  // để trống lưu thành 0 — nên rất nhiều lượt đang có `actualMinutes = 0` trong bảng. Bản trước
  // chỉ xét `typeof === "number"` nên nhận luôn số 0 đó rồi DỪNG, không bao giờ rơi xuống nhánh
  // suy ra. Kết quả: đơn đã duyệt xong vẫn hiện "—" — đúng lỗi đang sửa.
  //
  // Coi 0 là chưa đóng dấu KHÔNG mất gì: nếu phép đo thật ra 0 thì nhánh suy ra bên dưới cũng
  // cho 0, chỉ khác là đi qua đường đúng.
  if (typeof assignment.actualMinutes === "number" && assignment.actualMinutes > 0) {
    return assignment.actualMinutes;
  }

  // ─── CHƯA NỘP KẾT QUẢ, NHƯNG ĐÃ CHỐT GIỜ Ở LẦN TẠM DỪNG ───────────────────
  //
  // LỖ HỔNG ĐANG BỊT: Admin gác đơn và xác nhận "nhân viên đã làm 4,2 giờ" — con số đó đi thẳng
  // vào KPI của tháng đó qua hours-ledger. Nhưng tab Thiết kế ở sidebar KHÔNG hiện nó: nhánh
  // `if (!completedAt) return null` ngay dưới đây trả null, nên `hasDesign3DResult` thành false
  // và CẢ khối "Kết quả thực hiện" không render. Người duyệt thấy một đơn đang tạm dừng mà
  // không có bất kỳ số giờ nào — trong khi KPI thì đã tính rồi.
  //
  // Đó là kiểu sai tệ nhất ở đây: số đã được dùng để tính lương nhưng không chỗ nào đọc lại được.
  //
  // Trả về số đã chốt, và ĐI QUA alreadyCreditedMinutes (lấy lần chốt CAO NHẤT, không phải lần
  // cuối) để không tự viết lại quy tắc chống rút-lại-tháng-đã-chốt ở chỗ thứ hai.
  const credited = creditedPauseMinutes(pauses);
  // `> 0` chứ không `!= null`: alreadyCreditedMinutes trả 0 cho cả "chưa từng chốt". Trả 0 ở đây
  // sẽ khiến MỌI lượt chưa nộp kết quả hiện "0 giờ" — nói dối rằng đã đo và nhân viên chưa làm gì.
  if (!completedAt) return credited > 0 ? credited : null;

  const from = acknowledgedAt ?? toDateOrNull(assignment.assignedAt);
  if (!from) return null;

  // TRẢ CẢ SỐ 0 — "đo được và ra 0" KHÁC với "không đo được".
  //
  // Bản trước gộp hai thứ đó thành null nên cả hai đều hiện "—", và đó là lý do thật khiến ô
  // vẫn trống dù đã sửa hai lần: NV bấm nhận việc rồi gửi kết quả trong CÙNG một phút (đang
  // thử nhanh trên staging) → phép đo ra 0 → bị coi như không đo được.
  //
  // Cùng lý do với một ca có thật trong sản xuất: việc làm TRỌN NGOÀI giờ hành chính (tăng ca
  // buổi tối) thì số phút làm việc theo lịch đúng bằng 0. Hiện "0 giờ" là nói thật theo định
  // nghĩa của lịch; hiện "—" là nói dối rằng không biết.
  // TRỪ thời gian bị tạm dừng. Không trừ thì con số này đo THỜI GIAN TRÔI QUA chứ không đo
  // công sức: ba tuần bị Admin bắt gác cũng được cộng vào giờ làm của nhân viên.
  return netWorkingMinutes(from, completedAt, pauses, calendar);
}

function toDateOrNull(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Nhãn ghi vào Lịch sử thay đổi của đơn khi Order/Admin kiểm — dùng chung, tránh gõ lại mỗi nơi một kiểu. */
export function reviewHistoryComment(decision: Design3DReviewDecision): string {
  return decision === "ACCEPT"
    ? `Đã nhận kết quả thiết kế 3D (${PROGRESS_STATUS_LABELS.SENT_RESULT})`
    : "Yêu cầu Thiết kế 3D làm lại";
}

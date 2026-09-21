import { z } from "zod";

import { isPaused, netWorkingMinutes, type PauseSpan } from "@/app/lib/business/kpi-3d/pause";
import {
  evaluate3DKpiCompletion,
  type Kpi3DResultStatus,
  type WorkingCalendar,
} from "@/app/lib/business/kpi-3d-deadline";
import { deniedReasonFor, hasCapability, type Kpi3DActor } from "@/app/lib/business/kpi-3d/permissions";
import { isDesignRequestOption } from "@/app/lib/business/kpi-3d/design-request";

// ─── Cập nhật tiến độ của Nhân viên Thiết kế 3D ───────────────────────────────
// Yêu cầu khách hàng #5, #6, #7 gộp về MỘT luồng duy nhất, vì chúng dính liền nhau:
//   #5 NV 3D ghi dòng tiến độ (File Render/Info, trạng thái, % tiến độ)
//   #6 khi trạng thái là "Đã gửi kết quả" → hệ thống TỰ đóng dấu giờ hoàn tất
//   #7 có giờ hoàn tất → TỰ so với Deadline KPI ra Đúng hạn / Trễ hạn + lệch bao nhiêu
//
// File này CỐ Ý là hàm thuần (không import prisma): test được toàn bộ quy tắc nghiệp vụ
// mà không cần DB — cùng pattern với app/lib/business/sheet-sync.ts.

export const PROGRESS_STATUS_VALUES = ["IN_PROGRESS", "WAITING_INFO", "SENT_RESULT"] as const;
export type Design3DProgressStatus = (typeof PROGRESS_STATUS_VALUES)[number];

/** Nhãn tiếng Việt — dùng chung cho UI lẫn nội dung log, tránh gõ lại mỗi nơi một kiểu. */
export const PROGRESS_STATUS_LABELS: Record<Design3DProgressStatus, string> = {
  IN_PROGRESS: "Đang thiết kế",
  WAITING_INFO: "Chờ thêm thông tin / phản hồi",
  SENT_RESULT: "Đã gửi kết quả",
};

/** Trạng thái đánh dấu công việc đã xong — mốc để đóng dấu giờ hoàn tất (yêu cầu #6). */
export const COMPLETION_STATUS: Design3DProgressStatus = "SENT_RESULT";

/**
 * Các trạng thái NV 3D chọn được từ ô thả xuống — CỐ Ý KHÔNG có SENT_RESULT.
 *
 * "Đã gửi kết quả" không phải một dòng cập nhật bình thường: nó đóng dấu completedAt và chốt
 * luôn phán quyết Đúng hạn / Trễ hạn vào KPI, một lần và vĩnh viễn (xem quy tắc đóng dấu một
 * lần bên dưới). Bấm nhầm không thêm một dòng vô hại — nó quyết định KPI.
 *
 * Nên nó đi qua MỘT nút riêng có bước xác nhận. Và phải BỎ nó khỏi ô thả xuống, không phải chỉ
 * thêm nút: nếu nút có xác nhận mà ô thả xuống làm được cùng việc đó không cần xác nhận thì
 * người dùng sẽ học cách dùng ô thả xuống, và lớp bảo vệ thành vô nghĩa.
 */
export const MANUAL_PROGRESS_STATUSES = PROGRESS_STATUS_VALUES.filter(
  (v) => v !== COMPLETION_STATUS,
);

/**
 * Vì sao CHƯA gửi kết quả được — null nghĩa là gửi được.
 *
 * CHỈ chặn khi thiếu File Render mà người dùng chưa xác nhận là cố ý. KHÔNG chặn cứng: có ca
 * thật cần gửi trước rồi nộp file sau, và chặn cứng sẽ đẩy họ sang nhắn tin ngoài hệ thống —
 * lúc đó không còn dấu vết nào.
 *
 * Nhưng cũng không được im lặng cho qua: hiện tại gửi mà không có link là chuyện đã xảy ra, và
 * nó tạo một ngõ cụt — người duyệt bấm Nhận mà hệ thống không có gì để đẩy về File 3D của MO
 * (xem cảnh báo ở ReviewBox). Một ô tích là chướng ngại đủ để người dùng dừng lại nghĩ.
 */
export function deniedReasonForSendResult(params: {
  hasRenderLink: boolean;
  /** Người dùng đã tích "gửi mà không có File Render". */
  acknowledgedMissingFile: boolean;
}): string | null {
  if (params.hasRenderLink) return null;
  if (params.acknowledgedMissingFile) return null;
  return "Chưa có File Render — tích xác nhận nếu bạn cố ý gửi trước rồi nộp file sau.";
}

/** Trạng thái assignment đã chốt — không cho ghi thêm tiến độ nữa. */
export const CLOSED_ASSIGNMENT_STATUSES = ["REASSIGNED", "CANCELLED"] as const;

export const progressEntryInputSchema = z.object({
  status: z.enum(PROGRESS_STATUS_VALUES),
  // % tiến độ: tùy chọn (có dòng chỉ để dán link hoặc ghi chú, chưa chốt được %).
  progressPercent: z.number().int().min(0).max(100).nullable().optional(),
  // File Render / Info: ô dán link Share Drive. Chỉ nhận http(s) để tránh javascript: URL.
  renderInfoUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "Link phải bắt đầu bằng http:// hoặc https://")
    .nullable()
    .optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  // ─── NV 3D BÁO LẠI thực tế đã làm ───────────────────────────────────────────
  //
  // Đặt đơn giao "TK mới", làm xong mới thấy thực chất là "Ước lượng" — ô này để NV 3D nói ra,
  // cho Đặt đơn/Admin thấy và tự quyết có sửa yêu cầu hay không.
  //
  // 🔴 KHÔNG GHI ĐÈ "Yêu cầu thiết kế". Trường kia là câu hỏi của Đặt đơn; đây là câu trả lời.
  // Ghi đè là xoá mất chính thứ cần kiểm soát — sau đó không ai biết ban đầu đã yêu cầu gì.
  //
  // 🔴 KHÔNG ẢNH HƯỞNG KPI. Deadline sinh từ Nhóm KPI 3D (`phanNhom3D`), một trường RIÊNG BIỆT,
  // không suy ra từ Yêu cầu thiết kế. Nên báo lệch không dời deadline, không đổi Đúng/Trễ hạn,
  // không sửa lượt đã đóng dấu. Muốn nó ảnh hưởng KPI là một tính năng khác, phải quyết ở tầng
  // nghiệp vụ trước.
  //
  // ⚠️ TÙY CHỌN, và điều đó có giá: không đổi thì NV gửi luôn, không phải chạm ô. Nên `null`
  // GỘP hai loại người — người xác nhận đúng yêu cầu và người bỏ qua ô. Đếm trên cột này chỉ
  // trả lời "bao nhiêu đơn ĐƯỢC BÁO là lệch", KHÔNG phải "bao nhiêu đơn lệch". Đừng đọc số 0
  // thành "không có đơn nào lệch".
  //
  // Ép thuộc DANH MỤC ở đây, không tin client: ô chọn ở giao diện đã giới hạn, nhưng request
  // thì ai cũng gửi được. Một giá trị lạ lọt vào là cột này thôi so được với `yeucauThietKe`.
  reportedDesignRequest: z
    .string()
    .trim()
    .refine((v) => v === "" || isDesignRequestOption(v), "Giá trị không có trong danh mục Yêu cầu thiết kế")
    .nullable()
    .optional(),
});

export type ProgressEntryInput = z.infer<typeof progressEntryInputSchema>;

/** Ảnh chụp assignment cần cho việc quyết định — chỉ các trường thật sự dùng tới. */
export type AssignmentSnapshot = {
  id: string;
  designer3DId: string;
  deadlineAt: Date;
  status: string;
  completedAt: Date | null;
  /** Mốc NV 3D bấm "Xác nhận nhận việc". null = chưa nhận. */
  acknowledgedAt: Date | null;
  /** Mốc Order giao việc — mốc dự phòng để đo giờ thực tế khi không có mốc nhận việc. */
  assignedAt: Date;
  /**
   * Các khoảng bị Admin/Order bắt TẠM DỪNG. Trừ khỏi giờ thực tế — xem kpi-3d/pause.ts.
   *
   * Mặc định mảng rỗng để mọi nơi gọi cũ vẫn chạy đúng như trước (chưa từng bị dừng).
   */
  pauses?: readonly PauseSpan[];
};

/** Phần cần ghi đè lên assignment sau khi thêm 1 dòng tiến độ. */
export type AssignmentStatePatch = {
  status: Design3DProgressStatus;
  completedAt?: Date;
  kpiStatus?: Kpi3DResultStatus;
  kpiDeltaMinutes?: number;
  /** Số phút LÀM VIỆC thật sự đã dùng — xem chú thích ở resolveAssignmentStateAfterProgress. */
  actualMinutes?: number;
};

/**
 * Từ 1 dòng tiến độ mới → suy ra assignment phải đổi thành gì.
 *
 * Quy tắc "đóng dấu MỘT LẦN" (yêu cầu #6): giờ hoàn tất chỉ được ghi ở LẦN ĐẦU chuyển sang
 * "Đã gửi kết quả". Nếu NV gửi lại lần 2 (VD sửa link render), giữ nguyên mốc hoàn tất gốc —
 * nếu không, mỗi lần bấm lại sẽ dời deadline-vs-thực-tế và làm sai kết quả đánh giá KPI.
 *
 * GIỜ THỰC TẾ CŨNG ĐÓNG DẤU Ở ĐÂY, cùng lúc và cùng quy tắc một lần.
 *
 * Đo từ mốc NV BẤM NHẬN VIỆC, không phải mốc Order giao (quyết định của user): Order giao
 * 08:52 mà NV chỉ thấy việc lúc 14:00 thì 5 giờ đó không phải lỗi của NV. Không có mốc nhận
 * việc (dữ liệu cũ, hoặc PRODUCTION ghi hộ khi NV vắng) thì rơi về mốc giao — thà đo hơi rộng
 * còn hơn để trống.
 *
 * VÌ SAO ĐÓNG DẤU CHỨ KHÔNG TÍNH LẠI LÚC HIỂN THỊ: admin sửa Working Calendar về sau thì con
 * số lịch sử sẽ trôi theo, và báo cáo KPI của tháng trước đổi số mà không ai chạm vào nó.
 * `standardMinutesSnapshot` đã theo đúng nguyên tắc này từ đầu.
 */
export function resolveAssignmentStateAfterProgress(
  assignment: AssignmentSnapshot,
  entry: { status: Design3DProgressStatus },
  now: Date,
  /** Lịch đã sinh ra deadline của chính lượt này. Thiếu thì dùng lịch mặc định. */
  calendar?: WorkingCalendar,
): AssignmentStatePatch {
  const patch: AssignmentStatePatch = { status: entry.status };

  if (entry.status !== COMPLETION_STATUS) return patch;
  if (assignment.completedAt) return patch; // đã đóng dấu trước đó — không ghi đè

  // TRUYỀN `calendar`: khoảng cách tới deadline được đo bằng GIỜ LÀM VIỆC, nên nó phải dùng
  // ĐÚNG cái lịch đã sinh ra deadline của lượt này. Để hàm rơi về lịch mặc định là đo bằng một
  // lịch khác lịch đã ra hạn — sai âm thầm, và con số này ĐÓNG DẤU MỘT LẦN nên sai vĩnh viễn.
  const evaluation = evaluate3DKpiCompletion(assignment.deadlineAt, now, calendar);
  patch.completedAt = now;
  patch.kpiStatus = evaluation.status;
  patch.kpiDeltaMinutes = evaluation.deltaMinutes;
  // TRỪ thời gian bị tạm dừng. Đây là chỗ ĐÓNG DẤU — con số ghi ra ở đây theo quy tắc
  // "đóng dấu một lần" sẽ không được tính lại nữa, nên sai ở đây là sai vĩnh viễn.
  patch.actualMinutes = netWorkingMinutes(
    assignment.acknowledgedAt ?? assignment.assignedAt,
    now,
    assignment.pauses ?? [],
    calendar,
  );
  return patch;
}

/**
 * Vì sao KHÔNG cho ghi tiến độ — trả null nếu hợp lệ, trả câu tiếng Việt nếu bị chặn.
 *
 * NHẬN VIỆC LÀ CỬA VÀO, KHÔNG PHẢI MỘT TRỤC SONG SONG. Trước đây hai việc chạy độc lập: NV 3D
 * ghi tiến độ được mà chưa từng bấm "Xác nhận nhận việc". Hệ quả là mốc nhận việc mất hết ý
 * nghĩa — bộ phận Đặt đơn nhìn vào thấy "Chưa nhận việc" trong khi người ta đã làm xong, nên
 * không còn dùng nó để biết cần nhắc ai nữa.
 *
 * Nay phải nhận việc trước. Việc đang làm dở mà chưa nhận sẽ bị chặn ngay lần cập nhật kế
 * tiếp, nhưng KHÔNG tắc: nút "Xác nhận nhận việc" luôn hiện khi chưa nhận, chỉ tốn một cú bấm.
 */
export function blockedReasonForProgress(
  assignment: AssignmentSnapshot,
  /**
   * Trạng thái của dòng tiến độ đang muốn ghi. Bỏ trống = chỉ xét các luật không phụ thuộc nó.
   *
   * Cần biết vì lúc ĐANG BỊ GÁC, hai việc bị xử lý khác nhau — xem luật cuối hàm.
   */
  entryStatus?: string,
): string | null {
  if ((CLOSED_ASSIGNMENT_STATUSES as readonly string[]).includes(assignment.status)) {
    return "Lượt giao việc này đã đóng — không thể cập nhật tiến độ.";
  }
  if (!assignment.acknowledgedAt) {
    return "Bạn chưa xác nhận nhận việc. Bấm \"Xác nhận nhận việc\" trước khi cập nhật tiến độ.";
  }

  // ─── ĐANG BỊ GÁC: GHI TIẾN ĐỘ ĐƯỢC, GỬI KẾT QUẢ THÌ KHÔNG ─────────────────
  //
  // ⚠️ ĐÂY LÀ ĐẢO NGƯỢC MỘT QUYẾT ĐỊNH CŨ CỦA CHÍNH ROUTE NÀY, và lý do cũ vẫn đáng đọc: bản
  // trước cố ý cho nộp khi đang dừng vì "nhân viên làm xong rồi mà không nộp được thì phải đi xin
  // mở lại — một ngõ cụt do hệ thống tự tạo ra".
  //
  // Nhưng nghiệp vụ đã đổi: TẠM DỪNG NAY LÀ CHỐT SỔ CHO PHIÊN ĐÓ. Số giờ của nhân viên được xác
  // nhận ngay tại mốc dừng (Design3DPause.confirmedMinutes) và đi vào KPI của tháng đó. Cho gửi
  // kết quả sau đó nghĩa là đóng dấu `completedAt` + phán quyết Đúng/Trễ hạn lên một phiên đã
  // được chốt bằng con số khác — hai lần chốt trên cùng một lượt, và không ai đọc được cái nào
  // mới là thật.
  //
  // KHÔNG chặn các dòng tiến độ khác: ghi lại File Render / ghi chú trong lúc đơn bị gác là vô
  // hại (không đụng tới giờ công, không đụng deadline) và là thứ cần được ghi nhận.
  //
  // Muốn làm tiếp thì Đặt đơn/Admin giao lượt MỚI ở tab Thiết kế của đơn hàng — mỗi phiên một
  // lượt riêng, KPI tính lại từ đầu cho phiên đó.
  if (entryStatus === COMPLETION_STATUS && isPaused(assignment.pauses ?? [])) {
    return "Đơn đang tạm dừng — không gửi kết quả được. Giờ công của giai đoạn này đã được chốt tại mốc tạm dừng. Cần làm tiếp thì Đặt đơn/Admin giao lượt mới ở tab Thiết kế của đơn hàng.";
  }
  return null;
}

// ─── Phân quyền (yêu cầu #5) ─────────────────────────────────────────────────
// "NV 3D chỉ được cập nhật kết quả đối với các đơn hàng do mình phụ trách."
//
// Quy tắc THẬT nằm ở kpi-3d/permissions.ts — nơi duy nhất viết ràng buộc sở hữu. Trước đây
// mỗi trục tự viết lại ba bước kiểm tra đó, nên cùng một quy tắc bảo mật tồn tại hai bản.
// Các hàm dưới đây chỉ còn là lớp mỏng giữ nguyên tên gọi cho chỗ đang dùng.

export type ProgressActor = Kpi3DActor;

export function canReadProgress(role: string | undefined): boolean {
  return hasCapability("READ_ASSIGNMENTS", role);
}

/** Vì sao KHÔNG được ghi tiến độ — trả null nếu được phép. */
export function deniedReasonForProgressWrite(
  actor: ProgressActor,
  assignment: AssignmentSnapshot,
): string | null {
  return deniedReasonFor("WRITE_PROGRESS", actor, assignment);
}

// ─── Hiển thị kết quả KPI (yêu cầu #7) ───────────────────────────────────────

/**
 * "Sớm 1 giờ 30 phút" / "Trễ 45 phút" / "Đúng hạn" — dùng chung cho UI và báo cáo.
 *
 * ⚠️ `deltaMinutes` nay đo bằng GIỜ LÀM VIỆC (xem evaluate3DKpiCompletion), và điều đó tạo ra
 * một ca mới mà bản trước hiểu sai: NỘP TRỄ NHƯNG 0 PHÚT LÀM VIỆC.
 *
 * Deadline 17:00, nộp 18:00 cùng ngày → trễ thật, nhưng giữa hai mốc không có phút làm việc
 * nào. Bản trước gặp `abs === 0` là trả "Đúng hạn (vừa kịp)" BẤT KỂ status — tức là gọi một
 * lượt TRỄ thành đúng hạn. Đây là con số dùng để chấm điểm người, nên nói sai theo chiều có
 * lợi cũng là nói sai.
 */
export function formatKpiDelta(kpiStatus: Kpi3DResultStatus | null, deltaMinutes: number | null): string {
  if (!kpiStatus || deltaMinutes == null) return "—";

  const abs = Math.abs(deltaMinutes);
  if (abs === 0) {
    return kpiStatus === "ON_TIME"
      ? "Đúng hạn (vừa kịp)"
      : "Trễ (nộp ngoài giờ làm việc)";
  }

  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const amount = [hours > 0 ? `${hours} giờ` : "", minutes > 0 ? `${minutes} phút` : ""]
    .filter(Boolean)
    .join(" ");

  return kpiStatus === "ON_TIME" ? `Sớm ${amount}` : `Trễ ${amount}`;
}

export const KPI_RESULT_LABELS: Record<Kpi3DResultStatus, string> = {
  ON_TIME: "Đúng hạn",
  LATE: "Trễ hạn",
};

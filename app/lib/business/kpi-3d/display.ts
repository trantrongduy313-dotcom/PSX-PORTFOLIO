import { KPI_RESULT_LABELS, PROGRESS_STATUS_LABELS, type Design3DProgressStatus } from "@/app/lib/business/kpi-3d/progress";
import { REVIEW_STATUS_LABELS, type Design3DReviewStatusValue } from "@/app/lib/business/kpi-3d/review";
import {
  isPendingReview,
  isReviewAccepted,
  isReworkRequested,
  type PanelActionRow,
} from "@/app/lib/business/kpi-3d/review-queue";
import type { Kpi3DResultStatus } from "@/app/lib/business/kpi-3d-deadline";

// ─── Trạng thái 3D → nhãn + TÔNG ngữ nghĩa ───────────────────────────────────
//
// VÌ SAO CÓ FILE NÀY: nhãn thì đã gom về module business, nhưng MÀU thì hardcode tại từng
// chỗ dùng — `#15803d` xuất hiện 4 lần trong design-3d-client, `text-green-700` rải khắp
// order-detail-panel. Hai màn còn dùng hai hệ khác nhau (inline hex vs Tailwind class), nên
// cùng một trạng thái hiện ra bằng hai từ vựng thị giác.
//
// Tệ hơn, panel từng quyết định màu bằng cách SO SÁNH CHUỖI NHÃN:
//     design3DView.ketQuaLabel === "Đúng hạn" ? "text-green-700" : ...
// Đổi một chữ trong nhãn là màu vỡ âm thầm — nhãn hiển thị không phải thứ để suy luận.
//
// Nay mỗi trạng thái trả về { label, tone } với tone là Ý NGHĨA, không phải màu. Mỗi màn tự
// ánh xạ tone sang style của mình MỘT LẦN. Đổi bảng màu = sửa một chỗ trong mỗi màn.
//
// File thuần để test trực tiếp.

/** Ý nghĩa của trạng thái, KHÔNG phải màu. Màn hình tự chọn màu tương ứng. */
export type StatusTone = "positive" | "warning" | "critical" | "neutral" | "info";

export type StatusBadge = {
  label: string;
  tone: StatusTone;
};

/** Kết quả KPI: đúng hạn / trễ hạn. */
export function kpiResultBadge(kpiStatus: Kpi3DResultStatus | null | undefined): StatusBadge {
  if (!kpiStatus) return { label: "—", tone: "neutral" };
  return {
    label: KPI_RESULT_LABELS[kpiStatus],
    tone: kpiStatus === "ON_TIME" ? "positive" : "critical",
  };
}

/** Trạng thái kiểm nội bộ của Order/Admin. */
export function reviewBadge(reviewStatus: Design3DReviewStatusValue | null | undefined): StatusBadge {
  if (!reviewStatus) return { label: "—", tone: "neutral" };
  return {
    label: REVIEW_STATUS_LABELS[reviewStatus],
    // Chờ kiểm là việc CẦN AI ĐÓ LÀM → warning, không phải neutral: nó phải nổi lên để
    // Order thấy mà xử lý, chứ không lẫn vào các ô trống.
    tone:
      reviewStatus === "ACCEPTED" ? "positive" :
      reviewStatus === "REWORK" ? "critical" :
      "warning",
  };
}

/**
 * Trạng thái thực hiện của NV 3D, suy từ dòng tiến độ mới nhất và trạng thái nhận việc.
 *
 * `acknowledged` tách "chưa nhận việc" (cần nhắc) khỏi "đã nhận, chưa bắt đầu" (bình thường).
 * Trước đây cả hai đều hiện "Chưa bắt đầu" màu xám nên Order không phân biệt được — một
 * người chưa hề biết có việc và một người đang đọc yêu cầu trông y như nhau.
 */
export function progressBadge(params: {
  assignmentStatus: string;
  latestProgressStatus?: Design3DProgressStatus | null;
  acknowledged: boolean;
}): StatusBadge {
  if (params.assignmentStatus === "CANCELLED") return { label: "Đã hủy", tone: "neutral" };
  if (params.assignmentStatus === "REASSIGNED") return { label: "Đã giao lại", tone: "neutral" };

  if (params.latestProgressStatus) {
    return {
      label: PROGRESS_STATUS_LABELS[params.latestProgressStatus],
      tone:
        params.latestProgressStatus === "SENT_RESULT" ? "positive" :
        params.latestProgressStatus === "WAITING_INFO" ? "warning" :
        "info",
    };
  }

  return params.acknowledged
    ? { label: "Đã nhận, chưa bắt đầu", tone: "info" }
    : { label: "Chưa nhận việc", tone: "warning" };
}

// ─── MỘT THANG TRẠNG THÁI DUY NHẤT cho cột "Tình trạng" ──────────────────────
//
// VÌ SAO GỘP: bảng từng có HAI cột trạng thái cạnh nhau — "Trạng thái" (progressBadge) và
// "Kiểm nội bộ" (reviewBadge). Chúng KHÔNG phải hai trục độc lập mà là các chặng liên tiếp
// của một vòng đời: một việc không thể vừa "đang thiết kế" vừa "chờ kiểm". Hai cột tồn tại
// chỉ vì được thêm vào ở hai thời điểm khác nhau.
//
// Và cách chia đó gây ra một lỗi đọc thật: khi NV vừa nộp bài, cột trái ghi "Đã gửi kết quả"
// với tone POSITIVE (xanh lá, nghĩa "xong rồi") còn cột phải ghi "Chờ kiểm" với tone WARNING
// (hổ phách, nghĩa "có người phải xử lý"). CÙNG MỘT thời điểm, sơn hai màu đối nghịch cạnh
// nhau — mắt đọc xanh lá trước rồi kết luận sai là việc đã xong.
//
// Nay một ô, một chip, một thang. Thứ tự các nhánh dùng CHUNG GỐC với design3DPanelAction()
// ở review-queue.ts (cùng ba vị từ isReviewAccepted / isReworkRequested / isPendingReview),
// nên chip trong bảng và khối thao tác trong panel không thể nói hai điều khác nhau.

/** Nhãn NGẮN cho bảng. Câu đầy đủ giữ ở panel — nhãn bảng và nhãn diễn giải không cần trùng. */
const LIFECYCLE_SHORT_LABELS = {
  WAITING_INFO: "Chờ phản hồi",
  NOT_STARTED: "Chưa bắt đầu",
} as const;

export type LifecycleRow = PanelActionRow & {
  latestProgressStatus?: Design3DProgressStatus | null;
};

/**
 * Việc này đang ở chặng nào — một nhãn, một tông.
 *
 * THỨ TỰ CÓ CHỦ Ý:
 *   - Đã huỷ / đã giao lại thắng mọi thứ: lượt đó không còn chạy nữa.
 *   - Ba chặng của trục kiểm đứng TRƯỚC trục tiến độ, vì khi đã nộp bài thì "đang thiết kế"
 *     không còn là thông tin đúng nữa — thứ cần biết là ai phải hành động tiếp.
 *   - "Chờ kiểm" còn nhận thêm trường hợp dòng tiến độ mới nhất là SENT_RESULT mà completedAt
 *     chưa kịp có: thà nói chờ kiểm còn hơn tụt xuống "chưa bắt đầu" — sai một chặng về phía
 *     an toàn, không phải sai về phía làm mất việc.
 *   - "Chưa nhận việc" đứng trước tiến độ: chưa nhận thì server chặn ghi tiến độ, nên đó mới
 *     là việc cần làm.
 */
export function design3DLifecycleBadge(row: LifecycleRow): StatusBadge {
  if (row.status === "CANCELLED") return { label: "Đã hủy", tone: "neutral" };
  if (row.status === "REASSIGNED") return { label: "Đã giao lại", tone: "neutral" };

  if (isReviewAccepted(row)) return { label: REVIEW_STATUS_LABELS.ACCEPTED, tone: "positive" };
  if (isReworkRequested(row)) return { label: REVIEW_STATUS_LABELS.REWORK, tone: "critical" };
  if (isPendingReview(row) || row.latestProgressStatus === "SENT_RESULT") {
    return { label: REVIEW_STATUS_LABELS.PENDING_REVIEW, tone: "warning" };
  }

  if (!row.acknowledgedAt) return { label: "Chưa nhận việc", tone: "warning" };

  if (row.latestProgressStatus === "WAITING_INFO") {
    return { label: LIFECYCLE_SHORT_LABELS.WAITING_INFO, tone: "warning" };
  }
  if (row.latestProgressStatus === "IN_PROGRESS") {
    return { label: PROGRESS_STATUS_LABELS.IN_PROGRESS, tone: "info" };
  }

  return { label: LIFECYCLE_SHORT_LABELS.NOT_STARTED, tone: "info" };
}

/**
 * Còn bao lâu tới deadline, hoặc đã trễ bao lâu — dòng phụ dưới ô Deadline KPI.
 *
 * VÌ SAO CẦN: "17:00 05/08" bắt người đọc tự trừ ngày trong đầu để biết có gấp hay không.
 * "còn 2 ngày" / "trễ 3 giờ" trả lời thẳng câu họ đang hỏi.
 *
 * Trả rỗng khi lượt đã xong hoặc đã đóng: lúc đó khoảng cách tới deadline không còn là việc
 * cần hành động, đã có cột KPI nói nó đúng hạn hay trễ.
 */
export function formatDeadlineDistance(deadlineAt: Date, now: Date): string {
  const ms = deadlineAt.getTime() - now.getTime();
  const late = ms < 0;
  const mins = Math.floor(Math.abs(ms) / 60000);

  // Dưới một giờ vẫn nói theo phút — "còn 0 giờ" là câu vô nghĩa đúng lúc gấp nhất.
  const amount =
    mins < 60 ? `${mins} phút` :
    mins < 60 * 24 ? `${Math.floor(mins / 60)} giờ` :
    `${Math.floor(mins / (60 * 24))} ngày`;

  return late ? `trễ ${amount}` : `còn ${amount}`;
}

/**
 * Đã trôi qua bao lâu kể từ một mốc — dùng cho cảnh báo "giao rồi mà chưa nhận việc".
 *
 * VÌ SAO CẦN: "chưa nhận việc" một mình KHÔNG nói được có vấn đề hay không. Mới giao 5 phút
 * thì bình thường; giao 2 ngày rồi mà chưa ai mở thì phải đi gọi. Con số này là thứ biến một
 * dòng trạng thái thành một việc cần làm.
 */
export function formatElapsed(from: Date, now: Date): string {
  const mins = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60000));
  if (mins < 60) return `${mins} phút`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} giờ`;
  return `${Math.floor(mins / (60 * 24))} ngày`;
}

/** Trạng thái nhận việc — hiển thị riêng cho Order theo dõi việc bàn giao. */
export function acknowledgeBadge(acknowledgedAt: Date | string | null | undefined): StatusBadge {
  return acknowledgedAt
    ? { label: "Đã nhận việc", tone: "positive" }
    : { label: "Chưa nhận việc", tone: "warning" };
}

/**
 * Đã gửi thông báo Google Chat chưa.
 *
 * Ghép với acknowledgeBadge thành cặp cho Order: "đã gửi" mà mãi "chưa nhận" thì biết chính
 * xác cần nhắc ai. Thất bại phải NHÌN THẤY — im lặng khiến Order tưởng nhân viên đã biết.
 */
export function notifyBadge(notifiedAt: Date | string | null | undefined): StatusBadge {
  return notifiedAt
    ? { label: "Đã gửi thông báo", tone: "positive" }
    : { label: "Chưa gửi được thông báo", tone: "warning" };
}

/**
 * Panel chi tiết nên hiện khối giải thích NÀO — hoặc không hiện gì.
 *
 * HAI KHỐI LOẠI TRỪ NHAU, và thứ tự là chỗ đã sai:
 *
 * Khi đổi người, lượt CŨ được đặt reviewStatus = REWORK — cần thiết, nếu không nó nằm mãi
 * trong hàng chờ kiểm. Nhưng panel lại dựa vào đúng cờ đó để in ra "Lý do làm lại", nên nhân
 * viên bị lấy đơn đọc được một lời mời đi sửa bài, trong khi server đã CHẶN họ ghi tiến độ.
 * Giao diện hứa một việc hệ thống sẽ từ chối — đúng lỗi đã phải chữa vài lần ở màn này.
 *
 * REASSIGNED xét TRƯỚC: lượt đã bị lấy đi thì "làm lại" không còn là thông tin đúng nữa, thứ
 * cần biết là chuyển cho ai và công của mình có được tính không.
 *
 * Cùng nguyên tắc với design3DLifecycleBadge ở trên: thứ tự nằm ở MỘT chỗ, kiểm được bằng
 * test, không rải trong JSX.
 */
export type Design3DNoticeKind = "REASSIGNED" | "REWORK" | null;

export function design3DNoticeKind(row: {
  reassignedAt?: Date | string | null;
  reviewStatus?: string | null;
  reviewNote?: string | null;
}): Design3DNoticeKind {
  if (row.reassignedAt) return "REASSIGNED";
  // Không có lý do thì khối "làm lại" chỉ còn cái tiêu đề — không nói thêm gì so với chip.
  if (row.reviewStatus === "REWORK" && row.reviewNote?.trim()) return "REWORK";
  return null;
}

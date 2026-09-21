import type { Design3DProgressStatus } from "@/app/lib/business/kpi-3d/progress";

// ─── Hình dữ liệu màn Việc thiết kế 3D nhận từ API ────────────────────────────
//
// Tách khỏi design-3d-client.tsx vì `progress-form.tsx` cần đúng ba type này. Để chúng ở client
// rồi export sẽ tạo vòng tròn import (client → form → client) — chạy được cho tới một ngày thứ
// tự nạp module đổi.
//
// ⚠️ ĐÂY LÀ MÔ TẢ CỦA RESPONSE, KHÔNG PHẢI CỦA BẢNG DATABASE. Nguồn thật là `listSelect` ở
// app/api/design-3d/assignments/route.ts. Thêm trường vào một bên mà quên bên kia thì màn hình
// âm thầm nhận `undefined` — nên sửa một bên là sang xem bên kia.

export type ProgressLog = {
  id: string;
  status: Design3DProgressStatus;
  progressPercent: number | null;
  renderInfoUrl: string | null;
  /** Thực tế NV 3D báo đã làm ở CHÍNH dòng này. null = dòng này không kèm báo cáo. */
  reportedDesignRequest: string | null;
  createdAt: string;
};

export type Assignment = {
  id: string;
  status: string;
  assignedAt: string;
  deadlineAt: string;
  completedAt: string | null;
  kpiStatus: "ON_TIME" | "LATE" | null;
  kpiDeltaMinutes: number | null;
  standardMinutesSnapshot: number;
  /** Giờ thực tế hệ thống đo (phút). null hoặc 0 = chưa có số đo — xem kpi-usage.ts. */
  actualMinutes: number | null;
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; name: string } | null;
  /** Mốc đã gửi thông báo Google Chat. null = chưa gửi được — người giao việc phải biết. */
  notifiedAt: string | null;
  /** Lịch sử tạm dừng, MỚI NHẤT TRƯỚC. resumedAt = null nghĩa là đang bị gác. */
  pauses: Array<{
    id: string; pausedAt: string; resumedAt: string | null; reason: string;
    /** Giờ đã chốt tại mốc dừng — dùng để suy ra ngân sách còn lại khi mở lại. */
    confirmedMinutes: number | null;
  }>;
  reviewStatus: "PENDING_REVIEW" | "ACCEPTED" | "REWORK" | null;
  reviewNote: string | null;
  reworkCount: number;
  /**
   * Công của lượt này có được tính KPI không — CHỈ có nghĩa khi đi cùng reassignedAt.
   * Với lượt bình thường nó luôn true và không hiện ra đâu cả.
   */
  kpiCounted: boolean;
  /** Mốc bị lấy đơn giao người khác. null = lượt vẫn là của mình. */
  reassignedAt: string | null;
  /** Lượt kế thừa — ai nhận tiếp. Rỗng nếu lượt này chưa bị chuyển. */
  reassignedTo: Array<{ id: string; assignedAt: string; designer3D: { id: string; name: string } | null }>;
  designer3D: { id: string; name: string; code: string } | null;
  kpiGroup: { id: string; name: string; code: string } | null;
  order: { id: string; orderNumber: string; customerName: string | null } | null;
  /**
   * "Yêu cầu thiết kế" (Làm INFO / TK mới / Chỉnh size…) — server RÚT SẴN từ
   * ProductionDetail.extraData rồi mới trả về. Client cố ý không nhận nguyên khối JSON đó: nó là
   * dữ liệu gộp của cả đơn, gấp nhiều lần phần còn lại của response. Xem kpi-3d/design-request.ts.
   */
  yeucauThietKe: string | null;
  /** Diễn giải sản phẩm Order viết cho NV 3D. KHÔNG phải orderItem.techNote — xem design-request.ts. */
  yeucauKyThuat: string | null;
  orderItem: {
    id: string; moNumber: string | null; productName: string | null;
    // Ưu tiên của VIỆC THIẾT KẾ (trục riêng) + ưu tiên của ĐƠN, để so ra "đơn gấp mà thiết kế
    // chưa xếp ưu tiên". Hai con số KHÁC NHAU — xem kpi-3d/design-priority.ts.
    design3DPriorityCode: string | null; priorityCode: string | null;
    // Tài liệu để LÀM ĐƯỢC VIỆC, không chỉ để biết có việc.
    designImageUrl: string | null; designFileUrl: string | null;
    sampleImageUrl: string | null;
    /** Ảnh mẫu Order upload thẳng (≤2). Hiện thành ảnh thật, không phải link chữ. */
    sampleImageUploads: string[];
    /** ⚠️ Cột cũ — chỉ để lùi về khi `sampleFolderUrl` chưa có. */
    sampleVideoUrl: string | null;
    /** "Folder mẫu" — link Drive nhiều ảnh + video. */
    sampleFolderUrl: string | null;
    // Thông số để DỰNG ĐƯỢC MẪU — xem chú thích ở listSelect của API.
    // "Diễn giải SP" — cột thật của OrderItem, KHÁC `yeucauKyThuat` ở trên. Xem product-specs.ts.
    techNote: string | null;
    nvl: string | null; size: string | null; weightGram: string | number | null;
    quantity: number | null; platingType: string | null;
    mainStoneType: string | null; mainStoneSize: string | null; mainStoneQty: number | null;
    techClassification: string[] | null; color: string | null; engraving: string | null;
  } | null;
  progressLogs: ProgressLog[];
  /**
   * Link Render mới nhất — do server tính, KHÔNG suy từ progressLogs[0].
   * progressLogs chỉ có dòng cập nhật mới nhất, mà dòng đó có thể là một ghi chú không kèm
   * link. Xem chú thích ở api/design-3d/assignments/route.ts.
   */
  latestRenderInfoUrl: string | null;
  /**
   * Thực tế NV 3D BÁO đã làm, mới nhất — do server lấy từ dòng log mới nhất CÓ báo cáo.
   *
   * 🔴 null KHÔNG có nghĩa "trùng yêu cầu". Ô báo cáo là tùy chọn, nên null gộp cả người xác
   * nhận đúng yêu cầu và người bỏ qua ô. Chỉ được đọc là "chưa ai báo gì".
   *
   * Lệch = có giá trị VÀ khác `yeucauThietKe`. Không suy được từ progressLogs[0]: dòng mới nhất
   * có thể là một ghi chú không kèm báo cáo — cùng cái bẫy của latestRenderInfoUrl.
   */
  latestReportedDesignRequest: string | null;
};

/**
 * Phần lượt giao việc mà route `progress` trả về sau khi ghi — hẹp hơn `Assignment` rất nhiều.
 * Khai riêng để nếu route bỏ đi một trường thì `tsc` báo ngay tại chỗ vá cache, thay vì màn hình
 * âm thầm nhận `undefined` và ghi đè một giá trị đang đúng.
 */
export type SavedAssignment = Pick<
  Assignment,
  "status" | "completedAt" | "acknowledgedAt" | "kpiStatus" | "kpiDeltaMinutes" | "reviewStatus" | "pauses"
>;

// ─── Phân quyền cho MỌI hành động trên lượt giao việc 3D ─────────────────────
//
// VÌ SAO GOM VỀ MỘT CHỖ: trước đây mỗi trục nghiệp vụ tự viết hàm phân quyền riêng
// (progress.ts, overtime.ts, review.ts → 7 hàm). Quy tắc quan trọng nhất — "NV 3D chỉ được
// tác động lên đơn do mình phụ trách" — bị viết HAI LẦN độc lập, cùng ba bước nhưng khác
// cách diễn đạt:
//
//   progress.ts  deniedReasonForProgressWrite   → "Bạn chỉ được cập nhật các đơn do mình phụ trách."
//   overtime.ts  deniedReasonForOvertimeCreate  → "Bạn chỉ được khai báo tăng ca cho đơn do mình phụ trách."
//
// Đó là một QUY TẮC BẢO MẬT BỊ NHÂN BẢN: sửa một bản mà quên bản kia là ra lỗ phân quyền.
// Thêm trục thứ tư ("xác nhận nhận việc") theo lối cũ sẽ thành bản sao thứ ba.
//
// Nay khai báo theo NĂNG LỰC: mỗi năng lực nói rõ role nào được làm và có đòi sở hữu
// assignment hay không. Quy tắc sở hữu viết MỘT LẦN, ở hàm requireCapability bên dưới.
// Thêm năng lực mới về sau = thêm MỘT DÒNG trong CAPABILITIES, không phải viết hàm mới.
// Cùng khuôn config-driven mà dự án đã dùng cho REPORT_FIELDS và SYNC_FIELDS.
//
// File thuần (không prisma, không "server-only") để test trực tiếp.

/** Người đang thực hiện hành động. `designer3DId` là hồ sơ NV 3D gắn với tài khoản (null nếu không phải NV 3D). */
export type Kpi3DActor = {
  role: string | undefined;
  designer3DId: string | null;
  userId?: string | null;
};

/** Phần thông tin của assignment cần để xét quyền — chỉ chủ sở hữu, không hơn. */
export type AssignmentOwnership = {
  designer3DId: string;
};

export type Kpi3DCapability =
  | "READ_ASSIGNMENTS"
  | "ACKNOWLEDGE"
  | "WRITE_PROGRESS"
  | "REVIEW_RESULT"
  | "REASSIGN_ASSIGNMENT"
  | "PAUSE_ASSIGNMENT"
  | "READ_WORKLOAD"
  | "DECLARE_OVERTIME"
  | "APPROVE_OVERTIME"
  | "VIEW_OVERTIME_RECORD";

type CapabilityRule = {
  /** Role được phép. Danh sách rỗng nghĩa là không ai — dùng để khoá tạm một năng lực. */
  roles: readonly string[];
  /**
   * NV 3D có bắt buộc phải là người được giao assignment này không.
   * Các role điều hành (ADMIN/ORDER/PRODUCTION) KHÔNG bị ràng buộc này — họ cần xử lý hộ
   * khi nhân viên vắng mặt.
   */
  requiresOwnership: boolean;
  /** Câu từ chối khi role không nằm trong danh sách. */
  deniedMessage: string;
};

/**
 * BẢNG KHAI BÁO DUY NHẤT. Muốn biết "ai được làm gì với lượt giao việc 3D" thì đọc đúng ở đây,
 * không phải đi đọc bảy hàm rải trong bốn file.
 */
export const CAPABILITIES: Record<Kpi3DCapability, CapabilityRule> = {
  READ_ASSIGNMENTS: {
    roles: ["ADMIN", "ORDER", "PRODUCTION", "DESIGN_3D"],
    requiresOwnership: false, // phạm vi dữ liệu của NV 3D bị ép ở tầng truy vấn, không ở đây
    deniedMessage: "Bạn không có quyền xem việc thiết kế 3D.",
  },

  // Xác nhận đã nhận việc: chỉ NV 3D phụ trách, hoặc ADMIN/ORDER xác nhận hộ khi NV vắng mặt
  // (vẫn ghi lại AI bấm, nên phân biệt được "NV tự nhận" với "Order nhận hộ").
  ACKNOWLEDGE: {
    roles: ["ADMIN", "ORDER", "DESIGN_3D"],
    requiresOwnership: true,
    deniedMessage: "Bạn không có quyền xác nhận nhận việc thiết kế 3D.",
  },

  WRITE_PROGRESS: {
    roles: ["ADMIN", "ORDER", "PRODUCTION", "DESIGN_3D"],
    requiresOwnership: true,
    deniedMessage: "Bạn không có quyền cập nhật tiến độ 3D.",
  },

  // Kiểm kết quả nội bộ — khớp nhóm được phép APPROVE_DESIGN của đơn hàng.
  // PRODUCTION ghi tiến độ hộ được nhưng KHÔNG kiểm kết quả: hai vai trò khác nhau.
  REVIEW_RESULT: {
    roles: ["ADMIN", "ORDER"],
    requiresOwnership: false,
    deniedMessage: "Bạn không có quyền kiểm kết quả thiết kế 3D.",
  },
  // Không duyệt → chuyển đơn sang NV 3D khác. CÙNG nhóm role với REVIEW_RESULT vì nó là một
  // nhánh của chính việc kiểm kết quả, nhưng khai riêng: hành động này còn quyết định CÓ TÍNH
  // KPI cho người cũ hay không — một quyết định đụng tới lương. Gộp vào REVIEW_RESULT thì về
  // sau muốn siết riêng nhóm được đổi người sẽ phải tách ngược, và lúc đó dễ sót chỗ.
  REASSIGN_ASSIGNMENT: {
    roles: ["ADMIN", "ORDER"],
    requiresOwnership: false,
    deniedMessage: "Chỉ Admin/Đặt đơn được chuyển việc thiết kế 3D sang nhân viên khác.",
  },

  // Tạm dừng / mở lại — DỪNG ĐỒNG HỒ KPI.
  //
  // CỐ Ý KHÔNG cho DESIGN_3D, kể cả với việc của chính họ. Tạm dừng vừa trừ giờ thực tế vừa dời
  // deadline, nên nếu người ĐƯỢC CHẤM ĐIỂM tự bấm được thì KPI không còn nghĩa gì: chỉ cần bấm
  // dừng mỗi khi rời bàn là mọi đơn đều đúng hạn. PRODUCTION cũng không — họ ghi tiến độ hộ khi
  // NV vắng, nhưng gác đơn là quyết định điều hành.
  PAUSE_ASSIGNMENT: {
    roles: ["ADMIN", "ORDER"],
    requiresOwnership: false,
    deniedMessage: "Chỉ Admin/Order được tạm dừng hoặc mở lại việc thiết kế 3D.",
  },

  // Xem tải công việc của TOÀN BỘ NV 3D — chỉ người đi giao việc mới cần. NV 3D không cần
  // biết đồng nghiệp đang gánh bao nhiêu, và PRODUCTION cũng không giao việc 3D.
  READ_WORKLOAD: {
    roles: ["ADMIN", "ORDER"],
    requiresOwnership: false,
    deniedMessage: "Bạn không có quyền xem tải công việc của Nhân viên Thiết kế 3D.",
  },

  DECLARE_OVERTIME: {
    roles: ["ADMIN", "ORDER", "PRODUCTION", "DESIGN_3D"],
    requiresOwnership: true,
    deniedMessage: "Bạn không có quyền khai báo tăng ca.",
  },

  APPROVE_OVERTIME: {
    roles: ["ADMIN", "PRODUCTION"],
    requiresOwnership: false,
    deniedMessage: "Chỉ Leader/Giám sát được phê duyệt tăng ca.",
  },

  // Xem BẢN GHI tăng ca đã duyệt gắn trên đơn hàng (khối "Tăng ca" ở tab Thiết kế).
  //
  // Hẹp hơn DECLARE_OVERTIME có chủ ý: đây là dữ liệu LƯƠNG. Đặt đơn cần thấy vì họ là người
  // đối chiếu công việc trên đơn; Admin cần thấy vì họ chốt sổ. SALES và PRODUCTION không có
  // việc gì với số giờ làm thêm của một nhân viên thiết kế.
  //
  // NV 3D không nằm ở đây KHÔNG có nghĩa là họ không xem được khai báo của mình — tab Tăng ca
  // vẫn cho họ xem, và route đó tự thu hẹp về đúng hồ sơ của họ. Năng lực này chỉ nói về khối
  // hiện trên ĐƠN HÀNG, nơi có cả dữ liệu của người khác.
  VIEW_OVERTIME_RECORD: {
    roles: ["ADMIN", "ORDER"],
    requiresOwnership: false,
    deniedMessage: "Bạn không có quyền xem giờ tăng ca đã duyệt của Nhân viên Thiết kế 3D.",
  },
};

/** Role có nằm trong danh sách của năng lực này không. Dùng cho các chỗ chỉ cần kiểm role. */
export function hasCapability(capability: Kpi3DCapability, role: string | undefined): boolean {
  return CAPABILITIES[capability].roles.includes(role ?? "");
}

/**
 * Vì sao KHÔNG được thực hiện — trả null nếu được phép.
 *
 * ĐÂY là nơi duy nhất viết quy tắc sở hữu. Ba bước, đúng thứ tự:
 *   1. Role phải nằm trong danh sách của năng lực.
 *   2. Nếu là NV 3D và năng lực đòi sở hữu → tài khoản phải được gắn hồ sơ NV 3D.
 *   3. Hồ sơ đó phải đúng là người được giao assignment này.
 *
 * `assignment` để undefined khi năng lực không cần biết assignment nào (VD: READ_ASSIGNMENTS).
 * Nhưng nếu năng lực ĐÒI sở hữu mà không truyền assignment thì CHẶN — thiếu dữ liệu để xét
 * quyền thì phải từ chối, không được cho qua.
 */
export function deniedReasonFor(
  capability: Kpi3DCapability,
  actor: Kpi3DActor,
  assignment?: AssignmentOwnership | null,
): string | null {
  const rule = CAPABILITIES[capability];

  if (!rule.roles.includes(actor.role ?? "")) return rule.deniedMessage;
  if (!rule.requiresOwnership) return null;

  // Role điều hành không bị ràng buộc sở hữu — xử lý hộ khi nhân viên vắng mặt.
  if (actor.role !== "DESIGN_3D") return null;

  if (!actor.designer3DId) {
    return "Tài khoản của bạn chưa được gắn với hồ sơ Nhân viên Thiết kế 3D.";
  }
  if (!assignment) {
    // Không biết đơn của ai thì không thể kết luận là của mình.
    return "Không xác định được lượt giao việc để kiểm tra quyền.";
  }
  if (actor.designer3DId !== assignment.designer3DId) {
    return "Bạn chỉ được thao tác trên các đơn do mình phụ trách.";
  }
  return null;
}

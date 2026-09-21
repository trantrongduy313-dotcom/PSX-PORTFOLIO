import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { calculate3DKpiDeadline } from "@/app/lib/business/kpi-3d-deadline";
import {
  configuredCalendarToWorkingCalendar,
  formatDateOnly,
  formatTimeOnly,
  parseWallDateTime,
} from "@/app/lib/business/kpi-3d/calendar-adapter";
import { deniedReasonForOrderFormAssign } from "@/app/lib/business/kpi-3d/approved-lock";
import {
  freezeMinutesOnHandover,
  handoverClosureData,
  type HandoverPause,
} from "@/app/lib/business/kpi-3d/handover-freeze";
import { deniedReasonForAssignedAt } from "@/app/lib/business/kpi-3d/assigned-at-lock";
import {
  CARRIED_FROM_KEY,
  carriedBlocksAwaitingAssign,
  carryOverWarning,
} from "@/app/lib/business/kpi-3d/version-carryover";
import { toVnYmd } from "@/app/lib/utils/vn-date";
import {
  itemsEligibleForOrphanCheck,
  orphanNeedsDecisionWarning,
  planOrphanClosures,
  readDesign3DTraces,
} from "@/app/lib/business/kpi-3d/orphan-assignments";
import {
  readDesign3DBlocks,
  type Design3DRejectedBlock,
  resolveDesign3DSyncTargets,
  type Design3DAssignmentFields,
  type Design3DBlock,
} from "@/app/lib/business/kpi-3d/assignment-targets";

type Transaction = Prisma.TransactionClient;

type SyncParams = {
  orderId: string;
  orderItemId: string;
  extraData: Record<string, unknown>;
  assignedById?: string | null;
};

export type Design3DAssignmentLegacyPatch = {
  /** Khối nào trong payload nhận bản vá này: 0 = khối gốc, >=1 = designers[slot-1]. */
  slot: number;
  phanNhom3D: string;
  soGioDuKien: number;
  deadline: string;
  ngayGiao3D: string;
  gioGiao3D: string;
  kpi3DAssignmentId: string;
  kpi3DGroupId: string;
  kpi3DStandardMinutes: number;
  kpi3DDeadlineAt: string;
  /**
   * XOÁ cờ kế thừa. Tới được bản vá nghĩa là lượt đã được tạo/khớp thật, nên khối này không còn
   * là "bản sao chờ quyết định" nữa. Dùng `null` chứ không phải xoá khoá: applyDesign3DPatches
   * ghi theo phép trộn object, một khoá vắng mặt sẽ GIỮ NGUYÊN giá trị cũ — tức cờ không bao
   * giờ mất và cảnh báo sẽ đọng lại vĩnh viễn trên một khối đã giao xong.
   */
  [CARRIED_FROM_KEY]: null;
};

// Kết quả đồng bộ, phân biệt RÕ ba tình huống — trước đây gộp hết thành `null` nên khi cấu
// hình thiếu, hệ thống lặng lẽ không tạo assignment và người dùng không biết vì sao việc
// không hiện ra ở màn "Việc thiết kế 3D".
//
//   SKIPPED — chưa điền đủ 4 ô giao việc. BÌNH THƯỜNG (user đang nhập dở), không cảnh báo.
//   OK      — đã tạo/khớp assignment.
//   BLOCKED — đã điền đủ nhưng cấu hình thiếu. PHẢI báo cho người dùng biết lý do.
//
// `created` phân biệt "VỪA TẠO lượt giao việc mới" với "khớp lượt đã có". Cần thiết vì hàm này
// chạy ở MỌI lần lưu tab Thiết kế: nếu gửi thông báo Google Chat mỗi lần thấy OK thì Order lưu
// đơn 5 lần là nhân viên nhận 5 tin giống nhau, rồi họ sẽ bỏ qua thông báo — lúc đó tính năng
// còn tệ hơn là không có.
export type Design3DSyncResult =
  | { status: "SKIPPED" }
  | { status: "OK"; patch: Design3DAssignmentLegacyPatch; created: boolean; assignmentId: string }
  | {
      status: "BLOCKED";
      reason: string;
      /**
       * TỪ CHỐI VĨNH VIỄN — khối này phải bị RÚT khỏi extraData, không được lưu lại.
       *
       * Phân biệt với chặn vì THIẾU CẤU HÌNH: cái đó sẽ hợp lệ ngay khi admin bật cấu hình, nên
       * giữ ô người dùng vừa điền là đúng. Còn vi phạm luật (MO đã duyệt, cùng người hai khối)
       * thì KHÔNG BAO GIỜ hợp lệ — giữ lại là giữ một lời nói dối vĩnh viễn trên màn hình.
       *
       * Xem removeDesign3DBlocks.
       */
      rejected?: { slot: number; revertDesignerName?: string | null };
    };

/**
 * Các trạng thái coi là "lượt giao việc còn sống".
 *
 * ĐƯỢC EXPORT vì đây là định nghĩa duy nhất của "đang có người làm MO này", và nơi khác cần đúng
 * câu trả lời đó (VD: có nên gửi thông báo đổi ưu tiên thiết kế không). Chép lại mảng này ở chỗ
 * thứ hai là tạo hai định nghĩa cho một sự thật — thêm một trạng thái mới thì một trong hai chỗ
 * sẽ bị bỏ quên.
 *
 * ⚠️ Tạm dừng KHÔNG đổi status, nên một lượt đang bị gác vẫn nằm trong danh sách này.
 */
export const ACTIVE_ASSIGNMENT_STATUSES = ["ASSIGNED", "IN_PROGRESS", "WAITING_INFO", "SENT_RESULT"] as const;

function comparable(value: string) {
  return value.normalize("NFC").trim().toLowerCase();
}

function hoursFromMinutes(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100;
}

function legacyPatchFromAssignment(params: {
  slot: number;
  assignmentId: string;
  groupId: string;
  groupName: string;
  standardMinutes: number;
  assignedAt: Date;
  deadlineAt: Date;
}): Design3DAssignmentLegacyPatch {
  return {
    slot: params.slot,
    phanNhom3D: params.groupName,
    soGioDuKien: hoursFromMinutes(params.standardMinutes),
    deadline: formatDateOnly(params.deadlineAt),
    // Ghi lại NGÀY giao, không chỉ giờ — thiếu dòng này là nguồn của lỗi bàn giao: lần lưu
    // sau đọc lại "ngày giao" cũ (của nhân viên trước) trong khi "giờ giao" đã là của người
    // mới, hai giá trị đó không khớp với BẤT KỲ assignedAt thật nào → hệ thống hiểu lầm là
    // một lượt giao việc khác nữa, tạo thêm bản ghi + gửi thêm thông báo mỗi lần lưu đơn.
    ngayGiao3D: formatDateOnly(params.assignedAt),
    gioGiao3D: formatTimeOnly(params.assignedAt),
    kpi3DAssignmentId: params.assignmentId,
    kpi3DGroupId: params.groupId,
    kpi3DStandardMinutes: params.standardMinutes,
    kpi3DDeadlineAt: params.deadlineAt.toISOString(),
    // Lượt đã có thật → khối không còn là bản sao chờ quyết định. Xem chú thích ở kiểu.
    [CARRIED_FROM_KEY]: null,
  };
}

/**
 * Mốc "assignedAt" cho lần lưu này. Mặc định đọc hai ô người dùng nhập.
 *
 * Ngoại lệ — BÀN GIAO: đổi người mà hai ô ngày/giờ vẫn y hệt giá trị cũ thì đó là giá trị SÓT
 * LẠI, không phải mốc giao thật → dùng `now`, để người mới không bị chấm trễ vì người trước lỡ
 * hẹn. Order chủ động sửa ngày/giờ thì tôn trọng giá trị đã nhập.
 *
 * Ba test ở kpi-3d-assignment-sync khoá cả ba nhánh.
 */
function resolveAssignedAtForSave(
  fields: Design3DAssignmentFields,
  activeAssignment: { designer3DId: string; assignedAt: Date } | null,
  newDesignerId: string,
  now: Date,
): Date {
  const isHandover = !!activeAssignment && activeAssignment.designer3DId !== newDesignerId;

  if (isHandover && activeAssignment) {
    const staleDate = formatDateOnly(activeAssignment.assignedAt);
    const staleTime = formatTimeOnly(activeAssignment.assignedAt);
    if (fields.assignedDate === staleDate && fields.assignedTime === staleTime) {
      return now;
    }
  }

  return parseWallDateTime(fields.assignedDate, fields.assignedTime);
}

/**
 * Dữ liệu cấu hình dùng chung cho MỌI MO trong cùng một lần lưu.
 *
 * Tách ra khỏi hàm sync để nạp MỘT LẦN rồi truyền vào: trước đây mỗi lần gọi lại nạp lại
 * toàn bộ danh sách nhân viên + nhóm KPI + lịch làm việc, nên khi xử lý nhiều MO một lượt
 * sẽ lặp lại đúng bấy nhiêu truy vấn.
 */
export type Design3DLookups = Awaited<ReturnType<typeof loadDesign3DLookups>>;

export async function loadDesign3DLookups(tx: Transaction) {
  const [designers, groups, calendar] = await Promise.all([
    tx.designer3D.findMany({ where: { isActive: true } }),
    tx.kpi3DGroup.findMany({ where: { isActive: true } }),
    tx.workingCalendar.findFirst({
      where: { isActive: true },
      include: { sessions: true, holidays: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
  ]);
  return { designers, groups, calendar };
}

/** Lượt giao việc còn hiệu lực của MỘT MO, nạp một lần rồi khớp dần cho từng khối. */
type ActiveAssignment = {
  id: string;
  designer3DId: string;
  kpiGroupId: string;
  assignedAt: Date;
  standardMinutesSnapshot: number;
  deadlineAt: Date;
  actualMinutes: number | null;
  completedAt: Date | null;
  /** Đang có lần tạm dừng chưa đóng — khoá y như đã hoàn tất. Xem approved-lock.ts. */
  hasOpenPause: boolean;
  /**
   * BỐN THỨ DƯỚI chỉ để CHỐT GIỜ khi lượt này bị đổi người — xem handover-freeze.ts.
   *
   * Không nạp chúng thì đường lưu form không có cách nào đo được số giờ người cũ đã bỏ ra, và
   * nó sẽ tiếp tục đóng lượt bằng đúng một dòng `status: "REASSIGNED"` — để lại con số phình ra
   * theo thời gian người MỚI làm.
   */
  acknowledgedAt: Date | null;
  pauses: HandoverPause[];
  calendar: Parameters<typeof freezeMinutesOnHandover>[0]["calendar"];
  /**
   * BẮT BUỘC cho luật "đã duyệt thì không giao thêm KPI".
   *
   * ⚠️ Duyệt KHÔNG đổi `status` — `assignmentStatusAfterReviewDecision` chỉ trả về giá trị khi
   * REWORK, còn ACCEPT thì để nguyên. Nên một lượt ĐÃ DUYỆT vẫn mang status SENT_RESULT, tức vẫn
   * nằm trong ACTIVE_ASSIGNMENT_STATUSES và vẫn được nạp vào `active`. Không đọc `reviewStatus`
   * thì ở đây không có cách nào biết nó đã được chốt.
   */
  reviewStatus: string | null;
};

/**
 * Khối này ứng với lượt giao việc nào đang có?
 *
 * ƯU TIÊN 1 — `kpi3DAssignmentId` mà lần lưu trước đã ghi ngược vào chính khối này. Đây là mối
 * liên kết TƯỜNG MINH, không phải suy đoán. Với một MO nhiều người thì đoán sai đồng nghĩa ghi
 * KPI của người này sang người kia, nên tường minh là bắt buộc chứ không phải tối ưu.
 *
 * ƯU TIÊN 2 — cùng nhân viên. Dành cho dữ liệu cũ chưa kịp mang id, và cho trường hợp Order
 * gõ lại đúng người đó ở một khối khác.
 *
 * `claimed` chặn hai khối cùng nhận một lượt: nếu không có nó, thêm người thứ hai trùng tên
 * người thứ nhất sẽ khiến cả hai khối trỏ về một dòng và một người biến mất khỏi báo cáo.
 */
function matchAssignment(
  block: Design3DBlock,
  designerId: string,
  active: ActiveAssignment[],
  claimed: Set<string>,
): ActiveAssignment | null {
  const free = active.filter((a) => !claimed.has(a.id));
  if (block.assignmentId) {
    const byId = free.find((a) => a.id === block.assignmentId);
    if (byId) return byId;
  }

  const byDesigner = free.find((a) => a.designer3DId === designerId);
  if (byDesigner) return byDesigner;

  // ƯU TIÊN 3 — CHỈ cho khối gốc (slot 0) và CHỈ khi nó chưa mang id: dữ liệu có từ trước khi
  // có tính năng nhiều người. Lúc đó MO chỉ có một lượt và khối gốc chính là nó, nên đổi tên
  // trong ô đó là BÀN GIAO — phải đóng lượt cũ, không phải mở thêm lượt song song.
  //
  // Không mở rộng cho slot >= 1: các ô đó luôn được ghi id ngay lần lưu đầu, nên "không có id"
  // ở đó nghĩa là NGƯỜI MỚI VỪA THÊM. Vơ lấy một lượt đang chạy sẽ cướp việc của người khác.
  if (block.slot === 0 && !block.assignmentId) {
    // `free` giữ thứ tự createdAt tăng dần → phần tử đầu là lượt của người thứ nhất.
    return free[0] ?? null;
  }
  return null;
}

export async function syncDesign3DAssignmentBlock(
  tx: Transaction,
  lookups: Design3DLookups,
  params: SyncParams & {
    block: Design3DBlock;
    active: ActiveAssignment[];
    claimed: Set<string>;
    /** NV 3D đã được khối trước của CÙNG MO này dùng — chặn chọn trùng người. */
    usedDesignerIds: Set<string>;
  },
  // Mốc "bây giờ" của lần lưu — tách khỏi Date.now() để test được (giống pattern acknowledge.ts,
  // progress.ts). Dùng khi PHÁT HIỆN BÀN GIAO (xem resolveAssignedAtForSave bên dưới).
  now: Date,
): Promise<Design3DSyncResult> {
  const fields: Design3DAssignmentFields = params.block;
  const { designers, groups, calendar } = lookups;

  const designer = designers.find((item) => comparable(item.name) === comparable(fields.designerName));
  const group = groups.find(
    (item) => comparable(item.name) === comparable(fields.groupName) || comparable(item.code) === comparable(fields.groupName),
  );

  // Nêu ĐÍCH DANH thứ đang thiếu — người dùng tự xử lý được thay vì phải đi hỏi.
  if (!designer) {
    return { status: "BLOCKED", reason: `Không tìm thấy Nhân viên Thiết kế 3D "${fields.designerName}" đang hoạt động trong danh mục.` };
  }
  if (!group) {
    return { status: "BLOCKED", reason: `Nhóm KPI 3D "${fields.groupName}" chưa được cấu hình hoặc chưa bật. Vào KPI NV 3D → Cấu hình 3D KPI để bật.` };
  }
  if (group.standardMinutes <= 0) {
    return { status: "BLOCKED", reason: `Nhóm KPI 3D "${group.name}" chưa nhập số giờ KPI chuẩn. Vào KPI NV 3D → Cấu hình 3D KPI để nhập.` };
  }
  if (!calendar) {
    return { status: "BLOCKED", reason: "Chưa có Lịch làm việc nào đang hoạt động — không tính được Deadline KPI." };
  }

  // Cùng một người ở HAI KHỐI của một MO nghĩa là hai lượt CHẠY SONG SONG, và im lặng chấp nhận
  // sẽ đếm đôi suất giờ KPI của chính họ, đếm đôi tải công việc, và không ai phân biệt được kết
  // quả nào thuộc lượt nào.
  //
  // ⚠️ CHỈ CHẶN SONG SONG, KHÔNG CHẶN NHIỀU LẦN. Một người nhận nhiều lượt cho một MO là hợp lệ và
  // là nghiệp vụ có thật (làm dở → tạm dừng → làm tiếp; hoặc giao thêm một lượt nữa) — các lượt đó
  // TUẦN TỰ, lượt cũ đã đóng nên không nằm trong `usedDesignerIds`.
  //
  // Câu thông báo cũ nói "Mỗi người chỉ nhận một lượt giao việc cho một MO" — KHÔNG CÒN ĐÚNG kể từ
  // khi có luồng giao lượt tiếp theo, và người dùng đọc nó rồi tưởng hệ thống không hỗ trợ làm
  // nhiều lần. Nên câu mới phải nói rõ "cùng lúc" và CHỈ ĐƯỜNG sang đúng cửa.
  if (params.usedDesignerIds.has(designer.id)) {
    return {
      status: "BLOCKED",
      reason: `Nhân viên Thiết kế 3D "${designer.name}" đã có một lượt đang chạy cho MO này. Một người không nhận hai lượt CÙNG LÚC — nếu muốn họ làm thêm một lượt nữa, bấm "Giao lượt tiếp theo" ở khối của họ (lượt đang chạy sẽ được chốt giờ trước).`,
      rejected: { slot: params.block.slot },
    };
  }
  params.usedDesignerIds.add(designer.id);

  // Khối tự khai là cũ: nó nêu tên một lượt không còn trong `active`. CHẶN, không đoán tiếp —
  // đoán tiếp là đường ghi mốc giao + ngân sách cũ lên lượt mới, hoặc tạo một suất KPI từ hư
  // không. Test: "khối mang id của một lượt ĐÃ ĐÓNG → BLOCKED" ở kpi-3d-assignment-sync.
  if (params.block.assignmentId && !params.active.some((a) => a.id === params.block.assignmentId)) {
    return {
      status: "BLOCKED",
      reason: `Khối Nhân viên 3D "${designer.name}" đang giữ dữ liệu CŨ: lượt giao việc của khối này đã được chốt/giao lại ở màn Việc thiết kế 3D. Hãy tải lại đơn rồi lưu, để không ghi đè mốc giao và số giờ KPI của lượt hiện tại.`,
    };
  }

  const matched = matchAssignment(params.block, designer.id, params.active, params.claimed);

  // ĐÃ DUYỆT LÀ CHỐT. Luật đầy đủ + vì sao đường này không tự thấy được: kpi-3d/approved-lock.ts.
  const lockReason = deniedReasonForOrderFormAssign({
    matched: matched
      ? { reviewStatus: matched.reviewStatus, designer3DId: matched.designer3DId, hasOpenPause: matched.hasOpenPause }
      : null,
    designerId: designer.id,
    designerName: designer.name,
    active: params.active,
  });
  if (lockReason) {
    // Tên cũ để TRẢ LẠI ô khối gốc: khối slot 0 không xoá được (nó còn mang nhóm KPI, mốc giao,
    // ghi chú), thứ bị từ chối chỉ là cái tên vừa đổi.
    const previousName = matched
      ? designers.find((d) => d.id === matched.designer3DId)?.name ?? null
      : null;
    return {
      status: "BLOCKED",
      reason: lockReason,
      rejected: { slot: params.block.slot, revertDesignerName: previousName },
    };
  }

  // KHÔNG còn ghi `actualMinutes` từ JSON nữa.
  //
  // Cột đó nay là SỐ HỆ THỐNG ĐO, đóng dấu một lần lúc NV gửi kết quả
  // (resolveAssignmentStateAfterProgress). Còn `gioThucTe` trong JSON là SỐ ORDER SỬA TAY.
  // Hai con số hai nghĩa khác nhau — xem kpi-3d/actual-minutes.ts.
  //
  // Nếu vẫn chiếu JSON vào cột thì mỗi lần Order lưu đơn sẽ ghi đè số hệ thống vừa đo bằng
  // số cũ trong JSON (thường là 0), và con số hệ thống biến mất mà không ai thấy.

  // Lượt giao việc gắn CHẾT với một nhân viên: đổi tên trong cùng một ô nghĩa là BÀN GIAO
  // cho người khác, không phải sửa thuộc tính của lượt cũ. Người cũ giữ nguyên lịch sử và
  // phán quyết KPI của họ; người mới bắt đầu một lượt riêng.
  const isHandover = !!matched && matched.designer3DId !== designer.id;
  const assignedAt = resolveAssignedAtForSave(
    fields,
    isHandover && matched ? { designer3DId: matched.designer3DId, assignedAt: matched.assignedAt } : null,
    designer.id,
    now,
  );

  // ─── KHÔNG GIAO LÙI VỀ NGÀY CŨ ────────────────────────────────────────────
  // Luật + ba hậu quả đầy đủ ở kpi-3d/assigned-at-lock.ts (có unit test riêng).
  //
  // Đặt SAU khi đã dựng `assignedAt` và TRƯỚC mọi lệnh ghi: chốt phải xét đúng con số sắp vào
  // bảng, không phải chuỗi người dùng gõ — `resolveAssignedAtForSave` có nhánh tự đẩy về `now`
  // khi bàn giao mà ô ngày còn mang mốc cũ của người trước.
  //
  // KHÔNG kèm `rejected`: mốc giao sai không phải lỗi của ô TÊN nhân viên, xoá tên họ vừa chọn
  // là bắt gõ lại một thứ vốn không sai. Người dùng sửa lại ô ngày rồi lưu tiếp.
  const badAssignedAt = deniedReasonForAssignedAt({
    assignedYmd: toVnYmd(assignedAt),
    previousYmd: matched ? toVnYmd(matched.assignedAt) : null,
    todayVnYmd: toVnYmd(now),
  });
  if (badAssignedAt) {
    return { status: "BLOCKED", reason: badAssignedAt };
  }

  if (matched && !isHandover) {
    params.claimed.add(matched.id);

    // Cùng người, cùng nhóm, cùng mốc giao → KHÔNG còn gì phải ghi vào bảng.
    //
    // Giờ thực tế sửa tay nằm ở extraData JSON (route đơn hàng lo lưu), không phải ở cột này —
    // nên nhánh này không còn lệnh UPDATE nào.
    //
    // ĐÃ HOÀN TẤT thì cũng đi nhánh này dù nhóm/mốc giao có khác: kpiStatus đã đóng dấu dựa
    // trên deadline lúc đó, tính lại deadline bây giờ sẽ khiến phán quyết Đúng/Trễ hạn của một
    // việc ĐÃ XONG đổi nghĩa.
    // ĐANG TẠM DỪNG đi CHUNG nhánh với ĐÃ HOÀN TẤT, và vì cùng một lý do: cả hai đều đã CHỐT
    // SỐ. Tạm dừng đóng băng giờ vào `confirmedMinutes` rồi khoá không cho gửi kết quả — tính
    // lại nhóm KPI hay mốc giao bây giờ sẽ dời deadline của một lượt mà số đã chốt xong, tức
    // đổi nghĩa một phán quyết đã đóng dấu. Muốn giao tiếp thì đó là một LƯỢT MỚI, qua
    // "+ Giao lượt tiếp theo".
    const unchanged =
      !!matched.completedAt ||
      matched.hasOpenPause ||
      (matched.kpiGroupId === group.id && matched.assignedAt.getTime() === assignedAt.getTime());

    if (unchanged) {
      return {
        status: "OK",
        created: false, // khớp lượt đã có → KHÔNG gửi thông báo lại
        assignmentId: matched.id,
        patch: legacyPatchFromAssignment({
          slot: params.block.slot,
          assignmentId: matched.id,
          groupId: matched.kpiGroupId,
          groupName: group.name,
          standardMinutes: matched.standardMinutesSnapshot,
          assignedAt: matched.assignedAt,
          deadlineAt: matched.deadlineAt,
        }),
      };
    }

    // Vẫn người đó nhưng đổi nhóm KPI hoặc đổi mốc giao → SỬA TẠI CHỖ, không tạo lượt mới.
    // Tạo mới ở đây chính là gốc của lỗi "một MO nhảy thành nhiều lượt": mỗi lần Order chỉnh
    // giờ giao là hệ thống lại sinh thêm một dòng và bắn thêm một thông báo.
    // ─── SUẤT GIỜ CHỈ ĐỔI KHI NHÓM KPI ĐỔI ───────────────────────────────────
    //
    // `standardMinutesSnapshot` là ngân sách ĐÃ ĐÓNG DẤU của lượt này, và nó KHÔNG NHẤT THIẾT
    // bằng suất chuẩn của nhóm: luồng giao lượt tiếp theo cấp đúng phần GIỜ CÒN LẠI (xem
    // continuation.ts). Bản trước ghi thẳng `group.standardMinutes` mỗi lần vào nhánh này, nên
    // một lần lưu đơn chỉ đổi mốc giao cũng kéo ngân sách về nguyên suất — âm thầm, và con số mới
    // trông hoàn toàn hợp lệ vì nó đúng bằng cấu hình nhóm.
    //
    // Đổi nhóm thì suất giờ phải theo nhóm mới — đó là ý định tường minh của người dùng. Không
    // đổi nhóm thì không ai yêu cầu đổi ngân sách, nên giữ nguyên.
    const groupChanged = matched.kpiGroupId !== group.id;
    const standardMinutes = groupChanged ? group.standardMinutes : matched.standardMinutesSnapshot;
    const deadlineAt = calculate3DKpiDeadline(
      assignedAt,
      // Deadline tính từ NGÂN SÁCH THẬT của lượt. Tính theo suất nhóm trong khi lượt chỉ có phần
      // giờ còn lại là cho nhân viên một hạn dài hơn số giờ họ được cấp.
      standardMinutes,
      configuredCalendarToWorkingCalendar(calendar),
    );
    await tx.design3DAssignment.update({
      where: { id: matched.id },
      data: {
        kpiGroupId: group.id,
        workingCalendarId: calendar.id,
        assignedAt,
        ...(groupChanged ? { standardMinutesSnapshot: group.standardMinutes } : {}),
        deadlineAt,
      },
    });
    return {
      status: "OK",
      created: false,
      assignmentId: matched.id,
      patch: legacyPatchFromAssignment({
        slot: params.block.slot,
        assignmentId: matched.id,
        groupId: group.id,
        groupName: group.name,
        standardMinutes,
        assignedAt,
        deadlineAt,
      }),
    };
  }

  const deadlineAt = calculate3DKpiDeadline(
    assignedAt,
    group.standardMinutes,
    configuredCalendarToWorkingCalendar(calendar),
  );

  if (matched) {
    // Bàn giao: đóng lượt của người cũ Ở CHÍNH Ô NÀY. Cố ý KHÔNG đụng tới các lượt khác của
    // cùng MO — đó là những NV 3D khác đang làm song song, đóng họ lại là xoá KPI của họ.
    params.claimed.add(matched.id);

    // ── CHỐT GIỜ trước khi đóng lượt ────────────────────────────────────────
    //
    // Trước đây chỗ này chỉ ghi `status: "REASSIGNED"` và KHÔNG GÌ KHÁC. Ba hệ quả, cả ba đều
    // âm thầm, được ghi đầy đủ ở đầu handover-freeze.ts. Ngắn gọn: giờ của người đã rời đơn còn
    // PHÌNH RA theo thời gian người mới làm, báo cáo coi lượt như "chờ buông", và `donChuaHT` của
    // người cũ không bao giờ được trừ.
    //
    // Dùng CHUNG module với route reassign: đây là luật tính LƯƠNG, hai bản chép tay thì không
    // có cách nào biết chúng còn khớp nhau.
    const frozenMinutes = freezeMinutesOnHandover({
      actualMinutes: matched.actualMinutes,
      completedAt: matched.completedAt,
      acknowledgedAt: matched.acknowledgedAt,
      assignedAt: matched.assignedAt,
      calendar: matched.calendar,
      pauses: matched.pauses,
      now,
    });

    await tx.design3DAssignment.update({
      where: { id: matched.id },
      data: handoverClosureData({ frozenMinutes, now }),
    });

    // Đóng nốt khoảng tạm dừng còn mở. Lượt đã đóng mà còn một khoảng dừng chưa mở lại thì nó
    // hiện là "đang tạm dừng" VĨNH VIỄN ở mọi màn hình đọc theo resumedAt = null. Route reassign
    // đã làm việc này từ trước; đường lưu form thì chưa.
    await tx.design3DPause.updateMany({
      where: { assignmentId: matched.id, resumedAt: null },
      data: { resumedAt: now, resumeNote: "Tự đóng — đơn đã chuyển sang nhân viên khác" },
    });
  }

  const assignment = await tx.design3DAssignment.create({
    data: {
      orderId: params.orderId,
      orderItemId: params.orderItemId,
      designer3DId: designer.id,
      kpiGroupId: group.id,
      workingCalendarId: calendar.id,
      assignedById: params.assignedById ?? null,
      reassignedFromId: matched?.id ?? null,
      // Chỉ đánh dấu khi THẬT SỰ tiếp nối một lượt cũ. Lượt đầu tiên của một MO không có lý do
      // — nó là lần 1, và ghi một lý do vào đó sẽ làm sidebar hiện nhãn cho một lần không cần
      // giải thích.
      continuationReason: matched ? "MANUAL_REASSIGN" : null,
      assignedAt,
      standardMinutesSnapshot: group.standardMinutes,
      deadlineAt,
      status: "ASSIGNED",
    },
  });
  params.claimed.add(assignment.id);

  return {
    status: "OK",
    created: true, // lượt giao việc MỚI → đây là lần duy nhất cần gửi thông báo
    assignmentId: assignment.id,
    patch: legacyPatchFromAssignment({
      slot: params.block.slot,
      assignmentId: assignment.id,
      groupId: group.id,
      groupName: group.name,
      standardMinutes: group.standardMinutes,
      assignedAt,
      deadlineAt,
    }),
  };
}

// ─── Điều phối: đồng bộ TẤT CẢ MO trong một lần lưu ──────────────────────────

export type Design3DSyncBatch = {
  /**
   * Bản vá ghi ngược vào extraData của từng MO (số giờ KPI, deadline…).
   *
   * Là MẢNG vì một MO có thể có nhiều NV 3D cùng làm — mỗi người một bản vá, phân biệt bằng
   * `slot` để route ghi về đúng ô: slot 0 → design gốc, slot >=1 → designers[slot-1].
   */
  patches: Map<string, Design3DAssignmentLegacyPatch[]>;
  /**
   * Khối bị TỪ CHỐI VĨNH VIỄN, theo MO. Route phải rút chúng khỏi extraData trước khi ghi —
   * nếu không, JSON lưu một khối mà bảng không có, và sidebar hiện nó như thật kể cả sau khi
   * tải lại trang. Xem removeDesign3DBlocks.
   */
  rejected: Map<string, Design3DRejectedBlock[]>;
  /** Lý do KHÔNG tạo được lượt giao việc — phải hiện cho người dùng, không nuốt im lặng. */
  warnings: string[];
  /**
   * Id các lượt giao việc VỪA ĐƯỢC TẠO trong lần lưu này — chỉ những cái này cần gửi thông báo.
   * Route dùng danh sách này SAU KHI transaction commit (xem `after()`), không gửi trong
   * transaction: gọi HTTP từ trong transaction sẽ giữ lock DB suốt thời gian gọi mạng, và
   * Google Chat chậm là cả lệnh lưu đơn treo theo.
   */
  createdAssignmentIds: string[];
  /**
   * Lượt VỪA BỊ ĐÓNG vì khối JSON của nó đã bị xoá (xem orphan-assignments.ts).
   *
   * Trả ra để route báo cho người dùng biết: xoá một khối là một quyết định có hệ quả lên bảng
   * lương, và làm im lặng thì lần sau không ai truy được vì sao lượt đó biến mất.
   */
  cancelledAssignmentIds: string[];
};

/**
 * Đóng những lượt giao việc đã MẤT KHỐI JSON của nó.
 *
 * VÌ SAO LÀ MỘT LƯỢT QUÉT RIÊNG: vòng lặp đồng bộ chỉ đi qua MO có ít nhất một khối đủ 4 trường,
 * và bên trong còn `if (blocks.length === 0) continue`. MO vừa bị xoá HẾT khối thì không phải
 * target nào cả — thứ VẮNG MẶT là điểm mù cấu trúc của đường đồng bộ.
 *
 * MỘT TRUY VẤN cho cả đơn, không phải mỗi MO một lần: chốt chặn rẻ ở dòng đầu — không có lượt
 * nào đang hoạt động thì thoát ngay, và tuyệt đại đa số lần lưu đơn rơi vào đúng ca này.
 */
async function closeOrphanAssignments(
  tx: Transaction,
  params: {
    extraData: Record<string, unknown>;
    /**
     * Payload THÔ của client, chưa trộn với DB. BẮT BUỘC phải là bản thô: cửa chặn
     * `itemsEligibleForOrphanCheck` xét xem lần lưu này CÓ NÓI GÌ về thiết kế hay không, mà bản
     * đã trộn thì lúc nào cũng mang khối cũ → cửa mở vĩnh viễn và tab Sản xuất sẽ huỷ sạch KPI.
     */
    incomingExtraData: Record<string, unknown> | null | undefined;
    validItemIds: readonly string[];
  },
): Promise<{ cancelledIds: string[]; warnings: string[] }> {
  const eligibleItemIds = itemsEligibleForOrphanCheck(params.incomingExtraData, params.validItemIds);
  if (eligibleItemIds.length === 0) return { cancelledIds: [], warnings: [] };

  const rows = await tx.design3DAssignment.findMany({
    where: { orderItemId: { in: eligibleItemIds }, status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
    select: {
      id: true, orderItemId: true, actualMinutes: true, completedAt: true,
      designer3D: { select: { name: true } },
      orderItem: { select: { moNumber: true } },
    },
  });
  if (rows.length === 0) return { cancelledIds: [], warnings: [] };

  const byItem = new Map<string, typeof rows>();
  for (const r of rows) byItem.set(r.orderItemId, [...(byItem.get(r.orderItemId) ?? []), r]);

  const cancelledIds: string[] = [];
  const warnings: string[] = [];

  for (const [orderItemId, itemRows] of byItem) {
    const plan = planOrphanClosures(
      readDesign3DTraces(params.extraData, orderItemId),
      itemRows.map((r) => ({
        id: r.id,
        designerName: r.designer3D?.name ?? "",
        actualMinutes: r.actualMinutes,
        completedAt: r.completedAt,
      })),
    );

    if (plan.toCancel.length > 0) {
      // `kpiCounted: false` đi kèm CANCELLED: những lượt này chưa ghi nhận công nào (điều kiện
      // để được tự đóng), nên KPI phải là 0 dù báo cáo có đọc theo đường nào.
      //
      // KHÔNG xoá cứng. Hàng dữ liệu giữ lại vĩnh viễn để một lần giao nhầm vẫn ĐƯỢC GHI NHẬN
      // — đúng thứ CANCELLED có trong enum để làm, và trước nay chưa route nào ghi.
      await tx.design3DAssignment.updateMany({
        where: { id: { in: plan.toCancel } },
        data: { status: "CANCELLED", kpiCounted: false },
      });
      cancelledIds.push(...plan.toCancel);
    }

    const moNumber = itemRows[0]?.orderItem?.moNumber ?? null;
    for (const entry of plan.needsManualDecision) {
      const msg = orphanNeedsDecisionWarning(moNumber, entry);
      if (!warnings.includes(msg)) warnings.push(msg);
    }
  }

  return { cancelledIds, warnings };
}

/**
 * Điểm vào DUY NHẤT cho route.
 *
 * Tự suy ra danh sách MO cần đồng bộ từ chính payload (xem assignment-targets.ts) thay vì
 * dựa vào việc client có gửi `scopedItemId` hay không — chính chỗ đó từng làm cả tính năng
 * chết lặng khi lưu từ tab Thiết kế.
 *
 * Chốt chặn rẻ: không có MO nào đủ 4 trường thì thoát ngay, KHÔNG chạm cơ sở dữ liệu.
 */
export async function syncDesign3DAssignments(
  tx: Transaction,
  params: {
    orderId: string;
    extraData: Record<string, unknown>;
    /**
     * Payload THÔ mà client vừa gửi (chưa trộn với dữ liệu trong DB) — chỉ dùng để biết lần lưu
     * này CÓ NÓI GÌ về phần thiết kế hay không. Xem itemsEligibleForOrphanCheck.
     * Không truyền = không đối chiếu lượt mồ côi (an toàn mặc định).
     */
    incomingExtraData?: Record<string, unknown> | null;
    validItemIds: readonly string[];
    assignedById?: string | null;
    /** Mốc "bây giờ" của lần lưu — mặc định new Date(), truyền tay được để test. */
    now?: Date;
  },
): Promise<Design3DSyncBatch> {
  const empty: Design3DSyncBatch = { patches: new Map(), rejected: new Map(), warnings: [], createdAssignmentIds: [], cancelledAssignmentIds: [] };

  // ─── KHỐI KẾ THỪA TỪ PHIÊN BẢN CŨ: nói ra, đừng bỏ qua im lặng ────────────
  //
  // ⚠️ PHẢI QUÉT TRƯỚC `targets` VÀ TRƯỚC CẢ LẦN RETURN SỚM Ở DƯỚI. Khối kế thừa vừa bị bỏ mốc
  // giao (xem version-carryover.ts) nên nó KHÔNG ĐỦ 4 TRƯỜNG → `resolveDesign3DSyncTargets` loại
  // nó, và nếu chỉ có một MO như vậy thì `targets` rỗng và hàm trả về ngay — không ai kịp cảnh
  // báo. Đúng kiểu bỏ qua im lặng mà cả đường sửa này sinh ra để chấm dứt.
  //
  // Cảnh báo, KHÔNG chặn: không tạo lượt đã là hành vi đúng cho một bản chỉ sửa thông số sản
  // phẩm. Chặn lưu ở đây sẽ khoá luôn những người không hề định giao việc.
  const carryWarnings = carriedBlocksAwaitingAssign(params.extraData, params.validItemIds)
    .map(carryOverWarning)
    .filter((msg, i, all) => all.indexOf(msg) === i);

  // ─── LƯỢT MỒ CÔI: khối JSON đã bị xoá mà lượt vẫn sống ────────────────────
  //
  // ⚠️ PHẢI CHẠY TRƯỚC LẦN RETURN SỚM Ở DƯỚI, cùng lý do với khối kế thừa: xoá HẾT khối của một
  // MO khiến MO đó không còn là target nào cả, nên nếu đợi tới vòng lặp thì đúng ca cần xử lý
  // lại là ca không bao giờ tới được.
  const orphans = await closeOrphanAssignments(tx, {
    extraData: params.extraData,
    incomingExtraData: params.incomingExtraData ?? null,
    validItemIds: params.validItemIds,
  });

  const targets = resolveDesign3DSyncTargets(params.extraData, params.validItemIds);
  if (targets.length === 0) {
    const earlyWarnings = [...carryWarnings, ...orphans.warnings];
    return {
      ...empty,
      warnings: earlyWarnings,
      cancelledAssignmentIds: orphans.cancelledIds,
    };
  }

  const lookups = await loadDesign3DLookups(tx);
  const now = params.now ?? new Date();

  const patches = new Map<string, Design3DAssignmentLegacyPatch[]>();
  const rejected = new Map<string, Design3DRejectedBlock[]>();
  // Bắt đầu bằng cảnh báo kế thừa: một MO có thể vừa có khối đã giao lại vừa có khối chưa.
  const warnings: string[] = [...carryWarnings, ...orphans.warnings];
  const createdAssignmentIds: string[] = [];

  for (const orderItemId of targets) {
    const blocks = readDesign3DBlocks(params.extraData, orderItemId);
    if (blocks.length === 0) continue;

    // Nạp MỘT LẦN cho cả MO rồi khớp dần: nếu hỏi lại DB sau mỗi khối thì khối sau sẽ thấy
    // luôn cả lượt mà khối trước vừa tạo, và tự nhận nhầm chính nó.
    // `pauses` BẮT BUỘC — xem chú thích `hasOpenPause` ở approved-lock.ts. Tạm dừng không đổi
    // `status`, nên không đọc bảng này thì lượt đang dừng trông y hệt lượt đang chạy và đường
    // đồng bộ sẽ bàn giao nó đi, kéo theo mất trắng số giờ đã chốt.
    // `take: 1` là đủ: ràng buộc DB chỉ cho MỘT khoảng mở trên mỗi lượt.
    const activeRows = await tx.design3DAssignment.findMany({
      where: { orderItemId, status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, designer3DId: true, kpiGroupId: true, assignedAt: true,
        standardMinutesSnapshot: true, deadlineAt: true, actualMinutes: true, completedAt: true,
        reviewStatus: true,
        // Bốn thứ dưới để CHỐT GIỜ khi lượt bị đổi người (handover-freeze.ts).
        acknowledgedAt: true,
        // `sessions` + `holidays` là BẮT BUỘC, không phải `workingCalendar: true`: phép tính giờ
        // làm việc dựa vào phiên làm việc theo thứ và danh sách ngày lễ. Thiếu chúng thì đây là
        // một lịch RỖNG, và mọi khoảng thời gian đều quy ra 0 giờ.
        workingCalendar: { include: { sessions: true, holidays: true } },
        // ⚠️ LẤY MỌI KHOẢNG DỪNG, không chỉ khoảng đang mở. Phép đo phải TRỪ hết thời gian đã
        // dừng trong cả đời lượt; chỉ lấy khoảng mở thì những lần dừng đã kết thúc bị tính thành
        // giờ làm việc, và người cũ được cộng công cho quãng họ không làm.
        pauses: { select: { pausedAt: true, resumedAt: true, confirmedMinutes: true } },
      },
    });
    const active: ActiveAssignment[] = activeRows.map(({ pauses, workingCalendar, ...r }) => ({
      ...r,
      hasOpenPause: pauses.some((p) => p.resumedAt == null),
      pauses,
      calendar: workingCalendar ? configuredCalendarToWorkingCalendar(workingCalendar) : undefined,
    }));
    const claimed = new Set<string>();
    const usedDesignerIds = new Set<string>();

    for (const block of blocks) {
      const result = await syncDesign3DAssignmentBlock(tx, lookups, {
        orderId: params.orderId,
        orderItemId,
        extraData: params.extraData,
        assignedById: params.assignedById ?? null,
        block,
        active,
        claimed,
        usedDesignerIds,
      }, now);

      if (result.status === "OK") {
        patches.set(orderItemId, [...(patches.get(orderItemId) ?? []), result.patch]);
        if (result.created) createdAssignmentIds.push(result.assignmentId);
      }
      else if (result.status === "BLOCKED") {
        // Gộp lý do trùng nhau: nhiều MO cùng thiếu một cấu hình thì chỉ báo một lần.
        if (!warnings.includes(result.reason)) warnings.push(result.reason);
        // Ghi nhận khối bị TỪ CHỐI VĨNH VIỄN để route rút nó khỏi extraData. `rejected` chỉ có
        // ở loại chặn không bao giờ hợp lệ được — chặn vì thiếu cấu hình thì KHÔNG có, vì ô
        // người dùng vừa điền sẽ hợp lệ ngay khi admin bật cấu hình.
        if (result.rejected) {
          rejected.set(orderItemId, [...(rejected.get(orderItemId) ?? []), result.rejected]);
        }
      }
    }
  }

  return { patches, rejected, warnings, createdAssignmentIds, cancelledAssignmentIds: orphans.cancelledIds };
}

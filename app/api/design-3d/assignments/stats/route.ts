import type { NextRequest } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";

import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { resolveProgressActor } from "@/app/lib/business/kpi-3d/actor";
import { canReadProgress } from "@/app/lib/business/kpi-3d/progress";
import {
  assignedInRangeWhere,
  completedWhere,
  lateWhere,
  openWhere,
  pendingReviewWhere,
  rangeFromSelection,
} from "@/app/lib/business/kpi-3d/stats-filters";

// ─── GET /api/design-3d/assignments/stats ────────────────────────────────────
//
// Dải thẻ đếm của màn "Việc thiết kế 3D".
//
// ⚠️ VÌ SAO LÀ MỘT ROUTE RIÊNG, không nhét vào đâu cả:
//
//   · KHÔNG suy từ danh sách: danh sách bị cắt ở 200 dòng theo deadline sớm nhất, nên khi xưởng
//     tích lũy vài trăm việc đã xong thì việc đang làm bị đẩy ra ngoài và mọi con số báo thiếu
//     mà không có dấu hiệu gì. Lý do đầy đủ ở kpi-3d/stats-filters.ts.
//   · KHÔNG nhét vào /meta: meta được poll MỖI 20 GIÂY và cố ý chỉ có hai con số + vài mốc.
//     Sáu phép đếm mỗi 20 giây cho mọi màn hình đang mở là một cái giá không cần trả — dải thẻ
//     chỉ cần đổi khi dữ liệu thật sự đổi, mà việc đó heartbeat đã phát hiện giúp rồi.
//   · KHÔNG nhét vào route danh sách: nó phân trang, còn đếm phải trên TOÀN BỘ phạm vi; và đổi
//     tháng thì phải đếm lại mà không cần kéo lại 200 dòng.
//
// PHẠM VI ÉP Ở SERVER và phải giống HỆT route danh sách — hẹp hơn thì bỏ sót, rộng hơn thì NV 3D
// thấy con số gồm cả việc của người khác.

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canReadProgress(user.role)) return Errors.forbidden();

  const sp = request.nextUrl.searchParams;

  // ─── PHẠM VI THỜI GIAN: MẶC ĐỊNH LÀ KHÔNG LỌC ──────────────────────────────
  //
  // Không truyền `year` → `range = null` → đếm TOÀN THỜI GIAN. Đây là mặc định có chủ ý: nhóm
  // thẻ bên trái vốn đã là toàn thời gian, nên để nhóm phải cũng vậy thì cả dải cùng một phạm vi
  // và người đọc không phải nhớ "bên trái khác bên phải". Tháng/năm là một phép THU HẸP do người
  // dùng chủ động chọn, không phải trạng thái ban đầu.
  //
  // Có `year` mà không có `month` → cả năm đó. "Có month mà không có year" bị bỏ qua (thành toàn
  // thời gian): nó có nghĩa là "tháng 8 của mọi năm", thứ gần như không ai muốn. Giao diện tự
  // điền năm hiện tại khi người dùng chọn tháng, nên trạng thái đó không dựng được từ màn hình;
  // xử lý ở đây chỉ để một URL gõ tay không tạo ra con số vô nghĩa.
  //
  // Tham số rác → coi như không lọc, KHÔNG trả lỗi: đây là dải thẻ để đọc, làm hỏng cả màn hình
  // vì một query string sai là phản ứng quá tay.
  const yearRaw = parseInt(sp.get("year") ?? "", 10);
  const monthRaw = parseInt(sp.get("month") ?? "", 10);
  const range = rangeFromSelection(
    Number.isInteger(yearRaw) ? yearRaw : null,
    Number.isInteger(monthRaw) ? monthRaw : null,
  );

  const designerFilter = sp.get("designer3DId")?.trim() ?? "";
  const actor = await resolveProgressActor(user);

  // NV 3D chưa gắn hồ sơ → phạm vi rỗng, đúng như route danh sách trả [].
  if (user.role === "DESIGN_3D" && !actor.designer3DId) {
    return ok({ total: 0, open: 0, pendingReview: 0, completed: 0, late: 0, earliestYear: null });
  }

  const scope: Prisma.Design3DAssignmentWhereInput = actor.designer3DId
    ? { designer3DId: actor.designer3DId }
    : designerFilter
      ? { designer3DId: designerFilter }
      : {};

  const and = (fragment: Record<string, unknown>): Prisma.Design3DAssignmentWhereInput =>
    ({ ...scope, ...fragment }) as Prisma.Design3DAssignmentWhereInput;

  try {
    // ⚠️ MỌI con số đều theo phạm vi đang chọn, kể cả nhóm "Việc phải làm".
    //
    // Bản trước cố ý để nhóm đó TOÀN THỜI GIAN, làm lưới an toàn: một việc giao tháng 7 còn đang
    // trễ tới hôm nay vẫn đếm được dù đang xem tháng 8. Người dùng đã quyết định khác — thẻ phải
    // khớp với bảng, nếu không bảng rỗng mà con số vẫn khác 0 và họ không tin được cái nào.
    //
    // CÁI GIÁ, ghi lại để ai đọc sau biết: khi đang lọc một tháng, "Đang làm" KHÔNG còn trả lời
    // "tôi đang gánh bao nhiêu việc" — nó chỉ đếm trong lứa việc giao tháng đó. Muốn con số toàn
    // cảnh thì bỏ bộ lọc về "Tất cả".
    const scoped = (fragment: Record<string, unknown>) => and({ ...assignedInRangeWhere(range), ...fragment });

    const [total, open, pendingReview, completed, late, earliest] = await Promise.all([
      prisma.design3DAssignment.count({ where: scoped({}) }),
      prisma.design3DAssignment.count({ where: scoped(openWhere()) }),
      // KHÔNG còn đếm "đang trễ": dải thẻ đã bỏ ô đó vì bảng nói việc trễ to hơn hẳn (deadline đỏ,
      // dòng "trễ N giờ", vạch đỏ lề trái). Giữ lại một phép COUNT mà không ai đọc là bắt DB làm
      // việc thừa cho mọi màn hình, mỗi lần dữ liệu đổi. `overdueWhere` vẫn còn trong module
      // stats-filters cho lần cần tới — nó là định nghĩa, không phải rác.
      prisma.design3DAssignment.count({ where: scoped(pendingReviewWhere()) }),
      // `completedWhere`/`lateWhere` đã tự kèm khoảng — không bọc `scoped` lần nữa.
      prisma.design3DAssignment.count({ where: and(completedWhere(range)) }),
      prisma.design3DAssignment.count({ where: and(lateWhere(range)) }),
      // Năm sớm nhất CÓ DỮ LIỆU, để ô chọn Năm không chào mời những năm trống rỗng — người dùng
      // chọn vào rồi thấy toàn số 0 và tưởng mất dữ liệu. Đi cùng chuyến, không thêm round-trip.
      //
      // Theo `assignedAt` chứ không `completedAt`: năm đầu tiên xưởng dùng hệ thống có thể chưa
      // hoàn tất lượt nào, mà vẫn cần chọn được để xem "giao bao nhiêu, xong bao nhiêu".
      prisma.design3DAssignment.aggregate({ where: scope, _min: { assignedAt: true } }),
    ]);

    // Năm theo GIỜ VN. `getFullYear()` đọc theo giờ máy chủ — Vercel chạy UTC, nên một lượt giao
    // lúc 06:00 ngày 01/01 giờ VN sẽ bị tính vào năm trước và ô chọn thừa ra một năm.
    const earliestYear = earliest._min.assignedAt
      ? Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric" })
          .format(earliest._min.assignedAt))
      : null;

    return ok({ total, open, pendingReview, completed, late, earliestYear });
  } catch (err) {
    console.error("[GET /api/design-3d/assignments/stats]", err);
    return Errors.internal();
  }
}

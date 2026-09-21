import type { NextRequest } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";

import { prisma } from "@/app/lib/prisma";
import { paginated, Errors } from "@/app/lib/api-response";
import { classifyDbError } from "@/app/lib/db-error";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { resolveProgressActor } from "@/app/lib/business/kpi-3d/actor";
import { canReadProgress, PROGRESS_STATUS_VALUES } from "@/app/lib/business/kpi-3d/progress";
import { calendarIdsOf, withDerivedKpiDelta } from "@/app/lib/business/kpi-3d/kpi-delta";
import { loadWorkingCalendars } from "@/app/lib/kpi-3d/calendars";
import { resolveDesignRequest, resolveTechDetailRequest } from "@/app/lib/business/kpi-3d/design-request";

// ─── GET /api/design-3d/assignments ──────────────────────────────────────────
// Danh sách việc được giao cho Nhân viên Thiết kế 3D.
//
// Phạm vi dữ liệu ĐƯỢC ÉP Ở SERVER, không tin tham số từ client: tài khoản DESIGN_3D luôn
// chỉ thấy assignment của chính mình, kể cả khi tự truyền ?designer3DId= của người khác.

const listSelect = {
  id: true,
  status: true,
  assignedAt: true,
  deadlineAt: true,
  completedAt: true,
  kpiStatus: true,
  kpiDeltaMinutes: true,
  standardMinutesSnapshot: true,
  // Lịch làm việc CỦA CHÍNH LƯỢT NÀY — cần để suy ra "Sớm / Trễ" bằng giờ làm việc. Chỉ lấy id;
  // nội dung lịch đọc MỘT LẦN cho cả danh sách (app/lib/kpi-3d/calendars.ts), không join theo
  // từng dòng — 200 dòng dùng chung một hai lịch thì join là 200 bản sao của cùng một bộ ca.
  workingCalendarId: true,
  // Ghép với standardMinutesSnapshot thành TỈ LỆ DÙNG GIỜ KPI — xem kpi-3d/kpi-usage.ts. Con số
  // này để người duyệt biết một lượt nộp rất nhanh có đáng xem kỹ hơn không; nó KHÔNG đổi kết
  // quả KPI và không chặn duyệt.
  actualMinutes: true,
  acknowledgedAt: true,
  acknowledgedBy: { select: { id: true, name: true } },
  // Ghép với acknowledgedAt thành cặp cho người giao việc: "đã gửi thông báo" mà mãi "chưa
  // nhận việc" thì biết cần đi nhắc ai; còn CHƯA gửi được thì lỗi ở hệ thống, không phải NV
  // lơ là. Không có trường này thì màn 3D chỉ nói được "chưa nhận" mà không nói được vì sao.
  notifiedAt: true,
  // Lịch sử TẠM DỪNG — để màn 3D hiện rõ "đang bị gác" thay vì để NV tưởng mình đang trễ.
  // Lấy mới nhất trước: cái đang mở (nếu có) luôn là cái mới nhất.
  pauses: {
    // `confirmedMinutes` để form Mở lại tính được ngân sách CÒN LẠI cho giai đoạn tiếp theo.
    // Thiếu nó, form phải đoán "đã tiêu bao nhiêu" và sẽ đoán bằng 0 — tức đề xuất nguyên suất
    // giờ chuẩn cho người chỉ làm nốt phần dở.
    select: { id: true, pausedAt: true, resumedAt: true, reason: true, confirmedMinutes: true },
    orderBy: { pausedAt: "desc" },
  },
  reviewStatus: true,
  reviewNote: true,
  reworkCount: true,
  // ─── Lượt đã bị lấy đơn giao người khác ─────────────────────────────────────
  //
  // TRẢ VỀ CHO CẢ NHÂN VIÊN CŨ, cố ý. Lượt REASSIGNED vẫn nằm trong danh sách của họ (route
  // này không lọc bỏ), nhưng trước đây nó chỉ mang mỗi chip "Đã giao lại" — không nói ai nhận
  // tiếp, không nói công của họ có được tính hay không.
  //
  // kpiCounted là câu hỏi lớn nhất của người bị lấy đơn, và trước bản này KHÔNG màn hình nào
  // trả lời được: cột có trong DB nhưng chưa từng ra tới client. Giấu nó không làm quyết định
  // biến mất, chỉ dời tranh cãi sang cuối tháng — lúc không ai còn nhớ đơn đó vì sao bị bác.
  kpiCounted: true,
  reassignedAt: true,
  // Lượt kế thừa. Lấy 1: đường đổi người luôn tạo đúng một lượt mới cho mỗi lần chuyển.
  reassignedTo: {
    select: { id: true, assignedAt: true, designer3D: { select: { id: true, name: true } } },
    orderBy: { assignedAt: "asc" },
    take: 1,
  },
  designer3D: { select: { id: true, name: true, code: true } },
  kpiGroup: { select: { id: true, name: true, code: true } },
  order: {
    select: {
      id: true, orderNumber: true, customerName: true,
      // ⚠️ CHỈ ĐỂ RÚT RA "Yêu cầu thiết kế" — KHÔNG BAO GIỜ trả nguyên khối này ra client.
      //
      // `extraData` là JSON gộp của CẢ ĐƠN: perItem cho mọi MO, dữ liệu sản xuất, các chặng…
      // Với 200 lượt giao việc, đẩy nguyên nó qua dây là gấp nhiều lần toàn bộ phần còn lại của
      // response, và mấy lượt cùng một đơn còn chở đi chở lại y hệt nhau. Route rút lấy đúng một
      // chuỗi ở dưới rồi bỏ khối này đi.
      productionDetail: { select: { extraData: true } },
    },
  },
  // Tài liệu để NV 3D LÀM ĐƯỢC VIỆC, không chỉ biết mình có việc. Trước đây select chỉ có
  // 3 trường đầu nên màn này không hiện một tấm ảnh nào — ảnh đã nằm sẵn trong hệ thống
  // (designImageUrl/designFileUrl do Order nhập ở tab Sản phẩm) mà chưa ai nối dây sang, nên
  // NV 3D phải hỏi lại qua chat và câu trả lời không lưu ở đâu cả.
  orderItem: {
    select: {
      id: true, moNumber: true, productName: true,
      // Ưu tiên của VIỆC THIẾT KẾ — quyết định thứ tự hàng việc ở màn này (queue-order.ts), nên
      // thiếu nó thì mọi việc sắp như nhau và ô chọn ở sidebar thành vô nghĩa. Kèm priorityCode
      // của ĐƠN để so ra được "đơn gấp mà thiết kế chưa xếp ưu tiên".
      design3DPriorityCode: true, priorityCode: true,
      designImageUrl: true, designFileUrl: true,
      // `sampleVideoUrl` vẫn select để LÙI VỀ cho dòng chưa chép sang `sampleFolderUrl`.
      sampleImageUrl: true, sampleImageUploads: true, sampleVideoUrl: true, sampleFolderUrl: true,
      // THÔNG SỐ ĐỂ DỰNG ĐƯỢC MẪU. Trước đây NV 3D chỉ thấy TÊN sản phẩm và ảnh — không có
      // NVL, size, trọng lượng, đá chủ, xi mạ. Toàn bộ đã nằm sẵn ở đây do Order nhập ở tab
      // Sản phẩm, chỉ là chưa ai nối dây sang. Hệ quả: NV 3D hỏi lại qua chat, câu trả lời
      // không lưu ở đâu, nên người thứ hai làm cùng MO lại hỏi lần nữa.
      nvl: true, size: true, weightGram: true, quantity: true,
      platingType: true, mainStoneType: true, mainStoneSize: true, mainStoneQty: true,
      // `techNote` = "Diễn giải SP", hiện trong khối Thông số sản phẩm.
      //
      // 📌 CỘT NÀY TỪNG BỊ BỎ KHỎI ĐÂY, và lý do lúc đó là "chở một cột không ai đọc" — đúng
      // khi màn 3D không hiện nó nữa. Nay người dùng chốt cho NV 3D đọc luôn phần diễn giải
      // Order/PTK viết, nên lý do cũ hết hiệu lực và cột quay lại.
      //
      // ⚠️ Nó KHÔNG thay `yeucauKyThuat`. Hai thứ cùng hiện, mỗi thứ một nhãn riêng — lỗi cũ
      // của màn này là dán nhãn sai, không phải việc hiện techNote.
      techNote: true,
      techClassification: true, color: true, engraving: true,
    },
  },
  progressLogs: {
    select: { id: true, status: true, progressPercent: true, renderInfoUrl: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 1, // dòng tiến độ mới nhất — đủ để hiển thị danh sách, chi tiết xem ở route con
  },
} as const;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canReadProgress(user.role)) return Errors.forbidden();

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  // Trần 500 (trước là 100) — màn Việc thiết kế 3D lọc và ĐẾM ở phía client, nên trần thấp
  // hơn số việc thực tế không chỉ cắt bảng mà còn làm thẻ đếm "Chờ duyệt" báo thiếu. Một con
  // số dùng để nhắc việc mà thiếu thì tệ hơn là không có: Order tưởng đã duyệt hết.
  // Client đang xin 200; khi tổng số lượt vượt 500 thì màn đó cần phân trang thật, không nới tiếp.
  const limit = Math.min(500, Math.max(1, parseInt(sp.get("limit") ?? "50", 10) || 50));
  const status = sp.get("status")?.trim() ?? "";
  const designerFilter = sp.get("designer3DId")?.trim() ?? "";

  const actor = await resolveProgressActor(user);

  // NV 3D chưa gắn hồ sơ → trả rỗng thay vì lộ toàn bộ việc của cả phòng.
  if (user.role === "DESIGN_3D" && !actor.designer3DId) {
    return paginated([], { page, limit, total: 0, totalPages: 0 });
  }

  const where: Prisma.Design3DAssignmentWhereInput = {
    ...(actor.designer3DId
      ? { designer3DId: actor.designer3DId }
      : designerFilter
        ? { designer3DId: designerFilter }
        : {}),
    ...(PROGRESS_STATUS_VALUES.includes(status as (typeof PROGRESS_STATUS_VALUES)[number]) ||
    ["ASSIGNED", "REASSIGNED", "CANCELLED"].includes(status)
      ? { status: status as Prisma.Design3DAssignmentWhereInput["status"] }
      : {}),
  };

  // Bọc try/catch vì lỗi hạ tầng DB (thiếu migration) trước đây thoát ra ngoài route →
  // Next trả 500 body RỖNG → client báo "Unexpected end of JSON input", che mất nguyên nhân.
  try {
    const [total, rows] = await Promise.all([
      prisma.design3DAssignment.count({ where }),
      prisma.design3DAssignment.findMany({
        where,
        select: listSelect,
        orderBy: [{ deadlineAt: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // ─── Link File Render mới nhất, lấy CHÍNH XÁC ────────────────────────────
    //
    // KHÔNG lấy được từ progressLogs ở trên: chỗ đó `take: 1` nghĩa là dòng cập nhật MỚI
    // NHẤT, không phải dòng mới nhất CÓ link. NV nộp link rồi ghi thêm một dòng ghi chú là
    // link biến mất khỏi màn — và Order được mời đi duyệt một kết quả mà không có gì để xem.
    //
    // Truy vấn riêng với distinct thay vì nới `take`: nới bao nhiêu cũng chỉ là phỏng đoán,
    // sai âm thầm khi NV cập nhật nhiều lần sau lúc nộp file. Đây là đúng cái link mà route
    // duyệt (review/route.ts) sẽ đẩy thành File 3D chính thức của MO nếu Order bấm Nhận.
    //
    // ─── VÀ BÁO CÁO "thực tế đã làm" mới nhất, CÙNG LÝ DO Y HỆT ──────────────
    //
    // Không gộp được vào truy vấn trên: `distinct` + lọc `renderInfoUrl not null` trả về dòng
    // mới nhất CÓ LINK, còn cái này cần dòng mới nhất CÓ BÁO CÁO — hai dòng khác nhau. NV nộp
    // link rồi hôm sau mới báo lệch là hai dòng log riêng biệt.
    //
    // ⚠️ Đi trong CÙNG `Promise.all` để không thêm một vòng round-trip, nhưng CHỈ truy vấn mới
    // có `.catch()`: `Promise.all` thất bại theo cụm, và hai truy vấn này KHÔNG cùng mức quan
    // trọng. Link Render là thứ Order phải xem trước khi duyệt — mất nó thì route phải 500 như
    // hiện tại, không được âm thầm trả danh sách thiếu. Còn huy hiệu báo lệch mất đi thì bảng
    // vẫn dùng được, nên nó tự chịu lỗi thay vì kéo chết cả danh sách.
    const [renderLogs, reportLogs] = rows.length === 0 ? [[], []] : await Promise.all([
      prisma.design3DProgressLog.findMany({
        where: { assignmentId: { in: rows.map((r) => r.id) }, renderInfoUrl: { not: null } },
        distinct: ["assignmentId"],
        orderBy: { createdAt: "desc" },
        select: { assignmentId: true, renderInfoUrl: true },
      }),
      prisma.design3DProgressLog.findMany({
        where: { assignmentId: { in: rows.map((r) => r.id) }, reportedDesignRequest: { not: null } },
        distinct: ["assignmentId"],
        orderBy: { createdAt: "desc" },
        select: { assignmentId: true, reportedDesignRequest: true },
      }).catch(() => []),
    ]);
    const renderByAssignment = new Map(renderLogs.map((l) => [l.assignmentId, l.renderInfoUrl]));
    const reportByAssignment = new Map(reportLogs.map((l) => [l.assignmentId, l.reportedDesignRequest]));

    // Rút "Yêu cầu thiết kế" ra khỏi JSON ngay tại server, rồi BỎ HẲN `productionDetail` khỏi
    // response. Luật chọn per-MO / dùng chung nằm ở kpi-3d/design-request.ts — một định nghĩa
    // duy nhất, dùng chung với sidebar; viết lại ở đây là hai màn sẽ nói khác nhau.
    // ─── "Sớm / Trễ" SUY RA KHI ĐỌC, không trả cột đã lưu ───────────────────
    //
    // 🔴 Cột `kpiDeltaMinutes` đóng dấu một lần lúc hoàn tất, nên mọi lượt xong TRƯỚC bản sửa lỗi
    // trộn đơn vị vẫn giữ con số đo bằng giờ tường. Lượt 26.37669_1 hiện "Sớm 18 giờ 6 phút" ngay
    // cạnh "Dùng giờ KPI 16% (39 phút / 4 giờ)" — hai dòng không thể cùng đúng.
    //
    // Con số này suy ra được HOÀN TOÀN từ deadlineAt + completedAt + lịch của lượt đó, nên nó là
    // dữ liệu phái sinh chứ không phải bản sao. Suy ra ở đây thì mọi lượt cũ tự đúng, không phải
    // ghi vào production database. Luật đầy đủ ở business/kpi-3d/kpi-delta.ts.
    const withDelta = withDerivedKpiDelta(rows, await loadWorkingCalendars(calendarIdsOf(rows)));

    const data = withDelta.map((r) => {
      const { productionDetail, ...order } = r.order ?? { productionDetail: null };
      // `workingCalendarId` KHÔNG đi ra client: nó chỉ dùng để suy ra con số ở trên, và client
      // không có quyền đọc bảng lịch (endpoint đó là admin-only).
      const { workingCalendarId: _calendarId, ...rest } = r;
      return {
        ...rest,
        order: r.order ? order : null,
        yeucauThietKe: resolveDesignRequest(productionDetail?.extraData, r.orderItem?.id ?? null),
        yeucauKyThuat: resolveTechDetailRequest(productionDetail?.extraData, r.orderItem?.id ?? null),
        latestRenderInfoUrl: renderByAssignment.get(r.id) ?? null,
        // Thực tế NV 3D báo đã làm, mới nhất. null = KHÔNG BÁO GÌ — không phải "trùng yêu cầu";
        // ô này tùy chọn nên null gộp cả người xác nhận đúng và người bỏ qua ô.
        latestReportedDesignRequest: reportByAssignment.get(r.id) ?? null,
      };
    });

    return paginated(data, { page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    const classified = classifyDbError(error);
    // Chi tiết đầy đủ vào log server (Vercel Logs), KHÔNG đẩy ra client.
    console.error("[design-3d/assignments] DB error:", classified.kind, error);
    if (classified.kind === "UNKNOWN") return Errors.internal();
    return Errors.serviceUnavailable(classified.message);
  }
}

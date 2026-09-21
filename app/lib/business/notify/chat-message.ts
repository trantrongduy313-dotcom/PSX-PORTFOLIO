import { formatDeadlineDistance } from "@/app/lib/business/kpi-3d/display";
import { toVnHm, toVnYmd } from "@/app/lib/utils/vn-date";
import { formatVersionedDisplay } from "@/app/lib/business/order-helpers";

/**
 * MO# cho tin nhắn Chat — hậu tố phiên bản LUÔN hiện bằng "_", đồng nhất với mọi màn hình.
 *
 * Đây là chỗ quan trọng nhất phải đồng nhất, quan trọng hơn cả màn hình: tin nhắn Chat đi
 * RA NGOÀI và nằm lại vĩnh viễn trong lịch sử phòng. Người ta copy mã từ tin nhắn rồi dán
 * vào ô tìm kiếm — mã in ra một dạng mà màn hình hiện một dạng khác thì họ tự hỏi có phải
 * hai MO khác nhau không, và không có cách nào để đối chiếu.
 *
 * Dùng formatVersionedDisplay (không cần cờ) chứ KHÔNG phải formatMoVersionedDisplay: các
 * select của notify-design-3d chỉ lấy moNumber, không có Order.createdById. Chênh lệch duy
 * nhất là luật "_1 ngầm định" — tức tin nhắn hiện bare "26.423423" ở nơi màn hình hiện
 * "26.423423_1". Chấp nhận được: bare vẫn tìm ra đúng đơn, còn sai DẤU thì không.
 */
const moText = (s: string | null | undefined): string => formatVersionedDisplay(s) || "—";

// ─── Nội dung thông báo Google Chat ──────────────────────────────────────────
//
// File THUẦN: dựng chuỗi tin nhắn, không gọi mạng, không import prisma. Test được trực tiếp.
//
// ⚠️ MÚI GIỜ LÀ CHỖ NGUY HIỂM NHẤT Ở ĐÂY. Dự án đã từng có bug deadline lệch 7 tiếng vì dùng
// giờ máy chủ (Vercel chạy UTC). Trong tin nhắn Chat thì bug đó TỆ HƠN: nhân viên không có gì
// để đối chiếu, họ sẽ tin luôn con số sai và làm trễ việc. Nên MỌI mốc thời gian ở đây bắt
// buộc đi qua toVnYmd/toVnHm — nguồn duy nhất của dự án cho giờ Việt Nam.
//
// Space là kênh CHUNG của cả phòng (~4–5 người), nên:
//   - Tên nhân viên đặt DÒNG ĐẦU, in đậm → mọi người quét mắt là bỏ qua được tin không phải
//     của mình. Không có cách này thì mỗi người phải đọc ~5 tin để tìm 1 tin của họ.
//   - KHÔNG đưa tên khách hàng vào: cả phòng đọc chung, đây là dữ liệu khách. Muốn thêm thì
//     chỉ là một dòng, nhưng mặc định chọn phương án kín hơn.
//
// ─── VÌ SAO DÙNG THẺ (cardsV2) THAY VÌ CHỮ THUẦN ─────────────────────────────
//
// Bản trước gửi chữ thuần, và trông thô vì ba lý do:
//
//   1. LINK BỊ DÁN NGUYÊN VĂN. Dòng "Mở việc: https://example.vercel.app
//      /dashboard/design-3d" tự xuống dòng giữa URL — chiếm hai dòng cho một hành động. Google
//      Chat có cú pháp link <url|nhãn>, và thẻ thì có NÚT thật.
//   2. BỐN DÒNG "nhãn: giá trị" cùng độ đậm, không có thứ bậc. Cái quan trọng nhất (deadline)
//      trông y như cái ít quan trọng nhất (tên nhóm KPI).
//   3. Dấu • gõ tay không phải danh sách thật, nên khoảng cách không đều với phần còn lại.
//
// ⚠️ ĐỊNH DẠNG TRONG THẺ KHÁC ĐỊNH DẠNG TRONG `text`:
//      `text`  → Markdown của Chat:  *đậm*
//      thẻ     → một tập con HTML:   <b>đậm</b>
// Dùng lẫn là chữ hiện ra kèm luôn dấu sao — đúng loại lỗi làm tin nhắn trông cẩu thả.
//
// LUÔN KÈM `fallbackText`: không test được thẻ với API thật ở đây, nên nếu Google Chat từ chối
// payload (đổi schema, icon lạ) thì sendChatMessage gửi lại bản chữ. Trường hợp xấu nhất bằng
// đúng hiện trạng, không mất thông báo.

/** Dữ liệu cần để dựng tin nhắn giao việc. Cố ý KHÔNG có tên khách hàng. */
export type AssignmentNotice = {
  designerName: string;
  moNumber: string | null;
  productName: string | null;
  groupName: string | null;
  standardMinutes: number;
  deadlineAt: Date;
  /** Link mở thẳng màn việc 3D — thiếu link thì nhân viên phải tự đi tìm. */
  workUrl?: string | null;
};

/**
 * Payload Google Chat webhook nhận.
 *
 * `fallbackText` KHÔNG được gửi lên — nó chỉ là bản dự phòng để gửi lại khi thẻ bị từ chối.
 * sendChatMessage lo việc loại nó khỏi body.
 */
export type ChatPayload = {
  text: string;
  cardsV2?: ChatCard[];
  fallbackText?: string;
};

export type ChatCard = {
  cardId: string;
  card: Record<string, unknown>;
};

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h > 0 ? `${h} giờ` : "", m > 0 ? `${m} phút` : ""].filter(Boolean).join(" ") || "0 phút";
}

/** "14:27 ngày 10/08/2026" — giờ Việt Nam, KHÔNG phải giờ máy chủ. */
export function formatVnDeadline(deadlineAt: Date): string {
  const ymd = toVnYmd(deadlineAt); // "2026-08-10"
  const [y, m, d] = ymd.split("-");
  return `${toVnHm(deadlineAt)} ngày ${d}/${m}/${y}`;
}

/**
 * Deadline kèm khoảng thời gian còn lại.
 *
 * "09:41 12/08/2026" một mình không nói được gấp hay không — người đọc phải tự trừ trong đầu.
 * "còn 22 giờ" mới là thứ khiến họ quyết định làm ngay hay để mai. Chỉ thêm khi có `now`.
 */
function deadlineWithDistance(deadlineAt: Date, now?: Date): string {
  const absolute = formatVnDeadline(deadlineAt);
  return now ? `${absolute} (${formatDeadlineDistance(deadlineAt, now)})` : absolute;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Một dòng "nhãn nhỏ + giá trị" trong thẻ, có icon dẫn mắt. */
function specRow(icon: string, label: string, value: string, bold = false): Record<string, unknown> {
  return {
    decoratedText: {
      startIcon: { knownIcon: icon },
      topLabel: label,
      // ĐỊNH DẠNG TRONG THẺ LÀ HTML, không phải Markdown — xem cảnh báo ở đầu file.
      text: bold ? `<b>${escapeHtml(value)}</b>` : escapeHtml(value),
    },
  };
}

function openWorkButton(workUrl: string): Record<string, unknown> {
  return {
    buttonList: {
      buttons: [{
        text: "Mở việc",
        onClick: { openLink: { url: workUrl } },
      }],
    },
  };
}

/**
 * Tin nhắn "có việc thiết kế mới" cho MỘT lượt.
 *
 * `text` chỉ còn MỘT DÒNG: nó là dòng hiện trong danh sách hội thoại và trong thông báo đẩy
 * trên điện thoại, nên phải trả lời đúng câu "của ai, việc gì" trong một dòng. Chi tiết để thẻ
 * lo — nhồi cả chi tiết vào `text` là hiện hai lần cùng một nội dung.
 */
export function buildNewAssignmentMessage(notice: AssignmentNotice, now?: Date): ChatPayload {
  const mo = moText(notice.moNumber);
  const widgets: Array<Record<string, unknown>> = [
    specRow("CLOCK", "Deadline KPI", deadlineWithDistance(notice.deadlineAt, now), true),
    specRow(
      "STAR",
      "Nhóm KPI",
      [notice.groupName ?? "—", fmtHours(notice.standardMinutes)].join(" · "),
    ),
  ];
  if (notice.workUrl) widgets.push(openWorkButton(notice.workUrl));

  return {
    text: `*${notice.designerName}* — có việc thiết kế 3D mới`,
    cardsV2: [{
      cardId: "design-3d-new-assignment",
      card: {
        header: { title: mo, subtitle: notice.productName ?? "—" },
        sections: [{ widgets }],
      },
    }],
    fallbackText: plainAssignmentText(notice, now),
  };
}

/**
 * Gộp nhiều lượt giao việc thành MỘT tin nhắn.
 *
 * Một lần lưu đơn có thể tạo nhiều lượt giao việc (đơn nhiều MO). Gửi rời từng cái sẽ dồn 5
 * tin vào Space cùng lúc — đúng kiểu làm người ta tắt thông báo. Gộp lại thành một tin.
 */
export function buildAssignmentBatchMessage(
  notices: readonly AssignmentNotice[],
  now?: Date,
): ChatPayload | null {
  if (notices.length === 0) return null;
  if (notices.length === 1) return buildNewAssignmentMessage(notices[0], now);

  const byDesigner = groupByDesigner(notices);

  // MỘT SECTION MỖI NGƯỜI, có tiêu đề tên. Người đọc tìm tên mình rồi chỉ đọc phần dưới nó —
  // cùng lý do với việc để tên ở dòng đầu của tin một-lượt.
  const sections = [...byDesigner].map(([designerName, list]) => ({
    header: escapeHtml(designerName),
    collapsible: false,
    widgets: list.map((notice) => specRow(
      "DESCRIPTION",
      `${moText(notice.moNumber)} · ${notice.productName ?? "—"}`,
      deadlineWithDistance(notice.deadlineAt, now),
      true,
    )),
  }));

  const workUrl = notices.find((n) => n.workUrl)?.workUrl;
  if (workUrl) sections.push({ header: "", collapsible: false, widgets: [openWorkButton(workUrl)] });

  return {
    text: `Có *${notices.length}* việc thiết kế 3D mới`,
    cardsV2: [{
      cardId: "design-3d-new-assignment-batch",
      card: {
        header: { title: `${notices.length} việc thiết kế 3D mới` },
        sections,
      },
    }],
    fallbackText: plainBatchText(notices, now),
  };
}

function groupByDesigner(notices: readonly AssignmentNotice[]): Map<string, AssignmentNotice[]> {
  const byDesigner = new Map<string, AssignmentNotice[]>();
  for (const notice of notices) {
    const list = byDesigner.get(notice.designerName) ?? [];
    list.push(notice);
    byDesigner.set(notice.designerName, list);
  }
  return byDesigner;
}

// ─── Bản chữ thuần — ĐƯỜNG LÙI khi Google Chat từ chối thẻ ────────────────────
//
// Giữ đúng nội dung bản cũ, chỉ sửa hai chỗ tệ nhất: link dùng cú pháp <url|nhãn> thay vì dán
// nguyên văn, và deadline kèm khoảng còn lại. Đây là bản KHÔNG BAO GIỜ bị từ chối vì không có
// schema nào để sai.

export function plainAssignmentText(notice: AssignmentNotice, now?: Date): string {
  const lines: string[] = [
    `*${notice.designerName}* — có việc thiết kế 3D mới`,
    "",
    `• MO: *${moText(notice.moNumber)}*`,
    `• Sản phẩm: ${notice.productName ?? "—"}`,
    `• Nhóm KPI: ${notice.groupName ?? "—"} (${fmtHours(notice.standardMinutes)})`,
    `• Deadline KPI: *${deadlineWithDistance(notice.deadlineAt, now)}*`,
  ];
  if (notice.workUrl) lines.push("", `<${notice.workUrl}|Mở việc>`);
  return lines.join("\n");
}

export function plainBatchText(notices: readonly AssignmentNotice[], now?: Date): string {
  const blocks: string[] = [`Có *${notices.length}* việc thiết kế 3D mới`];
  for (const [designerName, list] of groupByDesigner(notices)) {
    blocks.push("", `*${designerName}*`);
    for (const notice of list) {
      blocks.push(
        `• MO *${moText(notice.moNumber)}* — ${notice.productName ?? "—"}` +
          ` — hạn *${deadlineWithDistance(notice.deadlineAt, now)}*`,
      );
    }
  }
  const workUrl = notices.find((n) => n.workUrl)?.workUrl;
  if (workUrl) blocks.push("", `<${workUrl}|Mở việc>`);
  return blocks.join("\n");
}

// ─── Khai báo tăng ca chờ duyệt ──────────────────────────────────────────────
//
// VÌ SAO CÓ TIN NÀY: tăng ca là luồng DUY NHẤT cần người duyệt mà không phát ra tín hiệu nào.
// Giao việc mới thì có tin Chat; kết quả chờ kiểm thì có thẻ đếm trên màn 3D. Tăng ca thì quản lý
// phải tự nhớ mà bấm vào tab — và một khai báo không ai duyệt là tiền lương của nhân viên nằm
// treo, nên đây không phải chuyện tiện lợi.
//
// Đây là kênh DUY NHẤT hoạt động khi người duyệt KHÔNG mở app. Huy hiệu trên tab chỉ giúp người
// đã ở trong màn hình.

export type OvertimeNotice = {
  designerName: string;
  moNumber: string | null;
  productName: string | null;
  startAt: Date;
  endAt: Date;
  minutes: number;
  reason: string | null;
  /**
   * Số phút rơi vào GIỜ HÀNH CHÍNH. Tăng ca theo định nghĩa là làm ngoài giờ, nên đây là thứ
   * người duyệt cần soát trước khi bấm — hệ thống cố ý không chặn cứng vì có ca đặc thù hợp lệ.
   */
  overlapMinutes: number;
  workUrl?: string | null;
};

/** "07:30 → 09:00 ngày 13/08/2026", gộp ngày lại khi cùng một ngày. */
function formatVnRange(startAt: Date, endAt: Date): string {
  const sameDay = toVnYmd(startAt) === toVnYmd(endAt);
  return sameDay
    ? `${toVnHm(startAt)} → ${toVnHm(endAt)} ngày ${formatVnYmdShort(startAt)}`
    : `${formatVnDeadline(startAt)} → ${formatVnDeadline(endAt)}`;
}

function formatVnYmdShort(value: Date): string {
  const [y, m, d] = toVnYmd(value).split("-");
  return `${d}/${m}/${y}`;
}

export function buildOvertimeRequestMessage(notice: OvertimeNotice): ChatPayload {
  const widgets: Array<Record<string, unknown>> = [
    specRow("CLOCK", "Khoảng khai báo", formatVnRange(notice.startAt, notice.endAt), true),
    specRow("STAR", "Số giờ", fmtHours(notice.minutes)),
  ];
  if (notice.reason) widgets.push(specRow("DESCRIPTION", "Lý do", notice.reason));
  // Chỉ hiện khi CÓ vấn đề — một dòng "0 phút trong giờ hành chính" ở mọi tin sẽ bị mắt bỏ qua,
  // và bỏ qua luôn cái dòng đó khi nó khác 0.
  if (notice.overlapMinutes > 0) {
    widgets.push(specRow("CLOCK", "⚠ Rơi vào giờ hành chính", fmtHours(notice.overlapMinutes), true));
  }
  if (notice.workUrl) widgets.push(openWorkButton(notice.workUrl));

  return {
    // Một dòng, vì đây là dòng hiện trong danh sách hội thoại và trong thông báo đẩy trên điện
    // thoại. Phải trả lời "ai, bao nhiêu, cần gì ở tôi" trước khi người ta mở ra.
    text: `*${notice.designerName}* khai báo tăng ca ${fmtHours(notice.minutes)} — *chờ duyệt*`,
    cardsV2: [{
      cardId: "design-3d-overtime-request",
      card: {
        header: { title: moText(notice.moNumber), subtitle: notice.productName ?? "—" },
        sections: [{ widgets }],
      },
    }],
    fallbackText: plainOvertimeText(notice),
  };
}

export function plainOvertimeText(notice: OvertimeNotice): string {
  const lines: string[] = [
    `*${notice.designerName}* khai báo tăng ca *${fmtHours(notice.minutes)}* — chờ duyệt`,
    "",
    `• MO: *${moText(notice.moNumber)}* — ${notice.productName ?? "—"}`,
    `• Khoảng: *${formatVnRange(notice.startAt, notice.endAt)}*`,
  ];
  if (notice.reason) lines.push(`• Lý do: ${notice.reason}`);
  if (notice.overlapMinutes > 0) {
    lines.push(`• ⚠ ${fmtHours(notice.overlapMinutes)} rơi vào giờ hành chính — cần soát lại`);
  }
  if (notice.workUrl) lines.push("", `<${notice.workUrl}|Mở duyệt tăng ca>`);
  return lines.join("\n");
}

// ─── ĐỔI ƯU TIÊN THIẾT KẾ 3D ─────────────────────────────────────────────────
//
// VÌ SAO PHẢI CÓ TIN NHẮN: ưu tiên thiết kế là trục RIÊNG do quản lý đặt (xem kpi-3d/
// design-priority.ts). Người đặt và người phải đổi việc là HAI NGƯỜI KHÁC NHAU. Nếu chỉ đổi số
// trong DB thì nhân viên đang dựng dở một MO khác không có cách nào biết là thứ tự vừa đổi —
// và một ưu tiên không ai thấy thì không phải ưu tiên.
//
// CHỈ GỬI KHI GIÁ TRỊ THẬT SỰ ĐỔI, và chỉ khi MO đó ĐANG có người làm. Điều kiện thứ hai quan
// trọng hơn nó trông: Đặt đơn xếp ưu tiên lúc tạo đơn, trước khi giao việc — gửi lúc đó là gửi
// cho cả phòng một tin về việc chưa của ai.

export type DesignPriorityChangeNotice = {
  /** Tên các NV 3D đang giữ lượt của MO này. Rỗng nghĩa là chưa giao — đừng gửi. */
  designerNames: readonly string[];
  moNumber: string | null;
  productName: string | null;
  /** Nhãn bậc CŨ đã dịch sẵn ("Bình thường", "UT2 — Gấp"). */
  fromLabel: string;
  /** Nhãn bậc MỚI. */
  toLabel: string;
  /** Có phải nâng lên gấp hơn — quyết định tin nhắn nói "làm trước" hay "hạ ưu tiên". */
  raised: boolean;
  /** Ai đổi. Người nhận cần biết hỏi lại ai, không phải "hệ thống". */
  changedByName: string | null;
  workUrl?: string | null;
};

export function buildDesignPriorityChangedMessage(notice: DesignPriorityChangeNotice): ChatPayload | null {
  // Không có ai đang làm thì không có ai cần biết. Trả null để chỗ gọi khỏi phải tự nhớ luật.
  if (notice.designerNames.length === 0) return null;

  const who = notice.designerNames.join(", ");
  const widgets: Array<Record<string, unknown>> = [
    specRow("STAR", "Ưu tiên thiết kế", `${notice.fromLabel} → *${notice.toLabel}*`, true),
    specRow("PERSON", "Đang thực hiện", who),
  ];
  if (notice.changedByName) widgets.push(specRow("DESCRIPTION", "Người điều chỉnh", notice.changedByName));
  widgets.push(specRow(
    "CLOCK",
    "Cần làm gì",
    notice.raised
      ? "Ưu tiên dựng MO này trước các việc đang chờ."
      : "Có thể nhường chỗ cho việc gấp hơn trong hàng.",
  ));
  if (notice.workUrl) widgets.push(openWorkButton(notice.workUrl));

  return {
    // Chữ "thiết kế" là bắt buộc trong dòng này: Space còn nhận tin về ưu tiên của ĐƠN HÀNG, và
    // hai loại tin trơ giống nhau thì người đọc xử lý sai đúng lúc cần xử lý đúng.
    text: notice.raised
      ? `⬆ *Ưu tiên thiết kế* MO ${moText(notice.moNumber)} nâng lên *${notice.toLabel}* — ${who}`
      : `⬇ *Ưu tiên thiết kế* MO ${moText(notice.moNumber)} hạ về *${notice.toLabel}* — ${who}`,
    cardsV2: [{
      cardId: "design-3d-priority-changed",
      card: {
        header: { title: moText(notice.moNumber), subtitle: notice.productName ?? "—" },
        sections: [{ widgets }],
      },
    }],
    fallbackText: plainDesignPriorityChangedText(notice),
  };
}

export function plainDesignPriorityChangedText(notice: DesignPriorityChangeNotice): string {
  const arrow = notice.raised ? "⬆ nâng lên" : "⬇ hạ về";
  const lines: string[] = [
    `${arrow} *Ưu tiên thiết kế*: ${notice.fromLabel} → *${notice.toLabel}*`,
    "",
    `• MO: *${moText(notice.moNumber)}* — ${notice.productName ?? "—"}`,
    `• Đang thực hiện: ${notice.designerNames.join(", ")}`,
  ];
  if (notice.changedByName) lines.push(`• Người điều chỉnh: ${notice.changedByName}`);
  lines.push(
    notice.raised
      ? "• Ưu tiên dựng MO này trước các việc đang chờ."
      : "• Có thể nhường chỗ cho việc gấp hơn trong hàng.",
  );
  if (notice.workUrl) lines.push("", `<${notice.workUrl}|Mở việc thiết kế 3D>`);
  return lines.join("\n");
}

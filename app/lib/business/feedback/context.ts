// ─── Bối cảnh tự động ────────────────────────────────────────────────────────
//
// 🎯 ĐÂY LÀ LÝ DO TÍNH NĂNG NÀY HƠN ZALO. Khung nhập chữ thì Zalo cũng có; cái Zalo không
// bao giờ có là "báo cáo này đến từ màn PSX, đơn 25.9431, MO 25.32658_4, bản build b51ddb7".
//
// Điều làm tin nhắn chat vô dụng KHÔNG phải vì nó là chat — mà vì nó KHÔNG MANG THEO BỐI
// CẢNH. Mỗi lần nhận "chuyển xưởng bị lỗi này" kèm một ảnh là một vòng hỏi lại: đơn nào, MO
// nào, ai bấm, lúc nào. Vòng đó là toàn bộ chi phí, và nó tự động hoá được 100%.
//
// HAI TRƯỜNG QUÝ NHẤT: `commitSha` và `orderVersion`. Chúng biến "hôm trước em thấy lỗi"
// thành "lỗi ở bản b51ddb7, đơn phiên bản 14" — tức là TRUY ĐƯỢC, và KIỂM ĐƯỢC là đã sửa hay
// chưa. Không có chúng thì mỗi báo cáo cũ là một câu đố không lời giải.
//
// File THUẦN: không prisma, không React, không `window`.

/** Bối cảnh thô do client gom lại. Mọi trường đều có thể thiếu — client không được tin. */
export type RawFeedbackContext = {
  pageUrl?: unknown;
  orderId?: unknown;
  orderNumber?: unknown;
  moNumber?: unknown;
  orderVersion?: unknown;
  userAgent?: unknown;
  viewport?: unknown;
};

/** Bối cảnh đã chuẩn hoá, sẵn sàng ghi DB. */
export type FeedbackContext = {
  pageUrl: string | null;
  orderId: string | null;
  orderNumber: string | null;
  moNumber: string | null;
  orderVersion: number | null;
  userAgent: string | null;
  viewport: string | null;
};

// Hạn mức có chủ ý, KHÔNG phải số cho vui: bối cảnh là dữ liệu do client gửi lên, tức là do
// người dùng kiểm soát. Một URL 2MB hay một userAgent bị nhồi là cách làm phình bảng bằng
// đúng một request. Cắt ở đây, và cắt ÂM THẦM — bối cảnh bị dài quá không phải lý do để chặn
// một báo cáo lỗi thật.
const MAX_URL = 500;
const MAX_SHORT = 120;
const MAX_UA = 400;

/**
 * Chuẩn hoá + cắt. KHÔNG BAO GIỜ ném lỗi và KHÔNG BAO GIỜ từ chối.
 *
 * ⚠️ Điều này là CỐ Ý và quan trọng: bối cảnh là thứ PHỤ TRỢ. Người dùng đang cố báo một lỗi;
 * để việc gửi thất bại vì cái `viewport` gửi lên sai định dạng là biến công cụ báo lỗi thành
 * một lỗi nữa. Thiếu bối cảnh thì báo cáo kém giá trị đi; mất báo cáo thì mất hẳn.
 */
export function normalizeFeedbackContext(raw: RawFeedbackContext | null | undefined): FeedbackContext {
  const r = raw ?? {};
  return {
    pageUrl: safeUrl(str(r.pageUrl, MAX_URL)),
    orderId: str(r.orderId, MAX_SHORT),
    orderNumber: str(r.orderNumber, MAX_SHORT),
    moNumber: str(r.moNumber, MAX_SHORT),
    orderVersion: int(r.orderVersion),
    userAgent: str(r.userAgent, MAX_UA),
    viewport: str(r.viewport, 32),
  };
}

/**
 * Bản build đang chạy — đọc ở SERVER, không nhận từ client.
 *
 * ⚠️ VÌ SAO KHÔNG ĐỂ CLIENT GỬI LÊN: client chỉ biết bản build của bundle JS nó đã tải, mà
 * tab mở từ hôm qua vẫn đang chạy bundle cũ sau khi đã deploy bản mới. Đọc ở server thì lấy
 * được bản đang PHỤC VỤ. Hai con số này lệch nhau đúng vào lúc đáng quan tâm nhất — ngay sau
 * một lần deploy — nên phải chọn một, và server là vế đúng.
 *
 * Cắt 7 ký tự: đủ để `git show` tìm ra, và đọc được trong một dòng danh sách.
 */
export function currentCommitSha(env: Record<string, string | undefined>): string | null {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim();
  return sha ? sha.slice(0, 7) : null;
}

/**
 * Một dòng bối cảnh cho người đọc — dùng ở danh sách admin và trong tin nhắn Chat.
 *
 * Ưu tiên MO rồi tới SO: khi cả hai đều có thì MO là thứ định danh chính xác hơn (một SO có
 * nhiều MO), và cũng là thứ nhân viên nói ra khi mô tả vấn đề.
 */
export function contextSummary(ctx: FeedbackContext): string | null {
  const parts: string[] = [];
  if (ctx.moNumber) parts.push(`MO ${ctx.moNumber}`);
  else if (ctx.orderNumber) parts.push(`SO ${ctx.orderNumber}`);
  if (ctx.orderNumber && ctx.moNumber) parts.push(`SO ${ctx.orderNumber}`);
  if (ctx.orderVersion != null) parts.push(`phiên bản ${ctx.orderVersion}`);
  const path = pathOf(ctx.pageUrl);
  if (path) parts.push(path);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Chỉ lấy phần đường dẫn của URL — bỏ tên miền.
 *
 * Tên miền thì mọi báo cáo đều giống nhau nên nó chỉ chiếm chỗ; và trong tin nhắn Chat, một
 * URL đầy đủ dài sẽ tự xuống dòng giữa chuỗi, làm dòng thông báo khó đọc.
 */
export function pathOf(pageUrl: string | null): string | null {
  if (!pageUrl) return null;
  try {
    const u = new URL(pageUrl);
    // Kiểm giao thức, KHÔNG chỉ dựa vào việc `new URL` không ném lỗi — xem `safeUrl`.
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.pathname}${u.search}`;
  } catch {
    // Không phải URL đầy đủ (client gửi lên đường dẫn tương đối) — dùng nguyên văn.
    return isRelativePath(pageUrl) ? pageUrl : null;
  }
}

/**
 * ⚠️ CHỐT CHẶN AN NINH, không phải chuẩn hoá cho đẹp.
 *
 * `pageUrl` do CLIENT gửi lên, và trang admin sẽ hiển thị nó thành MỘT LIÊN KẾT BẤM ĐƯỢC để
 * admin nhảy tới chỗ lỗi. Nghĩa là một chuỗi `javascript:...` gửi qua đây sẽ trở thành mã
 * chạy trong trình duyệt của admin — người có quyền cao nhất hệ thống.
 *
 * VÀ `new URL()` KHÔNG BẢO VỆ ĐƯỢC: `new URL("javascript:alert(1)")` PARSE THÀNH CÔNG (giao
 * thức `javascript:`, pathname `alert(1)`). Bọc trong try/catch rồi tin vào việc nó không ném
 * lỗi là đúng cái bẫy ở đây. Phải kiểm ĐÍCH DANH giao thức.
 *
 * Chỉ nhận: URL http/https, hoặc đường dẫn tương đối bắt đầu bằng một dấu "/".
 */
function safeUrl(value: string | null): string | null {
  if (!value) return null;
  if (isRelativePath(value)) return value;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Một dấu "/" ở đầu, KHÔNG phải hai.
 *
 * "//evil.com/x" là URL tuyệt đối ẩn danh giao thức (protocol-relative) — nó trông như đường
 * dẫn nội bộ nhưng trình duyệt sẽ đi ra máy chủ khác. Cùng lý do phải chặn ở đây.
 */
function isRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function int(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.trunc(value);
  // Version là số đếm, âm là dữ liệu rác — bỏ chứ không lưu để rồi hiện "phiên bản -3".
  return rounded >= 0 ? rounded : null;
}

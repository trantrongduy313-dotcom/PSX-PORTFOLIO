// ─── Nháp → Đăng, và LUẬT KHÔNG BẮN LẠI ──────────────────────────────────────
//
// ⚠️ MODULE ĐÁNG ĐỌC KỸ NHẤT CỦA TÍNH NĂNG NÀY. Nó giữ đúng một câu:
//
//     ĐĂNG LẦN ĐẦU THÌ BẮN THÔNG BÁO. SỬA THÌ KHÔNG.
//
// Sai câu đó là một lần sửa lỗi chính tả làm cả nhóm nhận thông báo lần hai — và nhận thông báo
// trùng đúng hai ba lần là người ta tắt thông báo Chat. Lúc đó mất luôn cả kênh này VÀ kênh
// cảnh báo lỗi của tính năng Góp ý, vì cùng một webhook.
//
// ─── VÌ SAO CÓ `notifiedAt` RIÊNG, KHÔNG SUY RA TỪ `isPublished` ──────────────
//
// Suy ra từ chuyển trạng thái ("vừa đổi từ false sang true thì bắn") là chỗ lỗi sống: nó đúng
// cho đường đi thuận, và sai ngay khi có ai bỏ đăng rồi đăng lại, hoặc khi hai tab cùng bấm
// Đăng, hoặc khi một lần chạy bị ngắt giữa lúc ghi DB và lúc gọi Chat.
//
// `notifiedAt` ghi lại MỘT SỰ THẬT ĐÃ XẢY RA — "ta đã nói với mọi người rồi" — chứ không phải
// một suy luận về trạng thái. Sự thật đã xảy ra thì không đảo được, nên phép kiểm luôn đúng dù
// đường đi có vòng vèo thế nào.
//
// ─── VÌ SAO ĐĂNG LÀ VIỆC THEO LƯỢT, KHÔNG PHẢI TỪNG MỤC ──────────────────────
//
// Người dùng gom trong ngày rồi đăng một lượt cuối ngày. Nếu mỗi mục tự bắn một tin thì đăng 5
// mục là Chat kêu 5 lần — đúng lỗi độ ồn đã học được ở tính năng Góp ý. Nên `publish` nhận CẢ
// TẬP, và `chat-message.ts` cũng nhận cả tập.
//
// File THUẦN: không prisma, không React.

export type ChangelogPublishState = {
  id: string;
  isPublished: boolean;
  /** null = CHƯA từng thông báo cho ai. Đây là trường quyết định, không phải `isPublished`. */
  notifiedAt: Date | null;
};

/** Mục nào sẽ được đăng trong lượt này. */
export function entriesToPublish<T extends ChangelogPublishState>(all: readonly T[]): T[] {
  return all.filter((e) => !e.isPublished);
}

/**
 * Trong số vừa đăng, mục nào ĐÁNG được nhắc trong tin nhắn.
 *
 * Lọc theo `notifiedAt === null`, KHÔNG theo "vừa mới đăng". Một mục từng đăng, bị bỏ đăng, rồi
 * đăng lại thì nó CÓ trong `entriesToPublish` nhưng KHÔNG được nhắc lại — người ta đã biết về
 * nó rồi, và nhắc lần hai là thông báo trùng.
 */
export function entriesToNotify<T extends ChangelogPublishState>(justPublished: readonly T[]): T[] {
  return justPublished.filter((e) => e.notifiedAt === null);
}

/**
 * Giá trị ghi vào DB khi đăng.
 *
 * ⚠️ `notifiedAt` chỉ được đặt cho mục CHƯA từng thông báo. Hàm này trả về hai dạng bản ghi
 * khác nhau cho hai ca đó, thay vì để chỗ gọi tự nhớ — chỗ gọi mà tự nhớ thì có ngày quên.
 */
export type PublishPatch = {
  isPublished: true;
  publishedAt: Date;
  notifiedAt?: Date;
};

export function publishPatch(entry: ChangelogPublishState, now: Date): PublishPatch {
  return {
    isPublished: true,
    // publishedAt LUÔN được đập lại: nó trả lời "mục này xuất hiện với người đọc từ lúc nào",
    // và chấm đỏ "có gì mới" so theo mốc đó. Đăng lại thì nó là mục mới trên trang.
    publishedAt: now,
    // notifiedAt CHỈ đặt một lần, mãi mãi.
    ...(entry.notifiedAt === null ? { notifiedAt: now } : {}),
  };
}

/**
 * Sửa nội dung một mục.
 *
 * 🔴 CHỦ ĐÍCH CỦA HÀM NÀY LÀ NHỮNG GÌ NÓ *KHÔNG* TRẢ VỀ: không `publishedAt`, không
 * `notifiedAt`, không `isPublished`. Sửa chính tả một mục đã đăng thì không được đẩy nó lên đầu
 * trang, và tuyệt đối không được bắn thông báo lần hai.
 *
 * Trả về đúng những trường được phép ghi là cách chặn ở TẦNG KIỂU: route không thể "vô tình"
 * ghi thêm gì, vì không có đường nào để ghi.
 */
export type ContentPatch = {
  title: string;
  body: string;
  area: string;
  isImportant: boolean;
};

export function contentPatch(input: {
  title: string;
  body: string;
  area: string;
  isImportant: boolean;
}): ContentPatch {
  return {
    title: input.title.trim(),
    body: input.body.trim(),
    area: input.area,
    isImportant: input.isImportant,
  };
}

/**
 * Bỏ đăng — đưa một mục về nháp.
 *
 * ⚠️ KHÔNG xoá `notifiedAt`. Nghe có lý là "bỏ đăng thì coi như chưa thông báo", nhưng nó SAI:
 * mọi người ĐÃ nhận tin rồi, và không có cách nào rút lại. Xoá `notifiedAt` là tự cho mình
 * quyền bắn lại lần hai cho cùng một nội dung.
 *
 * Đây chính là chỗ mà "ghi lại sự thật đã xảy ra" khác với "suy ra từ trạng thái".
 */
export type UnpublishPatch = { isPublished: false; publishedAt: null };

export function unpublishPatch(): UnpublishPatch {
  return { isPublished: false, publishedAt: null };
}

/** Xoá được không: chỉ nháp. Mục đã đăng thì người ta đã đọc — xoá là làm lịch sử nói dối. */
export function canDelete(entry: Pick<ChangelogPublishState, "isPublished">): boolean {
  return !entry.isPublished;
}

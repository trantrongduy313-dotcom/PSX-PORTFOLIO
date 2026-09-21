// ─── Ảnh sản phẩm upload trực tiếp cho một MO ─────────────────────────────────
//
// VÌ SAO CÓ TÍNH NĂNG NÀY: link Drive user dán vào thường là FOLDER (nhiều ảnh/nhiều góc
// nhìn), mà webapp không thể liệt kê nội dung folder (cần Drive API — đã bị chặn theo
// YEU_CAU_HO_TRO_IT_GOOGLE_OAUTH.md). Giải pháp: cho ADMIN/ORDER upload MỘT ảnh đại diện lưu
// trong Supabase Storage, hiện ngay trên table view để nhận diện nhanh; link Drive vẫn giữ
// song song để xem đầy đủ góc nhìn khi cần.
//
// File thuần (không I/O) để test trực tiếp — cùng khuôn drive-image.ts.

export type ImageUploadCandidate = { contentType: string; size: number };

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Giới hạn phía server LỚN HƠN mức browser tự thu nhỏ xuống (~200-400KB) — đây chỉ là chốt
// chặn cuối, phòng trường hợp browser không hỗ trợ canvas hoặc người dùng bypass client.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB

/** Vì sao KHÔNG được upload — trả null nếu hợp lệ. */
export function validateImageUpload(candidate: ImageUploadCandidate): string | null {
  if (!ALLOWED_CONTENT_TYPES.has(candidate.contentType)) {
    return "Chỉ nhận ảnh JPEG, PNG hoặc WEBP.";
  }
  if (candidate.size <= 0) {
    return "File rỗng hoặc không đọc được dung lượng.";
  }
  if (candidate.size > MAX_UPLOAD_BYTES) {
    return `Ảnh quá lớn (tối đa ${MAX_UPLOAD_BYTES / 1024 / 1024}MB) — hãy thử ảnh khác hoặc chụp lại ở độ phân giải thấp hơn.`;
  }
  return null;
}

/**
 * Tiền tố thư mục trong bucket cho từng KHE ảnh.
 *
 * 🔴 KHÔNG ĐỂ MỘT KHE LÀ TIỀN TỐ CỦA KHE KIA. Xoá ảnh của một khe quét theo tiền tố, nên
 * "mo" nằm trong "mo-sample" sẽ khiến xoá khe này chạm khe kia. Có test canh điều đó.
 *
 * ⚠️ Đây CỐ Ý chỉ là hai chuỗi, KHÔNG phải một bảng khai "các khe ảnh" kiểu ORDER_FILTER_SCOPE.
 * Hai khe khác HÌNH DẠNG — ảnh đại diện là một chuỗi ghi đè, ảnh mẫu là danh sách thêm/bớt —
 * nên một bảng chung vẫn phải rẽ nhánh theo hình dạng ở bên trong, tức giấu sự khác biệt chứ
 * không xoá được nó. Bảng khai sẽ đáng làm khi có khe thứ BA CÙNG hình dạng.
 */
export const IMAGE_PATH_PREFIX = {
  /** Ảnh đại diện MO — hiện trên bảng đơn hàng. */
  design: "mo",
  /** Ảnh mẫu Order gửi cho NV 3D. */
  sample: "sample",
} as const;

export type ImagePathPrefix = (typeof IMAGE_PATH_PREFIX)[keyof typeof IMAGE_PATH_PREFIX];

/** Số ảnh mẫu tối đa cho một MO. */
export const MAX_SAMPLE_IMAGES = 2;

function extensionFor(contentType: string): string {
  return contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
}

/**
 * Đường dẫn lưu trong bucket — CHỨA MÃ NGẪU NHIÊN, đây là thứ bảo vệ bucket công khai khỏi bị
 * dò URL. Không dùng orderItemId trần: id trong DB là cuid tuần tự-ish, dò được là xem được.
 */
export function buildImagePath(params: {
  orderItemId: string;
  contentType: string;
  /** Khe ảnh — xem IMAGE_PATH_PREFIX. Mặc định "mo" để giữ nguyên đường dẫn của ảnh đại diện. */
  prefix?: ImagePathPrefix;
  random?: string;
}): string {
  const random = params.random ?? cryptoRandom();
  const prefix = params.prefix ?? IMAGE_PATH_PREFIX.design;
  return `${prefix}/${params.orderItemId}/${random}.${extensionFor(params.contentType)}`;
}

function cryptoRandom(): string {
  // Không dùng Math.random() (không đủ ngẫu nhiên cho mục đích "khó dò URL").
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  // Fallback hiếm gặp (runtime cũ không có crypto.randomUUID) — vẫn đủ ngẫu nhiên cho mục đích này.
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

/** Ghép URL công khai đầy đủ từ base project + đường dẫn trong bucket. */
export function publicImageUrl(params: { supabaseUrl: string; bucket: string; path: string }): string {
  const base = params.supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${params.bucket}/${params.path}`;
}

/**
 * Bóc lại đường dẫn trong bucket từ URL công khai — HÀM NGƯỢC của `publicImageUrl`.
 *
 * 🔴 PHẢI NẰM CẠNH `publicImageUrl`. Trước đây nó là một hàm riêng tư trong route ảnh đại diện;
 * nay route ảnh mẫu cũng cần đúng phép bóc đó. Hai hàm ngược nhau mà ở hai file là chờ chúng
 * lệch — và khi lệch thì hậu quả không lên tiếng: xoá trượt object, để lại file mồ côi trong
 * bucket, hoặc tệ hơn là xoá trúng file của một MO khác.
 *
 * Trả null khi URL không thuộc bucket này (link Drive, ảnh dán từ nơi khác) — chỗ gọi phải coi
 * đó là "không có gì để xoá", không phải lỗi.
 */
export function pathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

/**
 * Thêm một ảnh mẫu vào danh sách — trần MAX_SAMPLE_IMAGES, không trùng.
 *
 * Trả về `null` khi KHÔNG thêm được (đã đầy), chứ không lặng lẽ cắt bớt: chỗ gọi cần phân biệt
 * "đã thêm" với "từ chối vì đầy" để báo đúng câu cho người dùng, và để KHÔNG xoá file vừa
 * upload lên storage khi thực ra nó chưa được ghi vào đâu cả.
 *
 * ⚠️ TRẦN ÉP Ở ĐÂY, không phải ở giao diện. Giao diện chỉ ẩn nút; API không được tin client.
 */
export function addSampleImage(current: readonly string[], url: string): string[] | null {
  const clean = url.trim();
  if (clean === "") return null;
  if (current.includes(clean)) return [...current];  // bấm hai lần không tạo hai dòng
  if (current.length >= MAX_SAMPLE_IMAGES) return null;
  return [...current, clean];
}

/** Bỏ một ảnh mẫu khỏi danh sách. Không có trong danh sách thì trả về bản sao nguyên vẹn. */
export function removeSampleImage(current: readonly string[], url: string): string[] {
  const clean = url.trim();
  return current.filter((u) => u !== clean);
}

/**
 * BA TẦNG ưu tiên hiển thị — quyết định nằm ở ĐÂY, không phải trong JSX.
 *
 * Bài học từ chỗ khác trong dự án (kpi-3d/review.ts): để UI tự suy luận nguồn hiển thị bằng
 * cách so sánh chuỗi là code dễ vỡ âm thầm. Hàm này là nguồn quyết định DUY NHẤT; component
 * chỉ vẽ theo kết quả trả về.
 *
 *   1. Ảnh đã upload (designImageUrl)   → hiện ảnh đó, ưu tiên cao nhất, luôn có sẵn
 *   2. Chưa upload, có link Drive       → giao cho component thử bóc thumbnail (drive-image.ts)
 *   3. Không có gì                      → không có ảnh
 *
 * Link Drive (`driveLinkUrl`) LUÔN trả về nếu có, độc lập với ảnh — để giữ song song đúng
 * yêu cầu "ảnh chỉ để nhận diện nhanh, Drive để xem đủ góc nhìn".
 */
export function resolveMoImageSource(params: {
  designImageUrl: string | null | undefined;
  designFileUrl: string | null | undefined;
}): { uploadedImageUrl: string | null; driveLinkUrl: string | null } {
  return {
    uploadedImageUrl: params.designImageUrl?.trim() || null,
    driveLinkUrl: params.designFileUrl?.trim() || null,
  };
}

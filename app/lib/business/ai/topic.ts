import type { GuideRole } from "@/app/lib/guide/content";

// ─── Một "mục kiến thức" là gì ───────────────────────────────────────────────
//
// Đây là đơn vị nhỏ nhất của bộ nội dung mà trợ lý được phép đọc. Một mục = một file `.md`
// trong app/lib/ai/knowledge/.
//
// VÌ SAO CHIA FILE THAY VÌ MỘT FILE LỚN — bốn thứ đến cùng lúc, và ba trong đó là bắt buộc:
//
//   1. CÓ ĐỊA CHỈ ĐỂ DẪN NGUỒN. Trợ lý trả lời rồi nói "theo mục Luồng trạng thái đơn". Một
//      file duy nhất thì không dẫn được gì, và một câu trả lời không dẫn được nguồn là một
//      câu người đọc không có cách nào tự kiểm.
//   2. LỌC THEO VAI TRÒ. `roles:` cho phép nhân viên 3D không nhận về kiến thức của Sales —
//      vừa đúng hơn (không trả lời về màn họ không vào được), vừa rẻ hơn (ít chữ hơn).
//   3. `lastReviewed` — cùng lý do với `ChapterDef.lastReviewed` ở app/lib/guide/content.tsx:
//      ĐỔI MỘT LỖI IM LẶNG THÀNH MỘT LỖI LÊN TIẾNG. Nội dung mô tả trạng thái hiện tại, nên
//      mỗi lần hệ thống đổi là một mục nào đó thành sai. Không có mốc thì nó ÂM THẦM TỰ NHẬN
//      LÀ ĐANG ĐÚNG.
//   4. Sửa một chủ đề không đụng chủ đề khác.
//
// ⚠️ VÀ ĐÂY LÀ RỦI RO PHẢI NÓI RÕ: bộ nội dung này và 23 chương Hướng dẫn CÙNG MÔ TẢ MỘT HỆ
// THỐNG. Đó đúng là "hai nơi lưu cùng một sự thật thì sớm muộn lệch", và ở đây KHÔNG giải được
// bằng cấu trúc — bộ này do người viết tay, không rút ra từ content.tsx.
//
// Cách giảm thiểu là PHÂN VAI, và luật viết ở knowledge/README.md:
//   - Hướng dẫn dạy CÁCH LÀM (bấm đâu, theo thứ tự nào).
//   - Bộ này ghi LUẬT VÀ LÝ DO (trạng thái nào sang được trạng thái nào, vì sao bị chặn, con
//     số nào tính thế nào).
// Chồng chéo càng ít thì lệch càng ít. Cộng với `lastReviewed` để khi lệch thì có dấu vết.

export type KnowledgeTopic = {
  /** Định danh ổn định, dùng làm nhãn dẫn nguồn. KHÔNG được đổi khi đã có log trỏ tới nó. */
  id: string;
  title: string;
  /** Vai trò nào được đọc mục này. Rỗng = mọi vai trò. */
  roles: readonly GuideRole[];
  /** "YYYY-MM" — xem ghi chú đầu file. */
  lastReviewed: string;
  body: string;
};

const ALL_GUIDE_ROLES: readonly GuideRole[] = ["employee", "manager", "design3d"];

function isGuideRole(value: string): value is GuideRole {
  return (ALL_GUIDE_ROLES as readonly string[]).includes(value);
}

/**
 * Lỗi cú pháp trong một file nội dung.
 *
 * Ném lỗi chứ KHÔNG bỏ qua mục sai: một mục bị lặng lẽ loại khỏi bộ là trợ lý mất kiến thức
 * mà không ai biết, và biểu hiện duy nhất là nó bắt đầu trả lời "chưa có trong nội dung" cho
 * một câu mà bạn nhớ rõ là đã viết. `npm run kb:build` phải đỏ ngay tại chỗ.
 */
export class KnowledgeParseError extends Error {}

/**
 * Tách phần khai báo khỏi phần thân.
 *
 * Định dạng CỐ Ý thô sơ — `key: value` mỗi dòng, rồi một dòng `---`, rồi thân:
 *
 *     id: luong-trang-thai-don
 *     title: Luồng trạng thái đơn hàng
 *     roles: manager, employee
 *     lastReviewed: 2026-08
 *     ---
 *     Nội dung...
 *
 * KHÔNG dùng YAML: thêm một thư viện phân tích cú pháp cho bốn cặp khoá-giá trị là đổi một
 * việc năm phút thành một phụ thuộc phải theo dõi mãi. Và định dạng càng đơn giản thì người
 * viết nội dung càng ít có cơ hội gõ sai.
 */
export function parseKnowledgeTopic(raw: string, fileName: string): KnowledgeTopic {
  const at = (msg: string) => new KnowledgeParseError(`${fileName}: ${msg}`);

  // `\r?\n` — file có thể được soạn trên Windows (dự án này chạy trên Windows). Bỏ qua `\r`
  // là mọi giá trị mang theo một ký tự vô hình, và `lastReviewed` sẽ không khớp regex với một
  // thông báo lỗi hoàn toàn vô nghĩa.
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const sep = lines.indexOf("---");
  if (sep === -1) throw at('thiếu dòng "---" ngăn phần khai báo với phần nội dung');

  const meta = new Map<string, string>();
  for (const line of lines.slice(0, sep)) {
    if (line.trim() === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) throw at(`dòng khai báo không có dấu hai chấm: "${line}"`);
    meta.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }

  const need = (key: string): string => {
    const v = meta.get(key);
    if (!v) throw at(`thiếu "${key}:" ở phần khai báo`);
    return v;
  };

  const id = need("id");
  // id đi vào câu trả lời và vào log. Cho phép dấu cách hay chữ hoa là mở đường cho hai id
  // chỉ khác nhau ở chỗ không nhìn thấy được.
  if (!/^[a-z0-9-]+$/.test(id)) throw at(`id "${id}" chỉ được dùng chữ thường, số và dấu gạch ngang`);

  const lastReviewed = need("lastReviewed");
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(lastReviewed)) {
    throw at(`lastReviewed "${lastReviewed}" phải có dạng YYYY-MM`);
  }

  // `roles` KHÔNG bắt buộc, và vắng nghĩa là MỌI vai trò. Mặc định phải là "ai cũng đọc được":
  // quên khai roles thì hậu quả là một mục đến với nhiều người hơn cần thiết — chấp nhận được.
  // Mặc định ngược lại (không ai đọc được) thì hậu quả là một mục vô hình, và đó là loại lỗi
  // không bao giờ tự lộ ra.
  const rolesRaw = meta.get("roles");
  let roles: readonly GuideRole[] = [];
  if (rolesRaw) {
    const parts = rolesRaw.split(",").map((s) => s.trim()).filter(Boolean);
    for (const p of parts) {
      if (!isGuideRole(p)) throw at(`roles có giá trị lạ "${p}" (chỉ nhận: ${ALL_GUIDE_ROLES.join(", ")})`);
    }
    roles = parts as GuideRole[];
  }

  const body = lines.slice(sep + 1).join("\n").trim();
  if (!body) throw at("phần nội dung rỗng");

  return { id, title: need("title"), roles, lastReviewed, body };
}

/** Mục này có dành cho vai trò đang hỏi không. Không khai `roles` = dành cho mọi vai trò. */
export function topicAppliesTo(topic: KnowledgeTopic, role: GuideRole): boolean {
  return topic.roles.length === 0 || topic.roles.includes(role);
}

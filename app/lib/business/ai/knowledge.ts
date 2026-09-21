import type { GuideRole } from "@/app/lib/guide/content";
import { topicAppliesTo, type KnowledgeTopic } from "./topic";

// ─── Chọn và gói bộ kiến thức cho MỘT lượt hỏi ───────────────────────────────
//
// Toàn bộ file này là hàm thuần: vào là danh sách mục + vai trò, ra là chữ. Không đọc đĩa,
// không gọi mạng, không đọc `process.env`. Nên nó test được trọn vẹn mà không cần API key —
// và đó là điều kiện để những luật quan trọng nhất của tính năng này có test thật.
//
// 🎯 VÌ SAO KHÔNG DÙNG VECTOR DB / EMBEDDING:
//
// RAG với vector DB tồn tại vì kho tài liệu quá lớn không nhét vừa một prompt. Kho ở đây KHÔNG
// lớn: lọc theo vai trò rồi còn vài mục, cỡ vài chục nghìn token — vừa thoải mái trong cửa sổ
// ngữ cảnh. Nên gửi thẳng toàn bộ, và đổi lại được ba thứ:
//
//   1. KHÔNG CÓ BƯỚC TÌM KIẾM → không có lỗi tìm sai mục. Đó là chế độ hỏng phổ biến nhất của
//      RAG và cũng là loại khó chẩn đoán nhất, vì câu trả lời vẫn trôi chảy.
//   2. Không thêm hạ tầng, không job đánh index, không có index lệch với nội dung.
//   3. Trợ lý thấy TOÀN CẢNH nên trả lời được câu bắc qua nhiều mục.
//
// Khi nào phải đổi: khi bộ nội dung vượt khoảng gấp ba hiện tại. Ngưỡng đó có hàm đo bên dưới
// (`estimateKnowledgeTokens`) để không phải phỏng đoán.

/** Mục đã chọn cho một lượt hỏi, kèm chữ đã gói. */
export type KnowledgeSelection = {
  topics: readonly KnowledgeTopic[];
  /** Khối chữ đưa vào prompt. Rỗng khi không có mục nào. */
  block: string;
  /** Các id được phép dẫn nguồn — dùng để loại id trợ lý tự bịa ra. */
  allowedIds: readonly string[];
};

export function selectKnowledge(
  topics: readonly KnowledgeTopic[],
  role: GuideRole,
  /**
   * Id các mục CÓ THỂ ĐÃ CŨ — server tính từ changelog (business/docs/staleness.ts).
   *
   * Đi qua đây chứ không để chỗ gọi tự dựng khối: `block` và `allowedIds` phải luôn được sinh
   * từ CÙNG một tập mục, và tách ra hai bước là mở cửa cho hai bên lệch nhau.
   */
  staleIds: ReadonlySet<string> = new Set(),
): KnowledgeSelection {
  const picked = topics.filter((t) => topicAppliesTo(t, role));
  return {
    topics: picked,
    block: formatKnowledgeBlock(picked, staleIds),
    allowedIds: picked.map((t) => t.id),
  };
}

/**
 * Gói các mục thành một khối chữ.
 *
 * Mỗi mục được rào bằng thẻ có `id` để mô hình có thứ CỤ THỂ mà trích dẫn. Không có nhãn thì
 * nó sẽ dẫn nguồn bằng cách mô tả lại tiêu đề theo cách riêng, và câu trả lời mất khả năng
 * đối chiếu tự động — tức là mất luôn cái nút "Mở mục này" mà người đọc cần để tự kiểm.
 *
 * ⚠️ THỨ TỰ PHẢI ỔN ĐỊNH (theo thứ tự file, do script sắp theo tên). Khối này được cache ở
 * phía nhà cung cấp mô hình, và cache khớp theo TIỀN TỐ CHÍNH XÁC của prompt — đảo thứ tự giữa
 * hai lượt hỏi là mất cache, tức là trả tiền đầy đủ cho mọi câu.
 */
export function formatKnowledgeBlock(
  topics: readonly KnowledgeTopic[],
  /**
   * Các mục ĐÃ ĐƯỢC TÍNH LÀ CÓ THỂ CŨ (business/docs/staleness.ts).
   *
   * 🔴 SERVER TÍNH, MÔ HÌNH CHỈ ĐỌC CỜ. Khối này đã mang sẵn `ra-soat="2026-06"`, nên về lý mô
   * hình "tự so được với hôm nay". Nhưng phép ngày tháng là thứ mô hình làm KHÔNG đáng tin, và
   * sai ở đây nghĩa là nó khẳng định chắc nịch một điều đã cũ. Tính sẵn thì kết quả tất định.
   *
   * ⚠️ CỜ BOOLEAN, KHÔNG PHẢI SỐ ĐẾM — và đây là một ràng buộc THẬT, không phải sở thích:
   * khối kiến thức được CACHE ở phía nhà cung cấp, khớp theo TIỀN TỐ CHÍNH XÁC. Nhét
   * `so-thay-doi="12"` vào đây thì mỗi lần đăng một mục "Có gì mới" là con số đổi → tiền tố đổi
   * → MẤT CACHE cho mọi câu hỏi sau đó. Cờ boolean chỉ lật MỘT LẦN cho mỗi chu kỳ rà, nên nó
   * gần như không đụng tới cache.
   */
  staleIds: ReadonlySet<string> = new Set(),
): string {
  if (topics.length === 0) return "";
  return topics
    .map((t) => {
      const stale = staleIds.has(t.id) ? ' co-the-cu="true"' : "";
      return `<muc id="${t.id}" tieu-de="${t.title}" ra-soat="${t.lastReviewed}"${stale}>\n${t.body}\n</muc>`;
    })
    .join("\n\n");
}

/** Tra một mục theo id — dùng khi dựng nút "Mở mục này" từ phần dẫn nguồn. */
export function findTopic(
  topics: readonly KnowledgeTopic[],
  id: string,
): KnowledgeTopic | null {
  return topics.find((t) => t.id === id) ?? null;
}

/**
 * Ước lượng số token của khối kiến thức.
 *
 * ⚠️ LÀ ƯỚC LƯỢNG, KHÔNG PHẢI SỐ ĐO. Cách đếm token thật phụ thuộc bộ tách từ của nhà cung
 * cấp, và kéo bộ đó vào chỉ để hiện một con số cảnh báo là không đáng.
 *
 * Chia 3 chứ không chia 4 (quy tắc thường dùng cho tiếng Anh): tiếng Việt có dấu, và mỗi chữ
 * có dấu thường tốn nhiều token hơn một chữ tiếng Anh cùng độ dài. Ước lượng phải nghiêng về
 * phía CAO HƠN thực tế — một ngưỡng cảnh báo báo sớm thì vô hại, báo muộn thì vô dụng.
 */
export function estimateKnowledgeTokens(block: string): number {
  return Math.ceil(block.length / 3);
}

/**
 * Ngưỡng nhắc "đã tới lúc nghĩ lại cách chọn mục".
 *
 * Không phải giới hạn kỹ thuật — cửa sổ ngữ cảnh còn rộng hơn nhiều. Đây là ngưỡng KINH TẾ:
 * quá mức này thì mỗi câu hỏi bắt đầu đắt một cách vô ích, vì phần lớn nội dung gửi đi không
 * liên quan gì đến câu được hỏi.
 */
export const KNOWLEDGE_TOKEN_WARN_AT = 90_000;

export function knowledgeTooLarge(block: string): boolean {
  return estimateKnowledgeTokens(block) > KNOWLEDGE_TOKEN_WARN_AT;
}

/**
 * Dấu vân tay của các file nguồn `.md`.
 *
 * ⚠️ TỒN TẠI ĐỂ CHỐT MỘT CHỖ HỞ CÓ THẬT. Bộ nội dung được viết bằng `.md` nhưng lúc chạy thì
 * đọc từ `generated.ts` (xem scripts/build-knowledge.ts để biết vì sao). Đó là hai nơi giữ
 * cùng một sự thật — sửa `.md` mà quên `npm run kb:build` thì trợ lý IM LẶNG đọc bản cũ, và
 * biểu hiện duy nhất là nó trả lời theo nội dung bạn tưởng mình đã sửa.
 *
 * Hàm này cho phép một test đọc lại thư mục `.md`, băm lại, và so với con số đã sinh ra. Quên
 * chạy lại thì TEST ĐỎ — một lỗi lên tiếng thay cho một lỗi im lặng.
 *
 * KHÔNG dùng `crypto`: cần một hàm băm THUẦN, chạy được ở mọi nơi, và không cần chống va chạm
 * có chủ ý — đây là bộ dò lệch, không phải bộ chống giả mạo. FNV-1a 32-bit là đủ và đọc được.
 */
export function knowledgeChecksum(sources: readonly { file: string; raw: string }[]): string {
  // Sắp theo tên file để checksum không phụ thuộc thứ tự thư mục trả về của hệ điều hành —
  // nếu phụ thuộc thì cùng một nội dung có thể ra hai giá trị trên hai máy, và test sẽ đỏ vì
  // một lý do hoàn toàn không liên quan đến nội dung.
  const joined = [...sources]
    .sort((a, b) => a.file.localeCompare(b.file))
    // Kèm cả TÊN FILE, không chỉ nội dung: đổi tên một file là một thay đổi thật (id dẫn nguồn
    // có thể theo đó mà đổi), nên nó phải làm checksum đổi.
    .map((s) => `${s.file} ${s.raw.replace(/\r\n/g, "\n")}`)
    .join("");

  let hash = 0x811c9dc5;
  for (let i = 0; i < joined.length; i++) {
    hash ^= joined.charCodeAt(i);
    // Math.imul — nhân 32-bit có tràn. Dùng `*` là vượt Number.MAX_SAFE_INTEGER rồi mất bit
    // thấp, và hàm băm mất tác dụng một cách âm thầm.
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

import { ROLE_LABELS } from "@/app/lib/roles";
import type { UserRole } from "@/app/generated/prisma/client";
import type { KnowledgeSelection } from "./knowledge";

// ─── Chỉ thị hệ thống — nơi tính năng này sống hoặc chết ─────────────────────
//
// 🔴 CẠM BẪY LỚN NHẤT, VÀ NÓ ĐẾN TỪ MẶT TỐT CỦA MÔ HÌNH: mô hình rất MUỐN GIÚP. Hỏi một điều
// không có trong bộ nội dung, nó sẽ lấp khoảng trống bằng kiến thức chung về "hệ thống ERP nói
// chung" — và câu trả lời nghe hoàn toàn hợp lý trong khi không mô tả hệ thống này.
//
// Đó là chế độ hỏng TỆ NHẤT ở đây, tệ hơn cả việc không trả lời được. Vấn đề đang giải là
// "hướng dẫn có thể không khớp thực tế"; một câu bịa trôi chảy làm vấn đề đó nặng thêm, vì nó
// xoá luôn cách để người đọc tự nghi ngờ.
//
// Nên các luật dưới đây không phải khuyến nghị về văn phong. Chúng là ràng buộc, và mỗi luật
// có test riêng ở __tests__/ai-prompt.test.ts.

/**
 * Nhãn mở đầu dòng dẫn nguồn.
 *
 * Hợp đồng đầu ra CỐ Ý thô sơ: một dòng cuối `NGUỒN: id, id`. Không dùng JSON.
 *
 * VÌ SAO KHÔNG JSON: câu trả lời là văn xuôi có gạch đầu dòng, và nhồi văn xuôi tiếng Việt vào
 * một chuỗi JSON là mời gọi đúng loại lỗi khó nhất — một dấu ngoặc kép chưa thoát làm TOÀN BỘ
 * câu trả lời không parse được, và người dùng nhận một lỗi hệ thống thay cho một câu trả lời
 * đã đúng sẵn. Một dòng cuối thì phân tích hỏng cũng chỉ mất phần dẫn nguồn.
 */
export const SOURCE_LINE_PREFIX = "NGUỒN:";

/** Giá trị nói thẳng "không có trong bộ nội dung". */
export const NO_SOURCE_TOKEN = "KHÔNG";

export type PromptInput = {
  knowledge: KnowledgeSelection;
  /** Vai trò tài khoản — để trợ lý biết người hỏi thấy được những màn nào. */
  userRole: UserRole;
  /** Trang người dùng đang mở, nếu biết. Chỉ là gợi ý ngữ cảnh, không phải dữ liệu. */
  pageUrl?: string | null;
};

/**
 * Một khối của chỉ thị hệ thống, kèm câu trả lời cho "khối này có được cache không".
 *
 * 🎯 CACHE LÀ ĐÒN QUYẾT ĐỊNH VỀ CHI PHÍ, VÀ NÓ ÁP ĐẶT THỨ TỰ. Khối kiến thức là phần lớn nhất
 * (vài chục nghìn token) và y hệt nhau giữa mọi người dùng cùng vai trò. Nhưng cache chỉ ăn
 * theo TIỀN TỐ: phần được cache phải nằm TRƯỚC. Nên kiến thức đi trước, chỉ thị đi sau.
 *
 * ✅ Và tình cờ thứ tự đó cũng TỐT HƠN về mặt tuân thủ: chỉ thị đặt gần câu hỏi thì được giữ
 * chặt hơn là đặt cách nó ba mươi nghìn token. Hai lý do cùng chỉ về một hướng.
 *
 * ⚠️ LUẬT KÈM THEO: không được để thứ gì THAY ĐỔI THEO NGƯỜI HỎI (vai trò, trang đang mở, tên)
 * lọt vào khối cache. Một ký tự khác nhau là cache trượt với người đó, và hoá đơn tăng lên mà
 * không ai hiểu vì sao.
 */
export type SystemBlock = { text: string; cache: boolean };

/** Khối kiến thức — lớn, ổn định, được cache. Chỉ phụ thuộc vai trò, không phụ thuộc câu hỏi. */
export function buildKnowledgeBlock(knowledge: KnowledgeSelection): string {
  return [
    `<kien-thuc>`,
    knowledge.block || `(chưa có mục nào dành cho vai trò này)`,
    `</kien-thuc>`,
  ].join("\n");
}

/** Khối chỉ thị — nhỏ, biến thiên theo người hỏi, KHÔNG cache. */
export function buildInstructionsBlock(input: Omit<PromptInput, "knowledge">): string {
  const roleLabel = ROLE_LABELS[input.userRole] ?? input.userRole;

  return [
    `Bạn là trợ lý hướng dẫn sử dụng của PSX — hệ thống quản lý sản xuất trang sức nội bộ.`,
    `Bạn trả lời DỰA TRÊN <kien-thuc> ở trên.`,
    `Người đang hỏi có vai trò: ${roleLabel}.`,
    input.pageUrl ? `Họ đang mở màn hình: ${input.pageUrl}` : null,
    ``,
    `# LUẬT BẮT BUỘC`,
    ``,
    // LUẬT 1 — luật quan trọng nhất. Đặt đầu tiên và nói thẳng cả HẬU QUẢ, không chỉ ra lệnh:
    // mô hình tuân thủ tốt hơn khi biết vì sao một ràng buộc tồn tại.
    `1. CHỈ trả lời bằng nội dung trong <kien-thuc>. Không dùng kiến thức chung về phần mềm, về`,
    `   ERP, hay về hệ thống nào khác. PSX có luật riêng, và một câu nghe hợp lý nhưng không lấy`,
    `   từ <kien-thuc> là một câu SAI kể cả khi nó đúng với hệ thống khác.`,
    ``,
    `2. Không tìm thấy câu trả lời trong <kien-thuc> thì NÓI THẲNG là chưa có, rồi dừng. Không`,
    `   suy diễn, không "thường thì", không "có thể là". Câu "nội dung hướng dẫn chưa nói về`,
    `   việc này" là một câu trả lời ĐÚNG và hữu ích — nó cho người hỏi biết cần đi hỏi người.`,
    ``,
    // LUẬT 3 — giai đoạn này trợ lý KHÔNG đọc cơ sở dữ liệu. Phải nói rõ, vì nếu không thì gặp
    // câu "đơn 26.12345 của tôi sao chưa xong" nó sẽ dựng ra một câu trả lời trông như đã tra.
    `3. Bạn KHÔNG xem được dữ liệu thật: không đọc được đơn hàng, không biết trạng thái của một`,
    `   MO cụ thể, không biết ai đang làm gì. Hỏi về một đơn cụ thể thì nói rõ bạn không xem`,
    `   được, và hướng dẫn họ TỰ xem ở đâu trong hệ thống.`,
    ``,
    `4. Trả lời bằng tiếng Việt, ngắn và cụ thể. Ưu tiên các bước bấm thật. Không mở đầu bằng`,
    `   lời chào hay lời khen câu hỏi.`,
    ``,
    // LUẬT 5 — độ cũ của nội dung.
    //
    // Cờ `co-the-cu` do SERVER tính (business/docs/staleness.ts), không phải mô hình tự so ngày:
    // phép ngày tháng là thứ mô hình làm không đáng tin, và sai ở đây là nó khẳng định chắc nịch
    // một điều đã cũ.
    //
    // ⚠️ CÂU NHẮC PHẢI NGẮN VÀ CHỈ KHI CÓ CỜ. Bắt nó dè dặt ở mọi câu trả lời là tái tạo đúng cái
    // bẫy vừa dẹp ở trang Hướng dẫn: một cảnh báo luôn bật thì người đọc học cách bỏ qua.
    `5. Mục nào trong <kien-thuc> có thuộc tính co-the-cu="true" nghĩa là hệ thống đã thay đổi`,
    `   nhiều kể từ lần mục đó được rà soát. Nếu câu trả lời của bạn DỰA VÀO một mục như vậy, thêm`,
    `   ĐÚNG MỘT câu ngắn ở cuối: nội dung này có thể chưa cập nhật, nên đối chiếu lại nếu thấy`,
    `   khác thực tế. Mục KHÔNG có thuộc tính đó thì TUYỆT ĐỐI không thêm câu nào kiểu này.`,
    ``,
    `# CÁCH KẾT THÚC CÂU TRẢ LỜI`,
    ``,
    `Dòng CUỐI CÙNG luôn là danh sách id của các mục bạn đã dùng:`,
    ``,
    `    ${SOURCE_LINE_PREFIX} id-muc-1, id-muc-2`,
    ``,
    `Không dùng mục nào (vì nội dung chưa có) thì ghi đúng:`,
    ``,
    `    ${SOURCE_LINE_PREFIX} ${NO_SOURCE_TOKEN}`,
    ``,
    // Chốt chặn cuối: id phải nằm trong danh sách được cấp. Vẫn kiểm lại ở answer.ts vì chỉ
    // thị là một YÊU CẦU, không phải một BẢO ĐẢM — nhưng nói ra thì tỉ lệ bịa id giảm rõ.
    `Chỉ dùng id có thật trong <kien-thuc>. Không tự đặt id mới.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * Chỉ thị hệ thống, chia khối theo khả năng cache.
 *
 * Đây là hàm mà tầng gọi mô hình dùng. `buildKnowledgeBlock` + `buildInstructionsBlock` để
 * riêng vì mỗi cái test được độc lập — và vì việc chúng KHÔNG được trộn vào nhau chính là luật
 * cần bảo vệ.
 */
export function buildSystemBlocks(input: PromptInput): SystemBlock[] {
  return [
    { text: buildKnowledgeBlock(input.knowledge), cache: true },
    { text: buildInstructionsBlock(input), cache: false },
  ];
}

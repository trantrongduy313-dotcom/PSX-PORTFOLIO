import { NO_SOURCE_TOKEN, SOURCE_LINE_PREFIX } from "./prompt";

// ─── Đọc câu trả lời của mô hình ─────────────────────────────────────────────
//
// Tách phần văn xuôi khỏi dòng dẫn nguồn, và — quan trọng nhất — LOẠI CÁC ID KHÔNG CÓ THẬT.
//
// 🔴 VÌ SAO PHẢI KIỂM LẠI ID DÙ CHỈ THỊ ĐÃ YÊU CẦU: chỉ thị là một YÊU CẦU, không phải một
// BẢO ĐẢM. Mô hình có thể ghép hai id thành một, hoặc đặt ra một id nghe rất hợp lý
// ("luong-trang-thai" thay vì "luong-trang-thai-don"). Nếu tin nguyên văn thì giao diện dựng
// một nút "Mở mục này" trỏ vào hư không — và người dùng bấm vào lúc họ đang cần kiểm chứng
// nhất. Một câu trả lời không dẫn được nguồn còn trung thực hơn một nguồn dẫn sai.

export type ParsedAnswer = {
  /** Phần người dùng đọc — đã bỏ dòng dẫn nguồn. */
  text: string;
  /** Các id đã được đối chiếu với danh sách cho phép. Có thể rỗng. */
  sourceIds: string[];
  /**
   * Mô hình có tự nhận là không tìm thấy câu trả lời không.
   *
   * 🎯 ĐÂY LÀ TRƯỜNG CÓ GIÁ TRỊ NHẤT CỦA CẢ TÍNH NĂNG, không phải một cờ phụ. Nó là danh sách
   * những chỗ bộ nội dung còn thiếu, do chính người dùng chỉ ra bằng câu hỏi thật của họ.
   */
  unanswered: boolean;
  /**
   * Mô hình dẫn id KHÔNG có thật — đã bị loại.
   *
   * Ghi lại để đo được: con số này tăng nghĩa là chỉ thị hoặc bộ id đang có vấn đề, chứ không
   * phải một chuyện ngẫu nhiên. Không có nó thì việc loại id là một hành động vô hình.
   */
  droppedIds: string[];
};

/**
 * Tìm dòng dẫn nguồn.
 *
 * Quét từ DƯỚI LÊN và chỉ nhận trong vài dòng cuối. Quét từ trên xuống là bắt phải một dòng
 * mô hình vô tình viết ra giữa bài (nó có thể nhắc lại định dạng khi giải thích), và khi đó
 * câu trả lời bị cắt mất phần thân.
 */
const SOURCE_SEARCH_DEPTH = 3;

export function parseAnswer(raw: string, allowedIds: readonly string[]): ParsedAnswer {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");

  let sourceLineIndex = -1;
  const from = Math.max(0, lines.length - SOURCE_SEARCH_DEPTH);
  for (let i = lines.length - 1; i >= from; i--) {
    if (lines[i].trim().startsWith(SOURCE_LINE_PREFIX)) {
      sourceLineIndex = i;
      break;
    }
  }

  // KHÔNG có dòng dẫn nguồn. Không coi là lỗi và không bỏ câu trả lời đi: người dùng vẫn nhận
  // được phần chữ, chỉ là không có nút mở mục. Ném lỗi ở đây là đổi một câu trả lời dùng được
  // thành một lỗi hệ thống vì một chuyện thuộc về định dạng.
  if (sourceLineIndex === -1) {
    return { text: raw.trim(), sourceIds: [], unanswered: false, droppedIds: [] };
  }

  const sourceLine = lines[sourceLineIndex].trim().slice(SOURCE_LINE_PREFIX.length).trim();
  const text = lines.slice(0, sourceLineIndex).join("\n").trim();

  // "KHÔNG" — mô hình tự nhận không có trong nội dung.
  //
  // So sánh KHÔNG PHÂN BIỆT HOA THƯỜNG và bỏ dấu chấm cuối: mô hình hay viết "Không." hoặc
  // "không". Bắt chính xác từng ký tự là biến chính cái cờ quan trọng nhất của tính năng thành
  // thứ thỉnh thoảng mới bắt được, và số liệu "chỗ nào nội dung còn thiếu" sẽ thiếu một cách
  // im lặng.
  const normalized = sourceLine.replace(/[.。]+$/, "").trim().toUpperCase();
  if (normalized === NO_SOURCE_TOKEN) {
    return { text, sourceIds: [], unanswered: true, droppedIds: [] };
  }

  const cited = sourceLine
    .split(",")
    .map((s) => s.trim().replace(/[.。]+$/, ""))
    .filter(Boolean);

  const allowed = new Set(allowedIds);
  const sourceIds: string[] = [];
  const droppedIds: string[] = [];
  for (const id of cited) {
    if (allowed.has(id)) {
      // Chống trùng: mô hình đôi khi kể một mục hai lần, và giao diện sẽ hiện hai nút giống nhau.
      if (!sourceIds.includes(id)) sourceIds.push(id);
    } else if (!droppedIds.includes(id)) {
      droppedIds.push(id);
    }
  }

  return {
    text,
    sourceIds,
    // ⚠️ Dẫn nguồn TOÀN BỘ là id bịa thì coi như KHÔNG TRẢ LỜI ĐƯỢC, dù mô hình không tự nhận.
    // Đây là ca đáng ngờ nhất: nó viết ra một câu trả lời rồi gán cho một nguồn không tồn tại,
    // tức là rất có thể nó đang nói từ kiến thức chung — đúng thứ luật số 1 cấm. Đánh dấu để
    // ca đó nổi lên trong số liệu thay vì lẫn vào các câu trả lời bình thường.
    unanswered: sourceIds.length === 0 && droppedIds.length > 0,
    droppedIds,
  };
}

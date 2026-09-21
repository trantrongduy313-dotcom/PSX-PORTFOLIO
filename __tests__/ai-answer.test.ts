import { describe, expect, it } from "vitest";

import { parseAnswer } from "@/app/lib/business/ai/answer";

const ALLOWED = ["tong-quan", "thiet-ke-3d"];

describe("parseAnswer — tách phần chữ khỏi dòng dẫn nguồn", () => {
  it("bỏ dòng NGUỒN khỏi phần người dùng đọc", () => {
    const r = parseAnswer("Câu trả lời.\n\nNGUỒN: tong-quan", ALLOWED);
    expect(r.text).toBe("Câu trả lời.");
    expect(r.sourceIds).toEqual(["tong-quan"]);
    expect(r.unanswered).toBe(false);
  });

  it("giữ nguyên xuống dòng trong phần thân", () => {
    // Câu trả lời có gạch đầu dòng và các bước. Gộp thành một dòng là mất khả năng đọc.
    const r = parseAnswer("Bước 1\nBước 2\nNGUỒN: tong-quan", ALLOWED);
    expect(r.text).toBe("Bước 1\nBước 2");
  });

  it("đọc nhiều id", () => {
    const r = parseAnswer("x\nNGUỒN: tong-quan, thiet-ke-3d", ALLOWED);
    expect(r.sourceIds).toEqual(["tong-quan", "thiet-ke-3d"]);
  });

  it("chống id trùng", () => {
    // Mô hình đôi khi kể một mục hai lần, và giao diện sẽ hiện hai nút giống nhau.
    const r = parseAnswer("x\nNGUỒN: tong-quan, tong-quan", ALLOWED);
    expect(r.sourceIds).toEqual(["tong-quan"]);
  });
});

describe("parseAnswer — cờ KHÔNG TRẢ LỜI ĐƯỢC", () => {
  it("NGUỒN: KHÔNG → unanswered", () => {
    const r = parseAnswer("Nội dung hướng dẫn chưa nói về việc này.\nNGUỒN: KHÔNG", ALLOWED);
    expect(r.unanswered).toBe(true);
    expect(r.sourceIds).toEqual([]);
    expect(r.text).toBe("Nội dung hướng dẫn chưa nói về việc này.");
  });

  it.each(["NGUỒN: không", "NGUỒN: Không.", "NGUỒN:  KHÔNG  "])("bắt được dạng %s", (line) => {
    // Bắt chính xác từng ký tự là biến CỜ QUAN TRỌNG NHẤT của tính năng thành thứ thỉnh thoảng
    // mới bắt được, và số liệu "chỗ nào nội dung còn thiếu" thiếu một cách im lặng.
    expect(parseAnswer(`x\n${line}`, ALLOWED).unanswered).toBe(true);
  });
});

describe("parseAnswer — LOẠI ID BỊA", () => {
  it("loại id không có trong danh sách cho phép", () => {
    // Chỉ thị là một YÊU CẦU, không phải một BẢO ĐẢM. Tin nguyên văn là giao diện dựng một nút
    // "Mở mục này" trỏ vào hư không — đúng lúc người dùng cần kiểm chứng nhất.
    const r = parseAnswer("x\nNGUỒN: tong-quan, luong-trang-thai", ALLOWED);
    expect(r.sourceIds).toEqual(["tong-quan"]);
    expect(r.droppedIds).toEqual(["luong-trang-thai"]);
  });

  it("TOÀN BỘ id bịa → coi như không trả lời được", () => {
    // Ca đáng ngờ nhất: viết ra một câu trả lời rồi gán cho một nguồn không tồn tại, tức là rất
    // có thể đang nói từ kiến thức chung — đúng thứ luật số 1 cấm. Phải nổi lên trong số liệu.
    const r = parseAnswer("Câu nghe rất hợp lý.\nNGUỒN: mot-muc-khong-ton-tai", ALLOWED);
    expect(r.sourceIds).toEqual([]);
    expect(r.unanswered).toBe(true);
    expect(r.droppedIds).toEqual(["mot-muc-khong-ton-tai"]);
  });

  it("có ít nhất một id thật thì KHÔNG coi là không trả lời được", () => {
    expect(parseAnswer("x\nNGUỒN: tong-quan, bia", ALLOWED).unanswered).toBe(false);
  });
});

describe("parseAnswer — các ca lệch định dạng", () => {
  it("KHÔNG có dòng NGUỒN thì vẫn giữ câu trả lời", () => {
    // Không coi là lỗi và không bỏ câu trả lời đi: ném lỗi ở đây là đổi một câu trả lời dùng
    // được thành một lỗi hệ thống vì một chuyện thuộc về định dạng.
    const r = parseAnswer("Câu trả lời không có dòng nguồn.", ALLOWED);
    expect(r.text).toBe("Câu trả lời không có dòng nguồn.");
    expect(r.sourceIds).toEqual([]);
    expect(r.unanswered).toBe(false);
  });

  it("KHÔNG nhận dòng NGUỒN nằm giữa bài", () => {
    // Quét từ trên xuống là bắt phải một dòng mô hình vô tình viết ra khi giải thích định dạng,
    // và khi đó câu trả lời bị cắt mất phần thân.
    const raw = ["Mở đầu.", "NGUỒN: tong-quan", "Đoạn hai.", "Đoạn ba.", "Đoạn bốn.", "Đoạn năm."].join("\n");
    const r = parseAnswer(raw, ALLOWED);
    expect(r.text).toContain("Đoạn năm.");
    expect(r.sourceIds).toEqual([]);
  });

  it("dòng NGUỒN có khoảng trắng thừa vẫn đọc được", () => {
    const r = parseAnswer("x\n\n   NGUỒN:  tong-quan  ", ALLOWED);
    expect(r.sourceIds).toEqual(["tong-quan"]);
  });

  it("CRLF vẫn đọc được", () => {
    expect(parseAnswer("x\r\nNGUỒN: tong-quan", ALLOWED).sourceIds).toEqual(["tong-quan"]);
  });

  it("danh sách cho phép rỗng thì mọi id đều bị loại", () => {
    const r = parseAnswer("x\nNGUỒN: bat-ky", []);
    expect(r.sourceIds).toEqual([]);
    expect(r.unanswered).toBe(true);
  });
});

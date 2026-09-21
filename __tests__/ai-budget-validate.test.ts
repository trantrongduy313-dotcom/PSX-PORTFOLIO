import { describe, expect, it } from "vitest";

import {
  MAX_QUESTIONS_GLOBAL_PER_DAY,
  MAX_QUESTIONS_PER_USER_PER_DAY,
  checkBudget,
} from "@/app/lib/business/ai/budget";
import {
  MAX_CONVERSATION_TURNS,
  MAX_QUESTION_LENGTH,
  MIN_QUESTION_LENGTH,
  conversationIsFull,
  oneLine,
  trimConversation,
  validateQuestion,
} from "@/app/lib/business/ai/validate";
import { suggestionsForPath } from "@/app/lib/business/ai/suggestions";

describe("validateQuestion", () => {
  it("nhận một câu hỏi bình thường", () => {
    expect(validateQuestion("Vì sao tôi không chuyển được đơn?")).toBeNull();
  });

  it.each([
    ["rỗng", ""],
    ["chỉ khoảng trắng", "   "],
    ["quá ngắn", "x".repeat(MIN_QUESTION_LENGTH - 1)],
    ["quá dài", "x".repeat(MAX_QUESTION_LENGTH + 1)],
  ])("từ chối khi %s", (_l, q) => {
    expect(validateQuestion(q)).toBeTruthy();
  });

  it("đúng ngưỡng thì vẫn nhận", () => {
    // Kiểm biên: `>` hay `>=` sai một bậc ở đây là từ chối một câu hỏi hợp lệ, và người dùng
    // không có cách nào biết vì sao.
    expect(validateQuestion("x".repeat(MAX_QUESTION_LENGTH))).toBeNull();
    expect(validateQuestion("x".repeat(MIN_QUESTION_LENGTH))).toBeNull();
  });
});

describe("hội thoại", () => {
  const turn = (i: number) => ({ question: `q${i}`, answer: `a${i}` });

  it("giữ các lượt GẦN NHẤT khi phải cắt", () => {
    // Ngữ cảnh gần câu hỏi mới mới là ngữ cảnh có ích.
    const kept = trimConversation([turn(1), turn(2), turn(3), turn(4)]);
    expect(kept).toHaveLength(MAX_CONVERSATION_TURNS - 1);
    expect(kept[kept.length - 1].question).toBe("q4");
  });

  it("không cắt khi còn chỗ", () => {
    expect(trimConversation([turn(1)])).toHaveLength(1);
  });

  it("conversationIsFull đúng ở biên", () => {
    const turns = Array.from({ length: MAX_CONVERSATION_TURNS }, (_, i) => turn(i));
    expect(conversationIsFull(turns.slice(0, -1))).toBe(false);
    expect(conversationIsFull(turns)).toBe(true);
  });
});

describe("oneLine", () => {
  it("gộp mọi khoảng trắng thành một dấu cách", () => {
    // Câu hỏi được lưu rồi hiện trong một bảng ở trang admin. Xuống dòng làm hàng bảng cao vọt
    // lên và bảng mất khả năng đọc theo cột.
    expect(oneLine("  a\n\n  b\tc  ")).toBe("a b c");
  });
});

describe("checkBudget", () => {
  it("còn lượt thì cho đi", () => {
    expect(checkBudget({ user: 0, global: 0 }).allowed).toBe(true);
  });

  it("hết lượt cá nhân → nói là của BẠN", () => {
    const r = checkBudget({ user: MAX_QUESTIONS_PER_USER_PER_DAY, global: 0 });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reason).toBe("USER");
      expect(r.message).toContain("Bạn đã hỏi");
    }
  });

  it("🔴 hết trần toàn hệ thống thì báo TRẦN HỆ THỐNG, dù cá nhân còn lượt", () => {
    // Thứ tự kiểm quan trọng: "hệ thống hết lượt hôm nay" dẫn tới hành động khác hẳn với "bạn
    // hết lượt". Báo sai lý do là người dùng đi hỏi admin cấp thêm lượt cho mình.
    const r = checkBudget({ user: 0, global: MAX_QUESTIONS_GLOBAL_PER_DAY });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("GLOBAL");
  });

  it("cả hai đều chạm trần thì TRẦN HỆ THỐNG thắng", () => {
    const r = checkBudget({
      user: MAX_QUESTIONS_PER_USER_PER_DAY,
      global: MAX_QUESTIONS_GLOBAL_PER_DAY,
    });
    if (!r.allowed) expect(r.reason).toBe("GLOBAL");
  });

  it("mọi câu từ chối đều chỉ đường đi tiếp", () => {
    // Một câu "hết lượt" trần là một ngõ cụt. Người dùng phải biết đi đâu tiếp.
    for (const counts of [
      { user: MAX_QUESTIONS_PER_USER_PER_DAY, global: 0 },
      { user: 0, global: MAX_QUESTIONS_GLOBAL_PER_DAY },
    ]) {
      const r = checkBudget(counts);
      if (!r.allowed) expect(r.message).toMatch(/Hướng dẫn|Góp ý/);
    }
  });
});

describe("suggestionsForPath — TIỀN TỐ DÀI NHẤT", () => {
  it("trang đơn hàng nhận gợi ý của đơn hàng, không phải gợi ý chung", () => {
    // Khớp-đầu-tiên là chỗ bảng này sẽ âm thầm sai ngay khi có người thêm một dòng vào giữa.
    expect(suggestionsForPath("/dashboard/orders")).toContain("Các trạng thái của một đơn nghĩa là gì?");
  });

  it("trang con cũng nhận gợi ý của trang cha gần nhất", () => {
    expect(suggestionsForPath("/dashboard/orders/abc123")).toContain(
      "Các trạng thái của một đơn nghĩa là gì?",
    );
  });

  it("trang không có mục riêng thì rơi về gợi ý chung", () => {
    expect(suggestionsForPath("/dashboard/statistics")).toContain("SO và MO khác nhau thế nào?");
  });

  it("KHÔNG khớp khi chỉ giống một phần tên đoạn đường dẫn", () => {
    // `/dashboard/ordersomething` không được nhận gợi ý của `/dashboard/orders`.
    expect(suggestionsForPath("/dashboard/ordersomething")).toContain("SO và MO khác nhau thế nào?");
  });

  it("bỏ query string và dấu / ở cuối", () => {
    expect(suggestionsForPath("/dashboard/orders/?orderId=x")).toEqual(
      suggestionsForPath("/dashboard/orders"),
    );
  });

  it("ngoài dashboard thì không gợi ý gì", () => {
    expect(suggestionsForPath("/auth/login")).toEqual([]);
    expect(suggestionsForPath(null)).toEqual([]);
    expect(suggestionsForPath(undefined)).toEqual([]);
  });
});

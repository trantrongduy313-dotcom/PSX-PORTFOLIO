import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  FEEDBACK_KINDS,
  feedbackFieldLabels,
  isFeedbackKind,
  shouldNotifyChat,
} from "@/app/lib/business/feedback/kind";

describe("shouldNotifyChat — CHỐT CHẶN QUAN TRỌNG NHẤT của tính năng", () => {
  // Test này không bảo vệ một hàm. Nó bảo vệ VIỆC ADMIN KHÔNG TẮT THÔNG BÁO GOOGLE CHAT.
  //
  // Nếu đề xuất cải tiến cũng bắn chuông, admin sẽ tắt thông báo sau khoảng hai tuần — và mất
  // luôn cảnh báo lỗi thật. Ngày nào có người "thống nhất hai nhánh cho gọn", test này nổ.

  it("BÁO LỖI thì bắn chuông", () => {
    expect(shouldNotifyChat("BUG")).toBe(true);
  });

  it("ĐỀ XUẤT thì TUYỆT ĐỐI KHÔNG bắn chuông", () => {
    expect(shouldNotifyChat("IDEA")).toBe(false);
  });

  it("đúng MỘT trong hai loại được bắn chuông — không phải cả hai, không phải không loại nào", () => {
    // Chốt bằng phép đếm: thêm loại thứ ba về sau mà mặc định cho bắn chuông thì test này bắt.
    expect(FEEDBACK_KINDS.filter(shouldNotifyChat)).toEqual(["BUG"]);
  });
});

describe("isFeedbackKind — cửa vào từ client, không tin dữ liệu gửi lên", () => {
  it.each(["BUG", "IDEA"])("%s hợp lệ", (v) => {
    expect(isFeedbackKind(v)).toBe(true);
  });

  it.each(["bug", "OTHER", "", null, undefined, 0, {}])("%s không hợp lệ", (v) => {
    expect(isFeedbackKind(v)).toBe(false);
  });
});

describe("Nhãn ô nhập đổi theo loại — đây là lý do chỉ có MỘT nút", () => {
  it("hai loại hỏi HAI câu khác nhau, không dùng chung một câu chung chung", () => {
    const bug = feedbackFieldLabels("BUG");
    const idea = feedbackFieldLabels("IDEA");
    expect(bug.summaryLabel).not.toBe(idea.summaryLabel);
    expect(bug.detailLabel).not.toBe(idea.detailLabel);
  });

  it("BÁO LỖI hỏi hiện trạng rồi hỏi mong đợi — đó là phép tách 'máy sai' khỏi 'tôi hiểu khác'", () => {
    const bug = feedbackFieldLabels("BUG");
    expect(bug.summaryLabel).toContain("thấy gì");
    expect(bug.detailLabel).toContain("mong");
  });

  it("ĐỀ XUẤT hỏi 'để làm gì' — thiếu nó thì admin không có cơ sở xếp thứ tự", () => {
    expect(feedbackFieldLabels("IDEA").detailLabel).toContain("giúp gì");
  });

  it("mọi loại đều có ví dụ cụ thể trong placeholder, không để ô trống trơn", () => {
    for (const kind of FEEDBACK_KINDS) {
      const l = feedbackFieldLabels(kind);
      expect(l.summaryPlaceholder).toContain("VD:");
      expect(l.detailPlaceholder).toContain("VD:");
    }
  });
});

describe("Route KHÔNG được tự viết lại luật 'loại nào bắn chuông'", () => {
  const src = readFileSync(join(process.cwd(), "app", "api", "feedback", "route.ts"), "utf8");

  it("BỘ DÒ CÒN CHẠY — vẫn thấy nhánh thông báo trong route", () => {
    expect(src).toContain("notifyNewFeedback");
  });

  it("route KHÔNG so sánh trực tiếp với chuỗi 'BUG'", () => {
    // So chuỗi tại chỗ là cách luật này bị nhân đôi. Quyết định thuộc shouldNotifyChat().
    expect(src).not.toMatch(/===\s*["']BUG["']/);
  });
});

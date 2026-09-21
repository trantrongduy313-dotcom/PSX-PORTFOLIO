import { describe, expect, it } from "vitest";

import { Z } from "@/app/lib/ui/z-index";

// Mỗi test dưới đây là một bài học đã trả giá, viết ở dạng thi hành được. Trước đây chúng là
// 60 dòng comment trong z-index.ts — không có gì ngăn người sau đổi một con số và phá chúng.

describe("thanh hành động nổi cạnh phải", () => {
  it("nằm TRÊN nền mờ của panel — bấm được ngay khi panel đang mở", () => {
    expect(Z.ACTION_DOCK).toBeGreaterThan(Z.ORDER_PANEL_BACKDROP);
  });

  // Bề rộng panel có thể đổi mà chỗ khác quên cập nhật. Thứ tự lớp là lưới an toàn: thứ bị che
  // phải là thanh hành động, không phải công việc.
  it("nằm DƯỚI panel — không bao giờ che nội dung panel", () => {
    expect(Z.ACTION_DOCK).toBeLessThan(Z.ORDER_PANEL);
  });
});

describe("thứ tự ba hộp thoại của thanh hành động", () => {
  // Từ hộp thoại trợ lý, câu trả lời "nội dung chưa nói về việc này" DẪN người dùng sang Góp ý.
  // Trợ lý mở trước, Góp ý mở sau — đảo thứ tự là người dùng bấm đúng đường thoát ta chỉ cho
  // họ rồi kẹt trong một hộp thoại bị che.
  it("Góp ý nằm TRÊN trợ lý — vì trợ lý dẫn sang Góp ý", () => {
    expect(Z.FEEDBACK_DIALOG).toBeGreaterThan(Z.ASK_AI_DIALOG);
  });

  // "Việc cần xử lý" là hộp thoại DUY NHẤT tự mở khi tải trang, nên nó dễ chắn đường người khác
  // nhất. Nó cũng không dẫn sang hộp thoại nào khác — chỉ dẫn sang trang Đơn hàng.
  it("Việc cần xử lý nằm DƯỚI cả hai — vì nó tự mở mà không ai yêu cầu", () => {
    expect(Z.SYNC_NOTICE_DIALOG).toBeLessThan(Z.ASK_AI_DIALOG);
    expect(Z.SYNC_NOTICE_DIALOG).toBeLessThan(Z.FEEDBACK_DIALOG);
  });

  it("cả ba nằm TRÊN panel và trên dropdown bên trong panel (200)", () => {
    for (const layer of [Z.SYNC_NOTICE_DIALOG, Z.ASK_AI_DIALOG, Z.FEEDBACK_DIALOG]) {
      expect(layer).toBeGreaterThan(Z.ORDER_PANEL);
      expect(layer).toBeGreaterThan(200);
    }
  });
});

describe("mỗi hộp thoại nằm ngay trên nền mờ của chính nó", () => {
  const dialogs = [
    { name: "Việc cần xử lý", backdrop: Z.SYNC_NOTICE_DIALOG_BACKDROP, dialog: Z.SYNC_NOTICE_DIALOG },
    { name: "Trợ lý", backdrop: Z.ASK_AI_DIALOG_BACKDROP, dialog: Z.ASK_AI_DIALOG },
    { name: "Góp ý", backdrop: Z.FEEDBACK_DIALOG_BACKDROP, dialog: Z.FEEDBACK_DIALOG },
  ];

  it.each(dialogs)("$name", ({ backdrop, dialog }) => {
    expect(dialog).toBe(backdrop + 1);
  });
});

describe("thang không có hai lớp trùng số", () => {
  // Hai tên cho cùng một con số là hai nơi lưu cùng một sự thật — đúng thứ file này tồn tại để
  // chặn. Trước đây FEEDBACK_BUTTON và ASK_AI_BUTTON đều bằng 35.
  it("mọi giá trị đều khác nhau", () => {
    const values = Object.values(Z);
    expect(new Set(values).size).toBe(values.length);
  });
});

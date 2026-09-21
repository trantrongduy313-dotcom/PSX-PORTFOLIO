import { describe, expect, it } from "vitest";

import {
  ASK_AI_PARAM,
  askAiHref,
  isAskAiRequested,
  urlWithoutAskAi,
} from "@/app/lib/ui/ask-ai-param";

// ─── Mở trợ lý bằng URL ──────────────────────────────────────────────────────
//
// Luật nhỏ nhưng cả hai chiều sai đều khó chịu theo cách khó truy:
//   · nhận quá rộng → một link gãy bật hộp thoại lên giữa màn hình, không rõ vì sao
//   · dọn không sạch → hộp thoại KHÔNG ĐÓNG ĐƯỢC (xem ghi chú ở urlWithoutAskAi)

describe("isAskAiRequested — khắt khe có chủ ý", () => {
  it("đúng chuỗi '1' thì mở", () => {
    expect(isAskAiRequested("1")).toBe(true);
  });

  // Bộ dựng URL nào đó nhét vào "undefined"/"null"/rỗng là chuyện đã xảy ra thật ở màn Đơn hàng
  // (orders-client phải tự phòng `?orderId=null`). Nhận bừa "truthy" là mời lại đúng lỗi đó.
  it("mọi giá trị khác đều KHÔNG mở", () => {
    for (const v of ["0", "", "true", "yes", "undefined", "null", "2", " 1", "1 "]) {
      expect(isAskAiRequested(v), JSON.stringify(v)).toBe(false);
    }
  });

  it("không có tham số thì không mở", () => {
    expect(isAskAiRequested(null)).toBe(false);
    expect(isAskAiRequested(undefined)).toBe(false);
  });
});

describe("urlWithoutAskAi — điều kiện để đóng được hộp thoại", () => {
  it("bỏ tham số ask", () => {
    expect(urlWithoutAskAi("/dashboard/help", "ask=1")).toBe("/dashboard/help");
  });

  // 🔴 CA QUAN TRỌNG NHẤT: người dùng đang mở panel đơn hàng rồi hỏi trợ lý. Đóng hộp thoại mà
  // đóng luôn panel của họ là một bất ngờ khó chịu — và rất khó đoán ra nguyên nhân.
  it("GIỮ NGUYÊN mọi tham số khác", () => {
    expect(urlWithoutAskAi("/dashboard/orders", "orderId=o1&tab=completed&ask=1"))
      .toBe("/dashboard/orders?orderId=o1&tab=completed");
  });

  it("không có ask thì đường dẫn không đổi", () => {
    expect(urlWithoutAskAi("/dashboard/orders", "tab=completed"))
      .toBe("/dashboard/orders?tab=completed");
  });

  it("không còn tham số nào thì KHÔNG để lại dấu '?' lủng lẳng", () => {
    // "/dashboard/help?" trông như một URL hỏng, và nó sẽ nằm trong lịch sử trình duyệt.
    expect(urlWithoutAskAi("/dashboard/help", "")).toBe("/dashboard/help");
    expect(urlWithoutAskAi("/dashboard/help", "ask=1")).not.toContain("?");
  });

  it("bỏ được cả khi ask xuất hiện nhiều lần", () => {
    expect(urlWithoutAskAi("/dashboard/help", "ask=1&ask=1")).toBe("/dashboard/help");
  });
});

describe("askAiHref ↔ isAskAiRequested — đi rồi về phải khớp", () => {
  it("link do askAiHref sinh ra thì isAskAiRequested nhận ra", () => {
    // Hai hàm này ở hai đầu của cùng một hợp đồng (trang trợ giúp phát, thanh hành động nhận).
    // Lệch nhau thì thẻ bấm được nhưng không mở gì — đúng lỗi đang sửa, chỉ khác nguyên nhân.
    const href = askAiHref("/dashboard/help");
    const search = new URLSearchParams(href.split("?")[1]);
    expect(isAskAiRequested(search.get(ASK_AI_PARAM))).toBe(true);
  });

  it("mở rồi đóng thì quay về đúng đường dẫn ban đầu", () => {
    const href = askAiHref("/dashboard/help");
    const [pathname, search] = href.split("?");
    expect(urlWithoutAskAi(pathname, search)).toBe("/dashboard/help");
  });
});

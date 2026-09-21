import { describe, expect, it } from "vitest";

import { AI_KEY_ENV, AI_MODELS, AI_PROVIDERS, resolveProvider } from "@/app/lib/business/ai/provider";

describe("resolveProvider", () => {
  it("không có key nào → null (tính năng tự ẩn)", () => {
    expect(resolveProvider({})).toBeNull();
  });

  it("có một key thì dùng đúng nhà cung cấp đó", () => {
    expect(resolveProvider({ GOOGLE_AI_API_KEY: "k" })).toBe("google");
    expect(resolveProvider({ ANTHROPIC_API_KEY: "k" })).toBe("anthropic");
  });

  it("KHÔNG cần biến chọn riêng khi chỉ có một key", () => {
    // Hai biến (một chọn, một chứa key) là hai thứ có thể lệch nhau: chọn `google` mà chỉ có key
    // Anthropic thì tính năng chết với một thông báo không liên quan gì đến nguyên nhân.
    expect(resolveProvider({ GOOGLE_AI_API_KEY: "k", AI_PROVIDER: "anthropic" })).toBe("google");
  });

  it("có CẢ HAI key thì AI_PROVIDER quyết định", () => {
    const both = { ANTHROPIC_API_KEY: "a", GOOGLE_AI_API_KEY: "g" };
    expect(resolveProvider({ ...both, AI_PROVIDER: "google" })).toBe("google");
    expect(resolveProvider({ ...both, AI_PROVIDER: "anthropic" })).toBe("anthropic");
  });

  it("AI_PROVIDER giá trị lạ thì BỎ QUA, không nổ", () => {
    // Một lỗi gõ sai biến môi trường không nên làm tắt trợ lý.
    expect(resolveProvider({ ANTHROPIC_API_KEY: "a", GOOGLE_AI_API_KEY: "g", AI_PROVIDER: "openai" }))
      .toBe("anthropic");
  });

  it("key rỗng KHÔNG tính là có key", () => {
    // Vercel cho phép lưu một biến với giá trị rỗng. Coi nó là "đã cấu hình" là hiện nút rồi để
    // mọi câu hỏi thất bại — tệ hơn hẳn việc ẩn nút.
    expect(resolveProvider({ ANTHROPIC_API_KEY: "" })).toBeNull();
    expect(resolveProvider({ ANTHROPIC_API_KEY: "", GOOGLE_AI_API_KEY: "g" })).toBe("google");
  });
});

describe("bảng cấu hình phải đầy đủ", () => {
  it("mọi nhà cung cấp đều có mô hình và tên biến key", () => {
    // `Record<AiProvider, …>` đã buộc ở tầng kiểu, nhưng test này bắt ca giá trị rỗng — một
    // chuỗi "" vẫn qua được kiểu và sẽ thành một URL gọi tới mô hình không tồn tại.
    for (const p of AI_PROVIDERS) {
      expect(AI_MODELS[p], `thiếu mô hình cho ${p}`).toBeTruthy();
      expect(AI_KEY_ENV[p], `thiếu tên biến key cho ${p}`).toBeTruthy();
    }
  });

  it("tên biến key KHÔNG có tiền tố NEXT_PUBLIC_", () => {
    // 🔴 Biến có tiền tố đó được gói vào bundle gửi cho TRÌNH DUYỆT — tức là công khai key. Đây
    // là loại lỗi một ký tự, không nổ, và chỉ phát hiện khi đã muộn.
    for (const p of AI_PROVIDERS) {
      expect(AI_KEY_ENV[p].startsWith("NEXT_PUBLIC_")).toBe(false);
    }
  });

  it("hai nhà cung cấp không dùng trùng tên biến", () => {
    const names = AI_PROVIDERS.map((p) => AI_KEY_ENV[p]);
    expect(new Set(names).size).toBe(names.length);
  });
});

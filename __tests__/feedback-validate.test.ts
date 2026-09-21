import { describe, expect, it } from "vitest";

import {
  DUPLICATE_WINDOW_MS,
  MAX_FEEDBACK_IMAGES,
  isDuplicateSubmission,
  oneLine,
  validateFeedbackDraft,
} from "@/app/lib/business/feedback/validate";
import {
  buildFeedbackImagePath,
  isValidFeedbackImagePath,
  pathFromFeedbackUrl,
  feedbackImageUrl,
} from "@/app/lib/business/feedback/image";

const draft = (over: Partial<Parameters<typeof validateFeedbackDraft>[0]> = {}) => ({
  kind: "BUG" as const,
  summary: "Bấm Chuyển xưởng thì báo trùng MO",
  detail: "",
  imagePaths: [] as string[],
  ...over,
});

describe("validateFeedbackDraft — cửa vào phải RỘNG", () => {
  // Đây là công cụ để người dùng nói rằng có gì đó sai. Form khó tính sẽ chặn đúng những
  // người đang bực và đang gấp, và họ mở Zalo.

  it("nội dung bình thường → qua", () => {
    expect(validateFeedbackDraft(draft())).toBeNull();
  });

  it("ô giải thích để TRỐNG vẫn qua — dù đó là ô đáng giá nhất", () => {
    // Bắt buộc nó nghĩa là người đang bực phải trả lời thêm một câu trước khi được nói ra vấn
    // đề. Một số người sẽ gõ "." để đi qua, và lúc đó ta có ô đã điền, không có thông tin, và
    // một người vừa học được rằng form này lằng nhằng.
    expect(validateFeedbackDraft(draft({ detail: "" }))).toBeNull();
  });

  it("quá ngắn thì chặn, và NÓI RÕ cần bao nhiêu", () => {
    const err = validateFeedbackDraft(draft({ summary: "lỗi" }));
    expect(err).toContain("5");
  });

  it("chỉ khoảng trắng cũng là quá ngắn", () => {
    expect(validateFeedbackDraft(draft({ summary: "          " }))).not.toBeNull();
  });

  it("quá dài thì chặn và GỢI ĐƯỜNG (tách thành nhiều phản hồi)", () => {
    const err = validateFeedbackDraft(draft({ summary: "x".repeat(2001) }));
    expect(err).toContain("tách");
  });

  it(`tối đa ${MAX_FEEDBACK_IMAGES} ảnh`, () => {
    const paths = Array.from({ length: MAX_FEEDBACK_IMAGES + 1 }, (_, i) => `feedback/2026-08/a${i}.png`);
    expect(validateFeedbackDraft(draft({ imagePaths: paths }))).toContain(String(MAX_FEEDBACK_IMAGES));
  });

  it("đúng hạn mức ảnh thì qua — biên phải mở, không lệch một", () => {
    const paths = Array.from({ length: MAX_FEEDBACK_IMAGES }, (_, i) => `feedback/2026-08/a${i}.png`);
    expect(validateFeedbackDraft(draft({ imagePaths: paths }))).toBeNull();
  });

  it("ảnh trùng đường dẫn → chặn, không để danh sách hiện cùng ảnh hai lần", () => {
    expect(
      validateFeedbackDraft(draft({ imagePaths: ["feedback/2026-08/a.png", "feedback/2026-08/a.png"] })),
    ).not.toBeNull();
  });
});

describe("isDuplicateSubmission — chặn bấm Gửi hai lần, KHÔNG chặn hai người cùng gặp lỗi", () => {
  const now = new Date("2026-08-20T10:00:00Z");

  it("cùng người, cùng nội dung, trong vòng 2 phút → là trùng", () => {
    expect(
      isDuplicateSubmission({
        draft: { kind: "BUG", summary: "Bấm Chuyển xưởng thì báo trùng MO" },
        previous: {
          kind: "BUG",
          summary: "Bấm Chuyển xưởng   thì BÁO trùng MO",
          createdAt: new Date("2026-08-20T09:59:30Z"),
        },
        now,
      }),
    ).toBe(true);
  });

  it("quá cửa sổ 2 phút → KHÔNG phải trùng, lỗi lặp lại là tin tức thật", () => {
    expect(
      isDuplicateSubmission({
        draft: { kind: "BUG", summary: "A A A A A" },
        previous: {
          kind: "BUG",
          summary: "A A A A A",
          createdAt: new Date(now.getTime() - DUPLICATE_WINDOW_MS - 1),
        },
        now,
      }),
    ).toBe(false);
  });

  it("khác loại → không trùng, dù chữ giống nhau", () => {
    expect(
      isDuplicateSubmission({
        draft: { kind: "IDEA", summary: "A A A A A" },
        previous: { kind: "BUG", summary: "A A A A A", createdAt: now },
        now,
      }),
    ).toBe(false);
  });

  it("nội dung khác → không trùng", () => {
    expect(
      isDuplicateSubmission({
        draft: { kind: "BUG", summary: "Lỗi ở màn PSX" },
        previous: { kind: "BUG", summary: "Lỗi ở màn PTK", createdAt: now },
        now,
      }),
    ).toBe(false);
  });

  it("chưa từng gửi gì → không trùng", () => {
    expect(isDuplicateSubmission({ draft: { kind: "BUG", summary: "A A A A A" }, previous: null, now })).toBe(
      false,
    );
  });
});

describe("oneLine", () => {
  it("gộp xuống dòng thành một dòng", () => {
    expect(oneLine("a\n\nb   c")).toBe("a b c");
  });

  it("cắt và thêm dấu … khi quá dài", () => {
    const out = oneLine("x".repeat(200), 20);
    expect(out.length).toBe(20);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("Đường dẫn ảnh — CHỐT CHẶN, server tự dựng URL từ chuỗi client gửi lên", () => {
  it("đường dẫn do chính ta sinh ra thì hợp lệ", () => {
    const p = buildFeedbackImagePath({ contentType: "image/png", now: new Date("2026-08-20T00:00:00Z") });
    expect(p.startsWith("feedback/2026-08/")).toBe(true);
    expect(isValidFeedbackImagePath(p)).toBe(true);
  });

  it("KHÔNG chứa id phản hồi — ảnh được tải lên TRƯỚC khi bản ghi tồn tại", () => {
    const a = buildFeedbackImagePath({ contentType: "image/png", now: new Date("2026-08-20T00:00:00Z") });
    const b = buildFeedbackImagePath({ contentType: "image/png", now: new Date("2026-08-20T00:00:00Z") });
    expect(a).not.toBe(b); // mã ngẫu nhiên, không phải id tuần tự dò được
  });

  it.each([
    "../mo/abc/x.png",
    "mo/abc/x.png",
    "feedback/2026-08/../../mo/x.png",
    "feedback/2026-8/abcdefgh.png",
    "feedback/2026-08/abcdefgh.svg",
    "feedback/2026-08/a.png",
    "/feedback/2026-08/abcdefgh.png",
    "",
  ])("đường dẫn lạ bị loại: %s", (p) => {
    // Không kiểm thì một chuỗi tuỳ ý biến ô ảnh phản hồi thành nơi trỏ tới object bất kỳ
    // trong project — server tự tay dựng URL cho dữ liệu nó chưa từng kiểm.
    expect(isValidFeedbackImagePath(p)).toBe(false);
  });

  it("URL công khai bóc lại được path — để xoá đúng object", () => {
    const url = feedbackImageUrl({ supabaseUrl: "https://x.supabase.co", path: "feedback/2026-08/a.png" });
    expect(pathFromFeedbackUrl(url)).toBe("feedback/2026-08/a.png");
  });

  it("URL của bucket KHÁC thì không bóc ra path — không xoá nhầm ảnh MO", () => {
    expect(pathFromFeedbackUrl("https://x.supabase.co/storage/v1/object/public/mo-images/mo/a/b.png")).toBeNull();
  });
});

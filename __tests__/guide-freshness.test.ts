import { describe, expect, it } from "vitest";

import { DESIGNER_3D_CHAPTERS, EMPLOYEE_CHAPTERS, MANAGER_CHAPTERS } from "@/app/lib/guide/content";

// ─── Mỗi chương Hướng dẫn phải KHAI RA TUỔI CỦA MÌNH ─────────────────────────
//
// File test này KHÔNG kiểm nội dung hướng dẫn đúng hay sai — không làm được, và cũng không nên
// giả vờ làm được. Nó chốt một điều nhỏ hơn nhưng bền: mọi chương đều nói ra lần cuối nó được
// rà soát.
//
// VÌ SAO ĐÁNG CÓ:
//
// `content.tsx` lần cuối được sửa 08/06/2026 — 717 commit trước thời điểm viết test này. Trong
// suốt 717 commit đó nó vẫn dạy `26.12345.1` (dấu chấm) ở 6 chỗ, cả tiếng Việt và tiếng Anh,
// trong khi giao diện LUÔN hiện `26.12345_1` (order-helpers.ts:81 `NEW_VERSION_SEPARATOR = "_"`).
//
// Không ai phát hiện, vì một chương không có mốc thì ÂM THẦM TỰ NHẬN LÀ ĐANG ĐÚNG. Đây là loại
// lỗi tệ nhất: nó không nổ, không có log, và nó dạy người mới một điều sai.
//
// Test này không sửa được nội dung. Nó bảo đảm cái ĐỒNG HỒ luôn có mặt — thêm một chương mà
// quên mốc thì build đỏ ngay, không phải chờ ai đó tình cờ nhận ra sáu tháng sau.

const SETS = [
  ["EMPLOYEE", EMPLOYEE_CHAPTERS],
  ["MANAGER", MANAGER_CHAPTERS],
  ["DESIGN_3D", DESIGNER_3D_CHAPTERS],
] as const;

const ALL = SETS.flatMap(([set, chapters]) => chapters.map((c) => ({ set, ...c })));

describe("slug — địa chỉ bền của chương", () => {
  // 🔴 VÌ SAO SLUG CHỨ KHÔNG PHẢI SỐ CHƯƠNG: slug là nhãn DẪN NGUỒN khi trợ lý trả lời, và nó
  // được ghi vào `ai_question_logs`. `id` là số thứ tự và nó DỜI CHỖ — đúng hôm nay một chương
  // được chèn vào giữa bộ Sales và mọi chương sau tụt một bậc. Nếu nhãn là số thì những dòng
  // log cũ trỏ sang một chương KHÁC, im lặng, và càng lâu càng lệch.
  it("mọi chương đều có slug, không rỗng", () => {
    for (const c of ALL) {
      expect(c.slug?.trim(), `${c.set} ch${c.id} — ${c.vi.title}`).toBeTruthy();
    }
  });

  it("slug chỉ gồm chữ thường, số và gạch ngang", () => {
    // Slug đi vào id của mục kiến thức. Khoảng trắng hay dấu tiếng Việt ở đó là một nhãn dẫn
    // nguồn khó gõ, khó tra trong log, và dễ bị mã hoá khác nhau ở hai nơi.
    for (const c of ALL) {
      expect(c.slug, `${c.set} — ${c.vi.title}`).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("KHÔNG trùng slug trong cùng một bộ", () => {
    // Trùng trong cùng bộ = hai mục kiến thức cùng id = câu trả lời dẫn tới một chương KHÁC
    // chương nó thật sự dùng.
    for (const [set, chapters] of SETS) {
      const slugs = chapters.map((c) => c.slug);
      expect(new Set(slugs).size, `bộ ${set} có slug trùng`).toBe(slugs.length);
    }
  });
});

describe("BỘ DÒ CÒN CHẠY", () => {
  it("vẫn đọc được chương từ content.tsx", () => {
    // Không có assert này thì mọi test dưới đây vẫn xanh khi ai đó đổi tên export — một test
    // chạy trên mảng rỗng luôn thành công, và im lặng đúng lúc cần lên tiếng.
    expect(ALL.length).toBeGreaterThanOrEqual(23);
    // Ba bộ, và bộ nào cũng phải có chương — một mảng rỗng thì mọi test dưới đây vẫn xanh.
    for (const [set, chapters] of SETS) {
      expect(chapters.length, `bộ ${set} rỗng`).toBeGreaterThan(0);
    }
  });
});

describe("Mọi chương đều khai mốc rà soát", () => {
  it.each(ALL.map((c) => [`${c.set} #${c.id} — ${c.vi.title}`, c] as const))("%s", (_label, ch) => {
    expect(ch.lastReviewed, "thiếu lastReviewed").toBeTruthy();
    // Đúng dạng YYYY-MM. Không nhận ngày đầy đủ: một chương được rà trong khoảng vài ngày, và
    // ghi ngày chính xác là một độ chính xác giả.
    expect(ch.lastReviewed).toMatch(/^20\d{2}-(0[1-9]|1[0-2])$/);
  });
});

describe("Mốc phải hợp lý", () => {
  it("không có chương nào ghi mốc ở tương lai", () => {
    // Mốc tương lai là dấu hiệu của việc copy-paste một giá trị mẫu, và nó làm người đọc TIN
    // vào một chương chưa ai rà — tệ hơn hẳn một mốc cũ trung thực.
    const nowYm = new Date().toISOString().slice(0, 7);
    for (const ch of ALL) {
      expect(ch.lastReviewed <= nowYm, `${ch.set} #${ch.id}: ${ch.lastReviewed} ở tương lai`).toBe(true);
    }
  });

  it("mốc không cổ hơn thời điểm dự án bắt đầu có trang Hướng dẫn", () => {
    for (const ch of ALL) {
      expect(ch.lastReviewed >= "2026-01", `${ch.set} #${ch.id}`).toBe(true);
    }
  });
});

describe("id không trùng trong cùng một bộ", () => {
  it.each(SETS)("%s", (_name, chapters) => {
    // id trùng nghĩa là hai chương cùng số hiệu, và điều hướng "chương trước/sau" sẽ nhảy sai.
    const ids = chapters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

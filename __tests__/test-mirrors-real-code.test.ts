import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// 🔴 LỚP LỖI ĐẮT NHẤT TÌM ĐƯỢC TRONG REPO NÀY, và không có gì canh nó.
//
// Một số file test khai lại luật của hệ thống ngay trong chính nó ("mirrors ... logic") rồi
// test bản khai lại đó. Chúng KHÔNG import gì từ `app/`, nên:
//   • sửa luật thật mà quên sửa bản chép → test vẫn xanh
//   • XOÁ hẳn hàm thật → test vẫn xanh
//
// Cả hai đã xảy ra:
//   `app/__tests__/filter-system.test.ts` (1.170 dòng) và `mo-status-transitions.test.ts`
//   (410 dòng) canh một hàm tên `flatRows` ĐÃ BỊ XOÁ khỏi orders-client. Chúng xanh vĩnh viễn
//   và không canh gì cả. Đã xoá, thay bằng orders-row-status + orders-api-query — hai file
//   import ĐÚNG hàm đang chạy.
//
//   `__tests__/order-patch.test.ts` tự khai bảng chuyển trạng thái của riêng nó; bản đó lệch
//   với CẢ UI lẫn route, và người dùng gặp lỗi 400 thật. Nay nó đọc module thật.
//
// Bộ dò này chặn file MỚI đi vào vết đó. Danh sách nợ cũ nay đã RỖNG — tám file đều đã trả.
// KHÔNG được thêm tên vào lại: danh sách này chỉ có một chiều.

const KNOWN_MIRROR_DEBT = new Set<string>([

  // Đã trả: production-patch (601→87) · alerts-system (707→106) · filter-improvements
  // user-management · system-integration · multi-user-cache · order-patch · orders-api
  // 🎉 HẾT NỢ. Danh sách rỗng: từ nay MỌI file khai lại luật đều là file MỚI và bị chặn.
]);

/** Chính bộ dò này nói về chữ "mirrors" nên tự dính bẫy của mình. */
const SELF = "test-mirrors-real-code.test.ts";

const TEST_DIRS = ["__tests__", join("app", "__tests__")];

function testFilesIn(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) testFilesIn(path, found);
    else if (/\.test\.tsx?$/.test(path)) found.push(path);
  }
  return found;
}

/**
 * DẤU HIỆU là chữ "mirror" trong một VẠCH CHIA MỤC — người viết tự khai "đoạn dưới đây là bản
 * chép". Cố ý KHÔNG xét file có import gì: thêm một import lạc vào file vẫn đầy bản chép là
 * lách được bộ dò. Muốn ra khỏi danh sách nợ thì phải XOÁ bản chép và xoá cả cái vạch đó.
 */
const declaresMirrorSection = (source: string) =>
  source.split("\n").some((line) => /^\s*\/\/.*───.*mirrors?\b/i.test(line));

describe("test phải canh code THẬT", () => {
  const files = TEST_DIRS.flatMap((dir) => testFilesIn(dir));

  const mirrorFiles = () =>
    new Set(
      files
        .filter((file) => declaresMirrorSection(readFileSync(file, "utf-8")))
        .map((file) => file.split(/[\\/]/).pop()!),
    );

  it("không file test MỚI nào khai lại luật của hệ thống", () => {
    const offenders = [...mirrorFiles()]
      .filter((name) => name !== SELF && !KNOWN_MIRROR_DEBT.has(name));
    expect(offenders).toEqual([]);
  });

  // Ratchet: gỡ được một món nợ thì phải bỏ tên nó khỏi danh sách, nếu không danh sách sẽ
  // che luôn lần tái phạm sau ở đúng file đó.
  it("danh sách nợ cũ không còn tên nào đã sạch", () => {
    const cleaned = [...KNOWN_MIRROR_DEBT].filter((name) => !mirrorFiles().has(name));
    expect(cleaned).toEqual([]);
  });
});

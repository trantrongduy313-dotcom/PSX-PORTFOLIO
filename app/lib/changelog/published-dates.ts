import "server-only";

import { prisma } from "@/app/lib/prisma";

// ─── Mốc đăng của các mục "Có gì mới" — đọc MỘT nơi ──────────────────────────
//
// Hai chỗ cần đúng danh sách này, vì hai lý do khác nhau:
//
//   1. Sidebar  — đếm mục CHƯA ĐỌC (huy hiệu). Chỉ client biết mốc "đã đọc" (localStorage), nên
//      server phải gửi CẢ DANH SÁCH chứ không gửi một con số.
//   2. Hướng dẫn — đếm THAY ĐỔI KỂ TỪ lần rà của mỗi chương (business/docs/staleness.ts).
//
// ⚠️ TÁCH RA VÌ HAI BẢN SẼ LỆCH. Cùng một câu truy vấn viết ở hai file, rồi một ngày ai đó đổi
// `take: 200` ở một bên — và hai màn hình đếm ra hai con số về cùng một dữ liệu, không có lỗi nào.
// Đây đúng là chuyện vừa dọn ở `stores` trong Sidebar (truy vấn chạy rồi kết quả bị bỏ).

/**
 * ⚠️ `take` giới hạn CÓ CHỦ Ý và nó là một sự đánh đổi, không phải một con số tuỳ tiện.
 *
 * Cả hai chỗ dùng đều chỉ cần ĐẾM, nên về lý thì nên đếm ở SQL. Nhưng Sidebar cần danh sách mốc
 * để client tự so với mốc "đã đọc", và trang Hướng dẫn cần đếm theo 23 mốc rà KHÁC NHAU — đếm ở
 * SQL sẽ là 23 câu truy vấn cho một trang tài liệu.
 *
 * Đọc một lần 200 mốc rồi đếm trong bộ nhớ là rẻ hơn nhiều. Cái giá: quá 200 mục thì các con số
 * bị cắt ngọn — và nó IM LẶNG. Với nhịp đăng hiện tại thì 200 mục là nhiều năm; khi tới gần, số
 * "thay đổi kể từ" sẽ chững lại ở một mức và đó là dấu hiệu cần đổi cách đếm.
 */
const MAX_ENTRIES = 200;

/**
 * Mốc đăng của các mục đã ĐĂNG, mới nhất trước, dạng ISO string.
 *
 * Trả ISO string chứ không trả `Date`: giá trị này đi thẳng xuống Client Component, và luật của
 * dự án là truyền ISO string qua biên server → client rồi mới định dạng theo `Asia/Ho_Chi_Minh`.
 *
 * `.catch(() => [])` — mất danh sách này chỉ làm mất một huy hiệu và một câu nhắc; nó KHÔNG được
 * phép làm sập sidebar hay trang Hướng dẫn. Cùng lý do đã ghi ở chỗ gọi cũ: giữa lúc deploy và
 * lúc chạy migration, bảng có thể chưa tồn tại.
 */
export async function loadChangelogPublishedAt(): Promise<string[]> {
  const rows = await prisma.changelogEntry
    .findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: "desc" },
      take: MAX_ENTRIES,
      select: { publishedAt: true },
    })
    .catch(() => [] as { publishedAt: Date | null }[]);

  const out: string[] = [];
  for (const r of rows) {
    // `isPublished` true mà `publishedAt` null là dữ liệu không nhất quán (đăng mà không có mốc).
    // Bỏ qua thay vì ném: một dòng lệch không được làm mất cả danh sách.
    if (r.publishedAt) out.push(r.publishedAt.toISOString());
  }
  return out;
}

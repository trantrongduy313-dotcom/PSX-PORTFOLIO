// Gộp nhiều bộ lọc vào một `where` của Prisma mà không cái nào xoá cái nào.
// Lỗi đã trả giá + hai va chạm thật: __tests__/orders-where-merge.test.ts

/** Người đến trước GIỮ chỗ cấp một; người đến sau vào `AND` (bộ đếm đọc `where` theo khoá). */
export function mergeWhere(
  where: Record<string, unknown>,
  cond: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(cond)) {
    if (where[key] === undefined) where[key] = value;
    else ((where.AND ??= []) as unknown[]).push({ [key]: value });
  }
}

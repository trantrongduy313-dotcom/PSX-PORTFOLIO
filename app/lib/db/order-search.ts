import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { moSearchVariants, stripVersionSuffix } from "@/app/lib/business/order-helpers";

// Escape ký tự đặc biệt của LIKE ("%", "_", "\") trước khi nhồi vào pattern —
// tránh user gõ SO# chứa "_" bị Postgres hiểu nhầm thành wildcard 1-ký-tự.
function escapeLikeLiteral(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => "\\" + ch);
}

/**
 * Full-text order search with Vietnamese diacritic support via PostgreSQL unaccent().
 *
 * Searchable fields: orderNumber, customerName, salesName, moNumber, productName
 *
 * Returns order IDs to use as `where.id = { in: ids }` in Prisma queries.
 * All other WHERE conditions (zone, status, dates, storeId) are applied by the
 * caller via Prisma's query builder — only the text-match part goes through raw SQL.
 *
 * Phase 2: add a GIN trigram index on unaccent(lower(col)) expressions when the
 * order table exceeds ~3 000 rows:
 *   CREATE INDEX CONCURRENTLY ON orders (unaccent(lower("customerName")) gin_trgm_ops);
 */
export async function searchOrderIds(
  search: string,
  storeId?: string,
): Promise<string[]> {
  type Row = { id: string };

  // Hậu tố phiên bản MO# — dữ liệu CŨ lưu "." (VD "26.37283.1"), dữ liệu MỚI lưu "_"
  // (VD "26.37283_1"). Muốn tìm ra kết quả bất kể user gõ "." hay "_" và bất kể DB đang
  // lưu MO đó ở dạng nào, so khớp oi."moNumber" với TẤT CẢ biến thể sinh bởi
  // moSearchVariants() (dùng chung với client — xem orders-client.tsx) bên cạnh chuỗi gốc.
  const moVariants = moSearchVariants(search);
  const moExactCond = Prisma.join(
    moVariants.map((v) => Prisma.sql`unaccent(lower(oi."moNumber")) = unaccent(lower(${v}))`),
    " OR ",
  );
  const moLikeCond = Prisma.join(
    moVariants.map((v) => Prisma.sql`unaccent(lower(oi."moNumber")) LIKE unaccent(lower(${`%${v}%`}))`),
    " OR ",
  );

  // SO# — 1 SO có thể được lưu thành NHIỀU Order row riêng biệt, mỗi row mang 1 hậu tố
  // phiên bản CẤP SO (".N"/"_N", khác version MO) — VD "26.424991", "26.424991.1",
  // "26.424991.2"... UI luôn hiển thị dạng base (đã strip suffix) nên user gõ đúng SO gốc
  // nhưng KHÔNG match hết các Order row mang suffix nếu chỉ so bằng chuỗi thô. Match theo
  // BASE (search đã strip suffix) + LIKE "base.%"/"base_%" để bắt tất cả Order row cùng gốc.
  const soBase = stripVersionSuffix(search);
  const soBaseEscaped = escapeLikeLiteral(soBase);
  const soDotPattern = `${soBaseEscaped}.%`;
  const soUnderscorePattern = `${soBaseEscaped}_%`;
  const soExactCond = Prisma.sql`(
    unaccent(lower(o."orderNumber")) = unaccent(lower(${soBase}))
    OR unaccent(lower(o."orderNumber")) LIKE unaccent(lower(${soDotPattern})) ESCAPE '\\'
    OR unaccent(lower(o."orderNumber")) LIKE unaccent(lower(${soUnderscorePattern})) ESCAPE '\\'
  )`;

  // ── Step 1: exact match ──────────────────────────────────────────────────
  // If the query exactly matches any field (case/diacritic-insensitive),
  // return only those orders — prevents "25.33798" from returning all MOs
  // that merely contain "25.337".
  const exactRows: Row[] = storeId
    ? await prisma.$queryRaw<Row[]>`
        SELECT DISTINCT o.id
        FROM orders o
        LEFT JOIN order_items oi ON oi."orderId" = o.id
        WHERE o."deletedAt" IS NULL
          AND o."storeId" = ${storeId}
          AND (
            (${soExactCond})
            OR unaccent(lower(o."customerName")) = unaccent(lower(${search}))
            OR unaccent(lower(o."salesName"))    = unaccent(lower(${search}))
            OR (${moExactCond})
            OR unaccent(lower(oi."productName")) = unaccent(lower(${search}))
          )
      `
    : await prisma.$queryRaw<Row[]>`
        SELECT DISTINCT o.id
        FROM orders o
        LEFT JOIN order_items oi ON oi."orderId" = o.id
        WHERE o."deletedAt" IS NULL
          AND (
            (${soExactCond})
            OR unaccent(lower(o."customerName")) = unaccent(lower(${search}))
            OR unaccent(lower(o."salesName"))    = unaccent(lower(${search}))
            OR (${moExactCond})
            OR unaccent(lower(oi."productName")) = unaccent(lower(${search}))
          )
      `;

  if (exactRows.length > 0) return exactRows.map((r) => r.id);

  // ── Step 2: fallback — contains search ──────────────────────────────────
  // Only runs when no exact match found (e.g. user typed a partial term).
  const param = `%${search}%`;

  const containsRows: Row[] = storeId
    ? await prisma.$queryRaw<Row[]>`
        SELECT DISTINCT o.id
        FROM orders o
        LEFT JOIN order_items oi ON oi."orderId" = o.id
        WHERE o."deletedAt" IS NULL
          AND o."storeId" = ${storeId}
          AND (
            unaccent(lower(o."orderNumber"))     LIKE unaccent(lower(${param}))
            OR unaccent(lower(o."customerName")) LIKE unaccent(lower(${param}))
            OR unaccent(lower(o."salesName"))    LIKE unaccent(lower(${param}))
            OR (${moLikeCond})
            OR unaccent(lower(oi."productName")) LIKE unaccent(lower(${param}))
          )
      `
    : await prisma.$queryRaw<Row[]>`
        SELECT DISTINCT o.id
        FROM orders o
        LEFT JOIN order_items oi ON oi."orderId" = o.id
        WHERE o."deletedAt" IS NULL
          AND (
            unaccent(lower(o."orderNumber"))     LIKE unaccent(lower(${param}))
            OR unaccent(lower(o."customerName")) LIKE unaccent(lower(${param}))
            OR unaccent(lower(o."salesName"))    LIKE unaccent(lower(${param}))
            OR (${moLikeCond})
            OR unaccent(lower(oi."productName")) LIKE unaccent(lower(${param}))
          )
      `;

  return containsRows.map((r) => r.id);
}

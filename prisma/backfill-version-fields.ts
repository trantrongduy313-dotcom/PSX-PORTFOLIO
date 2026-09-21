/**
 * One-time backfill: populate baseOrderNumber, versionNumber, and sortKey
 * for all existing orders that were created before these fields were added.
 *
 * Run once after deploying the schema migration:
 *   npx tsx prisma/backfill-version-fields.ts
 *
 * Safe to re-run: only updates rows where sortKey is still empty ("").
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "",
});
const prisma = new PrismaClient({ adapter });

// Parse "26.36806.2" → { base: "26.36806", ver: 2 }
// Parse "26.36806"   → null (base order, no version suffix)
function parseVersionSuffix(orderNumber: string): { base: string; ver: number } | null {
  const parts = orderNumber.split(".");
  if (parts.length < 3) return null;
  const last = parts[parts.length - 1];
  const n = parseInt(last, 10);
  if (isNaN(n) || String(n) !== last) return null;
  return { base: parts.slice(0, -1).join("."), ver: n };
}

// Extract base MO# (strip version suffix if present).
// "26.32132123.2" → "26.32132123"; "26.32132123" → "26.32132123"
function getMoBase(mo: string): string {
  const parts = mo.split(".");
  if (parts.length < 3) return mo;
  const last = parts[parts.length - 1];
  const n = parseInt(last, 10);
  if (isNaN(n) || String(n) !== last) return mo;
  return parts.slice(0, -1).join(".");
}

async function main() {
  // Fetch ALL orders with their first item (for MO-based sortKey)
  const orders = await prisma.order.findMany({
    select: {
      id: true,
      orderNumber: true,
      items: { select: { moNumber: true }, orderBy: { lineNumber: "asc" }, take: 1 },
    },
  });

  console.log(`Found ${orders.length} orders to backfill.`);
  if (orders.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let updated = 0;
  for (const order of orders) {
    const parsed = parseVersionSuffix(order.orderNumber);

    // sortKey = base MO# of first item; fallback to SO base (or orderNumber) if no items
    const firstMo = order.items[0]?.moNumber ?? null;
    const sortKey = firstMo
      ? getMoBase(firstMo)
      : (parsed?.base ?? order.orderNumber);

    await prisma.order.update({
      where: { id: order.id },
      data: {
        baseOrderNumber: parsed?.base ?? null,
        versionNumber:   parsed?.ver  ?? null,
        sortKey,
      },
    });

    updated++;
    if (updated % 50 === 0) {
      console.log(`  Backfilled ${updated}/${orders.length}…`);
    }
  }

  console.log(`Done. Updated ${updated} rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

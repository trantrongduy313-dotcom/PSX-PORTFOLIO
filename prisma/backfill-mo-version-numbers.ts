/**
 * One-time backfill: re-number MO version suffixes from SO-level counters to
 * per-MO independent counters.
 *
 * Problem: old createVersion code used the SO-level counter for item.moNumber,
 * so the first version of MO 26.36807 was labelled .3 (because the SO had already
 * produced .1 and .2 for other MOs) instead of .1 (first version of that MO).
 *
 * Fix: for each MO base, sort all versioned items by parent order.createdAt ASC
 * and reassign suffixes .1, .2, .3, … in chronological order.
 *
 * What changes  : orderItem.moNumber only
 * What stays    : order.orderNumber, order.versionNumber, order.baseOrderNumber,
 *                 order.sortKey (sortKey = stripSuffix(moNumber) = moBase, unchanged)
 *
 * Usage:
 *   npx tsx prisma/backfill-mo-version-numbers.ts           # dry-run (preview)
 *   npx tsx prisma/backfill-mo-version-numbers.ts --apply   # write to DB
 *
 * Safe to re-run: produces the same result on every run once data is correct.
 */

import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = !process.argv.includes("--apply");

// Returns { base, ver } if moNumber has a version suffix (.N where N is integer, ≥3 parts).
// Returns null for base MOs like "26.36806" (2 parts) — those are never touched.
function parseVersionedMo(mo: string): { base: string; ver: number } | null {
  const p = mo.split(".");
  if (p.length < 3) return null;
  const last = parseInt(p[p.length - 1], 10);
  if (isNaN(last) || String(last) !== p[p.length - 1]) return null;
  return { base: p.slice(0, -1).join("."), ver: last };
}

async function main() {
  if (DRY_RUN) {
    console.log("DRY RUN — no changes will be written. Run with --apply to execute.\n");
  } else {
    console.log("APPLY MODE — writing changes to the database.\n");
  }

  // Fetch ALL orders (including soft-deleted) sorted by creation time.
  // Soft-deleted orders are included so their items are counted in the MO lineage
  // and their version numbers are not accidentally reused in future version creation.
  const orders = await prisma.order.findMany({
    select: {
      createdAt: true,
      items: {
        select: { orderId: true, lineNumber: true, moNumber: true },
        orderBy: { lineNumber: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Group versioned items by moBase in chronological order (parent order.createdAt ASC).
  // Map<moBase, [{itemId, current}]>
  const moGroups = new Map<
    string,
    Array<{ orderId: string; lineNumber: number; current: string }>
  >();

  for (const order of orders) {
    for (const item of order.items) {
      if (!item.moNumber) continue;
      const parsed = parseVersionedMo(item.moNumber);
      if (!parsed) continue; // base MO (no suffix) — skip

      if (!moGroups.has(parsed.base)) moGroups.set(parsed.base, []);
      moGroups.get(parsed.base)!.push({
        orderId: item.orderId,
        lineNumber: item.lineNumber,
        current: item.moNumber,
      });
    }
  }

  // Compute desired renumbering for every MO group.
  const updates: Array<{
    orderId: string;
    lineNumber: number;
    from: string;
    to: string;
  }> = [];

  for (const [moBase, items] of moGroups) {
    items.forEach((item, index) => {
      const desired = `${moBase}.${index + 1}`;
      if (item.current !== desired) {
        updates.push({ orderId: item.orderId, lineNumber: item.lineNumber, from: item.current, to: desired });
      }
    });
  }

  // ─── Report ──────────────────────────────────────────────────────────────────
  if (updates.length === 0) {
    console.log("Nothing to change — all MO version numbers are already correct.");
    return;
  }

  // Group output by moBase for readability
  const byBase = new Map<string, typeof updates>();
  for (const u of updates) {
    const base = parseVersionedMo(u.to)!.base;
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(u);
  }

  console.log(`${updates.length} rename(s) across ${byBase.size} MO group(s):\n`);
  for (const [base, group] of byBase) {
    console.log(`  MO ${base}`);
    for (const u of group) {
      console.log(`    ${u.from.padEnd(24)} → ${u.to}`);
    }
  }

  if (DRY_RUN) {
    console.log(`\n${updates.length} change(s) would be applied. Run with --apply to execute.`);
    return;
  }

  // ─── Apply inside a single transaction ───────────────────────────────────────
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const u of updates) {
      await tx.orderItem.update({
        where: { orderId_lineNumber: { orderId: u.orderId, lineNumber: u.lineNumber } },
        data: { moNumber: u.to },
      });
    }
  });

  console.log(`\nDone. Renamed ${updates.length} MO version number(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

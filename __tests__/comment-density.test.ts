import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Bộ dò cho luật comment ở CLAUDE.md mục 4: comment nói VÌ SAO, không nói CÁI GÌ.
//
// Đo KHỐI COMMENT DÀI, không đo tỷ lệ comment/code. Tỷ lệ phạt nặng module khai báo thuần: một
// dòng `/** Tên cột. */` cho mỗi export đã đẩy một file 11 dòng lên 55%, nên đuổi theo tỷ lệ sẽ
// buộc xoá cả JSDoc hợp lệ — ngược hẳn mục tiêu "dễ đọc".
//
// RATCHET, không phải cổng chất lượng: ngân sách khởi điểm bằng đúng hiện trạng nên hôm nay nó
// xanh. Nó chỉ đỏ khi số liệu xấu đi, hoặc khi đã tốt lên mà ngân sách chưa siết theo.

/** Chuỗi comment liên tiếp từ đây trở lên mới bị tính là "khối". */
const MIN_BLOCK_LINES = 5;

/** Đã giảm sâu hơn mức này thì phải hạ ngân sách — nếu không ratchet mất tác dụng. */
const SLACK_BEFORE_TIGHTENING = 200;

type Tier = {
  dir: string;
  /** Tổng số dòng nằm trong các khối dài. */
  blockLineBudget: number;
  /** Khối dài nhất được phép tồn tại trong tầng này. */
  largestBlockBudget: number;
};

// ⚠️ Rút luật khỏi UI sang `app/lib/business` CHUYỂN dòng comment giữa hai tầng chứ không
// sinh thêm. Khi đó phải chỉnh CẢ HAI đầu trong cùng một commit và tổng phải GIẢM — nới một
// đầu mà không siết đầu kia là dùng phép chuyển nhà để lách ratchet.
//   2026-08-28: rút calendar-form + create-order-payload khỏi UI
//               app/lib 6.672 → 6.678 (+6) · app/dashboard 2.253 → 2.217 (−36) · tổng −30
const TIERS: Tier[] = [
  { dir: "app/lib", blockLineBudget: 6678, largestBlockBudget: 34 },
  { dir: "app/dashboard", blockLineBudget: 2217, largestBlockBudget: 24 },
  { dir: "app/api", blockLineBudget: 1080, largestBlockBudget: 21 },
];

const IGNORED_DIRS = new Set(["generated", "node_modules"]);

function sourceFilesIn(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!IGNORED_DIRS.has(entry)) sourceFilesIn(path, found);
    } else if (/\.tsx?$/.test(entry)) {
      found.push(path.split("\\").join("/"));
    }
  }
  return found;
}

function isCommentLine(trimmed: string): boolean {
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

function measureFile(file: string): { blockLines: number; largestBlock: number } {
  let blockLines = 0;
  let largestBlock = 0;
  let run = 0;

  const closeRun = () => {
    if (run >= MIN_BLOCK_LINES) {
      blockLines += run;
      if (run > largestBlock) largestBlock = run;
    }
    run = 0;
  };

  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (isCommentLine(raw.trim())) run++;
    else closeRun();
  }
  closeRun();

  return { blockLines, largestBlock };
}

type Measurement = { blockLines: number; largestBlock: number; worstFile: string };

const measurementCache = new Map<string, Measurement>();

function measureTier(tier: Tier): Measurement {
  const cached = measurementCache.get(tier.dir);
  if (cached) return cached;

  let blockLines = 0;
  let largestBlock = 0;
  let worstFile = "";
  for (const file of sourceFilesIn(tier.dir)) {
    const measured = measureFile(file);
    blockLines += measured.blockLines;
    if (measured.largestBlock > largestBlock) {
      largestBlock = measured.largestBlock;
      worstFile = file;
    }
  }

  const measurement = { blockLines, largestBlock, worstFile };
  measurementCache.set(tier.dir, measurement);
  return measurement;
}

describe.each(TIERS)("khối comment dài — $dir", (tier) => {
  const measured = measureTier(tier);

  it(`không vượt ngân sách ${tier.blockLineBudget} dòng trong khối dài`, () => {
    expect(measured.blockLines).toBeLessThanOrEqual(tier.blockLineBudget);
  });

  it(`không có khối nào dài hơn ${tier.largestBlockBudget} dòng`, () => {
    expect(
      measured.largestBlock,
      `Khối dài nhất: ${measured.largestBlock} dòng ở ${measured.worstFile}`,
    ).toBeLessThanOrEqual(tier.largestBlockBudget);
  });

  // Không có test này thì ngân sách thành một con số ai cũng quên, và lần dọn sau không khoá
  // được thành quả của lần dọn trước.
  it("ngân sách đã được siết theo mức đã giảm", () => {
    const unusedBudget = tier.blockLineBudget - measured.blockLines;
    expect(
      unusedBudget,
      `${tier.dir} còn ${measured.blockLines} dòng trong khối dài. Hạ blockLineBudget xuống ${measured.blockLines}.`,
    ).toBeLessThan(SLACK_BEFORE_TIGHTENING);
  });
});

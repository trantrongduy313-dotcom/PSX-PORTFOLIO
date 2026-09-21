import { describe, expect, it } from "vitest";

import {
  SAMPLE_CODE_PATTERN,
  buildMaSoMauScan,
  compareMaSoMau,
  currentVnMonth,
  extractSampleCodes,
  isInScanScope,
  isValidMonth,
  toCompletedYmd,
  type ScanItem,
} from "@/app/lib/business/orders/ma-so-mau-match";
import { THONG_TIN_HT_SAMPLES } from "./fixtures/thong-tin-ht";

// ═══════════════════════════════════════════════════════════════════════════
// ĐỐI CHIẾU MÃ SỐ MẪU — bằng chứng là DỮ LIỆU THẬT, không phải ví dụ tự bịa
// ═══════════════════════════════════════════════════════════════════════════

describe("Tách mã từ Thông tin HT thật", () => {
  it.each(THONG_TIN_HT_SAMPLES)("%s → %s", (line, expected) => {
    expect(extractSampleCodes(line)).toEqual([expected]);
  });

  it("mỗi dòng thật cho ĐÚNG MỘT mã — không thừa, không thiếu", () => {
    for (const [line] of THONG_TIN_HT_SAMPLES) {
      expect(extractSampleCodes(line).length, line).toBe(1);
    }
  });
});

// 🔴 NỬA CÒN LẠI CỦA BẰNG CHỨNG. Một bộ tách "bắt được mọi mã" mà cũng bắt luôn `18KY` thì
// mỗi dòng sẽ có hai mã và MỌI MO đều thành cảnh báo — bộ dò kêu suốt thì bằng không có.
describe("KHÔNG nhận nhầm những thứ trông như mã", () => {
  const NOT_CODES = [
    "18KY", "14KW", "24K", "18KR", "18KW", "14KR",   // hợp kim — bắt đầu bằng SỐ
    "PT900", "PT",                                    // bạch kim — hai chữ, ba số
    "32LRD", "44LFancy", "10MQ(ONY)", "2LKT", "5RD",  // quy cách hột — bắt đầu bằng SỐ
    "0.118cts", "6.5in", "45cm", "5khoen", "59.85gr", // đơn vị
    "Size:", "LGRI:", "RIMTG:", "18KACC:",            // tiền tố dòng
  ];

  it.each(NOT_CODES)("%s không phải mã", (token) => {
    expect(extractSampleCodes(token)).toEqual([]);
  });

  it("cả cụm gộp lại vẫn ra 0 mã", () => {
    expect(extractSampleCodes(NOT_CODES.join(" "))).toEqual([]);
  });
});

describe("Ca lệch khuôn có thật trong dữ liệu", () => {
  it("mã SÁU chữ số hợp lệ — P112701 người dùng xác nhận đúng", () => {
    expect(extractSampleCodes("18KPD: 18KW 1.14gr P112701")).toEqual(["P112701"]);
  });

  it("PT900 trong ngoặc không che mất mã thật", () => {
    expect(extractSampleCodes("RIMTG: PT+18KY 4.8gr B12924 Size: 7.75 (PT900=2.14gr+18KY=2.66gr)"))
      .toEqual(["B12924"]);
  });

  it("nhiều mã trong một dòng → trả HẾT, giữ thứ tự, khử trùng", () => {
    expect(extractSampleCodes("… B12946 … D11082 … B12946 …")).toEqual(["B12946", "D11082"]);
  });

  it("rỗng / null / toàn khoảng trắng → không có mã, không ném lỗi", () => {
    for (const v of [null, undefined, "", "   "]) {
      expect(extractSampleCodes(v as string | null), String(v)).toEqual([]);
    }
  });

  // 🔴 Regex có cờ `g` MANG TRẠNG THÁI `lastIndex`. Dùng lại một đối tượng regex giữa hai lời
  // gọi là bỏ sót kết quả một cách NGẪU NHIÊN — chạy lần đầu đúng, lần sau sai, không ai lần ra.
  it("gọi hai lần liên tiếp cho cùng kết quả (bẫy lastIndex của cờ /g)", () => {
    const line = "18KBL: 18KY 59.85gr L10309 Size: 7in";
    expect(extractSampleCodes(line)).toEqual(extractSampleCodes(line));
    expect(SAMPLE_CODE_PATTERN.flags).toContain("g");
  });
});

// ─── Bốn kết quả ─────────────────────────────────────────────────────────────

describe("compareMaSoMau", () => {
  const HT = "18KBL: 18KY 59.85gr L10309 Size: 7in";

  it("KHỚP khi mã của R&D nằm trong tập mã đọc được", () => {
    expect(compareMaSoMau("L10309", HT).verdict).toBe("MATCH");
  });

  it("KHỚP không phân biệt hoa thường và khoảng trắng thừa", () => {
    expect(compareMaSoMau("  l10309 ", HT).verdict).toBe("MATCH");
  });

  it("một MO nhiều mã → khớp nếu là MỘT TRONG SỐ đó, không phải mã đầu tiên", () => {
    expect(compareMaSoMau("D11082", "… B12946 … D11082 …").verdict).toBe("MATCH");
  });

  it("LỆCH khi đọc được mã nhưng không mã nào bằng", () => {
    const r = compareMaSoMau("B99999", HT);
    expect(r.verdict).toBe("MISMATCH");
    expect(r.codes).toEqual(["L10309"]);
  });

  // Tách khỏi MISMATCH: đây nhiều khả năng là BỘ TÁCH chưa biết một khuôn mới, không phải
  // người nhập sai. Và đây chính là chỗ tiền tố lạ tự lộ ra.
  it("KHÔNG TÌM THẤY MÃ khi Thông tin HT có chữ nhưng không có khuôn mã nào", () => {
    expect(compareMaSoMau("B12946", "18KY 2.5gr chưa có mã").verdict).toBe("NO_CODE_FOUND");
  });

  it("BỎ QUA khi thiếu MỘT trong hai — người dùng chốt: không quét, không cảnh báo", () => {
    expect(compareMaSoMau("", HT).verdict).toBe("SKIPPED");
    expect(compareMaSoMau("B12946", "").verdict).toBe("SKIPPED");
    expect(compareMaSoMau(null, null).verdict).toBe("SKIPPED");
    expect(compareMaSoMau("   ", HT).verdict).toBe("SKIPPED");
  });
});

// ─── Ngày HT: một ô, hai định dạng ───────────────────────────────────────────

describe("toCompletedYmd", () => {
  it("chuỗi YMD do user nhập / sheet-sync ghi", () => {
    expect(toCompletedYmd("2026-08-15")).toBe("2026-08-15");
  });

  // parseVnDate neo ^…$ vào đúng phần ngày nên KHÔNG hiểu ISO kèm giờ; đây là nhánh thứ hai.
  it("ISO kèm giờ, từ cột completedAt dự phòng", () => {
    expect(toCompletedYmd("2026-08-15T00:00:00.000Z")).toBe("2026-08-15");
  });

  it("các định dạng parseVnDate vốn hiểu", () => {
    expect(toCompletedYmd("15/08/2026")).toBe("2026-08-15");
    expect(toCompletedYmd("15-Aug-26")).toBe("2026-08-15");
  });

  it("rỗng / rác → null, KHÔNG đoán bừa", () => {
    for (const v of [null, undefined, "", "  ", "không phải ngày"]) {
      expect(toCompletedYmd(v as string | null), String(v)).toBeNull();
    }
  });
});

// ─── Chọn MO nào đáng soi ────────────────────────────────────────────────────

const base: ScanItem = {
  moNumber: "26.10001",
  itemStatus: "COMPLETED",
  completedDateRaw: "2026-08-15",
  masoMau: "L10309",
  thongTinHt: "18KBL: 18KY 59.85gr L10309 Size: 7in",
};

describe("isInScanScope", () => {
  it("MO hoàn tất, có Ngày HT, đúng tháng → soi", () => {
    expect(isInScanScope(base, "2026-08")).toBe(true);
  });

  it("chưa Hoàn tất → bỏ, dù mọi thứ khác đủ", () => {
    for (const st of ["IN_PRODUCTION", "CANCELLED", "SUSPENDED", null]) {
      expect(isInScanScope({ ...base, itemStatus: st }, "2026-08"), String(st)).toBe(false);
    }
  });

  // ⚠️ QUYẾT ĐỊNH CỦA NGƯỜI DÙNG, KHÔNG PHẢI CHỖ SÓT. Hệ thống cố ý không tự đóng dấu Ngày HT,
  // nên có MO ở tab Hoàn Tất mà không có ngày. Chúng sẽ KHÔNG BAO GIỜ được soi.
  it("không có Ngày HT → bỏ qua", () => {
    for (const d of [null, "", "   ", "rác"]) {
      expect(isInScanScope({ ...base, completedDateRaw: d }, "2026-08"), String(d)).toBe(false);
    }
  });

  it("khác tháng → bỏ, kể cả sát ranh giới", () => {
    expect(isInScanScope({ ...base, completedDateRaw: "2026-07-31" }, "2026-08")).toBe(false);
    expect(isInScanScope({ ...base, completedDateRaw: "2026-09-01" }, "2026-08")).toBe(false);
  });

  it("hai đầu tháng đều thuộc tháng đó", () => {
    expect(isInScanScope({ ...base, completedDateRaw: "2026-08-01" }, "2026-08")).toBe(true);
    expect(isInScanScope({ ...base, completedDateRaw: "2026-08-31" }, "2026-08")).toBe(true);
  });

  it("ISO kèm giờ cũng rơi đúng tháng", () => {
    expect(isInScanScope({ ...base, completedDateRaw: "2026-08-15T00:00:00.000Z" }, "2026-08")).toBe(true);
  });
});

// ─── Gom báo cáo ─────────────────────────────────────────────────────────────

describe("buildMaSoMauScan", () => {
  it("MO khớp thì đếm vào matched, không sinh cảnh báo", () => {
    const r = buildMaSoMauScan([base], "2026-08");
    expect(r).toMatchObject({ month: "2026-08", scanned: 1, matched: 1 });
    expect(r.warnings).toEqual([]);
  });

  it("MO lệch sinh cảnh báo kèm LÝ DO và mã đọc được", () => {
    const r = buildMaSoMauScan([{ ...base, masoMau: "B99999" }], "2026-08");
    expect(r.scanned).toBe(1);
    expect(r.matched).toBe(0);
    expect(r.warnings[0]).toMatchObject({
      moNumber: "26.10001", masoMau: "B99999", reason: "MISMATCH", codes: ["L10309"],
    });
  });

  it("Thông tin HT không đọc được mã → cảnh báo với lý do KHÁC", () => {
    const r = buildMaSoMauScan([{ ...base, thongTinHt: "18KY 2.5gr" }], "2026-08");
    expect(r.warnings[0].reason).toBe("NO_CODE_FOUND");
    expect(r.warnings[0].codes).toEqual([]);
  });

  it("thiếu một trong hai → KHÔNG vào scanned, không cảnh báo", () => {
    const r = buildMaSoMauScan(
      [{ ...base, masoMau: null }, { ...base, thongTinHt: null }],
      "2026-08",
    );
    expect(r).toMatchObject({ scanned: 0, matched: 0 });
    expect(r.warnings).toEqual([]);
  });

  it("ngoài tháng thì không đụng tới", () => {
    const r = buildMaSoMauScan([{ ...base, completedDateRaw: "2026-07-15", masoMau: "SAI" }], "2026-08");
    expect(r).toMatchObject({ scanned: 0, warnings: [] });
  });

  // 🔴 BẤT BIẾN: không MO nào rơi mất giữa các ngăn. Nếu về sau thêm một nhánh verdict mà quên
  // đếm nó, con số trong log sẽ tự nhận là đã quét hết trong khi không phải.
  it("scanned === matched + số cảnh báo, trên một tập trộn lẫn", () => {
    const items: ScanItem[] = [
      base,                                                   // MATCH
      { ...base, moNumber: "b", masoMau: "B99999" },           // MISMATCH
      { ...base, moNumber: "c", thongTinHt: "18KY 2.5gr" },    // NO_CODE_FOUND
      { ...base, moNumber: "d", masoMau: null },               // SKIPPED
      { ...base, moNumber: "e", itemStatus: "IN_PRODUCTION" }, // ngoài phạm vi
      { ...base, moNumber: "f", completedDateRaw: null },      // không có Ngày HT
    ];
    const r = buildMaSoMauScan(items, "2026-08");
    expect(r.scanned).toBe(r.matched + r.warnings.length);
    expect(r.scanned).toBe(3);
    expect(r.matched).toBe(1);
  });

  it("Thông tin HT dài bị CẮT trong cảnh báo — không làm tràn log", () => {
    const r = buildMaSoMauScan([{ ...base, masoMau: "B99999", thongTinHt: "L10309 " + "x".repeat(500) }], "2026-08");
    expect(r.warnings[0].thongTinHt.length).toBeLessThanOrEqual(160);
  });

  it("danh sách rỗng → báo cáo rỗng hợp lệ, không ném lỗi", () => {
    expect(buildMaSoMauScan([], "2026-08")).toEqual({ month: "2026-08", scanned: 0, matched: 0, warnings: [] });
  });
});

describe("Tháng", () => {
  it("currentVnMonth theo giờ Việt Nam", () => {
    // 2026-08-31 18:00 UTC = 2026-09-01 01:00 giờ VN → phải là tháng 9, không phải tháng 8.
    expect(currentVnMonth(new Date("2026-08-31T18:00:00Z"))).toBe("2026-09");
    expect(currentVnMonth(new Date("2026-08-15T03:00:00Z"))).toBe("2026-08");
  });

  it("isValidMonth chốt định dạng ở MỘT chỗ — route và test không tự đoán mỗi nơi một kiểu", () => {
    for (const ok of ["2026-01", "2026-12", "2026-08"]) expect(isValidMonth(ok), ok).toBe(true);
    for (const bad of ["2026-13", "2026-00", "2026-8", "202608", "2026", "", "abcd-ef"]) {
      expect(isValidMonth(bad), bad).toBe(false);
    }
  });
});

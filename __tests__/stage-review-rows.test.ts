import { describe, it, expect } from "vitest";

import {
  buildReviewRows, buildOutsideGroupRows, craftersOfGroup, extractRowsFromPd,
  makeInViewMonth, resolveStageCodes, type PdLite,
} from "@/app/lib/business/stage-review-rows";

// Logic này trước nằm trong route file nên không test được — cùng hoàn cảnh đã để lọt bug
// TC_NGUOI ở stage-audit. Nay tách ra module thuần, phủ test đúng các tình huống thật đo được
// trên production: NGUOI dùng records[] (1.246 dòng), KHOA vẫn scalar (25), TC_NGUOI records[] (5).

const inViewAug2026 = makeInViewMonth(2026, 8);

function pd(stages: Record<string, unknown>, itemId = "it-1"): PdLite {
  return {
    id: "pd-1",
    extraData: { perItem: { [itemId]: { stages } } },
    order: {
      id: "ord-1", orderNumber: "SO-001", createdById: "u-1",
      items: [{ id: itemId, moNumber: "MO-1", productName: "Nhẫn", specifications: null }],
    },
  };
}

const rec = (over: Record<string, unknown> = {}) => ({
  crafter: "Thợ A", doneAt: "2026-08-10T03:00:00.000Z", gioThucTe: "2g", ...over,
});

describe("resolveStageCodes", () => {
  it("Nguội mở ra thành ba khâu con", () => {
    expect(resolveStageCodes("NGUOI")).toEqual(["NGUOI", "TC_NGUOI", "KHOA"]);
  });

  it("khâu ngoài nhóm trả về chính nó — hành vi cũ không đổi", () => {
    expect(resolveStageCodes("HOT")).toEqual(["HOT"]);
    expect(resolveStageCodes("RESIN")).toEqual(["RESIN"]);
  });

  it("mã lạ không làm rỗng kết quả (tránh màn hình trắng im lặng)", () => {
    expect(resolveStageCodes("KHONG_TON_TAI")).toEqual(["KHONG_TON_TAI"]);
  });
});

describe("extractRowsFromPd — gộp nhóm Nguội", () => {
  it("lấy được dòng từ CẢ BA khâu trong một lần quét", () => {
    const rows = extractRowsFromPd(
      pd({
        NGUOI:    { records: [rec({ crafter: "NV Nguội" })] },
        TC_NGUOI: { records: [rec({ crafter: "NV TC" })] },
        KHOA:     { stageStatus: "done", doneAt: "2026-08-11T03:00:00.000Z", crafter: "NV Khóa" },
      }),
      resolveStageCodes("NGUOI"),
      inViewAug2026,
    );
    expect(rows.map(r => [r.stageCode, r.crafter])).toEqual([
      ["NGUOI", "NV Nguội"],
      ["TC_NGUOI", "NV TC"],
      ["KHOA", "NV Khóa"],
    ]);
  });

  it("mỗi dòng giữ KHÂU GỐC của nó, không phải mã nhóm — chống ghi đè sai khâu", () => {
    // Nếu dòng Khóa mang stageCode "NGUOI" thì PATCH sẽ ghi vào stages.NGUOI, vừa mất dữ
    // liệu Khóa vừa làm bẩn Nguội. Đây là bất biến quan trọng nhất của việc gộp nhóm.
    const rows = extractRowsFromPd(
      pd({ KHOA: { stageStatus: "done", doneAt: "2026-08-11T03:00:00.000Z", crafter: "X" } }),
      resolveStageCodes("NGUOI"),
      inViewAug2026,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].stageCode).toBe("KHOA");
  });

  it("KHOA dạng scalar vẫn ra dòng (recordIndex = -1)", () => {
    const rows = extractRowsFromPd(
      pd({ KHOA: { stageStatus: "done", doneAt: "2026-08-11T03:00:00.000Z", crafter: "X", bachSP: "B2" } }),
      resolveStageCodes("NGUOI"),
      inViewAug2026,
    );
    expect(rows[0]).toMatchObject({ stageCode: "KHOA", recordIndex: -1, crafter: "X", bachSP: "B2" });
  });

  it("KHOA chưa 'done' thì không ra dòng — chỉ đánh giá việc đã xong", () => {
    const rows = extractRowsFromPd(
      pd({ KHOA: { stageStatus: "pending", doneAt: "2026-08-11T03:00:00.000Z", crafter: "X" } }),
      resolveStageCodes("NGUOI"),
      inViewAug2026,
    );
    expect(rows).toEqual([]);
  });

  it("nhiều thợ trong records[] → nhiều dòng, recordIndex tăng dần", () => {
    const rows = extractRowsFromPd(
      pd({ NGUOI: { records: [rec({ crafter: "A" }), rec({ crafter: "B" })] } }),
      resolveStageCodes("NGUOI"),
      inViewAug2026,
    );
    expect(rows.map(r => [r.recordIndex, r.crafter])).toEqual([[0, "A"], [1, "B"]]);
  });

  it("record ngoài tháng đang xem bị loại, record trong tháng vẫn giữ", () => {
    const rows = extractRowsFromPd(
      pd({ NGUOI: { records: [
        rec({ crafter: "Trong tháng", doneAt: "2026-08-05T03:00:00.000Z" }),
        rec({ crafter: "Tháng trước", doneAt: "2026-07-05T03:00:00.000Z" }),
      ] } }),
      resolveStageCodes("NGUOI"),
      inViewAug2026,
    );
    expect(rows.map(r => r.crafter)).toEqual(["Trong tháng"]);
  });

  it("không kéo nhầm khâu ngoài nhóm vào bảng Nguội", () => {
    const rows = extractRowsFromPd(
      pd({
        NGUOI: { records: [rec({ crafter: "NV Nguội" })] },
        HOT:   { records: [rec({ crafter: "NV Hột" })] },
        DUC:   { records: [rec({ crafter: "NV Đúc" })] },
      }),
      resolveStageCodes("NGUOI"),
      inViewAug2026,
    );
    expect(rows.map(r => r.crafter)).toEqual(["NV Nguội"]);
  });

  it("xem khâu HOT thì chỉ ra HOT, không dính nhóm Nguội", () => {
    const rows = extractRowsFromPd(
      pd({
        NGUOI: { records: [rec({ crafter: "NV Nguội" })] },
        HOT:   { records: [rec({ crafter: "NV Hột" })] },
      }),
      resolveStageCodes("HOT"),
      inViewAug2026,
    );
    expect(rows.map(r => [r.stageCode, r.crafter])).toEqual([["HOT", "NV Hột"]]);
  });

  it("ProductionDetail không có perItem → không nổ, trả rỗng", () => {
    const bare: PdLite = {
      id: "pd-x", extraData: null,
      order: { id: "o", orderNumber: null, createdById: null, items: [] },
    };
    expect(extractRowsFromPd(bare, resolveStageCodes("NGUOI"), inViewAug2026)).toEqual([]);
  });
});

describe("makeInViewMonth — biên tháng theo giờ VN", () => {
  it("31/07 17:00Z = 01/08 00:00 giờ VN → thuộc tháng 8, không phải tháng 7", () => {
    // Đây là lỗi lệch tháng kinh điển nếu so bằng giờ UTC.
    expect(makeInViewMonth(2026, 8)("2026-07-31T17:00:00.000Z")).toBe(true);
    expect(makeInViewMonth(2026, 7)("2026-07-31T17:00:00.000Z")).toBe(false);
  });

  it("31/07 16:59Z vẫn là 23:59 ngày 31/07 giờ VN → thuộc tháng 7", () => {
    expect(makeInViewMonth(2026, 7)("2026-07-31T16:59:00.000Z")).toBe(true);
  });

  it("null/rỗng không thuộc tháng nào", () => {
    expect(makeInViewMonth(2026, 8)(null)).toBe(false);
    expect(makeInViewMonth(2026, 8)(undefined)).toBe(false);
  });
});

describe("craftersOfGroup", () => {
  it("gom tên thợ, bỏ trùng và bỏ trống", () => {
    const rows = buildReviewRows(
      [pd({ NGUOI: { records: [
        rec({ crafter: "A" }), rec({ crafter: "A" }), rec({ crafter: "B" }), rec({ crafter: "" }),
      ] } })],
      resolveStageCodes("NGUOI"), inViewAug2026,
    );
    expect([...craftersOfGroup(rows)].sort()).toEqual(["A", "B"]);
  });
});

describe("buildOutsideGroupRows — công của thợ Nguội ở khâu khác", () => {
  const groupCodes = resolveStageCodes("NGUOI");

  it("lấy công của thợ Nguội ở khâu Đúc, đánh dấu là ngoài nhóm", () => {
    const rows = buildOutsideGroupRows(
      [pd({ DUC: { records: [rec({ crafter: "Thợ Nguội A", gioThucTe: "3g" })] } })],
      groupCodes, new Set(["Thợ Nguội A"]), inViewAug2026,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      stageCode: "DUC", crafter: "Thợ Nguội A", durationNote: "3g", isOutsideGroup: true,
    });
  });

  it("CHỈ giữ Ngày HT và Thời gian HT — mọi ô đánh giá để trống", () => {
    // Đây là yêu cầu nghiệp vụ: khâu ngoài nhóm không đánh giá theo chỉ tiêu Nguội.
    const rows = buildOutsideGroupRows(
      [pd({ DUC: { records: [rec({
        crafter: "A", ketQua: "Đạt", thoiGianOk: "Đạt", bachSP: "B3", gioKpi: "5", lyDo: "x",
      })] } })],
      groupCodes, new Set(["A"]), inViewAug2026,
    );
    expect(rows[0]).toMatchObject({
      coldworkQuality: null, coldworkTimeOk: null, coldworkReason: null,
      bachSP: null, gioKpi: null, ghiChuNguoi: null, reviewedAt: null,
    });
    expect(rows[0].doneAt).toBeTruthy();
  });

  it("BỎ QUA thợ không thuộc nhóm Nguội", () => {
    const rows = buildOutsideGroupRows(
      [pd({ DUC: { records: [rec({ crafter: "Thợ Đúc riêng" })] } })],
      groupCodes, new Set(["Thợ Nguội A"]), inViewAug2026,
    );
    expect(rows).toEqual([]);
  });

  it("KHÔNG lặp lại các khâu đã nằm trong nhóm", () => {
    // Nếu quét cả khâu trong nhóm thì mỗi công việc Nguội sẽ hiện hai lần.
    const rows = buildOutsideGroupRows(
      [pd({
        NGUOI:    { records: [rec({ crafter: "A" })] },
        TC_NGUOI: { records: [rec({ crafter: "A" })] },
        KHOA:     { stageStatus: "done", doneAt: "2026-08-10T03:00:00.000Z", crafter: "A" },
      })],
      groupCodes, new Set(["A"]), inViewAug2026,
    );
    expect(rows).toEqual([]);
  });

  it("khâu ngoài nhóm dạng scalar cần stageStatus done", () => {
    const done = buildOutsideGroupRows(
      [pd({ DBXM: { stageStatus: "done", doneAt: "2026-08-10T03:00:00.000Z", crafter: "A", durationNote: "1g" } })],
      groupCodes, new Set(["A"]), inViewAug2026,
    );
    expect(done.map(r => [r.stageCode, r.durationNote])).toEqual([["DBXM", "1g"]]);

    const pending = buildOutsideGroupRows(
      [pd({ DBXM: { stageStatus: "pending", doneAt: "2026-08-10T03:00:00.000Z", crafter: "A" } })],
      groupCodes, new Set(["A"]), inViewAug2026,
    );
    expect(pending).toEqual([]);
  });

  it("lọc theo tháng đang xem", () => {
    const rows = buildOutsideGroupRows(
      [pd({ QC: { records: [rec({ crafter: "A", doneAt: "2026-07-10T03:00:00.000Z" })] } })],
      groupCodes, new Set(["A"]), inViewAug2026,
    );
    expect(rows).toEqual([]);
  });

  it("tên khớp sau khi trim, KHÔNG đoán mò dấu tiếng Việt", () => {
    // "Phạm Hiếu May" vs "Phạm Hiếu Mây" tồn tại thật trên production. Gộp nhầm hai tên gần
    // giống nguy hiểm hơn bỏ sót: bỏ sót thì thiếu một dòng, gộp nhầm thì cộng công của
    // người này cho người khác.
    const trimmed = buildOutsideGroupRows(
      [pd({ DUC: { records: [rec({ crafter: "  Phạm Hiếu Mây  " })] } })],
      groupCodes, new Set(["Phạm Hiếu Mây"]), inViewAug2026,
    );
    expect(trimmed).toHaveLength(1);

    const noDiacritic = buildOutsideGroupRows(
      [pd({ DUC: { records: [rec({ crafter: "Phạm Hiếu May" })] } })],
      groupCodes, new Set(["Phạm Hiếu Mây"]), inViewAug2026,
    );
    expect(noDiacritic).toEqual([]);
  });

  it("không có thợ nào trong nhóm → không quét gì cả", () => {
    const rows = buildOutsideGroupRows(
      [pd({ DUC: { records: [rec({ crafter: "A" })] } })],
      groupCodes, new Set(), inViewAug2026,
    );
    expect(rows).toEqual([]);
  });
});

describe("buildReviewRows — sắp xếp", () => {
  it("dòng mới hoàn tất xếp lên trước", () => {
    const rows = buildReviewRows(
      [pd({ NGUOI: { records: [
        rec({ crafter: "Cũ",  doneAt: "2026-08-02T03:00:00.000Z" }),
        rec({ crafter: "Mới", doneAt: "2026-08-20T03:00:00.000Z" }),
      ] } })],
      resolveStageCodes("NGUOI"),
      inViewAug2026,
    );
    expect(rows.map(r => r.crafter)).toEqual(["Mới", "Cũ"]);
  });
});

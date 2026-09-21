import { describe, it, expect } from "vitest";
import {
  buildSyncPlan, groupByOrder, indexKnownMos,
  type DbItem, type KnownMo, type MoCandidate, type SheetRow,
} from "@/app/lib/business/sheet-sync";
import { parseVnDate, vnYmdToUtcMidnight, toVnYmd, vnDayNum } from "@/app/lib/utils/vn-date";

/**
 * MO gốc đã biết trên webapp → MO đó (orderId + itemId + moNumber).
 *
 * Kiểu này đã rộng ra hai lần: `Set<string>` (biết tồn tại, không biết thuộc đơn nào) →
 * `Map<base, orderId>` (tới được đơn, không tới được MO) → `Map<base, KnownMo>`. Helper giữ
 * test đọc gọn như cũ.
 */
const KNOWN = (bases: string[]): Map<string, KnownMo> =>
  new Map(bases.map((b) => [b, { orderId: `o-${b}`, itemId: `it-${b}`, moNumber: b, isFromWebapp: false }]));

// Test logic đồng bộ Google Sheet — chạy THUẦN, không cần DB.
// Đây là lý do buildSyncPlan được tách khỏi route: quy tắc nghiệp vụ test được độc lập.

const item = (over: Partial<DbItem> = {}): DbItem => ({
  itemId: "it1", orderId: "od1", moNumber: "26.37110", isFromWebapp: false, current: {}, ...over,
});

describe("vn-date — nguồn duy nhất cho ngày VN", () => {
  it("parseVnDate: nhận dd/mm/yyyy (kiểu VN)", () => {
    expect(parseVnDate("15/07/2026")).toBe("2026-07-15");
    expect(parseVnDate("5-7-26")).toBe("2026-07-05");
  });

  it("parseVnDate: nhận ISO và dd-Mon-yy", () => {
    expect(parseVnDate("2026-07-15")).toBe("2026-07-15");
    expect(parseVnDate("15-Jul-26")).toBe("2026-07-15");
  });

  it("parseVnDate: từ chối ngày không hợp lệ thay vì đoán bừa", () => {
    expect(parseVnDate("31/02/2026")).toBeNull();  // 31/02 không tồn tại
    expect(parseVnDate("linh tinh")).toBeNull();
    expect(parseVnDate("")).toBeNull();
  });

  it("vnYmdToUtcMidnight: lưu đúng chuẩn UTC-midnight", () => {
    expect(vnYmdToUtcMidnight("2026-07-15")?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(vnYmdToUtcMidnight("2026-02-31")).toBeNull();
  });

  it("toVnYmd/vnDayNum: đọc theo giờ VN, không theo giờ máy", () => {
    // 2026-07-14T17:00:00Z = 15/07 00:00 giờ VN → phải ra ngày 15, không phải 14.
    const d = new Date("2026-07-14T17:00:00.000Z");
    expect(toVnYmd(d)).toBe("2026-07-15");
    expect(vnDayNum(d)).toBe(20260715);
  });
});

describe("buildSyncPlan — khớp MO & quyết định ghi", () => {
  it("cập nhật SKU/Thông tin HT khi khác giá trị hiện có", () => {
    const plan = buildSyncPlan(
      [{ mo: "26.37110", sku: "SKU-A", thongTinHt: "Đã giao" }],
      [item({ current: { sku: "SKU-CU" } })],
      KNOWN(["26.37110"]),
    );
    expect(plan.updates).toHaveLength(2);
    expect(plan.updates.find((u) => u.target === "sku")?.to).toBe("SKU-A");
    expect(plan.updates.find((u) => u.target === "thongTinHt")?.from).toBe("");
  });

  it("không ghi khi giá trị đã trùng", () => {
    const plan = buildSyncPlan(
      [{ mo: "26.37110", sku: "SKU-A" }],
      [item({ current: { sku: "SKU-A" } })],
      KNOWN(["26.37110"]),
    );
    expect(plan.updates).toHaveLength(0);
  });

  it("ô sheet trống KHÔNG ghi đè dữ liệu đang có bằng rỗng", () => {
    const plan = buildSyncPlan(
      [{ mo: "26.37110", sku: "" }],
      [item({ current: { sku: "SKU-CU" } })],
      KNOWN(["26.37110"]),
    );
    expect(plan.updates).toHaveLength(0);
  });

  it("khớp MO GỐC cho cả 2 định dạng phiên bản ('.1' cũ và '_2' mới)", () => {
    const plan = buildSyncPlan(
      [{ mo: "26.37110", sku: "SKU-A" }],
      [
        item({ itemId: "a", moNumber: "26.37110.1" }),
        item({ itemId: "b", moNumber: "26.37110_2" }),
      ],
      KNOWN(["26.37110"]),
    );
    expect(plan.updates.map((u) => u.itemId).sort()).toEqual(["a", "b"]);
  });

  it("phân biệt 'không có MO' với 'có nhưng chưa Hoàn tất'", () => {
    const plan = buildSyncPlan(
      [{ mo: "26.99999", sku: "X" }, { mo: "26.37110", sku: "Y" }],
      [],                                   // không MO nào COMPLETED
      KNOWN(["26.37110"]),                // 26.37110 có tồn tại nhưng chưa hoàn tất
    );
    expect(plan.notFound).toEqual(["26.99999"]);
    // notCompleted mang theo orderId VÀ itemId — thiếu itemId thì panel mở ở cấp đơn hàng và
    // hiện "MO# —", đúng lỗi người dùng đã báo.
    expect(plan.notCompleted).toEqual([
      { mo: "26.37110", orderId: "o-26.37110", itemId: "it-26.37110", isFromWebapp: false },
    ]);
  });

  // 🔴 BẤT BIẾN: số MO trong lời nhắc lấy từ WEBAPP, không lấy chuỗi trong sheet.
  //
  // Hai chuỗi thường bằng nhau nên lỗi này vô hình. Nhưng chỉ số của webapp mới được phép đưa
  // qua formatMoVersionedDisplay(_, isFromWebapp = true) ở tầng hiển thị — lấy nhầm chuỗi sheet
  // là gán một quy ước hiển thị của webapp lên dữ liệu không thuộc webapp.
  it("notCompleted lấy moNumber của WEBAPP, không lấy chuỗi trong sheet", () => {
    const plan = buildSyncPlan(
      [{ mo: "26.37110" }],   // sheet ghi MO gốc, không hậu tố
      [],
      new Map([["26.37110", { orderId: "od9", itemId: "it9", moNumber: "26.37110_3", isFromWebapp: true }]]),
    );
    expect(plan.notCompleted).toEqual([
      { mo: "26.37110_3", orderId: "od9", itemId: "it9", isFromWebapp: true },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CHỌN MO NÀO — phép chọn này đã sai một lần trên production
// ═══════════════════════════════════════════════════════════════════════════

describe("indexKnownMos", () => {
  const cand = (over: Partial<MoCandidate>): MoCandidate => ({
    orderId: "od", itemId: "it", moNumber: "25.33240", isFromWebapp: false,
    zone: "MASTER_HUB", itemStatus: null, orderStatus: "IN_PRODUCTION", ...over,
  });
  const bases = new Set(["25.33240"]);

  // 🔴 CA ĐÃ XẢY RA THẬT. "Thiết kế lại" tạo phiên bản MỚI ở PTK trong khi bản đang chạy ngoài
  // xưởng ở lại PSX với phiên bản THẤP hơn. Quy tắc cũ ("phiên bản cao nhất") chọn bản PTK —
  // một dòng "Chưa thiết kế" KHÔNG CÓ nút Hoàn tất để bấm.
  it("PSX phiên bản THẤP thắng PTK phiên bản CAO", () => {
    const got = indexKnownMos([
      cand({ moNumber: "25.33240_4", itemId: "ptk", zone: "PRE_PRODUCTION" }),
      cand({ moNumber: "25.33240", itemId: "psx", zone: "MASTER_HUB" }),
    ], bases);
    expect(got.get("25.33240")).toMatchObject({ itemId: "psx", moNumber: "25.33240" });
  });

  it("thứ tự đầu vào không đổi kết quả", () => {
    const got = indexKnownMos([
      cand({ moNumber: "25.33240", itemId: "psx" }),
      cand({ moNumber: "25.33240_4", itemId: "ptk", zone: "PRE_PRODUCTION" }),
    ], bases);
    expect(got.get("25.33240")?.itemId).toBe("psx");
  });

  it("cùng ở PSX → phiên bản cao nhất (phân định khi hoà)", () => {
    const got = indexKnownMos([
      cand({ moNumber: "25.33240", itemId: "v0" }),
      cand({ moNumber: "25.33240_5", itemId: "v5" }),
      cand({ moNumber: "25.33240_2", itemId: "v2" }),
    ], bases);
    expect(got.get("25.33240")?.itemId).toBe("v5");
  });

  it("bản PSX đã HUỶ thua bản PTK còn hiệu lực", () => {
    const got = indexKnownMos([
      cand({ moNumber: "25.33240_9", itemId: "huy", itemStatus: "CANCELLED" }),
      cand({ moNumber: "25.33240", itemId: "song", zone: "PRE_PRODUCTION" }),
    ], bases);
    expect(got.get("25.33240")?.itemId).toBe("song");
  });

  // ⚠️ XẾP CUỐI, KHÔNG LOẠI HẲN. Loại hẳn thì MO chỉ còn bản huỷ rơi vào `notFound` — webapp
  // nói "không có MO này", một câu SAI.
  it("chỉ còn bản đã HUỶ → vẫn tra ra được", () => {
    const got = indexKnownMos([cand({ itemId: "huy", itemStatus: "CANCELLED" })], bases);
    expect(got.get("25.33240")?.itemId).toBe("huy");
  });

  it("chỉ có PTK → vẫn lấy PTK", () => {
    const got = indexKnownMos([cand({ itemId: "ptk", zone: "PRE_PRODUCTION" })], bases);
    expect(got.get("25.33240")?.itemId).toBe("ptk");
  });

  // Luật 1 của psx-sibling: truy vấn lọc thô bằng startsWith, "26.1234" khớp nhầm "26.12345".
  it("loại false-positive của startsWith", () => {
    const got = indexKnownMos([cand({ moNumber: "25.332401" })], bases);
    expect(got.size).toBe(0);
  });

  it("cờ isFromWebapp đi theo đúng bản được chọn", () => {
    const got = indexKnownMos([
      cand({ moNumber: "25.33240_4", zone: "PRE_PRODUCTION", isFromWebapp: true }),
      cand({ moNumber: "25.33240", isFromWebapp: false }),
    ], bases);
    expect(got.get("25.33240")?.isFromWebapp).toBe(false);
  });
});

describe("buildSyncPlan — quy tắc Ngày HT", () => {
  it("webapp TRỐNG → tự điền theo sheet", () => {
    const plan = buildSyncPlan(
      [{ mo: "26.37110", ngay: "15/07/2026" }],
      [item({ current: {} })],
      KNOWN(["26.37110"]),
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].target).toBe("completedDate");
    expect(plan.updates[0].to).toBe("2026-07-15");
    expect(plan.mismatches).toHaveLength(0);
  });

  it("webapp ĐÃ CÓ và KHỚP → không làm gì", () => {
    const plan = buildSyncPlan(
      [{ mo: "26.37110", ngay: "15/07/2026" }],
      [item({ current: { completedDate: "2026-07-15T00:00:00.000Z" } })],
      KNOWN(["26.37110"]),
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.mismatches).toHaveLength(0);
  });

  it("webapp ĐÃ CÓ mà LỆCH → chỉ cảnh báo, TUYỆT ĐỐI không ghi đè", () => {
    const plan = buildSyncPlan(
      [{ mo: "26.37110", ngay: "20/07/2026" }],
      [item({ current: { completedDate: "2026-07-15T00:00:00.000Z" } })],
      KNOWN(["26.37110"]),
    );
    expect(plan.updates).toHaveLength(0);          // không ghi đè
    expect(plan.mismatches).toHaveLength(1);
    expect(plan.mismatches[0].webapp).toBe("2026-07-15");
    expect(plan.mismatches[0].sheet).toBe("2026-07-20");
  });

  it("ngày sai định dạng → bỏ qua, không đoán bừa", () => {
    const plan = buildSyncPlan(
      [{ mo: "26.37110", ngay: "31/02/2026" }],
      [item({ current: {} })],
      KNOWN(["26.37110"]),
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.badDate).toHaveLength(1);
  });
});

describe("groupByOrder", () => {
  it("gom update + mismatch theo đơn để mỗi đơn ghi 1 lần", () => {
    const rows: SheetRow[] = [{ mo: "26.1", sku: "A" }, { mo: "26.2", ngay: "20/07/2026" }];
    const plan = buildSyncPlan(rows, [
      item({ itemId: "i1", orderId: "od1", moNumber: "26.1" }),
      item({ itemId: "i2", orderId: "od1", moNumber: "26.2", current: { completedDate: "2026-07-15T00:00:00.000Z" } }),
    ], KNOWN(["26.1", "26.2"]));

    const byOrder = groupByOrder(plan);
    expect(byOrder.size).toBe(1);
    expect(byOrder.get("od1")!.updates).toHaveLength(1);
    expect(byOrder.get("od1")!.mismatches).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";

import {
  EMPTY_PAYLOAD,
  buildNoticePayload,
  canSeeSyncNotice,
  countNotice,
  flattenNotice,
  isEmptyNotice,
  noticeFingerprint,
  parseNoticePayload,
  type SyncNoticeMonth,
} from "@/app/lib/business/orders/sync-notice";
import { USER_ROLE_VALUES } from "@/app/lib/roles";

// ═══════════════════════════════════════════════════════════════════════════
// NHẮC VIỆC TỪ MẺ ĐỒNG BỘ — luật, không phải giao diện
// ═══════════════════════════════════════════════════════════════════════════

const CHUA = [
  { mo: "26.37025", orderId: "o1" },
  { mo: "25.33240", orderId: "o2" },
];
const LECH = [{ mo: "25.34441", orderId: "o3", webapp: "2026-07-11", sheet: "2026-07-10" }];

const monthOf = (month: string, syncedAt = "2026-08-25T10:00:00.000Z"): SyncNoticeMonth => ({
  month,
  syncedAt,
  payload: buildNoticePayload(CHUA, LECH),
});

describe("buildNoticePayload", () => {
  it("giữ đủ cả hai nhóm", () => {
    const p = buildNoticePayload(CHUA, LECH);
    expect(p.chuaHoanTat).toHaveLength(2);
    expect(p.lechNgay).toHaveLength(1);
    expect(countNotice(p)).toBe(3);
  });

  // ⚠️ CẦN THẬT, KHÔNG PHÒNG XA: một MO xuất hiện nhiều dòng trong sheet (nhiều block CH2/CH3,
  // hoặc gõ lặp). Không khử thì con số trên nút đếm sai — và một con số sai làm người ta ngừng
  // tin cả tính năng.
  it("khử MO trùng", () => {
    const p = buildNoticePayload([...CHUA, { mo: "26.37025", orderId: "oX" }], []);
    expect(p.chuaHoanTat.map((x) => x.mo)).toEqual(["26.37025", "25.33240"]);
  });

  it("bỏ MO rỗng / toàn khoảng trắng", () => {
    const p = buildNoticePayload([{ mo: "  ", orderId: "o" }, { mo: "", orderId: "o" }], []);
    expect(p.chuaHoanTat).toEqual([]);
  });

  it("rỗng thì isEmptyNotice = true", () => {
    expect(isEmptyNotice(buildNoticePayload([], []))).toBe(true);
    expect(isEmptyNotice(EMPTY_PAYLOAD)).toBe(true);
  });
});

// ─── Vân tay: quyết định popup có làm phiền lại hay không ────────────────────

describe("noticeFingerprint", () => {
  it("nội dung giống nhau → vân tay giống nhau", () => {
    expect(noticeFingerprint([monthOf("2026-08")])).toBe(noticeFingerprint([monthOf("2026-08")]));
  });

  // 🔴 BẤT BIẾN QUAN TRỌNG NHẤT FILE NÀY. Mẻ đồng bộ chạy MỖI NGÀY và luôn đổi `syncedAt`. Nếu
  // mốc thời gian lọt vào vân tay thì sáng nào popup cũng bật lên với cùng nội dung cũ — và
  // người ta sẽ học cách bấm ✕ theo phản xạ, rồi bấm qua luôn cả lần có việc mới.
  it("ĐỔI syncedAt mà nội dung không đổi → vân tay KHÔNG đổi", () => {
    expect(noticeFingerprint([monthOf("2026-08", "2026-08-25T10:00:00.000Z")]))
      .toBe(noticeFingerprint([monthOf("2026-08", "2026-08-26T10:00:00.000Z")]));
  });

  it("thêm một MO → vân tay ĐỔI (popup mở lại)", () => {
    const a = [{ month: "2026-08", syncedAt: "x", payload: buildNoticePayload(CHUA, []) }];
    const b = [{ month: "2026-08", syncedAt: "x", payload: buildNoticePayload([...CHUA, { mo: "26.99999", orderId: "o9" }], []) }];
    expect(noticeFingerprint(a)).not.toBe(noticeFingerprint(b));
  });

  it("bớt một MO → vân tay ĐỔI", () => {
    const a = [{ month: "2026-08", syncedAt: "x", payload: buildNoticePayload(CHUA, []) }];
    const b = [{ month: "2026-08", syncedAt: "x", payload: buildNoticePayload([CHUA[0]], []) }];
    expect(noticeFingerprint(a)).not.toBe(noticeFingerprint(b));
  });

  // Cùng MO nhưng lệch sang một CẶP NGÀY khác là một việc khác — phải hỏi lại.
  it("cùng MO, cặp ngày lệch khác → vân tay ĐỔI", () => {
    const a = [{ month: "2026-08", syncedAt: "x", payload: buildNoticePayload([], LECH) }];
    const b = [{ month: "2026-08", syncedAt: "x", payload: buildNoticePayload([], [{ ...LECH[0], sheet: "2026-07-09" }]) }];
    expect(noticeFingerprint(a)).not.toBe(noticeFingerprint(b));
  });

  // Thứ tự MO trong sheet đổi được mà nội dung việc thì không.
  it("đổi THỨ TỰ → vân tay KHÔNG đổi", () => {
    const a = [{ month: "2026-08", syncedAt: "x", payload: buildNoticePayload(CHUA, []) }];
    const b = [{ month: "2026-08", syncedAt: "x", payload: buildNoticePayload([...CHUA].reverse(), []) }];
    expect(noticeFingerprint(a)).toBe(noticeFingerprint(b));
  });

  // Thêm `itemId`/`so` là sửa ĐƯỜNG DẪN và CÁCH HIỂN THỊ, không phải thêm việc mới. Nếu vân
  // tay đổi theo thì lần deploy đó bật popup lên cho mọi người với đúng danh sách họ đã xem.
  it("thêm itemId/so/isFromWebapp mà việc không đổi → vân tay KHÔNG đổi", () => {
    const a = [{ month: "2026-08", syncedAt: "x", payload: buildNoticePayload(CHUA, LECH) }];
    const b = [{
      month: "2026-08", syncedAt: "x",
      payload: buildNoticePayload(
        CHUA.map((x) => ({ ...x, itemId: "it", so: "26.10946", isFromWebapp: true })),
        LECH.map((x) => ({ ...x, itemId: "it", so: "26.10905", isFromWebapp: true })),
      ),
    }];
    expect(noticeFingerprint(a)).toBe(noticeFingerprint(b));
  });

  it("không có việc gì → vân tay rỗng", () => {
    expect(noticeFingerprint([])).toBe("");
  });
});

// ─── Đọc JSON do bản code CŨ ghi ra ─────────────────────────────────────────
//
// Cột Json trả `unknown`. Tin nó đúng hình là cách một trang trắng xuất hiện sau mỗi lần đổi
// cấu trúc — và đây là layout bọc TOÀN BỘ dashboard.

describe("parseNoticePayload", () => {
  it("đọc được payload đúng hình", () => {
    const p = parseNoticePayload({ chuaHoanTat: CHUA, lechNgay: LECH });
    expect(countNotice(p)).toBe(3);
  });

  it("rác / null / kiểu sai → rỗng, KHÔNG ném lỗi", () => {
    for (const v of [null, undefined, 0, "", "abc", [], { chuaHoanTat: "x" }]) {
      expect(countNotice(parseNoticePayload(v)), JSON.stringify(v)).toBe(0);
    }
  });

  // 🔴 CHỐNG HỒI QUY CHO ẢNH CHỤP CŨ. `itemId`/`so` được thêm sau; dữ liệu đang nằm trong DB
  // không có chúng. Nếu guard bắt buộc hai trường này thì toàn bộ lời nhắc hiện có biến mất
  // khỏi màn hình cho tới mẻ đồng bộ kế tiếp — im lặng đúng lúc đang có việc tồn.
  it("payload CŨ (không itemId/so) vẫn đọc được đủ", () => {
    const p = parseNoticePayload({
      chuaHoanTat: [{ mo: "26.37025", orderId: "o1" }],
      lechNgay: [{ mo: "25.34441", orderId: "o3", webapp: "2026-07-11", sheet: "2026-07-10" }],
    });
    expect(countNotice(p)).toBe(2);
    expect(p.chuaHoanTat[0].itemId).toBeUndefined();
  });

  it("giữ itemId/so/isFromWebapp khi có, loại khi sai kiểu (chúng đi thẳng vào href/hiển thị)", () => {
    const p = parseNoticePayload({
      chuaHoanTat: [
        { mo: "26.1", orderId: "o", itemId: "it1", so: "26.10946", isFromWebapp: true },
        { mo: "26.2", orderId: "o", itemId: 5 },
        { mo: "26.3", orderId: "o", isFromWebapp: "true" },
      ],
      lechNgay: [],
    });
    expect(p.chuaHoanTat).toHaveLength(1);
    expect(p.chuaHoanTat[0]).toMatchObject({ itemId: "it1", so: "26.10946", isFromWebapp: true });
  });

  it("loại phần tử thiếu trường, giữ phần tử hợp lệ", () => {
    const p = parseNoticePayload({
      chuaHoanTat: [{ mo: "26.1", orderId: "o" }, { mo: "26.2" }, null, 5],
      lechNgay: [{ mo: "26.3", orderId: "o" }],  // thiếu webapp/sheet → loại
    });
    expect(p.chuaHoanTat).toHaveLength(1);
    expect(p.lechNgay).toHaveLength(0);
  });
});

// ─── Dàn phẳng để hiển thị ──────────────────────────────────────────────────

describe("flattenNotice", () => {
  const mk = (month: string, syncedAt: string, chua: string[]): SyncNoticeMonth => ({
    month, syncedAt,
    payload: buildNoticePayload(chua.map((mo) => ({ mo, orderId: "o" })), []),
  });

  it("gom theo LOẠI việc, tháng thành thuộc tính của dòng", () => {
    const f = flattenNotice([
      { month: "2026-08", syncedAt: "2026-08-26T03:00:00.000Z", payload: buildNoticePayload(CHUA, LECH) },
    ]);
    expect(f.chuaHoanTat).toHaveLength(2);
    expect(f.lechNgay).toHaveLength(1);
    expect(f.total).toBe(3);
    expect(f.chuaHoanTat[0].month).toBe("2026-08");
  });

  // Việc tồn lâu nhất là việc gấp nhất: tháng hiện tại còn được mẻ mai quét lại, tháng cũ thì
  // đã ra khỏi cửa sổ quét và không ai nhắc lại nữa.
  it("tháng CŨ đứng trước", () => {
    const f = flattenNotice([mk("2026-08", "2026-08-26T03:00:00.000Z", ["b"]), mk("2026-06", "2026-08-26T03:00:00.000Z", ["a"])]);
    expect(f.chuaHoanTat.map((x) => x.month)).toEqual(["2026-06", "2026-08"]);
  });

  it("mốc mới nhất nổi lên header", () => {
    const f = flattenNotice([mk("2026-06", "2026-08-10T03:00:00.000Z", ["a"]), mk("2026-08", "2026-08-26T03:00:00.000Z", ["b"])]);
    expect(f.latestSyncedAt).toBe("2026-08-26T03:00:00.000Z");
  });

  // 🔴 BẤT BIẾN: mốc CHỈ hiện ở dòng nào thật sự cũ. Mẻ hằng ngày chỉ quét tháng hiện tại +
  // tháng trước; tháng cũ hơn giữ ảnh chụp lần cuối. Im lặng ở đây = một danh sách cũ trông y
  // hệt một danh sách mới. Nhưng lặp mốc ở MỌI dòng thì đúng cái nhiễu vừa bỏ đi.
  it("cùng ngày với mẻ mới nhất → KHÔNG hiện mốc; khác ngày → CÓ", () => {
    const f = flattenNotice([
      mk("2026-06", "2026-08-10T03:00:00.000Z", ["cu"]),
      mk("2026-08", "2026-08-26T03:00:00.000Z", ["moi"]),
    ]);
    const [cu, moi] = f.chuaHoanTat;
    expect(cu.staleSyncedAt).toBe("2026-08-10T03:00:00.000Z");
    expect(moi.staleSyncedAt).toBeNull();
  });

  // Hai mẻ cách nhau vài phút trong CÙNG một ngày VN không phải "cũ".
  it("lệch vài phút trong cùng ngày → không coi là cũ", () => {
    const f = flattenNotice([
      mk("2026-07", "2026-08-26T03:46:00.000Z", ["a"]),
      mk("2026-08", "2026-08-26T03:47:00.000Z", ["b"]),
    ]);
    expect(f.chuaHoanTat.every((x) => x.staleSyncedAt === null)).toBe(true);
  });

  it("không có tháng nào → rỗng, latestSyncedAt null", () => {
    expect(flattenNotice([])).toEqual({ chuaHoanTat: [], lechNgay: [], latestSyncedAt: null, total: 0 });
  });
});

// ─── Ai được thấy ───────────────────────────────────────────────────────────

describe("canSeeSyncNotice", () => {
  it("ADMIN và ORDER thấy", () => {
    expect(canSeeSyncNotice("ADMIN")).toBe(true);
    expect(canSeeSyncNotice("ORDER")).toBe(true);
  });

  // Chuyển MO sang Hoàn tất không phải việc của họ. Một lời nhắc mình không làm gì được là thứ
  // người ta học cách bỏ qua — rồi bỏ qua luôn cả cái thật.
  it("các vai còn lại KHÔNG thấy", () => {
    for (const r of USER_ROLE_VALUES) {
      if (r === "ADMIN" || r === "ORDER") continue;
      expect(canSeeSyncNotice(r), r).toBe(false);
    }
  });

  it("vai rỗng / lạ không thấy", () => {
    for (const r of [undefined, null, "", "VAI_LA"]) {
      expect(canSeeSyncNotice(r as string | undefined), String(r)).toBe(false);
    }
  });
});

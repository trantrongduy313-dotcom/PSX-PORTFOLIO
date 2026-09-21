import { describe, expect, it } from "vitest";

import {
  canDelete,
  contentPatch,
  entriesToNotify,
  entriesToPublish,
  publishPatch,
  unpublishPatch,
  type ChangelogPublishState,
} from "@/app/lib/business/changelog/publish";

// LỖI MÀ FILE TEST NÀY TỒN TẠI ĐỂ CHẶN:
//
//     sửa một lỗi chính tả ở mục đã đăng → cả nhóm nhận thông báo Chat lần thứ hai
//
// Nhận thông báo trùng hai ba lần là người ta TẮT thông báo Chat. Và vì cùng một webhook
// `GOOGLE_CHAT_WEBHOOK_URL` đang chở cảnh báo lỗi của tính năng Góp ý, tắt nó là mất luôn cả
// hai kênh. Đây là loại lỗi không ai mở ticket — họ chỉ im lặng tắt thông báo.

const entry = (over: Partial<ChangelogPublishState> = {}): ChangelogPublishState => ({
  id: "e1",
  isPublished: false,
  notifiedAt: null,
  ...over,
});

const NOW = new Date("2026-08-20T10:00:00Z");

describe("entriesToPublish", () => {
  it("chỉ lấy nháp", () => {
    const rows = [entry({ id: "a" }), entry({ id: "b", isPublished: true }), entry({ id: "c" })];
    expect(entriesToPublish(rows).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("không có nháp nào → mảng rỗng, không nổ", () => {
    expect(entriesToPublish([entry({ isPublished: true })])).toEqual([]);
  });
});

describe("entriesToNotify — LỌC THEO notifiedAt, không theo 'vừa mới đăng'", () => {
  it("mục chưa từng thông báo thì được nhắc", () => {
    expect(entriesToNotify([entry({ notifiedAt: null })])).toHaveLength(1);
  });

  it("🔴 mục ĐÃ từng thông báo thì KHÔNG nhắc lại, dù nó vừa được đăng lại", () => {
    // Ca thật: đăng → phát hiện sai → bỏ đăng → sửa → đăng lại. Nó CÓ trong entriesToPublish
    // nhưng mọi người đã biết về nó rồi. Nhắc lần hai là thông báo trùng.
    expect(entriesToNotify([entry({ notifiedAt: new Date("2026-08-19T00:00:00Z") })])).toEqual([]);
  });

  it("lượt đăng lẫn cả hai loại → chỉ nhắc mục mới", () => {
    const rows = [
      entry({ id: "moi" }),
      entry({ id: "cu", notifiedAt: new Date("2026-08-01T00:00:00Z") }),
    ];
    expect(entriesToNotify(rows).map((e) => e.id)).toEqual(["moi"]);
  });
});

describe("publishPatch", () => {
  it("mục mới → đặt CẢ publishedAt VÀ notifiedAt", () => {
    const p = publishPatch(entry(), NOW);
    expect(p.isPublished).toBe(true);
    expect(p.publishedAt).toBe(NOW);
    expect(p.notifiedAt).toBe(NOW);
  });

  it("🔴 mục đã từng thông báo → KHÔNG ghi lại notifiedAt", () => {
    const p = publishPatch(entry({ notifiedAt: new Date("2026-08-01T00:00:00Z") }), NOW);
    // Không có khoá `notifiedAt` trong patch nghĩa là DB giữ nguyên giá trị cũ. Ghi `undefined`
    // hay ghi `null` đều sẽ làm mất sự thật "đã thông báo rồi".
    expect("notifiedAt" in p).toBe(false);
  });

  it("publishedAt LUÔN được đập lại — đăng lại thì nó là mục mới trên trang", () => {
    const p = publishPatch(entry({ notifiedAt: new Date("2026-08-01T00:00:00Z") }), NOW);
    expect(p.publishedAt).toBe(NOW);
  });
});

describe("contentPatch — chủ đích nằm ở những gì nó KHÔNG trả về", () => {
  const p = contentPatch({ title: "  Sửa lỗi chính tả  ", body: " abc ", area: "PSX", isImportant: false });

  it("🔴 KHÔNG chứa notifiedAt — sửa chính tả không được bắn thông báo lần hai", () => {
    expect("notifiedAt" in p).toBe(false);
  });

  it("🔴 KHÔNG chứa publishedAt — sửa chính tả không được đẩy mục lên đầu trang", () => {
    expect("publishedAt" in p).toBe(false);
  });

  it("KHÔNG chứa isPublished — sửa nội dung không phải là đăng", () => {
    expect("isPublished" in p).toBe(false);
  });

  it("chỉ có đúng 4 trường nội dung — chặn ở TẦNG KIỂU, route không có đường ghi thêm", () => {
    expect(Object.keys(p).sort()).toEqual(["area", "body", "isImportant", "title"]);
  });

  it("cắt khoảng trắng ở hai đầu", () => {
    expect(p.title).toBe("Sửa lỗi chính tả");
    expect(p.body).toBe("abc");
  });
});

describe("unpublishPatch — KHÔNG xoá notifiedAt", () => {
  it("chỉ đưa về nháp, không đụng tới sự thật 'đã thông báo'", () => {
    const p = unpublishPatch();
    expect(p).toEqual({ isPublished: false, publishedAt: null });
    // Nghe có lý là "bỏ đăng thì coi như chưa thông báo", nhưng nó SAI: mọi người ĐÃ nhận tin
    // rồi và không có cách nào rút lại. Xoá notifiedAt là tự cho mình quyền bắn lại lần hai.
    expect("notifiedAt" in p).toBe(false);
  });
});

describe("canDelete", () => {
  it("nháp thì xoá được", () => {
    expect(canDelete({ isPublished: false })).toBe(true);
  });

  it("đã đăng thì KHÔNG xoá được — người ta đã đọc, xoá là làm lịch sử nói dối", () => {
    expect(canDelete({ isPublished: true })).toBe(false);
  });
});

describe("Vòng đời đầy đủ — đăng, sửa, bỏ đăng, đăng lại: CHỈ bắn MỘT lần", () => {
  it("đi hết vòng mà notifiedAt chỉ được đặt đúng một lần", () => {
    let row: ChangelogPublishState = entry();
    let notifyCount = 0;

    const doPublish = () => {
      const batch = entriesToPublish([row]);
      notifyCount += entriesToNotify(batch).length;
      const p = publishPatch(row, NOW);
      row = { ...row, isPublished: true, notifiedAt: "notifiedAt" in p ? p.notifiedAt! : row.notifiedAt };
    };

    doPublish();                                   // đăng lần đầu  → bắn
    contentPatch({ title: "sửa chính tả", body: "", area: "PSX", isImportant: false }); // sửa → không bắn
    row = { ...row, ...unpublishPatch() };          // bỏ đăng
    doPublish();                                   // đăng lại      → KHÔNG bắn

    expect(notifyCount).toBe(1);
  });
});

import { describe, expect, it } from "vitest";

import {
  CHANGELOG_AREAS,
  CHANGELOG_AREA_LABELS,
  DEFAULT_CHANGELOG_AREA,
  isChangelogArea,
} from "@/app/lib/business/changelog/area";
import {
  devSpeakWarning,
  oneLine,
  validateChangelogDraft,
} from "@/app/lib/business/changelog/validate";
import { hasUnread, latestPublishedAt, seenMarkFor } from "@/app/lib/business/changelog/seen";

const draft = (over: Partial<Parameters<typeof validateChangelogDraft>[0]> = {}) => ({
  title: "Có nút Góp ý ở cạnh phải màn hình",
  body: "",
  area: "GENERAL",
  isImportant: false,
  ...over,
});

describe("validateChangelogDraft — cửa vào phải RỘNG", () => {
  // Nguy cơ lớn nhất của tính năng này KHÔNG phải code — là người viết ngừng viết. Mọi ràng
  // buộc phải trả lời được: "nó có làm việc ghi một mục lâu hơn 30 giây không?"

  it("tiêu đề bình thường, nội dung trống → qua", () => {
    expect(validateChangelogDraft(draft())).toBeNull();
  });

  it("ô nội dung để TRỐNG vẫn qua — nhiều thay đổi nói trọn trong một dòng tiêu đề", () => {
    // "Duyên 3D giờ là THÙY DUYÊN" là một mục hoàn chỉnh. Bắt viết thêm đoạn giải thích là
    // buộc người ta bịa chữ — và người bịa chữ hai lần thì lần ba không ghi mục nào cả.
    expect(validateChangelogDraft(draft({ body: "" }))).toBeNull();
  });

  it("tiêu đề quá ngắn thì chặn", () => {
    expect(validateChangelogDraft(draft({ title: "abc" }))).not.toBeNull();
  });

  it("tiêu đề quá dài thì chặn và CHỈ ĐƯỜNG sang ô nội dung", () => {
    const err = validateChangelogDraft(draft({ title: "A".repeat(121) }));
    expect(err).toContain("ô nội dung");
  });

  it("nội dung quá dài thì chặn", () => {
    expect(validateChangelogDraft(draft({ body: "A".repeat(2001) }))).not.toBeNull();
  });

  it("khu vực lạ thì chặn", () => {
    expect(validateChangelogDraft(draft({ area: "MARKETING" }))).not.toBeNull();
  });

  it("mọi khu vực hợp lệ đều qua", () => {
    for (const area of CHANGELOG_AREAS) {
      expect(validateChangelogDraft(draft({ area })), area).toBeNull();
    }
  });
});

describe("devSpeakWarning — CẢNH BÁO, không CHẶN", () => {
  // Cái bẫy lớn nhất của cả tính năng: viết cho lập trình viên chứ không cho người dùng.
  // Changelog không phải git log; biến nó thành git log là biến nó thành nhiễu.

  it.each([
    "fix(psx): mot ban DA HUY dang chan",
    "refactor: tach SidebarBadge",
    "Sửa order-detail-panel.tsx",
    "Thêm migration cho bảng mới",
    "Đổi endpoint promote",
    "Thêm API feedback",
  ])("nhận ra giọng kỹ thuật: %s", (title) => {
    expect(devSpeakWarning(title)).not.toBeNull();
  });

  it.each([
    "Có nút Góp ý ở cạnh phải màn hình",
    "Chuyển xưởng: bản đã huỷ không còn chặn bản đúng",
    "Duyên 3D giờ là THÙY DUYÊN",
    "Thêm phiên bản 4 cho MO 25.32658",
  ])("không cảnh báo oan câu viết theo góc người dùng: %s", (title) => {
    expect(devSpeakWarning(title)).toBeNull();
  });

  it("câu cảnh báo có VÍ DỤ cụ thể, không chỉ nói 'viết lại đi'", () => {
    const w = devSpeakWarning("fix(psx): abc")!;
    expect(w).toContain("ví dụ");
  });

  it("cảnh báo KHÔNG chặn — validate vẫn cho qua", () => {
    // Phép dò chỉ nhìn được hình thức, không nhìn được ý nghĩa, nên nó sẽ bắt oan. Chặn oan một
    // mục đúng tệ hơn nhắc nhẹ một mục sai, vì cái giá là người viết bỏ luôn.
    const d = draft({ title: "fix(psx): chuyện gì đó" });
    expect(devSpeakWarning(d.title)).not.toBeNull();
    expect(validateChangelogDraft(d)).toBeNull();
  });
});

describe("Nhãn khu vực", () => {
  it("mọi khu vực đều có nhãn tiếng Việt không rỗng", () => {
    for (const a of CHANGELOG_AREAS) {
      expect(CHANGELOG_AREA_LABELS[a].length).toBeGreaterThan(0);
    }
  });

  it("nhãn không lộ mã enum ra người dùng", () => {
    for (const a of CHANGELOG_AREAS) {
      expect(CHANGELOG_AREA_LABELS[a]).not.toMatch(/[A-Z_]{4,}/);
    }
  });

  it("mặc định là GENERAL — câu trả lời trung thực nhất, không phải đoán", () => {
    expect(DEFAULT_CHANGELOG_AREA).toBe("GENERAL");
  });

  it.each(["orders", "OTHER", "", null, 0, {}])("%s không phải khu vực hợp lệ", (v) => {
    expect(isChangelogArea(v)).toBe(false);
  });
});

describe("hasUnread — chấm đỏ trên mục 'Có gì mới'", () => {
  it("chưa có mục nào đăng → KHÔNG chấm đỏ", () => {
    // Trạng thái NGÀY ĐẦU. Hiện chấm đỏ ở đây là mời mọi người bấm vào một trang trống.
    expect(hasUnread(null, null)).toBe(false);
    expect(hasUnread(null, "2026-08-01T00:00:00Z")).toBe(false);
  });

  it("chưa từng mở trang mà đã có mục → có chấm đỏ", () => {
    expect(hasUnread("2026-08-20T10:00:00Z", null)).toBe(true);
  });

  it("mục mới hơn mốc đã đọc → có chấm đỏ", () => {
    expect(hasUnread("2026-08-20T10:00:00Z", "2026-08-19T10:00:00Z")).toBe(true);
  });

  it("đã đọc đúng mục mới nhất → hết chấm đỏ", () => {
    expect(hasUnread("2026-08-20T10:00:00Z", "2026-08-20T10:00:00Z")).toBe(false);
  });

  it("mốc đã đọc mới hơn (đồng hồ lệch) → không chấm đỏ, không nổ", () => {
    expect(hasUnread("2026-08-19T10:00:00Z", "2026-08-20T10:00:00Z")).toBe(false);
  });

  it("mốc đã đọc hỏng → coi như CHƯA đọc", () => {
    // Thà hiện chấm đỏ thừa một lần còn hơn im lặng che mất một thay đổi thật.
    expect(hasUnread("2026-08-20T10:00:00Z", "rác")).toBe(true);
  });

  it("mốc mục hỏng → không chấm đỏ (không có gì đáng tin để so)", () => {
    expect(hasUnread("rác", null)).toBe(false);
  });
});

describe("seenMarkFor — ghi mốc của MỤC MỚI NHẤT, không ghi thời điểm hiện tại", () => {
  it("trả về đúng mốc đã được hiển thị", () => {
    // Ghi `new Date()` thì một mục đăng trong CÙNG GIÂY người dùng đang mở trang sẽ bị đánh
    // dấu đã đọc trong khi họ chưa hề thấy nó. Ghi theo mốc họ THẬT SỰ đã thấy thì không có khe.
    expect(seenMarkFor("2026-08-20T10:00:00Z")).toBe("2026-08-20T10:00:00Z");
  });

  it("chưa có mục nào → không ghi gì", () => {
    expect(seenMarkFor(null)).toBeNull();
  });
});

describe("latestPublishedAt", () => {
  it("lấy mốc muộn nhất, không phụ thuộc thứ tự mảng", () => {
    expect(
      latestPublishedAt([
        { publishedAt: "2026-08-01T00:00:00Z" },
        { publishedAt: "2026-08-20T00:00:00Z" },
        { publishedAt: "2026-08-10T00:00:00Z" },
      ]),
    ).toBe("2026-08-20T00:00:00Z");
  });

  it("bỏ qua mục chưa đăng (publishedAt null)", () => {
    expect(latestPublishedAt([{ publishedAt: null }, { publishedAt: "2026-08-01T00:00:00Z" }])).toBe(
      "2026-08-01T00:00:00Z",
    );
  });

  it("mảng rỗng → null", () => {
    expect(latestPublishedAt([])).toBeNull();
  });

  it("toàn nháp → null", () => {
    expect(latestPublishedAt([{ publishedAt: null }, { publishedAt: null }])).toBeNull();
  });
});

describe("oneLine", () => {
  it("gộp xuống dòng", () => {
    expect(oneLine("a\n\nb  c")).toBe("a b c");
  });

  it("cắt kèm dấu …", () => {
    const out = oneLine("x".repeat(200), 20);
    expect(out).toHaveLength(20);
    expect(out.endsWith("…")).toBe(true);
  });
});

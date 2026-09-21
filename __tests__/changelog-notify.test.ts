import { describe, expect, it } from "vitest";

import {
  buildChangelogChatMessage,
  changelogNotifySkipReason,
  type ChangelogNotice,
} from "@/app/lib/business/changelog/chat-message";
import { CHANGELOG_AREAS } from "@/app/lib/business/changelog/area";

const n = (over: Partial<ChangelogNotice> = {}): ChangelogNotice => ({
  title: "Có nút Góp ý ở cạnh phải — báo lỗi kèm ảnh, không phải nhắn Zalo",
  area: "GENERAL",
  isImportant: false,
  ...over,
});

describe("MỘT tin cho CẢ LƯỢT đăng — không phải mỗi mục một tin", () => {
  // Ký hiệu hàm nhận CẢ MẢNG chính là chốt chặn: không có cách nào gọi sai. Nếu nó nhận một
  // mục thì sớm muộn có người gọi trong vòng lặp, và đăng 5 mục là Chat kêu 5 lần.
  //
  // Cùng một webhook đang chở cảnh báo lỗi của tính năng Góp ý. Làm ồn kênh này là mất kênh kia.

  it("5 mục → đúng MỘT payload", () => {
    const msg = buildChangelogChatMessage([n(), n(), n(), n(), n()], null);
    expect(msg).not.toBeNull();
    expect(msg!.text.split("\n").filter((l) => l.startsWith("• ") || l.startsWith("⚠️ "))).toHaveLength(5);
  });

  it("nêu SỐ LƯỢNG khi có nhiều mục", () => {
    expect(buildChangelogChatMessage([n(), n(), n()], null)!.text).toContain("3 thay đổi");
  });

  it("một mục thì không nói '1 thay đổi' — đếm số cho một thứ là thừa", () => {
    expect(buildChangelogChatMessage([n()], null)!.text).not.toContain("1 thay đổi");
  });

  it("mảng rỗng → null, KHÔNG phải một tin trống", () => {
    // Hàm dựng tin trả về tin rỗng là cách gửi ra một tin trống. Trả null thì người gọi không
    // phải tự nhớ kiểm mảng trước khi gửi.
    expect(buildChangelogChatMessage([], "https://x/y")).toBeNull();
  });
});

describe("Nội dung tin", () => {
  it("có nhãn khu vực để người đọc quét nhanh", () => {
    expect(buildChangelogChatMessage([n({ area: "DESIGN_3D" })], null)!.text).toContain("Thiết kế 3D");
  });

  it("mọi khu vực đều ra được nhãn tiếng Việt, không lộ mã enum", () => {
    for (const area of CHANGELOG_AREAS) {
      const t = buildChangelogChatMessage([n({ area })], null)!.text;
      expect(t).not.toContain(area);
    }
  });

  it("mục QUAN TRỌNG lên trước — người ta đọc hai dòng đầu rồi mới quyết định mở", () => {
    const msg = buildChangelogChatMessage(
      [n({ title: "Thay đổi nhỏ" }), n({ title: "Thay đổi lớn", isImportant: true })],
      null,
    )!;
    expect(msg.text.indexOf("Thay đổi lớn")).toBeLessThan(msg.text.indexOf("Thay đổi nhỏ"));
  });

  it("mục quan trọng có dấu riêng", () => {
    expect(buildChangelogChatMessage([n({ isImportant: true })], null)!.text).toContain("⚠️");
  });

  it("có link mở trang khi cấu hình được URL", () => {
    expect(buildChangelogChatMessage([n()], "https://psx.app/dashboard/whats-new")!.text).toContain(
      "/dashboard/whats-new",
    );
  });

  it("KHÔNG có URL vẫn dựng được tin — thiếu link thì tin vẫn tới", () => {
    expect(buildChangelogChatMessage([n()], null)!.text.length).toBeGreaterThan(0);
  });

  it("tiêu đề quá dài bị cắt — URL dài tự xuống dòng làm tin khó đọc", () => {
    const msg = buildChangelogChatMessage([n({ title: "A".repeat(300) })], null)!;
    expect(msg.text).toContain("…");
    expect(msg.text).not.toContain("A".repeat(300));
  });

  it("KHÔNG dùng thẻ cardsV2 — thẻ có thể bị Google từ chối, lời loan báo thì phải ĐẾN", () => {
    expect(buildChangelogChatMessage([n()], null)!.cardsV2).toBeUndefined();
  });
});

describe("changelogNotifySkipReason — im lặng thì phải nói được VÌ SAO", () => {
  it("không có mục nào chưa thông báo → nêu rõ 'đăng lại không bắn lần hai'", () => {
    const r = changelogNotifySkipReason({ noticeCount: 0, webhookConfigured: true });
    expect(r).toContain("lần hai");
  });

  it("chưa cấu hình webhook → nêu ĐÍCH DANH biến môi trường", () => {
    expect(changelogNotifySkipReason({ noticeCount: 2, webhookConfigured: false })).toContain(
      "GOOGLE_CHAT_WEBHOOK_URL",
    );
  });

  it("có mục + đã cấu hình → không có lý do bỏ qua", () => {
    expect(changelogNotifySkipReason({ noticeCount: 2, webhookConfigured: true })).toBeNull();
  });
});

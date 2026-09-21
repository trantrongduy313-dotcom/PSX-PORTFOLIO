import { describe, expect, it } from "vitest";

import { selectKnowledge } from "@/app/lib/business/ai/knowledge";
import {
  NO_SOURCE_TOKEN,
  SOURCE_LINE_PREFIX,
  buildInstructionsBlock,
  buildKnowledgeBlock,
  buildSystemBlocks,
} from "@/app/lib/business/ai/prompt";
import type { KnowledgeTopic } from "@/app/lib/business/ai/topic";

const TOPICS: KnowledgeTopic[] = [
  { id: "chung", title: "Chung", roles: [], lastReviewed: "2026-08", body: "Nội dung chung." },
  { id: "chi-3d", title: "3D", roles: ["design3d"], lastReviewed: "2026-08", body: "Nội dung 3D." },
];

const knowledge = (role: "employee" | "manager" | "design3d" = "manager") =>
  selectKnowledge(TOPICS, role);

describe("Chỉ thị mang đủ CÁC LUẬT BẮT BUỘC", () => {
  const text = buildInstructionsBlock({ userRole: "SALES" });

  it("cấm dùng kiến thức ngoài bộ nội dung", () => {
    // 🔴 LUẬT SỐ 1, và là luật cả tính năng dựa vào. Mô hình rất MUỐN GIÚP: hỏi một điều không
    // có trong bộ nội dung, nó sẽ lấp bằng kiến thức chung về ERP — nghe hợp lý, không mô tả hệ
    // thống này. Đó là chế độ hỏng tệ hơn cả việc không trả lời được.
    expect(text).toMatch(/CHỈ trả lời bằng nội dung trong <kien-thuc>/);
    expect(text).toContain("Không dùng kiến thức chung");
  });

  it("dạy cách NÓI KHÔNG BIẾT", () => {
    expect(text).toContain("NÓI THẲNG là chưa có");
  });

  it("nói rõ KHÔNG đọc được dữ liệu thật", () => {
    // Không nói thì gặp câu "đơn 26.12345 của tôi sao chưa xong" nó sẽ dựng ra một câu trả lời
    // trông như đã tra cơ sở dữ liệu.
    expect(text).toContain("KHÔNG xem được dữ liệu thật");
  });

  it("khai hợp đồng dòng dẫn nguồn, cả dạng KHÔNG", () => {
    expect(text).toContain(SOURCE_LINE_PREFIX);
    expect(text).toContain(NO_SOURCE_TOKEN);
  });

  it("cấm tự đặt id mới", () => {
    expect(text).toContain("Không tự đặt id mới");
  });
});

describe("Chỉ thị mang bối cảnh người hỏi", () => {
  it("dịch vai trò sang nhãn tiếng Việt", () => {
    expect(buildInstructionsBlock({ userRole: "DESIGN_3D" })).toContain("Nhân viên Thiết kế 3D");
  });

  it("kèm trang đang mở khi biết", () => {
    expect(buildInstructionsBlock({ userRole: "ADMIN", pageUrl: "/dashboard/design-3d" })).toContain(
      "/dashboard/design-3d",
    );
  });

  it("không có trang thì KHÔNG để lại dòng trống lơ lửng", () => {
    expect(buildInstructionsBlock({ userRole: "ADMIN", pageUrl: null })).not.toContain(
      "Họ đang mở màn hình:",
    );
  });
});

describe("Khối kiến thức", () => {
  it("bọc trong thẻ <kien-thuc>", () => {
    const block = buildKnowledgeBlock(knowledge());
    expect(block.startsWith("<kien-thuc>")).toBe(true);
    expect(block.trimEnd().endsWith("</kien-thuc>")).toBe(true);
  });

  it("bộ rỗng vẫn có thẻ, và NÓI RA là rỗng", () => {
    // Gửi một khối trống không lời giải thích là mời mô hình tự lấp bằng kiến thức chung.
    const block = buildKnowledgeBlock({ topics: [], block: "", allowedIds: [] });
    expect(block).toContain("chưa có mục nào");
  });
});

describe("🎯 Chia khối để CACHE — mô hình chi phí của cả tính năng", () => {
  const blocks = buildSystemBlocks({ knowledge: knowledge(), userRole: "ADMIN", pageUrl: "/dashboard" });

  it("có đúng hai khối", () => {
    expect(blocks).toHaveLength(2);
  });

  it("khối được cache đứng TRƯỚC", () => {
    // Cache chỉ ăn theo TIỀN TỐ: phần được cache phải nằm trước. Đảo lại là cache không bao giờ
    // khớp, và không có biểu hiện nào ngoài hoá đơn.
    expect(blocks[0].cache).toBe(true);
    expect(blocks[1].cache).toBe(false);
  });

  it("khối được cache là khối kiến thức", () => {
    expect(blocks[0].text).toContain("<kien-thuc>");
  });

  it("🔴 khối được cache KHÔNG chứa gì thay đổi theo người hỏi", () => {
    // Đây là bất biến giữ cho cache hoạt động. Một ký tự khác nhau giữa hai người là cache
    // trượt với cả hai — và lỗi này im lặng hoàn toàn.
    const a = buildSystemBlocks({ knowledge: knowledge(), userRole: "ADMIN", pageUrl: "/dashboard/orders" });
    const b = buildSystemBlocks({ knowledge: knowledge(), userRole: "SALES", pageUrl: "/dashboard/alerts" });
    expect(a[0].text).toBe(b[0].text);
    // Và khối sau thì PHẢI khác — nếu giống thì bối cảnh người hỏi đã bị mất hẳn.
    expect(a[1].text).not.toBe(b[1].text);
  });

  it("khối được cache đổi theo VAI TRÒ HƯỚNG DẪN, vì bộ nội dung đổi theo đó", () => {
    // Đây là đánh đổi có chủ ý: mỗi bộ vai trò là một khoá cache riêng. Ba bộ = ba lần nạp
    // cache, không phải một. Vẫn đúng, vì nội dung thật sự khác nhau.
    expect(buildSystemBlocks({ knowledge: knowledge("design3d"), userRole: "DESIGN_3D" })[0].text).not.toBe(
      buildSystemBlocks({ knowledge: knowledge("employee"), userRole: "SALES" })[0].text,
    );
  });

  it("chỉ thị đặt SAU kiến thức nên nó nằm gần câu hỏi", () => {
    // Ngoài chuyện cache, thứ tự này còn tốt hơn về tuân thủ: chỉ thị đặt gần câu hỏi được giữ
    // chặt hơn là đặt cách nó vài chục nghìn token.
    expect(blocks[1].text).toContain("LUẬT BẮT BUỘC");
  });
});

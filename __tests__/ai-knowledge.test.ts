import { describe, expect, it } from "vitest";

import {
  estimateKnowledgeTokens,
  findTopic,
  formatKnowledgeBlock,
  knowledgeChecksum,
  knowledgeTooLarge,
  selectKnowledge,
} from "@/app/lib/business/ai/knowledge";
import { KnowledgeParseError, parseKnowledgeTopic, topicAppliesTo } from "@/app/lib/business/ai/topic";
import type { KnowledgeTopic } from "@/app/lib/business/ai/topic";

const topic = (over: Partial<KnowledgeTopic> = {}): KnowledgeTopic => ({
  id: "a",
  title: "Mục A",
  roles: [],
  lastReviewed: "2026-08",
  body: "Nội dung A",
  ...over,
});

describe("parseKnowledgeTopic", () => {
  it("đọc được một file đủ khai báo", () => {
    const t = parseKnowledgeTopic(
      ["id: luong-don", "title: Luồng đơn", "roles: manager, employee", "lastReviewed: 2026-08", "---", "Thân bài."].join("\n"),
      "x.md",
    );
    expect(t).toEqual({
      id: "luong-don",
      title: "Luồng đơn",
      roles: ["manager", "employee"],
      lastReviewed: "2026-08",
      body: "Thân bài.",
    });
  });

  it("vắng roles = MỌI vai trò", () => {
    // Mặc định phải là "ai cũng đọc được": quên khai roles thì hậu quả là một mục đến với nhiều
    // người hơn cần thiết. Mặc định ngược lại tạo ra một mục VÔ HÌNH, và đó là loại lỗi không
    // bao giờ tự lộ ra.
    const t = parseKnowledgeTopic(["id: a", "title: A", "lastReviewed: 2026-08", "---", "x"].join("\n"), "x.md");
    expect(t.roles).toEqual([]);
    expect(topicAppliesTo(t, "employee")).toBe(true);
    expect(topicAppliesTo(t, "design3d")).toBe(true);
    expect(topicAppliesTo(t, "manager")).toBe(true);
  });

  it("đọc được file soạn trên Windows (CRLF)", () => {
    // Dự án chạy trên Windows. Không bỏ `\r` thì mọi giá trị mang theo một ký tự vô hình và
    // lastReviewed trượt regex với một thông báo lỗi hoàn toàn vô nghĩa.
    const t = parseKnowledgeTopic("id: a\r\ntitle: A\r\nlastReviewed: 2026-08\r\n---\r\nThân\r\n", "x.md");
    expect(t.lastReviewed).toBe("2026-08");
    expect(t.body).toBe("Thân");
  });

  it.each([
    ["thiếu dấu ---", ["id: a", "title: A", "lastReviewed: 2026-08", "Thân"].join("\n")],
    ["thiếu id", ["title: A", "lastReviewed: 2026-08", "---", "x"].join("\n")],
    ["thiếu title", ["id: a", "lastReviewed: 2026-08", "---", "x"].join("\n")],
    ["thiếu lastReviewed", ["id: a", "title: A", "---", "x"].join("\n")],
    ["thân rỗng", ["id: a", "title: A", "lastReviewed: 2026-08", "---", "   "].join("\n")],
    ["id có chữ hoa", ["id: Abc", "title: A", "lastReviewed: 2026-08", "---", "x"].join("\n")],
    ["id có dấu cách", ["id: a b", "title: A", "lastReviewed: 2026-08", "---", "x"].join("\n")],
    ["mốc sai dạng", ["id: a", "title: A", "lastReviewed: 08-2026", "---", "x"].join("\n")],
    ["tháng 13", ["id: a", "title: A", "lastReviewed: 2026-13", "---", "x"].join("\n")],
    ["roles lạ", ["id: a", "title: A", "roles: sales", "lastReviewed: 2026-08", "---", "x"].join("\n")],
  ])("NÉM LỖI khi %s", (_label, raw) => {
    // Ném chứ không bỏ qua mục sai: một mục bị lặng lẽ loại khỏi bộ là trợ lý mất kiến thức mà
    // không ai biết, và biểu hiện duy nhất là nó bắt đầu nói "chưa có trong nội dung" cho một
    // câu bạn nhớ rõ là đã viết.
    expect(() => parseKnowledgeTopic(raw, "x.md")).toThrow(KnowledgeParseError);
  });

  it("thông báo lỗi có tên file", () => {
    // Không có tên file thì người viết nội dung nhận một câu "thiếu id" và phải tự mò trong cả
    // thư mục.
    expect(() => parseKnowledgeTopic("---\nx", "03-thiet-ke-3d.md")).toThrow(/03-thiet-ke-3d\.md/);
  });
});

describe("selectKnowledge — lọc theo vai trò", () => {
  const topics = [
    topic({ id: "chung", roles: [] }),
    topic({ id: "chi-3d", roles: ["design3d"] }),
    topic({ id: "chi-ql", roles: ["manager"] }),
  ];

  it("nhân viên 3D chỉ nhận mục chung + mục của mình", () => {
    const sel = selectKnowledge(topics, "design3d");
    expect(sel.allowedIds).toEqual(["chung", "chi-3d"]);
  });

  it("employee không nhận mục của vai trò khác", () => {
    expect(selectKnowledge(topics, "employee").allowedIds).toEqual(["chung"]);
  });

  it("allowedIds khớp đúng với các mục đã gói vào khối", () => {
    // Đây là bất biến giữ cho answer.ts loại được id bịa: nếu allowedIds rộng hơn khối thật thì
    // một id không hề được gửi đi vẫn được coi là hợp lệ.
    const sel = selectKnowledge(topics, "manager");
    for (const id of sel.allowedIds) expect(sel.block).toContain(`id="${id}"`);
    expect(sel.block).not.toContain('id="chi-3d"');
  });
});

describe("formatKnowledgeBlock", () => {
  it("mỗi mục có id, tiêu đề và mốc rà soát", () => {
    // Không có nhãn id thì mô hình dẫn nguồn bằng cách mô tả lại tiêu đề theo cách riêng, và
    // câu trả lời mất khả năng đối chiếu tự động — mất luôn nút "Mở mục này".
    const block = formatKnowledgeBlock([topic({ id: "x", title: "Tiêu đề X", lastReviewed: "2026-07" })]);
    expect(block).toContain('id="x"');
    expect(block).toContain('tieu-de="Tiêu đề X"');
    expect(block).toContain('ra-soat="2026-07"');
    expect(block).toContain("Nội dung A");
  });

  it("giữ đúng thứ tự đầu vào", () => {
    // Thứ tự phải ổn định: khối này được cache theo TIỀN TỐ CHÍNH XÁC của prompt, nên đảo thứ
    // tự giữa hai lượt hỏi là mất cache — trả tiền đầy đủ cho mọi câu, không có biểu hiện nào
    // ngoài hoá đơn.
    const block = formatKnowledgeBlock([topic({ id: "a" }), topic({ id: "b" })]);
    expect(block.indexOf('id="a"')).toBeLessThan(block.indexOf('id="b"'));
  });

  it("không mục nào thì trả chuỗi rỗng", () => {
    expect(formatKnowledgeBlock([])).toBe("");
  });
});

describe("findTopic", () => {
  it("tra được và trả null khi không có", () => {
    const topics = [topic({ id: "a" }), topic({ id: "b" })];
    expect(findTopic(topics, "b")?.id).toBe("b");
    expect(findTopic(topics, "khong-co")).toBeNull();
  });
});

describe("ước lượng token", () => {
  it("nghiêng về phía CAO hơn thực tế", () => {
    // Chia 3 chứ không chia 4: tiếng Việt có dấu nên tốn token hơn tiếng Anh cùng độ dài. Một
    // ngưỡng cảnh báo báo sớm thì vô hại, báo muộn thì vô dụng.
    expect(estimateKnowledgeTokens("x".repeat(300))).toBe(100);
  });

  it("bộ nội dung hiện tại còn xa ngưỡng cảnh báo", () => {
    expect(knowledgeTooLarge("x".repeat(1000))).toBe(false);
  });

  it("vượt ngưỡng thì báo", () => {
    expect(knowledgeTooLarge("x".repeat(400_000))).toBe(true);
  });
});

describe("knowledgeChecksum", () => {
  it("cùng nội dung → cùng giá trị, bất kể thứ tự thư mục", () => {
    // Nếu phụ thuộc thứ tự thì cùng một nội dung ra hai giá trị trên hai máy, và test lệch vì
    // một lý do không liên quan gì đến nội dung.
    const a = [{ file: "b.md", raw: "2" }, { file: "a.md", raw: "1" }];
    const b = [{ file: "a.md", raw: "1" }, { file: "b.md", raw: "2" }];
    expect(knowledgeChecksum(a)).toBe(knowledgeChecksum(b));
  });

  it("đổi nội dung → đổi giá trị", () => {
    expect(knowledgeChecksum([{ file: "a.md", raw: "1" }])).not.toBe(
      knowledgeChecksum([{ file: "a.md", raw: "2" }]),
    );
  });

  it("ĐỔI TÊN FILE cũng đổi giá trị", () => {
    // Đổi tên là một thay đổi thật (thứ tự đọc đổi theo, và thứ tự quyết định cache).
    expect(knowledgeChecksum([{ file: "a.md", raw: "1" }])).not.toBe(
      knowledgeChecksum([{ file: "z.md", raw: "1" }]),
    );
  });

  it("CRLF và LF cho cùng một giá trị", () => {
    // Nếu không chuẩn hoá thì cùng một file được checkout trên Windows và trên CI ra hai
    // checksum, và test đỏ ở đúng chỗ không ai sửa được.
    expect(knowledgeChecksum([{ file: "a.md", raw: "x\r\ny" }])).toBe(
      knowledgeChecksum([{ file: "a.md", raw: "x\ny" }]),
    );
  });
});

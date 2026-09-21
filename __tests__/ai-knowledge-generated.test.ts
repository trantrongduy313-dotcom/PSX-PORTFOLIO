import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { knowledgeChecksum } from "@/app/lib/business/ai/knowledge";
import { parseKnowledgeTopic } from "@/app/lib/business/ai/topic";
import { KNOWLEDGE_CHECKSUM, KNOWLEDGE_TOPICS } from "@/app/lib/ai/knowledge/generated";

import { buildGlossaryTopic, GLOSSARY_TOPIC_ID } from "@/app/lib/business/ai/glossary";
import { buildGuideTopics, GUIDE_TOPIC_PREFIX } from "@/app/lib/business/ai/guide-topics";
import { STAGE_ORDER } from "@/app/lib/business/production-stage";
// ─── Chốt cửa hở giữa .md và generated.ts ────────────────────────────────────
//
// 🔴 FILE TEST NÀY TỒN TẠI ĐỂ CHỐT MỘT CHỖ HỞ CÓ THẬT, KHÔNG PHẢI ĐỂ PHÒNG XA.
//
// Bộ nội dung được VIẾT bằng `.md` nhưng lúc chạy thì ĐỌC từ `generated.ts` (lý do ở
// scripts/build-knowledge.ts: đọc file bằng `fs` trong một route trên Vercel là chỗ dễ vỡ, và
// nó vỡ trên production chứ không vỡ lúc build).
//
// Đó là HAI NƠI GIỮ CÙNG MỘT SỰ THẬT. Sửa `.md` mà quên `npm run kb:build` thì trợ lý IM LẶNG
// đọc bản cũ, và biểu hiện duy nhất là nó trả lời theo nội dung mà bạn nhớ rõ là đã sửa rồi.
// Không có lỗi nào, không có log nào.
//
// Test này đổi lỗi im lặng đó thành một lỗi lên tiếng: đọc lại thư mục `.md`, băm, và so với
// con số đã sinh ra.

const KNOWLEDGE_DIR = join(process.cwd(), "app", "lib", "ai", "knowledge");

function readSources() {
  const files = readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort();
  return files.map((file) => ({ file, raw: readFileSync(join(KNOWLEDGE_DIR, file), "utf8") }));
}

describe("BỘ DÒ CÒN CHẠY", () => {
  it("vẫn đọc được file .md và vẫn có mục trong generated.ts", () => {
    // Không có assert này thì mọi test dưới đây vẫn xanh khi thư mục rỗng hoặc export bị đổi
    // tên — một test chạy trên mảng rỗng luôn thành công, và im lặng đúng lúc cần lên tiếng.
    expect(readSources().length).toBeGreaterThan(0);
    expect(KNOWLEDGE_TOPICS.length).toBeGreaterThan(0);
  });
});

describe("🔴 generated.ts phải khớp với các file .md", () => {
  it("checksum khớp — nếu đỏ, hãy chạy: npm run kb:build", () => {
    expect(
      knowledgeChecksum(readSources()),
      "generated.ts đang CŨ so với các file .md. Chạy `npm run kb:build` rồi commit lại.",
    ).toBe(KNOWLEDGE_CHECKSUM);
  });

  // ⚠️ CHỈ SO PHẦN CÓ NGUỒN .md. generated.ts nay còn chứa một mục SINH TỪ CODE (bảng thuật ngữ
  // các khâu) — nó không có file .md nào để đối chiếu, và nó có bộ dò riêng ở cụm dưới. Không
  // lọc ở đây thì hai test này đỏ vì một lý do KHÔNG PHẢI lỗi.
  const fromMarkdown = () =>
    KNOWLEDGE_TOPICS.filter(
      (t) => t.id !== GLOSSARY_TOPIC_ID && !t.id.startsWith(`${GUIDE_TOPIC_PREFIX}-`),
    );

  it("số mục khớp", () => {
    expect(fromMarkdown()).toHaveLength(readSources().length);
  });

  it("từng mục khớp đúng nội dung đã phân tích từ .md", () => {
    // Checksum bắt được "có gì đổi", nhưng không bắt được lỗi ở chính bước sinh file (ví dụ một
    // trường bị bỏ sót khi ghi ra). So từng mục thì bắt được cả hai.
    const parsed = readSources().map(({ file, raw }) => parseKnowledgeTopic(raw, file));
    expect(fromMarkdown().map((t) => ({ ...t, roles: [...t.roles] }))).toEqual(
      parsed.map((t) => ({ ...t, roles: [...t.roles] })),
    );
  });

  // THỨ TỰ PHẢI TIỀN ĐỊNH: khối kiến thức được cache theo tiền tố CHÍNH XÁC, nên thứ tự đảo
  // giữa hai lần build là mất cache của mọi người dùng — một khoản chi phí không có biểu hiện
  // nào ngoài hoá đơn.
  //
  // Ba tầng, cố định: [ các file .md ] → [ bảng thuật ngữ ] → [ các chương Hướng dẫn ].
  // Thêm file .md mới (04-, 05-…) chỉ nối dài tầng đầu, không đẩy hai tầng sau đi chỗ khác.
  it("thứ tự ba tầng cố định: .md → thuật ngữ → chương Hướng dẫn", () => {
    const ids = KNOWLEDGE_TOPICS.map((t) => t.id);
    const iGlossary = ids.indexOf(GLOSSARY_TOPIC_ID);
    const guideIdx = ids
      .map((id, i) => (id.startsWith(`${GUIDE_TOPIC_PREFIX}-`) ? i : -1))
      .filter((i) => i >= 0);

    expect(iGlossary).toBeGreaterThan(-1);
    expect(guideIdx.length).toBeGreaterThan(0);
    // bảng thuật ngữ đứng sau MỌI mục .md
    expect(iGlossary).toBe(fromMarkdown().length);
    // các chương Hướng dẫn đứng sau bảng thuật ngữ, và LIỀN NHAU tới hết danh sách
    expect(guideIdx[0]).toBe(iGlossary + 1);
    expect(guideIdx[guideIdx.length - 1]).toBe(ids.length - 1);
    expect(guideIdx.length).toBe(guideIdx[guideIdx.length - 1] - guideIdx[0] + 1);
  });
});

describe("Bộ nội dung tự nó phải hợp lệ", () => {
  it("id không trùng", () => {
    // id trùng nghĩa là hai mục cùng nhãn dẫn nguồn: câu trả lời dẫn tới một mục KHÁC mục nó
    // thật sự dùng — sai một cách rất khó nhận ra.
    const ids = KNOWLEDGE_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mọi mục đều khai mốc rà soát đúng dạng", () => {
    for (const t of KNOWLEDGE_TOPICS) {
      expect(t.lastReviewed, `mục ${t.id}`).toMatch(/^20\d{2}-(0[1-9]|1[0-2])$/);
    }
  });

  it("không mục nào ghi mốc ở TƯƠNG LAI", () => {
    // Mốc tương lai là dấu hiệu copy-paste một giá trị mẫu, và nó làm người đọc TIN vào một mục
    // chưa ai rà — tệ hơn hẳn một mốc cũ trung thực.
    const nowYm = new Date().toISOString().slice(0, 7);
    for (const t of KNOWLEDGE_TOPICS) {
      expect(t.lastReviewed <= nowYm, `mục ${t.id}: ${t.lastReviewed} ở tương lai`).toBe(true);
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // MỤC SINH TỪ CODE — checksum KHÔNG phủ được nó
  //
  // 🔴 KHOẢNG TRỐNG THẬT: `KNOWLEDGE_CHECKSUM` chỉ đo các file .md. Bảng thuật ngữ các khâu
  // được sinh từ STAGE_ORDER / STAGE_LABEL / STAGE_MEANING (business/ai/glossary.ts) — sửa một
  // trong ba thứ đó rồi QUÊN chạy `npm run kb:build` thì checksum KHÔNG đổi, test .md vẫn xanh,
  // và trợ lý im lặng đọc bảng cũ.
  //
  // Nên mục này có bộ dò RIÊNG, và nó so TRỰC TIẾP chứ không so dấu vân tay: dựng lại mục từ
  // code rồi bắt nó bằng đúng mục đang nằm trong generated.ts.
  // ═════════════════════════════════════════════════════════════════════════
  describe("bảng thuật ngữ sinh từ code", () => {
    const generated = KNOWLEDGE_TOPICS.find((t) => t.id === GLOSSARY_TOPIC_ID);

    it("có mặt trong generated.ts", () => {
      expect(generated, `thiếu mục "${GLOSSARY_TOPIC_ID}" — chạy npm run kb:build`).toBeDefined();
    });

    it("🔴 KHỚP CHÍNH XÁC với buildGlossaryTopic() — quên kb:build là ĐỎ", () => {
      expect(generated).toEqual(buildGlossaryTopic());
    });

    // Đây là lý do bảng này tồn tại: danh sách khâu là DỮ LIỆU PHÁI SINH, không phải bản sao.
    // Thêm một khâu vào STAGE_ORDER thì nó phải tự có mặt.
    it("phủ ĐỦ mọi mã khâu trong STAGE_ORDER", () => {
      for (const code of STAGE_ORDER) {
        expect(generated?.body.includes(code), `thiếu mã khâu ${code}`).toBe(true);
      }
    });

    // Câu hỏi thật đã làm lộ ra khoảng trống này: "Chờ ĐX NL là gì của cột công đoạn" từng nhận
    // về "nội dung hướng dẫn chưa nói về việc này".
    it("trả lời được đúng câu đã làm lộ ra khoảng trống", () => {
      expect(generated?.body).toContain("Chờ ĐX NL");
      expect(generated?.body).toContain("đề xuất nguyên liệu");
    });

    it("đọc được với MỌI vai trò", () => {
      expect(generated?.roles).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CHƯƠNG HƯỚNG DẪN → MỤC KIẾN THỨC
  //
  // 🔴 BỘ DÒ CHO ĐÚNG CHỖ `KNOWLEDGE_CHECKSUM` KHÔNG VỚI TỚI. Checksum chỉ băm các file `.md`.
  // Sửa một chương trong guide/content.tsx rồi quên `npm run kb:build` thì checksum KHÔNG đổi,
  // các test `.md` vẫn xanh, và trợ lý IM LẶNG dạy bản cũ — biểu hiện duy nhất là nó trả lời
  // theo nội dung bạn tưởng mình đã sửa.
  //
  // Nên ở đây so TRỰC TIẾP với buildGuideTopics(), không so qua dấu vân tay.
  // ═══════════════════════════════════════════════════════════════════════
  describe("mục sinh từ chương Hướng dẫn", () => {
    const fromGuide = () => KNOWLEDGE_TOPICS.filter((t) => t.id.startsWith(`${GUIDE_TOPIC_PREFIX}-`));

    it("🔴 KHỚP CHÍNH XÁC với buildGuideTopics() — quên kb:build là ĐỎ", () => {
      expect(fromGuide().map((t) => ({ ...t, roles: [...t.roles] }))).toEqual(
        buildGuideTopics().map((t) => ({ ...t, roles: [...t.roles] })),
      );
    });

    it("mỗi vai trò nhận đúng bộ chương CỦA MÌNH, không phải cả 23 chương", () => {
      // Lọc theo vai vừa đúng hơn (không trả lời về màn họ không vào được) vừa rẻ hơn.
      for (const role of ["employee", "manager", "design3d"] as const) {
        const mine = fromGuide().filter((t) => t.roles.includes(role));
        expect(mine.length, role).toBeGreaterThan(0);
        for (const t of mine) expect(t.roles, `${t.id}`).toEqual([role]);
      }
    });

    it("KHÔNG mục nào rỗng — một chương rút ra rỗng là chương vô hình với trợ lý", () => {
      for (const t of fromGuide()) expect(t.body.trim().length, t.id).toBeGreaterThan(80);
    });

    // 🔴 CHÍNH CÂU HỎI ĐÃ LÀM LỘ RA LỖI KIẾN TRÚC NÀY: "làm cách nào để tôi báo cáo đơn hàng
    // dự kiến hoàn thành của cửa hàng CH1". Trợ lý trả lời "chưa nói về việc này" trong khi
    // Hướng dẫn nói rất rõ ở ba chương — nó chỉ không đọc được chúng.
    it("trả lời được câu đã làm lộ ra lỗi: lọc theo cửa hàng, theo hạn, rồi in báo cáo", () => {
      const body = (slug: string) =>
        fromGuide().find((t) => t.id === `${GUIDE_TOPIC_PREFIX}-employee-${slug}`)?.body ?? "";

      expect(body("man-don-hang")).toContain("Tất cả");        // chọn / bỏ chọn cửa hàng
      expect(body("tim-kiem-loc")).toContain("Quá hạn");       // lọc theo hạn hoàn thành
      expect(body("in-bao-cao")).toContain("Xem / Tải PDF");   // xuất báo cáo
    });

    // ⚠️ HÌNH MINH HOẠ PHẢI BỊ BỎ QUA. Chúng render ra hàng trăm thẻ với chữ rời rạc ("CH1",
    // "Tất cả", "18KY", "26.12345_1"…) — vừa là rác cho mô hình đọc, vừa tốn token thật.
    //
    // Cơ chế bỏ qua dựa trên việc mockup KHÔNG NHẬN children. Đó là một TÍNH CHẤT của cách viết
    // hiện tại, không phải một hợp đồng — nên nó cần test này canh, để mai có người thêm
    // children vào một mockup thì đỏ ngay chứ không âm thầm nhồi rác vào bộ nội dung.
    it("KHÔNG rò chữ từ hình minh hoạ vào nội dung", () => {
      const all = fromGuide().map((t) => t.body).join("\n");
      // ⚠️ MỐC PHẢI CHỈ CÓ TRONG HÌNH. Bản đầu của test này dùng "26.12345" và nó đỏ — vì mã MO
      // ví dụ đó xuất hiện HỢP LỆ trong lời văn của chương. Một mốc vừa có trong hình vừa có
      // trong văn thì test không nói được điều gì.
      for (const rac of ["app.kimhoan.vn", "Nhẫn kiềng V18K", "18KY", "Bông tai", "Đang TK"]) {
        expect(all, `rò từ mockup: ${rac}`).not.toContain(rac);
      }
    });

    it("id bền theo slug, KHÔNG theo số thứ tự chương", () => {
      // Hôm nay một chương được chèn vào giữa bộ Sales và mọi chương sau tụt một bậc. Nếu nhãn
      // dẫn nguồn là số thì những dòng ai_question_logs cũ trỏ sang một chương KHÁC — im lặng.
      for (const t of fromGuide()) expect(t.id, t.title).not.toMatch(/-\d+$/);
    });
  });

  it("mọi vai trò đều có ít nhất một mục để đọc", () => {
    // Một vai trò không có mục nào là một người bấm "Hỏi trợ lý" rồi nhận về một lời từ chối —
    // route trả 503 đúng, nhưng đó là một tính năng chết với riêng họ.
    for (const role of ["employee", "manager", "design3d"] as const) {
      const usable = KNOWLEDGE_TOPICS.filter((t) => t.roles.length === 0 || t.roles.includes(role));
      expect(usable.length, `vai trò ${role} không có mục nào`).toBeGreaterThan(0);
    }
  });
});

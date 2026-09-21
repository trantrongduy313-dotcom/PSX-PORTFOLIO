import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { knowledgeChecksum } from "../app/lib/business/ai/knowledge";
import { KnowledgeParseError, parseKnowledgeTopic } from "../app/lib/business/ai/topic";
import { buildGlossaryTopic } from "../app/lib/business/ai/glossary";
import { buildGuideTopics } from "../app/lib/business/ai/guide-topics";

// ─── Biên dịch bộ nội dung .md → generated.ts ────────────────────────────────
//
// Chạy: npm run kb:build
//
// ⚠️ VÌ SAO CẦN BƯỚC NÀY THAY VÌ ĐỌC .md LÚC CHẠY: đọc file bằng `fs` trong một route của
// Next trên Vercel là chỗ dễ vỡ — bundler không nhất thiết mang file `.md` theo vào hàm
// serverless, và khi vỡ thì nó vỡ TRÊN PRODUCTION chứ không vỡ lúc build. Biểu hiện là trợ lý
// đột nhiên không biết gì cả, với một lỗi đọc file ở tầng dưới cùng.
//
// Sinh ra một file `.ts` rồi `import` thì lúc chạy không đụng tới đĩa. Không lo bundler, không
// lo môi trường, và nội dung được kiểm kiểu ngay khi build.
//
// ⚠️ ĐÁNH ĐỔI, VÀ NÓ ĐƯỢC CHỐT LẠI: `.md` + `generated.ts` là HAI NƠI giữ cùng một sự thật.
// Sửa `.md` mà quên chạy lại script thì trợ lý IM LẶNG đọc bản cũ. Nên checksum được ghi vào
// file sinh ra, và __tests__/ai-knowledge-generated.test.ts đọc lại thư mục `.md` để so —
// quên chạy lại thì TEST ĐỎ, không phải người dùng phát hiện hộ.

const KNOWLEDGE_DIR = join(process.cwd(), "app", "lib", "ai", "knowledge");
const OUT_FILE = join(KNOWLEDGE_DIR, "generated.ts");

function main() {
  // Sắp theo tên file: thứ tự phải TIỀN ĐỊNH được. Khối kiến thức được cache ở phía nhà cung
  // cấp mô hình và cache khớp theo tiền tố chính xác — thứ tự đảo giữa hai lần build là mất
  // cache của mọi người dùng, một khoản chi phí không có biểu hiện nào ngoài hoá đơn.
  const files = readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort();

  if (files.length === 0) {
    console.error("✗ Không tìm thấy file .md nào trong", KNOWLEDGE_DIR);
    process.exit(1);
  }

  const sources = files.map((file) => ({ file, raw: readFileSync(join(KNOWLEDGE_DIR, file), "utf8") }));

  const topics = [];
  const seenIds = new Map<string, string>();
  for (const { file, raw } of sources) {
    try {
      const topic = parseKnowledgeTopic(raw, file);

      // id trùng: HAI mục cùng nhãn dẫn nguồn. Giao diện sẽ mở mục đầu tiên tìm thấy, nên câu
      // trả lời dẫn tới một mục KHÁC mục nó thật sự dùng — sai một cách rất khó nhận ra.
      const before = seenIds.get(topic.id);
      if (before) {
        console.error(`✗ id "${topic.id}" bị dùng ở cả ${before} và ${file}`);
        process.exit(1);
      }
      seenIds.set(topic.id, file);

      topics.push({ file, topic });
    } catch (err) {
      if (err instanceof KnowledgeParseError) {
        console.error("✗", err.message);
        process.exit(1);
      }
      throw err;
    }
  }

  // ─── MỤC SINH TỪ CODE, thêm SAU tất cả file .md ────────────────────────────
  //
  // Bảng thuật ngữ các khâu sản xuất: DANH SÁCH lấy từ STAGE_ORDER/STAGE_LABEL (nguồn duy nhất
  // trong code), NGHĨA do người viết trong business/ai/glossary.ts. Chép danh sách đó sang một
  // file .md là tạo nơi thứ hai — thêm khâu trong code thì trợ lý vẫn dạy danh sách cũ, im lặng.
  //
  // ⚠️ ĐẶT CUỐI, VỊ TRÍ CỐ ĐỊNH. Khối kiến thức được cache theo TIỀN TỐ CHÍNH XÁC, nên thứ tự
  // phải tiền định. Cuối danh sách thì thêm file .md mới (04-, 05-…) cũng không xê dịch nó.
  //
  // ⚠️ VÀ NÓ KHÔNG NẰM TRONG `checksum`: checksum chỉ đo các file .md. Đổi STAGE_MEANING mà quên
  // chạy lại kb:build thì checksum KHÔNG đổi — nên bộ dò cho mục này là một test riêng, so trực
  // tiếp mục trong generated.ts với buildGlossaryTopic(). Xem ai-knowledge-generated.test.ts.
  const glossary = buildGlossaryTopic();
  const beforeGlossary = seenIds.get(glossary.id);
  if (beforeGlossary) {
    console.error(`✗ id "${glossary.id}" đã có ở ${beforeGlossary} — mục sinh tự động bị trùng`);
    process.exit(1);
  }
  topics.push({ file: "(sinh từ business/ai/glossary.ts)", topic: glossary });

  // ─── CHƯƠNG HƯỚNG DẪN, thêm SAU CÙNG ───────────────────────────────────────
  //
  // 🔴 VÌ SAO: trợ lý trả lời "chưa nói về việc này" cho những câu mà Hướng dẫn nói rất rõ —
  // vì nó chỉ đọc thư mục .md này, còn 23 chương Hướng dẫn nằm ở app/lib/guide/content.tsx và
  // nó KHÔNG thấy một chữ nào. Mọi câu "làm sao để…" vì thế thất bại theo thiết kế.
  //
  // Rút ra ở đây thay vì chép sang .md: chép là tạo nơi thứ hai cho cùng một sự thật, và bản
  // lệch sẽ là bản ít người đọc hơn. Sửa chương là trợ lý biết ngay ở lần build kế tiếp.
  //
  // ⚠️ CŨNG KHÔNG NẰM TRONG `checksum` (chỉ đo .md) — cùng lỗ hổng với bảng thuật ngữ, và cùng
  // cách bịt: test so trực tiếp generated.ts với buildGuideTopics().
  for (const topic of buildGuideTopics()) {
    const before = seenIds.get(topic.id);
    if (before) {
      console.error(`✗ id "${topic.id}" đã có ở ${before} — chương Hướng dẫn bị trùng id`);
      process.exit(1);
    }
    seenIds.set(topic.id, "(chương Hướng dẫn)");
    topics.push({ file: "(sinh từ guide/content.tsx)", topic });
  }

  const checksum = knowledgeChecksum(sources);

  const body = [
    `// ⚠️ FILE NÀY ĐƯỢC SINH RA TỰ ĐỘNG — ĐỪNG SỬA TAY.`,
    `//`,
    `// Nguồn: app/lib/ai/knowledge/*.md`,
    `// Sinh lại: npm run kb:build`,
    `//`,
    `// Sửa tay thì lần chạy \`kb:build\` kế tiếp xoá mất, và trong khoảng giữa thì checksum lệch`,
    `// nên test đỏ. Muốn đổi nội dung thì sửa file .md tương ứng.`,
    ``,
    `import type { KnowledgeTopic } from "@/app/lib/business/ai/topic";`,
    ``,
    `/** Dấu vân tay của các file .md nguồn. Test đối chiếu con số này — xem knowledge.ts. */`,
    `export const KNOWLEDGE_CHECKSUM = ${JSON.stringify(checksum)};`,
    ``,
    `export const KNOWLEDGE_TOPICS: readonly KnowledgeTopic[] = [`,
    ...topics.map(({ file, topic }) =>
      [
        `  // ${file}`,
        `  {`,
        `    id: ${JSON.stringify(topic.id)},`,
        `    title: ${JSON.stringify(topic.title)},`,
        `    roles: ${JSON.stringify(topic.roles)},`,
        `    lastReviewed: ${JSON.stringify(topic.lastReviewed)},`,
        `    body: ${JSON.stringify(topic.body)},`,
        `  },`,
      ].join("\n"),
    ),
    `];`,
    ``,
  ].join("\n");

  writeFileSync(OUT_FILE, body, "utf8");

  const chars = topics.reduce((sum, t) => sum + t.topic.body.length, 0);
  console.log(`✓ ${topics.length} mục · ${chars.toLocaleString("vi-VN")} ký tự · checksum ${checksum}`);
  for (const { topic } of topics) {
    const roles = topic.roles.length === 0 ? "mọi vai trò" : topic.roles.join(", ");
    console.log(`  ${topic.id.padEnd(24)} ${topic.lastReviewed}  [${roles}]`);
  }
  console.log(`\n→ ${OUT_FILE}`);
  console.log(`⚠️  Commit CẢ file .md và generated.ts.`);
}

main();

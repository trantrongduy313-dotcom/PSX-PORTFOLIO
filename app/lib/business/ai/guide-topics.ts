import React from "react";

import {
  DESIGNER_3D_CHAPTERS,
  EMPLOYEE_CHAPTERS,
  MANAGER_CHAPTERS,
  type ChapterDef,
  type GuideRole,
} from "@/app/lib/guide/content";
import type { KnowledgeTopic } from "./topic";

// ═══════════════════════════════════════════════════════════════════════════
// HƯỚNG DẪN SỬ DỤNG → MỤC KIẾN THỨC CHO TRỢ LÝ
//
// 🔴 VÌ SAO FILE NÀY TỒN TẠI — MỘT LỖI KIẾN TRÚC, KHÔNG PHẢI THIẾU NỘI DUNG:
//
// Người dùng hỏi "làm cách nào để tôi báo cáo đơn dự kiến hoàn thành của cửa hàng CH1" và trợ
// lý trả lời "nội dung hướng dẫn chưa nói về việc này". Nhưng nó CÓ NÓI — ba chương liền:
// chọn cửa hàng, lọc theo hạn, và xuất báo cáo.
//
// Vấn đề là hai kho tài liệu tách rời, và trợ lý chỉ đọc kho nhỏ:
//
//   Hướng dẫn sử dụng   app/lib/guide/content.tsx     ~91 KB · 23 chương × 2 ngôn ngữ
//   Bộ trợ lý đọc được  app/lib/ai/knowledge/*.md     ~10 KB · 4 file · 211 dòng
//
// Tệ hơn: luật phân vai của chính dự án (topic.ts) ghi "Hướng dẫn dạy CÁCH LÀM, bộ này ghi
// LUẬT VÀ LÝ DO". Nghĩa là MỌI câu "làm sao để…" đều rơi vào phần trợ lý không đọc được —
// thất bại THEO THIẾT KẾ, không phải thỉnh thoảng. Mà "làm sao để…" chính là loại câu người
// ta hỏi nhiều nhất khi không biết thao tác.
//
// 🎯 NÊN Ở ĐÂY CÁC MỤC LÀ DỮ LIỆU PHÁI SINH, KHÔNG PHẢI BẢN SAO. Sửa một chương Hướng dẫn là
// trợ lý biết ngay ở lần `npm run kb:build` kế tiếp. Không có gì để chép, nên không có gì để lệch.
//
// ─── VÌ SAO ĐI BỘ CÂY REACT THAY VÌ RENDER RA HTML ──────────────────────────
//
// Render bằng `renderToStaticMarkup` rồi bóc thẻ thì HÌNH MINH HOẠ (SalesOrdersMockup…) đổ ra
// hàng trăm `div` với chữ rời rạc — vừa là rác cho mô hình đọc, vừa tốn token thật.
//
// Đi bộ `props.children` thì hình tự biến mất, KHÔNG cần đánh dấu gì: các mockup là component
// KHÔNG NHẬN children (`<SalesOrdersMockup />`), nên nhánh đó rỗng. Còn <Note>, <Warn>, <Kw>,
// <Code> thì chữ nằm ngay trong children nên vẫn lấy được đủ.
//
// Một tính chất của cách viết hiện tại trở thành cơ chế — nên có test chặn nó đổi thầm.
// ═══════════════════════════════════════════════════════════════════════════

/** Tiền tố id. Đổi là mọi dòng `ai_question_logs` cũ trỏ vào mục không còn tồn tại. */
export const GUIDE_TOPIC_PREFIX = "huong-dan";

/** Id của mục sinh từ một chương. Bền theo `slug`, KHÔNG theo số thứ tự chương. */
export function guideTopicId(role: GuideRole, slug: string): string {
  return `${GUIDE_TOPIC_PREFIX}-${role}-${slug}`;
}

/**
 * Component nào bị BỎ QUA hoàn toàn.
 *
 * Đây là rào thứ hai. Rào thứ nhất là các mockup vốn không nhận children nên tự rỗng — nhưng
 * nếu mai có người thêm children vào một mockup thì rác lọt vào bộ nội dung mà không ai biết.
 * Quy ước tên `*Mockup` đã có sẵn trong mockups.tsx; chỉ cần đọc nó.
 */
function isMockup(type: unknown): boolean {
  return typeof type === "function" && /Mockup$/.test((type as { name?: string }).name ?? "");
}

type Block = { kind: "heading" | "item" | "text"; text: string };

/**
 * Gom chữ của một nhánh cây, KHÔNG xuống dòng.
 *
 * `React.Children.toArray` bị cố ý tránh: nó bỏ `null`/`false` nhưng cũng gắn key và không
 * giúp gì thêm ở đây, trong khi đệ quy thẳng thì dễ đọc hơn.
 */
function inlineText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(inlineText).join("");

  if (React.isValidElement(node)) {
    if (isMockup(node.type)) return "";
    const props = node.props as { children?: React.ReactNode };
    return inlineText(props.children);
  }
  return "";
}

/**
 * Bẻ một chương thành các khối có cấu trúc.
 *
 * Giữ lại phân cấp vì mô hình đọc Markdown tốt hơn đọc một khối chữ liền: `h4` thành tiêu đề
 * con, `li` thành gạch đầu dòng, `p` thành đoạn.
 */
function collectBlocks(node: React.ReactNode, out: Block[]): void {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (typeof node === "string" || typeof node === "number") {
    const t = String(node).trim();
    if (t) out.push({ kind: "text", text: t });
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectBlocks(child, out);
    return;
  }
  if (!React.isValidElement(node)) return;
  if (isMockup(node.type)) return;

  const props = node.props as { children?: React.ReactNode };
  const tag = typeof node.type === "string" ? node.type : null;

  if (tag === "h4" || tag === "h3" || tag === "h5") {
    const t = inlineText(props.children).trim();
    if (t) out.push({ kind: "heading", text: t });
    return;
  }
  if (tag === "li") {
    const t = inlineText(props.children).replace(/\s+/g, " ").trim();
    if (t) out.push({ kind: "item", text: t });
    return;
  }
  if (tag === "p") {
    const t = inlineText(props.children).replace(/\s+/g, " ").trim();
    if (t) out.push({ kind: "text", text: t });
    return;
  }

  // <Note>, <Warn>: là component hàm, chữ nằm trong children. Lấy nguyên đoạn, kèm dấu hiệu
  // để mô hình biết đây là lời nhắc chứ không phải một bước thao tác.
  if (typeof node.type === "function") {
    const name = (node.type as { name?: string }).name ?? "";
    if (name === "Note" || name === "Warn") {
      // ⚠️ Vài chỗ trong content.tsx đã tự gõ 💡/⚠️ ngay đầu câu. Thêm dấu nữa thì ra "💡 💡 …" —
      // vô hại về nghĩa nhưng là rác mô hình phải đọc, và nó lộ ra rằng chuỗi này do máy ghép.
      const t = inlineText(props.children).replace(/\s+/g, " ").trim();
      if (!t) return;
      const mark = name === "Warn" ? "⚠️" : "💡";
      out.push({ kind: "text", text: /^(💡|⚠️)/.test(t) ? t : `${mark} ${t}` });
      return;
    }
  }

  collectBlocks(props.children, out);
}

/** Chương → thân bài Markdown. */
export function chapterToMarkdown(chapter: ChapterDef): string {
  const blocks: Block[] = [];
  collectBlocks(chapter.vi.content, blocks);

  const lines: string[] = [];
  let prev: Block["kind"] | null = null;
  for (const b of blocks) {
    if (b.kind === "heading") {
      if (lines.length) lines.push("");
      lines.push(`## ${b.text}`);
    } else if (b.kind === "item") {
      lines.push(`- ${b.text}`);
    } else {
      // Danh sách vừa kết thúc → chừa một dòng trống, không thì đoạn văn dính vào gạch đầu dòng.
      if (prev === "item" || prev === "text") lines.push("");
      lines.push(b.text);
    }
    prev = b.kind;
  }
  return lines.join("\n").trim();
}

/** Ba bộ chương, kèm vai trò đọc được chúng. */
const CHAPTER_SETS: readonly { role: GuideRole; chapters: readonly ChapterDef[] }[] = [
  { role: "employee", chapters: EMPLOYEE_CHAPTERS },
  { role: "manager", chapters: MANAGER_CHAPTERS },
  { role: "design3d", chapters: DESIGNER_3D_CHAPTERS },
];

/**
 * Toàn bộ chương Hướng dẫn dưới dạng mục kiến thức.
 *
 * ✅ BA THỨ KHỚP SẴN, KHÔNG PHẢI DỰNG THÊM:
 *   · `roles` của KnowledgeTopic vốn đã dùng kiểu `GuideRole` → mỗi bộ chương map 1-1. Một
 *     nhân viên Sales nhận 9 chương CỦA HỌ, không phải 23 — vừa đúng hơn vừa rẻ hơn.
 *   · `ChapterDef.lastReviewed` khớp thẳng `KnowledgeTopic.lastReviewed` → cờ "có thể cũ" chạy
 *     ngay, không cần khai lại mốc ở đâu nữa.
 *   · Dẫn nguồn trỏ đúng một chương có thật, nên người đọc mở ra xem tiếp được.
 *
 * ⚠️ CHỈ LẤY BẢN TIẾNG VIỆT. Trợ lý bị buộc trả lời tiếng Việt (luật 4 của prompt), nên gửi kèm
 * bản tiếng Anh là nhân đôi token cho phần không bao giờ được dùng tới.
 *
 * Thứ tự TIỀN ĐỊNH (theo thứ tự bộ, rồi thứ tự chương) — khối kiến thức được cache theo tiền
 * tố chính xác, thứ tự đảo giữa hai lần build là mất cache của mọi người dùng.
 */
export function buildGuideTopics(): KnowledgeTopic[] {
  const topics: KnowledgeTopic[] = [];
  for (const { role, chapters } of CHAPTER_SETS) {
    for (const chapter of chapters) {
      topics.push({
        id: guideTopicId(role, chapter.slug),
        title: chapter.vi.title,
        roles: [role],
        lastReviewed: chapter.lastReviewed,
        body: chapterToMarkdown(chapter),
      });
    }
  }
  return topics;
}

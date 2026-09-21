import Link from "next/link";
import { BookOpen, MessageCircle, Sparkles, Megaphone } from "lucide-react";

import { requireUser } from "@/app/lib/auth-helpers";
import { isAiConfigured } from "@/app/lib/ai/client";
import { askAiHref } from "@/app/lib/ui/ask-ai-param";

export const metadata = { title: "Trung tâm trợ giúp — PSX" };

// ─── Trung tâm trợ giúp ──────────────────────────────────────────────────────
//
// 🔴 TRANG NÀY CỐ Ý KHÔNG CHỨA NỘI DUNG NÀO CỦA RIÊNG NÓ. Nó là một CỬA, không phải một KHO.
//
// Hệ thống đã có bốn nơi trả lời câu hỏi của người dùng, nằm rời nhau:
//
//   /dashboard/guide       23 chương × 2 ngôn ngữ  (app/lib/guide/content.tsx)
//   Hỏi trợ lý             bộ kiến thức riêng      (app/lib/ai/knowledge/*.md)
//   /dashboard/whats-new   changelog
//   /dashboard/feedback    hỏi khi tài liệu không trả lời được
//
// Người dùng cần "một nơi để hỏi", nên gom BỐN CỬA vào một chỗ là đúng. Nhưng chép nội dung
// vào đây là tạo NƠI THỨ NĂM — và dự án đã có bằng chứng đắt về chuyện đó: content.tsx dạy sai
// định dạng số MO suốt 717 commit vì không ai biết nó đã lệch.
//
// ⚠️ LUẬT CỦA TRANG NÀY: không bao giờ viết một câu hướng dẫn nào ở đây. Muốn thêm hướng dẫn thì
// thêm vào Hướng dẫn sử dụng hoặc app/lib/ai/knowledge/. Trang này chỉ được phép LIÊN KẾT.
//
// `requireUser` chứ không `requireRole`: mọi vai đều được trợ giúp.

const CARD: React.CSSProperties = {
  display: "flex",
  gap: "14px",
  alignItems: "flex-start",
  padding: "18px 20px",
  background: "var(--cream-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  textDecoration: "none",
  color: "inherit",
};

const ICON_WRAP: React.CSSProperties = {
  flexShrink: 0,
  width: "34px",
  height: "34px",
  borderRadius: "999px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--cream-dark)",
  color: "var(--ink)",
};

function Card({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} style={CARD}>
      <span style={ICON_WRAP}>{icon}</span>
      <span>
        <span style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "3px" }}>
          {title}
        </span>
        <span style={{ display: "block", fontSize: "12.5px", color: "var(--ink-body)", lineHeight: 1.6 }}>
          {desc}
        </span>
      </span>
    </Link>
  );
}

export default async function HelpPage() {
  await requireUser();

  // Cùng nguồn với layout (nơi quyết định có dựng nút "Hỏi trợ lý" trong thanh hành động).
  // `process.env` chỉ đọc được ở Server Component — và trang này vốn đã là server.
  const aiReady = isAiConfigured();

  return (
    <div style={{ padding: "28px 32px", maxWidth: "760px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 600, marginBottom: "6px" }}>Trung tâm trợ giúp</h1>
      <p style={{ fontSize: "13px", color: "var(--ink-muted)", marginBottom: "24px", lineHeight: 1.6 }}>
        {aiReady ? "Bốn" : "Ba"} cách để tìm câu trả lời về hệ thống.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* 🔴 THẺ NÀY TỪNG LÀ MỘT `<div>` KHÔNG BẤM ĐƯỢC, và đó là một lỗi có thật.

            Lý do ban đầu đúng: "Hỏi trợ lý" không có trang riêng — nó là hộp thoại trong thanh
            hành động ở cạnh phải (ActionDock), và dựng một đường dẫn giả là cách nhanh nhất để
            người dùng thôi tin cả trang này.

            Nhưng kết quả còn tệ hơn thứ nó tránh: một cái thẻ TRÔNG Y HỆT ba thẻ liên kết bên
            dưới, nằm đầu tiên, và không làm gì cả. Người dùng không nhìn thấy `cursor: default`
            — họ nhìn thấy một cái hộp giống ba cái hộp kia, và họ đã bấm.

            Nay nó là liên kết THẬT tới `?ask=1`, và thanh hành động đọc tham số đó để mở hộp
            thoại NGAY TẠI TRANG NÀY. Trang vẫn là Server Component, không thêm một dòng
            JavaScript nào cho client; bấm chuột giữa, Ctrl+click, bàn phím, đọc màn hình đều
            chạy — vì nó là một `<a>` thật. Xem app/lib/ui/ask-ai-param.ts.

            ⚠️ ẨN HẲN KHI CHƯA CẤU HÌNH AI. Layout cũng dùng đúng `isAiConfigured()` để quyết
            định có dựng nút "Hỏi trợ lý" trong thanh hành động không. Để lại một thẻ mở ra hư
            không là tái tạo đúng lỗi vừa sửa, chỉ đổi nguyên nhân. */}
        {aiReady && (
          <Card
            href={askAiHref("/dashboard/help")}
            icon={<Sparkles style={{ width: "16px", height: "16px" }} />}
            title="Hỏi trợ lý"
            desc="Hỏi bằng câu chữ bình thường, trả lời kèm dẫn nguồn tới đúng mục hướng dẫn. Bấm vào đây, hoặc dùng nút ở thanh bên phải màn hình — có ở mọi trang."
          />
        )}

        <Card
          href="/dashboard/guide"
          icon={<BookOpen style={{ width: "16px", height: "16px" }} />}
          title="Hướng dẫn sử dụng"
          desc="Tài liệu đầy đủ theo từng vai trò, có ảnh minh hoạ. Mỗi chương ghi rõ lần rà soát gần nhất và báo nếu hệ thống đã đổi nhiều kể từ đó."
        />

        <Card
          href="/dashboard/whats-new"
          icon={<Megaphone style={{ width: "16px", height: "16px" }} />}
          title="Có gì mới"
          desc="Những thay đổi gần đây của hệ thống. Xem ở đây khi thấy màn hình khác với hướng dẫn."
        />

        {/* Đường thoát, và nó phải đứng CUỐI: chỉ đi tới đây khi ba cửa trên không trả lời được. */}
        <Card
          href="/dashboard/feedback"
          icon={<MessageCircle style={{ width: "16px", height: "16px" }} />}
          title="Không tìm thấy câu trả lời?"
          desc="Gửi câu hỏi hoặc báo lỗi cho quản trị. Hệ thống tự đính kèm màn hình và đơn hàng bạn đang mở, nên không cần mô tả lại."
        />
      </div>
    </div>
  );
}

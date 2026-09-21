"use client";

import { MessageCircleQuestion } from "lucide-react";

// ─── "Trên trang này" ────────────────────────────────────────────────────────
//
// 🎯 KHÔNG TỐN MỘT ĐỒNG API NÀO — chỉ là một bảng tra (business/ai/suggestions.ts). Nhưng nó
// giải một vấn đề thật:
//
//   NGƯỜI DÙNG ĐỨNG TRƯỚC MỘT HỘP CHAT TRỐNG THƯỜNG KHÔNG BIẾT HỎI GÌ, RỒI BỎ ĐI.
//
// Họ có thắc mắc rất cụ thể trong đầu, nhưng không biết trợ lý này biết được đến đâu nên không
// dám hỏi. Ba câu gợi ý cho họ một cú bấm thay vì một ô trống, và DẠY họ phạm vi của trợ lý —
// sau vài lần họ tự hỏi được câu của mình.
//
// Bấm là HỎI LUÔN, không phải điền vào ô nhập. Điền vào ô rồi bắt bấm Gửi là thêm một bước cho
// một việc người dùng đã quyết định xong.

type Props = {
  questions: readonly string[];
  onPick: (question: string) => void;
};

export function AskAiSuggestions({ questions, onPick }: Props) {
  // Không có gợi ý cho trang này thì KHÔNG hiện tiêu đề trống. Một mục "TRÊN TRANG NÀY" rỗng
  // đọc ra như hệ thống bị hỏng.
  if (questions.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
      <span
        style={{
          fontSize: "9.5px",
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: "var(--ink-muted)",
        }}
      >
        TRÊN TRANG NÀY
      </span>
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            padding: "8px 10px",
            textAlign: "left",
            fontSize: "11.5px",
            lineHeight: 1.5,
            color: "var(--ink)",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--row-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <MessageCircleQuestion
            style={{ width: "12px", height: "12px", flexShrink: 0, marginTop: "3px", color: "var(--ink-muted)" }}
          />
          {q}
        </button>
      ))}
    </div>
  );
}

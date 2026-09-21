"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, Sparkles, X } from "lucide-react";

import { fetchJson, jsonBody } from "@/app/lib/utils/fetch-json";
import { Z } from "@/app/lib/ui/z-index";
import { suggestionsForPath } from "@/app/lib/business/ai/suggestions";
import {
  MAX_CONVERSATION_TURNS,
  MAX_QUESTION_LENGTH,
  validateQuestion,
  type ConversationTurn,
} from "@/app/lib/business/ai/validate";
import { FeedbackDialog } from "../feedback/feedback-dialog";
import { AskAiAnswer, type AnswerData } from "./ask-ai-answer";
import { AskAiSuggestions } from "./ask-ai-suggestions";

// ─── Hộp thoại "Hỏi trợ lý" ──────────────────────────────────────────────────
//
// Component này CHỈ dựng hộp thoại và gọi API. Mọi luật (độ dài câu hỏi, số lượt tối đa, gợi ý
// theo trang) nằm ở app/lib/business/ai/* và có test.
//
// ⚠️ LỊCH SỬ HỘI THOẠI DO CLIENT GIỮ, KHÔNG CÓ PHIÊN Ở SERVER. Một cuộc hỏi đáp ba câu không
// đáng có một bảng "phiên" cùng với việc dọn phiên cũ. Và client giữ thì đóng hộp thoại là quên
// sạch — đúng cái người dùng mong: lần sau mở ra là một tờ giấy trắng, không phải câu hỏi hôm qua.

type Props = { onClose: () => void };

export function AskAiDialog({ onClose }: Props) {
  const pathname = usePathname();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [answers, setAnswers] = useState<AnswerData[]>([]);
  const [asking, setAsking] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Esc để đóng. Một hộp thoại phủ toàn màn hình mà không có đường ra bằng bàn phím là chỗ người
  // dùng cảm thấy bị kẹt — và họ mở nó ra vì đang bí, nên cảm giác đó tệ gấp đôi.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !asking && !feedbackOpen) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, asking, feedbackOpen]);

  const full = turns.length >= MAX_CONVERSATION_TURNS;

  const ask = async (raw: string) => {
    // Kiểm bằng ĐÚNG hàm server dùng — không viết lại điều kiện ở client. Ở đây chỉ để báo sớm
    // cho đỡ mất một vòng mạng; server vẫn kiểm lại vì client không đáng tin.
    const invalid = validateQuestion(raw);
    if (invalid) {
      toast.error(invalid);
      return;
    }

    setAsking(true);
    try {
      const res = await fetchJson<AnswerData>(
        "/api/ai/ask",
        jsonBody({ question: raw, pageUrl: pathname, history: turns }),
      );
      setAnswers((prev) => [...prev, res]);
      setTurns((prev) => [...prev, { question: raw, answer: res.text }]);
      setQuestion("");
    } catch (err) {
      toast.error((err as Error).message || "Trợ lý không trả lời được");
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      <div
        onClick={() => !asking && onClose()}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(42,39,37,0.35)",
          zIndex: Z.ASK_AI_DIALOG_BACKDROP,
        }}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hỏi trợ lý"
        style={{
          position: "fixed",
          zIndex: Z.ASK_AI_DIALOG,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          background: "var(--cream-card)",
          border: "1px solid var(--border)",
          boxShadow: "0 8px 40px rgba(42,39,37,0.24)",
        }}
      >
        {/* ── Đầu ───────────────────────────────────────────────────────── */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}>
            <Sparkles style={{ width: "14px", height: "14px", color: "var(--ink-muted)" }} />
            <span>
              <span style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--ink)" }}>
                Hỏi trợ lý
              </span>
              {/* Nói NGAY phạm vi của trợ lý. Người dùng không biết nó biết được đến đâu thì họ
                  hỏi về đơn cụ thể, nhận "tôi không xem được", và kết luận nó vô dụng. */}
              <span style={{ display: "block", fontSize: "10px", color: "var(--ink-muted)", marginTop: "1px" }}>
                Trả lời từ hướng dẫn sử dụng · không xem được dữ liệu đơn hàng
              </span>
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={asking}
            aria-label="Đóng"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", lineHeight: 0 }}
          >
            <X style={{ width: "15px", height: "15px" }} />
          </button>
        </div>

        {/* ── Thân ──────────────────────────────────────────────────────── */}
        <div
          style={{
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {answers.length === 0 && !asking && (
            <AskAiSuggestions
              questions={suggestionsForPath(pathname)}
              onPick={(q) => ask(q)}
            />
          )}

          {answers.map((a, i) => (
            <div key={a.logId ?? i} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Nhắc lại câu đã hỏi. Sau ba lượt thì không ai nhớ câu thứ nhất là gì, và một
                  câu trả lời không có câu hỏi bên trên là một đoạn văn lơ lửng. */}
              <p
                style={{
                  margin: 0,
                  fontSize: "11.5px",
                  fontWeight: 600,
                  color: "var(--ink-muted)",
                }}
              >
                {turns[i]?.question}
              </p>
              <AskAiAnswer answer={a} onAskHuman={() => setFeedbackOpen(true)} />
            </div>
          ))}

          {asking && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                fontSize: "11.5px",
                color: "var(--ink-muted)",
              }}
            >
              <Loader2 className="animate-spin" style={{ width: "12px", height: "12px" }} />
              Đang tìm trong hướng dẫn…
            </span>
          )}
        </div>

        {/* ── Chân: ô nhập ──────────────────────────────────────────────── */}
        <div
          style={{
            flexShrink: 0,
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {full ? (
            // Hết lượt thì NÓI RA và cho một nút làm lại, không im lặng vô hiệu hoá ô nhập. Một
            // ô nhập gõ được mà bấm không đi là chỗ người dùng tưởng hệ thống treo.
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
              <span style={{ fontSize: "10.5px", color: "var(--ink-muted)" }}>
                Đã hỏi {MAX_CONVERSATION_TURNS} câu trong lượt này.
              </span>
              <button
                type="button"
                className="psx-btn-secondary"
                style={{ fontSize: "11px" }}
                onClick={() => {
                  setTurns([]);
                  setAnswers([]);
                }}
              >
                Bắt đầu lượt mới
              </button>
            </div>
          ) : (
            <>
              <textarea
                className="psx-input"
                autoFocus
                rows={2}
                value={question}
                maxLength={MAX_QUESTION_LENGTH}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  // Enter để gửi, Shift+Enter để xuống dòng — quy ước của mọi hộp chat. Ngược
                  // lại là người dùng bấm Enter rồi thấy con trỏ xuống dòng và không hiểu.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!asking) ask(question.trim());
                  }
                }}
                disabled={asking}
                placeholder="VD: vì sao tôi không chuyển được đơn sang giai đoạn sau?"
                style={{ resize: "vertical", fontSize: "12px", lineHeight: 1.5 }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ fontSize: "10px", color: "var(--ink-muted)" }}>
                  Enter để gửi · Shift+Enter xuống dòng
                </span>
                <button
                  type="button"
                  className="psx-btn-primary"
                  onClick={() => ask(question.trim())}
                  disabled={asking || question.trim().length === 0}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px" }}
                >
                  {asking ? (
                    <Loader2 className="animate-spin" style={{ width: "12px", height: "12px" }} />
                  ) : (
                    <Send style={{ width: "12px", height: "12px" }} />
                  )}
                  Hỏi
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Đường thoát sang người thật. Dùng lại NGUYÊN hộp thoại Góp ý — không dựng một form thứ
          hai. Nó nằm TRÊN hộp thoại này (z-index 1200 > 1151), đúng thứ tự mở ra: bấm vào đường
          thoát mà bị che là kẹt ở đúng chỗ ta vừa chỉ đường. */}
      {feedbackOpen && <FeedbackDialog onClose={() => setFeedbackOpen(false)} />}
    </>
  );
}

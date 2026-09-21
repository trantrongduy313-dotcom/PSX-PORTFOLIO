"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, ThumbsDown, ThumbsUp } from "lucide-react";

import { fetchJson } from "@/app/lib/utils/fetch-json";

// ─── Một câu trả lời trên màn hình ───────────────────────────────────────────
//
// 🔴 BA THỨ PHẢI ĐI CÙNG NHAU, VÀ ĐÂY LÀ TOÀN BỘ LÝ DO TÍNH NĂNG NÀY ĐÁNG TIN:
//
//   1. Câu trả lời.
//   2. NGUỒN — mục nào trong bộ nội dung, mở ra đọc được.
//   3. MỐC RÀ SOÁT của mục đó.
//
// Vấn đề đang giải là "hướng dẫn có thể không khớp thực tế". Một câu trả lời trơn tru mà không
// chỉ được nó lấy từ đâu thì làm vấn đề đó TỆ HƠN — nó xoá luôn cách để người đọc tự nghi ngờ.
// Có nguồn và có mốc thì người đọc tự biết mà dè dặt, và biết đi đâu để kiểm.

export type AnswerSource = { id: string; title: string; lastReviewed: string };

export type AnswerData = {
  logId: string | null;
  text: string;
  unanswered: boolean;
  sources: AnswerSource[];
  /** Tiêu đề các chủ đề trợ lý ĐANG CÓ cho vai trò này — chỉ dùng khi không trả lời được. */
  scope: string[];
};

type Props = {
  answer: AnswerData;
  /** Mở form Góp ý — đường thoát khi trợ lý không trả lời được. */
  onAskHuman: () => void;
};

export function AskAiAnswer({ answer, onAskHuman }: Props) {
  // null = chưa chấm. Phân biệt với `false` ("đã chấm là không giúp được") — gộp lại là mọi câu
  // chưa chấm bị đếm thành câu tốt.
  const [rated, setRated] = useState<boolean | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const rate = async (helpful: boolean, withNote?: string) => {
    if (!answer.logId) return;
    setSending(true);
    try {
      const res = await fetchJson<{ reported: boolean }>(`/api/ai/${answer.logId}/rate`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ helpful, note: withNote }),
      });
      setRated(helpful);
      setNoteOpen(false);
      if (res?.reported) toast.success("Đã gửi cho admin. Cảm ơn bạn.");
    } catch (err) {
      // Chấm điểm thất bại KHÔNG được làm mất câu trả lời đang hiện. Đây là một phép đo, và một
      // phép đo bị mất không đáng bằng một câu trả lời bị xoá khỏi màn hình.
      toast.error((err as Error).message || "Không ghi nhận được");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* `whiteSpace: pre-wrap` — câu trả lời có gạch đầu dòng và đoạn. Không giữ xuống dòng là
          mọi bước bấm dồn thành một khối chữ không đọc được. */}
      <p
        style={{
          margin: 0,
          fontSize: "12.5px",
          lineHeight: 1.65,
          color: "var(--ink)",
          whiteSpace: "pre-wrap",
        }}
      >
        {answer.text}
      </p>

      {/* ── Nguồn ─────────────────────────────────────────────────────────── */}
      {answer.sources.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
          {answer.sources.map((s) => (
            <a
              key={s.id}
              href="/dashboard/guide"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 8px",
                fontSize: "10.5px",
                color: "var(--ink-muted)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                textDecoration: "none",
              }}
            >
              <BookOpen style={{ width: "11px", height: "11px" }} />
              {s.title}
              {/* Mốc rà soát hiện NGAY CẠNH tiêu đề, không phải trong tooltip. Một mốc phải mò
                  mới thấy thì không ai thấy, và trường này tồn tại để được nhìn thấy. */}
              <span style={{ opacity: 0.7 }}>· rà {s.lastReviewed}</span>
            </a>
          ))}
        </div>
      )}

      {/* ── Không trả lời được → NÓI RÕ PHẠM VI, rồi chỉ đường sang người thật ──
          🔴 Danh sách chủ đề là phần quan trọng hơn cái nút. "Nội dung hướng dẫn chưa nói về
          việc này" một mình đọc ra như TRỢ LÝ HỎNG — người dùng vừa kết luận đúng như vậy. Nói
          ra nó đang có những gì thì họ hiểu ngay đây là GIỚI HẠN PHẠM VI, không phải lỗi.

          Ba câu gợi ý ở màn đầu làm hiểu lầm này nặng thêm: `suggestions.ts` cố ý chỉ gợi những
          câu bộ nội dung TRẢ LỜI ĐƯỢC, nên chúng luôn thành công và tạo ảo giác về độ phủ. */}
      {answer.unanswered && answer.scope.length > 0 && (
        <div style={{ fontSize: "11px", color: "var(--ink-muted)", lineHeight: 1.65 }}>
          Trợ lý hiện chỉ có nội dung về:{" "}
          <span style={{ color: "var(--ink-body)" }}>{answer.scope.join(" · ")}</span>.
        </div>
      )}
      {answer.unanswered && (
        <button
          type="button"
          onClick={onAskHuman}
          className="psx-btn-secondary"
          style={{ alignSelf: "flex-start", fontSize: "11px" }}
        >
          Gửi câu hỏi này cho admin
        </button>
      )}

      {/* ── Chấm điểm ─────────────────────────────────────────────────────── */}
      {/* `logId` null nghĩa là ghi log thất bại → ẩn hẳn. Không hiện một nút bấm vào không làm
          gì; thà không có nút còn hơn có một nút chết. */}
      {answer.logId && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "8px" }}>
          {rated === null && !noteOpen && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "10.5px", color: "var(--ink-muted)" }}>Câu này có giúp được bạn?</span>
              <button
                type="button"
                onClick={() => rate(true)}
                disabled={sending}
                aria-label="Có giúp được"
                style={iconBtn}
              >
                <ThumbsUp style={{ width: "12px", height: "12px" }} />
              </button>
              <button
                type="button"
                // 👎 mở ô mô tả TRƯỚC khi ghi nhận. Bấm một cái là xong thì ta chỉ biết "có người
                // không hài lòng" — con số đó không sửa được nội dung nào. Một câu họ viết ra thì
                // sửa được.
                onClick={() => setNoteOpen(true)}
                disabled={sending}
                aria-label="Không giúp được"
                style={iconBtn}
              >
                <ThumbsDown style={{ width: "12px", height: "12px" }} />
              </button>
            </div>
          )}

          {noteOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "10.5px", color: "var(--ink-muted)" }}>
                Sai ở đâu? Viết một câu thì admin sửa được nội dung.{" "}
                <span style={{ opacity: 0.8 }}>(không bắt buộc)</span>
              </span>
              <textarea
                className="psx-input"
                rows={2}
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={sending}
                placeholder="VD: deadline không tính như vậy, thực tế là…"
                style={{ resize: "vertical", fontSize: "11.5px", lineHeight: 1.5 }}
              />
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className="psx-btn-primary"
                  onClick={() => rate(false, note.trim() || undefined)}
                  disabled={sending}
                  style={{ fontSize: "11px" }}
                >
                  {note.trim() ? "Gửi cho admin" : "Chỉ ghi nhận"}
                </button>
                <button
                  type="button"
                  className="psx-btn-secondary"
                  onClick={() => setNoteOpen(false)}
                  disabled={sending}
                  style={{ fontSize: "11px" }}
                >
                  Bỏ qua
                </button>
              </div>
            </div>
          )}

          {rated !== null && (
            <span style={{ fontSize: "10.5px", color: "var(--ink-muted)" }}>
              {rated ? "Cảm ơn bạn." : "Đã ghi nhận. Cảm ơn bạn."}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 7px",
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--ink-muted)",
  cursor: "pointer",
};

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bug, Lightbulb, Loader2, X } from "lucide-react";

import { fetchJson, jsonBody } from "@/app/lib/utils/fetch-json";
import { Z } from "@/app/lib/ui/z-index";
import {
  FEEDBACK_KINDS,
  FEEDBACK_KIND_HINTS,
  FEEDBACK_KIND_LABELS,
  feedbackFieldLabels,
  type FeedbackKind,
} from "@/app/lib/business/feedback/kind";
import { validateFeedbackDraft } from "@/app/lib/business/feedback/validate";
import { FeedbackImagePicker, type PickedImage } from "./feedback-image-picker";
import { useFeedbackContext } from "./use-feedback-context";

// ─── Hộp thoại gửi phản hồi ──────────────────────────────────────────────────
//
// MỘT nút, và câu hỏi ĐẦU TIÊN là chọn loại. Không làm hai nút riêng: người dùng phải tự phân
// loại TRƯỚC khi biết mình đang gặp gì, và họ sẽ chọn sai — mọi thứ dồn vào "Lỗi" vì nghe gấp
// hơn. Chọn loại xong thì NHÃN hai ô đổi theo (kind.ts:feedbackFieldLabels), nên người dùng
// được dẫn đúng vào thông tin cần cho loại đó.
//
// Component này CHỈ dựng hộp thoại và gửi. Mọi luật (loại nào bắn chuông, độ dài, nhãn nào
// cho loại nào) nằm ở app/lib/business/feedback/* và có test.

type Props = { onClose: () => void };

export function FeedbackDialog({ onClose }: Props) {
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [images, setImages] = useState<PickedImage[]>([]);
  const [sending, setSending] = useState(false);
  const collectContext = useFeedbackContext();

  // Esc để đóng. Một hộp thoại phủ toàn màn hình mà không có đường ra bằng bàn phím là chỗ
  // người dùng cảm thấy bị kẹt, nhất là khi họ mở nó ra vì đang gặp lỗi.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  const uploading = images.some((i) => i.state === "uploading");
  const labels = kind ? feedbackFieldLabels(kind) : null;

  const submit = async () => {
    if (!kind) return;

    const imagePaths = images.filter((i) => i.state === "done" && i.path).map((i) => i.path!);

    // Kiểm bằng ĐÚNG hàm mà server dùng — không viết lại điều kiện ở client. Ở đây nó chỉ để
    // báo sớm cho đỡ mất một vòng mạng; server vẫn kiểm lại vì client không đáng tin.
    const invalid = validateFeedbackDraft({ kind, summary, detail, imagePaths });
    if (invalid) {
      toast.error(invalid);
      return;
    }

    // ⚠️ ẢNH LỖI KHÔNG CHẶN VIỆC GỬI. Bản đầu chặn, và đó là một cái bẫy đã gặp trên
    // production: tầng tải ảnh nói "bạn vẫn gửi được phản hồi mà không kèm ảnh", rồi nút Gửi
    // từ chối đúng điều vừa hứa — người dùng làm theo lời mình mà vẫn không đi được, và phải
    // tự bấm xoá từng ảnh mới thoát ra.
    //
    // Và nó xảy ra ở đúng chỗ tệ nhất: một người đang cố BÁO LỖI thì bị chặn bởi chính công cụ
    // báo lỗi. Họ sẽ mở Zalo, và tính năng thua ngay ở lần dùng đầu.
    //
    // LUẬT: MẤT ẢNH CÒN HƠN MẤT BÁO CÁO. Ảnh lỗi bị bỏ khỏi lượt gửi, phản hồi vẫn đi, và
    // người dùng được nói cho biết MỘT lần — sau khi gửi xong, không phải trước.
    const droppedImages = images.filter((i) => i.state === "error").length;

    setSending(true);
    try {
      const res = await fetchJson<{ duplicate?: boolean }>(
        "/api/feedback",
        jsonBody({ kind, summary, detail, imagePaths, context: collectContext() }),
      );

      if (res?.duplicate) {
        // Server nhận ra đây là cú bấm Gửi thứ hai của cùng một nội dung. Với người dùng thì
        // kết quả họ mong đã đạt được, nên đây KHÔNG phải lỗi.
        toast.success("Phản hồi này đã được ghi nhận.");
      } else {
        const sent =
          kind === "BUG"
            ? "Đã gửi. Admin nhận được thông báo ngay."
            : "Đã gửi. Bạn xem lại được ở mục Góp ý của tôi.";
        // MỘT thông báo duy nhất, và nó nói SỰ THẬT về những gì đã đi: gửi xong rồi, nhưng
        // N ảnh không kèm được. Báo ở đây chứ không báo lúc chặn, vì lúc này nó là một thông
        // tin; lúc đó nó là một rào cản.
        toast.success(
          droppedImages > 0
            ? `${sent} (${droppedImages} ảnh không tải lên được nên không kèm theo)`
            : sent,
        );
      }
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Không gửi được phản hồi");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div
        onClick={() => !sending && onClose()}
        style={{ position: "fixed", inset: 0, background: "rgba(42,39,37,0.35)", zIndex: Z.FEEDBACK_DIALOG_BACKDROP }}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Góp ý / Báo lỗi"
        style={{
          position: "fixed",
          zIndex: Z.FEEDBACK_DIALOG,
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
        {/* ── Đầu hộp thoại ─────────────────────────────────────────────── */}
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
          <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "var(--ink)" }}>
            Góp ý / Báo lỗi
          </p>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="Đóng"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", lineHeight: 0 }}
          >
            <X style={{ width: "15px", height: "15px" }} />
          </button>
        </div>

        {/* ── Thân ──────────────────────────────────────────────────────── */}
        <div style={{ overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Câu hỏi ĐẦU TIÊN: loại nào. Quyết định này đổi nhãn hai ô phía dưới. */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {FEEDBACK_KINDS.map((k) => {
              const selected = kind === k;
              const Icon = k === "BUG" ? Bug : Lightbulb;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  disabled={sending}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "10px 12px",
                    textAlign: "left",
                    cursor: sending ? "not-allowed" : "pointer",
                    background: selected ? "var(--row-hover)" : "transparent",
                    border: `1px solid ${selected ? "var(--ink)" : "var(--border-md)"}`,
                  }}
                >
                  <Icon
                    style={{
                      width: "14px",
                      height: "14px",
                      flexShrink: 0,
                      marginTop: "2px",
                      color: selected ? "var(--ink)" : "var(--ink-muted)",
                    }}
                  />
                  <span>
                    <span
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: selected ? 600 : 500,
                        color: "var(--ink)",
                      }}
                    >
                      {FEEDBACK_KIND_LABELS[k]}
                    </span>
                    <span style={{ display: "block", fontSize: "11px", color: "var(--ink-muted)", marginTop: "2px" }}>
                      {FEEDBACK_KIND_HINTS[k]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Hai ô chỉ hiện SAU khi chọn loại — nhãn của chúng phụ thuộc loại, nên hiện trước
              là buộc người dùng đọc một câu hỏi chung chung rồi đọc lại câu đã đổi. */}
          {kind && labels && (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink)" }}>
                  {labels.summaryLabel}
                </span>
                <textarea
                  className="psx-input"
                  autoFocus
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  disabled={sending}
                  placeholder={labels.summaryPlaceholder}
                  style={{ resize: "vertical", lineHeight: 1.5 }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink)" }}>
                  {labels.detailLabel}{" "}
                  {/* Nói rõ là KHÔNG bắt buộc. Ô này đáng giá nhất nhưng bắt buộc nó là buộc
                      người đang bực trả lời thêm một câu trước khi được nói ra vấn đề. */}
                  <span style={{ fontWeight: 400, color: "var(--ink-muted)" }}>(không bắt buộc)</span>
                </span>
                <textarea
                  className="psx-input"
                  rows={2}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  disabled={sending}
                  placeholder={labels.detailPlaceholder}
                  style={{ resize: "vertical", lineHeight: 1.5 }}
                />
              </label>

              <div>
                <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink)", margin: "0 0 5px" }}>
                  Ảnh chụp màn hình
                </p>
                <FeedbackImagePicker images={images} setImages={setImages} disabled={sending} />
              </div>

              {/* Nói cho người dùng biết ta tự gắn bối cảnh. Hai lý do: họ không phải gõ lại
                  số đơn, và họ biết ta có đủ thông tin nên không cần viết dài. */}
              <p style={{ fontSize: "10px", color: "var(--ink-muted)", margin: 0, lineHeight: 1.6 }}>
                Hệ thống tự kèm: màn hình bạn đang mở, đơn/MO đang xem, và bản build — bạn không cần
                gõ lại.
              </p>
            </>
          )}
        </div>

        {/* ── Chân ──────────────────────────────────────────────────────── */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button type="button" className="psx-btn-secondary" onClick={onClose} disabled={sending}>
            Huỷ
          </button>
          <button
            type="button"
            className="psx-btn-primary"
            onClick={submit}
            // Chặn gửi khi ảnh CHƯA tải xong — gửi lúc đó là gửi một phản hồi thiếu đúng cái
            // bằng chứng mà người dùng vừa bỏ công đính vào.
            disabled={!kind || sending || uploading}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            {sending && <Loader2 className="animate-spin" style={{ width: "12px", height: "12px" }} />}
            {uploading ? "Đang tải ảnh…" : "Gửi"}
          </button>
        </div>
      </div>
    </>
  );
}

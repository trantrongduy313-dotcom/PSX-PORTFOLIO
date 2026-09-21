"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

import { fetchJson, jsonBody } from "@/app/lib/utils/fetch-json";
import {
  CHANGELOG_AREAS,
  CHANGELOG_AREA_LABELS,
  DEFAULT_CHANGELOG_AREA,
  type ChangelogArea,
} from "@/app/lib/business/changelog/area";
import { devSpeakWarning, validateChangelogDraft } from "@/app/lib/business/changelog/validate";

// ─── Soạn một mục changelog ──────────────────────────────────────────────────
//
// TÁCH RIÊNG khỏi danh sách ngay từ đầu. Gộp lại thì đúng khoảng 380 dòng và một component có
// hai lý do để thay đổi — chính xác cái vừa phải trả nợ ở bộ chọn ảnh của tính năng Góp ý.
//
// 🎯 MỌI QUYẾT ĐỊNH Ở ĐÂY ĐỀU HƯỚNG VỀ MỘT MỤC TIÊU: GHI MỘT MỤC MẤT 30 GIÂY.
//
// Nguy cơ lớn nhất của cả tính năng không phải code — là người viết NGỪNG VIẾT. Nếu ghi một mục
// mất 10 phút thì nó sẽ bị bỏ, và một changelog có lỗ hổng còn tệ hơn không có: người dùng thấy
// trang im lặng rồi kết luận hệ thống không đổi gì, và thôi vào xem.
//
// Vì vậy: một ô tiêu đề, một ô nội dung KHÔNG bắt buộc, một hàng chọn khu vực, một hộp tick.
// Không soạn thảo rich-text, không tải ảnh, không quy trình duyệt.

export function ChangelogEditor({ draftCount }: { draftCount: number }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [area, setArea] = useState<ChangelogArea>(DEFAULT_CHANGELOG_AREA);
  const [isImportant, setIsImportant] = useState(false);
  const [busy, setBusy] = useState(false);

  // Cảnh báo giọng kỹ thuật hiện NGAY LÚC GÕ, không đợi bấm lưu. Nhắc lúc người ta còn đang
  // nghĩ về câu chữ thì họ sửa; nhắc sau khi bấm lưu thì họ chỉ thấy bị cản.
  const warning = devSpeakWarning(title);

  const save = async () => {
    const draft = { title, body, area, isImportant };
    const invalid = validateChangelogDraft(draft);
    if (invalid) {
      toast.error(invalid);
      return;
    }

    setBusy(true);
    try {
      await fetchJson("/api/changelog", jsonBody(draft));
      setTitle("");
      setBody("");
      setIsImportant(false);
      // Giữ nguyên `area`: ghi nhiều mục cùng một khu vực trong một buổi là chuyện thường, và
      // reset nó là bắt chọn lại mỗi lần.
      router.refresh();
      toast.success("Đã lưu nháp. Bấm Đăng khi xong cả ngày.");
    } catch (err) {
      toast.error((err as Error).message || "Không lưu được");
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      const res = await fetchJson<{ published: number; notified: number }>("/api/changelog/publish", {
        method: "POST",
      });
      router.refresh();
      if (res.published === 0) {
        toast.success("Không có nháp nào để đăng.");
      } else {
        // Nói rõ CẢ HAI con số. Chúng lệch nhau khi có mục từng đăng rồi bị bỏ đăng — và người
        // đăng cần biết là mục đó KHÔNG được thông báo lại, không thì họ tưởng Chat lỗi.
        toast.success(
          res.notified === res.published
            ? `Đã đăng ${res.published} mục và thông báo cho cả nhóm.`
            : `Đã đăng ${res.published} mục, thông báo ${res.notified} mục mới (số còn lại đã thông báo trước đó).`,
        );
      }
    } catch (err) {
      toast.error((err as Error).message || "Không đăng được");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "var(--cream-card)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        maxWidth: "820px",
      }}
    >
      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink)" }}>
          Đã cải tiến gì? <span style={{ fontWeight: 400, color: "var(--ink-muted)" }}>(viết theo góc người dùng)</span>
        </span>
        <input
          className="psx-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          placeholder="VD: Chuyển xưởng — bản đã huỷ không còn chặn bản đúng"
        />
      </label>

      {/* Cảnh báo, KHÔNG chặn: phép dò chỉ nhìn được hình thức, không nhìn được ý nghĩa, nên nó
          sẽ bắt oan. Chặn oan một mục đúng tệ hơn nhắc nhẹ một mục sai — cái giá là người viết
          bỏ luôn. */}
      {warning && (
        <p
          style={{
            margin: 0,
            fontSize: "10px",
            lineHeight: 1.6,
            color: "var(--ink-body)",
            background: "rgba(234,179,8,0.12)",
            padding: "6px 8px",
          }}
        >
          {warning}
        </p>
      )}

      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink)" }}>
          Chi tiết <span style={{ fontWeight: 400, color: "var(--ink-muted)" }}>(không bắt buộc)</span>
        </span>
        <textarea
          className="psx-input"
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
          placeholder="Chỉ viết nếu một dòng tiêu đề chưa nói hết."
          style={{ resize: "vertical", lineHeight: 1.6 }}
        />
      </label>

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
        {CHANGELOG_AREAS.map((a) => (
          <button
            key={a}
            type="button"
            disabled={busy}
            onClick={() => setArea(a)}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: area === a ? 600 : 400,
              color: area === a ? "var(--cream)" : "var(--ink-body)",
              background: area === a ? "var(--ink)" : "transparent",
              border: `1px solid ${area === a ? "var(--ink)" : "var(--border-md)"}`,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {CHANGELOG_AREA_LABELS[a]}
          </button>
        ))}
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: "7px", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={isImportant}
          onChange={(e) => setIsImportant(e.target.checked)}
          disabled={busy}
          style={{ marginTop: "2px", accentColor: "var(--pink)", cursor: "pointer" }}
        />
        <span style={{ fontSize: "11px", color: "var(--ink-body)", lineHeight: 1.5 }}>
          Quan trọng — hiện băng thông báo trên đầu trang
          <br />
          {/* Nói rõ cái giá của việc tick. Không nói thì mọi mục đều "quan trọng", và lúc đó
              không mục nào quan trọng nữa. */}
          <span style={{ color: "var(--ink-muted)", fontSize: "10px" }}>
            Chỉ tick khi không biết thì làm sai việc. Tick mọi mục là không mục nào còn nổi bật.
          </span>
        </span>
      </label>

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center" }}>
        {busy && <Loader2 className="animate-spin" style={{ width: "13px", height: "13px", color: "var(--ink-muted)" }} />}

        <button type="button" className="psx-btn-secondary" onClick={save} disabled={busy || title.trim().length === 0}>
          Lưu nháp
        </button>

        {/* Nút Đăng NÊU SỐ LƯỢNG. "Đăng" trơ trọi thì người bấm không biết mình sắp loan báo bao
            nhiêu thứ — và đây là hành động duy nhất trong trang có thể làm cả nhóm nhận tin. */}
        <button
          type="button"
          className="psx-btn-primary"
          onClick={publish}
          disabled={busy || draftCount === 0}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <Send style={{ width: "12px", height: "12px" }} />
          {draftCount > 0 ? `Đăng ${draftCount} mục` : "Không có nháp"}
        </button>
      </div>
    </div>
  );
}

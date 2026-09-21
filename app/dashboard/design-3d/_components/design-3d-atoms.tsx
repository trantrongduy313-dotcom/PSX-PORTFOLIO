"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import type { StatusBadge } from "@/app/lib/business/kpi-3d/display";
import type { ConfiguredWorkingCalendar } from "@/app/lib/business/kpi-3d/calendar-adapter";
import { formatVnDateTime } from "@/app/lib/utils/vn-date";
import { TONE_CHIP } from "@/app/lib/ui/status-tone";
import { fetchJson, jsonBody } from "@/app/lib/utils/fetch-json";

export type Designer3DOption = { id: string; name: string; code: string };
export type Kpi3DGroupOption = { id: string; code: string; name: string; standardMinutes: number; isActive: boolean };
export type ConfiguredCalendar = ConfiguredWorkingCalendar & { isActive: boolean; isDefault: boolean };

// Dùng chung với sidebar Đơn hàng — trước đây mỗi màn tự khai Intl.DateTimeFormat riêng.
export const fmtDateTime = (iso: string | null) => formatVnDateTime(iso);

export const fmtHours = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return [hours > 0 ? `${hours} giờ` : "", mins > 0 ? `${mins} phút` : ""]
    .filter(Boolean).join(" ") || "0 phút";
};

/** Cột số phải thẳng hàng — chữ số cùng bề rộng. */
export const numCell: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

// Các mảnh dựng dùng lại của màn "Việc thiết kế 3D" — tách khỏi design-3d-client.tsx.
// Chúng đã có prop interface rõ ràng từ trước; việc tách chỉ là chuyển nhà, không đổi hành vi.

/**
 * Chip nền đầy cho cột Tình trạng.
 *
 * VÌ SAO KHÔNG PHẢI "● chữ màu" như bản trước: chữ màu trên nền kem có cùng khối lượng thị
 * giác với mọi chữ khác trong hàng, nên khi quét dọc một bảng mười cột thì trạng thái không
 * nổi hơn tên sản phẩm. Chip có nền tạo một hình khối mắt bắt được TRƯỚC khi đọc chữ — đó
 * chính là điều cần, vì trạng thái là thứ người ta tìm khi mở màn này.
 */
export function StatusChip({ badge, title }: { badge: StatusBadge; title?: string }) {
  const c = TONE_CHIP[badge.tone];
  return (
    <span title={title} style={{
      display: "inline-block", padding: "2.5px 8px", borderRadius: "999px",
      fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap",
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
    }}>
      {badge.label}
    </span>
  );
}

/**
 * Một ô tài liệu trong hàng thư viện: ô vuông + chú thích ngắn + icon mở Drive.
 *
 * VÌ SAO KHÔNG DÙNG BẢN KHÔNG-COMPACT của DesignFilePreview/VideoPreview: bản đó tự vẽ thêm
 * một DÒNG CHỮ LINK dưới ô ("Mở ảnh mẫu", "Mở ở Drive"), mà dòng đó nói gần đúng điều chú
 * thích đã nói. Ba loại tài liệu thành sáu đoạn chữ xanh xếp so le — nhìn lộn xộn vì nó đúng
 * là lộn xộn. Chế độ compact cho đúng cái cần: một ô vuông, không chữ.
 *
 * Đường ra Drive VẪN GIỮ nhưng thu về một icon: nhúng có thể hỏng vì lý do ngoài tầm code
 * (file chưa chia sẻ, sai tài khoản Google), nên không được bỏ đường ra đó.
 */
/**
 * Tài liệu chỉ có ĐƯỜNG DẪN, không xem trước được — mở thẳng ở Drive.
 *
 * Cùng khổ 72px với DocTile để hàng thư viện không so le: đứng cạnh ô File 3D có ảnh thật,
 * một nút cao thấp khác đi sẽ trông như bị lỗi bố cục chứ không như một loại tài liệu khác.
 *
 * CẢ Ô là chỗ bấm, không phải một icon nhỏ ở góc: ô này không còn việc gì khác ngoài mở link,
 * nên thu vùng bấm về một mũi tên 10px chỉ làm khó người dùng mà không đổi lại được gì.
 */
export function DocLink({
  caption,
  url,
  icon,
}: {
  caption: string;
  url: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Mở ${caption} ở Drive`}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: "4px", width: "72px", height: "72px",
        border: "1px solid var(--border)", borderRadius: "6px",
        background: "var(--cream)", color: "var(--ink-body)",
        textDecoration: "none", textAlign: "center",
      }}
    >
      <span style={{ color: "#1d4ed8", display: "inline-flex" }}>{icon}</span>
      <span style={{ fontSize: "10.5px", color: "var(--ink-muted)", display: "inline-flex", alignItems: "center", gap: "3px" }}>
        {caption}
        <ExternalLink className="w-2.5 h-2.5" />
      </span>
    </a>
  );
}

export function DocTile({
  caption,
  driveUrl,
  children,
}: {
  caption: string;
  driveUrl: string | null | undefined;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start", width: "72px" }}>
      {children}
      <div style={{ display: "flex", alignItems: "center", gap: "3px", width: "100%" }}>
        <span style={{ fontSize: "10.5px", color: "var(--ink-muted)", whiteSpace: "nowrap" }}>{caption}</span>
        {driveUrl && (
          <a
            href={driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Mở ${caption} ở Drive`}
            aria-label={`Mở ${caption} ở Drive`}
            style={{ display: "inline-flex", color: "#1d4ed8" }}
          >
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Một nhóm số liệu, có tiêu đề ghi rõ PHẠM VI của cả nhóm.
 *
 * Tiêu đề không phải trang trí — nó là chỗ duy nhất trả lời "mấy con số này tính trên khoảng
 * nào". Trước đây phạm vi được gắn vào từng thẻ, làm chữ lặp ba lần trên một màn và làm hai
 * nhóm cao thấp khác nhau.
 *
 * `alignItems: flex-start` ở hàng thẻ: các thẻ tự cao bằng nội dung, không giãn theo thẻ cao
 * nhất — giãn ra thì con số bị đẩy lệch khỏi hàng ngang của nhóm bên kia.
 */
export function StatGroup({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    // `flex: 0 0 auto` — thẻ chỉ rộng bằng nội dung. Kéo giãn hết hàng là dựng lại đúng
    // khoảng trống có viền vừa bỏ đi.
    <div style={{
      display: "flex", flexDirection: "column", gap: "8px", flex: "0 0 auto",
      padding: "10px 18px",
      background: "var(--cream-dark)", border: "1px solid var(--border)", borderRadius: "6px",
    }}>
      {/* KHÔNG có ô điều khiển nào ở đây nữa. Bản trước nhét hai ô chọn phạm vi vào tiêu đề nhóm
          để nói rằng chúng chỉ đổi hai con số bên dưới — nhưng nay phạm vi lọc CẢ BẢNG, nên chỗ
          của nó là hàng lọc, cùng với các bộ lọc bảng khác. */}
      {/* TIÊU ĐỀ THẬT, không phải một nhãn nữa: đậm hơn và đậm màu hơn nhãn số bên dưới.
          Trước đây nó nhạt HƠN cả nhãn số, nên thứ bậc bị đảo ngược đúng chiều sai. */}
      <div style={{
        fontSize: "10px", fontWeight: 700, color: "var(--ink)",
        textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap",
      }}>
        {caption}
      </div>
      <div style={{ display: "flex", gap: "28px", flexWrap: "wrap", alignItems: "flex-start" }}>
        {children}
      </div>
    </div>
  );
}

/** Một số liệu trong dải tổng kết. */
export function Stat({ label, value, color, onClick, active }: {
  label: string;
  value: number;
  color?: string;
  /** Có thì thẻ thành nút lọc — bấm là lọc luôn, không bắt người dùng đi tìm ô lọc. */
  onClick?: () => void;
  active?: boolean;
  // KHÔNG có prop "dòng phụ" ở đây, và đó là chủ ý: phạm vi (tháng nào / toàn thời gian) là
  // thuộc tính của CẢ NHÓM, đã nói một lần ở StatGroup. Nhắc lại dưới từng thẻ làm chữ lặp
  // nhiều lần trên một màn và làm các nhóm cao thấp khác nhau.
}) {
  const body = (
    <div>
      {/* Nhãn NHỎ HƠN tiêu đề nhóm — người ta liếc dải này để đọc SỐ, không phải đọc chữ. */}
      <div style={{
        fontSize: "9.5px", color: "var(--ink-muted)", opacity: 0.8,
        textTransform: "uppercase", letterSpacing: "0.1em",
      }}>
        {label}
      </div>
      {/* SỐ 0 IM LẶNG. Trước đây "Chờ kiểm 0" nặng ngang "Tổng việc 6" — một con số không có gì
          để nói lại đòi bằng chỗ với con số quan trọng nhất. Làm nó nhạt đi cũng chính là cách
          để "Nộp muộn" màu đỏ nổi lên đúng như nó xứng đáng.
          `color` truyền vào vẫn THẮNG: đỏ là cảnh báo, không được nhạt hoá. */}
      <div style={{
        fontSize: "22px", fontWeight: 800, lineHeight: 1.15,
        color: color ?? (value === 0 ? "var(--ink-muted)" : "var(--ink)"),
        opacity: !color && value === 0 ? 0.45 : 1,
        ...numCell,
      }}>
        {value}
      </div>
    </div>
  );

  if (!onClick) return body;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer",
        // Gạch chân khi đang bật — để biết con số đang hiện có phải là bộ lọc hiện hành không.
        borderBottom: `2px solid ${active ? (color ?? "var(--ink)") : "transparent"}`,
      }}
    >
      {body}
    </button>
  );
}

/**
 * Nút NV 3D xác nhận đã nhận việc.
 *
 * Không chặn NV làm việc nếu chưa bấm: nếu họ ghi tiến độ trước, server tự đóng dấu nhận việc
 * (xem autoAcknowledgeOnProgress). Nút này để bàn giao được ghi nhận SỚM, ngay khi NV mở ra
 * thấy việc — chứ không phải một cửa ải phải qua.
 */
export function AcknowledgeBox({
  assignmentId,
  onAcknowledged,
}: {
  assignmentId: string;
  /** Nhận mốc nhận việc DO SERVER đóng dấu — không lấy giờ máy người dùng. */
  onAcknowledged: (acknowledgedAt: string) => void;
}) {
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      // Đây là CỬA DUY NHẤT để vào phần cập nhật, nên nó là nút bị bấm nhiều nhất màn này —
      // cũng là chỗ mà việc đợi cả vòng kéo lại danh sách gây phiền nhất.
      const saved = await fetchJson<{ acknowledgedAt: string }>(
        `/api/design-3d/assignments/${assignmentId}/acknowledge`,
        jsonBody({}),
      );
      toast.success("Đã xác nhận nhận việc");
      onAcknowledged(saved.acknowledgedAt);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      border: "1px solid #fde68a", background: "#fffbeb", borderRadius: "6px",
      padding: "12px", display: "flex", flexDirection: "column", gap: "8px",
    }}>
      {/* Nói rõ BẤM XONG THÌ ĐƯỢC GÌ. Bản cũ chỉ nêu lợi ích cho bộ phận khác ("để Đặt đơn
          biết"), nên với NV 3D nó giống một lời nhắc có thể bỏ qua — trong khi thực tế đây là
          cửa duy nhất để vào phần cập nhật. */}
      <div style={{ fontSize: "12px", color: "#92400e", lineHeight: 1.5 }}>
        <strong>Bạn chưa nhận việc này.</strong> Xác nhận để mở phần cập nhật tiến độ và
        File Render — đồng thời bộ phận Đặt đơn biết việc đã được bàn giao.
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving}
        className="psx-btn-primary"
        style={{ alignSelf: "flex-start", height: "32px", fontSize: "12px" }}
      >
        {saving ? "Đang xác nhận…" : "Xác nhận đã nhận việc"}
      </button>
    </div>
  );
}

/**
 * Một cụm thông tin có tiêu đề trong panel.
 *
 * VÌ SAO CẦN TIÊU ĐỀ CỤM: bản trước panel là một dãy 12 ô liền nhau không phân đoạn, nên
 * không có chỗ nào cho mắt nghỉ và không biết ô nào thuộc về việc gì. Tiêu đề cụm biến một
 * danh sách dài thành hai ba khối có nghĩa.
 */
export function PanelSection({
  title,
  children,
  collapsible,
  defaultCollapsed,
}: {
  title: string;
  children: React.ReactNode;
  /**
   * THU GỌN ĐƯỢC — dành cho các cụm CHỈ ĐỌC MỘT LẦN (thông số, tài liệu, ghi chú kỹ thuật).
   *
   * VÌ SAO CẦN: panel là một cột cuộn duy nhất và MỌI cụm đều mở, nên nó dài tới mức phải kéo
   * xuống mới thấy hết. Thông số sản phẩm thì NV 3D đọc một lần lúc bắt đầu rồi không nhìn lại,
   * mà nó chiếm chín dòng ngay giữa đường đi tới chỗ cập nhật tiến độ.
   *
   * Tiêu đề vẫn thấy, nên không có gì bị GIẤU — chỉ là không bày ra khi chưa cần.
   */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed && !!collapsible);
  const showBody = !collapsible || !collapsed;

  const header = (
    <div style={{
      fontSize: "10px", fontWeight: 700, color: "var(--ink-muted)",
      textTransform: "uppercase", letterSpacing: "0.07em",
      paddingBottom: "6px", borderBottom: "1px solid var(--border)", marginBottom: "2px",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px",
    }}>
      <span>{title}</span>
      {collapsible && <span style={{ fontSize: "11px" }}>{collapsed ? "▾" : "▴"}</span>}
    </div>
  );

  return (
    <div>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          style={{ display: "block", width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
        >
          {header}
        </button>
      ) : header}
      {showBody && children}
    </div>
  );
}

/**
 * Một dòng nhãn-trái / giá trị-phải.
 *
 * TRẢ NULL KHI KHÔNG CÓ GIÁ TRỊ — đây là điểm chính. Bản trước mọi ô đều hiện, ô rỗng thì
 * hiện một dấu "—", nên một phần tư panel là chỗ trống có nhãn. Panel nên nói những gì nó
 * biết; thứ chưa biết thì không cần một dòng để tuyên bố là chưa biết.
 */
export function PanelRow({ label, value, color, mono }: {
  label: string;
  value: string | null | undefined;
  color?: string;
  /** Chữ số thẳng hàng — cho ngày giờ, để các dòng ngày không so le nhau. */
  mono?: boolean;
}) {
  const text = value?.trim();
  if (!text || text === "—") return null;

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px",
      padding: "6px 0", borderBottom: "1px solid var(--border-light, #f0ede8)",
    }}>
      <span style={{ fontSize: "11.5px", color: "var(--ink-muted)", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{
        fontSize: "12.5px", textAlign: "right", overflowWrap: "anywhere",
        fontWeight: color ? 700 : 500, color: color ?? "var(--ink)",
        ...(mono ? numCell : {}),
      }}>
        {text}
      </span>
    </div>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "11px", color: "#92400e", background: "#fffbeb",
      border: "1px solid #fde68a", borderRadius: "5px", padding: "8px 10px",
    }}>
      {children}
    </div>
  );
}
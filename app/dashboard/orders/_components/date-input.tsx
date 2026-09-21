"use client";

import { useState, useEffect } from "react";
import { Calendar } from "lucide-react";
import { parseVnDate, todayVnYmd } from "@/app/lib/utils/vn-date";

// Ngày hôm nay theo giờ VN — định nghĩa gốc ở app/lib/utils/vn-date.ts (nguồn duy nhất).
// Re-export để các chỗ đang import từ file này (VD order-detail-panel) không phải đổi.
export { todayVnYmd };

// Ô nhập ngày dùng chung toàn hệ thống — LUÔN hiển thị dd/mm/yyyy bất kể locale máy user
// (native <input type="date"> hiển thị theo locale hệ thống, VD máy để tiếng Anh ra mm/dd/yyyy
// — gây lệch định dạng so với phần còn lại của app). Gõ tay theo dd/mm/yyyy, kèm icon lịch
// mở date-picker gốc của trình duyệt để chọn nhanh (input date ẩn, chỉ dùng làm picker).
//
// showTodayShortcut (opt-in): hiện chip "Hôm nay" — CHỈ khi field đang TRỐNG — cho phép điền
// nhanh 1 click thay vì gõ tay 8 số. Click là hành động TƯỜNG MINH (không phải side-effect của
// focus) nên không có rủi ro điền nhầm khi user chỉ lướt/tab qua ô. Sau khi điền, field vẫn là
// ô nhập tự do như bình thường — sửa tay/xoá về trống hoạt động y hệt (không phá tính nullable).
export function DateInput({
  value,
  onChange,
  disabled,
  className,
  style,
  showTodayShortcut = false,
  min,
  max,
}: {
  value: string; // ISO "YYYY-MM-DD"
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  showTodayShortcut?: boolean;
  /**
   * Khoảng ngày cho PICKER — lịch bấm sẽ mờ các ngày ngoài khoảng.
   *
   * ⚠️ KHÔNG CHẶN ĐƯỢC NGƯỜI GÕ TAY, vì ô hiện ra là ô chữ. Đây là tiện ích chọn nhanh, KHÔNG
   * phải một lớp bảo vệ — luật thật phải nằm ở server. Đặt tên `min`/`max` cho khớp thuộc tính
   * HTML mà nó truyền xuống, chứ không đặt thành `minYmd` để không ai tưởng đây là validate.
   */
  min?: string;
  max?: string;
}) {
  function isoToDMY(iso: string): string {
    if (!iso || iso.length < 10) return "";
    const [yyyy, mm, dd] = iso.split("-");
    return (dd && mm && yyyy) ? `${dd}/${mm}/${yyyy}` : "";
  }

  /**
   * "dd/mm/yyyy" → "YYYY-MM-DD", chuỗi rỗng nếu KHÔNG PHẢI MỘT NGÀY CÓ THẬT.
   *
   * ⚠️ DÙNG parseVnDate, KHÔNG TỰ KIỂM. Bản trước tự viết `m > 12 || d > 31` — lỏng đúng ở chỗ
   * chết người: "31/02/2026" qua được (31 ≤ 31, 2 ≤ 12) và được báo lên trên như một ngày hợp lệ.
   * Từ đó nó đi tiếp: nút Lưu chỉ hỏi "chuỗi ngày có rỗng không" nên bật; tới lúc gửi thì
   * vnWallToInstant mới trả null, mốc rơi khỏi payload, và server dùng mặc định "bây giờ" — người
   * dùng chọn 31/02, hệ thống ghi HÔM NAY, không một thông báo nào.
   *
   * parseVnDate kiểm bằng chính vnYmdToUtcMidnight (chặn ngày tràn: 31/02, 31/04, 29/02 năm không
   * nhuận), tức cùng một bộ luật với chỗ dựng mốc thật. Hai bộ kiểm lịch cho cùng một câu hỏi là
   * cách chắc chắn để một bên nói có còn bên kia nói không.
   */
  function dmyToIso(dmy: string): string {
    if (dmy.length !== 10) return "";
    return parseVnDate(dmy) ?? "";
  }

  const [text, setText] = useState(() => isoToDMY(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(isoToDMY(value));
  }, [value, focused]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    let fmt = digits;
    if (digits.length > 2) fmt = digits.slice(0, 2) + "/" + digits.slice(2);
    if (digits.length > 4) fmt = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
    setText(fmt);
    if (fmt.length === 10) onChange(dmyToIso(fmt) || "");
    else if (fmt.length === 0) onChange("");
  }

  function handleBlur() {
    setFocused(false);
    if (text.length > 0 && (text.length < 10 || !dmyToIso(text))) {
      setText(isoToDMY(value));
    }
  }

  function fillToday() {
    const iso = todayVnYmd();
    setText(isoToDMY(iso));
    onChange(iso);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      <input
        type="text"
        value={text}
        placeholder="dd/mm/yyyy"
        disabled={disabled}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        maxLength={10}
        className={className}
        style={{ flex: 1, minWidth: 0, ...style }}
      />
      {showTodayShortcut && !disabled && !value && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()} // giữ focus mượt, không nháy blur trước khi click ăn
          onClick={fillToday}
          style={{
            flexShrink: 0, fontSize: "10px", fontWeight: 600, whiteSpace: "nowrap",
            padding: "2px 6px", borderRadius: "4px", cursor: "pointer",
            background: "var(--cream-dark)", border: "1px solid var(--border)", color: "var(--ink-muted)",
          }}
        >
          Hôm nay
        </button>
      )}
      {!disabled && (
        <div style={{ position: "relative", flexShrink: 0, display: "flex", alignItems: "center", padding: "0 2px" }}>
          <Calendar style={{ width: "13px", height: "13px", color: "var(--ink-muted)", opacity: 0.5, pointerEvents: "none" }} />
          <input
            type="date"
            value={value}
            onChange={(e) => { onChange(e.target.value); setText(isoToDMY(e.target.value)); }}
            disabled={disabled}
            min={min}
            max={max}
            tabIndex={-1}
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

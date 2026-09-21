"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { maskHmInput, normalizeHm } from "@/app/lib/utils/vn-date";

// Ô nhập GIỜ dùng chung toàn hệ thống — LUÔN 24h "HH:mm" bất kể locale máy user.
//
// Bản sinh đôi của DateInput (cùng thư mục), và cùng lý do tồn tại: `<input type="time">` được
// TRÌNH DUYỆT vẽ theo locale hệ thống, máy để tiếng Anh thì ra "09:35 AM". Dự án đã giải đúng bài
// này cho NGÀY từ lâu — gõ tay theo định dạng của mình, giữ picker gốc của trình duyệt sau một cái
// icon (input native ẩn, chỉ dùng làm picker). File này chỉ mang cách đó sang cho GIỜ.
//
// ⚠️ VÌ SAO 24H LÀ BẮT BUỘC, KHÔNG PHẢI SỞ THÍCH: nhầm AM/PM lệch ĐÚNG 12 TIẾNG và lệch IM LẶNG —
// "09:35" hợp lệ ở cả hai nửa ngày nên không có gì để báo lỗi. Ở màn Tạm dừng con số đó đi thẳng
// vào "Giờ đã làm" rồi vào KPI; ở khai báo tăng ca nó đi vào tiền lương. Xem chú thích dài trong
// vn-date.ts.
export function TimeInput({
  value,
  onChange,
  disabled,
  className,
  style,
}: {
  /** "HH:mm" 24h, hoặc rỗng. */
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  // `draft === null` nghĩa là KHÔNG đang gõ → ô hiện thẳng giá trị từ ngoài vào.
  //
  // Cố ý KHÔNG dùng `useState` + `useEffect` đồng bộ hai chiều như DateInput: cách đó cần một
  // effect gọi setState, vừa vi phạm luật react-hooks/set-state-in-effect của dự án vừa thêm một
  // vòng render. Ở đây chỉ cần biết "người dùng có đang gõ dở không" — một giá trị, không cần
  // đồng bộ. Giá trị từ ngoài vào giữa lúc đang gõ thì KHÔNG được ghi đè, nếu không con trỏ nhảy
  // về cuối ô ngay giữa chừng.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskHmInput(e.target.value);
    setDraft(masked);
    // Chỉ báo lên trên khi đã đủ 4 số VÀ hợp lệ. Báo sớm thì gõ "0" (chưa xong) đã thành 00:00 và
    // các ô ăn theo (xem trước deadline, tháng KPI) nhấp nháy theo từng phím.
    if (masked.length === 5) {
      const hm = normalizeHm(masked);
      if (hm) onChange(hm);
    } else if (masked.length === 0) {
      onChange("");
    }
  }

  function handleBlur() {
    // Gõ tắt thành đầy đủ: "17" → "17:00". Không đọc được thì bỏ bản nháp, ô quay về giá trị đang
    // có — để lại một chuỗi dở dang thì nó trông như đã nhập xong.
    const hm = draft === null ? null : normalizeHm(draft);
    if (hm && hm !== value) onChange(hm);
    setDraft(null);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        placeholder="HH:mm"
        disabled={disabled}
        onChange={handleChange}
        onFocus={() => setDraft(value)}
        onBlur={handleBlur}
        maxLength={5}
        className={className}
        style={{ flex: 1, minWidth: 0, ...style }}
      />
      {!disabled && (
        <div style={{ position: "relative", flexShrink: 0, display: "flex", alignItems: "center", padding: "0 2px" }}>
          <Clock style={{ width: "13px", height: "13px", color: "var(--ink-muted)", opacity: 0.5, pointerEvents: "none" }} />
          {/* Input native ẩn — CHỈ dùng làm picker. Giá trị nó trả về luôn là "HH:mm" 24h theo
              chuẩn HTML, bất kể nó hiện AM/PM hay không; thứ hiện ra cho người dùng là ô chữ bên
              trái. tabIndex={-1} để bàn phím đi thẳng qua, không kẹt vào một ô vô hình. */}
          <input
            type="time"
            value={value}
            onChange={(e) => { onChange(e.target.value); setDraft(null); }}
            disabled={disabled}
            tabIndex={-1}
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

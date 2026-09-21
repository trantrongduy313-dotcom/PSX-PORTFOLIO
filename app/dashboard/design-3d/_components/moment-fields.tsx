"use client";

import { DateInput } from "@/app/dashboard/orders/_components/date-input";
import { TimeInput } from "@/app/dashboard/orders/_components/time-input";

// File RIÊNG chứ không để trong design-3d-client: tab Tăng ca cũng dùng, mà file đó đã import
// OvertimePanel — để nguyên thì thành import vòng. Và một ô ngày/giờ dùng chung ở hai màn thì
// đằng nào cũng nên có chỗ ở riêng.

/**
 * Ô ngày + ô giờ đứng cạnh nhau — cùng khuôn với khối Giao việc ở Danh sách đơn hàng.
 *
 * ⚠️ DÙNG DateInput/TimeInput, KHÔNG dùng `<input type="date|time">` trần.
 *
 * Ô native được TRÌNH DUYỆT vẽ theo locale máy: máy đặt vùng Mỹ thì ra `08/14/2026` và `09:35 AM`,
 * trong khi mọi chữ app tự vẽ là dd/mm/yyyy 24h — một màn hình hai quy ước, và `08/09/2026` không
 * đọc được là 9/8 hay 8/9. Không có CSS hay thuộc tính nào đổi được (`lang="vi-VN"` không đáng
 * tin: Chrome theo locale giao diện trình duyệt, Firefox theo cài đặt vùng của HĐH).
 *
 * Dự án đã giải đúng bài này cho NGÀY từ lâu bằng DateInput — gõ tay theo định dạng của mình, giữ
 * picker gốc sau một cái icon. Màn 3D chỉ là chưa dùng tới. TimeInput là bản sinh đôi cho GIỜ.
 */
export function MomentFields({
  label,
  ymd,
  hm,
  onYmd,
  onHm,
  minYmd,
  maxYmd,
}: {
  label: string;
  ymd: string;
  hm: string;
  onYmd: (v: string) => void;
  onHm: (v: string) => void;
  /**
   * Chặn ngay ở ô nhập thay vì để server trả lỗi sau khi bấm.
   *
   * ⚠️ CHỈ CÒN TÁC DỤNG VỚI PICKER (lịch bấm sẽ mờ các ngày ngoài khoảng), không chặn được người
   * gõ tay — DateInput là ô chữ. Chặn thật vẫn nằm ở server (deniedReasonForPauseAt và các luật
   * cùng họ), nên đây thuần là giúp chọn nhanh, không phải một lớp bảo vệ.
   */
  minYmd?: string;
  maxYmd?: string;
}) {
  const boxStyle: React.CSSProperties = {
    fontSize: "12px", padding: "6px 8px",
    border: "1px solid var(--border)", borderRadius: "5px", background: "var(--cream)",
  };
  return (
    <div>
      {/* NHÃN KHÔNG ĐƯỢC XUỐNG DÒNG. Khi component này nằm cạnh một ô khác trong lưới hai cột,
          một nhãn dài hơn sẽ tràn thành hai dòng và đẩy ô của nó tụt xuống — hai ô lệch cao độ,
          nhìn như bố cục hỏng. Cột chứa nó phải đủ rộng (dùng `auto`, không `1fr`). */}
      <div style={{
        fontSize: "10.5px", fontWeight: 600, color: "var(--ink-body)",
        marginBottom: "3px", whiteSpace: "nowrap",
      }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DateInput value={ymd} onChange={onYmd} min={minYmd} max={maxYmd} style={boxStyle} />
        </div>
        <div style={{ width: "104px", flexShrink: 0 }}>
          <TimeInput value={hm} onChange={onHm} style={boxStyle} />
        </div>
      </div>
    </div>
  );
}

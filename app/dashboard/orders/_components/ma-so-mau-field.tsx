"use client";

import { canEditMaSoMau } from "@/app/lib/business/orders/ma-so-mau";

// ─── Ô "MÃ SỐ MẪU" ───────────────────────────────────────────────────────────
//
// Một ô nhập BÌNH THƯỜNG. Nó đi theo nút Lưu chung ở footer, chịu chung cơ chế "chưa lưu" như
// 40 ô còn lại của tab Sản phẩm. Không state lưu, không fetch, không nút riêng.
//
// 🔴 HAI BẢN TRƯỚC CỦA FILE NÀY ĐÃ SAI, VÀ SAI THEO HAI KIỂU KHÁC NHAU:
//
//   1. Tự lưu khi RỜI Ô, không nút, không dòng trạng thái. R&D gõ xong, nhìn quanh không thấy
//      nút Lưu nào (footer biến mất cùng chế độ chỉ-đọc) và kết luận hệ thống từ chối họ.
//   2. Thêm một nút "Lưu" RIÊNG cạnh ô. Hết mù mờ, nhưng đẻ ra một luật riêng: một ô trong form
//      lại có nút lưu của chính nó, và vẫn ghi cả khi người dùng chỉ gõ thử rồi bỏ đi.
//
// Người dùng bác cả hai với cùng một lý do: KHÔNG BẤM LƯU THÌ KHÔNG ĐƯỢC GHI. Đó là hợp đồng
// của mọi ô khác trên màn hình này, và một ô phá lệ là một thứ phải nhớ.
//
// Cái thật sự thiếu không nằm ở ô này — mà ở chỗ vai chỉ-đọc KHÔNG CÓ footer. Sửa ở đó (xem
// `isPartialWriteRole` trong item-writable-fields.ts), không sửa ở đây bằng một cơ chế thứ hai.

type Props = {
  itemZone: string | null | undefined;
  value: string;
  role: string | undefined;
  disabled?: boolean;
  onChange: (next: string) => void;
};

export function MaSoMauField({ itemZone, value, role, disabled, onChange }: Props) {
  // ⚠️ KHÔNG hỏi `isReadOnly` của panel. Với R&D panel là chỉ-đọc TOÀN BỘ, và ô này là ngoại lệ
  // duy nhất — nó có luật riêng, hỏi thẳng ở business layer.
  if (!canEditMaSoMau(role, itemZone)) {
    // Vai không nhập được vẫn PHẢI THẤY: xưởng cần biết MO này đã có mã hay chưa.
    return (
      <div className="psx-input text-sm cursor-not-allowed" style={{ minHeight: "36px", lineHeight: "36px" }}>
        {value.trim() ? value : "—"}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Nhập mã số mẫu…"
      className="psx-input text-sm"
    />
  );
}

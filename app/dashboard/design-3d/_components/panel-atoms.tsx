"use client";

// ─── Nhãn dùng chung của màn Việc thiết kế 3D ─────────────────────────────────
//
// Tách ra vì `progress-form.tsx` cần đúng hai atom này. Nếu để chúng ở design-3d-client.tsx rồi
// export, form sẽ import từ client mà client lại import form — một vòng tròn import, thứ chạy
// được cho tới một ngày thứ tự nạp module đổi và một trong hai bên nhận `undefined`.
//
// 📌 VÀ NÓ DẸP MỘT BẢN SAO ĐÃ CÓ SẴN: `overtime-panel.tsx` từng khai `SubLabel` của riêng nó,
// giống bản kia TỪNG BYTE. Hai nơi lưu cùng một sự thật thì sớm muộn lệch — ở đây "lệch" nghĩa
// là hai khối trên cùng một panel có cỡ chữ nhãn khác nhau, và không ai biết bản nào mới đúng.

/** Nhãn của một cụm — chữ nhỏ, IN HOA, giãn chữ. */
export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "10px", color: "var(--ink-muted)",
      textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px",
    }}>
      {children}
    </div>
  );
}

/** Nhãn của một ô nhập — chữ thường, nhẹ hơn `Label`. */
export function SubLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: "11px", color: "var(--ink-muted)", marginBottom: "3px" }}>{children}</div>;
}

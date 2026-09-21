"use client";

import { useState } from "react";
import { XI_MA_OPTIONS, parseXiMa, joinXiMa } from "@/app/lib/business/product-options";

// Ô chọn Xi mạ dùng chung cho cả form tạo đơn lẫn panel chi tiết.
// Cho phép CHỌN NHIỀU (kết hợp, VD 14KY + 24K) qua checkbox, nhưng vẫn lưu/nhận về
// dưới dạng MỘT chuỗi nối "/" (platingType là string) — không đổi schema, tương thích
// dữ liệu cũ (1 giá trị = 1 ô tick). Styling neo theo class `psx-input` để khớp các ô
// nhập còn lại của hệ thống.
export function PlatingSelect({
  value,
  onChange,
  disabled,
  hasError,
  className,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);

  const selected = parseXiMa(value);
  const selectedSet = new Set(selected);
  // Giữ lại giá trị lạ (ngoài danh sách chuẩn) để user vẫn thấy và có thể bỏ chọn.
  const extras = selected.filter((s) => !XI_MA_OPTIONS.includes(s as (typeof XI_MA_OPTIONS)[number]));
  const allOptions: string[] = [...XI_MA_OPTIONS, ...extras];

  function toggle(opt: string) {
    const next = new Set(selectedSet);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange(joinXiMa([...next]));
  }

  return (
    <div style={{ position: "relative", ...style }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={className}
        style={{
          width: "100%",
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
          ...(hasError ? { borderBottomColor: "var(--s-red)", borderBottomWidth: "2px" } : {}),
          ...(disabled ? { opacity: 0.6, background: "var(--cream-dark)" } : {}),
        }}
      >
        {value ? value : "-- Chọn --"}
      </button>

      {open && !disabled && (
        <>
          {/* Backdrop trong suốt để click ra ngoài là đóng */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 50,
              marginTop: "2px",
              background: "var(--cream-card)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
              padding: "4px",
              maxHeight: "220px",
              overflowY: "auto",
            }}
          >
            {allOptions.map((opt) => (
              <label
                key={opt}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 8px",
                  fontSize: "12px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <input type="checkbox" checked={selectedSet.has(opt)} onChange={() => toggle(opt)} />
                {opt}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

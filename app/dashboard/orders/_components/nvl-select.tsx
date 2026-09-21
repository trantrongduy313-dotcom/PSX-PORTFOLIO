"use client";

import { useState } from "react";
import {
  NVL_OPTIONS,
  parseNvl,
  joinNvl,
  metalFamilyOf,
  metalFamiliesIn,
} from "@/app/lib/business/product-options";

// Ô chọn NVL dùng chung cho cả form tạo đơn lẫn panel chi tiết.
// Cho phép CHỌN NHIỀU (kết hợp, VD 18KW + 18KY, hoặc 24K + 18KY) qua checkbox, thay cho
// các option tổ hợp cứng cũ ("18KW/KY", "24K/18KY"…). Vẫn lưu/nhận về MỘT chuỗi nối "/"
// nên KHÔNG đổi schema và tương thích dữ liệu cũ: giá trị tổ hợp cũ hiện ra như một mục
// "(dữ liệu cũ)" để user thấy và bỏ chọn được, không bị mất.
//
// Kết quả quy đổi (QĐ 24K/PT/Bạc) ĐỘC LẬP với thứ tự tick — xem rule MAX trong
// calcAutoProduction (app/lib/utils/order-helpers.ts).
export function NvlSelect({
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

  const selected = parseNvl(value);
  const selectedSet = new Set(selected);
  // Giữ lại giá trị lạ (tổ hợp cũ / mã ngoài danh sách chuẩn) để user vẫn thấy và bỏ chọn được.
  const extras = selected.filter((s) => !NVL_OPTIONS.includes(s as (typeof NVL_OPTIONS)[number]));
  const allOptions: string[] = [...NVL_OPTIONS, ...extras];

  // Cảnh báo sản phẩm 2 chất liệu: công thức áp tỷ lệ cho TOÀN BỘ trọng lượng theo từng họ
  // kim loại, nên tick 2 họ (vàng + PT + bạc) sẽ sinh 2 dòng quy đổi cho cùng 1 trọng lượng
  // → tổng ở báo cáo cộng cả hai. Không tự sửa công thức, chỉ làm rủi ro NHÌN THẤY được.
  const families = metalFamiliesIn(value);
  const multiFamily = families.length > 1;

  function toggle(opt: string) {
    const next = new Set(selectedSet);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange(joinNvl([...next]));
  }

  const FAMILY_LABEL: Record<string, string> = { GOLD: "Vàng", PT: "Platinum", SILVER: "Bạc" };

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
              minWidth: "180px",
              background: "var(--cream-card)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
              padding: "4px",
              maxHeight: "260px",
              overflowY: "auto",
            }}
          >
            {multiFamily && (
              <div
                style={{
                  fontSize: "10px",
                  lineHeight: 1.35,
                  color: "#b45309",
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "4px",
                  padding: "5px 6px",
                  margin: "2px 2px 5px",
                }}
              >
                ⚠ Sản phẩm 2 chất liệu ({families.map((f) => FAMILY_LABEL[f] ?? f).join(" + ")}) — tổng
                quy đổi sẽ tính <strong>cả 2 loại</strong> cho cùng trọng lượng.
              </div>
            )}
            {allOptions.map((opt) => {
              const checked = selectedSet.has(opt);
              const isExtra = !NVL_OPTIONS.includes(opt as (typeof NVL_OPTIONS)[number]);
              return (
                <label
                  key={opt}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "5px 8px",
                    fontSize: "12px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(opt)} />
                  <span style={{ color: isExtra ? "var(--ink-muted)" : "inherit" }}>
                    {opt}
                    {isExtra ? " (dữ liệu cũ)" : ""}
                  </span>
                  {!isExtra && (
                    <span style={{ marginLeft: "auto", fontSize: "9px", color: "var(--ink-muted)", opacity: 0.7 }}>
                      {FAMILY_LABEL[metalFamilyOf(opt)] ?? ""}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

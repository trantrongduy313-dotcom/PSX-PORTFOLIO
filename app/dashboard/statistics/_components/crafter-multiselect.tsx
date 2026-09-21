"use client";

import { useState, useRef, useEffect } from "react";

// Dropdown chọn NHIỀU thợ — component thuần, không biết gì về KPI/Đánh giá Khâu,
// dùng lại được ở bất kỳ màn nào cần chọn nhiều thợ (hiện dùng cho In KPI Thợ SX).
export function CrafterMultiselect({
  options, selected, onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name]);

  const label = selected.length === 0
    ? "Tất cả thợ"
    : selected.length === 1
    ? selected[0]
    : `${selected.length} thợ đã chọn`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="psx-input"
        style={{ fontSize: "12px", width: "160px", textAlign: "left", cursor: "pointer" }}
      >
        {label}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 20,
          background: "var(--cream-card)", border: "1px solid var(--border)", borderRadius: "6px",
          boxShadow: "0 6px 20px rgba(0,0,0,0.12)", width: "220px", maxHeight: "280px", overflow: "auto",
          padding: "6px",
        }}>
          <div style={{ display: "flex", gap: "6px", padding: "2px 4px 6px", borderBottom: "1px solid var(--border)", marginBottom: "4px" }}>
            <button type="button" onClick={() => onChange(options)} style={miniBtn}>Chọn tất cả</button>
            <button type="button" onClick={() => onChange([])} style={miniBtn}>Bỏ chọn hết</button>
          </div>
          {options.length === 0 && (
            <div style={{ fontSize: "12px", color: "var(--ink-muted)", padding: "6px 4px" }}>Không có thợ</div>
          )}
          {options.map((name) => (
            <label key={name} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "4px", cursor: "pointer" }}>
              <input type="checkbox" checked={selected.includes(name)} onChange={() => toggle(name)} />
              <span>{name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  fontSize: "10px", padding: "2px 6px", border: "1px solid var(--border)", borderRadius: "4px",
  background: "transparent", color: "var(--ink-muted)", cursor: "pointer",
};

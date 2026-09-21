"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// Hai dropdown chon-nhieu cua tab Ky thuat. Ca hai giu trang thai dong/mo cua rieng minh
// va dong khi bam ra ngoai - khong phan nao biet ve don hang hay MO.

export const PHAN_LOAI_KT_OPTIONS = ["TRƠN", "NATURAL", "M.MÁY", "LAB", "CZ", "ĐÁ", "ĐÁ MÀU", "NGỌC TRAI"];

export function PhanLoaiKtSelect({ value, onChange, disabled = false }: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const label = value.length === 0
    ? "-- Chọn --"
    : value.length <= 3
      ? value.join(" · ")
      : `${value.slice(0, 3).join(" · ")} +${value.length - 3}`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          width: "100%", padding: "4px 8px",
          background: "var(--cream-card, #fff)",
          border: "1px solid var(--border, #e5e7eb)",
          fontSize: "12px",
          color: value.length ? "var(--ink, #1a1a1a)" : "var(--ink-muted, #9ca3af)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: 1,
          textAlign: "left",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <ChevronDown style={{ width: "11px", height: "11px", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0,
          background: "var(--cream-card, #fff)",
          border: "1px solid var(--border, #e5e7eb)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          zIndex: 200,
        }}>
          {PHAN_LOAI_KT_OPTIONS.map((opt) => {
            const checked = value.includes(opt);
            return (
              <label
                key={opt}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "6px 10px",
                  fontSize: "12px",
                  color: "var(--ink, #1a1a1a)",
                  cursor: "pointer",
                  background: checked ? "rgba(37,99,235,0.06)" : "transparent",
                  borderBottom: "1px solid var(--border, #f3f4f6)",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = "var(--cream-dark, #f9fafb)"; }}
                onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(checked ? value.filter(x => x !== opt) : [...value, opt])}
                  style={{ width: "13px", height: "13px", accentColor: "#2563eb", cursor: "pointer" }}
                />
                <span style={{ fontWeight: checked ? 600 : 400, color: checked ? "#2563eb" : "inherit" }}>{opt}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tag multi-select dropdown dùng cho Loại hột ──────────────────────────────
export function StoneTypeTagDropdown({
  value, disabled, options, onChange,
}: {
  value: string | null;
  disabled: boolean;
  options: readonly string[];
  onChange: (val: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = (value ?? "").split(",").map(s => s.trim()).filter(Boolean);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (o: string) => {
    const next = selected.includes(o) ? selected.filter(s => s !== o) : [...selected, o];
    onChange(next.length ? next.join(", ") : null);
  };

  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <div
        onClick={() => !disabled && setOpen(v => !v)}
        className="psx-input text-xs"
        style={{
          display: "flex", alignItems: "center", flexWrap: "wrap",
          gap: "3px", minHeight: "26px", padding: "2px 24px 2px 6px",
          cursor: disabled ? "default" : "pointer", userSelect: "none", position: "relative",
        }}
      >
        {selected.length === 0 && (
          <span style={{ color: "var(--ink-muted)" }}>-- Chọn --</span>
        )}
        {selected.map(s => (
          <span key={s} style={{
            display: "inline-flex", alignItems: "center", gap: "2px",
            background: "rgba(236,72,153,0.1)", color: "var(--pink)",
            borderRadius: "4px", padding: "1px 5px", fontSize: "10px", fontWeight: 500,
          }}>
            {s}
            {!disabled && (
              <span
                onClick={(e) => { e.stopPropagation(); toggle(s); }}
                style={{ cursor: "pointer", fontWeight: 700, marginLeft: "1px", lineHeight: 1 }}
              >×</span>
            )}
          </span>
        ))}
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-gray-400" style={{ pointerEvents: "none" }} />
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 2px)", left: 0, zIndex: 50,
          background: "var(--cream-card)", border: "1px solid var(--border)",
          borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          padding: "4px 0", minWidth: "150px",
        }}>
          {options.map(o => (
            <label key={o} style={{
              display: "flex", alignItems: "center", gap: "7px",
              padding: "5px 12px", fontSize: "11px", cursor: "pointer",
              background: selected.includes(o) ? "rgba(236,72,153,0.06)" : "transparent",
            }}>
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={() => toggle(o)}
                style={{ width: "11px", height: "11px", accentColor: "var(--pink)", flexShrink: 0 }}
              />
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

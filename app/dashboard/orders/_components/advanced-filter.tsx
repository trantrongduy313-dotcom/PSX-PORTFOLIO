"use client";

import { useMemo, useState } from "react";
import { Filter, X } from "lucide-react";
import {
  COLUMN_FILTER_DEFS,
  COLUMN_FILTER_BY_ID,
  distinctOptions,
  hasEffectiveFilter,
  type ActiveColumnFilters,
  type ColumnFilterValue,
  type ColumnFilterDef,
} from "./column-filters";

// Panel "Lọc nâng cao" — thêm điều kiện lọc trên BẤT KỲ trường nào (kiểu Google Sheet).
// UI tự suy ra theo `type` của cột (text / select / number-range). Cộng dồn quick-filter.
type Row = Record<string, unknown> & { firstItem?: Record<string, unknown> | null };

const emptyValue = (type: string): ColumnFilterValue =>
  type === "text" ? { type: "text", value: "" }
  : type === "select" ? { type: "select", value: [] }
  : { type: "number-range", value: { min: "", max: "" } };

// Body của filter dạng "select" — có ô tìm, nút Chọn/Bỏ tất cả (như Google Sheet),
// và LUÔN hiện các giá trị đang chọn (kể cả không có trong tab hiện tại) để quản lý xuyên tab.
function SelectFilterBody({
  rows, def, selected, onChange,
}: {
  rows: Row[];
  def: ColumnFilterDef;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [q, setQ] = useState("");
  // options = giá trị có trong tab hiện tại ∪ giá trị đang chọn (để luôn thấy & bỏ chọn được).
  const allOptions = useMemo(() => {
    const set = new Set<string>(distinctOptions(rows, def));
    for (const v of selected) set.add(v);
    return [...set].sort((a, b) => a.localeCompare(b, "vi"));
  }, [rows, def, selected]);
  const visible = q.trim() === ""
    ? allOptions
    : allOptions.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()));
  const selectedSet = new Set(selected);

  const selectAllVisible = () => onChange([...new Set([...selected, ...visible])]);
  const clearAllVisible = () => onChange(selected.filter((v) => !visible.includes(v)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm giá trị…" className="psx-input" style={{ fontSize: "12px", width: "100%" }} />
      <div style={{ display: "flex", gap: "10px", fontSize: "11px" }}>
        <button type="button" onClick={selectAllVisible}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink)", textDecoration: "underline", padding: 0 }}>
          Chọn tất cả
        </button>
        <button type="button" onClick={clearAllVisible}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", textDecoration: "underline", padding: 0 }}>
          Bỏ chọn tất cả
        </button>
      </div>
      {/* KHÔNG tự cuộn riêng — chỉ panel ngoài (Lọc nâng cao) mới cuộn. Danh sách checkbox lồng
          thêm 1 vùng cuộn riêng khiến khi có ≥2 điều kiện, con trỏ đứng trên danh sách này chỉ
          cuộn được chính nó, không chạm tới panel ngoài để thấy/thêm điều kiện tiếp theo. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        {visible.map((opt) => {
          const checked = selectedSet.has(opt);
          const absent = !distinctOptions(rows, def).includes(opt); // đang chọn nhưng không có ở tab này
          return (
            <label key={opt} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
              <input type="checkbox" checked={checked}
                onChange={() => onChange(checked ? selected.filter((v) => v !== opt) : [...selected, opt])} />
              <span style={{ color: absent ? "var(--ink-muted)" : "inherit" }}>
                {opt}{absent ? " (khác tab)" : ""}
              </span>
            </label>
          );
        })}
        {visible.length === 0 && (
          <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>Không có giá trị</span>
        )}
      </div>
    </div>
  );
}

export function AdvancedFilter({
  rows,
  filters,
  onChange,
}: {
  rows: Row[];
  filters: ActiveColumnFilters;
  onChange: (next: ActiveColumnFilters) => void;
}) {
  const [open, setOpen] = useState(false);

  const activeIds = Object.keys(filters).filter((id) => filters[id] && hasEffectiveFilter(filters[id]));
  const activeCount = activeIds.length;

  // Danh sách cột chưa được thêm — để chọn thêm điều kiện.
  const availableToAdd = COLUMN_FILTER_DEFS.filter((d) => !(d.id in filters));

  const setFilter = (id: string, value: ColumnFilterValue) => onChange({ ...filters, [id]: value });
  const removeFilter = (id: string) => {
    const next = { ...filters };
    delete next[id];
    onChange(next);
  };
  const clearAll = () => onChange({});

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="psx-btn-secondary"
        style={{ display: "flex", alignItems: "center", gap: "5px", height: "30px", fontSize: "11px" }}
      >
        <Filter style={{ width: "12px", height: "12px" }} />
        Lọc nâng cao
        {activeCount > 0 && (
          <span style={{
            background: "var(--ink)", color: "var(--cream)", borderRadius: "9px",
            fontSize: "10px", padding: "0 6px", fontWeight: 700, lineHeight: "16px",
          }}>{activeCount}</span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", top: "100%", right: 0, zIndex: 50, marginTop: "4px",
            width: "340px", maxHeight: "70vh", overflowY: "auto",
            background: "var(--cream-card)", border: "1px solid var(--border)",
            borderRadius: "8px", boxShadow: "0 8px 28px rgba(0,0,0,0.16)", padding: "12px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700 }}>Lọc nâng cao</span>
              {activeCount > 0 && (
                <button type="button" onClick={clearAll}
                  style={{ fontSize: "11px", color: "var(--s-red)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  Xoá tất cả lọc
                </button>
              )}
            </div>

            {/* Các điều kiện đang có */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {Object.keys(filters).map((id) => {
                const def = COLUMN_FILTER_BY_ID.get(id);
                if (!def) return null;
                const f = filters[id];
                return (
                  <div key={id} style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-body)" }}>{def.label}</span>
                      <button type="button" onClick={() => removeFilter(id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: 0 }}>
                        <X style={{ width: "13px", height: "13px" }} />
                      </button>
                    </div>

                    {f.type === "text" && (
                      <input type="text" autoFocus value={f.value}
                        onChange={(e) => setFilter(id, { type: "text", value: e.target.value })}
                        placeholder="Chứa…" className="psx-input" style={{ fontSize: "12px", width: "100%" }} />
                    )}

                    {f.type === "select" && (
                      <SelectFilterBody rows={rows} def={def} selected={f.value}
                        onChange={(next) => setFilter(id, { type: "select", value: next })} />
                    )}

                    {f.type === "number-range" && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input type="number" value={f.value.min} placeholder="Từ"
                          onChange={(e) => setFilter(id, { type: "number-range", value: { ...f.value, min: e.target.value } })}
                          className="psx-input" style={{ fontSize: "12px", flex: 1, minWidth: 0 }} />
                        <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>–</span>
                        <input type="number" value={f.value.max} placeholder="Đến"
                          onChange={(e) => setFilter(id, { type: "number-range", value: { ...f.value, max: e.target.value } })}
                          className="psx-input" style={{ fontSize: "12px", flex: 1, minWidth: 0 }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Thêm điều kiện mới */}
            {availableToAdd.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <select value="" className="psx-input" style={{ fontSize: "12px", width: "100%" }}
                  onChange={(e) => { const d = COLUMN_FILTER_BY_ID.get(e.target.value); if (d) setFilter(d.id, emptyValue(d.type)); }}>
                  <option value="">+ Thêm trường lọc…</option>
                  {availableToAdd.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { formatWorkloadLoad, type DesignerWorkload } from "@/app/lib/business/kpi-3d/workload";

// ─── Ô chọn Nhân viên Thiết kế 3D, kèm tải công việc ─────────────────────────
//
// VÌ SAO KHÔNG DÙNG <select> GỐC: thẻ đó có hai giới hạn cứng, và cả hai đều làm hỏng đúng
// việc ta cần làm ở đây.
//
//   1. <option> KHÔNG nhận định dạng — không màu, không căn lề, không chip. Mọi thứ buộc phải
//      nhét vào một chuỗi phẳng, nên tải công việc thành "Tên · 2 việc · 6h · 1 quá hạn".
//      Trông như dữ liệu thô vì đúng là dữ liệu thô, và cảnh báo quá hạn chìm lẫn vào chữ xám.
//
//   2. Ô khi ĐÓNG hiển thị nguyên văn option đã chọn. Nên chọn xong rồi mà ô vẫn đọc
//      "Thanh Vũ · rảnh" — thông tin hỗ trợ quyết định biến thành một phần của GIÁ TRỊ, trong
//      khi quyết định đã xong. Điều này KHÔNG sửa được bằng CSS: với select gốc thì hoặc
//      option giàu thông tin và ô bẩn, hoặc ô sạch và option trống trơn.
//
// Nên đóng thì chỉ hiện TÊN, mở ra mới hiện tải — tên căn trái, tải căn phải, quá hạn tô đỏ.
//
// Bám đúng mẫu ô chọn tuỳ biến app đã dùng (NvlSelect, PlatingSelect): nút hiện giá trị +
// panel định vị tuyệt đối + backdrop trong suốt để bấm ra ngoài là đóng.

export type Designer3DOption = {
  id: string;
  name: string;
  code: string | null;
};

type Props = {
  value: string;
  onChange: (name: string) => void;
  options: Designer3DOption[];
  /** Tra theo TÊN. Rỗng khi người dùng không có quyền xem tải (chỉ ADMIN/ORDER). */
  workloadByName?: Map<string, { workload: DesignerWorkload }>;
  disabled?: boolean;
  className?: string;
};

const label = (d: Designer3DOption) => (d.code ? `${d.code} - ${d.name}` : d.name);

export function Designer3DSelect({ value, onChange, options, workloadByName, disabled, className }: Props) {
  const [open, setOpen] = useState(false);

  // Esc để đóng — bàn phím phải thoát được khỏi lớp phủ, không chỉ chuột.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // NV đã nghỉ/ẩn khỏi danh mục vẫn phải chọn lại được, nếu không việc đã giao cho họ sẽ lặng
  // lẽ bị đổi sang "—" ngay lần lưu kế tiếp.
  const known = options.some((d) => d.name === value);
  const rows: Designer3DOption[] = known || !value
    ? options
    : [...options, { id: `__unknown__${value}`, name: value, code: null }];

  const selected = options.find((d) => d.name === value);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={className}
        style={{
          width: "100%", textAlign: "left", cursor: disabled ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", gap: "6px",
          ...(disabled ? { opacity: 0.6 } : {}),
        }}
      >
        {/* Chỉ TÊN. Tải công việc không thuộc về giá trị đã chọn. */}
        <span className="truncate flex-1">{value ? (selected ? label(selected) : value) : "—"}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-400" />
      </button>

      {open && !disabled && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-40" />
          <div
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg"
            style={{ minWidth: "260px" }}
          >
            <Row onPick={() => { onChange(""); setOpen(false); }} active={!value}>
              <span className="text-gray-400">—</span>
            </Row>

            {rows.map((d) => {
              const w = workloadByName?.get(d.name)?.workload;
              return (
                <Row
                  key={d.id}
                  active={d.name === value}
                  onPick={() => { onChange(d.name); setOpen(false); }}
                >
                  <span className="truncate">{label(d)}</span>
                  {w && (
                    <span className="ml-auto shrink-0 flex items-center gap-1.5 pl-3">
                      {/* Quá hạn tách riêng và TÔ ĐỎ — nó là cảnh báo, không được chìm lẫn
                          vào cùng dòng chữ xám với số việc. */}
                      {w.overdueCount > 0 && (
                        <span className="text-[10px] font-semibold text-red-600">
                          {w.overdueCount} quá hạn
                        </span>
                      )}
                      <span className={w.openCount === 0
                        ? "rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                        : "text-[11px] tabular-nums text-gray-500"}>
                        {formatWorkloadLoad(w)}
                      </span>
                    </span>
                  )}
                </Row>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ children, onPick, active }: { children: React.ReactNode; onPick: () => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-gray-50 ${
        active ? "bg-gray-100 font-medium" : ""
      }`}
    >
      {children}
    </button>
  );
}

"use client";

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnPinningState,
  type RowData,
} from "@tanstack/react-table";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLabels, useLocale } from "@/app/lib/i18n/locale-context";
import { LABELS } from "@/app/lib/i18n/labels";
import type { Labels } from "@/app/lib/i18n/labels";
import {
  ArrowUpDown, ArrowUp, ArrowDown,
  AlertTriangle, Clock, ChevronLeft, ChevronRight,
} from "lucide-react";
import { StatusBadge, ZoneBadge } from "./status-badge";
import { formatDate, isOverdue } from "@/app/lib/utils";
import { getBaseSoNumber, getISOWeek, getStageStatusLabel } from "@/app/lib/utils/order-helpers";
import { getMoVersionDisplay, NEW_VERSION_SEPARATOR } from "@/app/lib/business/order-helpers";
import { toBomStatus, BOM_STATUS_BADGE, BOM_STATUS_COLORS, BOM_STATUS_LABELS } from "@/app/lib/business/bom";
// `kpiResultBadge` / `reviewBadge` / `TONE_HEX` đã bỏ cùng cột KẾT QUẢ 3D — chúng chỉ phục vụ
// cột đó. Trạng thái duyệt 3D vẫn hiện đầy đủ ở tab Thiết kế của sidebar.
import { ContentSkeleton } from "./table-skeleton";
import { DesignFilePreview } from "./design-file-preview";
import type { OrderSummary, OrderTab, Pagination } from "@/app/lib/types/order";

// `align` là thuộc tính RIÊNG của dự án gắn vào ColumnDef của TanStack — phải khai bằng module
// augmentation, nếu không TypeScript coi `meta` là `unknown` và mọi chỗ đọc nó phải ép kiểu.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** "num" = canh phải + tabular-nums (cột số). "tab" = chỉ tabular-nums (cột ngày). */
    align?: CellAlign;
  }
}

// ─── Priority dot ─────────────────────────────────────────────────────────────
const PRIORITY_COLOR: Record<string, string> = {
  UT1:    "var(--s-gold)",
  UT2:    "var(--s-blue)",
  SR:     "var(--s-red)",
  Normal: "var(--border-md)",
};

function PriorityDot({ code }: { code: string }) {
  const color = PRIORITY_COLOR[code] ?? "var(--border-md)";
  return (
    <span
      title={code}
      style={{
        display: "inline-block", width: "9px", height: "9px",
        borderRadius: "50%", flexShrink: 0, background: color,
      }}
    />
  );
}

/**
 * MỘT cách duy nhất cho "không có gì".
 *
 * Bản cũ tô `—` bằng `--border-md` — MÀU CỦA ĐƯỜNG KẺ — nên nó gần như tàng hình và ô trống đọc
 * ra như một lỗi render. Ngược lại ô "Ảnh 3D" khi không xem được lại có viền + icon `ImageOff`,
 * tức hình khối DUY NHẤT có viền trong hàng: hút mắt mạnh nhất, vào ô ít tin nhất.
 *
 * Nay cả hai về cùng một dấu: `--ink-muted` ở opacity thấp — đọc được, không hút mắt.
 */
function Dash() {
  return <span style={{ color: "var(--ink-muted)", opacity: 0.5, userSelect: "none" }}>—</span>;
}

const TEN_SP_OPTIONS = LABELS.vi.tenSp;

// ─── Thang chữ dùng chung cho ô bảng ─────────────────────────────────────────
//
// BA BẬC, khớp đúng với .psx-td / .psx-th ở globals.css. Trước bản này bảng có NĂM cỡ chữ trong
// cùng một hàng — 14px (ô Ảnh 3D), 13px (.psx-td), 12px (ba hằng dưới đây), 11px (chip SR),
// 10px (dòng dưới TwoLine + tiêu đề cột) — không theo thang nào.
//
// `TX` giờ chỉ còn khai MÀU: cỡ chữ đã do `.psx-td` lo. Hai nơi cùng khai một cỡ là hai nơi phải
// nhớ sửa cùng lúc, và bên nào quên là bên đó lệch — đúng cái vừa xảy ra với 13px.
const TX = { color: "var(--ink-body)" } as const;
const TX_MUTED = { color: "var(--ink-muted)" } as const;
// Mã định danh (MO#, SO#) — stack mono thật, xem chú thích --font-mono ở globals.css.
const TX_MONO = { fontFamily: "var(--font-mono)", color: "var(--ink-body)" } as const;
// Ô SỐ: canh phải + tabular-nums qua class, để tiêu đề cột dùng lại đúng một luật.
/**
 * Cột nào là cột SỐ / cột NGÀY — khai qua `meta` của ColumnDef.
 *
 * Đặt ở định nghĩa cột chứ không rải class trong từng `cell`: tiêu đề và ô dữ liệu PHẢI canh
 * giống nhau, và hai chỗ tự khai thì sớm muộn một cột có tiêu đề canh trái mà số canh phải.
 * Khai một lần ở cột thì `<th>` và `<td>` cùng đọc ra một câu trả lời.
 */
type CellAlign = "num" | "tab";

function alignClass(prefix: "psx-th" | "psx-td", align: CellAlign | undefined): string {
  return align ? `${prefix} ${prefix}--${align}` : prefix;
}

/**
 * Ô hai dòng: dữ kiện CHÍNH ở trên, dữ kiện PHỤ nhỏ và mờ ở dưới.
 *
 * Mẫu này đã có sẵn trong chính bảng (cột MO# hiện MO đậm trên / SO mờ dưới, cột CÔNG ĐOẠN
 * cũng hai dòng) — dùng lại thay vì nghĩ cách mới, để các cột cạnh nhau đọc cùng một kiểu.
 *
 * VÌ SAO GỘP DỌC CHỨ KHÔNG DÁN CHUỖI: bản cũ nối bằng dấu chấm — `KH.CH1` — đọc ra như MỘT mã
 * duy nhất, người mới không biết đâu là phân loại đâu là nguồn. Gộp dọc tách được hai dữ kiện
 * mà KHÔNG TỐN THÊM MỘT PIXEL chiều ngang — đúng thứ đang thiếu ở bảng này.
 *
 * Trống cả hai → "—", chứ không trả ô rỗng trông như lỗi render.
 */
function TwoLine({ top, bottom }: { top: React.ReactNode; bottom: React.ReactNode }) {
  if (!top && !bottom) return <Dash />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px", lineHeight: 1.3, minWidth: 0 }}>
      <span style={{ minWidth: 0 }}>{top || <Dash />}</span>
      {bottom ? (
        <span style={{ fontSize: "10.5px", color: "var(--ink-muted)", minWidth: 0 }}>{bottom}</span>
      ) : null}
    </div>
  );
}

/**
 * Chip Phân loại KH — SR ĐỎ, còn lại trung tính.
 *
 * SR = hàng showroom, đi QUY TRÌNH KHÁC. Bản dán chuỗi ở PSX hiện `SR.CH1` cùng màu cùng font
 * với `KH.CH1`, làm giá trị cần chú ý nhất trở nên vô hình — cùng lớp lỗi với "Chờ kiểm" từng
 * chìm nghỉm ở bảng 3D. Cột bên tab Hoàn tất vốn đã tô đỏ SR; giờ hai chỗ dùng CHUNG hàm này
 * nên không còn lệch nhau.
 *
 * Cũng đọc cờ per-MO `firstItem.isShowroom` — bản PSX cũ BỎ SÓT cờ này, nên một MO được đánh
 * dấu Showroom riêng vẫn hiện như hàng thường.
 *
 * Trả về HÀM THUẦN chứ không phải component: nơi gọi cần phân biệt "không có gì" để tự quyết
 * hiện "—" hay để trống. Một component luôn trả về element, nên `<Chip/> ?? <Dash/>` sẽ KHÔNG
 * bao giờ rơi vào nhánh Dash — cái bẫy đó dễ lọt qua review vì đọc thì rất hợp lý.
 */
export function phanLoaiKhNode(row: OrderSummary): React.ReactNode | null {
  const v = row.phanLoaiKh;
  const isSR = row.firstItem?.isShowroom === true || v === "SR";
  if (isSR) {
    return (
      <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--s-red)", letterSpacing: "0.04em" }}>
        SR
      </span>
    );
  }
  return v ? <span style={TX}>{v}</span> : null;
}

// ─── Cột chung ────────────────────────────────────────────────────────────────

// Chấm ưu tiên — GHIM TRÁI, và từ bản này là NƠI DUY NHẤT còn hiện ưu tiên ở bảng PSX.
//
// Cột chữ "ƯU TIÊN" (72px) đã bỏ: nó đọc CÙNG MỘT trường `priorityCode` với chấm này, tức lặp
// lại thứ đã có, trong khi bảng đang phải kéo ngang. Chấm nằm ở cột ghim nên luôn nhìn thấy dù
// cuộn tới đâu, và `title={code}` cho mã chính xác khi rê chuột — không mất thông tin nào.
//
// ⚠️ ĐỪNG BỎ `title`: mất nó là mất luôn cách đọc UT1 hay UT2, chỉ còn phân biệt bằng màu.
const COL_PRI: ColumnDef<OrderSummary> = {
  id: "pri",
  header: "",
  size: 28,
  enableSorting: false,
  cell: ({ row }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <PriorityDot code={row.original.priorityCode || "Normal"} />
    </div>
  ),
};

const COL_ORDER_NUMBER: ColumnDef<OrderSummary> = {
  id: "orderNumber",
  accessorKey: "orderNumber",
  header: "MO#",
  size: 150,
  enableSorting: false,
  cell: ({ row }) => {
    const { orderNumber, firstItem } = row.original;
    const primaryMo = firstItem?.moNumber ?? orderNumber;

    // Detect version suffix: "26.31312312.2" (cũ) hoặc "26.31312312_2" (mới) → base +
    // badge hiển thị luôn bằng "_" (chỉ đổi HIỂN THỊ, dữ liệu gốc trong DB không đổi).
    // MO chưa từng qua toggle "Tạo phiên bản mới khi lưu" (không có suffix nào) → hiện "_1"
    // ngầm định CHỈ khi MO này tạo qua webapp (isFromWebapp) — MO import từ Google Sheet
    // (chưa từng qua webapp) giữ nguyên hiển thị trần, xem getMoVersionDisplay.
    const { base: baseMo, verSuffix } = getMoVersionDisplay(primaryMo, firstItem?.isFromWebapp ?? false);
    // Row tạm đang chờ server trả về số version thật — hiện "…" thay vì số cũ
    const isOptimistic = (row.original as any)._optimistic === true;
    const displaySuffix = isOptimistic ? `${NEW_VERSION_SEPARATOR}…` : verSuffix;

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>
            {baseMo}
            {displaySuffix && (
              <span style={{ fontWeight: 500, color: isOptimistic ? "var(--ink-muted)" : "var(--s-blue)", fontSize: "11px" }}>{displaySuffix}</span>
            )}
          </span>
          {row.original.firstItem?.isShowroom && (
            <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--s-red)", letterSpacing: "0.04em", flexShrink: 0 }}>SR</span>
          )}
        </div>
        {primaryMo !== orderNumber && (
          <div style={{ fontSize: "10px", color: "var(--ink-muted)", fontFamily: "monospace" }}>{getBaseSoNumber(orderNumber)}</div>
        )}
        {/* MO này đã chuyển sang PSX — báo cho người PTK biết ĐÚNG MO này đã vào sản xuất
            (gắn theo từng MO, không theo cả SO — 1 SO có thể có MO khác vẫn ở PTK) */}
        {(() => {
          const sib = row.original.firstItem?.psxSibling as { orderNumber: string; status: string; version: number } | null | undefined;
          if (!sib) return null;
          return (
            <div style={{
              marginTop: "3px",
              display: "inline-flex",
              alignItems: "center",
              fontSize: "10px",
              fontWeight: 600,
              color: "var(--s-blue)",
              background: "var(--cream-dark)",
              padding: "1px 6px",
              borderRadius: "3px",
              whiteSpace: "nowrap",
            }}>
              Đã ở PSX{sib.version > 0 ? ` (v${sib.version})` : ""}
            </div>
          );
        })()}
        {/* Per-item alert count — shows only THIS item's own alerts, not all SO alerts */}
        {(row.original.firstItem?.ownAlertCount ?? 0) > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
            <AlertTriangle style={{ width: "11px", height: "11px", color: "var(--s-red)" }} />
            <span style={{ fontSize: "10px", color: "var(--s-red)" }}>{row.original.firstItem!.ownAlertCount} CB</span>
          </div>
        )}
      </div>
    );
  },
};

// `makeColOrderDate` ĐÃ XOÁ cùng lúc với việc bỏ cột "Ngày tạo" khỏi bảng PTK. Bảng đã sắp mặc
// định theo ngày tạo nên thứ tự dòng vốn đã nói ra thông tin đó; ngày cụ thể còn trong sidebar và
// bộ lọc nâng cao. Xem chú thích ở buildPreProductionColumnsDefault trước khi dựng lại.

// Cột BOM — DÙNG CHUNG cho tab PTK và view Đơn hàng của PSX (BOM đi theo MO qua các zone).
// Badge trạng thái + ngày của trạng thái hiện tại (bomDate đã resolve per-MO ở API/business/bom).
function makeColBom(): ColumnDef<OrderSummary> {
  return {
    id: "bomStatus",
    header: "BOM",
    size: 110,
    enableSorting: false,
    cell: ({ row }) => {
      const fi = row.original.firstItem;
      const status = toBomStatus(fi?.bomStatus);
      if (!status) return <Dash />;
      const c = BOM_STATUS_COLORS[status];
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span title={BOM_STATUS_LABELS[status]} style={{ display: "inline-block", width: "fit-content", fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "3px", background: c.bg, color: c.fg, whiteSpace: "nowrap" }}>
            {BOM_STATUS_BADGE[status]}
          </span>
          {fi?.bomDate && (
            <span style={{ ...TX_MUTED, fontSize: "10px", whiteSpace: "nowrap" }}>{formatDate(fi.bomDate)}</span>
          )}
        </div>
      );
    },
  };
}

function makeColRequiredDate(L: Labels): ColumnDef<OrderSummary> {
  return {
    id: "requiredDate",
    header: L.ui.table.requiredDate,
    meta: { align: "tab" },
    size: 110,
    enableSorting: false,
    cell: ({ row }) => {
      // Không fallback về order.requiredDate: MO chưa có ngày riêng nghĩa là GS chưa
      // cập nhật cột "NGÀY HT (DỰ KIẾN)" cho MO đó — phải hiện trống, không bịa ngày SO.
      const requiredDate = (row.original.firstItem as any)?.requiredDate ?? null;
      const { status } = row.original;
      const overdue = isOverdue(requiredDate) && status !== "COMPLETED" && status !== "CANCELLED";
      if (!requiredDate) return <Dash />;
      return (
        <span
          style={{
            fontSize: "12px", whiteSpace: "nowrap",
            display: "flex", alignItems: "center", gap: "4px",
            color: overdue ? "var(--s-red)" : "var(--ink-muted)",
            fontWeight: overdue ? 600 : 400,
          }}
        >
          {overdue && <Clock style={{ width: "11px", height: "11px", flexShrink: 0 }} />}
          {formatDate(requiredDate)}
        </span>
      );
    },
  };
}

/**
 * Ngày chốt SX → Ngày DK HT, MỘT DÒNG.
 *
 * Hai mốc này LUÔN được đọc cùng nhau — "chốt SX bao giờ, dự kiến xong bao giờ" là một câu.
 *
 * ⚠️ BẢN TRƯỚC XẾP CHỒNG HAI NGÀY TRẦN, và chú thích của chính nó hứa "nhãn nhỏ đứng trước mỗi
 * dòng" — nhưng code không hề có nhãn nào. Kết quả là hai con số giống hệt nhau nằm chồng lên
 * nhau, người đọc phải ngước lên tiêu đề rồi tự suy cái nào là cái nào. Đó là chỗ trông nghiệp
 * dư nhất của bảng.
 *
 * MŨI TÊN thay cho xếp chồng: nó tự nói ra thứ tự "từ mốc này tới mốc kia" mà không cần thêm
 * một chữ nhãn nào — ít chữ hơn bản có nhãn, mà rõ hơn bản không nhãn. Một dòng cũng làm mọi
 * hàng của bảng cao bằng nhau.
 *
 * GIỮ NGUYÊN cảnh báo trễ hạn của Ngày DK HT (chữ đỏ + icon đồng hồ) — đó là tín hiệu điều
 * hành, gọn cột không được làm nó mờ đi.
 *
 * Rộng hơn bản cũ (118 → 172), nhưng lần này bảng vừa bỏ 4 cột nên tổng chiều ngang vẫn giảm
 * mạnh. Đổi một ít bề ngang lấy chỗ dễ đọc là đúng hướng.
 */
function makeColSxDates(L: Labels): ColumnDef<OrderSummary> {
  return {
    id: "sxDates",
    // Nhãn NGẮN: ghép hai bản dài ra "Ngày chốt SX → Ngày DK HT" — 25 ký tự, ép cột rộng hơn cả
    // nội dung, và lặp chữ "Ngày" hai lần trên cùng một dòng.
    header: `${L.ui.table.estimatedDateShort} → ${L.ui.table.requiredDateShort}`,
    meta: { align: "tab" },
    size: 150,
    minSize: 138,
    enableSorting: false,
    cell: ({ row }) => {
      const fi = row.original.firstItem as { estimatedDate?: string | null; requiredDate?: string | null } | undefined;
      const est = fi?.estimatedDate ?? null;
      const req = fi?.requiredDate ?? null;
      const { status } = row.original;
      const overdue = isOverdue(req) && status !== "COMPLETED" && status !== "CANCELLED";
      if (!est && !req) return <Dash />;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap" }}>
          <span style={TX_MUTED}>{est ? formatDate(est) : "—"}</span>
          {/* Mũi tên nhạt hơn hẳn hai con số: nó là dấu nối, không phải dữ liệu. */}
          <span style={{ fontSize: "11px", color: "var(--ink-muted)", opacity: 0.5 }}>→</span>
          <span
            style={{
              fontSize: "11px", display: "flex", alignItems: "center", gap: "3px",
              color: overdue ? "var(--s-red)" : "var(--ink-muted)",
              fontWeight: overdue ? 600 : 400,
            }}
          >
            {overdue && <Clock style={{ width: "10px", height: "10px", flexShrink: 0 }} />}
            {req ? formatDate(req) : "—"}
          </span>
        </div>
      );
    },
  };
}

function makeColStatus(L: Labels): ColumnDef<OrderSummary> {
  return {
    id: "status",
    accessorKey: "status",
    header: L.ui.table.status,
    size: 170,
    minSize: 130,
    enableSorting: false,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  };
}

function makeColTenSp(L: Labels): ColumnDef<OrderSummary> {
  return {
    id: "tenSp",
    header: L.ui.table.tenSp,
    size: 160,
    minSize: 110,
    enableSorting: false,
    cell: ({ row }) => {
      const fi = row.original.firstItem;
      if (!fi) return <Dash />;
      const raw = fi.productName ?? "";
      const idx = TEN_SP_OPTIONS.indexOf(raw);
      const displayName = idx >= 0 ? L.tenSp[idx] : raw;
      return (
        <div style={{ minWidth: 0 }} title={displayName}>
          <p style={{ ...TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</p>
        </div>
      );
    },
  };
}

function makeColCustomer(L: Labels): ColumnDef<OrderSummary> {
  return {
    id: "customer",
    accessorKey: "customerName",
    header: L.ui.table.customer,
    size: 150,
    minSize: 100,
    enableSorting: true,
    cell: ({ row }) => (
      <div style={{ minWidth: 0 }} title={row.original.customerName}>
        <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.original.customerName}
        </p>
      </div>
    ),
  };
}

/**
 * NVL + Size gộp một cột hai dòng.
 *
 * Hai cột rời tốn 137px cho hai giá trị RẤT NGẮN ("18KY", "4.25") — phần lớn bề rộng là khoảng
 * trắng và tiêu đề cột. Gộp lại còn 80px mà không mất chữ nào.
 *
 * Gộp được vì hai trường LUÔN ĐI CÙNG NHAU khi đọc: "vàng gì, cỡ bao nhiêu" là một câu hỏi.
 * Đây KHÁC với việc dán `KH.CH1` thành chuỗi — ở đây hai giá trị vẫn nằm hai dòng riêng, chỉ
 * chung một ô.
 */
const COL_NVL_SIZE: ColumnDef<OrderSummary> = {
  id: "nvlSize",
  header: "NVL / SIZE",
  meta: { align: "tab" },
  size: 80,
  minSize: 72,
  enableSorting: false,
  cell: ({ row }) => {
    const { nvl, size } = row.original.firstItem ?? {};
    return (
      <TwoLine
        top={nvl ? <span style={{ ...TX_MONO, fontWeight: 500 }}>{nvl}</span> : null}
        bottom={size || null}
      />
    );
  },
};

const COL_SALES: ColumnDef<OrderSummary> = {
  id: "sales",
  header: "Sales",
  size: 90,
  enableSorting: false,
  cell: ({ row }) => {
    const name = row.original.salesName;
    return name
      ? <span style={{ ...TX_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      : <Dash />;
  },
};

// `makeColGhiChuSp` và `makeColGhiChuSales` ĐÃ XOÁ cùng lúc với việc bỏ hai cột đó khỏi bảng.
// Giữ lại một hàm không ai gọi là để ngỏ đường nhét cột trở lại mà không phải nghĩ lại vì sao đã
// bỏ. Cần dựng lại thì `git log` còn nguyên — nhưng hãy đọc chú thích ở buildPreProductionColumnsDefault trước.

/**
 * Ảnh đại diện sản phẩm — MỘT định nghĩa, dùng ở CẢ HAI nơi cần hiện (buildPreProductionColumns
 * và buildMHTongQuanColumns). Trước đây từng có 3 đoạn <a> chép tay ở 3 nơi khác nhau; khuôn
 * factory này (giống makeColOrderDate, makeColGhiChuSp…) tránh lặp lại đúng lỗi đó.
 *
 * Ưu tiên hiển thị: ảnh đại diện đã upload (designImageUrl) > thumbnail bóc từ link Drive đơn
 * (designFileUrl) > link chữ dự phòng. Quyết định nằm ở DesignFilePreview/mo-image.ts, cột
 * này chỉ truyền dữ liệu vào.
 */
function makeColProductImage(L: Labels): ColumnDef<OrderSummary> {
  return {
    id: "designFile",
    header: L.ui.table.designFile3D,
    size: 72,
    enableSorting: false,
    cell: ({ row }) => {
      const driveUrl = row.original.firstItem?.designFileUrl;
      const imageUrl = row.original.firstItem?.designImageUrl;
      if (!driveUrl && !imageUrl) return <Dash />;
      return (
        // compact: chỉ ảnh, không kèm dòng chữ link — dòng bảng vốn chỉ cao một dòng chữ.
        // Ảnh lỗi (chưa chia sẻ đủ rộng) tự rơi về đúng link "Xem" như trước.
        <div onClick={(e) => e.stopPropagation()}>
          <DesignFilePreview url={driveUrl} imageUrl={imageUrl} linkLabel={L.ui.table.view} size="xs" compact />
        </div>
      );
    },
  };
}

/** Nguồn (người dùng tab Hoàn tất gọi là "Cửa hàng"). Tách factory để tab Hoàn tất và view
 *  Đơn hàng dùng CHUNG một định nghĩa, thay vì chép lại. */
function makeColNguon(L: Labels): ColumnDef<OrderSummary> {
  return {
    id: "nguon",
    header: L.ui.table.source,
    size: 90,
    enableSorting: false,
    cell: ({ row }) => {
      const v = row.original.nguon;
      return v ? <span style={TX}>{v}</span> : <Dash />;
    },
  };
}

/** Phân loại KH — cờ Showroom PER-MO (specifications.isShowroom) đè lên giá trị cấp SO. */
function makeColPhanLoaiKh(L: Labels): ColumnDef<OrderSummary> {
  return {
    id: "phanLoaiKh",
    header: L.ui.table.customerType,
    size: 110,
    enableSorting: false,
    // Cột này dùng ở tab Hoàn tất, nơi Nguồn đã là MỘT CỘT RIÊNG — nên chỉ hiện phân loại,
    // không gộp Nguồn vào như bên PSX (bảng 6 cột, không bị ép chiều ngang).
    // Logic SR (gồm cờ per-MO isShowroom) nằm trong PhanLoaiKhChip, dùng chung với PSX.
    cell: ({ row }) => phanLoaiKhNode(row.original) ?? <Dash />,
  };
}

/**
 * Ngày HT — PER-MO. CHỈ đọc completedDate của chính MO này, KHÔNG fallback về
 * order.completedDate (cấp SO) để không lây ngày của MO anh em cùng SO.
 */
function makeColNgayHt(): ColumnDef<OrderSummary> {
  return {
    id: "completedAtCol",
    header: "NGÀY HT",
    meta: { align: "tab" },
    size: 100,
    enableSorting: false,
    cell: ({ row }) => {
      const v = row.original.firstItem?.completedDate ?? null;
      if (!v) return <Dash />;
      return <span style={{ ...TX_MUTED, whiteSpace: "nowrap" }}>{formatDate(v)}</span>;
    },
  };
}

// makeColDesign3dResult DA XOA cung luc voi viec bo cot KET QUA 3D khoi bang. Trang thai duyet
// 3D van hien day du o tab Thiet ke cua sidebar � noi Order thuc su bam duyet.
/**
 * Thông tin HT — PER-MO, CỐ Ý KHÔNG fallback về productionSummary (cấp SO).
 *
 * Mỗi MO trong cùng một SO có Thông tin HT KHÁC NHAU (xác nhận từ nghiệp vụ). Đọc cấp SO sẽ
 * khiến mọi MO cùng SO hiện chung một nội dung — sai dữ liệu, không phải chỉ xấu giao diện.
 * Cùng quy tắc với makeColNgayHt ngay trên: hai cột cạnh nhau phải cùng phạm vi, nếu không
 * người đọc đối chiếu hai cột sẽ hiểu nhầm.
 */
function makeColThongTinHt(L: Labels): ColumnDef<OrderSummary> {
  return {
    id: "thongTinHtPerMo",
    header: L.ui.table.completionInfo,
    size: 180,
    enableSorting: false,
    cell: ({ row }) => {
      const v = row.original.firstItem?.thongTinHt;
      if (!v) return <Dash />;
      return (
        <span
          style={{ ...TX_MUTED, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          title={v}
        >
          {v}
        </span>
      );
    },
  };
}

/**
 * Ngày hủy — đọc ngược từ workflowHistory (xem khối enrich ở app/api/orders/route.ts).
 *
 * Cố ý KHÔNG rơi về `updatedAt` khi thiếu bản ghi: MO đã hủy bị khoá sửa nên updatedAt gần
 * đúng thời điểm hủy, nhưng admin override vẫn ghi được — và một ngày SAI trông y như một
 * ngày đúng. Trống thì hiện "—", người đọc biết là không có; một ngày sai thì họ tin.
 */
function makeColNgayHuy(): ColumnDef<OrderSummary> {
  return {
    id: "cancelledAtCol",
    header: "NGÀY HỦY",
    meta: { align: "tab" },
    size: 100,
    enableSorting: false,
    cell: ({ row }) => {
      const v = row.original.firstItem?.cancelledAt ?? null;
      if (!v) return <Dash />;
      return <span style={{ ...TX_MUTED, whiteSpace: "nowrap" }}>{formatDate(v)}</span>;
    },
  };
}

/**
 * Lý do hủy — chuỗi người dùng gõ trong dialog hủy.
 *
 * Cho xuống dòng (KHÔNG nowrap như các cột ngày): đây là câu do người viết, cắt một dòng bằng
 * ellipsis thì đúng phần mang thông tin — "vì khách đổi mẫu", "vì sai size" — là phần bị mất.
 * Cột này chính là lý do người dùng mở tab Đã hủy.
 */
function makeColLyDoHuy(): ColumnDef<OrderSummary> {
  return {
    id: "cancelReasonCol",
    header: "LÝ DO HỦY",
    size: 240,
    enableSorting: false,
    cell: ({ row }) => {
      const v = row.original.firstItem?.cancelReason?.trim();
      if (!v) return <Dash />;
      return <span style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{v}</span>;
    },
  };
}

// ─── PRE_PRODUCTION columns ───────────────────────────────────────────────────
function buildPreProductionColumns(tab: OrderTab, L: Labels): ColumnDef<OrderSummary>[] {
  // Tab Hoàn tất dùng bộ cột RIÊNG, gọn — chỉ những gì cần để tra cứu đơn đã xong:
  // SO/MO, Ảnh 3D, Nguồn, Phân loại KH, Ngày HT, Thông tin HT.
  //
  // Tách hẳn nhánh thay vì rải thêm `...(isCompletedTab ? [] : [...])` lên 9 cột còn lại —
  // với số cột bị ẩn nhiều hơn số cột giữ lại, cách rải điều kiện làm hàm rất khó đọc và dễ
  // sót khi sau này thêm cột mới.
  if (tab === "completed") {
    return [
      COL_ORDER_NUMBER,
      makeColProductImage(L),
      makeColNguon(L),
      makeColPhanLoaiKh(L),
      makeColNgayHt(),
      makeColThongTinHt(L),
    ];
  }

  // Tab Đã hủy: cùng lý do như tab Hoàn tất — người vào đây để TRA CỨU, không để điều hành.
  // Bộ cột mặc định (~15 cột) toàn trường điều hành đã hết nghĩa với đơn đã hủy: Ngày DK HT,
  // Deadline, BOM, tiến độ… Sáu cột dưới đây trả lời đúng bốn câu: MO nào, sản phẩm gì, của
  // khách nào, và vì sao + khi nào bị hủy.
  if (tab === "cancelled") {
    return [
      COL_ORDER_NUMBER,
      makeColTenSp(L),
      makeColCustomer(L),
      makeColLyDoHuy(),
      makeColNgayHuy(),
      makeColProductImage(L),
    ];
  }
  return buildPreProductionColumnsDefault(tab, L);
}

function buildPreProductionColumnsDefault(tab: OrderTab, L: Labels): ColumnDef<OrderSummary>[] {
  // Tab "completed" đã return sớm ở buildPreProductionColumns với bộ cột riêng — nhánh này
  // chỉ còn phục vụ all / pre-production / cancelled / suspended / priority / history.
  return [
    COL_PRI,
    COL_ORDER_NUMBER,
    // ─── BỎ "NGÀY TẠO" ───────────────────────────────────────────────────────
    // Bảng đã SẮP MẶC ĐỊNH theo ngày tạo, nên thứ tự dòng vốn đã nói ra thông tin đó. Và không
    // thao tác nào của Phòng Thiết Kế được quyết bằng ngày tạo — cái họ nhìn để làm việc là
    // "Chốt SX → DK HT" ở cột bên. Vẫn còn trong sidebar và trong bộ lọc nâng cao.
    {
      ...makeColStatus(L),
      cell: ({ row }: { row: { original: OrderSummary } }) => (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <StatusBadge status={row.original.status} />
          {tab === "all" && <ZoneBadge zone={row.original.zone} />}
        </div>
      ),
    },
    makeColTenSp(L),
    makeColCustomer(L),
    COL_NVL_SIZE,
    makeColSxDates(L),
    // Theo dõi BOM per-MO — tab PTK (Hoàn tất/Đã hủy không cần). PSX xem cột BOM ở view Đơn hàng.
    ...(tab === "pre-production" ? [makeColBom()] : []),
    // ─── BỎ "ĐÁ CHỦ" ─────────────────────────────────────────────────────────
    // Đây là THÔNG SỐ để dựng mẫu, không phải dấu hiệu để chọn dòng cần mở. Người cần nó là NV
    // 3D lúc đang làm — và họ đã có nó ở màn Việc thiết kế 3D lẫn tab Sản phẩm của sidebar, đầy
    // đủ hơn ở đây (bản trong bảng còn bị cắt cụt vì chỉ rộng 110px).
    makeColProductImage(L),
    // ─── ĐÃ BỎ KHỎI BẢNG: Ghi chú SP, Kết quả 3D, Ghi chú Sales, Sales ────────
    //
    // Bốn cột này cộng lại hơn 700px — chính là phần bắt người dùng KÉO NGANG mới đọc hết bảng.
    // Mà một bảng phải kéo ngang thì những cột nằm ngoài tầm mắt coi như không tồn tại: người ta
    // không cuộn để "xem thử có gì", họ chỉ cuộn khi đã biết mình cần gì.
    //
    // Ba cột ghi chú còn tệ hơn: chúng chứa văn bản tự do dài, nên hoặc bị cắt cụt (đọc được một
    // nửa câu còn nguy hiểm hơn không đọc) hoặc kéo cả hàng cao lên.
    //
    // KHÔNG MẤT DỮ LIỆU: cả bốn đều còn đầy đủ trong sidebar chi tiết đơn — Ghi chú SP và Ghi chú
    // Sales ở tab Sản phẩm, Kết quả 3D ở tab Thiết kế, Sales ở tab Đơn hàng. Bảng để QUÉT và tìm
    // dòng cần mở; đọc kỹ là việc của sidebar.
    //
    // ⚠️ Chưa có tính năng ẩn/hiện cột trong bảng này. Ngày nào cần bật lại thì đó mới là chỗ
    // đúng để thêm, chứ không phải nhét cột trở lại cho mọi người.
  ];
}

// ─── MASTER_HUB — Tổng quan ──────────────────────────────────────────────────
// View mặc định của PSX — gom thông tin theo dõi tổng thể (thay sheet
// "DỰ KIẾN SẢN PHẨM HOÀN TẤT NHẬP KHO"): phân loại đơn, SP, NVL, TL 3D, ưu tiên, ngày DK HT.

// Loại SP: suy mã ngắn từ productName (RI nhẫn / ER bông / PE mặt dây / BR vòng-lắc / NE dây chuyền)
function productTypeCode(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("nhẫn")) return "RI";
  if (n.includes("bông") || n.includes("khoen")) return "ER";
  if (n.includes("mặt dây") || n.includes("mặt")) return "PE";
  if (n.includes("vòng") || n.includes("lắc")) return "BR";
  if (n.includes("dây chuyền") || n.includes("dây")) return "NE";
  if (n.includes("charm") || n.includes("phụ kiện")) return "AC";
  return null;
}

function buildMHTongQuanColumns(L: Labels): ColumnDef<OrderSummary>[] {
  return [
    COL_PRI,
    {
      id: "phanLoai",
      header: L.ui.table.customerType,
      size: 85,
      enableSorting: false,
      // Phân loại trên, NGUỒN dưới. Bỏ TX_MONO: font mono dành để canh cột SỐ, dùng cho chữ
      // chỉ làm khó đọc hơn.
      cell: ({ row }) => (
        <TwoLine top={phanLoaiKhNode(row.original)} bottom={row.original.nguon} />
      ),
    },
    COL_ORDER_NUMBER,
    COL_SALES,
    {
      // MÃ SỐ MẪU — R&D nhập trong panel, bảng chỉ ĐỌC. Sửa tại bảng nghĩa là có hai đường ghi
      // cho cùng một cột; đường trong panel đã tự lưu riêng rồi (ma-so-mau-field.tsx).
      id: "masoMau",
      header: "MÃ SỐ MẪU",
      size: 96,
      minSize: 80,
      enableSorting: false,
      cell: ({ row }) => {
        const v = row.original.firstItem?.masoMau?.trim();
        return v
          ? <span style={{ ...TX_MONO, fontWeight: 600 }}>{v}</span>
          : <span style={{ color: "var(--ink-muted)" }}>—</span>;
      },
    },
    {
      // Loại SP + Phân loại KT gộp một cột: cả hai đều trả lời "sản phẩm này thuộc nhóm nào",
      // và mỗi cái rời ra chỉ chứa vài ký tự nhưng vẫn tốn một tiêu đề cột (62 + 100 = 162px).
      id: "loaiSp",
      header: "LOẠI SP / KT",
      size: 92,
      minSize: 78,
      enableSorting: false,
      cell: ({ row }) => {
        // Loại SP user chọn tay (specifications.loaiSp) — ưu tiên; đơn cũ chưa gán thì
        // tạm suy đoán từ tên SP để không trống hẳn, chờ user gán lại đúng.
        const fi = row.original.firstItem;
        const code = fi?.loaiSp || productTypeCode(fi?.productName);
        const kt = Array.isArray(fi?.techClassification)
          ? fi.techClassification.join(" + ")
          : (fi?.techClassification ?? "");
        return (
          <TwoLine
            top={code
              ? <span style={{ ...TX_MONO, fontWeight: 600 }} title={fi?.productName ?? undefined}>{code}</span>
              : null}
            bottom={kt || null}
          />
        );
      },
    },
    {
      // DIỄN GIẢI trên GS = Diễn giải SP (OrderItem.techNote) — KHÔNG phải Tên sản phẩm
      id: "dienGiaiSp",
      header: "Diễn giải SP",
      size: 160,
      minSize: 100,
      enableSorting: false,
      cell: ({ row }) => {
        const v = row.original.firstItem?.techNote;
        if (!v) return <Dash />;
        return (
          <span style={{ ...TX, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={v}>
            {v}
          </span>
        );
      },
    },
    COL_NVL_SIZE,
    makeColProductImage(L),
    {
      id: "tl3d",
      header: L.ui.table.tl3d,
      meta: { align: "num" },
      size: 88,
      enableSorting: false,
      cell: ({ row }) => {
        const v = row.original.productionSummary?.tl3d;
        return v ? <span style={TX_MONO}>{v}</span> : <Dash />;
      },
    },
    {
      id: "congDoan",
      header: L.ui.table.congDoan,
      size: 140,
      enableSorting: false,
      cell: ({ row }) => {
        const cd     = row.original.productionSummary?.congDoan;
        const code   = row.original.productionSummary?.congDoanCode;
        const status = row.original.productionSummary?.congDoanStatus;
        if (!cd) return <Dash />;
        const statusLabel = code && status ? getStageStatusLabel(code, status) : null;
        const statusColor: Record<string, string> = {
          pending: "#9ca3af",
          doing:   "var(--s-blue)",
          qc:      "#d97706",
          hold:    "#dc2626",
          done:    "#16a34a",
        };
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            <span style={{ fontSize: "11px", fontWeight: 500, whiteSpace: "nowrap", color: "var(--s-blue)" }}>
              {cd}
            </span>
            {statusLabel && (
              <span style={{
                fontSize: "10px", fontWeight: 500, whiteSpace: "nowrap",
                color: statusColor[status ?? ""] ?? "#9ca3af",
              }}>
                {statusLabel}
              </span>
            )}
          </div>
        );
      },
    },
    makeColRequiredDate(L),
  ];
}

// ─── Column selector ──────────────────────────────────────────────────────────
// PSX chỉ còn MỘT bộ cột (Tổng quan). Bốn view Tiến độ / Đơn hàng / Kỹ thuật / Kết quả đã bỏ —
// người dùng không dùng tới, và chúng không hề ảnh hưởng tốc độ tải (cả năm view dùng CHUNG một
// payload API, mhView chỉ đổi cột dựng ở client).
//
// ⚠️ Màn Cửa hàng (stores/[storeId]) VẪN có bốn view đó, với type MhView và bộ cột RIÊNG của nó
// — không liên quan gì tới file này. Nó chỉ dùng chung bảng nhãn L.ui.mhViews, nên năm nhãn đó
// trong labels.ts phải giữ nguyên. Xuất để test: __tests__/orders-table-columns.test.ts
export function buildColumns(tab: OrderTab, L: Labels): ColumnDef<OrderSummary>[] {
  if (tab === "master-hub") return buildMHTongQuanColumns(L);
  return buildPreProductionColumns(tab, L);
}

// ─── Component chính ──────────────────────────────────────────────────────────

type Props = {
  data: OrderSummary[];
  pagination: Pagination;
  tab: OrderTab;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSortChange: (sortStr: string) => void;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  onRowClick?: (orderId: string, itemId?: string) => void;
  onRowHover?: (orderId: string) => void;
  isLoading?: boolean;
  flashOrderId?: string | null;
  crossUserFlashIds?: Set<string> | null;
  pendingOrderId?: string | null;
  pendingCreateTempId?: string | null;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
};

export function OrdersTable({
  data,
  pagination,
  tab,
  sortBy,
  sortDir,
  onSortChange,
  onPageChange,
  onLimitChange,
  onRowClick,
  onRowHover,
  isLoading = false,
  flashOrderId,
  crossUserFlashIds,
  pendingOrderId,
  pendingCreateTempId,
  onClearFilters,
  hasActiveFilters = false,
}: Props) {
  const router = useRouter();
  const L = useLabels();
  const locale = useLocale();
  const localeCode = locale === "en" ? "en-US" : "vi-VN";
  const columns = useMemo(() => buildColumns(tab, L), [tab, L]);

  const [columnPinning] = useState<ColumnPinningState>({
    left: ["pri", "orderNumber"],
  });

  // Sàn chiều rộng của cả bảng = tổng minSize (cột không khai minSize thì sàn chính là size).
  //
  // Trước đây bảng đặt `minWidth: max-content`, tức "rộng ít nhất bằng nội dung" — nên nó LUÔN
  // giữ đúng tổng các size cứng và luôn phải kéo ngang, dù màn hình rộng bao nhiêu. Với sàn
  // tính từ minSize, bảng co được tới mức này rồi mới kéo.
  const minTableWidth = useMemo(
    () => columns.reduce((sum, c) => sum + ((c.minSize ?? c.size) || 0), 0),
    [columns],
  );

  const [sorting, setSorting] = useState<SortingState>([
    { id: sortBy, desc: sortDir === "desc" },
  ]);

  useEffect(() => {
    setSorting([{ id: sortBy, desc: sortDir === "desc" }]);
  }, [sortBy, sortDir]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnPinning },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(next);
      if (next.length > 0) {
        onSortChange(`${next[0].id}:${next[0].desc ? "desc" : "asc"}`);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount: pagination.totalPages,
  });

  const { page, totalPages, total, limit } = pagination;
  const from = Math.min((page - 1) * limit + 1, total);
  const to = Math.min(page * limit, total);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>

        {isLoading && !pendingCreateTempId && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 20,
            background: "rgba(242,237,232,0.75)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            paddingTop: "64px",
          }}>
            <span style={{ fontSize: "12px", color: "var(--ink-muted)" }} className="psx-shimmer">
              {L.ui.table.loading}
            </span>
          </div>
        )}

        {/*
          `minWidth: max-content` ĐÃ BỎ — đó chính là thứ ép bảng không bao giờ co lại. Nó bảo
          trình duyệt "rộng ít nhất bằng nội dung", nên dù màn hình có thừa hay thiếu chỗ, bảng
          vẫn giữ đúng tổng các `size` cứng → luôn phải kéo ngang.

          Giờ: `width: 100%` cho bảng bám khung; sàn chiều rộng là TỔNG minSize của các cột, nên
          bảng chỉ kéo ngang khi thật sự không còn chỗ — CỐ Ý: thà kéo còn hơn bóp chữ tới mức
          không đọc được.

          ⚠️ KHÔNG dùng `table-layout: fixed`: nó co MỌI cột theo tỉ lệ khi chật, kể cả hai cột
          GHIM TRÁI. Mà offset sticky của cột ghim tính bằng `getStart("left")` — cộng dồn
          `size` khai báo, không phải bề rộng thật sau khi co. Cột ghim co lại là hai cột đó lệch
          khỏi chỗ của chúng. Thay vào đó cột ghim bị KHOÁ CỨNG bằng maxWidth ở dưới, chỉ cột
          thường mới co.
        */}
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", minWidth: `${minTableWidth}px` }}>
          <thead
            style={{
              position: "sticky", top: 0, zIndex: 10,
              background: "var(--cream-dark)",
              borderBottom: "1px solid var(--border)",
              // Bóng rất mảnh để hàng tiêu đề TÁCH khỏi thân bảng khi cuộn. Không có nó, tiêu đề
              // dính vào hàng đầu và trong lúc cuộn nó đọc như một dòng dữ liệu.
              boxShadow: "0 1px 0 var(--border), 0 2px 4px rgba(26,23,20,0.04)",
            }}
          >
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const pinned = header.column.getIsPinned();
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      className={alignClass("psx-th", header.column.columnDef.meta?.align)}
                      style={{
                        width: header.getSize(),
                        minWidth: header.column.columnDef.minSize ?? header.getSize(),
                        // Cột ghim: khoá cứng để offset sticky (getStart) luôn khớp bề rộng thật
                        ...(pinned === "left" && { maxWidth: header.getSize() }),
                        ...(pinned === "left" && {
                          position: "sticky",
                          left: header.column.getStart("left"),
                          zIndex: 20,
                          background: "var(--cream-dark)",
                          boxShadow: "inset -1px 0 0 var(--border)",
                        }),
                      }}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={() => header.column.toggleSorting()}
                          style={{
                            display: "flex", alignItems: "center", gap: "4px",
                            background: "none", border: "none", cursor: "pointer",
                            fontSize: "10px", fontWeight: 500, textTransform: "uppercase",
                            letterSpacing: "0.12em", color: "var(--ink-muted)", padding: 0,
                          }}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp style={{ width: "11px", height: "11px", color: "var(--pink)" }} />
                          ) : sorted === "desc" ? (
                            <ArrowDown style={{ width: "11px", height: "11px", color: "var(--pink)" }} />
                          ) : (
                            <ArrowUpDown style={{ width: "11px", height: "11px", opacity: 0.3 }} />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {data.length === 0 && !isLoading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ padding: "56px 12px", textAlign: "center" }}
                >
                  <p style={{ fontSize: "13px", color: "var(--ink-muted)", marginBottom: hasActiveFilters ? "12px" : 0 }}>
                    {hasActiveFilters ? L.ui.table.noMatch : L.ui.table.noOrders}
                  </p>
                  {hasActiveFilters && onClearFilters && (
                    <button
                      type="button"
                      onClick={onClearFilters}
                      style={{
                        fontSize: "12px", color: "var(--pink)", background: "none",
                        border: "1px solid var(--pink)", padding: "4px 14px", cursor: "pointer",
                      }}
                    >
                      {L.ui.table.clearFilters}
                    </button>
                  )}
                </td>
              </tr>
            ) : isLoading && data.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <ContentSkeleton rows={8} />
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const isSuspended = row.original.isSuspended;
                const isFlashing = row.original.id === flashOrderId;
                const isCrossUserFlash = !isFlashing && (crossUserFlashIds?.has(row.original.id) ?? false);
                const isPendingSave = (row.original as any).activeItemId === pendingOrderId; // block chỉ MO đang save
                const isPendingCreate = row.original.id === pendingCreateTempId || (row.original as any)._optimistic === true; // new order / new version being created
                // Kỹ thuật flash: instant ON (transition:none) → smooth fade OUT (transition:1.8s)
                // ⚠️ HAI XUNG ĐỘT INLINE-vs-CSS ĐÃ SỬA Ở ĐÂY.
                //
                // 1. HOVER TRƯỚC ĐÂY KHÔNG CHẠY. Hàng luôn có `style={{ background: "transparent" }}`,
                //    và style inline THẮNG mọi rule theo class — nên `.psx-tr:hover` chưa từng có
                //    hiệu lực. Cùng lý do, kẻ sọc zebra khai ở CSS cũng sẽ bị chặn.
                //
                // 2. `transition: background 1.8s` áp cho MỌI hàng. 1.8s là nhịp đúng cho hiệu ứng
                //    nháy sau khi lưu, nhưng nó cũng làm hover phai vào/ra trong gần hai giây —
                //    tức hover trông như bị treo.
                //
                // CÁCH SỬA: hàng BÌNH THƯỜNG không đặt background/transition inline nữa, để CSS lo
                // zebra + hover. Chỉ các trạng thái ĐẶC BIỆT mới ghi inline — và đó đúng là thứ tự
                // ưu tiên mong muốn: đơn bị treo hay vừa được lưu thì phải đè lên cả zebra lẫn hover.
                const specialBg = isFlashing
                  ? "rgba(34,197,94,0.18)"           // xanh lá — tự save
                  : isCrossUserFlash
                    ? "rgba(99,102,241,0.15)"          // tím/indigo — user khác cập nhật
                    : isPendingSave
                      ? "rgba(59,130,246,0.08)"
                      : isPendingCreate
                        ? "rgba(234,179,8,0.08)"
                        : isSuspended
                          ? "rgba(155,45,45,0.05)"
                          : null;
                const isFlashLike = isFlashing || isCrossUserFlash || isPendingSave || isPendingCreate;
                return (
                  <tr
                    key={row.id}
                    className="psx-tr"
                    style={{
                      ...(specialBg ? { background: specialBg } : {}),
                      // Nháy: instant ON (transition none) → phai OUT chậm. Hàng thường để CSS lo
                      // (0.12s) để hover phản hồi tức thì.
                      ...(isFlashing || isCrossUserFlash
                        ? { transition: "none" }
                        : isFlashLike || isSuspended
                          ? { transition: "background 1.8s ease-out" }
                          : {}),
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => !isPendingCreate && onRowHover?.(row.original.id)}
                    onClick={() => {
                      onRowClick
                        ? onRowClick(row.original.id, (row.original as any).activeItemId ?? row.original.firstItem?.itemId)
                        : router.push(`/dashboard/orders/${row.original.id}`);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const pinned = cell.column.getIsPinned();
                      return (
                        <td
                          key={cell.id}
                          className={alignClass("psx-td", cell.column.columnDef.meta?.align)}
                          style={{
                            width: cell.column.getSize(),
                            minWidth: cell.column.columnDef.minSize ?? cell.column.getSize(),
                            ...(pinned === "left" && { maxWidth: cell.column.getSize() }),
                            ...(pinned === "left" && {
                              position: "sticky",
                              left: cell.column.getStart("left"),
                              zIndex: 1,
                              // `inherit` chứ KHÔNG phải một màu cứng: cột ghim phải đục để che
                              // phần nội dung cuộn qua dưới nó, nhưng nếu ghim một màu thì nó giữ
                              // nguyên màu đó trên mọi dòng — kẻ sọc zebra sẽ bị cắt mất một khúc
                              // đúng ở lề trái, và hover cũng không lan tới cột này.
                              background: "inherit",
                              boxShadow: "inset -1px 0 0 var(--border)",
                            }),
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Phân trang */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", borderTop: "1px solid var(--border)", background: "var(--cream-card)",
      }}>
        <span style={{ fontSize: "12px", color: "var(--ink-muted)", fontVariantNumeric: "tabular-nums" }}>
          {total === 0 ? L.ui.table.noOrdersCount : `${L.ui.table.showing} ${from}–${to} / ${total.toLocaleString(localeCode)} ${L.ui.table.ordersWord}`}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {onLimitChange && (
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              style={{
                fontSize: "11px", color: "var(--ink-muted)", background: "transparent",
                border: "1px solid var(--border)", borderRadius: "4px",
                padding: "2px 6px", cursor: "pointer",
              }}
            >
              <option value={20}>20 {L.ui.table.perPage}</option>
              <option value={50}>50 {L.ui.table.perPage}</option>
              <option value={100}>100 {L.ui.table.perPage}</option>
            </select>
          )}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {page > 1 && <PaginationBtn onClick={() => onPageChange(1)} disabled={false} label="«" title="Trang đầu" />}
              {page > 1 && <PaginationBtn onClick={() => onPageChange(page - 1)} disabled={false} icon={<ChevronLeft style={{ width: "15px", height: "15px" }} />} title="Trang trước" />}
              <span style={{ padding: "0 12px", fontSize: "12px", fontWeight: 500, color: "var(--ink-body)", fontVariantNumeric: "tabular-nums" }}>
                {page} / {totalPages}
              </span>
              {page < totalPages && <PaginationBtn onClick={() => onPageChange(page + 1)} disabled={false} icon={<ChevronRight style={{ width: "15px", height: "15px" }} />} title="Trang tiếp" />}
              {page < totalPages && <PaginationBtn onClick={() => onPageChange(totalPages)} disabled={false} label="»" title="Trang cuối" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PaginationBtn({
  onClick, disabled, icon, label, title,
}: {
  onClick: () => void;
  disabled: boolean;
  icon?: React.ReactNode;
  label?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="psx-btn-secondary"
      style={{
        width: "28px", height: "28px", padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {icon ?? label}
    </button>
  );
}

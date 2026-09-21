import type { ReportFieldDef, ReportRow } from "./report-fields";
import type { ReportTotal } from "./report-totals";

// Sinh PDF báo cáo đơn hàng bằng pdfmake (client-side) và MỞ INLINE trên trình duyệt.
// - Chữ nét (vector), font Roboto hỗ trợ tiếng Việt.
// - Hộp "Tổng hợp" đặt Ở ĐẦU (tổng TL 3D, QĐ 24K, số MO).
// - Không đụng REPORT_FIELDS: cột + tổng đều truyền vào từ nguồn chung.

export interface BuildReportArgs {
  title: string;
  period: string;
  meta: string; // dòng "Người xuất … · Ngày xuất …"
  cols: ReportFieldDef[];
  rows: ReportRow[];
  totals: ReportTotal[];
  orientation: "portrait" | "landscape";
}

const INK = "#1a1a1a";
const MUTED = "#666666";
const HEAD_BG = "#efece5";
const ZEBRA = "#faf8f4";
const BORDER = "#d9d2c7";

const fmtG = (n: number) => `${n.toFixed(3)} g`;

// ── Bố cục trang ─────────────────────────────────────────────────────────────
// Khổ A4 theo point (pdfmake dùng pt). Trừ lề trái/phải để ra bề ngang dùng được.
const A4 = { portrait: 595.28, landscape: 841.89 };
const MARGIN_X = 28;   // khớp pageMargins bên dưới
const IDX_COL_W = 16;  // cột "#"

// Cỡ chữ tự co theo số cột — nhiều cột thì chữ nhỏ lại để bớt ngắt dòng vụn.
// Khai dạng bảng ngưỡng: sửa 1 dòng là đổi được hành vi, không rải if-else.
const FONT_STEPS: { maxCols: number; size: number }[] = [
  { maxCols: 8,        size: 8 },
  { maxCols: 12,       size: 7 },
  { maxCols: 16,       size: 6.5 },
  { maxCols: Infinity, size: 6 },
];
const fontSizeFor = (n: number) => FONT_STEPS.find((s) => n <= s.maxCols)!.size;

// Padding ngang mỗi bên ô — thu hẹp khi nhiều cột để nhường chỗ cho chữ.
const cellPadFor = (n: number) => (n <= 8 ? 5 : n <= 12 ? 3 : 2);
const V_LINE_W = 0.5; // khớp layout.vLineWidth bên dưới

// Quy đổi widthWeight (khai trong REPORT_FIELDS) → ĐỘ RỘNG SỐ TUYỆT ĐỐI vừa khít trang.
//
// VÌ SAO KHÔNG DÙNG "*": pdfmake tính minWidth mỗi cột = từ dài nhất không ngắt được; nếu
// TỔNG minWidth vượt bề ngang trang thì nó KHÔNG co lại mà cho bảng tràn ra ngoài lề phải,
// các cột dư bị CẮT MẤT hẳn khỏi bản in. Với độ rộng số cụ thể, pdfmake buộc phải ngắt dòng
// chữ BÊN TRONG ô — hàng cao lên nhưng không cột nào biến mất.
// LƯU Ý: pdfmake cộng padding + đường kẻ dọc RA NGOÀI giá trị `widths` (widths = bề rộng
// phần NỘI DUNG). Phải trừ chúng ra trước khi chia, nếu không bảng vẫn tràn — đúng lỗi cũ.
function computeWidths(cols: ReportFieldDef[], orientation: "portrait" | "landscape"): number[] {
  const nCells = cols.length + 1;                    // +1 cho cột "#"
  const pad = cellPadFor(cols.length);
  const overhead = nCells * pad * 2 + (nCells + 1) * V_LINE_W;
  const avail = A4[orientation] - MARGIN_X * 2 - IDX_COL_W - overhead;
  const weights = cols.map((c) => c.widthWeight ?? 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  // Sàn 18pt: cột trọng số nhỏ vẫn đủ chỗ cho vài ký tự khi chọn rất nhiều cột.
  const floored = weights.map((w) => Math.max(18, (w / totalWeight) * avail));
  // Nếu sàn làm tổng vượt khổ giấy (rất nhiều cột trên khổ Dọc) → co đều lại cho vừa,
  // vì tràn 1pt cũng đủ khiến pdfmake cắt mất cột cuối.
  const sum = floored.reduce((a, b) => a + b, 0);
  return sum > avail ? floored.map((w) => (w / sum) * avail) : floored;
}

// docDefinition thuần dữ-liệu — dễ chỉnh giao diện tại 1 chỗ.
export function buildReportDoc(args: BuildReportArgs): Record<string, unknown> {
  const { title, period, meta, cols, rows, totals, orientation } = args;
  const tableFont = fontSizeFor(cols.length);
  const cellPad = cellPadFor(cols.length);

  const headerRow = [
    { text: "#", style: "th", alignment: "left" },
    ...cols.map((c) => ({ text: c.label, style: "th", alignment: c.align ?? "left" })),
  ];
  const bodyRows = rows.map((r, i) => [
    { text: String(i + 1), style: "td" },
    ...cols.map((c) => ({ text: c.accessor(r), style: "td", alignment: c.align ?? "left" })),
  ]);

  // Hộp Tổng hợp (đầu trang): số MO + các tổng khai báo (TL 3D, QĐ 24K…).
  // Tổng có unitConvert (VD QĐ 24K/QĐ Bạc → Lượng, 37.5g) hiện thêm phụ chú quy đổi — KHÔNG
  // áp dụng cho TL3D (trọng lượng thiết kế thô, không phải hàm lượng kim loại ròng).
  const summaryItems = [
    { text: [{ text: "Tổng: ", color: MUTED }, { text: `${rows.length} MO`, bold: true }] },
    ...totals.map((t) => ({
      text: [
        { text: `Tổng ${t.label}: `, color: MUTED },
        { text: fmtG(t.total), bold: true },
        ...(t.unitConvert
          ? [{ text: ` (≈ ${(t.total / t.unitConvert.factor).toFixed(2)} ${t.unitConvert.label})`, color: MUTED, italics: true }]
          : []),
      ],
    })),
  ];

  return {
    pageOrientation: orientation,
    pageSize: "A4",
    pageMargins: [28, 38, 28, 36],
    defaultStyle: { font: "Roboto", fontSize: 8, color: INK },
    content: [
      { text: title, style: "title" },
      ...(period ? [{ text: period, style: "sub" }] : []),
      { text: meta, style: "meta" },
      {
        margin: [0, 10, 0, 10],
        table: { widths: ["*"], body: [[{ columns: summaryItems, columnGap: 18, style: "summary" }]] },
        layout: {
          hLineWidth: () => 0.8, vLineWidth: () => 0.8,
          hLineColor: () => BORDER, vLineColor: () => BORDER,
          paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 7, paddingBottom: () => 7,
        },
      },
      {
        table: {
          headerRows: 1,
          widths: [IDX_COL_W, ...computeWidths(cols, orientation)],
          body: [headerRow, ...bodyRows],
        },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex === 0 ? HEAD_BG : rowIndex % 2 === 0 ? ZEBRA : null),
          hLineWidth: () => 0.5, vLineWidth: () => 0.5,
          hLineColor: () => BORDER, vLineColor: () => BORDER,
          paddingLeft: () => cellPad, paddingRight: () => cellPad, paddingTop: () => 3, paddingBottom: () => 3,
        },
      },
    ],
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: "center", fontSize: 7, color: MUTED, margin: [0, 6, 0, 0],
    }),
    styles: {
      title: { fontSize: 15, bold: true, alignment: "center", margin: [0, 0, 0, 2] },
      sub: { fontSize: 10, bold: true, alignment: "center", color: "#8a5a2b", margin: [0, 0, 0, 2] },
      meta: { fontSize: 8, alignment: "center", color: MUTED },
      summary: { fontSize: 9 },
      th: { bold: true, fontSize: tableFont },
      td: { fontSize: tableFont },
    },
  };
}

// Mở PDF inline trên tab mới (không ép tải xuống máy). Mở window NGAY trong user-gesture
// trước khi await import → tránh bị chặn popup.
export async function openReportPdf(args: BuildReportArgs): Promise<void> {
  // Mở window NGAY trong user-gesture (trước await) để tránh bị chặn popup.
  const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
  try {
    const pdfMakeMod = await import("pdfmake/build/pdfmake");
    const vfsMod = await import("pdfmake/build/vfs_fonts");
    // pdfmake 0.2.x: vfs gán qua .vfs; vfs_fonts export { pdfMake: { vfs } }.
    const pdfMake = ((pdfMakeMod as unknown as { default?: unknown }).default ?? pdfMakeMod) as {
      vfs: unknown;
      createPdf: (doc: unknown) => { getBlob: (cb: (b: Blob) => void) => void };
    };
    const vfsRoot = ((vfsMod as unknown as { default?: unknown }).default ?? vfsMod) as { pdfMake?: { vfs: unknown }; vfs?: unknown };
    pdfMake.vfs = vfsRoot.pdfMake?.vfs ?? vfsRoot.vfs;

    const doc = buildReportDoc(args);
    pdfMake.createPdf(doc).getBlob((blob: Blob) => {
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url;
      else window.open(url, "_blank");
    });
  } catch (err) {
    if (win) win.close();
    throw err;
  }
}

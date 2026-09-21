// Luật của form Tạo đơn: hạn dự kiến, và phép dựng payload gửi lên POST /api/orders.
// Đây là chỗ quyết định dữ liệu nào đi vào DB cho một đơn MỚI.
// Bẫy đã biết nằm ở tên test: __tests__/orders-create-payload.test.ts

import { PRIORITY_SLA_DAYS, type PriorityCode } from "@/app/lib/business/order-helpers";

export type FlowType = "production" | "pre_production";

export type ItemDraft = {
  moId: string; tenSp: string; nvl: string; soLuong: string; size: string;
  trongLuongYc: string; xiMa: string; loaiHotChu: string; thongSoDaChu: string;
  thongSoDaTam: string; file3d: string; dienGiai: string; ghiChuSp: string;
};

export type FormDraft = {
  soOdoo: string; khachHang: string; salesName: string; nguon: string; phanLoaiKh: string;
  uuTien: PriorityCode | "";
  ngayChot: string;
  ngayDukien: string;
  dateIsAuto: boolean;
  donHang3Sao: boolean; linkChat: string; ghiChu: string;
  loaiDon: FlowType;
  items: ItemDraft[];
};

/**
 * Ngày ISO (`yyyy-mm-dd`) → mốc UTC nửa đêm.
 *
 * 🔴 Parse theo giờ LOCAL rồi đọc lại bằng `.toISOString()` là hai múi giờ khác nhau và LỆCH
 * MỘT NGÀY: máy VN (+7) đọc "00:00 ngày 19" thành "17:00 ngày 18 UTC", cắt ra "18".
 */
const utcMidnight = (ymd: string): Date => new Date(`${ymd}T00:00:00Z`);

/** "Hôm nay" theo giờ VN (+7). Dùng UTC trần thì 00:00–07:00 giờ VN còn là ngày hôm trước. */
export function todayVn(now: Date): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Hạn dự kiến = ngày chốt + SLA của mức ưu tiên. Thiếu một trong hai thì để trống. */
export function calcDukien(uuTien: PriorityCode | "", ngayChot: string): string {
  if (!uuTien || !ngayChot) return "";
  const due = utcMidnight(ngayChot);
  due.setUTCDate(due.getUTCDate() + PRIORITY_SLA_DAYS[uuTien]);
  return due.toISOString().slice(0, 10);
}

export function formatDateVN(iso: string): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/** Lỗi ĐẦU TIÊN của mỗi ô — ô đã có lỗi thì không ghi đè bằng lỗi sau. */
export function parseZodErrors(
  issues: Array<{ path: (string | number | symbol)[]; message: string }>,
): Record<string, string> {
  const byField: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (!byField[key]) byField[key] = issue.message;
  }
  return byField;
}

const orUndefined = (value: string): string | undefined => value || undefined;

/** Ô trống KHÔNG được gửi: server phân biệt "không gửi" với "gửi chuỗi rỗng". */
export function toPayload(form: FormDraft, storeMap: Record<string, string>) {
  return {
    orderNumber: form.soOdoo.trim(),
    customerName: form.khachHang,
    saleNote: orUndefined(form.ghiChu.trim()),
    loaiDon: form.loaiDon,
    // `nguon` là mã cửa hàng (CH1); storeId là FK. Mã lạ → không gửi FK, không bịa.
    storeId: form.nguon ? storeMap[form.nguon] ?? undefined : undefined,
    nguon: orUndefined(form.nguon),
    phanLoaiKh: orUndefined(form.phanLoaiKh),
    donHang3Sao: form.donHang3Sao,
    linkChat: orUndefined(form.linkChat),
    salesName: orUndefined(form.salesName),
    priorityCode: (form.uuTien || "Normal") as PriorityCode,
    // Gửi ĐÚNG giá trị đang hiển thị, dù tự tính hay người dùng sửa tay. Trống thì không gửi —
    // server lưu trống chứ không tự bịa ra ngày.
    requiredDate: form.ngayDukien ? utcMidnight(form.ngayDukien).toISOString() : undefined,
    estimatedDate: form.ngayChot ? utcMidnight(form.ngayChot).toISOString() : undefined,
    items: form.items.map(toItemPayload),
  };
}

function toItemPayload(item: ItemDraft) {
  // `specifications` chỉ chứa trường KHÔNG có cột DB riêng.
  const specs: Record<string, string> = {};
  if (item.thongSoDaTam) specs.chiTietDaTam = item.thongSoDaTam;
  if (item.ghiChuSp) specs.ghiChuSp = item.ghiChuSp;

  const weight = parseFloat(item.trongLuongYc);

  return {
    moNumber: item.moId.trim(),
    productName: item.tenSp,
    nvl: orUndefined(item.nvl),
    quantity: parseInt(item.soLuong) || 1,
    weightGram: item.trongLuongYc && weight > 0 ? weight : undefined,
    size: orUndefined(item.size),
    platingType: orUndefined(item.xiMa),
    mainStoneType: orUndefined(item.loaiHotChu),
    mainStoneSize: orUndefined(item.thongSoDaChu),
    techNote: orUndefined(item.dienGiai),
    designFileUrl: orUndefined(item.file3d.trim()),
    specifications: Object.keys(specs).length > 0 ? specs : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NHẮC VIỆC TỪ MẺ ĐỒNG BỘ GOOGLE SHEET
//
// 🔴 VÌ SAO KHÔNG DÙNG `Alert`:
//
// Route tạo cảnh báo (api/orders/[id]/alerts) LUÔN tạm ngưng đơn — nó không hề kiểm
// `severity`. Nhưng "Đặt đơn quên chuyển MO sang Hoàn tất" và "Ngày HT lệch một ngày so với
// sheet" KHÔNG phải lý do để dừng một đơn thật ngoài xưởng. Đó là LỜI NHẮC VIỆC, không phải
// cảnh báo về đơn hàng.
//
// (Chú thích trong terminology.ts từng ghi "chỉ CRITICAL mới auto-suspend" — SAI so với code,
// và chính câu đó suýt đẩy tính năng này vào đường dừng sản xuất vì một ô chưa bấm.)
//
// 🎯 TỰ ĐÓNG THEO CẤU TRÚC: mỗi lần đồng bộ ghi đè trọn ảnh chụp của tháng đó. Người dùng làm
// xong → mẻ sau không còn mục đó → nó biến mất. Không `isResolved`, không vòng đời để lệch.
//
// File THUẦN: không prisma, không React.
// ═══════════════════════════════════════════════════════════════════════════

import { isSameVnDay } from "@/app/lib/utils/vn-date";

/**
 * Toạ độ một MO trong lời nhắc — đủ để hiển thị đúng và dẫn tới đúng nơi.
 *
 * 🔴 `itemId` VÀ `so` PHẢI TUỲ CHỌN, KHÔNG ĐƯỢC BẮT BUỘC.
 *
 * `parseNoticePayload` loại bỏ phần tử thiếu trường bắt buộc. Ảnh chụp trong DB do bản code
 * TRƯỚC ghi ra không có hai trường này — bắt buộc chúng là toàn bộ lời nhắc đang có biến mất
 * khỏi màn hình cho tới mẻ đồng bộ kế tiếp, tức là im lặng đúng vào lúc đang có việc tồn.
 * Thiếu `itemId` → link lùi về cấp đơn hàng: xấu hơn, nhưng việc không mất.
 */
export type MoRef = {
  /** `moNumber` của WEBAPP (không phải chuỗi trong sheet) — xem NotCompletedMo ở sheet-sync.ts. */
  mo: string;
  orderId: string;
  /** OrderItem.id — hợp đồng `?activeItemId=` của OrderDetailPanel. */
  itemId?: string;
  /** SO# — chỉ để hiển thị dưới MO, giống bảng Đơn hàng. */
  so?: string;
  /**
   * Cờ hiển thị hậu tố "_1" ngầm định (xem isMoFromWebapp/getMoVersionDisplay).
   *
   * ⚠️ VẮNG = `false`, ĐÚNG NHƯ BẢNG ĐƠN HÀNG ĐANG LÀM (`?? false`). Bản trước đóng cứng `true`
   * ở tầng hiển thị, nên mọi MO nhập từ Odoo mọc thêm "_1" mà bảng không hề có — một MO hiện
   * hai kiểu ở hai màn hình.
   */
  isFromWebapp?: boolean;
};

/** MO xưởng đã hoàn tất theo sheet, nhưng webapp chưa chuyển sang tab Hoàn tất. */
export type ChuaHoanTat = MoRef;

/** Ngày HT trên webapp khác ngày trong sheet. Hệ thống KHÔNG ghi đè — người phải quyết. */
export type LechNgay = MoRef & {
  webapp: string;
  sheet: string;
};

export type SyncNoticePayload = {
  chuaHoanTat: ChuaHoanTat[];
  lechNgay: LechNgay[];
};

/** Một tháng đã quét, kèm mốc thời gian — giao diện PHẢI hiện mốc này. */
export type SyncNoticeMonth = {
  month: string;
  syncedAt: string;
  payload: SyncNoticePayload;
};

export const EMPTY_PAYLOAD: SyncNoticePayload = { chuaHoanTat: [], lechNgay: [] };

/**
 * Dựng ảnh chụp từ kết quả một lần đồng bộ.
 *
 * Nhận đúng hai mảng cần dùng chứ không nhận cả `SyncPlan`: module này không có lý do gì để
 * biết về `updates`, `notFound` hay `badDate`. Tham số hẹp thì chỗ gọi không thể vô tình
 * truyền nhầm thứ khác vào.
 */
export function buildNoticePayload(
  chuaHoanTat: readonly ChuaHoanTat[],
  lechNgay: readonly LechNgay[],
): SyncNoticePayload {
  return {
    chuaHoanTat: dedupeByMo(chuaHoanTat),
    lechNgay: dedupeByMo(lechNgay),
  };
}

/**
 * Bỏ MO trùng.
 *
 * ⚠️ CẦN THẬT, KHÔNG PHẢI PHÒNG XA: một MO có thể xuất hiện nhiều dòng trong sheet (nhiều
 * block CH2/CH3, hoặc gõ lặp). Không khử thì con số trên nút góc màn hình đếm sai, và một con
 * số sai là thứ làm người ta ngừng tin cả tính năng.
 */
function dedupeByMo<T extends { mo: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = it.mo.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/** Tổng số việc còn phải làm trong một ảnh chụp. */
export function countNotice(payload: SyncNoticePayload): number {
  return payload.chuaHoanTat.length + payload.lechNgay.length;
}

export function isEmptyNotice(payload: SyncNoticePayload): boolean {
  return countNotice(payload) === 0;
}

/**
 * VÂN TAY NỘI DUNG — quyết định popup có tự mở lại hay không.
 *
 * 🔴 THEO NỘI DUNG, KHÔNG THEO NGÀY. "Mỗi ngày hỏi một lần" nghĩa là sáng nào cũng bật lên
 * cùng ba MO cũ; người ta học cách bấm ✕ theo phản xạ trong hai ngày, rồi bấm qua luôn cả lần
 * có việc mới. Nội dung không đổi → im lặng. Có MO mới → tự mở lại.
 *
 * ⚠️ KHÔNG đưa `syncedAt` vào vân tay. Mẻ đồng bộ chạy MỖI NGÀY và luôn đổi mốc thời gian;
 * lấy nó vào là quay về đúng cái "mỗi ngày hỏi một lần" vừa loại bỏ.
 *
 * Sắp xếp trước khi nối: thứ tự MO trong sheet có thể đổi mà nội dung việc thì không.
 */
export function noticeFingerprint(months: readonly SyncNoticeMonth[]): string {
  const parts: string[] = [];
  for (const m of [...months].sort((a, b) => a.month.localeCompare(b.month))) {
    for (const x of [...m.payload.chuaHoanTat].sort((a, b) => a.mo.localeCompare(b.mo))) {
      parts.push(`C:${m.month}:${x.mo}`);
    }
    for (const x of [...m.payload.lechNgay].sort((a, b) => a.mo.localeCompare(b.mo))) {
      // Kèm cả hai ngày: cùng một MO nhưng lệch sang một cặp ngày KHÁC là một việc khác.
      parts.push(`N:${m.month}:${x.mo}:${x.webapp}|${x.sheet}`);
    }
  }
  return parts.join(";");
}

/**
 * Đọc payload thô từ cột JSON về kiểu đã biết.
 *
 * Cột `Json` của Prisma trả `unknown`, và dữ liệu trong đó do một bản code CŨ ghi ra. Tin nó
 * đúng hình là cách một trang trắng xuất hiện sau mỗi lần đổi cấu trúc. Sai hình → coi như
 * rỗng, KHÔNG ném lỗi: một lời nhắc việc không được phép làm sập màn hình của ai.
 */
export function parseNoticePayload(raw: unknown): SyncNoticePayload {
  if (!raw || typeof raw !== "object") return EMPTY_PAYLOAD;
  const o = raw as Record<string, unknown>;
  return {
    chuaHoanTat: Array.isArray(o.chuaHoanTat)
      ? (o.chuaHoanTat.filter(isChuaHoanTat) as ChuaHoanTat[])
      : [],
    lechNgay: Array.isArray(o.lechNgay) ? (o.lechNgay.filter(isLechNgay) as LechNgay[]) : [],
  };
}

/** Trường tuỳ chọn: vắng thì hợp lệ, có thì PHẢI là chuỗi. Nó đi thẳng vào href. */
function optionalString(v: unknown): boolean {
  return v === undefined || typeof v === "string";
}

function isMoRef(o: Record<string, unknown> | null): boolean {
  return (
    !!o &&
    typeof o.mo === "string" &&
    typeof o.orderId === "string" &&
    optionalString(o.itemId) &&
    optionalString(o.so) &&
    (o.isFromWebapp === undefined || typeof o.isFromWebapp === "boolean")
  );
}

function isChuaHoanTat(v: unknown): boolean {
  return isMoRef(v as Record<string, unknown> | null);
}

function isLechNgay(v: unknown): boolean {
  const o = v as Record<string, unknown> | null;
  return isMoRef(o) && typeof o!.webapp === "string" && typeof o!.sheet === "string";
}

// ─── Dàn phẳng để hiển thị: nhóm theo LOẠI VIỆC, tháng thành một cột ─────────
//
// 🎯 ĐẢO TRỤC, KHÔNG PHẢI TRANG TRÍ. Bản đầu nhóm theo tháng, nên câu giải thích của mỗi loại
// việc bị lặp lại ở MỖI tháng — hai tháng đã lặp hai lần, mà layout lấy tới 6 tháng.
//
// Lý do gốc: hai loại việc đòi HAI HÀNH ĐỘNG khác nhau ("vào bấm Hoàn tất" và "quyết định bên
// nào đúng"). Tháng không đổi hành động — nó là thuộc tính của một dòng, không phải một nhóm.
//
// Đây là hàm thuần, nằm ở tầng luật chứ không ở component: nó là phép biến đổi dữ liệu có thứ
// tự và có điều kiện, tức là thứ cần test.

export type FlatRow = MoRef & {
  /** "YYYY-MM" của tab sheet mà mục này đến từ. */
  month: string;
  /**
   * Mốc đồng bộ CỦA THÁNG NÀY — chỉ khác `null` khi nó không cùng ngày với mẻ mới nhất.
   *
   * 🔴 KHÔNG ĐƯỢC BỎ TRƯỜNG NÀY ĐỂ CHO GỌN. Mẻ hằng ngày chỉ quét tháng hiện tại + tháng
   * trước; tháng cũ hơn giữ nguyên ảnh chụp lần cuối và có thể đã cũ hàng tuần. Một danh sách
   * cũ trông y hệt một danh sách mới nếu không có mốc thời gian.
   *
   * Nhưng lặp mốc ở mọi dòng là nhiễu. Nên: im lặng khi cùng ngày với mẻ mới nhất, lên tiếng
   * khi không.
   */
  staleSyncedAt: string | null;
};

export type FlatLechNgay = FlatRow & { webapp: string; sheet: string };

export type FlatNotice = {
  chuaHoanTat: FlatRow[];
  lechNgay: FlatLechNgay[];
  /** Mốc của mẻ mới nhất — hiện MỘT lần ở đầu hộp thoại. */
  latestSyncedAt: string | null;
  total: number;
};

export function flattenNotice(months: readonly SyncNoticeMonth[]): FlatNotice {
  let latestSyncedAt: string | null = null;
  for (const m of months) {
    if (!latestSyncedAt || m.syncedAt > latestSyncedAt) latestSyncedAt = m.syncedAt;
  }

  const chuaHoanTat: FlatRow[] = [];
  const lechNgay: FlatLechNgay[] = [];

  // Tháng CŨ TRƯỚC: việc tồn lâu nhất là việc gấp nhất. Tháng hiện tại thì mẻ mai vẫn quét lại,
  // còn tháng cũ đã ra khỏi cửa sổ quét — không ai nhắc lại nữa.
  for (const m of [...months].sort((a, b) => a.month.localeCompare(b.month))) {
    const stale = latestSyncedAt && !isSameVnDay(m.syncedAt, latestSyncedAt) ? m.syncedAt : null;
    for (const x of m.payload.chuaHoanTat) chuaHoanTat.push({ ...x, month: m.month, staleSyncedAt: stale });
    for (const x of m.payload.lechNgay) lechNgay.push({ ...x, month: m.month, staleSyncedAt: stale });
  }

  return { chuaHoanTat, lechNgay, latestSyncedAt, total: chuaHoanTat.length + lechNgay.length };
}

/** Vai được thấy lời nhắc. Chuyển MO sang Hoàn tất không phải việc của PRODUCTION. */
export const SYNC_NOTICE_ROLES: readonly string[] = ["ADMIN", "ORDER"];

export function canSeeSyncNotice(role: string | undefined | null): boolean {
  return !!role && SYNC_NOTICE_ROLES.includes(role);
}

// Khi nào một lần sửa đơn PHẢI tự tạm ngưng sản xuất.
// Bẫy đã biết nằm ở tên test: __tests__/orders-auto-pause.test.ts

/** Trường trọng yếu: đổi chúng giữa lúc đang sản xuất là xưởng đang làm theo dữ liệu cũ. */
const CRITICAL_FIELD_LABELS = {
  customerName: "Khách hàng",
  salesName: "Sales",
  estimatedDate: "Ngày chốt SX",
} as const;

/** Chỉ ba trạng thái này mới coi là "đang sản xuất" — sửa trước đó thì chưa ai làm gì. */
const ACTIVE_PRODUCTION_STATUSES = ["IN_PRODUCTION", "QUALITY_CHECK", "COMPLETED"];

export type AutoPauseResult = { type: "MANUAL_NOTE" | "CRITICAL_CHANGE"; note: string } | null;

export type AutoPauseInput = {
  saleNoteIncluded: boolean;
  newSaleNote: string;
  prevSaleNote: string;
  customerName: string | undefined;
  prevCustomerName: string | null;
  salesName: string | undefined;
  prevSalesName: string | null;
  estimatedDate: string | null | undefined;
  prevEstimatedDate: Date | null;
  effectiveStatus: string;
  isChangeApproved: boolean;
};

/** `undefined` = client KHÔNG gửi trường này. Chỉ so khi có gửi, nếu không mọi lần lưu đều "đổi". */
const changed = (incoming: unknown, previous: unknown): boolean =>
  incoming !== undefined && incoming !== previous;

const vnDayOnly = (value: string | Date | null | undefined): string | null =>
  value ? new Date(value).toISOString().slice(0, 10) : null;

/** Giờ Việt Nam. Dự án đã trả giá một lần: `getHours()` chạy local đúng, lên Vercel lệch 7 tiếng. */
function vnTimeStamp(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh", hour12: false,
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
  }).formatToParts(now);
  const at = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${at("hour")}:${at("minute")} ${at("day")}/${at("month")}`;
}

/**
 * `now` truyền vào chứ không gọi `new Date()` bên trong: bản cũ tự nhận là "pure function"
 * nhưng đọc đồng hồ, nên không test tất định được.
 */
export function detectAutoPause(input: AutoPauseInput, now: Date): AutoPauseResult {
  if (input.saleNoteIncluded && input.newSaleNote !== "" && input.newSaleNote !== input.prevSaleNote) {
    return { type: "MANUAL_NOTE", note: input.newSaleNote };
  }

  // Đã được duyệt thay đổi thì không ngưng lại lần nữa — người có thẩm quyền đã biết và đồng ý.
  if (!ACTIVE_PRODUCTION_STATUSES.includes(input.effectiveStatus) || input.isChangeApproved) return null;

  const changedLabels = [
    changed(input.customerName, input.prevCustomerName) && CRITICAL_FIELD_LABELS.customerName,
    changed(input.salesName, input.prevSalesName) && CRITICAL_FIELD_LABELS.salesName,
    input.estimatedDate !== undefined &&
      vnDayOnly(input.estimatedDate) !== vnDayOnly(input.prevEstimatedDate) &&
      CRITICAL_FIELD_LABELS.estimatedDate,
  ].filter(Boolean) as string[];

  if (changedLabels.length === 0) return null;

  return {
    type: "CRITICAL_CHANGE",
    note: `Yêu cầu thay đổi ${changedLabels.join(", ")} lúc ${vnTimeStamp(now)}`,
  };
}

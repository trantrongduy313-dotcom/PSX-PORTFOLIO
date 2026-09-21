// Phát hiện "xoá trắng field quan trọng" — Tầng 1 giám sát mất dữ liệu.
//
// Dùng chung cho các route ghi (production, items/[itemId]) và API Lịch sử thay đổi
// để danh sách field + logic phát hiện luôn NHẤT QUÁN.
//
// Một thay đổi bị coi là "xoá trắng" khi: field nằm trong danh sách quan trọng, giá trị
// CŨ có nội dung thật (khác rỗng) và giá trị MỚI rỗng. changes[].old/new đã được chuẩn
// hoá thành chuỗi ("" cho rỗng/null) tại nơi tính diff, nên chỉ cần so chuỗi ở đây.

// Field quan trọng — mất giá trị = đáng ghi nhận để soát/khôi phục.
// So khớp sau khi bỏ tiền tố "spec." (items route ghi override dạng "spec.customerName").
export const IMPORTANT_FIELDS = new Set<string>([
  "customerName",
  "salesName",
  "estimatedDate",
  "requiredDate",
  "tl3d",
  "weightGram",
  "productName",
]);

// Nhãn tiếng Việt để hiển thị badge (tuỳ chọn dùng ở client).
export const IMPORTANT_FIELD_LABELS: Record<string, string> = {
  customerName: "Khách hàng",
  salesName: "Sales",
  estimatedDate: "Ngày DK HT",
  requiredDate: "Ngày yêu cầu",
  tl3d: "TL 3D",
  weightGram: "Trọng lượng",
  productName: "Tên SP",
};

type Change = { field: string; old: string; new: string };

function baseField(field: string): string {
  return field.startsWith("spec.") ? field.slice("spec.".length) : field;
}

const isEmpty = (v: string | null | undefined): boolean => (v ?? "").trim() === "";

// Trả về danh sách BASE field bị xoá trắng (rỗng nếu không có). Nhận diện theo changes[].
export function detectClearedFields(changes: Change[] | undefined | null): string[] {
  if (!changes || changes.length === 0) return [];
  const cleared: string[] = [];
  for (const c of changes) {
    const base = baseField(c.field);
    if (!IMPORTANT_FIELDS.has(base)) continue;
    if (!isEmpty(c.old) && isEmpty(c.new)) cleared.push(base);
  }
  // Loại trùng, giữ thứ tự xuất hiện.
  return [...new Set(cleared)];
}

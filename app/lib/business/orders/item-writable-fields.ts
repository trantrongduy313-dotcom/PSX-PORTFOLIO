// Field nào của `updateOrderItemSchema` được ghi vào `order_items`, và vai nào ghi được.
//
// Luật có test: __tests__/item-writable-fields.test.ts + __tests__/ma-so-mau.test.ts
// Vì sao là danh sách TRẮNG, và ba lỗi nó sinh ra để chặn:
//   docs/04_ENGINEERING_GUIDELINES.md § Danh sách trắng cột ghi được

import { MA_SO_MAU_FIELD } from "@/app/lib/business/orders/ma-so-mau";

/**
 * Cột được vòng lặp chung chép THẲNG vào DB.
 *
 * ⚠️ Thêm một cột thật mà quên khai ở đây thì API vẫn trả 200 và giá trị không bao giờ vào DB —
 * hỏng im lặng, không có lỗi nào để lần theo. Đã xảy ra hai lần (`sampleImageUrl`,
 * `design3DPriorityCode`).
 */
export const WRITABLE_ORDER_ITEM_COLUMNS = [
  "itemStatus",
  "moNumber",
  "productName",
  "nvl",
  "platingType",
  "size",
  "weightGram",
  "mainStoneType",
  "mainStoneSize",
  "designFileUrl",
  "techClassification",
  "techNote",
  "sampleImageUrl",
  // `sampleVideoUrl` là cột CŨ chưa bị bỏ; `sampleFolderUrl` là tên đang dùng. Bỏ cột cũ là một
  // migration riêng — tới lúc đó xoá luôn dòng trên.
  "sampleVideoUrl",
  "sampleFolderUrl",
  // 🔴 KHÔNG thêm `sampleImageUploads`. Chỉ route sample-images được ghi nó — nơi duy nhất kiểm
  // loại file, dung lượng, trần 2 ảnh và dọn object cũ. Có test canh dòng này.
  "design3DPriorityCode",
  "masoMau",
] as const;

/**
 * Field có trong payload nhưng KHÔNG BAO GIỜ là cột — chỉ để route đọc rồi quyết định.
 *
 * Khai riêng thay vì chỉ để chúng vắng mặt ở trên: người đọc sau cần biết đó là cố ý, không
 * phải bỏ sót — nếu không họ sẽ "sửa" bằng cách thêm vào, tức dựng lại đúng lỗi cũ.
 */
export const ORDER_ITEM_CONTROL_FIELDS = ["statusReason", "adminOverride", "version"] as const;

/**
 * Vai bị hạn chế cột. KHÔNG khai ở đây = ghi được toàn bộ — cùng quy ước "không khai = dùng
 * chung" với `ORDER_FILTER_SCOPE`, nhờ vậy thêm cột mới không phải sửa bảng này.
 *
 * ⚠️ Vai nào VÀO ĐƯỢC route là chuyện của route. Bảng này trả lời câu khác: vào rồi thì ghi
 * được cột nào. Gộp hai tầng là trả lời đúng một nửa.
 */
export const ROLE_WRITABLE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  RND: [MA_SO_MAU_FIELD],
};

/**
 * Field route tự biến đổi trước khi ghi (chuỗi → Date, trộn JSON, suy ra isPriority/isRush).
 *
 * 🔴 Route destructure chúng RA TRƯỚC `pickWritableItemColumns`, nên chúng đi vòng qua danh
 * sách trắng. Có mặt ở đây để `canRoleWriteField` vẫn gác được chúng — thiếu, thì một vai
 * hạn chế ghi được tên khách hàng, tên sale, BOM, ngày dự kiến và mức ưu tiên.
 */
export const ROUTE_HANDLED_ITEM_FIELDS = [
  "specifications",
  "estimatedDate",
  "requiredDate",
  "saleNote",
  "priorityCode",
] as const;

const ALL_WRITABLE_ITEM_FIELDS: readonly string[] = [
  ...WRITABLE_ORDER_ITEM_COLUMNS,
  ...ROUTE_HANDLED_ITEM_FIELDS,
];

export function writableColumnsForRole(role: string): readonly string[] {
  return ROLE_WRITABLE_COLUMNS[role] ?? ALL_WRITABLE_ITEM_FIELDS;
}

/** Suy TỪ `ROLE_WRITABLE_COLUMNS`, không phải một danh sách thứ hai — hai bảng thì hai bảng lệch. */
export function isPartialWriteRole(role: string | undefined | null): boolean {
  return !!role && role in ROLE_WRITABLE_COLUMNS;
}

export function canRoleWriteField(role: string, field: string): boolean {
  return writableColumnsForRole(role).includes(field);
}

export function pickWritableItemColumns(
  payload: Record<string, unknown>,
  role: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // Lớp thứ hai sau phép destructure của route: chép thô là ghi sai kiểu hoặc đè mất JSON cũ.
  const routeHandled = new Set<string>(ROUTE_HANDLED_ITEM_FIELDS);
  for (const key of writableColumnsForRole(role)) {
    if (routeHandled.has(key)) continue;
    const val = payload[key];
    if (val !== undefined) out[key] = val;
  }
  return out;
}

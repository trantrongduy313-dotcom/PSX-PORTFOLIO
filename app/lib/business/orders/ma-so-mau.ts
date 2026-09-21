// Mã số mẫu — R&D nhập cho MO đã chốt sản xuất. Luật có test: __tests__/ma-so-mau.test.ts
//
// Bốn quyết định của nghiệp vụ, không suy ra được từ code:
//   1. PER-MO, không per-SO. Sửa mã của MO A không đụng MO B trong cùng SO.
//   2. CHỈ Ở PSX. Ở PTK thiết kế chưa chốt, chưa có gì để đánh mã.
//   3. KHÔNG kế thừa khi nâng phiên bản — bản mới là thiết kế khác.
//   4. Rollback PSX → PTK thì GIỮ. Mã đã cấp là đã cấp.

/** Tên cột. Một hằng để chỗ gỡ khỏi phiên bản và chỗ khai quyền ghi không thể lệch chữ. */
export const MA_SO_MAU_FIELD = "masoMau" as const;

/** ORDER và ADMIN cũng có, không chỉ R&D: quản lý phải sửa được khi R&D nhập nhầm. */
export const MA_SO_MAU_EDITOR_ROLES: readonly string[] = ["ORDER", "RND", "ADMIN"];

/** `itemZone` là zone của MO, KHÔNG phải của SO — một SO có thể pha trộn PTK và PSX. */
export function canEditMaSoMau(role: string | undefined | null, itemZone: string | undefined | null): boolean {
  if (!role || !MA_SO_MAU_EDITOR_ROLES.includes(role)) return false;
  return itemZone === "MASTER_HUB";
}

export function shouldShowMaSoMau(itemZone: string | undefined | null): boolean {
  return itemZone === "MASTER_HUB";
}

/**
 * Gỡ `masoMau` khỏi dữ liệu chép sang phiên bản mới (quyết định 3).
 *
 * Nhận `Record<string, unknown>` chứ không phải OrderItem: chỗ gọi đang thao tác trên object
 * đã trải phẳng bằng spread, và ép kiểu ở đó chỉ để đi qua hàm này là một lời nói dối.
 */
export function stripMaSoMauForNewVersion<T extends Record<string, unknown>>(itemData: T): T {
  if (!(MA_SO_MAU_FIELD in itemData)) return itemData;
  const out = { ...itemData };
  delete out[MA_SO_MAU_FIELD];
  return out;
}

/** Cột nullable, nên "chưa có mã" chỉ được có MỘT cách viết: `null`, không phải `""`. */
export function normalizeMaSoMau(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Payload có thật sự CỐ GHI mã không — hỏi "bị sửa", không hỏi "có mặt".
 *
 * Sidebar gửi cả cụm field mỗi lần Lưu, nên sự có mặt không mang thông tin gì.
 */
export function maSoMauWriteAttempted(
  incoming: string | null | undefined,
  current: string | null | undefined,
): boolean {
  if (incoming === undefined) return false;
  return normalizeMaSoMau(incoming ?? "") !== normalizeMaSoMau(current ?? "");
}

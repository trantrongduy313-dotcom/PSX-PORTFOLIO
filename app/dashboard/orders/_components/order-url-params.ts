import { filterParamsToDropOn } from "@/app/lib/ui/order-filter-scope";
import type { OrderFilters } from "@/app/lib/types/order";

// ─── Dựng URL mới cho màn Đơn hàng — HÀM THUẦN ───────────────────────────────
//
// Trước đây toàn bộ phần này nằm trong `updateUrl` của orders-client.tsx, tức nằm trong một
// component. Nó KHÔNG test được ở đó, và nó chạy trên MỌI thao tác của màn đông người dùng
// nhất: đổi tab, gõ tìm kiếm, chọn cửa hàng, sang trang, mở panel.
//
// 🔴 TÁCH RA VÌ MỘT LÝ DO CỤ THỂ, KHÔNG PHẢI CHO ĐẸP: việc rửa bộ lọc khi đổi tab (bên dưới)
// là thay đổi hành vi trên chính đường đi đó, và tôi cần một bộ test đặc tính chốt rằng những
// bộ lọc DÙNG CHUNG vẫn còn nguyên sau khi đổi tab. Không tách thì không có lưới nào cả.
//
// ⚠️ CHUỖI `if ("x" in patch)` DÀI VÀ LẶP — CHÉP NGUYÊN VĂN, CỐ Ý KHÔNG VIẾT LẠI. Nó không phải
// nguyên nhân của lỗi đang sửa, và gom lại thành vòng lặp bảng sẽ đổi hành vi ở đúng những ca
// lẻ mà mỗi nhánh đang xử riêng (`stageFilter` xoá `page`, `orderId` xoá `activeItemId`,
// `datePreset` chỉ ghi khi >= 0…). Đổi rủi ro lấy vẻ đẹp, trên màn này, là một vụ hời cho không ai.
//
// Kiểm tra `"x" in patch` chứ không phải `patch.x` là CÓ CHỦ Ý xuyên suốt: `undefined` nghĩa là
// "xoá tham số này", còn vắng mặt nghĩa là "đừng đụng tới". Hai điều khác nhau.

export type UrlPatch = Partial<
  OrderFilters & {
    isPriority: boolean;
    datePreset: number;
    orderId: string | null;
    activeItemId: string | null;
    dateFrom: string;
    dateTo: string;
    requiredDateFrom: string;
    requiredDateTo: string;
    deadlinePreset: "week" | "thisWeek" | "overdue" | null;
    estimatedDateFrom: string;
    estimatedDateTo: string;
    stageFilter: string;
    storeId: string;
    phanLoaiKh: string;
    completedDateFrom: string;
    completedDateTo: string;
    bomFilter: string;
    view: "table" | "card";
    _w: string;
  }
>;

/**
 * Dựng bộ tham số mới từ bộ hiện tại + một patch.
 *
 * KHÔNG sửa `current` — trả về một `URLSearchParams` mới.
 */
export function buildNextParams(current: URLSearchParams, patch: UrlPatch): URLSearchParams {
  const p = new URLSearchParams(current.toString());


  if (patch.tab !== undefined) {
    if (patch.tab === "master-hub") p.delete("tab"); // PSX là mặc định → URL sạch
    else p.set("tab", patch.tab);
    p.delete("limit"); // reset to tab's default when switching
    p.delete("_w");    // clear cache-warm signal on tab switch → allows SSR to seed new tab

    // 🔴 RỬA BỘ LỌC KHÔNG THUỘC TAB MỚI.
    //
    // Thiếu ba dòng này thì một bộ lọc theo tab (Tiến độ, BOM, Ngày hoàn tất…) VẪN ĐANG LỌC sau
    // khi đổi tab, trong khi ô điều khiển của nó đã biến mất — người dùng thấy một danh sách
    // thiếu và không có cách nào tắt nó, vì cái nút đã không còn trên màn hình.
    //
    // Danh sách rửa đọc từ ORDER_FILTER_SCOPE — CÙNG bảng mà toolbar dùng để quyết định có vẽ ô
    // đó không. Một nguồn, nên "ô biến mất" và "giá trị bị rửa" không thể lệch nhau. Trước đây
    // chúng lệch, và đó chính là lỗi này.
    //
    // ⚠️ CHỈ rửa khi patch CÓ `tab`. Người dùng đang ở PSX gõ tìm kiếm thì không được mất bộ
    // lọc Tiến độ họ vừa chọn.
    for (const param of filterParamsToDropOn(patch.tab)) p.delete(param);
  }
  if ("search" in patch) {
    patch.search ? p.set("search", patch.search) : p.delete("search");
  }
  if ("status" in patch) {
    patch.status ? p.set("status", patch.status) : p.delete("status");
  }
  // ⚠️ KHÔNG CÓ `isRush` Ở ĐÂY, VÀ ĐÓ LÀ CHỦ Ý. Nó từng là tham số thứ hai cho ĐÚNG truy vấn
  // này: api/orders/route.ts dùng một câu `if (isPriority || isRush)` → cùng lọc priorityCode
  // = UT1. Hai nút khác tên, đặt ở hai chỗ khác nhau, ra cùng một kết quả — nên không ai có cơ
  // hội nhận ra chúng trùng nhau. Đã bỏ nút; thấy `isRush` trong log cũ thì đó là lý do.
  if ("isPriority" in patch) {
    patch.isPriority ? p.set("isPriority", "true") : p.delete("isPriority");
  }
  if ("deadlinePreset" in patch) {
    patch.deadlinePreset ? p.set("deadlinePreset", patch.deadlinePreset) : p.delete("deadlinePreset");
  }
  if ("requiredDateFrom" in patch) {
    patch.requiredDateFrom ? p.set("requiredDateFrom", patch.requiredDateFrom) : p.delete("requiredDateFrom");
  }
  if ("requiredDateTo" in patch) {
    patch.requiredDateTo ? p.set("requiredDateTo", patch.requiredDateTo) : p.delete("requiredDateTo");
  }
  if ("estimatedDateFrom" in patch) {
    patch.estimatedDateFrom ? p.set("estimatedDateFrom", patch.estimatedDateFrom) : p.delete("estimatedDateFrom");
  }
  if ("estimatedDateTo" in patch) {
    patch.estimatedDateTo ? p.set("estimatedDateTo", patch.estimatedDateTo) : p.delete("estimatedDateTo");
  }
  if ("datePreset" in patch && patch.datePreset != null) {
    patch.datePreset >= 0
      ? p.set("datePreset", String(patch.datePreset))
      : p.delete("datePreset");
  }
  if ("orderId" in patch) {
    patch.orderId ? p.set("orderId", patch.orderId) : p.delete("orderId");
    if (!patch.orderId) p.delete("activeItemId");
  }
  if ("activeItemId" in patch) {
    patch.activeItemId ? p.set("activeItemId", patch.activeItemId) : p.delete("activeItemId");
  }
  if ("dateFrom" in patch) {
    patch.dateFrom ? p.set("dateFrom", patch.dateFrom) : p.delete("dateFrom");
  }
  if ("dateTo" in patch) {
    patch.dateTo ? p.set("dateTo", patch.dateTo) : p.delete("dateTo");
  }
  if ("stageFilter" in patch) {
    patch.stageFilter ? p.set("stageFilter", patch.stageFilter) : p.delete("stageFilter");
    // stageFilter replaces page (no pagination in filter mode)
    p.delete("page");
  }
  if ("storeId" in patch) {
    patch.storeId ? p.set("storeId", patch.storeId) : p.delete("storeId");
  }
  if ("phanLoaiKh" in patch) {
    patch.phanLoaiKh ? p.set("phanLoaiKh", patch.phanLoaiKh) : p.delete("phanLoaiKh");
    p.delete("page");
  }
  if ("completedDateFrom" in patch) {
    patch.completedDateFrom ? p.set("completedDateFrom", patch.completedDateFrom) : p.delete("completedDateFrom");
  }
  if ("completedDateTo" in patch) {
    patch.completedDateTo ? p.set("completedDateTo", patch.completedDateTo) : p.delete("completedDateTo");
  }
  if ("bomFilter" in patch) {
    patch.bomFilter ? p.set("bomFilter", patch.bomFilter) : p.delete("bomFilter");
    p.delete("page");
  }
  if (patch.sortBy) p.set("sortBy", patch.sortBy);
  if (patch.sortDir) p.set("sortDir", patch.sortDir);
  if ("limit" in patch && patch.limit != null) {
    p.set("limit", String(patch.limit));
    p.delete("page");
  }
  if ("page" in patch) {
    patch.page && patch.page > 1
      ? p.set("page", String(patch.page))
      : p.delete("page");
  }
  if (patch.view) p.set("view", patch.view);
  if ("_w" in patch) {
    patch._w ? p.set("_w", "1") : p.delete("_w");
  }
  return p;
}

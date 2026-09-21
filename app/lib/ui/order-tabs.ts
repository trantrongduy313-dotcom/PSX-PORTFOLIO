// ─── TAB CỦA MÀN ĐƠN HÀNG — nguồn khai báo duy nhất ──────────────────────────
//
// 🔴 VÌ SAO FILE NÀY TỒN TẠI:
//
// Ba bộ tab của màn Đơn hàng đang là JSX viết thẳng trong component:
//
//   · 4 tab danh sách (Thiết kế · Sản xuất · Hoàn tất · Đã hủy)  → orders-client.tsx
//   · 5 tab panel PTK (Đơn hàng · Sản phẩm · Thiết kế · …)       → order-detail-panel.tsx
//   · 6 tab panel PSX (… Kỹ thuật · Sản xuất · Tiến độ)          → order-detail-panel.tsx
//
// Đúng tình trạng mà nav-model.ts từng mô tả về sidebar trước khi nó được tách ra:
//
//     "Trước đây cấu trúc menu LÀ JSX… quyền xem nằm trong các cờ mệnh lệnh lồng nhau rải
//      khắp cây JSX. Đổi menu = sửa JSX. Không có gì kiểm được."
//
// Sắp có vai chỉ được thấy MỘT SỐ tab (R&D: chỉ tab Sản xuất ở danh sách, chỉ Đơn hàng +
// Sản phẩm ở panel). Gác việc đó bằng `if` rải trong JSX là lặp lại đúng cái đã phải gỡ.
//
// ⚠️ ĐÂY CHỈ LÀ LỚP ẨN GIAO DIỆN. Chặn thật nằm ở API — ẩn một tab KHÔNG ngăn ai gọi thẳng
// endpoint với tham số của tab đó. Cùng cảnh báo với nav-model.ts, và nó đúng gấp đôi ở đây
// vì tab danh sách quyết định PHẠM VI DỮ LIỆU chứ không chỉ quyết định vẽ gì.
//
// ⚠️ ICON KHÔNG NẰM Ở ĐÂY. Module giữ THUẦN (không React) để test trực tiếp; chỗ render tự
// tra `key → icon`. Cùng lý do `badge` trong nav-model.ts là một KHOÁ chứ không phải con số.

import type { OrderTabKey } from "@/app/lib/ui/order-filter-scope";

/** Các vai của hệ thống. Trùng `NavRole` trong nav-model.ts và `UserRole` trong schema. */
export type OrderTabRole = "ADMIN" | "ORDER" | "PRODUCTION" | "SALES" | "DESIGN_3D" | "RND";

/**
 * Mọi vai TRỪ R&D.
 *
 * ⚠️ ĐI NGƯỢC QUY ƯỚC "chỉ khai vai bị hạn chế" — và có lý do. Ở đây thứ bị hạn chế là MỘT vai
 * trên NHIỀU tab, nên bảng buộc phải nói "ai được thấy" bằng cách liệt kê phần còn lại.
 *
 * 🔴 Danh sách chép tay này là một bản sao của `USER_ROLE_VALUES` — đúng thứ mà doctrine của
 * dự án cấm. Nên nó có BỘ DÒ: `__tests__/order-tabs.test.ts` chốt `NON_RND_ROLES` đúng bằng
 * `USER_ROLE_VALUES` trừ "RND". Thêm vai thứ bảy mà quên dòng này thì test đỏ ngay, thay vì vai
 * đó âm thầm mất ba tab.
 *
 * (Không suy thẳng từ USER_ROLE_VALUES ở đây: module này THUẦN và không phụ thuộc bảng vai của
 * tầng auth — cùng lý do nav-model.ts tự khai `NavRole`.)
 */
const NON_RND_ROLES: readonly OrderTabRole[] = ["ADMIN", "ORDER", "PRODUCTION", "SALES", "DESIGN_3D"];

export { NON_RND_ROLES };

/**
 * Vai nào THẤY một tab.
 *
 * ⚠️ CHỈ KHAI VAI BỊ HẠN CHẾ — không khai `roles` nghĩa là MỌI vai đều thấy. Cùng quy ước với
 * ORDER_FILTER_SCOPE và ROLE_WRITABLE_COLUMNS: mặc định là dùng chung, bảng chỉ ghi ngoại lệ.
 * Nhờ vậy thêm một tab mới không buộc phải liệt kê lại năm vai.
 */
export type TabVisibility = {
  /** Vai được thấy tab này. Bỏ trống = mọi vai. */
  roles?: readonly OrderTabRole[];
};

// ─── 1. Bốn tab của DANH SÁCH đơn hàng ───────────────────────────────────────
//
// `key` trùng OrderTabKey (order-filter-scope.ts) — cùng một tab, cùng một tên, để bảng phạm
// vi bộ lọc và bảng quyền xem không bao giờ nói về hai thứ khác nhau.

export type OrderListTab = TabVisibility & {
  key: OrderTabKey;
  /** Khoá nhãn trong labels.ts (`ui.tabs`). KHÔNG phải chữ hiển thị — module này không biết ngôn ngữ. */
  labelKey: OrderTabKey;
};

// R&D chỉ có việc ở Phòng Sản Xuất — họ nhập Mã số mẫu cho MO đã chốt sản xuất. Ba tab kia
// không phải "chưa cần": chúng là dữ liệu mà API CŨNG từ chối trả cho họ (query-scope.ts).
// Ẩn tab ở đây để giao diện không mời họ bấm vào một thứ sẽ trả 403 hoặc một danh sách rỗng.
export const ORDER_LIST_TABS: readonly OrderListTab[] = [
  { key: "pre-production", labelKey: "pre-production", roles: NON_RND_ROLES },
  { key: "master-hub",     labelKey: "master-hub" },
  { key: "completed",      labelKey: "completed",      roles: NON_RND_ROLES },
  { key: "cancelled",      labelKey: "cancelled",      roles: NON_RND_ROLES },
];

// ─── 2 & 3. Tab của PANEL chi tiết ───────────────────────────────────────────
//
// HAI BỘ RIÊNG, không gộp: panel PTK và panel PSX có `key` khác nhau (`status`/`history` so
// với `kythuat`/`sanxuat`/`tiendo`) và được render bởi hai khối JSX loại trừ nhau. Gộp thành
// một mảng kèm cờ "thuộc phòng nào" là thêm một trường mà mọi chỗ đọc đều phải lọc.

export type PanelTab<K extends string> = TabVisibility & {
  key: K;
  /**
   * Khoá nhãn trong `L.ui.panel`, hoặc chữ thẳng nếu labels.ts chưa có mục tương ứng.
   * `raw: true` phân biệt hai ca — chỗ render không phải đoán.
   */
  label: string;
  raw?: boolean;
};

export type PtkPanelTabKey = "info" | "items" | "thietke" | "status" | "history";
export type MhPanelTabKey  = "info" | "items" | "thietke" | "kythuat" | "sanxuat" | "tiendo";

export const PTK_PANEL_TABS: readonly PanelTab<PtkPanelTabKey>[] = [
  { key: "info",    label: "tabOrder" },
  { key: "items",   label: "tabItems" },
  // Nhãn viết thẳng vì labels.ts chưa có mục cho tab này — giữ nguyên hiện trạng, không tự
  // thêm khoá i18n trong một commit refactor.
  { key: "thietke", label: "Thiết kế", raw: true },
  { key: "status",  label: "tabStatus" },
  { key: "history", label: "tabHistory" },
];

// R&D thấy ĐÚNG MỘT tab: Sản phẩm — nơi có ô Mã số mẫu, việc duy nhất của họ ở đây.
//
// Kể cả tab Đơn hàng cũng ẩn: nó bắt họ bấm thêm một bước trước khi tới ô cần nhập, và phần
// định danh (MO# · SO# · tên khách) đã nằm sẵn ở dòng tiêu đề panel, thấy được ở mọi tab.
//
// ⚠️ Ẩn `info` KHÔNG AN TOÀN nếu thiếu `clampTabKey`: `mhTab` khởi tạo cứng là "info", nên thanh
// tab sẽ vẽ đúng một nút còn nội dung thì không render gì. Xem chú thích của hàm đó.
export const MH_PANEL_TABS: readonly PanelTab<MhPanelTabKey>[] = [
  { key: "info",    label: "tabOrder",             roles: NON_RND_ROLES },
  { key: "items",   label: "tabItems" },
  { key: "thietke", label: "Thiết kế", raw: true, roles: NON_RND_ROLES },
  { key: "kythuat", label: "tabTechnical",         roles: NON_RND_ROLES },
  { key: "sanxuat", label: "tabProduction",        roles: NON_RND_ROLES },
  { key: "tiendo",  label: "tabProgress",          roles: NON_RND_ROLES },
];

// ─── Lọc theo vai ────────────────────────────────────────────────────────────

/**
 * Vai này có thấy tab đó không. Tab không khai `roles` → mọi vai thấy.
 *
 * Nhận `string` chứ không `OrderTabRole`: chỗ gọi là biên nhận vai từ session, nơi mà "nó là
 * một vai hợp lệ" cũng chưa được phép giả định.
 */
export function isTabVisibleTo(tab: TabVisibility, role: string | undefined): boolean {
  if (!tab.roles) return true;
  return tab.roles.includes(role as OrderTabRole);
}

/** Lọc một bộ tab xuống còn những tab `role` được thấy. */
export function visibleTabs<T extends TabVisibility>(tabs: readonly T[], role: string | undefined): T[] {
  return tabs.filter((t) => isTabVisibleTo(t, role));
}

/** Tab ĐẦU TIÊN mà vai đó thấy trong một bộ. `undefined` = vai đó không thấy tab nào. */
export function firstVisibleTabKey<K extends string>(
  tabs: readonly (TabVisibility & { key: K })[],
  role: string | undefined,
): K | undefined {
  return visibleTabs(tabs, role)[0]?.key;
}

/**
 * Ép một khoá tab về tab hợp lệ gần nhất cho vai đó.
 *
 * 🔴 VÌ SAO CẦN, TRONG KHI ĐÃ CÓ `visibleTabs`: `visibleTabs` quyết định vẽ NHỮNG NÚT NÀO. Tab
 * ĐANG MỞ đến từ một nguồn KHÁC — URL (`?tab=…`) với danh sách, `useState("info")` viết cứng
 * với panel — và KHÔNG AI buộc hai nguồn đó khớp nhau. Hai ca thật đã xảy ra:
 *
 *   · R&D gõ tay `?tab=pre-production` → đứng ở tab không có nút; bảng hiện dữ liệu PSX (API
 *     đã ép zone) dưới nhãn "Phòng Thiết Kế". Lệch nhãn/dữ liệu, im lặng.
 *   · Ẩn tab "Đơn hàng" khỏi R&D trong khi `mhTab` khởi tạo cứng là `"info"` → thanh tab vẽ
 *     đúng một nút, còn nội dung hỏi `mhTab === "items"` nên KHÔNG RENDER GÌ. Panel trắng.
 *
 * Một hàm cho CẢ BA bộ tab. Bản trước buộc cứng vào `ORDER_LIST_TABS`; vá riêng cho bộ thứ hai
 * là chấp nhận sẽ có bộ thứ ba.
 *
 * ⚠️ CHỈ ÉP KHOÁ CÓ KHAI TRONG BẢNG. Tab đang mở còn nhận những khoá không phải tab (VD `"all"`
 * của bộ lọc nhanh); ép cả chúng là bẻ gãy chúng cho MỌI vai.
 *
 * ⚠️ VÀ KHÔNG BAO GIỜ TRẢ VỀ RỖNG. Vai không thấy tab nào thì trả lại nguyên vẹn — một khoá sai
 * còn dò được, `undefined` thì đổ ở chỗ khác, xa nguyên nhân.
 *
 * Kiểu `C | K`: panel có `C = K` nên thu về đúng union của `setMhTab`; danh sách có
 * `OrderTabKey ⊂ OrderTab` nên cũng thu về `OrderTab`. Không chỗ gọi nào phải ép kiểu.
 */
export function clampTabKey<K extends string, C extends string>(
  tabs: readonly (TabVisibility & { key: K })[],
  current: C,
  role: string | undefined,
): C | K {
  const declared = tabs.find((t) => t.key === (current as string));
  if (!declared || isTabVisibleTo(declared, role)) return current;
  return firstVisibleTabKey(tabs, role) ?? current;
}

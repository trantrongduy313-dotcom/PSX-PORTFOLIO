"use client";

import { useSyncExternalStore } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { createPersistedFlag, type PersistedFlagStore } from "@/app/lib/ui/persisted-flag";

// ─── Một nhóm mục trong Sidebar, gập được và nhớ được ────────────────────────
//
// VÌ SAO CẦN GẬP: với vai ADMIN menu có 17 mục + 2 tiêu đề, nên phải kéo mới thấy hết. Gập nhóm
// cấu hình lại thì phần lớn màn hình không còn phải kéo.
//
// 🔴 VÀ VÌ SAO TIÊU ĐỀ PHẢI CHỞ ĐƯỢC HUY HIỆU — đây là phần quan trọng hơn việc gập:
//
//   Huy hiệu "Phản hồi người dùng" là KÊNH THÔNG BÁO DUY NHẤT của tính năng góp ý (đề xuất cải
//   tiến cố ý không bắn chuông Chat). Nó là mục CUỐI CÙNG của menu dài nhất, tức đã nằm dưới
//   fold từ trước — con số đó vô hình theo mặc định, và Sidebar.tsx còn ghi hẳn một comment nói
//   nó "nằm trên màn hình admin dùng cả ngày". Ảnh chụp thực tế cho thấy câu đó không đúng.
//
//   Nên gập nhóm mà KHÔNG nổi huy hiệu lên tiêu đề là làm lỗ hổng đó TỆ HƠN. Hai việc này đi
//   cùng nhau, không tách được.
//
// ⚠️ CHỈ PHẦN NÀY LÀ CLIENT COMPONENT. `Sidebar` vẫn ở server vì nó đọc `auth()` và `prisma`.
// Các link được render SẴN ở server rồi truyền vào đây qua `children` — component này không biết
// bên trong nó có gì, và cũng không cần biết.

/**
 * Store được tạo Ở TẦM MODULE và ghi nhớ theo khoá, KHÔNG tạo trong thân render.
 *
 * Mỗi lần `createPersistedFlag` chạy là một tập listener mới, nên gọi trong render là mỗi khung
 * vẽ lại một store khác và `useSyncExternalStore` sẽ hủy-đăng-ký rồi đăng-ký lại liên tục.
 * Map này giữ đúng MỘT store cho mỗi khoá, kể cả khi nhiều nhóm cùng mount.
 */
const stores = new Map<string, PersistedFlagStore>();
function storeFor(key: string, defaultCollapsed: boolean): PersistedFlagStore {
  let s = stores.get(key);
  if (!s) {
    s = createPersistedFlag(`psx.sidebar.${key}.collapsed`, defaultCollapsed);
    stores.set(key, s);
  }
  return s;
}

const HEADER_TEXT = {
  padding: "6px 16px",
  fontSize: "10px",
  fontWeight: 400,
  textTransform: "uppercase" as const,
  letterSpacing: "0.14em",
  color: "var(--ink-muted)",
};

export function SidebarSection({
  sectionKey,
  title,
  badge,
  defaultCollapsed = false,
  children,
}: {
  sectionKey: string;
  /** `null` = nhóm đầu, không tiêu đề và KHÔNG gập được. */
  title: string | null;
  /**
   * Huy hiệu hiện cạnh tiêu đề.
   *
   * Là `ReactNode` chứ không phải `number`, và đó là chủ ý: huy hiệu "Có gì mới" đếm từ
   * localStorage nên CHỈ CLIENT tính được — nó phải là một component, không phải một con số
   * server truyền xuống. Slot này nhận được cả hai loại.
   */
  badge?: React.ReactNode;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const store = storeFor(sectionKey, defaultCollapsed);
  const collapsed = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  // Nhóm không tiêu đề thì không có gì để bấm vào mà gập. Trả về children trần — MỘT đường
  // render cho cả hai loại nhóm, thay vì chỗ gọi phải tự phân biệt.
  if (title === null) return <>{children}</>;

  return (
    <div style={{ marginTop: "20px" }}>
      <button
        type="button"
        onClick={store.toggle}
        aria-expanded={!collapsed}
        style={{
          ...HEADER_TEXT,
          display: "flex",
          alignItems: "center",
          gap: "5px",
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {collapsed
          ? <ChevronRight style={{ width: "11px", height: "11px", flexShrink: 0 }} />
          : <ChevronDown style={{ width: "11px", height: "11px", flexShrink: 0 }} />}
        <span style={{ flex: 1 }}>{title}</span>
        {/* Huy hiệu hiện Ở MỌI TRẠNG THÁI, không chỉ khi gập: nhóm mở nhưng nằm dưới fold thì
            vẫn vô hình y như lúc gập. Vấn đề là TẦM MẮT, không phải trạng thái gập. */}
        {badge}
      </button>

      {/* Gập thì KHÔNG dựng các link. Giữ chúng rồi ẩn bằng CSS là để lại các mục vẫn nhận được
          tiêu điểm bàn phím — người dùng Tab vào một mục không nhìn thấy. */}
      {!collapsed && children}
    </div>
  );
}

"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

// ─── Gom bối cảnh tự động ở phía client ──────────────────────────────────────
//
// 🎯 ĐÂY LÀ THỨ LÀM NÚT NÀY HƠN ZALO. Khung nhập chữ thì Zalo cũng có; cái Zalo không bao giờ
// có là "báo cáo này đến từ màn PSX, đơn 25.9431, MO 25.32658_4, bản build b51ddb7".
//
// ⚠️ CHỈ ĐỌC URL — không đọc gì từ OrderDetailPanel. Client gửi lên hai ID; SERVER tự tra số
// đơn / số MO / phiên bản (xem app/api/feedback/route.ts:resolveOrderContext).
//
// Hợp đồng giữa nút góp ý và panel là `?orderId` + `?activeItemId` trong URL, KHÔNG phải code.
// Panel là file 8000+ dòng; nếu nút phải nhận props hay đọc state của nó thì mỗi lần panel
// được sửa lại là một lần nút có thể vỡ. Đọc URL thì panel có bị viết lại toàn bộ, nút vẫn
// chạy — miễn là đường dẫn vẫn mang hai tham số đó, và đó là thứ đã ổn định vì cả điều hướng
// lẫn nút Chia sẻ link đều dựa vào nó.

export type ClientFeedbackContext = {
  pageUrl: string;
  orderId?: string;
  activeItemId?: string;
  userAgent?: string;
  viewport?: string;
};

export function useFeedbackContext(): () => ClientFeedbackContext {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Trả về một HÀM, không phải giá trị. Bối cảnh phải được chụp ở ĐÚNG LÚC BẤM GỬI, không
  // phải lúc render: người dùng có thể mở hộp thoại, gõ một lúc, và trong khoảng đó URL không
  // đổi — nhưng nếu về sau hộp thoại cho phép điều hướng thì lấy giá trị cũ là ghi sai chỗ.
  return useCallback((): ClientFeedbackContext => {
    const qs = searchParams.toString();

    // Cùng cách lọc như orders-client.tsx:261 — chuỗi "null"/"undefined" LỌT được vào URL
    // thật (do một chỗ nào đó ghép giá trị chưa kiểm), và lưu nguyên văn chúng vào DB là tạo
    // ra dữ liệu bối cảnh trông có mà thật ra không có.
    const param = (key: string): string | undefined => {
      const v = searchParams.get(key);
      return v && v !== "null" && v !== "undefined" ? v : undefined;
    };

    return {
      pageUrl: `${pathname}${qs ? `?${qs}` : ""}`,
      orderId: param("orderId"),
      activeItemId: param("activeItemId"),
      // `typeof window` — hook này chạy trong Client Component nhưng vẫn được render trước ở
      // server (SSR), nơi không có `window` và `navigator`.
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      viewport:
        typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : undefined,
    };
  }, [pathname, searchParams]);
}

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Thay cho __tests__/multi-user-cache.test.ts (458 dòng). File đó dựng một bản mô phỏng Router
// Cache của Next và một bản mô phỏng cache TanStack ngay trong chính nó rồi test hai bản mô
// phỏng đó — không chạm dòng code nào của hệ thống. Hai mục lớn nhất còn tệ hơn: một BẢNG KIỂM
// KÊ và một BẢNG RỦI RO viết tay, đem so với chính nó (`expect(riskMatrix.length).toBe(8)`).
//
// 🔴 Và bảng đó ghi ba con số cấu hình. CẢ BA ĐỀU SAI so với code hiện tại:
//     "Orders list — staleTime 30s, refetchInterval 30s"  → thật: staleTime Infinity
//     "Order Detail Panel — staleTime 15s"                → thật: 30s
//     "TanStack Query tự refetch mỗi 30s"                 → thật: heartbeat 20s/60s làm việc đó
// Không có gì canh, nên nó cứ mô tả một kiến trúc đã bị thay.
//
// File này khoá các con số THẬT. Cùng khuôn với __tests__/order-panel-query-config.test.ts.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");

const nextConfig = read("next.config.ts");
const ordersClient = read("app/dashboard/orders/_components/orders-client.tsx");

const heartbeat = ordersClient.slice(ordersClient.indexOf('queryKey: ["orders-heartbeat"'));
const heartbeatBlock = heartbeat.slice(0, heartbeat.indexOf("});"));

describe("Router Cache của Next", () => {
  // Đây là tiền đề của toàn bộ chuyện cache ở màn Đơn hàng: RSC payload được giữ 60s nên
  // chuyển trang trong sidebar không nạp lại. Bỏ nó đi là mọi lần mở panel lại một vòng RSC.
  it("staleTimes.dynamic được đặt 60 giây", () => {
    expect(nextConfig).toMatch(/staleTimes:\s*\{[^}]*dynamic:\s*60/);
  });
});

describe("hai query của màn Đơn hàng chia việc, không giẫm chân nhau", () => {
  // 🔴 Truy vấn danh sách là truy vấn NẶNG. Nó cố ý KHÔNG tự làm mới: heartbeat và nút đồng bộ
  // tay chịu trách nhiệm đó. Cho nó một staleTime hữu hạn là kéo cả bảng về hai lần mỗi nhịp,
  // trong khi heartbeat vốn sinh ra để tránh đúng chuyện này.
  it("danh sách đơn: staleTime Infinity — không tự refetch", () => {
    const list = ordersClient.slice(ordersClient.indexOf("initialDataUpdatedAt:"));
    expect(list.slice(0, 400)).toContain("staleTime: Infinity");
  });

  // Heartbeat thì ngược lại: luôn cũ, để mỗi nhịp đều hỏi thật.
  it("heartbeat: staleTime 0", () => {
    expect(heartbeatBlock).toContain("staleTime: 0");
  });

  // Heartbeat chỉ poll COUNT + MAX(updatedAt), không kéo dữ liệu — nên mới poll dày được.
  it("heartbeat gọi hàm đếm riêng, không gọi hàm kéo danh sách", () => {
    expect(heartbeatBlock).toContain("fetchOrdersMeta");
    expect(heartbeatBlock).not.toContain("fetchOrders(");
  });
});

describe("heartbeat nhường đường", () => {
  // Mở sidebar → nhịp giãn từ 20s ra 60s. Panel có bảy truy vấn riêng; để heartbeat đập 20s
  // trong lúc đó là hai bên tranh nhau đúng lúc người dùng đang chờ panel hiện.
  it("giãn nhịp khi sidebar đang mở", () => {
    expect(heartbeatBlock).toMatch(/filters\.orderId\s*\?\s*60_000\s*:\s*20_000/);
  });

  // Đang kéo danh sách mà heartbeat vẫn chạy thì nó so với một tập dữ liệu đang bay dở, và
  // báo "có thay đổi" cho chính lần kéo đang diễn ra.
  it("tắt hẳn trong lúc danh sách đang được kéo", () => {
    expect(heartbeatBlock).toContain("enabled: !isFetching");
  });

  // Tab ở nền thì không ai nhìn — poll tiếp chỉ tốn server. Cùng lý do với sidebar.
  it("không đập khi tab ở nền", () => {
    expect(heartbeatBlock).toContain("refetchIntervalInBackground: false");
  });
});

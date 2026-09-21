import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Ép test chạy ở UTC — GIỐNG Vercel, KHÁC máy dev (giờ VN).
    // Lý do: đã từng lọt một lỗi múi giờ nghiêm trọng (thuật toán deadline dùng getHours()
    // nên áp khung giờ làm việc theo giờ máy chủ) — chạy local thấy đúng, lên Vercel lệch
    // 7 tiếng. Chốt UTC ở đây để lớp lỗi đó bị bắt ngay khi chạy test ở máy.
    env: { TZ: "UTC" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // "server-only" ném lỗi khi nạp ngoài server của Next → thay bằng module rỗng để
      // test được các module business đánh dấu server-only. Build vẫn dùng gói thật.
      "server-only": path.resolve(__dirname, "__tests__/stubs/server-only.ts"),
    },
  },
});

import "server-only";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Đơn hàng (Order) KHÔNG BAO GIỜ được xóa cứng — kể cả đơn đã HỦY phải lưu vĩnh viễn để
// truy vết & thống kê. Muốn gỡ bản ghi nhập nhầm/trùng → dùng softDeleteOrder() (set
// deletedAt). Extension dưới chặn .delete/.deleteMany ở tầng client: mọi API route dùng
// `prisma` chung đều được bảo vệ tại MỘT chỗ, không rải rác. (OrderItem KHÔNG chặn vì có
// thao tác hợp lệ: rollback tách MO về Thiết Kế xóa dòng item gốc, dữ liệu đã chuyển đơn mới.)
class HardDeleteBlockedError extends Error {
  constructor(op: string) {
    super(`Xóa cứng Order bị chặn (order.${op}). Đơn hàng phải được giữ vĩnh viễn — dùng softDeleteOrder() để ẩn bản ghi nhập nhầm.`);
    this.name = "HardDeleteBlockedError";
  }
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL ?? "";

  const adapter = new PrismaPg({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    // Supabase yêu cầu SSL nhưng không cần verify CA certificate
    ssl: { rejectUnauthorized: false },
  });
  const base = new PrismaClient({ adapter });
  const guarded = base.$extends({
    query: {
      order: {
        delete() { throw new HardDeleteBlockedError("delete"); },
        deleteMany() { throw new HardDeleteBlockedError("deleteMany"); },
      },
    },
  });
  // Extension chỉ CHẶN order.delete lúc chạy; ép kiểu về PrismaClient gốc để không đổi kiểu
  // của `tx: Prisma.TransactionClient` ở các route (runtime vẫn là client đã gắn guard).
  return guarded as unknown as PrismaClient;
}

// Dùng symbol key để tránh xung đột với cache cũ (string key "prisma")
const CACHE_KEY = Symbol.for("__prisma_client_v3");
type GlobalCache = { [CACHE_KEY]?: ReturnType<typeof createPrismaClient> };
const g = globalThis as unknown as GlobalCache;

export const prisma = g[CACHE_KEY] ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  g[CACHE_KEY] = prisma;
}

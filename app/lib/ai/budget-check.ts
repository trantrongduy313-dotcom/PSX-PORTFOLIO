import "server-only";

import { prisma } from "@/app/lib/prisma";
import { BUDGET_WINDOW_MS, checkBudget, type BudgetCheck } from "@/app/lib/business/ai/budget";

// ─── Đếm lượt đã dùng trong 24 giờ ───────────────────────────────────────────
//
// ⚠️ VÌ SAO KHÔNG NHÉT VÀO app/lib/rate-limit.ts DÙ ĐÃ CÓ SẴN Ở ĐÓ MỘT BỘ ĐẾM:
//
// `checkActionRateLimit` có hợp đồng là "MỘT bộ đếm, một cửa sổ, trả về còn bao lâu nữa thử
// lại" và nó đếm trên workflowHistory. Việc ở đây cần HAI bộ đếm độc lập, trên một bảng khác,
// và hai câu thông báo mang nghĩa khác nhau: "bạn hết lượt" dẫn tới hành động khác hẳn với
// "hệ thống hết lượt hôm nay".
//
// Ép vào một hàm là làm cả hai chỗ tệ đi: hàm cũ mọc thêm một nhánh truy vấn sang bảng khác,
// và hàm mới phải giả vờ chỉ có một bộ đếm. Nên tách — cùng KHUÔN (đếm dòng trong cửa sổ thời
// gian, không dùng bộ đếm trong RAM), không cùng hàm.
//
// Luật ngưỡng nằm ở business/ai/budget.ts và có test. File này CHỈ đi đếm.

export async function checkAiBudget(userId: string | undefined): Promise<BudgetCheck> {
  const since = new Date(Date.now() - BUDGET_WINDOW_MS);

  const [user, global] = await Promise.all([
    // `userId` undefined với VIRTUAL_ADMIN (không có hàng users — xem auth-helpers.ts). Không
    // đếm được theo người thì bỏ qua tầng cá nhân; trần TOÀN HỆ THỐNG vẫn chặn, nên vẫn còn
    // đúng một cái trần. Trả về 0 chứ không ném lỗi: chặn admin ảo dùng thử tính năng là chặn
    // đúng người cần dùng nó nhất.
    userId
      ? prisma.aiQuestionLog.count({ where: { userId, createdAt: { gte: since } } })
      : Promise.resolve(0),
    prisma.aiQuestionLog.count({ where: { createdAt: { gte: since } } }),
  ]);

  return checkBudget({ user, global });
}

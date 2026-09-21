import "server-only";

import { prisma } from "@/app/lib/prisma";
import type { AuthUser } from "@/app/lib/auth-helpers";
import type { ProgressActor } from "@/app/lib/business/kpi-3d/progress";

// Quy đổi tài khoản đăng nhập → "diễn viên" của luồng KPI 3D.
//
// Tách riêng vì mọi route trong luồng này đều cần biết: user đang đăng nhập ứng với hồ sơ
// Designer3D nào (để chặn NV 3D sửa đơn của người khác). Gom về 1 chỗ để quy tắc mapping
// chỉ tồn tại một bản — nếu sau này đổi cách gắn tài khoản, chỉ sửa ở đây.
export async function resolveProgressActor(user: AuthUser): Promise<ProgressActor> {
  if (user.role !== "DESIGN_3D" || !user.dbId) {
    return { role: user.role, designer3DId: null };
  }

  const designer = await prisma.designer3D.findUnique({
    where: { userId: user.dbId },
    select: { id: true, isActive: true },
  });

  // Hồ sơ đã tắt hoạt động coi như chưa gắn — chặn ở tầng quyền, không cho ghi tiếp.
  return { role: user.role, designer3DId: designer?.isActive ? designer.id : null };
}

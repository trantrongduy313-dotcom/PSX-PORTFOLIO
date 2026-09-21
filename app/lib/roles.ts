import type { UserRole } from "@/app/generated/prisma/client";

export const USER_ROLE_VALUES = ["ADMIN", "SALES", "PRODUCTION", "ORDER", "DESIGN_3D", "RND"] as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Quản trị viên",
  SALES: "Kinh doanh",
  PRODUCTION: "Sản xuất",
  ORDER: "Xử lý đơn hàng",
  DESIGN_3D: "Nhân viên Thiết kế 3D",
  RND: "Phòng R&D",
};

export const ALL_ROLES: UserRole[] = [...USER_ROLE_VALUES];

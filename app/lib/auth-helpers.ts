import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { resolveSessionState } from "@/app/lib/business/auth/session-state";
import type { UserRole } from "@/app/generated/prisma/client";

export type AuthUser = {
  id: string;
  // DB FK-safe ID: undefined when id is "VIRTUAL_ADMIN" (no DB record),
  // same as id for real Google OAuth users. Use this for all Prisma FK fields.
  dbId: string | undefined;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: UserRole;
};

function buildAuthUser(raw: Omit<AuthUser, "dbId"> & { id: string }): AuthUser {
  return {
    ...raw,
    dbId: raw.id === "VIRTUAL_ADMIN" ? undefined : raw.id,
  };
}

/**
 * BA kết cục, không phải hai.
 *
 * "Chưa đăng nhập" và "không xác định được quyền" là hai chuyện khác hẳn nhau, và gộp chúng
 * lại chính là gốc của lỗi nhân viên 3D bị đá ra trang 403 ở lượt vào đầu tiên: session
 * callback mặc định role về SALES, mà SALES là role DUY NHẤT không được vào màn 3D.
 *
 * Nay thiếu role là một kết cục riêng, và nó dẫn tới màn "thử lại" chứ không phải màn 403.
 */
type AuthResolution =
  | { status: "ANONYMOUS" }
  | { status: "ROLE_UNAVAILABLE" }
  | { status: "OK"; user: AuthUser };

async function resolveAuth(): Promise<AuthResolution> {
  const session = await auth();
  const state = resolveSessionState({ userId: session?.user?.id, role: session?.user?.role });

  if (state === "ANONYMOUS") return { status: "ANONYMOUS" };
  if (state === "ROLE_UNAVAILABLE") return { status: "ROLE_UNAVAILABLE" };
  return { status: "OK", user: buildAuthUser(session!.user as Omit<AuthUser, "dbId">) };
}

// Lấy user hiện tại từ session — dùng trong Server Components và API routes
// Trả về null nếu chưa đăng nhập (không redirect)
//
// CŨNG trả null khi chưa đọc được role. Với API thì đó là hành vi ĐÚNG: thiếu thông tin để
// xét quyền thì phải từ chối, không được đoán. Người gọi nhận 403 — chặt hơn thực tế một
// chút, nhưng không bao giờ mở rộng hơn thực tế.
export async function getCurrentUser(): Promise<AuthUser | null> {
  const resolved = await resolveAuth();
  return resolved.status === "OK" ? resolved.user : null;
}

/**
 * Yêu cầu ĐANG ĐĂNG NHẬP, không ràng buộc role — cho các trang mọi vai trò đều vào được.
 *
 * VÌ SAO PHẢI CÓ HÀM NÀY thay vì `getCurrentUser()` rồi tự redirect: getCurrentUser trả null
 * cho CẢ HAI trường hợp "chưa đăng nhập" và "chưa đọc được role". Trang nào tự viết
 * `if (!user) redirect("/auth/login")` sẽ đá một người ĐANG đăng nhập về màn login khi DB
 * chớp — và vì họ vẫn còn session, màn login lại đẩy họ ngược vào: một vòng lặp.
 */
export async function requireUser(): Promise<AuthUser> {
  const resolved = await resolveAuth();
  if (resolved.status === "ANONYMOUS") redirect("/auth/login");
  if (resolved.status === "ROLE_UNAVAILABLE") redirect("/unauthorized?reason=role-unavailable");
  return resolved.user;
}

// Yêu cầu đăng nhập + đúng role — dùng ở đầu Server Component cần bảo vệ
// Redirect về /auth/login nếu chưa login, /unauthorized nếu sai role
export async function requireRole(allowedRoles: UserRole[]): Promise<AuthUser> {
  const resolved = await resolveAuth();

  if (resolved.status === "ANONYMOUS") {
    redirect("/auth/login");
  }

  // Không nói "bạn không có quyền" khi sự thật là "tôi chưa đọc được quyền của bạn". Câu đầu
  // sai và làm người dùng đi hỏi admin cấp quyền; câu sau đúng và chỉ cần bấm Thử lại.
  if (resolved.status === "ROLE_UNAVAILABLE") {
    redirect("/unauthorized?reason=role-unavailable");
  }

  if (!allowedRoles.includes(resolved.user.role)) {
    redirect("/unauthorized");
  }

  return resolved.user;
}

// Check role không redirect — dùng để ẩn/hiện UI element
// VD: hasRole(user, ["ADMIN"]) ? <DeleteButton /> : null
export function hasRole(user: AuthUser | null, allowedRoles: UserRole[]): boolean {
  if (!user) return false;
  return allowedRoles.includes(user.role);
}

// Returns the list of storeIds a user is allowed to access.
// For SALES: queries UserStore assignments. For other roles: returns [] (meaning unrestricted).
export async function getUserStoreIds(userId: string): Promise<string[]> {
  const assignments = await prisma.userStore.findMany({
    where: { userId },
    select: { storeId: true },
  });
  return assignments.map((a) => a.storeId);
}

export { ROLE_LABELS, ALL_ROLES } from "@/app/lib/roles";

import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";

// Edge runtime: chỉ dùng authConfig (không có prisma/pg)
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public routes — không cần đăng nhập
  // /api/import/*: endpoint gọi từ NGOÀI webapp (Apps Script, script...), tự xác thực bằng
  // secret riêng (KHÔNG dùng session) — nếu không loại trừ ở đây, middleware sẽ redirect
  // mọi request không có session về /auth/login TRƯỚC KHI route kịp kiểm tra secret,
  // khiến caller nhận về HTML trang login (200) thay vì JSON thật.
  const isPublic =
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/import/") ||
    pathname === "/";

  if (isPublic) return NextResponse.next();

  // Chưa đăng nhập → redirect về trang login kèm callbackUrl
  if (!req.auth) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

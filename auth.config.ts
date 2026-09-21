import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { UserRole } from "./app/generated/prisma/client";

// Mở rộng kiểu Session — dùng ở cả middleware và server components
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /**
       * `undefined` = CHƯA XÁC ĐỊNH ĐƯỢC quyền, KHÁC HẲN "không có quyền".
       *
       * Trước đây trường này luôn có giá trị vì session callback mặc định về "SALES" khi
       * thiếu. Nhưng SALES là một câu KHẲNG ĐỊNH — và là role duy nhất không được vào màn
       * Việc thiết kế 3D, nên một lần đọc DB hỏng biến nhân viên 3D thành SALES và ném họ
       * vào trang 403. Không đọc được quyền là một LỖI, không phải một role.
       */
      role: UserRole | undefined;
    };
  }
}

// Config tối giản — không import prisma/pg → chạy được trên Edge runtime
// Dùng cho middleware.ts (Edge) và được merge vào auth.ts (Node.js)
export const authConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        // role được ghi vào JWT bởi jwt callback trong auth.ts.
        //
        // ⚠️ TUYỆT ĐỐI KHÔNG ĐẶT GIÁ TRỊ MẶC ĐỊNH Ở ĐÂY.
        // Bản trước là `?? "SALES"`. Nó biến "chưa đọc được quyền" thành "người này là SALES"
        // — một giá trị SAI trông y hệt một giá trị đúng, nên không chỗ nào phát hiện ra.
        // Thiếu thì để undefined và cho tầng trên xử lý như lỗi (xem requireRole).
        session.user.role = (token as { role?: UserRole }).role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

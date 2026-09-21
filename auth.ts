import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/prisma";
import { authConfig } from "./auth.config";

// ID cố định cho super admin — không liên kết với bất kỳ DB user nào
const VIRTUAL_ADMIN_ID = "VIRTUAL_ADMIN";

/**
 * Đọc role + trạng thái tài khoản, THỬ LẠI MỘT LẦN nếu lượt đầu hỏng.
 *
 * Lượt đọc này chạy ngay sau khi đăng nhập, tức đúng lúc kết nối tới Supabase còn nguội —
 * và nếu nó hỏng thì token ra đời không có role, người dùng phải tự F5. Một lần thử lại sau
 * quãng nghỉ ngắn xử lý được gần hết nhóm lỗi đó.
 *
 * CHỈ THỬ LẠI ĐÚNG MỘT LẦN, và cố ý không dùng backoff dài: callback này nằm trên đường tải
 * trang, người dùng đang ngồi chờ. Thà trả về lỗi nhanh rồi hiện nút "Thử lại" còn hơn treo
 * màn hình trắng vài giây.
 */
async function readUserAuthState(userId: string) {
  try {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true, deletedAt: true },
    });
  } catch (first) {
    console.warn("[AUTH JWT RETRY]", first);
    await new Promise((r) => setTimeout(r, 250));
    return prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true, deletedAt: true },
    });
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: { username: {}, password: {} },
      async authorize(credentials) {
        const adminUsername     = process.env.ADMIN_USERNAME;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (!adminUsername || !adminPasswordHash) return null;

        const username = (credentials.username as string | undefined)?.trim();
        const password = credentials.password as string | undefined;

        if (!username || !password) return null;
        if (username.toLowerCase() !== adminUsername.toLowerCase()) return null;

        const valid = await bcrypt.compare(password, adminPasswordHash);
        if (!valid) return null;

        // Trả về virtual user — KHÔNG query DB, không liên kết email
        return {
          id:    VIRTUAL_ADMIN_ID,
          name:  "Admin",
          email: null,
        };
      },
    }),
  ],
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },

  callbacks: {
    async signIn({ user }) {
      // Virtual admin: bỏ qua mọi DB check — xác thực hoàn toàn qua env vars
      if (user?.id === VIRTUAL_ADMIN_ID) return true;

      // Google OAuth users: kiểm tra email tồn tại, isActive, chưa bị xóa
      if (!user?.email) return false;
      try {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { isActive: true, deletedAt: true },
        });
        if (!dbUser) return false;
        if (dbUser.deletedAt !== null) return false;
        if (dbUser.isActive === false) return false;
        return true;
      } catch (e) {
        console.error("[AUTH SIGN_IN ERROR]", e);
        return false;
      }
    },

    async jwt({ token, user }) {
      const typedToken = token as { role?: string; isActive?: boolean };

      // Virtual admin: không query DB, role và trạng thái cố định từ env
      if ((user?.id ?? token.sub) === VIRTUAL_ADMIN_ID) {
        typedToken.role     = "ADMIN";
        typedToken.isActive = true;
        return token;
      }

      // Google OAuth users: re-read từ DB mỗi lần refresh token
      const userId = user?.id ?? token.sub;
      if (!userId) return token;

      try {
        const dbUser = await readUserAuthState(userId);

        // DB TRẢ LỜI RÕ RÀNG rằng tài khoản không còn hợp lệ → hủy session.
        // Nhánh này CHỈ chạy khi truy vấn thành công. Trước đây nó nằm chung với nhánh lỗi,
        // nên một trục trặc kết nối thoáng qua cũng đủ đăng xuất người đang làm việc.
        if (!dbUser || dbUser.isActive === false || dbUser.deletedAt !== null) {
          return null as unknown as typeof token;
        }

        typedToken.role     = dbUser.role;
        typedToken.isActive = dbUser.isActive;
      } catch (e) {
        // KHÔNG ghi đè, KHÔNG hủy session, KHÔNG bịa role.
        //
        // Callback này chạy ở MỌI lượt tải trang, nên nó phơi ra trước mọi trục trặc DB —
        // Supabase ngủ dậy, pool hết chỗ, mạng chớp. Token đang có role thì giữ nguyên: sai
        // lệch tối đa là "hơi cũ", còn hơn sai hẳn.
        //
        // Trường hợp CHƯA có role (lượt jwt đầu tiên ngay sau khi đăng nhập) thì token đi
        // tiếp mà thiếu role — và đó là điều ĐÚNG: requireRole sẽ hiện màn "chưa xác định
        // được quyền, thử lại" thay vì âm thầm hạ người dùng xuống SALES rồi chặn họ.
        console.error("[AUTH JWT ERROR]", e);
      }
      return token;
    },
    ...authConfig.callbacks,
  },
});

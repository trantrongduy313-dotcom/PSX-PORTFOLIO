import { signIn, auth } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{ callbackUrl?: string; error?: string; admin?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { callbackUrl, error, admin } = await searchParams;
  const showAdminForm = admin === "1";

  const session = await auth();
  if (session?.user) {
    redirect(callbackUrl ?? "/dashboard/orders");
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--cream)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{
        background: "var(--cream-card)",
        border: "1px solid var(--border)",
        width: "100%",
        maxWidth: "360px",
        padding: "48px 40px",
        display: "flex",
        flexDirection: "column",
        gap: "32px",
      }}>

        {/* Brand */}
        <div style={{ textAlign: "center" }}>
          <h1 style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
            fontSize: "36px",
            fontWeight: 300,
            color: "var(--ink)",
            margin: "0 0 4px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}>
            PSX
          </h1>
          <p style={{
            fontSize: "10px",
            fontWeight: 400,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: "var(--ink-muted)",
            margin: 0,
          }}>
            Management System
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "var(--border)" }} />

        {/* Error */}
        {error && (
          <div style={{
            border: "1px solid var(--s-red)",
            padding: "10px 16px",
            fontSize: "12px",
            color: "var(--s-red)",
            textAlign: "center",
          }}>
            {error === "AccessDenied"
              ? "Tài khoản của bạn không có quyền truy cập."
              : error === "CredentialsSignin"
              ? "Email hoặc mật khẩu không đúng."
              : "Đã xảy ra lỗi. Vui lòng thử lại."}
          </div>
        )}

        {/* Google sign in */}
        <form
          action={async () => {
            "use server";
            await signIn("google", {
              redirectTo: callbackUrl ?? "/dashboard/orders",
            });
          }}
        >
          <button
            type="submit"
            className="psx-login-google-btn"
          >
            <svg viewBox="0 0 24 24" style={{ width: "16px", height: "16px", flexShrink: 0 }}>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Tiếp tục với Google
          </button>
        </form>

        {/* Credentials form — chỉ hiện khi ?admin=1 */}
        {showAdminForm && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
              <span style={{ fontSize: "10px", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                hoặc
              </span>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            </div>

            <form
              action={async (formData: FormData) => {
                "use server";
                try {
                  await signIn("credentials", {
                    username: formData.get("username"),
                    password: formData.get("password"),
                    redirectTo: callbackUrl ?? "/dashboard/orders",
                  });
                } catch (err) {
                  if (err instanceof AuthError) {
                    const params = new URLSearchParams({ error: "CredentialsSignin", admin: "1" });
                    if (callbackUrl) params.set("callbackUrl", callbackUrl);
                    redirect(`/auth/login?${params.toString()}`);
                  }
                  throw err;
                }
              }}
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <div>
                <label style={{
                  display: "block", fontSize: "10px", textTransform: "uppercase",
                  letterSpacing: "0.12em", color: "var(--ink-muted)", marginBottom: "4px",
                }}>
                  Tên đăng nhập
                </label>
                <input type="text" name="username" required autoComplete="username" placeholder="ADMIN"
                  style={{
                    width: "100%", padding: "8px 0", fontSize: "13px", color: "var(--ink-body)",
                    background: "transparent", border: "none", borderBottom: "1px solid var(--border)",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{
                  display: "block", fontSize: "10px", textTransform: "uppercase",
                  letterSpacing: "0.12em", color: "var(--ink-muted)", marginBottom: "4px",
                }}>
                  Mật khẩu
                </label>
                <input type="password" name="password" required autoComplete="current-password" placeholder="••••••••"
                  style={{
                    width: "100%", padding: "8px 0", fontSize: "13px", color: "var(--ink-body)",
                    background: "transparent", border: "none", borderBottom: "1px solid var(--border)",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <button type="submit"
                style={{
                  width: "100%", padding: "10px", fontSize: "11px", fontWeight: 500,
                  textTransform: "uppercase", letterSpacing: "0.14em",
                  background: "var(--ink)", color: "var(--cream)",
                  border: "none", cursor: "pointer", marginTop: "4px",
                }}
              >
                Đăng nhập
              </button>
            </form>
          </>
        )}

        {/* Footer row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: 0 }}>
            Chỉ tài khoản được cấp quyền mới có thể đăng nhập.
          </p>
          {!showAdminForm && (
            <a
              href={`/auth/login?admin=1${callbackUrl ? `&callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`}
              style={{
                fontSize: "9px", color: "var(--ink-muted)", textDecoration: "none",
                letterSpacing: "0.1em", flexShrink: 0, marginLeft: "8px",
                opacity: 0.45,
              }}
              title="Đăng nhập quản trị"
            >
              admin
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

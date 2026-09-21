import Link from "next/link";

// ─── Hai trang trong một ──────────────────────────────────────────────────────
//
// "Không có quyền" và "chưa đọc được quyền" nhìn giống nhau với hệ thống nhưng KHÁC HẲN nhau
// với người dùng: câu đầu bảo họ đi xin admin cấp quyền, câu sau chỉ cần bấm Thử lại. Trước
// đây cả hai đều ra cùng một màn 403, nên nhân viên 3D gặp trục trặc DB thoáng qua lại tưởng
// mình bị cắt quyền.
//
// Dùng query param thay vì thêm một route: cùng một khung, khác đúng ba dòng chữ và một nút.
const VARIANTS = {
  denied: {
    code: "403",
    title: "Không có quyền truy cập",
    body: "Tài khoản của bạn không có quyền vào trang này.",
    retry: false,
  },
  unavailable: {
    code: "···",
    title: "Chưa xác định được quyền truy cập",
    body: "Hệ thống chưa đọc được quyền của tài khoản bạn — thường do kết nối cơ sở dữ liệu chậm ở lần vào đầu tiên. Bấm Thử lại; nếu vẫn vậy sau vài lần, báo quản trị viên.",
    retry: true,
  },
} as const;

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const v = reason === "role-unavailable" ? VARIANTS.unavailable : VARIANTS.denied;

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
        alignItems: "center",
        gap: "16px",
      }}>
        <p style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
          fontSize: "72px",
          fontWeight: 300,
          color: "var(--border)",
          margin: 0,
          lineHeight: 1,
        }}>{v.code}</p>

        <div style={{ height: "1px", background: "var(--border)", width: "100%" }} />

        <h1 style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
          fontSize: "22px",
          fontWeight: 400,
          color: "var(--ink)",
          margin: 0,
          textAlign: "center",
        }}>
          {v.title}
        </h1>

        <p style={{
          fontSize: "12px",
          color: "var(--ink-muted)",
          textAlign: "center",
          margin: 0,
          lineHeight: 1.6,
        }}>
          {v.body}
        </p>

        {/* Vào lại /dashboard là một lần THỬ LẠI thật, không phải chỉ điều hướng: mỗi lượt tải
            trang đều chạy lại jwt callback, tức đọc lại role từ DB. Lần này kết nối đã ấm. */}
        <Link href="/dashboard" className="psx-btn-primary" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", marginTop: "8px" }}>
          {v.retry ? "Thử lại" : "Về trang chủ"}
        </Link>
      </div>
    </div>
  );
}

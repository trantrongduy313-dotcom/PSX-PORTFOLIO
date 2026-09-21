import Link from "next/link";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

// Bản đồ lỗi Auth.js → thông báo tiếng Việt
const ERROR_MESSAGES: Record<string, string> = {
  Configuration: "Lỗi cấu hình hệ thống. Vui lòng liên hệ quản trị viên.",
  AccessDenied: "Tài khoản của bạn không có quyền truy cập hệ thống.",
  Verification: "Liên kết xác minh không hợp lệ hoặc đã hết hạn.",
  Default: "Đã xảy ra lỗi không xác định. Vui lòng thử lại.",
};

export default async function AuthErrorPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const message = ERROR_MESSAGES[error ?? ""] ?? ERROR_MESSAGES.Default;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm p-8 flex flex-col gap-6 text-center">

        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto">
          <span className="text-red-500 text-2xl font-bold">!</span>
        </div>

        <div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Lỗi đăng nhập</h1>
          <p className="text-sm text-gray-500">{message}</p>
          {error && (
            <p className="text-xs text-gray-300 mt-2 font-mono">Code: {error}</p>
          )}
        </div>

        <Link
          href="/auth/login"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors text-sm"
        >
          Quay lại trang đăng nhập
        </Link>
      </div>
    </div>
  );
}

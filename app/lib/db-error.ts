// ─── Phân loại lỗi database thành thông điệp dùng được ────────────────────────
//
// VÌ SAO CÓ FILE NÀY: khi DB preview thiếu cột mà Prisma client đã biết (schema đi trước
// migration), route ném lỗi không ai bắt → Next trả 500 với body RỖNG → client gọi
// `res.json()` trên body rỗng → người dùng thấy đúng câu này:
//
//     Failed to execute 'json' on 'Response': Unexpected end of JSON input
//
// Nguyên nhân thật ("thiếu cột reviewStatus, chưa chạy migration") không bao giờ tới được
// mắt người đọc. Chẩn đoán vì thế mất nhiều vòng dò.
//
// Kế hoạch dự án (docs/3d-kpi-assignment-plan.md) vốn đã yêu cầu: "Nếu staging DB chưa chạy
// migration 3D KPI, UI hiển thị lỗi cấu hình thay vì làm hỏng trang". Đây là phần thực thi
// yêu cầu đó.
//
// File thuần (không prisma, không I/O) để test trực tiếp.

export type DbErrorKind = "SCHEMA_DRIFT" | "UNREACHABLE" | "UNKNOWN";

export type ClassifiedDbError = {
  kind: DbErrorKind;
  /** Câu tiếng Việt hiện cho người dùng. KHÔNG chứa connection string hay mật khẩu. */
  message: string;
};

/** Mã lỗi Prisma/Postgres cho "cột/bảng không tồn tại" — dấu hiệu schema đi trước migration. */
const SCHEMA_DRIFT_CODES = new Set([
  "P2021", // bảng không tồn tại
  "P2022", // cột không tồn tại
  "42703", // postgres: undefined_column
  "42P01", // postgres: undefined_table
]);

/** Mã lỗi Prisma cho "không nối được tới DB". */
const UNREACHABLE_CODES = new Set([
  "P1001", // không tới được server
  "P1002", // timeout
  "P1003", // database không tồn tại
]);

function readCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

function readMessage(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "";
}

/**
 * Nhận diện lỗi để trả về thông điệp CHỈ ĐÚNG CHỖ CẦN SỬA.
 *
 * Cố ý KHÔNG trả nguyên văn lỗi DB ra ngoài: lỗi thô có thể chứa tên bảng/cột và đôi khi cả
 * chuỗi kết nối. Chi tiết đầy đủ thuộc về log phía server, không phải màn hình người dùng.
 */
export function classifyDbError(error: unknown): ClassifiedDbError {
  const code = readCode(error);
  const message = readMessage(error);

  const looksLikeDrift =
    SCHEMA_DRIFT_CODES.has(code) ||
    /does not exist|không tồn tại/i.test(message) && /column|relation|table/i.test(message);

  if (looksLikeDrift) {
    return {
      kind: "SCHEMA_DRIFT",
      message:
        "Cơ sở dữ liệu đang thiếu bảng/cột mà phiên bản này cần — " +
        "database chưa chạy migration mới nhất. Chạy `npm run migrate:preview` rồi tải lại trang.",
    };
  }

  if (UNREACHABLE_CODES.has(code)) {
    return {
      kind: "UNREACHABLE",
      message: "Không kết nối được tới cơ sở dữ liệu. Kiểm tra DATABASE_URL và trạng thái database.",
    };
  }

  return { kind: "UNKNOWN", message: "Đã xảy ra lỗi không mong đợi khi đọc dữ liệu." };
}

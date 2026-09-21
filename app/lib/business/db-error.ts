// ═══════════════════════════════════════════════════════════════════════════
// DỊCH LỖI DB THÀNH CÂU NGƯỜI DÙNG ĐỌC ĐƯỢC
//
// ⚠️ VÌ SAO CẦN: mọi thất bại ở route đều rơi vào một câu duy nhất — "An unexpected error
// occurred". Câu đó gộp lỗi lập trình, lỗi hạ tầng và xung đột dữ liệu vào cùng một chỗ, nên:
//
//   · người dùng không biết mình làm sai gì, hay có phải lỗi của mình không;
//   · người vận hành không biết báo lại điều gì;
//   · người sửa không biết tìm ở đâu.
//
// Lỗi hủy MO vừa rồi nằm im trên production đúng vì lý do này: nguyên nhân thật là "gửi một
// field không phải cột", nhưng thứ hiện ra không hề gợi ý điều đó.
//
// KHÔNG BAO GIỜ trả nguyên văn lỗi Prisma cho client: trong đó có tên bảng, tên cột, và đôi khi
// cả giá trị đang ghi. Hàm này dịch sang câu MÔ TẢ TÌNH HUỐNG, còn chi tiết để log.
//
// File THUẦN: không prisma, không React — nhận `unknown` và chỉ đọc thuộc tính.
// ═══════════════════════════════════════════════════════════════════════════

export type DbErrorKind =
  /** Lỗi LẬP TRÌNH — payload sai hình dạng so với schema Prisma. Người dùng không sửa được. */
  | "CLIENT_BUG"
  /** Trùng giá trị đã tồn tại (unique constraint). */
  | "DUPLICATE"
  /** Bản ghi cần sửa/xoá không còn. */
  | "MISSING_RECORD"
  /** Giao dịch quá thời gian, hoặc mất kết nối DB giữa đường. */
  | "TIMEOUT"
  /** Không nhận ra — vẫn phải trả về một câu, nhưng không bịa nguyên nhân. */
  | "UNKNOWN";

export type DbErrorInfo = {
  kind: DbErrorKind;
  /** Câu hiện cho người dùng. Nói được NÊN LÀM GÌ, không chỉ "đã lỗi". */
  message: string;
  /**
   * Có phải lỗi HẠ TẦNG/TẠM THỜI (nên trả 503, thử lại thì có thể được) thay vì bug (500)?
   * Phân biệt được hai loại này thì đọc log và đặt cảnh báo mới có nghĩa.
   */
  retryable: boolean;
};

/** Mã lỗi Prisma nếu có. Đọc thuộc tính thay vì `instanceof`: lỗi có thể đi qua lớp bọc
 *  `$transaction`, và Next.js có thể nạp module hai lần nên `instanceof` âm thầm sai. */
function prismaCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

function messageOf(error: unknown): string {
  const m = (error as { message?: unknown } | null)?.message;
  return typeof m === "string" ? m : "";
}

export function describeDbError(error: unknown): DbErrorInfo {
  const code = prismaCode(error);
  const raw = messageOf(error);

  // Không có mã nhưng nội dung nói "Unknown argument" → PrismaClientValidationError, tức payload
  // chứa field không phải cột. ĐÂY LÀ BUG CỦA HỆ THỐNG, không phải người dùng gõ sai — nên câu
  // trả về phải nói vậy, đừng đẩy người dùng đi thử lại một việc không bao giờ chạy được.
  if (!code && (raw.includes("Unknown argument") || raw.includes("Unknown field"))) {
    return {
      kind: "CLIENT_BUG",
      message: "Hệ thống gửi sai dữ liệu lên máy chủ — lỗi này đã được ghi log. Vui lòng báo quản trị, thử lại sẽ không hết.",
      retryable: false,
    };
  }

  switch (code) {
    case "P2002":
      return { kind: "DUPLICATE", message: "Giá trị này đã tồn tại trong hệ thống.", retryable: false };
    case "P2025":
      return {
        kind: "MISSING_RECORD",
        message: "Dữ liệu cần cập nhật không còn tồn tại — có thể người khác vừa đổi. Hãy tải lại đơn.",
        retryable: false,
      };
    // P2028 giao dịch quá hạn/lỗi; P1001 không nối được; P1008 hết thời gian chờ; P1017 server
    // đóng kết nối. Bốn cái này đều là "hạ tầng, thử lại có thể được".
    case "P2028":
    case "P1001":
    case "P1008":
    case "P1017":
      return {
        kind: "TIMEOUT",
        message: "Hệ thống đang xử lý chậm, chưa lưu được. Vui lòng thử lại sau vài giây.",
        retryable: true,
      };
    default:
      return {
        kind: "UNKNOWN",
        message: "Không lưu được do lỗi hệ thống. Vui lòng thử lại; nếu vẫn lỗi hãy báo quản trị.",
        retryable: false,
      };
  }
}

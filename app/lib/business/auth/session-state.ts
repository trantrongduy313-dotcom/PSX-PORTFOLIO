// ─── Session nói lên điều gì: BA trạng thái, không phải hai ──────────────────
//
// Bản trước chỉ có hai: có session hay không. "Có session nhưng chưa đọc được role" bị nhét
// vào nhánh "có" rồi được vá bằng `role ?? "SALES"` ở session callback — và SALES lại đúng là
// role DUY NHẤT không được vào màn Việc thiết kế 3D. Kết quả: một lượt đọc DB hỏng ngay sau
// khi đăng nhập biến nhân viên 3D thành SALES và ném họ vào trang 403; F5 một cái là hết,
// nên nó trông như lỗi vặt chứ không lộ ra là lỗi phân quyền.
//
// Tách thành ba trạng thái để chỗ gọi buộc phải xử lý riêng cái ở giữa. Hàm THUẦN, không
// import next-auth, để test được mà không cần dựng session thật.

export type SessionState = "ANONYMOUS" | "ROLE_UNAVAILABLE" | "OK";

/** Chỉ hai trường thật sự dùng để quyết định — cố ý không nhận cả object Session. */
export type SessionProbe = {
  userId?: string | null;
  role?: string | null;
};

/**
 * ⚠️ KHÔNG BAO GIỜ trả về một role mặc định từ hàm này, và cũng đừng thêm tham số `fallback`.
 *
 * Không biết quyền của một người thì câu trả lời đúng là "không biết". Mọi giá trị bịa ra ở
 * đây đều là một khẳng định sai trông y hệt khẳng định đúng, nên không tầng nào phía sau phát
 * hiện được — đó chính xác là cách lỗi cũ sống sót.
 */
export function resolveSessionState(probe: SessionProbe | null | undefined): SessionState {
  if (!probe?.userId) return "ANONYMOUS";
  // Cắt khoảng trắng trước khi xét: chuỗi rỗng LẪN chuỗi toàn dấu cách đều không phải tên của
  // bất kỳ role nào. Bản đầu chỉ kiểm truthy nên "   " lọt qua thành hợp lệ, rồi rơi xuống
  // `allowedRoles.includes("   ")` — tức lại thành 403 sai chỗ, đúng lỗi vừa đi sửa.
  if (!probe.role || probe.role.trim() === "") return "ROLE_UNAVAILABLE";
  return "OK";
}

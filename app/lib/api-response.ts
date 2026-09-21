export type ApiSuccess<T> = { data: T };
export type ApiPaginated<T> = { data: T[]; pagination: Pagination };
export type ApiError = { error: { code: string; message: string; details?: unknown } };

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ data } satisfies ApiSuccess<T>, { status });
}

export function paginated<T>(data: T[], pagination: Pagination): Response {
  return Response.json({ data, pagination } satisfies ApiPaginated<T>);
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown
): Response {
  return Response.json(
    { error: { code, message, ...(details !== undefined && { details }) } } satisfies ApiError,
    { status }
  );
}

export const Errors = {
  notFound: (resource = "Resource") =>
    apiError("NOT_FOUND", `${resource} not found`, 404),

  badRequest: (message: string, details?: unknown) =>
    apiError("BAD_REQUEST", message, 400, details),

  // `details` tuỳ chọn: có xung đột mà client CẦN XỬ LÝ RIÊNG (vd trùng MO ở PSX — hiện hộp xác
  // nhận rồi gửi lại kèm cờ đồng ý) thì nó phải phân biệt được ca đó với mọi 409 khác. Dựa vào
  // nội dung câu thông báo để đoán là cách nhanh nhất làm hỏng client khi ai đó sửa câu chữ.
  conflict: (message: string, details?: unknown) =>
    apiError("CONFLICT", message, 409, details),

  /**
   * "Cần xác nhận trước khi làm" — KHÔNG phải lỗi của người dùng, mà là một quyết định đang chờ họ.
   *
   * ⚠️ VÌ SAO KHÔNG DÙNG 409: trong dự án này 409 ĐÃ CÓ NGHĨA SẴN — "đơn vừa được người khác cập
   * nhật, hãy tải lại" — và client bắt nó theo STATUS rồi ném `Error("CONFLICT")` trần, làm mất
   * luôn câu thông báo. Mượn 409 cho một ca cần xác nhận là người dùng nhận đúng một chữ
   * "CONFLICT" và một lời khuyên tải lại hoàn toàn không liên quan.
   */
  preconditionRequired: (message: string, details?: unknown) =>
    apiError("PRECONDITION_REQUIRED", message, 428, details),

  validationFailed: (details: unknown) =>
    apiError("VALIDATION_FAILED", "Input validation failed", 422, details),

  forbidden: (message = "Forbidden") =>
    apiError("FORBIDDEN", message, 403),

  // `message` tuỳ chọn: mặc định giữ nguyên câu cũ để không đổi hành vi của hàng chục route
  // đang gọi `Errors.internal()`. Route nào đã dịch được lỗi thành câu có nghĩa thì truyền vào —
  // vẫn là 500 (đúng: lỗi ở phía hệ thống), chỉ khác là người dùng biết nên làm gì.
  internal: (message = "An unexpected error occurred") =>
    apiError("INTERNAL_ERROR", message, 500),

  // Lỗi hạ tầng bên ngoài (DB thiếu migration/không nối được, Supabase Storage lỗi/thiếu cấu
  // hình...) — vẫn phải trả JSON có nội dung, không để client tự đoán qua body rỗng.
  // Trả 503 thay vì 500: đây là vấn đề cấu hình môi trường, không phải bug xử lý request,
  // và phân biệt được hai loại này giúp đọc log dễ hơn.
  serviceUnavailable: (message: string) =>
    apiError("SERVICE_UNAVAILABLE", message, 503),
};

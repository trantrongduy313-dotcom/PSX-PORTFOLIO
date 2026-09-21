// ─── "Trạng thái vừa đổi dưới chân bạn" ───────────────────────────────────────
//
// VÌ SAO CẦN MỘT LOẠI LỖI RIÊNG: mọi route ở màn 3D đều theo khuôn ĐỌC → KIỂM → GHI, và phần
// kiểm chạy trên bản đã đọc. Giữa hai bước đó, một request khác có thể đã đóng lượt, duyệt lượt,
// hay gác đơn. Hai hệ quả có thật đã gặp:
//
//   · bấm đôi "Giao lượt tiếp theo" → MỘT MO CÓ HAI LƯỢT ĐANG CHẠY, hai suất KPI;
//   · hai người cùng mở một MO, một người duyệt trong lúc người kia đổi nhân viên.
//
// Cách chữa không phải thêm một lần đọc nữa (lần đọc thứ hai cũng cũ ngay sau khi đọc), mà là
// ĐƯA ĐIỀU KIỆN VÀO CHÍNH CÂU UPDATE rồi xem nó sửa được mấy dòng. `updateMany` với `where` đầy
// đủ khiến DB làm trọng tài: câu thứ hai chờ khoá dòng của câu thứ nhất, thấy điều kiện không còn
// đúng, và trả về count = 0.
//
// Lỗi này được ném TRONG transaction để mọi thứ đã ghi bị quay lại — đóng lượt cũ mà không mở
// được lượt mới là bỏ rơi một MO không còn ai phụ trách.
//
// ⚠️ PHẢI TRẢ 409, KHÔNG PHẢI 500. Người dùng không làm gì sai và việc họ muốn làm có thể vẫn hợp
// lệ sau khi tải lại; một lỗi hệ thống màu đỏ ở đây khiến họ bấm lại nhiều lần — đúng thứ vừa
// chặn. Xem Errors.conflict.

const MESSAGE =
  "Trạng thái lượt giao việc vừa thay đổi (người khác đã chốt/duyệt/giao lại lượt này). Hãy tải lại màn hình rồi thao tác lại — hệ thống chưa ghi gì.";

export class StaleAssignmentError extends Error {
  constructor(message: string = MESSAGE) {
    super(message);
    this.name = "StaleAssignmentError";
  }
}

/**
 * Có phải lỗi "trạng thái vừa đổi" không?
 *
 * Kiểm theo `name` chứ không `instanceof`: lỗi ném từ trong callback của prisma.$transaction đi
 * qua một lớp bọc, và với Next.js còn có khả năng module được nạp hai lần (server/route bundle)
 * — lúc đó `instanceof` so hai class khác nhau về danh tính và luôn ra false, tức mọi lỗi này âm
 * thầm rơi xuống nhánh 500. Một phép kiểm im lặng thất bại thì tệ hơn không kiểm.
 */
export function isStaleAssignmentError(err: unknown): boolean {
  return err instanceof Error && err.name === "StaleAssignmentError";
}

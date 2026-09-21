// ─── DANH SÁCH TRƯỜNG của khối "Nhân viên 3D #N" ──────────────────────────────
//
// ⚠️ MODULE NÀY TỒN TẠI VÌ HAI KHỐI ĐÃ LỆCH NHAU THẬT, KHÔNG PHẢI ĐỀ PHÒNG.
//
// Sidebar dựng khối "Nhân viên 3D #N" bằng HAI đoạn JSX độc lập:
//
//   · `Designer3DCard`     — lượt ĐANG chạy, có ô nhập.
//   · `ClosedAttemptCard`  — lượt ĐÃ CHỐT, chỉ đọc.
//
// Mỗi bên tự khai danh sách trường của mình. Kết quả đo được lúc rà soát:
//
//   Đang chạy: 13 trường.  Đã chốt: 8 trường.
//   Thiếu ở khối đã chốt: NV 3D nhận việc · Số ngày HT · Kiểm nội bộ.
//   Cùng một sự thật hai hình dạng: "Ngày giao 3D" + "Giờ giao 3D" ‖ một ô "Giao lúc".
//   Cùng một nhãn hai cách viết: "Nhân viên Thiết kế 3D" ‖ "Nhân viên thiết kế 3D".
//
// Ba trường thiếu KHÔNG phải ba lần bất cẩn — chúng là MỘT nguyên nhân xảy ra ba lần: ai thêm
// ô vào khối đang chạy thì khối đã chốt tụt lại một trường nữa, và không có gì báo.
//
// ─── VÌ SAO KHAI Ở ĐÂY CHỨ KHÔNG VÁ BA Ô ────────────────────────────────────
//
// Vá ba ô là giữ nguyên nguyên nhân; trường thứ mười bốn sẽ lại thiếu. Khác biệt THẬT giữa hai
// khối chỉ là SỬA ĐƯỢC HAY KHÔNG — không phải CÓ TRƯỜNG NÀO. Nên danh sách trường phải nằm
// ngoài cả hai, và cả hai đọc từ đây.
//
// Chốt an toàn không nằm ở test mà ở KIỂU: mỗi khối phải dựng một `Record<AttemptFieldKey, …>`
// đầy đủ. Thêm một key vào đây là CẢ HAI khối không biên dịch được cho tới khi có ô tương ứng —
// một test có thể bị bỏ qua, `tsc` thì không.
//
// File THUẦN: không React, không prisma.

/**
 * Toàn bộ trường của một lượt giao việc 3D, THEO THỨ TỰ HIỂN THỊ.
 *
 * Thứ tự nằm ở đây chứ không ở JSX vì hai khối đang xếp khác nhau (khối đã chốt để Deadline
 * trước Số giờ KPI, khối đang chạy thì ngược lại). Hai khối nằm sát nhau trong cùng một panel
 * mà đảo thứ tự thì người đọc phải dò lại từ đầu ở khối thứ hai.
 */
export const ATTEMPT_FIELD_KEYS = [
  "kpiGroup",
  "designer",
  "assignedDate",
  "assignedTime",
  "standardHours",
  "deadline",
  "completedDate",
  "actualHours",
  "workingDays",
  "ketQua",
  "reviewStatus",
  "renderInfo",
  "acknowledgedAt",
] as const;

export type AttemptFieldKey = typeof ATTEMPT_FIELD_KEYS[number];

/**
 * Nhãn hiển thị — MỘT chuỗi cho mỗi trường.
 *
 * Trước đây nhãn là chuỗi viết thẳng trong JSX ở hai chỗ, nên "Nhân viên Thiết kế 3D" và
 * "Nhân viên thiết kế 3D" cùng tồn tại. Chữ T hoa không làm sai số nào, nhưng nó là bằng chứng
 * rằng không có gì buộc hai khối nói cùng một thứ tiếng.
 */
export const ATTEMPT_FIELD_LABELS: Record<AttemptFieldKey, string> = {
  kpiGroup:       "Nhóm KPI 3D",
  designer:       "Nhân viên Thiết kế 3D",
  assignedDate:   "Ngày giao 3D",
  assignedTime:   "Giờ giao 3D",
  standardHours:  "Số giờ KPI",
  deadline:       "Deadline KPI",
  completedDate:  "Ngày HT 3D",
  actualHours:    "Giờ thực tế",
  workingDays:    "Số ngày HT",
  ketQua:         "Kết quả",
  reviewStatus:   "Kiểm nội bộ",
  renderInfo:     "File Render / Info",
  acknowledgedAt: "NV 3D nhận việc",
};

/**
 * Các trường là PHÁN QUYẾT — chỉ có nghĩa khi số giờ đã là số CUỐI.
 *
 * Đơn ĐANG tạm dừng thì chưa ai kết luận gì: `Kết quả`/`Kiểm nội bộ` sẽ là "—", và `Số ngày HT`
 * chia từ một số giờ còn chạy nên ra "0 ngày" — đúng về số mà đọc như một đơn hoàn tất trong 0
 * ngày. Ẩn cả hàng, đừng bày ba ô rỗng.
 *
 * Luật này thuộc TRẠNG THÁI, không thuộc khối: lượt đã chốt thì mọi số đã dừng nên luôn hiện,
 * lượt đang dừng thì ẩn — cùng một câu hỏi, cùng một câu trả lời ở cả hai bên.
 */
export const VERDICT_FIELD_KEYS = ["workingDays", "ketQua", "reviewStatus"] as const;

/** Có hiện nhóm trường phán quyết hay không. `true` = số giờ đã dừng lại. */
export function showsVerdictFields(params: { isPausedSnapshot: boolean }): boolean {
  return !params.isPausedSnapshot;
}

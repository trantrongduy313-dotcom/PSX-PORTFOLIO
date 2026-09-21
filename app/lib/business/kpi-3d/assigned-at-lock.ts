// ─── MỐC GIAO VIỆC 3D: không giao lùi về ngày cũ ─────────────────────────────
//
// LỖ HỔNG ĐANG BỊT: đường đồng bộ từ form đơn hàng nhận ĐÚNG thứ người dùng gõ vào ô
// "Ngày giao 3D" — không kiểm gì cả. Gõ 01/07 cũng nhận, gõ 2062 cũng nhận.
//
// BA HẬU QUẢ, VÀ CHÚNG NỐI NHAU:
//
//   a) Deadline sinh ra ĐÃ QUÁ HẠN. Deadline tính từ mốc giao, nên giao lùi ngày là việc vừa
//      tạo đã đỏ — nhân viên nhận một việc mà đồng hồ đã chạy hết từ trước.
//
//   b) Giờ KPI chạy NHẦM THÁNG. Giao lùi về tháng trước là ghi công vào một tháng đã chốt sổ.
//      Nút Tạm dừng có chốt chặn đúng cho chuyện này (deniedReasonForPauseAt); đường giao việc
//      thì không có gì.
//
//   c) ⚠️ VÀ NẶNG NHẤT: giờ tạm dừng nay TỰ ĐO = (mốc dừng) − (lúc nhận việc), rơi về MỐC GIAO
//      khi nhân viên chưa nhận. Nên giao lùi một tuần là hệ thống tự ghi thêm cả tuần giờ công
//      vào KPI — không ai gõ, không ai duyệt, không có gì báo. Hai thay đổi đúng riêng lẻ ghép
//      lại thành một lỗ.
//
// ─── VÌ SAO CHO GIAO NGÀY MAI TRỞ ĐI ────────────────────────────────────────
//
// Xếp việc trước cho tuần sau là nghiệp vụ có thật. Deadline tính từ mốc tương lai vẫn đúng, và
// đồng hồ chỉ bắt đầu chạy khi tới mốc đó. Không có lý do gì để cấm.
//
// File THUẦN: không prisma, không React, không đọc đồng hồ hệ thống (nhận `todayVnYmd` từ ngoài
// để test được mà không phải giả lập thời gian).

/** Trần tương lai — chống gõ nhầm năm (VD "2062"), không phải một luật nghiệp vụ. */
export const MAX_ASSIGN_AHEAD_DAYS = 365;

/** "YYYY-MM-DD" → số ngày kể từ mốc quy ước. Chỉ để TRỪ hai ngày lịch, không phải mốc thật. */
function ymdToDayNumber(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  // Date.UTC trên ngày-lịch thuần: cả hai vế cùng quy ước nên hiệu số là số ngày chính xác,
  // không dính giờ mùa hè hay múi giờ.
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/** Đổi "YYYY-MM-DD" sang "DD/MM/YYYY" để câu thông báo đọc theo cách người dùng viết ngày. */
function human(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return d && m && y ? `${d}/${m}/${y}` : ymd;
}

/**
 * Vì sao KHÔNG được ghi mốc giao này — null nghĩa là hợp lệ.
 *
 * ⚠️ CHỈ XÉT KHI GIÁ TRỊ THAY ĐỔI. MO cũ mang mốc giao từ tháng trước là chuyện hoàn toàn bình
 * thường; nếu chặn cả lần lưu không đụng tới nó thì MỌI lần lưu một đơn cũ đều nổ lỗi, và người
 * dùng sẽ học cách bỏ qua lỗi — mất luôn tác dụng của chốt chặn. Đây đúng là bài học đã rút ra
 * ở khoá "đã duyệt" và khoá "đang tạm dừng".
 *
 * So theo NGÀY LỊCH GIỜ VN, không phải mốc tuyệt đối: đổi giờ trong cùng một ngày không phải là
 * "giao lùi", và server chạy UTC nên so bằng mốc tuyệt đối sẽ lệch một ngày vào sáng sớm.
 *
 * @param assignedYmd     Mốc sắp ghi, dạng "YYYY-MM-DD" theo giờ VN.
 * @param previousYmd     Mốc đang có trong bảng (null = lượt mới, chưa có gì để so).
 * @param todayVnYmd      Hôm nay theo giờ VN — truyền vào, không tự đọc đồng hồ.
 */
export function deniedReasonForAssignedAt(params: {
  assignedYmd: string;
  previousYmd: string | null;
  todayVnYmd: string;
}): string | null {
  const { assignedYmd, previousYmd, todayVnYmd } = params;

  // Không đổi ngày → không phải một quyết định mới, không xét.
  if (previousYmd !== null && previousYmd === assignedYmd) return null;

  const target = ymdToDayNumber(assignedYmd);
  const today = ymdToDayNumber(todayVnYmd);
  // Chuỗi không dựng được thì KHÔNG chặn ở đây: đó là lỗi định dạng, thuộc về lớp phân tích
  // ngày. Chặn nhầm chỗ sẽ cho một câu thông báo nói sai nguyên nhân.
  if (target === null || today === null) return null;

  if (target < today) {
    return `Ngày giao 3D ${human(assignedYmd)} đã qua — không giao lùi về ngày cũ được. `
      + `Deadline KPI tính từ mốc giao, nên việc sẽ quá hạn ngay khi vừa tạo, và giờ công có thể `
      + `chạy nhầm sang tháng đã chốt sổ. Sớm nhất là hôm nay (${human(todayVnYmd)}).`;
  }

  if (target - today > MAX_ASSIGN_AHEAD_DAYS) {
    return `Ngày giao 3D ${human(assignedYmd)} cách hôm nay hơn ${MAX_ASSIGN_AHEAD_DAYS} ngày — `
      + `kiểm tra lại năm xem có gõ nhầm không.`;
  }

  return null;
}

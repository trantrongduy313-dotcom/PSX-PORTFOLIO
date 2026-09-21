// Dòng tóm tắt của khối "Nhân viên 3D #N" khi thu gọn.
//
// Luật có test: __tests__/kpi-3d-attempt-summary.test.ts
// Ba lỗi nó sửa: docs/04_ENGINEERING_GUIDELINES.md § Dòng tóm tắt khối NV 3D
//
// 🔴 TRẢ VỀ PHẦN RỜI, KHÔNG TRẢ VỀ MỘT CHUỖI. Chuỗi đã ghép thì không tô màu từng phần được nữa
// — và đó chính là cách màu trạng thái bị mất. `lead` (được phép cắt) tách khỏi chip trạng thái.

/** Rút hạn chót xuống dd/MM. `null` khi không có gì để hiện. */
export function deadlineShortLabel(ymd: string | null | undefined): string | null {
  if (!ymd || ymd.length < 10) return null;
  const [, mm, dd] = ymd.split("-");
  if (!mm || !dd) return null;
  return `${dd}/${mm}`;
}

/**
 * Số giờ cho dòng tóm tắt — CÓ NGỮ CẢNH hoặc không hiện.
 *
 * "0 giờ" một mình vô nghĩa: người đọc không biết 0 trên bao nhiêu. "0/4 giờ" thì đọc được
 * ngay là chưa ghi giờ nào trên ngân sách 4 giờ. Không có ngân sách thì hiện số trần.
 */
export function summaryHoursLabel(
  actualHours: number | null | undefined,
  standardHours: number | null | undefined,
): string | null {
  if (actualHours == null) return null;
  return standardHours != null && standardHours > 0
    ? `${actualHours}/${standardHours} giờ`
    : `${actualHours} giờ`;
}

export type AttemptSummaryInput = {
  designerName: string | null | undefined;
  kpiGroupName: string | null | undefined;
  /**
   * Lượt đã đóng — số giờ đã là số CUỐI.
   *
   * QUYẾT ĐỊNH Ô THỨ BA của dòng: lượt đã đóng thì hạn chót không còn nghĩa gì (nó đã qua và
   * phán quyết đã có), còn lượt đang chạy thì chưa có số giờ cuối để đối chiếu. Cùng một ngữ
   * pháp, ô thứ ba trả lời "còn bao lâu" hay "đã mất bao nhiêu" tuỳ lượt đang ở đâu.
   */
  isClosed: boolean;
  /**
   * Đang tạm dừng — ĐỨNG ĐẦU dòng.
   *
   * Nó PHỦ ĐỊNH mọi thứ đứng sau: hạn chót đang bị treo, trạng thái kiểm đang đứng yên. Đọc
   * được nó sau cùng thì đã đọc sai cả dòng.
   */
  isPaused?: boolean;
  actualHours?: number | null;
  standardHours?: number | null;
  /** Hạn chót dạng YYYY-MM-DD; module tự rút xuống dd/MM. */
  deadlineYmd?: string | null;
};

/**
 * Phần chữ của dòng tóm tắt — MỘT ngữ pháp cho mọi khối:
 *
 *   [Đang tạm dừng] · [Tên người] · [Nhóm] · [số giờ HOẶC hạn dd/MM]
 *
 * KHÔNG có dấu `·` mở đầu: bản cũ in "· N8n" — dấu đó không phân tách gì, nó chỉ là một hạt
 * bụi ở đầu dòng.
 *
 * KHÔNG chứa trạng thái: trạng thái là chip có màu, neo bên phải để `truncate` cắt TÊN chứ
 * không cắt phán quyết. Xem chú thích đầu file.
 *
 * Bỏ ô trống thay vì hiện "—" liên tiếp: khối chưa nhập gì thì tóm tắt cũng trống.
 */
export function attemptSummaryLead(input: AttemptSummaryInput): string {
  const metric = input.isClosed
    ? summaryHoursLabel(input.actualHours, input.standardHours)
    : (() => {
        const short = deadlineShortLabel(input.deadlineYmd);
        // "hạn" là NHÃN, không phải trang trí: nó phân biệt mốc này với Ngày HT — hai ngày rất
        // dễ lẫn khi cùng hiện dạng dd/MM mà không có gì nói cái nào là cái nào.
        return short ? `hạn ${short}` : null;
      })();

  return [
    input.isPaused ? "Đang tạm dừng" : "",
    (input.designerName ?? "").trim(),
    (input.kpiGroupName ?? "").trim(),
    metric ?? "",
  ].filter(Boolean).join(" · ");
}

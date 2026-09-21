// ═══════════════════════════════════════════════════════════════════════════
// "YÊU CẦU THIẾT KẾ" — đọc từ ProductionDetail.extraData
//
// Đây là thứ trả lời câu ĐẦU TIÊN của NV 3D khi nhìn một dòng việc: "làm INFO hay dựng mẫu mới
// hay chỉ chỉnh size?". Ba việc đó khác nhau hoàn toàn về khối lượng, nhưng trước đây phải mở
// từng dòng ra mới biết.
//
// ⚠️ NÓ KHÔNG PHẢI MỘT CỘT. Nó nằm trong JSON `ProductionDetail.extraData`, ở MỘT TRONG HAI chỗ:
//
//     extraData.perItem[itemId].design.yeucauThietKe   ← per-MO (đường hiện tại)
//     extraData.design.yeucauThietKe                   ← dùng chung cả SO (dữ liệu cũ)
//
// LUẬT CHỌN PHẢI GIỐNG HỆT SIDEBAR, và nó tinh tế hơn vẻ ngoài: sidebar chọn CẢ CỤM `design`
// (`perItemDesign ?? sharedDesign`), KHÔNG phải rơi về từng trường. Nghĩa là hễ MO đã có cụm
// `design` riêng thì cụm dùng chung bị bỏ qua HOÀN TOÀN — kể cả khi trường này trong cụm riêng
// đang rỗng. Rơi về từng trường ở đây sẽ làm bảng hiện một giá trị mà sidebar không hiện, và
// không ai hiểu vì sao hai màn nói khác nhau.
//
// Hàm này tồn tại để luật đó chỉ được viết MỘT LẦN.
//
// File THUẦN: không prisma, không React.
// ═══════════════════════════════════════════════════════════════════════════

// ─── DANH MỤC — một nguồn duy nhất cho MỌI ô chọn "Yêu cầu thiết kế" ─────────
//
// 🔴 TRƯỚC ĐÂY danh sách này là một mảng cứng NẰM TRONG order-detail-panel.tsx (file UI 4.800
// dòng). Nó chạy được vì chỉ có MỘT ô chọn trong cả app. Nay NV 3D cũng chọn từ đúng danh sách
// này khi báo lại thực tế đã làm, nên nếu copy sang màn 3D thì có hai mảng — và ngày Đặt đơn
// thêm mục thứ chín, một trong hai màn sẽ thiếu nó mà KHÔNG có lỗi nào.
//
// ⚠️ THỨ TỰ LÀ THỨ TỰ HIỆN TRÊN Ô CHỌN, không phải thứ tự bảng chữ cái: nó xếp theo mức việc
// (từ làm INFO tới dựng mẫu mới), đúng cách Đặt đơn nghĩ về chúng.
//
// ⚠️ GIÁ TRỊ LƯU LÀ CHÍNH CHUỖI TIẾNG VIỆT NÀY, không phải mã. Đó không phải lựa chọn của tôi —
// dữ liệu trong ProductionDetail.extraData đã là như vậy từ đầu, và đổi sang mã bây giờ là một
// đợt di dữ liệu riêng. Nên SỬA CHÍNH TẢ MỘT MỤC Ở ĐÂY = làm mọi dòng dữ liệu cũ mang giá trị
// không còn thuộc danh mục. Muốn đổi chữ hiển thị thì phải tách nhãn khỏi giá trị trước.
export const DESIGN_REQUEST_OPTIONS = [
  "Làm INFO",
  "TK mới",
  "TK cũ",
  "Ước lượng",
  "Xuất file",
  "Render QLSP/TT",
  "Chỉnh size",
  "Sửa mẫu",
] as const;

export type DesignRequestOption = (typeof DESIGN_REQUEST_OPTIONS)[number];

/**
 * Giá trị có thuộc danh mục không — dùng ở server để KHÔNG tin dữ liệu client gửi lên.
 *
 * Nhận `unknown` chứ không `string`: chỗ gọi là biên nhận request, nơi mà "nó là chuỗi" cũng
 * chưa được phép giả định.
 */
export function isDesignRequestOption(value: unknown): value is DesignRequestOption {
  return typeof value === "string" && (DESIGN_REQUEST_OPTIONS as readonly string[]).includes(value);
}

// ─── LỆCH giữa yêu cầu và thực tế NV 3D báo ──────────────────────────────────
//
// Đặt đơn giao "TK mới", làm xong mới thấy thực chất là "Ước lượng". NV 3D báo lại ở bước nộp
// kết quả; hàm này trả lời "có đáng nói không" để giao diện không phải tự suy ở ba chỗ.
//
// ⚠️ VIẾT MỘT LẦN vì nó hiện ở BA nơi: hộp Kiểm kết quả, panel chi tiết, và huy hiệu trên bảng.
// Ba chỗ tự so lấy thì một ngày sẽ có chỗ so bằng `!==` trên chuỗi chưa cắt khoảng trắng, và
// bảng báo lệch trong khi panel nói trùng.

export type DesignRequestMismatch = {
  /** Đặt đơn yêu cầu gì. null = chưa ghi. */
  requested: string | null;
  /** NV 3D báo đã làm gì thật. Luôn khác `requested` — nếu trùng thì hàm trả null. */
  reported: string;
};

/**
 * Có lệch đáng báo không — `null` nghĩa là KHÔNG cần nói gì.
 *
 * 🔴 `reported` rỗng/null KHÔNG PHẢI "trùng yêu cầu", nó là "NV không báo gì". Ô báo cáo là tùy
 * chọn, nên nó gộp cả người xác nhận đúng và người bỏ qua ô. Cả hai đều không có gì để hiện, nên
 * ở ĐÂY hai trường hợp cho cùng kết quả — nhưng chỗ nào ĐẾM thì phải nhớ chúng khác nhau, và
 * đừng đọc "0 đơn lệch" thành "không đơn nào lệch".
 *
 * `requested = null` mà NV có báo thì VẪN LÀ LỆCH đáng hiện: Đặt đơn bỏ trống yêu cầu là chuyện
 * cần biết, không phải chuyện bỏ qua. Trả về `requested: null` để chỗ hiển thị nói "chưa ghi".
 */
export function designRequestMismatch(
  requested: string | null | undefined,
  reported: string | null | undefined,
): DesignRequestMismatch | null {
  const r = typeof reported === "string" ? reported.trim() : "";
  if (r === "") return null;
  const q = typeof requested === "string" ? requested.trim() : "";
  if (q === r) return null;
  return { requested: q === "" ? null : q, reported: r };
}

/**
 * Câu chữ cho người đọc — một dòng, đủ để quyết định mà không phải mở gì thêm.
 *
 * KHÔNG nói "sai" hay "3D làm không đúng yêu cầu": phần lớn các ca là Đặt đơn phân loại lúc chưa
 * thấy sản phẩm, và NV 3D vừa làm đúng việc phải làm. Gọi nó là lỗi của ai thì lần sau không ai
 * báo nữa, và tính năng này tự vô hiệu hoá.
 */
export function designRequestMismatchLabel(m: DesignRequestMismatch): string {
  return `Yêu cầu: ${m.requested ?? "chưa ghi"} · 3D báo đã làm: ${m.reported}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Cụm `design` hiệu lực cho một MO — per-MO nếu có, ngược lại cụm dùng chung.
 *
 * Tách riêng vì đây mới là luật thật; các trường khác trong cụm (yeucauKyThuat, nhomSP3D…) nếu
 * mai cần đưa lên bảng thì dùng lại đúng hàm này, không viết lại phép chọn.
 */
export function effectiveDesignBlock(
  extraData: unknown,
  orderItemId: string | null | undefined,
): Record<string, unknown> | null {
  const root = asRecord(extraData);
  if (!root) return null;

  if (orderItemId) {
    const perItem = asRecord(root.perItem);
    const own = perItem ? asRecord(perItem[orderItemId]) : null;
    const ownDesign = own ? asRecord(own.design) : null;
    // CÓ cụm riêng thì dùng nó và DỪNG — không rơi về cụm chung. Xem chú thích đầu file.
    if (ownDesign) return ownDesign;
  }

  return asRecord(root.design);
}

/**
 * Giá trị "Yêu cầu thiết kế" để hiển thị — null khi chưa đặt.
 *
 * Trả null chứ không trả chuỗi rỗng: chỗ hiển thị cần phân biệt "chưa đặt" (hiện "—") với một
 * giá trị thật, và `"" || "—"` với `null ?? "—"` cho kết quả khác nhau ở chỗ gọi bất cẩn.
 * Chuỗi chỉ có khoảng trắng coi như chưa đặt.
 */
export function resolveDesignRequest(
  extraData: unknown,
  orderItemId: string | null | undefined,
): string | null {
  const block = effectiveDesignBlock(extraData, orderItemId);
  const raw = block?.yeucauThietKe;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * "Yêu cầu chi tiết KT" — bản diễn giải sản phẩm Order viết cho NV 3D.
 *
 * ⚠️ KHÔNG PHẢI `OrderItem.techNote`. Hai thứ khác nhau, và màn Việc thiết kế 3D từng hiện
 * NHẦM cái kia:
 *
 *   techNote       cột riêng của OrderItem · PTK/PSX điền ở tab Kỹ thuật · ghi chú nội bộ
 *   yeucauKyThuat  trong khối thiết kế JSON · ORDER điền khi giao việc · diễn giải cho NV 3D
 *
 * Nên NV 3D đọc được ghi chú kỹ thuật nội bộ, còn thứ Order thật sự viết để giải thích sản
 * phẩm thì họ không thấy — rồi hỏi lại qua chat, và câu trả lời không lưu ở đâu cả.
 *
 * Đi qua `effectiveDesignBlock` chứ KHÔNG tự tra: luật là "CẢ KHỐI per-MO, không có thì cả
 * khối của SO". Viết một phép tra riêng theo từng field thì một MO CÓ khối riêng nhưng BỎ
 * TRỐNG ô này sẽ rơi về giá trị của SO — tức hiện diễn giải của SẢN PHẨM KHÁC. Sai kiểu tệ
 * nhất: nội dung hợp lý nên không ai nghi.
 */
export function resolveTechDetailRequest(
  extraData: unknown,
  orderItemId: string | null | undefined,
): string | null {
  const raw = effectiveDesignBlock(extraData, orderItemId)?.yeucauKyThuat;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

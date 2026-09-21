// ─── Lượt giao việc MỒ CÔI: khối JSON đã bị xoá mà lượt vẫn sống ─────────────
//
// ⚠️ MODULE NÀY TỒN TẠI VÌ "XOÁ" HIỆN NAY KHÔNG XOÁ GÌ CẢ.
//
// Nút xoá khối NV 3D trong sidebar (`removeExtraDesigner`) chỉ bỏ khối khỏi mảng JSON. Dòng
// `Design3DAssignment` mà khối đó trỏ tới KHÔNG BỊ ĐỤNG TỚI: vẫn ASSIGNED, VẪN ĐƯỢC ĐẾM TRONG
// BÁO CÁO KPI, và nhân viên vẫn thấy việc đó trên màn hình của họ. Một lượt như vậy sống mãi.
//
// VÌ SAO PHẢI QUÉT RIÊNG, KHÔNG GHÉP VÀO VÒNG LẶP ĐỒNG BỘ: `syncDesign3DAssignments` chỉ đi qua
// những MO có ÍT NHẤT MỘT khối đủ 4 trường (`resolveDesign3DSyncTargets`), và trong vòng lặp còn
// `if (blocks.length === 0) continue`. Nên MO vừa bị xoá HẾT khối thì không phải "target" nào cả
// — thứ VẮNG MẶT là điểm mù cấu trúc của đường đồng bộ. Cùng lý do mà
// `carriedBlocksAwaitingAssign` cũng phải là một lượt quét riêng.
//
// VÌ SAO KHÔNG DÙNG readDesign3DBlocks: hàm đó TRẢ VỀ NULL cho khối chưa đủ 4 trường. Một khối
// đang được gõ dở (thiếu ô giờ) sẽ trông y như đã bị xoá — và tự huỷ lượt của một người đang
// làm việc thì tệ hơn nhiều so với lỗi đang có. Ở đây quét KHOAN DUNG: bất kỳ dấu vết nào của
// người đó hay của id lượt cũng đủ để coi là CÒN.
//
// File THUẦN: không prisma, không React.

/** Dấu vết của lượt giao việc còn sót trong JSON của MỘT MO — dù khối đủ hay chưa đủ trường. */
export type Design3DTraces = {
  /** `kpi3DAssignmentId` mà lần lưu trước đã ghi ngược vào khối. Liên kết TƯỜNG MINH. */
  assignmentIds: Set<string>;
  /** Tên NV 3D xuất hiện ở bất kỳ khối nào, đã chuẩn hoá. Lưới an toàn cho dữ liệu cũ chưa có id. */
  designerNames: Set<string>;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
/** So tên phải bỏ qua hoa/thường và khoảng trắng thừa — Order gõ tay, không chọn từ danh sách. */
export function normalizeDesignerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Mọi dấu vết giao việc 3D còn lại trong `extraData` của một MO.
 *
 * KHOAN DUNG CÓ CHỦ Ý: không đòi khối đủ 4 trường, không đòi có id. Mục đích ở đây ngược với
 * đường đồng bộ — không phải "khối này tạo được lượt chưa?" mà "người này còn được nhắc tới
 * không?". Nhầm theo hướng GIỮ LẠI thì chỉ còn một lượt cần dọn tay; nhầm theo hướng XOÁ là
 * đóng việc của người đang làm.
 */
export function readDesign3DTraces(
  extraData: Record<string, unknown> | null | undefined,
  orderItemId: string,
): Design3DTraces {
  const traces: Design3DTraces = { assignmentIds: new Set(), designerNames: new Set() };
  const extra = asRecord(extraData);
  if (!extra) return traces;

  const perItem = asRecord(extra.perItem);
  const itemData = perItem ? asRecord(perItem[orderItemId]) : null;
  if (!itemData) return traces;

  const addName = (raw: string) => {
    const n = normalizeDesignerName(raw);
    if (n) traces.designerNames.add(n);
  };

  // Khối gốc (slot 0): tên nằm ở `tho3d` cấp MO, hoặc `tho3d` gốc của cả đơn.
  const design = asRecord(itemData.design);
  if (design) {
    const id = asText(design.kpi3DAssignmentId);
    if (id) traces.assignmentIds.add(id);
    addName(asText(itemData.tho3d) || asText(extra.tho3d));
  }

  // Người thứ 2, 3… — mỗi phần tử tự mang tên của mình.
  const extras = Array.isArray(itemData.designers) ? itemData.designers : [];
  for (const entry of extras) {
    const raw = asRecord(entry);
    if (!raw) continue;
    const id = asText(raw.kpi3DAssignmentId);
    if (id) traces.assignmentIds.add(id);
    addName(asText(raw.tho3d));
  }

  return traces;
}

/** Lượt đang còn hiệu lực, ở mức thông tin vừa đủ để xét mồ côi. */
export type ActiveAssignmentForOrphanCheck = {
  id: string;
  designerName: string;
  /** Giờ đã đo được. Khác null nghĩa là ĐÃ CÓ CÔNG. */
  actualMinutes: number | null;
  completedAt: Date | null;
};

export type OrphanPlan = {
  /** Lượt tự đóng được: không còn dấu vết trong JSON VÀ chưa ghi nhận công nào. */
  toCancel: string[];
  /**
   * Lượt mồ côi nhưng ĐÃ CÓ CÔNG — CỐ Ý KHÔNG TỰ ĐỘNG ĐỤNG TỚI, chỉ cảnh báo.
   *
   * Đây là ranh giới quan trọng nhất của module. Tự huỷ một lượt đã có giờ là tự quyết định
   * chuyện LƯƠNG của người khác dựa trên suy đoán rằng khối JSON biến mất là do người dùng cố
   * ý. Nếu suy đoán đó sai (lỗi client, lưu chồng, đua ghi) thì hệ thống vừa xoá công của thợ mà
   * không ai bấm gì. Nên ca này đi ra CÂU CẢNH BÁO và chờ một hành động tường minh.
   */
  needsManualDecision: { id: string; designerName: string; minutes: number | null }[];
};

/**
 * Lượt nào đã mất khối JSON của nó?
 *
 * GIỮ LẠI nếu còn BẤT KỲ dấu vết nào — khớp id (tường minh) hoặc khớp tên (lưới cho dữ liệu cũ
 * chưa kịp mang id). Chỉ khi cả hai đều không thấy mới coi là mồ côi.
 */
export function planOrphanClosures(
  traces: Design3DTraces,
  active: readonly ActiveAssignmentForOrphanCheck[],
): OrphanPlan {
  const plan: OrphanPlan = { toCancel: [], needsManualDecision: [] };

  for (const row of active) {
    if (traces.assignmentIds.has(row.id)) continue;
    if (traces.designerNames.has(normalizeDesignerName(row.designerName))) continue;

    const hasWork = row.completedAt != null || row.actualMinutes != null;
    if (hasWork) {
      plan.needsManualDecision.push({ id: row.id, designerName: row.designerName, minutes: row.actualMinutes });
    } else {
      plan.toCancel.push(row.id);
    }
  }

  return plan;
}

/** Câu cảnh báo cho ca phải quyết định bằng tay. Nói rõ HỆ THỐNG KHÔNG TỰ LÀM GÌ. */
export function orphanNeedsDecisionWarning(
  moNumber: string | null,
  entry: { designerName: string; minutes: number | null },
): string {
  const hours = entry.minutes != null ? ` (đã ghi nhận ${(entry.minutes / 60).toFixed(1)} giờ)` : "";
  return (
    `MO ${moNumber ?? "(không rõ)"}: khối thiết kế của ${entry.designerName} đã bị xoá nhưng lượt giao việc` +
    `${hours} vẫn còn. Hệ thống KHÔNG tự huỷ vì việc này đụng tới KPI — hãy dùng "Đổi người" hoặc ` +
    `"Huỷ lượt" để ghi nhận rõ quyết định.`
  );
}

/**
 * MO nào ĐỦ ĐIỀU KIỆN để đối chiếu mồ côi?
 *
 * ⚠️ CỬA CHẶN QUAN TRỌNG NHẤT CỦA CẢ MODULE. Không được suy ra "người dùng đã xoá khối" từ việc
 * khối VẮNG MẶT trong payload, vì có đường lưu gửi payload KHÔNG HỀ chứa phần thiết kế:
 *
 *   tab Sản xuất gửi  perItem[id] = moFields  — có `tho3d` nhưng KHÔNG có `design`/`designers`.
 *
 * Với những lần lưu đó, "không thấy khối" nghĩa là "lần lưu này không nói gì về thiết kế", chứ
 * KHÔNG phải "thiết kế đã bị xoá". Đối chiếu theo payload đó sẽ huỷ sạch lượt của cả MO — một
 * người bấm lưu tab Sản xuất là mất KPI của thợ.
 *
 * Nên chỉ đối chiếu MO mà payload GỬI TỚI thật sự có nhắc tới phần thiết kế. Xoá người cuối cùng
 * vẫn qua được cửa này: client gửi `designers: []` — khoá CÓ MẶT, chỉ mảng là rỗng.
 *
 * Nhận `incomingExtraData` (payload thô của client), KHÔNG phải bản đã trộn với DB: bản đã trộn
 * luôn mang khối cũ, nên dùng nó thì cửa chặn này lúc nào cũng mở.
 */
export function itemsEligibleForOrphanCheck(
  incomingExtraData: Record<string, unknown> | null | undefined,
  validItemIds: readonly string[],
): string[] {
  const extra = asRecord(incomingExtraData);
  if (!extra) return [];

  // Payload cấp gốc (không lồng perItem) có nhắc thiết kế → xét mọi MO của đơn. Đây là đường
  // lưu cũ dùng chung cho cả SO, giữ lại để dữ liệu lịch sử vẫn được dọn.
  const rootMentions = "design" in extra || "designers" in extra || "tho3d" in extra;
  const perItem = asRecord(extra.perItem);
  if (!perItem) return rootMentions ? [...validItemIds] : [];

  const eligible = validItemIds.filter((id) => {
    const itemData = asRecord(perItem[id]);
    if (!itemData) return false;
    return "design" in itemData || "designers" in itemData;
  });

  // CỐ Ý KHÔNG tính `tho3d` một mình là đủ: moFields CÓ `tho3d`. Nếu tính nó thì mọi lần lưu tab
  // Sản xuất lại mở cửa trở lại và ta quay về đúng ca nguy hiểm ở trên.
  return eligible;
}

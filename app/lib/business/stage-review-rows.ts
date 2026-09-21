import { stagesInGroup, type StageCode } from "@/app/lib/business/production-stage";

// ─── Dựng dòng Đánh giá Khâu từ extraData ────────────────────────────────────
//
// VÌ SAO TÁCH KHỎI ROUTE: logic này trước nằm trong app/api/admin/stage-reviews/route.ts.
// Next.js chỉ cho route file export HTTP verb, nên hàm phải private → không test được. Cùng
// hoàn cảnh đó đã để lọt một bug thật ở route sản xuất (xem stage-audit.ts). Ba component
// client cũng đang phải `import type { ReviewRow } from ".../route"` — client kéo kiểu từ một
// API route là quan hệ ngược, nay cắt bỏ luôn.
//
// Module thuần: không prisma, không NextRequest — chỉ nhận dữ liệu đã nạp.

export type StageEntry = {
  stageStatus?: string;
  doneAt?: string | null;
  crafter?: string | null;
  durationNote?: string | null;
  coldworkQuality?: string | null;
  coldworkTimeOk?: string | null;
  coldworkReason?: string | null;
  bachSP?: string | null;
  gioKpi?: string | null;
  ghiChuNguoi?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  [key: string]: unknown;
};

export type ReviewRow = {
  pdId: string;
  itemId: string;
  recordIndex: number;   // GĐ2: chỉ số bản ghi thợ/lần trong records[]; -1 = dữ liệu cũ (scalar)
  orderId: string;
  orderNumber: string;
  moNumber: string | null;
  productName: string | null;
  /**
   * KHÂU GỐC của chính dòng này (NGUOI | TC_NGUOI | KHOA...), KHÔNG phải mã nhóm đang xem.
   * Đường ghi PATCH/PUT dùng đúng giá trị này để cập nhật về ô JSON ban đầu — nhờ vậy sửa
   * một dòng Khóa không lạc sang stages.NGUOI khi cả nhóm cùng hiển thị trên một bảng.
   */
  stageCode: string;
  /**
   * Dòng này đến từ khâu NGOÀI nhóm đang xem (thợ Nguội có làm ở Đúc, ĐBXM, QC...).
   *
   * Chỉ để GHI NHẬN công đã làm, KHÔNG đánh giá: các trường chất lượng/thời gian/bậc SP
   * không thuộc về khâu đó nên để trống và khoá sửa. Nếu cho sửa, người dùng sẽ vô tình ghi
   * chỉ tiêu của khâu Nguội đè lên bản ghi của một khâu hoàn toàn khác.
   */
  isOutsideGroup: boolean;
  doneAt: string;
  crafter: string | null;
  phan: string | null;
  durationNote: string | null;
  coldworkQuality: string | null;
  coldworkTimeOk: string | null;
  coldworkReason: string | null;
  bachSP: string | null;
  gioKpi: string | null;
  ghiChuNguoi: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;   // P3: tên người đã đánh giá bản ghi này
  // Order cha tạo qua webapp (createdById != null) hay import từ script (null)? Dùng để
  // quyết định hiện "_1" phiên bản ngầm định cho MO bare — xem order-helpers.ts.
  isFromWebapp: boolean;
};

export type ItemLite = {
  id: string; moNumber: string | null; productName: string | null; specifications: unknown;
};

export type PdLite = {
  id: string;
  extraData: unknown;
  order: { id: string; orderNumber: string | null; createdById: string | null; items: ItemLite[] };
};

/**
 * Tạo predicate "iso có thuộc tháng đang xem không" theo GIỜ VN (UTC+7).
 * doneAt lưu UTC; +7h rồi so tháng/năm để 01/06 00:00 VN (= 31/05 UTC) không rớt tháng trước.
 */
export function makeInViewMonth(
  year: number, month: number,
): (iso: string | null | undefined) => boolean {
  return (iso) => {
    if (!iso) return false;
    const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
    return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
  };
}

/** MO này có do webapp tạo không (quyết định hiển thị "_1" ngầm định). */
function itemIsFromWebapp(item: ItemLite | undefined, order: PdLite["order"]): boolean {
  const specs = (item?.specifications as Record<string, unknown> | null) ?? null;
  return specs?.createdViaWebapp === true || order.createdById != null;
}

/** Dựng 1 dòng đánh giá từ 1 RECORD (khâu nhiều thợ/nhiều lần). */
function buildRowFromRecord(
  pd: PdLite, itemId: string, item: ItemLite | undefined, stageCode: string,
  rec: Record<string, unknown>, recordIndex: number, doneAt: string,
): ReviewRow {
  return {
    pdId: pd.id, itemId, recordIndex, orderId: pd.order.id,
    orderNumber: pd.order.orderNumber ?? "",
    moNumber: item?.moNumber ?? null,
    productName: item?.productName ?? null,
    stageCode, doneAt,
    crafter:         (rec.crafter as string) ?? null,
    phan:            (rec.phan as string) ?? null,
    durationNote:    (rec.gioThucTe as string) ?? null,
    coldworkQuality: (rec.ketQua as string) ?? null,
    coldworkTimeOk:  (rec.thoiGianOk as string) ?? null,
    coldworkReason:  (rec.lyDo as string) ?? null,
    bachSP:          (rec.bachSP as string) ?? null,
    gioKpi:          (rec.gioKpi as string) ?? null,
    ghiChuNguoi:     (rec.ghiChu as string) ?? null,
    reviewedAt:      (rec.reviewedAt as string) ?? null,
    reviewedBy:      (rec.reviewedBy as string) ?? null,
    isFromWebapp:    itemIsFromWebapp(item, pd.order),
    isOutsideGroup:  false,
  };
}

/** Dựng 1 dòng đánh giá từ dữ liệu SCALAR (khâu chưa tách records[], vd KHOA). */
function buildRowFromScalar(
  pd: PdLite, itemId: string, item: ItemLite | undefined, stageCode: string, entry: StageEntry,
): ReviewRow {
  return {
    pdId: pd.id, itemId, recordIndex: -1, orderId: pd.order.id,
    orderNumber: pd.order.orderNumber ?? "",
    moNumber: item?.moNumber ?? null,
    productName: item?.productName ?? null,
    stageCode,
    doneAt:          entry.doneAt ?? "",
    crafter:         entry.crafter ?? null,
    phan:            null,
    durationNote:    entry.durationNote ?? null,
    coldworkQuality: entry.coldworkQuality ?? null,
    coldworkTimeOk:  entry.coldworkTimeOk ?? null,
    coldworkReason:  entry.coldworkReason ?? null,
    bachSP:          entry.bachSP ?? null,
    gioKpi:          entry.gioKpi ?? null,
    ghiChuNguoi:     entry.ghiChuNguoi ?? null,
    reviewedAt:      entry.reviewedAt ?? null,
    reviewedBy:      entry.reviewedBy ?? null,
    isFromWebapp:    itemIsFromWebapp(item, pd.order),
    isOutsideGroup:  false,
  };
}

/**
 * Mã khâu cần quét cho một mã NHÓM.
 *
 * Nguội → [NGUOI, TC_NGUOI, KHOA]. Mã lạ hoặc khâu không thuộc nhóm nào → trả chính nó, để
 * hành vi của mọi khâu ngoài nhóm không đổi thay vì lặng lẽ ra danh sách rỗng.
 */
export function resolveStageCodes(groupCode: string): string[] {
  const codes = stagesInGroup(groupCode as StageCode);
  return codes.length > 0 ? codes : [groupCode];
}

/**
 * Từ 1 ProductionDetail → các dòng đánh giá của CÁC khâu trong tháng đang xem.
 *
 * Nhận danh sách mã khâu chứ không phải một mã, vì một "khâu" trên màn đánh giá có thể là cả
 * một nhóm. Trước đây chỉ quét đúng một mã nên 25 công việc Khóa và 5 công việc TC Nguội
 * (số liệu production) không bao giờ hiện ra — vào hệ thống rồi nằm im, không màn nào thấy.
 */
export function extractRowsFromPd(
  pd: PdLite, stageCodes: string[], inView: (iso: string | null | undefined) => boolean,
): ReviewRow[] {
  const extra = pd.extraData as Record<string, unknown> | null;
  const perItem = (extra?.perItem as Record<string, unknown> | null) ?? null;
  if (!perItem || typeof perItem !== "object") return [];

  const itemMap = new Map(pd.order.items.map((i) => [i.id, i]));
  const out: ReviewRow[] = [];

  for (const [itemId, itemData] of Object.entries(perItem)) {
    const stages = (itemData as Record<string, unknown> | null)?.stages as Record<string, unknown> | null;
    if (!stages) continue;
    const item = itemMap.get(itemId);

    for (const stageCode of stageCodes) {
      const entry = stages[stageCode] as StageEntry | null;
      if (!entry) continue;
      const recs = Array.isArray((entry as { records?: unknown }).records)
        ? ((entry as { records: Record<string, unknown>[] }).records)
        : null;

      if (recs && recs.length) {
        // Mỗi record có NGÀY HT trong tháng = 1 dòng (không phụ thuộc trạng thái cả khâu).
        recs.forEach((rec, ri) => {
          const rDone = (rec.doneAt as string) ?? entry.doneAt ?? null;
          if (inView(rDone)) out.push(buildRowFromRecord(pd, itemId, item, stageCode, rec, ri, rDone as string));
        });
      } else if (entry.stageStatus === "done" && entry.doneAt && inView(entry.doneAt)) {
        // KHOA vẫn ở dạng scalar (chưa chuyển sang records[]) nên nhánh này là đường sống duy
        // nhất của nó — bỏ nhánh này là mất trắng dữ liệu Khóa khỏi màn đánh giá.
        out.push(buildRowFromScalar(pd, itemId, item, stageCode, entry));
      }
    }
  }
  return out;
}

/** Gom nhiều ProductionDetail → danh sách dòng đã sắp xếp giảm dần theo ngày hoàn tất. */
export function buildReviewRows(
  pds: PdLite[], stageCodes: string[], inView: (iso: string | null | undefined) => boolean,
): ReviewRow[] {
  return pds
    .flatMap((pd) => extractRowsFromPd(pd, stageCodes, inView))
    .sort((a, b) => (b.doneAt > a.doneAt ? 1 : -1));
}

// ─── Công của thợ trong nhóm tại các khâu NGOÀI nhóm ─────────────────────────
//
// Nghiệp vụ: thợ Nguội thỉnh thoảng làm giúp khâu khác (đo được trên production: Đúc 3 thợ,
// ĐBXM 2, QC 1, Móc 1, TC Dây 1). Công đó vẫn là công của họ nên phải NHÌN THẤY khi đánh giá,
// nhưng KHÔNG đánh giá theo chỉ tiêu Nguội — chỉ ghi nhận Ngày HT và Thời gian HT.

/**
 * Ai là "thợ của nhóm" — SUY RA TỪ DỮ LIỆU: có ít nhất một ghi nhận ở khâu trong nhóm.
 *
 * Cố ý KHÔNG dùng cột `Craftsman.khau`. Đối chiếu trên production: cách suy ra tìm được 15
 * thợ, còn `khau = "Nguội"` chỉ 9 — bỏ sót đúng những người làm Nguội thật nhưng chưa được
 * gắn nhãn (6/17 thợ đang để trống ô này). Suy từ dữ liệu thì tự đúng, không cần ai đi điền
 * và không âm thầm bỏ sót người khi có thợ mới. Cùng nguyên tắc với deriveReviewStatus /
 * deriveAcknowledgedAt ở kpi-3d/review.ts — suy ra thay vì bắt dữ liệu phải có sẵn.
 */
export function craftersOfGroup(rows: ReviewRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    const name = r.crafter?.trim();
    if (name) out.add(name);
  }
  return out;
}

/** Dòng CHỈ GHI NHẬN cho khâu ngoài nhóm — mọi ô đánh giá để trống và khoá. */
function buildOutsideRow(
  pd: PdLite, itemId: string, item: ItemLite | undefined, stageCode: string,
  crafter: string, recordIndex: number, doneAt: string, gioThucTe: string | null,
): ReviewRow {
  return {
    pdId: pd.id, itemId, recordIndex, orderId: pd.order.id,
    orderNumber: pd.order.orderNumber ?? "",
    moNumber: item?.moNumber ?? null,
    productName: item?.productName ?? null,
    stageCode, doneAt, crafter,
    phan: null,
    durationNote: gioThucTe,          // Thời gian HT — một trong hai thứ duy nhất cần ghi nhận
    coldworkQuality: null, coldworkTimeOk: null, coldworkReason: null,
    bachSP: null, gioKpi: null, ghiChuNguoi: null,
    reviewedAt: null, reviewedBy: null,
    isFromWebapp: itemIsFromWebapp(item, pd.order),
    isOutsideGroup: true,
  };
}

/**
 * Quét các khâu NGOÀI `groupCodes` để tìm công của những thợ trong `groupCrafters`.
 *
 * Khớp thợ bằng TÊN vì `extraData` chỉ lưu tên, không lưu id. Đây là điểm yếu đã biết của
 * mô hình dữ liệu hiện tại (thấy rõ trên production: "Phạm Hiếu May" và "Phạm Hiếu Mây" là
 * một người bị tách đôi vì thiếu dấu). Ở đây so khớp chính xác sau khi trim — cố ý KHÔNG
 * chuẩn hoá dấu, vì đoán mò hai tên gần giống là một người còn nguy hiểm hơn bỏ sót:
 * bỏ sót thì thiếu một dòng, gộp nhầm thì cộng công của người này cho người khác.
 */
export function buildOutsideGroupRows(
  pds: PdLite[],
  groupCodes: string[],
  groupCrafters: Set<string>,
  inView: (iso: string | null | undefined) => boolean,
): ReviewRow[] {
  if (groupCrafters.size === 0) return [];
  const inGroup = new Set(groupCodes);
  const out: ReviewRow[] = [];

  for (const pd of pds) {
    const extra = pd.extraData as Record<string, unknown> | null;
    const perItem = (extra?.perItem as Record<string, unknown> | null) ?? null;
    if (!perItem || typeof perItem !== "object") continue;
    const itemMap = new Map(pd.order.items.map((i) => [i.id, i]));

    for (const [itemId, itemData] of Object.entries(perItem)) {
      const stages = (itemData as Record<string, unknown> | null)?.stages as Record<string, unknown> | null;
      if (!stages) continue;
      const item = itemMap.get(itemId);

      for (const [stageCode, rawEntry] of Object.entries(stages)) {
        if (inGroup.has(stageCode)) continue;   // khâu trong nhóm đã có dòng đầy đủ rồi
        const entry = rawEntry as StageEntry | null;
        if (!entry) continue;

        const recs = Array.isArray((entry as { records?: unknown }).records)
          ? ((entry as { records: Record<string, unknown>[] }).records)
          : null;

        if (recs && recs.length) {
          recs.forEach((rec, ri) => {
            const name = (rec.crafter as string | null)?.trim();
            if (!name || !groupCrafters.has(name)) return;
            const rDone = (rec.doneAt as string) ?? entry.doneAt ?? null;
            if (!inView(rDone)) return;
            out.push(buildOutsideRow(
              pd, itemId, item, stageCode, name, ri, rDone as string,
              (rec.gioThucTe as string | null) ?? null,
            ));
          });
        } else {
          const name = entry.crafter?.trim();
          if (!name || !groupCrafters.has(name)) continue;
          if (entry.stageStatus !== "done" || !entry.doneAt || !inView(entry.doneAt)) continue;
          out.push(buildOutsideRow(
            pd, itemId, item, stageCode, name, -1, entry.doneAt, entry.durationNote ?? null,
          ));
        }
      }
    }
  }
  return out.sort((a, b) => (b.doneAt > a.doneAt ? 1 : -1));
}

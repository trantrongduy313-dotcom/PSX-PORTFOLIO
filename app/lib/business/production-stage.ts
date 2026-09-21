/**
 * Single source of truth for production stage progression logic.
 * Previously duplicated across app/api/orders/route.ts and order-detail-panel.tsx.
 */

export const STAGE_ORDER = [
  "RESIN", "CHO_DX_NL", "CHO_NL", "DUC", "NGUOI", "TC_DAY", "TC_NGUOI",
  "KHOA", "HOT", "MOC", "DBXM", "QC", "DUYET_NK",
] as const;

export type StageCode = (typeof STAGE_ORDER)[number];

// ─── Thuộc tính của khâu — NGUỒN KHAI BÁO DUY NHẤT ───────────────────────────
//
// VÌ SAO CÓ FILE NÀY: khái niệm "khâu nào lưu nhiều thợ ở records[]" từng được viết lại ở
// nhiều nơi với các tập thành viên KHÁC NHAU. Hậu quả đã xảy ra thật: STAGE_MULTI của
// app/api/orders/[id]/production/route.ts thiếu TC_NGUOI, nên mọi sửa đổi records[] của
// khâu TC Nguội KHÔNG BAO GIỜ được ghi vào Lịch sử thay đổi — sửa gì, ai sửa đều mất dấu.
// Cùng lớp lỗi đó khiến TC_NGUOI vắng mặt khỏi cả báo cáo KPI lẫn màn Đánh giá Khâu.
//
// PHẠM VI CÓ CHỦ Ý: bảng này CHỈ khai hai thuộc tính đã kiểm chứng trên dữ liệu thật
// (987 ProductionDetail, production). KHÔNG gom vội các điều kiện `stage.code === "..."`
// khác đang nằm trong order-detail-panel.tsx — rà lại thì chúng là những khái niệm KHÁC
// (khâu nào có cột "Kết quả", khâu nào hiện dòng thời gian), chỉ TRÙNG HÌNH DẠNG chứ không
// trùng nghĩa. Gom chung sẽ tạo bug mới. Khi nào một khái niệm được chứng minh là dùng
// chung thì thêm cột mới vào đây, đừng khai mảng rời ở nơi dùng.

/**
 * Nhóm khâu dùng khi TỔNG HỢP (KPI, Đánh giá Khâu) — khác với từng khâu riêng lẻ khi
 * theo dõi tiến độ.
 *
 * Nghiệp vụ: "Khâu Nguội" của xưởng gồm ba khâu con NGUOI + TC_NGUOI + KHOA; thợ Nguội làm
 * cả ba, nên KPI và đánh giá phải cộng chung. Trước đây quy tắc này chỉ tồn tại trong đầu
 * người dùng, chưa từng được code hoá → KHOA (25 công việc thật) và TC_NGUOI (5) bị bỏ sót
 * hoàn toàn khỏi báo cáo.
 *
 * Khâu không thuộc nhóm nào thì tự nó là nhóm của nó (identity) — cố ý không tạo nhóm
 * "OTHER" giả, vì gộp những khâu không liên quan lại sẽ ngụ ý một quan hệ không có thật.
 */
export const STAGE_GROUP: Record<StageCode, StageCode> = {
  RESIN:      "RESIN",
  CHO_DX_NL:  "CHO_DX_NL",
  CHO_NL:     "CHO_NL",
  DUC:        "DUC",
  NGUOI:      "NGUOI",
  TC_DAY:     "TC_DAY",
  TC_NGUOI:   "NGUOI",   // Thủ công nguội → thuộc nhóm Nguội
  KHOA:       "NGUOI",   // Khóa           → thuộc nhóm Nguội
  HOT:        "HOT",
  MOC:        "MOC",
  DBXM:       "DBXM",
  QC:         "QC",
  DUYET_NK:   "DUYET_NK",
};

/** Các mã khâu thuộc một nhóm, giữ đúng thứ tự sản xuất của STAGE_ORDER. */
export function stagesInGroup(group: StageCode): StageCode[] {
  return STAGE_ORDER.filter((code) => STAGE_GROUP[code] === group);
}

/**
 * Khâu được XỬ LÝ theo dạng nhiều thợ / nhiều lần (`records[]`) thay vì các trường scalar.
 *
 * Đây là HỢP ĐỒNG HÀNH VI, không phải mô tả dữ liệu — chỉ liệt kê khâu mà code thực sự
 * đang xử lý theo dạng records[]. TC_NGUOI được thêm vào để vá bug audit đã nêu ở đầu khối
 * (client vẫn luôn ghi records[] cho nó; chỉ riêng server bỏ sót).
 *
 * ⚠ ĐÃ QUAN SÁT NHƯNG CỐ Ý KHÔNG ĐỘNG TỚI — hai chỗ lệch giữa dữ liệu và code, cần điều tra
 * riêng trước khi sửa, vì sửa mù sẽ đổi hành vi màn đang chạy ổn:
 *   • TC_DAY có 280 dòng records[] trong production nhưng KHÔNG nơi nào coi nó là nhiều thợ.
 *   • order-helpers.ts (nơi dựng StageEntry.records) loại RESIN khỏi danh sách, dù RESIN có
 *     1.145 dòng records[] thật.
 * Ghi lại ở đây thay vì im lặng, để lần sau không ai phải tự phát hiện lại từ đầu.
 */
// Khai kiểu phần tử là StageCode (tsc chặn gõ sai mã khâu ngay khi soạn) nhưng công bố ra
// ngoài dưới dạng ReadonlySet<string>, để nơi gọi tra được bằng chuỗi thô đọc từ JSON mà
// không phải ép kiểu — chính chỗ ép kiểu bừa là nơi mã khâu sai lọt qua mà không ai biết.
export const STAGE_HAS_RECORDS: ReadonlySet<string> = new Set<StageCode>([
  "NGUOI", "TC_NGUOI", "HOT", "DUC", "RESIN",
]);

/**
 * Nhãn hiển thị của từng khâu — NGUỒN TÊN DUY NHẤT.
 *
 * Export ra vì bảng thuật ngữ của trợ lý (business/ai/glossary.ts) đọc từ đây thay vì chép lại.
 * Chép lại là hai nơi giữ cùng một sự thật: đổi tên khâu trong code mà trợ lý vẫn dạy tên cũ,
 * và không có gì báo.
 */
export const STAGE_LABEL: Record<StageCode, string> = {
  RESIN:      "[1] Resin",
  CHO_DX_NL:  "[2] Chờ ĐX NL",
  CHO_NL:     "[3] Chờ NL",
  DUC:        "[4] Đúc",
  NGUOI:      "[5] Nguội",
  TC_DAY:     "[6] TC Dây",
  TC_NGUOI:   "[7] TC Nguội",
  KHOA:       "[8] Khóa",
  HOT:        "[9] Hột",
  MOC:        "[10] Móc máy",
  DBXM:       "[11] ĐBXM",
  QC:         "[12] QC",
  DUYET_NK:   "[13] Chờ duyệt NK",
};

// V2 legacy — stages that have dedicated DB timestamp columns
const V2_STAGE_ORDER = ["RESIN", "DUC", "NGUOI", "TC_DAY", "HOT", "MOC", "DBXM", "QC"] as const;

// Core per-item algorithm — operates on a single item's stages record.
// Returns all three congDoan fields so callers don't need to run two passes.
export function computeFromItemStages(stages: Record<string, { stageStatus?: string }>): {
  congDoan: string | null;
  congDoanCode: string | null;
  congDoanStatus: string | null;
} {
  let firstActiveLabel: string | null = null;
  let firstActiveCode: string | null = null;
  let firstActiveStatus: string | null = null;
  let lastDoneIdx = -1;

  for (let i = 0; i < STAGE_ORDER.length; i++) {
    const code = STAGE_ORDER[i];
    const s = stages[code];
    if (!s) continue;
    const ss = s.stageStatus;
    if ((ss === "doing" || ss === "qc" || ss === "hold") && !firstActiveCode) {
      firstActiveLabel = STAGE_LABEL[code];
      firstActiveCode = code;
      firstActiveStatus = ss;
    }
    if (ss === "done" && i > lastDoneIdx) lastDoneIdx = i;
  }

  if (firstActiveCode) {
    return { congDoan: firstActiveLabel, congDoanCode: firstActiveCode, congDoanStatus: firstActiveStatus };
  }
  if (lastDoneIdx >= 0) {
    // Skip cancelled stages after the last done stage to find the real next pending stage
    for (let nextIdx = lastDoneIdx + 1; nextIdx < STAGE_ORDER.length; nextIdx++) {
      const nextCode = STAGE_ORDER[nextIdx];
      const nextStatus = stages[nextCode]?.stageStatus;
      if (nextStatus === "cancelled") continue;
      return { congDoan: STAGE_LABEL[nextCode], congDoanCode: nextCode, congDoanStatus: nextStatus ?? "pending" };
    }
    return { congDoan: null, congDoanCode: null, congDoanStatus: null };
  }
  return { congDoan: null, congDoanCode: null, congDoanStatus: null };
}

// Per-item congDoan — only considers THIS item's stages, not siblings in the same SO.
// Falls back to SO-level only for V2 legacy data (no perItem entries at all).
export function computeCongDoanForItem(
  pd: Record<string, unknown> | null,
  itemId: string,
): { congDoan: string | null; congDoanCode: string | null; congDoanStatus: string | null } {
  if (!pd) return { congDoan: null, congDoanCode: null, congDoanStatus: null };
  const extra = (pd.extraData as Record<string, unknown>) ?? {};
  const perItem = (extra.perItem as Record<string, unknown>) ?? {};

  // V2 legacy: no per-item entries → SO-level fallback (all MOs were one entity in V2)
  if (Object.keys(perItem).length === 0) {
    const cdStatus = computeCongDoanStatus(pd);
    return {
      congDoan: computeCongDoan(pd),
      congDoanCode: cdStatus?.code ?? null,
      congDoanStatus: cdStatus?.status ?? null,
    };
  }

  // V3: look only at this specific item's stages
  const itemData = (perItem[itemId] as Record<string, unknown>) ?? {};
  const stages = (itemData.stages as Record<string, { stageStatus?: string }>) ?? {};
  return computeFromItemStages(stages);
}

// V2 ref: CONG_DOAN_HIEN_TAI col 38
// Returns the label of the current/next active stage from raw ProductionDetail data.
// Priority: doing/qc/hold > next-after-last-done > V2 shared column fallback.
export function computeCongDoan(pd: Record<string, unknown> | null): string | null {
  if (!pd) return null;

  const extra = (pd.extraData as Record<string, unknown>) ?? {};
  const perItem = (extra.perItem as Record<string, unknown>) ?? {};
  const itemIds = Object.keys(perItem);

  if (itemIds.length > 0) {
    let firstActive: string | null = null;
    let lastDoneIdx = -1;
    for (const itemId of itemIds) {
      const itemData = (perItem[itemId] as Record<string, unknown>) ?? {};
      const stages = (itemData.stages as Record<string, { stageStatus?: string }>) ?? {};
      for (let i = 0; i < STAGE_ORDER.length; i++) {
        const code = STAGE_ORDER[i];
        const s = stages[code];
        if (!s) continue;
        const ss = s.stageStatus;
        if ((ss === "doing" || ss === "qc" || ss === "hold") && !firstActive) firstActive = STAGE_LABEL[code];
        if (ss === "done" && i > lastDoneIdx) lastDoneIdx = i;
      }
    }
    if (firstActive) return firstActive;
    if (lastDoneIdx >= 0) {
      // Skip stages that are cancelled across ALL items — find the real next pending stage
      for (let nextIdx = lastDoneIdx + 1; nextIdx < STAGE_ORDER.length; nextIdx++) {
        const nextCode = STAGE_ORDER[nextIdx];
        const allCancelled = itemIds.every(id => {
          const st = ((perItem[id] as Record<string, unknown>).stages as Record<string, { stageStatus?: string }> | undefined)?.[nextCode];
          return st?.stageStatus === "cancelled";
        });
        if (allCancelled) continue;
        return STAGE_LABEL[nextCode];
      }
      return null;
    }
    return null;
  }

  // V2 fallback: shared timestamp columns
  const shared: [string, unknown, unknown][] = [
    ["[1] Resin",    pd.resinStartAt,     pd.resinDoneAt],
    ["[2] Đúc",      pd.castingStartAt,   pd.castingDoneAt],
    ["[3] Thủ công", pd.handcraftStartAt, pd.handcraftDoneAt],
    ["[4] Nguội",    pd.coldworkStartAt,  pd.coldworkDoneAt],
    ["[5] Hột",      pd.settingStartAt,   pd.settingDoneAt],
    ["[6] Móc máy",  pd.machineStartAt,   pd.machineDoneAt],
    ["[7] ĐBXM",     pd.platingStartAt,   pd.platingDoneAt],
    ["QC",           pd.qcStartAt,        pd.qcDoneAt],
  ];
  for (let i = shared.length - 1; i >= 0; i--) {
    if (shared[i][1] && !shared[i][2]) return shared[i][0];
  }
  for (let i = shared.length - 1; i >= 0; i--) {
    if (shared[i][2]) return shared[i][0];
  }
  return null;
}

// Returns { code, status } of the currently active stage — companion to computeCongDoan.
export function computeCongDoanStatus(pd: Record<string, unknown> | null): { code: string; status: string } | null {
  if (!pd) return null;

  const extra = (pd.extraData as Record<string, unknown>) ?? {};
  const perItem = (extra.perItem as Record<string, unknown>) ?? {};
  const itemIds = Object.keys(perItem);

  if (itemIds.length > 0) {
    let firstActiveCode: string | null = null;
    let firstActiveStatus: string | null = null;
    let lastDoneIdx = -1;

    for (const itemId of itemIds) {
      const itemData = (perItem[itemId] as Record<string, unknown>) ?? {};
      const stages = (itemData.stages as Record<string, { stageStatus?: string }>) ?? {};
      for (let i = 0; i < STAGE_ORDER.length; i++) {
        const code = STAGE_ORDER[i];
        const s = stages[code];
        if (!s) continue;
        const ss = s.stageStatus;
        if ((ss === "doing" || ss === "qc" || ss === "hold") && !firstActiveCode) {
          firstActiveCode = code;
          firstActiveStatus = ss;
        }
        if (ss === "done" && i > lastDoneIdx) lastDoneIdx = i;
      }
    }

    if (firstActiveCode && firstActiveStatus) return { code: firstActiveCode, status: firstActiveStatus };
    if (lastDoneIdx >= 0) {
      // Skip stages that are cancelled across ALL items — find the real next pending stage
      for (let nextIdx = lastDoneIdx + 1; nextIdx < STAGE_ORDER.length; nextIdx++) {
        const nextCode = STAGE_ORDER[nextIdx];
        const allCancelled = itemIds.every(id => {
          const st = ((perItem[id] as Record<string, unknown>).stages as Record<string, { stageStatus?: string }> | undefined)?.[nextCode];
          return st?.stageStatus === "cancelled";
        });
        if (allCancelled) continue;
        return { code: nextCode, status: "pending" };
      }
      return null;
    }
    return null;
  }

  // V2 fallback: shared timestamp columns
  const V2: Array<[string, unknown, unknown]> = [
    ["RESIN",  pd.resinStartAt,     pd.resinDoneAt],
    ["DUC",    pd.castingStartAt,   pd.castingDoneAt],
    ["TC_DAY", pd.handcraftStartAt, pd.handcraftDoneAt],
    ["NGUOI",  pd.coldworkStartAt,  pd.coldworkDoneAt],
    ["HOT",    pd.settingStartAt,   pd.settingDoneAt],
    ["MOC",    pd.machineStartAt,   pd.machineDoneAt],
    ["DBXM",   pd.platingStartAt,   pd.platingDoneAt],
    ["QC",     pd.qcStartAt,        pd.qcDoneAt],
  ];
  for (let i = V2.length - 1; i >= 0; i--) {
    if (V2[i][1] && !V2[i][2]) return { code: V2[i][0], status: "doing" };
  }
  for (let i = V2.length - 1; i >= 0; i--) {
    if (V2[i][2]) {
      const nextIdx = i + 1;
      if (nextIdx < V2.length) return { code: V2[nextIdx][0], status: "pending" };
    }
  }
  return null;
}

// Per-item version of orderMatchesStageFilter — checks a single MO's stages record.
// Used when stage filter is active to show only the specific MOs that match,
// instead of all MOs in an SO when any one of them matches.
export function itemMatchesStageFilter(
  stages: Record<string, { stageStatus?: string }>,
  orderStatus: string,
  filterKey: string,
): boolean {
  if (filterKey === "COMPLETED") return orderStatus === "COMPLETED";
  if (filterKey === "CANCELLED") return orderStatus === "CANCELLED";
  if (filterKey === "SUSPENDED") {
    if (orderStatus === "SUSPENDED") return true;
    // Stage-level hold: any stage paused counts as tạm ngưng
    return Object.values(stages).some(s => s.stageStatus === "hold");
  }

  const colonIdx = filterKey.lastIndexOf(":");
  if (colonIdx < 0) return false;
  const code = filterKey.slice(0, colonIdx);
  const targetStatus = filterKey.slice(colonIdx + 1);
  const isActive = targetStatus === "active";

  const ss = stages[code]?.stageStatus;

  if ((ss === "doing" || ss === "qc" || ss === "hold") && (isActive || ss === targetStatus)) return true;
  if ((ss === "done" || ss === "cancelled") && !isActive && ss === targetStatus) return true;

  if ((targetStatus === "pending" || isActive) && (!ss || ss === "pending")) {
    const firstNonFinished = STAGE_ORDER.find(c => {
      const st = stages[c];
      return !st?.stageStatus || (st.stageStatus !== "done" && st.stageStatus !== "cancelled");
    });
    if (firstNonFinished === code) return true;
  }

  return false;
}

// Check if an order's production stage matches a given stageFilter key.
// filterKey formats:
//   "CODE:doing" | "CODE:qc" | "CODE:pending" | "CODE:hold" — exact substatus
//   "CODE:active"                    — matches pending|doing|qc|hold (any active state)
//   "COMPLETED" | "CANCELLED" | "SUSPENDED"    — order-level status
//   "HOLD:CHO_DX_NL" | "HOLD:CHO_NL"           — order-level suspended with holdReason
export function orderMatchesStageFilter(
  pd: Record<string, unknown> | null,
  orderStatus: string,
  filterKey: string,
): boolean {
  if (filterKey === "COMPLETED") return orderStatus === "COMPLETED";
  if (filterKey === "CANCELLED") return orderStatus === "CANCELLED";
  if (filterKey === "SUSPENDED") {
    if (orderStatus === "SUSPENDED") return true;
    // Also match orders where any MO has a per-stage hold (Tạm ngưng tại khâu)
    if (!pd) return false;
    const extra = (pd.extraData as Record<string, unknown>) ?? {};
    const perItem = (extra.perItem as Record<string, unknown>) ?? {};
    return Object.values(perItem).some((itemData) => {
      const stages = ((itemData as Record<string, unknown>).stages as Record<string, { stageStatus?: string }>) ?? {};
      return Object.values(stages).some(s => s.stageStatus === "hold");
    });
  }
  if (!pd) return false;

  const colonIdx = filterKey.lastIndexOf(":");
  if (colonIdx < 0) return false;
  const code = filterKey.slice(0, colonIdx);
  const targetStatus = filterKey.slice(colonIdx + 1);
  const isActive = targetStatus === "active";

  const extra = (pd.extraData as Record<string, unknown>) ?? {};
  const perItem = (extra.perItem as Record<string, unknown>) ?? {};
  const itemIds = Object.keys(perItem);

  // V3 per-item path
  if (itemIds.length > 0) {
    for (const itemId of itemIds) {
      const itemData = (perItem[itemId] as Record<string, unknown>) ?? {};
      const stages = (itemData.stages as Record<string, { stageStatus?: string }>) ?? {};
      const ss = stages[code]?.stageStatus;

      // Active states (doing/qc/hold): no position check needed
      if ((ss === "doing" || ss === "qc" || ss === "hold") && (isActive || ss === targetStatus)) return true;

      // Terminal states: only match explicit request
      if ((ss === "done" || ss === "cancelled") && !isActive && ss === targetStatus) return true;

      // Pending: CODE must be the first non-finished stage to prevent DUC:pending matching
      // when RESIN is still in progress.
      if ((targetStatus === "pending" || isActive) && (!ss || ss === "pending")) {
        const firstNonFinished = STAGE_ORDER.find(c => {
          const st = stages[c] as { stageStatus?: string } | undefined;
          return !st?.stageStatus || (st.stageStatus !== "done" && st.stageStatus !== "cancelled");
        });
        if (firstNonFinished === code) return true;
      }
    }
    return false;
  }

  // V2 fallback: shared DB columns
  const DB_MAP: Record<string, [unknown, unknown]> = {
    RESIN:  [pd.resinStartAt,     pd.resinDoneAt],
    DUC:    [pd.castingStartAt,   pd.castingDoneAt],
    NGUOI:  [pd.coldworkStartAt,  pd.coldworkDoneAt],
    TC_DAY: [pd.handcraftStartAt, pd.handcraftDoneAt],
    HOT:    [pd.settingStartAt,   pd.settingDoneAt],
    MOC:    [pd.machineStartAt,   pd.machineDoneAt],
    DBXM:   [pd.platingStartAt,   pd.platingDoneAt],
    QC:     [pd.qcStartAt,        pd.qcDoneAt],
  };
  const pair = DB_MAP[code];
  if (!pair) return false;
  const [start, done] = pair;
  if (isActive || targetStatus === "doing") return !!(start && !done);
  if (targetStatus === "pending") {
    if (start) return false;
    const firstNotDone = V2_STAGE_ORDER.find(c => !DB_MAP[c]?.[1]);
    return firstNotDone === code;
  }
  return false;
}

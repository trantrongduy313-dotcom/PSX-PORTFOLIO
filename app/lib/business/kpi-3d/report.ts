import { resolveActualMinutes } from "@/app/lib/business/kpi-3d/actual-minutes";
import { accrueMinutesByMonth } from "@/app/lib/business/kpi-3d/hours-ledger";
import { toVnYmd } from "@/app/lib/utils/vn-date";

// ─── Tổng hợp báo cáo KPI 3D từ HAI nguồn dữ liệu ────────────────────────────
//
// VÌ SAO CẦN FILE NÀY: báo cáo trước đây đọc DUY NHẤT từ JSON cũ
// (extraData.perItem[].design). Từ khi có luồng giao việc mới, giờ hoàn tất và kết quả
// Đúng/Trễ hạn được ghi vào bảng Design3DAssignment và KHÔNG đồng bộ ngược về JSON —
// nên NV 3D bấm "Đã gửi kết quả" thì báo cáo không thấy, đơn nằm mãi ở "Tồn đơn".
//
// Quy tắc gộp: MO nào ĐÃ CÓ assignment thì assignment là nguồn chuẩn; MO cũ chưa có
// assignment vẫn đọc JSON như trước. Nhờ vậy không phải backfill dữ liệu lịch sử.
//
// Hàm thuần (không import prisma) để test được không cần DB.

/** Một MO trong kỳ báo cáo, đã quy về cùng một khuôn bất kể lấy từ nguồn nào. */
export type Kpi3DRecord = {
  /** Khóa gộp: orderItemId, hoặc "<orderId>:root" cho dữ liệu cũ chưa tách theo MO. */
  key: string;
  designerName: string;
  /** "YYYY-MM-DD" giờ VN — null nếu chưa giao. */
  assignedYmd: string | null;
  completedYmd: string | null;
  /** null khi chưa hoàn tất. */
  isLate: boolean | null;
  /** Giờ THỰC TẾ do người dùng nhập. Bảng mới không có khái niệm này nên luôn lấy từ JSON. */
  hoursActual: number;
  /**
   * Đang bị Admin/Order bắt tạm dừng. Dữ liệu JSON cũ không có khái niệm này nên luôn false.
   *
   * Dùng để TÁCH khỏi "đơn chưa hoàn thành" — nhân viên không chịu trách nhiệm cho một đơn
   * bị gác theo lệnh điều hành.
   */
  isPaused: boolean;
  /**
   * Đơn này đã bị lấy đi giao cho NV 3D khác (không duyệt → đổi người).
   *
   * CHỈ có mặt ở đây khi người duyệt đã chọn "vẫn tính KPI cho người cũ" — trường hợp chọn
   * "không tính" bị loại ngay ở tầng truy vấn, nên bản ghi không bao giờ tới được hàm này.
   * Dữ liệu JSON cũ không có khái niệm này nên luôn false.
   */
  isReassignedAway: boolean;
  /** "YYYY-MM-DD" ngày bị lấy đơn — mốc neo cho cột "Đơn bị chuyển đi". */
  reassignedAwayYmd: string | null;
  /**
   * Giờ công đã chia theo tháng — CHỈ có khi lượt từng bị tạm dừng và được chốt giờ.
   *
   * RỖNG là tín hiệu giữ NGUYÊN cách tính cũ (cộng toàn bộ `hoursActual` vào tháng hoàn tất).
   * Nhờ vậy các đơn không hề bị gác — tức gần như toàn bộ dữ liệu lịch sử — không đổi số.
   * Xem kpi-3d/hours-ledger.ts.
   */
  accruals: Array<{ month: string; hours: number }>;
  source: "ASSIGNMENT" | "LEGACY";
};

export type Kpi3DRow = {
  name: string;
  code: string;
  donGiao: number;
  donHT: number;
  donChuaHT: number;
  donTre: number;
  donDungHan: number;
  donChoBuong: number;
  /**
   * Đơn ĐANG bị Admin/Order bắt tạm dừng — đã TRỪ khỏi donChuaHT.
   *
   * Tách riêng thay vì gộp vào "chưa hoàn thành": gộp lại là buộc tội nhân viên cho một quyết
   * định điều hành. Vẫn hiện thành cột để tổng khớp và người đọc biết vì sao đơn chưa xong.
   */
  donTamDung: number;
  /**
   * Đơn bị lấy đi giao cho NV 3D khác, mà người duyệt VẪN quyết định tính công cho người cũ.
   *
   * Neo theo THÁNG BỊ LẤY ĐƠN, không phải tháng giao — cùng nguyên tắc với donGiao (neo theo
   * ngày giao) và donHT (neo theo ngày hoàn tất): mỗi cột neo vào chính sự kiện của nó.
   *
   * Trường hợp người duyệt chọn "không tính KPI" thì lượt đó bị loại từ tầng truy vấn và
   * KHÔNG xuất hiện ở bất kỳ cột nào — kể cả cột này.
   */
  donBiChuyenDi: number;
  /**
   * Đơn NỐI TIẾP từ tháng trước — được giao ở tháng trước đó, và tháng này vẫn ghi nhận giờ.
   *
   * Cần vì cột "Đơn được giao" neo theo tháng giao, nên một đơn bị gác từ tháng 8 và làm tiếp
   * tháng 9 khiến tháng 9 nhìn như nhân viên rảnh. Cột này bổ sung thông tin đó mà KHÔNG sửa
   * số của tháng 8 — số đã báo cáo thì không nên đổi.
   */
  donTiepTuc: number;
  tongGio: number;
  quiDoiNgay: number;
  isOther: boolean;
};

/** Khối design cũ trong extraData. */
export type LegacyDesignEntry = {
  ngayGiao3D?: string;
  ngayHoanThanh3D?: string;
  gioThucTe?: number | string;
  ketQua?: string;
};

export type AssignmentInput = {
  /** Id của CHÍNH lượt giao việc — khóa gộp, xem mergeKpi3DSources. */
  id: string;
  orderItemId: string;
  designerName: string;
  assignedAt: Date;
  completedAt: Date | null;
  kpiStatus: "ON_TIME" | "LATE" | null;
  /** Giờ thực tế của riêng lượt này (phút). null = chưa nhập, rơi về JSON cũ. */
  actualMinutes: number | null;
  /** Đang bị tạm dừng (có khoảng dừng chưa mở lại) — xem kpi-3d/pause.ts. */
  isPaused?: boolean;
  /**
   * Ngày bị lấy đơn giao người khác — null nếu lượt này vẫn đang hiệu lực.
   *
   * Route chỉ nạp lượt REASSIGNED khi nó đi qua luồng "không duyệt → đổi người" MỚI và người
   * duyệt đã chọn tính KPI. Lượt bị đóng qua form sửa đơn hàng (đường cũ) không có mốc này và
   * cũng không được nạp, nên số của các tháng đã chốt không bị đổi ngược.
   */
  reassignedAt?: Date | null;
  /**
   * Các lần chốt giờ ở mỗi lần tạm dừng — nguồn để chia giờ công theo tháng.
   * Rỗng/không truyền = lượt chưa từng bị gác, giữ nguyên cách tính cũ.
   */
  confirmedPauses?: ReadonlyArray<{ pausedAt: Date; confirmedMinutes: number | null }>;
};

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

/** Chuỗi ketQua cũ đánh dấu trễ hạn — người dùng/`calcKetQua` sinh ra. */
const LEGACY_LATE_LABEL = "Hoàn tất trễ";

/**
 * Rút các bản ghi từ extraData của MỘT ProductionDetail.
 *
 * Sửa luôn lỗi cũ: trước đây chỉ đọc `extraData.tho3d` ở GỐC rồi bỏ qua cả đơn nếu trống.
 * Nhưng panel nay ghi tên nhân viên vào `perItem[itemId].tho3d` theo từng MO, nên các đơn
 * chỉ có dữ liệu per-MO bị báo cáo bỏ sót hoàn toàn. Giờ ưu tiên per-MO, gốc chỉ là dự phòng.
 */
export function extractLegacyRecords(
  orderId: string,
  extraData: Record<string, unknown> | null,
): Kpi3DRecord[] {
  if (!extraData || typeof extraData !== "object") return [];

  const rootDesigner = typeof extraData.tho3d === "string" ? extraData.tho3d.trim() : "";
  const perItem = (extraData.perItem as Record<string, Record<string, unknown>> | undefined) ?? {};
  const out: Kpi3DRecord[] = [];

  for (const [itemId, itemData] of Object.entries(perItem)) {
    const design = itemData?.design as LegacyDesignEntry | undefined;
    if (!design) continue;
    const designer = (typeof itemData.tho3d === "string" ? itemData.tho3d.trim() : "") || rootDesigner;
    if (!designer) continue;

    const rec = toLegacyRecord(itemId, designer, design);
    if (rec) out.push(rec);
  }

  // Dữ liệu rất cũ: design nằm thẳng ở gốc, chưa tách theo MO.
  if (out.length === 0 && extraData.design && rootDesigner) {
    const rec = toLegacyRecord(`${orderId}:root`, rootDesigner, extraData.design as LegacyDesignEntry);
    if (rec) out.push(rec);
  }

  return out;
}

function toLegacyRecord(key: string, designerName: string, d: LegacyDesignEntry): Kpi3DRecord | null {
  const assignedYmd = d.ngayGiao3D?.slice(0, 10) || null;
  const completedYmd = d.ngayHoanThanh3D?.slice(0, 10) || null;
  // Không có cả ngày giao lẫn ngày hoàn tất = chưa có thông tin gì đáng tính.
  if (!assignedYmd && !completedYmd) return null;

  return {
    key,
    designerName,
    // Dữ liệu JSON cũ không có khái niệm tạm dừng / đổi người — luôn false, không phải "chưa biết".
    isPaused: false,
    isReassignedAway: false,
    reassignedAwayYmd: null,
    accruals: [],
    assignedYmd,
    completedYmd,
    isLate: completedYmd ? d.ketQua === LEGACY_LATE_LABEL : null,
    hoursActual: num(d.gioThucTe),
    source: "LEGACY",
  };
}

/**
 * Gộp hai nguồn. Assignment THẮNG khi cùng một MO có ở cả hai bên.
 *
 * KHÓA GỘP LÀ ID LƯỢT GIAO VIỆC, KHÔNG PHẢI orderItemId. Một MO có thể có NHIỀU NV 3D cùng
 * làm; khóa theo MO thì N lượt trùng khóa nhau, và `covered` — vốn dùng để loại bản ghi JSON
 * đã được thay thế — sẽ gộp chúng làm một.
 *
 * GIỜ THỰC TẾ: SỐ SỬA TAY THẮNG số hệ thống đo — cùng một quy tắc với sidebar, khai ở
 * kpi-3d/actual-minutes.ts chứ không viết lại ở đây. Order chỉ gõ vào khi họ biết một điều hệ
 * thống không biết, nên để hệ thống thắng thì ô sửa thành vô nghĩa.
 *
 * CHỈ NHẬN số sửa tay khi MO đó có DUY NHẤT một lượt. `extractLegacyRecords` chỉ đọc
 * `perItem[].design` — tức khối của NV #1 — nên với MO nhiều người thì con số đó là của riêng
 * người đầu, lấy chung cho mọi người sẽ nhân tổng giờ lên bằng số người.
 *
 * HỆ QUẢ CÒN LẠI, CỐ Ý CHƯA XỬ LÝ: với MO nhiều NV 3D, số Order sửa tay cho NV #2 trở đi
 * (nằm ở `perItem[].designers[]`) chưa chảy vào báo cáo — báo cáo dùng số hệ thống đo. Nối
 * được nhưng cần map assignmentId↔slot qua readDesign3DBlocks, là một việc riêng.
 */
export function mergeKpi3DSources(
  assignments: AssignmentInput[],
  legacyRecords: Kpi3DRecord[],
): Kpi3DRecord[] {
  const legacyByItem = new Map(legacyRecords.map((r) => [r.key, r]));

  const countByItem = new Map<string, number>();
  for (const a of assignments) {
    countByItem.set(a.orderItemId, (countByItem.get(a.orderItemId) ?? 0) + 1);
  }

  const fromAssignments: Kpi3DRecord[] = assignments.map((a) => {
    const hoursActual = resolveHoursActual(a, countByItem, legacyByItem);
    return {
    key: a.id,
    designerName: a.designerName,
    assignedYmd: toVnYmd(a.assignedAt),
    completedYmd: a.completedAt ? toVnYmd(a.completedAt) : null,
    isLate: a.completedAt ? a.kpiStatus === "LATE" : null,
    hoursActual,
    // Chia giờ theo tháng nếu lượt từng bị gác và đã chốt giờ. Lượt đóng vì bị lấy đơn cũng
    // tính là đã đóng — nếu không, phần còn lại của người cũ không bao giờ được ghi nhận.
    accruals: accrueMinutesByMonth({
      checkpoints: a.confirmedPauses ?? [],
      totalMinutes: Math.round(hoursActual * 60),
      closedAt: a.completedAt ?? a.reassignedAt ?? null,
    }).map((x) => ({ month: x.month, hours: Math.round((x.minutes / 60) * 1000) / 1000 })),
    isPaused: a.isPaused === true,
    isReassignedAway: a.reassignedAt != null,
    reassignedAwayYmd: a.reassignedAt ? toVnYmd(a.reassignedAt) : null,
    source: "ASSIGNMENT",
    } satisfies Kpi3DRecord;
  });

  // Bản ghi JSON của MO ĐÃ CÓ lượt giao việc thì bị thay thế — so theo orderItemId, vì key của
  // hai bên nay khác loại (bên assignment là id lượt, bên JSON là id MO).
  const coveredItems = new Set(assignments.map((a) => a.orderItemId));
  return [...fromAssignments, ...legacyRecords.filter((r) => !coveredItems.has(r.key))];
}

/** Giờ thực tế của một lượt, theo đúng thứ tự ưu tiên dùng chung với sidebar. */
function resolveHoursActual(
  a: AssignmentInput,
  countByItem: Map<string, number>,
  legacyByItem: Map<string, Kpi3DRecord>,
): number {
  const manualHours = countByItem.get(a.orderItemId) === 1
    ? legacyByItem.get(a.orderItemId)?.hoursActual ?? null
    : null;

  const resolved = resolveActualMinutes({ systemMinutes: a.actualMinutes, manualHours });
  if (resolved.minutes == null) return 0;
  return Math.round((resolved.minutes / 60) * 1000) / 1000;
}

/**
 * Cộng dồn theo nhân viên cho một tháng ("YYYY-MM").
 *
 * Giữ NGUYÊN ý nghĩa từng cột như báo cáo cũ để số liệu không đổi nghĩa giữa hai phiên bản:
 *   donGiao     — giao trong tháng
 *   donHT       — hoàn tất trong tháng
 *   donTre      — trong số hoàn tất trong tháng, bị trễ deadline
 *   donChoBuong — đã giao nhưng chưa hoàn tất, tính TẤT CẢ thời gian (không bó theo tháng)
 */
export function aggregateKpi3DRows(
  records: Kpi3DRecord[],
  designers: Array<{ name: string; code: string }>,
  monthPrefix: string,
): Kpi3DRow[] {
  type Stats = {
    donGiao: number; donHT: number; donTre: number; tongGio: number;
    donChoBuong: number; donTamDung: number; donBiChuyenDi: number; donTiepTuc: number;
    /**
     * Bộ đếm NỘI BỘ, không lên bảng: số đơn bị lấy đi mà giao trong tháng này và chưa hoàn tất.
     *
     * donChuaHT = donGiao − donHT, nên một đơn giao tháng này rồi bị lấy đi trước khi xong sẽ
     * nằm mãi trong hiệu số đó. Trừ riêng bằng bộ đếm này thay vì trừ cả donBiChuyenDi: hai
     * con số neo theo hai mốc khác nhau (bị lấy / được giao) nên chúng KHÔNG bằng nhau, và
     * dùng nhầm sẽ làm donChuaHT âm hoặc hụt ở tháng giáp ranh.
     */
    chuyenDiChuaHT: number;
  };
  const fresh = (): Stats => ({
    donGiao: 0, donHT: 0, donTre: 0, tongGio: 0,
    donChoBuong: 0, donTamDung: 0, donBiChuyenDi: 0, donTiepTuc: 0, chuyenDiChuaHT: 0,
  });

  const activeNames = new Set(designers.map((d) => d.name));
  const map = new Map<string, Stats>();
  const get = (name: string) => {
    if (!map.has(name)) map.set(name, fresh());
    return map.get(name)!;
  };

  for (const r of records) {
    // Nhân viên đã nghỉ/ẩn vẫn phải được tính, gom vào dòng "Khác" để tổng không hụt.
    const s = get(activeNames.has(r.designerName) ? r.designerName : "__other__");

    if (r.assignedYmd?.startsWith(monthPrefix)) s.donGiao++;

    // ─── GIỜ CÔNG: hai đường loại trừ nhau, KHÔNG BAO GIỜ chạy cả hai ──────────
    //
    // ⚠️ ĐÂY LÀ CHỖ CỘNG TRÙNG NẾU LÀM SAI. Nếu vừa cộng theo tháng làm việc vừa cộng toàn bộ
    // ở tháng hoàn tất, nhân viên được tính công gấp đôi — và nó sai theo hướng khó thấy nhất:
    // con số chỉ lớn hơn, không có gì đỏ.
    //
    // `accruals` rỗng = lượt chưa từng bị gác → giữ nguyên cách tính cũ. Nhờ vậy gần như toàn
    // bộ dữ liệu lịch sử không đổi số.
    const hasLedger = r.accruals.length > 0;
    if (hasLedger) {
      const share = r.accruals.find((a) => a.month === monthPrefix);
      if (share) {
        s.tongGio += share.hours;
        // Giao ở tháng TRƯỚC mà tháng này vẫn ghi nhận giờ = đơn nối tiếp. Cột "Đơn được giao"
        // neo theo tháng giao nên không thấy được việc này.
        if (r.assignedYmd && !r.assignedYmd.startsWith(monthPrefix)) s.donTiepTuc++;
      }
    }

    if (r.completedYmd?.startsWith(monthPrefix)) {
      s.donHT++;
      if (!hasLedger) s.tongGio += r.hoursActual;
      if (r.isLate) s.donTre++;
    }

    if (r.isReassignedAway && r.reassignedAwayYmd?.startsWith(monthPrefix)) s.donBiChuyenDi++;

    // BA NHÁNH LOẠI TRỪ NHAU cho một đơn CHƯA hoàn tất — thứ tự quan trọng.
    //
    // BỊ LẤY ĐƠN xét TRƯỚC: lượt đó đã đóng, không còn treo trên đầu ai. Rơi xuống nhánh "chờ
    // buông" thì nó nằm đó vĩnh viễn — chờ buông là cảnh báo "giao rồi mà không ai đụng tới",
    // và một đơn đã có người khác tiếp quản thì không phải chuyện đó.
    //
    // TẠM DỪNG xét trước "chờ buông" vì cùng lý do: đơn bị Admin bắt gác thì có người quyết
    // định hẳn hoi, gộp chung sẽ làm cảnh báo mất giá trị.
    if (r.isReassignedAway) {
      if (r.assignedYmd?.startsWith(monthPrefix) && !r.completedYmd) s.chuyenDiChuaHT++;
    } else if (r.isPaused && !r.completedYmd) {
      s.donTamDung++;
    } else if (r.assignedYmd && !r.completedYmd) {
      s.donChoBuong++;
    }
  }

  const toRow = (name: string, code: string, s: Stats, isOther: boolean): Kpi3DRow => {
    const tongGio = Math.round(s.tongGio * 1000) / 1000;
    return {
      name,
      code,
      donGiao: s.donGiao,
      donHT: s.donHT,
      // TRỪ đơn đang tạm dừng VÀ đơn đã bị lấy đi: cả hai đều là quyết định điều hành, nhân
      // viên không chịu trách nhiệm. Không trừ thì đơn bị lấy đi nằm mãi trong "chưa hoàn
      // thành" của người cũ dù họ không còn cách nào hoàn thành nó nữa.
      donChuaHT: Math.max(0, s.donGiao - s.donHT - s.donTamDung - s.chuyenDiChuaHT),
      donTamDung: s.donTamDung,
      donBiChuyenDi: s.donBiChuyenDi,
      donTiepTuc: s.donTiepTuc,
      donTre: s.donTre,
      donDungHan: s.donHT - s.donTre,
      donChoBuong: s.donChoBuong,
      tongGio,
      quiDoiNgay: Math.round((tongGio / 8) * 10) / 10,
      isOther,
    };
  };

  const rows = designers.map((d) => toRow(d.name, d.code, map.get(d.name) ?? fresh(), false));

  const other = map.get("__other__");
  if (other && (other.donGiao > 0 || other.donHT > 0 || other.donChoBuong > 0 || other.donBiChuyenDi > 0)) {
    rows.push(toRow("Khác", "—", other, true));
  }

  return rows;
}

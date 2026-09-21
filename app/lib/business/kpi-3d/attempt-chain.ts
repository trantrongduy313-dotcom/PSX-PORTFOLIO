// ─── Một MO làm mấy lần, và vì sao ───────────────────────────────────────────
//
// LỖ HỔNG ĐANG BỊT: khối "Nhân viên 3D #N" ở sidebar đơn hàng KHÔNG đọc từ bảng
// design_3d_assignments — nó đọc từ JSON extraData (`perItem[id].design` = slot 0,
// `perItem[id].designers[]` = slot 1+). Nên khi hệ thống tạo một lượt mới (không duyệt → đổi
// người), sidebar vẫn chỉ hiện một khối: hai nguồn sự thật khác nhau cho cùng câu hỏi "ai đã
// làm MO này".
//
// Chuỗi liên kết thì ĐÃ CÓ trong bảng từ lâu (reassignedFromId), chỉ là chưa màn hình nào hiện
// ra. File này dựng nó thành thứ đọc được.
//
// CỐ Ý KHÔNG mirror lịch sử ngược vào JSON: dự án đã có sẵn một dòng cảnh báo đúng chuyện này
// — "Hai nơi lưu cùng một sự thật thì sớm muộn lệch". Ô nhập vẫn là JSON như cũ; lịch sử đọc
// thẳng từ bảng, nên không có gì để lệch.
//
// File THUẦN: không prisma, không React.

export type ContinuationReason = "REJECT_REASSIGN" | "MANUAL_REASSIGN" | "PAUSE_RESUME";

/** Phần dữ liệu cần để dựng chuỗi — chỉ các trường thật sự dùng tới. */
export type AttemptInput = {
  id: string;
  orderItemId: string;
  status: string;
  assignedAt: string | Date;
  completedAt: string | Date | null;
  kpiStatus: "ON_TIME" | "LATE" | null;
  standardMinutesSnapshot: number;
  actualMinutes: number | null;
  reviewStatus: string | null;
  reviewNote: string | null;
  /** Lượt này tiếp nối lượt nào. null = đây là lần 1 của một chuỗi. */
  reassignedFromId: string | null;
  continuationReason: ContinuationReason | null;
  designer3D: { id: string; name: string } | null;
};

export type Attempt = AttemptInput & {
  /** 1, 2, 3… trong chuỗi của nó. */
  attemptNo: number;
  /** Còn hiệu lực — lượt đang được làm hoặc đã hoàn tất và chưa bị thay. */
  isActive: boolean;
};

const CLOSED = new Set(["REASSIGNED", "CANCELLED"]);

const ms = (v: string | Date | null | undefined): number => {
  if (!v) return 0;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

/** Nhãn tiếng Việt cho lý do — khai MỘT chỗ để sidebar và màn 3D không gọi khác tên nhau. */
export const CONTINUATION_LABELS: Record<ContinuationReason, string> = {
  REJECT_REASSIGN: "bản trước không được duyệt",
  MANUAL_REASSIGN: "đổi người ở form đơn hàng",
  PAUSE_RESUME: "mở lại sau tạm dừng",
};

/**
 * Gom các lượt của MỘT MO thành các CHUỖI, mỗi chuỗi xếp từ lần 1 tới lần N.
 *
 * ⚠️ MỘT MO CÓ THỂ CÓ NHIỀU CHUỖI SONG SONG, không phải một. Hai NV 3D cùng làm một MO là hai
 * lượt độc lập, cả hai đều `reassignedFromId = null` — đó là thiết kế có chủ ý (xem
 * kpi-3d-multi-designer). Gộp tất cả thành một chuỗi sẽ biến hai người làm song song thành
 * "MO này làm hai lần", tức đọc sai hẳn tình hình.
 *
 * Nên: mỗi lượt không tiếp nối ai là GỐC của một chuỗi riêng.
 *
 * Chuỗi sắp theo mốc giao của gốc, để thứ tự hiển thị khớp thứ tự các khối NV 3D #1, #2 trên
 * sidebar (vốn cũng theo thứ tự tạo).
 */
export function buildAttemptChains(rows: readonly AttemptInput[]): Attempt[][] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Con của mỗi lượt. Dữ liệu đúng thì mỗi lượt có tối đa một con; nếu có nhiều (dữ liệu hỏng,
  // hoặc một luồng tương lai cho phép chia đôi) thì lấy con SỚM NHẤT để chuỗi vẫn tuyến tính
  // — thà hiện thiếu một nhánh còn hơn lặp vô hạn.
  const childOf = new Map<string, AttemptInput>();
  for (const r of rows) {
    const parentId = r.reassignedFromId;
    if (!parentId || !byId.has(parentId)) continue;
    const existing = childOf.get(parentId);
    if (!existing || ms(r.assignedAt) < ms(existing.assignedAt)) childOf.set(parentId, r);
  }

  // Gốc: không tiếp nối ai, HOẶC tiếp nối một lượt không nằm trong tập này (VD chỉ nạp một MO
  // mà lượt cha thuộc MO khác — không nên xảy ra, nhưng không được làm mất dòng).
  const roots = rows.filter((r) => !r.reassignedFromId || !byId.has(r.reassignedFromId));

  const chains: Attempt[][] = [];
  for (const root of [...roots].sort((a, b) => ms(a.assignedAt) - ms(b.assignedAt))) {
    const chain: Attempt[] = [];
    const seen = new Set<string>();
    let cursor: AttemptInput | undefined = root;
    // `seen` là CHỐT CHẶN KHÔNG THỂ VỚI TỚI theo cấu trúc hiện tại, và cố ý giữ lại.
    //
    // Mỗi lượt chỉ có MỘT cha (reassignedFromId), nên đi từ gốc theo `childOf` không bao giờ
    // quay lại được một node đã qua — quay lại đòi node đó có hai cha. Dữ liệu vòng tròn thuần
    // thì mọi node đều có cha, nên KHÔNG có gốc nào và vòng này không chạy lần nào (các dòng đó
    // biến mất khỏi lịch sử — xem test).
    //
    // Giữ lại vì nếu sau này ai đổi sang cho một lượt chia thành hai nhánh thì chốt này là thứ
    // duy nhất chặn treo cả sidebar. Đừng dựa vào nó thay cho ràng buộc một-cha.
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      chain.push({
        ...cursor,
        attemptNo: chain.length + 1,
        isActive: !CLOSED.has(cursor.status),
      });
      cursor = childOf.get(cursor.id);
    }
    chains.push(chain);
  }
  return chains;
}

/**
 * Các chuỗi của một MO mà THẬT SỰ có nhiều lần — dùng để quyết định có hiện khối lịch sử không.
 *
 * Chuỗi dài 1 thì không có gì để kể: khối trường phía trên đã nói đủ, thêm một danh sách một
 * dòng chỉ làm panel dài ra.
 */
export function chainsWithHistory(rows: readonly AttemptInput[]): Attempt[][] {
  return buildAttemptChains(rows).filter((c) => c.length > 1);
}

/**
 * Lượt còn hiệu lực — đúng tập mà panel dùng để dựng khối trường.
 *
 * GENERIC để KHÔNG thu hẹp kiểu đầu vào: chỗ gọi truyền `Design3DAssignmentRow` (nhiều trường
 * hơn `AttemptInput`) và vẫn cần dùng tiếp các trường đó ở dòng sau. Nhận `AttemptInput[]` rồi
 * trả `AttemptInput[]` sẽ âm thầm cắt mất deadlineAt, acknowledgedAt…
 */
export function activeAttempts<T extends { status: string }>(rows: readonly T[]): T[] {
  return rows.filter((r) => !CLOSED.has(r.status));
}

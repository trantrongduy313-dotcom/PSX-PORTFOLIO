import { describe, expect, it } from "vitest";

import {
  deniedReasonForReassign,
  handoverNote,
  reassignHistoryComment,
  reassignInputSchema,
  type ReassignableAssignment,
} from "@/app/lib/business/kpi-3d/reassign";
import { aggregateKpi3DRows, mergeKpi3DSources, type Kpi3DRecord } from "@/app/lib/business/kpi-3d/report";
import { design3DNoticeKind } from "@/app/lib/business/kpi-3d/display";

// Không duyệt → đổi sang NV 3D khác. Hai nhóm luật cần khoá:
//   1. AI được bấm, và bấm được ở trạng thái nào.
//   2. Con số KPI đi về đâu — cả khi người duyệt chọn tính công lẫn khi chọn không tính.

const asg = (o: Partial<ReassignableAssignment> = {}): ReassignableAssignment => ({
  status: "SENT_RESULT",
  reviewStatus: "PENDING_REVIEW",
  designer3DId: "d-old",
  ...o,
});

describe("Quyền đổi người", () => {
  it.each([["ADMIN"], ["ORDER"]])("%s được đổi", (role) => {
    expect(deniedReasonForReassign(role, asg(), "d-new")).toBeNull();
  });

  // NV 3D tự chuyển việc của mình sang người khác thì họ tự thoát khỏi mọi đơn khó.
  // PRODUCTION ghi tiến độ hộ khi NV vắng, nhưng giao việc không phải vai của họ.
  it.each([["DESIGN_3D"], ["PRODUCTION"], ["SALES"], [undefined]])("%s bị chặn", (role) => {
    expect(deniedReasonForReassign(role, asg(), "d-new")).not.toBeNull();
  });
});

describe("Trạng thái chặn", () => {
  it.each([["REASSIGNED"], ["CANCELLED"]])("lượt đã đóng (%s) → chặn", (status) => {
    expect(deniedReasonForReassign("ADMIN", asg({ status }), "d-new")).not.toBeNull();
  });

  // Đã duyệt = đã chốt giờ + File Render đã thành file chính thức của MO. Đi qua đường này
  // sẽ đóng một lượt đã được công nhận và làm số liệu đã chốt đổi nghĩa.
  it("đã duyệt → chặn, và câu từ chối chỉ đúng hướng đi thay thế", () => {
    const msg = deniedReasonForReassign("ADMIN", asg({ reviewStatus: "ACCEPTED" }), "d-new");
    expect(msg).toContain("lượt mới");
  });

  it("chuyển cho chính người đang làm → chặn", () => {
    expect(deniedReasonForReassign("ADMIN", asg({ designer3DId: "d-x" }), "d-x")).not.toBeNull();
  });

  it("bị yêu cầu làm lại rồi vẫn đổi được — đó chính là lúc hay cần đổi nhất", () => {
    expect(deniedReasonForReassign("ADMIN", asg({ reviewStatus: "REWORK", status: "IN_PROGRESS" }), "d-new")).toBeNull();
  });
});

describe("Dữ liệu vào", () => {
  const base = { designer3DId: "d-new", reason: "Sai kiểu dáng", countKpiForPrevious: true };

  it("nhận dữ liệu đầy đủ", () => {
    expect(reassignInputSchema.safeParse(base).success).toBe(true);
  });

  // ⚠️ TEST QUAN TRỌNG NHẤT FILE NÀY.
  // Thiếu quyết định KPI thì PHẢI hỏng, không được rơi về một mặc định. Nếu ai đó thêm
  // `.default(true)` vào schema cho "tiện", test này đổ — và đó đúng là điều cần xảy ra:
  // mặc định ở đây nghĩa là hệ thống tự quyết định thu nhập của một nhân viên.
  it("KHÔNG có mặc định cho quyết định tính KPI — thiếu là hỏng", () => {
    expect(reassignInputSchema.safeParse({ designer3DId: base.designer3DId, reason: base.reason }).success).toBe(false);
  });

  it.each([[""], ["   "]])("lý do rỗng (%j) → hỏng", (reason) => {
    expect(reassignInputSchema.safeParse({ ...base, reason }).success).toBe(false);
  });

  it("thiếu nhân viên mới → hỏng", () => {
    expect(reassignInputSchema.safeParse({ ...base, designer3DId: "  " }).success).toBe(false);
  });

  // Bỏ trống = giữ nguyên nhóm KPI và lấy mốc bây giờ, tức "giao lại y như cũ".
  it("nhóm KPI và mốc giao là TÙY CHỌN", () => {
    const parsed = reassignInputSchema.parse(base);
    expect(parsed.kpiGroupId).toBeUndefined();
    expect(parsed.assignedAt).toBeUndefined();
  });

  it("nhận nhóm KPI và mốc giao do người giao chọn", () => {
    const parsed = reassignInputSchema.parse({
      ...base,
      kpiGroupId: "g-1",
      assignedAt: "2026-08-12T02:00:00.000Z",
    });
    expect(parsed.kpiGroupId).toBe("g-1");
    expect(parsed.assignedAt?.toISOString()).toBe("2026-08-12T02:00:00.000Z");
  });

  it("mốc giao không đọc được → hỏng, không rơi về 'bây giờ'", () => {
    expect(reassignInputSchema.safeParse({ ...base, assignedAt: "hôm qua" }).success).toBe(false);
  });

  it("cắt khoảng trắng thừa của lý do", () => {
    const parsed = reassignInputSchema.parse({ ...base, reason: "  Sai đá  " });
    expect(parsed.reason).toBe("Sai đá");
  });
});

describe("Câu chữ để lại dấu vết", () => {
  // Ba tháng sau không ai mở lại được hộp thoại. Dòng lịch sử phải tự nó trả lời được
  // "ai sang ai" VÀ "người cũ có được tính công không".
  it("lịch sử nêu CẢ hai vế", () => {
    const yes = reassignHistoryComment({ fromDesignerName: "AN", toDesignerName: "BÌNH", countKpiForPrevious: true });
    const no = reassignHistoryComment({ fromDesignerName: "AN", toDesignerName: "BÌNH", countKpiForPrevious: false });
    for (const s of [yes, no]) {
      expect(s).toContain("AN");
      expect(s).toContain("BÌNH");
    }
    expect(yes).not.toBe(no);
    expect(no).toContain("KHÔNG");
  });

  it("ghi chú bàn giao mang theo lý do gốc cho người mới đọc", () => {
    expect(handoverNote({ fromDesignerName: "AN", reason: "Sai kiểu dáng" })).toContain("Sai kiểu dáng");
  });
});

// ─── KPI ─────────────────────────────────────────────────────────────────────

const rec = (o: Partial<Kpi3DRecord>): Kpi3DRecord => ({
  key: "k",
  designerName: "AN",
  assignedYmd: null,
  completedYmd: null,
  isLate: null,
  hoursActual: 0,
  isPaused: false,
  isReassignedAway: false,
  reassignedAwayYmd: null,
  accruals: [],
  source: "ASSIGNMENT",
  ...o,
});

const rowOf = (records: Kpi3DRecord[], month = "2026-08") =>
  aggregateKpi3DRows(records, [{ name: "AN", code: "A1" }], month)[0];

describe("Báo cáo KPI khi bị lấy đơn", () => {
  it("đơn bị lấy đi được đếm ở cột riêng, neo theo THÁNG BỊ LẤY", () => {
    const r = rowOf([rec({
      key: "a", assignedYmd: "2026-07-20",
      isReassignedAway: true, reassignedAwayYmd: "2026-08-05",
    })]);
    expect(r.donBiChuyenDi).toBe(1);
    // Giao tháng 7 nên KHÔNG tính vào "được giao" của tháng 8 — mỗi cột neo vào sự kiện của nó.
    expect(r.donGiao).toBe(0);
  });

  // Nếu rơi xuống nhánh "chờ buông" thì đơn nằm đó vĩnh viễn: chờ buông là cảnh báo
  // "giao rồi mà không ai đụng tới", còn đơn này đã có người khác tiếp quản.
  it("KHÔNG bị đếm là chờ buông", () => {
    const r = rowOf([rec({
      key: "a", assignedYmd: "2026-08-01",
      isReassignedAway: true, reassignedAwayYmd: "2026-08-05",
    })]);
    expect(r.donChoBuong).toBe(0);
  });

  // Người cũ không còn cách nào hoàn thành đơn đó nữa — để nó trong "chưa hoàn thành" là
  // treo một món nợ không thể trả.
  it("bị TRỪ khỏi Đơn chưa HT khi giao và bị lấy trong cùng tháng", () => {
    const r = rowOf([rec({
      key: "a", assignedYmd: "2026-08-01",
      isReassignedAway: true, reassignedAwayYmd: "2026-08-05",
    })]);
    expect(r.donGiao).toBe(1);
    expect(r.donChuaHT).toBe(0);
  });

  // Đây là vế "vẫn tính công": họ đã nộp kết quả, bị bác, nhưng người duyệt công nhận công sức.
  it("đã nộp kết quả rồi mới bị lấy → vẫn cộng đơn HT và tổng giờ", () => {
    const r = rowOf([rec({
      key: "a", assignedYmd: "2026-08-01", completedYmd: "2026-08-04",
      hoursActual: 6, isLate: false,
      isReassignedAway: true, reassignedAwayYmd: "2026-08-05",
    })]);
    expect(r.donHT).toBe(1);
    expect(r.tongGio).toBe(6);
    expect(r.donBiChuyenDi).toBe(1);
  });

  it("đơn bình thường không đụng tới cột mới", () => {
    const r = rowOf([rec({ key: "a", assignedYmd: "2026-08-01", completedYmd: "2026-08-02", hoursActual: 3 })]);
    expect(r.donBiChuyenDi).toBe(0);
  });

  // Hai mốc neo khác nhau nên hai con số KHÔNG bằng nhau. Nếu ai đó trừ thẳng donBiChuyenDi
  // khỏi donChuaHT cho gọn, tháng giáp ranh sẽ hụt — test này giữ chỗ đó.
  it("bị lấy ở tháng SAU không làm hụt Đơn chưa HT của tháng giao", () => {
    const r = rowOf([rec({
      key: "a", assignedYmd: "2026-08-28",
      isReassignedAway: true, reassignedAwayYmd: "2026-09-02",
    })]);
    expect(r.donGiao).toBe(1);
    expect(r.donBiChuyenDi).toBe(0); // sự kiện lấy đơn thuộc tháng 9
    expect(r.donChuaHT).toBe(0);     // nhưng nó đã đóng, không treo nợ tháng 8
  });

  it("người cũ và người mới là hai dòng độc lập", () => {
    const rows = aggregateKpi3DRows(
      [
        rec({ key: "old", designerName: "AN", assignedYmd: "2026-08-01", isReassignedAway: true, reassignedAwayYmd: "2026-08-05" }),
        rec({ key: "new", designerName: "BÌNH", assignedYmd: "2026-08-05", completedYmd: "2026-08-08", hoursActual: 4 }),
      ],
      [{ name: "AN", code: "A1" }, { name: "BÌNH", code: "B1" }],
      "2026-08",
    );
    expect(rows.find((r) => r.name === "AN")?.donBiChuyenDi).toBe(1);
    expect(rows.find((r) => r.name === "BÌNH")?.donHT).toBe(1);
    expect(rows.find((r) => r.name === "BÌNH")?.donBiChuyenDi).toBe(0);
  });
});

describe("Chuyển từ bảng sang bản ghi báo cáo", () => {
  // reassignedAt là BẢN LỀ phân biệt đường mới với lượt bị đóng qua form sửa đơn hàng.
  it("không có reassignedAt → không phải đơn bị lấy đi", () => {
    const [r] = mergeKpi3DSources(
      [{ id: "a", orderItemId: "i", designerName: "AN", assignedAt: new Date("2026-08-01T02:00:00Z"), completedAt: null, kpiStatus: null, actualMinutes: null }],
      [],
    );
    expect(r.isReassignedAway).toBe(false);
    expect(r.reassignedAwayYmd).toBeNull();
  });

  it("có reassignedAt → đánh dấu và quy ra ngày giờ VN", () => {
    const [r] = mergeKpi3DSources(
      [{
        id: "a", orderItemId: "i", designerName: "AN",
        assignedAt: new Date("2026-08-01T02:00:00Z"), completedAt: null, kpiStatus: null, actualMinutes: null,
        reassignedAt: new Date("2026-08-05T02:00:00Z"),
      }],
      [],
    );
    expect(r.isReassignedAway).toBe(true);
    expect(r.reassignedAwayYmd).toBe("2026-08-05");
  });

  it("bản ghi JSON cũ luôn là false, không phải 'chưa biết'", () => {
    const [r] = mergeKpi3DSources([], [rec({ key: "i", source: "LEGACY", assignedYmd: "2026-08-01" })]);
    expect(r.isReassignedAway).toBe(false);
  });
});

// ─── Người CŨ nhìn thấy gì sau khi bị lấy đơn ────────────────────────────────

describe("Khối giải thích trên panel", () => {
  // ⚠️ Đây là lỗi thật: khi đổi người, lượt CŨ được đặt reviewStatus = REWORK (cần thiết, nếu
  // không nó nằm mãi trong hàng chờ kiểm). Panel lại dựa vào đúng cờ đó để in "Lý do làm lại"
  // — mời nhân viên đi sửa một đơn mà server đã CHẶN họ ghi tiến độ.
  it("lượt đã bị lấy đi KHÔNG hiện khối 'làm lại', dù cờ REWORK vẫn bật", () => {
    expect(design3DNoticeKind({
      reassignedAt: new Date("2026-08-12T07:00:00Z"),
      reviewStatus: "REWORK",
      reviewNote: "Sai kiểu dáng",
    })).toBe("REASSIGNED");
  });

  it("bị yêu cầu làm lại THẬT (chưa bị lấy đơn) vẫn hiện khối làm lại", () => {
    expect(design3DNoticeKind({
      reassignedAt: null,
      reviewStatus: "REWORK",
      reviewNote: "Sai kiểu dáng",
    })).toBe("REWORK");
  });

  it.each([[null], [""], ["   "]])(
    "REWORK mà lý do rỗng (%j) → không hiện gì: khối chỉ còn tiêu đề, không nói thêm gì so với chip",
    (note) => {
      expect(design3DNoticeKind({ reassignedAt: null, reviewStatus: "REWORK", reviewNote: note })).toBeNull();
    },
  );

  it("lượt bình thường → không hiện khối nào", () => {
    expect(design3DNoticeKind({ reassignedAt: null, reviewStatus: "PENDING_REVIEW", reviewNote: null })).toBeNull();
  });

  // Hai khối không bao giờ được hiện cùng lúc — chồng nhau là hai câu trả lời mâu thuẫn cho
  // cùng một câu hỏi "đơn này đang thế nào".
  it("không bao giờ trả về hai loại cùng lúc", () => {
    const kinds = [
      design3DNoticeKind({ reassignedAt: new Date(), reviewStatus: "REWORK", reviewNote: "x" }),
      design3DNoticeKind({ reassignedAt: null, reviewStatus: "REWORK", reviewNote: "x" }),
      design3DNoticeKind({ reassignedAt: null, reviewStatus: null, reviewNote: null }),
    ];
    expect(new Set(kinds).size).toBe(3);
  });
});

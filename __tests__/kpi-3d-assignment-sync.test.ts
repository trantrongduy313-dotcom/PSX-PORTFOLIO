import { describe, expect, it } from "vitest";

import {
  loadDesign3DLookups,
  syncDesign3DAssignmentBlock,
} from "@/app/lib/business/kpi-3d/assignment";
import { readDesign3DBlocks } from "@/app/lib/business/kpi-3d/assignment-targets";

// Bug được sửa ở đây: trước đây MỌI trường hợp không tạo được assignment đều trả `null`, nên
// khi cấu hình thiếu hệ thống im lặng bỏ qua — người dùng điền đủ, lưu thành công, nhưng việc
// không bao giờ hiện ở màn "Việc thiết kế 3D" và không có cách nào biết vì sao.
// Giờ phân biệt SKIPPED (đang nhập dở, bình thường) với BLOCKED (kèm lý do cụ thể).

const ITEM_ID = "item-1";

const CALENDAR = {
  id: "cal-1",
  sessions: [
    { dayOfWeek: 1, startMinute: 480, endMinute: 720 },
    { dayOfWeek: 1, startMinute: 780, endMinute: 900 },
    { dayOfWeek: 1, startMinute: 910, endMinute: 1020 },
  ],
  holidays: [],
};

function extraData(overrides: Record<string, unknown> = {}, tho3d = "TUỆ ANH") {
  return {
    perItem: {
      [ITEM_ID]: {
        tho3d,
        design: {
          phanNhom3D: "Nhóm 1",
          ngayGiao3D: "2026-08-03",
          gioGiao3D: "09:00",
          ...overrides,
        },
      },
    },
  };
}

type ActiveAssignmentStub = {
  id: string;
  designer3DId: string;
  kpiGroupId: string;
  standardMinutesSnapshot: number;
  assignedAt: Date;
  deadlineAt: Date;
  actualMinutes?: number | null;
  completedAt?: Date | null;
  acknowledgedAt?: Date | null;
  /** Khoảng tạm dừng — CẦN cho phép chốt giờ ở đường bàn giao (handover-freeze.ts). */
  pauses?: Array<{ pausedAt: Date; resumedAt: Date | null; confirmedMinutes: number | null }>;
};

/** tx giả — chỉ trả dữ liệu, đủ để chạy hết nhánh quyết định mà không cần DB. */
function fakeTx(opts: {
  designers?: Array<{ id: string; name: string }>;
  groups?: Array<{ id: string; name: string; code: string; standardMinutes: number }>;
  calendar?: unknown;
  /** Lượt giao việc ĐANG hiệu lực của MO — mô phỏng bàn giao khi khác người với ô đang nhập. */
  activeAssignment?: ActiveAssignmentStub | null;
} = {}) {
  const created: Record<string, unknown>[] = [];
  const updated: Array<{ id: string; data: Record<string, unknown> }> = [];
  return {
    created,
    updated,
    tx: {
      designer3D: { findMany: async () => opts.designers ?? [{ id: "d-1", name: "TUỆ ANH" }] },
      kpi3DGroup: {
        findMany: async () =>
          opts.groups ?? [{ id: "g-1", name: "Nhóm 1", code: "GROUP_1", standardMinutes: 240 }],
      },
      workingCalendar: { findFirst: async () => (opts.calendar === undefined ? CALENDAR : opts.calendar) },
      // Đường bàn giao nay còn đóng nốt khoảng tạm dừng còn mở (handover-freeze.ts) — lượt đã
      // đóng mà còn khoảng dừng chưa mở lại thì mọi màn hình đọc theo resumedAt = null sẽ hiện
      // nó là "đang tạm dừng" vĩnh viễn.
      design3DPause: {
        updateMany: async () => ({ count: 0 }),
      },
      design3DAssignment: {
        // Điền mặc định cho các trường mà DB thật LUÔN trả về: `pauses` là mảng (rỗng nếu chưa
        // từng dừng) và `acknowledgedAt` là null nếu chưa nhận việc. Không điền thì phép chốt giờ
        // nhận undefined và nổ — mà đó là lỗi của tx giả, không phải của code thật.
        findMany: async () =>
          opts.activeAssignment
            ? [{ acknowledgedAt: null, pauses: [], calendar: undefined, ...opts.activeAssignment }]
            : [],
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updated.push({ id: where.id, data });
          return {};
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: "asg-new", ...data };
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

// Mốc "bây giờ" cố định cho test — Thứ Hai (dayOfWeek 1, khớp CALENDAR), 09:00 giờ VN.
const NOW = new Date("2026-08-03T02:00:00.000Z");

/**
 * Nạp lookups rồi đồng bộ KHỐI ĐẦU TIÊN của MO — đúng thứ tự route thực hiện.
 *
 * "Chưa đủ 4 ô → SKIPPED" nay do lớp điều phối quyết định (không có khối nào thì bỏ qua MO),
 * nên helper tái hiện đúng nhánh đó thay vì gọi xuống hàm khối.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sync(tx: any, extra: Record<string, unknown>, now: Date = NOW) {
  const blocks = readDesign3DBlocks(extra, ITEM_ID);
  if (blocks.length === 0) return { status: "SKIPPED" as const };

  const lookups = await loadDesign3DLookups(tx);
  const active = await tx.design3DAssignment.findMany();
  return syncDesign3DAssignmentBlock(
    tx,
    lookups,
    {
      orderId: "order-1",
      orderItemId: ITEM_ID,
      extraData: extra,
      assignedById: "user-1",
      block: blocks[0],
      active,
      claimed: new Set<string>(),
      usedDesignerIds: new Set<string>(),
    },
    now,
  );
}

describe("Đồng bộ lượt giao việc 3D — phân biệt 'đang nhập dở' với 'cấu hình thiếu'", () => {
  it("chưa điền đủ 4 ô giao việc → SKIPPED, KHÔNG cảnh báo (user đang nhập dở)", async () => {
    const { tx } = fakeTx();
    const res = await sync(tx, extraData({ gioGiao3D: "" }));
    expect(res.status).toBe("SKIPPED");
  });

  it("điền đủ + cấu hình đúng → OK, tạo assignment kèm deadline đã tính", async () => {
    const { tx, created } = fakeTx();
    const res = await sync(tx, extraData());

    expect(res.status).toBe("OK");
    if (res.status !== "OK") return;
    expect(res.patch.kpi3DStandardMinutes).toBe(240);
    expect(res.patch.deadline).not.toBe("");
    expect(created).toHaveLength(1);
  });

  // 🔴 LỖI ĐÃ GHI SAI SỐ KPI, KHÔNG CHỈ HIỆN SAI — và cho tới nay chỉ được ghi bằng comment.
  //
  // Khối tự khai ra rằng nó cũ: nó nêu tên một lượt không còn trong `active`. Chỉ có hai cách
  // một id rời khỏi `active` (REASSIGNED, CANCELLED) và cả hai nghĩa là có người đã đóng lượt
  // đó ở màn Việc thiết kế 3D sau khi form được mở.
  //
  // Trước bản sửa, id chết bị bỏ qua rồi tụt xuống nhánh "cùng nhân viên", và với lượt tiếp
  // theo (rất thường là CÙNG người) nó vơ đúng lượt MỚI rồi ghi mốc giao + ngân sách cũ lên đó
  // — ngân sách riêng của giai đoạn tiếp theo bị trả về nguyên suất giờ của nhóm. Nếu lượt mới
  // giao cho NGƯỜI KHÁC thì tệ hơn: tạo thêm một lượt song song, tức một suất KPI từ hư không.
  //
  // ⚠️ CHẶN, không tự sửa: ở đây không có cách nào biết khối lẽ ra ứng với lượt nào — đoán tiếp
  // chính là lỗi vừa nêu.
  it("khối mang id của một lượt ĐÃ ĐÓNG → BLOCKED, KHÔNG đoán sang lượt khác", async () => {
    const { tx, created } = fakeTx();
    const res = await sync(tx, extraData({ kpi3DAssignmentId: "luot-da-dong" }));

    expect(res.status).toBe("BLOCKED");
    if (res.status !== "BLOCKED") return;
    expect(res.reason).toContain("tải lại đơn");
    // Không tạo lượt song song — đó là đường sinh ra "một suất KPI từ hư không".
    expect(created).toHaveLength(0);
  });

  it("nhóm KPI chưa nhập số giờ → BLOCKED, lý do chỉ đúng chỗ cần sửa", async () => {
    const { tx, created } = fakeTx({
      groups: [{ id: "g-1", name: "Nhóm 1", code: "GROUP_1", standardMinutes: 0 }],
    });
    const res = await sync(tx, extraData());

    expect(res.status).toBe("BLOCKED");
    if (res.status !== "BLOCKED") return;
    expect(res.reason).toContain("chưa nhập số giờ KPI");
    expect(created).toHaveLength(0); // không tạo assignment dở dang
  });

  it("nhóm KPI chưa bật active (không có trong danh sách) → BLOCKED nêu tên nhóm", async () => {
    const { tx } = fakeTx({ groups: [] });
    const res = await sync(tx, extraData());

    expect(res.status).toBe("BLOCKED");
    if (res.status !== "BLOCKED") return;
    expect(res.reason).toContain("Nhóm 1");
    expect(res.reason).toContain("Cấu hình 3D KPI");
  });

  it("không tìm thấy nhân viên đang hoạt động → BLOCKED nêu tên nhân viên", async () => {
    const { tx } = fakeTx({ designers: [] });
    const res = await sync(tx, extraData());

    expect(res.status).toBe("BLOCKED");
    if (res.status !== "BLOCKED") return;
    expect(res.reason).toContain("TUỆ ANH");
  });

  it("chưa có lịch làm việc nào đang hoạt động → BLOCKED", async () => {
    const { tx } = fakeTx({ calendar: null });
    const res = await sync(tx, extraData());

    expect(res.status).toBe("BLOCKED");
    if (res.status !== "BLOCKED") return;
    expect(res.reason).toContain("Lịch làm việc");
  });

  it("khớp nhóm theo MÃ nhóm chứ không chỉ theo tên", async () => {
    const { tx } = fakeTx();
    const res = await sync(tx, extraData({ phanNhom3D: "GROUP_1" }));
    expect(res.status).toBe("OK");
  });

  it("assignment mới ghi lại ĐÚNG ngày giao (ngayGiao3D), không chỉ giờ", async () => {
    // LỖI ĐÃ SỬA: bản cũ chỉ ghi gioGiao3D vào patch, không có ngayGiao3D — lần lưu kế tiếp
    // đọc lại ngày CŨ (form không đổi) trong khi giờ đã là bản mới, hai giá trị không khớp
    // BẤT KỲ assignedAt thật nào → hệ thống hiểu lầm là bàn giao, tạo lượt rác + spam thông báo.
    const { tx } = fakeTx();
    const res = await sync(tx, extraData());
    expect(res.status).toBe("OK");
    if (res.status !== "OK") return;
    expect(res.patch.ngayGiao3D).toBe("2026-08-03");
  });
});

describe("Bàn giao (đổi nhân viên) — nguồn lỗi từng khiến người mới bị chấm TRỄ oan", () => {
  // Lượt của "NV CŨ" (d-old), giao từ tuần trước — form vẫn còn giữ Y HỆT ngày/giờ này vì
  // trước khi sửa, hệ thống không ghi ngược ngayGiao3D nên form không bao giờ tự cập nhật.
  const oldAssignedAt = new Date("2026-07-27T02:00:00.000Z"); // 09:00 giờ VN, thứ Hai tuần trước
  const activeOld: ActiveAssignmentStub = {
    id: "asg-old",
    designer3DId: "d-old",
    kpiGroupId: "g-1",
    standardMinutesSnapshot: 240,
    assignedAt: oldAssignedAt,
    deadlineAt: new Date("2026-07-27T08:00:00.000Z"),
  };

  const designers = [{ id: "d-old", name: "NV CŨ" }, { id: "d-new", name: "NV MỚI" }];

  // Form còn nguyên giá trị của NV CŨ ("2026-07-27" / "09:00") — Order chỉ đổi tên ở ô Nhân
  // viên, không chạm ngày/giờ. Đây chính là hiện trạng lỗi: form không tự cập nhật trước khi
  // có fix ghi lại ngayGiao3D.
  const staleFormAfterRename = () => extraData(
    { ngayGiao3D: "2026-07-27", gioGiao3D: "09:00" },
    "NV MỚI",
  );

  it("chỉ đổi tên thợ, KHÔNG sửa ngày/giờ → coi là bàn giao, dùng THỜI ĐIỂM LƯU làm mốc mới", async () => {
    const { tx, created } = fakeTx({ designers, activeAssignment: activeOld });
    const res = await sync(tx, staleFormAfterRename(), NOW);

    expect(res.status).toBe("OK");
    if (res.status !== "OK") return;
    // KHÔNG dùng "2026-07-27" (giá trị cũ sót lại) — phải là NOW (2026-08-03, 09:00 giờ VN).
    expect(res.patch.ngayGiao3D).toBe("2026-08-03");
    expect(res.patch.gioGiao3D).toBe("09:00");
    expect(created[0]?.assignedAt).toEqual(NOW);
  });

  it("đóng lượt CŨ (REASSIGNED) và trỏ reassignedFromId về đúng lượt đó", async () => {
    const { tx, created, updated } = fakeTx({ designers, activeAssignment: activeOld });
    await sync(tx, staleFormAfterRename(), NOW);

    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe("asg-old");
    expect(updated[0].data.status).toBe("REASSIGNED");
    expect(created[0]?.reassignedFromId).toBe("asg-old");
    expect(created[0]?.designer3DId).toBe("d-new");
  });

  it("lượt CŨ phải có reassignedAt — thiếu nó là báo cáo coi người cũ đang 'chờ buông'", async () => {
    // TRƯỚC KHI SỬA, chỗ này ghi ĐÚNG MỘT trường: { status: "REASSIGNED" }. Báo cáo đọc
    // `isReassignedAway = reassignedAt != null` thành false, nên một lượt ĐÃ BỊ NGƯỜI KHÁC TIẾP
    // QUẢN lại rơi vào nhánh "đơn chờ buông", và `donChuaHT` của người cũ KHÔNG được trừ — họ
    // gánh vĩnh viễn một đơn không còn cách nào hoàn thành.
    const { tx, updated } = fakeTx({ designers, activeAssignment: activeOld });
    await sync(tx, staleFormAfterRename(), NOW);

    expect(updated[0].data.reassignedAt).toEqual(NOW);
  });

  it("KHÔNG đóng dấu phán quyết kiểm — ở đường lưu form không có ai kiểm cả", async () => {
    // Route reassign ghi reviewStatus/reviewedAt vì ở đó có người thật bấm. Ghi ở đây là lưu lại
    // một việc chưa từng xảy ra.
    const { tx, updated } = fakeTx({ designers, activeAssignment: activeOld });
    await sync(tx, staleFormAfterRename(), NOW);

    expect(updated[0].data.reviewStatus).toBeUndefined();
    expect(updated[0].data.reviewedById).toBeUndefined();
  });

  it("kpiCounted mặc định TRUE — chưa ai quyết định thì không được lặng lẽ cắt công", async () => {
    // Đường này không có hộp thoại. Sai theo hướng tính thừa còn nhìn thấy được ở báo cáo; sai
    // theo hướng tính thiếu thì không ai biết mà khiếu nại.
    const { tx, updated } = fakeTx({ designers, activeAssignment: activeOld });
    await sync(tx, staleFormAfterRename(), NOW);

    expect(updated[0].data.kpiCounted).toBe(true);
  });

  it("Order CHỦ Ý sửa ngày/giờ khác giá trị cũ → tôn trọng giá trị đã nhập, KHÔNG ép về NOW", async () => {
    const { tx } = fakeTx({ designers, activeAssignment: activeOld });
    // Hẹn người mới bắt đầu 08:00 SÁNG MAI (khác NOW=03/08 09:00) — một lựa chọn có chủ ý.
    const res = await sync(
      tx,
      extraData({ ngayGiao3D: "2026-08-04", gioGiao3D: "08:00" }, "NV MỚI"),
      NOW,
    );
    expect(res.status).toBe("OK");
    if (res.status !== "OK") return;
    expect(res.patch.ngayGiao3D).toBe("2026-08-04");
    expect(res.patch.gioGiao3D).toBe("08:00");
  });

  it("CHỐT CHẶN CHỐNG SPAM: lưu lại lần nữa sau bàn giao (đúng NV mới, đúng ngày/giờ vừa ghi) → KHÔNG tạo lượt mới, KHÔNG báo lại", async () => {
    // Mô phỏng lần lưu THỨ HAI: activeAssignment giờ đã là của NV MỚI, với đúng assignedAt =
    // NOW của lần lưu trước — đây là trạng thái sau khi patch đã ghi ngược vào form.
    const activeNew: ActiveAssignmentStub = {
      id: "asg-new-1",
      designer3DId: "d-new",
      kpiGroupId: "g-1",
      standardMinutesSnapshot: 240,
      assignedAt: NOW,
      deadlineAt: new Date("2026-08-03T08:00:00.000Z"),
    };
    const { tx, created, updated } = fakeTx({ designers, activeAssignment: activeNew });

    // Form đã được ghi ngược đúng giá trị của NV MỚI ở lần lưu trước — bây giờ Order chỉ lưu
    // lại đơn (VD sửa một trường không liên quan), KHÔNG đổi gì ở phần thiết kế 3D.
    const res = await sync(tx, extraData({ ngayGiao3D: "2026-08-03", gioGiao3D: "09:00" }, "NV MỚI"), NOW);

    expect(res.status).toBe("OK");
    if (res.status !== "OK") return;
    expect(res.created).toBe(false); // khớp lượt đã có — tuyệt đối không tạo thêm
    expect(created).toHaveLength(0);
    expect(updated).toHaveLength(0); // không đóng lượt nào vì không có bàn giao mới
  });
});

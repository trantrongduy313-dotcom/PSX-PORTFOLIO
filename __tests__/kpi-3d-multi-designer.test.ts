import { describe, expect, it } from "vitest";

import {
  applyDesign3DPatches,
  readDesign3DBlocks,
  removeDesign3DBlocks,
  resolveDesign3DSyncTargets,
} from "@/app/lib/business/kpi-3d/assignment-targets";
import { syncDesign3DAssignments } from "@/app/lib/business/kpi-3d/assignment";

// ─── Một MO, nhiều NV 3D ─────────────────────────────────────────────────────
//
// Bất biến cũ của hệ thống là "một MO một người": mỗi lần lưu, lượt đang chạy bị đóng thành
// REASSIGNED rồi mở lượt mới. Người thứ hai không thể tồn tại song song.
//
// Điều nguy hiểm nhất khi gỡ bất biến đó không phải là thiếu tính năng mà là ĐI LẠC SLOT: ghi
// deadline/số giờ KPI của người này vào ô của người kia. Không có gì báo lỗi, con số vẫn hợp
// lệ, và KPI sai âm thầm. Phần lớn test dưới đây canh đúng chỗ đó.

const ITEM = "item-1";

function extra(blocks: {
  first?: Record<string, unknown> | null;
  firstTho?: string;
  designers?: Array<Record<string, unknown>>;
}) {
  return {
    perItem: {
      [ITEM]: {
        ...(blocks.firstTho !== undefined ? { tho3d: blocks.firstTho } : {}),
        ...(blocks.first !== null ? { design: blocks.first ?? FULL } : {}),
        ...(blocks.designers ? { designers: blocks.designers } : {}),
      },
    },
  };
}

const FULL = { phanNhom3D: "Nhóm 1", ngayGiao3D: "2026-08-03", gioGiao3D: "09:00" };

describe("Đọc danh sách khối NV 3D từ payload", () => {
  it("dữ liệu cũ (chỉ một người) đọc ra đúng MỘT khối, slot 0", () => {
    const blocks = readDesign3DBlocks(extra({ firstTho: "TUỆ ANH" }), ITEM);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].slot).toBe(0);
    expect(blocks[0].designerName).toBe("TUỆ ANH");
  });

  it("người thứ hai KHÔNG nhân bản khối gốc — hai khối, hai slot khác nhau", () => {
    const blocks = readDesign3DBlocks(
      extra({
        firstTho: "TUỆ ANH",
        designers: [{ tho3d: "MỸ NGỌC", ...FULL, ngayGiao3D: "2026-08-05" }],
      }),
      ITEM,
    );
    expect(blocks.map((b) => [b.slot, b.designerName])).toEqual([
      [0, "TUỆ ANH"],
      [1, "MỸ NGỌC"],
    ]);
    // Mốc giao của hai người KHÁC nhau — chính là lý do phải tách khối chứ không gom tên.
    expect(blocks[0].assignedDate).toBe("2026-08-03");
    expect(blocks[1].assignedDate).toBe("2026-08-05");
  });

  it("khối nhập dở bị bỏ qua, KHÔNG làm lệch slot của người phía sau", () => {
    const blocks = readDesign3DBlocks(
      extra({
        firstTho: "TUỆ ANH",
        designers: [
          { tho3d: "CHƯA XONG", phanNhom3D: "Nhóm 1" }, // thiếu ngày/giờ
          { tho3d: "MỸ NGỌC", ...FULL },
        ],
      }),
      ITEM,
    );
    expect(blocks).toHaveLength(2);
    // MỸ NGỌC đứng thứ 2 trong mảng `designers` → slot 2, KHÔNG phải slot 1. Nếu đánh lại số
    // theo thứ tự kết quả thì bản vá sẽ ghi vào ô của người đang nhập dở.
    expect(blocks[1].slot).toBe(2);
  });

  it("khối gốc trống nhưng có người thứ hai → MO vẫn được đồng bộ", () => {
    const payload = extra({ first: null, designers: [{ tho3d: "MỸ NGỌC", ...FULL }] });
    expect(readDesign3DBlocks(payload, ITEM)).toHaveLength(1);
    expect(resolveDesign3DSyncTargets(payload, [ITEM])).toEqual([ITEM]);
  });

  it("đọc được giờ thực tế riêng của từng người", () => {
    const blocks = readDesign3DBlocks(
      extra({
        firstTho: "TUỆ ANH",
        first: { ...FULL, gioThucTe: 1.5 },
        designers: [{ tho3d: "MỸ NGỌC", ...FULL, gioThucTe: "2.5" }],
      }),
      ITEM,
    );
    expect(blocks.map((b) => b.actualHours)).toEqual([1.5, 2.5]);
  });
});

describe("Ghi bản vá về ĐÚNG khối đã sinh ra nó", () => {
  it("slot 0 vào design gốc, slot 1 vào designers[0] — không lẫn sang nhau", () => {
    const before = extra({
      firstTho: "TUỆ ANH",
      designers: [{ tho3d: "MỸ NGỌC", ...FULL }],
    });
    const after = applyDesign3DPatches(
      before,
      new Map([[ITEM, [
        { slot: 0, kpi3DAssignmentId: "asg-1", deadline: "2026-08-04" },
        { slot: 1, kpi3DAssignmentId: "asg-2", deadline: "2026-08-06" },
      ]]]),
    );

    const item = (after.perItem as Record<string, Record<string, unknown>>)[ITEM];
    expect((item.design as Record<string, unknown>).kpi3DAssignmentId).toBe("asg-1");
    expect((item.designers as Array<Record<string, unknown>>)[0].kpi3DAssignmentId).toBe("asg-2");
    expect((item.design as Record<string, unknown>).deadline).toBe("2026-08-04");
  });

  it("giữ nguyên các trường KHÔNG nằm trong bản vá", () => {
    const before = extra({ firstTho: "TUỆ ANH", first: { ...FULL, yeucauThietKe: "Gấp" } });
    const after = applyDesign3DPatches(before, new Map([[ITEM, [{ slot: 0, deadline: "x" }]]]));
    const item = (after.perItem as Record<string, Record<string, unknown>>)[ITEM];
    expect((item.design as Record<string, unknown>).yeucauThietKe).toBe("Gấp");
    expect(item.tho3d).toBe("TUỆ ANH");
  });

  it("slot trỏ ra ngoài mảng → bỏ qua, KHÔNG ghi bừa vào ô khác", () => {
    const before = extra({ firstTho: "TUỆ ANH", designers: [{ tho3d: "MỸ NGỌC", ...FULL }] });
    const after = applyDesign3DPatches(before, new Map([[ITEM, [{ slot: 5, deadline: "sai" }]]]));
    const item = (after.perItem as Record<string, Record<string, unknown>>)[ITEM];
    const designers = item.designers as Array<Record<string, unknown>>;
    expect(designers).toHaveLength(1);
    expect(designers[0].deadline).toBeUndefined();
  });

  it("không sửa tại chỗ — object gốc giữ nguyên", () => {
    const before = extra({ firstTho: "TUỆ ANH" });
    const snapshot = JSON.stringify(before);
    applyDesign3DPatches(before, new Map([[ITEM, [{ slot: 0, deadline: "2026-08-04" }]]]));
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

// ─── Đồng bộ thật, qua điểm vào của route ────────────────────────────────────

const CALENDAR = {
  id: "cal-1",
  sessions: [
    { dayOfWeek: 1, startMinute: 480, endMinute: 1020 },
    { dayOfWeek: 3, startMinute: 480, endMinute: 1020 },
  ],
  holidays: [],
};

const NOW = new Date("2026-08-03T02:00:00.000Z"); // thứ Hai 09:00 giờ VN

type Stub = {
  id: string;
  designer3DId: string;
  kpiGroupId: string;
  assignedAt: Date;
  standardMinutesSnapshot: number;
  deadlineAt: Date;
  actualMinutes: number | null;
  completedAt: Date | null;
  /** Duyệt KHÔNG đổi `status`, nên đây là thứ DUY NHẤT cho biết lượt đã chốt. */
  reviewStatus?: string | null;
};

function fakeTx(active: Stub[] = []) {
  const created: Record<string, unknown>[] = [];
  const updated: Array<{ id: string; data: Record<string, unknown> }> = [];
  let seq = 0;
  return {
    created,
    updated,
    tx: {
      designer3D: {
        findMany: async () => [
          { id: "d-1", name: "TUỆ ANH" },
          { id: "d-2", name: "MỸ NGỌC" },
        ],
      },
      kpi3DGroup: {
        findMany: async () => [{ id: "g-1", name: "Nhóm 1", code: "G1", standardMinutes: 240 }],
      },
      workingCalendar: { findFirst: async () => CALENDAR },
      // Đường bàn giao nay còn đóng nốt khoảng tạm dừng còn mở (handover-freeze.ts) — lượt đã
      // đóng mà còn khoảng dừng chưa mở lại thì mọi màn hình đọc theo resumedAt = null sẽ hiện
      // nó là "đang tạm dừng" vĩnh viễn.
      design3DPause: {
        updateMany: async () => ({ count: 0 }),
      },
      design3DAssignment: {
        // `pauses` là một phần THẬT của select (xem hasOpenPause ở approved-lock.ts) — giả lập
        // thiếu nó thì bản đồ trong syncDesign3DAssignments nổ. Cố ý KHÔNG làm code phòng thủ
        // bằng `pauses?.length`: nếu ai đó lỡ bỏ select thì hasOpenPause sẽ âm thầm thành false,
        // đúng kiểu hỏng im lặng mà cả chốt chặn này sinh ra để chặn. Thà mock phải theo thật.
        findMany: async () => active.map((a) => ({ pauses: [], ...a })),
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updated.push({ id: where.id, data });
          return {};
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: `asg-new-${++seq}`, ...data };
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

describe("Rút khối bị TỪ CHỐI khỏi payload", () => {
  // ⚠️ TEST QUAN TRỌNG NHẤT KHỐI NÀY.
  // Trước đây route ghi extraData nguyên vẹn dù đồng bộ trả về BLOCKED, nên sidebar vẫn hiện khối
  // "Nhân viên 3D #2" với người vừa chọn — kể cả sau khi tải lại trang — dù KHÔNG có lượt giao
  // việc nào được tạo. JSON nói có người thứ hai, bảng nói không.
  it("khối người thứ hai bị từ chối → BỎ HẲN khỏi mảng designers", () => {
    const before = extra({ firstTho: "TUỆ ANH", designers: [{ tho3d: "MỸ NGỌC", ...FULL }] });
    const after = removeDesign3DBlocks(before, new Map([[ITEM, [{ slot: 1 }]]]));
    const item = (after.perItem as Record<string, Record<string, unknown>>)[ITEM];
    // Không để `designers: []` — khoá rỗng vẫn là một khác biệt so với "chưa từng có người thứ
    // hai", và nó sẽ đi vào lịch sử thay đổi như một lần sửa thật.
    expect(item.designers).toBeUndefined();
    expect(item.tho3d).toBe("TUỆ ANH");
  });

  // Slot 0 là khối CHÍNH của MO — không xoá được, vì nó còn mang nhóm KPI, mốc giao, ghi chú.
  // Thứ bị từ chối chỉ là CÁI TÊN vừa đổi.
  it("khối gốc bị từ chối → TRẢ LẠI tên cũ, giữ nguyên các trường khác", () => {
    const before = extra({ firstTho: "MỸ NGỌC", first: { ...FULL, yeucauThietKe: "Gấp" } });
    const after = removeDesign3DBlocks(
      before,
      new Map([[ITEM, [{ slot: 0, revertDesignerName: "TUỆ ANH" }]]]),
    );
    const item = (after.perItem as Record<string, Record<string, unknown>>)[ITEM];
    expect(item.tho3d).toBe("TUỆ ANH");
    expect((item.design as Record<string, unknown>).yeucauThietKe).toBe("Gấp");
  });

  it("khối gốc bị từ chối mà không có tên cũ → xoá trắng ô tên", () => {
    const before = extra({ firstTho: "MỸ NGỌC" });
    const after = removeDesign3DBlocks(before, new Map([[ITEM, [{ slot: 0 }]]]));
    expect((after.perItem as Record<string, Record<string, unknown>>)[ITEM].tho3d).toBe("");
  });

  // ⚠️ Xoá xuôi thì mỗi splice làm mọi slot phía sau tụt một bậc, và slot tiếp theo trong danh
  // sách sẽ trỏ vào người KHÁC — xoá oan đúng người vô can.
  it("hai khối bị từ chối → xoá đúng hai người đó, không xoá oan người còn lại", () => {
    const before = extra({
      firstTho: "TUỆ ANH",
      designers: [{ tho3d: "A", ...FULL }, { tho3d: "B", ...FULL }, { tho3d: "C", ...FULL }],
    });
    const after = removeDesign3DBlocks(before, new Map([[ITEM, [{ slot: 1 }, { slot: 3 }]]]));
    const designers = (after.perItem as Record<string, Record<string, unknown>>)[ITEM]
      .designers as Array<Record<string, unknown>>;
    expect(designers.map((d) => d.tho3d)).toEqual(["B"]);
  });

  it("slot trỏ ra ngoài mảng → bỏ qua, không xoá bừa", () => {
    const before = extra({ firstTho: "TUỆ ANH", designers: [{ tho3d: "A", ...FULL }] });
    const after = removeDesign3DBlocks(before, new Map([[ITEM, [{ slot: 9 }]]]));
    const designers = (after.perItem as Record<string, Record<string, unknown>>)[ITEM]
      .designers as Array<Record<string, unknown>>;
    expect(designers).toHaveLength(1);
  });

  it("không có gì bị từ chối → trả về ĐÚNG object cũ, không sinh bản sao", () => {
    const before = extra({ firstTho: "TUỆ ANH" });
    expect(removeDesign3DBlocks(before, new Map())).toBe(before);
  });

  it("không sửa tại chỗ — object gốc giữ nguyên", () => {
    const before = extra({ firstTho: "TUỆ ANH", designers: [{ tho3d: "A", ...FULL }] });
    const snapshot = JSON.stringify(before);
    removeDesign3DBlocks(before, new Map([[ITEM, [{ slot: 1 }]]]));
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("Đồng bộ một MO có nhiều NV 3D", () => {
  it("hai người → HAI lượt giao việc, KHÔNG ai bị đóng thành REASSIGNED", async () => {
    const { tx, created, updated } = fakeTx();
    const res = await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({
        firstTho: "TUỆ ANH",
        designers: [{ tho3d: "MỸ NGỌC", ...FULL, ngayGiao3D: "2026-08-05" }],
      }),
      validItemIds: [ITEM],
      now: NOW,
    });

    expect(created).toHaveLength(2);
    expect(created.map((c) => c.designer3DId)).toEqual(["d-1", "d-2"]);
    // ĐÂY là bất biến cũ đã được gỡ. Trước khi sửa, người thứ hai làm người thứ nhất bị đóng.
    expect(updated).toHaveLength(0);
    expect(res.createdAssignmentIds).toHaveLength(2);
    expect(res.warnings).toEqual([]);
  });

  it("mỗi người có deadline riêng theo mốc giao của chính họ", async () => {
    const { tx } = fakeTx();
    const res = await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({
        firstTho: "TUỆ ANH",
        designers: [{ tho3d: "MỸ NGỌC", ...FULL, ngayGiao3D: "2026-08-05" }],
      }),
      validItemIds: [ITEM],
      now: NOW,
    });

    const patches = res.patches.get(ITEM)!;
    expect(patches.map((p) => p.slot)).toEqual([0, 1]);
    expect(patches[0].ngayGiao3D).toBe("2026-08-03");
    expect(patches[1].ngayGiao3D).toBe("2026-08-05");
    expect(patches[0].deadline).not.toBe(patches[1].deadline);
  });

  it("KHÔNG chiếu giờ thực tế trong JSON vào cột actualMinutes của bảng", async () => {
    // ĐỔI HÀNH VI CÓ CHỦ Ý. Cột `actualMinutes` nay là SỐ HỆ THỐNG ĐO, đóng dấu một lần lúc NV
    // gửi kết quả (resolveAssignmentStateAfterProgress đo giờ làm việc theo Working Calendar).
    // Còn `gioThucTe` trong JSON là số Order SỬA TAY.
    //
    // Nếu vẫn chiếu JSON vào cột thì mỗi lần Order lưu đơn sẽ ghi đè số hệ thống vừa đo bằng
    // số cũ trong JSON — thường là 0 — và con số hệ thống biến mất mà không ai thấy. Đúng cái
    // làm màn hình hiện "Giờ thực tế 0 / Số ngày HT —" cho đơn đã duyệt xong.
    const { tx, created } = fakeTx();
    await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({
        firstTho: "TUỆ ANH",
        first: { ...FULL, gioThucTe: 1.5 },
        designers: [{ tho3d: "MỸ NGỌC", ...FULL, gioThucTe: 2.5 }],
      }),
      validItemIds: [ITEM],
      now: NOW,
    });
    expect(created.map((c) => c.actualMinutes)).toEqual([undefined, undefined]);
  });

  it("lưu lại lần nữa không tạo thêm lượt nào (chống spam thông báo)", async () => {
    const existing: Stub[] = [
      {
        id: "asg-1", designer3DId: "d-1", kpiGroupId: "g-1",
        assignedAt: new Date("2026-08-03T02:00:00.000Z"),
        standardMinutesSnapshot: 240, deadlineAt: new Date("2026-08-03T09:00:00.000Z"),
        actualMinutes: null, completedAt: null,
      },
      {
        id: "asg-2", designer3DId: "d-2", kpiGroupId: "g-1",
        assignedAt: new Date("2026-08-05T02:00:00.000Z"),
        standardMinutesSnapshot: 240, deadlineAt: new Date("2026-08-05T09:00:00.000Z"),
        actualMinutes: null, completedAt: null,
      },
    ];
    const { tx, created, updated } = fakeTx(existing);
    const res = await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({
        firstTho: "TUỆ ANH",
        first: { ...FULL, kpi3DAssignmentId: "asg-1" },
        designers: [{ tho3d: "MỸ NGỌC", ...FULL, ngayGiao3D: "2026-08-05", kpi3DAssignmentId: "asg-2" }],
      }),
      validItemIds: [ITEM],
      now: NOW,
    });

    expect(created).toHaveLength(0);
    expect(updated).toHaveLength(0);
    expect(res.createdAssignmentIds).toEqual([]);
  });

  // ─── ĐÃ DUYỆT LÀ CHỐT ─────────────────────────────────────────────────────
  //
  // Ba cửa tạo lượt trên màn Việc thiết kế 3D đều đã chặn ACCEPTED. Đường NÀY — đồng bộ từ form
  // đơn hàng, chạy ở MỌI lần lưu tab Thiết kế — thì không, và nó không tự thấy được: duyệt KHÔNG
  // đổi `status` nên lượt đã duyệt vẫn mang SENT_RESULT và vẫn nằm trong `active`.
  //
  // Hai test dưới đi qua ĐÚNG đường thật (syncDesign3DAssignments), không chỉ test luật thuần.
  it("MO đã duyệt → thêm NV 3D nữa bị CHẶN, không tạo lượt nào", async () => {
    const { tx, created } = fakeTx([{
      id: "asg-1", designer3DId: "d-1", kpiGroupId: "g-1",
      assignedAt: new Date("2026-08-03T02:00:00.000Z"),
      standardMinutesSnapshot: 240, deadlineAt: new Date("2026-08-03T09:00:00.000Z"),
      actualMinutes: 200, completedAt: new Date("2026-08-03T08:00:00.000Z"),
      reviewStatus: "ACCEPTED",
    }]);

    const res = await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({
        firstTho: "TUỆ ANH",
        designers: [{ tho3d: "MỸ NGỌC", ...FULL, ngayGiao3D: "2026-08-05" }],
      }),
      validItemIds: [ITEM],
      now: NOW,
    });

    expect(created).toHaveLength(0);
    expect(res.warnings.join()).toContain("ĐƯỢC DUYỆT");
    // Lời chặn phải CHỈ ĐƯỜNG, và chỉ tới đường CÒN TỒN TẠI: nút "Yêu cầu làm lại" đã bỏ khỏi
    // lượt đã duyệt, nên đường đúng là tạo phiên bản mới.
    expect(res.warnings.join()).toContain("PHIÊN BẢN MỚI");
    // ⚠️ VÀ PHẢI ĐÁNH DẤU ĐỂ RÚT KHỎI extraData. Không có bước này thì JSON lưu một khối mà bảng
    // không có, và sidebar hiện nó như thật kể cả sau khi tải lại trang.
    expect(res.rejected.get(ITEM)).toEqual([{ slot: 1, revertDesignerName: null }]);
  });

  // ⚠️ KHÔNG ĐƯỢC CHẶN: Order lưu đơn vì sửa tên khách thì đường này vẫn chạy và vẫn khớp lại
  // đúng lượt đã duyệt của đúng người đó. Chặn ca này nghĩa là MỌI lần lưu một đơn đã duyệt đều
  // nổ cảnh báo — rồi người dùng học cách bỏ qua cảnh báo, kể cả cảnh báo thật.
  it("MO đã duyệt → lưu lại KHÔNG đổi gì thì không cảnh báo, không tạo lượt", async () => {
    const { tx, created } = fakeTx([{
      id: "asg-1", designer3DId: "d-1", kpiGroupId: "g-1",
      assignedAt: new Date("2026-08-03T02:00:00.000Z"),
      standardMinutesSnapshot: 240, deadlineAt: new Date("2026-08-03T09:00:00.000Z"),
      actualMinutes: 200, completedAt: new Date("2026-08-03T08:00:00.000Z"),
      reviewStatus: "ACCEPTED",
    }]);

    const res = await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({ firstTho: "TUỆ ANH" }),
      validItemIds: [ITEM],
      now: NOW,
    });

    expect(created).toHaveLength(0);
    expect(res.warnings).toEqual([]);
    // Không chặn thì cũng không được rút gì — ô của người đang làm phải còn nguyên.
    expect(res.rejected.size).toBe(0);
  });

  it("thêm người thứ hai KHÔNG đụng tới lượt của người thứ nhất", async () => {
    const existing: Stub[] = [{
      id: "asg-1", designer3DId: "d-1", kpiGroupId: "g-1",
      assignedAt: new Date("2026-08-03T02:00:00.000Z"),
      standardMinutesSnapshot: 240, deadlineAt: new Date("2026-08-03T09:00:00.000Z"),
      actualMinutes: null, completedAt: null,
    }];
    const { tx, created, updated } = fakeTx(existing);
    await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({
        firstTho: "TUỆ ANH",
        first: { ...FULL, kpi3DAssignmentId: "asg-1" },
        designers: [{ tho3d: "MỸ NGỌC", ...FULL }],
      }),
      validItemIds: [ITEM],
      now: NOW,
    });

    expect(created).toHaveLength(1);
    expect(created[0].designer3DId).toBe("d-2");
    // Người mới KHÔNG được mang reassignedFromId: họ không thay ai cả, họ làm song song.
    expect(created[0].reassignedFromId).toBeNull();
    expect(updated).toHaveLength(0);
  });

  it("chọn TRÙNG một người trong cùng MO → BLOCKED nêu tên, không tạo lượt thứ hai", async () => {
    const { tx, created } = fakeTx();
    const res = await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({
        firstTho: "TUỆ ANH",
        designers: [{ tho3d: "TUỆ ANH", ...FULL, ngayGiao3D: "2026-08-05" }],
      }),
      validItemIds: [ITEM],
      now: NOW,
    });

    expect(created).toHaveLength(1);
    expect(res.warnings.join()).toContain("TUỆ ANH");
    // Chặn SONG SONG, không chặn NHIỀU LẦN. Câu cũ nói "Mỗi người chỉ nhận một lượt giao việc cho
    // một MO" và test này khoá chữ "nhiều lần" — cả hai đều KHÔNG còn đúng kể từ khi có luồng giao
    // lượt tiếp theo: một người nhận nhiều lượt cho một MO là nghiệp vụ có thật, chỉ không được
    // CÙNG LÚC. Người dùng đọc câu cũ rồi tưởng hệ thống không hỗ trợ làm nhiều lần.
    expect(res.warnings.join()).toContain("CÙNG LÚC");
    // Và phải CHỈ ĐƯỜNG sang đúng cửa, không chỉ nói "không được".
    expect(res.warnings.join()).toContain("Giao lượt tiếp theo");
  });

  it("đổi mốc giao của người ĐÃ HOÀN TẤT không ghi đè phán quyết KPI đã đóng dấu", async () => {
    const existing: Stub[] = [{
      id: "asg-1", designer3DId: "d-1", kpiGroupId: "g-1",
      assignedAt: new Date("2026-08-03T02:00:00.000Z"),
      standardMinutesSnapshot: 240, deadlineAt: new Date("2026-08-03T09:00:00.000Z"),
      actualMinutes: null, completedAt: new Date("2026-08-03T07:00:00.000Z"),
    }];
    const { tx, created, updated } = fakeTx(existing);
    await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({
        firstTho: "TUỆ ANH",
        // Order sửa ngày giao SAU KHI việc đã xong — deadline cũ mới là căn cứ của kpiStatus.
        first: { ...FULL, ngayGiao3D: "2026-08-05", kpi3DAssignmentId: "asg-1" },
      }),
      validItemIds: [ITEM],
      now: NOW,
    });

    expect(created).toHaveLength(0);
    expect(updated).toHaveLength(0); // không đụng deadlineAt, không đụng kpiStatus
  });

  it("đổi tên ở ô của người thứ hai = bàn giao ô đó, người thứ nhất vẫn nguyên", async () => {
    const existing: Stub[] = [
      {
        id: "asg-1", designer3DId: "d-1", kpiGroupId: "g-1",
        assignedAt: new Date("2026-08-03T02:00:00.000Z"),
        standardMinutesSnapshot: 240, deadlineAt: new Date("2026-08-03T09:00:00.000Z"),
        actualMinutes: null, completedAt: null,
      },
      {
        id: "asg-2", designer3DId: "d-2", kpiGroupId: "g-1",
        assignedAt: new Date("2026-08-05T02:00:00.000Z"),
        standardMinutesSnapshot: 240, deadlineAt: new Date("2026-08-05T09:00:00.000Z"),
        actualMinutes: null, completedAt: null,
      },
    ];
    const { tx, created, updated } = fakeTx(existing);
    await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({
        firstTho: "TUỆ ANH",
        first: { ...FULL, kpi3DAssignmentId: "asg-1" },
        // Ô số 2 vẫn trỏ asg-2 nhưng tên đổi sang người khác → chỉ ô đó bàn giao.
        designers: [{ tho3d: "MỸ NGỌC", ...FULL, kpi3DAssignmentId: "asg-2" }],
      }),
      validItemIds: [ITEM],
      now: NOW,
    });

    // asg-2 vốn đã là d-2 = MỸ NGỌC → không có bàn giao, chỉ đổi mốc giao.
    expect(created).toHaveLength(0);
    expect(updated.map((u) => u.id)).toEqual(["asg-2"]);
    expect(updated[0].data.assignedAt).toBeDefined();
  });
});

// ─── HAI CỬA GHI, MỘT SỰ THẬT ────────────────────────────────────────────────
//
// Màn Việc thiết kế 3D ghi thẳng vào BẢNG (giao lượt tiếp theo, đổi người). Form đơn hàng ghi cả
// bảng lẫn JSON, từ một ẢNH CHỤP lấy lúc form được mở. Không có gì cho biết bảng đã đổi trong
// khoảng giữa — và form đơn hàng không tự làm mới, nên khoảng đó dài bằng "tab còn mở bao lâu".
//
// Hai luật dưới đây là chốt chặn. Chúng KHÔNG phải luật chống race mili-giây: ca ở test đầu xảy ra
// tất yếu mỗi khi có người lưu lại đơn sau một lần giao lượt tiếp theo.
describe("Khối JSON cũ không được ghi đè lượt hiện tại", () => {
  // ⚠️ TEST QUAN TRỌNG NHẤT KHỐI NÀY.
  //
  // Khối slot >= 1 mang `kpi3DAssignmentId` của một lượt ĐÃ ĐÓNG (bị giao lại / huỷ). Trước bản
  // này id chết bị bỏ qua rồi tụt xuống nhánh "cùng nhân viên" — mà luồng giao lượt tiếp theo rất
  // thường là CÙNG người — nên nó vơ đúng lượt MỚI rồi ghi mốc giao + ngân sách cũ lên đó.
  //
  // Lượt ĐÃ HOÀN TẤT vẫn mang SENT_RESULT nên vẫn nằm trong `active`: nhánh này không bắt oan việc
  // đã xong. Chỉ REASSIGNED/CANCELLED rời khỏi `active`, và cả hai đều nghĩa là "có người đã chốt
  // lượt này sau khi form được mở".
  it("khối mang id của lượt ĐÃ ĐÓNG → CHẶN, không ghi đè lượt mới của cùng người", async () => {
    // Bảng chỉ còn lượt MỚI (asg-2), suất giờ RIÊNG 90 phút — phần còn lại sau tạm dừng.
    const { tx, created, updated } = fakeTx([{
      id: "asg-2", designer3DId: "d-2", kpiGroupId: "g-1",
      assignedAt: new Date("2026-08-05T02:00:00.000Z"),
      standardMinutesSnapshot: 90, deadlineAt: new Date("2026-08-05T04:30:00.000Z"),
      actualMinutes: null, completedAt: null,
    }]);

    const res = await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({
        firstTho: "TUỆ ANH",
        first: { ...FULL, kpi3DAssignmentId: "asg-1" },
        // Khối của MỸ NGỌC còn giữ id "asg-9" — lượt đã bị đóng ở màn 3D sau khi form mở.
        designers: [{ tho3d: "MỸ NGỌC", ...FULL, kpi3DAssignmentId: "asg-9" }],
      }),
      validItemIds: [ITEM],
      now: NOW,
    });

    expect(created).toHaveLength(0);
    // KHÔNG được sờ vào asg-2: ngân sách 90 phút của nó phải còn nguyên.
    expect(updated.some((u) => u.id === "asg-2")).toBe(false);
    expect(res.warnings.join()).toContain("dữ liệu CŨ");
    expect(res.warnings.join()).toContain("tải lại đơn");
  });

  // Chặn vì DỮ LIỆU CŨ, không phải vi phạm luật → KHÔNG rút khối khỏi extraData. Xoá ô người dùng
  // vừa điền là bắt họ gõ lại một thứ vốn không sai; tải lại đơn là đủ, vì lúc nạp panel lấy mốc
  // giao / nhóm / ngân sách TỪ BẢNG.
  it("chặn vì khối cũ thì KHÔNG xoá dữ liệu người dùng đã điền", async () => {
    const { tx } = fakeTx([{
      id: "asg-2", designer3DId: "d-2", kpiGroupId: "g-1",
      assignedAt: new Date("2026-08-05T02:00:00.000Z"),
      standardMinutesSnapshot: 90, deadlineAt: new Date("2026-08-05T04:30:00.000Z"),
      actualMinutes: null, completedAt: null,
    }]);
    const res = await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({
        firstTho: "TUỆ ANH",
        designers: [{ tho3d: "MỸ NGỌC", ...FULL, kpi3DAssignmentId: "asg-9" }],
      }),
      validItemIds: [ITEM],
      now: NOW,
    });
    expect(res.rejected.size).toBe(0);
  });

  // ─── SUẤT GIỜ CHỈ ĐỔI KHI NHÓM ĐỔI ───────────────────────────────────────
  //
  // Khối gốc (slot 0) KHÔNG mang id — panel không gửi id cho ô đó — nên nó luôn khớp qua nhánh
  // "cùng nhân viên", và chốt id-chết ở trên không đỡ được ca này. Chốt thứ hai phải nằm ở chính
  // câu UPDATE: đừng ghi lại ngân sách khi không ai yêu cầu đổi nó.
  it("chỉ đổi mốc giao → GIỮ NGUYÊN suất giờ riêng của lượt (không kéo về suất nhóm)", async () => {
    const { tx, updated } = fakeTx([{
      id: "asg-2", designer3DId: "d-1", kpiGroupId: "g-1",
      assignedAt: new Date("2026-08-05T02:00:00.000Z"),
      // 90 phút: phần giờ CÒN LẠI mà luồng giao lượt tiếp theo đã cấp. Suất nhóm là 240.
      standardMinutesSnapshot: 90, deadlineAt: new Date("2026-08-05T04:30:00.000Z"),
      actualMinutes: null, completedAt: null,
    }]);

    await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      // Mốc giao trong JSON là mốc CŨ (03/08) — khác mốc của lượt mới (05/08).
      extraData: extra({ firstTho: "TUỆ ANH", first: FULL }),
      validItemIds: [ITEM],
      now: NOW,
    });

    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe("asg-2");
    // ⚠️ Trường này PHẢI KHÔNG có mặt. Ghi 240 vào đây là xoá sổ toàn bộ ý nghĩa của luồng giao
    // lượt tiếp theo — và con số mới trông hợp lệ vì nó đúng bằng cấu hình nhóm.
    expect(updated[0].data.standardMinutesSnapshot).toBeUndefined();
    expect(updated[0].data.assignedAt).toBeDefined();
  });

  it("đổi NHÓM KPI → suất giờ theo nhóm mới, vì đó là ý định tường minh", async () => {
    const { tx, updated } = fakeTx([{
      id: "asg-2", designer3DId: "d-1", kpiGroupId: "g-khac",
      assignedAt: new Date("2026-08-03T02:00:00.000Z"),
      standardMinutesSnapshot: 90, deadlineAt: new Date("2026-08-03T04:30:00.000Z"),
      actualMinutes: null, completedAt: null,
    }]);

    await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({ firstTho: "TUỆ ANH", first: FULL }), // phanNhom3D "Nhóm 1" = g-1
      validItemIds: [ITEM],
      now: NOW,
    });

    expect(updated).toHaveLength(1);
    expect(updated[0].data.kpiGroupId).toBe("g-1");
    expect(updated[0].data.standardMinutesSnapshot).toBe(240);
  });
});

// ─── LƯỢT ĐANG TẠM DỪNG: ĐÓNG BĂNG, KHÔNG GHI GÌ ─────────────────────────────
//
// Tạm dừng = đã CHỐT SỐ, nghiệp vụ coi ngang một lượt đã xong. Nó đi CHUNG nhánh với
// `completedAt` trong syncDesign3DAssignmentBlock, và vì cùng một lý do: tính lại nhóm KPI hay
// mốc giao bây giờ sẽ dời deadline của một lượt mà số đã chốt xong.
describe("lượt đang tạm dừng — form đơn hàng không ghi được gì", () => {
  const pausedRow = {
    id: "asg-p", designer3DId: "d-1", kpiGroupId: "g-khac",
    assignedAt: new Date("2026-08-03T02:00:00.000Z"),
    standardMinutesSnapshot: 90, deadlineAt: new Date("2026-08-03T04:30:00.000Z"),
    actualMinutes: null, completedAt: null,
    pauses: [{ id: "p-1" }],
  };

  it("đổi NHÓM KPI trên lượt đang dừng → KHÔNG có lệnh ghi nào", async () => {
    // So với test ngay trên: cùng đầu vào, chỉ khác là lượt đang tạm dừng. Không có cờ
    // hasOpenPause thì ca này ghi kpiGroupId + standardMinutesSnapshot 240 và dời deadline.
    const { tx, updated, created } = fakeTx([pausedRow]);

    await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({ firstTho: "TUỆ ANH", first: FULL }),
      validItemIds: [ITEM],
      now: NOW,
    });

    expect(updated).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it("đổi sang NGƯỜI KHÁC trên lượt đang dừng → chặn, KHÔNG bàn giao", async () => {
    // Đây là ca nguy hiểm nhất: không chặn thì lượt cũ bị đóng thành REASSIGNED mà KHÔNG hề
    // ghi actualMinutes — toàn bộ giờ đã chốt của người bị dừng biến mất khỏi báo cáo KPI.
    const { tx, updated, created } = fakeTx([pausedRow]);

    const batch = await syncDesign3DAssignments(tx, {
      orderId: "order-1",
      extraData: extra({ firstTho: "MỸ NGỌC", first: FULL }),
      validItemIds: [ITEM],
      now: NOW,
    });

    expect(created).toHaveLength(0);
    expect(updated.some((u) => u.data.status === "REASSIGNED")).toBe(false);
    expect(batch.warnings.join(" ")).toContain("TẠM DỪNG");
    // Ô tên phải được TRẢ LẠI người cũ, nếu không màn hình hiện một người mà bảng ghi người khác.
    expect(batch.rejected.get(ITEM)?.[0]?.revertDesignerName).toBe("TUỆ ANH");
  });
});

import { describe, expect, it } from "vitest";

import {
  aggregateKpi3DRows,
  extractLegacyRecords,
  mergeKpi3DSources,
  type AssignmentInput,
  type Kpi3DRecord,
} from "@/app/lib/business/kpi-3d/report";

const DESIGNERS = [
  { name: "TUỆ ANH", code: "265" },
  { name: "MỸ NGỌC", code: "608" },
];

const MONTH = "2026-08";

function legacyExtra(design: Record<string, unknown>, opts: { rootTho?: string; itemTho?: string } = {}) {
  return {
    ...(opts.rootTho ? { tho3d: opts.rootTho } : {}),
    perItem: {
      "item-1": {
        ...(opts.itemTho ? { tho3d: opts.itemTho } : {}),
        design,
      },
    },
  };
}

describe("Đọc dữ liệu cũ từ extraData", () => {
  it("lấy được tên nhân viên ở CẤP MO — sửa lỗi báo cáo bỏ sót đơn thiếu tho3d ở gốc", () => {
    const recs = extractLegacyRecords(
      "order-1",
      legacyExtra({ ngayGiao3D: "2026-08-03", ngayHoanThanh3D: "2026-08-04", gioThucTe: 5 }, { itemTho: "TUỆ ANH" }),
    );

    expect(recs).toHaveLength(1);
    expect(recs[0].designerName).toBe("TUỆ ANH");
    expect(recs[0].hoursActual).toBe(5);
  });

  it("tên ở gốc vẫn dùng làm dự phòng khi MO không có", () => {
    const recs = extractLegacyRecords(
      "order-1",
      legacyExtra({ ngayGiao3D: "2026-08-03" }, { rootTho: "MỸ NGỌC" }),
    );
    expect(recs[0].designerName).toBe("MỸ NGỌC");
  });

  it("tên ở cấp MO được ưu tiên hơn tên ở gốc", () => {
    const recs = extractLegacyRecords(
      "order-1",
      legacyExtra({ ngayGiao3D: "2026-08-03" }, { rootTho: "MỸ NGỌC", itemTho: "TUỆ ANH" }),
    );
    expect(recs[0].designerName).toBe("TUỆ ANH");
  });

  it("bỏ qua MO không có cả ngày giao lẫn ngày hoàn tất", () => {
    const recs = extractLegacyRecords("order-1", legacyExtra({ gioThucTe: 3 }, { itemTho: "TUỆ ANH" }));
    expect(recs).toHaveLength(0);
  });

  it("đọc được dữ liệu rất cũ nằm thẳng ở gốc (chưa tách theo MO)", () => {
    const recs = extractLegacyRecords("order-9", {
      tho3d: "TUỆ ANH",
      design: { ngayGiao3D: "2026-08-01", ngayHoanThanh3D: "2026-08-02", ketQua: "Hoàn tất trễ" },
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].key).toBe("order-9:root");
    expect(recs[0].isLate).toBe(true);
  });

  it("extraData rỗng/không hợp lệ → không sinh bản ghi nào", () => {
    expect(extractLegacyRecords("o", null)).toHaveLength(0);
    expect(extractLegacyRecords("o", {})).toHaveLength(0);
  });
});

describe("Gộp hai nguồn — assignment là nguồn chuẩn", () => {
  const assignment: AssignmentInput = {
    id: "asg-1",
    orderItemId: "item-1",
    designerName: "TUỆ ANH",
    assignedAt: new Date("2026-08-03T09:00:00+07:00"),
    completedAt: new Date("2026-08-04T10:00:00+07:00"),
    kpiStatus: "ON_TIME",
    actualMinutes: null,
  };

  it("MO có assignment thì KHÔNG bị đếm hai lần từ dữ liệu cũ", () => {
    const legacy = extractLegacyRecords(
      "order-1",
      legacyExtra({ ngayGiao3D: "2026-08-03", ngayHoanThanh3D: "2026-08-04", gioThucTe: 6 }, { itemTho: "TUỆ ANH" }),
    );
    const merged = mergeKpi3DSources([assignment], legacy);

    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("ASSIGNMENT");
  });

  it("MO chỉ có MỘT người: giờ thực tế vẫn lấy từ dữ liệu cũ (không cần backfill)", () => {
    const legacy = extractLegacyRecords(
      "order-1",
      legacyExtra({ ngayGiao3D: "2026-08-03", gioThucTe: 6.5 }, { itemTho: "TUỆ ANH" }),
    );
    const merged = mergeKpi3DSources([assignment], legacy);
    expect(merged[0].hoursActual).toBe(6.5);
  });

  it("ĐỔI QUY TẮC CÓ CHỦ Ý: số Order SỬA TAY trong JSON thắng số hệ thống đo", () => {
    // Trước đây `actualMinutes` thắng, vì cột đó CŨNG là số Order nhập tay (được chiếu từ
    // JSON sang). Nay cột đó là SỐ HỆ THỐNG ĐO — đóng dấu lúc NV gửi kết quả — nên thứ tự
    // phải đảo: Order chỉ gõ vào khi họ biết điều hệ thống không biết (NV làm hộ máy khác,
    // quên bấm gửi kết quả). Để hệ thống thắng thì ô sửa thành vô nghĩa.
    // Quy tắc khai ở kpi-3d/actual-minutes.ts, dùng chung với sidebar.
    const legacy = extractLegacyRecords(
      "order-1",
      legacyExtra({ ngayGiao3D: "2026-08-03", gioThucTe: 6.5 }, { itemTho: "TUỆ ANH" }),
    );
    const merged = mergeKpi3DSources([{ ...assignment, actualMinutes: 120 }], legacy);
    expect(merged[0].hoursActual).toBe(6.5);
  });

  it("JSON để trống (gioThucTe = 0) → dùng số hệ thống đo, KHÔNG che nó bằng 0", () => {
    // Ô nhập cũ để trống lưu thành 0 và toàn bộ dữ liệu staging đang là 0. Nếu coi 0 là "Order
    // cố ý ghi 0 giờ" thì mọi lượt cũ sẽ che mất số hệ thống vừa đo được.
    const legacy = extractLegacyRecords(
      "order-1",
      legacyExtra({ ngayGiao3D: "2026-08-03", gioThucTe: 0 }, { itemTho: "TUỆ ANH" }),
    );
    const merged = mergeKpi3DSources([{ ...assignment, actualMinutes: 120 }], legacy);
    expect(merged[0].hoursActual).toBe(2);
  });

  it("MO NHIỀU NGƯỜI: không lấy số sửa tay của NV #1 gán cho mọi người", () => {
    // extractLegacyRecords chỉ đọc perItem[].design — tức khối của NV #1. Lấy chung cho cả MO
    // sẽ nhân tổng giờ lên bằng số người.
    const legacy = extractLegacyRecords(
      "order-1",
      legacyExtra({ ngayGiao3D: "2026-08-03", gioThucTe: 6.5 }, { itemTho: "TUỆ ANH" }),
    );
    const merged = mergeKpi3DSources(
      [
        { ...assignment, id: "asg-a", actualMinutes: 120 },
        { ...assignment, id: "asg-b", designerName: "MỸ NGỌC", actualMinutes: 180 },
      ],
      legacy,
    );
    expect(merged.map((r) => r.hoursActual)).toEqual([2, 3]);
  });

  it("ĐÂY LÀ BUG ĐANG SỬA: NV bấm 'Đã gửi kết quả' → báo cáo thấy đơn đã hoàn tất", () => {
    // Dữ liệu cũ KHÔNG có ngayHoanThanh3D (luồng mới không ghi ngược về JSON).
    const legacy = extractLegacyRecords(
      "order-1",
      legacyExtra({ ngayGiao3D: "2026-08-03" }, { itemTho: "TUỆ ANH" }),
    );
    const merged = mergeKpi3DSources([assignment], legacy);
    const rows = aggregateKpi3DRows(merged, DESIGNERS, MONTH);
    const tueAnh = rows.find((r) => r.name === "TUỆ ANH")!;

    expect(tueAnh.donHT).toBe(1);        // trước khi sửa: 0
    expect(tueAnh.donChoBuong).toBe(0);  // trước khi sửa: 1 (kẹt "tồn đơn" vĩnh viễn)
  });

  it("MO cũ chưa có assignment vẫn được tính từ JSON (không cần backfill)", () => {
    const legacy = extractLegacyRecords(
      "order-2",
      legacyExtra({ ngayGiao3D: "2026-08-05", ngayHoanThanh3D: "2026-08-06" }, { itemTho: "MỸ NGỌC" }),
    );
    const merged = mergeKpi3DSources([], legacy);
    const rows = aggregateKpi3DRows(merged, DESIGNERS, MONTH);

    expect(rows.find((r) => r.name === "MỸ NGỌC")!.donHT).toBe(1);
  });

  it("kết quả Trễ hạn lấy từ kpiStatus của assignment", () => {
    const merged = mergeKpi3DSources([{ ...assignment, kpiStatus: "LATE" }], []);
    const rows = aggregateKpi3DRows(merged, DESIGNERS, MONTH);
    const tueAnh = rows.find((r) => r.name === "TUỆ ANH")!;

    expect(tueAnh.donTre).toBe(1);
    expect(tueAnh.donDungHan).toBe(0);
  });

  it("chưa hoàn tất thì không tính trễ dù kpiStatus còn sót giá trị cũ", () => {
    const merged = mergeKpi3DSources([{ ...assignment, completedAt: null, kpiStatus: "LATE" }], []);
    expect(merged[0].isLate).toBeNull();
    expect(aggregateKpi3DRows(merged, DESIGNERS, MONTH).find((r) => r.name === "TUỆ ANH")!.donTre).toBe(0);
  });
});

// ─── Một MO, nhiều NV 3D ─────────────────────────────────────────────────────
//
// Cả nhóm test này canh đúng hai lỗi đã chặn tính năng "một MO nhiều người": khóa gộp trước
// đây là orderItemId nên N lượt của cùng MO chồng lên nhau, và giờ thực tế lấy từ MỘT ô JSON
// chung nên nhân bản theo số người.
describe("Một MO có nhiều NV 3D — mỗi người một KPI riêng", () => {
  const base = {
    orderItemId: "item-1",
    assignedAt: new Date("2026-08-03T09:00:00+07:00"),
    completedAt: new Date("2026-08-04T10:00:00+07:00"),
    kpiStatus: "ON_TIME" as const,
  };
  const twoPeople: AssignmentInput[] = [
    { ...base, id: "asg-1", designerName: "TUỆ ANH", actualMinutes: 90 },
    { ...base, id: "asg-2", designerName: "MỸ NGỌC", actualMinutes: 150 },
  ];

  it("hai người cùng MO sinh HAI bản ghi, không bị gộp làm một", () => {
    const merged = mergeKpi3DSources(twoPeople, []);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.designerName).sort()).toEqual(["MỸ NGỌC", "TUỆ ANH"]);
  });

  it("mỗi người được cộng đơn hoàn tất của riêng mình", () => {
    const rows = aggregateKpi3DRows(mergeKpi3DSources(twoPeople, []), DESIGNERS, MONTH);
    expect(rows.find((r) => r.name === "TUỆ ANH")!.donHT).toBe(1);
    expect(rows.find((r) => r.name === "MỸ NGỌC")!.donHT).toBe(1);
  });

  it("giờ thực tế tách riêng theo từng người, KHÔNG dùng chung một con số", () => {
    const rows = aggregateKpi3DRows(mergeKpi3DSources(twoPeople, []), DESIGNERS, MONTH);
    expect(rows.find((r) => r.name === "TUỆ ANH")!.tongGio).toBe(1.5);
    expect(rows.find((r) => r.name === "MỸ NGỌC")!.tongGio).toBe(2.5);
  });

  it("nhiều người mà chưa nhập giờ riêng → KHÔNG mượn ô giờ chung trong JSON", () => {
    // Ô JSON chỉ có một con số cho cả MO. Chia nó cho cả hai người là nhân đôi tổng giờ —
    // thà để 0 (nhìn thấy ngay là thiếu) còn hơn một con số sai mà trông có vẻ đúng.
    const legacy = extractLegacyRecords(
      "order-1",
      legacyExtra({ ngayGiao3D: "2026-08-03", gioThucTe: 8 }, { itemTho: "TUỆ ANH" }),
    );
    const merged = mergeKpi3DSources(
      twoPeople.map((a) => ({ ...a, actualMinutes: null })),
      legacy,
    );
    expect(merged.map((r) => r.hoursActual)).toEqual([0, 0]);
  });

  it("bản ghi JSON của MO đã có lượt giao việc vẫn bị loại, không đếm chồng", () => {
    const legacy = extractLegacyRecords(
      "order-1",
      legacyExtra({ ngayGiao3D: "2026-08-03", ngayHoanThanh3D: "2026-08-04" }, { itemTho: "TUỆ ANH" }),
    );
    const merged = mergeKpi3DSources(twoPeople, legacy);
    expect(merged).toHaveLength(2);
    expect(merged.every((r) => r.source === "ASSIGNMENT")).toBe(true);
  });
});

describe("Cộng dồn theo tháng", () => {
  const rec = (o: Partial<Kpi3DRecord>): Kpi3DRecord => ({
    key: Math.random().toString(36),
    designerName: "TUỆ ANH",
    isPaused: false,
    isReassignedAway: false,
    reassignedAwayYmd: null,
    accruals: [],
    assignedYmd: null,
    completedYmd: null,
    isLate: null,
    hoursActual: 0,
    source: "LEGACY",
    ...o,
  });

  it("đơn ĐANG TẠM DỪNG bị TRỪ khỏi 'chưa hoàn thành'", () => {
    // Đây là yêu cầu nghiệp vụ chính: Admin bắt gác đơn để nhảy sang đơn gấp hơn, thì tháng đó
    // không được tính con số "chưa xong" đó vào đầu nhân viên.
    const rows = aggregateKpi3DRows(
      [
        rec({ assignedYmd: "2026-08-03", completedYmd: null }),                  // chưa xong thật
        rec({ assignedYmd: "2026-08-03", completedYmd: null, isPaused: true }),  // bị bắt gác
      ],
      DESIGNERS,
      MONTH,
    );
    const r = rows.find((x) => x.name === "TUỆ ANH")!;
    expect(r.donGiao).toBe(2);
    expect(r.donTamDung).toBe(1);
    expect(r.donChuaHT).toBe(1); // KHÔNG phải 2
  });

  it("đơn tạm dừng KHÔNG bị tính là 'chờ buông'", () => {
    // Chờ buông nghĩa là "giao rồi mà không ai đụng tới" — một lời cảnh báo. Đơn bị Admin gác
    // thì có người quyết định hẳn hoi; gộp chung làm cảnh báo mất giá trị.
    const rows = aggregateKpi3DRows(
      [rec({ assignedYmd: "2026-08-03", completedYmd: null, isPaused: true })],
      DESIGNERS,
      MONTH,
    );
    const r = rows.find((x) => x.name === "TUỆ ANH")!;
    expect(r.donChoBuong).toBe(0);
    expect(r.donTamDung).toBe(1);
  });

  it("đơn từng bị tạm dừng nhưng ĐÃ XONG thì tính bình thường, giờ vào tháng hoàn thành", () => {
    // Yêu cầu nghiệp vụ thứ hai: tháng sau làm tiếp thì cộng cả số giờ đã làm ở tháng trước.
    // Giờ luôn được cộng vào THÁNG HOÀN THÀNH, nên điều này đã đúng sẵn — test để khoá lại.
    const rows = aggregateKpi3DRows(
      [rec({ assignedYmd: "2026-07-20", completedYmd: "2026-08-05", hoursActual: 12, isPaused: false })],
      DESIGNERS,
      MONTH,
    );
    const r = rows.find((x) => x.name === "TUỆ ANH")!;
    expect(r.donGiao).toBe(0);      // giao từ tháng 7
    expect(r.donHT).toBe(1);        // hoàn thành tháng 8
    expect(r.tongGio).toBe(12);     // TOÀN BỘ giờ tính vào tháng 8
    expect(r.donTamDung).toBe(0);
  });

  it("chỉ đếm việc giao/hoàn tất TRONG tháng đang xem", () => {
    const rows = aggregateKpi3DRows(
      [
        rec({ assignedYmd: "2026-08-03", completedYmd: "2026-08-04", hoursActual: 4 }),
        rec({ assignedYmd: "2026-07-30", completedYmd: "2026-07-31", hoursActual: 9 }), // tháng khác
      ],
      DESIGNERS,
      MONTH,
    );
    const tueAnh = rows.find((r) => r.name === "TUỆ ANH")!;

    expect(tueAnh.donGiao).toBe(1);
    expect(tueAnh.donHT).toBe(1);
    expect(tueAnh.tongGio).toBe(4); // không cộng 9 giờ của tháng trước
  });

  it("Tồn đơn tính TẤT CẢ thời gian, không bó theo tháng", () => {
    const rows = aggregateKpi3DRows(
      [rec({ assignedYmd: "2026-05-10" })], // giao từ tháng 5, chưa xong
      DESIGNERS,
      MONTH,
    );
    const tueAnh = rows.find((r) => r.name === "TUỆ ANH")!;

    expect(tueAnh.donGiao).toBe(0);      // không thuộc tháng 8
    expect(tueAnh.donChoBuong).toBe(1);  // nhưng vẫn là tồn đơn
  });

  it("nhân viên đã nghỉ được gom vào dòng 'Khác' để tổng không hụt", () => {
    const rows = aggregateKpi3DRows(
      [rec({ designerName: "NGƯỜI ĐÃ NGHỈ", assignedYmd: "2026-08-03" })],
      DESIGNERS,
      MONTH,
    );
    const other = rows.find((r) => r.isOther);

    expect(other).toBeDefined();
    expect(other!.name).toBe("Khác");
    expect(other!.donGiao).toBe(1);
  });

  it("không có dữ liệu 'Khác' thì KHÔNG thêm dòng thừa", () => {
    const rows = aggregateKpi3DRows([rec({ assignedYmd: "2026-08-03" })], DESIGNERS, MONTH);
    expect(rows.some((r) => r.isOther)).toBe(false);
  });

  it("donChuaHT không âm khi hoàn tất nhiều hơn số giao trong tháng", () => {
    const rows = aggregateKpi3DRows(
      [
        rec({ completedYmd: "2026-08-04" }), // giao từ tháng trước, xong tháng này
        rec({ completedYmd: "2026-08-05" }),
      ],
      DESIGNERS,
      MONTH,
    );
    expect(rows.find((r) => r.name === "TUỆ ANH")!.donChuaHT).toBe(0);
  });

  it("quy đổi ngày = tổng giờ / 8", () => {
    const rows = aggregateKpi3DRows(
      [rec({ completedYmd: "2026-08-04", hoursActual: 20 })],
      DESIGNERS,
      MONTH,
    );
    expect(rows.find((r) => r.name === "TUỆ ANH")!.quiDoiNgay).toBe(2.5);
  });
});

import { describe, expect, it } from "vitest";

import {
  CARRIED_FROM_KEY,
  LOT_SCOPED_DESIGN_FIELDS,
  carriedBlocksAwaitingAssign,
  carryOverWarning,
  classifyOldAttempts,
  cleanCarriedItemData,
} from "@/app/lib/business/kpi-3d/version-carryover";
import { remapPerItemToVersion } from "@/app/lib/business/version-peritem";
import { readDesign3DBlocks, resolveDesign3DSyncTargets } from "@/app/lib/business/kpi-3d/assignment-targets";

// TEST CHO ĐÚNG ĐƯỜNG LÀM KPI CỘNG ĐÔI KHI NÂNG PHIÊN BẢN MO:
//
//   Route tạo phiên bản copy nguyên extraData → bản _2 mang tên thợ + mốc giao + giờ thực tế của
//   _1, nhưng KHÔNG có Design3DAssignment nào và KHÔNG gửi thông báo. Bản mới TRÔNG NHƯ đã giao
//   việc trong khi thợ không hề biết. Rồi lần lưu tab Thiết kế sau đó tạo một lượt THỨ HAI →
//   cùng base MO có hai lượt trong một tháng → "Đơn được giao" và "Tổng giờ TT" cộng đôi.

const DESIGN_V1 = {
  tho3d: "Thanh Vũ",
  phanNhom3D: "Nhóm 2",
  ngayGiao3D: "2026-07-28",
  gioGiao3D: "14:11",
  gioThucTe: "3.5",
  kpi3DAssignmentId: "asg_cua_ban_1",
  soGioDuKien: 4,
};

describe("cleanCarriedItemData — bỏ thứ thuộc LƯỢT, giữ thứ là ĐỀ XUẤT", () => {
  const cleaned = cleanCarriedItemData(
    { tho3d: "Thanh Vũ", design: { ...DESIGN_V1 } },
    "26.42341_1",
  );
  const design = cleaned.design as Record<string, unknown>;

  it("bỏ HẾT bốn trường thuộc lượt giao của bản cũ", () => {
    for (const key of LOT_SCOPED_DESIGN_FIELDS) {
      expect(design[key], key).toBeUndefined();
    }
  });

  it("bỏ kpi3DAssignmentId — nó là con trỏ TREO sang lượt của Order khác", () => {
    expect(design.kpi3DAssignmentId).toBeUndefined();
  });

  it("GIỮ tên thợ và nhóm KPI: chúng là đề xuất, điền sẵn là hợp lý", () => {
    expect(cleaned.tho3d).toBe("Thanh Vũ");
    expect(design.phanNhom3D).toBe("Nhóm 2");
  });

  it("đóng dấu kế thừa kèm NHÃN CÓ HẬU TỐ — '26.42341' không định danh được bản nào", () => {
    expect(design[CARRIED_FROM_KEY]).toBe("26.42341_1");
  });

  it("xử lý CẢ mảng người thứ 2 trở đi — bỏ sót là họ vẫn mang mốc giao của bản cũ", () => {
    const multi = cleanCarriedItemData(
      { tho3d: "A", design: { ...DESIGN_V1 }, designers: [{ ...DESIGN_V1, tho3d: "Người Hai" }] },
      "26.42341_1",
    );
    const second = (multi.designers as Record<string, unknown>[])[0];
    expect(second.ngayGiao3D).toBeUndefined();
    expect(second.kpi3DAssignmentId).toBeUndefined();
    expect(second[CARRIED_FROM_KEY]).toBe("26.42341_1");
    expect(second.tho3d).toBe("Người Hai");
  });

  it("khối TRỐNG thì không đóng dấu — cảnh báo không nói về việc gì sẽ bị học cách bỏ qua", () => {
    const empty = cleanCarriedItemData({ design: { phanNhom3D: "" } }, "26.42341_1");
    expect((empty.design as Record<string, unknown>)[CARRIED_FROM_KEY]).toBeUndefined();
  });
});

describe("Chống trùng KPI: khối kế thừa KHÔNG thể sinh ra lượt giao việc", () => {
  const OLD_ITEM = "item_v1";
  const NEW_ITEM = "item_v2";
  const oldPerItem = { [OLD_ITEM]: { tho3d: "Thanh Vũ", design: { ...DESIGN_V1 } } };
  const remapped = remapPerItemToVersion(
    oldPerItem,
    [{ id: OLD_ITEM, moNumber: "26.42341_1" }],
    [{ id: NEW_ITEM, moNumber: "26.42341_2" }],
  );
  const extraV2 = { perItem: remapped };

  it("bản _2 KHÔNG có khối nào đủ điều kiện tạo lượt — chặn ở CẤU TRÚC, không phải bằng lời khuyên", () => {
    expect(readDesign3DBlocks(extraV2, NEW_ITEM)).toEqual([]);
    expect(resolveDesign3DSyncTargets(extraV2, [NEW_ITEM])).toEqual([]);
  });

  it("nhưng bản _1 (chưa qua nâng phiên bản) VẪN tạo lượt bình thường — không phá đường cũ", () => {
    const extraV1 = { perItem: oldPerItem };
    expect(readDesign3DBlocks(extraV1, OLD_ITEM)).toHaveLength(1);
  });

  it("khối kế thừa VẪN bị phát hiện để cảnh báo, dù nó đã bị loại khỏi targets", () => {
    // Đây là cả lý do carriedBlocksAwaitingAssign phải quét riêng: targets rỗng nghĩa là đường
    // đồng bộ trả về sớm, và nếu cảnh báo bám vào targets thì nó không bao giờ được phát ra.
    const found = carriedBlocksAwaitingAssign(extraV2, [NEW_ITEM]);
    expect(found).toHaveLength(1);
    expect(found[0].carriedFrom).toBe("26.42341_1");
    expect(found[0].designerName).toBe("Thanh Vũ");
  });

  it("HÀNH ĐỘNG GÕ NGÀY GIAO MỚI là lời xác nhận: khối lại đủ điều kiện, và hết cảnh báo", () => {
    const decided = {
      perItem: {
        [NEW_ITEM]: {
          ...(remapped[NEW_ITEM] as Record<string, unknown>),
          design: {
            ...((remapped[NEW_ITEM] as Record<string, unknown>).design as Record<string, unknown>),
            ngayGiao3D: "2026-08-18",
            gioGiao3D: "09:00",
          },
        },
      },
    };
    expect(readDesign3DBlocks(decided, NEW_ITEM)).toHaveLength(1);
    expect(carriedBlocksAwaitingAssign(decided, [NEW_ITEM])).toEqual([]);
  });

  it("khối đã giao lại mang theo cờ để đường đồng bộ XOÁ nó trong cùng lần lưu", () => {
    const decided = {
      perItem: {
        [NEW_ITEM]: {
          tho3d: "Thanh Vũ",
          design: { phanNhom3D: "Nhóm 2", ngayGiao3D: "2026-08-18", gioGiao3D: "09:00", [CARRIED_FROM_KEY]: "26.42341_1" },
        },
      },
    };
    expect(readDesign3DBlocks(decided, NEW_ITEM)[0].carriedFromVersion).toBe("26.42341_1");
  });

  it("MO không thuộc version vẫn KHÔNG được copy — không phá luật chống perItem mồ côi", () => {
    const out = remapPerItemToVersion(
      { other_item: { tho3d: "X" } },
      [{ id: "other_item", moNumber: "26.99999_1" }],
      [{ id: NEW_ITEM, moNumber: "26.42341_2" }],
    );
    expect(out).toEqual({});
  });
});

describe("carryOverWarning — nói đủ BA điều", () => {
  const msg = carryOverWarning({ orderItemId: "x", carriedFrom: "26.42341_1", designerName: "Thanh Vũ" });

  it("dữ liệu đến từ đâu — để không ai kết luận là hệ thống mất dữ liệu", () => {
    expect(msg).toContain("26.42341_1");
    expect(msg).toContain("Thanh Vũ");
  });

  it("hiện chưa có gì xảy ra — thợ chưa biết, KPI chưa tính", () => {
    expect(msg).toContain("chưa giao việc");
    expect(msg).toContain("KPI chưa tính");
  });

  it("phải làm gì để đi tiếp", () => {
    expect(msg).toContain("Ngày giao 3D");
  });
});

describe("classifyOldAttempts — mức độ nguy hiểm của bản cũ", () => {
  it("chưa từng có lượt → không có gì để quyết", () => {
    expect(classifyOldAttempts([])).toBe("NONE");
  });

  it("đang làm, chưa có giờ → chưa có KPI nào vào sổ", () => {
    expect(classifyOldAttempts([{ completedAt: null, actualMinutes: null }])).toBe("IN_FLIGHT");
    expect(classifyOldAttempts([{ completedAt: null, actualMinutes: 0 }])).toBe("IN_FLIGHT");
  });

  it("đã hoàn thành HOẶC đã có giờ → KPI ĐÃ vào sổ, đây là ca bắt buộc quyết", () => {
    expect(classifyOldAttempts([{ completedAt: "2026-08-18", actualMinutes: null }])).toBe("KPI_BANKED");
    expect(classifyOldAttempts([{ completedAt: null, actualMinutes: 210 }])).toBe("KPI_BANKED");
  });

  it("nhiều lượt: MỘT lượt đã có công là đủ để coi là đã vào sổ", () => {
    expect(classifyOldAttempts([
      { completedAt: null, actualMinutes: null },
      { completedAt: null, actualMinutes: 60 },
    ])).toBe("KPI_BANKED");
  });
});

describe("Đường CLIENT: payload dựng từ form cũng phải đi qua cùng hàm", () => {
  // Ngay sau khi tạo phiên bản, client gửi tiếp khối thiết kế dựng từ FORM — mà form đang giữ
  // giá trị của bản _1 — và ghi vào item MỚI. Không làm sạch ở đường này thì lần ghi đó ĐÈ LẠI
  // bản server vừa làm sạch, khối lại đủ 4 trường, và lượt thứ hai được tạo.
  //
  // Payload của form dùng `|| null` nên các ô rỗng là `null`, không phải `undefined` — hình dạng
  // khác với extraData đọc từ DB, nên phải kiểm riêng.
  const FORM_ITEM = "item_v2";
  const formPayload = {
    design: {
      phanNhom3D: "Nhóm 2",
      ngayGiao3D: "2026-07-28",
      gioGiao3D: "14:11",
      gioThucTe: 3.5,
      kpi3DAssignmentId: "asg_cua_ban_1",
      soGioDuKien: 4,
      deadline: "2026-07-29",
    },
    tho3d: "Thanh Vũ",
    designers: [] as unknown[],
  };

  const cleaned = cleanCarriedItemData(formPayload, "26.42341_1");

  it("bỏ hết trường thuộc lượt dù payload dùng null thay vì undefined", () => {
    const design = cleaned.design as Record<string, unknown>;
    for (const key of LOT_SCOPED_DESIGN_FIELDS) expect(design[key], key).toBeUndefined();
    expect(design[CARRIED_FROM_KEY]).toBe("26.42341_1");
  });

  it("và khối đó KHÔNG tạo được lượt", () => {
    expect(readDesign3DBlocks({ perItem: { [FORM_ITEM]: cleaned } }, FORM_ITEM)).toEqual([]);
    expect(carriedBlocksAwaitingAssign({ perItem: { [FORM_ITEM]: cleaned } }, [FORM_ITEM])).toHaveLength(1);
  });

  it("mảng designers rỗng vẫn giữ rỗng — xoá một người phải có hiệu lực", () => {
    expect(cleaned.designers).toEqual([]);
  });
});

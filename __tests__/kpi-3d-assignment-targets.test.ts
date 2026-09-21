import { describe, expect, it } from "vitest";

import {
  readDesign3DFields,
  resolveDesign3DSyncTargets,
} from "@/app/lib/business/kpi-3d/assignment-targets";

// ĐÂY LÀ TEST CHO ĐÚNG CON BUG ĐÃ XẢY RA.
//
// Route trước đây quyết định có tạo lượt giao việc hay không bằng:
//     if (scopedItemId && isDesignOnlyUpdate)
// tức là phụ thuộc vào việc client CÓ NHỚ GỬI trường `scopedItemId`. Luồng lưu từ tab Thiết kế
// không gửi trường đó, nên cả tính năng chết lặng — không lỗi, không cảnh báo, không log.
//
// 615 test lúc đó vẫn xanh, vì tất cả đều nằm ở tầng nghiệp vụ còn chỗ nối route↔nghiệp vụ
// thì không ai phủ. Nay quyết định được rút thành hàm thuần và test trực tiếp tại đây.

const ITEM_A = "item-a";
const ITEM_B = "item-b";

function design(overrides: Record<string, unknown> = {}) {
  return {
    phanNhom3D: "Nhóm 1",
    ngayGiao3D: "2026-08-10",
    gioGiao3D: "08:25",
    ...overrides,
  };
}

describe("readDesign3DFields — đọc 4 trường bắt buộc", () => {
  it("đủ 4 trường → trả về dữ liệu", () => {
    const fields = readDesign3DFields(
      { perItem: { [ITEM_A]: { tho3d: "N8n", design: design() } } },
      ITEM_A,
    );
    expect(fields).toEqual({
      designerName: "N8n",
      groupName: "Nhóm 1",
      assignedDate: "2026-08-10",
      assignedTime: "08:25",
    });
  });

  it.each([
    ["thiếu nhân viên", { tho3d: "" }, {}],
    ["thiếu nhóm KPI", {}, { phanNhom3D: "" }],
    ["thiếu ngày giao", {}, { ngayGiao3D: "" }],
    ["thiếu giờ giao", {}, { gioGiao3D: "" }],
  ])("%s → null (user đang nhập dở, không phải lỗi)", (_label, itemOverride, designOverride) => {
    const fields = readDesign3DFields(
      { perItem: { [ITEM_A]: { tho3d: "N8n", design: design(designOverride), ...itemOverride } } },
      ITEM_A,
    );
    expect(fields).toBeNull();
  });

  it("tên nhân viên ở gốc dùng làm dự phòng cho dữ liệu cũ chưa tách theo MO", () => {
    const fields = readDesign3DFields(
      { tho3d: "N8n", perItem: { [ITEM_A]: { design: design() } } },
      ITEM_A,
    );
    expect(fields?.designerName).toBe("N8n");
  });

  it("tên ở cấp MO được ưu tiên hơn tên ở gốc", () => {
    const fields = readDesign3DFields(
      { tho3d: "Người khác", perItem: { [ITEM_A]: { tho3d: "N8n", design: design() } } },
      ITEM_A,
    );
    expect(fields?.designerName).toBe("N8n");
  });

  it("khoảng trắng thừa được cắt bỏ, không tính là có dữ liệu", () => {
    const fields = readDesign3DFields(
      { perItem: { [ITEM_A]: { tho3d: "   ", design: design() } } },
      ITEM_A,
    );
    expect(fields).toBeNull();
  });

  it.each([
    ["extraData null", null],
    ["extraData rỗng", {}],
    ["không có perItem", { tho3d: "N8n" }],
    ["MO không có khối design", { perItem: { [ITEM_A]: { tho3d: "N8n" } } }],
  ])("%s → null", (_label, extra) => {
    expect(readDesign3DFields(extra as Record<string, unknown> | null, ITEM_A)).toBeNull();
  });
});

describe("resolveDesign3DSyncTargets — suy ra MO cần đồng bộ TỪ DỮ LIỆU", () => {
  it("KHÔNG cần scopedItemId: mã MO lấy từ chính khoá của perItem", () => {
    const targets = resolveDesign3DSyncTargets(
      { perItem: { [ITEM_A]: { tho3d: "N8n", design: design() } } },
      [ITEM_A],
    );
    expect(targets).toEqual([ITEM_A]);
  });

  it("nhiều MO cùng lúc đều được đồng bộ", () => {
    const targets = resolveDesign3DSyncTargets(
      {
        perItem: {
          [ITEM_A]: { tho3d: "N8n", design: design() },
          [ITEM_B]: { tho3d: "Việt 3D", design: design({ phanNhom3D: "Nhóm 2" }) },
        },
      },
      [ITEM_A, ITEM_B],
    );
    expect(targets.sort()).toEqual([ITEM_A, ITEM_B]);
  });

  it("chỉ lấy MO đủ 4 trường, bỏ qua MO đang nhập dở", () => {
    const targets = resolveDesign3DSyncTargets(
      {
        perItem: {
          [ITEM_A]: { tho3d: "N8n", design: design() },
          [ITEM_B]: { tho3d: "Việt 3D", design: design({ gioGiao3D: "" }) },
        },
      },
      [ITEM_A, ITEM_B],
    );
    expect(targets).toEqual([ITEM_A]);
  });

  it("bỏ qua khoá lạ không thuộc đơn — chặn tạo lượt giao việc cho MO không tồn tại", () => {
    const targets = resolveDesign3DSyncTargets(
      {
        perItem: {
          [ITEM_A]: { tho3d: "N8n", design: design() },
          "mo-khong-ton-tai": { tho3d: "N8n", design: design() },
        },
      },
      [ITEM_A],
    );
    expect(targets).toEqual([ITEM_A]);
  });

  it("MO có stages nhưng không có khối design → không đồng bộ (lưu ở Phòng Sản Xuất)", () => {
    const targets = resolveDesign3DSyncTargets(
      { perItem: { [ITEM_A]: { stages: [{ code: "TC_NGUOI" }] } } },
      [ITEM_A],
    );
    expect(targets).toEqual([]);
  });

  it.each([
    ["extraData null", null],
    ["extraData rỗng", {}],
    ["perItem rỗng", { perItem: {} }],
  ])("%s → mảng rỗng (chốt chặn rẻ: route thoát ngay, không chạm DB)", (_label, extra) => {
    expect(resolveDesign3DSyncTargets(extra as Record<string, unknown> | null, [ITEM_A])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { mergeWhere } from "@/app/lib/business/orders/where-merge";
import { orderStatusWhere } from "@/app/lib/business/orders/status-where";

// 🔴 LỖI THẬT, ĐÃ CÓ TRÊN PRODUCTION, không ai báo vì nó im lặng.
//
// GET /api/orders dựng `where` bằng cách gán thẳng từng khoá. Bốn bộ lọc tranh nhau ĐÚNG HAI
// khoá, nên bộ lọc tới sau xoá sạch bộ lọc tới trước:
//
//   `items`  ← lọc theo PHÒNG (zone)        vs  lọc ƯU TIÊN
//   `OR`     ← lọc theo TRẠNG THÁI          vs  lọc PHÂN LOẠI KH = SR
//
// Hai hệ quả suy ra từ code:
//   · tab "Tất cả" + lọc SR → mệnh đề giấu đơn đã chốt bị thay → đơn Hoàn tất/Đã hủy HIỆN LẠI
//   · tab Phòng Thiết Kế + lọc Ưu tiên → mệnh đề lọc phòng bị thay → hiện cả MO của phòng kia
//
// 📌 Chưa chạy được app (không có DATABASE_URL cục bộ) nên hai hệ quả trên đọc từ code, chưa
// xác nhận trên dữ liệu thật. Bản thân phép gộp thì test ở đây.

const base = () => ({ deletedAt: null }) as Record<string, unknown>;

describe("mergeWhere", () => {
  it("khoá còn trống → ngồi thẳng cấp một", () => {
    const where = base();
    mergeWhere(where, { status: "DRAFT" });
    expect(where).toEqual({ deletedAt: null, status: "DRAFT" });
    expect(where.AND).toBeUndefined();
  });

  // Chỗ ngồi cấp một phải thuộc về người ĐẾN TRƯỚC: truy vấn đếm ở route đọc `where.OR` và
  // đối xử riêng với mệnh đề trạng thái. Đổi thứ tự là bộ đếm nhận nhầm mệnh đề.
  it("khoá đã có người → người đến sau vào AND, người đến trước GIỮ chỗ", () => {
    const where = base();
    mergeWhere(where, { OR: ["truoc"] });
    mergeWhere(where, { OR: ["sau"] });
    expect(where.OR).toEqual(["truoc"]);
    expect(where.AND).toEqual([{ OR: ["sau"] }]);
  });

  it("nhiều lần va chạm cùng một khoá → xếp hàng trong AND, không cái nào mất", () => {
    const where = base();
    for (const n of [1, 2, 3]) mergeWhere(where, { items: { some: { n } } });
    expect(where.items).toEqual({ some: { n: 1 } });
    expect(where.AND).toEqual([{ items: { some: { n: 2 } } }, { items: { some: { n: 3 } } }]);
  });

  it("một cond nhiều khoá → tách từng khoá, khoá nào trống thì ngồi thẳng", () => {
    const where = base();
    mergeWhere(where, { OR: ["truoc"] });
    mergeWhere(where, { OR: ["sau"], NOT: { status: "CANCELLED" } });
    expect(where.NOT).toEqual({ status: "CANCELLED" });
    expect(where.AND).toEqual([{ OR: ["sau"] }]);
  });
});

describe("hai va chạm thật của GET /api/orders", () => {
  const SR_FILTER = {
    OR: [
      { phanLoaiKh: "SR" },
      { items: { some: { specifications: { path: ["isShowroom"], equals: true } } } },
    ],
  };

  // 🔴 Đây là lỗi người dùng gặp được: lọc SR ở tab "Tất cả" từng làm đơn đã chốt hiện lại.
  it("tab Tất cả + lọc SR → mệnh đề giấu đơn đã chốt VẪN CÒN", () => {
    const where = base();
    mergeWhere(where, orderStatusWhere({ history: false }));
    mergeWhere(where, SR_FILTER);

    expect(where.OR).toEqual([
      { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      { items: { some: { itemStatus: { notIn: ["COMPLETED", "CANCELLED"] } } } },
    ]);
    expect(where.AND).toEqual([SR_FILTER]);
  });

  it("lọc theo phòng + lọc Ưu tiên → giữ cả hai, không cái nào xoá cái nào", () => {
    const where = base();
    mergeWhere(where, { items: { some: { zone: "PRE_PRODUCTION" } } });
    mergeWhere(where, { items: { some: { priorityCode: "UT1" } } });

    expect(where.items).toEqual({ some: { zone: "PRE_PRODUCTION" } });
    expect(where.AND).toEqual([{ items: { some: { priorityCode: "UT1" } } }]);
  });

  // Không va chạm thì KHÔNG được sinh ra `AND` thừa: truy vấn đếm tháo `where` theo khoá, và
  // một khoá lạ xuất hiện vô cớ là thêm một đường cho nó đi sai.
  it("không va chạm → không sinh AND", () => {
    const where = base();
    mergeWhere(where, { items: { some: { zone: "MASTER_HUB" } } });
    mergeWhere(where, orderStatusWhere({ history: true, status: "COMPLETED" }));
    expect(where.AND).toBeUndefined();
    expect(where.NOT).toEqual({ status: "CANCELLED" });
  });
});

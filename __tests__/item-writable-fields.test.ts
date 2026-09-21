import { describe, expect, it } from "vitest";

import {
  ROLE_WRITABLE_COLUMNS,
  ROUTE_HANDLED_ITEM_FIELDS,
  WRITABLE_ORDER_ITEM_COLUMNS,
  pickWritableItemColumns,
  writableColumnsForRole,
} from "@/app/lib/business/orders/item-writable-fields";

// ─── Danh sách trắng cột được ghi qua PATCH item ─────────────────────────────
//
// 🔴 DANH SÁCH NÀY HỎNG THEO CẢ HAI CHIỀU, VÀ CẢ HAI CHIỀU ĐỀU IM LẶNG:
//
//   THIẾU một cột  → zod nhận, danh sách trắng loại bỏ, API trả 200, toast báo "Đã lưu", form
//                    vẫn hiện giá trị vì nó giữ tại chỗ. Bấm F5 là mất. Đã xảy ra thật với
//                    sampleImageUrl / sampleVideoUrl — xem chú thích trong chính file đó.
//
//   THỪA một cột   → trường lẽ ra chỉ đi qua route chuyên dụng (có kiểm quyền riêng, kiểm loại
//                    file, dọn file cũ trong storage) lại ghi được thẳng bằng một PATCH. Không
//                    lỗi nào báo; chỉ là các lớp kiểm kia bị đi vòng.
//
// File này chốt cả hai chiều bằng lời, thay vì để chúng chỉ tồn tại nhờ không ai đụng tới.

const COLUMNS: readonly string[] = WRITABLE_ORDER_ITEM_COLUMNS;

describe("Cột ẢNH không bao giờ đi qua đường lưu chung", () => {
  // designImageUrl chỉ được ghi bởi api/orders/[id]/items/[itemId]/image — route đó ép quyền
  // ADMIN/ORDER (chặt hơn PATCH item, vốn cho cả PRODUCTION), kiểm loại file + dung lượng, và
  // XOÁ object cũ trong bucket khi thay ảnh. Cho ghi thẳng qua PATCH là bỏ qua cả ba việc đó
  // và để lại file mồ côi.
  it("designImageUrl KHÔNG có trong danh sách trắng", () => {
    expect(COLUMNS).not.toContain("designImageUrl");
  });

  // ⚠️ `sampleImageUploads` nay ĐÃ TỒN TẠI và theo đúng luật trên: chỉ route sample-images
  // được ghi. Ai thêm nó vào danh sách trắng "cho tiện" sẽ làm test này đỏ, kèm lý do.
  it("mọi cột ảnh do route upload quản lý đều nằm NGOÀI danh sách", () => {
    for (const col of ["designImageUrl", "sampleImageUploads"]) {
      expect(COLUMNS, `${col} phải đi qua route upload, không qua PATCH`).not.toContain(col);
    }
  });
});

describe("Cột LINK tài liệu phải nằm TRONG danh sách", () => {
  // Đây là hồi quy đã sống trên production: Order dán link, hệ thống báo đã lưu, F5 là mất, và
  // NV 3D không bao giờ thấy tài liệu nên quay lại hỏi qua chat.
  it("link Order gửi cho NV 3D ghi được qua PATCH", () => {
    for (const col of ["designFileUrl", "sampleImageUrl", "sampleFolderUrl", "techNote"]) {
      expect(COLUMNS, `thiếu ${col} → lưu im lặng thất bại`).toContain(col);
    }
  });
});

describe("Tính toàn vẹn của danh sách", () => {
  it("không có tên trùng — một dòng thừa là một dòng không ai đọc lại", () => {
    expect(new Set(COLUMNS).size).toBe(COLUMNS.length);
  });

  it("không có tên rỗng hay dính khoảng trắng", () => {
    for (const c of COLUMNS) expect(c).toBe(c.trim());
    for (const c of COLUMNS) expect(c.length).toBeGreaterThan(0);
  });
});

describe("pickWritableItemColumns", () => {
  it("giữ cột được phép, LOẠI cột không được phép", () => {
    const out = pickWritableItemColumns({
      techNote: "abc",
      designImageUrl: "https://x/a.jpg",   // phải bị loại
      khongTonTai: 1,                      // phải bị loại
    }, "ADMIN");
    expect(out).toEqual({ techNote: "abc" });
  });

  it("payload rỗng → object rỗng, không phải undefined", () => {
    expect(pickWritableItemColumns({}, "ADMIN")).toEqual({});
  });
});

// ─── TẦNG THỨ HAI: ghi được cột nào, theo VAI ────────────────────────────────
//
// Danh sách trắng có HAI tầng, trả lời hai câu khác nhau:
//   route  → AI vào được (gác ở đầu handler)
//   bảng này → vào rồi thì GHI ĐƯỢC CỘT NÀO
// Gộp lại là một tầng trả lời sai một nửa.

describe("writableColumnsForRole", () => {
  // Quy ước "không khai = dùng chung", giống ORDER_FILTER_SCOPE. Nhờ vậy thêm cột mới cho các
  // vai cũ KHÔNG phải sửa bảng vai.
  // ⚠️ "ĐẦY ĐỦ" nay RỘNG HƠN `WRITABLE_ORDER_ITEM_COLUMNS`. Hai tập khác nhau, và trước đây bị
  // gộp làm một — đó chính là chỗ để lọt năm field route tự xử lý:
  //
  //   · WRITABLE_ORDER_ITEM_COLUMNS — cột `pickWritableItemColumns` được CHÉP THẲNG
  //   · writableColumnsForRole      — field vai đó được GHI (kể cả field route biến đổi trước)
  it("vai KHÔNG bị hạn chế → ghi được cột thường VÀ field route tự xử lý", () => {
    for (const role of ["ADMIN", "ORDER", "PRODUCTION", "SALES", "DESIGN_3D", "VAI_LA"]) {
      const allowed = writableColumnsForRole(role);
      for (const c of WRITABLE_ORDER_ITEM_COLUMNS) expect(allowed, `${role}/${c}`).toContain(c);
      for (const f of ROUTE_HANDLED_ITEM_FIELDS) expect(allowed, `${role}/${f}`).toContain(f);
    }
  });

  // 🔴 BẤT BIẾN GIỮ HAI TẬP KHÔNG CHỒNG NHAU. Một field vừa nằm trong danh sách chép thẳng vừa
  // được route biến đổi thì nó bị GHI HAI LẦN — lần chép thô ghi sai kiểu, và không có gì báo.
  it("hai tập KHÔNG giao nhau", () => {
    for (const f of ROUTE_HANDLED_ITEM_FIELDS) {
      expect(WRITABLE_ORDER_ITEM_COLUMNS as readonly string[], f).not.toContain(f);
    }
  });

  // Và pick KHÔNG được chép chúng, kể cả với vai quyền đầy đủ.
  it("pick KHÔNG chép field route tự xử lý", () => {
    const payload: Record<string, unknown> = {};
    for (const f of ROUTE_HANDLED_ITEM_FIELDS) payload[f] = "x";
    expect(pickWritableItemColumns(payload, "ADMIN")).toEqual({});
  });

  // 🔴 Mọi cột khai trong bảng vai PHẢI là cột có thật. Gõ sai một tên ở đó thì vai bị hạn chế
  // ghi được ĐÚNG KHÔNG GÌ — im lặng, và người dùng chỉ thấy "lưu xong nhưng không đổi".
  it("mọi cột khai theo vai đều nằm trong danh sách gốc", () => {
    for (const [role, cols] of Object.entries(ROLE_WRITABLE_COLUMNS)) {
      for (const c of cols) {
        expect(WRITABLE_ORDER_ITEM_COLUMNS, `${role} → ${c}`).toContain(c);
      }
    }
  });

  it("không vai nào khai danh sách RỖNG — rỗng thì đừng cho vào route", () => {
    for (const [role, cols] of Object.entries(ROLE_WRITABLE_COLUMNS)) {
      expect(cols.length, role).toBeGreaterThan(0);
    }
  });
});

describe("pickWritableItemColumns — lọc theo vai", () => {
  it("vai đầy đủ giữ nguyên hành vi cũ", () => {
    const out = pickWritableItemColumns({ techNote: "abc", nvl: "18KY" }, "ADMIN");
    expect(out).toEqual({ techNote: "abc", nvl: "18KY" });
  });

  // Ca "vai bị hạn chế" nay có vai THẬT để thử — xem __tests__/ma-so-mau.test.ts, nơi nó gọi
  // hàm thật với vai RND và dữ liệu thật. Ở đây chỉ chốt phần chung.
});

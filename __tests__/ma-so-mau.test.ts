import { describe, expect, it } from "vitest";

import {
  MA_SO_MAU_EDITOR_ROLES,
  MA_SO_MAU_FIELD,
  canEditMaSoMau,
  maSoMauWriteAttempted,
  normalizeMaSoMau,
  shouldShowMaSoMau,
  stripMaSoMauForNewVersion,
} from "@/app/lib/business/orders/ma-so-mau";
import {
  ROLE_WRITABLE_COLUMNS,
  ROUTE_HANDLED_ITEM_FIELDS,
  WRITABLE_ORDER_ITEM_COLUMNS,
  canRoleWriteField,
  pickWritableItemColumns,
  writableColumnsForRole,
} from "@/app/lib/business/orders/item-writable-fields";
import { USER_ROLE_VALUES } from "@/app/lib/roles";
import { updateOrderItemSchema } from "@/app/lib/schemas/order";

// ═══════════════════════════════════════════════════════════════════════════
// MÃ SỐ MẪU — bốn quyết định của nghiệp vụ, viết thành bốn nhóm test
// ═══════════════════════════════════════════════════════════════════════════

describe("Ai nhập được", () => {
  it.each(MA_SO_MAU_EDITOR_ROLES)("%s nhập được khi MO ở PSX", (role) => {
    expect(canEditMaSoMau(role, "MASTER_HUB")).toBe(true);
  });

  it("mọi vai KHÁC đều không nhập được, kể cả ở PSX", () => {
    for (const r of USER_ROLE_VALUES) {
      if (MA_SO_MAU_EDITOR_ROLES.includes(r)) continue;
      expect(canEditMaSoMau(r, "MASTER_HUB"), r).toBe(false);
    }
  });

  it("vai rỗng / lạ không nhập được", () => {
    for (const r of [undefined, null, "", "VAI_LA"]) {
      expect(canEditMaSoMau(r as string | undefined, "MASTER_HUB"), String(r)).toBe(false);
    }
  });
});

describe("Chỉ ở Phòng Sản Xuất", () => {
  it("PTK thì KHÔNG ai nhập được — kể cả ADMIN", () => {
    for (const r of MA_SO_MAU_EDITOR_ROLES) {
      expect(canEditMaSoMau(r, "PRE_PRODUCTION"), r).toBe(false);
    }
  });

  it("zone thiếu / lạ cũng không mở ô — mặc định là ĐÓNG", () => {
    for (const z of [undefined, null, "", "ZONE_LA"]) {
      expect(canEditMaSoMau("ADMIN", z as string | undefined), String(z)).toBe(false);
      expect(shouldShowMaSoMau(z as string | undefined), String(z)).toBe(false);
    }
  });

  it("ô chỉ HIỆN ở PSX", () => {
    expect(shouldShowMaSoMau("MASTER_HUB")).toBe(true);
    expect(shouldShowMaSoMau("PRE_PRODUCTION")).toBe(false);
  });
});

// 🔴 KỊCH BẢN BỐN BƯỚC — lý do `stripMaSoMauForNewVersion` tồn tại.
//
//     PSX → nhập mã → rollback về PTK → tạo phiên bản
//
// Server KHÔNG gác zone khi tạo phiên bản (chỉ gác vai), nên đường này đi được thật. Nếu bản
// mới kế thừa mã, nó mang một mã KHÔNG AI NHÌN THẤY (ô bị ẩn ở PTK) cho tới lúc sang PSX rồi
// hiện ra một mã không ai nhớ đã nhập.
describe("Không kế thừa khi nâng phiên bản", () => {
  it("gỡ masoMau khỏi dữ liệu chép sang bản mới", () => {
    const out = stripMaSoMauForNewVersion({ moNumber: "26.12345", masoMau: "MS-001", nvl: "18KW" });
    expect(out).not.toHaveProperty(MA_SO_MAU_FIELD);
    expect(out.moNumber).toBe("26.12345");
    expect(out.nvl).toBe("18KW");
  });

  it("KHÔNG đụng tới object gốc — phép chép phải thuần", () => {
    const src = { masoMau: "MS-001" };
    stripMaSoMauForNewVersion(src);
    expect(src.masoMau).toBe("MS-001");
  });

  it("không có cột đó thì trả lại nguyên vẹn", () => {
    const src = { moNumber: "26.1" };
    expect(stripMaSoMauForNewVersion(src)).toEqual(src);
  });

  // Kịch bản đầy đủ: MO ở PSX có mã → rollback (giữ mã) → tạo phiên bản (bản mới TRỐNG).
  it("kịch bản 4 bước: bản mới KHÔNG mang mã của bản cũ", () => {
    const psxItem = { id: "i1", moNumber: "26.12345", zone: "MASTER_HUB", masoMau: "MS-001" };

    // Bước 3 — rollback PSX → PTK. Người dùng chốt: GIỮ mã.
    const afterRollback = { ...psxItem, zone: "PRE_PRODUCTION" };
    expect(afterRollback.masoMau).toBe("MS-001");

    // Bước 4 — tạo phiên bản: route trải phẳng rồi chép. Đây là chỗ phải gỡ.
    const { id: _id, ...itemData } = afterRollback;
    const newVersion = stripMaSoMauForNewVersion(itemData as Record<string, unknown>);
    expect(newVersion[MA_SO_MAU_FIELD]).toBeUndefined();
  });
});

describe("PER-MO, không lây sang MO khác", () => {
  // Mã nằm trên OrderItem chứ không trên Order, nên "không lây" là tính chất của việc chọn
  // bảng — test này chốt rằng phép ghi chỉ chạm đúng một bản ghi.
  it("ghi mã cho MO A không sinh ra thay đổi nào cho MO B", () => {
    const patchA = pickWritableItemColumns({ masoMau: "MS-A" }, "RND");
    expect(patchA).toEqual({ masoMau: "MS-A" });
    // Không có khoá nào trong patch nói về MO khác — không orderId, không moNumber.
    expect(Object.keys(patchA)).toEqual([MA_SO_MAU_FIELD]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R&D GHI ĐƯỢC ĐÚNG MỘT CỘT
// ═══════════════════════════════════════════════════════════════════════════

describe("Bảng cột ghi được của R&D", () => {
  it("đúng một cột, và là masoMau", () => {
    expect(writableColumnsForRole("RND")).toEqual([MA_SO_MAU_FIELD]);
  });

  // 🔴 BẤT BIẾN NẶNG NHẤT FILE NÀY. Nếu dòng RND biến mất khỏi ROLE_WRITABLE_COLUMNS thì hàm
  // rơi về MẶC ĐỊNH — tức toàn bộ cột — và R&D âm thầm ghi được mọi thứ. Không có lỗi nào,
  // không có màn hình đỏ nào: chỉ là một vai chỉ-đọc bỗng ghi được cả bảng.
  it("R&D KHÔNG ghi được bất kỳ cột nào khác", () => {
    const everything: Record<string, unknown> = {};
    for (const c of WRITABLE_ORDER_ITEM_COLUMNS) everything[c] = "x";
    const picked = pickWritableItemColumns(everything, "RND");
    expect(Object.keys(picked)).toEqual([MA_SO_MAU_FIELD]);
  });

  it("chỉ RND bị hạn chế; các vai còn lại ghi được mọi cột", () => {
    expect(Object.keys(ROLE_WRITABLE_COLUMNS)).toEqual(["RND"]);
    for (const r of USER_ROLE_VALUES) {
      if (r === "RND") continue;
      for (const c of WRITABLE_ORDER_ITEM_COLUMNS) expect(writableColumnsForRole(r), `${r}/${c}`).toContain(c);
    }
  });

  // 🔴 NĂM FIELD ROUTE TỰ XỬ LÝ — LỖ ĐÃ CÓ THẬT, NAY BỊ BỊT.
  //
  // Chúng được destructure ra khỏi payload TRƯỚC khi lọc (mỗi cái cần biến đổi trước khi ghi),
  // nên suốt thời gian đó KHÔNG AI GÁC. Vô hại khi mọi vai vào được route đều có quyền đầy đủ;
  // vai RND biến nó thành lỗ thật: ghi được override TÊN KHÁCH HÀNG, TÊN SALE, BOM, ngày, ưu tiên.
  it("R&D KHÔNG được ghi field nào trong nhóm route tự xử lý", () => {
    for (const f of ROUTE_HANDLED_ITEM_FIELDS) {
      expect(canRoleWriteField("RND", f), f).toBe(false);
    }
  });

  it("các vai khác VẪN ghi được nhóm đó — A không siết ai ngoài R&D", () => {
    for (const r of USER_ROLE_VALUES) {
      if (r === "RND") continue;
      for (const f of ROUTE_HANDLED_ITEM_FIELDS) {
        expect(canRoleWriteField(r, f), `${r}/${f}`).toBe(true);
      }
    }
  });

  // `itemStatus` KHÔNG chỉ là một cột: route đọc thẳng payload để hủy MO, gỡ tạm ngưng, hoàn tất
  // SO, ghi WorkflowHistory. Vì thế route TỪ CHỐI 403 thay vì lọc — và điều kiện nó hỏi là hàm này.
  it("R&D KHÔNG được đổi trạng thái MO", () => {
    expect(canRoleWriteField("RND", "itemStatus")).toBe(false);
  });

  it("ORDER và ADMIN vẫn ghi được masoMau qua danh sách chung", () => {
    for (const r of ["ORDER", "ADMIN"]) {
      expect(writableColumnsForRole(r), r).toContain(MA_SO_MAU_FIELD);
    }
  });
});

// 🔴 BẤT BIẾN LIÊN MODULE. Một cột nằm trong danh sách trắng nhưng KHÔNG có trong zod thì
// payload bị loại từ tầng kiểm tham số — API trả 400 hoặc âm thầm bỏ, và danh sách trắng trông
// như đang cho phép một thứ không bao giờ tới nơi.
describe("zod và danh sách trắng nói cùng một chuyện", () => {
  it("updateOrderItemSchema nhận masoMau", () => {
    expect(updateOrderItemSchema.safeParse({ masoMau: "MS-001" }).success).toBe(true);
    expect(updateOrderItemSchema.safeParse({ masoMau: null }).success).toBe(true);
  });

  it("mọi cột R&D ghi được đều qua được zod", () => {
    for (const c of writableColumnsForRole("RND")) {
      expect(updateOrderItemSchema.safeParse({ [c]: "x" }).success, c).toBe(true);
    }
  });
});

// ─── Chuẩn hoá trước khi gửi ─────────────────────────────────────────────────
//
// 🔴 "CHƯA CÓ MÃ" CHỈ ĐƯỢC CÓ MỘT CÁCH VIẾT. Cột nullable, nên nếu giao diện gửi chuỗi rỗng thì
// DB có HAI cách nói "trống" — `NULL` và `''` — và mọi phép đếm/lọc/xuất báo cáo về sau đều phải
// nhớ cả hai. Sẽ có chỗ quên.
describe("normalizeMaSoMau", () => {
  it("cắt khoảng trắng hai đầu", () => {
    expect(normalizeMaSoMau("  MS-001  ")).toBe("MS-001");
  });

  it("rỗng và toàn khoảng trắng đều thành null — KHÔNG phải chuỗi rỗng", () => {
    for (const raw of ["", "   ", "\t", "\n  "]) {
      expect(normalizeMaSoMau(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("giữ nguyên khoảng trắng GIỮA chuỗi — đó là một phần của mã", () => {
    expect(normalizeMaSoMau(" MS 001 ")).toBe("MS 001");
  });

  it("bất động: chuẩn hoá hai lần bằng chuẩn hoá một lần", () => {
    for (const raw of ["  MS-1 ", "", "x"]) {
      const once = normalizeMaSoMau(raw);
      expect(normalizeMaSoMau(once ?? "")).toBe(once);
    }
  });

  // Giá trị chuẩn hoá là thứ THẬT SỰ được gửi lên — nó phải qua được zod, cả hai nhánh.
  it("kết quả luôn qua được updateOrderItemSchema", () => {
    for (const raw of ["MS-001", "   ", ""]) {
      expect(updateOrderItemSchema.safeParse({ masoMau: normalizeMaSoMau(raw) }).success, raw).toBe(true);
    }
  });
});

// ─── "Có mặt trong payload" ≠ "bị sửa" ──────────────────────────────────────
//
// 🔴 LỖI ĐÃ XẢY RA THẬT, người dùng báo bằng ảnh chụp: bấm "Chuyển sang PSX" cho một MO ở PTK
// → "Lưu thất bại trước khi chuyển — 25.33906_2: Mã số mẫu chỉ nhập được khi MO đã chuyển sang
// Phòng Sản Xuất." Họ không hề mở ô mã số mẫu; ô đó còn không hiện ở PTK.
//
// Gốc: sidebar gửi CẢ CỤM field mỗi lần Lưu, nên chốt chặn hỏi `!== undefined` là hỏi một câu
// không mang thông tin gì.

describe("maSoMauWriteAttempted", () => {
  it("undefined (không gửi field) → không phải phép ghi", () => {
    expect(maSoMauWriteAttempted(undefined, "A1")).toBe(false);
    expect(maSoMauWriteAttempted(undefined, null)).toBe(false);
  });

  // ⚠️ ĐÂY LÀ CA GÂY LỖI. MO ở PTK: ô ẩn → giá trị rỗng → gửi `null`, mà DB cũng đang `null`.
  it("rỗng gửi lên MO vốn chưa có mã → không phải phép ghi", () => {
    for (const incoming of [null, "", "   "]) {
      expect(maSoMauWriteAttempted(incoming, null), JSON.stringify(incoming)).toBe(false);
      expect(maSoMauWriteAttempted(incoming, ""), JSON.stringify(incoming)).toBe(false);
    }
  });

  // `null` / `""` / khoảng trắng đều là "chưa có mã" — coi chúng khác nhau là dựng lại đúng cái
  // mơ hồ mà normalizeMaSoMau tồn tại để dẹp.
  it("gửi lại ĐÚNG giá trị đang lưu (kể cả lệch khoảng trắng) → không phải phép ghi", () => {
    expect(maSoMauWriteAttempted("A1", "A1")).toBe(false);
    expect(maSoMauWriteAttempted("  A1  ", "A1")).toBe(false);
    expect(maSoMauWriteAttempted("A1", "  A1  ")).toBe(false);
  });

  it("đổi giá trị thật → LÀ phép ghi", () => {
    expect(maSoMauWriteAttempted("A1", null)).toBe(true);   // nhập mã mới
    expect(maSoMauWriteAttempted(null, "A1")).toBe(true);   // xoá mã đang có
    expect(maSoMauWriteAttempted("", "A1")).toBe(true);
    expect(maSoMauWriteAttempted("A2", "A1")).toBe(true);
  });

  // Phân biệt hoa/thường là một MÃ KHÁC, không phải cùng một mã viết khác kiểu.
  it("khác hoa/thường → LÀ phép ghi", () => {
    expect(maSoMauWriteAttempted("a1", "A1")).toBe(true);
  });
});

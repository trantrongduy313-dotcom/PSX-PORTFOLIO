import { describe, expect, it } from "vitest";

import {
  ORDER_ITEM_CONTROL_FIELDS,
  pickWritableItemColumns,
  WRITABLE_ORDER_ITEM_COLUMNS,
} from "@/app/lib/business/orders/item-writable-fields";
import { isCriticalFieldLocked, isMoInProduction } from "@/app/lib/business/orders/critical-field-lock";
import { describeDbError } from "@/app/lib/business/db-error";
import { updateOrderItemSchema } from "@/app/lib/schemas/order";

// ═══════════════════════════════════════════════════════════════════════════
// HAI LỖI ĐÃ CHẠY TRÊN PRODUCTION. Test ở đây tồn tại để chúng không quay lại.
//
// Không có test nào chạm hai đường này, nên cả hai lên tới người dùng thật rồi mới bị phát hiện —
// một cái làm hỏng HẲN chức năng hủy MO, một cái khoá oan ô Khách hàng.
// ═══════════════════════════════════════════════════════════════════════════

describe("pickWritableItemColumns — lỗi 500 khi hủy MO", () => {
  // ĐÂY LÀ TEST QUAN TRỌNG NHẤT FILE.
  //
  // Dialog hủy BẮT BUỘC nhập lý do, nên `statusReason` luôn có trong payload. Bản cũ chép mọi
  // field vào lệnh ghi DB → Prisma ném `Unknown argument 'statusReason'` → 500. Hủy từng MO hỏng
  // 100%, và người dùng chỉ thấy "An unexpected error occurred".
  it("KHÔNG ghi statusReason vào DB — nó đi vào lịch sử, không phải cột", () => {
    const out = pickWritableItemColumns({ itemStatus: "CANCELLED", statusReason: "26.36668_7" }, "ADMIN");
    expect(out).not.toHaveProperty("statusReason");
    expect(out.itemStatus).toBe("CANCELLED");
  });

  // Cùng một lớp lỗi, chỉ khác lối vào: Admin Override cũng đang hỏng theo cách y hệt.
  it("KHÔNG ghi adminOverride vào DB", () => {
    const out = pickWritableItemColumns({ itemStatus: "CANCELLED", adminOverride: true }, "ADMIN");
    expect(out).not.toHaveProperty("adminOverride");
  });

  // Đây là điều danh sách đen không làm được, và là lý do đổi sang danh sách trắng: một field
  // điều khiển THÊM SAU NÀY phải bị bỏ qua, chứ không được làm sập route lần thứ ba.
  it("field lạ chưa từng biết tới cũng bị bỏ qua, không làm sập lệnh ghi", () => {
    const out = pickWritableItemColumns({ nvl: "Au18K", mộtFieldChưaTồnTại: "x", version: 7 }, "ADMIN");
    expect(out).toEqual({ nvl: "Au18K" });
  });

  // Bốn field này route xử lý RIÊNG sau vòng lặp (đổi ISO→Date, priorityCode kéo theo
  // isPriority/isRush, specifications phải merge). Lọt vào đây là ghi sai kiểu hoặc mất dữ liệu.
  it("không lấy các field cần xử lý riêng", () => {
    const out = pickWritableItemColumns({
      estimatedDate: "2026-08-14T00:00:00Z",
      requiredDate: "2026-08-20T00:00:00Z",
      saleNote: "abc",
      priorityCode: "UT1",
      specifications: { ghiChuSp: "x" },
    }, "ADMIN");
    expect(out).toEqual({});
  });

  // `undefined` = "không gửi field này"; `null` = "xoá giá trị đi". Gộp hai cái làm một thì người
  // dùng bỏ trống ô NVL sẽ không xoá được giá trị cũ.
  it("giữ null (lệnh xoá) nhưng bỏ undefined (không đổi)", () => {
    const out = pickWritableItemColumns({ nvl: null, size: undefined, techNote: "" }, "ADMIN");
    expect(out).toEqual({ nvl: null, techNote: "" });
  });

  // Hai danh sách không được giao nhau — nếu giao thì một field vừa "được ghi" vừa "là field điều
  // khiển", và người đọc sau không biết tin cái nào.
  it("danh sách trắng và danh sách field điều khiển không chồng nhau", () => {
    const overlap = WRITABLE_ORDER_ITEM_COLUMNS.filter((c) =>
      (ORDER_ITEM_CONTROL_FIELDS as readonly string[]).includes(c),
    );
    expect(overlap).toEqual([]);
  });
});

describe("isCriticalFieldLocked — khoá oan ô Khách hàng", () => {
  // LỖI THẬT NGƯỜI DÙNG GẶP: SO có nhiều MO, MỘT MO xuống sản xuất làm order.status thành
  // IN_PRODUCTION, và các MO còn lại đang ở Phòng Thiết Kế cũng bị khoá theo.
  it("MO còn ở PTK KHÔNG bị khoá dù SO đã IN_PRODUCTION (do MO anh em)", () => {
    expect(isCriticalFieldLocked({
      itemStatus: "IN_DESIGN",
      orderStatus: "IN_PRODUCTION",
      currentValue: "Chị Mai",
    })).toBe(false);
  });

  // Yêu cầu của người dùng: tên khách CHƯA CÓ thì phải điền được. Khoá này để đừng ĐỔI cái đã in
  // ra phiếu — ô trống thì không có giấy tờ nào đang mang giá trị cũ để lệch.
  it("ô còn TRỐNG thì điền được, kể cả khi MO đã vào sản xuất", () => {
    for (const empty of [null, undefined, "", "   "]) {
      expect(isCriticalFieldLocked({
        itemStatus: "IN_PRODUCTION",
        orderStatus: "IN_PRODUCTION",
        currentValue: empty,
      })).toBe(false);
    }
  });

  // Ý ĐỊNH BAN ĐẦU PHẢI CÒN NGUYÊN: sửa lỗi khoá oan không được biến thành bỏ khoá.
  it("MO đã vào sản xuất VÀ ô đã có giá trị → vẫn khoá", () => {
    expect(isCriticalFieldLocked({
      itemStatus: "IN_PRODUCTION",
      orderStatus: "IN_PRODUCTION",
      currentValue: "Chị Mai",
    })).toBe(true);
    expect(isCriticalFieldLocked({
      itemStatus: "COMPLETED",
      orderStatus: "IN_PRODUCTION",
      currentValue: "Chị Mai",
    })).toBe(true);
  });

  // MO không có trạng thái riêng thì ăn theo SO — đúng luật cũ, không được làm mất.
  it("MO không có trạng thái riêng → ăn theo trạng thái SO", () => {
    expect(isCriticalFieldLocked({
      itemStatus: null,
      orderStatus: "IN_PRODUCTION",
      currentValue: "Chị Mai",
    })).toBe(true);
    expect(isCriticalFieldLocked({
      itemStatus: null,
      orderStatus: "IN_DESIGN",
      currentValue: "Chị Mai",
    })).toBe(false);
  });

  // Banner trả lời câu KHÁC với ô nhập: "MO này đã vào sản xuất" là sự thật về MO, không phụ
  // thuộc ô nào đang trống. Gộp hai câu vào một cờ thì banner biến mất chỉ vì tên khách còn
  // trống — đúng lúc người dùng cần biết nhất.
  it("banner vẫn hiện khi MO đã vào sản xuất dù ô còn trống", () => {
    expect(isMoInProduction({ itemStatus: "IN_PRODUCTION", orderStatus: "DRAFT" })).toBe(true);
    expect(isMoInProduction({ itemStatus: "IN_DESIGN", orderStatus: "IN_PRODUCTION" })).toBe(false);
  });
});

describe("describeDbError — thông báo lỗi nói thật", () => {
  // Chính là lỗi hủy MO. Người dùng KHÔNG sửa được bằng cách thử lại, nên câu trả về phải nói
  // vậy thay vì đẩy họ đi bấm lại một việc không bao giờ chạy được.
  it("payload sai cột → nói là lỗi hệ thống, KHÔNG bảo thử lại", () => {
    const info = describeDbError(new Error("Unknown argument `statusReason`. Available options..."));
    expect(info.kind).toBe("CLIENT_BUG");
    expect(info.retryable).toBe(false);
    expect(info.message).toContain("báo quản trị");
  });

  it("bản ghi không còn (P2025) → bảo tải lại đơn", () => {
    const info = describeDbError(Object.assign(new Error("not found"), { code: "P2025" }));
    expect(info.kind).toBe("MISSING_RECORD");
    expect(info.message).toContain("tải lại");
  });

  it("giao dịch quá hạn / mất kết nối → đánh dấu thử lại được (503)", () => {
    for (const code of ["P2028", "P1001", "P1008", "P1017"]) {
      const info = describeDbError(Object.assign(new Error("x"), { code }));
      expect(info.kind, code).toBe("TIMEOUT");
      expect(info.retryable, code).toBe(true);
    }
  });

  // Không nhận ra thì vẫn phải trả một câu dùng được — nhưng KHÔNG bịa nguyên nhân.
  it("lỗi lạ → vẫn có câu tiếng Việt, không ném ra ngoài", () => {
    for (const weird of [null, undefined, "chuỗi trơ", {}, 42]) {
      const info = describeDbError(weird);
      expect(info.kind).toBe("UNKNOWN");
      expect(info.message.length).toBeGreaterThan(10);
    }
  });

  // Lỗi Prisma có tên bảng, tên cột, đôi khi cả giá trị đang ghi. Không được lọt ra client.
  it("KHÔNG trả nguyên văn lỗi Prisma cho client", () => {
    const info = describeDbError(new Error("Unknown argument `statusReason` on order_items.secret_col"));
    expect(info.message).not.toContain("statusReason");
    expect(info.message).not.toContain("order_items");
  });
});

// ─── HỒI QUY: hai cột tài liệu bị danh sách trắng nuốt im lặng ────────────────
//
// Trước khi có danh sách trắng, route chép mọi field còn lại nên chúng lưu bình thường. Bản
// hotfix chỉ thêm cột đang cần lúc đó mà không rà nốt — Order dán link, API trả 200, F5 là mất.
//
// Test này CANH ĐỐI CHIẾU chứ không chỉ canh hai cột: sai lầm gốc là "thêm cột mình cần rồi
// thôi", nên thứ cần khoá là LUẬT "schema nhận gì thì phải có nơi ghi", không phải hai cái tên.
describe("mọi field updateOrderItemSchema nhận đều phải có nơi ghi", () => {
  it("Ảnh mẫu / Video thực tế nằm trong danh sách trắng", () => {
    expect(WRITABLE_ORDER_ITEM_COLUMNS).toContain("sampleImageUrl");
    expect(WRITABLE_ORDER_ITEM_COLUMNS).toContain("sampleVideoUrl");
  });

  it("payload có hai cột đó thì pickWritableItemColumns giữ lại", () => {
    const out = pickWritableItemColumns({
      sampleImageUrl: "https://drive.google.com/drive/folders/abc",
      sampleVideoUrl: "https://drive.google.com/file/d/xyz",
    }, "ADMIN");
    expect(out.sampleImageUrl).toBe("https://drive.google.com/drive/folders/abc");
    expect(out.sampleVideoUrl).toBe("https://drive.google.com/file/d/xyz");
  });

  it("null vẫn qua được — xoá link là một lệnh có thật, khác 'không gửi field'", () => {
    const out = pickWritableItemColumns({ sampleImageUrl: null }, "ADMIN");
    expect("sampleImageUrl" in out).toBe(true);
    expect(out.sampleImageUrl).toBeNull();
  });
});

describe("chốt chặn cho lần sau", () => {
  // ─── CHỐT CHẶN CHO LẦN SAU ─────────────────────────────────────────────────
  //
  // Đây mới là test quan trọng. Hai test trên chỉ canh hai cột đã biết; test này canh cái LUẬT:
  // schema nhận field nào thì phải có NƠI GHI field đó. Thiếu nơi ghi = API trả 200 mà dữ liệu
  // không vào DB — không lỗi, không dấu vết, chỉ mất.
  //
  // Danh sách trắng chặn được lỗi cũ (field điều khiển lọt vào Prisma → 500), nhưng đẻ ra lỗi
  // mới: ai thêm field mà không biết nó tồn tại thì dính hỏng im lặng. Đã dính đúng hai lần —
  // `design3DPriorityCode` (bắt được lúc merge) và hai cột tài liệu (chạy trên production).
  //
  // Thêm field mới vào schema mà quên nơi ghi thì test này ĐỎ, kèm đúng tên field.
  it("KHÔNG field nào trong schema bị bỏ rơi — không nằm danh sách trắng thì phải có xử lý riêng", () => {
    // Route tự xử lý sau vòng lặp: bốn field per-MO (cần đổi kiểu / kéo theo cột khác) và
    // `specifications` (phải merge với JSON cũ, không ghi đè).
    const HANDLED_SEPARATELY = ["version", "specifications", "estimatedDate", "requiredDate", "saleNote", "priorityCode"];
    const known = new Set<string>([
      ...WRITABLE_ORDER_ITEM_COLUMNS,
      ...ORDER_ITEM_CONTROL_FIELDS,
      ...HANDLED_SEPARATELY,
    ]);
    const orphans = Object.keys(updateOrderItemSchema.shape).filter((k) => !known.has(k));
    expect(orphans).toEqual([]);
  });
});

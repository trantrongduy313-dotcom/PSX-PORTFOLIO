import { describe, expect, it } from "vitest";

import {
  checkPromoteGate,
  effectiveContactName,
  effectivePromoteStatus,
} from "@/app/lib/business/orders/promote-gate";

// Thay cho app/__tests__/system-integration.test.ts (453 dòng). File đó khai lại một hàm
// `canPromote` của riêng nó rồi test bản khai lại — và bản đó KHÔNG BIẾT cờ `force` tồn tại,
// tức là mù đúng nhánh nguy hiểm nhất của cổng này.
//
// 🔴 Phần lớn 453 dòng kia thậm chí không phải bản chép mà là những khẳng định TRẦN — chúng
// dựng một mảng literal rồi kiểm chính mảng đó, nên không thể đỏ dù hệ thống hỏng thế nào:
//     4b. const autoSuspended = true; expect(autoSuspended).toBe(true)
//     4e. expect(action).toBeTruthy()            // bốn chuỗi literal
//     2d. expect(typeof f).toBe("string")        // mảng chuỗi literal
//     5e. expect([...5 phần tử]).toHaveLength(5)
//     6a–6e. một bảng phân quyền viết tay, đem so với chính nó
// Bốn test còn lại có import code thật (getBaseSoNumber, calcAutoProduction) thì TRÙNG với
// __tests__/order-helpers.test.ts và app/__tests__/field-behavior.test.ts đã có.
//
// Còn thiếu lưới, ghi ra để không ai tưởng là có: phép kiểm zone và phép kiểm trùng MO của
// route (DUPLICATE_MO) bám vào truy vấn DB nên chưa tách ra được.

const gate = (over: Partial<Parameters<typeof checkPromoteGate>[0]> = {}) =>
  checkPromoteGate({
    effectiveStatus: "DESIGN_APPROVED",
    isSuspended: false,
    customerName: "Chị Lan",
    salesName: "Anh Duy",
    hasNvl: true,
    force: false,
    ...over,
  });

describe("đủ điều kiện", () => {
  it("DESIGN_APPROVED + đủ thông tin → cho đi", () => {
    expect(gate()).toBeNull();
  });
});

describe("năm cửa chặn", () => {
  it("chưa Chốt 3D → chặn, và trả về đúng trạng thái đang mắc", () => {
    for (const status of ["DRAFT", "IN_DESIGN", "DESIGN_REVIEW", "IN_PRODUCTION"]) {
      expect(gate({ effectiveStatus: status })).toEqual({ tag: "WRONG_STATUS", status });
    }
  });

  it("đang tạm ngưng → chặn", () => {
    expect(gate({ isSuspended: true })).toEqual({ tag: "SUSPENDED" });
  });

  it("thiếu Khách hàng / Sales / NVL → mỗi thứ một mã riêng", () => {
    expect(gate({ customerName: "" })).toEqual({ tag: "MISSING_CUSTOMER" });
    expect(gate({ salesName: "" })).toEqual({ tag: "MISSING_SALES" });
    expect(gate({ hasNvl: false })).toEqual({ tag: "MISSING_NVL" });
  });

  // Thiếu nhiều thứ thì phải báo thứ ĐẦU TIÊN theo đúng thứ tự route kiểm, nếu không người
  // dùng sửa xong một chỗ lại gặp lỗi kế tiếp mà không đoán được còn bao nhiêu.
  it("thiếu nhiều thứ → báo cửa đầu tiên, không phải cửa cuối", () => {
    expect(gate({ effectiveStatus: "DRAFT", customerName: "", hasNvl: false })?.tag)
      .toBe("WRONG_STATUS");
    expect(gate({ customerName: "", salesName: "", hasNvl: false })?.tag)
      .toBe("MISSING_CUSTOMER");
  });
});

describe("cờ force — bản chép cũ không biết cờ này tồn tại", () => {
  it("force bỏ qua trạng thái, Khách hàng và Sales", () => {
    expect(gate({ effectiveStatus: "DRAFT", force: true })).toBeNull();
    expect(gate({ customerName: "", force: true })).toBeNull();
    expect(gate({ salesName: "", force: true })).toBeNull();
  });

  // 🔴 ĐÂY LÀ SỰ BẤT ĐỐI XỨNG. Hai cửa này force KHÔNG mở được:
  //   • NVL — xưởng không thể bắt đầu khi chưa biết làm bằng nguyên vật liệu gì.
  //   • TẠM NGƯNG — đơn đang ngưng vì có cảnh báo chưa giải quyết; cho qua là đẩy vào xưởng
  //     đúng thứ vừa bị chặn lại.
  // Coi force là "bỏ qua tất cả" là mở hai cửa này ra, và cả hai đều dẫn thẳng xuống xưởng.
  it("force KHÔNG bỏ qua NVL", () => {
    expect(gate({ hasNvl: false, force: true })).toEqual({ tag: "MISSING_NVL" });
  });

  it("force KHÔNG bỏ qua TẠM NGƯNG", () => {
    expect(gate({ isSuspended: true, force: true })).toEqual({ tag: "SUSPENDED" });
  });
});

describe("giá trị hiệu dụng theo từng MO", () => {
  it("MO không có trạng thái riêng → kế thừa của SO", () => {
    expect(effectivePromoteStatus(null, "DESIGN_APPROVED")).toBe("DESIGN_APPROVED");
    expect(effectivePromoteStatus(undefined, "DRAFT")).toBe("DRAFT");
  });

  it("MO có trạng thái riêng → thắng trạng thái SO", () => {
    expect(effectivePromoteStatus("DESIGN_APPROVED", "DRAFT")).toBe("DESIGN_APPROVED");
  });

  // 🔴 SO cha có thể để TRỐNG Khách hàng (đơn import cũ) trong khi MO đã điền riêng. Chỉ nhìn
  // cấp SO là MO đã đủ thông tin vẫn bị báo thiếu — người dùng nhìn sidebar thấy có tên, hệ
  // thống thì bảo không có.
  it("MO tự điền → dùng giá trị của MO dù SO trống", () => {
    expect(effectiveContactName("Chị Lan", null)).toBe("Chị Lan");
    expect(effectiveContactName("Chị Lan", "")).toBe("Chị Lan");
  });

  it("MO bỏ trống → rơi về giá trị của SO", () => {
    expect(effectiveContactName(undefined, "Anh Duy")).toBe("Anh Duy");
    expect(effectiveContactName("", "Anh Duy")).toBe("Anh Duy");
  });

  // Ô chỉ có khoảng trắng KHÔNG phải là đã điền — không cắt trắng thì " " qua được cửa và MO
  // vào xưởng mà không có tên khách.
  it("chỉ có khoảng trắng = chưa điền, ở cả hai cấp", () => {
    expect(effectiveContactName("   ", "Anh Duy")).toBe("Anh Duy");
    expect(effectiveContactName("   ", "   ")).toBe("");
  });

  it("cả hai đều trống → chuỗi rỗng, để cổng chặn", () => {
    expect(effectiveContactName(null, null)).toBe("");
    expect(gate({ customerName: effectiveContactName(null, null) })?.tag).toBe("MISSING_CUSTOMER");
  });
});

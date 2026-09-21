import { describe, expect, it } from "vitest";

import {
  DESIGN_REQUEST_OPTIONS,
  designRequestMismatch,
  designRequestMismatchLabel,
  isDesignRequestOption,
} from "@/app/lib/business/kpi-3d/design-request";
import { progressEntryInputSchema } from "@/app/lib/business/kpi-3d/progress";

// NV 3D báo lại "thực tế đã làm" khi nộp kết quả. Đặt đơn giao "TK mới", làm xong mới thấy thực
// chất là "Ước lượng" — báo cáo này để Đặt đơn/Admin thấy và tự quyết có sửa yêu cầu hay không.

describe("DESIGN_REQUEST_OPTIONS — nguồn duy nhất", () => {
  // Mảng này TỪNG là hằng số cứng bên trong order-detail-panel.tsx. Nay hai màn cùng dùng: form
  // Thiết kế của Đặt đơn, và ô báo cáo của NV 3D. Copy sang màn thứ hai là để chúng lệch vào
  // ngày thêm mục thứ chín — mà không có lỗi nào.
  it("giữ đủ 8 mục, ĐÚNG thứ tự đang hiện trên ô chọn", () => {
    expect([...DESIGN_REQUEST_OPTIONS]).toEqual([
      "Làm INFO", "TK mới", "TK cũ", "Ước lượng",
      "Xuất file", "Render QLSP/TT", "Chỉnh size", "Sửa mẫu",
    ]);
  });

  it("không có mục trùng", () => {
    expect(new Set(DESIGN_REQUEST_OPTIONS).size).toBe(DESIGN_REQUEST_OPTIONS.length);
  });

  it("nhận đúng mọi mục trong danh mục", () => {
    for (const v of DESIGN_REQUEST_OPTIONS) expect(isDesignRequestOption(v), v).toBe(true);
  });

  // Nhận `unknown` vì chỗ gọi là biên nhận request — ở đó "nó là chuỗi" cũng chưa được giả định.
  it("chối mọi thứ khác, kể cả không phải chuỗi", () => {
    for (const bad of ["TK moi", "tk mới", " TK mới", "", null, undefined, 42, {}, ["TK mới"], true]) {
      expect(isDesignRequestOption(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("designRequestMismatch", () => {
  it("khác nhau → lệch", () => {
    expect(designRequestMismatch("TK mới", "Ước lượng")).toEqual({
      requested: "TK mới",
      reported: "Ước lượng",
    });
  });

  it("trùng nhau → KHÔNG lệch", () => {
    expect(designRequestMismatch("TK mới", "TK mới")).toBeNull();
  });

  // 🔴 ĐÂY LÀ CHỖ DỄ HIỂU SAI NHẤT của cả tính năng, nên nó có test riêng.
  //
  // Ô báo cáo là TÙY CHỌN: không đổi thì NV gửi luôn, không chạm ô. Nên "không báo gì" GỘP hai
  // loại người — người xác nhận đúng yêu cầu và người bỏ qua ô. Ở đây cả hai đều không có gì để
  // hiện nên cùng ra null, nhưng chỗ nào ĐẾM thì phải nhớ chúng khác nhau: "0 đơn lệch" chỉ có
  // nghĩa "0 đơn ĐƯỢC BÁO là lệch".
  it("không báo gì → KHÔNG lệch (chứ không phải 'trùng')", () => {
    for (const nothing of [null, undefined, "", "   "]) {
      expect(designRequestMismatch("TK mới", nothing), JSON.stringify(nothing)).toBeNull();
    }
  });

  // Đặt đơn bỏ trống yêu cầu là chuyện CẦN BIẾT, không phải chuyện bỏ qua — nên vẫn hiện.
  it("Đặt đơn chưa ghi yêu cầu mà NV có báo → VẪN lệch", () => {
    expect(designRequestMismatch(null, "Ước lượng")).toEqual({
      requested: null,
      reported: "Ước lượng",
    });
    expect(designRequestMismatch("   ", "Ước lượng")?.requested).toBeNull();
  });

  it("cắt khoảng trắng trước khi so — không báo lệch giả", () => {
    expect(designRequestMismatch("  TK mới  ", " TK mới ")).toBeNull();
    expect(designRequestMismatch("TK mới", "  Ước lượng ")?.reported).toBe("Ước lượng");
  });

  it("cả hai đều rỗng → KHÔNG lệch", () => {
    expect(designRequestMismatch(null, null)).toBeNull();
  });
});

describe("designRequestMismatchLabel", () => {
  it("nói cả hai vế, để người đọc tự so", () => {
    expect(designRequestMismatchLabel({ requested: "TK mới", reported: "Ước lượng" }))
      .toBe("Yêu cầu: TK mới · 3D báo đã làm: Ước lượng");
  });

  it("chưa ghi yêu cầu thì nói 'chưa ghi', không để trống", () => {
    expect(designRequestMismatchLabel({ requested: null, reported: "Ước lượng" }))
      .toContain("Yêu cầu: chưa ghi");
  });

  // ⚠️ LỜI NHẮC, KHÔNG PHẢI LỜI CÁO BUỘC — cùng luật đã áp cho kpi-usage.ts.
  //
  // Phần lớn các ca lệch là Đặt đơn phân loại lúc chưa thấy sản phẩm, và NV 3D vừa làm đúng việc
  // phải làm. Gọi nó là lỗi của ai thì lần sau không ai báo nữa, và tính năng tự vô hiệu hoá.
  it("KHÔNG dùng chữ buộc tội", () => {
    const label = designRequestMismatchLabel({ requested: "TK mới", reported: "Ước lượng" });
    for (const word of ["sai", "lỗi", "không đúng", "vi phạm", "cảnh báo"]) {
      expect(label.toLowerCase(), word).not.toContain(word);
    }
  });
});

describe("progressEntryInputSchema — biên nhận request", () => {
  const base = { status: "SENT_RESULT" as const };

  it("nhận giá trị thuộc danh mục", () => {
    const r = progressEntryInputSchema.safeParse({ ...base, reportedDesignRequest: "Ước lượng" });
    expect(r.success && r.data.reportedDesignRequest).toBe("Ước lượng");
  });

  // Ô chọn ở giao diện đã giới hạn, nhưng request thì ai cũng gửi được. Một giá trị lạ lọt vào
  // là cột này thôi so được với `yeucauThietKe`.
  it("CHỐI giá trị ngoài danh mục", () => {
    expect(progressEntryInputSchema.safeParse({ ...base, reportedDesignRequest: "Làm gì đó" }).success)
      .toBe(false);
  });

  it("vắng mặt / null / rỗng đều hợp lệ — ô này TÙY CHỌN", () => {
    expect(progressEntryInputSchema.safeParse(base).success).toBe(true);
    expect(progressEntryInputSchema.safeParse({ ...base, reportedDesignRequest: null }).success).toBe(true);
    expect(progressEntryInputSchema.safeParse({ ...base, reportedDesignRequest: "" }).success).toBe(true);
  });

  it("cắt khoảng trắng rồi mới đối chiếu danh mục", () => {
    const r = progressEntryInputSchema.safeParse({ ...base, reportedDesignRequest: "  TK cũ  " });
    expect(r.success && r.data.reportedDesignRequest).toBe("TK cũ");
  });

  // 🔴 BẤT BIẾN QUAN TRỌNG NHẤT: báo cáo là DỮ LIỆU MÔ TẢ, không phải một quyết định.
  //
  // Deadline sinh từ Nhóm KPI 3D (`phanNhom3D`), một trường RIÊNG BIỆT không suy ra từ Yêu cầu
  // thiết kế. Nên trường này không được xuất hiện trong bất cứ phép tính KPI nào. Test này đỏ
  // nghĩa là ai đó vừa nối báo cáo của NV vào con số đánh giá công việc của chính họ — việc phải
  // được quyết ở tầng nghiệp vụ, không phải là hệ quả phụ của một dòng code.
  it("KHÔNG nằm trong phần dữ liệu dùng để chấm KPI", async () => {
    const { resolveAssignmentStateAfterProgress } = await import("@/app/lib/business/kpi-3d/progress");
    const snapshot = {
      id: "a1",
      designer3DId: "d1",
      deadlineAt: new Date("2026-08-21T10:10:00+07:00"),
      status: "IN_PROGRESS",
      completedAt: null,
      acknowledgedAt: new Date("2026-08-20T15:10:00+07:00"),
      assignedAt: new Date("2026-08-20T15:10:00+07:00"),
    };
    const now = new Date("2026-08-20T16:03:00+07:00");

    // Hàm chấm KPI chỉ nhận `status` của dòng tiến độ. Truyền thêm báo cáo vào cũng KHÔNG được
    // làm đổi kết quả — nó không phải đầu vào của phép chấm.
    const withoutReport = resolveAssignmentStateAfterProgress(snapshot, { status: "SENT_RESULT" }, now);
    const withReport = resolveAssignmentStateAfterProgress(
      snapshot,
      { status: "SENT_RESULT", reportedDesignRequest: "Ước lượng" } as never,
      now,
    );
    expect(withReport).toEqual(withoutReport);
  });
});

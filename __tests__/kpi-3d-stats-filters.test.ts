import { describe, expect, it } from "vitest";

import {
  assignedInRangeWhere,
  completedWhere,
  isWithinRange,
  lateWhere,
  openWhere,
  overdueWhere,
  pendingReviewWhere,
  rangeFromSelection,
  scopeLabel,
  vnMonthRange,
  vnYearRange,
  yearOptions,
} from "@/app/lib/business/kpi-3d/stats-filters";
import { isOverdueAssignment } from "@/app/lib/business/kpi-3d/workload";

// Đây là BẢN THỨ HAI của các luật vốn đã có ở workload.ts / review-queue.ts — một bản chạy trên
// bộ nhớ, một bản dịch sang điều kiện SQL. Hai bản lệch nhau thì thẻ đếm và bảng nói hai điều
// khác nhau về cùng một dữ liệu. Test ở đây khoá lại hình dạng để mọi khác biệt đều phải cố ý.

describe("vnMonthRange", () => {
  // PHẢI cắt theo giờ VN. Một việc hoàn tất 06:00 ngày 01/09 giờ VN là 23:00 ngày 31/08 giờ UTC —
  // cắt bằng UTC sẽ đẩy nó về tháng 8, và sản lượng đầu tháng của xưởng chạy sai chỗ.
  it("mốc đầu tháng là 00:00 giờ VN = 17:00 UTC hôm trước", () => {
    const r = vnMonthRange(2026, 9)!;
    expect(r.gte.toISOString()).toBe("2026-08-31T17:00:00.000Z");
  });

  // Nửa mở [gte, lt): dùng `lte` thì phải chọn giữa 23:59:59 (sót mili giây cuối) và 00:00 hôm
  // sau (lấn sang tháng sau). Cả hai đều sai ở đúng ranh giới.
  it("mốc cuối là đầu tháng SAU, không phải cuối tháng này", () => {
    const r = vnMonthRange(2026, 9)!;
    expect(r.lt.toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });

  it("tháng 12 sang năm mới", () => {
    const r = vnMonthRange(2026, 12)!;
    expect(r.lt.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });

  it("tháng không hợp lệ → null, không dựng khoảng rác", () => {
    for (const m of [0, 13, -1, NaN]) expect(vnMonthRange(2026, m), String(m)).toBeNull();
    expect(vnMonthRange(NaN, 5)).toBeNull();
  });

  // Một việc hoàn tất đúng 00:00 ngày đầu tháng giờ VN phải thuộc tháng ĐÓ, không phải tháng
  // trước — `gte` bao gồm mốc đầu.
  it("mốc đúng đầu tháng thuộc về tháng đó", () => {
    const sep = vnMonthRange(2026, 9)!;
    const aug = vnMonthRange(2026, 8)!;
    expect(sep.gte.getTime()).toBe(aug.lt.getTime()); // hai tháng liền kề khít nhau, không hở
  });
});

describe("openWhere / overdueWhere", () => {
  // Việc đã HUỶ mà qua ngày thì KHÔNG phải "đang trễ" — việc đã huỷ không thể trễ. Đây là luật
  // workload.ts đã chốt; bản SQL phải giữ đúng.
  it("loại lượt đã đóng (huỷ / giao lại)", () => {
    expect(openWhere().status).toEqual({ notIn: ["REASSIGNED", "CANCELLED"] });
  });

  it("đang mở = chưa hoàn tất VÀ chưa đóng", () => {
    expect(openWhere().completedAt).toBeNull();
  });

  it("đang trễ = đang mở + quá deadline", () => {
    const now = new Date("2026-08-15T03:00:00Z");
    const w = overdueWhere(now);
    expect(w.completedAt).toBeNull();
    expect(w.status).toEqual({ notIn: ["REASSIGNED", "CANCELLED"] });
    expect(w.deadlineAt).toEqual({ lt: now });
  });

  // Đối chiếu chéo với bản chạy trên bộ nhớ: cùng một bộ dữ liệu mẫu, hai bản phải đồng ý về
  // việc dòng nào là "đang trễ". Không chạy được SQL trong unit test, nên khoá bằng cách suy
  // luận thủ công đúng từng điều kiện của where.
  it("khớp với isOverdueAssignment trên các ca biên", () => {
    const now = new Date("2026-08-15T03:00:00Z");
    const past = new Date("2026-08-14T03:00:00Z");
    const w = overdueWhere(now);
    const matches = (a: { status: string; completedAt: Date | null; deadlineAt: Date }) =>
      a.completedAt === w.completedAt &&
      !(w.status as { notIn: string[] }).notIn.includes(a.status) &&
      a.deadlineAt.getTime() < (w.deadlineAt as { lt: Date }).lt.getTime();

    for (const a of [
      { status: "ASSIGNED", completedAt: null, deadlineAt: past },
      { status: "CANCELLED", completedAt: null, deadlineAt: past },
      { status: "REASSIGNED", completedAt: null, deadlineAt: past },
      { status: "ASSIGNED", completedAt: past, deadlineAt: past },
      { status: "ASSIGNED", completedAt: null, deadlineAt: new Date("2026-08-20T03:00:00Z") },
    ]) {
      expect(matches(a), JSON.stringify(a)).toBe(isOverdueAssignment(a, now));
    }
  });
});

describe("pendingReviewWhere", () => {
  // ⚠️ CA QUAN TRỌNG NHẤT. `deriveReviewStatus` suy ra PENDING_REVIEW cho dữ liệu CŨ: cột
  // reviewStatus chưa từng được ghi (null) nhưng đã có completedAt. Prisma `notIn` sinh
  // `NOT IN (...)`, mà `NULL NOT IN (...)` cho ra NULL — tức KHÔNG khớp. Thiếu nhánh null thì
  // toàn bộ dữ liệu cũ biến mất khỏi thẻ, và Order tưởng đã duyệt hết.
  it("có nhánh reviewStatus null riêng — notIn KHÔNG bắt được NULL trong SQL", () => {
    const inner = (pendingReviewWhere().OR as Array<Record<string, unknown>>)[1];
    const innerOr = inner.OR as Array<Record<string, unknown>>;
    expect(innerOr).toContainEqual({ reviewStatus: null });
  });

  it("nhánh dữ liệu cũ yêu cầu ĐÃ có completedAt", () => {
    const inner = (pendingReviewWhere().OR as Array<Record<string, unknown>>)[1];
    expect(inner.completedAt).toEqual({ not: null });
  });

  it("bắt cả trường hợp reviewStatus ghi thẳng là PENDING_REVIEW", () => {
    expect(pendingReviewWhere().OR).toContainEqual({ reviewStatus: "PENDING_REVIEW" });
  });

  // Lượt đã huỷ / giao lại thì không ai còn phải duyệt — để lọt vào là thẻ nhắc một việc không
  // tồn tại. Cùng luật với isPendingReview.
  it("loại lượt đã đóng", () => {
    expect(pendingReviewWhere().status).toEqual({ notIn: ["REASSIGNED", "CANCELLED"] });
  });
});

describe("assignedInRangeWhere / completedWhere / lateWhere", () => {
  const range = vnMonthRange(2026, 8)!;

  // ⚠️ TRỤC LÀ `assignedAt`, KHÔNG PHẢI `completedAt`, và đây là lỗi đã gặp thật:
  // người dùng lọc tháng có toàn việc ĐANG CHẠY, lọc theo ngày hoàn thành thì ra rỗng, và họ
  // kết luận bộ lọc hỏng. "Việc của tháng 8" ở xưởng nghĩa là việc ĐƯỢC GIAO tháng 8.
  it("lọc theo ngày GIAO VIỆC, không phải ngày hoàn thành", () => {
    expect(assignedInRangeWhere(range)).toEqual({ assignedAt: { gte: range.gte, lt: range.lt } });
  });

  it("không có khoảng → không thêm điều kiện nào", () => {
    expect(assignedInRangeWhere(null)).toEqual({});
  });

  it("hoàn thành = giao trong khoảng VÀ đã xong", () => {
    const w = completedWhere(range);
    expect(w.assignedAt).toEqual({ gte: range.gte, lt: range.lt });
    expect(w.completedAt).toEqual({ not: null });
  });

  // MẶC ĐỊNH: chưa lọc thì đếm toàn thời gian — chỉ còn điều kiện "đã xong".
  it("không có khoảng → chỉ cần ĐÃ hoàn tất", () => {
    const w = completedWhere(null);
    expect(w.assignedAt).toBeUndefined();
    expect(w.completedAt).toEqual({ not: null });
  });

  it("lượt đã huỷ không phải là hoàn thành — kể cả khi không lọc", () => {
    for (const r of [range, null]) {
      expect(completedWhere(r).status).toEqual({ notIn: ["REASSIGNED", "CANCELLED"] });
    }
  });

  // "Nộp muộn" là TẬP CON của "Hoàn thành" — cùng lứa việc, chỉ thêm phán quyết trễ. Lệch khoảng
  // thì Nộp muộn có thể lớn hơn Hoàn thành và bảng số đọc như hỏng.
  it("nộp muộn = hoàn thành cùng lứa + kpiStatus LATE", () => {
    for (const r of [range, null]) {
      const late = lateWhere(r);
      expect(late.assignedAt).toEqual(completedWhere(r).assignedAt);
      expect(late.completedAt).toEqual(completedWhere(r).completedAt);
      expect(late.kpiStatus).toBe("LATE");
    }
  });
});

describe("rangeFromSelection", () => {
  // MẶC ĐỊNH. Nhóm thẻ bên trái vốn là toàn thời gian; để nhóm phải cũng vậy thì cả dải cùng một
  // phạm vi, và tháng/năm trở thành phép thu hẹp do người dùng chủ động chọn.
  it("chưa chọn năm → null = toàn thời gian", () => {
    expect(rangeFromSelection(null, null)).toBeNull();
    expect(rangeFromSelection(undefined, 8)).toBeNull();
  });

  it("chọn năm, chưa chọn tháng → cả năm", () => {
    expect(rangeFromSelection(2026, null)).toEqual(vnYearRange(2026));
  });

  it("chọn cả hai → đúng tháng đó", () => {
    expect(rangeFromSelection(2026, 8)).toEqual(vnMonthRange(2026, 8));
  });

  // ⚠️ "Tháng 8 của mọi năm" không phải câu hỏi ai hỏi. Giao diện khoá ô Tháng cho tới khi chọn
  // Năm nên trạng thái này không dựng được từ màn hình; test khoá lại hành vi cho URL gõ tay.
  it("có tháng mà không có năm → bỏ qua tháng, KHÔNG tạo khoảng vô nghĩa", () => {
    expect(rangeFromSelection(null, 8)).toBeNull();
  });
});

describe("vnYearRange", () => {
  it("trọn năm theo giờ VN, nửa mở sang năm sau", () => {
    const r = vnYearRange(2026)!;
    expect(r.gte.toISOString()).toBe("2025-12-31T17:00:00.000Z");
    expect(r.lt.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });

  it("12 tháng ghép lại đúng bằng cả năm — không hở, không chồng", () => {
    const year = vnYearRange(2026)!;
    expect(vnMonthRange(2026, 1)!.gte.getTime()).toBe(year.gte.getTime());
    expect(vnMonthRange(2026, 12)!.lt.getTime()).toBe(year.lt.getTime());
  });
});

describe("isWithinRange", () => {
  const range = vnMonthRange(2026, 8)!;

  // Bảng và thẻ đếm PHẢI dùng cùng một phép so, nếu không chúng lệch nhau đúng ở ranh giới tháng
  // — và đó là lúc người dùng đang đối soát cuối tháng.
  it("bao gồm mốc đầu, LOẠI mốc cuối (nửa mở, giống bản SQL)", () => {
    expect(isWithinRange(range.gte, range)).toBe(true);
    expect(isWithinRange(range.lt, range)).toBe(false);
  });

  it("không có khoảng → mọi mốc có thật đều tính", () => {
    expect(isWithinRange("2020-01-01T00:00:00Z", null)).toBe(true);
  });

  // Chưa hoàn tất thì không nằm trong bất kỳ khoảng "đã hoàn thành" nào — kể cả khi không lọc.
  it("null/rỗng → false, kể cả khi không lọc", () => {
    expect(isWithinRange(null, null)).toBe(false);
    expect(isWithinRange(undefined, range)).toBe(false);
  });

  it("chuỗi ngày rác → false, không ném lỗi", () => {
    expect(isWithinRange("khong-phai-ngay", range)).toBe(false);
  });
});

describe("yearOptions", () => {
  it("từ năm hiện tại lùi về năm sớm nhất có dữ liệu", () => {
    expect(yearOptions(2024, 2026)).toEqual([2026, 2025, 2024]);
  });

  // KHÔNG chào mời năm trống rỗng: người dùng chọn vào rồi thấy toàn số 0 và tưởng mất dữ liệu.
  it("chưa có dữ liệu → chỉ năm hiện tại", () => {
    expect(yearOptions(null, 2026)).toEqual([2026]);
  });

  it("năm sớm nhất nằm ở tương lai (dữ liệu lỗi) → không sinh mảng ngược", () => {
    expect(yearOptions(2030, 2026)).toEqual([2026]);
  });
});

describe("scopeLabel", () => {
  // Tiêu đề nhóm là nơi DUY NHẤT nói ra mấy con số đang tính trên khoảng nào. Nó mà nói sai thì
  // cả dải thẻ nói sai, và không có chỗ nào khác để đối chiếu.
  it("nói đúng ba phạm vi", () => {
    expect(scopeLabel(null, null)).toBe("toàn thời gian");
    expect(scopeLabel(2026, null)).toBe("năm 2026");
    expect(scopeLabel(2026, 8)).toBe("tháng 8/2026");
  });

  it("có tháng mà không có năm → vẫn là toàn thời gian, khớp với rangeFromSelection", () => {
    expect(scopeLabel(null, 8)).toBe("toàn thời gian");
    expect(rangeFromSelection(null, 8)).toBeNull();
  });
});

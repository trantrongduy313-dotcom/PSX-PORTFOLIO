import { describe, expect, it } from "vitest";

import {
  indexCancelHistory,
  resolveCancelInfo,
  type CancelHistoryEntry,
} from "@/app/lib/business/orders/cancel-info";

const at = (iso: string) => new Date(iso);

const entry = (over: Partial<CancelHistoryEntry> = {}): CancelHistoryEntry => ({
  orderId: "SO1",
  performedAt: at("2026-06-01T03:00:00Z"),
  metadata: null,
  ...over,
});

describe("Hủy TỪNG MO — bản ghi có scopedItemId", () => {
  it("gán lý do + ngày cho đúng MO đó", () => {
    const idx = indexCancelHistory([entry({
      metadata: { scopedItemId: "IT1", reason: "Khách đổi mẫu" },
      performedAt: at("2026-06-05T02:30:00Z"),
    })]);
    const info = resolveCancelInfo(idx, "IT1", "SO1");
    expect(info?.cancelReason).toBe("Khách đổi mẫu");
    expect(info?.cancelledAt).toBe("2026-06-05T02:30:00.000Z");
  });

  it("KHÔNG lây sang MO khác cùng đơn", () => {
    const idx = indexCancelHistory([entry({
      metadata: { scopedItemId: "IT1", reason: "Sai size" },
    })]);
    expect(resolveCancelInfo(idx, "IT2", "SO1")).toBeNull();
  });
});

describe("Hủy CẢ SO — bản ghi không có scopedItemId", () => {
  it("áp cho mọi MO của đơn đó", () => {
    const idx = indexCancelHistory([entry({ metadata: { reason: "Khách bỏ đơn" } })]);
    expect(resolveCancelInfo(idx, "IT1", "SO1")?.cancelReason).toBe("Khách bỏ đơn");
    expect(resolveCancelInfo(idx, "IT9", "SO1")?.cancelReason).toBe("Khách bỏ đơn");
  });

  it("không áp sang đơn khác", () => {
    const idx = indexCancelHistory([entry({ metadata: { reason: "Khách bỏ đơn" } })]);
    expect(resolveCancelInfo(idx, "IT1", "SO2")).toBeNull();
  });
});

describe("Ưu tiên: bản ghi của chính MO thắng bản ghi cấp SO", () => {
  // Một MO có thể bị hủy riêng (lý do riêng) rồi sau đó cả SO bị hủy vì lý do khác. Lấy bản
  // cấp SO là gán sai lý do cho một MO đã có lý do đúng của nó.
  it("MO có lý do riêng thì giữ lý do riêng", () => {
    const idx = indexCancelHistory([
      entry({ metadata: { scopedItemId: "IT1", reason: "Sai size" } }),
      entry({ metadata: { reason: "Khách bỏ đơn" } }),
    ]);
    expect(resolveCancelInfo(idx, "IT1", "SO1")?.cancelReason).toBe("Sai size");
    // MO khác không có bản riêng → vẫn dùng bản cấp SO
    expect(resolveCancelInfo(idx, "IT2", "SO1")?.cancelReason).toBe("Khách bỏ đơn");
  });
});

describe("Hủy nhiều lần — lấy LẦN CUỐI", () => {
  // Hủy → admin mở lại → hủy lại. Lần đang có hiệu lực là lần cuối; lấy lần đầu là hiện một
  // lý do đã lỗi thời. Đầu vào phải sắp performedAt tăng dần (route dùng orderBy asc).
  it("bản ghi sau ghi đè bản ghi trước", () => {
    const idx = indexCancelHistory([
      entry({ metadata: { scopedItemId: "IT1", reason: "Lý do cũ" }, performedAt: at("2026-05-01T00:00:00Z") }),
      entry({ metadata: { scopedItemId: "IT1", reason: "Lý do mới" }, performedAt: at("2026-07-01T00:00:00Z") }),
    ]);
    const info = resolveCancelInfo(idx, "IT1", "SO1");
    expect(info?.cancelReason).toBe("Lý do mới");
    expect(info?.cancelledAt).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("Lý do CHỈ đến từ metadata.reason — comment là trường hệ thống", () => {
  it("bản ghi ROLLUP tự động KHÔNG được thành lý do", () => {
    // ĐÂY LÀ LỖI ĐÃ LỌT RA PRODUCTION. Khi MO cuối của SO thành terminal, code tự ghi một bản
    // ghi cấp SO: comment = "Tất cả MO đã hủy", KHÔNG có metadata. Bản đầu của module này lấy
    // comment làm dự phòng, nên toàn bộ 29 đơn hủy cũ đều hiện đúng câu hệ thống đó ở cột "Lý
    // do hủy" — trông y như một lý do do người viết.
    //
    // Bản ghi rollup KHÔNG có `comment` trong type nữa (route cũng không select nó), nên test
    // này khoá đúng thứ cần khoá: bản ghi thiếu metadata.reason phải ra null.
    const idx = indexCancelHistory([{
      orderId: "SO1",
      metadata: null,
      performedAt: at("2026-07-10T03:00:00Z"),
    }]);
    const info = resolveCancelInfo(idx, "IT1", "SO1");
    expect(info?.cancelReason).toBeNull();
    // Nhưng NGÀY vẫn phải có: một mốc thời gian là một mốc thời gian.
    expect(info?.cancelledAt).toBe("2026-07-10T03:00:00.000Z");
  });

  it("bản ghi rollup KHÔNG che lý do thật của MO", () => {
    // MO có bản ghi riêng (có lý do), rollup ghi sau. Rollup là cấp SO nên không được thắng —
    // nếu thắng thì lý do người dùng vừa gõ biến thành "Tất cả MO đã hủy".
    const idx = indexCancelHistory([
      entry({ metadata: { scopedItemId: "IT1", reason: "Khách đổi mẫu" }, performedAt: at("2026-07-01T00:00:00Z") }),
      entry({ metadata: null, performedAt: at("2026-07-02T00:00:00Z") }),
    ]);
    expect(resolveCancelInfo(idx, "IT1", "SO1")?.cancelReason).toBe("Khách đổi mẫu");
  });

  it("lý do rỗng/toàn khoảng trắng → null, KHÔNG phải chuỗi rỗng", () => {
    // Chuỗi rỗng làm cột hiện một ô trắng trông như lỗi render; null thì bảng hiện "—".
    const idx = indexCancelHistory([entry({ metadata: { reason: "   " } })]);
    const info = resolveCancelInfo(idx, "IT1", "SO1");
    expect(info?.cancelReason).toBeNull();
    // Ngày vẫn phải có — không có lý do không có nghĩa là không có bản ghi hủy.
    expect(info?.cancelledAt).toBe("2026-06-01T03:00:00.000Z");
  });

  it("reason không phải chuỗi (dữ liệu JSON rác) → null, không nổ", () => {
    const idx = indexCancelHistory([entry({ metadata: { reason: { nested: true } } })]);
    expect(resolveCancelInfo(idx, "IT1", "SO1")?.cancelReason).toBeNull();
  });
});

describe("Không có bản ghi nào", () => {
  // Đơn hủy TRƯỚC bản sửa này không có workflowHistory per-MO → phải trả null để bảng hiện
  // "—". Cố ý KHÔNG rơi về updatedAt: một ngày sai trông y như một ngày đúng.
  it("trả null thay vì đoán", () => {
    const idx = indexCancelHistory([]);
    expect(resolveCancelInfo(idx, "IT1", "SO1")).toBeNull();
  });
});

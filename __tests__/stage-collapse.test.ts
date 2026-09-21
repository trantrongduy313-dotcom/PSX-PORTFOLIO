import { describe, it, expect } from "vitest";
import {
  shouldExpandStage,
  stageSummary,
  isRecordComplete,
  hasIncompleteRecords,
  isRecordFailed,
} from "@/app/lib/business/stage-collapse";
import type { StageRecord } from "@/app/lib/utils/order-helpers";

const rec = (o: Partial<StageRecord> = {}): StageRecord => ({ crafter: "Testing", ...o });

describe("mặc định mở/gọn — SUY RA từ trạng thái, không lưu", () => {
  it("Xong / Đã huỷ / Chưa tới → thu gọn", () => {
    for (const s of ["done", "cancelled", "pending"]) {
      expect(shouldExpandStage({ stageCode: "DUC", stageStatus: s, records: [rec({ ketQua: "Đạt" })] })).toBe(false);
    }
  });

  it("Đang làm / QC / Tạm ngưng → mở", () => {
    for (const s of ["doing", "qc", "hold"]) {
      expect(shouldExpandStage({ stageCode: "DUC", stageStatus: s })).toBe(true);
    }
  });

  it("trạng thái lạ → mở, không nuốt mất khâu", () => {
    expect(shouldExpandStage({ stageCode: "DUC", stageStatus: "gi-do-moi" })).toBe(true);
  });
});

describe("LUẬT AN TOÀN: Xong mà còn thẻ khuyết thì VẪN MỞ", () => {
  // Thu gọn lúc đó là giấu mất một lỗi, giấu đúng chỗ người ta cần thấy nhất.
  it("thiếu tên thợ", () => {
    expect(shouldExpandStage({
      stageCode: "DUC", stageStatus: "done",
      records: [rec({ crafter: "", ketQua: "Đạt" })],
    })).toBe(true);
  });

  it("thiếu ô kết quả của khâu", () => {
    expect(shouldExpandStage({
      stageCode: "RESIN", stageStatus: "done",
      records: [rec({ resinWeightOk: "" })],
    })).toBe(true);
  });

  it("đủ dữ liệu thì gọn bình thường", () => {
    expect(shouldExpandStage({
      stageCode: "RESIN", stageStatus: "done",
      records: [rec({ resinWeightOk: "Đạt" })],
    })).toBe(false);
  });

  it("luật này CHỈ áp cho 'done' — chưa tới thì khuyết là chuyện thường", () => {
    expect(shouldExpandStage({
      stageCode: "DUC", stageStatus: "pending",
      records: [rec({ crafter: "", ketQua: "" })],
    })).toBe(false);
  });
});

describe("lựa chọn TAY thắng mọi luật", () => {
  it("bấm mở khâu đã xong → ở yên", () => {
    expect(shouldExpandStage({ stageCode: "DUC", stageStatus: "done", manual: true })).toBe(true);
  });

  it("bấm gọn khâu đang làm → ở yên", () => {
    expect(shouldExpandStage({ stageCode: "DUC", stageStatus: "doing", manual: false })).toBe(false);
  });

  it("bấm gọn thắng cả luật an toàn — người dùng đã NHÌN THẤY rồi mới đóng", () => {
    expect(shouldExpandStage({
      stageCode: "DUC", stageStatus: "done", manual: false,
      records: [rec({ ketQua: "" })],
    })).toBe(false);
  });
});

describe("isRecordComplete — mỗi khâu một ô kết quả riêng", () => {
  it("Nguội / TC Nguội / Đúc đòi Chất lượng SP", () => {
    for (const c of ["NGUOI", "TC_NGUOI", "DUC"]) {
      expect(isRecordComplete(c, rec({ ketQua: "" }))).toBe(false);
      expect(isRecordComplete(c, rec({ ketQua: "Đạt" }))).toBe(true);
    }
  });

  it("Resin đòi KQ trọng lượng", () => {
    expect(isRecordComplete("RESIN", rec({ resinWeightOk: "" }))).toBe(false);
    expect(isRecordComplete("RESIN", rec({ resinWeightOk: "Đạt" }))).toBe(true);
  });

  it("Hột CHỈ đòi tên thợ — không có ô kết quả nào để dựa, đòi thêm là báo thiếu oan", () => {
    expect(isRecordComplete("HOT", rec())).toBe(true);
    expect(isRecordComplete("HOT", rec({ crafter: "  " }))).toBe(false);
  });

  it("hasIncompleteRecords: rỗng thì không thiếu", () => {
    expect(hasIncompleteRecords("DUC", [])).toBe(false);
  });
});

describe("stageSummary", () => {
  it("chưa có thợ → null, không hiện dòng rỗng", () => {
    expect(stageSummary("DUC", [])).toBeNull();
  });

  it("NHIỀU hơn 1 thợ → ghi CHUNG CHUNG, muốn chi tiết thì mở ra", () => {
    expect(stageSummary("NGUOI", [rec({ ketQua: "Đạt" }), rec({ crafter: "B", ketQua: "Đạt" })]))
      .toBe("2 thợ");
  });

  it("nhưng chung chung KHÔNG được nuốt mất lần KHÔNG ĐẠT", () => {
    expect(stageSummary("NGUOI", [
      rec({ ketQua: "Đạt" }),
      rec({ crafter: "B", ketQua: "Không đạt" }),
      rec({ crafter: "C", ketQua: "Không đạt" }),
    ])).toBe("3 thợ · có 2 lần KHÔNG ĐẠT");
  });

  it("một thợ Nguội → tên · kết quả · giờ thực tế", () => {
    expect(stageSummary("NGUOI", [rec({ ketQua: "Đạt", gioThucTe: "4h30" })]))
      .toBe("Testing · Đạt · 4h30 thực tế");
  });

  it("một thợ Đúc → tên · kết quả", () => {
    expect(stageSummary("DUC", [rec({ ketQua: "Đạt" })])).toBe("Testing · Đạt");
  });

  it("một lần Resin → 'Còn lại' là raw trừ ty, tính lại y như màn hình", () => {
    expect(stageSummary("RESIN", [rec({ resinWeightOk: "Đạt", resinWeightRaw: 14.5, resinWeightTy: 2.2 })]))
      .toBe("Testing · Đạt · 12.3g còn lại");
  });

  it("Resin chưa nhập ty → còn lại chính là số thô", () => {
    expect(stageSummary("RESIN", [rec({ resinWeightRaw: 10 })])).toBe("Testing · 10g còn lại");
  });

  it("Hột không có phần số — khâu đó đã có dòng loại hột + tổng riêng", () => {
    expect(stageSummary("HOT", [rec({ stoneQty: 12 })])).toBe("Testing");
  });

  it("thẻ trống hoàn toàn → null, không hiện dấu chấm giữa lơ lửng", () => {
    expect(stageSummary("DUC", [rec({ crafter: "" })])).toBeNull();
  });

  it("isRecordFailed nhận cả ba tiêu chí", () => {
    expect(isRecordFailed(rec({ ketQua: "Không đạt" }))).toBe(true);
    expect(isRecordFailed(rec({ resinWeightOk: "Không đạt" }))).toBe(true);
    expect(isRecordFailed(rec({ thoiGianOk: "Không đạt" }))).toBe(true);
    expect(isRecordFailed(rec({ ketQua: "Đạt" }))).toBe(false);
  });
});

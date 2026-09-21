import { describe, it, expect } from "vitest";

import {
  STAGE_ORDER,
  STAGE_GROUP,
  STAGE_HAS_RECORDS,
  stagesInGroup,
  type StageCode,
} from "@/app/lib/business/production-stage";

// Bộ test này tồn tại vì MỘT lớp lỗi cụ thể đã xảy ra ba lần: thêm/đổi khâu ở một nơi rồi
// quên nơi khác. TC_NGUOI bị bỏ sót khỏi STAGE_MULTI (mất Lịch sử thay đổi), khỏi báo cáo
// KPI, và khỏi màn Đánh giá Khâu — mỗi lần đều im lặng, không lỗi biên dịch, không lỗi chạy.
// Các test dưới đây biến "quên một khâu" thành lỗi ĐỎ ngay tại CI.

describe("STAGE_GROUP — phủ toàn bộ khâu", () => {
  it("mọi khâu trong STAGE_ORDER đều có nhóm", () => {
    const missing = STAGE_ORDER.filter((code) => !(code in STAGE_GROUP));
    expect(missing).toEqual([]);
  });

  it("không khai thừa khâu lạ ngoài STAGE_ORDER", () => {
    const known = new Set<string>(STAGE_ORDER);
    const extra = Object.keys(STAGE_GROUP).filter((c) => !known.has(c));
    expect(extra).toEqual([]);
  });

  it("nhóm của một khâu luôn là một mã khâu hợp lệ", () => {
    const known = new Set<string>(STAGE_ORDER);
    const bad = Object.entries(STAGE_GROUP).filter(([, g]) => !known.has(g));
    expect(bad).toEqual([]);
  });

  it("nhóm là idempotent: nhóm của một nhóm chính là nó", () => {
    // Chặn cấu hình lồng nhau kiểu A→B→C, thứ sẽ khiến việc gộp phụ thuộc thứ tự duyệt.
    const bad = STAGE_ORDER.filter((code) => {
      const g = STAGE_GROUP[code];
      return STAGE_GROUP[g] !== g;
    });
    expect(bad).toEqual([]);
  });
});

describe("Nhóm Nguội — quy tắc nghiệp vụ được code hoá", () => {
  it("gồm đúng NGUOI + TC_NGUOI + KHOA", () => {
    expect(stagesInGroup("NGUOI")).toEqual(["NGUOI", "TC_NGUOI", "KHOA"]);
  });

  it("giữ đúng thứ tự sản xuất của STAGE_ORDER", () => {
    const group = stagesInGroup("NGUOI");
    const idx = group.map((c) => STAGE_ORDER.indexOf(c));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it("KHOA và TC_NGUOI không còn là nhóm độc lập", () => {
    // Chính vì trước đây chúng đứng riêng mà KPI mới bỏ sót 30 công việc thật.
    expect(STAGE_GROUP.KHOA).toBe("NGUOI");
    expect(STAGE_GROUP.TC_NGUOI).toBe("NGUOI");
  });

  it("không kéo nhầm khâu khác vào nhóm Nguội", () => {
    const outsiders: StageCode[] = ["HOT", "TC_DAY", "DUC", "RESIN", "QC", "DBXM", "MOC"];
    for (const code of outsiders) expect(STAGE_GROUP[code]).not.toBe("NGUOI");
  });
});

describe("STAGE_HAS_RECORDS", () => {
  it("chỉ chứa mã khâu hợp lệ", () => {
    const known = new Set<string>(STAGE_ORDER);
    const bad = [...STAGE_HAS_RECORDS].filter((c) => !known.has(c));
    expect(bad).toEqual([]);
  });

  it("TC_NGUOI phải có mặt — đây chính là bug audit đã vá", () => {
    // Thiếu dòng này thì mọi sửa đổi records[] của TC Nguội lại mất khỏi Lịch sử thay đổi.
    expect(STAGE_HAS_RECORDS.has("TC_NGUOI")).toBe(true);
  });

  it("KHOA KHÔNG có records[] — dữ liệu thật vẫn ở dạng scalar", () => {
    // Nơi đọc nhóm Nguội bắt buộc phải chịu được cả hai dạng; nếu ngày nào KHOA được
    // chuyển sang records[] thì test này đỏ, nhắc cập nhật cả nơi đọc.
    expect(STAGE_HAS_RECORDS.has("KHOA")).toBe(false);
  });
});

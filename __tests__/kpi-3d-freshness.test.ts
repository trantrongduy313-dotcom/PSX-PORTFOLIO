import { describe, expect, it } from "vitest";

import {
  freshnessLabel,
  freshnessSignature,
  type FreshnessCounters,
} from "@/app/lib/business/kpi-3d/freshness";

// Màn Việc thiết kế 3D nạp dữ liệu ĐÚNG MỘT LẦN lúc mở, nên NV 3D ngồi mở màn cả buổi không bao
// giờ thấy đơn vừa giao, và Admin không biết nhân viên đã cập nhật hay đã xong — cả hai phải F5.

const c = (o: Partial<FreshnessCounters> = {}): FreshnessCounters => ({
  assignmentCount: 3,
  assignmentUpdatedAt: new Date("2026-08-13T02:00:00Z"),
  progressLogCount: 5,
  progressLogLatestAt: new Date("2026-08-13T01:00:00Z"),
  pauseCount: 1,
  pauseLatestAt: new Date("2026-08-12T09:00:00Z"),
  orderItemCount: 3,
  orderItemUpdatedAt: new Date("2026-08-13T02:30:00Z"),
  productionDetailUpdatedAt: new Date("2026-08-13T02:45:00Z"),
  ...o,
});

describe("freshnessSignature", () => {
  // 🔴 CHỐT CHẶN CHO QUY TẮC "THÊM TRƯỜNG THÌ THÊM BẢNG VÀO CHỮ KÝ".
  //
  // Trước đây quy tắc đó chỉ là một đoạn văn trong comment, và nó đã bị bỏ sót HAI LẦN:
  // `OrderItem` (Đặt đơn sửa NVL mà NV 3D thấy giá trị cũ cả buổi rồi dựng theo) và
  // `ProductionDetail` (đổi Yêu cầu thiết kế mà bảng 3D đứng im).
  //
  // Nay thêm một bảng vào chữ ký là test này ĐỎ, buộc người sửa phải đọc con số và xác nhận.
  it("chữ ký có ĐÚNG 9 phần — thêm bảng vào chữ ký phải cập nhật test này", () => {
    expect(freshnessSignature(c()).split("|")).toHaveLength(9);
  });

  it("cùng dữ liệu → cùng chữ ký", () => {
    expect(freshnessSignature(c())).toBe(freshnessSignature(c()));
  });

  it("Date và chuỗi ISO cho cùng chữ ký — API trả chuỗi, server dùng Date", () => {
    expect(freshnessSignature(c({ assignmentUpdatedAt: "2026-08-13T02:00:00.000Z" })))
      .toBe(freshnessSignature(c()));
  });

  it("giao một đơn mới → chữ ký đổi", () => {
    expect(freshnessSignature(c({ assignmentCount: 4 }))).not.toBe(freshnessSignature(c()));
  });

  // ─── ORDERITEM: BẢNG THỨ TƯ, TỪNG BỊ BỎ SÓT ────────────────────────────────
  //
  // Sửa MO không chạm Design3DAssignment.updatedAt, không tạo dòng tiến độ, không tạo khoảng
  // dừng. Thiếu nó thì chữ ký KHÔNG ĐỔI → màn 3D không bao giờ tự kéo lại, mà vẫn trông như đang
  // cập nhật đầy đủ. Đây là lỗi đã chạy thật, không phải giả định.

  it("đổi ưu tiên thiết kế (OrderItem.updatedAt mới) → chữ ký đổi", () => {
    expect(freshnessSignature(c({ orderItemUpdatedAt: new Date("2026-08-13T05:00:00Z") })))
      .not.toBe(freshnessSignature(c()));
  });

  // Hậu quả nặng hơn cả cái chip ưu tiên: màn 3D đọc NVL/size/trọng lượng/xi mạ từ OrderItem.
  // Đặt đơn sửa NVL của một MO đang dựng mà NV 3D vẫn thấy NVL cũ cả buổi — và dựng theo nó.
  it("sửa NVL của MO cũng làm chữ ký đổi — cùng một cột updatedAt", () => {
    const before = freshnessSignature(c());
    const after = freshnessSignature(c({ orderItemUpdatedAt: "2026-08-13T06:00:00.000Z" }));
    expect(after).not.toBe(before);
  });

  // ĐẾM đi cùng MỐC: một MO rời khỏi phạm vi (lượt bị huỷ/giao lại) làm count giảm nhưng KHÔNG
  // làm _max(updatedAt) mới hơn — chỉ nhìn mốc thì không thấy gì đổi.
  it("một MO rời khỏi phạm vi → chữ ký đổi dù mốc không mới hơn", () => {
    expect(freshnessSignature(c({ orderItemCount: 2 }))).not.toBe(freshnessSignature(c()));
  });

  // ProductionDetail giữ "Yêu cầu thiết kế" trong extraData JSON. Suýt bị bỏ sót lần thứ hai
  // đúng như OrderItem — thiếu thì Đặt đơn đổi yêu cầu mà bảng 3D đứng im.
  it("đổi Yêu cầu thiết kế (ProductionDetail.updatedAt mới) → chữ ký đổi", () => {
    expect(freshnessSignature(c({ productionDetailUpdatedAt: new Date("2026-08-13T07:00:00Z") })))
      .not.toBe(freshnessSignature(c()));
  });

  // Chỗ gọi cũ chưa truyền hai trường mới thì vẫn phải dựng được chữ ký, không ném lỗi.
  it("thiếu hai trường OrderItem vẫn dựng được chữ ký ổn định", () => {
    const partial: FreshnessCounters = {
      assignmentCount: 3,
      assignmentUpdatedAt: new Date("2026-08-13T02:00:00Z"),
      progressLogCount: 5,
      progressLogLatestAt: new Date("2026-08-13T01:00:00Z"),
      pauseCount: 1,
      pauseLatestAt: new Date("2026-08-12T09:00:00Z"),
    };
    expect(freshnessSignature(partial)).toBe(freshnessSignature(partial));
    expect(freshnessSignature(partial)).not.toContain("undefined");
  });

  it("sửa một lượt (không đổi số lượng) → chữ ký đổi", () => {
    expect(freshnessSignature(c({ assignmentUpdatedAt: new Date("2026-08-13T03:00:00Z") })))
      .not.toBe(freshnessSignature(c()));
  });

  // ⚠️ HAI TEST QUAN TRỌNG NHẤT FILE NÀY.
  // `assignment.updatedAt` MỘT MÌNH không đủ: lưu một dòng tiến độ chỉ có ghi chú (trạng thái
  // không đổi) và tạo một khoảng tạm dừng đều KHÔNG chạm vào assignment. Cả hai đều làm màn hình
  // phải đổi. Chỉ nhìn updatedAt thì hai thao tác đó không bao giờ được phát hiện — mà màn hình
  // vẫn trông như đang cập nhật đầy đủ, nên không ai nghi ngờ tới lúc đối chiếu KPI.
  it("thêm một dòng tiến độ → chữ ký đổi, dù lượt giao việc không đổi", () => {
    expect(freshnessSignature(c({ progressLogCount: 6, progressLogLatestAt: new Date("2026-08-13T04:00:00Z") })))
      .not.toBe(freshnessSignature(c()));
  });

  it("tạm dừng một đơn → chữ ký đổi, dù lượt giao việc không đổi", () => {
    expect(freshnessSignature(c({ pauseCount: 2, pauseLatestAt: new Date("2026-08-13T05:00:00Z") })))
      .not.toBe(freshnessSignature(c()));
  });

  // Xoá một lượt làm count giảm nhưng KHÔNG làm mốc sửa gần nhất mới hơn — chỉ nhìn mốc thì không
  // thấy gì đổi. Vì vậy chữ ký phải mang cả ĐẾM lẫn MỐC.
  it("xoá một lượt (mốc không mới hơn) → vẫn đổi chữ ký", () => {
    const before = freshnessSignature(c({ assignmentCount: 3 }));
    const after = freshnessSignature(c({ assignmentCount: 2 }));
    expect(after).not.toBe(before);
  });

  it("phạm vi rỗng cho chữ ký ổn định, không phải chuỗi rác", () => {
    const empty: FreshnessCounters = {
      assignmentCount: 0, assignmentUpdatedAt: null,
      progressLogCount: 0, progressLogLatestAt: null,
      pauseCount: 0, pauseLatestAt: null,
    };
    expect(freshnessSignature(empty)).toBe(freshnessSignature({ ...empty }));
    expect(freshnessSignature(empty)).not.toContain("NaN");
    expect(freshnessSignature(empty)).not.toContain("Invalid");
  });

  it("mốc rác không lan ra chữ ký dưới dạng NaN", () => {
    const sig = freshnessSignature(c({ assignmentUpdatedAt: "khong-phai-ngay" }));
    expect(sig).not.toContain("NaN");
    // Và phải KHÁC chữ ký của "không có mốc nào"? Không — cả hai đều là "không đọc được", coi như
    // nhau là đúng. Test giữ chỗ để ai đổi thì thấy chủ ý.
    expect(sig).toBe(freshnessSignature(c({ assignmentUpdatedAt: null })));
  });
});

describe("freshnessLabel", () => {
  const now = new Date("2026-08-13T10:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("dưới 10 giây → vừa xong", () => {
    expect(freshnessLabel(ago(3_000), now)).toBe("vừa xong");
  });

  it("giây", () => {
    expect(freshnessLabel(ago(25_000), now)).toBe("25 giây trước");
  });

  it("phút", () => {
    expect(freshnessLabel(ago(5 * 60_000), now)).toBe("5 phút trước");
  });

  it("giờ", () => {
    expect(freshnessLabel(ago(3 * 3_600_000), now)).toBe("3 giờ trước");
  });

  it("ngày", () => {
    expect(freshnessLabel(ago(2 * 86_400_000), now)).toBe("2 ngày trước");
  });

  it("chưa có dữ liệu → rỗng, không phải chữ 'null'", () => {
    expect(freshnessLabel(null, now)).toBe("");
  });

  it("mốc rác → rỗng", () => {
    expect(freshnessLabel(new Date("khong-phai-ngay"), now)).toBe("");
  });

  // Đồng hồ máy lùi giữa hai lần đọc thì hiệu ra số âm. "-3 giây trước" đọc như lỗi hệ thống.
  it("đồng hồ máy lùi → vừa xong, không ra số âm", () => {
    expect(freshnessLabel(new Date(now.getTime() + 5_000), now)).toBe("vừa xong");
  });

  it("đúng 60 giây → chuyển sang phút, không phải '60 giây trước'", () => {
    expect(freshnessLabel(ago(60_000), now)).toBe("1 phút trước");
  });
});

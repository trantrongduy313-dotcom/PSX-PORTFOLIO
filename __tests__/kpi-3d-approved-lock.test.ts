import { describe, expect, it } from "vitest";

import {
  deniedReasonForOrderFormAssign,
  isApproved,
} from "@/app/lib/business/kpi-3d/approved-lock";

// Ba cửa tạo lượt trên màn Việc thiết kế 3D đều đã chặn ACCEPTED (reassign / continuation /
// pause). CỬA CŨ NHẤT — đồng bộ từ form đơn hàng, chạy ở MỌI lần lưu tab Thiết kế — thì không.
//
// ⚠️ Và nó không tự thấy được: duyệt KHÔNG đổi `status`, nên lượt đã duyệt vẫn mang SENT_RESULT và
// vẫn nằm trong ACTIVE_ASSIGNMENT_STATUSES — với đường đó nó trông y như lượt đang chạy.

const approved = { reviewStatus: "ACCEPTED" };
const pending = { reviewStatus: "PENDING_REVIEW" };

const ask = (o: Partial<Parameters<typeof deniedReasonForOrderFormAssign>[0]> = {}) =>
  deniedReasonForOrderFormAssign({
    matched: null,
    designerId: "d2",
    designerName: "BÌNH",
    active: [],
    ...o,
  });

describe("isApproved", () => {
  it("chỉ ACCEPTED là đã chốt", () => {
    expect(isApproved({ reviewStatus: "ACCEPTED" })).toBe(true);
    expect(isApproved({ reviewStatus: "PENDING_REVIEW" })).toBe(false);
    expect(isApproved({ reviewStatus: "REWORK" })).toBe(false);
    expect(isApproved({ reviewStatus: null })).toBe(false);
  });
});

describe("MO chưa có lượt nào được duyệt → không chặn gì", () => {
  it("tạo mới trên MO chưa duyệt", () => {
    expect(ask({ active: [pending] })).toBeNull();
  });

  it("tạo mới trên MO chưa có lượt nào", () => {
    expect(ask({ active: [] })).toBeNull();
  });

  it("đổi người ở một lượt CHƯA duyệt vẫn được — đó là bàn giao bình thường", () => {
    expect(ask({ matched: { ...pending, designer3DId: "d1" }, active: [pending] })).toBeNull();
  });

  it("lượt đang REWORK vẫn giao được — bản nộp bị bác thì phải giao lại được", () => {
    const rework = { reviewStatus: "REWORK" };
    expect(ask({ matched: { ...rework, designer3DId: "d1" }, active: [rework] })).toBeNull();
  });
});

describe("MO đã có bản được duyệt", () => {
  // ⚠️ TEST QUAN TRỌNG NHẤT FILE NÀY — chính yêu cầu nghiệp vụ: đã duyệt thì không thêm KPI.
  // Thêm một khối NV 3D trên MO đã duyệt sẽ TẠO một lượt mới với NGUYÊN suất giờ chuẩn.
  it("thêm người mới → CHẶN", () => {
    const reason = ask({ matched: null, active: [approved] });
    expect(reason).not.toBeNull();
    expect(reason).toContain("ĐƯỢC DUYỆT");
    expect(reason).toContain("BÌNH");
  });

  // Nặng hơn ca trên: matchAssignment mức 3 vơ lấy chính lượt đã duyệt rồi coi là BÀN GIAO — nó
  // ĐÓNG một lượt đã duyệt, tức huỷ luôn một phán quyết KPI đã đóng dấu.
  it("đổi tên người ở khối của lượt ĐÃ DUYỆT → CHẶN", () => {
    const reason = ask({
      matched: { ...approved, designer3DId: "d1" },
      designerId: "d2",
      active: [approved],
    });
    expect(reason).not.toBeNull();
    expect(reason).toContain("không đổi sang nhân viên khác");
  });

  // ⚠️ KHÔNG ĐƯỢC CHẶN CA NÀY. Order lưu đơn vì sửa tên khách hàng thì đường đồng bộ vẫn chạy và
  // vẫn khớp lại đúng lượt đã duyệt của đúng người đó. Chặn ở đây nghĩa là MỌI lần lưu một đơn đã
  // duyệt đều nổ cảnh báo — và người dùng sẽ học cách bỏ qua cảnh báo, kể cả cảnh báo thật.
  it("khớp lại ĐÚNG người của lượt đã duyệt → KHÔNG chặn", () => {
    expect(ask({
      matched: { ...approved, designer3DId: "d1" },
      designerId: "d1",
      active: [approved],
    })).toBeNull();
  });

  // ⚠️ LỜI CHẶN PHẢI CHỈ ĐÚNG ĐƯỜNG CÒN TỒN TẠI.
  // Bản trước nó chỉ tới nút "Yêu cầu làm lại" — nút đó ĐÃ BỎ khỏi lượt đã duyệt, vì nó chính là
  // đường lách cái luật ở file này (mở lại một lượt đã chốt rồi đổi người). Một câu chỉ đường tới
  // cái nút không còn tồn tại thì tệ hơn không chỉ đường: người dùng đi tìm, không thấy, rồi kết
  // luận là hệ thống hỏng.
  it("lời chặn chỉ sang PHIÊN BẢN MỚI, không chỉ tới nút đã bỏ", () => {
    for (const reason of [
      ask({ matched: null, active: [approved] }),
      ask({ matched: { ...approved, designer3DId: "d1" }, active: [approved] }),
    ]) {
      expect(reason).toContain("PHIÊN BẢN MỚI");
      expect(reason).not.toContain("Yêu cầu làm lại");
    }
  });

  // MO nhiều NV 3D: một người đã được duyệt, một người còn đang làm. Bản thiết kế của MO đã được
  // chấp nhận rồi, nên thêm NGƯỜI THỨ BA vẫn là thêm một suất KPI cho việc đã xong.
  it("một lượt đã duyệt lẫn giữa các lượt đang chạy → vẫn chặn tạo mới", () => {
    expect(ask({ matched: null, active: [pending, approved, pending] })).not.toBeNull();
  });

  // Người đang làm dở vẫn phải lưu được — khoá là ở việc TẠO THÊM và ĐỔI NGƯỜI, không phải ở việc
  // ghi tiếp cho một lượt chưa duyệt.
  it("khớp lại một lượt CHƯA duyệt trên MO đã có lượt duyệt khác → KHÔNG chặn", () => {
    expect(ask({
      matched: { ...pending, designer3DId: "d1" },
      designerId: "d1",
      active: [approved, pending],
    })).toBeNull();
  });
});

// ─── ĐANG TẠM DỪNG = ĐÃ CHỐT SỐ ──────────────────────────────────────────────
//
// Tạm dừng đóng băng giờ vào `confirmedMinutes` và khoá không cho gửi kết quả — nghiệp vụ coi
// nó ngang một lượt đã xong. Nhưng đường đồng bộ từ form đơn hàng KHÔNG TỰ THẤY: tạm dừng
// không đổi `status`, nên lượt đang dừng vẫn nằm trong ACTIVE_ASSIGNMENT_STATUSES.
//
// Không chặn thì đổi tên nhân viên ở form đơn hàng bị hiểu là BÀN GIAO: đóng lượt cũ thành
// REASSIGNED mà KHÔNG ghi `actualMinutes`. Báo cáo KPI lấy tổng giờ từ cột đó, nên công của
// người bị dừng biến mất — âm thầm, đúng con số mà thao tác tạm dừng sinh ra để bảo vệ.

describe("lượt đang TẠM DỪNG — khoá như đã xong", () => {
  const paused = { reviewStatus: "PENDING_REVIEW", hasOpenPause: true, designer3DId: "d1" };

  it("đổi sang người KHÁC → chặn", () => {
    const reason = ask({ matched: paused, designerId: "d2", designerName: "BÌNH" });
    expect(reason).not.toBeNull();
    expect(reason).toContain("TẠM DỪNG");
  });

  it("lời chặn phải CHỈ ĐƯỜNG tới cửa đúng, không chỉ nói 'không được'", () => {
    // Một câu chặn không kèm lối đi tiếp sẽ đẩy người dùng đi tìm cửa khác — và cửa khác
    // ("+ Thêm NV 3D") tạo lượt SONG SONG, tức lại hỏng theo một kiểu khác.
    expect(ask({ matched: paused, designerId: "d2" })).toContain("Giao lượt tiếp theo");
  });

  it("CÙNG người → KHÔNG chặn: đó chỉ là một lần lưu đơn bình thường", () => {
    // Chặn cả ca này thì MỌI lần lưu đơn của MO đang dừng đều nổ cảnh báo, và người dùng sẽ
    // học cách bỏ qua cảnh báo — mất luôn tác dụng của chính chốt chặn này.
    expect(ask({ matched: paused, designerId: "d1" })).toBeNull();
  });

  it("thêm NV 3D SONG SONG khi MO có lượt đang dừng → KHÔNG chặn", () => {
    // Cái bị khoá là LƯỢT đang dừng, không phải cả MO. Người mới là một lượt khác, ngân sách riêng.
    expect(ask({ matched: null, designerId: "d3", active: [paused] })).toBeNull();
  });

  it("không có cờ hoặc cờ false → không dính luật này", () => {
    expect(ask({ matched: { reviewStatus: "PENDING_REVIEW", designer3DId: "d1" }, designerId: "d2" })).toBeNull();
    expect(ask({ matched: { ...paused, hasOpenPause: false }, designerId: "d2" })).toBeNull();
  });

  it("vừa tạm dừng vừa đã duyệt → vẫn chặn, và lời chặn không mâu thuẫn", () => {
    const reason = ask({ matched: { ...paused, reviewStatus: "ACCEPTED" }, designerId: "d2" });
    expect(reason).not.toBeNull();
    // Tạm dừng xét trước — hai lời chặn cùng đúng, nhưng chỉ được nói MỘT.
    expect(reason).toContain("TẠM DỪNG");
    expect(reason).not.toContain("ĐƯỢC DUYỆT");
  });
});

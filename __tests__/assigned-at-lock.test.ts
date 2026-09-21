import { describe, it, expect } from "vitest";
import { deniedReasonForAssignedAt, MAX_ASSIGN_AHEAD_DAYS } from "@/app/lib/business/kpi-3d/assigned-at-lock";

const TODAY = "2026-08-18";
const ask = (o: Partial<Parameters<typeof deniedReasonForAssignedAt>[0]> = {}) =>
  deniedReasonForAssignedAt({ assignedYmd: TODAY, previousYmd: null, todayVnYmd: TODAY, ...o });

describe("giao lùi về ngày cũ → chặn", () => {
  it("hôm qua", () => {
    expect(ask({ assignedYmd: "2026-08-17" })).not.toBeNull();
  });

  it("tháng trước — đây là ca ghi công vào tháng đã chốt sổ", () => {
    expect(ask({ assignedYmd: "2026-07-31" })).not.toBeNull();
  });

  it("lời chặn nói ra mốc hợp lệ gần nhất, không chỉ 'không được'", () => {
    expect(ask({ assignedYmd: "2026-08-17" })).toContain("18/08/2026");
  });

  it("ngày viết theo cách người dùng đọc, không phải YYYY-MM-DD", () => {
    expect(ask({ assignedYmd: "2026-08-17" })).toContain("17/08/2026");
  });
});

describe("hôm nay và tương lai → cho", () => {
  it("hôm nay", () => {
    expect(ask({ assignedYmd: TODAY })).toBeNull();
  });

  it("ngày mai", () => {
    expect(ask({ assignedYmd: "2026-08-19" })).toBeNull();
  });

  it("tháng sau — xếp việc trước là nghiệp vụ có thật", () => {
    expect(ask({ assignedYmd: "2026-09-30" })).toBeNull();
  });

  it("đúng trần 365 ngày vẫn cho", () => {
    expect(ask({ assignedYmd: "2027-08-18" })).toBeNull();
  });

  it("quá trần → chặn, và nói rõ là nghi gõ nhầm NĂM", () => {
    const reason = ask({ assignedYmd: "2062-08-18" });
    expect(reason).not.toBeNull();
    expect(reason).toContain("gõ nhầm");
    expect(reason).toContain(String(MAX_ASSIGN_AHEAD_DAYS));
  });
});

describe("CHỈ xét khi giá trị THAY ĐỔI", () => {
  // MO cũ mang mốc giao từ tháng trước là chuyện bình thường. Chặn cả lần lưu không đụng tới
  // nó thì mọi lần lưu đơn cũ đều nổ lỗi, và người dùng sẽ học cách bỏ qua lỗi.
  it("mốc cũ vẫn y nguyên → KHÔNG chặn, dù nó đã qua từ lâu", () => {
    expect(ask({ assignedYmd: "2026-06-01", previousYmd: "2026-06-01" })).toBeNull();
  });

  it("đổi từ ngày cũ này sang ngày cũ khác → CHẶN, đó là quyết định mới", () => {
    expect(ask({ assignedYmd: "2026-06-02", previousYmd: "2026-06-01" })).not.toBeNull();
  });

  it("kéo mốc cũ về hôm nay → cho, đây là cách SỬA đúng", () => {
    expect(ask({ assignedYmd: TODAY, previousYmd: "2026-06-01" })).toBeNull();
  });
});

describe("ranh giới ngày lịch, không phải mốc tuyệt đối", () => {
  // Server chạy UTC. So bằng mốc tuyệt đối sẽ lệch một ngày vào sáng sớm giờ VN.
  it("đổi GIỜ trong cùng ngày không phải là 'giao lùi' — hàm chỉ nhận ngày nên không thể sai", () => {
    expect(ask({ assignedYmd: TODAY, previousYmd: TODAY })).toBeNull();
    expect(ask({ assignedYmd: TODAY, previousYmd: null })).toBeNull();
  });

  it("qua ranh giới tháng và năm vẫn đếm đúng", () => {
    expect(deniedReasonForAssignedAt({ assignedYmd: "2027-01-01", previousYmd: null, todayVnYmd: "2026-12-31" })).toBeNull();
    expect(deniedReasonForAssignedAt({ assignedYmd: "2026-12-31", previousYmd: null, todayVnYmd: "2027-01-01" })).not.toBeNull();
  });
});

describe("chuỗi hỏng KHÔNG bị chặn ở đây", () => {
  // Đó là lỗi định dạng, thuộc lớp phân tích ngày. Chặn nhầm chỗ sẽ cho một câu thông báo nói
  // sai nguyên nhân, và người dùng đi sửa nhầm thứ.
  it("chuỗi rỗng / sai khuôn → null", () => {
    expect(ask({ assignedYmd: "" })).toBeNull();
    expect(ask({ assignedYmd: "18/08/2026" })).toBeNull();
    expect(deniedReasonForAssignedAt({ assignedYmd: TODAY, previousYmd: null, todayVnYmd: "hỏng" })).toBeNull();
  });
});

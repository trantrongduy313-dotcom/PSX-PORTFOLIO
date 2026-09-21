import { describe, expect, it } from "vitest";

import { aggregateKpi3DRows, mergeKpi3DSources, type AssignmentInput } from "@/app/lib/business/kpi-3d/report";
import {
  accrueMinutesByMonth,
  alreadyCreditedMinutes,
  deniedReasonForConfirmedMinutes,
  type HoursCheckpoint,
} from "@/app/lib/business/kpi-3d/hours-ledger";

// Giờ công trước nay chỉ được cộng MỘT LẦN ở tháng đơn hoàn tất, nên nhân viên làm 20 giờ
// trong tháng 8 mà đơn bị gác tới tháng 11 thì tháng 8 của họ trống trơn.
//
// Mốc chốt là số CỘNG DỒN từ lúc nhận việc. Phần ghi nhận mỗi tháng là HIỆU giữa hai lần chốt
// liên tiếp — đó là cách duy nhất khiến không cộng trùng được.

// Giờ VN = UTC+7, nên 02:00Z là 09:00 cùng ngày ở VN. Các mốc dưới đây cố ý ở giữa ngày để
// không vướng ranh giới ngày do lệch múi giờ.
const at = (iso: string) => new Date(iso);
const cp = (iso: string, minutes: number | null): HoursCheckpoint => ({
  pausedAt: at(iso),
  confirmedMinutes: minutes,
});

const total = (rows: ReturnType<typeof accrueMinutesByMonth>) =>
  rows.reduce((n, r) => n + r.minutes, 0);
const monthOf = (rows: ReturnType<typeof accrueMinutesByMonth>, m: string) =>
  rows.find((r) => r.month === m)?.minutes ?? 0;

describe("Không có lần chốt nào", () => {
  // Tín hiệu để báo cáo giữ NGUYÊN cách tính cũ — nhờ vậy gần như toàn bộ dữ liệu lịch sử
  // (đơn không hề bị tạm dừng) không đổi số.
  it("trả mảng rỗng", () => {
    expect(accrueMinutesByMonth({ checkpoints: [], totalMinutes: 600, closedAt: at("2026-11-10T02:00:00Z") }))
      .toEqual([]);
  });

  it("mốc chốt để trống cũng coi như không có", () => {
    expect(accrueMinutesByMonth({
      checkpoints: [cp("2026-08-20T02:00:00Z", null)],
      totalMinutes: 600,
      closedAt: at("2026-11-10T02:00:00Z"),
    })).toEqual([]);
  });
});

describe("Dừng tháng 8, hoàn tất tháng 11", () => {
  const rows = accrueMinutesByMonth({
    checkpoints: [cp("2026-08-20T02:00:00Z", 1200)], // 20 giờ
    totalMinutes: 1800,                              // 30 giờ tổng
    closedAt: at("2026-11-10T02:00:00Z"),
  });

  it("tháng 8 nhận đúng phần đã làm", () => {
    expect(monthOf(rows, "2026-08")).toBe(1200);
  });

  it("tháng 11 chỉ nhận PHẦN CÒN LẠI, không phải toàn bộ", () => {
    expect(monthOf(rows, "2026-11")).toBe(600);
  });

  // ⚠️ BẤT BIẾN QUAN TRỌNG NHẤT FILE NÀY.
  // Cộng trùng làm nhân viên được tính công gấp đôi, và nó sai theo hướng khó thấy nhất:
  // con số chỉ lớn hơn, không có gì đỏ, không ai đi đối chiếu một số đang có lợi cho mình.
  it("tổng mọi tháng bằng ĐÚNG tổng giờ — không cộng trùng", () => {
    expect(total(rows)).toBe(1800);
  });
});

describe("Dừng và mở lại trong CÙNG tháng", () => {
  it("mọi giờ vẫn nằm trong tháng đó, không tách ra đâu cả", () => {
    const rows = accrueMinutesByMonth({
      checkpoints: [cp("2026-08-10T02:00:00Z", 300)],
      totalMinutes: 900,
      closedAt: at("2026-08-25T02:00:00Z"),
    });
    expect(rows).toHaveLength(1);
    expect(monthOf(rows, "2026-08")).toBe(900);
  });
});

describe("Gác nhiều lần, qua nhiều tháng", () => {
  const rows = accrueMinutesByMonth({
    checkpoints: [
      cp("2026-08-20T02:00:00Z", 600),   // 10 giờ tới hết T8
      cp("2026-09-18T02:00:00Z", 1000),  // cộng dồn 16.7 giờ → T9 nhận 400
      cp("2026-10-05T02:00:00Z", 1000),  // không làm thêm gì → T10 nhận 0
    ],
    totalMinutes: 1500,
    closedAt: at("2026-11-03T02:00:00Z"),
  });

  it("mỗi tháng nhận đúng phần chênh của nó", () => {
    expect(monthOf(rows, "2026-08")).toBe(600);
    expect(monthOf(rows, "2026-09")).toBe(400);
    expect(monthOf(rows, "2026-11")).toBe(500);
  });

  // Chốt lại mà không làm thêm giờ nào thì tháng đó KHÔNG được một dòng rỗng: một dòng 0 giờ
  // trong báo cáo đọc ra thành "có làm nhưng bằng 0", khác với "tháng này không dính gì".
  it("chốt lại mà không làm thêm → tháng đó không xuất hiện", () => {
    expect(rows.find((r) => r.month === "2026-10")).toBeUndefined();
  });

  it("tổng vẫn khớp", () => {
    expect(total(rows)).toBe(1500);
  });
});

describe("Lượt còn ĐANG chạy", () => {
  // Phần chưa chốt vẫn đang thay đổi; ghi nhận sớm là ghi một con số sẽ khác vào ngày mai.
  it("chỉ ghi phần đã chốt, KHÔNG ghi phần còn lại", () => {
    const rows = accrueMinutesByMonth({
      checkpoints: [cp("2026-08-20T02:00:00Z", 1200)],
      totalMinutes: 1800,
      closedAt: null,
    });
    expect(total(rows)).toBe(1200);
    expect(rows).toHaveLength(1);
  });
});

describe("Chống số âm", () => {
  // Admin gõ nhầm 200 giờ rồi sửa xuống 20. Tháng đã báo cáo KHÔNG được tự nhỏ lại — đường sửa
  // đúng cho ca đó là ô "Giờ thực tế" nhập tay ở sidebar (số nhập tay thắng số hệ thống đo).
  it("chốt sau THẤP hơn chốt trước → không trừ ngược tháng cũ", () => {
    const rows = accrueMinutesByMonth({
      checkpoints: [cp("2026-08-20T02:00:00Z", 1200), cp("2026-09-10T02:00:00Z", 300)],
      totalMinutes: 1200,
      closedAt: at("2026-09-20T02:00:00Z"),
    });
    expect(monthOf(rows, "2026-08")).toBe(1200);
    expect(monthOf(rows, "2026-09")).toBe(0);
    expect(rows.every((r) => r.minutes > 0)).toBe(true);
  });

  it("tổng giờ NHỎ HƠN phần đã chốt → không sinh dòng âm", () => {
    const rows = accrueMinutesByMonth({
      checkpoints: [cp("2026-08-20T02:00:00Z", 1200)],
      totalMinutes: 600,
      closedAt: at("2026-09-01T02:00:00Z"),
    });
    expect(rows.every((r) => r.minutes > 0)).toBe(true);
    expect(total(rows)).toBe(1200);
  });
});

describe("Thứ tự đầu vào", () => {
  it("mốc chốt gửi lộn xộn vẫn ra cùng kết quả", () => {
    const asc = accrueMinutesByMonth({
      checkpoints: [cp("2026-08-20T02:00:00Z", 600), cp("2026-09-18T02:00:00Z", 1000)],
      totalMinutes: 1000, closedAt: at("2026-09-25T02:00:00Z"),
    });
    const desc = accrueMinutesByMonth({
      checkpoints: [cp("2026-09-18T02:00:00Z", 1000), cp("2026-08-20T02:00:00Z", 600)],
      totalMinutes: 1000, closedAt: at("2026-09-25T02:00:00Z"),
    });
    expect(desc).toEqual(asc);
  });
});

describe("Phần đã chốt tới giờ", () => {
  it("lấy mốc CAO NHẤT, không phải mốc cuối cùng theo thời gian", () => {
    expect(alreadyCreditedMinutes([cp("2026-08-01T02:00:00Z", 900), cp("2026-09-01T02:00:00Z", 300)])).toBe(900);
  });

  it("chưa chốt gì → 0", () => {
    expect(alreadyCreditedMinutes([cp("2026-08-01T02:00:00Z", null)])).toBe(0);
    expect(alreadyCreditedMinutes([])).toBe(0);
  });
});

// ─── Nối vào báo cáo: KHÔNG được cộng trùng ──────────────────────────────────

describe("Báo cáo chia giờ theo tháng", () => {
  const input = (o: Partial<AssignmentInput> = {}): AssignmentInput => ({
    id: "a1",
    orderItemId: "i1",
    designerName: "AN",
    assignedAt: at("2026-08-01T02:00:00Z"),
    completedAt: null,
    kpiStatus: null,
    actualMinutes: 1800, // 30 giờ
    ...o,
  });

  const rowFor = (a: AssignmentInput, month: string) =>
    aggregateKpi3DRows(mergeKpi3DSources([a], []), [{ name: "AN", code: "A1" }], month)[0];

  const paused = input({
    completedAt: at("2026-11-10T02:00:00Z"),
    kpiStatus: "ON_TIME",
    confirmedPauses: [{ pausedAt: at("2026-08-20T02:00:00Z"), confirmedMinutes: 1200 }],
  });

  it("tháng bị gác nhận giờ đã chốt, dù đơn chưa xong", () => {
    expect(rowFor(paused, "2026-08").tongGio).toBe(20);
  });

  it("tháng hoàn tất chỉ nhận phần còn lại", () => {
    expect(rowFor(paused, "2026-11").tongGio).toBe(10);
  });

  // ⚠️ Nếu ai đó bỏ nhánh `if (!hasLedger)` ở report.ts thì tháng 11 nhận cả 30 giờ và nhân
  // viên được tính công 50 giờ cho một đơn 30 giờ.
  it("tháng hoàn tất KHÔNG cộng lại toàn bộ", () => {
    expect(rowFor(paused, "2026-11").tongGio).not.toBe(30);
  });

  // Bất biến MẠNH NHẤT ở tầng báo cáo: cộng tongGio của MỌI tháng phải bằng đúng tổng giờ của
  // lượt. Nó bắt mọi kiểu cộng trùng, không riêng kiểu tôi nghĩ ra được khi viết test.
  it("cộng tongGio của mọi tháng = ĐÚNG tổng giờ của lượt", () => {
    const months = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
    const sum = months.reduce((n, m) => n + rowFor(paused, m).tongGio, 0);
    expect(sum).toBe(30);
  });

  it("đơn NỐI TIẾP từ tháng trước được đếm riêng", () => {
    expect(rowFor(paused, "2026-11").donTiepTuc).toBe(1);
    // Tháng 8 là chính tháng giao nên không phải "nối tiếp".
    expect(rowFor(paused, "2026-08").donTiepTuc).toBe(0);
  });

  // Đây là điều giữ cho toàn bộ dữ liệu lịch sử không đổi số.
  it("đơn chưa từng bị gác → giữ NGUYÊN cách tính cũ", () => {
    const plain = input({ completedAt: at("2026-08-20T02:00:00Z"), kpiStatus: "ON_TIME" });
    expect(rowFor(plain, "2026-08").tongGio).toBe(30);
    expect(rowFor(plain, "2026-08").donTiepTuc).toBe(0);
  });

  // Người cũ bị lấy đơn giữa lúc đang làm: lượt KHÔNG BAO GIỜ có completedAt, nên nếu chỉ dựa
  // vào mốc hoàn tất thì phần còn lại của họ không bao giờ được ghi nhận.
  it("bị lấy đơn cũng là mốc ĐÓNG — phần còn lại vẫn được ghi", () => {
    const taken = input({
      completedAt: null,
      reassignedAt: at("2026-09-05T02:00:00Z"),
      confirmedPauses: [{ pausedAt: at("2026-08-20T02:00:00Z"), confirmedMinutes: 1200 }],
    });
    expect(rowFor(taken, "2026-08").tongGio).toBe(20);
    expect(rowFor(taken, "2026-09").tongGio).toBe(10);
  });
});

// ─── Ô "GIỜ ĐÃ LÀM" MANG SỐ CỘNG DỒN ─────────────────────────────────────────
//
// `accrueMinutesByMonth` lấy `max` nên một con số nhỏ hơn lần chốt trước bị BỎ QUA HOÀN TOÀN — và
// luật đó là đúng (không rút giờ khỏi một tháng đã báo cáo). Vấn đề là nó im lặng: ở lần dừng thứ
// hai, ô hiện 3 giờ trong khi nhân viên chỉ làm 1 giờ ở đoạn vừa rồi, người gác đơn "sửa lại cho
// đúng" thành 1 — giao diện hiện 1, KPI dùng 3. Hai nguồn sự thật, và cái sai là cái nhìn thấy.
describe("deniedReasonForConfirmedMinutes", () => {
  it("nhỏ hơn phần đã chốt → CHẶN, và nói luôn con số nên nhập", () => {
    const reason = deniedReasonForConfirmedMinutes({ confirmedMinutes: 60, alreadyCredited: 180 });
    expect(reason).not.toBeNull();
    expect(reason).toContain("CỘNG DỒN");
    expect(reason).toContain("3 giờ");
    // Gợi ý = đã chốt + số vừa gõ. Chặn mà không chỉ đường thì người dùng chỉ còn cách gõ mò.
    expect(reason).toContain("4 giờ");
  });

  it("bằng đúng phần đã chốt → HỢP LỆ (đoạn vừa rồi không làm gì thêm)", () => {
    expect(deniedReasonForConfirmedMinutes({ confirmedMinutes: 180, alreadyCredited: 180 })).toBeNull();
  });

  it("lớn hơn → hợp lệ", () => {
    expect(deniedReasonForConfirmedMinutes({ confirmedMinutes: 240, alreadyCredited: 180 })).toBeNull();
  });

  // Lần dừng ĐẦU TIÊN: chưa chốt gì, mọi con số ≥ 0 đều hợp lệ — kể cả 0 (gác ngay sau khi giao).
  it("chưa từng chốt lần nào → không chặn gì, kể cả 0", () => {
    expect(deniedReasonForConfirmedMinutes({ confirmedMinutes: 0, alreadyCredited: 0 })).toBeNull();
  });
});

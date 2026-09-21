import { describe, expect, it } from "vitest";

import {
  formatKpiMonth,
  hoursBudgetLabel,
  pauseWarnings,
  pauseStateOf,
  toPauseSpans,
  type RawPause,
} from "@/app/lib/business/kpi-3d/pause-view";

// Sidebar đơn hàng trước bản này KHÔNG nạp `pauses`, nên nó vừa không nói được đơn đang bị gác,
// vừa hiện một cột "Giờ thực tế" KHÔNG trừ thời gian gác — trong khi màn Việc thiết kế 3D thì
// có trừ. Cùng một lượt ra hai con số và không màn nào tự biết mình sai.

const p = (o: Partial<RawPause> & { id: string }): RawPause => ({
  pausedAt: "2026-08-13T01:20:00Z",
  resumedAt: null,
  confirmedMinutes: null,
  reason: null,
  ...o,
});

describe("toPauseSpans", () => {
  it("đổi mốc chuỗi ISO thành Date", () => {
    const [span] = toPauseSpans([p({ id: "a", pausedAt: "2026-08-13T01:20:00Z" })]);
    expect(span.pausedAt).toBeInstanceOf(Date);
    expect(span.pausedAt.toISOString()).toBe("2026-08-13T01:20:00.000Z");
    expect(span.resumedAt).toBeNull();
  });

  it("nhận luôn Date, không ép hai lần", () => {
    const d = new Date("2026-08-13T01:20:00Z");
    const [span] = toPauseSpans([p({ id: "a", pausedAt: d, resumedAt: d })]);
    expect(span.pausedAt.getTime()).toBe(d.getTime());
    expect(span.resumedAt?.getTime()).toBe(d.getTime());
  });

  // Giữ lại dòng có mốc rác thì phép trừ giờ vẫn ra số "đúng" (khoảng rỗng, trừ 0) nhưng dữ
  // liệu hỏng biến mất không dấu vết. Bỏ hẳn thì số lượng lệch so với bảng — thứ nhìn ra được.
  it("bỏ hẳn khoảng có mốc dừng không đọc được", () => {
    expect(toPauseSpans([p({ id: "a", pausedAt: "khong-phai-ngay" })])).toEqual([]);
  });

  it("mốc mở lại rác → coi như còn đang dừng, không ném lỗi", () => {
    const [span] = toPauseSpans([p({ id: "a", resumedAt: "rac" })]);
    expect(span.resumedAt).toBeNull();
  });

  it("null/undefined → mảng rỗng", () => {
    expect(toPauseSpans(null)).toEqual([]);
    expect(toPauseSpans(undefined)).toEqual([]);
  });
});

describe("pauseStateOf — không có gì để nói", () => {
  it("chưa từng dừng", () => {
    const s = pauseStateOf([]);
    expect(s.isPaused).toBe(false);
    expect(s.pauseCount).toBe(0);
    expect(s.kpiMonth).toBeNull();
  });

  it("đã dừng rồi mở lại → KHÔNG còn là đang dừng, nhưng vẫn đếm được số lần", () => {
    const s = pauseStateOf([
      p({ id: "a", resumedAt: "2026-08-14T01:00:00Z", confirmedMinutes: 260 }),
    ]);
    expect(s.isPaused).toBe(false);
    expect(s.pauseCount).toBe(1);
    // Đã mở lại thì không có "giờ chốt của lần dừng đang mở" — hiện 260 ở banner sẽ nói dối
    // rằng đơn vẫn đang gác.
    expect(s.confirmedMinutes).toBeNull();
  });
});

describe("pauseStateOf — đang dừng", () => {
  it("lấy mốc, lý do và số giờ đã chốt của khoảng ĐANG MỞ", () => {
    const s = pauseStateOf([
      p({ id: "cu", resumedAt: "2026-07-20T01:00:00Z", confirmedMinutes: 60, reason: "cũ" }),
      p({ id: "moi", pausedAt: "2026-08-13T01:20:00Z", confirmedMinutes: 260, reason: "Làm đơn khác" }),
    ]);
    expect(s.isPaused).toBe(true);
    expect(s.pausedAt?.toISOString()).toBe("2026-08-13T01:20:00.000Z");
    expect(s.reason).toBe("Làm đơn khác");
    expect(s.confirmedMinutes).toBe(260);
    expect(s.pauseCount).toBe(2);
  });

  // ⚠️ TEST QUAN TRỌNG NHẤT FILE NÀY.
  // Giờ công được hours-ledger ghi vào tháng của MỐC DỪNG. Banner mà lấy tháng theo lúc mở
  // sidebar thì nó mâu thuẫn với báo cáo KPI đọc cùng dữ liệu — và người duyệt sẽ đi tìm số giờ
  // ở một tháng không có nó.
  it("tháng KPI theo MỐC DỪNG, không theo hôm nay", () => {
    // 31/08 lúc 23:00 giờ VN = 16:00 UTC cùng ngày. Quản lý bấm nút ngày 02/09 nhưng sửa mốc
    // về đúng lúc gác — tháng phải là 08.
    const s = pauseStateOf([p({ id: "a", pausedAt: "2026-08-31T16:00:00Z" })]);
    expect(s.kpiMonth).toBe("2026-08");
  });

  it("mốc dừng ngay sát nửa đêm giờ VN vẫn vào đúng tháng", () => {
    // 01/09 00:30 giờ VN = 31/08 17:30 UTC. Đọc theo UTC sẽ ra tháng 08 — sai.
    const s = pauseStateOf([p({ id: "a", pausedAt: "2026-08-31T17:30:00Z" })]);
    expect(s.kpiMonth).toBe("2026-09");
  });

  it("chưa chốt giờ → null, KHÔNG phải 0", () => {
    // "chưa đo" và "đo được và bằng 0" là hai chuyện khác nhau; nhầm chúng từng là gốc của một
    // bug sống sót qua ba lần sửa trong chính mảng KPI 3D này.
    const s = pauseStateOf([p({ id: "a", confirmedMinutes: null })]);
    expect(s.confirmedMinutes).toBeNull();
  });

  it("chốt 0 giờ là một câu trả lời thật, giữ nguyên số 0", () => {
    const s = pauseStateOf([p({ id: "a", confirmedMinutes: 0 })]);
    expect(s.confirmedMinutes).toBe(0);
  });

  it("lý do chỉ có khoảng trắng → coi như không có", () => {
    expect(pauseStateOf([p({ id: "a", reason: "   " })]).reason).toBeNull();
  });

  // Dữ liệu hỏng (API chặn dừng khi đang dừng, nhưng hàm hiển thị không nên tin điều đó).
  it("nhiều khoảng cùng mở → lấy khoảng MỚI NHẤT", () => {
    const s = pauseStateOf([
      p({ id: "cu", pausedAt: "2026-08-01T01:00:00Z", reason: "cũ" }),
      p({ id: "moi", pausedAt: "2026-08-13T01:00:00Z", reason: "mới" }),
    ]);
    expect(s.reason).toBe("mới");
  });
});

describe("pauseWarnings — CHỈ những gì bất thường", () => {
  const w = (o: Partial<Parameters<typeof pauseWarnings>[0]> = {}) =>
    pauseWarnings({ confirmedMinutes: 240, standardMinutes: 360, hasRenderLink: true, ...o });

  // ⚠️ TEST QUAN TRỌNG NHẤT FILE NÀY.
  // Bản trước LUÔN trả hai dòng, kể cả khi mọi thứ đều ổn: một dòng nhắc lại hai con số đang hiện
  // ngay trên nó ("Đã làm 0.02 giờ / KPI 3 giờ"), một dòng nói "Đã có link ảnh render". Bốn dòng
  // chữ cho ba cái ô nhập, và chúng đọc như nhau nên mắt bỏ qua cả bốn — kể cả cảnh báo thật.
  it("mọi thứ bình thường → KHÔNG có dòng nào", () => {
    expect(w()).toEqual([]);
  });

  it("đúng bằng ngân sách CHƯA phải vượt", () => {
    expect(w({ confirmedMinutes: 360 })).toEqual([]);
  });

  it("vượt ngân sách → cảnh báo, nói quá bao nhiêu", () => {
    const hours = w({ confirmedMinutes: 480 }).find((x) => x.key === "hours");
    expect(hours).toBeDefined();
    expect(hours?.text).toContain("Vượt");
    expect(hours?.text).toContain("2 giờ");
  });

  it("chưa nhập giờ → không cảnh báo về giờ (server sẽ tự đo)", () => {
    expect(w({ confirmedMinutes: null }).some((x) => x.key === "hours")).toBe(false);
  });

  it("không có ngân sách để so → không cảnh báo về giờ", () => {
    expect(w({ standardMinutes: null, confirmedMinutes: 10_000 })).toEqual([]);
    expect(w({ standardMinutes: 0, confirmedMinutes: 10_000 })).toEqual([]);
  });

  it("NaN không sinh cảnh báo rác", () => {
    expect(w({ confirmedMinutes: Number.NaN })).toEqual([]);
  });

  it("chưa có ảnh render → cảnh báo, và NGẮN", () => {
    const render = w({ hasRenderLink: false }).find((x) => x.key === "render");
    expect(render?.text).toBe("Chưa có ảnh render");
  });

  // Câu cũ kèm cả lời giải thích "số giờ chốt ở đây không có kết quả kèm theo". Vì hệ thống CỐ Ý
  // không chặn, lời giải thích đó không đổi được quyết định nào — nó chỉ chiếm thêm một dòng.
  it("cảnh báo ảnh render KHÔNG kèm đoạn giải thích", () => {
    expect(w({ hasRenderLink: false }).find((x) => x.key === "render")?.text)
      .not.toContain("kết quả kèm theo");
  });

  // ⚠️ QUYẾT ĐỊNH CÓ CHỦ Ý: không có mức nào CHẶN. Tạm dừng gần như luôn là quyết định điều hành;
  // chặn vì nhân viên chưa kịp gửi ảnh là bắt họ gánh hậu quả của tình huống họ không gây ra, và
  // người quản lý sẽ lách bằng cách bịa một link.
  it("tổ hợp xấu nhất → đúng hai cảnh báo, không hơn và không chặn", () => {
    const worst = pauseWarnings({ confirmedMinutes: 10_000, standardMinutes: 60, hasRenderLink: false });
    expect(worst.map((x) => x.key).sort()).toEqual(["hours", "render"]);
  });
});

// ⚠️ NHÃN PHẢI ĐỌC ĐƯỢC KHI ĐỨNG MỘT MÌNH. Bản trước là "/ 6 giờ · còn 2 giờ": dấu "/" mở đầu chỉ
// có nghĩa khi nhãn nằm SÁT DƯỚI ô số, đọc nối thành "3.08 / 6 giờ". Nay nó nằm trong một dòng tóm
// tắt chung cho cả hàng ("→ KPI tháng 08/2026 · còn 2 giờ / 6 giờ"), nên cái "/" mồ côi đọc gãy.
describe("hoursBudgetLabel — đọc được khi tách khỏi ô số", () => {
  it("còn ngân sách → phần còn lại đứng trước, không có dấu / mồ côi", () => {
    const label = hoursBudgetLabel({ confirmedMinutes: 240, standardMinutes: 360 });
    expect(label).toBe("còn 2 giờ / 6 giờ");
    expect(label!.startsWith("/")).toBe(false);
  });

  it("đúng bằng ngân sách → còn 0 giờ, không phải null", () => {
    expect(hoursBudgetLabel({ confirmedMinutes: 360, standardMinutes: 360 }))
      .toBe("còn 0 giờ / 6 giờ");
  });

  // Vượt ngân sách đã có một cảnh báo riêng ở pauseWarnings. Nói thêm "còn -2 giờ" ở đây là nói
  // hai lần, và bằng một con số âm không ai đọc được.
  it("vượt ngân sách → BỎ phần còn lại, không in số âm", () => {
    const label = hoursBudgetLabel({ confirmedMinutes: 480, standardMinutes: 360 });
    expect(label).toBe("6 giờ KPI");
    expect(label).not.toContain("-");
  });

  it("chưa nhập giờ → null, không dựng nhãn rỗng nghĩa", () => {
    expect(hoursBudgetLabel({ confirmedMinutes: null, standardMinutes: 360 })).toBeNull();
  });

  it("không có ngân sách → null", () => {
    expect(hoursBudgetLabel({ confirmedMinutes: 240, standardMinutes: null })).toBeNull();
    expect(hoursBudgetLabel({ confirmedMinutes: 240, standardMinutes: 0 })).toBeNull();
  });

  it("NaN → null", () => {
    expect(hoursBudgetLabel({ confirmedMinutes: Number.NaN, standardMinutes: 360 })).toBeNull();
  });
});

describe("formatKpiMonth", () => {
  it("đổi sang dạng người đọc", () => {
    expect(formatKpiMonth("2026-08")).toBe("08/2026");
  });

  it("null → rỗng, không phải chữ 'null'", () => {
    expect(formatKpiMonth(null)).toBe("");
  });

  it("chuỗi lạ trả về nguyên xi thay vì cắt bậy", () => {
    expect(formatKpiMonth("2026")).toBe("2026");
  });
});

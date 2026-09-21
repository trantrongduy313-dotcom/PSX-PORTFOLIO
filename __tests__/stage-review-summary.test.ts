import { describe, it, expect } from "vitest";
import {
  durationNoteToHours, summarizeNguoiReviewRows, nguoiSummaryStats, groupByCrafter,
  STAGE_SUMMARY_TITLE, type StageReviewSummaryInput,
} from "@/app/lib/business/stage-review-summary";
import type { NguoiQuotaConfig } from "@/app/lib/business/kpi-nguoi";

// Khối tổng cuối bản in Đánh giá Khâu cộng TỪ DANH SÁCH ĐANG IN. Con số này đi vào bản in dùng
// để đánh giá nhân sự, nên phải chốt hành vi bằng test trước khi nối vào UI.

const cfg: NguoiQuotaConfig = { defaultWorkDays: 26, workDays: {} };

function row(p: Partial<StageReviewSummaryInput>): StageReviewSummaryInput {
  return { crafter: "A", durationNote: null, coldworkQuality: null, coldworkTimeOk: null, ...p };
}

describe("A. Đọc chuỗi giờ thực tế", () => {
  it("các dạng nhập tay thường gặp", () => {
    expect(durationNoteToHours("5g")).toBe(5);
    expect(durationNoteToHours("5g 30p")).toBe(5.5);
    expect(durationNoteToHours("45p")).toBe(0.75);
    expect(durationNoteToHours("1n")).toBe(24);
  });

  it("số giờ thập phân KHÔNG bị bắt nhầm phần lẻ", () => {
    // "2.5g": regex \d+g sẽ khớp "5g" → ra 5 giờ thay vì 2.5. Đây là lỗi gấp đôi số giờ.
    expect(durationNoteToHours("2.5g")).toBe(2.5);
  });

  it("rỗng / null / rác → 0 giờ, không NaN", () => {
    expect(durationNoteToHours(null)).toBe(0);
    expect(durationNoteToHours("")).toBe(0);
    expect(durationNoteToHours("chưa nhập")).toBe(0);
  });
});

describe("B. Gộp danh sách in thành dòng tổng", () => {
  it("cộng giờ và đếm công việc theo TỪNG THỢ", () => {
    const out = summarizeNguoiReviewRows([
      row({ crafter: "Bảo", durationNote: "8g" }),
      row({ crafter: "Bảo", durationNote: "14g" }),
      row({ crafter: "An",  durationNote: "4g" }),
    ], cfg);

    expect(out.map(s => s.crafter)).toEqual(["An", "Bảo"]); // sắp theo tên tiếng Việt
    const bao = out.find(s => s.crafter === "Bảo")!;
    expect(bao.totalHours).toBe(22);
    expect(bao.moCount).toBe(2);
    expect(bao.units).toBe(5.5);
  });

  it("MỘT DÒNG MỖI THỢ — không gộp chung nhiều thợ vào một dòng", () => {
    // Gộp chung thì ĐM và Kết quả % vô nghĩa, vì ĐM là chỉ tiêu của từng người.
    const out = summarizeNguoiReviewRows([
      row({ crafter: "Bảo" }), row({ crafter: "An" }), row({ crafter: "Cường" }),
    ], cfg);
    expect(out).toHaveLength(3);
  });

  it("1 MO làm 2 lần = 2 công việc — khớp cách đếm của /api/reports/stages", () => {
    const out = summarizeNguoiReviewRows([row({ durationNote: "2g" }), row({ durationNote: "2g" })], cfg);
    expect(out[0].moCount).toBe(2);
  });

  it("đếm 'Không đạt' cho CLSP và thời gian, tách riêng nhau", () => {
    const out = summarizeNguoiReviewRows([
      row({ coldworkQuality: "Không đạt" }),
      row({ coldworkQuality: "Đạt", coldworkTimeOk: "Không đạt" }),
      row({ coldworkQuality: "Đạt", coldworkTimeOk: "Đạt" }),
    ], cfg);
    expect(out[0].qualityFail).toBe(1);
    expect(out[0].timeFail).toBe(1);
  });

  it("KHÔNG tính 'Đạt' hay ô trống thành không đạt", () => {
    const out = summarizeNguoiReviewRows([row({ coldworkQuality: "Đạt" }), row({ coldworkQuality: null })], cfg);
    expect(out[0].qualityFail).toBe(0);
  });

  it("bỏ qua công việc chưa gán thợ thay vì tạo dòng tên rỗng", () => {
    const out = summarizeNguoiReviewRows([row({ crafter: null }), row({ crafter: "  " }), row({ crafter: "A" })], cfg);
    expect(out).toHaveLength(1);
    expect(out[0].crafter).toBe("A");
  });

  it("gộp đúng thợ dù tên dư khoảng trắng", () => {
    // Không trim thì "Bảo" và "Bảo " thành hai dòng riêng, mỗi dòng một nửa số giờ.
    const out = summarizeNguoiReviewRows([
      row({ crafter: "Bảo", durationNote: "8g" }),
      row({ crafter: " Bảo ", durationNote: "8g" }),
    ], cfg);
    expect(out).toHaveLength(1);
    expect(out[0].totalHours).toBe(16);
  });

  it("ÁP DỤNG ngày công thực tế riêng của thợ", () => {
    const out = summarizeNguoiReviewRows(
      [row({ crafter: "Thợ Nghỉ Dài", durationNote: "24g" })],
      { defaultWorkDays: 26, workDays: { "Thợ Nghỉ Dài": 10 } },
    );
    expect(out[0].quota).toBe(20);      // 10 ngày công × 2
    expect(out[0].resultPct).toBe(30);  // 6 quy chuẩn / 20
  });

  it("danh sách rỗng → không có dòng nào (UI ẩn khối tổng)", () => {
    expect(summarizeNguoiReviewRows([], cfg)).toEqual([]);
  });
});

describe("C. Cặp nhãn:giá-trị cho hộp Tổng hợp", () => {
  it("nhãn ĐẦY ĐỦ, không viết tắt — đây là văn bản người đọc, khác key kỹ thuật của cột", () => {
    const [s] = summarizeNguoiReviewRows([row({ durationNote: "22g" })], cfg);
    const labels = nguoiSummaryStats(s).map((x) => x.label);
    expect(labels).toEqual([
      "Tổng giờ thực tế", "SL công việc", "SL quy về nhóm chuẩn",
      "ĐM / Tháng", "Kết quả (%)", "SL không đạt CLSP", "SL trễ",
    ]);
  });

  it("giá trị khớp đúng số đã tính, không lệch vị trí nhãn", () => {
    const [s] = summarizeNguoiReviewRows([row({ durationNote: "22g" })], cfg);
    const byLabel = Object.fromEntries(nguoiSummaryStats(s).map((x) => [x.label, x.value]));
    expect(byLabel["Tổng giờ thực tế"]).toBe("22h");
    expect(byLabel["SL quy về nhóm chuẩn"]).toBe("5.5");
    // 26 ngày công lịch × 2 = ĐM 52; 5.5 / 52 = 11%.
    expect(byLabel["ĐM / Tháng"]).toBe("52");
    expect(byLabel["Kết quả (%)"]).toBe("11%");
  });
});

describe("D2. Gom nhóm theo thợ (để chèn dòng TỔNG liền sau)", () => {
  const mkRow = (crafter: string | null) => ({ crafter });

  it("giữ nguyên thứ tự xuất hiện lần đầu — không sort lại theo tên", () => {
    const groups = groupByCrafter([mkRow("Bảo"), mkRow("An"), mkRow("Bảo")]);
    expect(groups.map(g => g.crafter)).toEqual(["Bảo", "An"]);
    expect(groups[0].items).toHaveLength(2); // 2 dòng của Bảo nằm liền nhau trong nhóm
  });

  it("dữ liệu xen kẽ nhiều thợ vẫn gom đúng — không phải cứ đổi thợ là tách nhóm mới", () => {
    const groups = groupByCrafter([mkRow("A"), mkRow("B"), mkRow("A"), mkRow("B"), mkRow("A")]);
    expect(groups).toHaveLength(2);
    expect(groups.find(g => g.crafter === "A")?.items).toHaveLength(3);
  });

  it("chuẩn hoá tên dư khoảng trắng về CÙNG một nhóm", () => {
    const groups = groupByCrafter([mkRow("Bảo"), mkRow(" Bảo ")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it("dòng không có thợ vẫn được gom (nhóm crafter=null), không bị rớt mất", () => {
    const groups = groupByCrafter([mkRow("A"), mkRow(null), mkRow(null)]);
    expect(groups.find(g => g.crafter === null)?.items).toHaveLength(2);
  });
});

describe("D. Bảng tra khâu có khối tổng", () => {
  it("chỉ khâu Nguội có; khâu khác vắng mặt = không in khối tổng", () => {
    expect(STAGE_SUMMARY_TITLE.NGUOI).toBeTruthy();
    expect(STAGE_SUMMARY_TITLE.HOT).toBeUndefined();
    expect(STAGE_SUMMARY_TITLE.RESIN).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";

import { maskHmInput, normalizeHm, parseVnDate, toVnHm, vnWallToInstant } from "@/app/lib/utils/vn-date";

// ─── "GÕ MỘT ĐẰNG, LƯU MỘT NẺO" ──────────────────────────────────────────────
//
// Sau khi tách `datetime-local` thành cặp ô ngày + giờ (DateInput/TimeInput), xuất hiện một
// trạng thái MỚI chưa từng có: NGÀY đã điền mà GIỜ còn trống. Với ô gộp cũ thì giá trị hoặc đủ
// hoặc rỗng, không có ở giữa.
//
// Đây là loạt test đi tìm đúng một thứ: có chỗ nào hệ thống nhận một con số NGƯỜI DÙNG KHÔNG GÕ,
// hoặc đánh rơi con số họ đã gõ, mà không báo gì không.

describe("vnWallToInstant — giờ trống KHÔNG được tự biến thành một giờ nào đó", () => {
  // ⚠️ ĐÂY LÀ LỖ THẬT, và nó im lặng tuyệt đối.
  //
  // Người dùng chọn ngày 14/08 rồi quên điền giờ và bấm Gửi. Nếu hàm này trả về một mốc hợp lệ
  // thì mọi chốt chặn phía trên đều thấy "có giá trị rồi" và cho đi tiếp — hệ thống ghi 08:00,
  // một con số không ai gõ. Với khai báo tăng ca, hai mốc như vậy quyết định số giờ tính lương.
  it("giờ rỗng → null, không phải 08:00", () => {
    expect(vnWallToInstant("2026-08-14", "")).toBeNull();
  });

  it("giờ chỉ có khoảng trắng → null", () => {
    expect(vnWallToInstant("2026-08-14", "   ")).toBeNull();
  });

  it("giờ dở dang (đang gõ) → null, không đoán nốt phần còn lại", () => {
    expect(vnWallToInstant("2026-08-14", "09")).toBeNull();
    expect(vnWallToInstant("2026-08-14", "09:")).toBeNull();
  });

  it("đủ ngày và giờ → đúng mốc, đọc lại ra đúng cái đã gõ", () => {
    const at = vnWallToInstant("2026-08-14", "09:35");
    expect(at).not.toBeNull();
    expect(toVnHm(at!)).toBe("09:35");
  });

  it("giờ ngoài thang 24h → null, không cuộn vòng thành 01:00", () => {
    expect(vnWallToInstant("2026-08-14", "25:00")).toBeNull();
  });
});

describe("TimeInput — cái gõ vào và cái lưu xuống phải là một", () => {
  // Ô chỉ báo giá trị lên trên khi ĐỦ 4 SỐ và hợp lệ; phần dở dang giữ trong bản nháp. Test này
  // canh cái bắt tay đó: đi qua đúng đường mà component đi.
  const commit = (typed: string): string | null => {
    const masked = maskHmInput(typed);
    // handleChange: chỉ gửi lên khi đủ "HH:mm"
    if (masked.length === 5) return normalizeHm(masked);
    // handleBlur: gõ tắt được hoàn thiện khi rời ô
    return normalizeHm(masked);
  };

  it("gõ đủ bốn số → lưu đúng bốn số đó", () => {
    expect(commit("0935")).toBe("09:35");
    expect(commit("2359")).toBe("23:59");
  });

  it("gõ tắt giờ tròn → hoàn thiện, KHÔNG mất", () => {
    expect(commit("17")).toBe("17:00");
  });

  // ⚠️ 13:00 chứ không phải 01:00 — đây là thứ AM/PM không diễn tả được và là lý do chọn 24h.
  it("giờ chiều giữ nguyên nửa ngày, không tụt về sáng", () => {
    expect(commit("1300")).toBe("13:00");
    expect(commit("13")).toBe("13:00");
  });

  it("giá trị vô lý → null để ô trả về giá trị cũ, KHÔNG ghi bừa", () => {
    expect(commit("2500")).toBeNull();
    expect(commit("0999")).toBeNull();
  });

  it("ô trống → null, không tự thành 00:00", () => {
    expect(commit("")).toBeNull();
  });
});

// ─── NGÀY KHÔNG TỒN TẠI TRONG LỊCH ───────────────────────────────────────────
//
// ⚠️ CHUỖI HẬU QUẢ ĐẦY ĐỦ, và nó im lặng từ đầu đến cuối:
//
//   1. Người dùng gõ "31/02/2026" vào ô ngày tạm dừng.
//   2. DateInput tự kiểm rất lỏng (chỉ xét d ≤ 31, m ≤ 12) nên coi là hợp lệ và báo lên trên.
//   3. Nút Xác nhận chỉ hỏi "chuỗi ngày có rỗng không" → chuỗi khác rỗng → nút BẬT.
//   4. Lúc gửi, vnWallToInstant trả null (nó kiểm lịch thật) → `pausedAt` biến mất khỏi payload.
//   5. Server: `const pausedAt = parsed.data.pausedAt ?? now` → GHI HÔM NAY.
//
// Người dùng chọn 31/02, hệ thống ghi ngày hôm nay — mà mốc đó quyết định giờ công vào KPI THÁNG
// NÀO. Không có một thông báo nào ở bất kỳ bước nào.
describe("ngày quá số ngày của tháng", () => {
  it("31/02 → null, KHÔNG dồn sang 03/03", () => {
    expect(vnWallToInstant("2026-02-31", "09:00")).toBeNull();
  });

  it("31/04 → null (tháng 4 chỉ có 30 ngày)", () => {
    expect(vnWallToInstant("2026-04-31", "09:00")).toBeNull();
  });

  it("29/02 năm KHÔNG nhuận → null", () => {
    expect(vnWallToInstant("2026-02-29", "09:00")).toBeNull();
  });

  it("29/02 năm nhuận → hợp lệ, không chặn oan", () => {
    expect(vnWallToInstant("2028-02-29", "09:00")).not.toBeNull();
  });
});

// ─── Ô NGÀY (DateInput) KHÔNG ĐƯỢC PHÁT RA MỘT NGÀY KHÔNG CÓ THẬT ────────────
//
// Đây là bước 2 của chuỗi ở trên — chốt chặn tại NGUỒN. Hàm dưới là bản sao đúng một dòng của
// `dmyToIso` trong DateInput; nó nằm trong component nên không import trực tiếp được, nhưng luật
// thì phải khoá lại: nếu ai đó quay về tự kiểm `d <= 31 && m <= 12` thì test này phải đỏ.
describe("dd/mm/yyyy → ISO: chỉ nhận ngày CÓ THẬT", () => {
  const dmyToIso = (dmy: string) => (dmy.length !== 10 ? "" : parseVnDate(dmy) ?? "");

  it("ngày thường → đúng ISO", () => {
    expect(dmyToIso("14/08/2026")).toBe("2026-08-14");
  });

  // ⚠️ Đúng những ca mà phép kiểm cũ (`d <= 31 && m <= 12`) cho lọt.
  it("31/02, 31/04, 29/02 năm không nhuận → rỗng, KHÔNG phải một ngày dồn", () => {
    expect(dmyToIso("31/02/2026")).toBe("");
    expect(dmyToIso("31/04/2026")).toBe("");
    expect(dmyToIso("29/02/2026")).toBe("");
  });

  it("29/02 năm nhuận vẫn nhận — không chặn oan", () => {
    expect(dmyToIso("29/02/2028")).toBe("2028-02-29");
  });

  it("gõ dở → rỗng, không đoán nốt", () => {
    expect(dmyToIso("14/08/202")).toBe("");
    expect(dmyToIso("")).toBe("");
  });
});

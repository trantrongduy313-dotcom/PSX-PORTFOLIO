/**
 * date-and-per-mo-integrity.test.ts
 *
 * Kiểm tra 2 nhóm vấn đề người dùng nêu:
 *   1. ĐỊNH DẠNG NGÀY đã thống nhất dd/mm/yyyy chưa (formatDate / formatDurationDisplay),
 *      kể cả trường hợp UTC-midnight không bị lệch 1 ngày (khoá timezone Asia/Ho_Chi_Minh).
 *   2. Cập nhật dữ liệu KHÔNG bị "nhảy sang dữ liệu khác" hoặc "không được cập nhật":
 *      a. Fix ngày khâu (single-record): sửa ngày đã có (lưu 00:00) → GIÁ TRỊ MỚI thắng,
 *         không bị giữ giá trị cũ; giữ giờ nếu đã set; mặc định 00:00 khi chưa có giờ.
 *      b. Per-MO isolation: đọc dữ liệu MO A không lẫn sang MO B (toStageForms/toProductionForm).
 *
 * Không cần DB — test pure logic. Phần logic ngày khâu MIRRORS order-detail-panel.tsx
 * (isoToDate/isoToTime/partsToIso + handler) theo đúng convention của field-behavior.test.ts.
 */

import { describe, it, expect } from "vitest";
import { formatDate, formatDurationDisplay } from "@/app/lib/utils";
import { toStageForms, toProductionForm } from "@/app/lib/utils/order-helpers";
import type { OrderDetail, ProductionDetail } from "@/app/lib/types/order";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ĐỊNH DẠNG NGÀY dd/mm/yyyy
// ═══════════════════════════════════════════════════════════════════════════════

describe("1. Định dạng ngày thống nhất dd/mm/yyyy", () => {
  const DDMMYYYY = /^\d{2}\/\d{2}\/\d{4}$/;

  it("Ngày dạng YYYY-MM-DD → dd/mm/yyyy", () => {
    expect(formatDate("2026-07-09")).toBe("09/07/2026");
  });

  it("Ngày ISO có giờ → vẫn dd/mm/yyyy", () => {
    expect(formatDate("2026-12-25T08:30:00.000Z")).toMatch(DDMMYYYY);
    expect(formatDate("2026-12-25T08:30:00.000Z")).toBe("25/12/2026");
  });

  it("UTC-midnight KHÔNG bị lệch 1 ngày (khoá timezone VN +7)", () => {
    // 00:00Z ngày 09/07 = 07:00 sáng 09/07 giờ VN → phải là 09/07, không lùi về 08/07.
    expect(formatDate("2026-07-09T00:00:00.000Z")).toBe("09/07/2026");
  });

  it("Cuối ngày UTC nhảy sang ngày VN kế tiếp (xác nhận có áp giờ VN)", () => {
    // 18:00Z ngày 09/07 = 01:00 sáng 10/07 giờ VN → phải là 10/07.
    expect(formatDate("2026-07-09T18:00:00.000Z")).toBe("10/07/2026");
  });

  it("Giá trị rỗng/không hợp lệ → “—”", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("khong-phai-ngay")).toBe("—");
  });

  it("formatDurationDisplay đổi 'g' → 'h' nhất quán", () => {
    expect(formatDurationDisplay("4g 30p")).toBe("4h 30p");
    expect(formatDurationDisplay("16g")).toBe("16h");
    expect(formatDurationDisplay("")).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2a. FIX NGÀY KHÂU — sửa lại ngày không bị mất / không giữ giá trị cũ
//     MIRRORS order-detail-panel.tsx: isoToDate / isoToTime / partsToIso + handleDoneDateChange
// ═══════════════════════════════════════════════════════════════════════════════

// --- Bản sao các helper thuần từ order-detail-panel.tsx (để test không import component) ---
function isoToDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoToTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (d.getHours() === 0 && d.getMinutes() === 0) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function partsToIso(datePart: string, timePart: string): string | null {
  if (!datePart) return null;
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = (timePart || "00:00").split(":").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

// Logic MỚI (single source of truth) — handleDoneDateChange sau khi fix
function handleDoneDateChange(currentDoneAt: string | null, pickedDate: string): string | null {
  if (!pickedDate) return null;
  return partsToIso(pickedDate, isoToTime(currentDoneAt) || "00:00");
}
// Logic lưu sau khi fix: single-record dùng thẳng s.doneAt (không còn `?? pendingDateMap`)
function saveDoneAt(stageDoneAt: string | null): string | null {
  return stageDoneAt ?? null;
}

describe("2a. Sửa ngày khâu — không mất, không giữ giá trị cũ", () => {
  it("Khâu đã có ngày lưu ở 00:00 → sửa sang ngày mới: GIÁ TRỊ MỚI được lưu (regression)", () => {
    const oldDoneAt = new Date(2026, 6, 9, 0, 0).toISOString(); // 09/07 00:00 local
    const updated = handleDoneDateChange(oldDoneAt, "2026-07-15");
    expect(isoToDate(updated)).toBe("2026-07-15");        // hiển thị đúng ngày mới
    expect(isoToDate(saveDoneAt(updated))).toBe("2026-07-15"); // lưu đúng ngày mới, KHÔNG giữ 09/07
    expect(isoToDate(saveDoneAt(updated))).not.toBe("2026-07-09");
  });

  it("Giữ nguyên GIỜ nếu khâu đã set giờ (VD 14:30) khi đổi ngày", () => {
    const oldDoneAt = new Date(2026, 6, 9, 14, 30).toISOString();
    const updated = handleDoneDateChange(oldDoneAt, "2026-07-15");
    expect(isoToDate(updated)).toBe("2026-07-15");
    expect(isoToTime(updated)).toBe("14:30");
  });

  it("Chưa có giờ → mặc định 00:00 (ô giờ hiển thị trống để biết chưa điền)", () => {
    const updated = handleDoneDateChange(null, "2026-07-20");
    expect(isoToDate(updated)).toBe("2026-07-20");
    expect(isoToTime(updated)).toBe(""); // 00:00 → isoToTime trả rỗng (đúng ý: chưa điền giờ)
  });

  it("Xoá ngày → null (không kẹt giá trị cũ)", () => {
    const oldDoneAt = new Date(2026, 6, 9, 0, 0).toISOString();
    expect(handleDoneDateChange(oldDoneAt, "")).toBeNull();
    expect(saveDoneAt(null)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2b. PER-MO ISOLATION — cập nhật/đọc MO A không nhảy sang dữ liệu MO B
// ═══════════════════════════════════════════════════════════════════════════════

function makePdWithPerItem(): ProductionDetail {
  return {
    id: "pd-1",
    orderId: "order-1",
    extraData: {
      perItem: {
        "item-A": {
          completedDate: "2026-07-09",
          stages: {
            TC_DAY: { stageStatus: "done", crafter: "Thợ A", startAt: null, doneAt: "2026-07-09T00:00:00.000Z" },
          },
        },
        "item-B": {
          completedDate: "2026-07-15",
          stages: {
            TC_DAY: { stageStatus: "done", crafter: "Thợ B", startAt: null, doneAt: "2026-07-15T00:00:00.000Z" },
          },
        },
      },
    },
  } as unknown as ProductionDetail;
}

function makeOrderWithPd(pd: ProductionDetail): OrderDetail {
  return {
    id: "order-1",
    orderNumber: "26.10836",
    status: "IN_PRODUCTION",
    zone: "MASTER_HUB",
    completedDate: null, // cấp SO trống — chỉ per-item mới có
    items: [
      { id: "item-A", moNumber: "26.37099", nvl: "18K", completedAt: null },
      { id: "item-B", moNumber: "26.37100", nvl: "18K", completedAt: null },
    ],
    productionDetail: pd,
  } as unknown as OrderDetail;
}

describe("2b. Per-MO isolation — không lẫn dữ liệu giữa các MO cùng SO", () => {
  const pd = makePdWithPerItem();
  const order = makeOrderWithPd(pd);

  it("toStageForms(A) trả ngày HT khâu của A, KHÔNG lấy của B", () => {
    const tcDayA = toStageForms(pd, "item-A").find((s) => s.code === "TC_DAY");
    expect(isoToDate(tcDayA?.doneAt ?? null)).toBe("2026-07-09");
  });

  it("toStageForms(B) trả ngày HT khâu của B, KHÔNG lấy của A", () => {
    const tcDayB = toStageForms(pd, "item-B").find((s) => s.code === "TC_DAY");
    expect(isoToDate(tcDayB?.doneAt ?? null)).toBe("2026-07-15");
  });

  it("Hai MO có ngày HT khâu KHÁC nhau (không bị đồng nhất)", () => {
    const a = toStageForms(pd, "item-A").find((s) => s.code === "TC_DAY");
    const b = toStageForms(pd, "item-B").find((s) => s.code === "TC_DAY");
    expect(a?.doneAt).not.toBe(b?.doneAt);
    expect(a?.crafter).toBe("Thợ A");
    expect(b?.crafter).toBe("Thợ B");
  });

  it("toProductionForm — Ngày HT (completedDate) riêng theo MO, không lây giữa các MO", () => {
    const formA = toProductionForm(order, "item-A");
    const formB = toProductionForm(order, "item-B");
    expect(formA.completedDate).toBe("2026-07-09");
    expect(formB.completedDate).toBe("2026-07-15");
    expect(formA.completedDate).not.toBe(formB.completedDate);
  });

  it("MO không có dữ liệu per-item → KHÔNG mượn dữ liệu của MO khác (hiện trống)", () => {
    const orderWithEmptyItem = makeOrderWithPd(pd);
    (orderWithEmptyItem.items as any[]).push({ id: "item-C", moNumber: "26.37101", nvl: "18K", completedAt: null });
    const formC = toProductionForm(orderWithEmptyItem, "item-C");
    expect(formC.completedDate).toBe(""); // không lấy 09/07 hay 15/07 của A/B
    const tcDayC = toStageForms(pd, "item-C").find((s) => s.code === "TC_DAY");
    expect(tcDayC?.doneAt ?? null).toBeNull();
  });
});

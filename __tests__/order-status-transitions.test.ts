import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
  allowedNextStatuses,
  canTransition,
  selectableStatuses,
} from "@/app/lib/business/orders/status-transitions";

// VẾT LỆCH ĐÃ TRẢ GIÁ, ghi lại để không ai dựng lại bản sao thứ năm.
//
// Bảng này từng có BỐN bản: UI (order-detail-panel), route PATCH đơn, route PATCH sản xuất, và
// một bản khai ngay trong __tests__/order-patch.test.ts. Ba bản đầu đã lệch nhau:
//
//   UI cho chọn nhưng SERVER TỪ CHỐI:
//     DESIGN_APPROVED  → DRAFT, PENDING_DESIGN, CANCELLED
//     DESIGN_COMPLETED → CANCELLED
//
// Người dùng ở "Chốt 3D — Chuyển xưởng" chọn một trong các mục đó rồi bấm Lưu → 400.
// Bản thứ tư (trong test) còn thiếu cả DESIGN_COMPLETED, nên test xanh trong khi hai bản thật
// đang bất đồng — nó canh chính bản sao của nó, không canh gì khác.

describe("canTransition", () => {
  it("đích nằm trong danh sách → cho phép", () => {
    expect(canTransition("DRAFT", "IN_DESIGN", "PRE_PRODUCTION")).toBe(true);
    expect(canTransition("IN_PRODUCTION", "COMPLETED", "MASTER_HUB")).toBe(true);
  });

  it("đích không nằm trong danh sách → chặn", () => {
    expect(canTransition("DESIGN_APPROVED", "DRAFT", "PRE_PRODUCTION")).toBe(false);
    expect(canTransition("SUSPENDED", "QUALITY_CHECK", "MASTER_HUB")).toBe(false);
  });

  // 🔴 `undefined` nghĩa là KHÔNG ràng buộc, không phải "cấm hết". Đảo nghĩa này là khoá cứng
  // mọi trạng thái chưa có trong bảng — gồm cả trạng thái mới thêm sau này.
  it("trạng thái không có trong bảng → KHÔNG ràng buộc, cho qua", () => {
    expect(allowedNextStatuses("COMPLETED", "PRE_PRODUCTION")).toBeNull();
    expect(canTransition("COMPLETED", "DRAFT", "PRE_PRODUCTION")).toBe(true);
  });

  // Hai zone có bảng RIÊNG. Dùng nhầm bảng thì một MO đang sản xuất bị đo bằng luật của PTK.
  it("cùng trạng thái, khác zone → tra bảng khác nhau", () => {
    expect(canTransition("IN_PRODUCTION", "SUSPENDED", "MASTER_HUB")).toBe(true);
    expect(allowedNextStatuses("IN_PRODUCTION", "PRE_PRODUCTION")).toBeNull();
  });
});

describe("selectableStatuses", () => {
  // 🔴 Bỏ trạng thái hiện tại ra khỏi danh sách là ô select không có giá trị đang chọn, và
  // trình duyệt tự nhảy sang mục đầu — đổi trạng thái mà không ai bấm gì.
  it("luôn gồm chính trạng thái hiện tại", () => {
    expect(selectableStatuses("DESIGN_APPROVED", "PRE_PRODUCTION")).toContain("DESIGN_APPROVED");
    expect(selectableStatuses("COMPLETED", "PRE_PRODUCTION")).toEqual(["COMPLETED"]);
  });

  // Chính là vết lệch cũ: bốn mục này TỪNG hiện trong dropdown và server từ chối cả bốn.
  it("KHÔNG còn hiện các mục server sẽ từ chối", () => {
    const approved = selectableStatuses("DESIGN_APPROVED", "PRE_PRODUCTION");
    for (const rejected of ["DRAFT", "PENDING_DESIGN", "CANCELLED"]) {
      expect(approved).not.toContain(rejected);
    }
    expect(selectableStatuses("DESIGN_COMPLETED", "PRE_PRODUCTION")).not.toContain("CANCELLED");
  });

  // Hủy đi đường RIÊNG (nút Hủy → patchItemStatus / resolve-action), không qua dropdown này.
  // Nên việc bảng không có CANCELLED ở hai trạng thái trên KHÔNG làm mất năng lực hủy đơn.
  it("mọi mục dropdown đưa ra đều được canTransition chấp nhận", () => {
    const zones = ["PRE_PRODUCTION", "MASTER_HUB"] as const;
    const statuses = [
      "DRAFT", "PENDING_DESIGN", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED",
      "DESIGN_COMPLETED", "PENDING_PRODUCTION", "IN_PRODUCTION", "QUALITY_CHECK", "SUSPENDED",
    ];
    for (const zone of zones) {
      for (const from of statuses) {
        for (const to of selectableStatuses(from, zone)) {
          if (to === from) continue;
          expect(canTransition(from, to, zone)).toBe(true);
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(path)) out.push(path);
  }
  return out;
};

describe("bộ dò bản sao", () => {
  // Đây là thứ ĐÁNG GIÁ NHẤT trong file này: gộp bốn bản về một chỉ sửa hiện tại, còn bộ dò
  // mới ngăn bản thứ năm. Thiếu nó thì lần tới ai đó lại chép bảng vào chỗ mới, và không có
  // gì lên tiếng cho tới khi người dùng gặp 400.
  it("không nơi nào khác khai lại bảng chuyển trạng thái", () => {
    const OWNER = join("app", "lib", "business", "orders", "status-transitions.ts");
    const signature = /DESIGN_REVIEW\s*:\s*\[/;

    const offenders = [...walk("app"), ...walk("__tests__")]
      .filter((f) => !f.includes("generated"))
      .filter((f) => !f.endsWith(OWNER))
      .filter((f) => !f.endsWith("order-status-transitions.test.ts"))
      .filter((f) => signature.test(readFileSync(f, "utf-8")));

    expect(offenders).toEqual([]);
  });
});

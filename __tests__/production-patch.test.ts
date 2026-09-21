// Schema của PATCH /api/orders/[id]/production — đọc THẲNG từ route, không chép lại.
//
// Bản chép cũ ở đây đã lệch: thiếu `resinFails`, `records` và các trường route đã thêm sau.
//
// Bốn mục khác của file cũ ĐÃ XOÁ vì luật của chúng nay có test THẬT, không phải bản chép:
//   detectAutoPause         → __tests__/orders-auto-pause.test.ts (15 test)
//   MH_ALLOWED_TRANSITIONS  → __tests__/order-status-transitions.test.ts (8 test)
//
// 🔴 Mục "zone guard" và "stage auto-advance" cũng xoá, nhưng vì lý do KHÁC: bản chép của
// chúng ĐÃ LỆCH — route thật còn ngoại lệ `isDesignOnlyUpdate` mà bản chép không biết. Giữ
// lại là nuôi một niềm tin sai. Hai luật đó hiện KHÔNG có test; ghi ra đây để không ai tưởng
// là có.

import { describe, it, expect, vi } from "vitest";

// Route kéo theo next-auth qua auth-helpers; test này chỉ cần schema nên chặn ở biên.
vi.mock("@/app/lib/auth-helpers", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/app/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/app/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn(), rateLimitMessage: vi.fn(),
}));

import { productionPatchSchema } from "@/app/api/orders/[id]/production/route";

// ─── 6. Stage hold + holdReason schema ───────────────────────────────────────

describe("stage hold + holdReason schema", () => {
  it("valid hold stage with CHO_DX_NL reason", () => {
    const r = productionPatchSchema.safeParse({
      version: 1,
      stages: [{ code: "DUC", stageStatus: "hold", holdReason: "CHO_DX_NL" }],
    });
    expect(r.success).toBe(true);
  });

  it("valid hold stage with CHO_NL reason", () => {
    const r = productionPatchSchema.safeParse({
      version: 1,
      stages: [{ code: "NGUOI", stageStatus: "hold", holdReason: "CHO_NL" }],
    });
    expect(r.success).toBe(true);
  });

  it("hold stage without holdReason is allowed (optional)", () => {
    const r = productionPatchSchema.safeParse({
      version: 1,
      stages: [{ code: "HOT", stageStatus: "hold" }],
    });
    expect(r.success).toBe(true);
  });

  it("invalid holdReason rejected", () => {
    const r = productionPatchSchema.safeParse({
      version: 1,
      stages: [{ code: "DUC", stageStatus: "hold", holdReason: "CHO_KHAC" }],
    });
    expect(r.success).toBe(false);
  });

  it("invalid stageStatus rejected", () => {
    const r = productionPatchSchema.safeParse({
      version: 1,
      stages: [{ code: "RESIN", stageStatus: "paused" }],
    });
    expect(r.success).toBe(false);
  });

  it("all valid stageStatus values accepted", () => {
    for (const stageStatus of ["pending", "doing", "qc", "done", "cancelled", "hold"]) {
      const r = productionPatchSchema.safeParse({
        version: 1,
        stages: [{ code: "QC", stageStatus }],
      });
      expect(r.success, `stageStatus=${stageStatus} should be valid`).toBe(true);
    }
  });

  it("invalid stage code rejected", () => {
    const r = productionPatchSchema.safeParse({
      version: 1,
      stages: [{ code: "UNKNOWN_STAGE", stageStatus: "doing" }],
    });
    expect(r.success).toBe(false);
  });

  it("order-level holdReason empty string is valid (clearing)", () => {
    const r = productionPatchSchema.safeParse({ version: 1, holdReason: "" });
    expect(r.success).toBe(true);
  });
});

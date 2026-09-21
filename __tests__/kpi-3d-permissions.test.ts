import { describe, expect, it } from "vitest";

import {
  CAPABILITIES,
  deniedReasonFor,
  hasCapability,
  type Kpi3DActor,
} from "@/app/lib/business/kpi-3d/permissions";

// ĐÂY LÀ NƠI QUY TẮC PHÂN QUYỀN 3D THẬT SỰ SỐNG.
//
// Trước đây quy tắc "NV 3D chỉ được tác động lên đơn do mình phụ trách" được viết HAI LẦN
// độc lập (progress.ts và overtime.ts), cùng ba bước nhưng khác câu chữ. Một quy tắc bảo mật
// bị nhân bản: sửa một bản mà quên bản kia là ra lỗ phân quyền. Nay chỉ còn một bản, và test
// dưới đây phủ CHÍNH bản đó — không phải phủ từng bản sao.

const OWNER: Kpi3DActor = { role: "DESIGN_3D", designer3DId: "designer-1" };
const OTHER_DESIGNER: Kpi3DActor = { role: "DESIGN_3D", designer3DId: "designer-2" };
const UNLINKED: Kpi3DActor = { role: "DESIGN_3D", designer3DId: null };
const ASSIGNMENT = { designer3DId: "designer-1" };

describe("Ràng buộc sở hữu — viết MỘT LẦN, áp cho mọi năng lực đòi sở hữu", () => {
  const OWNERSHIP_CAPS = (["ACKNOWLEDGE", "WRITE_PROGRESS", "DECLARE_OVERTIME"] as const);

  it.each(OWNERSHIP_CAPS)("%s: NV 3D tác động đơn CỦA MÌNH → được", (cap) => {
    expect(deniedReasonFor(cap, OWNER, ASSIGNMENT)).toBeNull();
  });

  it.each(OWNERSHIP_CAPS)("%s: NV 3D tác động đơn của NGƯỜI KHÁC → chặn", (cap) => {
    expect(deniedReasonFor(cap, OTHER_DESIGNER, ASSIGNMENT)).toContain("do mình phụ trách");
  });

  it.each(OWNERSHIP_CAPS)("%s: tài khoản DESIGN_3D chưa gắn hồ sơ NV 3D → chặn, nêu rõ lý do", (cap) => {
    expect(deniedReasonFor(cap, UNLINKED, ASSIGNMENT)).toContain("chưa được gắn với hồ sơ");
  });

  it.each(OWNERSHIP_CAPS)(
    "%s: đòi sở hữu nhưng KHÔNG truyền assignment → CHẶN, không cho qua vì thiếu dữ liệu",
    (cap) => {
      // Thiếu dữ liệu để xét quyền thì phải từ chối. Cho qua ở đây là lỗ phân quyền im lặng.
      expect(deniedReasonFor(cap, OWNER, null)).not.toBeNull();
      expect(deniedReasonFor(cap, OWNER, undefined)).not.toBeNull();
    },
  );

  it("role điều hành KHÔNG bị ràng buộc sở hữu — cần xử lý hộ khi NV vắng mặt", () => {
    const admin: Kpi3DActor = { role: "ADMIN", designer3DId: null };
    expect(deniedReasonFor("WRITE_PROGRESS", admin, ASSIGNMENT)).toBeNull();
    // Kể cả khi không biết assignment nào — vì họ không bị xét sở hữu.
    expect(deniedReasonFor("WRITE_PROGRESS", admin, null)).toBeNull();
  });
});

describe("Ai được làm gì — chốt lại từng năng lực", () => {
  it("kiểm kết quả: chỉ ADMIN và ORDER", () => {
    expect(hasCapability("REVIEW_RESULT", "ADMIN")).toBe(true);
    expect(hasCapability("REVIEW_RESULT", "ORDER")).toBe(true);
    // PRODUCTION ghi tiến độ hộ được nhưng KHÔNG kiểm kết quả — hai vai trò khác nhau.
    expect(hasCapability("REVIEW_RESULT", "PRODUCTION")).toBe(false);
    expect(hasCapability("REVIEW_RESULT", "DESIGN_3D")).toBe(false);
  });

  it("duyệt tăng ca: chỉ Leader/Giám sát, NV 3D không tự duyệt", () => {
    expect(hasCapability("APPROVE_OVERTIME", "ADMIN")).toBe(true);
    expect(hasCapability("APPROVE_OVERTIME", "PRODUCTION")).toBe(true);
    expect(hasCapability("APPROVE_OVERTIME", "DESIGN_3D")).toBe(false);
    expect(hasCapability("APPROVE_OVERTIME", "ORDER")).toBe(false);
  });

  it("xác nhận nhận việc: NV 3D phụ trách, hoặc ADMIN/ORDER xác nhận hộ", () => {
    expect(hasCapability("ACKNOWLEDGE", "DESIGN_3D")).toBe(true);
    expect(hasCapability("ACKNOWLEDGE", "ADMIN")).toBe(true);
    expect(hasCapability("ACKNOWLEDGE", "ORDER")).toBe(true);
    expect(hasCapability("ACKNOWLEDGE", "PRODUCTION")).toBe(false);
  });

  it.each([
    ["SALES", "READ_ASSIGNMENTS"],
    ["SALES", "WRITE_PROGRESS"],
    ["SALES", "ACKNOWLEDGE"],
    ["SALES", "REVIEW_RESULT"],
  ] as const)("role ngoài phạm vi 3D (%s) không có năng lực %s", (role, cap) => {
    expect(hasCapability(cap, role)).toBe(false);
    expect(deniedReasonFor(cap, { role, designer3DId: null }, ASSIGNMENT)).not.toBeNull();
  });

  it.each([
    ["không đăng nhập (undefined)", undefined],
    ["role rỗng", ""],
  ])("%s → không có năng lực nào", (_label, role) => {
    for (const cap of Object.keys(CAPABILITIES) as Array<keyof typeof CAPABILITIES>) {
      expect(hasCapability(cap, role)).toBe(false);
    }
  });
});

describe("Bảng khai báo — thêm năng lực mới chỉ là thêm MỘT DÒNG", () => {
  it("mọi năng lực đều có câu từ chối riêng, không để trống", () => {
    for (const [cap, rule] of Object.entries(CAPABILITIES)) {
      expect(rule.deniedMessage, `${cap} thiếu câu từ chối`).toBeTruthy();
    }
  });

  it("năng lực đòi sở hữu thì phải có DESIGN_3D trong danh sách, nếu không quy tắc vô nghĩa", () => {
    for (const [cap, rule] of Object.entries(CAPABILITIES)) {
      if (rule.requiresOwnership) {
        expect(rule.roles, `${cap} đòi sở hữu nhưng không cho DESIGN_3D`).toContain("DESIGN_3D");
      }
    }
  });
});

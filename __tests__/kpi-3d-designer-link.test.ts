import { describe, expect, it } from "vitest";

import {
  linkOrCreateDesignerForUser,
  linkOrCreateUserForDesigner,
  normalizeName,
} from "@/app/lib/business/kpi-3d/designer-link";

// Nối User ↔ Designer3D theo cả 2 chiều — trước đây phải tạo 2 nơi rồi vào Sửa để gắn tay.
// Khớp CHÍNH XÁC theo tên đã chuẩn hoá: Designer3D.name là trường duy nhất nên không thể ra
// 2 kết quả — an toàn để tự động, không cần hộp thoại xác nhận.

describe("normalizeName", () => {
  it("không phân biệt hoa/thường và khoảng trắng thừa", () => {
    expect(normalizeName("  Việt   3D ")).toBe(normalizeName("việt 3d"));
  });
});

function fakeTx(opts: {
  designers?: Array<{ id: string; name: string; userId: string | null }>;
  users?: Array<{ id: string; role: string; deletedAt: Date | null }>;
} = {}) {
  const designers = opts.designers ?? [];
  const updates: Record<string, unknown>[] = [];
  const created: Record<string, unknown>[] = [];

  return {
    updates,
    created,
    tx: {
      designer3D: {
        findMany: async ({ where }: { where: { isActive: boolean; userId: null } }) =>
          designers.filter((d) => d.userId === where.userId),
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ where, data });
          const d = designers.find((x) => x.id === where.id)!;
          return { ...d, ...data };
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: "new-designer-1", name: data.name as string };
        },
        findFirst: async ({ where }: { where: { userId: string; NOT?: { id: string } } }) =>
          designers.find((d) => d.userId === where.userId && d.id !== where.NOT?.id) ?? null,
      },
      user: {
        findUnique: async ({ where }: { where: { email: string } }) =>
          (opts.users ?? []).find((u) => (u as { email?: string }).email === where.email) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: "new-user-1" };
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

describe("linkOrCreateDesignerForUser — tạo User role NV 3D tự nối/tạo hồ sơ", () => {
  it("tên khớp CHÍNH XÁC hồ sơ đã có, chưa gắn ai → tự nối", async () => {
    const { tx, updates } = fakeTx({
      designers: [{ id: "d-1", name: "Việt 3D", userId: null }],
    });
    const res = await linkOrCreateDesignerForUser(tx, { userId: "u-1", userName: "việt   3d" });

    expect(res).toEqual({ mode: "LINKED", designerId: "d-1", designerName: "Việt 3D" });
    expect(updates).toEqual([{ where: { id: "d-1" }, data: { userId: "u-1" } }]);
  });

  it("không khớp ai → tự tạo hồ sơ mới, MÃ NV để trống cho admin điền sau", async () => {
    const { tx, created } = fakeTx({ designers: [] });
    const res = await linkOrCreateDesignerForUser(tx, { userId: "u-2", userName: "Nhân Viên Mới" });

    expect(res.mode).toBe("CREATED");
    expect(created).toEqual([{ name: "Nhân Viên Mới", code: "", isActive: true, userId: "u-2" }]);
  });

  it("bỏ qua hồ sơ ĐÃ gắn tài khoản khác dù trùng tên (không giành lại)", async () => {
    const { tx, created } = fakeTx({
      designers: [{ id: "d-1", name: "Việt 3D", userId: "someone-else" }],
    });
    const res = await linkOrCreateDesignerForUser(tx, { userId: "u-3", userName: "Việt 3D" });

    // findMany đã lọc where userId: null nên hồ sơ đã gắn không nằm trong candidates → tạo mới
    expect(res.mode).toBe("CREATED");
    expect(created).toHaveLength(1);
  });
});

describe("linkOrCreateUserForDesigner — tạo Designer3D kèm email", () => {
  it("email chưa từng đăng ký → tạo tài khoản mới, role NV 3D", async () => {
    const { tx, created } = fakeTx({ users: [] });
    const res = await linkOrCreateUserForDesigner(tx, {
      email: "moi@hpvn.local",
      designerName: "Nhân Viên Mới",
    });

    expect(res).toEqual({ mode: "CREATED", userId: "new-user-1" });
    expect(created[0]).toMatchObject({ email: "moi@hpvn.local", role: "DESIGN_3D" });
  });

  it("email đã có tài khoản ĐÚNG role, chưa gắn ai → nối", async () => {
    const { tx } = fakeTx({
      users: [{ id: "u-1", role: "DESIGN_3D", deletedAt: null, email: "a@hpvn.local" } as never],
      designers: [],
    });
    const res = await linkOrCreateUserForDesigner(tx, { email: "a@hpvn.local", designerName: "A" });
    expect(res).toEqual({ mode: "LINKED", userId: "u-1" });
  });

  it("tài khoản SAI role → báo lỗi, KHÔNG tự đổi role hộ", async () => {
    const { tx } = fakeTx({
      users: [{ id: "u-1", role: "SALES", deletedAt: null, email: "a@hpvn.local" } as never],
    });
    const res = await linkOrCreateUserForDesigner(tx, { email: "a@hpvn.local", designerName: "A" });

    expect(res.mode).toBe("ERROR");
    if (res.mode === "ERROR") expect(res.reason).toContain("vai trò khác");
  });

  it("tài khoản đã gắn cho NV KHÁC → báo lỗi nêu tên người đó", async () => {
    const { tx } = fakeTx({
      users: [{ id: "u-1", role: "DESIGN_3D", deletedAt: null, email: "a@hpvn.local" } as never],
      designers: [{ id: "d-1", name: "Người Kia", userId: "u-1" }],
    });
    const res = await linkOrCreateUserForDesigner(tx, { email: "a@hpvn.local", designerName: "A" });

    expect(res.mode).toBe("ERROR");
    if (res.mode === "ERROR") expect(res.reason).toContain("Người Kia");
  });

  it("tài khoản đã xoá → báo lỗi", async () => {
    const { tx } = fakeTx({
      users: [{ id: "u-1", role: "DESIGN_3D", deletedAt: new Date(), email: "a@hpvn.local" } as never],
    });
    const res = await linkOrCreateUserForDesigner(tx, { email: "a@hpvn.local", designerName: "A" });
    expect(res.mode).toBe("ERROR");
  });

  it("excludeDesignerId cho phép SỬA hồ sơ đang gắn chính tài khoản đó mà không tự báo trùng", async () => {
    const { tx } = fakeTx({
      users: [{ id: "u-1", role: "DESIGN_3D", deletedAt: null, email: "a@hpvn.local" } as never],
      designers: [{ id: "d-1", name: "A", userId: "u-1" }],
    });
    const res = await linkOrCreateUserForDesigner(tx, {
      email: "a@hpvn.local",
      designerName: "A",
      excludeDesignerId: "d-1",
    });
    expect(res).toEqual({ mode: "LINKED", userId: "u-1" });
  });
});

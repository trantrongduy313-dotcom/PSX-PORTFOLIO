import { describe, expect, it } from "vitest";

import { classifyDbError } from "@/app/lib/db-error";

// TEST CHO ĐÚNG SỰ CỐ: DB preview thiếu cột reviewStatus mà Prisma client đã biết. Route
// không bắt lỗi → 500 body rỗng → client báo "Unexpected end of JSON input". Người dùng
// không hề được biết nguyên nhân là thiếu migration.

/** Giả lập PrismaClientKnownRequestError — chỉ cần đúng hình dạng mà hàm đọc tới. */
function prismaError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

describe("classifyDbError — thiếu migration phải nói rõ là thiếu migration", () => {
  it("P2022 (cột không tồn tại) → SCHEMA_DRIFT, chỉ đúng lệnh cần chạy", () => {
    const result = classifyDbError(prismaError("P2022", "The column `reviewStatus` does not exist"));
    expect(result.kind).toBe("SCHEMA_DRIFT");
    expect(result.message).toContain("migrate:preview");
  });

  it("P2021 (bảng không tồn tại) → SCHEMA_DRIFT", () => {
    expect(classifyDbError(prismaError("P2021", "table not found")).kind).toBe("SCHEMA_DRIFT");
  });

  it.each([
    ["42703 undefined_column", "42703"],
    ["42P01 undefined_table", "42P01"],
  ])("mã postgres thô %s → SCHEMA_DRIFT", (_label, code) => {
    expect(classifyDbError(prismaError(code, "boom")).kind).toBe("SCHEMA_DRIFT");
  });

  it("nhận diện được cả khi chỉ có message, không có mã lỗi", () => {
    const result = classifyDbError(new Error('column "reviewStatus" does not exist'));
    expect(result.kind).toBe("SCHEMA_DRIFT");
  });

  it("P1001 (không nối được) → UNREACHABLE, KHÔNG nhầm thành thiếu migration", () => {
    const result = classifyDbError(prismaError("P1001", "Can't reach database server"));
    expect(result.kind).toBe("UNREACHABLE");
    expect(result.message).toContain("DATABASE_URL");
  });

  it("lỗi lạ → UNKNOWN, không đoán bừa nguyên nhân", () => {
    expect(classifyDbError(new Error("chuyện gì đó khác")).kind).toBe("UNKNOWN");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["chuỗi rỗng", ""],
    ["object rỗng", {}],
  ])("%s → UNKNOWN, không ném lỗi", (_label, value) => {
    expect(() => classifyDbError(value)).not.toThrow();
    expect(classifyDbError(value).kind).toBe("UNKNOWN");
  });

  it("thông điệp KHÔNG chứa connection string — lỗi thô đôi khi kèm mật khẩu", () => {
    const leaky = prismaError(
      "P1001",
      "Can't reach postgresql://postgres.abc:secretpw@host:5432/postgres",
    );
    const result = classifyDbError(leaky);
    expect(result.message).not.toContain("secretpw");
    expect(result.message).not.toContain("postgresql://");
  });
});

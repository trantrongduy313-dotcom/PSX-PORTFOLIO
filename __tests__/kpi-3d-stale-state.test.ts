import { describe, expect, it } from "vitest";

import {
  isStaleAssignmentError,
  StaleAssignmentError,
} from "@/app/lib/business/kpi-3d/stale-state";

// Lỗi này quyết định route trả 409 hay 500. Nhận diện sai thì người dùng nhận một lỗi hệ thống màu
// đỏ cho một tình huống bình thường — và họ sẽ bấm lại nhiều lần, đúng thứ chốt chặn đang chống.
describe("isStaleAssignmentError", () => {
  it("nhận đúng lỗi của mình", () => {
    expect(isStaleAssignmentError(new StaleAssignmentError())).toBe(true);
  });

  // ⚠️ VÌ SAO KIỂM THEO `name` CHỨ KHÔNG `instanceof`: lỗi ném trong callback của
  // prisma.$transaction đi qua một lớp bọc, và Next.js còn có thể nạp module hai lần (server /
  // route bundle) — lúc đó `instanceof` so hai class khác danh tính và luôn ra false, tức mọi lỗi
  // này âm thầm rơi xuống nhánh 500. Test này canh đúng chỗ đó: một bản sao "cùng tên, khác danh
  // tính" vẫn phải được nhận ra.
  it("nhận cả bản sao đến từ một lần nạp module khác", () => {
    const clone = new Error("khác danh tính, cùng tên");
    clone.name = "StaleAssignmentError";
    expect(isStaleAssignmentError(clone)).toBe(true);
  });

  it("KHÔNG nhận lỗi khác — chúng phải rơi xuống 500 và được log", () => {
    expect(isStaleAssignmentError(new Error("mất kết nối DB"))).toBe(false);
    expect(isStaleAssignmentError({ name: "StaleAssignmentError" })).toBe(false);
    expect(isStaleAssignmentError(null)).toBe(false);
    expect(isStaleAssignmentError("StaleAssignmentError")).toBe(false);
  });

  it("mang sẵn câu chỉ đường, không phải một chuỗi rỗng", () => {
    const msg = new StaleAssignmentError().message;
    expect(msg).toContain("tải lại");
    // Phải nói rõ CHƯA GHI GÌ: không có câu này người dùng không biết mình có vừa làm hỏng nửa
    // vời điều gì hay không, và sẽ đi kiểm tra bằng cách bấm thêm lần nữa.
    expect(msg).toContain("chưa ghi gì");
  });
});

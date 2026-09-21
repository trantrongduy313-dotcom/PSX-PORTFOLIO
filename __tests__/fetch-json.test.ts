import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchJson } from "@/app/lib/utils/fetch-json";

// LỖI ĐÃ MẮC: dropdown "Chọn nhân viên 3D" luôn rỗng vì chỗ gọi viết
//
//     fetchJson<{ data: Designer[] }>("/api/designers-3d").then(res => setList(res.data ?? []))
//
// fetchJson ĐÃ tự bóc `body.data` rồi, nên `res` chính là mảng và `res.data` là undefined —
// rơi thẳng vào `?? []`. KHÔNG có lỗi nào được ném ra, không có dòng log nào: giao diện chỉ
// đơn giản là không có lựa chọn nào, trông y hệt "công ty chưa có nhân viên 3D".
//
// Hợp đồng bóc-hay-không-bóc trước nay chỉ nằm trong phần chú thích. Các test dưới đây biến
// nó thành thứ kiểm được, để chỗ gọi tiếp theo không phải đoán.

const mockFetch = (body: unknown, ok = true, status = 200) => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  })));
};

afterEach(() => vi.unstubAllGlobals());

describe("fetchJson bóc gì", () => {
  it("body có `data` → trả về CHÍNH nội dung bên trong, không phải cả phong bì", async () => {
    mockFetch({ data: [{ id: "d1" }] });
    const result = await fetchJson<Array<{ id: string }>>("/api/designers-3d");
    expect(result).toEqual([{ id: "d1" }]);
    // Đây là khẳng định mà lỗi thật đã vi phạm.
    expect((result as unknown as { data?: unknown }).data).toBeUndefined();
  });

  it("body KHÔNG có `data` → trả nguyên body", async () => {
    mockFetch({ id: "x", name: "y" });
    expect(await fetchJson("/api/thing")).toEqual({ id: "x", name: "y" });
  });

  it("mảng rỗng vẫn là mảng rỗng, không thành null", async () => {
    mockFetch({ data: [] });
    expect(await fetchJson("/api/designers-3d")).toEqual([]);
  });
});

describe("fetchJson khi thất bại", () => {
  it("ưu tiên thông điệp của server", async () => {
    mockFetch({ error: { message: "Nhóm KPI này đã ngừng sử dụng" } }, false, 400);
    await expect(fetchJson("/api/x")).rejects.toThrow("Nhóm KPI này đã ngừng sử dụng");
  });

  // Body rỗng trên response 500 chính là thứ đã sinh ra "Unexpected end of JSON input" và
  // che mất lý do thật suốt sáu vòng dò — xem chú thích đầu fetch-json.ts.
  it("body rỗng → nêu mã HTTP, KHÔNG để lộ lỗi parse của trình duyệt", async () => {
    mockFetch(undefined, false, 500);
    await expect(fetchJson("/api/x")).rejects.toThrow("HTTP 500");
  });
});

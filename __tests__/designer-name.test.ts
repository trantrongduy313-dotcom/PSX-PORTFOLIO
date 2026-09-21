import { describe, it, expect } from "vitest";
import { resolveDesignerName } from "@/app/lib/business/kpi-3d/designer-name";

// Lỗi gốc: cùng một MO, tab Thiết kế bên PTK hiện "N8n" còn bên PSX hiện "—".
// Không mất dữ liệu — PSX chỉ đọc `extraData.tho3d` ở GỐC, là chỗ lưu CŨ mà dữ liệu
// mới không còn ghi vào. Luật thứ tự ưu tiên gom về đây để hai màn không thể lệch.

describe("resolveDesignerName — thứ tự ưu tiên ba nguồn", () => {
  it("lượt giao việc thắng cả hai nguồn JSON", () => {
    expect(resolveDesignerName({
      assignmentDesignerName: "N8n",
      perItemTho3d: "Người cũ",
      rootTho3d: "Người cũ hơn",
    })).toBe("N8n");
  });

  it("không có lượt giao việc → lấy theo từng MO", () => {
    expect(resolveDesignerName({ perItemTho3d: "Việt 3D", rootTho3d: "Chung cả SO" }))
      .toBe("Việt 3D");
  });

  it("đơn CŨ chỉ có ô gốc → vẫn ra tên, không mất", () => {
    expect(resolveDesignerName({ rootTho3d: "Chung cả SO" })).toBe("Chung cả SO");
  });

  it("không nguồn nào có → chuỗi rỗng (chỗ gọi tự quyết hiện '—')", () => {
    expect(resolveDesignerName({})).toBe("");
  });
});

describe("chuỗi rỗng phải ĐI TIẾP, không được chặn fallback", () => {
  // Chỗ huỷ giao việc ghi `perItem[id].tho3d = ""` (assignment-targets.ts). Nếu dùng `??`
  // thì chuỗi rỗng đó bị coi là giá trị hợp lệ và đơn cũ mất tên vô cớ.
  it("perItem rỗng → rơi về ô gốc", () => {
    expect(resolveDesignerName({ perItemTho3d: "", rootTho3d: "Chung cả SO" }))
      .toBe("Chung cả SO");
  });

  it("lượt giao việc rỗng/null → rơi về JSON", () => {
    expect(resolveDesignerName({ assignmentDesignerName: "", perItemTho3d: "Việt 3D" })).toBe("Việt 3D");
    expect(resolveDesignerName({ assignmentDesignerName: null, perItemTho3d: "Việt 3D" })).toBe("Việt 3D");
  });

  it("chuỗi toàn khoảng trắng cũng tính là rỗng", () => {
    expect(resolveDesignerName({ perItemTho3d: "   ", rootTho3d: "Chung cả SO" }))
      .toBe("Chung cả SO");
  });

  it("cắt khoảng trắng thừa ở giá trị trả về", () => {
    expect(resolveDesignerName({ perItemTho3d: "  N8n  " })).toBe("N8n");
  });
});

describe("dữ liệu JSON hỏng không được làm vỡ màn hình", () => {
  // extraData là JSON tự do — không có gì bảo đảm tho3d là chuỗi.
  it("số / object / mảng đều bị bỏ qua như không có", () => {
    expect(resolveDesignerName({ perItemTho3d: 123, rootTho3d: "Chung cả SO" })).toBe("Chung cả SO");
    expect(resolveDesignerName({ perItemTho3d: { name: "x" }, rootTho3d: "Chung cả SO" })).toBe("Chung cả SO");
    expect(resolveDesignerName({ perItemTho3d: ["x"], rootTho3d: "Chung cả SO" })).toBe("Chung cả SO");
    expect(resolveDesignerName({ perItemTho3d: 123 })).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  itemsEligibleForOrphanCheck,
  orphanNeedsDecisionWarning,
  planOrphanClosures,
  readDesign3DTraces,
} from "@/app/lib/business/kpi-3d/orphan-assignments";

// TEST CHO ĐÚNG LỖ ĐÃ TÌM RA: removeExtraDesigner chỉ bỏ khối khỏi mảng JSON. Dòng
// Design3DAssignment vẫn ASSIGNED, VẪN ĐƯỢC ĐẾM TRONG BÁO CÁO KPI, và thợ vẫn thấy việc.
// Không có bước đối chiếu nào đóng lượt đã mất khối — thứ VẮNG MẶT là điểm mù của đường đồng bộ.

const ITEM = "item-1";

type OrphanRow = Parameters<typeof planOrphanClosures>[1][number];
const row = (over: Partial<OrphanRow> = {}): OrphanRow => ({
  id: "a1",
  designerName: "Nguyễn Văn A",
  actualMinutes: null,
  completedAt: null,
  ...over,
});

describe("readDesign3DTraces — quét KHOAN DUNG, nhầm thì nhầm theo hướng GIỮ LẠI", () => {
  it("lấy id từ khối gốc và từ designers[]", () => {
    const traces = readDesign3DTraces({
      perItem: {
        [ITEM]: {
          design: { kpi3DAssignmentId: "a1" },
          designers: [{ kpi3DAssignmentId: "a2" }],
        },
      },
    }, ITEM);
    expect([...traces.assignmentIds].sort()).toEqual(["a1", "a2"]);
  });

  it("KHỐI CHƯA ĐỦ TRƯỜNG vẫn được tính là dấu vết", () => {
    // readDesign3DBlocks TRẢ VỀ NULL cho khối thiếu ô giờ. Nếu dùng hàm đó ở đây thì một khối
    // đang gõ dở trông y như đã bị xoá — và tự huỷ lượt của người đang làm việc thì tệ hơn
    // nhiều so với lỗi đang có.
    const traces = readDesign3DTraces({
      perItem: { [ITEM]: { design: { phanNhom3D: "Nhóm A" }, tho3d: "Nguyễn Văn A" } },
    }, ITEM);
    expect(traces.designerNames.has("nguyễn văn a")).toBe(true);
  });

  it("tên chuẩn hoá: bỏ hoa/thường và khoảng trắng thừa (Order gõ tay)", () => {
    const traces = readDesign3DTraces({
      perItem: { [ITEM]: { design: {}, tho3d: "  NGUYỄN   VĂN A  " } },
    }, ITEM);
    expect(traces.designerNames.has("nguyễn văn a")).toBe(true);
  });

  it("tho3d cấp đơn làm dự phòng cho khối gốc", () => {
    const traces = readDesign3DTraces({ tho3d: "Trần B", perItem: { [ITEM]: { design: {} } } }, ITEM);
    expect(traces.designerNames.has("trần b")).toBe(true);
  });

  it("không có perItem của MO đó → không dấu vết nào", () => {
    const traces = readDesign3DTraces({ perItem: {} }, ITEM);
    expect(traces.assignmentIds.size).toBe(0);
    expect(traces.designerNames.size).toBe(0);
  });

  it("extraData null/rỗng không làm nổ", () => {
    expect(readDesign3DTraces(null, ITEM).assignmentIds.size).toBe(0);
    expect(readDesign3DTraces(undefined, ITEM).designerNames.size).toBe(0);
  });
});

describe("planOrphanClosures — chỉ đóng lượt THẬT SỰ mất dấu", () => {
  it("còn khớp id → GIỮ, không đụng tới", () => {
    const traces = readDesign3DTraces({ perItem: { [ITEM]: { design: { kpi3DAssignmentId: "a1" } } } }, ITEM);
    expect(planOrphanClosures(traces, [row()]).toCancel).toEqual([]);
  });

  it("chưa có id nhưng còn khớp TÊN → GIỮ (dữ liệu cũ, hoặc lần lưu đầu)", () => {
    // Lần lưu đầu tiên khối chưa mang id. Không có lưới theo tên thì hệ thống sẽ huỷ đúng cái
    // lượt nó vừa tạo ra.
    const traces = readDesign3DTraces({ perItem: { [ITEM]: { design: {}, tho3d: "Nguyễn Văn A" } } }, ITEM);
    expect(planOrphanClosures(traces, [row()]).toCancel).toEqual([]);
  });

  it("mất cả id lẫn tên VÀ chưa có công → tự đóng", () => {
    const traces = readDesign3DTraces({ perItem: { [ITEM]: { design: {}, designers: [] } } }, ITEM);
    expect(planOrphanClosures(traces, [row()]).toCancel).toEqual(["a1"]);
  });

  it("mất dấu nhưng ĐÃ CÓ GIỜ → KHÔNG tự đóng, chuyển sang cảnh báo", () => {
    // Ranh giới quan trọng nhất. Tự huỷ một lượt đã có giờ là tự quyết định chuyện LƯƠNG dựa
    // trên suy đoán rằng khối biến mất là do người dùng cố ý.
    const traces = readDesign3DTraces({ perItem: { [ITEM]: { design: {}, designers: [] } } }, ITEM);
    const plan = planOrphanClosures(traces, [row({ actualMinutes: 240 })]);
    expect(plan.toCancel).toEqual([]);
    expect(plan.needsManualDecision).toHaveLength(1);
    expect(plan.needsManualDecision[0].minutes).toBe(240);
  });

  it("mất dấu nhưng ĐÃ HOÀN TẤT → cũng KHÔNG tự đóng", () => {
    const traces = readDesign3DTraces({ perItem: { [ITEM]: { design: {}, designers: [] } } }, ITEM);
    const plan = planOrphanClosures(traces, [row({ completedAt: new Date("2026-08-01") })]);
    expect(plan.toCancel).toEqual([]);
    expect(plan.needsManualDecision).toHaveLength(1);
  });

  it("nhiều người: chỉ người bị xoá bị đóng, người còn lại nguyên vẹn", () => {
    const traces = readDesign3DTraces({
      perItem: { [ITEM]: { design: { kpi3DAssignmentId: "a1" }, designers: [] } },
    }, ITEM);
    const plan = planOrphanClosures(traces, [row(), row({ id: "a2", designerName: "Trần B" })]);
    expect(plan.toCancel).toEqual(["a2"]);
  });
});

describe("itemsEligibleForOrphanCheck — CỬA CHẶN chống huỷ oan", () => {
  const ITEMS = [ITEM, "item-2"];

  it("tab Sản xuất (moFields: có tho3d, KHÔNG có design) → KHÔNG xét MO nào", () => {
    // ĐÂY LÀ TEST QUAN TRỌNG NHẤT CỦA CẢ FILE. Thiếu cửa chặn này thì một người bấm lưu tab Sản
    // xuất là huỷ sạch KPI của MO đó.
    const moFields = { perItem: { [ITEM]: { tl3d: 1.2, tho3d: "Nguyễn Văn A", sku: "X" } } };
    expect(itemsEligibleForOrphanCheck(moFields, ITEMS)).toEqual([]);
  });

  it("payload có design → xét đúng MO đó", () => {
    const p = { perItem: { [ITEM]: { design: { phanNhom3D: "A" } } } };
    expect(itemsEligibleForOrphanCheck(p, ITEMS)).toEqual([ITEM]);
  });

  it("xoá người CUỐI CÙNG (designers rỗng) vẫn qua được cửa — khoá CÓ MẶT", () => {
    const p = { perItem: { [ITEM]: { designers: [] } } };
    expect(itemsEligibleForOrphanCheck(p, ITEMS)).toEqual([ITEM]);
  });

  it("chỉ xét MO được gửi, KHÔNG lan sang MO anh em cùng SO", () => {
    const p = { perItem: { [ITEM]: { design: {} } } };
    expect(itemsEligibleForOrphanCheck(p, ITEMS)).not.toContain("item-2");
  });

  it("payload rỗng / null → không xét gì (an toàn mặc định)", () => {
    expect(itemsEligibleForOrphanCheck(null, ITEMS)).toEqual([]);
    expect(itemsEligibleForOrphanCheck({}, ITEMS)).toEqual([]);
  });

  it("payload cấp gốc có nhắc thiết kế → xét mọi MO (đường lưu cũ dùng chung)", () => {
    expect(itemsEligibleForOrphanCheck({ design: {} }, ITEMS)).toEqual(ITEMS);
  });

  it("id lạ trong payload không kéo MO ngoài danh sách hợp lệ vào", () => {
    const p = { perItem: { "item-xx": { design: {} } } };
    expect(itemsEligibleForOrphanCheck(p, ITEMS)).toEqual([]);
  });
});

describe("orphanNeedsDecisionWarning — câu cảnh báo nói rõ hệ thống KHÔNG tự làm gì", () => {
  it("có giờ thì nói số giờ, và chỉ ra hành động tường minh", () => {
    const msg = orphanNeedsDecisionWarning("26.42341_1", { designerName: "Nguyễn Văn A", minutes: 240 });
    expect(msg).toContain("26.42341_1");
    expect(msg).toContain("Nguyễn Văn A");
    expect(msg).toContain("4.0 giờ");
    expect(msg).toContain("KHÔNG tự huỷ");
  });

  it("không rõ MO vẫn ra câu đọc được", () => {
    expect(orphanNeedsDecisionWarning(null, { designerName: "A", minutes: null })).toContain("không rõ");
  });
});

describe("Đường đồng bộ thật sự gọi bộ đối chiếu, và gọi ĐÚNG CHỖ", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "lib", "business", "kpi-3d", "assignment.ts"),
    "utf8",
  );

  it("BỘ DÒ CÒN CHẠY — vẫn thấy lần return sớm khi không có target", () => {
    expect(src).toContain("if (targets.length === 0)");
  });

  it("có gọi closeOrphanAssignments", () => {
    expect(src).toContain("closeOrphanAssignments(tx");
  });

  it("gọi TRƯỚC lần return sớm — MO bị xoá hết khối không còn là target nào cả", () => {
    expect(src.indexOf("closeOrphanAssignments(tx")).toBeLessThan(src.indexOf("if (targets.length === 0)"));
  });

  it("đóng lượt bằng CANCELLED, KHÔNG xoá cứng", () => {
    expect(src).toContain('status: "CANCELLED"');
    expect(src).not.toMatch(/design3DAssignment\.delete/);
  });
});

describe("Route truyền PAYLOAD THÔ, không phải bản đã trộn", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "api", "orders", "[id]", "production", "route.ts"),
    "utf8",
  );

  it("incomingExtraData nhận extraData (thô), KHÔNG phải mergedExtra", () => {
    // Truyền mergedExtra thì cửa chặn lúc nào cũng mở, vì bản trộn luôn mang khối cũ từ DB.
    expect(src).toMatch(/incomingExtraData:\s*extraData\s*\?\?\s*null/);
    expect(src).not.toMatch(/incomingExtraData:\s*mergedExtra/);
  });
});

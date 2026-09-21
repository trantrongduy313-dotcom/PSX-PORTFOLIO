import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  attemptSummaryLead,
  deadlineShortLabel,
  summaryHoursLabel,
} from "@/app/lib/business/kpi-3d/attempt-summary";

// TEST CHO ĐÚNG DÒNG TÓM TẮT ĐÃ ĐO ĐƯỢC TRÊN SIDEBAR:
//
//   #1  [ĐÃ CHỐT]  · N8n · 0 giờ · Đúng hạn
//   #2             · Thanh Vũ · Nhóm 2 · 09:22 19/08/2026 · Đã duyệt
//
// Cùng một loại khối, HAI bộ trường và HAI thứ tự — vì mỗi khối tự ghép chuỗi tóm tắt của mình.

describe("deadlineShortLabel — rút hạn chót xuống dd/MM", () => {
  it("bỏ năm và giờ: đang liếc thì không ai cần chính xác tới phút", () => {
    expect(deadlineShortLabel("2026-08-19")).toBe("19/08");
  });

  it("chuỗi rỗng / thiếu / sai dạng đều ra null, không ra 'undefined/undefined'", () => {
    expect(deadlineShortLabel(null)).toBeNull();
    expect(deadlineShortLabel("")).toBeNull();
    expect(deadlineShortLabel("2026-08")).toBeNull();
  });
});

describe("summaryHoursLabel — số phải CÓ NGỮ CẢNH hoặc không hiện", () => {
  it("'0 giờ' một mình vô nghĩa → kèm ngân sách để đọc được ngay là chưa ghi giờ nào", () => {
    expect(summaryHoursLabel(0, 4)).toBe("0/4 giờ");
  });

  it("không có ngân sách thì hiện số trần, KHÔNG bịa mẫu số", () => {
    expect(summaryHoursLabel(3.5, null)).toBe("3.5 giờ");
    expect(summaryHoursLabel(3.5, 0)).toBe("3.5 giờ");
  });

  it("chưa có số giờ nào thì ẩn hẳn — khác hẳn với 0 giờ", () => {
    expect(summaryHoursLabel(null, 4)).toBeNull();
  });
});

describe("attemptSummaryLead — MỘT ngữ pháp cho mọi khối", () => {
  it("lượt ĐÃ CHỐT: người · nhóm · số giờ (hạn chót đã hết nghĩa)", () => {
    expect(attemptSummaryLead({
      designerName: "N8n", kpiGroupName: "Nhóm 2",
      isClosed: true, actualHours: 0, standardHours: 4,
    })).toBe("N8n · Nhóm 2 · 0/4 giờ");
  });

  it("lượt ĐANG CHẠY: người · nhóm · hạn dd/MM (chưa có số giờ cuối)", () => {
    expect(attemptSummaryLead({
      designerName: "Thanh Vũ", kpiGroupName: "Nhóm 2",
      isClosed: false, deadlineYmd: "2026-08-19",
    })).toBe("Thanh Vũ · Nhóm 2 · hạn 19/08");
  });

  it("KHÔNG có dấu '·' mở đầu — bản cũ in '· N8n', dấu đó không phân tách gì", () => {
    const lead = attemptSummaryLead({
      designerName: "N8n", kpiGroupName: null, isClosed: true, actualHours: null,
    });
    expect(lead.startsWith("·")).toBe(false);
    expect(lead).toBe("N8n");
  });

  it("KHÔNG chứa trạng thái: phán quyết là chip riêng, để truncate cắt TÊN chứ không cắt nó", () => {
    const lead = attemptSummaryLead({
      designerName: "Thanh Vũ", kpiGroupName: "Nhóm 2",
      isClosed: false, deadlineYmd: "2026-08-19",
    });
    expect(lead).not.toContain("Đã duyệt");
    expect(lead).not.toContain("Đúng hạn");
  });

  it("'Đang tạm dừng' ĐỨNG ĐẦU — nó phủ định mọi thứ đứng sau nó", () => {
    const lead = attemptSummaryLead({
      designerName: "Thanh Vũ", kpiGroupName: "Nhóm 2",
      isClosed: false, isPaused: true, deadlineYmd: "2026-08-19",
    });
    expect(lead.startsWith("Đang tạm dừng")).toBe(true);
  });

  it("bỏ ô trống thay vì hiện '—' liên tiếp: khối chưa nhập gì thì tóm tắt cũng trống", () => {
    expect(attemptSummaryLead({
      designerName: "", kpiGroupName: "   ", isClosed: false, deadlineYmd: null,
    })).toBe("");
  });

  it("hai khối cùng ngữ pháp: cùng số ô và cùng thứ tự người → nhóm → chỉ số", () => {
    const closed = attemptSummaryLead({
      designerName: "A", kpiGroupName: "Nhóm 1", isClosed: true, actualHours: 2, standardHours: 4,
    }).split(" · ");
    const open = attemptSummaryLead({
      designerName: "B", kpiGroupName: "Nhóm 1", isClosed: false, deadlineYmd: "2026-08-19",
    }).split(" · ");
    expect(closed.length).toBe(open.length);
    expect(closed[1]).toBe(open[1]); // ô thứ hai LUÔN là nhóm ở cả hai khối
  });
});

describe("Sidebar: KHÔNG khối nào tự ghép chuỗi tóm tắt lần nữa", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "dashboard", "orders", "_components", "panel-designer-3d.tsx"),
    "utf8",
  );

  it("cả hai khối đều gọi attemptSummaryLead", () => {
    expect(src.split("attemptSummaryLead(").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("KHÔNG còn dấu '·' mở đầu viết thẳng trong JSX", () => {
    // Đây là hình dạng cũ: `<span …>· {summary}</span>`. Nó quay lại rất dễ vì trông như một
    // dấu phân tách vô hại.
    expect(src).not.toContain(">· {summary}<");
  });
});

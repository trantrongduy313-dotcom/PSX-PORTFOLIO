import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ATTEMPT_FIELD_KEYS,
  ATTEMPT_FIELD_LABELS,
  VERDICT_FIELD_KEYS,
  showsVerdictFields,
} from "@/app/lib/business/kpi-3d/attempt-fields";

// TEST CHO ĐÚNG SỰ LỆCH ĐÃ ĐO ĐƯỢC: khối "Nhân viên 3D #N" có hai bản dựng độc lập —
// `Designer3DCard` (13 trường, có ô nhập) và `ClosedAttemptCard` (8 trường, chỉ đọc). Ba trường
// thiếu ở khối đã chốt (NV 3D nhận việc · Số ngày HT · Kiểm nội bộ) không phải ba lần bất cẩn:
// chúng là MỘT nguyên nhân xảy ra ba lần, vì mỗi bên tự khai danh sách trường của mình.
//
// Chốt CHÍNH của bản sửa là KIỂU (`Record<AttemptFieldKey, …>` buộc khối chỉ đọc phải đủ key) —
// `tsc` đỏ ngay khi thêm trường mà quên. Test này giữ phần mà kiểu KHÔNG với tới được: nhãn phải
// đi từ hằng dùng chung, không phải chuỗi viết thẳng lần thứ hai.

const PANEL = join(process.cwd(), "app", "dashboard", "orders", "_components", "panel-designer-3d.tsx");

describe("ATTEMPT_FIELD_LABELS — một nhãn cho mỗi trường", () => {
  it("mọi key đều có nhãn, không key nào rỗng", () => {
    for (const key of ATTEMPT_FIELD_KEYS) {
      expect(ATTEMPT_FIELD_LABELS[key]?.trim(), key).toBeTruthy();
    }
  });

  it("KHÔNG hai trường nào trùng nhãn — trùng thì người đọc không phân biệt được hai ô", () => {
    const labels = ATTEMPT_FIELD_KEYS.map((k) => ATTEMPT_FIELD_LABELS[k]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("nhóm trường phán quyết nằm trong danh sách chính", () => {
    for (const key of VERDICT_FIELD_KEYS) {
      expect(ATTEMPT_FIELD_KEYS as readonly string[]).toContain(key);
    }
  });
});

describe("showsVerdictFields — ẩn phán quyết khi số giờ CHƯA phải số cuối", () => {
  it("đang tạm dừng thì ẩn: chưa ai kết luận gì, và Số ngày HT sẽ ra '0 ngày' vô nghĩa", () => {
    expect(showsVerdictFields({ isPausedSnapshot: true })).toBe(false);
  });

  it("số giờ đã dừng thì hiện", () => {
    expect(showsVerdictFields({ isPausedSnapshot: false })).toBe(true);
  });
});

describe("Sidebar: HAI khối cùng đọc một danh sách nhãn", () => {
  const src = readFileSync(PANEL, "utf8");

  it("KHÔNG nhãn nào của khối lượt giao còn là chuỗi viết thẳng trong JSX", () => {
    // Chuỗi viết thẳng là cách sự lệch cũ len vào: "Nhân viên Thiết kế 3D" ở khối này và
    // "Nhân viên thiết kế 3D" ở khối kia cùng tồn tại. Chữ T hoa không làm sai số nào, nhưng nó
    // là bằng chứng rằng không có gì buộc hai khối nói cùng một thứ tiếng.
    const literals = ATTEMPT_FIELD_KEYS
      .filter((k) => src.includes(`<Field label="${ATTEMPT_FIELD_LABELS[k]}">`))
      .map((k) => `${k} → ${ATTEMPT_FIELD_LABELS[k]}`);
    expect(literals).toEqual([]);
  });

  it("mỗi trường xuất hiện ở CẢ HAI khối (đang chạy + đã chốt)", () => {
    const tooFew = ATTEMPT_FIELD_KEYS
      .map((k) => ({ k, n: src.split(`ATTEMPT_FIELD_LABELS.${k}`).length - 1 }))
      .filter((x) => x.n < 2);
    expect(tooFew).toEqual([]);
  });
});

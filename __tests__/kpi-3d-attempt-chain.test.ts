import { describe, expect, it } from "vitest";

import {
  activeAttempts,
  buildAttemptChains,
  chainsWithHistory,
  CONTINUATION_LABELS,
  type AttemptInput,
} from "@/app/lib/business/kpi-3d/attempt-chain";

// Chuỗi liên kết (reassignedFromId) đã có trong bảng từ lâu nhưng chưa màn hình nào hiện ra,
// nên sidebar đơn hàng không cho biết một MO đã làm mấy lần và vì sao.

const a = (o: Partial<AttemptInput> & { id: string }): AttemptInput => ({
  orderItemId: "i1",
  status: "ASSIGNED",
  assignedAt: "2026-08-01T02:00:00Z",
  completedAt: null,
  kpiStatus: null,
  standardMinutesSnapshot: 180,
  actualMinutes: null,
  reviewStatus: null,
  reviewNote: null,
  reassignedFromId: null,
  continuationReason: null,
  designer3D: { id: "d1", name: "AN" },
  ...o,
});

const tags = (chains: ReturnType<typeof buildAttemptChains>) =>
  chains.map((c) => c.map((x) => `${x.attemptNo}:${x.id}`));

describe("Một lượt duy nhất", () => {
  it("một chuỗi, một lần", () => {
    expect(tags(buildAttemptChains([a({ id: "x" })]))).toEqual([["1:x"]]);
  });

  // Chuỗi dài 1 không có gì để kể — khối trường phía trên đã nói đủ.
  it("không có lịch sử để hiện", () => {
    expect(chainsWithHistory([a({ id: "x" })])).toEqual([]);
  });
});

describe("Chuỗi nhiều lần", () => {
  const rows = [
    a({ id: "l1", status: "REASSIGNED", completedAt: "2026-08-04T02:00:00Z", kpiStatus: "ON_TIME" }),
    a({ id: "l2", assignedAt: "2026-08-05T02:00:00Z", reassignedFromId: "l1", continuationReason: "REJECT_REASSIGN" }),
  ];

  it("xếp từ lần 1 tới lần N và đánh số đúng", () => {
    expect(tags(buildAttemptChains(rows))).toEqual([["1:l1", "2:l2"]]);
  });

  it("đánh dấu lượt nào còn hiệu lực", () => {
    const [chain] = buildAttemptChains(rows);
    expect(chain[0].isActive).toBe(false); // đã bị thay
    expect(chain[1].isActive).toBe(true);
  });

  it("có lịch sử để hiện", () => {
    expect(chainsWithHistory(rows)).toHaveLength(1);
  });

  it("thứ tự đầu vào lộn xộn vẫn ra cùng chuỗi", () => {
    expect(tags(buildAttemptChains([rows[1], rows[0]]))).toEqual([["1:l1", "2:l2"]]);
  });

  it("chuỗi ba lần", () => {
    const three = [
      ...rows.map((r) => (r.id === "l2" ? { ...r, status: "REASSIGNED" } : r)),
      a({ id: "l3", assignedAt: "2026-08-09T02:00:00Z", reassignedFromId: "l2", continuationReason: "MANUAL_REASSIGN" }),
    ];
    expect(tags(buildAttemptChains(three))).toEqual([["1:l1", "2:l2", "3:l3"]]);
  });
});

describe("Nhiều NV 3D làm SONG SONG", () => {
  // ⚠️ TEST QUAN TRỌNG NHẤT FILE NÀY.
  // Hai người cùng làm một MO là hai lượt ĐỘC LẬP, cả hai reassignedFromId = null. Gộp tất cả
  // thành một chuỗi sẽ biến "hai người làm song song" thành "MO này làm hai lần" — đọc sai hẳn
  // tình hình, và người duyệt sẽ đi tìm một lý do làm lại không tồn tại.
  const parallel = [
    a({ id: "p1", designer3D: { id: "d1", name: "AN" } }),
    a({ id: "p2", designer3D: { id: "d2", name: "BÌNH" }, assignedAt: "2026-08-02T02:00:00Z" }),
  ];

  it("HAI chuỗi riêng, không phải một chuỗi hai lần", () => {
    expect(tags(buildAttemptChains(parallel))).toEqual([["1:p1"], ["1:p2"]]);
  });

  it("không chuỗi nào có lịch sử", () => {
    expect(chainsWithHistory(parallel)).toEqual([]);
  });

  it("chuỗi sắp theo mốc giao của gốc — khớp thứ tự khối NV 3D #1, #2", () => {
    const [first, second] = buildAttemptChains([parallel[1], parallel[0]]);
    expect(first[0].id).toBe("p1");
    expect(second[0].id).toBe("p2");
  });

  it("một người làm song song, một người bị đổi → hai chuỗi độ dài khác nhau", () => {
    const mixed = [
      ...parallel.map((r) => (r.id === "p1" ? { ...r, status: "REASSIGNED" } : r)),
      a({ id: "p1b", assignedAt: "2026-08-06T02:00:00Z", reassignedFromId: "p1", continuationReason: "REJECT_REASSIGN" }),
    ];
    expect(tags(buildAttemptChains(mixed))).toEqual([["1:p1", "2:p1b"], ["1:p2"]]);
    expect(chainsWithHistory(mixed)).toHaveLength(1);
  });
});

describe("Dữ liệu hỏng không được làm treo hoặc mất dòng", () => {
  // Dữ liệu vòng tròn: MỌI lượt đều có cha nên KHÔNG có gốc nào, và các dòng đó biến mất khỏi
  // lịch sử. Test này phát biểu đúng điều đó thay vì hứa "không lặp vô hạn" — chốt chặn `seen`
  // trong hàm không thể với tới (mỗi lượt chỉ có một cha), nên nói nó được kiểm ở đây là sai.
  //
  // Mất dòng là hệ quả CHẤP NHẬN ĐƯỢC so với treo cả sidebar, nhưng phải biết là nó xảy ra.
  it("chuỗi trỏ vòng tròn → trả về rỗng, không treo và không ném lỗi", () => {
    const cyclic = [
      a({ id: "c1", reassignedFromId: "c2" }),
      a({ id: "c2", reassignedFromId: "c1" }),
    ];
    expect(buildAttemptChains(cyclic)).toEqual([]);
  });

  // Không nên xảy ra, nhưng không được làm MẤT dòng: lượt cha thuộc MO khác thì lượt này vẫn
  // phải hiện, như gốc của chuỗi riêng.
  it("tiếp nối một lượt không có trong tập → vẫn là gốc, không bị bỏ", () => {
    expect(tags(buildAttemptChains([a({ id: "x", reassignedFromId: "khong-ton-tai" })]))).toEqual([["1:x"]]);
  });

  it("hai lượt cùng trỏ vào một cha → lấy con sớm nhất, chuỗi vẫn tuyến tính", () => {
    const forked = [
      a({ id: "g", status: "REASSIGNED" }),
      a({ id: "som", assignedAt: "2026-08-03T02:00:00Z", reassignedFromId: "g" }),
      a({ id: "muon", assignedAt: "2026-08-07T02:00:00Z", reassignedFromId: "g" }),
    ];
    const chains = buildAttemptChains(forked);
    expect(chains[0].map((x) => x.id)).toEqual(["g", "som"]);
    // Nhánh còn lại KHÔNG bị mất — nó thành gốc của chuỗi khác? Không: nó có cha trong tập, nên
    // nó không phải gốc. Đây là hệ quả đã biết và có chủ ý; test giữ chỗ để ai đổi thì thấy.
    expect(chains).toHaveLength(1);
  });

  it("mốc thời gian rác không làm hàm ném lỗi", () => {
    expect(() => buildAttemptChains([a({ id: "x", assignedAt: "khong-phai-ngay" })])).not.toThrow();
  });
});

describe("Tập lượt còn hiệu lực", () => {
  // Panel dựng khối trường từ tập này — chính là hành vi cũ khi API còn lọc ở tầng truy vấn.
  it("loại lượt đã đóng, giữ nguyên phần còn lại", () => {
    const rows = [
      a({ id: "cu", status: "REASSIGNED" }),
      a({ id: "huy", status: "CANCELLED" }),
      a({ id: "song", status: "IN_PROGRESS" }),
    ];
    expect(activeAttempts(rows).map((r) => r.id)).toEqual(["song"]);
  });
});

describe("Nhãn lý do", () => {
  it("mỗi lý do có một nhãn riêng, không trùng nhau", () => {
    const labels = Object.values(CONTINUATION_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
  });
});

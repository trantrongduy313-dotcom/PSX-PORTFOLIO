import { describe, expect, it } from "vitest";

import {
  ALL_FEEDBACK_STATUSES,
  checkTransition,
  isOpenStatus,
  isStatusAllowedForKind,
  requiresReply,
  statusLabel,
  statusTone,
  statusesFor,
  type FeedbackStatus,
} from "@/app/lib/business/feedback/status";
import { FEEDBACK_KINDS } from "@/app/lib/business/feedback/kind";

// LỖI MÀ FILE TEST NÀY TỒN TẠI ĐỂ CHẶN:
//
//     một ĐỀ XUẤT CẢI TIẾN hiện chữ "Đã sửa"
//
// Không ai báo lỗi đó. Nó chỉ âm thầm làm người gửi thấy hệ thống không hiểu mình đang nói gì.

describe("Hai vòng đời PHẢI tách nhau", () => {
  it("BÁO LỖI không nhận trạng thái của đề xuất", () => {
    expect(isStatusAllowedForKind("BUG", "ACKNOWLEDGED")).toBe(false);
    expect(isStatusAllowedForKind("BUG", "IN_PROGRESS")).toBe(false);
  });

  it("ĐỀ XUẤT không nhận 'Đang xem' của báo lỗi", () => {
    expect(isStatusAllowedForKind("IDEA", "TRIAGED")).toBe(false);
  });

  it("NEW thuộc CẢ HAI — mọi phản hồi đều bắt đầu ở đó", () => {
    for (const kind of FEEDBACK_KINDS) {
      expect(isStatusAllowedForKind(kind, "NEW")).toBe(true);
    }
  });

  it("hai kết cục RESOLVED/DECLINED dùng chung cho cả hai loại", () => {
    for (const kind of FEEDBACK_KINDS) {
      expect(isStatusAllowedForKind(kind, "RESOLVED")).toBe(true);
      expect(isStatusAllowedForKind(kind, "DECLINED")).toBe(true);
    }
  });

  it("mọi trạng thái trong union đều thuộc ÍT NHẤT một vòng đời — không có trạng thái mồ côi", () => {
    // Thêm giá trị vào enum mà quên xếp vào vòng đời nào thì nó không bao giờ dùng được, và
    // không có gì báo. Test này báo.
    for (const status of ALL_FEEDBACK_STATUSES) {
      const belongs = FEEDBACK_KINDS.some((k) => isStatusAllowedForKind(k, status));
      expect(belongs, `${status} không thuộc vòng đời nào`).toBe(true);
    }
  });
});

describe("statusLabel — cùng một mã, hai loại đọc ra hai câu", () => {
  it("RESOLVED: lỗi thì 'Đã sửa', đề xuất thì 'Đã làm xong'", () => {
    expect(statusLabel("BUG", "RESOLVED")).toBe("Đã sửa");
    expect(statusLabel("IDEA", "RESOLVED")).toBe("Đã làm xong");
  });

  it("DECLINED: lỗi thì 'Không phải lỗi', đề xuất thì 'Không làm'", () => {
    expect(statusLabel("BUG", "DECLINED")).toBe("Không phải lỗi");
    expect(statusLabel("IDEA", "DECLINED")).toBe("Không làm");
  });

  it("ACKNOWLEDGED nói THẬT: đã ghi nhận NHƯNG chưa làm", () => {
    // Trạng thái quan trọng nhất cả danh sách. Một đề xuất nằm ở "Mới" ba tháng trông như bị
    // phớt lờ; đúng cái đó ở "đã ghi nhận, chưa làm" là một câu trả lời thật.
    const label = statusLabel("IDEA", "ACKNOWLEDGED");
    expect(label).toContain("ghi nhận");
    expect(label).toContain("chưa làm");
  });

  it("mọi cặp (loại, trạng thái hợp lệ) đều có nhãn KHÔNG rỗng", () => {
    for (const kind of FEEDBACK_KINDS) {
      for (const status of statusesFor(kind)) {
        expect(statusLabel(kind, status).length).toBeGreaterThan(0);
      }
    }
  });

  it("nhãn KHÔNG được lộ mã enum ra cho người dùng", () => {
    for (const kind of FEEDBACK_KINDS) {
      for (const status of statusesFor(kind)) {
        expect(statusLabel(kind, status)).not.toMatch(/[A-Z_]{4,}/);
      }
    }
  });
});

describe("isOpenStatus — định nghĩa theo 'CHƯA phải kết cục'", () => {
  it("hai kết cục là đóng", () => {
    expect(isOpenStatus("RESOLVED")).toBe(false);
    expect(isOpenStatus("DECLINED")).toBe(false);
  });

  it("tất cả phần còn lại là mở — kể cả trạng thái thêm mới về sau", () => {
    const open = ALL_FEEDBACK_STATUSES.filter(isOpenStatus);
    expect(open).toEqual(["NEW", "TRIAGED", "ACKNOWLEDGED", "IN_PROGRESS"]);
  });
});

describe("checkTransition", () => {
  it("chặn gán trạng thái SAI LOẠI, và nêu đích danh cả hai vế", () => {
    const r = checkTransition({ kind: "IDEA", from: "NEW", to: "TRIAGED" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("TRIAGED");
      expect(r.reason).toContain("đề xuất");
    }
  });

  it("cho phép ĐI LÙI — admin bấm nhầm thì phải sửa lại được", () => {
    // KHÔNG dựng máy trạng thái một chiều: nó tạo ra những phản hồi kẹt cứng không có đường
    // ra, tệ hơn hẳn cái nó ngăn được. Admin ở đây là một người.
    expect(checkTransition({ kind: "BUG", from: "RESOLVED", to: "TRIAGED" }).ok).toBe(true);
  });

  it("chuyển sang chính nó là vô nghĩa → chặn", () => {
    expect(checkTransition({ kind: "BUG", from: "NEW", to: "NEW" }).ok).toBe(false);
  });

  it("mọi trạng thái hợp lệ của loại đó đều tới được từ NEW", () => {
    for (const kind of FEEDBACK_KINDS) {
      for (const to of statusesFor(kind)) {
        if (to === "NEW") continue;
        expect(checkTransition({ kind, from: "NEW", to }).ok, `${kind} → ${to}`).toBe(true);
      }
    }
  });
});

describe("requiresReply — 'không' phải kèm lý do", () => {
  it("DECLINED bắt buộc có câu trả lời", () => {
    // Người ta chịu được câu "không"; người ta không chịu được sự im lặng. Và một DECLINED
    // trống là tín hiệu rõ ràng rằng đã bị đọc và bị bỏ — cách nhanh nhất làm người ta thôi gửi.
    expect(requiresReply("DECLINED")).toBe(true);
  });

  it("RESOLVED không bắt buộc — kết quả tự nói lên", () => {
    expect(requiresReply("RESOLVED")).toBe(false);
  });

  it("các trạng thái đang mở không bắt buộc", () => {
    for (const s of ALL_FEEDBACK_STATUSES.filter(isOpenStatus)) {
      expect(requiresReply(s)).toBe(false);
    }
  });
});

describe("statusTone — mọi trạng thái đều có màu, không có ca rơi ra ngoài", () => {
  it.each(ALL_FEEDBACK_STATUSES)("%s có tone", (s) => {
    expect(["new", "active", "done", "muted"]).toContain(statusTone(s as FeedbackStatus));
  });
});

import { describe, expect, it } from "vitest";

import {
  compareAssignmentsForQueue,
  isNewlyAssigned,
  type QueueRow,
} from "@/app/lib/business/kpi-3d/queue-order";
import {
  deniedReasonForSendResult,
  MANUAL_PROGRESS_STATUSES,
  PROGRESS_STATUS_VALUES,
} from "@/app/lib/business/kpi-3d/progress";

const row = (o: Partial<QueueRow> & { deadlineAt: string }): QueueRow => ({
  status: "ASSIGNED",
  assignedAt: "2026-08-01T02:00:00Z",
  completedAt: null,
  acknowledgedAt: "2026-08-01T03:00:00Z",
  ...o,
});

const order = (rows: Array<QueueRow & { tag: string }>) =>
  [...rows].sort(compareAssignmentsForQueue).map((r) => r.tag);

describe("Đơn nào là 'Mới'", () => {
  it("đã giao mà chưa bấm nhận việc → Mới", () => {
    expect(isNewlyAssigned(row({ deadlineAt: "2026-08-10T02:00:00Z", acknowledgedAt: null }))).toBe(true);
  });

  it("đã nhận việc → không còn Mới", () => {
    expect(isNewlyAssigned(row({ deadlineAt: "2026-08-10T02:00:00Z" }))).toBe(false);
  });

  // Dán nhãn "Mới" lên một lượt không còn là của họ thì nhãn đó nói sai.
  it.each([["REASSIGNED"], ["CANCELLED"]])("lượt đã đóng (%s) → không phải Mới dù chưa nhận", (status) => {
    expect(isNewlyAssigned(row({ deadlineAt: "2026-08-10T02:00:00Z", acknowledgedAt: null, status }))).toBe(false);
  });

  it("đã hoàn tất → không phải Mới", () => {
    expect(isNewlyAssigned(row({
      deadlineAt: "2026-08-10T02:00:00Z", acknowledgedAt: null, completedAt: "2026-08-05T02:00:00Z",
    }))).toBe(false);
  });
});

describe("Thứ tự hàng đợi", () => {
  it("chưa nhận việc lên đầu, dù hạn xa hơn", () => {
    expect(order([
      { ...row({ deadlineAt: "2026-08-02T02:00:00Z" }), tag: "han-gan-da-nhan" },
      { ...row({ deadlineAt: "2026-08-30T02:00:00Z", acknowledgedAt: null }), tag: "moi" },
    ])).toEqual(["moi", "han-gan-da-nhan"]);
  });

  it("trong nhóm chưa nhận việc: MỚI GIAO NHẤT trước", () => {
    expect(order([
      { ...row({ deadlineAt: "2026-08-20T02:00:00Z", acknowledgedAt: null, assignedAt: "2026-08-01T02:00:00Z" }), tag: "cu" },
      { ...row({ deadlineAt: "2026-08-25T02:00:00Z", acknowledgedAt: null, assignedAt: "2026-08-12T02:00:00Z" }), tag: "moi-nhat" },
    ])).toEqual(["moi-nhat", "cu"]);
  });

  // ⚠️ Đây là điều KHÔNG được đánh đổi. Danh sách này là hàng đợi công việc; sắp toàn bộ theo
  // "mới giao nhất" sẽ đẩy một đơn hạn còn 2 giờ xuống dưới đơn hạn tuần sau.
  it("nhóm ĐÃ nhận việc vẫn sắp theo deadline, không theo mốc giao", () => {
    expect(order([
      { ...row({ deadlineAt: "2026-08-28T02:00:00Z", assignedAt: "2026-08-20T02:00:00Z" }), tag: "han-xa-giao-muon" },
      { ...row({ deadlineAt: "2026-08-03T02:00:00Z", assignedAt: "2026-08-01T02:00:00Z" }), tag: "han-gan" },
    ])).toEqual(["han-gan", "han-xa-giao-muon"]);
  });

  it("đã hoàn tất dồn xuống cuối, kể cả khi hạn gần nhất", () => {
    expect(order([
      { ...row({ deadlineAt: "2026-08-01T02:00:00Z", completedAt: "2026-08-01T02:00:00Z" }), tag: "xong" },
      { ...row({ deadlineAt: "2026-08-20T02:00:00Z" }), tag: "dang-lam" },
      { ...row({ deadlineAt: "2026-08-25T02:00:00Z", acknowledgedAt: null }), tag: "moi" },
    ])).toEqual(["moi", "dang-lam", "xong"]);
  });

  // Không có tiêu chí cuối thì hai đơn cùng deadline đổi chỗ mỗi lần tải trang, và người dùng
  // tưởng danh sách nhảy ngẫu nhiên.
  it("cùng deadline → thứ tự ỔN ĐỊNH, không phụ thuộc thứ tự đầu vào", () => {
    const a = { ...row({ deadlineAt: "2026-08-10T02:00:00Z", assignedAt: "2026-08-01T02:00:00Z" }), tag: "a" };
    const b = { ...row({ deadlineAt: "2026-08-10T02:00:00Z", assignedAt: "2026-08-05T02:00:00Z" }), tag: "b" };
    expect(order([a, b])).toEqual(order([b, a]));
  });

  it("mốc thời gian rác không làm hàm ném lỗi", () => {
    expect(() => order([
      { ...row({ deadlineAt: "khong-phai-ngay" }), tag: "rac" },
      { ...row({ deadlineAt: "2026-08-10T02:00:00Z" }), tag: "ok" },
    ])).not.toThrow();
  });
});

describe("Gửi kết quả là hành động một chiều", () => {
  // ⚠️ TEST QUAN TRỌNG NHẤT: nếu ai đó đưa SENT_RESULT trở lại ô thả xuống thì nút xác nhận
  // thành trang trí — người dùng bấm ô thả xuống là bỏ qua được lớp bảo vệ.
  it("ô thả xuống KHÔNG có 'Đã gửi kết quả'", () => {
    expect(MANUAL_PROGRESS_STATUSES).not.toContain("SENT_RESULT");
    expect(MANUAL_PROGRESS_STATUSES).toEqual(["IN_PROGRESS", "WAITING_INFO"]);
  });

  // Bỏ khỏi ô thả xuống KHÔNG có nghĩa là bỏ khỏi hệ thống — server vẫn nhận giá trị đó.
  it("nhưng vẫn là một trạng thái hợp lệ của hệ thống", () => {
    expect(PROGRESS_STATUS_VALUES).toContain("SENT_RESULT");
  });

  it("có File Render → gửi được ngay", () => {
    expect(deniedReasonForSendResult({ hasRenderLink: true, acknowledgedMissingFile: false })).toBeNull();
  });

  // Không chặn cứng: có ca thật cần gửi trước nộp file sau, và chặn cứng đẩy họ sang nhắn tin
  // ngoài hệ thống — lúc đó không còn dấu vết nào.
  it("chưa có file mà đã tích xác nhận → cho gửi", () => {
    expect(deniedReasonForSendResult({ hasRenderLink: false, acknowledgedMissingFile: true })).toBeNull();
  });

  it("chưa có file và chưa tích → chặn, và câu chặn nói rõ phải làm gì", () => {
    const msg = deniedReasonForSendResult({ hasRenderLink: false, acknowledgedMissingFile: false });
    expect(msg).toContain("tích");
  });
});

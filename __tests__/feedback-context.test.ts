import { describe, expect, it } from "vitest";

import {
  contextSummary,
  currentCommitSha,
  normalizeFeedbackContext,
  pathOf,
} from "@/app/lib/business/feedback/context";

const empty = normalizeFeedbackContext(null);

describe("normalizeFeedbackContext — KHÔNG BAO GIỜ ném lỗi, KHÔNG BAO GIỜ từ chối", () => {
  // Bối cảnh là thứ PHỤ TRỢ. Người dùng đang cố báo một lỗi; để việc gửi thất bại vì cái
  // `viewport` sai định dạng là biến công cụ báo lỗi thành một lỗi nữa.

  it("không có gì cả → mọi trường null, không nổ", () => {
    expect(empty.pageUrl).toBeNull();
    expect(empty.orderId).toBeNull();
    expect(empty.orderVersion).toBeNull();
  });

  it("kiểu dữ liệu rác từ client → bỏ qua trường đó, giữ các trường còn lại", () => {
    const ctx = normalizeFeedbackContext({
      pageUrl: "/dashboard/orders?orderId=abc",
      orderId: { evil: true },
      orderVersion: "14",
      moNumber: 12345,
    });
    expect(ctx.pageUrl).toBe("/dashboard/orders?orderId=abc");
    expect(ctx.orderId).toBeNull();
    expect(ctx.orderVersion).toBeNull();
    expect(ctx.moNumber).toBeNull();
  });

  it("chuỗi rỗng / chỉ khoảng trắng → null, không lưu chuỗi rỗng", () => {
    const ctx = normalizeFeedbackContext({ orderNumber: "   ", moNumber: "" });
    expect(ctx.orderNumber).toBeNull();
    expect(ctx.moNumber).toBeNull();
  });

  it("CẮT chuỗi quá dài thay vì từ chối — client kiểm soát dữ liệu này", () => {
    // URL THẬT nhưng dài (query bị nhồi) — chuỗi rác không phải URL đã bị loại ở test dưới.
    const ctx = normalizeFeedbackContext({
      pageUrl: `/dashboard/orders?q=${"x".repeat(5000)}`,
      userAgent: "u".repeat(5000),
    });
    expect(ctx.pageUrl!.length).toBe(500);
    expect(ctx.userAgent!.length).toBe(400);
  });

  it("orderVersion âm là dữ liệu rác → bỏ, không hiện 'phiên bản -3'", () => {
    expect(normalizeFeedbackContext({ orderVersion: -3 }).orderVersion).toBeNull();
  });

  it("orderVersion số thực → cắt phần thập phân", () => {
    expect(normalizeFeedbackContext({ orderVersion: 14.9 }).orderVersion).toBe(14);
  });

  it("orderVersion = 0 là giá trị THẬT, không bị coi là thiếu", () => {
    expect(normalizeFeedbackContext({ orderVersion: 0 }).orderVersion).toBe(0);
  });

  it("NaN / Infinity → null", () => {
    expect(normalizeFeedbackContext({ orderVersion: NaN }).orderVersion).toBeNull();
    expect(normalizeFeedbackContext({ orderVersion: Infinity }).orderVersion).toBeNull();
  });
});

describe("pageUrl là CHỐT CHẶN AN NINH — trang admin biến nó thành link bấm được", () => {
  // `new URL("javascript:alert(1)")` PARSE THÀNH CÔNG. Bọc try/catch rồi tin vào việc nó
  // không ném lỗi là đúng cái bẫy — phải kiểm đích danh giao thức.

  it("javascript: bị loại — đây là mã chạy trong trình duyệt của ADMIN", () => {
    expect(normalizeFeedbackContext({ pageUrl: "javascript:alert(1)" }).pageUrl).toBeNull();
  });

  it("data: bị loại", () => {
    expect(normalizeFeedbackContext({ pageUrl: "data:text/html,<script>x</script>" }).pageUrl).toBeNull();
  });

  it("'//evil.com/x' bị loại — trông như đường dẫn nội bộ nhưng đi ra máy chủ khác", () => {
    expect(normalizeFeedbackContext({ pageUrl: "//evil.com/x" }).pageUrl).toBeNull();
  });

  it("https và đường dẫn tương đối vẫn qua bình thường", () => {
    expect(normalizeFeedbackContext({ pageUrl: "https://psx.vercel.app/dashboard" }).pageUrl).toBe(
      "https://psx.vercel.app/dashboard",
    );
    expect(normalizeFeedbackContext({ pageUrl: "/dashboard/orders?orderId=a" }).pageUrl).toBe(
      "/dashboard/orders?orderId=a",
    );
  });
});

describe("currentCommitSha — TRƯỜNG QUÝ NHẤT, và đọc ở SERVER", () => {
  it("cắt 7 ký tự — đủ cho `git show`, đọc được trong một dòng", () => {
    expect(currentCommitSha({ VERCEL_GIT_COMMIT_SHA: "b51ddb7aaaabbbbccccdddd" })).toBe("b51ddb7");
  });

  it("chạy local (không có biến) → null, không nổ", () => {
    expect(currentCommitSha({})).toBeNull();
  });

  it("biến chỉ có khoảng trắng vẫn coi là chưa đặt", () => {
    // Giá trị dán vào Vercel có thể kèm khoảng trắng — cùng bài học đã ghi ở supabase-storage.ts.
    expect(currentCommitSha({ VERCEL_GIT_COMMIT_SHA: "   " })).toBeNull();
  });
});

describe("contextSummary — một dòng người đọc kiểm được", () => {
  it("có MO thì MO đứng trước — một SO có nhiều MO, MO định danh chính xác hơn", () => {
    const s = contextSummary({
      ...empty,
      moNumber: "25.32658_4",
      orderNumber: "25.9431",
      orderVersion: 14,
    });
    expect(s!.indexOf("MO 25.32658_4")).toBeLessThan(s!.indexOf("SO 25.9431"));
    expect(s).toContain("phiên bản 14");
  });

  it("chỉ có SO thì hiện SO", () => {
    expect(contextSummary({ ...empty, orderNumber: "25.9431" })).toContain("SO 25.9431");
  });

  it("không thuộc đơn nào → vẫn nêu được màn hình", () => {
    // "Màn Thống kê load chậm" là phản hồi thật và không thuộc đơn nào. Đây là lý do orderId
    // phải nullable, khác hẳn bảng Alert.
    expect(contextSummary({ ...empty, pageUrl: "https://x.vercel.app/dashboard/statistics" })).toBe(
      "/dashboard/statistics",
    );
  });

  it("không có gì cả → null, không trả chuỗi rỗng", () => {
    expect(contextSummary(empty)).toBeNull();
  });
});

describe("pathOf — bỏ tên miền", () => {
  it("giữ đường dẫn + query, bỏ host", () => {
    // Tên miền thì mọi báo cáo đều giống nhau nên chỉ chiếm chỗ; và URL dài tự xuống dòng
    // giữa chuỗi trong tin nhắn Chat.
    expect(pathOf("https://psx.vercel.app/dashboard/orders?orderId=abc")).toBe(
      "/dashboard/orders?orderId=abc",
    );
  });

  it("client gửi đường dẫn tương đối → dùng nguyên văn", () => {
    expect(pathOf("/dashboard/orders")).toBe("/dashboard/orders");
  });

  it("chuỗi không phải URL và không bắt đầu bằng '/' → null", () => {
    expect(pathOf("javascript:alert(1)")).toBeNull();
  });

  it("null → null", () => {
    expect(pathOf(null)).toBeNull();
  });
});

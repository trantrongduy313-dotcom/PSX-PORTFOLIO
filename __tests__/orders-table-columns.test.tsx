/** @vitest-environment jsdom */
import "./setup-dom";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildColumns, phanLoaiKhNode } from "@/app/dashboard/orders/_components/orders-table";
import { LABELS } from "@/app/lib/i18n/labels";
import type { OrderSummary } from "@/app/lib/types/order";
import type { OrderTab } from "@/app/lib/types/order";

// orders-table.tsx (1.231 dòng) là bảng mọi người nhìn cả ngày, và chưa có test nào.
//
// "Tab nào hiện cột nào" là LUẬT, không phải trình bày: mỗi tab được rút gọn có chủ ý (tab
// Hoàn tất / Đã hủy để TRA CỨU, không để điều hành). Một cột biến mất khỏi một tab là lỗi
// IM LẶNG — bảng vẫn dựng bình thường, chỉ thiếu mất một cột.

const L = LABELS.vi;
const idsOf = (tab: OrderTab) => buildColumns(tab, L).map((column) => column.id);

describe("bộ cột theo tab", () => {
  // Tab Hoàn tất: chỉ những gì cần để TRA CỨU đơn đã xong.
  it("tab Hoàn tất → đúng 6 cột tra cứu, không có cột điều hành", () => {
    expect(idsOf("completed")).toEqual([
      "orderNumber", "designFile", "nguon", "phanLoaiKh", "completedAtCol", "thongTinHtPerMo",
    ]);
  });

  // Tab Đã hủy trả lời bốn câu: MO nào, sản phẩm gì, của khách nào, vì sao + khi nào bị hủy.
  it("tab Đã hủy → có lý do hủy và ngày hủy", () => {
    const ids = idsOf("cancelled");
    expect(ids).toContain("cancelReasonCol");
    expect(ids).toContain("cancelledAtCol");
    expect(ids).toContain("customer");
  });

  // 🔴 Với đơn đã kết thúc, các cột điều hành (deadline, BOM, tiến độ, trạng thái) đã hết
  // nghĩa. Để chúng lại là bắt người tra cứu cuộn ngang qua ~9 cột trống.
  it("hai tab kết thúc → KHÔNG còn cột điều hành", () => {
    for (const tab of ["completed", "cancelled"] as const) {
      for (const operational of ["requiredDate", "bomStatus", "congDoan", "status"]) {
        expect(idsOf(tab)).not.toContain(operational);
      }
    }
  });

  // ⚠️ Hai phòng theo dõi hai thứ khác nhau, và bảng phản ánh đúng điều đó:
  //   PTK  có `bomStatus` (chờ đủ thông tin BOM), KHÔNG có `requiredDate`
  //   PSX  có `requiredDate` + `congDoan` (điều hành sản xuất), KHÔNG có `bomStatus`
  // Ghi lại vì đọc tên tab thì rất dễ đoán ngược.
  it("PTK theo dõi BOM, PSX theo dõi deadline và công đoạn", () => {
    expect(idsOf("pre-production")).toContain("bomStatus");
    expect(idsOf("pre-production")).not.toContain("requiredDate");

    expect(idsOf("master-hub")).toContain("requiredDate");
    expect(idsOf("master-hub")).toContain("congDoan");
    expect(idsOf("master-hub")).not.toContain("bomStatus");
  });

  it("mọi tab đang điều hành đều có chấm ưu tiên và trạng thái đơn", () => {
    for (const tab of ["all", "pre-production", "priority", "suspended"] as const) {
      expect(idsOf(tab)).toContain("pri");
      expect(idsOf(tab)).toContain("status");
    }
  });

  // PSX là bộ cột RIÊNG, không phải bản rút gọn của PTK.
  it("tab Phòng Sản Xuất khác hẳn bộ cột Phòng Thiết Kế", () => {
    expect(idsOf("master-hub")).not.toEqual(idsOf("pre-production"));
  });

  // Cột MO#/SO# là thứ định danh dòng — thiếu nó thì không mở được sidebar nào.
  it("MỌI tab đều có cột số hiệu đơn", () => {
    const tabs: OrderTab[] = ["all", "pre-production", "master-hub", "completed", "cancelled"];
    for (const tab of tabs) {
      expect(idsOf(tab)).toContain("orderNumber");
    }
  });

  // Trùng id làm React dựng hai cột cùng khoá — cột sau ghi đè cột trước một cách im lặng.
  it("không tab nào có id cột trùng nhau", () => {
    const tabs: OrderTab[] = ["all", "pre-production", "master-hub", "completed", "cancelled"];
    for (const tab of tabs) {
      const ids = idsOf(tab);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("phanLoaiKhNode — chip Phân loại KH", () => {
  const row = (over: Partial<OrderSummary> = {}) => ({ phanLoaiKh: null, firstItem: null, ...over }) as OrderSummary;

  // 🔴 SR = hàng showroom, đi QUY TRÌNH KHÁC — nó phải nổi bật. Bản cũ dán chuỗi `SR.CH1`
  // cùng màu cùng font với `KH.CH1`, làm giá trị cần chú ý nhất trở nên vô hình.
  it("phanLoaiKh = SR → hiện SR", () => {
    render(<>{phanLoaiKhNode(row({ phanLoaiKh: "SR" }))}</>);
    expect(screen.getByText("SR")).toBeInTheDocument();
  });

  // 🔴 Cờ per-MO: bản PSX cũ BỎ SÓT `firstItem.isShowroom`, nên một MO được đánh dấu Showroom
  // riêng vẫn hiện như hàng thường.
  it("cờ Showroom theo MO → vẫn hiện SR dù phanLoaiKh cấp SO là KH", () => {
    render(<>{phanLoaiKhNode(row({ phanLoaiKh: "KH", firstItem: { isShowroom: true } as never }))}</>);
    expect(screen.getByText("SR")).toBeInTheDocument();
  });

  it("phân loại thường → hiện đúng giá trị, không đổi thành SR", () => {
    render(<>{phanLoaiKhNode(row({ phanLoaiKh: "VIP" }))}</>);
    expect(screen.getByText("VIP")).toBeInTheDocument();
    expect(screen.queryByText("SR")).not.toBeInTheDocument();
  });

  // 🔴 Trả HÀM THUẦN chứ không phải component là CỐ Ý: nơi gọi cần phân biệt "không có gì" để
  // tự quyết hiện "—" hay để trống. Một component luôn trả element, nên `<Chip/> ?? <Dash/>`
  // sẽ KHÔNG bao giờ rơi vào nhánh Dash — bẫy đó rất dễ lọt qua review.
  it("không có phân loại → trả null, KHÔNG trả element rỗng", () => {
    expect(phanLoaiKhNode(row())).toBeNull();
    expect(phanLoaiKhNode(row({ phanLoaiKh: "" }))).toBeNull();
  });
});

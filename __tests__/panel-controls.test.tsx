/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./setup-dom";
import { describe, expect, it, vi } from "vitest";

import {
  PHAN_LOAI_KT_OPTIONS,
  PhanLoaiKtSelect,
  StoneTypeTagDropdown,
} from "@/app/dashboard/orders/_components/panel-controls";

// Hai dropdown chọn-nhiều. Đây là loại component mà `tsc` không nói được gì: nó biên dịch sạch
// kể cả khi dropdown không mở ra, không đóng lại, hay `onChange` gửi sai định dạng.

describe("PhanLoaiKtSelect", () => {
  it("chưa chọn gì → hiện chỗ trống, không hiện 'undefined'", () => {
    render(<PhanLoaiKtSelect value={[]} onChange={vi.fn()} />);
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it("bấm vào → mở danh sách đủ mọi tuỳ chọn", async () => {
    const user = userEvent.setup();
    render(<PhanLoaiKtSelect value={[]} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button"));

    for (const option of PHAN_LOAI_KT_OPTIONS) {
      expect(screen.getByText(option)).toBeInTheDocument();
    }
  });

  it("chọn một mục → onChange nhận MẢNG, không nhận chuỗi", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PhanLoaiKtSelect value={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("TRƠN"));

    expect(onChange).toHaveBeenCalledWith(["TRƠN"]);
  });

  // Chọn-NHIỀU: bấm mục thứ hai phải CỘNG THÊM, không thay thế. Thay thế là biến nó thành
  // chọn-một mà không ai báo lỗi.
  it("chọn mục thứ hai → CỘNG THÊM vào lựa chọn cũ", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PhanLoaiKtSelect value={["TRƠN"]} onChange={onChange} />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("LAB"));

    expect(onChange).toHaveBeenCalledWith(["TRƠN", "LAB"]);
  });

  it("bấm lại mục ĐANG chọn → bỏ chọn", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PhanLoaiKtSelect value={["TRƠN", "LAB"]} onChange={onChange} />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("TRƠN"));

    expect(onChange).toHaveBeenCalledWith(["LAB"]);
  });

  // 🔴 Lớp lỗi tsc không thấy: ô bị khoá nhưng vẫn mở được danh sách, và người dùng sửa được
  // một thứ giao diện đang nói là không sửa được.
  it("disabled → bấm KHÔNG mở danh sách", async () => {
    const user = userEvent.setup();
    render(<PhanLoaiKtSelect value={[]} onChange={vi.fn()} disabled />);

    await user.click(screen.getByRole("button"));

    expect(screen.queryByText("TRƠN")).not.toBeInTheDocument();
  });
});

describe("StoneTypeTagDropdown", () => {
  const OPTIONS = ["XOÀN", "CZ", "ĐÁ MÀU"] as const;

  // ⚠️ PHÁT HIỆN KHI VIẾT TEST NÀY: ô kích hoạt là một `div` có `onClick` — KHÔNG có
  // `role="button"`, không `tabIndex`, không xử lý phím. Trình đọc màn hình không thấy nó là
  // điều khiển, và người dùng bàn phím không mở được.
  //
  // Test dưới đây bấm vào nhãn bên trong (sự kiện nổi lên div) thay vì `getByRole("button")` —
  // và chính chỗ phải lách đó là bằng chứng của khoảng trống. Sửa a11y là đổi HÀNH VI nên
  // không làm trong branch dựng lưới; ghi lại ở đây để không ai phải phát hiện lại.
  const openDropdown = () => screen.getByText("-- Chọn --");

  it("chưa chọn gì → hiện chỗ trống", () => {
    render(
      <StoneTypeTagDropdown value="" disabled={false} options={OPTIONS} onChange={vi.fn()} />,
    );
    expect(screen.getByText("-- Chọn --")).toBeInTheDocument();
  });

  it("bấm vào → mở đủ mọi tuỳ chọn", async () => {
    const user = userEvent.setup();
    render(
      <StoneTypeTagDropdown value="" disabled={false} options={OPTIONS} onChange={vi.fn()} />,
    );
    await user.click(openDropdown());
    for (const option of OPTIONS) {
      expect(screen.getByText(option)).toBeInTheDocument();
    }
  });

  // Cột lưu CSV, không lưu mảng. Trả sai kiểu là ghi "XOÀN,CZ" thành "[object Object]".
  it("chọn một mục → onChange trả CHUỖI, không trả mảng", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StoneTypeTagDropdown value="" disabled={false} options={OPTIONS} onChange={onChange} />,
    );

    await user.click(openDropdown());
    await user.click(screen.getByText("CZ"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(typeof onChange.mock.calls[0][0]).toBe("string");
  });

  it("disabled → bấm KHÔNG mở danh sách", async () => {
    const user = userEvent.setup();
    render(
      <StoneTypeTagDropdown value="" disabled options={OPTIONS} onChange={vi.fn()} />,
    );
    await user.click(openDropdown());
    expect(screen.queryByText("CZ")).not.toBeInTheDocument();
  });

  // Giá trị lưu là CSV; ô phải tách ra thành từng chip đọc được, không hiện nguyên chuỗi thô.
  it("giá trị CSV → tách thành từng chip", () => {
    render(
      <StoneTypeTagDropdown value="XOÀN, CZ" disabled={false} options={OPTIONS} onChange={vi.fn()} />,
    );
    expect(screen.getByText("XOÀN")).toBeInTheDocument();
    expect(screen.getByText("CZ")).toBeInTheDocument();
    expect(screen.queryByText("XOÀN, CZ")).not.toBeInTheDocument();
  });
});

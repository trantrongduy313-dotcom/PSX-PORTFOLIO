/** @vitest-environment jsdom */
import "./setup-dom";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DocLink, DocTile, Note, PanelRow, PanelSection, Stat, StatGroup, StatusChip,
  fmtHours, numCell,
} from "@/app/dashboard/design-3d/_components/design-3d-atoms";

// Chín mảnh dựng vừa tách khỏi design-3d-client.tsx (3.097 dòng). Phép tách là chuyển nhà,
// nhưng chuyển nhà cũng làm hỏng được — bộ dò comment-density từng bắt hai JSDoc mồ côi sinh
// ra đúng theo cách này. Đây là nơi thấy nếu có gì hỏng.

describe("fmtHours", () => {
  it("đủ giờ và phút → nói cả hai", () => {
    expect(fmtHours(150)).toBe("2 giờ 30 phút");
  });

  it("tròn giờ → không kèm '0 phút'", () => {
    expect(fmtHours(120)).toBe("2 giờ");
  });

  it("dưới một giờ → chỉ nói phút", () => {
    expect(fmtHours(45)).toBe("45 phút");
  });

  // 🔴 Chuỗi rỗng ở ô số giờ trông như dữ liệu chưa nạp. "0 phút" nói rõ là ĐÃ đo và bằng 0.
  it("bằng 0 → '0 phút', không phải chuỗi rỗng", () => {
    expect(fmtHours(0)).toBe("0 phút");
  });
});

describe("StatusChip", () => {
  it("hiện nhãn của badge", () => {
    render(<StatusChip badge={{ label: "Đang làm", tone: "info" } as never} />);
    expect(screen.getByText("Đang làm")).toBeInTheDocument();
  });

  it("có title → gắn tooltip để đọc lý do đầy đủ", () => {
    render(<StatusChip badge={{ label: "Trễ", tone: "critical" } as never} title="Quá hạn 2 ngày" />);
    expect(screen.getByText("Trễ")).toHaveAttribute("title", "Quá hạn 2 ngày");
  });
});

describe("Stat — ô số bấm được để lọc", () => {
  it("hiện nhãn và giá trị", () => {
    render(<Stat label="Trễ hạn" value={7} />);
    expect(screen.getByText("Trễ hạn")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("có onClick → bấm được và gọi đúng một lần", async () => {
    const onClick = vi.fn();
    render(<Stat label="Trễ hạn" value={7} onClick={onClick} />);

    await userEvent.setup({ delay: null }).click(screen.getByText("7"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // Không có onClick thì nó chỉ là con số — dựng nút giả làm người dùng bấm vào chỗ chết.
  it("không có onClick → không dựng nút", () => {
    render(<Stat label="Trễ hạn" value={7} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("DocLink / DocTile", () => {
  it("mở tab mới và chặn tab-nabbing", () => {
    render(<DocLink caption="File 3D" url="https://drive.google.com/x" icon={<i />} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    // Thiếu `noopener` là trang đích với được vào `window.opener` của tab này.
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  // 🔴 `DocTile` CÓ chốt chặn này, `DocLink` thì KHÔNG (url là string bắt buộc, url rỗng vẫn
  // dựng <a href="">). Ghi lại chênh lệch, không sửa: đổi là đổi hành vi, và mọi chỗ gọi
  // DocLink hiện đều truyền url thật.
  // ⚠️ Hỏi bằng `queryByRole("link")` là XANH SAI LÝ DO: một `<a>` KHÔNG có href thì ARIA
  // không coi là link, nên câu hỏi đó luôn trả null dù chốt chặn còn hay mất. Phát hiện bằng
  // cách vô hiệu hoá chốt chặn và thấy test vẫn xanh. Phải hỏi thẳng thẻ <a>.
  it("DocTile không có link → KHÔNG dựng thẻ <a> nào", () => {
    const { container } = render(<DocTile caption="Render" driveUrl={null}><span>ảnh</span></DocTile>);
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("Render")).toBeInTheDocument();
  });

  it("DocTile có link → dựng link kèm nhãn cho trình đọc màn hình", () => {
    render(<DocTile caption="Render" driveUrl="https://drive.google.com/y"><span>ảnh</span></DocTile>);
    expect(screen.getByRole("link", { name: /Mở Render/ })).toBeInTheDocument();
  });
});

describe("PanelSection / PanelRow / StatGroup / Note", () => {
  it("PanelSection hiện tiêu đề và nội dung bên trong", () => {
    render(<PanelSection title="Thông tin lượt"><p>nội dung</p></PanelSection>);
    expect(screen.getByText("Thông tin lượt")).toBeInTheDocument();
    expect(screen.getByText("nội dung")).toBeInTheDocument();
  });

  it("PanelRow hiện nhãn và giá trị", () => {
    render(<PanelRow label="Nhóm KPI" value="Nhẫn trơn" />);
    expect(screen.getByText("Nhóm KPI")).toBeInTheDocument();
    expect(screen.getByText("Nhẫn trơn")).toBeInTheDocument();
  });

  it("StatGroup hiện chú thích", () => {
    render(<StatGroup caption="Tháng này"><span>x</span></StatGroup>);
    expect(screen.getByText("Tháng này")).toBeInTheDocument();
  });

  it("Note hiện nội dung", () => {
    render(<Note>Ghi chú</Note>);
    expect(screen.getByText("Ghi chú")).toBeInTheDocument();
  });
});

describe("numCell", () => {
  // Cột số không thẳng hàng thì mắt không so được hai dòng cạnh nhau.
  it("dùng chữ số cùng bề rộng", () => {
    expect(numCell.fontVariantNumeric).toBe("tabular-nums");
  });
});

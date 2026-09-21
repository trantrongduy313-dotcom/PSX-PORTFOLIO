/** @vitest-environment jsdom */
import "./setup-dom";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Banner,
  EditBadge,
  Field,
  ReadOnlyCtx,
  SectionLabel,
  SummaryBadge,
  inputCls,
} from "@/app/dashboard/orders/_components/panel-atoms";

// Bộ test RENDER đầu tiên của repo. Trước đây 2.757 test đều là hàm thuần, nên không gì bắt được
// "ô biến mất với vai này" hay "nút không bấm được" — hai lớp lỗi đã xảy ra thật ở panel.
//
// Bắt đầu từ panel-atoms vì nó vừa được tách ra: nếu phép tách làm hỏng gì, đây là nơi thấy.

describe("SectionLabel — huy hiệu 'sửa được' theo ngữ cảnh chỉ-đọc", () => {
  it("panel ĐANG SỬA ĐƯỢC + mục editable → hiện huy hiệu", () => {
    render(
      <ReadOnlyCtx.Provider value={false}>
        <SectionLabel editable>Thông tin khách hàng</SectionLabel>
      </ReadOnlyCtx.Provider>,
    );
    expect(screen.getByText("Thông tin khách hàng")).toBeInTheDocument();
    expect(screen.getByText(/sửa/i)).toBeInTheDocument();
  });

  // 🔴 Đây là lớp lỗi tsc không bao giờ bắt được: một cờ ngữ cảnh sai làm huy hiệu hứa hẹn một
  // quyền mà vai đó không có.
  it("panel CHỈ-ĐỌC → KHÔNG hiện huy hiệu, dù mục khai là editable", () => {
    render(
      <ReadOnlyCtx.Provider value={true}>
        <SectionLabel editable>Thông tin khách hàng</SectionLabel>
      </ReadOnlyCtx.Provider>,
    );
    expect(screen.getByText("Thông tin khách hàng")).toBeInTheDocument();
    expect(screen.queryByText(/sửa/i)).not.toBeInTheDocument();
  });

  it("mục KHÔNG khai editable → không hiện huy hiệu dù panel sửa được", () => {
    render(
      <ReadOnlyCtx.Provider value={false}>
        <SectionLabel>Chỉ để đọc</SectionLabel>
      </ReadOnlyCtx.Provider>,
    );
    expect(screen.queryByText(/sửa/i)).not.toBeInTheDocument();
  });

  // Không có Provider thì mặc định phải là SỬA ĐƯỢC — đúng hành vi cũ khi context còn nằm trong
  // panel. Mặc định ngược lại sẽ khoá im lặng mọi màn quên bọc Provider.
  it("không có Provider → mặc định sửa được", () => {
    render(<SectionLabel editable>Mặc định</SectionLabel>);
    expect(screen.getByText(/sửa/i)).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("nhãn gắn với ô nhập bên trong", () => {
    render(
      <Field label="Mã số mẫu">
        <input aria-label="Mã số mẫu" />
      </Field>,
    );
    expect(screen.getByText("Mã số mẫu")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("required → hiện dấu sao", () => {
    render(<Field label="Bắt buộc" required><input /></Field>);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("không required → KHÔNG có dấu sao", () => {
    render(<Field label="Tuỳ chọn"><input /></Field>);
    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });
});

describe("SummaryBadge — chip trạng thái", () => {
  // Nhãn "—" nghĩa là "chưa có gì". Dựng một chip rỗng vẫn là dựng một hình khối, và mắt sẽ dừng
  // lại ở nó chỉ để đọc ra rằng không có gì.
  it('nhãn "—" → KHÔNG dựng chip', () => {
    const { container } = render(<SummaryBadge badge={{ label: "—", tone: "neutral" } as never} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("badge null → không dựng gì", () => {
    const { container } = render(<SummaryBadge badge={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nhãn rỗng → không dựng gì", () => {
    const { container } = render(<SummaryBadge badge={{ label: "", tone: "neutral" } as never} />);
    expect(container).toBeEmptyDOMElement();
  });

  // `shrink-0` + `ml-auto` là thứ giữ cho phán quyết KHÔNG bị `truncate` cắt — phần bị cắt phải
  // là tên người. Mất hai class này là mất đúng bài học đó.
  it("có nhãn → dựng chip, neo phải và KHÔNG co lại", () => {
    render(<SummaryBadge badge={{ label: "Đã duyệt", tone: "green" } as never} />);
    const chip = screen.getByText("Đã duyệt");
    expect(chip).toHaveClass("shrink-0");
    expect(chip).toHaveClass("ml-auto");
  });
});

describe("Banner", () => {
  it("hiện nội dung kèm biểu tượng cảnh báo", () => {
    render(<Banner variant="red">Đơn đang trong sản xuất</Banner>);
    expect(screen.getByText("Đơn đang trong sản xuất")).toBeInTheDocument();
  });
});

describe("EditBadge / inputCls", () => {
  it("EditBadge lấy nhãn từ i18n, không hardcode chuỗi", () => {
    render(<EditBadge />);
    expect(screen.getByText(/sửa/i)).toBeInTheDocument();
  });

  it("inputCls: disabled thêm con trỏ chặn, không disabled thì không", () => {
    expect(inputCls(true)).toContain("cursor-not-allowed");
    expect(inputCls(false)).not.toContain("cursor-not-allowed");
    expect(inputCls()).not.toContain("cursor-not-allowed");
  });
});

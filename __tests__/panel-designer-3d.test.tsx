/** @vitest-environment jsdom */
import "./setup-dom";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PausedBanner } from "@/app/dashboard/orders/_components/panel-designer-3d";
import { pauseStateOf } from "@/app/lib/business/kpi-3d/pause-view";

// Khối "Nhân viên Thiết kế 3D" vừa được tách khỏi order-detail-panel.tsx. Test này canh phần
// dựng được độc lập của nó — `PausedBanner`.
//
// Dựng trạng thái qua `pauseStateOf` thay vì tự bịa object: nếu hình dữ liệu đổi, test đổi theo
// mà không phải sửa tay, và nó kiểm luôn rằng hai bên vẫn khớp nhau.

const pausedAt = "2026-08-20T02:00:00.000Z";

const state = (over: Record<string, unknown> = {}) =>
  pauseStateOf([
    {
      pausedAt,
      resumedAt: null,
      reason: "Chờ khách xác nhận mẫu",
      confirmedMinutes: 240,
      kpiMonth: "2026-08",
      ...over,
    },
  ] as never);

describe("PausedBanner", () => {
  it("hiện nhãn Tạm dừng kèm mốc bắt đầu", () => {
    render(<PausedBanner pause={state()} standardHours="8" />);
    expect(screen.getByText("Tạm dừng")).toBeInTheDocument();
    expect(screen.getByText(/từ /)).toBeInTheDocument();
  });

  it("có số giờ đã chốt → hiện kèm ngân sách và tháng KPI", () => {
    render(<PausedBanner pause={state()} standardHours="8" />);
    expect(screen.getByText(/đã chốt/)).toBeInTheDocument();
    expect(screen.getByText(/KPI/)).toBeInTheDocument();
  });

  // 🔴 "Chưa chốt" là BẤT THƯỜNG: server luôn tự đo khi ô để trống, nên gặp null nghĩa là dữ liệu
  // cũ hoặc có gì sai. Nó phải LÊN TIẾNG, không được trông giống trạng thái bình thường.
  it("chưa chốt số giờ → nói ra, không im lặng bỏ qua", () => {
    render(<PausedBanner pause={state({ confirmedMinutes: null })} standardHours="8" />);
    expect(screen.getByText(/chưa chốt số giờ/)).toBeInTheDocument();
  });

  it("có lý do → hiện lý do", () => {
    render(<PausedBanner pause={state()} standardHours="8" />);
    expect(screen.getByText("Chờ khách xác nhận mẫu")).toBeInTheDocument();
  });

  // Không có lý do thì KHÔNG dựng dòng rỗng — một dòng trống vẫn chiếm chỗ và mắt vẫn dừng lại.
  it("không có lý do → không dựng dòng lý do", () => {
    render(<PausedBanner pause={state({ reason: null })} standardHours="8" />);
    expect(screen.queryByText("Chờ khách xác nhận mẫu")).not.toBeInTheDocument();
  });

  it("standardHours rỗng → vẫn dựng được, không hiện dấu gạch chéo trống", () => {
    render(<PausedBanner pause={state()} standardHours="" />);
    expect(screen.getByText("Tạm dừng")).toBeInTheDocument();
    expect(screen.queryByText(/\/\s*giờ/)).not.toBeInTheDocument();
  });
});

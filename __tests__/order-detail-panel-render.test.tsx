/** @vitest-environment jsdom */
import "./setup-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { OrderDetailPanel } from "@/app/dashboard/orders/_components/order-detail-panel";

// Panel la file lon nhat cua repo va chua tung co mot test nao DUNG no len. Bon buoc refactor
// vua roi cat 26% so dong; tsc bat sai kieu, eslint bat rac, nhung khong cai nao tra loi duoc
// cau "no con mo ra duoc khong".
//
// Test nay chi tra loi dung cau do. No KHONG thay cho viec bam thu tren app that.

vi.mock("@/app/lib/api/order-panel", () => ({
  fetchOrderDetail: vi.fn(async () => order),
  patchOrder: vi.fn(), patchItem: vi.fn(), patchProduction: vi.fn(),
  patchItemStatus: vi.fn(), promoteOrderApi: vi.fn(),
  rollbackOrderApi: vi.fn(), resolveActionApi: vi.fn(),
}));

const item = {
  id: "mo-a",
  moNumber: "26.36938",
  zone: "PRE_PRODUCTION",
  itemStatus: null,
  productName: "Nhan kim cuong",
  quantity: 1,
  specifications: {},
  techClassification: [],
  design3DAssignments: [],
};

const order = {
  id: "so-1",
  orderNumber: "26.10905",
  status: "IN_DESIGN",
  zone: "PRE_PRODUCTION",
  customerName: "Khach le",
  isSuspended: false,
  version: 1,
  items: [item],
  alerts: [],
  workflowHistory: [],
  referenceUrls: [],
  productionDetail: null,
  finalTotal: null,
  currency: "VND",
  designBriefUrl: null,
  productionNote: null,
  _count: { versions: 0 },
} as never;

function renderPanel(props: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["order-panel", "so-1"], order);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const onClose = vi.fn();
  const view = render(
    <OrderDetailPanel orderId="so-1" onClose={onClose} currentUserRole="ADMIN" {...props} />,
    { wrapper },
  );
  return { ...view, onClose };
}

describe("OrderDetailPanel — dung len duoc", () => {
  it("co orderId → dung panel va hien so hieu MO", () => {
    renderPanel();
    expect(screen.getAllByText(/26\.36938/).length).toBeGreaterThan(0);
  });

  it("hien ten khach hang", () => {
    renderPanel();
    expect(screen.getByText(/Khach le/)).toBeInTheDocument();
  });

  // Panel dung `switch` vet can cho nhieu union. Mot nhanh thieu se nem luc dung, khong phai
  // luc bien dich — nen "khong nem" o day la mot khang dinh that.
  it("dung xong khong co loi React nao thoat ra console", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderPanel();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // Panel van dung khung (de co hieu ung truot), nhung KHONG duoc hien du lieu cua don cu.
  it("orderId = null → khong hien du lieu don nao", () => {
    renderPanel({ orderId: null });
    expect(screen.queryByText(/26\.36938/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Khach le/)).not.toBeInTheDocument();
  });

  // Vai chi-doc phai dung duoc panel. Truoc day day la mot lop loi khong ai bat duoc:
  // tsc bien dich sach ca khi mot o bien mat voi vai nay.
  it("vai chi-doc → van dung duoc panel", () => {
    renderPanel({ readOnly: true, currentUserRole: "SALES" });
    expect(screen.getAllByText(/26\.36938/).length).toBeGreaterThan(0);
  });
});

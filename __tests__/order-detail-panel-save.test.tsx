/** @vitest-environment jsdom */
import "./setup-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { OrderDetailPanel } from "@/app/dashboard/orders/_components/order-detail-panel";

// Panel la cay React lon; duoi tai ca bo test, 5s mac dinh khong du.
const SLOW = 20_000;

// `saveMutation` la mutation nguoi dung bam NHIEU NHAT trong ngay, dai nhat trong panel, va la
// mot trong hai cho cuoi cung con closure `(old: any)`. No chua tung co test nao.
//
// Test nay KHONG sua gi trong panel — no chi dung luoi truoc, de neu sau nay tach mutation ra
// thi co cai ma so sanh.

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
    promise: vi.fn((p: Promise<unknown>) => p), dismiss: vi.fn(),
  }),
}));

type PatchOrder = (id: string, body: Record<string, unknown>) => Promise<unknown>;

// API treo lai duoc: chi khi no CHUA tra ve moi phan biet duoc phep va LAC QUAN voi phep va
// trong `onSuccess`.
let settleApi: (ok: boolean) => void = () => {};
const patchOrder = vi.fn<PatchOrder>(
  () => new Promise((resolve, reject) => {
    settleApi = (ok) => (ok ? resolve(savedOrder()) : reject(new Error("mat mang")));
  }),
);

vi.mock("@/app/lib/api/order-panel", () => ({
  fetchOrderDetail: vi.fn(async () => order()),
  patchOrder: (id: string, body: Record<string, unknown>) => patchOrder(id, body),
  patchItem: vi.fn(async () => undefined), patchProduction: vi.fn(),
  patchItemStatus: vi.fn(), rollbackOrderApi: vi.fn(),
  resolveActionApi: vi.fn(), promoteOrderApi: vi.fn(),
}));

const LINK = "https://zalo.me/moi";
const LIST_KEY = ["orders", "page-1"];

const savedOrder = () => ({ ...(order() as object), linkChat: LINK });

const order = () => ({
  id: "so-1", orderNumber: "26.10905", status: "IN_DESIGN", zone: "PRE_PRODUCTION",
  customerName: "Khach le", isSuspended: false, version: 1, linkChat: null,
  items: [{
    id: "mo-a", moNumber: "26.36938", zone: "PRE_PRODUCTION", itemStatus: null,
    productName: "Nhan kim cuong", quantity: 1, specifications: {},
    techClassification: [], design3DAssignments: [],
  }],
  alerts: [], workflowHistory: [], referenceUrls: [], productionDetail: null,
  finalTotal: null, currency: "VND", designBriefUrl: null, productionNote: null,
  _count: { versions: 0 },
}) as never;

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["order-panel", "so-1"], order());
  // `allItems` la bat buoc: panel co mot cho lam `(order.allItems ?? o.allItems).map(...)`,
  // se nem neu CA HAI cung khong co. Ngoai doi API danh sach luon tra truong nay, nen day la
  // fixture phai giong that — khong phai loi de sua trong code.
  queryClient.setQueryData(LIST_KEY, {
    data: [{ id: "so-1", linkChat: null, allItems: [{ itemId: "mo-a", moNumber: "26.36938" }] }],
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <OrderDetailPanel orderId="so-1" activeItemId="mo-a" onClose={vi.fn()} currentUserRole="ADMIN" />,
    { wrapper },
  );

  const listRow = () => (queryClient.getQueryData(LIST_KEY) as { data: { linkChat: unknown }[] }).data[0];
  return { listRow };
}

async function editAndSave() {
  const user = userEvent.setup({ delay: null });
  await user.type(await screen.findByPlaceholderText(/zalo\.me/i), LINK);
  await user.click(await screen.findByRole("button", { name: /Lưu thay đổi/i }));
}

describe("Luu don (saveMutation)", () => {
  // 🔴 Ly do phep va lac quan ton tai: bang phai doi NGAY, khong doi vong API ~250ms tu Mumbai.
  it("bam Luu → bang doi NGAY, chua doi API tra ve", async () => {
    const { listRow } = setup();

    await editAndSave();

    await waitFor(() => {
      expect(listRow().linkChat).toBe(LINK);
    });
    settleApi(true);
  }, SLOW);

  // 🔴 Day la nua con lai cua phep va lac quan, va la nua chua tung duoc kiem: LUU HONG thi
  // bang phai TRA VE nhu cu. Khong tra ve thi giao dien noi mot dieu da khong xay ra — te hon
  // han viec khong va gi ca.
  it("API loi → bang khoi phuc ve gia tri truoc khi bam", async () => {
    const { listRow } = setup();

    await editAndSave();
    await waitFor(() => {
      expect(listRow().linkChat).toBe(LINK);
    });

    settleApi(false);

    await waitFor(() => {
      expect(listRow().linkChat).toBeNull();
    });
  }, SLOW);

  it("gui dung don va dung gia tri len server", async () => {
    setup();
    patchOrder.mockClear();

    await editAndSave();

    await waitFor(() => {
      expect(patchOrder).toHaveBeenCalled();
    });
    expect(patchOrder.mock.calls[0][0]).toBe("so-1");
    expect(patchOrder.mock.calls[0][1]).toMatchObject({ linkChat: LINK });
    settleApi(true);
  }, SLOW);
});

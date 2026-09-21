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

// Nua con lai cua cap luu: `mhSaveMutation` — nut Luu ben PSX. Cung khuon voi saveMutation
// nhung di qua `patchProduction` va co them mot buoc doc lai don sau khi luu.
//
// Cap doi nay dung chung khuon nen phai co luoi CA HAI truoc khi dong vao mot cai: sua mot
// ma khong co gi so sanh voi cai kia la cach de hai ban le nhau ma khong ai biet.

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
    promise: vi.fn((p: Promise<unknown>) => p), dismiss: vi.fn(),
  }),
}));

type PatchProduction = (id: string, body: Record<string, unknown>) => Promise<unknown>;

let settleApi: (ok: boolean) => void = () => {};
const patchProduction = vi.fn<PatchProduction>(
  () => new Promise((resolve, reject) => {
    settleApi = (ok) => (ok ? resolve(savedOrder()) : reject(new Error("mat mang")));
  }),
);

vi.mock("@/app/lib/api/order-panel", () => ({
  fetchOrderDetail: vi.fn(async () => savedOrder()),
  patchProduction: (id: string, body: Record<string, unknown>) => patchProduction(id, body),
  patchOrder: vi.fn(), patchItem: vi.fn(async () => undefined),
  patchItemStatus: vi.fn(), rollbackOrderApi: vi.fn(),
  resolveActionApi: vi.fn(), promoteOrderApi: vi.fn(),
}));

const LINK = "https://zalo.me/psx";
const LIST_KEY = ["orders", "page-1"];

const order = () => ({
  id: "so-1", orderNumber: "26.10905", status: "IN_PRODUCTION", zone: "MASTER_HUB",
  customerName: "Khach le", isSuspended: false, version: 1, linkChat: null,
  items: [{
    id: "mo-a", moNumber: "26.36938", zone: "MASTER_HUB", itemStatus: "IN_PRODUCTION",
    productName: "Nhan kim cuong", quantity: 1, specifications: {},
    techClassification: [], design3DAssignments: [],
  }],
  alerts: [], workflowHistory: [], referenceUrls: [], productionDetail: null,
  finalTotal: null, currency: "VND", designBriefUrl: null, productionNote: null,
  _count: { versions: 0 },
}) as never;

const savedOrder = () => ({ ...(order() as object), linkChat: LINK });

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["order-panel", "so-1"], order());
  queryClient.setQueryData(LIST_KEY, {
    data: [{
      id: "so-1", linkChat: null,
      allItems: [{ itemId: "mo-a", moNumber: "26.36938", itemStatus: "IN_PRODUCTION" }],
    }],
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <OrderDetailPanel orderId="so-1" activeItemId="mo-a" onClose={vi.fn()} currentUserRole="ADMIN" />,
    { wrapper },
  );

  const listRow = () =>
    (queryClient.getQueryData(LIST_KEY) as { data: { linkChat: unknown }[] }).data[0];
  return { listRow };
}

async function editAndSave() {
  const user = userEvent.setup({ delay: null });
  await user.type(await screen.findByPlaceholderText(/zalo\.me/i), LINK);
  await user.click(await screen.findByRole("button", { name: /Lưu thay đổi/i }));
}

describe("Luu don ben PSX (mhSaveMutation)", () => {
  it("bam Luu → bang doi NGAY, chua doi API tra ve", async () => {
    const { listRow } = setup();

    await editAndSave();

    await waitFor(() => {
      expect(listRow().linkChat).toBe(LINK);
    });
    settleApi(true);
  }, SLOW);

  // 🔴 Nua chua tung duoc kiem, giong het ben PTK: luu hong thi bang phai TRA VE nhu cu.
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

  it("di qua patchProduction (khong phai patchOrder) va gui dung don", async () => {
    setup();
    patchProduction.mockClear();

    await editAndSave();

    await waitFor(() => {
      expect(patchProduction).toHaveBeenCalled();
    });
    expect(patchProduction.mock.calls[0][0]).toBe("so-1");
    settleApi(true);
  }, SLOW);
});

/** @vitest-environment jsdom */
import "./setup-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// Panel la cay React lon; duoi tai cua ca bo test, 5s mac dinh khong du.
const SLOW = 20_000;

import { OrderDetailPanel } from "@/app/dashboard/orders/_components/order-detail-panel";
import { LABELS } from "@/app/lib/i18n/labels";
import { buildSnapshotQuery } from "@/app/lib/utils/snapshot-keys";

// Day la lop cuoi cung con chua kiem duoc: HANDLER. Cac phep va snapshot cua handlePromote
// khong nam trong mutation nen test mutation khong cham toi, va chung la thu chi thay khi BAM.
//
// Test nay bam that: mo panel -> Chuyen xuong -> Xac nhan, roi doc lai cache snapshot.

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
    promise: vi.fn((p: Promise<unknown>) => p), dismiss: vi.fn(),
  }),
}));

vi.mock("@/app/lib/api/order-panel", () => ({
  fetchOrderDetail: vi.fn(async () => orderOf()),
  patchOrder: vi.fn(), patchItem: vi.fn(), patchProduction: vi.fn(),
  patchItemStatus: vi.fn(), rollbackOrderApi: vi.fn(), resolveActionApi: vi.fn(),
  promoteOrderApi: vi.fn(async () => ({ id: "so-1", status: "IN_PRODUCTION", version: 2 })),
}));

const L = LABELS.vi.ui.panel;
const PTK_KEY = ["orders-snapshot", buildSnapshotQuery("pre-production")];

const mo = (id: string, moNumber: string) => ({
  id, moNumber, zone: "PRE_PRODUCTION", itemStatus: null,
  productName: "Nhan kim cuong", quantity: 1, specifications: {},
  techClassification: [], design3DAssignments: [],
});

const orderOf = (items = [mo("mo-a", "26.36938"), mo("mo-b", "26.36939")]) => ({
  id: "so-1", orderNumber: "26.10905", status: "DESIGN_APPROVED",
  zone: "PRE_PRODUCTION", customerName: "Khach le", isSuspended: false,
  version: 1, items, alerts: [], workflowHistory: [], referenceUrls: [],
  productionDetail: null, finalTotal: null, currency: "VND",
  designBriefUrl: null, productionNote: null, _count: { versions: 0 },
}) as never;

const snapshotRow = (...itemIds: string[]) => ({
  id: "so-1",
  allItems: itemIds.map((itemId) => ({
    itemId, moNumber: itemId === "mo-a" ? "26.36938" : "26.36939", zone: "PRE_PRODUCTION",
  })),
  firstItem: { itemId: itemIds[0] },
});

function setup(opts: { activeItemId?: string | null; items?: ReturnType<typeof mo>[] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const order = orderOf(opts.items);
  queryClient.setQueryData(["order-panel", "so-1"], order);
  queryClient.setQueryData(PTK_KEY, {
    data: [snapshotRow(...(opts.items ?? [mo("mo-a", ""), mo("mo-b", "")]).map((i) => i.id))],
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  render(
    <OrderDetailPanel
      orderId="so-1"
      activeItemId={opts.activeItemId ?? null}
      onClose={vi.fn()}
      currentUserRole="ADMIN"
    />,
    { wrapper },
  );

  const ptk = () => queryClient.getQueryData(PTK_KEY) as { data: { allItems?: unknown[] }[] };
  return { ptk };
}

async function clickPromote() {
  const user = userEvent.setup({ delay: null });
  await user.click(await screen.findByRole("button", { name: new RegExp(L.promoteBtn, "i") }));
  await user.click(await screen.findByRole("button", { name: new RegExp(L.confirmPromote, "i") }));
}

describe("handlePromote — phep va snapshot khi bam that", () => {
  // 🔴 SO con MO khac o PTK thi DONG PHAI O LAI, chi mat dung MO vua chuyen. Go ca dong la
  // lam bien mat nhung MO chua chuyen di dau ca.
  it("chuyen MOT MO, SO con MO khac → dong o lai PTK, chi mat MO do", async () => {
    const { ptk } = setup({ activeItemId: "mo-a" });

    await clickPromote();

    await waitFor(() => {
      expect(ptk().data).toHaveLength(1);
    });
    expect(ptk().data[0].allItems).toHaveLength(1);
  }, SLOW);

  it("chuyen MO cuoi cung cua SO → ca dong roi PTK", async () => {
    const { ptk } = setup({ activeItemId: "mo-a", items: [mo("mo-a", "26.36938")] });

    await clickPromote();

    await waitFor(() => {
      expect(ptk().data).toHaveLength(0);
    });
  }, SLOW);

  // Khong chi dinh MO nao = chuyen CA DON.
  it("chuyen ca don → ca dong roi PTK ngay", async () => {
    const { ptk } = setup({ activeItemId: null });

    await clickPromote();

    await waitFor(() => {
      expect(ptk().data).toHaveLength(0);
    });
  }, SLOW);
});

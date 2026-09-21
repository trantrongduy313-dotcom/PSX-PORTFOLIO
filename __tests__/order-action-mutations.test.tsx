/** @vitest-environment jsdom */
import "./setup-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOrderActionMutations } from "@/app/dashboard/orders/_components/use-order-action-mutations";

// Cac phep va cache lac quan chi chay khi mutation THUC SU chay. Test ham thuan
// (orders-list-cache) chung minh phep va dung; test nay chung minh no duoc GOI dung —
// dung variables nao, dung cache nao, va onOrderUpdated nhan dung co.
vi.mock("@/app/lib/api/order-panel", () => ({
  patchItem: vi.fn(async () => undefined),
  patchItemStatus: vi.fn(async () => undefined),
  promoteOrderApi: vi.fn(async () => ({ id: "so-1", status: "IN_PRODUCTION", isSuspended: false })),
  resolveActionApi: vi.fn(async () => ({ id: "so-1", status: "IN_PRODUCTION", isSuspended: false })),
  rollbackOrderApi: vi.fn(async () => ({ id: "so-1", status: "IN_DESIGN", isSuspended: false })),
}));

import { patchItem, patchItemStatus, rollbackOrderApi } from "@/app/lib/api/order-panel";

const LIST_KEY = ["orders", "page-1"];

const seedRow = () => ({
  id: "so-1",
  status: "IN_DESIGN",
  isSuspended: false,
  allItems: [
    { itemId: "mo-a", itemStatus: "IN_DESIGN" },
    { itemId: "mo-b", itemStatus: "IN_DESIGN" },
  ],
});

const orderDetail = {
  id: "so-1",
  items: [{ id: "mo-a", specifications: { ghiChu: "giu lai" } }],
} as never;

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  queryClient.setQueryData(LIST_KEY, { data: [seedRow()] });

  const onOrderUpdated = vi.fn();
  const patchAllLists = (patch: (cache: unknown) => unknown) =>
    queryClient.setQueriesData({ queryKey: ["orders"], exact: false }, patch);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const { result } = renderHook(
    () => useOrderActionMutations({ order: orderDetail, patchAllLists, onOrderUpdated }),
    { wrapper },
  );

  const list = () => queryClient.getQueryData(LIST_KEY) as { data: ReturnType<typeof seedRow>[] };
  return { result, list, onOrderUpdated };
}

beforeEach(() => vi.clearAllMocks());

describe("itemStatusMutation", () => {
  it("tam ngung mot MO → cache doi ngay, MO anh em giu nguyen", async () => {
    const { result, list } = setup();

    await result.current.itemStatusMutation.mutateAsync({
      itemId: "mo-a", itemStatus: "SUSPENDED", capturedOrderId: "so-1",
    });

    await waitFor(() => {
      expect(list().data[0].allItems[0].itemStatus).toBe("SUSPENDED");
    });
    expect(list().data[0].allItems[1].itemStatus).toBe("IN_DESIGN");
    expect(list().data[0].status).toBe("SUSPENDED");
    expect(list().data[0].isSuspended).toBe(true);
  });

  // 🔴 Mot MO hoan tat KHONG duoc keo ca SO sang COMPLETED.
  it("hoan tat mot MO → KHONG doi trang thai cap SO", async () => {
    const { result, list } = setup();

    await result.current.itemStatusMutation.mutateAsync({
      itemId: "mo-a", itemStatus: "COMPLETED", capturedOrderId: "so-1",
    });

    await waitFor(() => {
      expect(list().data[0].allItems[0].itemStatus).toBe("COMPLETED");
    });
    expect(list().data[0].status).toBe("IN_DESIGN");
    expect(list().data[0].isSuspended).toBe(false);
  });

  it("ly do huy di kem toi server; khong co ly do thi khong gui truong rong", async () => {
    const { result } = setup();

    await result.current.itemStatusMutation.mutateAsync({
      itemId: "mo-a", itemStatus: "CANCELLED", capturedOrderId: "so-1", statusReason: "Khach huy",
    });
    expect(patchItemStatus).toHaveBeenCalledWith("so-1", "mo-a", "CANCELLED", { statusReason: "Khach huy" });

    await result.current.itemStatusMutation.mutateAsync({
      itemId: "mo-b", itemStatus: "IN_PRODUCTION", capturedOrderId: "so-1",
    });
    expect(patchItemStatus).toHaveBeenLastCalledWith("so-1", "mo-b", "IN_PRODUCTION", undefined);
  });

  // Tam ngung / chay lai doi TAP don active cua snapshot nen phai dong bo nen; hanh dong
  // khac thi setQueriesData da du, dong bo them chi lam cham.
  it("chi tam ngung va chay lai moi bao cha dong bo snapshot", async () => {
    const { result, onOrderUpdated } = setup();

    await result.current.itemStatusMutation.mutateAsync({
      itemId: "mo-a", itemStatus: "SUSPENDED", capturedOrderId: "so-1",
    });
    expect(onOrderUpdated).toHaveBeenLastCalledWith({ skipSnapshotInvalidation: false });

    await result.current.itemStatusMutation.mutateAsync({
      itemId: "mo-a", itemStatus: "COMPLETED", capturedOrderId: "so-1",
    });
    expect(onOrderUpdated).toHaveBeenLastCalledWith({ skipSnapshotInvalidation: true });
  });
});

describe("resolveActionMutation", () => {
  it("ghi trang thai SERVER tra ve vao cache, khong doan truoc", async () => {
    const { result, list } = setup();

    await result.current.resolveActionMutation.mutateAsync({ capturedOrderId: "so-1", action: "RESUME" });

    await waitFor(() => {
      expect(list().data[0].status).toBe("IN_PRODUCTION");
    });
    expect(list().data[0].isSuspended).toBe(false);
  });
});

describe("showroomMutation", () => {
  it("them -SR va GIU nguyen specifications cu", async () => {
    const { result } = setup();

    await result.current.showroomMutation.mutateAsync({
      itemId: "mo-a", moNumber: "26.36938", capturedOrderId: "so-1",
    });

    expect(patchItemStatus).toHaveBeenCalledWith("so-1", "mo-a", "IN_PRODUCTION");
    const [, , body] = vi.mocked(patchItem).mock.calls[0];
    expect(body.moNumber).toBe("26.36938-SR");
    expect(body.specifications).toMatchObject({ ghiChu: "giu lai", isShowroom: true });
  });

  it("bam lan hai → van la -SR, khong thanh -SR-SR", async () => {
    const { result } = setup();

    await result.current.showroomMutation.mutateAsync({
      itemId: "mo-a", moNumber: "26.36938-SR", capturedOrderId: "so-1",
    });

    expect(vi.mocked(patchItem).mock.calls[0][2].moNumber).toBe("26.36938-SR");
  });
});

describe("rollbackMutation", () => {
  // 🔴 Loi da sua khi tach hook: rollback truoc day doc `orderId` tu CLOSURE trong khi bon
  // mutation kia dung `variables.capturedOrderId`. Doi don giua luc mutation chay thi no lam
  // moi NHAM panel. Test nay khoa: don duoc goi phai la don DA CHOT luc bam.
  it("dung capturedOrderId cua luc bam, khong doc don dang mo", async () => {
    const { result } = setup();

    await result.current.rollbackMutation.mutateAsync({ capturedOrderId: "so-CU", version: 3 });

    expect(rollbackOrderApi).toHaveBeenCalledWith("so-CU", { version: 3 });
  });
});

describe("isWorking", () => {
  it("khong co hanh dong nao chay → false", () => {
    const { result } = setup();
    expect(result.current.isWorking).toBe(false);
  });
});

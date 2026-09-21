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
import { buildSnapshotQuery } from "@/app/lib/utils/snapshot-keys";

// Ba hanh dong con lai cua PSX. Cung khuon voi test Chuyen xuong: bam that, roi doc lai cache
// snapshot — phan nay nam trong HANDLER nen test mutation khong cham toi.

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
    promise: vi.fn((p: Promise<unknown>) => p), dismiss: vi.fn(),
  }),
}));

const rollbackOrderApi = vi.fn(async () => ({ id: "so-1", status: "IN_DESIGN", version: 2 }));
type PatchItem = (orderId: string, itemId: string, body: Record<string, unknown>) => Promise<void>;
const patchItem = vi.fn<PatchItem>(async () => undefined);

// `patchItemStatus` treo lai duoc: chi khi API CHUA tra ve moi phan biet duoc phep va LAC QUAN
// cua handler voi phep va trong `onSuccess`. Khong treo thi ca hai deu da chay xong, va test
// xanh ma khong chung minh duoc dieu no noi.
let releaseApi: () => void = () => {};
const patchItemStatus = vi.fn(() => new Promise<void>((resolve) => { releaseApi = () => resolve(); }));

vi.mock("@/app/lib/api/order-panel", () => ({
  fetchOrderDetail: vi.fn(async () => psxOrder()),
  patchOrder: vi.fn(), patchProduction: vi.fn(),
  patchItem: (orderId: string, itemId: string, body: Record<string, unknown>) =>
    patchItem(orderId, itemId, body),
  promoteOrderApi: vi.fn(),
  resolveActionApi: vi.fn(async () => ({ id: "so-1", status: "COMPLETED", isSuspended: false })),
  patchItemStatus: (...args: unknown[]) => patchItemStatus(...(args as [])),
  rollbackOrderApi: (...args: unknown[]) => rollbackOrderApi(...(args as [])),
}));

const PSX_KEY = ["orders-snapshot", buildSnapshotQuery("master-hub")];

const mo = (id: string, moNumber: string) => ({
  id, moNumber, zone: "MASTER_HUB", itemStatus: "IN_PRODUCTION",
  productName: "Nhan kim cuong", quantity: 1, specifications: {},
  techClassification: [], design3DAssignments: [],
});

const psxOrder = (isSuspended = false) => ({
  id: "so-1", orderNumber: "26.10905", status: "IN_PRODUCTION", zone: "MASTER_HUB",
  customerName: "Khach le", isSuspended, version: 1,
  items: [mo("mo-a", "26.36938"), mo("mo-b", "26.36939")],
  alerts: [], workflowHistory: [], referenceUrls: [], productionDetail: null,
  finalTotal: null, currency: "VND", designBriefUrl: null, productionNote: null,
  _count: { versions: 0 },
}) as never;

function setup(isSuspended = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["order-panel", "so-1"], psxOrder(isSuspended));
  queryClient.setQueryData(PSX_KEY, {
    data: [{
      id: "so-1",
      allItems: [
        { itemId: "mo-a", moNumber: "26.36938", zone: "MASTER_HUB", itemStatus: "IN_PRODUCTION" },
        { itemId: "mo-b", moNumber: "26.36939", zone: "MASTER_HUB", itemStatus: "IN_PRODUCTION" },
      ],
    }],
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <OrderDetailPanel orderId="so-1" activeItemId="mo-a" onClose={vi.fn()} currentUserRole="ADMIN" />,
    { wrapper },
  );

  const activeMo = () => {
    const snapshot = queryClient.getQueryData(PSX_KEY) as {
      data: { allItems: { itemId: string; zone?: string; itemStatus?: string }[] }[];
    };
    return snapshot.data[0].allItems;
  };
  return { activeMo };
}

const user = () => userEvent.setup({ delay: null });

async function openAndConfirm(openLabel: RegExp, confirmLabel: RegExp, reason?: string) {
  const u = user();
  await u.click(await screen.findByRole("button", { name: openLabel }));
  if (reason !== undefined) {
    const box = screen.getAllByRole("textbox").at(-1)!;
    await u.type(box, reason);
  }
  await u.click(await screen.findByRole("button", { name: confirmLabel }));
}

describe("Thiet ke lai (rollback)", () => {
  // 🔴 Chi MO dang xem quay ve PTK. MO anh em van dang san xuat — keo no theo la dung san xuat
  // cua mot MO khong ai yeu cau dung.
  it("chi MO dang xem doi zone ve PTK, MO anh em giu nguyen", async () => {
    const { activeMo } = setup();

    await openAndConfirm(/Thiết kế lại/i, /Xác nhận Thiết kế lại/i, "Khach doi mau");

    await waitFor(() => {
      expect(activeMo()[0].zone).toBe("PRE_PRODUCTION");
    });
    expect(activeMo()[1].zone).toBe("MASTER_HUB");
  }, SLOW);

  it("bat buoc nhap ly do — de trong thi nut xac nhan bi khoa", async () => {
    setup();
    await user().click(await screen.findByRole("button", { name: /Thiết kế lại/i }));
    expect(await screen.findByRole("button", { name: /Xác nhận Thiết kế lại/i })).toBeDisabled();
  }, SLOW);
});

describe("Hoan tat", () => {
  // 🔴 Phep va phai chay NGAY khi bam, khong doi API: do la ca ly do no ton tai. Test khoa
  // dung diem do bang cach giu API treo.
  it("MO bien mat khoi PSX NGAY khi bam, chua doi API tra ve", async () => {
    const { activeMo } = setup();

    await openAndConfirm(/^Hoàn tất$/i, /Hoàn tất/i);

    await waitFor(() => {
      expect(activeMo()[0].itemStatus).toBe("COMPLETED");
    });
    expect(activeMo()[1].itemStatus).toBe("IN_PRODUCTION");
    releaseApi();
  }, SLOW);
});

describe("Huy", () => {
  it("MO bien mat khoi PSX NGAY khi bam, chua doi API tra ve", async () => {
    const { activeMo } = setup();

    await openAndConfirm(/^Hủy$/i, /Xác nhận/i, "Khach huy don");

    await waitFor(() => {
      expect(activeMo()[0].itemStatus).toBe("CANCELLED");
    });
    expect(activeMo()[1].itemStatus).toBe("IN_PRODUCTION");
    releaseApi();
  }, SLOW);

  // Ly do huy phai toi duoc server: no la thu duy nhat giai thich vi sao MO bien mat.
  it("ly do huy duoc gui len server", async () => {
    setup();
    patchItemStatus.mockClear();

    await openAndConfirm(/^Hủy$/i, /Xác nhận/i, "Khach huy don");

    await waitFor(() => {
      expect(patchItemStatus).toHaveBeenCalledWith(
        "so-1", "mo-a", "CANCELLED", { statusReason: "Khach huy don" },
      );
    });
    releaseApi();
  }, SLOW);
});

// Nut Showroom CHI hien khi MO dang tam ngung — do la ca luong nghiep vu: MO co van de,
// nguoi dung quyet dinh doi no thanh hang Showroom thay vi huy.
describe("Chuyen Showroom", () => {
  // Handler nay KHONG va snapshot; viec cua no la noi dung `activeItem.moNumber` vao mutation.
  // Noi sai thi MO# gui len server la chuoi rong, va server ghi de MO# that bang "-SR".
  it("gui dung MO# cua MO dang xem, kem hau to -SR", async () => {
    setup(true);
    patchItem.mockClear();

    // ⚠️ Nhan tren nut la chuoi CUNG "Chuyen sang Showroom", trong khi labels.ts co
    // `showroomLabel: "Chuyen thanh Showroom"`. Hai chu khac nhau cho cung mot viec — khong
    // sua o day vi doi chu la doi giao dien, nhung ghi lai de khong ai phat hien lai.
    await openAndConfirm(/Chuyển sang Showroom/i, /Xác nhận Showroom/i);

    await waitFor(() => {
      expect(patchItem).toHaveBeenCalled();
    });
    expect(patchItem.mock.calls[0][2].moNumber).toBe("26.36938-SR");
    releaseApi();
  }, SLOW);
});

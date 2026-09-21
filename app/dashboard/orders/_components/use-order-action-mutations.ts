"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  patchItem, patchItemStatus, promoteOrderApi, resolveActionApi, rollbackOrderApi,
} from "@/app/lib/api/order-panel";
import {
  itemStatusNeedsSnapshotSync, orderLevelFromItemStatus,
  patchItemStatusInRow, patchOrderInList, showroomMoNumber,
} from "@/app/lib/business/orders/list-cache";
import type { OrderDetail } from "@/app/lib/types/order";

// Năm hành động chuyển trạng thái của panel. Chúng KHÔNG có onError: lỗi đã được
// `toast.promise()` ở handler báo, thêm một onError rỗng chỉ là chỗ để ai đó tưởng có xử lý.

type OrderIdBody = { capturedOrderId: string } & Record<string, unknown>;

type Params = {
  order: OrderDetail | undefined;
  patchAllLists: (patch: (cache: unknown) => unknown) => void;
  onOrderUpdated?: (opts?: { skipSnapshotInvalidation?: boolean }) => void;
};

export function useOrderActionMutations({ order, patchAllLists, onOrderUpdated }: Params) {
  const queryClient = useQueryClient();

  const invalidateFor = (capturedOrderId: string, alsoSnapshots = false) => {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    if (alsoSnapshots) queryClient.invalidateQueries({ queryKey: ["orders-snapshot"] });
    queryClient.invalidateQueries({ queryKey: ["order-panel", capturedOrderId] });
  };

  // Chuyển xưởng và Lại thiết kế đều DI CHUYỂN đơn giữa PTK và PSX, nên snapshot của cả tab
  // nguồn lẫn tab đích đều phải làm mới.
  const promoteMutation = useMutation({
    mutationFn: ({ capturedOrderId, ...body }: OrderIdBody) => promoteOrderApi(capturedOrderId, body),
    onSuccess: (_, { capturedOrderId }) => {
      invalidateFor(capturedOrderId, true);
      onOrderUpdated?.();
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: ({ capturedOrderId, ...body }: OrderIdBody) => rollbackOrderApi(capturedOrderId, body),
    onSuccess: (_, { capturedOrderId }) => {
      invalidateFor(capturedOrderId, true);
      onOrderUpdated?.();
    },
  });

  // `statusReason` đi kèm để lý do HỦY MO tới được server. Optional: mutation này còn dùng cho
  // các chuyển trạng thái khác (IN_PRODUCTION…) vốn không có lý do.
  const itemStatusMutation = useMutation({
    mutationFn: ({ itemId, itemStatus, capturedOrderId, statusReason }: {
      itemId: string; itemStatus: string; capturedOrderId: string; statusReason?: string;
    }) => patchItemStatus(capturedOrderId, itemId, itemStatus, statusReason ? { statusReason } : undefined),
    onSuccess: (_, { itemId, itemStatus, capturedOrderId }) => {
      const orderLevel = orderLevelFromItemStatus(itemStatus);
      patchAllLists((cache) =>
        patchOrderInList(cache, capturedOrderId, (row) => ({
          ...patchItemStatusInRow(row, itemId, itemStatus),
          ...(orderLevel ?? {}),
        })),
      );
      invalidateFor(capturedOrderId);
      onOrderUpdated?.({ skipSnapshotInvalidation: !itemStatusNeedsSnapshotSync(itemStatus) });
    },
  });

  const resolveActionMutation = useMutation({
    mutationFn: ({ capturedOrderId, ...body }: OrderIdBody) => resolveActionApi(capturedOrderId, body),
    onSuccess: (updated, { capturedOrderId }) => {
      patchAllLists((cache) =>
        patchOrderInList(cache, capturedOrderId, (row) => ({
          ...row, isSuspended: updated.isSuspended, status: updated.status,
        })),
      );
      invalidateFor(capturedOrderId);
      onOrderUpdated?.();
    },
  });

  // Per-MO, không ảnh hưởng MO anh em. `isShowroom=true` trong specifications tự kích hoạt
  // cập nhật productionCode phía server (items route) — client không tự dựng mã.
  const showroomMutation = useMutation({
    mutationFn: async ({ itemId, moNumber, capturedOrderId }: {
      itemId: string; moNumber: string; capturedOrderId: string;
    }) => {
      const currentSpecs = (order?.items.find((item) => item.id === itemId)?.specifications ?? {}) as Record<string, unknown>;
      await Promise.all([
        patchItemStatus(capturedOrderId, itemId, "IN_PRODUCTION"),
        patchItem(capturedOrderId, itemId, {
          moNumber: showroomMoNumber(moNumber),
          specifications: {
            ...currentSpecs,
            isShowroom: true,
            showroomNote: `MO ${moNumber}: Chuyển thành Hàng Showroom — Đang sản xuất`,
          },
        }),
      ]);
    },
    onSuccess: (_, { capturedOrderId }) => {
      invalidateFor(capturedOrderId);
      onOrderUpdated?.();
    },
  });

  return {
    promoteMutation,
    rollbackMutation,
    itemStatusMutation,
    resolveActionMutation,
    showroomMutation,
    isWorking:
      promoteMutation.isPending ||
      rollbackMutation.isPending ||
      resolveActionMutation.isPending ||
      itemStatusMutation.isPending ||
      showroomMutation.isPending,
  };
}

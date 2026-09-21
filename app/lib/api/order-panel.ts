/**
 * Client-side API helpers for the Order Detail Panel.
 * All functions call the REST API and throw on error.
 * 409 CONFLICT is thrown as: Object.assign(new Error("CONFLICT"), { tag: "CONFLICT" })
 */

import type { OrderDetail } from "@/app/lib/types/order";

async function request<T>(
  url: string,
  method: "GET" | "POST" | "PATCH",
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 409) throw Object.assign(new Error("CONFLICT"), { tag: "CONFLICT" });
    // GẮN `code` và `details` vào lỗi. Có ca mà client phải xử lý RIÊNG chứ không chỉ hiện toast
    // (vd trùng MO ở PSX → hỏi xác nhận rồi gửi lại kèm cờ đồng ý), và phân biệt bằng cách đọc
    // NỘI DUNG câu thông báo là cách nhanh nhất làm hỏng client khi ai đó sửa câu chữ.
    throw Object.assign(new Error(json.error?.message ?? "Lỗi không xác định"), {
      code: json.error?.code as string | undefined,
      details: json.error?.details as unknown,
    });
  }
  return (json.data ?? json) as T;
}

export function fetchOrderDetail(id: string): Promise<OrderDetail> {
  return request<OrderDetail>(`/api/orders/${id}`, "GET");
}

export function patchOrder(id: string, body: Record<string, unknown>): Promise<OrderDetail> {
  return request<OrderDetail>(`/api/orders/${id}`, "PATCH", body);
}

export function patchItem(orderId: string, itemId: string, body: Record<string, unknown>): Promise<void> {
  return request<void>(`/api/orders/${orderId}/items/${itemId}`, "PATCH", body);
}

export function patchProduction(id: string, body: Record<string, unknown>): Promise<OrderDetail> {
  return request<OrderDetail>(`/api/orders/${id}/production`, "PATCH", body);
}

export function patchItemStatus(
  orderId: string,
  itemId: string,
  itemStatus: string,
  // statusReason: lý do đổi trạng thái — dùng cho HỦY MO. Không truyền thì server không ghi
  // lý do, và cột "Lý do hủy" ở tab Đã hủy sẽ trống. Đây chính là chỗ lý do người dùng gõ
  // trong dialog hủy từng bị mất: dialog bắt buộc nhập nhưng lời gọi không mang nó đi.
  opts?: { adminOverride?: boolean; statusReason?: string },
): Promise<void> {
  return request<void>(`/api/orders/${orderId}/items/${itemId}`, "PATCH", { itemStatus, ...opts });
}

export function promoteOrderApi(id: string, body: Record<string, unknown>): Promise<OrderDetail> {
  return request<OrderDetail>(`/api/orders/${id}/promote`, "POST", body);
}

export function rollbackOrderApi(id: string, body: Record<string, unknown>): Promise<OrderDetail> {
  return request<OrderDetail>(`/api/orders/${id}/rollback`, "POST", body);
}

export function resolveActionApi(id: string, body: Record<string, unknown>): Promise<OrderDetail> {
  return request<OrderDetail>(`/api/orders/${id}/resolve-action`, "POST", body);
}

import { prisma } from "@/app/lib/prisma";
import type { OrderStatus, OrderZone } from "@/app/generated/prisma/client";

export type RateLimitAction = "CANCEL_ORDER" | "ROLLBACK_ORDER";

const LIMITS: Record<RateLimitAction, { max: number; windowMs: number; label: string }> = {
  CANCEL_ORDER:  { max: 5,  windowMs: 60 * 60 * 1000, label: "hủy đơn" },
  ROLLBACK_ORDER: { max: 5, windowMs: 60 * 60 * 1000, label: "rollback đơn" },
};

export async function checkActionRateLimit(
  userId: string,
  action: RateLimitAction
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const { max, windowMs, label } = LIMITS[action];
  const since = new Date(Date.now() - windowMs);

  const where =
    action === "CANCEL_ORDER"
      ? { performedById: userId, action: "STATUS_CHANGED" as const, toStatus: "CANCELLED" as OrderStatus, performedAt: { gte: since } }
      : { performedById: userId, action: "ZONE_MOVED" as const, fromZone: "MASTER_HUB" as OrderZone, performedAt: { gte: since } };

  const count = await prisma.workflowHistory.count({ where });

  if (count >= max) {
    // Find the oldest action in the window to calculate retry time
    const oldest = await prisma.workflowHistory.findFirst({
      where,
      orderBy: { performedAt: "asc" },
      select: { performedAt: true },
    });
    const retryAfterMs = oldest
      ? oldest.performedAt.getTime() + windowMs - Date.now()
      : windowMs;

    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  return { allowed: true };
}

export function rateLimitMessage(action: RateLimitAction, retryAfterMs: number): string {
  const { max, label } = LIMITS[action];
  const minutes = Math.ceil(retryAfterMs / 60_000);
  return `Quá giới hạn: tối đa ${max} lần ${label} mỗi giờ. Thử lại sau ${minutes} phút.`;
}

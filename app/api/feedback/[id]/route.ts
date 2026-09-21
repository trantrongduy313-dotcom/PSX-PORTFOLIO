import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { isFeedbackKind } from "@/app/lib/business/feedback/kind";
import {
  ALL_FEEDBACK_STATUSES,
  checkTransition,
  requiresReply,
  type FeedbackStatus,
} from "@/app/lib/business/feedback/status";

// ─── Đổi trạng thái / trả lời một phản hồi ───────────────────────────────────
//
// CHỈ ADMIN. Đây là nửa còn lại của việc "đóng vòng": không có nó thì người gửi không bao giờ
// biết chuyện gì xảy ra với báo cáo của mình, và sau lần thứ hai họ quay về nhắn tin — lúc đó
// ta có một cái bảng chết trong database.

const MAX_REPLY = 2000;

const patchSchema = z.object({
  status: z.string().optional(),
  reply: z.string().max(MAX_REPLY).optional(),
});

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();
  if (user.role !== "ADMIN") return Errors.forbidden();

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const existing = await prisma.feedbackReport.findUnique({
    where: { id },
    select: { id: true, kind: true, status: true, adminReply: true },
  });
  if (!existing) return Errors.notFound("Feedback");
  if (!isFeedbackKind(existing.kind)) return Errors.internal("Loại phản hồi trong DB không đọc được.");

  const nextReply = parsed.data.reply?.trim();
  const nextStatus = parsed.data.status;

  if (nextStatus === undefined && nextReply === undefined) {
    return Errors.badRequest("Không có gì để cập nhật.");
  }

  // ─── Đổi trạng thái ─────────────────────────────────────────────────────────
  let statusToWrite: FeedbackStatus | undefined;
  if (nextStatus !== undefined) {
    if (!isFeedbackStatus(nextStatus)) {
      return Errors.badRequest(`Trạng thái phải là một trong: ${ALL_FEEDBACK_STATUSES.join(", ")}.`);
    }
    // Luật nằm ở business/feedback/status.ts — route không tự diễn đạt lại "trạng thái nào
    // thuộc loại nào". Đó chính là chỗ mà một đề xuất cải tiến sẽ hiện chữ "Đã sửa".
    const check = checkTransition({ kind: existing.kind, from: existing.status, to: nextStatus });
    if (!check.ok) return Errors.badRequest(check.reason);

    // "Không phải lỗi" / "Không làm" mà không nói vì sao thì với người gửi nó không khác gì bị
    // phớt lờ — mà lại có dấu hiệu rõ ràng là đã bị đọc và bị bỏ.
    const replyAfterWrite = nextReply ?? existing.adminReply?.trim() ?? "";
    if (requiresReply(nextStatus) && replyAfterWrite.length === 0) {
      return Errors.badRequest(
        "Hãy ghi một dòng lý do trước khi chốt — người gửi chịu được câu 'không', nhưng không chịu được im lặng.",
      );
    }
    statusToWrite = nextStatus;
  }

  const updated = await prisma.feedbackReport.update({
    where: { id },
    data: {
      ...(statusToWrite !== undefined && { status: statusToWrite }),
      ...(nextReply !== undefined && {
        adminReply: nextReply || null,
        repliedAt: nextReply ? new Date() : null,
        // dbId có thể undefined với VIRTUAL_ADMIN — ghi null thay vì làm vỡ khoá ngoại.
        repliedById: nextReply ? (user.dbId ?? null) : null,
      }),
    },
    select: {
      id: true,
      kind: true,
      status: true,
      adminReply: true,
      repliedAt: true,
      updatedAt: true,
    },
  });

  return ok(updated);
}

function isFeedbackStatus(value: string): value is FeedbackStatus {
  return (ALL_FEEDBACK_STATUSES as readonly string[]).includes(value);
}

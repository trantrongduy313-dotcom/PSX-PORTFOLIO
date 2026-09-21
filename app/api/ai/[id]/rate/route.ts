import type { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";

import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { currentCommitSha } from "@/app/lib/business/feedback/context";
import { oneLine } from "@/app/lib/business/ai/validate";
import { notifyNewFeedback } from "@/app/lib/notify/notify-feedback";

// ─── Người dùng chấm câu trả lời ─────────────────────────────────────────────
//
// 🎯 ĐÂY KHÔNG PHẢI MỘT NÚT CHO ĐẸP. Cùng với `wasUnanswered`, nó là toàn bộ cách biết bộ nội
// dung đang thiếu hoặc viết sai ở đâu — do chính người dùng chỉ ra bằng câu hỏi thật của họ.
// Trước đây không có cách nào biết ngoài phỏng đoán.
//
// ⚠️ 👎 KHÔNG TỰ ĐỘNG BẮN CHUÔNG CHO ADMIN, và đây là một quyết định có chủ ý:
//
// Một cú bấm 👎 rẻ đến mức người ta bấm cả khi chỉ hơi không hài lòng. Cho nó bắn thông báo là
// admin nhận vài chục tin mỗi tuần, tắt thông báo sau hai tuần, và MẤT LUÔN cảnh báo lỗi thật —
// đúng cái cách tính năng Góp ý tự vô hiệu hoá chính nó nếu đề xuất cũng bắn chuông (xem ghi
// chú ở notify-feedback.ts).
//
// Nên: 👎 trần = ghi nhận im lặng, vào số liệu. CHỈ khi người dùng bỏ công VIẾT RA sai ở đâu
// thì mới thành một báo cáo thật và mới bắn chuông. Người đã gõ một câu là người có điều đáng
// nói.

const rateSchema = z.object({
  helpful: z.boolean(),
  /** Sai ở đâu — không bắt buộc. Có nội dung thì mới tạo báo cáo. */
  note: z.string().optional(),
});

const MAX_NOTE_LENGTH = 500;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden("Bạn cần đăng nhập.");

  const { id } = await ctx.params;
  const parsed = rateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Errors.validationFailed(parsed.error.flatten());

  const log = await prisma.aiQuestionLog.findUnique({
    where: { id },
    select: { id: true, userId: true, question: true, answer: true, pageUrl: true, sourceIds: true },
  });
  if (!log) return Errors.notFound("Câu hỏi");

  // CHỈ người đã hỏi được chấm câu trả lời của mình.
  //
  // Không phải vì bảo mật — nội dung này không bí mật. Là vì SỐ LIỆU: cho người khác chấm hộ là
  // con số "câu trả lời có giúp được không" không còn nói về trải nghiệm của người đã hỏi, và
  // nó là con số duy nhất ở đây có nghĩa.
  //
  // `log.userId` null (VIRTUAL_ADMIN, hoặc tài khoản đã bị xoá) thì không xác định được chủ →
  // từ chối. Chặt hơn thực tế một chút, không bao giờ rộng hơn.
  if (!log.userId || log.userId !== user.dbId) {
    return Errors.forbidden("Bạn chỉ chấm được câu trả lời của chính mình.");
  }

  const note = parsed.data.note ? oneLine(parsed.data.note).slice(0, MAX_NOTE_LENGTH) : "";

  // Chỉ tạo báo cáo khi 👎 VÀ có mô tả. 👍 kèm ghi chú thì vẫn chỉ ghi nhận — một lời khen
  // không cần đi vào hàng đợi xử lý lỗi của admin.
  const shouldReport = !parsed.data.helpful && note.length > 0;

  let feedbackReportId: string | null = null;
  if (shouldReport) {
    const created = await prisma.feedbackReport.create({
      data: {
        // BUG chứ không IDEA: "trợ lý trả lời sai" là một lỗi của hệ thống, và nó cần được xem
        // sớm — nội dung sai đang được nhắc lại cho mọi người hỏi cùng câu đó.
        kind: "BUG",
        summary: `[Trợ lý] ${note}`,
        // Kèm CẢ câu hỏi và câu trả lời. Không có chúng thì admin nhận được một lời phàn nàn
        // không có ngữ cảnh, và phải đi hỏi lại — đúng cái vòng mà tính năng này định bỏ.
        detail: [
          `Câu hỏi: ${log.question}`,
          ``,
          `Trợ lý trả lời:`,
          log.answer,
          ``,
          `Mục nội dung đã dẫn: ${log.sourceIds.length > 0 ? log.sourceIds.join(", ") : "(không có)"}`,
        ].join("\n"),
        reporterId: user.dbId ?? null,
        reporterName: user.name ?? "(không rõ)",
        reporterEmail: user.email ?? "(không rõ)",
        reporterRole: user.role,
        pageUrl: log.pageUrl,
        commitSha: currentCommitSha(process.env),
      },
      select: { id: true },
    });
    feedbackReportId = created.id;
  }

  await prisma.aiQuestionLog.update({
    where: { id },
    data: { wasHelpful: parsed.data.helpful, feedbackReportId },
  });

  // `after()` — cùng lý do với route Góp ý: gọi mạng ngoài phải nằm sau response, và thông báo
  // thất bại KHÔNG được làm mất báo cáo đã ghi.
  if (feedbackReportId) {
    const reportId = feedbackReportId;
    after(() => notifyNewFeedback(reportId));
  }

  return ok({ reported: feedbackReportId !== null });
}

import { after } from "next/server";

import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import {
  entriesToNotify,
  entriesToPublish,
  publishPatch,
} from "@/app/lib/business/changelog/publish";
import { notifyChangelogPublished } from "@/app/lib/notify/notify-changelog";

// ─── Đăng CẢ LƯỢT ────────────────────────────────────────────────────────────
//
// 🎯 ĐĂNG LÀ VIỆC THEO LƯỢT, KHÔNG PHẢI TỪNG MỤC — và đó là lý do route này tồn tại riêng thay
// vì một cờ `publish: true` ở PATCH.
//
// Người dùng gom trong ngày rồi đăng một lượt cuối ngày. Nếu mỗi mục tự bắn một tin thì đăng 5
// mục là Chat kêu 5 lần — đúng lỗi độ ồn đã học ở tính năng Góp ý, và ở đây nặng hơn vì cùng
// một webhook đang chở cảnh báo lỗi. Làm ồn kênh này là mất luôn kênh kia.
//
// KHÔNG NHẬN THAM SỐ. Đăng nghĩa là "đăng mọi nháp đang có". Cho client chọn danh sách id là mở
// đường cho hai lần bấm gửi hai tập giao nhau — tức là hai tin Chat cho những mục lẽ ra cùng một
// lượt.

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();
  if (user.role !== "ADMIN") return Errors.forbidden();

  const all = await prisma.changelogEntry.findMany({
    where: { isPublished: false },
    select: { id: true, isPublished: true, notifiedAt: true },
  });

  const toPublish = entriesToPublish(all);
  if (toPublish.length === 0) {
    // 200 chứ không phải lỗi: không có gì để đăng là một trạng thái hợp lệ, không phải sai sót
    // của người bấm. Trả lỗi ở đây là dạy họ ngại bấm nút.
    return ok({ published: 0, notified: 0 });
  }

  // ⚠️ TÍNH `toNotify` TRƯỚC KHI GHI. Sau khi ghi thì `notifiedAt` của mọi mục đều đã có giá
  // trị, và không còn cách nào biết mục nào là mới. Đây là chỗ dễ viết ngược nhất trong cả
  // tính năng.
  const notifyIds = entriesToNotify(toPublish).map((e) => e.id);

  const now = new Date();
  await prisma.$transaction(
    // Vòng lặp chứ không phải một `updateMany`: `notifiedAt` phải khác nhau theo từng mục (chỉ
    // đặt cho mục chưa từng thông báo), mà `updateMany` chỉ ghi được một bộ giá trị chung. Với
    // vài mục mỗi ngày thì đây không phải vấn đề hiệu năng.
    toPublish.map((entry) =>
      prisma.changelogEntry.update({ where: { id: entry.id }, data: publishPatch(entry, now) }),
    ),
  );

  // Gửi SAU khi transaction commit và SAU khi response đã đi — cùng ba lý do đã ghi ở
  // notify-design-3d.ts: không giữ lock DB qua một cuộc gọi mạng, Chat chậm không làm người
  // dùng phải chờ, và Chat lỗi không được làm mất việc đã đăng.
  if (notifyIds.length > 0) {
    after(() => notifyChangelogPublished(notifyIds));
  }

  return ok({ published: toPublish.length, notified: notifyIds.length });
}

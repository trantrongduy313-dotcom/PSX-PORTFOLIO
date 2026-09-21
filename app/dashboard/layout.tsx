import { cookies } from "next/headers";
import { Sidebar } from "@/components/Sidebar";
import { NavigationProgress } from "@/components/NavigationProgress";
import { LocaleProvider } from "@/app/lib/i18n/locale-context";
import type { Locale } from "@/app/lib/i18n/labels";
import { Suspense } from "react";
import { ActionDock } from "./_components/action-dock/action-dock";
import { isAiConfigured } from "@/app/lib/ai/client";
import { ChangelogImportantBanner } from "./_components/changelog/changelog-important-banner";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import {
  canSeeSyncNotice,
  countNotice,
  noticeFingerprint,
  parseNoticePayload,
  type SyncNoticeMonth,
} from "@/app/lib/business/orders/sync-notice";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = ((await cookies()).get("psx-locale")?.value ?? "vi") as Locale;

  const aiReady = isAiConfigured();

  // Mục QUAN TRỌNG mới nhất đã đăng — chỉ MỘT. Ba dải xếp chồng là ba dải bị bỏ qua cùng lúc.
  //
  // `.catch(() => null)` vì layout này bọc TOÀN BỘ dashboard: một lỗi truy vấn ở đây làm trắng
  // mọi trang. Giữa lúc deploy và lúc chạy migration thì bảng chưa tồn tại, nên đây không phải
  // phòng xa mà là một cửa sổ chắc chắn có.
  const importantNotice = await prisma.changelogEntry
    .findFirst({
      where: { isPublished: true, isImportant: true },
      orderBy: { publishedAt: "desc" },
      select: { id: true, title: true },
    })
    .catch(() => null);

  // ─── Việc cần xử lý từ mẻ đồng bộ Google Sheet ────────────────────────────
  //
  // Nạp Ở ĐÂY (Server Component) rồi truyền xuống, KHÔNG để client tự fetch: một `useEffect` +
  // `setState` để nạp dữ liệu là đúng cái eslint của dự án chặn, và nó thêm một khung render
  // trống ở mọi lần tải trang. Nạp ở layout cũng có nghĩa dữ liệu tươi mỗi lần điều hướng —
  // đúng yêu cầu "họ thấy ngay lần đầu mở webapp".
  //
  // `.catch(() => null)` cùng lý do với truy vấn changelog ngay trên: layout này bọc TOÀN BỘ
  // dashboard, một lỗi truy vấn ở đây làm trắng mọi trang. Giữa lúc deploy và lúc chạy migration
  // thì bảng `sync_notices` chưa tồn tại — đây là một cửa sổ chắc chắn có, không phải phòng xa.
  const viewer = await getCurrentUser().catch(() => null);
  const noticeRows = canSeeSyncNotice(viewer?.role)
    ? await prisma.syncNotice
        .findMany({ orderBy: { month: "desc" }, take: 6, select: { month: true, syncedAt: true, payload: true } })
        .catch(() => [])
    : [];
  const noticeMonths: SyncNoticeMonth[] = noticeRows
    .map((r) => ({
      month: r.month,
      syncedAt: r.syncedAt.toISOString(),
      payload: parseNoticePayload(r.payload),
    }))
    .filter((m) => countNotice(m.payload) > 0);
  const notice = noticeMonths.length
    ? {
        months: noticeMonths,
        total: noticeMonths.reduce((n, m) => n + countNotice(m.payload), 0),
        fingerprint: noticeFingerprint(noticeMonths),
      }
    : null;

  return (
    <LocaleProvider locale={locale}>
      <div className="flex h-screen overflow-hidden" style={{ background: "var(--cream)" }}>
        {/* Progress bar — Suspense vì dùng useSearchParams bên trong */}
        <Suspense>
          <NavigationProgress />
        </Suspense>

        <Sidebar />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Băng thông báo cho mục QUAN TRỌNG — nằm TRONG luồng trang, không phải hộp thoại
              chặn ngang. Hộp thoại xin sự chú ý trước khi người ta kịp vào việc, và một tuần
              sau mọi người bấm X theo phản xạ mà không đọc. */}
          <ChangelogImportantBanner notice={importantNotice} />
          {children}
        </main>

        {/* ─── Thanh hành động nổi ở cạnh PHẢI: Hỏi trợ lý · Góp ý ────────────────
            MỘT component, không phải một component mỗi nút. Trước đây là hai nút rời, mỗi bên
            giữ một bản sao của luật trượt-tránh-panel, và nút AI còn phải hardcode bố cục của
            nút Góp ý để không đè lên nó. Xem action-dock.tsx.

            `Suspense` vì nó đọc `?orderId` qua useSearchParams để tự tránh OrderDetailPanel.

            `aiEnabled` TRUYỀN TỪ ĐÂY, không để dock tự kiểm: `process.env` chỉ đọc được ở
            Server Component. Chưa cấu hình API key thì action "Hỏi trợ lý" KHÔNG được dựng —
            một nút bấm vào rồi báo "chưa cấu hình" là để chuyện vận hành lộ ra với người dùng.
            Nhưng dock vẫn phải tồn tại, vì nút Góp ý không phụ thuộc vào key nào. */}
        <Suspense>
          <ActionDock aiEnabled={aiReady} notice={notice} />
        </Suspense>
      </div>
    </LocaleProvider>
  );
}

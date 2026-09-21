// Sidebar is a Server Component — reads session from auth()
// SidebarUserMenu is a Client Component for signOut
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { loadChangelogPublishedAt } from "@/app/lib/changelog/published-dates";
import { SidebarUserMenu } from "./SidebarUserMenu";
import { SidebarNavLink } from "./SidebarNavLink";
import { SidebarSection } from "./SidebarSection";
import { CountBadge } from "./CountBadge";
import { ChangelogUnreadBadge } from "@/app/dashboard/_components/changelog/changelog-unread-badge";
import { ROLE_LABELS } from "@/app/lib/roles";
import { ALL_FEEDBACK_STATUSES, isOpenStatus } from "@/app/lib/business/feedback/status";
import type { AuthUser } from "@/app/lib/auth-helpers";
import type { Locale } from "@/app/lib/i18n/labels";
import {
  navLabel,
  sectionBadgeTotal,
  visibleSections,
  type NavBadgeCounts,
} from "@/app/lib/ui/nav-model";

async function NavLinks({ role, locale }: { role?: string; locale: Locale }) {
  // ─── Chỉ ĐẾM, không dựng cấu trúc ─────────────────────────────────────────
  //
  // Cấu trúc menu (thứ tự, phân nhóm, quyền xem, nhãn) nay là DỮ LIỆU ở app/lib/ui/nav-model.ts,
  // có test đặc tính chốt ma trận quyền. Hàm này chỉ còn hai việc: lấy các con số huy hiệu, và
  // render mô hình đó.
  //
  // 🔴 ĐÃ BỎ TRUY VẤN `stores`. Phần hiển thị Stores đã bị xoá từ trước ("store filter is now in
  // the orders toolbar") nhưng TRUY VẤN thì còn — cả `prisma.store.findMany` lẫn
  // `prisma.userStore.findMany` chạy rồi kết quả bị bỏ. Sidebar là Server Component render ở MỌI
  // trang dashboard, nên đó là một truy vấn vô ích mỗi lần đổi trang, cho mọi người dùng. Lint
  // đã báo `'stores' is assigned a value but never used` — nó đang chỉ vào một chi phí thật.
  const isSalesOnly = role === "SALES";

  let unresolvedAlerts = 0;
  // Phản hồi CHƯA XỬ LÝ — chỉ ADMIN thấy. Lấy danh sách trạng thái mở từ business layer thay vì
  // liệt kê tay: thêm một bước giữa về sau thì huy hiệu tự đếm đúng.
  let openFeedback = 0;
  // Mốc đăng của các mục changelog. Truyền CẢ DANH SÁCH xuống client, không truyền một con số:
  // chỉ client biết mốc "đã đọc" (localStorage), nên chỉ client đếm được bao nhiêu mục chưa đọc.
  let changelogPublishedAt: string[] = [];

  try {
    [unresolvedAlerts, openFeedback, changelogPublishedAt] = await Promise.all([
      isSalesOnly ? Promise.resolve(0) : prisma.alert.count({ where: { isResolved: false } }),
      // ⚠️ `.catch(() => 0)` RIÊNG cho phép đếm này, KHÔNG dựa vào try/catch chung bên ngoài.
      // `Promise.all` đổ vỡ theo CẢ CỤM: một lỗi ở đây sẽ kéo mất luôn `unresolvedAlerts`, tức
      // là TÍNH NĂNG MỚI LÀM TẮT HUY HIỆU CẢNH BÁO đang chạy.
      //
      // Và đó không phải giả thuyết: giữa lúc deploy code này và lúc chạy migration trên
      // production, bảng `feedback_reports` CHƯA TỒN TẠI — cửa sổ đó là chắc chắn có, chỉ là dài
      // bao lâu. Một tính năng mới không được phép làm hỏng một tính năng đang chạy vì thứ tự
      // triển khai.
      role === "ADMIN"
        ? prisma.feedbackReport
            .count({ where: { status: { in: ALL_FEEDBACK_STATUSES.filter(isOpenStatus) } } })
            .catch(() => 0)
        : Promise.resolve(0),
      // Dùng CHUNG helper với trang Hướng dẫn (nó đếm "thay đổi kể từ lần rà" của từng chương).
      // Cùng một câu truy vấn viết ở hai file là hai con số lệch nhau về cùng một dữ liệu, không
      // có lỗi nào — helper đã tự bọc `.catch()` bên trong.
      loadChangelogPublishedAt(),
    ]);
  } catch (e) {
    console.error("[Sidebar NavLinks]", e);
  }

  const counts: NavBadgeCounts = { alerts: unresolvedAlerts, feedback: openFeedback };

  return (
    <nav style={{ padding: "8px 0", flex: 1, overflowY: "auto" }}>
      {visibleSections(role).map((section) => {
        const total = sectionBadgeTotal(section, counts);
        return (
          <SidebarSection
            key={section.key}
            sectionKey={section.key}
            title={section.title ? navLabel(section.title, locale) : null}
            // Nhóm cấu hình gập SẴN: 17 mục là phải kéo mới thấy hết, và các mục "Quản lý…" là
            // thứ dùng vài lần một tháng — không đáng chiếm chỗ thường trực của việc hằng ngày.
            defaultCollapsed={section.key === "admin"}
            // 🔴 TỔNG HUY HIỆU NỔI LÊN TIÊU ĐỀ. Không có nó thì gập nhóm Admin là ẩn luôn con số
            // "Phản hồi người dùng" — kênh thông báo DUY NHẤT của tính năng góp ý.
            //
            // Nhóm Tài liệu dùng một component CLIENT: huy hiệu "Có gì mới" đếm từ localStorage
            // nên server không tính được. Đây là lý do prop `badge` nhận ReactNode chứ không
            // nhận number.
            badge={
              section.key === "docs"
                ? <ChangelogUnreadBadge publishedAtList={changelogPublishedAt} />
                : <CountBadge count={total} />
            }
          >
            {section.items.map((item) => (
              <SidebarNavLink key={item.key} href={item.href} exact={item.exact}>
                <span style={{ flex: 1 }}>{navLabel(item.label, locale)}</span>
                {/* Huy hiệu trên TỪNG mục vẫn giữ — tổng ở tiêu đề trả lời "có việc chờ không",
                    còn con số ở đây trả lời "chờ ở đâu". Hai câu khác nhau. */}
                {item.badge === "alerts" && <CountBadge count={unresolvedAlerts} />}
                {item.badge === "feedback" && <CountBadge count={openFeedback} />}
                {item.badge === "changelog" && (
                  <ChangelogUnreadBadge publishedAtList={changelogPublishedAt} />
                )}
              </SidebarNavLink>
            ))}
          </SidebarSection>
        );
      })}
    </nav>
  );
}

export async function Sidebar() {
  const session = await auth();
  const user = session?.user as AuthUser | undefined;
  const locale = (((await cookies()).get("psx-locale")?.value) ?? "vi") as Locale;

  return (
    <div
      style={{
        width: "240px",
        background: "var(--cream-card)",
        borderRight: "1px solid var(--border)",
        height: "100%",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header / Brand */}
      <div style={{ padding: "24px 18px 16px", flexShrink: 0 }}>
        <h1 style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
          fontSize: "22px",
          fontWeight: 500,
          color: "var(--ink)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          margin: 0,
          lineHeight: 1.2,
        }}>
          PSX
        </h1>
        <p style={{
          fontSize: "10px",
          fontWeight: 400,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--ink-muted)",
          marginTop: "3px",
        }}>
          Management
        </p>
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: "var(--border)", marginLeft: "18px", marginRight: "18px" }} />

      <NavLinks role={user?.role} locale={locale} />

      {user && (
        <SidebarUserMenu
          name={user.name}
          email={user.email}
          image={user.image}
          roleLabel={ROLE_LABELS[user.role]}
        />
      )}
    </div>
  );
}

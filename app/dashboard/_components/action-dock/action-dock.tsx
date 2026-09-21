"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ClipboardCheck, MessageCircle, Sparkles } from "lucide-react";

import { Z } from "@/app/lib/ui/z-index";
import { ASK_AI_PARAM, isAskAiRequested, urlWithoutAskAi } from "@/app/lib/ui/ask-ai-param";
import { createPersistedFlag, createPersistedString } from "@/app/lib/ui/persisted-flag";
import { FeedbackDialog } from "../feedback/feedback-dialog";
import { AskAiDialog } from "../ai/ask-ai-dialog";
import { SyncNoticeDialog } from "../sync-notice/sync-notice-dialog";
import { CountBadge } from "@/components/CountBadge";
import type { SyncNoticeMonth } from "@/app/lib/business/orders/sync-notice";

// Thanh hành động nổi ở cạnh phải màn hình: Hỏi trợ lý · Góp ý · Việc cần xử lý.
//
// Thêm action = thêm một phần tử vào mảng `actions`. Không action nào cần biết action khác nằm
// ở đâu — khoảng cách dọc do flex + gap lo.
//
// Bốn bài học đã trả giá (góc dưới phải đã chết, hai vế của z-index 35, không coupling với
// panel, và vì sao thanh này KHÔNG trượt khi panel mở):
//   docs/04_ENGINEERING_GUIDELINES.md § Thanh hành động nổi

/** Ghi nhớ lựa chọn thu gọn. Đổi khoá này là mọi người bị reset về mặc định. */
const STORAGE_KEY = "psx.actionDock.collapsed";

type DockAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** Nhãn cho trình đọc màn hình — dài hơn `label`, nói rõ việc gì sẽ xảy ra. */
  ariaLabel: string;
  /**
   * Số việc còn tồn đọng của action này. Bỏ trống = không có gì để đếm.
   *
   * Có `badge` thì con số cũng hiện trên CÁI TAI khi thanh đang thu gọn — xem chỗ render.
   * Đó không phải trang trí: một action mang việc tồn đọng mà bị thu gọn thì màn hình im lặng
   * hoàn toàn, và người dùng không có cách nào biết là có việc.
   */
  badge?: number;
  /**
   * Hộp thoại của action.
   *
   * ⚠️ ĐÂY LÀ LÝ DO `ACTIONS` PHẢI DỰNG BÊN TRONG FILE NÀY, không nhận từ layout.
   * Hàm KHÔNG serialize được qua biên Server → Client Component, nên `<ActionDock actions={…} />`
   * trông đẹp hơn nhưng không chạy trong App Router. Layout truyền đúng một boolean (`aiEnabled`).
   */
  renderDialog: (close: () => void) => React.ReactNode;
};

const ICON = { width: "13px", height: "13px", flexShrink: 0 } as const;

// ─── Đọc hai nguồn NGOÀI React: bề rộng cửa sổ và localStorage ───────────────
//
// Dùng `useSyncExternalStore`, KHÔNG dùng `useEffect` + `setState`. Bản đầu tôi viết bằng
// useEffect và eslint chặn đúng: `react-hooks/set-state-in-effect`. Đó không phải một luật hình
// thức — setState đồng bộ trong effect gây một vòng render phụ ở MỌI lần tải trang, và dự án đã
// có một chỗ mắc lỗi này (overtime-panel.tsx). Thêm bản thứ hai là bình thường hoá nó.
//
// `getServerSnapshot` trả về giá trị "chưa đo được" (0 / false). Nhờ đó khung hydrate vẽ ĐÚNG
// trạng thái rỗng rồi mới nhận giá trị thật — không có nhịp nháy từ "mở" sang "thu gọn".
//
// 📌 Và `storage` event tặng thêm một thứ: thu gọn ở tab này thì các tab khác đi theo.

/**
 * Store cho lựa chọn thu gọn — dùng khuôn CHUNG ở app/lib/ui/persisted-flag.ts.
 *
 * Phần Sidebar gập được cần đúng thứ này, nên nó đã được rút thành một hàm tạo store thay vì
 * viết bản thứ hai. Ba cái bẫy (storage event không bắn cho tab đã ghi, try/catch quanh cả việc
 * ĐỌC, getSnapshot phải trả giá trị nguyên thuỷ) nằm gọn trong đó — xem chú thích ở file kia.
 *
 * Ở TẦM MODULE, không trong thân render: mỗi lần gọi tạo một tập listener mới.
 */
const collapsedStore = createPersistedFlag(STORAGE_KEY);

/**
 * VÂN TAY lời nhắc việc mà người dùng đã xem.
 *
 * 🔴 LƯU VÂN TAY, KHÔNG LƯU NGÀY. "Mỗi ngày hỏi một lần" nghĩa là sáng nào cũng bật lên cùng
 * ba MO cũ; người ta học cách bấm ✕ theo phản xạ trong hai ngày, rồi bấm qua luôn cả lần có
 * việc mới. Nội dung không đổi → im lặng. Có MO mới → tự mở lại.
 */
const noticeSeenStore = createPersistedString("psx.syncNotice.seen");

export function ActionDock({ aiEnabled, notice }: {
  aiEnabled: boolean;
  /**
   * Việc còn phải làm từ mẻ đồng bộ. TRUYỀN TỪ LAYOUT (Server Component) chứ không fetch ở
   * client: một `useEffect` + `setState` để nạp dữ liệu là đúng cái eslint của dự án chặn
   * (`react-hooks/set-state-in-effect`), và nó thêm một khung render trống ở mọi lần tải trang.
   * `null` = vai này không được xem, hoặc không có việc nào.
   */
  notice: { months: SyncNoticeMonth[]; total: number; fingerprint: string } | null;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  // ─── Mở trợ lý từ nơi khác, qua URL ────────────────────────────────────────
  //
  // Trung tâm trợ giúp có một thẻ "Hỏi trợ lý" và nó KHÔNG BẤM ĐƯỢC — trông y hệt ba thẻ liên
  // kết bên cạnh, nằm đầu tiên, và không làm gì cả. Nay nó là một liên kết `?ask=1` thật.
  //
  // Đọc URL thay vì nhận sự kiện: một link chia sẻ được — admin trả lời góp ý gửi được "bấm
  // vào đây để hỏi trợ lý".
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const askRequested = isAskAiRequested(searchParams.get(ASK_AI_PARAM));

  const userCollapsed = useSyncExternalStore(
    collapsedStore.subscribe,
    collapsedStore.getSnapshot,
    collapsedStore.getServerSnapshot,
  );

  const seenFingerprint = useSyncExternalStore(
    noticeSeenStore.subscribe,
    noticeSeenStore.getSnapshot,
    noticeSeenStore.getServerSnapshot,
  );

  const actions: DockAction[] = [
    ...(aiEnabled
      ? [{
          key: "ai",
          label: "Hỏi trợ lý",
          ariaLabel: "Hỏi trợ lý về cách dùng hệ thống",
          icon: <Sparkles style={ICON} />,
          renderDialog: (close: () => void) => <AskAiDialog onClose={close} />,
        }]
      : []),
    ...(notice && notice.total > 0
      ? [{
          key: "sync-notice",
          // Con số đi bằng HUY HIỆU, không nhét vào nhãn: một cách hiển thị số cho cả hai
          // trạng thái (mở và thu gọn), thay vì "(5)" ở đây và một chấm đỏ ở chỗ khác.
          label: "Việc cần xử lý",
          badge: notice.total,
          ariaLabel: `${notice.total} việc cần xử lý từ đồng bộ Google Sheet`,
          icon: <ClipboardCheck style={ICON} />,
          renderDialog: (close: () => void) => (
            <SyncNoticeDialog months={notice.months} onClose={close} />
          ),
        }]
      : []),
    {
      key: "feedback",
      label: "Góp ý",
      ariaLabel: "Góp ý hoặc báo lỗi",
      icon: <MessageCircle style={ICON} />,
      renderDialog: (close: () => void) => <FeedbackDialog onClose={close} />,
    },
  ];

  // Thu gọn = ĐÚNG lựa chọn của người dùng, không có điều kiện nào khác. Bản trước còn ép thu
  // gọn khi panel mở, nhưng lý do của phép ép đó là "thanh trượt vào giữa vùng nội dung" — bỏ
  // phép trượt thì lý do mất theo (bài học 4).
  const collapsed = userCollapsed;
  // ⚠️ SUY RA, KHÔNG ĐỒNG BỘ BẰNG `useEffect`. Nhồi URL vào `openKey` qua một effect là đúng
  // cái lỗi eslint (`set-state-in-effect`) mà dự án đã gặp nhiều lần, và nó thêm một khung
  // render trống trước khi hộp thoại hiện ra.
  //
  // `aiEnabled` phải kiểm ở đây: trợ lý tắt được bằng biến môi trường, và khi tắt thì action
  // "ai" KHÔNG được dựng. Một link `?ask=1` cũ khi đó phải im lặng — `find` trả undefined nên
  // nó tự im, nhưng viết rõ điều kiện để người đọc không phải suy ra từ một mảng rỗng.
  //
  // ⚠️ THỨ TỰ ƯU TIÊN CÓ CHỦ Ý: người dùng bấm > link `?ask=1` > lời nhắc tự mở. Lời nhắc đứng
  // CUỐI vì nó là thứ duy nhất tự mở mà không ai yêu cầu — nó không được cướp một liên kết
  // "bấm vào đây để hỏi trợ lý" mà admin vừa gửi cho ai đó.
  const noticeUnseen =
    !!notice && notice.total > 0 && notice.fingerprint !== "" && seenFingerprint !== notice.fingerprint;
  const effectiveKey =
    openKey ?? (askRequested && aiEnabled ? "ai" : null) ?? (noticeUnseen ? "sync-notice" : null);
  const active = actions.find((a) => a.key === effectiveKey);

  // 🔴 ĐÓNG PHẢI DỌN THAM SỐ, KHÔNG PHẢI PHÉP LỊCH SỰ MÀ LÀ ĐIỀU KIỆN. Trạng thái mở là "URL
  // yêu cầu HOẶC người dùng bấm" — còn `?ask=1` trong URL thì `setOpenKey(null)` không đóng
  // được gì cả. Và nếu không dọn thì F5 cũng bật lại hộp thoại người dùng vừa đóng.
  //
  // `replace` chứ không `push`: mở hộp thoại rồi đóng không đáng chiếm một mục trong lịch sử
  // trình duyệt — bấm Back sau đó phải quay về trang TRƯỚC, không phải về chính trang này.
  const closeActive = () => {
    // Bấm ✕ = "tôi đã xem nội dung NÀY". Ghi vân tay lại thì popup không tự mở nữa cho tới khi
    // có việc mới — nhưng nút trên thanh VẪN còn, nên lỡ tay đóng thì mở lại được ngay.
    if (effectiveKey === "sync-notice" && notice) noticeSeenStore.set(notice.fingerprint);
    setOpenKey(null);
    if (askRequested) {
      router.replace(urlWithoutAskAi(pathname, searchParams.toString()), { scroll: false });
    }
  };

  // 🔴 TỔNG SỐ VIỆC TỒN ĐỌNG — để CÁI TAI thu gọn cũng nói được.
  //
  // Lỗi đã xảy ra thật: nút "Việc cần xử lý" nằm trong thanh này, mà thanh thì người dùng đã tự
  // thu gọn từ trước cho mục đích khác. Khi thu gọn, các nút KHÔNG được dựng (đúng — giữ chúng
  // rồi ẩn bằng CSS là để lại vùng bấm vô hình đè lên bảng), nên có 5 việc tồn đọng mà màn hình
  // không nói gì cả. Người dùng đóng popup xong là mất đường quay lại.
  //
  // Cộng dồn từ CHÍNH mảng actions, không đọc thẳng `notice`: action thứ hai có việc đếm về sau
  // sẽ tự được cộng vào, không phải sửa chỗ này.
  const totalBadge = actions.reduce((n, a) => n + (a.badge ?? 0), 0);

  // Hình "cái tai gắn vào cạnh màn hình": bo góc BÊN TRÁI, vuông bên phải. Một viên thuốc lơ
  // lửng bị cắt mất một nửa thì đọc ra như lỗi hiển thị.
  const tabSkin = {
    background: "var(--cream-card)",
    color: "var(--ink)",
    border: "1px solid var(--border-md)",
    borderRight: "none",
    borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)",
    boxShadow: "0 2px 12px rgba(42,39,37,0.12)",
    cursor: "pointer",
  } as const;

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: "50%",
          // Neo cứng vào cạnh phải — KHÔNG dịch theo panel. Xem bài học 4.
          right: 0,
          transform: "translateY(-50%)",
          zIndex: Z.ACTION_DOCK,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          // Khoảng cách dọc do gap lo — KHÔNG còn action nào tự tính offset của action khác.
          gap: "6px",
        }}
      >
        <button
          type="button"
          onClick={collapsedStore.toggle}
          aria-expanded={!collapsed}
          aria-label={
            collapsed && totalBadge > 0
              ? `${totalBadge} việc cần xử lý — mở thanh hành động`
              : collapsed ? "Mở thanh hành động" : "Thu gọn thanh hành động"
          }
          title={
            collapsed && totalBadge > 0
              ? `${totalBadge} việc cần xử lý — mở thanh để xem`
              : collapsed ? "Mở thanh hành động" : "Thu gọn"
          }
          style={{
            ...tabSkin,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            // `gap` cho ca CÓ huy hiệu. Không có huy hiệu thì nó là một phần tử đơn — gap không
            // sinh khoảng trống nào, nên không cần điều kiện.
            gap: "4px",
            padding: "7px 5px 7px 7px",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--row-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--cream-card)"; }}
        >
          {collapsed
            ? <ChevronLeft style={ICON} />
            : <ChevronRight style={ICON} />}
          {/* CHỈ khi thu gọn: lúc mở, mỗi nút đã tự mang huy hiệu của nó rồi. Hiện cả hai chỗ
              là đếm một việc hai lần trong cùng một tầm mắt. */}
          {collapsed && <CountBadge count={totalBadge} />}
        </button>

        {/* Thu gọn thì KHÔNG dựng các nút action. Giữ chúng rồi ẩn bằng CSS là để lại một vùng
            bấm vô hình đè lên bảng — thứ không ai gỡ được vì không ai thấy nó. */}
        {!collapsed && actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setOpenKey(a.key)}
            aria-label={a.ariaLabel}
            title={a.label}
            style={{
              ...tabSkin,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 12px 9px 14px",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.02em",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--row-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--cream-card)"; }}
          >
            {a.icon}
            {a.label}
            <CountBadge count={a.badge ?? 0} />
          </button>
        ))}
      </div>

      {/* Hộp thoại chỉ được nạp KHI MỞ, và chỉ ĐÚNG MỘT hộp thoại tại một thời điểm.
          Hai hộp thoại này kéo theo bộ chọn ảnh, logic clipboard và phần hỏi đáp — không có lý
          do gì để chúng nằm trong bundle của mọi trang dashboard. */}
      {active?.renderDialog(closeActive)}
    </>
  );
}

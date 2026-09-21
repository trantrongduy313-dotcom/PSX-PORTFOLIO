"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, FolderOpen, Image as ImageIcon, RefreshCw, X } from "lucide-react";

// COMPLETION_STATUS / deniedReasonForSendResult / MANUAL_PROGRESS_STATUSES / Design3DProgressStatus
// đã theo form nộp kết quả sang progress-form.tsx — file này không còn dùng tới chúng.
import {
  formatKpiDelta,
  PROGRESS_STATUS_LABELS,
} from "@/app/lib/business/kpi-3d/progress";
// formatKpiUsagePercent / kpiUsageLevel / kpiUsageRatio thôi dùng ở màn này: dòng "⚠ dùng 17%
// giờ KPI" đã rời khỏi BẢNG (nó nói lại cùng con số mà dòng Sớm/Trễ đã nói). Tỉ lệ vẫn còn ở
// panel qua formatKpiUsage + kpiUsageNotice — và chỉ cho người duyệt.
import {
  formatKpiUsage,
  kpiUsageNotice,
} from "@/app/lib/business/kpi-3d/kpi-usage";
import { compareAssignmentsForQueue, isNewlyAssigned } from "@/app/lib/business/kpi-3d/queue-order";
import { isUrgentDesign, toDesignPriority } from "@/app/lib/business/kpi-3d/design-priority";
// Cắt hậu tố phiên bản khỏi số đơn ("26.432432.1" → "26.432432"). Dùng CHUNG với bảng Danh sách
// đơn hàng và sidebar — viết lại phép cắt ở đây là ba màn sẽ hiện ba số khác nhau.
import { getBaseSoNumber } from "@/app/lib/utils/order-helpers";
// Hậu tố phiên bản hiện bằng "_", đồng nhất với bảng Danh sách đơn hàng. Bản không cần cờ
// `isFromWebapp` — API assignments không chở Order.createdById.
import { formatVersionedDisplay } from "@/app/lib/business/order-helpers";
import {
  isWithinRange,
  MONTH_NUMBERS,
  rangeFromSelection,
  scopeLabel,
  yearOptions,
} from "@/app/lib/business/kpi-3d/stats-filters";
import {
  changedPriorityRowIds,
  mergePriorityMarks,
  snapshotPriorities,
} from "@/app/lib/business/kpi-3d/priority-change-marker";
import {
  design3DLifecycleBadge,
  design3DNoticeKind,
  formatDeadlineDistance,
  formatElapsed,
  kpiResultBadge,
  type StatusBadge,
} from "@/app/lib/business/kpi-3d/display";
import { REVIEW_STATUS_LABELS } from "@/app/lib/business/kpi-3d/review";
import { freshnessLabel } from "@/app/lib/business/kpi-3d/freshness";
// `suggestedRemainingMinutes` thôi dùng ở màn này cùng form mở lại. Hàm vẫn còn và vẫn đúng —
// sidebar dùng nó cho "+ Giao lượt tiếp theo", cửa DUY NHẤT còn lại để giao tiếp sau khi dừng.
import { alreadyCreditedMinutes } from "@/app/lib/business/kpi-3d/hours-ledger";
// MỘT dòng import cho vn-date: trước đây file này import nó ở hai chỗ cách nhau 12 dòng,
// nên rất dễ thêm một hàm ngày-giờ tự viết mà không thấy là nó đã có sẵn.
import {
  formatVnDateTime,
  todayVnYmd,
} from "@/app/lib/utils/vn-date";
import {
  // `countPendingReview` đã bỏ: thẻ "Chờ kiểm" nay đếm ở server (route stats) trên TOÀN BỘ phạm
  // vi, không suy từ 200 dòng đang hiện. Luật SQL tương ứng ở kpi-3d/stats-filters.ts.
  design3DPanelAction,
  isPendingReview,
  isReviewAccepted,
  isReworkRequested,
} from "@/app/lib/business/kpi-3d/review-queue";
import { isClosedAssignment, isOverdueAssignment } from "@/app/lib/business/kpi-3d/workload";
import { productSpecRows } from "@/app/lib/business/product-specs";
import { TONE_HEX } from "@/app/lib/ui/status-tone";
import { fetchJson } from "@/app/lib/utils/fetch-json";
import {
  AcknowledgeBox, DocLink, DocTile, Note, PanelRow, PanelSection,
  Stat, StatGroup, StatusChip, fmtDateTime, fmtHours, numCell,
} from "./design-3d-atoms";
import { PauseBox, ReassignedNotice, ReviewBox } from "./design-3d-boxes";
// `MomentFields` thôi dùng ở đây cùng với ô ngày/giờ tạm dừng. Component vẫn còn, các màn
// khác vẫn dùng — chỉ file này không nhập nữa.
import { OvertimePanel } from "./overtime-panel";
import {
  designRequestMismatch,
  designRequestMismatchLabel,
} from "@/app/lib/business/kpi-3d/design-request";
import { Label } from "./panel-atoms";
// Form cập nhật tiến độ / nộp kết quả — tách ra file riêng theo một đường nối thật. Ba khối đó
// chỉ nói về một việc và không khối nào quan tâm tới bảng, bộ lọc hay thống kê ở file này.
import {
  ProgressConfirmSheet,
  ProgressFields,
  useProgressForm,
} from "./progress-form";
// Hình dữ liệu của response cũng ở file riêng, KHÔNG export từ đây: form cần đúng ba type này,
// và nếu form import từ file này thì hai bên import vòng tròn.
import type { Assignment, ProgressLog } from "./types";
// `VideoPreview` không còn dùng ở màn này: Ảnh mẫu/Video nay là link ra Drive, không xem trước.
// Component vẫn còn và vẫn được sidebar dùng — chỉ màn này thôi nhập nó.
import { DesignFilePreview } from "@/app/dashboard/orders/_components/design-file-preview";

// Màn làm việc của NV Thiết kế 3D.
//
// Dùng BẢNG với bộ style chung psx-th/psx-tr/psx-td — giống mọi màn danh sách khác trong hệ
// thống (Quản lý User, Báo cáo KPI, Đánh giá Khâu...). Bản trước dùng thẻ card xếp dọc kèm
// nhãn lặp lại ở từng dòng: lạc lõng với phần còn lại của app và mật độ thông tin rất thấp.
//
// Nhãn trạng thái / cách hiển thị sớm-trễ lấy từ module business dùng chung
// (kpi-3d/progress.ts) để nhãn trên màn hình và nhãn ghi vào Lịch sử thay đổi không lệch nhau.

const filterLabelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 600, color: "var(--ink-muted)",
  textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
};

/** Chữ số thẳng hàng theo cột — chi tiết nhỏ nhưng quyết định cảm giác chuyên nghiệp ở bảng số. */


// Định nghĩa "đang mở" / "quá hạn" nay ở kpi-3d/workload.ts, dùng chung với API tính tải công
// việc. Trước đây chúng là hằng riêng tư ở đây nên API buộc phải viết lại lần hai — sửa một
// bên là hai màn báo hai con số khác nhau cho cùng một người.
//
// Đổi hành vi CÓ CHỦ Ý: bản cũ không loại lượt đã đóng khỏi "quá hạn", nên một lượt đã HUỶ mà
// qua ngày vẫn bị đếm là quá hạn. Việc đã huỷ thì không thể trễ.
const isOverdue = (a: Assignment) =>
  isOverdueAssignment({ status: a.status, completedAt: toDate(a.completedAt), deadlineAt: new Date(a.deadlineAt) }, new Date());
const isClosed = (a: Assignment) => isClosedAssignment(a.status);

/** API trả chuỗi ISO; các hàm nghiệp vụ nhận Date. */
const toDate = (v: string | null) => (v ? new Date(v) : null);

/**
 * Tình trạng của một lượt giao việc, gọn về MỘT nhãn + MỘT tông.
 *
 * Thang trạng thái nằm ở module business dùng chung (kpi-3d/display.ts) — cùng gốc với khối
 * thao tác trong panel, nên chip trong bảng và panel không thể nói hai điều khác nhau về
 * cùng một dòng.
 */
function lifecycleOf(a: Assignment): StatusBadge {
  // TẠM DỪNG THẮNG MỌI TRẠNG THÁI KHÁC trên chip.
  //
  // Người quét bảng cần biết ngay đơn nào đang bị gác — nếu vẫn hiện "Đang làm" thì bảng đang
  // nói dối: không ai đang làm nó cả, và deadline của nó cũng không còn chạy.
  if (a.pauses?.some((p) => p.resumedAt === null) && !isClosed(a)) {
    return { label: "Tạm dừng", tone: "warning" };
  }
  return design3DLifecycleBadge({
    status: a.status,
    completedAt: a.completedAt,
    reviewStatus: a.reviewStatus,
    acknowledgedAt: a.acknowledgedAt,
    latestProgressStatus: a.progressLogs[0]?.status ?? null,
  });
}


export function Design3DClient({
  isDesigner,
  canApproveOvertime,
  canReview,
}: {
  isDesigner: boolean;
  canApproveOvertime: boolean;
  /** ADMIN/ORDER — được kiểm kết quả 3D nội bộ. Chỉ họ mới thấy thẻ đếm và nút duyệt. */
  canReview: boolean;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"tasks" | "overtime">("tasks");
  const [openId, setOpenId] = useState<string | null>(null);

  // Bộ lọc — API đã hỗ trợ sẵn lọc theo nhân viên/trạng thái, trước đây giao diện chưa dùng tới.
  const [designerFilter, setDesignerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "" | "OPEN" | "OVERDUE" | "DONE" | "LATE" | "UNACKNOWLEDGED" | "REASSIGNED" | "PENDING_REVIEW" | "ACCEPTED" | "REWORK"
  >("");

  // ─── PHẠM VI cho nhóm thẻ KẾT QUẢ ──────────────────────────────────────────
  //
  // ⚠️ MẶC ĐỊNH LÀ KHÔNG LỌC. Nhóm thẻ bên trái vốn đã là toàn thời gian, nên để nhóm phải cũng
  // vậy thì cả dải cùng một phạm vi và người đọc không phải nhớ "bên trái khác bên phải". Năm và
  // tháng là phép THU HẸP do người dùng chủ động chọn, không phải trạng thái ban đầu.
  //
  // ⚠️ VÀ NÓ CHỈ ÁP CHO "Hoàn thành" / "Nộp muộn". KHÔNG BAO GIỜ áp cho "Đang làm" / "Đang trễ" /
  // "Chờ kiểm": một việc giao tháng 7 còn đang trễ tới hôm nay mà biến mất khi chọn tháng 8 thì
  // đúng cái việc gấp nhất lại là cái bị giấu đi.
  //
  // HAI Ô RỜI, có thứ bậc: `statsMonth` chỉ có nghĩa khi đã có `statsYear`. "Tháng 8 của mọi năm"
  // không phải một câu hỏi ai hỏi — giao diện khoá ô Tháng cho tới khi chọn Năm nên trạng thái đó
  // không dựng được.
  const [statsYear, setStatsYear] = useState<number | null>(null);
  const [statsMonth, setStatsMonth] = useState<number | null>(null);
  const statsRange = useMemo(() => rangeFromSelection(statsYear, statsMonth), [statsYear, statsMonth]);
  const scopeText = scopeLabel(statsYear, statsMonth);
  // Năm hiện tại lấy theo GIỜ VN: 06:00 ngày 01/01 ở VN vẫn là 31/12 ở UTC, và `getFullYear()`
  // của máy chủ sẽ thiếu mất năm hiện tại suốt buổi sáng đầu năm.
  const currentVnYear = useMemo(() => Number(todayVnYmd().slice(0, 4)), []);

  // ─── NẠP DỮ LIỆU ───────────────────────────────────────────────────────────
  //
  // Trước bản này màn hình tự quản `useState` + một `useEffect(() => void load(), [load])` chạy
  // ĐÚNG MỘT LẦN. Nghĩa là NV 3D ngồi mở màn cả buổi KHÔNG BAO GIỜ thấy đơn vừa được giao, và
  // Admin không biết nhân viên đã cập nhật hay đã xong — cả hai phải F5.
  //
  // Chuyển sang react-query vì ba thứ cần ở đây (poll theo nhịp, làm mới khi quay lại tab, chặn
  // hai request chồng nhau) nó đã có sẵn, còn tự viết là ba cái timer phải tự huỷ đúng lúc. Phần
  // còn lại của app cũng dùng react-query — hai cách quản dữ liệu trong một app là nơi lỗi mọc.
  //
  // `staleTime: Infinity` + KHÔNG `refetchInterval` ở query này là CÓ Ý: nhịp làm mới do heartbeat
  // quyết định (xem dưới), nên danh sách nặng chỉ được kéo khi thật sự có gì đổi.
  const {
    data: rows = [],
    isLoading: loading,
    isFetching,
    error: queryError,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["design-3d-assignments"],
    // fetchJson lo việc đọc text rồi mới parse — gọi res.json() trên body rỗng (500 không có
    // body) sẽ ném "Failed to execute 'json'" và che mất lỗi thật của server.
    queryFn: () => fetchJson<Assignment[]>("/api/design-3d/assignments?limit=200", { cache: "no-store" }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // `refreshing` = đang tải lại KHI ĐÃ CÓ dữ liệu trên màn. Tách khỏi `loading` là bắt buộc:
  // gộp một cờ thì mỗi lần lưu sẽ thay TOÀN BỘ màn bằng chữ "Đang tải…" — mất bảng, mất dải
  // thống kê, và panel đang mở bị đóng sập, mất luôn chỗ đang cuộn tới.
  const refreshing = isFetching && !loading;

  /** Làm mới sau khi ghi — giữ nguyên bảng và panel đang mở. */
  const refresh = useCallback(async () => {
    const res = await refetch();
    // Làm mới thất bại thì BÁO BẰNG TOAST, không thay màn bằng trang lỗi: dữ liệu đang hiện vẫn
    // dùng được, và việc vừa ghi thì đã ghi xong rồi. Đổi sang trang lỗi sẽ khiến người dùng
    // tưởng thao tác vừa rồi thất bại.
    if (res.error) toast.error(`Không tải lại được danh sách: ${(res.error as Error).message}`);
  }, [refetch]);

  /**
   * GHI THẲNG KẾT QUẢ VỪA LƯU VÀO CACHE — bảng và panel đổi NGAY, không đợi vòng tải lại.
   *
   * LỖI TRẢI NGHIỆM ĐANG SỬA: nút "Lưu cập nhật" / "Hoàn tất & gửi" xưa nay `await onSaved()`,
   * tức nó ĐỢI CẢ VÒNG KÉO LẠI 200 lượt (kèm progressLogs, pauses, tài liệu MO) rồi mới nhả.
   * Hai độ trễ xếp nối nhau cho một việc mà server đã làm xong từ đầu: người dùng nhìn nút
   * "Đang lưu…" thêm vài giây SAU KHI dữ liệu đã ghi. Cái chờ đó không mua được gì cho họ.
   *
   * ⚠️ CHỈ NHẬN SỐ CỦA SERVER, không tự tính lại ở trình duyệt. Mọi trường trong `patch` phải
   * đến từ response — completedAt, kpiStatus, reviewStatus đều là phán quyết KPI, đoán ở client
   * là dựng nguồn sự thật thứ hai đúng chỗ đắt nhất. Vòng revalidate ngay sau đó vẫn là trọng
   * tài cuối, nên đây thuần là rút ngắn quãng chờ chứ không phải một đường ghi dữ liệu mới.
   */
  const applyLocalPatch = useCallback(
    (assignmentId: string, patch: Partial<Assignment>, newLog?: ProgressLog) => {
      queryClient.setQueryData<Assignment[]>(["design-3d-assignments"], (prev) =>
        prev?.map((r) =>
          r.id === assignmentId
            ? {
                ...r, ...patch,
                progressLogs: newLog ? [newLog, ...r.progressLogs] : r.progressLogs,
              }
            : r,
        ),
      );
    },
    [queryClient],
  );

  /**
   * Làm mới NGẦM — không ai phải đợi nó.
   *
   * Dùng sau khi đã vá cache: màn hình đã đúng, vòng này chỉ để lấy những trường mà response
   * của lệnh ghi không trả (tên người xác nhận, số liệu dẫn xuất). Lỗi ở đây KHÔNG báo toast:
   * việc vừa rồi đã ghi xong, một toast đỏ lúc này chỉ làm người dùng tưởng là thất bại.
   */
  const revalidate = useCallback(() => { void refetch(); }, [refetch]);

  // Trang lỗi CHỈ khi chưa có gì để hiện. Có dữ liệu cũ mà một lần poll thất bại thì giữ bảng.
  const error = rows.length === 0 && queryError ? (queryError as Error).message : null;

  // ─── HEARTBEAT: "có gì mới không" ──────────────────────────────────────────
  //
  // Chỉ hai con số + bốn mốc (xem kpi-3d/freshness.ts), KHÔNG phải 200 lượt kèm progressLogs /
  // pauses / tài liệu MO. Poll thẳng danh sách mỗi 20 giây sẽ nặng gấp vài chục lần cho cùng một
  // thông tin. Danh sách đơn hàng đã tách heartbeat ra vì đúng lý do này (fetchOrdersMeta).
  //
  // `refetchIntervalInBackground: false` — tab ở nền thì ngừng hẳn. Không ai đọc thì đừng gọi.
  const { data: meta } = useQuery({
    // ─── CHỮ KÝ THEO ĐÚNG PHẠM VI ĐANG XEM ──────────────────────────────────
    //
    // Route meta ĐÃ hỗ trợ `designer3DId` từ trước, và NV 3D thì tự bị thu về hồ sơ của chính
    // họ. Chỗ thiếu nằm ở ĐÂY: client không gửi bộ lọc, nên Quản lý/Đặt đơn đang lọc "chỉ xem
    // Việt 3D" vẫn nhận CHỮ KÝ TOÀN CỤC.
    //
    // Hậu quả không phải là nhịp poll (poll rẻ) mà là SỐ LẦN KÉO DANH SÁCH. Bất kỳ ai đổi bất
    // kỳ thứ gì → chữ ký đổi → MỌI máy đang mở cùng kéo lại 200 lượt kèm progressLogs/pauses/
    // tài liệu trong cùng một giây. Với 10 người còn chịu được; đây là chỗ gãy đầu tiên khi
    // thêm người, chứ không phải nhịp 20 giây.
    //
    // `designerFilter` NẰM TRONG queryKey: đổi bộ lọc là một phạm vi khác, phải là một chữ ký
    // khác. Nhờ đó cũng TỰ LÀNH được ca "trong lúc lọc, người khác đổi dữ liệu": bỏ lọc ra là
    // khoá đổi → lấy chữ ký toàn cục mới → lệch với chữ ký đang hiện → kéo lại ngay.
    queryKey: ["design-3d-assignments-meta", designerFilter],
    // `pendingOvertime` đi nhờ chuyến này — xem chú thích ở route meta về việc vì sao nó KHÔNG
    // nằm trong `signature`. Nhờ vậy huy hiệu tự già đi theo nhịp 20 giây mà không thêm vòng poll
    // nào, và một khai báo tăng ca không kéo theo một lần tải lại 200 lượt giao việc.
    queryFn: () => fetchJson<{ signature: string; pendingOvertime?: number }>(
      `/api/design-3d/assignments/meta${designerFilter ? `?designer3DId=${encodeURIComponent(designerFilter)}` : ""}`,
      { cache: "no-store" },
    ),
    staleTime: 0,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    // Đang kéo danh sách thì đừng chen thêm một request nữa — chữ ký lúc đó chắc chắn sẽ khớp
    // ngay sau khi kéo xong.
    enabled: !isFetching,
  });

  // Chữ ký ứng với dữ liệu ĐANG HIỆN. So lệch thì TỰ KÉO, không hiện badge chờ bấm.
  //
  // ⚠️ KHÁC danh sách đơn hàng có chủ ý: bên đó hiện badge "có thay đổi" và chờ người dùng bấm
  // Sync, vì họ đang đọc chủ động 200 dòng và một lần tự tải lại sẽ nhảy mất chỗ đang xem. Ở đây
  // NV 3D KHÔNG ĐƯỢC BỎ SÓT một đơn vừa giao, nên tự kéo. Việc kéo chỉ thay bảng — panel đang mở
  // và form tiến độ đang gõ dở không bị chạm, đúng như đường `refresh()` sau mỗi lần ghi.
  // MỘT chỗ duy nhất ghi ref này. Bản đầu của tôi có thêm một effect nữa chốt lại chữ ký mỗi khi
  // `dataUpdatedAt` đổi — nó không thay đổi hành vi (lần poll sau vẫn tự so và tự kéo) mà chỉ
  // tạo ra hai chỗ cùng ghi một ref, tức một chỗ để đọc sai về sau.
  const shownSignatureRef = useRef<string | null>(null);
  // Phạm vi của chữ ký ĐANG ghi trong ref. Đổi bộ lọc là đổi phạm vi, và hai chữ ký thuộc hai
  // phạm vi khác nhau thì KHÔNG SO ĐƯỢC với nhau.
  const shownScopeRef = useRef(designerFilter);
  useEffect(() => {
    // Đổi phạm vi → quên chữ ký cũ, rơi về nhánh "lần đầu chỉ ghi nhận".
    //
    // Không có bước này thì mỗi lần bấm bộ lọc là một lần kéo lại 200 dòng — trong khi danh
    // sách vốn tải TOÀN BỘ rồi lọc tại chỗ, tức dữ liệu đã nằm sẵn trong máy. Sửa một chỗ tốn
    // kém mà đẻ ra một chỗ tốn kém khác thì không được gì.
    if (shownScopeRef.current !== designerFilter) {
      shownScopeRef.current = designerFilter;
      shownSignatureRef.current = null;
    }
    const sig = meta?.signature;
    if (!sig || loading || isFetching) return;
    // Lần đầu chỉ GHI NHẬN, không kéo: bảng vừa tải xong rồi.
    if (shownSignatureRef.current === null) { shownSignatureRef.current = sig; return; }
    if (shownSignatureRef.current === sig) return;
    // Ghi ref TRƯỚC khi kéo, không phải sau: kéo xong mới ghi thì mọi nhịp poll trong lúc đang
    // kéo đều thấy lệch và xếp thêm một lần kéo nữa.
    shownSignatureRef.current = sig;
    void refetch();
    // Dải thẻ đếm phải đi CÙNG NHỊP với bảng. Không làm mới cùng lúc thì bảng hiện một việc vừa
    // hoàn tất trong khi thẻ "Hoàn thành" vẫn là số cũ — hai con số cạnh nhau nói khác nhau về
    // cùng một dữ liệu, và người dùng không biết tin cái nào.
    void queryClient.invalidateQueries({ queryKey: ["design-3d-assignments-stats"] });
  }, [meta?.signature, designerFilter, loading, isFetching, refetch, queryClient]);

  // Nhịp đập để nhãn "Cập nhật N phút trước" tự già đi. KHÔNG gọi mạng — chỉ là một mốc thời
  // gian trong state, nên 30 giây một lần là đủ mịn cho một nhãn tính theo phút.
  //
  // Cần một nhịp riêng vì `dataUpdatedAt` chỉ đổi khi có dữ liệu mới: không có nó thì nhãn đứng
  // im ở "vừa xong" trong suốt thời gian không có gì thay đổi — đúng lúc người dùng cần biết dữ
  // liệu đã cũ thì nó lại nói là mới.
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Quay lại tab → hỏi heartbeat NGAY, không đợi tới nhịp 20 giây tiếp theo.
  //
  // Đây là tín hiệu mạnh nhất rằng người dùng đang thật sự nhìn: NV 3D alt-tab liên tục giữa
  // Rhino/3ds Max và trình duyệt, nên gần như mọi lần họ đọc màn này đều đi kèm một lần focus.
  useEffect(() => {
    const onFocus = () => {
      void queryClient.invalidateQueries({ queryKey: ["design-3d-assignments-meta"] });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [queryClient]);

  // ─── DẤU "ƯU TIÊN VỪA ĐỔI" ──────────────────────────────────────────────────
  //
  // Ưu tiên đổi thì chip đổi VÀ dòng nhảy vị trí (ưu tiên là tầng 3 của thứ tự hàng đợi) — cả hai
  // lặng lẽ. Người đang nhìn thấy bảng tự xáo mà không biết đơn nào vừa được nâng.
  //
  // So bản trước với bản sau ngay ở đây; luật + lý do không dùng nhãn hết hạn theo thời gian nằm
  // ở kpi-3d/priority-change-marker.ts (có test riêng).
  //
  // `prevPrioritiesRef` giữ bản chụp lần trước. Dùng ref chứ không dùng state: nó KHÔNG được vẽ
  // ra màn hình, nên để vào state là tự thêm một lần render mỗi lần kéo dữ liệu.
  const prevPrioritiesRef = useRef<Map<string, string> | null>(null);
  const [changedPriorityIds, setChangedPriorityIds] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (loading) return;
    const incoming = changedPriorityRowIds(prevPrioritiesRef.current, rows);
    // Chụp lại NGAY, kể cả khi không có gì đổi: bỏ qua bước này thì lần kéo sau vẫn so với bản
    // cũ mèm và báo "vừa đổi" cho một thay đổi người dùng đã xem rồi.
    prevPrioritiesRef.current = snapshotPriorities(rows);
    if (incoming.size === 0) return;
    setChangedPriorityIds((cur) => mergePriorityMarks(cur, incoming));
  }, [rows, loading]);

  // Server đã quyết ai được thấy con số này (pendingOvertimeScope: chỉ người duyệt, và trừ đi
  // yêu cầu do chính họ khai — tự duyệt là bị cấm). Client KHÔNG lọc lại: hai nơi cùng quyết một
  // luật phân quyền là chỗ chắc chắn sẽ lệch.
  const pendingOvertime = meta?.pendingOvertime ?? 0;

  const designers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.designer3D) seen.set(r.designer3D.id, r.designer3D.name);
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (designerFilter && r.designer3D?.id !== designerFilter) return false;

      // ── THÁNG GIAO VIỆC — LỌC CẢ BẢNG ────────────────────────────────────────
      //
      // Trục là `assignedAt`. Khi người ở xưởng nói "việc của tháng 8" họ nói về những MO ĐƯỢC
      // GIAO trong tháng 8, kể cả cái chưa xong — lọc theo ngày hoàn thành thì một tháng toàn
      // việc đang chạy ra bảng rỗng.
      //
      // Cùng khoảng, cùng phép so với `assignedInRangeWhere` ở server, để bảng và hai thẻ Kết
      // quả không lệch nhau ở ranh giới tháng.
      if (statsRange && !isWithinRange(r.assignedAt, statsRange)) return false;

      if (statusFilter === "OVERDUE") return isOverdue(r);
      if (statusFilter === "DONE") return !!r.completedAt;
      if (statusFilter === "LATE") return r.kpiStatus === "LATE";
      if (statusFilter === "REASSIGNED") return !!r.reassignedAt;
      if (statusFilter === "OPEN") return !r.completedAt && !isClosed(r);
      // Để Order lọc ra những việc đã giao mà NV chưa xác nhận, đi nhắc đúng người.
      if (statusFilter === "UNACKNOWLEDGED") return !r.acknowledgedAt && !isClosed(r);
      // Trục kiểm nội bộ — cùng định nghĩa với thẻ đếm ở trên (kpi-3d/review-queue.ts), nên
      // bấm vào thẻ "Chờ duyệt" chắc chắn ra đúng bấy nhiêu dòng.
      if (statusFilter === "PENDING_REVIEW") return isPendingReview(r);
      if (statusFilter === "ACCEPTED") return isReviewAccepted(r);
      if (statusFilter === "REWORK") return isReworkRequested(r);
      return true;
    });
  }, [rows, designerFilter, statusFilter, statsRange]);

  // Chưa NHẬN VIỆC lên đầu (mới giao nhất trước), rồi tới hạn gần nhất, đã xong dồn xuống cuối.
  // Luật nằm ở kpi-3d/queue-order.ts và có test riêng — trước đây viết thẳng ở đây nên không
  // kiểm được, mà thứ tự hàng đợi là thứ nhân viên dựa vào để không trễ hạn.
  // Ưu tiên thiết kế nằm trên OrderItem (một MO có thể có nhiều lượt giao — ưu tiên là của việc,
  // không của người), nên phải nhấc lên phẳng cho hàm so sánh. `queue-order.ts` cố ý KHÔNG biết
  // hình dạng dữ liệu của API: nó nhận đúng những trường nó dùng, nên đổi select không làm vỡ nó.
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => compareAssignmentsForQueue(
      { ...a, designPriorityCode: a.orderItem?.design3DPriorityCode },
      { ...b, designPriorityCode: b.orderItem?.design3DPriorityCode },
    )),
    [filtered],
  );

  // ─── DẢI THẺ ĐẾM — LẤY TỪ SERVER, KHÔNG SUY TỪ DANH SÁCH ────────────────────
  //
  // ⚠️ BẢN TRƯỚC ĐẾM TRÊN `rows`, tức 200 dòng vừa tải về (`deadlineAt asc, limit 200`). Hôm nay
  // xưởng có vài việc nên không ai thấy gì. Khi tích lũy tới vài trăm việc đã xong thì 200 dòng
  // lấy về là 200 deadline SỚM NHẤT — toàn việc cũ đã xong — còn việc đang làm bị đẩy ra ngoài
  // danh sách, và mọi con số báo thiếu mà không có một dấu hiệu nào.
  //
  // Thẻ "Hoàn thành" là con số CHỈ TĂNG nên nó chạm trần đầu tiên. Đếm bằng `count` ở server thì
  // danh sách vẫn phân trang được mà con số vẫn đúng.
  //
  // `staleTime: Infinity` + không `refetchInterval`: cùng nhịp với danh sách, do heartbeat quyết
  // định (xem effect chốt chữ ký) — không thêm một vòng poll nào.
  const { data: serverStats } = useQuery({
    queryKey: ["design-3d-assignments-stats", statsYear, statsMonth, designerFilter],
    queryFn: () => fetchJson<{
      total: number; open: number; pendingReview: number;
      completed: number; late: number; earliestYear: number | null;
    }>(
      // KHÔNG gửi year/month khi chưa chọn — server hiểu là toàn thời gian. Gửi một khoảng thật
      // rộng thay cho "không lọc" thì vẫn là một điều kiện, và nó âm thầm loại các bản ghi có
      // completedAt rác nằm ngoài khoảng.
      "/api/design-3d/assignments/stats?" +
        new URLSearchParams({
          ...(statsYear ? { year: String(statsYear) } : {}),
          ...(statsYear && statsMonth ? { month: String(statsMonth) } : {}),
          ...(designerFilter ? { designer3DId: designerFilter } : {}),
        }).toString(),
      { cache: "no-store" },
    ),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Số 0 khi chưa có dữ liệu — KHÔNG để trống. Ô trống ở dải này đọc như "hệ thống hỏng", còn số
  // 0 trong khoảnh khắc đầu rồi nhảy sang số thật là chuyện người dùng vốn quen.
  const stats = serverStats ?? {
    total: 0, open: 0, pendingReview: 0, completed: 0, late: 0, earliestYear: null,
  };
  const years = useMemo(
    () => yearOptions(serverStats?.earliestYear ?? null, currentVnYear),
    [serverStats?.earliestYear, currentVnYear],
  );

  // MỘT mốc "bây giờ" cho cả bảng. Gọi new Date() trong từng dòng thì mỗi dòng được tính ở
  // một thời điểm lệch nhau vài ms — vô hại nhưng vô cớ, và khiến hai dòng cùng deadline có
  // thể ra hai con số khác nhau ngay ranh giới phút.
  const now = new Date();

  // Tìm trong `rows` chứ KHÔNG trong `sorted`: sau khi lưu tiến độ, việc có thể rớt khỏi bộ
  // lọc đang chọn (VD lọc "Đang làm" mà vừa bấm "Đã gửi kết quả") — nếu tìm theo danh sách
  // đã lọc thì panel biến mất đột ngột ngay khi lưu xong.
  const opened = rows.find((r) => r.id === openId) ?? null;

  const tabs = (
    <div style={{ flexShrink: 0, display: "flex", gap: "2px", padding: "0 24px", borderBottom: "1px solid var(--border)", background: "var(--cream-card)" }}>
      {([["tasks", "Việc được giao"], ["overtime", "Tăng ca"]] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key)}
          style={{
            padding: "9px 14px", fontSize: "12px", fontWeight: tab === key ? 700 : 400,
            background: "none", border: "none", cursor: "pointer",
            color: tab === key ? "var(--ink)" : "var(--ink-muted)",
            borderBottom: `2px solid ${tab === key ? "var(--ink)" : "transparent"}`,
            marginBottom: "-1px",
            display: "flex", alignItems: "center", gap: "6px",
          }}
        >
          {label}
          {/* SỐ NẰM TRÊN CHÍNH CÁI NHÃN phải bấm vào.
              Khai báo tăng ca là luồng duy nhất cần người duyệt mà không phát tín hiệu nào: quản
              lý phải tự nhớ mà mở tab, không nhớ thì nó nằm đó không ai biết. Đặt số ở đâu khác
              cũng chỉ là nói lại một lần nữa rằng "hãy nhớ mở tab". */}
          {key === "overtime" && pendingOvertime > 0 && (
            <span
              // Cùng bộ mặt với huy hiệu Cảnh báo ở sidebar — người dùng đã học nó rồi, đặt ra
              // một kiểu huy hiệu thứ hai là bắt họ học lại.
              style={{
                fontSize: "10px", fontWeight: 700, lineHeight: 1.6,
                background: "var(--s-red)", color: "#fff",
                padding: "0 6px", borderRadius: "999px", minWidth: "18px", textAlign: "center",
              }}
              title={`${pendingOvertime} khai báo tăng ca đang chờ bạn duyệt`}
            >
              {pendingOvertime}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  if (tab === "overtime") {
    return (
      <>
        {tabs}
        <OvertimePanel canApprove={canApproveOvertime} />
      </>
    );
  }

  if (loading) {
    return (
      <>
        {tabs}
        <div style={{ padding: "24px", fontSize: "13px", color: "var(--ink-muted)" }}>Đang tải…</div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {tabs}
        <div style={{ padding: "24px" }}>
          <div style={{ padding: "12px 14px", borderRadius: "6px", fontSize: "13px", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}>
            {error}
          </div>
          <button type="button" onClick={() => void refetch()} className="psx-btn-secondary" style={{ marginTop: "10px", height: "32px", fontSize: "12px" }}>
            Thử lại
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {tabs}

      {opened && (
        <AssignmentDetailPanel
          // KEY THEO LƯỢT: panel giữ state riêng (sheet đang mở, các ô đang gõ dở). Không có key
          // thì mở đơn A, bấm Tạm dừng, đóng panel, mở đơn B → form tạm dừng của A vẫn đang mở
          // trên đơn B, kèm mấy con số đã điền cho A.
          key={opened.id}
          assignment={opened}
          canReview={canReview}
          // Người xem chính là NV làm việc này — quyết định ẩn tỉ lệ giờ KPI. Xem chú thích ở
          // cụm "Kết quả KPI" trong AssignmentDetailPanel.
          isDesigner={isDesigner}
          onClose={() => setOpenId(null)}
          onSaved={refresh}
          onLocalPatch={applyLocalPatch}
          onRevalidate={revalidate}
        />
      )}

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {/* ─── DẢI THẺ ĐẾM: HAI NHÓM, CÓ VẠCH NGĂN ────────────────────────────────
            Bản trước là một dãy 5 thẻ đồng hạng — ngầm bảo "cùng loại, so được với nhau", mà
            không. "Quá hạn" và "Trễ hạn" đứng cạnh nhau là ví dụ rõ nhất: hai từ đồng nghĩa
            trong tiếng Việt, gắn lên hai khái niệm khác hẳn.

              · VIỆC PHẢI LÀM — thì HIỆN TẠI, giảm được khi ai đó làm xong, LUÔN toàn thời gian.
              · KẾT QUẢ       — thì QUÁ KHỨ, phán quyết đã đóng dấu, đếm theo tháng.

            Đổi tên theo đúng hai thì đó: "Quá hạn" → ĐANG TRỄ, "Trễ hạn" → NỘP MUỘN. Một việc
            đang Đang trễ, khi NV nộp bài thì rời khỏi đó và rơi vào Nộp muộn — hai chặng của
            cùng một câu chuyện, không bao giờ nằm ở cả hai cùng lúc.

            Mọi con số ĐẾM Ở SERVER (route stats), không suy từ 200 dòng đang hiện — xem
            kpi-3d/stats-filters.ts. */}
        {/* ⚠️ HAI Ô CHỌN PHẠM VI NẰM NGAY TRONG NHÓM KẾT QUẢ, không ở hàng lọc bảng.
            ĐÂY LÀ GỐC RỄ của một hiểu nhầm lặp ba lần: đặt chúng ở hàng lọc — nơi mọi ô khác
            đều lọc BẢNG — thì ai cũng đợi bảng đổi theo, rồi thấy bảng đứng im và kết luận là
            hỏng. Không chú thích nào chữa được điều đó; vị trí mới là thứ người dùng đọc.
            Nằm trong nhóm thì rõ ngay chúng chỉ tác động hai con số bên cạnh — và nhóm trái
            không có ô nào nên hiển nhiên là không bị ảnh hưởng, khỏi cần ghi "toàn thời gian".
            Đó cũng là lý do bỏ được hậu tố dài ở cả hai tiêu đề: chữ ít đi, nghĩa rõ hơn. */}
        {/* ─── HAI THẺ RIÊNG, KHÔNG PHẢI MỘT HỘP CÓ VẠCH NGĂN ──────────────────────
            Bản trước là một hộp rộng hết màn, hai nhóm ngăn nhau bằng một sợi kẻ dọc. Ba chỗ
            hỏng cùng lúc:

              · Nhãn nhóm và nhãn số CÙNG cỡ, cùng viết hoa, cùng màu xám — mắt đọc thành năm
                nhãn ngang hàng rồi mới lùi lại tìm xem cái nào là tiêu đề.
              · Vì nhãn nhóm không ra dáng tiêu đề, cả cấu trúc dồn lên MỘT sợi hairline.
              · Hộp rộng hết màn mà nội dung chỉ chiếm nửa trái — nửa phải là khoảng trống CÓ
                VIỀN, đọc như "chỗ này chưa làm xong".

            Hai nhóm này khác nhau về THÌ (việc đang phải làm ‖ phán quyết đã đóng dấu). Dùng
            KIỂU CHỮ để diễn đạt một khác biệt CẤU TRÚC thì bao giờ cũng yếu. Hai thẻ tách rời
            thì ranh giới là thật — không cần vạch kẻ, không bắt nhãn gánh việc phân nhóm.

            `alignItems: stretch` + cùng một khuôn StatGroup: hai thẻ CÙNG CHIỀU CAO và các số
            thẳng hàng vì CẤU TRÚC, không phải nhờ chỉnh tay. Đây chính là chỗ từng bị "các card
            bị lệch" — tách ra mà không giữ chung khuôn là lỗi cũ quay lại dưới hình dạng mới. */}
        <div style={{
          display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "stretch",
          marginBottom: "12px",
        }}>
          {/* Hai tiêu đề KHÔNG còn ghi phạm vi. Nay MỌI con số và cả bảng cùng theo một phạm vi
              duy nhất — hai ô "Năm giao việc"/"Tháng" ngay hàng dưới đã nói, nhắc lại nữa chỉ là
              chữ thừa. Việc tách hai nhóm vẫn giữ, vì chúng khác THÌ: bên trái là việc đang phải
              làm, bên phải là phán quyết đã đóng dấu. */}
          <StatGroup caption="Việc phải làm">
            <Stat label="Tổng việc" value={stats.total} />
            <Stat label="Đang làm" value={stats.open} />
            {/* KHÔNG có thẻ "Đang trễ" nữa, và đó là chủ ý.
                Bảng đã nói việc trễ to hơn hẳn một con số: mốc deadline in đỏ, dòng phụ "trễ 17
                giờ", và vạch đỏ ở lề trái dòng. Một thẻ đếm chỉ lặp lại điều đó bằng chữ nhỏ hơn,
                mà lại chiếm màu đỏ duy nhất của dải — làm cả dải ồn lên vì thứ đã hiển nhiên.
                Vẫn lọc được: mục "Đang trễ" còn nguyên trong ô Trạng thái. */}
            {/* Chỉ ADMIN/ORDER: NV 3D không duyệt được nên với họ đây là con số vô nghĩa. */}
            {canReview && (
              <Stat
                // Dùng ĐÚNG nhãn của cột "Kiểm nội bộ" — đặt tên khác cho cùng một trạng thái
                // là cách chắc chắn để người dùng tưởng đó là hai thứ khác nhau.
                label={REVIEW_STATUS_LABELS.PENDING_REVIEW}
                value={stats.pendingReview}
                color={stats.pendingReview > 0 ? "#b45309" : undefined}
                active={statusFilter === "PENDING_REVIEW"}
                onClick={() => setStatusFilter((s) => (s === "PENDING_REVIEW" ? "" : "PENDING_REVIEW"))}
              />
            )}
          </StatGroup>

          {/* Ô chọn phạm vi ĐÃ CHUYỂN XUỐNG HÀNG LỌC: nay nó lọc CẢ BẢNG, nên nó thuộc về chỗ
              của các bộ lọc bảng. Để trong nhóm thẻ thì lại ngầm bảo "chỉ đổi hai con số này". */}
          <StatGroup caption="Kết quả">
            <Stat
              label="Hoàn thành"
              value={stats.completed}
              active={statusFilter === "DONE"}
              onClick={() => setStatusFilter((s) => (s === "DONE" ? "" : "DONE"))}
            />
            {/* Bấm được, như thẻ Hoàn thành. Trước đây đây là con số ĐỎ duy nhất trong dải không
                mở ra được danh sách tương ứng — người dùng hỏi "trễ những đơn nào?" rồi không có
                đường trả lời. */}
            <Stat
              label="Nộp muộn"
              value={stats.late}
              color={stats.late > 0 ? "#b91c1c" : undefined}
              active={statusFilter === "LATE"}
              onClick={() => setStatusFilter((s) => (s === "LATE" ? "" : "LATE"))}
            />
          </StatGroup>
        </div>

        {/* Dải nhắc việc — thẻ đếm ở trên vẫn cần người dùng đọc số; dải này NÓI THẲNG là có
            việc cần làm và mở sẵn đường tới đó. Chỉ hiện khi thật sự còn việc, nên nó không
            bao giờ thành thứ trang trí mà người dùng học cách bỏ qua. */}
        {canReview && stats.pendingReview > 0 && statusFilter !== "PENDING_REVIEW" && (
          <div style={{
            display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
            padding: "10px 14px", marginBottom: "12px",
            background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "6px",
            fontSize: "13px", color: "#78350f",
          }}>
            <span>
              <strong>{stats.pendingReview}</strong> kết quả thiết kế đang chờ bạn duyệt.
            </span>
            <button
              type="button"
              onClick={() => setStatusFilter("PENDING_REVIEW")}
              className="psx-btn-secondary"
              style={{ height: "28px", fontSize: "12px" }}
            >
              Xem danh sách
            </button>
          </div>
        )}

        {/* Thanh lọc — mỗi ô chọn PHẢI ghi rõ chiều rộng: class psx-input có width:100%
            nên không ghi đè sẽ giãn chiếm trọn một dòng. Cùng khuôn với Báo cáo KPI. */}
        <div style={{ display: "flex", gap: "14px", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
          {!isDesigner && designers.length > 1 && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <label style={filterLabelStyle}>Nhân viên</label>
              <select
                value={designerFilter}
                onChange={(e) => setDesignerFilter(e.target.value)}
                className="psx-input"
                style={{ fontSize: "13px", width: "168px" }}
              >
                <option value="">Tất cả</option>
                {designers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          {/* ─── NĂM/THÁNG GIAO VIỆC — lọc CẢ BẢNG lẫn hai thẻ Kết quả ────────────
              ⚠️ NHÃN PHẢI NÓI RÕ TRỤC LÀ "GIAO VIỆC". Trục là `assignedAt`, không phải ngày hoàn
              thành: khi người ở xưởng nói "việc của tháng 8", họ nói về những MO ĐƯỢC GIAO trong
              tháng 8 — kể cả cái chưa xong. Lọc theo ngày hoàn thành thì một tháng toàn việc đang
              chạy sẽ ra bảng rỗng, và người dùng kết luận bộ lọc hỏng. Đó là chuyện đã xảy ra.

              Hệ quả phải nói ra: "Hoàn thành" ở màn này = "giao tháng đó VÀ đã xong", khác với
              cột Đơn hoàn thành của báo cáo KPI (đếm theo ngày hoàn tất). Hai câu hỏi khác nhau —
              đây hỏi về một LỨA việc, báo cáo hỏi về sản lượng của tháng. */}
          {/* MỖI Ô MỘT NHÃN — trước đây một nhãn "Tháng giao việc" đứng trước CẢ HAI ô, nhưng
              khoảng cách tới ô đầu y hệt các cặp nhãn-ô khác trong hàng, nên mắt đọc nó là nhãn
              của ô ngay bên phải: ô NĂM. Người dùng thấy "Tháng giao việc" mà xổ ra 2026.
              Nhãn nhóm chỉ đọc được như nhóm khi nó TRÔNG khác nhãn đơn — rẻ hơn và chắc hơn
              là bỏ hẳn nhãn nhóm, để cả hàng chỉ còn một quy luật: một nhãn, một ô. */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={filterLabelStyle}>Năm giao việc</label>
            <select
              value={statsYear ?? ""}
              onChange={(e) => {
                const y = e.target.value ? Number(e.target.value) : null;
                setStatsYear(y);
                // Bỏ năm về "Tất cả" thì tháng phải về theo, nếu không còn một giá trị treo mà
                // không còn tác dụng gì.
                if (!y) setStatsMonth(null);
              }}
              className="psx-input"
              style={{ fontSize: "13px", width: "96px", ...numCell }}
            >
              <option value="">Tất cả</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <label style={filterLabelStyle}>Tháng</label>
            <select
              value={statsMonth ?? ""}
              onChange={(e) => {
                const m = e.target.value ? Number(e.target.value) : null;
                setStatsMonth(m);
                // Chọn tháng mà chưa có năm → điền năm hiện tại. Không có bước này thì lựa chọn
                // KHÔNG có tác dụng gì (rangeFromSelection bỏ qua tháng khi thiếu năm) — một ô
                // bấm được mà bấm xong không đổi gì còn tệ hơn ô bị khoá.
                if (m && !statsYear) setStatsYear(currentVnYear);
              }}
              className="psx-input"
              style={{ fontSize: "13px", width: "96px", ...numCell }}
            >
              <option value="">Cả năm</option>
              {/* CHỈ SỐ THÁNG, không "Th6": nhãn "Tháng" nằm ngay sát bên trái ô này. */}
              {MONTH_NUMBERS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={filterLabelStyle}>Trạng thái</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="psx-input"
              style={{ fontSize: "13px", width: "148px" }}
            >
              <option value="">Tất cả</option>
              <option value="OPEN">Đang làm</option>
              <option value="UNACKNOWLEDGED">Chưa nhận việc</option>
              {/* Cùng chữ với thẻ đếm ở trên. Bấm thẻ "Đang trễ" rồi thấy ô lọc ghi "Quá hạn" là
                  người dùng phải tự đoán xem có phải cùng một thứ không. */}
              <option value="OVERDUE">Đang trễ</option>
              {/* Hai mục này TÔN TRỌNG ô "Kết quả" bên trái — cùng luật với hai thẻ đếm cùng
                  tên, nên bấm thẻ hay chọn ở đây đều ra một kết quả. */}
              <option value="DONE">Đã hoàn tất</option>
              <option value="LATE">Nộp muộn</option>
              {/* Cho MỌI vai, không riêng người duyệt: nhân viên bị lấy đơn cần xem lại được
                  các lượt đó mà không phải cuộn tìm — chúng bị dồn xuống cuối bảng vì đã có
                  completedAt (họ nộp bài rồi mới bị bác). */}
              <option value="REASSIGNED">Đã giao lại</option>
              {/* Trục kiểm nội bộ — chỉ người duyệt mới cần lọc theo nó. Nhãn lấy từ bảng
                  nhãn dùng chung để màn này và cột "Kiểm nội bộ" không gọi khác tên nhau. */}
              {canReview && (
                <>
                  <option value="PENDING_REVIEW">{REVIEW_STATUS_LABELS.PENDING_REVIEW}</option>
                  <option value="REWORK">{REVIEW_STATUS_LABELS.REWORK}</option>
                  <option value="ACCEPTED">{REVIEW_STATUS_LABELS.ACCEPTED}</option>
                </>
              )}
            </select>
          </div>

          {/* MỐC DỮ LIỆU, không chỉ một cái nút.
              Nút "Tải lại" nói được "bấm để mới", nhưng KHÔNG nói được dữ liệu đang cũ bao lâu —
              nên người dùng không có cách nào tự biết mình đang xem cái gì. Có mốc thì lệch 20
              giây là chuyện họ thấy và chấp nhận được; không có mốc thì lệch 20 giây và lệch 2
              tiếng trông y như nhau. */}
          <span
            style={{ marginLeft: "auto", fontSize: "11px", color: "var(--ink-muted)" }}
            title={dataUpdatedAt ? formatVnDateTime(new Date(dataUpdatedAt)) : ""}
          >
            {dataUpdatedAt ? `Cập nhật ${freshnessLabel(new Date(dataUpdatedAt), nowTick)}` : ""}
          </span>

          <button
            type="button"
            onClick={() => {
              // Tự bấm Tải lại = đã chủ động rà lại cả bảng → xoá hết dấu. Giữ lại thì lần sau
              // người dùng không phân biệt được dấu cũ với dấu vừa xuất hiện.
              setChangedPriorityIds(new Set());
              void queryClient.invalidateQueries({ queryKey: ["design-3d-assignments-stats"] });
              void refresh();
            }}
            disabled={refreshing}
            className="psx-btn-secondary"
            style={{ height: "30px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
          >
            {/* Icon quay là DẤU HIỆU DUY NHẤT cho biết đang tải lại, vì bảng cố ý không còn
                bị thay bằng "Đang tải…". Không có nó thì bấm xong trông như không có gì xảy ra. */}
            <RefreshCw className={refreshing ? "w-3 h-3 animate-spin" : "w-3 h-3"} />
            {refreshing ? "Đang tải…" : "Tải lại"}
          </button>
        </div>

        {/* MỘT CỘT MỘT DỮ LIỆU — bản trước gộp nhiều trường vào một ô cách nhau bằng dấu "·"
            (MO#+sản phẩm+khách hàng, nhóm KPI+số giờ, kết quả+mức sớm/trễ). Gộp như vậy khiến
            không quét dọc theo từng chiều được, và mỗi dòng phải xếp 2 hàng chữ nên bảng cao
            gấp đôi. Nhiều cột nên bọc overflow-x để không đẩy tràn cả trang. */}
        <div style={{ background: "var(--cream-card)", border: "1px solid var(--border)", overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th className="psx-th" style={{ width: "40px", textAlign: "center" }}>#</th>
                <th className="psx-th" style={{ textAlign: "left" }}>MO#</th>
                {/* ─── ƯU TIÊN: MỘT CỘT RIÊNG, không phải một chip nhét trong ô MO# ──────
                    Bản trước để chip cạnh MO#. Ô đó đã có huy hiệu "MỚI" — hai pill đặc cùng cỡ,
                    cùng độ đậm, nằm sát nhau thì mắt không xếp hạng được cái nào quan trọng hơn,
                    và chúng còn nói HAI LOẠI chuyện khác nhau: "MỚI" là quan hệ giữa NGƯỜI ĐỌC và
                    việc này, ưu tiên là THỨ HẠNG của việc.

                    Thành cột vì câu nó trả lời là "cái nào làm TRƯỚC" — đó là so DỌC cả danh
                    sách, việc của một cột, không phải của một nhãn nằm lẫn trong tên MO. */}
                <th className="psx-th" style={{ width: "62px", textAlign: "center" }}>Ưu tiên</th>
                <th className="psx-th" style={{ textAlign: "left" }}>Sản phẩm</th>
                {/* ─── YÊU CẦU THIẾT KẾ ────────────────────────────────────────────────
                    Câu hỏi ĐẦU TIÊN của NV 3D khi nhìn một dòng: "Làm INFO, dựng mẫu mới, hay chỉ
                    chỉnh size?". Ba việc đó khác nhau hoàn toàn về khối lượng, mà trước đây phải
                    mở từng dòng ra mới biết — trong khi cột Số giờ (nay đã bỏ) chỉ nói được ngân
                    sách, không nói được LÀM GÌ.

                    Nguồn: ProductionDetail.extraData, KHÔNG phải một cột — xem
                    kpi-3d/design-request.ts. Server rút sẵn thành chuỗi; client không đụng JSON. */}
                <th className="psx-th" style={{ textAlign: "left" }}>Yêu cầu TK</th>
                {/* KHÁCH HÀNG đã bỏ khỏi bảng: MO# đã định danh được dòng, và tên khách không
                    tham gia vào bất kỳ quyết định nào của NV 3D hay của người duyệt. Nó vẫn
                    còn ở đầu panel chi tiết. Bỏ được một cột nghĩa là cột Tình trạng vào được
                    trong tầm mắt thay vì phải cuộn ngang mới thấy. */}
                {!isDesigner && <th className="psx-th" style={{ textAlign: "left" }}>Nhân viên</th>}
                {/* BỎ KHỎI BẢNG: Tài liệu, Nhóm KPI, Số giờ.
                    Cả ba vẫn còn đủ trong panel chi tiết — chỉ rời khỏi tầm quét ngang, không mất.
                    Nhóm KPI và Số giờ là dữ liệu để CHẤM công, không phải để chọn việc tiếp theo;
                    Deadline KPI ở cột bên đã nói được điều NV 3D cần biết về thời gian. */}
                {/* Câu "Deadline KPI do hệ thống tự tính" TRƯỚC ĐÂY nằm ở phụ đề đầu trang. Đó là
                    một LUẬT — người dùng không suy ra được, nên xoá đi là mất thông tin thật.
                    Nhưng ở phụ đề nó lại đứng cách cột nó nói về mấy trăm pixel, và bắt mọi người
                    dùng hằng ngày phải nhìn nó mãi. Ghi chú giải thích một luật thì phải ở NGAY
                    CẠNH thứ nó chi phối. */}
                {/* ─── DEADLINE KPI — CHỈ NV 3D ────────────────────────────────────────
                    Với NV 3D đây là mốc phải nhớ. Với Đặt đơn / Quản lý thì không: điều họ cần
                    biết là "việc nào sắp vỡ hạn" và "đúng hạn hay trễ" — hai câu đó nay do cột
                    Tình trạng (đếm ngược) và cột KPI trả lời. Một mốc ngày giờ tuyệt đối ở giữa
                    bảng chỉ là một cột nữa phải quét qua.

                    Ghi chú giải thích luật đặt ở NGAY CỘT nó nói về, không ở phụ đề đầu trang —
                    ở đó nó đứng cách thứ nó chi phối mấy trăm pixel. */}
                {isDesigner && (
                  <th
                    className="psx-th"
                    style={{ textAlign: "left" }}
                    title="Hệ thống tự tính từ mốc giao việc + số giờ KPI, theo lịch làm việc — không nhập tay"
                  >
                    Deadline KPI
                  </th>
                )}
                {/* MỘT cột trạng thái, không phải hai. "Trạng thái" và "Kiểm nội bộ" cũ là các
                    chặng liên tiếp của một vòng đời, và khi NV vừa nộp bài thì chúng sơn cùng
                    một thời điểm bằng hai màu đối nghịch (xanh "Đã gửi kết quả" cạnh hổ phách
                    "Chờ kiểm"). Xem design3DLifecycleBadge ở kpi-3d/display.ts. */}
                <th className="psx-th" style={{ textAlign: "left" }}>Tình trạng</th>
                {/* KẾT QUẢ và SỚM/TRỄ cũ là cùng một sự việc ở hai độ mịn — gộp thành nhãn +
                    dòng phụ, không phải hai cột cạnh nhau. */}
                <th className="psx-th" style={{ textAlign: "left" }}>KPI</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a, i) => {
                const overdue = isOverdue(a);
                const lifecycle = lifecycleOf(a);
                // Vạch lề trái nói "dòng này cần ai đó động tay". Quá hạn (đỏ) ĐƯỢC ƯU TIÊN
                // hơn chờ kiểm (hổ phách): một việc vừa trễ vừa chờ duyệt thì cái trễ mới là
                // vấn đề. Chỉ người duyệt mới thấy vạch hổ phách — với NV 3D thì việc đã nộp
                // xong không còn là việc của họ, tô lên chỉ gây hiểu nhầm là còn phải làm gì đó.
                const markerColor = overdue ? "#dc2626"
                  : (canReview && isPendingReview(a)) ? "#d97706"
                  : "transparent";
                return (
                  <tr
                    key={a.id}
                    className="psx-tr"
                    onClick={() => {
                      // Mở dòng ra = đã thấy → tắt dấu "ưu tiên vừa đổi" CỦA RIÊNG dòng này.
                      // Dấu do hành động người dùng xoá, không do đồng hồ — xem
                      // kpi-3d/priority-change-marker.ts.
                      setChangedPriorityIds((cur) => {
                        if (!cur.has(a.id)) return cur; // không tạo Set mới → không render thừa
                        const next = new Set(cur);
                        next.delete(a.id);
                        return next;
                      });
                      setOpenId(a.id);
                    }}
                    // Sọc ngựa vằn — cùng quy ước với 4 bảng khác trong hệ thống, giúp mắt
                    // lần theo dòng ngang khi có nhiều cột.
                    style={{
                      background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.012)",
                      opacity: isClosed(a) ? 0.5 : 1,
                    }}
                  >
                    <td
                      className="psx-td"
                      // Vạch màu ở lề trái thay cho một cột riêng — dòng cần xử lý bật lên
                      // ngay khi liếc mắt mà không tốn thêm cột.
                      style={{
                        textAlign: "center", color: "var(--ink-muted)", fontSize: "11px",
                        borderLeft: `3px solid ${markerColor}`,
                      }}
                    >
                      {i + 1}
                    </td>
                    <td className="psx-td" style={{ fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>
                      {/* Dấu MỚI đặt ở LỀ TRÁI, cạnh MO# — chỗ mắt quét dọc khi mở bảng.
                          Chip "Chưa nhận việc" ở cột Tình trạng nói cùng một sự thật, nhưng nó
                          là một trong tám chặng của vòng đời và nằm tận bên phải; dấu này chỉ
                          làm một việc: kéo mắt về dòng cần để ý. Nó tự tắt khi nhân viên bấm
                          nhận việc, tức tắt đúng lúc hết việc phải làm. */}
                      {isNewlyAssigned(a) && (
                        <span style={{
                          display: "inline-block", marginRight: "6px", padding: "1px 5px",
                          fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.06em",
                          color: "#fff", background: "var(--s-red, #dc2626)", borderRadius: "3px",
                          verticalAlign: "middle",
                        }}>
                          MỚI
                        </span>
                      )}
                      {formatVersionedDisplay(a.orderItem?.moNumber ?? a.order?.orderNumber) || "—"}
                      {/* ─── SO# ở dòng dưới, CÙNG KHUÔN với bảng Danh sách đơn hàng ──────
                          Một SO có nhiều MO, và trên màn này NV 3D chỉ thấy MO — không có cách
                          nào biết hai dòng đang nói về cùng một đơn của khách. Chuyện đó có thật:
                          hai MO cùng SO thường phải dựng cùng phong cách.

                          CHỈ HIỆN KHI KHÁC MO#: đơn một sản phẩm có MO# trùng luôn số đơn, lúc đó
                          dòng dưới chỉ là bản sao của dòng trên — lặp lại y nguyên một con số là
                          cách chắc chắn để mắt học cách bỏ qua cả hai.
                          `getBaseSoNumber` cắt hậu tố phiên bản, đúng hàm mà hai màn kia đang
                          dùng — viết lại phép cắt ở đây là hai màn sẽ hiện hai số khác nhau. */}
                      {a.order?.orderNumber && a.order.orderNumber !== a.orderItem?.moNumber && (
                        <div style={{
                          fontSize: "10px", color: "var(--ink-muted)",
                          fontFamily: "monospace", fontWeight: 400, marginTop: "2px",
                        }}>
                          {getBaseSoNumber(a.order.orderNumber)}
                        </div>
                      )}
                    </td>
                    {/* ─── Ô ƯU TIÊN ────────────────────────────────────────────────────
                        Bậc Normal để TRỐNG hẳn (không phải chữ "Bình thường", không phải "—"):
                        cột này tồn tại để hai bậc gấp nhảy ra khỏi trang. Điền kín mọi ô thì
                        không còn gì nhảy ra nữa.

                        Ở đây KHÔNG cần tiền tố "3D" như hồi chip nằm cạnh MO#: tiêu đề cột đã nói
                        đây là cột nào, nên nhắc lại trên từng dòng chỉ là nhiễu. */}
                    <td className="psx-td" style={{ textAlign: "center" }}>
                      {isUrgentDesign(a.orderItem?.design3DPriorityCode) && (
                        <span
                          title={changedPriorityIds.has(a.id) ? "Ưu tiên vừa được điều chỉnh" : undefined}
                          style={{
                            display: "inline-block", padding: "1px 6px",
                            fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em",
                            color: "#fff", borderRadius: "3px",
                            // UT1 đậm hơn UT2 — hai bậc gấp phải phân biệt được mà không cần đọc chữ.
                            background: toDesignPriority(a.orderItem?.design3DPriorityCode) === "UT1"
                              ? "var(--s-red, #dc2626)"
                              : "var(--s-amber, #d97706)",
                            // DẤU "VỪA ĐỔI" là một VÒNG SÁNG quanh chip, không phải một nhãn thứ
                            // hai: thêm chữ vào đây là lặp lại đúng cái lộn xộn vừa dọn đi.
                            boxShadow: changedPriorityIds.has(a.id)
                              ? "0 0 0 2px var(--cream-card, #fff), 0 0 0 4px var(--s-blue, #2563eb)"
                              : undefined,
                          }}
                        >
                          {toDesignPriority(a.orderItem?.design3DPriorityCode)}
                        </span>
                      )}
                      {/* Hạ về Normal cũng là một thay đổi cần thấy — mà lúc đó không còn chip nào
                          để khoanh. Một chấm nhỏ giữ chỗ, tự tắt cùng lúc với các dấu khác. */}
                      {!isUrgentDesign(a.orderItem?.design3DPriorityCode) && changedPriorityIds.has(a.id) && (
                        <span
                          title="Ưu tiên vừa hạ về Bình thường"
                          style={{
                            display: "inline-block", width: "8px", height: "8px", borderRadius: "50%",
                            background: "var(--s-blue, #2563eb)",
                          }}
                        />
                      )}
                    </td>
                    <td className="psx-td" style={{ fontSize: "12.5px" }}>{a.orderItem?.productName ?? "—"}</td>
                    {/* ─── YÊU CẦU THIẾT KẾ, và thực tế NV 3D báo nếu khác ────────────────
                        "Làm INFO" / "TK mới" / "Chỉnh size"… Server đã rút sẵn từ JSON; null =
                        chưa đặt, hiện "—" chứ không hiện ô trống (ô trống đọc như lỗi hiển thị,
                        dấu gạch đọc như "chưa có").

                        LỆCH THÌ HIỆN BẰNG MŨI TÊN TRÊN MỘT DÒNG: "Làm INFO → Ước lượng".

                        Bản trước in hai dòng, dòng dưới là "3D báo: Ước lượng". Hai lỗi:
                          · "3D báo:" là GÁN NGƯỜI NÓI — cách viết của tin nhắn, không phải của
                            một ô dữ liệu. Ai báo thì panel và Lịch sử thay đổi đã ghi rõ; bảng
                            không cần chở thông tin đó.
                          · Giá trị yêu cầu bị nói HAI LẦN (in ở dòng trên, rồi ngụ ý ở dòng dưới).

                        Mũi tên TỰ NÓI "đã chuyển thành" — không cần nhãn nào, và mắt đọc được
                        "đổi từ gì sang gì" trong một nhịp thay vì đọc hai dòng rồi tự nối lại.

                        Giá trị cũ + mũi tên để MỜ, giá trị mới ĐẬM: phần đổi là phần cần thấy. */}
                    <td className="psx-td" style={{ fontSize: "12.5px", whiteSpace: "nowrap" }}>
                      {(() => {
                        // Luật "có lệch không" ở kpi-3d/design-request.ts — KHÔNG tự so ở đây.
                        // Chỉ CÁCH TRÌNH BÀY là riêng của bảng, đúng như panel và hộp duyệt cũng
                        // trình bày khác nhau từ cùng một luật.
                        const m = designRequestMismatch(a.yeucauThietKe, a.latestReportedDesignRequest);
                        if (!m) {
                          return a.yeucauThietKe ?? <span style={{ color: "var(--ink-muted)" }}>—</span>;
                        }
                        return (
                          <span title={designRequestMismatchLabel(m)}>
                            <span style={{ color: "var(--ink-muted)" }}>
                              {/* Đặt đơn bỏ trống yêu cầu vẫn là chuyện CẦN BIẾT, nên nói "chưa
                                  ghi" chứ không để trống một bên mũi tên. */}
                              {m.requested ?? "chưa ghi"}
                            </span>
                            <span style={{ color: "var(--ink-muted)", margin: "0 4px" }}>→</span>
                            <strong style={{ color: "#92400e" }}>{m.reported}</strong>
                          </span>
                        );
                      })()}
                    </td>
                    {!isDesigner && (
                      <td className="psx-td" style={{ fontSize: "12.5px", whiteSpace: "nowrap" }}>{a.designer3D?.name ?? "—"}</td>
                    )}
                    {/* MỐC DEADLINE chỉ NV 3D thấy — xem chú thích ở <th> tương ứng. */}
                    {isDesigner && (
                      <td
                        className="psx-td"
                        style={{
                          fontSize: "12.5px", whiteSpace: "nowrap", ...numCell,
                          color: overdue ? "#b91c1c" : "var(--ink-body)",
                          fontWeight: overdue ? 700 : 400,
                        }}
                      >
                        {fmtDateTime(a.deadlineAt)}
                        {/* ─── ĐẾM NGƯỢC Ở ĐÂY, KHÔNG Ở CỘT TÌNH TRẠNG ────────────────────
                            "08:37 22/08/2026" bắt người đọc tự trừ ngày trong đầu mới biết có
                            gấp hay không, nên khoảng cách tương đối vẫn cần được viết ra.

                            ⚠️ NHƯNG NÓ THUỘC VỀ CỘT NÀY. Một bản trước tôi dời nó sang cột Tình
                            trạng, lấy lý do "Order cũng cần thấy việc sắp vỡ hạn". Sai, và người
                            dùng chỉ ra ngay: ô đó thành một CHIP cộng một DÒNG CHỮ xếp dưới —
                            đúng cái đống vừa được dẹp ở cột KPI, chỉ khác cột.

                            Lý do sâu hơn: "Đang thiết kế" là TRẠNG THÁI, "còn 2 giờ" là THỜI
                            GIAN. Nhồi hai loại thông tin vào một ô thì ô đó không trả lời gọn
                            được câu nào. Ở đây thì hai dòng CÙNG nói về thời gian — chúng hợp
                            nhau.

                            Order/Admin không có cột này, và họ KHÔNG mất gì: dòng trễ đã có vạch
                            đỏ ở lề trái, còn "việc nào gấp nhất" thì bảng đã sắp theo deadline
                            tăng dần nên nó nằm trên cùng (compareAssignmentsForQueue).

                            Ẩn khi việc đã xong — lúc đó khoảng cách tới deadline không còn là
                            việc cần hành động, cột KPI đã trả lời. */}
                        {!a.completedAt && !isClosed(a) && (
                          <div style={{
                            fontSize: "10.5px", fontWeight: 400,
                            color: overdue ? "#b91c1c" : "var(--ink-muted)",
                          }}>
                            {formatDeadlineDistance(new Date(a.deadlineAt), now)}
                          </div>
                        )}
                      </td>
                    )}
                    {/* ─── CỘT TÌNH TRẠNG: CHỈ TRẠNG THÁI, KHÔNG GIỜ ───────────────────────
                        Một cột, một câu trả lời. Bản trước có thêm dòng "còn 2 giờ" xếp dưới chip
                        và người dùng phản đối ba lần — đúng: đó là hai LOẠI thông tin khác nhau
                        (trạng thái vs thời gian) nhồi vào một ô.

                        Con số vẫn lấy được qua `title` khi trỏ chuột vào chip — không tốn một
                        pixel nào trên bảng.

                        📌 VÀ ĐÂY LÀ LỖ HỔNG THẬT ĐÃ LỘ RA khi bỏ dòng đó: ô lọc Trạng thái CÓ mục
                        "Đang trễ", nhưng `design3DLifecycleBadge` KHÔNG BAO GIỜ trả về nhãn đó —
                        một lượt quá hạn vẫn hiện chip "Đang thiết kế". Bộ lọc và cột đang nói hai
                        thứ tiếng về cùng một dữ liệu, và cái đồng hồ ở đây từng là bản vá cho
                        chuyện đó.
                        CỐ Ý CHƯA VÁ: chip chỉ hiện MỘT nhãn, nên cho nó nói "Đang trễ" là MẤT
                        "Đang thiết kế" — người xem không còn biết việc đang ở chặng nào. Trễ đã
                        được vạch đỏ ở lề trái mã hoá mà không tốn chữ nào. Đổi điều này là một
                        quyết định nghiệp vụ, không phải dọn dẹp giao diện. */}
                    <td className="psx-td" style={{ whiteSpace: "nowrap" }}>
                      <StatusChip
                        badge={lifecycle}
                        title={
                          !a.completedAt && !isClosed(a)
                            ? formatDeadlineDistance(new Date(a.deadlineAt), now)
                            : undefined
                        }
                      />
                    </td>
                    <td className="psx-td" style={{ fontSize: "12px", whiteSpace: "nowrap" }}>
                      {a.kpiStatus ? (
                        <>
                          <div style={{ fontWeight: 700, color: TONE_HEX[kpiResultBadge(a.kpiStatus).tone] }}>
                            {kpiResultBadge(a.kpiStatus).label}
                          </div>
                          {/* ─── HAI DÒNG, KHÔNG BA ────────────────────────────────────────
                              Bản trước có dòng thứ ba: "⚠ dùng 17% giờ KPI". Bỏ đi vì:

                                · Nó là CÙNG MỘT CON SỐ nói lần thứ hai — "sớm 3 giờ 17 phút" và
                                  "dùng 17% giờ KPI" đều suy ra từ (4 giờ KPI vs 41 phút làm).
                                  Chúng không thể mâu thuẫn, nên dòng sau không thêm thông tin.
                                · Ba dòng trong một ô thì không dòng nào được đọc.
                                · Emoji giữa dòng chữ làm ô dữ liệu trông như tin nhắn.

                              Tỉ lệ phần trăm VẪN CÒN, ở panel chi tiết, kèm cả hai con số gốc để
                              tự chứng minh — và chỉ hiện cho người duyệt (xem prop isDesigner của
                              AssignmentDetailPanel). */}
                          <div style={{ fontSize: "10.5px", color: "var(--ink-muted)", ...numCell }}>
                            {formatKpiDelta(a.kpiStatus, a.kpiDeltaMinutes)}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "var(--ink-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ─── "CHƯA CÓ VIỆC" NẰM NGOÀI <table>, KHÔNG PHẢI MỘT <tr> ─────────────────
              Bản trước là `<tr><td colSpan={8}>` bên trong <tbody>, và con số 8 đó là MỘT CON
              SỐ ĐẾM TAY. Thêm một cột mà quên sửa nó thì dòng này không trải hết bảng — bảng
              trông như vỡ mà KHÔNG có lỗi nào lên tiếng.

              🎯 CÁCH SỬA KHÔNG PHẢI LÀ TÍNH CON SỐ CHO ĐÚNG (VD lấy độ dài một mảng cột), mà là
              BỎ NHU CẦU CẦN NÓ. Ra khỏi <table> thì không còn colSpan, không còn con số, và
              KHÔNG CÒN LOẠI LỖI ĐÓ — thay vì tự động hoá một thứ vốn không cần tồn tại.

              Vẫn giữ tiêu đề bảng hiện phía trên, nên trông gần như y hệt bản cũ.

              📌 Đây KHÔNG giải bài "thêm cột ở một chỗ" — bài đó cần descriptor mang cả header
              lẫn cell, tức viết lại lõi bảng của một file gần 3.000 dòng. Nhưng sai THỨ TỰ cột
              thì lộ ra ngay (cột lệch nhãn), còn sai colSpan thì im lặng: đợt này đổi một lỗi
              im lặng thành một lỗi thấy được, và đó đã là phần lớn giá trị. */}
          {sorted.length === 0 && (
            <div
              className="psx-td"
              style={{ textAlign: "center", color: "var(--ink-muted)", padding: "40px", borderTop: "none" }}
            >
              {/* Nói RA nguyên nhân thay vì một câu chung chung. Bảng rỗng vì lọc tháng là
                  trường hợp thường gặp nhất ở đây, và "không khớp bộ lọc" bắt người dùng tự đoán
                  bộ lọc nào — họ vừa mới đổi tháng xong và câu đó không nhắc gì tới tháng cả. */}
              {rows.length === 0
                ? (isDesigner ? "Chưa có đơn nào được giao cho bạn." : "Chưa có lượt giao việc 3D nào.")
                : statsRange
                  ? `Không có việc nào giao trong ${scopeText}.`
                  : "Không có việc nào khớp bộ lọc."}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Panel chi tiết (trượt từ phải) ──────────────────────────────────────────
// Cùng lối tương tác với OrderDetailPanel: bấm dòng để mở, danh sách giữ được sự gọn gàng.

function AssignmentDetailPanel({
  assignment: a,
  canReview,
  isDesigner,
  onClose,
  onSaved,
  onLocalPatch,
  onRevalidate,
}: {
  assignment: Assignment;
  canReview: boolean;
  /** Người đang xem là NV 3D làm chính việc này — KHÔNG phải người duyệt. */
  isDesigner: boolean;
  onClose: () => void;
  /** Ghi xong RỒI MỚI đọc lại — dùng cho thao tác đổi cấu trúc (duyệt, tạm dừng, giao tiếp). */
  onSaved: () => Promise<void>;
  /** Vá cache tại chỗ bằng số của server — dùng cho thao tác thường xuyên, để nút nhả ngay. */
  onLocalPatch: (assignmentId: string, patch: Partial<Assignment>, newLog?: ProgressLog) => void;
  onRevalidate: () => void;
}) {
  // Bốn trạng thái loại trừ nhau, quyết định ở module business — xem chú thích về thứ tự
  // các nhánh ở kpi-3d/review-queue.ts. Viết thẳng trong JSX là cách đã để sót trường hợp
  // "đã nộp kết quả mà chưa từng bấm nhận việc".
  const action = design3DPanelAction(a);
  // Người duyệt có việc để làm ở lượt này — hiện khối thao tác THAY CHO đoạn chú thích trạng
  // thái, không hiện cả hai. Gồm cả trạng thái đã duyệt, vì "yêu cầu làm lại" vẫn phải làm
  // được sau khi đã nhận: bản trước có câu chữ hứa hẹn điều đó mà không có nút nào để bấm.
  // ĐÃ DUYỆT LÀ XONG — người duyệt KHÔNG còn thao tác nào ở lượt đó.
  //
  // Trước đây `action === "DONE"` cũng vào đây, chỉ để hiện nút "Yêu cầu làm lại". Nút đó ra đời
  // để vá một lỗ khác (bản cũ hơn nữa có câu chữ hứa "bấm Yêu cầu làm lại" mà không có nút nào),
  // nhưng nó mâu thuẫn với luật nghiệp vụ: duyệt xong là chốt cho PHIÊN BẢN MO đó, cần làm thêm
  // thì tạo phiên bản mới. Để nút lại là mở đúng đường lách luật vừa dựng ở approved-lock.ts.
  //
  // Hệ quả: với lượt đã duyệt, `footerRole` là NONE và `overflowActions` rỗng (pauseAllowed cũng
  // loại ACCEPTED) → thanh hành động ẨN HẲN, panel thành chỉ đọc. Đúng thứ cần.
  const reviewerActs = canReview && action === "AWAITING_REVIEW";
  // Tạm dừng được hay không — điều kiện RIÊNG, không trùng `reviewerActs`: đơn đang làm thì chưa
  // có gì để duyệt nhưng vẫn gác được. Đã đóng (huỷ/giao lại) hoặc đã duyệt thì số giờ đã chốt,
  // dừng nữa là tạo một khoảng không bao giờ được trừ vào đâu — server cũng chặn.
  const pauseAllowed = canReview && !isClosed(a) && a.reviewStatus !== "ACCEPTED";

  // ─── ĐÚNG MỘT FORM MỞ TẠI MỘT THỜI ĐIỂM ───────────────────────────────────
  //
  // Trước đây mỗi component tự giữ cờ mở của mình, nên form cập nhật tiến độ của NV 3D và form
  // tạm dừng của người duyệt bày ra CÙNG LÚC — hai chỗ nhập liệu cho hai vai khác nhau trên cùng
  // một màn. Panel giữ trạng thái này thì việc đó thành không thể xảy ra.
  const [sheet, setSheet] = useState<PanelSheet>(null);

  // State của form tiến độ nằm ở PANEL vì các ô nhập ở trong dòng cuộn còn hai cái nút ở thanh
  // hành động đáy — hai chỗ khác nhau trong DOM không thể cùng một component. Xem useProgressForm.
  const progressForm = useProgressForm({
    assignmentId: a.id,
    latest: a.progressLogs[0] ?? null,
    // Chỉ để NV ĐỐI CHIẾU trong bước xác nhận gửi. Form không sửa trường này — nó là yêu cầu
    // của Đặt đơn, sửa nó là xoá mất câu hỏi gốc. Xem progress-form.tsx.
    designRequest: a.yeucauThietKe,
    // Đóng sheet + vá cache là VIỆC ĐỒNG BỘ, chạy xong trong cùng một nhịp render. Vòng đọc lại
    // đi sau và không ai đợi nó — xem chú thích ở applyLocalPatch/revalidate.
    onSaved: (patch, log) => {
      setSheet(null);
      onLocalPatch(a.id, patch, log);
      onRevalidate();
    },
  });

  const openPauseSpan = (() => {
    const p = a.pauses?.find((x) => x.resumedAt === null);
    return p ? { id: p.id, pausedAt: p.pausedAt, reason: p.reason } : null;
  })();

  // Vai nào đang có việc ở thanh hành động. NGƯỜI DUYỆT THẮNG khi cả hai cùng đúng: lúc đơn đã
  // nộp kết quả thì NV 3D không còn gì để gõ, còn người duyệt thì có.
  const footerRole: "REVIEWER" | "DESIGNER" | "NONE" =
    reviewerActs ? "REVIEWER"
    : action === "PROGRESS" ? "DESIGNER"
    : "NONE";

  // Hành động HIẾM — vài lần một tháng. Để trong menu tràn thì dải nút còn hai cái, và ba câu
  // chú thích từng phải đi kèm mỗi nút biến mất vì nhãn trong menu tự nói đủ.
  const overflowActions: Array<{ sheet: PanelSheet; label: string }> = [
    // ⚠️ MỤC NÀY SẼ ĐƯỢC BỎ — nhưng CHỈ CÙNG LÚC với việc dạy đường sidebar đóng lượt đang gác.
    //
    // Cửa giao việc phải về đúng một chỗ (tab Thiết kế → "+ Thêm NV 3D"). Nhưng bỏ nút này TRƯỚC
    // khi đường đó chạy được thì không còn cách nào giao tiếp cho một đơn đang gác: hôm nay thêm
    // lại chính người cũ ở sidebar bị `usedDesignerIds` chặn ("đã có một lượt đang chạy"), vì tạm
    // dừng không đổi `status` nên lượt bị gác vẫn được coi là đang chạy.
    // "Mở lại việc & giao tiếp" ĐÃ BỎ khỏi màn này. Tạm dừng là CHỐT SỐ — coi như lượt đã xong,
    // không sửa gì thêm. Giao tiếp là một LƯỢT MỚI, và việc giao lượt phải về đúng MỘT chỗ:
    // Danh sách đơn hàng → PTK → sidebar tab Thiết kế → "+ Giao lượt tiếp theo".
    //
    // Chú thích cũ ở đây nói chưa bỏ được vì "thêm lại chính người cũ ở sidebar bị usedDesignerIds
    // chặn". Điều đó đúng với nút "+ Thêm NV 3D" (tạo lượt SONG SONG), nhưng KHÔNG đúng với
    // "+ Giao lượt tiếp theo": nút đó gọi thẳng /continue — đóng lần tạm dừng, đóng băng số giờ
    // đã chốt vào actualMinutes, rồi tạo lượt mới với phần giờ CÒN LẠI. Nó không đi qua
    // usedDesignerIds, nên cửa thoát đã có sẵn và đúng.
    ...(pauseAllowed && !openPauseSpan ? [{ sheet: "PAUSE" as PanelSheet, label: "Tạm dừng đơn" }] : []),
    ...(reviewerActs ? [{ sheet: "REASSIGN" as PanelSheet, label: "Đổi người thiết kế" }] : []),
  ];
  // Thông số để dựng mẫu. Quy tắc lọc/gộp ở module thuần product-specs.ts (có test) — nhãn lấy
  // từ cùng từ vựng với tab Sản phẩm để Order và NV 3D không gọi một trường bằng hai tên.
  const specRows = productSpecRows(a.orderItem);

  // Một mốc "bây giờ" cho cả panel — dải deadline và cảnh báo bàn giao phải cùng một thời
  // điểm, không thì hai dòng cạnh nhau có thể lệch nhau đúng ranh giới phút.
  const panelNow = new Date();
  const panelOverdue = isOverdue(a);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(42,39,37,0.35)", display: "flex", justifyContent: "flex-end" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "min(480px, 100vw)", height: "100%", background: "var(--cream-card)",
        borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 32px rgba(42,39,37,0.12)",
      }}>
        <div style={{ flexShrink: 0, padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--cream-dark)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--ink)" }}>
              {formatVersionedDisplay(a.orderItem?.moNumber ?? a.order?.orderNumber) || "—"}
            </div>
            <div style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
              {a.orderItem?.productName ?? "—"}
              {a.order?.customerName ? ` · ${a.order.customerName}` : ""}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: "4px" }}>
            <X style={{ width: "16px", height: "16px" }} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* ─── MỘT BƯỚC THAY CẢ THÂN PANEL, KHÔNG NHÉT VÀO CHÂN PANEL ────────
              LỖI ĐANG SỬA — của chính bản trước tôi làm. Tôi đặt form vào thanh hành động dính
              đáy và cho nó `maxHeight: 60vh; overflow: auto`. Hai hậu quả thật:

                · HAI THANH CUỘN LỒNG NHAU. Form đổi người có sáu ô + lý do + lựa chọn KPI, nên
                  nó luôn cao hơn 60vh và tự sinh thanh cuộn riêng bên trong thanh cuộn của
                  panel. Nút "Xác nhận chuyển người" rơi xuống dưới mép và trông như bị cắt.

                · MENU BỊ CẮT. `overflow: auto` biến chân panel thành một khung cuộn, nên cái
                  menu `position: absolute; bottom: 100%` mở LÊN TRÊN bị chính khung đó cắt mất.
                  Đó là lý do "rất khó thao tác".

              Nguyên nhân gốc: tôi gộp hai thứ khác loại vào một chỗ. Thanh hành động thì luôn
              hiện và chỉ chứa vài cái nút — cao cố định. Còn form thì cao thay đổi và có khi rất
              dài. Nhét form vào một dải cao cố định là tự tạo ra thanh cuộn thứ hai.

              Nay: mở một hành động = ĐỔI BƯỚC. Thân panel hiện form đó (dùng trọn chiều cao,
              cuộn bằng chính thanh cuộn của panel), chân panel biến mất vì form đã có nút của
              riêng nó. Một thanh cuộn, không có gì bị cắt. */}
          {sheet ? (
            <>
              <button
                type="button"
                onClick={() => setSheet(null)}
                style={{
                  alignSelf: "flex-start", background: "none", border: "none", padding: 0,
                  cursor: "pointer", fontSize: "12px", color: "var(--ink-muted)",
                }}
              >
                ← Quay lại
              </button>

              {sheet === "MORE" ? (
                /* MENU TRỞ THÀNH MỘT BƯỚC, KHÔNG PHẢI POPUP.
                   Popup trong một drawer 480px phải tự lo vị trí, tự lo bị khung cha cắt, và trên
                   máy cảm ứng thì vùng bấm quá nhỏ. Một danh sách hàng rộng hết chiều thì không
                   có cạnh nào để va phải — và dùng đúng cùng một cơ chế với các form khác. */
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <Label>Thao tác khác</Label>
                  {overflowActions.map((act) => (
                    <button
                      key={act.sheet}
                      type="button"
                      onClick={() => setSheet(act.sheet)}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "12px 14px", fontSize: "13px", cursor: "pointer",
                        background: "var(--cream)", border: "1px solid var(--border)",
                        borderRadius: "6px", color: "var(--ink)",
                      }}
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              ) : sheet === "COMPLETE" ? (
                <ProgressConfirmSheet f={progressForm} />
              ) : (sheet === "ACCEPT" || sheet === "REWORK" || sheet === "REASSIGN") ? (
                <ReviewBox
                  key={`${a.id}-${sheet}`}
                  assignmentId={a.id}
                  currentGroupId={a.kpiGroup?.id ?? null}
                  sheet={sheet}
                  onCloseSheet={() => setSheet(null)}
                  renderInfoUrl={a.latestRenderInfoUrl}
                  // Lệch giữa yêu cầu và thực tế NV báo — hiện ở ĐÂY vì đây là khoảnh khắc Đặt
                  // đơn đang quyết định Nhận / Làm lại. Một báo cáo được lưu mà không ai thấy
                  // thì tệ hơn không có: nó tạo cảm giác đã kiểm soát.
                  mismatch={designRequestMismatch(a.yeucauThietKe, a.latestReportedDesignRequest)}
                  onSaved={onSaved}
                />
              ) : (
                <PauseBox
                  key={`${a.id}-${sheet}`}
                  assignmentId={a.id}
                  standardMinutes={a.standardMinutesSnapshot}
                  hasRenderLink={!!a.latestRenderInfoUrl}
                  creditedMinutes={alreadyCreditedMinutes(
                    (a.pauses ?? []).map((p) => ({
                      pausedAt: new Date(p.pausedAt),
                      confirmedMinutes: p.confirmedMinutes,
                    })),
                  )}
                  onClose={() => setSheet(null)}
                  onSaved={onSaved}
                />
              )}
            </>
          ) : (
          <>

          {/* ─── Dải trạng thái ─────────────────────────────────────────────────
              Bản trước panel là 12 ô nhãn/giá trị CÙNG cỡ chữ, cùng màu nhãn, cùng khoảng
              cách — không có thứ bậc nào, nên mắt phải đọc tuần tự cả 12 ô mới tìm ra ô mình
              cần. Và đúng thứ người giao việc cần nhất ("NV đã thấy việc chưa") lại nằm ở ô
              THỨ MƯỜI, chỉ là một dòng chữ cam nhỏ lẫn giữa 11 ô khác.
              Nay ba thứ quyết định được nhấc lên đầu, tách hẳn khỏi lưới. */}
          {/* MỘT thẻ chứa cả trạng thái VÀ tình hình bàn giao. Bản trước dòng "NV đã nhận
              việc" nằm trơ giữa dải và lưới — không thẻ, không nhãn, một câu chữ xanh treo
              lơ lửng. Cùng một câu hỏi ("việc này đang ở đâu, ai đang giữ") thì phải nằm
              trong cùng một khối. */}
          <div style={{ border: "1px solid var(--border)", background: "var(--cream-dark)" }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "flex-start",
              gap: "12px", flexWrap: "wrap", padding: "10px 12px",
            }}>
              {/* Đúng chip của bảng — cùng một thứ thì phải trông giống nhau ở mọi nơi. */}
              <StatusChip badge={lifecycleOf(a)} />
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "12px", color: panelOverdue ? "#b91c1c" : "var(--ink-body)", fontWeight: panelOverdue ? 700 : 400, ...numCell }}>
                  Deadline {fmtDateTime(a.deadlineAt)}
                </div>
                {!a.completedAt && !isClosed(a) && (
                  <div style={{ fontSize: "10.5px", color: panelOverdue ? "#b91c1c" : "var(--ink-muted)" }}>
                    {formatDeadlineDistance(new Date(a.deadlineAt), panelNow)}
                  </div>
                )}
              </div>
            </div>

            {/* ─── ĐANG TẠM DỪNG ────────────────────────────────────────────────
                Đặt NGAY DƯỚI deadline và trước mọi thứ khác: không có băng này, NV 3D mở việc
                ra chỉ thấy một deadline đang trôi và tưởng mình đang trễ, trong khi chính
                Order/Admin là người bảo họ gác lại. Nêu cả LÝ DO để họ biết khi nào được làm
                tiếp mà không phải đi hỏi. */}
            {(() => {
              const open = a.pauses?.find((p) => p.resumedAt === null);
              if (!open || isClosed(a)) return null;
              return (
                <div style={{
                  borderTop: "1px solid var(--border)", padding: "8px 12px",
                  background: "rgba(138,106,26,0.08)",
                  fontSize: "12px", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "baseline",
                }}>
                  <span style={{ fontWeight: 700, color: TONE_HEX.warning }}>Đang tạm dừng</span>
                  <span style={{ color: "var(--ink-muted)", ...numCell }}>
                    từ {fmtDateTime(open.pausedAt)} · {formatElapsed(new Date(open.pausedAt), panelNow)}
                  </span>
                  <span style={{ width: "100%", color: "var(--ink-body)" }}>{open.reason}</span>
                  <span style={{ width: "100%", fontSize: "10.5px", color: "var(--ink-muted)" }}>
                    Đồng hồ KPI đã dừng — deadline sẽ được dời đúng bằng thời gian tạm dừng.
                  </span>
                </div>
              );
            })()}

            {/* ─── Bàn giao: NV đã thấy việc chưa ───────────────────────────────
                Phần trả lời cho "tránh giao việc mà nhân viên không thấy". Khi CHƯA nhận thì
                nó là một CẢNH BÁO — nền vàng, ngay trong thẻ trạng thái.
                Hai con số làm nó dùng được:
                  - Đã bao lâu kể từ lúc giao: "chưa nhận" mà mới giao 5 phút thì bình thường,
                    2 ngày thì phải đi gọi.
                  - Đã gửi thông báo Chat chưa: chưa gửi được thì lỗi ở ta, không phải NV lơ là. */}
            {!isClosed(a) && (
              a.acknowledgedAt ? (
                <div style={{
                  borderTop: "1px solid var(--border)", padding: "8px 12px",
                  fontSize: "12px", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "baseline",
                }}>
                  <span style={{ fontWeight: 600, color: TONE_HEX.positive }}>Đã nhận việc</span>
                  <span style={{ color: "var(--ink-muted)", ...numCell }}>
                    {fmtDateTime(a.acknowledgedAt)}
                    {a.acknowledgedBy?.name ? ` · ${a.acknowledgedBy.name}` : ""}
                  </span>
                </div>
              ) : (
                <div style={{
                  borderTop: "1px solid #fcd34d", background: "#fffbeb", padding: "9px 12px",
                  fontSize: "12px", color: "#92400e", lineHeight: 1.6,
                }}>
                  <strong>Chưa nhận việc</strong> — đã {formatElapsed(new Date(a.assignedAt), panelNow)} kể từ lúc giao.
                  {" "}
                  {a.notifiedAt
                    ? `Đã gửi thông báo Chat ${fmtDateTime(a.notifiedAt)}.`
                    : "Hệ thống chưa gửi được thông báo Chat — cần nhắc NV bằng đường khác."}
                </div>
              )
            )}
          </div>

          {/* ─── Danh sách nhãn-trái / giá trị-phải ─────────────────────────────
              ĐỔI TỪ LƯỚI 2 CỘT. Lưới cũ có hai tật mà ảnh chụp cho thấy rõ:
                1. GHÉP ĐÔI VÔ NGHĨA — sau khi bỏ vài ô, "Số giờ KPI" nằm cạnh "Giao lúc",
                   "Hoàn tất lúc" cạnh "Kết quả KPI". Người đọc tưởng hai ô cạnh nhau có liên
                   quan, vì bố cục nói vậy. Và số ô lẻ để lại một LỖ TRỐNG ở hàng cuối.
                2. Ô nào chưa có dữ liệu vẫn chiếm đủ chỗ với một dấu "—", nên một phần tư
                   panel là chỗ trống có nhãn. Ô "Hoàn tất lúc —" còn kèm chú thích "Hệ thống
                   tự ghi" — giải thích một giá trị không tồn tại.
              Danh sách một cột không có ghép đôi, không có lỗ, và ẩn được ô rỗng. */}
          <PanelSection title="Thông tin việc">
            <PanelRow label="Sản phẩm" value={a.orderItem?.productName} />
            <PanelRow label="Khách hàng" value={a.order?.customerName} />
            <PanelRow label="NV Thiết kế 3D" value={a.designer3D?.name} />
            <PanelRow label="Nhóm KPI" value={a.kpiGroup?.name} />
            <PanelRow label="Số giờ KPI" value={fmtHours(a.standardMinutesSnapshot)} />
            <PanelRow label="Giao lúc" value={fmtDateTime(a.assignedAt)} mono />
            {/* Yêu cầu thiết kế nằm ở cụm NÀY chứ không ở cụm "Kết quả KPI": nó mô tả VIỆC PHẢI
                LÀM, và cụm kia chỉ hiện khi đã hoàn tất — trong khi NV cần đọc yêu cầu từ lúc
                nhận việc. `PanelRow` tự ẩn khi value rỗng, nên đơn chưa ghi yêu cầu không để
                lại dòng gạch ngang. */}
            <PanelRow label="Yêu cầu thiết kế" value={a.yeucauThietKe} />
            {/* Chỉ hiện khi LỆCH. Trùng thì dòng này không nói thêm gì so với dòng trên. */}
            <PanelRow label="3D báo đã làm" value={a.latestReportedDesignRequest} color={
              designRequestMismatch(a.yeucauThietKe, a.latestReportedDesignRequest) ? "#92400e" : undefined
            } />
          </PanelSection>

          {/* Cụm KPI chỉ hiện KHI ĐÃ CÓ kết quả. Chưa xong thì ba dòng gạch ngang không nói
              thêm được gì mà chip trạng thái ở trên chưa nói — chỉ làm panel dài ra. */}
          {a.completedAt && (
            <PanelSection title="Kết quả KPI">
              <PanelRow label="Hoàn tất lúc" value={fmtDateTime(a.completedAt)} mono />
              <PanelRow
                label="Kết quả"
                value={kpiResultBadge(a.kpiStatus).label}
                color={a.kpiStatus ? TONE_HEX[kpiResultBadge(a.kpiStatus).tone] : undefined}
              />
              <PanelRow
                label="Sớm / Trễ"
                value={a.kpiStatus ? formatKpiDelta(a.kpiStatus, a.kpiDeltaMinutes) : null}
              />
              {/* ─── 🔴 TỈ LỆ GIỜ KPI — CHỈ NGƯỜI DUYỆT, KHÔNG PHẢI NV LÀM VIỆC ─────────
                  Hai dòng dưới đây được viết làm LỜI NHẮC CHO NGƯỜI DUYỆT: "nộp rất nhanh so với
                  giờ KPI — nên xem kỹ bản thiết kế trước khi duyệt". Chúng nói với Đặt đơn/Quản
                  lý về một lượt, để họ kiểm chất lượng trước khi bấm Nhận.

                  ⚠️ TRƯỚC ĐÂY NV 3D ĐỌC ĐƯỢC CHÚNG VỀ CHÍNH MÌNH, và đó là một lỗi thật:

                    NV thấy nộp nhanh thì bị gắn một dấu cảnh báo → cách tránh dấu đó là GIỮ VIỆC
                    CHO ĐỦ GIỜ MỚI NỘP.

                  Đó là hành vi tệ nhất có thể dạy cả phòng, và nó phá đúng thứ tính năng này
                  định bảo vệ. Cùng lý do vì sao câu chữ ở kpi-usage.ts được chọn để KHÔNG buộc
                  tội (có test cấm các từ đó).

                  📌 ĐỪNG "DỌN DẸP" ĐIỀU KIỆN NÀY. Nó trông như một cái gate tùy tiện, nhưng nó là
                  một quyết định nghiệp vụ: con số này dành cho người ĐÁNH GIÁ công việc, không
                  dành cho người BỊ đánh giá. Cột KPI ngoài bảng và dòng Sớm/Trễ ở trên thì NV vẫn
                  thấy — họ không bị che kết quả của mình, chỉ không thấy con số dùng để soi.

                  ⚠️ KHÔNG có test cho gate này: dự án không có test render component. Chú thích
                  này là thứ duy nhất giữ nó. */}
              {!isDesigner && (
                <PanelRow
                  label="Dùng giờ KPI"
                  // Kèm cả hai con số gốc để tự chứng minh được, không chỉ "17%". Đây là dữ liệu
                  // ảnh hưởng tới đánh giá công việc của một người.
                  value={formatKpiUsage({
                    actualMinutes: a.actualMinutes,
                    standardMinutes: a.standardMinutesSnapshot,
                  })}
                />
              )}
              {!isDesigner && kpiUsageNotice({
                actualMinutes: a.actualMinutes,
                standardMinutes: a.standardMinutesSnapshot,
              }) && (
                <p
                  style={{
                    margin: "6px 0 0",
                    padding: "7px 9px",
                    fontSize: "11px",
                    lineHeight: 1.5,
                    color: "var(--ink)",
                    background: "var(--row-hover)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  {kpiUsageNotice({
                    actualMinutes: a.actualMinutes,
                    standardMinutes: a.standardMinutesSnapshot,
                  })}
                </p>
              )}
            </PanelSection>
          )}

          {/* ─── Thông số sản phẩm ─────────────────────────────────────────────
              THỨ NV 3D CẦN ĐỂ DỰNG ĐƯỢC MẪU. Trước đây panel này chỉ nói họ CÓ VIỆC (tên sản
              phẩm, deadline, nhóm KPI) mà không cho thông số nào: không NVL, không size, không
              trọng lượng yêu cầu, không đá chủ, không xi mạ.

              Toàn bộ đã nằm sẵn trong OrderItem do Order nhập ở tab Sản phẩm — chỉ là chưa ai
              nối dây sang. Hệ quả: NV 3D hỏi lại qua chat, câu trả lời không lưu ở đâu cả, nên
              người thứ hai làm cùng MO lại hỏi lần nữa và hai người có thể đang dựng theo hai
              bộ thông số khác nhau mà không ai biết.

              Dòng nào chưa nhập thì BỎ HẲN (productSpecRows lo việc đó) — khối có tới chín
              trường mà một MO thường chỉ nhập bốn năm cái. */}
          {specRows.length > 0 && (
            <PanelSection title="Thông số sản phẩm" collapsible defaultCollapsed>
              {specRows.map((row) => (
                <PanelRow key={row.label} label={row.label} value={row.value} />
              ))}
            </PanelSection>
          )}

          {/* ─── YÊU CẦU CHI TIẾT KT — thay cho "Ghi chú kỹ thuật" ────────────────
              Bản trước hiện `orderItem.techNote`. SAI NGUỒN, không phải sai nhãn — hai thứ
              khác hẳn nhau:

                techNote       cột riêng của OrderItem · PTK/PSX điền ở tab Kỹ thuật
                yeucauKyThuat  khối thiết kế · ORDER điền khi giao việc, để giải thích sản
                               phẩm cho NV 3D

              Nên NV 3D đọc được ghi chú kỹ thuật NỘI BỘ, còn bản diễn giải Order thật sự viết
              cho họ thì không thấy — rồi hỏi lại qua chat, và câu trả lời không lưu ở đâu cả.
              Đúng cái mà cả khối tài liệu này sinh ra để chấm dứt.

              📌 CẬP NHẬT 24/08/2026 — techNote ĐÃ QUAY LẠI, nhưng ở CHỖ KHÁC và DƯỚI NHÃN
              KHÁC: nó nằm trong khối "Thông số sản phẩm" phía trên, tên là "Diễn giải SP"
              (xem business/product-specs.ts). Người dùng chốt cho NV 3D đọc luôn phần diễn
              giải, thay vì chỉ có NVL / Size / Đá chủ.

              Điều đó KHÔNG mâu thuẫn với ghi chú trên. Lỗi cũ là dán techNote vào chỗ CỦA
              yeucauKyThuat, khiến đề bài thật của Order biến mất. Nay hai thứ cùng hiện, mỗi
              thứ một nhãn — đừng gộp lại, và đừng đọc đoạn này thành "cấm hiện techNote".

              MỞ SẴN, không thu gọn như bản cũ: đây là ĐỀ BÀI. Một đề bài phải bấm mới đọc được
              thì phần lớn sẽ không được đọc — mà đó chính là lý do khối này tồn tại.

              Tách riêng khỏi lưới thông số vì là câu văn dài, nhét vào cột giá trị bên phải sẽ
              vỡ bố cục hai cột. */}
          {a.yeucauKyThuat && (
            <PanelSection title="Yêu cầu chi tiết KT" collapsible>
              <p style={{ fontSize: "12px", color: "var(--ink)", lineHeight: 1.6, marginTop: "6px", whiteSpace: "pre-wrap" }}>
                {a.yeucauKyThuat}
              </p>
            </PanelSection>
          )}

          {/* ─── Tài liệu tham khảo ────────────────────────────────────────────────
              Trước đây màn này chỉ nói NV 3D CÓ VIỆC (deadline, nhóm KPI, trạng thái) mà
              không cho họ thứ để LÀM ĐƯỢC VIỆC. Ảnh vốn đã nằm sẵn trong hệ thống — Order
              nhập ở tab Sản phẩm — chỉ là chưa ai nối dây sang, nên NV 3D phải hỏi lại qua
              chat và câu trả lời không lưu ở đâu cả.

              Ẩn hẳn khối khi Order chưa gửi gì: một khối toàn ô "—" chỉ làm nhiễu.

              DẠNG THƯ VIỆN, KHÔNG PHẢI DANH SÁCH LINK. Bản trước mỗi loại tài liệu là một
              nhãn + ô ảnh + MỘT DÒNG CHỮ LINK, mà dòng link lại nói gần đúng điều nhãn đã
              nói ("Ảnh mẫu" rồi "Mở ảnh mẫu"), và video còn thêm link thứ hai "Mở ở Drive".
              Ba loại tài liệu thành sáu đoạn chữ xanh xếp so le nhau — nhìn lộn xộn vì nó
              đúng là lộn xộn.
              Nay ba ô VUÔNG BẰNG NHAU + một chú thích ngắn dưới mỗi ô, đường ra Drive thu về
              một icon nhỏ. Bấm ô là xem ngay trong webapp như trước. */}
          {(a.orderItem?.designImageUrl || a.orderItem?.designFileUrl
            || a.orderItem?.sampleImageUrl || a.orderItem?.sampleImageUploads?.length
            || a.orderItem?.sampleFolderUrl || a.orderItem?.sampleVideoUrl) && (
            <PanelSection title="Tài liệu" collapsible defaultCollapsed>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px" }}>
                {(a.orderItem.designImageUrl || a.orderItem.designFileUrl) && (
                  <DocTile caption="File 3D" driveUrl={a.orderItem.designFileUrl}>
                    <DesignFilePreview
                      url={a.orderItem.designFileUrl}
                      imageUrl={a.orderItem.designImageUrl}
                      linkLabel="Mở file 3D"
                      size="sm"
                      compact
                    />
                  </DocTile>
                )}
                {/* ─── ẢNH MẪU ĐÃ UPLOAD: XEM TRƯỚC ĐƯỢC ──────────────────────────────
                    Ghi chú cũ ở đây nói "thôi giả vờ xem trước được", và nó ĐÚNG cho thứ nó
                    đang nói tới: một LINK Drive, thường trỏ tới cả thư mục, mà webapp không
                    dựng được thành ảnh — ô xem trước rơi về icon trống, đọc y như "chưa có gì".

                    Ghi chú đó cũng tự nêu điều kiện để LÀM NGƯỢC LẠI: "File 3D bên trên GIỮ ô
                    xem trước vì nó có ảnh thumbnail THẬT DO HỆ THỐNG LƯU."

                    Ảnh mẫu upload thẳng nay đúng điều kiện đó — file nằm trong storage của
                    chính hệ thống, không phải đoán từ link. Nên chúng hiện thành ảnh; còn LINK
                    ảnh mẫu và FOLDER MẪU vẫn là nút mở Drive, đúng như trước. */}
                {a.orderItem.sampleImageUploads?.map((url, i) => (
                  <DocTile key={url} caption={`Ảnh mẫu ${i + 1}`} driveUrl={null}>
                    <DesignFilePreview url={null} imageUrl={url} linkLabel="Mở ảnh mẫu" size="sm" compact />
                  </DocTile>
                ))}
                {a.orderItem.sampleImageUrl && (
                  <DocLink caption="Ảnh mẫu (link)" url={a.orderItem.sampleImageUrl} icon={<ImageIcon className="w-4 h-4" />} />
                )}
                {/* Cột cũ `sampleVideoUrl` chỉ dùng để LÙI VỀ cho dòng chưa được chép sang. */}
                {(a.orderItem.sampleFolderUrl || a.orderItem.sampleVideoUrl) && (
                  <DocLink
                    caption="Folder mẫu"
                    url={(a.orderItem.sampleFolderUrl ?? a.orderItem.sampleVideoUrl)!}
                    icon={<FolderOpen className="w-4 h-4" />}
                  />
                )}
              </div>
            </PanelSection>
          )}

          {/* ─── HAI NHÁNH LOẠI TRỪ NHAU, và thứ tự quan trọng ────────────────
              Khi đổi người, lượt cũ được đặt reviewStatus = REWORK (cần thiết, nếu không nó
              nằm mãi trong hàng chờ kiểm). Nhưng nhánh dưới in ra "Lý do làm lại" — bảo nhân
              viên đi sửa một đơn mà server đã CHẶN họ ghi tiến độ. Giao diện hứa một việc
              không làm được, đúng lỗi đã chữa vài lần ở màn này.
              Lượt đã chuyển đi phải xét TRƯỚC và có khối riêng của nó. */}
          {design3DNoticeKind(a) === "REASSIGNED" && <ReassignedNotice assignment={a} />}
          {design3DNoticeKind(a) === "REWORK" && (
            <Note>Lý do làm lại{a.reworkCount > 1 ? ` (lần ${a.reworkCount})` : ""}: {a.reviewNote}</Note>
          )}

          {/* ─── BA TRẠNG THÁI LOẠI TRỪ NHAU ─────────────────────────────────
              Đúng MỘT khối hiện tại một thời điểm, và thứ hiện ra chính là việc CẦN LÀM tiếp
              theo. Trước đây hộp "Xác nhận nhận việc" và form cập nhật là hai điều kiện độc lập
              nên cùng hiện: người dùng điền xong mới bị server báo "chưa xác nhận nhận việc".

              CÁC Ô NHẬP ở đây; HAI CÁI NÚT ở thanh hành động dưới đáy — xem useProgressForm. */}
          {action === "CLOSED" ? (
            <Note>Lượt giao việc này đã đóng — không thể cập nhật tiến độ.</Note>
          ) : action === "ACKNOWLEDGE" ? (
            <AcknowledgeBox
              assignmentId={a.id}
              onAcknowledged={(at) => {
                // Vá mốc; TÊN người xác nhận thì để vòng đọc lại điền — route acknowledge chỉ
                // trả về id. Thiếu tên trong một nhịp là chấp nhận được; đoán tên thì không.
                onLocalPatch(a.id, { acknowledgedAt: at });
                onRevalidate();
              }}
            />
          ) : action === "PROGRESS" ? (
            <>
              {/* NHÃN VAI: panel xếp thao tác của HAI vai theo trục dọc mà không có gì nói ai làm
                  gì. Một nhãn là đủ — không cần đoạn văn giải thích. */}
              <Label>Nhân viên 3D cập nhật</Label>
              <ProgressFields f={progressForm} />
            </>
          ) : null}

          <div>
            <Label>Lịch sử cập nhật</Label>
            {a.progressLogs.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px" }}>Chưa có dòng nào.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                {a.progressLogs.map((log) => (
                  <div key={log.id} style={{
                    display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
                    fontSize: "12px", padding: "7px 10px",
                    background: "var(--cream-dark)", borderRadius: "5px",
                  }}>
                    <span style={{ color: "var(--ink-muted)", minWidth: "108px" }}>{fmtDateTime(log.createdAt)}</span>
                    <span style={{ fontWeight: 600 }}>{PROGRESS_STATUS_LABELS[log.status]}</span>
                    {log.progressPercent != null && <span>{log.progressPercent}%</span>}
                    {log.renderInfoUrl && (
                      <a
                        href={log.renderInfoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: "#1d4ed8" }}
                      >
                        File Render <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* ─── THANH HÀNH ĐỘNG — CHỈ CHỨA NÚT, KHÔNG BAO GIỜ CUỘN ────────────
            Bỏ `maxHeight` và `overflow` của bản trước: chân panel nay chỉ có một dải nút, cao cố
            định. Mọi form đã chuyển thành một BƯỚC trong thân panel, nên không còn gì ở đây cần
            cuộn — và cũng không còn khung cuộn nào để cắt mất thứ khác.

            ẨN HẲN khi đang mở một bước: bước đó đã có nút Xác nhận / Huỷ của riêng nó. Giữ thêm
            một dải nút thứ hai ở dưới là hai bộ nút cho một việc. */}
        {!sheet && (footerRole !== "NONE" || overflowActions.length > 0) && (
          <div style={{
            flexShrink: 0, borderTop: "1px solid var(--border)", background: "var(--cream-dark)",
            padding: "10px 20px", display: "flex", alignItems: "center", gap: "8px",
          }}>
            {footerRole === "DESIGNER" && (
              <>
                <button
                  type="button"
                  onClick={() => void progressForm.submit()}
                  disabled={progressForm.saving}
                  className="psx-btn-primary"
                  style={{ height: "34px", fontSize: "12px", flex: 1, minWidth: 0 }}
                >
                  {progressForm.saving ? "Đang lưu…" : "Lưu cập nhật"}
                </button>
                {/* ĐANG BỊ GÁC THÌ KHÔNG CÓ NÚT NÀY.
                    Tạm dừng là chốt sổ cho phiên đó — giờ công đã được xác nhận tại mốc dừng và đã
                    vào KPI tháng đó. Gửi kết quả sau đó sẽ đóng dấu completedAt + phán quyết
                    Đúng/Trễ hạn lên một phiên đã chốt bằng con số khác: hai lần chốt trên một
                    lượt. Server chặn cùng luật (blockedReasonForProgress) — ẩn ở đây để người dùng
                    không bấm rồi mới bị từ chối.
                    Nút "Lưu cập nhật" thì GIỮ: ghi File Render / ghi chú trong lúc bị gác là vô
                    hại (không đụng giờ công, không đụng deadline) và là thứ cần được ghi nhận. */}
                {!openPauseSpan && (
                  // Viền, không đầy màu: hành động KHÔNG QUAY LẠI ĐƯỢC không được là nút hút mắt
                  // nhất. Nhưng nó ĐỨNG CẠNH nút kia — hạ bậc bằng MÀU, không bằng khoảng cách.
                  <button
                    type="button"
                    onClick={() => setSheet("COMPLETE")}
                    disabled={progressForm.saving}
                    className="psx-btn-secondary"
                    style={{ height: "34px", fontSize: "12px", flex: 1, minWidth: 0 }}
                  >
                    Hoàn tất &amp; gửi
                  </button>
                )}
              </>
            )}

            {/* `footerRole === "REVIEWER"` nay CHỈ xảy ra ở AWAITING_REVIEW — lượt đã duyệt không
                còn thao tác nào (xem reviewerActs). Nên không cần nhánh `action !== "DONE"` nữa,
                và "Yêu cầu làm lại" chỉ còn là đường bác một bản CHƯA duyệt. */}
            {footerRole === "REVIEWER" && (
              <>
                <button
                  type="button"
                  onClick={() => setSheet("ACCEPT")}
                  className="psx-btn-primary"
                  style={{ height: "34px", fontSize: "12px", flex: 1, minWidth: 0 }}
                >
                  Nhận kết quả
                </button>
                <button
                  type="button"
                  onClick={() => setSheet("REWORK")}
                  className="psx-btn-secondary"
                  style={{ height: "34px", fontSize: "12px", flex: 1, minWidth: 0 }}
                >
                  Yêu cầu làm lại
                </button>
              </>
            )}

            {/* NÚT GỌN "⋯", KHÔNG PHẢI CHỮ "THAO TÁC KHÁC ▾".
                Drawer rộng 480px không chứa nổi ba nhãn chữ: bản trước ba cái nút đẩy tràn ngang,
                sinh một thanh cuộn NGANG cho cả panel và cắt mất chữ cuối. Hai nút chính chia đều
                phần còn lại (`flex: 1`), nút này giữ bề rộng cố định.

                Nó chỉ MỞ MỘT BƯỚC, không mở popup — xem chú thích ở nhánh "MORE". */}
            {overflowActions.length > 0 && (
              <button
                type="button"
                onClick={() => setSheet("MORE")}
                className="psx-btn-secondary"
                style={{ height: "34px", width: "40px", flexShrink: 0, fontSize: "16px", lineHeight: 1, padding: 0 }}
                title="Thao tác khác"
                aria-label="Thao tác khác"
              >
                ⋯
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Khối duyệt kết quả (Order/Admin) ────────────────────────────────────────
//
// Gọi ĐÚNG API mà sidebar đơn hàng vẫn gọi (POST .../review) — không viết đường ghi thứ hai.
// Route đó lo trọn chuỗi hệ quả: ghi phán quyết, tăng số lần làm lại, đẩy File Render thành
// File 3D chính thức của MO, ghi Lịch sử thay đổi, chuyển đơn sang chờ khách duyệt. Dựng
// một đường riêng cho màn này là chắc chắn thiếu mất vài mắt xích trong đó.







/**
 * MỌI QUYẾT ĐỊNH CỦA NGƯỜI DUYỆT NẰM TRONG MỘT THẺ.
 *
 * VẤN ĐỀ ĐANG SỬA: `Tạm dừng`, `Nhận kết quả`, `Yêu cầu làm lại`, `Đổi người thiết kế` đều gác
 * sau cùng một điều kiện `canReview` — cùng là quyết định của Admin/Đặt đơn. Nhưng `Tạm dừng` nằm
 * trong thẻ TRẠNG THÁI ở đầu panel, còn ba nút kia ở cuối, cách nhau cả màn hình cuộn.
 *
 * Chỗ cũ của `Tạm dừng` không phải do ý nghĩa của nó quyết định, mà do FORM của nó: dải đó từng
 * được nới rộng hết hàng để bốn ô nhập không bị nén. Khi form đóng, nó để lại một dải trống chỉ
 * chứa một cái nút nhỏ nép phải — đúng chỗ trông rời rạc nhất trên panel.
 *
 * ĐẶT SAU LỊCH SỬ CẬP NHẬT, không phải trên đầu: người duyệt cần xem File Render và tiến độ TRƯỚC
 * khi quyết. Để nút ngay dưới dải trạng thái thì họ quyết trước khi nhìn thứ mình đang duyệt.
 *
 * Thẻ hiện ở MỌI trạng thái còn sống, các nút bên trong bật/tắt riêng: `Tạm dừng` phải dùng được
 * khi đơn đang làm (chưa có kết quả), còn `Nhận kết quả` chỉ có nghĩa khi đang chờ kiểm.
 */
/**
 * Sheet nào đang mở trong panel — ĐÚNG MỘT cái tại một thời điểm.
 *
 * Trước đây mỗi component tự giữ cờ mở của mình (`formOpen`, `reworkOpen`, `confirmSend`…), nên
 * form cập nhật tiến độ của NV 3D và form tạm dừng của người duyệt bày ra CÙNG LÚC — hai chỗ nhập
 * liệu cho hai vai khác nhau trên cùng một màn. Một biến ở panel làm việc đó thành không thể.
 */
type PanelSheet =
  | null
  | "COMPLETE" | "ACCEPT" | "REWORK" | "REASSIGN" | "PAUSE"
  /** Danh sách hành động hiếm. Là một BƯỚC, không phải popup — popup trong drawer 480px bị
   *  khung cha cắt mất và vùng bấm quá nhỏ trên máy cảm ứng. */
  | "MORE";




// ─── Mảnh giao diện dùng lại ─────────────────────────────────────────────────

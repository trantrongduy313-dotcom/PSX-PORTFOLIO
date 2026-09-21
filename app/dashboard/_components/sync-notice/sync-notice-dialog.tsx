"use client";

import { AlertTriangle, X } from "lucide-react";

import { Z } from "@/app/lib/ui/z-index";
import { formatVnDateTime } from "@/app/lib/utils/vn-date";
import { flattenNotice, type SyncNoticeMonth } from "@/app/lib/business/orders/sync-notice";
import { LechNgayDetail, NoticeRow, NoticeSection } from "./sync-notice-rows";

// ─── "Việc cần xử lý" — nhắc việc từ mẻ đồng bộ Google Sheet ─────────────────
//
// File này là KHUNG hộp thoại. Cách trình bày một mục việc nằm ở sync-notice-rows.tsx.
//
// 🔴 KHÔNG CÓ NÚT "ĐÃ XỬ LÝ", VÀ ĐÓ LÀ QUYẾT ĐỊNH QUAN TRỌNG NHẤT CỦA MÀN NÀY.
//
// Cách duy nhất để một mục biến mất là LÀM THẬT — chuyển MO sang Hoàn tất, hoặc sửa ngày. Mẻ
// đồng bộ hôm sau sẽ không còn ghi nó, và nó tự rụng. Một nút "bỏ qua" sẽ biến bộ dò này thành
// nơi chôn việc: bấm hết một lượt thì danh sách sạch, còn việc thì vẫn nguyên.
//
// 🔴 VÀ KHÔNG DÙNG `Alert`. Route tạo cảnh báo LUÔN tạm ngưng đơn (không kiểm severity), mà
// "quên bấm chuyển MO" không phải lý do để dừng một đơn thật ngoài xưởng.
//
// ⚠️ MỘT ĐIỂM NHẤN VÀNG DUY NHẤT — biểu tượng ở đây. Bản đầu tô vàng cả icon lịch trong từng
// mục lệch ngày; hai điểm nhấn thì không còn điểm nhấn nào.

type Props = {
  months: SyncNoticeMonth[];
  onClose: () => void;
};

export function SyncNoticeDialog({ months, onClose }: Props) {
  const { chuaHoanTat, lechNgay, latestSyncedAt, total } = flattenNotice(months);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(42,39,37,0.45)",
          zIndex: Z.SYNC_NOTICE_DIALOG_BACKDROP,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Việc cần xử lý từ đồng bộ Google Sheet"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          zIndex: Z.SYNC_NOTICE_DIALOG,
          width: "min(520px, calc(100vw - 32px))", maxHeight: "min(70vh, 640px)",
          display: "flex", flexDirection: "column",
          background: "var(--cream-card)", border: "1px solid var(--border-md)",
          borderRadius: "var(--radius-sm)", boxShadow: "0 8px 40px rgba(42,39,37,0.22)",
        }}
      >
        <header style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "14px 16px", borderBottom: "1px solid var(--border)",
        }}>
          <AlertTriangle style={{ width: "16px", height: "16px", color: "var(--s-gold, #b45309)" }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>
              Việc cần xử lý
            </p>
            {/* MỘT mốc thời gian, ở đây. Bản đầu lặp mốc theo từng tháng — hai tháng cùng một mẻ
                hiện "10:46" và "10:47", chênh một phút và không mang thông tin nào. Tháng nào
                thật sự cũ thì tự lên tiếng ở dòng của nó (xem FlatRow.staleSyncedAt). */}
            <p style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
              Đối chiếu Google Sheet
              {latestSyncedAt && ` · ${formatVnDateTime(latestSyncedAt)}`}
            </p>
          </div>
          <span style={{
            fontSize: "15px", fontWeight: 700, color: "var(--ink)",
            fontVariantNumeric: "tabular-nums",
          }}>
            {total}
          </span>
          <button type="button" onClick={onClose} aria-label="Đóng"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)" }}>
            <X style={{ width: "16px", height: "16px" }} />
          </button>
        </header>

        <div style={{ overflowY: "auto", padding: "12px 16px" }}>
          {chuaHoanTat.length > 0 && (
            <NoticeSection
              title="Chưa chuyển sang Hoàn tất"
              hint="Xưởng đã báo hoàn tất trong sheet."
              count={chuaHoanTat.length}
            >
              {chuaHoanTat.map((x) => (
                <NoticeRow key={`${x.month}:${x.mo}`} row={x} onClose={onClose} />
              ))}
            </NoticeSection>
          )}

          {lechNgay.length > 0 && (
            <NoticeSection
              title="Lệch Ngày HT"
              hint="Hệ thống không tự sửa — cần người quyết bên nào đúng."
              count={lechNgay.length}
            >
              {lechNgay.map((x) => (
                <NoticeRow key={`${x.month}:${x.mo}`} row={x} onClose={onClose}
                  extra={<LechNgayDetail webapp={x.webapp} sheet={x.sheet} />} />
              ))}
            </NoticeSection>
          )}
        </div>

        <footer style={{
          padding: "10px 16px", borderTop: "1px solid var(--border)",
          fontSize: "11px", color: "var(--ink-muted)",
        }}>
          {/* Nói rõ cơ chế: người dùng phải biết vì sao không có nút "đã xử lý", nếu không họ sẽ
              đi tìm nó rồi kết luận màn hình bị thiếu. */}
          Làm xong thì mục tự biến mất sau lần đồng bộ kế tiếp.
        </footer>
      </div>
    </>
  );
}

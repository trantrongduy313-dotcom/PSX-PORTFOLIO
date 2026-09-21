"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { formatMoVersionedDisplay } from "@/app/lib/business/order-helpers";
import { formatVnDateTime } from "@/app/lib/utils/vn-date";
import type { FlatRow } from "@/app/lib/business/orders/sync-notice";

// ─── Cách trình bày MỘT mục việc ─────────────────────────────────────────────
//
// Tách khỏi sync-notice-dialog.tsx theo đường nối thật: bên kia là KHUNG hộp thoại (nền mờ,
// tiêu đề, đóng/mở, cuộn), bên này là CÁCH ĐỌC một mục việc. Hai lý do để thay đổi khác nhau —
// đổi bố cục dòng không đụng tới khung, và ngược lại.
//
// 🎯 DÒNG CÓ CỘT, KHÔNG PHẢI CHIP. Bản đầu dùng chip xếp wrap; chip chỉ hợp khi các mục NGẮN
// VÀ ĐỀU. Ở đây mục "lệch ngày" dài gấp bốn mục "chưa hoàn tất", nên nó chiếm trọn một dòng và
// phá lưới ngay khi có mục thứ hai. Dòng có cột thì MO thẳng cột MO, SO thẳng cột SO, dài ngắn
// không ảnh hưởng gì.

/** "2026-07-11" → "11/07". Cả hệ thống đọc ngày kiểu VN; chuỗi ISO là dữ liệu, không phải chữ. */
function vnDayMonth(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}` : ymd;
}

/** "2026-07" → "T07". Cột hẹp, và năm đã có ở mốc đầu hộp thoại. */
function monthTag(month: string): string {
  return `T${month.slice(5)}`;
}

export function NoticeSection({ title, hint, count, children }: {
  title: string; hint: string; count: number; children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <h3 style={{
          flex: 1, fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.06em", color: "var(--ink)",
        }}>
          {title}
        </h3>
        {/* Đếm ở HAI chỗ, không ba: tổng ở đầu hộp thoại, số mỗi loại ở đây. Bản đầu còn ghi
            "3 MO chưa chuyển sang Hoàn tất" — lặp cả con số lẫn chữ "MO" mà cột đầu đã là MO. */}
        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-muted)", fontVariantNumeric: "tabular-nums" }}>
          {count}
        </span>
      </div>
      {/* Câu này xuất hiện ĐÚNG MỘT LẦN. Bản đầu nhóm theo tháng nên nó lặp lại ở mỗi tháng. */}
      <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: "2px 0 6px" }}>{hint}</p>
      <div>{children}</div>
    </section>
  );
}

export function NoticeRow({ row, extra, onClose }: {
  row: FlatRow; extra?: React.ReactNode; onClose: () => void;
}) {
  // 🔴 HỢP ĐỒNG VỚI PANEL LÀ HAI THAM SỐ, KHÔNG PHẢI MỘT.
  //
  // Chỉ `?orderId=` thì panel mở ở cấp ĐƠN HÀNG và hiện "MO# —" — người dùng đã báo đúng hiện
  // tượng đó. `?activeItemId=` mới là thứ chọn đúng MO (xem alerts-client.tsx).
  //
  // Vẫn chịu được khi thiếu `itemId`: ảnh chụp do bản code trước ghi ra không có trường này, và
  // mất đường dẫn vẫn hơn mất lời nhắc.
  const href = row.itemId
    ? `/dashboard/orders?orderId=${row.orderId}&activeItemId=${row.itemId}`
    : `/dashboard/orders?orderId=${row.orderId}`;

  return (
    <Link
      href={href}
      onClick={onClose}
      style={{
        display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "baseline",
        columnGap: "10px", padding: "6px 2px",
        borderTop: "1px solid var(--border)", color: "var(--ink)", textDecoration: "none",
      }}
    >
      {/* Mono CHỈ cho mã số. Hậu tố "_1" là quy ước hiển thị (formatMoVersionedDisplay), không
          nằm trong DB.

          🔴 CỜ PHẢI LÀ CỦA CHÍNH MO NÀY. Bản trước đóng cứng `true` ngay dưới một comment nói
          "đừng dựng cách đọc MO# thứ hai" — và làm đúng việc đó: MO nhập từ Odoo mọc thêm "_1"
          mà bảng Đơn hàng không hề có. `?? false` là đúng mặc định của orders-table.tsx. */}
      <span style={{ fontSize: "12px", fontFamily: "var(--font-mono, monospace)" }}>
        {formatMoVersionedDisplay(row.mo, row.isFromWebapp ?? false)}
      </span>

      {/* SO có NHÃN. Không nhãn thì hai mã cùng font đứng cạnh nhau đọc thành hai thứ ngang hàng. */}
      <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
        {row.so && <>SO <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{row.so}</span></>}
      </span>

      <span style={{ fontSize: "11px", color: "var(--ink-muted)", whiteSpace: "nowrap" }}>
        {monthTag(row.month)}
        {/* Chỉ lên tiếng khi tháng này KHÔNG được quét trong mẻ mới nhất — xem FlatRow.staleSyncedAt. */}
        {row.staleSyncedAt && (
          <span title="Tháng này đã ra khỏi cửa sổ quét — số liệu giữ từ lần đồng bộ cuối">
            {" "}· {formatVnDateTime(row.staleSyncedAt)}
          </span>
        )}
      </span>

      {extra && (
        <span style={{
          gridColumn: "1 / -1", display: "inline-flex", alignItems: "center", gap: "5px",
          fontSize: "11px", color: "var(--ink-muted)", marginTop: "2px",
        }}>
          {extra}
        </span>
      )}
    </Link>
  );
}

export function LechNgayDetail({ webapp, sheet }: { webapp: string; sheet: string }) {
  return (
    <>
      <CalendarClock style={{ width: "11px", height: "11px" }} />
      webapp <strong style={{ fontWeight: 600, color: "var(--ink)" }}>{vnDayMonth(webapp)}</strong>
      {" · "}sheet <strong style={{ fontWeight: 600, color: "var(--ink)" }}>{vnDayMonth(sheet)}</strong>
    </>
  );
}

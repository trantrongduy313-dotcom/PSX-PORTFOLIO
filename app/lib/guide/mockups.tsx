// UI Mockups for the user guide — built from the exact design tokens and component
// patterns used in the real app. Non-interactive (pointer-events: none).
//
// ⚠️ CHỮ TRONG HÌNH PHẢI LÀ CHỮ THẬT. Hình ở đây là bản VẼ chứ không phải ảnh chụp, nên không
// có gì buộc nó khớp giao diện — đúng chỗ hỏng đã xảy ra: hình luồng trạng thái từng vẽ bảy
// nhãn tự đặt ("Nháp", "Chờ TK"…) trong khi bảng thật hiện "Chưa thiết kế", "Làm INFO"… và
// KHÔNG chữ nào trùng. Lấy nguyên văn từ labels.ts / STAGE_LABEL, đừng rút gọn cho vừa khung.
import React from "react";
import { STAGE_LABEL, STAGE_ORDER } from "@/app/lib/business/production-stage";
// ⚠️ HƯỚNG IMPORT NÀY HƠI NGƯỢC (lib đọc sang _components), và đó là lựa chọn có cân nhắc:
// report-fields.ts là một MODULE DỮ LIỆU thuần (không "use client", không React), và nó là
// nguồn thật của tên cột + tên nhóm trong hộp thoại In. Chép tay sang đây là tạo nơi thứ hai
// cho đúng thứ vừa phải đi sửa vì lệch. Nếu về sau nó bị chuyển chỗ, chuyển sang app/lib/business.
import { REPORT_FIELDS, REPORT_GROUPS } from "@/app/dashboard/orders/_components/report-fields";

// ── Shared primitives ─────────────────────────────────────────────────────────

/** macOS-style window frame with URL bar */
const Frame = ({ url, children }: { url: string; children: React.ReactNode }) => (
  <div style={{
    borderRadius: "10px", overflow: "hidden",
    border: "1px solid #D9D4CE",
    boxShadow: "0 4px 24px rgba(26,23,20,0.12)",
    margin: "22px 0",
    pointerEvents: "none", userSelect: "none",
    fontSize: "12px", background: "#F2EDE8",
  }}>
    {/* Chrome bar */}
    <div style={{
      background: "#E8E4DE", padding: "7px 12px",
      display: "flex", alignItems: "center", gap: "8px",
      borderBottom: "1px solid #D9D4CE",
    }}>
      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#FF5F57", flexShrink: 0 }} />
      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#FFBD2E", flexShrink: 0 }} />
      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#28CA41", flexShrink: 0 }} />
      <div style={{
        flex: 1, maxWidth: "280px", margin: "0 auto",
        background: "#F2EDE8", border: "1px solid #D9D4CE",
        borderRadius: "5px", padding: "2px 10px",
        fontSize: "10.5px", color: "#9C9690", textAlign: "center",
      }}>
        {url}
      </div>
    </div>
    {children}
  </div>
);

/** Status / zone badge — mirrors .psx-badge class */
const Badge = ({ label, color }: { label: string; color: string }) => (
  <span style={{
    display: "inline-flex", alignItems: "center",
    height: "20px", padding: "0 9px",
    borderRadius: "999px", fontSize: "10px",
    fontWeight: 400, letterSpacing: "0.04em",
    border: `1px solid ${color}`, color,
    whiteSpace: "nowrap", flexShrink: 0,
    fontFamily: "var(--font-body, sans-serif)",
  }}>
    {label}
  </span>
);

/** Priority dot — mirrors PriorityDot in orders-table.tsx */
const PriorityDot = ({ color }: { color: string }) => (
  <span style={{
    display: "inline-block", width: "8px", height: "8px",
    borderRadius: "50%", flexShrink: 0, background: color,
  }} />
);

/** Divider line */
const Divider = () => (
  <div style={{ height: "1px", background: "#D9D4CE" }} />
);

/** Table row — generic */
const TR = ({ children, active }: { children: React.ReactNode; active?: boolean }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: "10px",
    padding: "8px 16px", fontSize: "11.5px",
    background: active ? "#E8E4DE" : "transparent",
    borderBottom: "1px solid #D9D4CE",
    color: "#6B6560",
  }}>
    {children}
  </div>
);

/** Sidebar nav item */
const NavItem = ({ label, active }: { label: string; active?: boolean }) => (
  <div style={{
    padding: "8px 14px", fontSize: "12px",
    color: active ? "#1A1714" : "#6B6560",
    fontWeight: active ? 500 : 400,
    background: active ? "#E8E4DE" : "transparent",
    borderLeft: active ? "2px solid #9B2D6F" : "2px solid transparent",
  }}>
    {label}
  </div>
);

/** Tab button — mirrors store-detail-client tabs */
const Tab = ({ label, count, active }: { label: string; count?: number; active?: boolean }) => (
  <div style={{
    padding: "10px 14px", fontSize: "10.5px", fontWeight: active ? 700 : 400,
    textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap",
    color: active ? "#1A1714" : "#9C9690",
    borderBottom: active ? "2px solid #9B2D6F" : "2px solid transparent",
    display: "flex", alignItems: "center", gap: "5px",
  }}>
    {label}
    {count !== undefined && (
      <span style={{ fontSize: "10px", fontWeight: 700, color: active ? "#9B2D6F" : "#9C9690" }}>
        {count}
      </span>
    )}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE GUIDE MOCKUPS
// ═══════════════════════════════════════════════════════════════════════════════

/** Ch1 — App layout overview */
export const AppOverviewMockup = () => (
  <Frame url="app.kimhoan.vn/dashboard/orders">
    <div style={{ display: "flex", height: "200px" }}>
      {/* Sidebar */}
      <div style={{
        width: "160px", flexShrink: 0,
        background: "#EEEBE5", borderRight: "1px solid #D9D4CE",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "14px 14px 10px" }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "15px", color: "#1A1714", letterSpacing: "0.06em" }}>PSX</div>
          <div style={{ fontSize: "9px", color: "#9C9690", letterSpacing: "0.12em", textTransform: "uppercase" }}>Management</div>
        </div>
        <Divider />
        <div style={{ padding: "6px 0" }}>
          <NavItem label="Dashboard" />
          <NavItem label="Đơn hàng" />
          <NavItem label="Tạo đơn" />
          <NavItem label="Cảnh báo" />
        </div>
        <div style={{ padding: "2px 0 6px" }}>
          <div style={{ padding: "5px 14px", fontSize: "9px", color: "#9C9690", letterSpacing: "0.12em", textTransform: "uppercase" }}>Tài liệu</div>
          <NavItem label="Hướng dẫn" />
        </div>
        <div style={{ padding: "2px 0" }}>
          <div style={{ padding: "5px 14px", fontSize: "9px", color: "#9C9690", letterSpacing: "0.12em", textTransform: "uppercase" }}>Cửa hàng</div>
          <NavItem label="● CH1" active />
          <NavItem label="● CH2" />
          <NavItem label="● CH3" />
        </div>
      </div>
      {/* Main */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px 0", display: "flex", borderBottom: "1px solid #D9D4CE", gap: "2px" }}>
          <Tab label="Hoạt Động" count={15} active />
          <Tab label="Phòng TK" count={10} />
          <Tab label="Phòng SX" count={5} />
          <Tab label="Hoàn Tất" />
          <Tab label="Đã Hủy" />
        </div>
        <TR><PriorityDot color="#8A6A1A" /><span style={{ color: "#1A1714", fontWeight: 500 }}>26.12345_1</span><span style={{ flex: 1 }}>Nhẫn vàng 18K</span><Badge label="Đang TK" color="#1E40AF" /></TR>
        <TR><PriorityDot color="#C8C3BC" /><span style={{ color: "#1A1714", fontWeight: 500 }}>26.12346</span><span style={{ flex: 1 }}>Bông tai V18K</span><Badge label="Đang SX" color="#8A6A1A" /></TR>
        <TR><PriorityDot color="#9B2D2D" /><span style={{ color: "#1A1714", fontWeight: 500 }}>26.12347</span><span style={{ flex: 1 }}>Lắc tay bạc</span><Badge label="Duyệt TK" color="#8A6A1A" /></TR>
        <TR><PriorityDot color="#C8C3BC" /><span style={{ color: "#1A1714", fontWeight: 500 }}>26.12348</span><span style={{ flex: 1 }}>Mặt dây 750</span><Badge label="Hoàn tất" color="#2D7A4F" /></TR>
      </div>
    </div>
  </Frame>
);

/** Ch2 — Login page */
export const LoginMockup = () => (
  <Frame url="app.kimhoan.vn/auth/login">
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "36px 24px", gap: "20px",
      background: "#F2EDE8", minHeight: "180px",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: "28px", letterSpacing: "0.08em", color: "#1A1714" }}>PSX</div>
        <div style={{ fontSize: "10px", color: "#9C9690", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: "2px" }}>Jewelry Production Management</div>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "10px 20px", borderRadius: "6px",
        border: "1px solid #D9D4CE", background: "#EEEBE5",
        fontSize: "12.5px", color: "#1A1714", cursor: "pointer",
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Đăng nhập bằng Google
      </div>
      <div style={{ fontSize: "10px", color: "#9C9690" }}>Sử dụng tài khoản Google do công ty cấp</div>
    </div>
  </Frame>
);

/**
 * Ch3 — Màn Danh sách đơn hàng như SALES thấy: thanh cửa hàng + 4 tab.
 *
 * ⚠️ BỐN TAB, KHÔNG PHẢI TÁM. Bản trước của hình này vẽ "Đang Hoạt Động / Đã Hoàn Tất" và
 * khung URL trỏ tới /dashboard/stores/ch1 — cả hai đều không còn:
 *
 *   · TABS thật chỉ có 4 (orders-client.tsx `const TABS`), và tab "all" đã bị bỏ
 *     (orders-client.tsx: `// tab "all" đã bỏ → map về PSX`).
 *   · /dashboard/stores ĐÃ BỊ XOÁ. Trước đó nó chỉ còn là một trang mồ côi — không mục nào
 *     trong NAV_SECTIONS trỏ tới. SALES nay vào thẳng /dashboard/orders và chọn cửa hàng ở
 *     THANH RIÊNG của họ (chip "Tất cả" + từng mã cửa hàng).
 *
 * Nhãn tab lấy đúng chữ trong labels.ts (`ui.tabs`), không đặt lại tên cho gọn: người đọc
 * đối chiếu hình với màn hình bằng chính con chữ.
 */
export const SalesOrdersMockup = () => (
  <Frame url="app.kimhoan.vn/dashboard/orders">
    <div style={{ background: "#EEEBE5" }}>
      {/* Store Quick Bar — CHỈ vai trò SALES mới có (orders-client.tsx) */}
      <div style={{
        display: "flex", alignItems: "center", gap: "6px",
        padding: "8px 16px", borderBottom: "1px solid #D9D4CE", background: "#F2EDE8",
      }}>
        <span style={{ fontSize: "10px", fontWeight: 500, color: "#9C9690", textTransform: "uppercase", letterSpacing: "0.1em", marginRight: "4px" }}>
          Cửa hàng:
        </span>
        {/* Chip "Tất cả" đứng ĐẦU và KHÔNG có chấm màu — nó không phải một cửa hàng. Đây là
            đường quay lại sau khi đã lọc; thiếu nó thì Sales kẹt trong một cửa hàng. */}
        {[
          { code: "Tất cả", color: null,      on: false },
          { code: "CH1",    color: "#9B2D6F", on: true  },
          { code: "CH2",    color: "#1E40AF", on: false },
          { code: "CH3",    color: "#8A6A1A", on: false },
        ].map((s) => (
          <span key={s.code} style={{
            display: "flex", alignItems: "center", gap: "5px",
            padding: "3px 10px", borderRadius: "999px", fontSize: "11px",
            border: `1px solid ${s.on && s.color ? s.color : "#D9D4CE"}`,
            background: s.on && s.color ? `${s.color}12` : "#EEEBE5",
            color: s.on && s.color ? s.color : "#9C9690", fontWeight: s.on ? 600 : 400,
          }}>
            {s.color && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: s.color }} />}
            {s.code}
          </span>
        ))}
      </div>
      {/* Bốn tab thật */}
      <div style={{ padding: "0 16px", display: "flex", alignItems: "flex-end", gap: "1px", borderBottom: "1px solid #D9D4CE" }}>
        <Tab label="Phòng Thiết Kế" count={10} active />
        <Tab label="Phòng Sản Xuất" count={5} />
        <Tab label="Hoàn tất" count={128} />
        <Tab label="Đã hủy" count={3} />
      </div>
    </div>
    {/* Table header */}
    <div style={{
      display: "flex", alignItems: "center", gap: "10px",
      padding: "7px 16px", fontSize: "10px",
      color: "#9C9690", letterSpacing: "0.08em", textTransform: "uppercase",
      borderBottom: "1px solid #D9D4CE", background: "#F2EDE8",
    }}>
      <span style={{ width: "8px" }} />
      <span style={{ width: "90px" }}>Mã SO / MO</span>
      <span style={{ flex: 1 }}>Sản phẩm</span>
      <span style={{ width: "50px" }}>NVL</span>
      <span style={{ width: "40px" }}>TL (g)</span>
      <span style={{ width: "90px" }}>Trạng thái</span>
      <span style={{ width: "60px" }}>Ngày giao</span>
    </div>
    {/* Rows */}
    {[
      { dot: "#8A6A1A", so: "26.12345_1", sp: "Nhẫn kiềng V18K", nvl: "V18K", tl: "5.20", badge: "Đang TK", bcolor: "#1E40AF", date: "20/06" },
      { dot: "#C8C3BC", so: "26.12346",   sp: "Bông tai đá CZ",  nvl: "V18K", tl: "2.80", badge: "Duyệt TK", bcolor: "#8A6A1A", date: "22/06" },
      { dot: "#9B2D2D", so: "26.12347",   sp: "Lắc tay bạc 925", nvl: "Bạc", tl: "8.50", badge: "Đang SX", bcolor: "#8A6A1A", date: "18/06" },
      { dot: "#C8C3BC", so: "26.12348",   sp: "Mặt dây chuyền",  nvl: "V750", tl: "3.10", badge: "Đang TK", bcolor: "#1E40AF", date: "25/06" },
    ].map((r, i) => (
      <div key={i} style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 16px", borderBottom: "1px solid #D9D4CE",
        background: i === 2 ? "#E8E4DE" : "#F2EDE8", fontSize: "12px",
      }}>
        <PriorityDot color={r.dot} />
        <span style={{ width: "90px", color: "#1A1714", fontWeight: 500 }}>{r.so}</span>
        <span style={{ flex: 1, color: "#6B6560" }}>{r.sp}</span>
        <span style={{ width: "50px", color: "#6B6560" }}>{r.nvl}</span>
        <span style={{ width: "40px", color: "#6B6560" }}>{r.tl}</span>
        <span style={{ width: "90px" }}><Badge label={r.badge} color={r.bcolor} /></span>
        <span style={{ width: "60px", color: "#9C9690" }}>{r.date}</span>
      </div>
    ))}
  </Frame>
);

/**
 * Ch4 — Thanh tìm kiếm + các nút lọc nhanh.
 *
 * Chữ trong ô tìm lấy nguyên văn `labels.ts → ui.toolbar.searchPlaceholder`, kể cả đoạn
 * "(hỗ trợ không dấu)" — đó là một tính năng thật và người đọc cần thấy nó ở đây.
 */
export const SearchFilterMockup = () => (
  <Frame url="app.kimhoan.vn/dashboard/orders">
    <div style={{ padding: "14px 16px", background: "#F2EDE8" }}>
      {/* Search row */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: "7px",
          padding: "7px 12px", border: "1px solid #D9D4CE",
          borderRadius: "4px", background: "#EEEBE5",
          fontSize: "12px", color: "#9C9690",
        }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><circle cx="8" cy="8" r="5.5" stroke="#9C9690" strokeWidth="1.5"/><path d="m12 12 4 4" stroke="#9C9690" strokeWidth="1.5" strokeLinecap="round"/></svg>
          Tìm mã đơn, KH, Sales, MO#, sản phẩm (hỗ trợ không dấu)
        </div>
        {/* MỘT nút lọc nhanh. Từng vẽ hai (Ưu tiên + Hỏa tốc) — nút "Hỏa tốc" đã bỏ vì nó lọc
            ra ĐÚNG cùng tập với "Ưu tiên" (api/orders/route.ts: `if (isPriority || isRush)`). */}
        {[
          { label: "Ưu tiên",  on: true,  color: "#8A6A1A" },
        ].map(c => (
          <div key={c.label} style={{
            padding: "7px 12px", borderRadius: "4px", fontSize: "11.5px",
            border: `1px solid ${c.on ? c.color : "#D9D4CE"}`,
            background: c.on ? `${c.color}15` : "#EEEBE5",
            color: c.on ? c.color : "#9C9690", fontWeight: c.on ? 600 : 400,
            display: "flex", alignItems: "center", gap: "5px",
          }}>
            {c.on && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: c.color }} />}
            {c.label}
          </div>
        ))}
      </div>
      {/* Ba nút lọc theo hạn — orders-toolbar.tsx (deadlinePreset) */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
        {[
          { label: "7 ngày tới", on: false },
          { label: "Tuần này",   on: false },
          { label: "Quá hạn",    on: true  },
        ].map((p) => (
          <span key={p.label} style={{
            padding: "4px 11px", borderRadius: "4px", fontSize: "11px",
            border: `1px solid ${p.on ? "#9B2D2D" : "#D9D4CE"}`,
            background: p.on ? "rgba(155,45,45,0.07)" : "#EEEBE5",
            color: p.on ? "#9B2D2D" : "#9C9690", fontWeight: p.on ? 600 : 400,
          }}>{p.label}</span>
        ))}
      </div>
      {/* Tab row — BỐN tab, đúng `const TABS` trong orders-client.tsx */}
      <div style={{ display: "flex", borderBottom: "1px solid #D9D4CE", gap: "2px" }}>
        <Tab label="Phòng Thiết Kế" active />
        <Tab label="Phòng Sản Xuất" />
        <Tab label="Hoàn tất" />
        <Tab label="Đã hủy" />
      </div>
    </div>
    {/* Sample filtered result */}
    <div style={{
      padding: "7px 16px", fontSize: "10.5px", color: "#9C9690",
      borderBottom: "1px solid #D9D4CE", background: "#F2EDE8",
      display: "flex", alignItems: "center", gap: "6px",
    }}>
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#8A6A1A" }} />
      <span>Đang hiển thị <strong style={{ color: "#1A1714" }}>4</strong> MO có ưu tiên</span>
    </div>
    <TR active><PriorityDot color="#8A6A1A" /><span style={{ color: "#1A1714", fontWeight: 600 }}>UT1</span><span style={{ color: "#1A1714", fontWeight: 500 }}>26.12345</span><span style={{ flex: 1 }}>Nhẫn vàng 18K</span><Badge label="Đang TK" color="#1E40AF" /></TR>
    <TR><PriorityDot color="#1E40AF" /><span style={{ color: "#1A1714", fontWeight: 600 }}>UT2</span><span style={{ color: "#1A1714", fontWeight: 500 }}>26.12349</span><span style={{ flex: 1 }}>Dây chuyền bạc</span><Badge label="Duyệt TK" color="#8A6A1A" /></TR>
  </Frame>
);

/**
 * Ch5 — Lọc nâng cao → In / Xuất PDF.
 *
 * 🎯 VÌ SAO MỘT HÌNH CHỨ KHÔNG PHẢI HAI: trong app hai nút này nằm CẠNH NHAU trên cùng một
 * hàng (orders-client.tsx), và con số trên nút In chính là số dòng CÒN LẠI SAU KHI LỌC. Vẽ
 * rời hai hình là giấu mất mối nối đó — mà mối nối đó chính là bài học của cả chương.
 *
 * Số 24 trên nút và số 24 ở chân bảng chọn cột phải TRÙNG NHAU: người đọc nhìn ra quy tắc
 * "in đúng cái đang thấy" mà không cần ai giải thích.
 */
export const ReportExportMockup = () => {
  // Nhóm ĐƠN HÀNG vẽ ĐỦ từ REPORT_FIELDS — khớp đúng những gì hộp thoại thật hiện.
  // Hai nhóm còn lại chỉ hiện tiêu đề + SỐ CỘT (đếm thật), vì vẽ trọn ~30 ô tích sẽ dài hơn cả
  // chương. Đây là bản RÚT GỌN CÓ KHAI BÁO, không phải một bản vẽ thiếu mà giả vờ là đủ.
  const orderFields = REPORT_FIELDS.filter((f) => f.group === "order");
  const rest = REPORT_GROUPS.filter((g) => g.key !== "order").map((g) => ({
    label: g.label,
    count: REPORT_FIELDS.filter((f) => f.group === g.key).length,
  }));
  const checked = new Set(["so", "mo", "customer", "product"]);

  return (
    <Frame url="app.kimhoan.vn/dashboard/orders">
      {/* Hàng nút: Lọc nâng cao + In / Xuất PDF */}
      <div style={{
        display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px",
        padding: "10px 16px", background: "#F2EDE8", borderBottom: "1px solid #D9D4CE",
      }}>
        <span style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "4px 12px", height: "28px", fontSize: "11px", fontWeight: 600,
          border: "1px solid #8A6A1A", background: "rgba(138,106,26,0.08)",
          color: "#8A6A1A", borderRadius: "5px",
        }}>⛃ Lọc nâng cao <span style={{ fontWeight: 700 }}>2</span></span>
        <span style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "4px 12px", height: "28px", fontSize: "11px", fontWeight: 600,
          border: "1px solid #D9D4CE", background: "#F2EDE8",
          color: "#1A1714", borderRadius: "5px",
        }}>🖨 In / Xuất PDF (24)</span>
      </div>

      {/* Hộp thoại */}
      <div style={{ padding: "16px", background: "#EEEBE5" }}>
        <div style={{ border: "1px solid #D9D4CE", borderRadius: "8px", background: "#F2EDE8", overflow: "hidden" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: "1px solid #D9D4CE",
            fontSize: "13px", fontWeight: 700, color: "#1A1714",
          }}>
            In / Xuất PDF báo cáo <span style={{ color: "#9C9690", fontWeight: 400 }}>✕</span>
          </div>

          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { l: "Tiêu đề",              v: "Báo cáo đơn hàng",                 muted: false },
              { l: "Kỳ báo cáo",           v: "Tất cả đơn (theo bộ lọc hiện tại)", muted: false },
              { l: "Người xuất (tùy chọn)", v: "Tên người báo cáo",                muted: true  },
            ].map((f) => (
              <div key={f.l}>
                <div style={{ fontSize: "9.5px", color: "#9C9690", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>{f.l}</div>
                <div style={{ borderBottom: "1px solid #D9D4CE", padding: "3px 1px", fontSize: "12.5px", color: f.muted ? "#9C9690" : "#1A1714" }}>{f.v}</div>
              </div>
            ))}

            {/* Hàng preset — thứ bản vẽ trước THIẾU HẲN, mà nó là cách nhanh nhất để dùng đúng */}
            <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap", marginTop: "2px" }}>
              <span style={{ fontSize: "9.5px", color: "#9C9690", textTransform: "uppercase", letterSpacing: "0.05em" }}>Cột hiển thị</span>
              {["Báo cáo sếp", "Đầy đủ", "Bỏ chọn hết"].map((b) => (
                <span key={b} style={{
                  fontSize: "10.5px", padding: "2px 8px", border: "1px solid #D9D4CE",
                  borderRadius: "4px", color: "#9C9690",
                }}>{b}</span>
              ))}
              <span style={{ marginLeft: "auto", fontSize: "10.5px", color: "#9C9690" }}>Đã chọn <strong style={{ color: "#1A1714" }}>{checked.size}</strong></span>
            </div>

            {/* Nhóm ĐƠN HÀNG — hai cột ô tích, đúng như hộp thoại thật */}
            <div>
              <div style={{ fontSize: "9.5px", fontWeight: 700, color: "#1A1714", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "5px" }}>{REPORT_GROUPS[0].label}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
                {orderFields.map((f) => {
                  const on = f.locked || checked.has(f.key);
                  return (
                    <span key={f.key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: f.locked ? "#9C9690" : "#1A1714" }}>
                      <span style={{
                        width: "11px", height: "11px", borderRadius: "2px", flexShrink: 0,
                        border: `1px solid ${on ? "#1E40AF" : "#9C9690"}`,
                        background: on ? (f.locked ? "#C8C3BC" : "#1E40AF") : "transparent",
                        color: "#FFF", fontSize: "8px", lineHeight: "11px", textAlign: "center",
                      }}>{on ? "✓" : ""}</span>
                      {f.label}{f.locked && <span style={{ color: "#9C9690", fontSize: "9.5px" }}>(bắt buộc)</span>}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Hai nhóm còn lại — tiêu đề + số cột đếm thật */}
            {rest.map((g) => (
              <div key={g.label} style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontSize: "9.5px", fontWeight: 700, color: "#1A1714", textTransform: "uppercase", letterSpacing: "0.05em" }}>{g.label}</span>
                <span style={{ fontSize: "10.5px", color: "#9C9690" }}>… {g.count} cột</span>
              </div>
            ))}

            <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11.5px", color: "#1A1714" }}>
              <span style={{ fontSize: "9.5px", color: "#9C9690", textTransform: "uppercase", letterSpacing: "0.05em" }}>Khổ giấy</span>
              <span>◉ Dọc</span><span style={{ color: "#9C9690" }}>○ Ngang</span>
            </div>

            <div style={{ fontSize: "10.5px", color: "#9C9690" }}>
              Xuất <strong style={{ color: "#1A1714" }}>24</strong> MO (theo bộ lọc hiện tại). File PDF sẽ <strong style={{ color: "#1A1714" }}>mở trên trình duyệt</strong>.
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "9px 14px", borderTop: "1px solid #D9D4CE", background: "#EEEBE5" }}>
            <span style={{ padding: "4px 12px", borderRadius: "5px", fontSize: "11px", border: "1px solid #D9D4CE", color: "#6B6560" }}>Đóng</span>
            <span style={{ padding: "4px 12px", borderRadius: "5px", fontSize: "11px", fontWeight: 600, background: "#9B2D6F", color: "#FFF" }}>Xem / Tải PDF</span>
          </div>
        </div>
      </div>
    </Frame>
  );
};

/** Ch6 — MO detail side panel */
export const MODetailPanelMockup = () => (
  <Frame url="app.kimhoan.vn/dashboard/orders?orderId=xxx">
    <div style={{ display: "flex", height: "220px" }}>
      {/* Dimmed main */}
      <div style={{ flex: 1, background: "rgba(242,237,232,0.6)", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <TR><PriorityDot color="#8A6A1A" /><span style={{ color: "#9C9690" }}>26.12345_1</span><span style={{ flex: 1, color: "#9C9690" }}>Nhẫn kiềng V18K</span><Badge label="Đang TK" color="#C8C3BC" /></TR>
        <TR><PriorityDot color="#C8C3BC" /><span style={{ color: "#9C9690" }}>26.12346</span><span style={{ flex: 1, color: "#9C9690" }}>Bông tai CZ</span><Badge label="Đang SX" color="#C8C3BC" /></TR>
      </div>
      {/* Panel */}
      <div style={{
        width: "220px", flexShrink: 0,
        background: "#EEEBE5", borderLeft: "1px solid #D9D4CE",
        display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 16px rgba(26,23,20,0.1)",
      }}>
        <div style={{
          padding: "12px 14px 10px", borderBottom: "1px solid #D9D4CE",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontFamily: "Georgia, serif", fontSize: "14px", color: "#1A1714" }}>Chi tiết MO</span>
          <span style={{ fontSize: "16px", color: "#9C9690", lineHeight: 1 }}>×</span>
        </div>
        {[
          ["SO", "26.12345_1"],
          ["MO", "26.12345_1"],
          ["Khách hàng", "Nguyễn Văn A"],
          ["Sản phẩm", "Nhẫn kiềng V18K"],
          ["NVL", "Vàng 18K"],
          ["Trọng lượng", "5.20 g"],
          ["Ngày giao", "20/06/2026"],
        ].map(([k, v]) => (
          <div key={k} style={{
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            padding: "7px 14px", borderBottom: "1px solid rgba(217,212,206,0.5)",
            fontSize: "11.5px",
          }}>
            <span style={{ color: "#9C9690" }}>{k}</span>
            <span style={{ color: "#1A1714", fontWeight: 500, textAlign: "right", maxWidth: "120px" }}>{v}</span>
          </div>
        ))}
        <div style={{ padding: "8px 14px", display: "flex", gap: "6px" }}>
          <Badge label="Đang Thiết Kế" color="#1E40AF" />
        </div>
      </div>
    </div>
  </Frame>
);

/** Ch6 — Status flow */
/**
 * Ch7 nửa 1 — Luồng trạng thái của PHÒNG THIẾT KẾ.
 *
 * 🔴 NHÃN LẤY ĐÚNG `labels.ts → status`, KHÔNG VIẾT TẮT. Bản trước của hình này vẽ
 * "Nháp · Chờ TK · Đang TK · Duyệt TK · Đã Duyệt · Đang SX · Hoàn Tất" — bảy chữ tự đặt, và
 * đối chiếu với tám nhãn thật thì KHÔNG CHỮ NÀO TRÙNG. Người đọc soi hình rồi soi màn hình,
 * không thấy chữ nào giống nhau, và họ tin màn hình chứ không tin hướng dẫn — đúng như vậy.
 *
 * ⚠️ Chỉ vẽ tới "Hoàn tất 3D". Sang xưởng thì tiến độ KHÔNG còn đo bằng trạng thái nữa
 * (MH_STATUSES chỉ có 2 lựa chọn) — phần đó là ProductionStagesMockup bên dưới.
 */
export const DesignStatusFlowMockup = () => (
  <Frame url="app.kimhoan.vn/dashboard/orders">
    <div style={{ padding: "20px 16px", background: "#F2EDE8" }}>
      <div style={{ fontSize: "10px", color: "#9C9690", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "14px" }}>Phòng Thiết Kế — luồng trạng thái</div>
      {/* Flow row */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", marginBottom: "16px" }}>
        {[
          { label: "Chưa thiết kế",          color: "#9C9690", arrow: true },
          { label: "Làm INFO",               color: "#9C9690", arrow: true },
          { label: "Đang thiết kế",          color: "#1E40AF", arrow: true },
          { label: "Chờ khách duyệt",        color: "#1E40AF", arrow: true },
          { label: "Chốt 3D — Chuyển xưởng", color: "#8A6A1A", arrow: true },
          { label: "Hoàn tất 3D",            color: "#2D7A4F", arrow: false },
        ].map((s, i) => (
          <React.Fragment key={i}>
            <Badge label={s.label} color={s.color} />
            {s.arrow && <span style={{ color: "#C8C3BC", fontSize: "12px" }}>→</span>}
          </React.Fragment>
        ))}
      </div>
      <Divider />
      <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
        {[
          { label: "Tạm ngưng", color: "#9B2D2D", desc: "Có thể tiếp tục" },
          { label: "Đã hủy",    color: "#9C9690", desc: "Vĩnh viễn, không thể tiếp tục" },
        ].map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "7px 10px", background: "#EEEBE5", borderRadius: "6px", border: "1px solid #D9D4CE" }}>
            <Badge label={s.label} color={s.color} />
            <span style={{ fontSize: "11px", color: "#9C9690" }}>{s.desc}</span>
          </div>
        ))}
      </div>
    </div>
  </Frame>
);

/**
 * Ch7 nửa 2 — Dải 13 khâu của PHÒNG SẢN XUẤT.
 *
 * 🎯 DANH SÁCH SINH TỪ CODE, KHÔNG CHÉP TAY. `STAGE_ORDER` + `STAGE_LABEL` là nguồn thật, và
 * chúng ĐÃ được dùng để sinh bảng thuật ngữ cho trợ lý (business/ai/glossary.ts). Chép sang đây
 * là tạo nơi thứ BA — thêm một khâu trong code thì hướng dẫn vẫn vẽ 13 khâu cũ, im lặng.
 *
 * 🔴 VÌ SAO HÌNH NÀY PHẢI TỒN TẠI RIÊNG: ở PSX, ô trạng thái chỉ có HAI lựa chọn
 * (order-detail-panel.tsx `MH_STATUSES`) — một MO nằm ở "Đang sản xuất" hàng tuần trong khi đi
 * qua cả chục khâu. Ai nhìn cột Tình trạng để đoán tiến độ sẽ thấy nó đứng yên và tưởng đơn
 * kẹt. Cái chạy là cột Công đoạn, nên nó phải được vẽ ra.
 *
 * `production-stage.ts` KHÔNG phải server-only và order-detail-panel.tsx (client) đã import nó
 * — nên dùng được ở đây, không cần chuyền qua props.
 */
export const ProductionStagesMockup = () => (
  <Frame url="app.kimhoan.vn/dashboard/orders">
    <div style={{ padding: "20px 16px", background: "#F2EDE8" }}>
      <div style={{ fontSize: "10px", color: "#9C9690", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>Phòng Sản Xuất — 13 khâu, theo thứ tự</div>
      <div style={{ fontSize: "11px", color: "#9C9690", marginBottom: "13px" }}>
        Trạng thái đứng yên ở <strong style={{ color: "#8A6A1A" }}>Đang sản xuất</strong> — cái chạy là cột <strong style={{ color: "#1A1714" }}>Công đoạn</strong>.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
        {STAGE_ORDER.map((code, i) => {
          // Khâu thứ 5 được tô đậm làm "khâu hiện tại" — một dải toàn màu xám không cho thấy
          // điều quan trọng nhất: khâu đang chạy là khâu ĐẦU TIÊN chưa xong.
          const done    = i < 4;
          const current = i === 4;
          const color   = current ? "#8A6A1A" : done ? "#2D7A4F" : "#C8C3BC";
          return (
            <React.Fragment key={code}>
              <span style={{
                display: "inline-flex", alignItems: "center", height: "20px", padding: "0 9px",
                borderRadius: "999px", fontSize: "10px", whiteSpace: "nowrap",
                border: `1px solid ${color}`, color,
                fontWeight: current ? 700 : 400,
                background: current ? "rgba(138,106,26,0.08)" : "transparent",
              }}>{STAGE_LABEL[code]}</span>
              {i < STAGE_ORDER.length - 1 && <span style={{ color: "#C8C3BC", fontSize: "11px" }}>→</span>}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ marginTop: "13px", fontSize: "11px", color: "#9C9690", display: "flex", gap: "14px", flexWrap: "wrap" }}>
        <span><span style={{ color: "#2D7A4F" }}>●</span> đã xong</span>
        <span><span style={{ color: "#8A6A1A" }}>●</span> đang làm</span>
        <span><span style={{ color: "#C8C3BC" }}>●</span> chưa tới</span>
      </div>
    </div>
  </Frame>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGER GUIDE MOCKUPS
// ═══════════════════════════════════════════════════════════════════════════════

/** Ch1 (Manager) — Dashboard stat cards */
export const DashboardStatsMockup = () => (
  <Frame url="app.kimhoan.vn/dashboard">
    <div style={{ padding: "16px", background: "#F2EDE8" }}>
      <div style={{ fontSize: "10px", color: "#9C9690", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>Dashboard — Tổng quan sản xuất</div>
      {/* Stat cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "14px" }}>
        {[
          { label: "TỔNG MO",    value: "23", sub: "Đang hoạt động",      accent: false },
          { label: "PHÒNG TK",   value: "13", sub: "PRE_PRODUCTION",      accent: false },
          { label: "PHÒNG SX",   value: "10", sub: "MASTER_HUB",         accent: false },
          { label: "QUÁ HẠN",    value: "3",  sub: "Chưa hoàn tất",      accent: true  },
        ].map((c) => (
          <div key={c.label} style={{
            background: "#EEEBE5",
            border: `1px solid ${c.accent ? "#8A6A1A" : "#D9D4CE"}`,
            padding: "14px 16px", borderRadius: "2px",
          }}>
            <div style={{ fontSize: "9px", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9C9690", marginBottom: "4px" }}>
              {c.label}
            </div>
            <div style={{
              fontFamily: "Georgia, serif", fontSize: "32px", fontWeight: 300, lineHeight: 1,
              color: c.accent ? "#8A6A1A" : "#1A1714",
              fontVariantNumeric: "tabular-nums",
            }}>
              {c.value}
            </div>
            <div style={{ fontSize: "10px", color: "#9C9690", marginTop: "3px" }}>{c.sub}</div>
          </div>
        ))}
      </div>
      {/* Gold widget preview */}
      <div style={{ background: "#EEEBE5", border: "1px solid #D9D4CE", borderRadius: "2px", padding: "10px 14px" }}>
        <div style={{ fontSize: "9px", color: "#9C9690", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>Dự đoán vàng — Phòng Sản Xuất</div>
        {[
          { so: "26.10902", kh: "Trần Thị B", nvl: "V18K", tl: "12.40g", date: "18/06" },
          { so: "26.11034", kh: "Lê Văn C",   nvl: "V750", tl: "8.20g",  date: "20/06" },
        ].map((r) => (
          <div key={r.so} style={{ display: "flex", gap: "10px", padding: "5px 0", borderBottom: "1px solid rgba(217,212,206,0.5)", fontSize: "11px", color: "#6B6560" }}>
            <span style={{ color: "#1A1714", fontWeight: 500, width: "70px" }}>{r.so}</span>
            <span style={{ flex: 1 }}>{r.kh}</span>
            <span style={{ color: "#8A6A1A", fontWeight: 600 }}>{r.tl}</span>
            <span style={{ color: "#9C9690" }}>{r.date}</span>
          </div>
        ))}
      </div>
    </div>
  </Frame>
);

/** Ch2 (Manager) — Order management filters */
export const OrdersFilterMockup = () => (
  <Frame url="app.kimhoan.vn/dashboard/orders">
    <div style={{ padding: "12px 16px 0", background: "#F2EDE8", borderBottom: "1px solid #D9D4CE" }}>
      {/* Filter row */}
      <div style={{ display: "flex", gap: "7px", marginBottom: "10px", flexWrap: "wrap" }}>
        {[
          { label: "Zone: Tất cả", active: false },
          { label: "TT: Đang TK",  active: true  },
          { label: "Ưu tiên",      active: false },
        ].map(f => (
          <div key={f.label} style={{
            padding: "5px 10px", borderRadius: "4px", fontSize: "11px",
            border: `1px solid ${f.active ? "#9B2D6F" : "#D9D4CE"}`,
            background: f.active ? "rgba(155,45,111,0.06)" : "#EEEBE5",
            color: f.active ? "#9B2D6F" : "#6B6560",
            fontWeight: f.active ? 600 : 400,
          }}>
            {f.label}
          </div>
        ))}
        <div style={{ padding: "5px 10px", borderRadius: "4px", fontSize: "11px", border: "1px solid #D9D4CE", background: "#EEEBE5", color: "#6B6560" }}>
          Từ 01/06 — Đến 30/06
        </div>
      </div>
      {/* Tab row */}
      <div style={{ display: "flex" }}>
        <Tab label="Tất Cả (23)" active />
        <Tab label="Phòng TK" />
        <Tab label="Phòng SX" />
        <Tab label="Hoàn Tất" />
      </div>
    </div>
    {[
      { dot: "#8A6A1A", so: "26.10901", sp: "Nhẫn cưới V18K",  badge: "Đang TK",  bcolor: "#1E40AF", store: "CH1" },
      { dot: "#1E40AF", so: "26.10902", sp: "Bông tai kim cương", badge: "Đang TK", bcolor: "#1E40AF", store: "CH2" },
      { dot: "#9B2D2D", so: "26.10905_1", sp: "Lắc tay vàng",  badge: "Duyệt TK", bcolor: "#8A6A1A", store: "CH1" },
    ].map((r, i) => (
      <div key={i} style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 16px", borderBottom: "1px solid #D9D4CE",
        background: "#F2EDE8", fontSize: "12px",
      }}>
        <PriorityDot color={r.dot} />
        <span style={{ color: "#1A1714", fontWeight: 500, width: "90px" }}>{r.so}</span>
        <span style={{ flex: 1, color: "#6B6560" }}>{r.sp}</span>
        <span style={{ width: "40px", fontSize: "10.5px", color: "#9C9690", textAlign: "center", border: "1px solid #D9D4CE", padding: "1px 5px", borderRadius: "4px" }}>{r.store}</span>
        <Badge label={r.badge} color={r.bcolor} />
      </div>
    ))}
  </Frame>
);

/** Ch3 (Manager) — Create version dialog */
export const CreateVersionMockup = () => (
  <Frame url="app.kimhoan.vn/dashboard/orders">
    <div style={{ position: "relative", background: "rgba(242,237,232,0.5)", padding: "20px 16px" }}>
      {/* Dim background */}
      <TR><PriorityDot color="#C8C3BC" /><span style={{ color: "#9C9690" }}>26.12345</span><span style={{ flex: 1, color: "#9C9690" }}>Nhẫn kiềng V18K</span></TR>
      {/* Modal */}
      <div style={{
        background: "#EEEBE5", border: "1px solid #C8C3BC",
        borderRadius: "8px", padding: "0",
        boxShadow: "0 8px 32px rgba(26,23,20,0.18)",
        maxWidth: "340px", margin: "8px auto",
      }}>
        <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #D9D4CE" }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "16px", color: "#1A1714" }}>Tạo phiên bản mới</div>
          <div style={{ fontSize: "11px", color: "#9C9690", marginTop: "3px" }}>MO: 26.12345 — Nhẫn kiềng V18K</div>
        </div>
        <div style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: "11px", color: "#9C9690", marginBottom: "4px" }}>Phiên bản mới sẽ được tạo</div>
          <div style={{
            padding: "8px 12px", background: "#F2EDE8",
            border: "1px solid #D9D4CE", borderRadius: "4px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "10px",
          }}>
            <span style={{ fontSize: "11.5px", color: "#9C9690" }}>26.12345</span>
            <span style={{ fontSize: "12px", color: "#9C9690" }}>→</span>
            <span style={{ fontSize: "13px", color: "#1A1714", fontWeight: 600 }}>26.12345_1</span>
          </div>
          <div style={{ fontSize: "11px", color: "#9C9690", marginBottom: "4px" }}>Lý do thay đổi</div>
          <div style={{
            padding: "7px 10px", border: "1px solid #D9D4CE",
            borderRadius: "4px", background: "#F2EDE8",
            fontSize: "11.5px", color: "#9C9690", marginBottom: "12px",
          }}>
            Khách yêu cầu đổi size 14 → 15…
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <div style={{ padding: "7px 14px", borderRadius: "4px", border: "1px solid #D9D4CE", background: "#F2EDE8", fontSize: "12px", color: "#6B6560" }}>Hủy</div>
            <div style={{ padding: "7px 14px", borderRadius: "4px", background: "#1A1714", fontSize: "12px", color: "#fff" }}>Tạo phiên bản</div>
          </div>
        </div>
      </div>
    </div>
  </Frame>
);

/** Ch4 (Manager) — Priority badges on table */
export const PriorityTableMockup = () => (
  <Frame url="app.kimhoan.vn/dashboard/orders">
    <div style={{ padding: "8px 16px", background: "#F2EDE8", borderBottom: "1px solid #D9D4CE", display: "flex", gap: "16px", alignItems: "center" }}>
      <span style={{ fontSize: "10px", color: "#9C9690", textTransform: "uppercase", letterSpacing: "0.1em" }}>Chú thích ưu tiên:</span>
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}><PriorityDot color="#8A6A1A" /><span style={{ fontSize: "11px", color: "#6B6560" }}>UT1 — Siêu gấp</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}><PriorityDot color="#1E40AF" /><span style={{ fontSize: "11px", color: "#6B6560" }}>UT2 — Gấp</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}><PriorityDot color="#9B2D2D" /><span style={{ fontSize: "11px", color: "#6B6560" }}>SR — Showroom</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}><PriorityDot color="#C8C3BC" /><span style={{ fontSize: "11px", color: "#6B6560" }}>Thường</span></div>
    </div>
    {[
      { dot: "#8A6A1A", code: "UT1", so: "26.12345",   sp: "Nhẫn cưới V18K",   badge: "Đang TK",  bcolor: "#1E40AF" },
      { dot: "#1E40AF", code: "UT2", so: "26.12346",   sp: "Bông tai đính đá", badge: "Duyệt TK", bcolor: "#8A6A1A" },
      { dot: "#9B2D2D", code: "SR",  so: "26.12347",   sp: "Mặt dây 750",      badge: "Đang SX",  bcolor: "#8A6A1A" },
      { dot: "#C8C3BC", code: "—",   so: "26.12348",   sp: "Lắc tay bạc",      badge: "Đang TK",  bcolor: "#1E40AF" },
    ].map((r, i) => (
      <div key={i} style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 16px", borderBottom: "1px solid #D9D4CE",
        background: i % 2 === 0 ? "#F2EDE8" : "rgba(242,237,232,0.6)", fontSize: "12px",
      }}>
        <PriorityDot color={r.dot} />
        <span style={{ fontSize: "10.5px", fontWeight: 700, color: r.dot === "#C8C3BC" ? "#C8C3BC" : r.dot, width: "28px" }}>{r.code}</span>
        <span style={{ color: "#1A1714", fontWeight: 500, width: "80px" }}>{r.so}</span>
        <span style={{ flex: 1, color: "#6B6560" }}>{r.sp}</span>
        <Badge label={r.badge} color={r.bcolor} />
      </div>
    ))}
  </Frame>
);

/** Ch5 (Manager) — Zone before/after promote */
export const PromoteZoneMockup = () => (
  <Frame url="app.kimhoan.vn/dashboard/orders">
    <div style={{ padding: "16px", background: "#F2EDE8" }}>
      <div style={{ fontSize: "10px", color: "#9C9690", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>Promote MO: Phòng Thiết Kế → Phòng Sản Xuất</div>
      <div style={{ display: "flex", alignItems: "stretch", gap: "12px" }}>
        {/* Before */}
        <div style={{ flex: 1, background: "#EEEBE5", border: "1px solid #D9D4CE", borderRadius: "6px", padding: "12px 14px" }}>
          <div style={{ fontSize: "10px", color: "#9C9690", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>Trước promote</div>
          <div style={{ marginBottom: "6px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10px", color: "#9C9690" }}>item.zone:</span><Badge label="PRE_PRODUCTION" color="#1E40AF" />
          </div>
          <div style={{ marginBottom: "6px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10px", color: "#9C9690" }}>order.zone:</span><Badge label="PRE_PRODUCTION" color="#1E40AF" />
          </div>
          <div style={{ fontSize: "11px", color: "#9C9690", marginTop: "10px" }}>Hiển thị ở tab Phòng Thiết Kế</div>
        </div>
        {/* Arrow */}
        <div style={{ display: "flex", alignItems: "center", fontSize: "20px", color: "#9B2D6F", fontWeight: 300 }}>→</div>
        {/* After */}
        <div style={{ flex: 1, background: "#EEEBE5", border: "1px solid #9B2D6F", borderRadius: "6px", padding: "12px 14px" }}>
          <div style={{ fontSize: "10px", color: "#9B2D6F", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>Sau promote</div>
          <div style={{ marginBottom: "6px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10px", color: "#9C9690" }}>item.zone:</span><Badge label="MASTER_HUB" color="#9B2D6F" />
          </div>
          <div style={{ marginBottom: "6px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10px", color: "#9C9690" }}>order.zone:</span><Badge label="MASTER_HUB" color="#9B2D6F" />
          </div>
          <div style={{ fontSize: "11px", color: "#9B2D6F", marginTop: "10px" }}>Chuyển sang tab Phòng Sản Xuất ✓</div>
        </div>
      </div>
    </div>
  </Frame>
);

/** Ch6 (Manager) — Role permissions table */
export const RolesPermissionsMockup = () => {
  const roles = ["ADMIN", "ORDER", "PROD", "SALES"];
  const perms = [
    { label: "Xem đơn hàng",      access: [true,  true,  true,  "★"] },
    { label: "Tạo đơn hàng",      access: [true,  true,  false, false] },
    { label: "Chỉnh sửa đơn",     access: [true,  true,  false, false] },
    { label: "Tạo phiên bản MO",  access: [true,  true,  false, false] },
    { label: "Cập nhật SX",       access: [true,  true,  true,  false] },
    { label: "Quản lý user",       access: [true,  false, false, false] },
  ];
  return (
    <Frame url="app.kimhoan.vn/dashboard/admin/users">
      <div style={{ background: "#F2EDE8", overflowX: "auto" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 70px)", borderBottom: "1px solid #D9D4CE" }}>
          <div style={{ padding: "8px 16px", fontSize: "10px", color: "#9C9690", textTransform: "uppercase", letterSpacing: "0.1em" }}>Chức năng</div>
          {roles.map(r => (
            <div key={r} style={{ padding: "8px 6px", fontSize: "11px", fontWeight: 700, color: "#1A1714", textAlign: "center", borderLeft: "1px solid #D9D4CE" }}>{r}</div>
          ))}
        </div>
        {perms.map((p, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "1fr repeat(4, 70px)",
            borderBottom: "1px solid rgba(217,212,206,0.5)",
            background: i % 2 === 0 ? "#F2EDE8" : "#EEEBE5",
          }}>
            <div style={{ padding: "7px 16px", fontSize: "12px", color: "#6B6560" }}>{p.label}</div>
            {p.access.map((a, j) => (
              <div key={j} style={{ padding: "7px 6px", textAlign: "center", borderLeft: "1px solid rgba(217,212,206,0.5)", fontSize: "13px" }}>
                {a === true ? <span style={{ color: "#2D7A4F" }}>✓</span>
                : a === "★" ? <span style={{ color: "#8A6A1A", fontSize: "10px" }}>✓★</span>
                : <span style={{ color: "#C8C3BC" }}>—</span>}
              </div>
            ))}
          </div>
        ))}
        <div style={{ padding: "7px 16px", fontSize: "10.5px", color: "#9C9690" }}>★ SALES chỉ xem cửa hàng được phân công</div>
      </div>
    </Frame>
  );
};

/** Ch7 (Manager) — Alerts panel */
export const AlertsMockup = () => (
  <Frame url="app.kimhoan.vn/dashboard/alerts">
    <div style={{ background: "#F2EDE8" }}>
      {/* Header */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #D9D4CE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontFamily: "Georgia, serif", fontSize: "15px", color: "#1A1714" }}>Cảnh báo</span>
          <span style={{
            fontSize: "10px", fontWeight: 700, background: "#9B2D2D",
            color: "#fff", padding: "1px 7px", borderRadius: "999px",
          }}>2</span>
        </div>
        <span style={{ fontSize: "11px", color: "#9C9690" }}>2 chưa giải quyết</span>
      </div>
      {/* CRITICAL alert */}
      <div style={{
        margin: "10px 12px", borderRadius: "6px",
        border: "1px solid #9B2D2D", background: "rgba(155,45,45,0.05)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "10px 12px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <div style={{
            flexShrink: 0, padding: "1px 8px", borderRadius: "3px",
            background: "#9B2D2D", fontSize: "9.5px", fontWeight: 700,
            color: "#fff", letterSpacing: "0.06em", marginTop: "1px",
          }}>CRITICAL</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "12.5px", color: "#1A1714", fontWeight: 500, marginBottom: "3px" }}>
              Trọng lượng vàng vượt ngưỡng cho phép
            </div>
            <div style={{ fontSize: "11px", color: "#6B6560", marginBottom: "3px" }}>
              MO: <span style={{ color: "#1A1714", fontWeight: 500 }}>26.10902_1</span> — Nhẫn cưới V18K
            </div>
            <div style={{ fontSize: "10.5px", color: "#9B2D2D" }}>⚠ Đơn hàng đã tự động bị TẠM DỪNG</div>
          </div>
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontSize: "10px", color: "#9C9690", marginBottom: "6px" }}>5 phút trước</div>
            <div style={{ padding: "4px 10px", borderRadius: "4px", background: "#1A1714", fontSize: "11px", color: "#fff" }}>Resolve</div>
          </div>
        </div>
      </div>
      {/* WARNING alert */}
      <div style={{
        margin: "0 12px 10px", borderRadius: "6px",
        border: "1px solid #8A6A1A", background: "rgba(138,106,26,0.04)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "10px 12px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <div style={{ flexShrink: 0, padding: "1px 8px", borderRadius: "3px", background: "#8A6A1A", fontSize: "9.5px", fontWeight: 700, color: "#fff", letterSpacing: "0.06em", marginTop: "1px" }}>WARNING</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "12.5px", color: "#1A1714", fontWeight: 500, marginBottom: "3px" }}>Đơn hàng quá hạn giao 3 ngày</div>
            <div style={{ fontSize: "11px", color: "#6B6560" }}>MO: <span style={{ color: "#1A1714", fontWeight: 500 }}>26.10905</span> — Lắc tay bạc</div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: "10px", color: "#9C9690", marginBottom: "6px" }}>2 giờ trước</div>
            <div style={{ padding: "4px 10px", borderRadius: "4px", border: "1px solid #D9D4CE", fontSize: "11px", color: "#6B6560" }}>Resolve</div>
          </div>
        </div>
      </div>
    </div>
  </Frame>
);

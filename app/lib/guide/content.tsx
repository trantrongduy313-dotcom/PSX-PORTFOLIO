// Guide content — bilingual (vi/en). BA bộ: Sales (9 chương) · Quản lý (8) · NV 3D (7).
//
// ⚠️ ĐỪNG GHI SỐ CHƯƠNG VÀO ĐÂY MỘT CÁCH BUÔNG LỎNG. Dòng này trước đây ghi "2 roles × 7
// chapters each" trong khi thực tế đã là 3 bộ và không bộ nào đúng 7 — một dòng chú thích tự
// nhận là đang đúng suốt hàng trăm commit, đúng lớp lỗi mà `lastReviewed` sinh ra để chống.
import React from "react";
import {
  AppOverviewMockup, LoginMockup, SalesOrdersMockup, SearchFilterMockup,
  ReportExportMockup, MODetailPanelMockup,
  DesignStatusFlowMockup, ProductionStagesMockup,
  DashboardStatsMockup, OrdersFilterMockup, CreateVersionMockup,
  PriorityTableMockup, PromoteZoneMockup, RolesPermissionsMockup, AlertsMockup,
} from "./mockups";

// ── Shared formatting helpers ─────────────────────────────────────────────────

const Note = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    background: "rgba(30,64,175,0.07)",
    borderLeft: "3px solid var(--s-blue)",
    padding: "8px 12px",
    margin: "10px 0",
    borderRadius: "0 4px 4px 0",
    fontSize: "12.5px",
    color: "var(--ink-body)",
    lineHeight: 1.5,
  }}>💡 {children}</div>
);

const Warn = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    background: "rgba(155,45,45,0.06)",
    borderLeft: "3px solid var(--s-red)",
    padding: "8px 12px",
    margin: "10px 0",
    borderRadius: "0 4px 4px 0",
    fontSize: "12.5px",
    color: "var(--ink-body)",
    lineHeight: 1.5,
  }}>⚠️ {children}</div>
);

const Kw = ({ children }: { children: React.ReactNode }) => (
  <strong style={{ color: "var(--pink)" }}>{children}</strong>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code style={{
    background: "var(--cream-dark)",
    border: "1px solid var(--border)",
    borderRadius: "3px",
    padding: "1px 5px",
    fontSize: "11.5px",
    fontFamily: "monospace",
    color: "var(--ink)",
  }}>{children}</code>
);

// ── Type definitions ──────────────────────────────────────────────────────────

export type GuideLang = "vi" | "en";
export type GuideRole = "employee" | "manager" | "design3d";

export type ChapterDef = {
  id: number;
  /**
   * Định danh BỀN của chương — dùng làm nhãn dẫn nguồn khi trợ lý trả lời.
   *
   * 🔴 VÌ SAO KHÔNG DÙNG `id`: `id` là SỐ THỨ TỰ, và nó dời chỗ. Đúng hôm nay một chương mới
   * được chèn vào giữa bộ Sales và mọi chương sau đó tụt một bậc. Nếu nhãn dẫn nguồn là số thì
   * những dòng `ai_question_logs` cũ trỏ sang một chương KHÁC — im lặng, và càng lâu càng lệch.
   *
   * ⚠️ ĐẶT RỒI THÌ KHÔNG ĐỔI, kể cả khi đổi tiêu đề chương. Slug là địa chỉ, không phải nhãn.
   * Trùng slug trong cùng một bộ thì test đỏ (__tests__/guide-freshness.test.ts).
   */
  slug: string;
  /**
   * Chương này được rà lại lần cuối khi nào — dạng "YYYY-MM".
   *
   * ⚠️ TRƯỜNG NÀY TỒN TẠI ĐỂ ĐỔI MỘT LỖI IM LẶNG THÀNH MỘT LỖI LÊN TIẾNG.
   *
   * Hướng dẫn mô tả TRẠNG THÁI HIỆN TẠI, nên mỗi lần hệ thống đổi là một đoạn nào đó trong
   * 1457 dòng × 2 ngôn ngữ trở thành SAI. Đó là vấn đề CẤU TRÚC, không phải nội dung — sửa
   * hết hôm nay thì 100 commit nữa lại lệch.
   *
   * Bằng chứng nó đã xảy ra thật: file này lần cuối sửa 08/06/2026, tức 717 commit trước, và
   * nó vẫn dạy `26.12345_1` (dấu chấm) ở 6 chỗ trong khi giao diện LUÔN hiện `26.12345_1`
   * (order-helpers.ts:81 `NEW_VERSION_SEPARATOR = "_"`). Suốt 717 commit không ai phát hiện,
   * vì một chương không có mốc thì ÂM THẦM TỰ NHẬN LÀ ĐANG ĐÚNG.
   *
   * Có mốc thì người đọc tự biết mà dè dặt, và biết đi đâu để xem cái gì đã đổi ("Có gì mới").
   *
   * MỘT mốc cho CẢ chương, không tách theo ngôn ngữ: một chương được rà TRỌN, và hai mốc lệch
   * nhau là thứ không ai bảo trì nổi.
   */
  lastReviewed: string;
  vi: { title: string; content: React.ReactNode };
  en: { title: string; content: React.ReactNode };
};

// ═══════════════════════════════════════════════════════════════════════════════
// BỘ SALES — 9 chương. Khoá `employee` giữ nguyên (đã nằm trong localStorage của người đọc
// và trong guide-role.ts); chỉ NHÃN hiển thị đổi thành "Nhân Viên Bán Hàng (Sales)".
//
// 🔴 VÌ SAO PHẢI NÓI RÕ ĐÂY LÀ BỘ CỦA SALES: guide-role.ts dùng bộ này làm LƯỚI HỨNG cho mọi
// vai chưa xếp chỗ (`default: return "employee"`). Cái tên "Nhân viên" vì thế hứa rộng hơn thứ
// nó chứa — nội dung viết cho người CHỈ XEM, theo cửa hàng được phân công. Người dùng đã nêu
// đúng chỗ lệch này. Sửa LỜI HỨA (nhãn) rẻ hơn và trung thực hơn là tách cấu trúc khi chưa có
// bộ thứ tư nào thật sự cần.
// ═══════════════════════════════════════════════════════════════════════════════

export const EMPLOYEE_CHAPTERS: ChapterDef[] = [
  // ── Chapter 1 ───────────────────────────────────────────────────────────────
  {
    id: 1,
    slug: "tong-quan",
    lastReviewed: "2026-08",
    vi: {
      title: "Chào mừng & Tổng quan",
      content: (
        <div>
          <p>Chào mừng bạn đến với <Kw>Kim Hoàn V3</Kw> — hệ thống quản lý sản xuất trang sức nội bộ. Hướng dẫn này giúp bạn làm quen với giao diện và quy trình công việc cơ bản.</p>
          <AppOverviewMockup />
          <h4>Hai khái niệm cốt lõi</h4>
          <ul>
            <li><Kw>SO (Sales Order)</Kw>: Đơn bán hàng từ hệ thống Odoo, mã số dạng <Code>26.12345</Code>. Một SO có thể chứa nhiều mã hàng khác nhau.</li>
            <li><Kw>MO (Manufacturing Order)</Kw>: Lệnh sản xuất cho từng mã hàng cụ thể trong SO. Một SO thường có từ 1 đến 5 MO.</li>
          </ul>
          <Note>Mọi con số trong hệ thống đều đếm theo <strong>MO</strong>, không phải SO. Khi thấy &quot;15 đơn đang hoạt động&quot; nghĩa là 15 MO đang được sản xuất.</Note>
          <h4>Điều hướng cơ bản</h4>
          <p>Sidebar trái chứa các mục chính: <Kw>Danh sách đơn hàng</Kw>, <Kw>Thống kê</Kw>, <Kw>Việc thiết kế 3D</Kw>, <Kw>Cảnh báo</Kw>, và nhóm <Kw>Tài liệu</Kw> (Hướng dẫn sử dụng, Góp ý của tôi, Có gì mới).</p>
          <Note>Sidebar <strong>không còn danh sách cửa hàng</strong>. Việc lọc theo cửa hàng đã chuyển vào thanh công cụ ngay trên bảng đơn hàng — mở <strong>Danh sách đơn hàng</strong> rồi chọn cửa hàng ở đó.</Note>
        </div>
      ),
    },
    en: {
      title: "Welcome & Overview",
      content: (
        <div>
          <p>Welcome to <Kw>Kim Hoàn V3</Kw> — the internal jewelry production management system. This guide helps you get familiar with the interface and basic workflows.</p>
          <AppOverviewMockup />
          <h4>Two Core Concepts</h4>
          <ul>
            <li><Kw>SO (Sales Order)</Kw>: Order from the Odoo system, numbered as <Code>26.12345</Code>. One SO may contain multiple product lines.</li>
            <li><Kw>MO (Manufacturing Order)</Kw>: Production order for each specific product in an SO. One SO typically has 1–5 MOs.</li>
          </ul>
          <Note>All counts in this system are based on <strong>MO</strong>, not SO. When you see &quot;15 active orders&quot; that means 15 MOs are in production.</Note>
          <h4>Basic Navigation</h4>
          <p>The left sidebar contains the main sections: <Kw>Orders</Kw>, <Kw>Statistics</Kw>, <Kw>3D Design Tasks</Kw>, <Kw>Alerts</Kw>, and the <Kw>Docs</Kw> group (User Guide, My Feedback, What&apos;s New).</p>
          <Note>The sidebar <strong>no longer lists stores</strong>. Store filtering moved into the toolbar above the orders table — open <strong>Orders</strong> and pick the store there.</Note>
        </div>
      ),
    },
  },

  // ── Chapter 2 ───────────────────────────────────────────────────────────────
  {
    id: 2,
    slug: "dang-nhap",
    lastReviewed: "2026-08",
    vi: {
      title: "Đăng nhập & Tài khoản",
      content: (
        <div>
          <p>Hệ thống sử dụng <Kw>Google OAuth</Kw> — bạn đăng nhập bằng tài khoản Google được cấp bởi công ty.</p>
          <LoginMockup />
          <h4>Vai trò tài khoản</h4>
          <p>Mỗi tài khoản được gán một trong 5 vai trò:</p>
          <ul>
            <li><Code>ADMIN</Code> — Quản trị viên: Toàn quyền truy cập</li>
            <li><Code>ORDER</Code> — Xử lý đơn hàng: Quản lý và chỉnh sửa đơn hàng</li>
            <li><Code>PRODUCTION</Code> — Sản xuất: Xem dữ liệu sản xuất</li>
            <li><Code>SALES</Code> — Kinh doanh: Xem đơn hàng theo cửa hàng được phân công</li>
            <li><Code>DESIGN_3D</Code> — Nhân viên Thiết kế 3D: Chỉ thấy màn <strong>Việc thiết kế 3D</strong></li>
          </ul>
          <Note>Với vai trò <strong>SALES</strong>, bạn chỉ thấy các cửa hàng mà quản lý đã gán cho bạn. Nếu cần xem thêm cửa hàng, liên hệ với quản lý hệ thống.</Note>
          <h4>Phiên đăng nhập</h4>
          <p>Phiên làm việc được lưu trong database. Bạn có thể đăng xuất bất cứ lúc nào từ menu người dùng ở góc dưới sidebar.</p>
        </div>
      ),
    },
    en: {
      title: "Login & Account",
      content: (
        <div>
          <p>The system uses <Kw>Google OAuth</Kw> — log in with the Google account provided by the company.</p>
          <LoginMockup />
          <h4>Account Roles</h4>
          <p>Each account is assigned one of 5 roles:</p>
          <ul>
            <li><Code>ADMIN</Code>: Full access</li>
            <li><Code>ORDER</Code>: Manage and edit orders</li>
            <li><Code>PRODUCTION</Code>: View production data</li>
            <li><Code>SALES</Code>: View orders for assigned store(s) only</li>
            <li><Code>DESIGN_3D</Code>: 3D designer — sees only the <strong>3D Design Tasks</strong> screen</li>
          </ul>
          <Note>With the <strong>SALES</strong> role, you can only see stores assigned to you by management. Contact the system manager if you need access to additional stores.</Note>
          <h4>Login Session</h4>
          <p>Sessions are stored in the database. You can log out at any time via the user menu at the bottom of the sidebar.</p>
        </div>
      ),
    },
  },

  // ── Chapter 3 ───────────────────────────────────────────────────────────────
  {
    id: 3,
    slug: "man-don-hang",
    lastReviewed: "2026-08",
    vi: {
      title: "Màn Đơn hàng & chọn cửa hàng",
      content: (
        <div>
          <p>Sau khi đăng nhập, sidebar của bạn có đúng hai nhóm: <Kw>Danh sách đơn hàng</Kw> và nhóm <Kw>Tài liệu</Kw>. Mọi việc hằng ngày nằm ở mục đầu tiên.</p>
          <p>Ngay dưới tiêu đề trang là <Kw>thanh Cửa hàng</Kw> — nút <Kw>Tất cả</Kw> đứng đầu, rồi tới <Code>CH1</Code>, <Code>CH2</Code>… mỗi cửa hàng một chấm màu.</p>
          <ul>
            <li>Bấm một cửa hàng → chỉ xem đơn của nơi đó</li>
            <li>Bấm <Kw>Tất cả</Kw> → xem lại đơn của <strong>mọi cửa hàng bạn được gán</strong></li>
          </ul>
          <Note>Nút <Kw>Tất cả</Kw> là đường quay lại. Bấm <em>lại</em> chính cửa hàng đang chọn thì <strong>không bỏ lọc</strong> — hãy dùng nút <Kw>Tất cả</Kw>.</Note>
          <SalesOrdersMockup />
          <Note>Thanh Cửa hàng <strong>chỉ vai trò Sales mới có</strong>, và nó chỉ hiện những cửa hàng quản lý đã gán cho bạn. Cần thêm cửa hàng thì liên hệ quản lý hệ thống.</Note>
          <h4>Bốn tab</h4>
          <ul>
            <li><Kw>Phòng Thiết Kế</Kw>: MO đang ở giai đoạn thiết kế</li>
            <li><Kw>Phòng Sản Xuất</Kw>: MO đã chuyển sang sản xuất</li>
            <li><Kw>Hoàn tất</Kw>: MO đã xong</li>
            <li><Kw>Đã hủy</Kw>: MO bị huỷ</li>
          </ul>
          <Note>Số trên badge là số <strong>MO</strong> (lệnh sản xuất), không phải số đơn hàng SO. Một SO có thể có nhiều MO.</Note>
          <h4>Đọc bảng đơn hàng</h4>
          <p>Mỗi hàng trong bảng là một MO, bao gồm: mã SO, mã MO, tên sản phẩm, NVL, trọng lượng, trạng thái và ngày giao dự kiến.</p>
        </div>
      ),
    },
    en: {
      title: "The Orders Screen & Store Picker",
      content: (
        <div>
          <p>After logging in your sidebar holds exactly two groups: <Kw>Orders</Kw> and the <Kw>Docs</Kw> group. Everything you do daily lives in the first one.</p>
          <p>Right below the page title sits the <Kw>Store bar</Kw> — an <Kw>Tất cả</Kw> (All) button first, then <Code>CH1</Code>, <Code>CH2</Code>… each with a colour dot.</p>
          <ul>
            <li>Click a store → see only that store&apos;s orders</li>
            <li>Click <Kw>Tất cả</Kw> → back to <strong>every store assigned to you</strong></li>
          </ul>
          <Note><Kw>Tất cả</Kw> is the way back. Clicking the <em>already selected</em> store does <strong>not</strong> clear the filter — use <Kw>Tất cả</Kw>.</Note>
          <SalesOrdersMockup />
          <Note>The Store bar is <strong>Sales-only</strong>, and it lists just the stores management assigned to you. Contact the system manager if you need another store.</Note>
          <h4>Four Tabs</h4>
          <ul>
            <li><Kw>Design Dept.</Kw>: MOs in the design phase</li>
            <li><Kw>Production</Kw>: MOs moved to manufacturing</li>
            <li><Kw>Completed</Kw>: finished MOs</li>
            <li><Kw>Cancelled</Kw>: cancelled MOs</li>
          </ul>
          <Note>Badge numbers count <strong>MOs</strong> (manufacturing orders), not SOs. One SO can hold several MOs.</Note>
          <h4>Reading the Order Table</h4>
          <p>Each row is one MO, showing: SO code, MO code, product name, material, weight, status, and expected delivery date.</p>
        </div>
      ),
    },
  },

  // ── Chapter 4 ───────────────────────────────────────────────────────────────
  {
    id: 4,
    slug: "tim-kiem-loc",
    lastReviewed: "2026-08",
    vi: {
      title: "Tìm kiếm & Lọc đơn hàng",
      content: (
        <div>
          <p>Thanh tìm kiếm tra cứu theo <strong>mã đơn, khách hàng, Sales, mã MO hoặc tên sản phẩm</strong> — gõ được thứ nào tiện nhất, không cần chọn loại trước.</p>
          <SearchFilterMockup />
          <Note>Ô tìm kiếm <strong>hỗ trợ không dấu</strong>: gõ <Code>nhan kieng</Code> vẫn ra <Code>Nhẫn kiềng</Code>. Không cần bật dấu tiếng Việt khi đang vội.</Note>
          <h4>Ba cách lọc, dùng chồng lên nhau được</h4>
          <ul>
            <li><Kw>Bốn tab</Kw> — Phòng Thiết Kế · Phòng Sản Xuất · Hoàn tất · Đã hủy</li>
            <li><Kw>Ưu tiên</Kw> — nút bật/tắt cạnh ô tìm kiếm, chỉ hiện MO <Code>UT1</Code></li>
            <li><Kw>7 ngày tới</Kw> · <Kw>Tuần này</Kw> · <Kw>Quá hạn</Kw> — lọc theo ngày dự kiến hoàn thành</li>
          </ul>
          <Note>Các bộ lọc <strong>cộng dồn</strong>: chọn tab <Kw>Phòng Sản Xuất</Kw> rồi bấm <Kw>Quá hạn</Kw> thì bảng chỉ còn MO đang sản xuất <em>và</em> đã trễ hạn. Muốn bỏ hết thì bấm <Kw>Xóa lọc</Kw>.</Note>
          <h4>Chấm màu Ưu tiên</h4>
          <ul>
            <li><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#8A6A1A", marginRight: "6px", verticalAlign: "middle" }} /><Kw>UT1 — Siêu gấp</Kw>: Mức cao nhất, cần xử lý ngay</li>
            <li><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#1E40AF", marginRight: "6px", verticalAlign: "middle" }} /><Kw>UT2 — Gấp</Kw>: Ưu tiên nhưng không gấp</li>
            <li><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#9B2D2D", marginRight: "6px", verticalAlign: "middle" }} /><Kw>SR — Showroom</Kw>: Đơn showroom cần chú ý</li>
          </ul>
          <Note>Bộ lọc <strong>Ưu tiên</strong> chỉ hiện MO có mã <Code>UT1</Code>, và xét <strong>theo từng MO</strong>. Nghĩa là <Code>UT2</Code> và <Code>SR</Code> KHÔNG lọt vào tab này, và một MO thường sẽ không bị kéo theo chỉ vì MO khác trong cùng SO được đánh ưu tiên.</Note>
        </div>
      ),
    },
    en: {
      title: "Search & Filter",
      content: (
        <div>
          <p>The search bar looks across <strong>order code, customer, Sales rep, MO code and product name</strong> — type whichever you have; you never pick a field first.</p>
          <SearchFilterMockup />
          <Note>Search is <strong>accent-insensitive</strong>: typing <Code>nhan kieng</Code> still finds <Code>Nhẫn kiềng</Code>. No need to switch on Vietnamese input when you are in a hurry.</Note>
          <h4>Three Filters, and They Stack</h4>
          <ul>
            <li><Kw>Four tabs</Kw> — Design Dept. · Production · Completed · Cancelled</li>
            <li><Kw>Priority</Kw> — a toggle beside the search box, shows <Code>UT1</Code> MOs only</li>
            <li><Kw>Next 7 days</Kw> · <Kw>This week</Kw> · <Kw>Overdue</Kw> — by expected completion date</li>
          </ul>
          <Note>Filters <strong>combine</strong>: pick the <Kw>Production</Kw> tab then click <Kw>Overdue</Kw> and the table keeps only MOs that are in production <em>and</em> past due. <Kw>Clear filters</Kw> resets everything.</Note>
          <h4>Priority Color Dots</h4>
          <ul>
            <li><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#8A6A1A", marginRight: "6px", verticalAlign: "middle" }} /><Kw>UT1 — Urgent</Kw>: Highest urgency, handle immediately</li>
            <li><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#1E40AF", marginRight: "6px", verticalAlign: "middle" }} /><Kw>UT2 — Priority</Kw>: Important but not time-critical</li>
            <li><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#9B2D2D", marginRight: "6px", verticalAlign: "middle" }} /><Kw>SR — Showroom</Kw>: Showroom order needing attention</li>
          </ul>
          <Note>The <strong>Priority</strong> filter shows only <Code>UT1</Code> MOs, evaluated <strong>per MO</strong>. So <Code>UT2</Code> and <Code>SR</Code> do not appear here, and a normal MO is never pulled in just because a sibling MO in the same SO is flagged.</Note>
        </div>
      ),
    },
  },

  // ── Chapter 5 ───────────────────────────────────────────────────────────────
  //
  // 🎯 LỌC VÀ IN LÀ MỘT CHƯƠNG, KHÔNG PHẢI HAI. Trong app, nút "Lọc nâng cao" và nút
  // "In / Xuất PDF (N)" nằm CẠNH NHAU trên cùng một hàng, và `N` chính là số dòng còn lại sau
  // khi lọc (orders-client.tsx). Tách đôi là giấu mất mối nối đó — mà mối nối đó là toàn bộ
  // bài học: bản in luôn bằng đúng cái đang thấy trên màn hình.
  {
    id: 5,
    slug: "in-bao-cao",
    lastReviewed: "2026-08",
    vi: {
      title: "Lọc nâng cao & In báo cáo",
      content: (
        <div>
          <h4>Nguyên tắc: bản in = <em>tab đang mở</em> + <em>bộ lọc đang áp</em></h4>
          <p>Báo cáo không phải một màn riêng. Nó chụp lại <strong>đúng danh sách bạn đang nhìn</strong>:</p>
          <ul>
            <li>Bạn đang ở tab nào thì in đơn của tab đó.</li>
            <li>Có lọc — ví dụ hạn <Kw>Tuần này</Kw> — thì chỉ in những đơn trong tuần.</li>
            <li><strong>Không lọc gì</strong> thì in <strong>toàn bộ</strong> đơn của tab đó.</li>
            <li>Sau đó bạn chọn <strong>những cột muốn in</strong>.</li>
          </ul>
          <p>Nói cách khác: <strong>bạn lọc trên màn hình, hệ thống in đúng thứ đó.</strong> Bản in nhiều hay ít dòng là do bộ lọc, không phải do một thiết lập nào khác.</p>
          <Note>💡 Con số trên nút — <Kw>In / Xuất PDF (24)</Kw> — chính là <strong>số MO sẽ được in</strong>. Nhìn nó <strong>trước khi bấm</strong>: thấy 400 trong khi bạn định in báo cáo tuần thì bộ lọc chưa ăn.</Note>
          <Note>Con số đó tính trên <strong>toàn bộ danh sách đã lọc</strong>, không phải trang đang xem. Bảng chia trang 50 dòng nhưng bản in vẫn đủ <strong>cả 24 MO</strong> — không cần lật từng trang để in.</Note>

          <h4>Hai nút, ở góc phải ngay trên bảng</h4>
          <ul>
            <li><Kw>Lọc nâng cao</Kw> — lọc sâu theo <em>từng cột</em> (kiểu Google Sheet): chọn nhiều giá trị, lọc khoảng số, tìm trong danh sách giá trị. Số bên cạnh là số điều kiện đang bật.</li>
            <li><Kw>In / Xuất PDF (N)</Kw> — mở hộp thoại chọn cột.</li>
          </ul>
          <p><strong>Ô tìm kiếm khác Lọc nâng cao chỗ nào:</strong> ô tìm kiếm quét <em>một chuỗi</em> qua nhiều trường cùng lúc — hợp khi bạn <strong>đã biết mình tìm gì</strong>. <Kw>Lọc nâng cao</Kw> đặt điều kiện trên <em>từng cột cụ thể</em> — hợp khi bạn <strong>dựng một danh sách</strong> để báo cáo.</p>

          <h4>Hộp thoại In / Xuất PDF báo cáo</h4>
          <ReportExportMockup />
          <ul>
            <li><Kw>Tiêu đề</Kw> — mặc định &ldquo;Báo cáo đơn hàng&rdquo;, sửa được.</li>
            <li><Kw>Kỳ báo cáo</Kw> — <strong>tự điền theo bộ lọc</strong>: chọn hạn <Kw>Quá hạn</Kw> thì nó ghi &ldquo;Đơn quá hạn dự kiến hoàn thành&rdquo;; không lọc theo ngày thì ghi &ldquo;Tất cả đơn (theo bộ lọc hiện tại)&rdquo;. Vẫn sửa tay được.</li>
            <li><Kw>Người xuất</Kw> — tuỳ chọn, in vào phần đầu báo cáo.</li>
          </ul>
          <p>Phần <Kw>Cột hiển thị</Kw> có ba nút bấm nhanh, và góc phải luôn hiện <Kw>Đã chọn N</Kw>:</p>
          <ul>
            <li><Kw>Báo cáo sếp</Kw> — bộ cột gọn, đủ để đọc: SO · MO# · Khách hàng · Sản phẩm…</li>
            <li><Kw>Đầy đủ</Kw> — tích hết mọi cột</li>
            <li><Kw>Bỏ chọn hết</Kw> — bỏ tất cả, chỉ chừa cột bắt buộc</li>
          </ul>
          <p>Bên dưới là các ô tích, chia ba nhóm: <Kw>Đơn hàng</Kw> · <Kw>Sản phẩm &amp; Kỹ thuật</Kw> · <Kw>Sản xuất &amp; Kết quả</Kw>.</p>
          <Note>Cột ghi <strong>(bắt buộc)</strong> — như <Kw>SO</Kw> — luôn được in và <strong>không bỏ tích được</strong>, để không bao giờ ra một bản báo cáo không tra ngược được. Cột ghi <strong>(PSX)</strong> chỉ có số liệu khi đơn đã sang xưởng.</Note>
          <p>Chọn <Kw>Khổ giấy</Kw> Dọc hoặc Ngang, rồi bấm <Kw>Xem / Tải PDF</Kw> — file <strong>mở ngay trên trình duyệt</strong>, từ đó bạn tải về hoặc bấm in.</p>

          <h4>Hai điều dễ vấp</h4>
          <Warn>Chọn <strong>quá 8 cột</strong> thì hệ thống <strong>tự chuyển sang khổ Ngang</strong>. Bạn đổi lại Dọc được, nhưng khi đó có dòng nhắc &ldquo;chữ sẽ rất nhỏ&rdquo; — và nó nói thật.</Warn>
          <Warn>Hộp thoại <strong>không</strong> tự cập nhật khi bạn lọc lại phía sau. Hãy <strong>lọc xong rồi mới mở</strong> hộp thoại in.</Warn>
        </div>
      ),
    },
    en: {
      title: "Advanced Filters & Printing Reports",
      content: (
        <div>
          <h4>The Rule: the export = <em>current tab</em> + <em>current filters</em></h4>
          <p>Reporting is not a separate screen. It photographs <strong>exactly the list you are looking at</strong>:</p>
          <ul>
            <li>Whichever tab you are on is the tab that gets printed.</li>
            <li>With a filter — say deadline <Kw>This week</Kw> — only that week&apos;s orders print.</li>
            <li>With <strong>no filter</strong>, <strong>every</strong> order in that tab prints.</li>
            <li>Then you choose <strong>which columns</strong> to print.</li>
          </ul>
          <p>Put simply: <strong>you filter on screen, the system prints that.</strong> A long or short report is the filter&apos;s doing, not some separate setting.</p>
          <Note>💡 The number on the button — <Kw>In / Xuất PDF (24)</Kw> — is <strong>how many MOs will print</strong>. Read it <strong>before you click</strong>: seeing 400 when you meant a weekly report means the filter did not take.</Note>
          <Note>That count covers the <strong>whole filtered list</strong>, not the page you are on. The table pages at 50 rows but the export still contains all <strong>24 MOs</strong> — no need to print page by page.</Note>

          <h4>Two Buttons, Top-Right of the Table</h4>
          <ul>
            <li><Kw>Advanced filter</Kw> — per-<em>column</em> filtering (spreadsheet style): multi-select values, numeric ranges, search within a value list. The number beside it is how many conditions are active.</li>
            <li><Kw>In / Xuất PDF (N)</Kw> — opens the column picker.</li>
          </ul>
          <p><strong>Search box vs. advanced filter:</strong> the search box sweeps <em>one string</em> across several fields — right when you <strong>already know what you want</strong>. <Kw>Advanced filter</Kw> sets conditions on <em>specific columns</em> — right when you are <strong>building a list</strong> to report.</p>

          <h4>The Export Dialog</h4>
          <ReportExportMockup />
          <ul>
            <li><Kw>Title</Kw> — defaults to &ldquo;Báo cáo đơn hàng&rdquo;, editable.</li>
            <li><Kw>Period</Kw> — <strong>filled in from your filter</strong>: pick <Kw>Overdue</Kw> and it writes the matching label; with no date filter it writes &ldquo;Tất cả đơn (theo bộ lọc hiện tại)&rdquo;. Still editable.</li>
            <li><Kw>Exported by</Kw> — optional, printed in the report header.</li>
          </ul>
          <p>The <Kw>Columns</Kw> section has three shortcut buttons, and the right side always shows <Kw>Đã chọn N</Kw> (how many are ticked):</p>
          <ul>
            <li><Kw>Báo cáo sếp</Kw> — a compact, readable set: SO · MO# · customer · product…</li>
            <li><Kw>Đầy đủ</Kw> — tick everything</li>
            <li><Kw>Bỏ chọn hết</Kw> — untick everything except the mandatory columns</li>
          </ul>
          <p>Below sit the checkboxes in three groups: <Kw>Order</Kw> · <Kw>Product &amp; Technical</Kw> · <Kw>Production &amp; Results</Kw>.</p>
          <Note>Columns marked <strong>(bắt buộc)</strong> — such as <Kw>SO</Kw> — always print and <strong>cannot be unticked</strong>, so no report comes out untraceable. Columns marked <strong>(PSX)</strong> only carry data once the order reaches the workshop.</Note>
          <p>Pick <Kw>Khổ giấy</Kw> (portrait or landscape), then click <Kw>Xem / Tải PDF</Kw> — the file <strong>opens in the browser</strong>, where you download or print it.</p>

          <h4>Two Things That Trip People Up</h4>
          <Warn>Ticking <strong>more than 8 columns</strong> switches the page to <strong>landscape automatically</strong>. You can force portrait back, but a warning appears saying the text will be tiny — and it means it.</Warn>
          <Warn>The dialog does <strong>not</strong> refresh when you change filters behind it. <strong>Finish filtering, then open</strong> the dialog.</Warn>
        </div>
      ),
    },
  },

  // ── Chapter 6 ───────────────────────────────────────────────────────────────
  {
    id: 6,
    slug: "chi-tiet-mo",
    lastReviewed: "2026-08",
    vi: {
      title: "Chi tiết MO",
      content: (
        <div>
          <p>Click vào bất kỳ hàng nào trong bảng để mở <Kw>panel chi tiết</Kw> bên phải màn hình.</p>
          <MODetailPanelMockup />
          <h4>Thông tin trong panel</h4>
          <ul>
            <li><strong>Mã SO / MO</strong>: Số đơn hàng và lệnh sản xuất</li>
            <li><strong>Sản phẩm</strong>: Tên, danh mục, NVL (vàng 18K, bạc…), size</li>
            <li><strong>Trọng lượng</strong>: Trọng lượng dự kiến (gram)</li>
            <li><strong>Trạng thái</strong>: Trạng thái hiện tại của MO này</li>
            <li><strong>Ngày giao</strong>: Hạn giao hàng cho khách</li>
          </ul>
          <h4>Phiên bản MO</h4>
          <p>Khi một MO được chỉnh sửa thiết kế, hệ thống tạo <Kw>phiên bản mới</Kw> với hậu tố số:</p>
          <ul>
            <li><Code>26.12345</Code> — bản gốc</li>
            <li><Code>26.12345_1</Code> — phiên bản 1 (sửa lần 1)</li>
            <li><Code>26.12345_2</Code> — phiên bản 2 (sửa lần 2)</li>
          </ul>
          <Note>Các phiên bản cũ vẫn còn trong bảng để theo dõi lịch sử. Phiên bản mới nhất luôn hiển thị phía dưới bản gốc.</Note>
        </div>
      ),
    },
    en: {
      title: "MO Details",
      content: (
        <div>
          <p>Click any row in the table to open the <Kw>detail panel</Kw> on the right side of the screen.</p>
          <MODetailPanelMockup />
          <h4>Panel Information</h4>
          <ul>
            <li><strong>SO / MO Code</strong>: Sales order and manufacturing order numbers</li>
            <li><strong>Product</strong>: Name, category, material (18K gold, silver…), size</li>
            <li><strong>Weight</strong>: Estimated weight in grams</li>
            <li><strong>Status</strong>: Current status of this MO</li>
            <li><strong>Due Date</strong>: Delivery deadline for the customer</li>
          </ul>
          <h4>MO Versions</h4>
          <p>When an MO&apos;s design is revised, the system creates a <Kw>new version</Kw> with a numeric suffix:</p>
          <ul>
            <li><Code>26.12345</Code> — original</li>
            <li><Code>26.12345_1</Code> — version 1 (first revision)</li>
            <li><Code>26.12345_2</Code> — version 2 (second revision)</li>
          </ul>
          <Note>Older versions remain in the table for audit purposes. The newest version always appears directly below the original.</Note>
        </div>
      ),
    },
  },

  // ── Chapter 7 ───────────────────────────────────────────────────────────────
  {
    id: 7,
    slug: "trang-thai-tien-do",
    lastReviewed: "2026-08",
    vi: {
      title: "Trạng thái & Tiến độ",
      content: (
        <div>
          <p>Một MO đi qua <strong>hai phòng</strong>, và mỗi phòng theo dõi tiến độ bằng <strong>một thứ khác nhau</strong>. Đây là điều dễ nhầm nhất trong hệ thống, nên hai phần dưới đây tách riêng.</p>
          <Note>🎯 <strong>Phòng Thiết Kế</strong> theo dõi bằng <strong>Trạng thái</strong>. <strong>Phòng Sản Xuất</strong> theo dõi bằng <strong>Công đoạn</strong>. Nhìn nhầm cột là hiểu nhầm tiến độ.</Note>

          <h4>1. Phòng Thiết Kế — đi bằng Trạng thái</h4>
          <DesignStatusFlowMockup />
          <ol>
            <li><Kw>Chưa thiết kế</Kw> — Mới tạo, chưa ai nhận</li>
            <li><Kw>Làm INFO</Kw> — Đang nhập thông tin sản phẩm</li>
            <li><Kw>Đang thiết kế</Kw> — Nhân viên 3D đang làm</li>
            <li><Kw>Chờ khách duyệt</Kw> — Đã gửi mẫu, chờ khách phản hồi</li>
            <li><Kw>Chốt 3D — Chuyển xưởng</Kw> — Khách đã chốt, sẵn sàng chuyển xưởng</li>
            <li><Kw>Hoàn tất 3D</Kw> — Xong phần thiết kế, đơn vẫn còn ở Phòng Thiết Kế</li>
          </ol>
          <Note>Đây là <strong>tên hiển thị thật</strong> trên bảng. Không phải MO nào cũng đi đủ sáu bước — nhiều MO nhảy thẳng từ <Kw>Chưa thiết kế</Kw> sang <Kw>Chốt 3D — Chuyển xưởng</Kw>.</Note>

          <h4>2. Phòng Sản Xuất — đi bằng Công đoạn</h4>
          <p>Khi MO chuyển sang xưởng, cột <Kw>Tình trạng</Kw> gần như <strong>đứng yên ở &ldquo;Đang sản xuất&rdquo;</strong> — ở đây chỉ có hai trạng thái: <Kw>Đang sản xuất</Kw> và <Kw>Tạm ngưng</Kw>.</p>
          <ProductionStagesMockup />
          <Warn>Đây là chỗ hay hiểu nhầm nhất: thấy cột Tình trạng không đổi suốt hai tuần <strong>không</strong> có nghĩa là đơn bị kẹt. Một MO nằm ở &ldquo;Đang sản xuất&rdquo; trong khi đi qua cả chục khâu. Muốn biết đơn đang ở đâu, <strong>nhìn cột Công đoạn</strong>.</Warn>
          <Note>Khâu đang chạy là <strong>khâu đầu tiên chưa xong</strong>. Số trong ngoặc vuông là thứ tự khâu, không phải mức ưu tiên.</Note>

          <h4>3. Trạng thái đặc biệt</h4>
          <ul>
            <li><Kw>Tạm ngưng</Kw>: Bị treo — thường do vật liệu hoặc vấn đề với khách</li>
            <li><Kw>Tạm ngưng - Chờ duyệt</Kw>: Đang treo và chờ quản lý quyết định</li>
            <li><Kw>Đã hủy</Kw>: Đơn đã huỷ — không chỉnh sửa được nữa</li>
          </ul>
          <p>Riêng ở xưởng, <Kw>Tạm ngưng</Kw> còn ghi kèm <strong>lý do</strong>, và hai lý do hay gặp nhất là:</p>
          <ul>
            <li><Kw>Chờ ĐX NL</Kw> — chờ <strong>đề xuất nguyên liệu</strong>: đã biết cần làm gì nhưng chưa có bản đề xuất vật tư để duyệt mua</li>
            <li><Kw>Chờ NL</Kw> — chờ <strong>nguyên liệu</strong>: đề xuất đã duyệt nhưng vật tư chưa về tới xưởng</li>
          </ul>
          <Warn>Hai lý do trên nghĩa là xưởng <strong>đang bị chặn bởi vật tư</strong>, không phải đang gia công chậm. Thấy MO treo ở đây thì liên hệ quản lý để biết dự kiến tiếp tục.</Warn>
        </div>
      ),
    },
    en: {
      title: "Status & Progress",
      content: (
        <div>
          <p>An MO passes through <strong>two departments</strong>, and each tracks progress with <strong>a different thing</strong>. This is the easiest thing in the system to get wrong, so the two halves below are kept apart.</p>
          <Note>🎯 The <strong>Design Dept.</strong> tracks by <strong>Status</strong>. <strong>Production</strong> tracks by <strong>Stage</strong>. Read the wrong column and you read the wrong progress.</Note>

          <h4>1. Design Dept. — Driven by Status</h4>
          <DesignStatusFlowMockup />
          <ol>
            <li><Kw>Chưa thiết kế</Kw> (Awaiting Design) — newly created, unassigned</li>
            <li><Kw>Làm INFO</Kw> (Pending Info) — product info being entered</li>
            <li><Kw>Đang thiết kế</Kw> (In Design) — a 3D designer is working on it</li>
            <li><Kw>Chờ khách duyệt</Kw> (Design Review) — sample sent, awaiting the customer</li>
            <li><Kw>Chốt 3D — Chuyển xưởng</Kw> (Design Approved) — signed off, ready for the workshop</li>
            <li><Kw>Hoàn tất 3D</Kw> (3D Completed) — design finished; the order is still with the Design Dept.</li>
          </ol>
          <Note>Status chips render in Vietnamese on the table — the English in brackets is for reading this guide only. Not every MO walks all six steps; many jump straight from <Kw>Chưa thiết kế</Kw> to <Kw>Chốt 3D — Chuyển xưởng</Kw>.</Note>

          <h4>2. Production — Driven by Stage</h4>
          <p>Once an MO moves to the workshop, the <Kw>Status</Kw> column all but <strong>freezes on &ldquo;Đang sản xuất&rdquo;</strong> — only two statuses exist here: <Kw>Đang sản xuất</Kw> (In Production) and <Kw>Tạm ngưng</Kw> (Suspended).</p>
          <ProductionStagesMockup />
          <Warn>This is the most common misreading: a Status column that has not moved in two weeks does <strong>not</strong> mean the order is stuck. An MO sits at &ldquo;Đang sản xuất&rdquo; while passing through ten stages. To see where it actually is, <strong>read the Stage column</strong>.</Warn>
          <Note>The active stage is the <strong>first one not yet finished</strong>. The number in square brackets is stage order, not priority.</Note>

          <h4>3. Special Statuses</h4>
          <ul>
            <li><Kw>Tạm ngưng</Kw> (Suspended): on hold — usually material or customer issues</li>
            <li><Kw>Tạm ngưng - Chờ duyệt</Kw> (On Hold): held, awaiting a manager decision</li>
            <li><Kw>Đã hủy</Kw> (Cancelled): cancelled — no longer editable</li>
          </ul>
          <p>In the workshop, <Kw>Tạm ngưng</Kw> also carries a <strong>reason</strong>. The two most common:</p>
          <ul>
            <li><Kw>Chờ ĐX NL</Kw> — awaiting the <strong>material proposal</strong>: the work is understood, but no materials request exists yet to approve for purchase</li>
            <li><Kw>Chờ NL</Kw> — awaiting <strong>materials</strong>: the proposal is approved but the stock has not reached the workshop</li>
          </ul>
          <Warn>Both mean the workshop is <strong>blocked on materials</strong>, not working slowly. Contact management for the expected restart.</Warn>
        </div>
      ),
    },
  },

  // ── Chapter 8 ───────────────────────────────────────────────────────────────
  {
    id: 8,
    slug: "meo-faq",
    lastReviewed: "2026-08",
    vi: {
      title: "Mẹo & Câu hỏi thường gặp",
      content: (
        <div>
          <h4>❓ Tôi không thấy cửa hàng của mình trong sidebar?</h4>
          <p>Liên hệ quản lý để được gán vào cửa hàng. Tài khoản SALES chỉ thấy các cửa hàng được phân công.</p>

          <h4>❓ <Code>26.12345_2</Code> nghĩa là gì?</h4>
          <p>Đây là <strong>phiên bản 2</strong> của MO <Code>26.12345</Code>. Mỗi lần thiết kế được sửa lại, một phiên bản mới được tạo. Bản gốc (<Code>26.12345</Code>) vẫn còn trong lịch sử.</p>

          <h4>❓ Tại sao số tab và số bảng dashboard khác nhau?</h4>
          <p>Hai màn hình có thể được tải ở thời điểm khác nhau. Bấm F5 để làm mới dữ liệu.</p>

          <h4>❓ Tôi có thể chỉnh sửa thông tin đơn hàng không?</h4>
          <p>Không. Vai trò SALES chỉ có quyền <strong>xem</strong>. Liên hệ nhân viên ORDER hoặc ADMIN để chỉnh sửa.</p>

          <h4>❓ Suspended khác Cancelled thế nào?</h4>
          <p><Kw>Suspended</Kw> = tạm dừng, có thể tiếp tục. <Kw>Cancelled</Kw> = đã hủy vĩnh viễn, không thể tiếp tục.</p>

          <Note>Nếu bạn gặp lỗi hoặc dữ liệu bất thường, hãy chụp màn hình và gửi cho quản lý hệ thống kèm theo mã đơn hàng cụ thể.</Note>
        </div>
      ),
    },
    en: {
      title: "Tips & FAQ",
      content: (
        <div>
          <h4>❓ I can&apos;t see my store in the sidebar?</h4>
          <p>Contact your manager to be assigned to the store. SALES accounts can only see stores they&apos;ve been assigned to.</p>

          <h4>❓ What does <Code>26.12345_2</Code> mean?</h4>
          <p>This is <strong>version 2</strong> of MO <Code>26.12345</Code>. Each time a design is revised, a new version is created. The original (<Code>26.12345</Code>) stays in history.</p>

          <h4>❓ Why do the tab counts differ from the dashboard?</h4>
          <p>The two screens may have loaded at different times. Press F5 to refresh the data.</p>

          <h4>❓ Can I edit order information?</h4>
          <p>No. The SALES role has <strong>read-only</strong> access. Contact an ORDER or ADMIN staff member to make changes.</p>

          <h4>❓ What&apos;s the difference between Suspended and Cancelled?</h4>
          <p><Kw>Suspended</Kw> = paused, can be resumed. <Kw>Cancelled</Kw> = permanently cancelled, cannot be continued.</p>

          <Note>If you encounter an error or unusual data, take a screenshot and report it to your system manager along with the specific order code.</Note>
        </div>
      ),
    },
  },
  // ── Chapter 9 ───────────────────────────────────────────────────────────────
  {
    id: 9,
    slug: "gop-y-co-gi-moi",
    lastReviewed: "2026-08",
    vi: {
      title: "Góp ý & Có gì mới",
      content: (
        <div>
          <p>Hai mục này nằm trong nhóm <Kw>Tài liệu</Kw> ở sidebar, cạnh chính trang Hướng dẫn bạn đang đọc.</p>

          <h4>Báo lỗi hoặc đề xuất — nút “Góp ý”</h4>
          <p>Nút <Kw>Góp ý</Kw> dán ở <strong>giữa cạnh phải màn hình</strong>, luôn thấy ở mọi trang. Khi mở panel chi tiết đơn, nút tự trượt sang trái để không bị che — vẫn bấm được.</p>
          <ol>
            <li>Bấm <strong>Góp ý</strong></li>
            <li>Chọn loại: <strong>Báo lỗi</strong> (có chỗ chạy sai) hoặc <strong>Đề xuất cải tiến</strong> (muốn thêm việc)</li>
            <li>Gõ hai ô — ô thứ hai không bắt buộc</li>
            <li><strong>Bấm Ctrl+V để dán ảnh</strong> vừa chụp, tối đa 4 ảnh</li>
            <li>Bấm <strong>Gửi</strong></li>
          </ol>
          <Note>Bạn <strong>không cần gõ lại</strong> số đơn, số MO hay tên màn hình — hệ thống tự kèm cả những thứ đó, kèm cả bản build đang chạy. Đó là lý do gửi qua đây nhanh hơn nhắn tin.</Note>
          <Note>Ảnh nào tải lên lỗi sẽ có dấu <strong>LỖI</strong> và <strong>không chặn việc gửi</strong> — phản hồi vẫn đi, chỉ là không kèm ảnh đó.</Note>
          <p>Với <strong>Báo lỗi</strong>, admin nhận thông báo ngay. Với <strong>Đề xuất cải tiến</strong> thì không — nó được xếp vào danh sách để admin xem, vì đề xuất không bao giờ gấp.</p>

          <h4>Theo dõi phản hồi của mình</h4>
          <p>Mở <Kw>Góp ý của tôi</Kw> để xem lại mọi thứ bạn đã gửi, trạng thái xử lý và câu trả lời của admin.</p>

          <h4>Xem hệ thống vừa đổi gì — “Có gì mới”</h4>
          <p>Mục <Kw>Có gì mới</Kw> có huy hiệu đỏ khi có cập nhật bạn chưa đọc. Mở ra, các mục mới có vạch hồng và nhãn <strong>MỚI</strong>; huy hiệu tắt ngay sau đó.</p>
          <Warn>Hướng dẫn này mô tả hệ thống ở thời điểm được rà soát (xem mốc ở đầu mỗi chương). Hệ thống cập nhật liên tục, nên khi thấy giao diện khác với hướng dẫn, <strong>Có gì mới</strong> là chỗ tra trước tiên — và nếu vẫn không khớp thì bấm <strong>Góp ý</strong> báo cho admin.</Warn>

          <h4>Bạn là Nhân viên Thiết kế 3D?</h4>
          <p>Vai trò <Code>DESIGN_3D</Code> chỉ thấy màn <Kw>Việc thiết kế 3D</Kw> — nơi nhận việc, cập nhật tiến độ và xin tăng ca. Phần hướng dẫn riêng cho màn đó <strong>chưa được viết</strong>; hãy dùng nút <strong>Góp ý</strong> để hỏi khi cần.</p>
        </div>
      ),
    },
    en: {
      title: "Feedback & What's New",
      content: (
        <div>
          <p>Both live in the <Kw>Docs</Kw> group in the sidebar, next to this guide.</p>

          <h4>Report a bug or suggest something — the “Góp ý” button</h4>
          <p>The <Kw>Góp ý</Kw> (Feedback) button sits at the <strong>middle of the right edge</strong> on every page. When the order detail panel opens, the button slides left so it is never covered — it stays clickable.</p>
          <ol>
            <li>Click <strong>Góp ý</strong></li>
            <li>Pick a kind: <strong>Báo lỗi</strong> (something is wrong) or <strong>Đề xuất cải tiến</strong> (a request)</li>
            <li>Fill the two boxes — the second is optional</li>
            <li><strong>Press Ctrl+V to paste a screenshot</strong>, up to 4 images</li>
            <li>Click <strong>Gửi</strong> (Send)</li>
          </ol>
          <Note>You do <strong>not</strong> need to retype the SO, MO or screen name — the system attaches those automatically, along with the running build. That is why this beats a chat message.</Note>
          <Note>Images that fail to upload are marked <strong>LỖI</strong> and do <strong>not</strong> block sending — the report still goes through, just without that image.</Note>
          <p><strong>Bug reports</strong> notify the admin immediately. <strong>Suggestions</strong> do not — they are queued for review, because a suggestion is never urgent.</p>

          <h4>Track your own reports</h4>
          <p>Open <Kw>Góp ý của tôi</Kw> (My Feedback) to see everything you sent, its status, and the admin&apos;s reply.</p>

          <h4>See what changed — “Có gì mới”</h4>
          <p><Kw>Có gì mới</Kw> (What&apos;s New) shows a red badge when there are updates you have not read. Newly published entries carry a pink rule and a <strong>MỚI</strong> tag; the badge clears right after.</p>
          <Warn>This guide describes the system as of its review date, shown at the top of each chapter. The system changes often, so when the screen disagrees with the guide, check <strong>Có gì mới</strong> first — and if it still does not match, use <strong>Góp ý</strong> to tell the admin.</Warn>

          <h4>Are you a 3D designer?</h4>
          <p>The <Code>DESIGN_3D</Code> role only sees the <Kw>Việc thiết kế 3D</Kw> (3D Design Tasks) screen — where work is received, progress updated, and overtime requested. A dedicated guide for that screen is <strong>not written yet</strong>; use <strong>Góp ý</strong> to ask when you need help.</p>
        </div>
      ),
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGER GUIDE — 7 chapters (ADMIN / ORDER role)
// ═══════════════════════════════════════════════════════════════════════════════

export const MANAGER_CHAPTERS: ChapterDef[] = [
  // ── Chapter 1 ───────────────────────────────────────────────────────────────
  {
    id: 1,
    slug: "dashboard-thong-ke",
    lastReviewed: "2026-08",
    vi: {
      title: "Dashboard & Thống kê",
      content: (
        <div>
          <p>Dashboard là màn hình tổng quan dành cho quản lý và bộ phận sản xuất. Tại đây bạn thấy toàn bộ tình trạng sản xuất theo thời gian thực.</p>
          <DashboardStatsMockup />
          <h4>Bốn Stat Cards</h4>
          <ul>
            <li><Kw>Tổng MO</Kw>: Tổng số lệnh sản xuất đang hoạt động</li>
            <li><Kw>Phòng Thiết Kế</Kw>: MO đang ở giai đoạn thiết kế (PRE_PRODUCTION)</li>
            <li><Kw>Phòng Sản Xuất</Kw>: MO đang sản xuất (MASTER_HUB)</li>
            <li><Kw>Quá hạn</Kw>: MO đã qua ngày giao dự kiến chưa hoàn tất</li>
          </ul>
          <h4>Widget Dự đoán Vàng</h4>
          <p>Hiển thị lượng vàng dự kiến cần chuẩn bị cho các MO đang ở Phòng Sản Xuất chưa qua công đoạn Đúc. Dữ liệu được de-duplicate theo MO gốc — phiên bản mới nhất của mỗi MO được dùng để tính.</p>
          <Note>Số MO trong dashboard đếm tất cả cửa hàng. Để xem theo từng cửa hàng, vào trang cụ thể của cửa hàng đó.</Note>
        </div>
      ),
    },
    en: {
      title: "Dashboard & Statistics",
      content: (
        <div>
          <p>The dashboard is an overview screen for managers and the production team, showing real-time production status across all stores.</p>
          <DashboardStatsMockup />
          <h4>Four Stat Cards</h4>
          <ul>
            <li><Kw>Total MOs</Kw>: All active manufacturing orders</li>
            <li><Kw>Design Dept.</Kw>: MOs in the design phase (PRE_PRODUCTION)</li>
            <li><Kw>Production</Kw>: MOs currently being manufactured (MASTER_HUB)</li>
            <li><Kw>Overdue</Kw>: MOs past their expected delivery date</li>
          </ul>
          <h4>Gold Estimation Widget</h4>
          <p>Shows the estimated gold volume needed for MOs currently in production that haven&apos;t yet passed the casting stage. Data is de-duplicated by MO base — only the latest version of each MO is counted.</p>
          <Note>Dashboard MO counts span all stores. To view per-store, navigate to the individual store page.</Note>
        </div>
      ),
    },
  },

  // ── Chapter 2 ───────────────────────────────────────────────────────────────
  {
    id: 2,
    slug: "quan-ly-don-hang",
    lastReviewed: "2026-08",
    vi: {
      title: "Quản lý Đơn hàng",
      content: (
        <div>
          <p>Trang <Kw>Quản lý Đơn hàng</Kw> (menu <strong>Danh sách đơn hàng</strong>) cho phép xem toàn bộ MO từ mọi cửa hàng cùng một lúc.</p>
          <OrdersFilterMockup />
          <h4>Bộ lọc nâng cao</h4>
          <ul>
            <li><Kw>Lọc theo Zone</Kw>: PRE_PRODUCTION hoặc MASTER_HUB</li>
            <li><Kw>Lọc theo trạng thái</Kw>: Cụ thể hoặc toàn bộ đang hoạt động</li>
            <li><Kw>Lọc Ưu tiên</Kw>: Hiển thị chỉ MO <Code>UT1</Code></li>
            <li><Kw>Lọc ngày</Kw>: Lọc theo khoảng ngày tạo đơn</li>
          </ul>
          <h4>Sắp xếp</h4>
          <p>Mặc định sắp xếp theo ngày tạo. Các MO cùng SO (và phiên bản của chúng) được nhóm lại với nhau — ví dụ <Code>26.12345</Code>, <Code>26.12345_1</Code>, <Code>26.12345_2</Code> luôn nằm liền kề.</p>
          <Note>Có nút <strong>In / Xuất PDF</strong> ở thanh công cụ phía trên bảng — số trong ngoặc là số MO sẽ được in theo bộ lọc đang áp dụng. Không cần dùng Ctrl+P của trình duyệt.</Note>
        </div>
      ),
    },
    en: {
      title: "Order Management",
      content: (
        <div>
          <p>The <Kw>Order Management</Kw> page (menu <strong>Danh sách đơn hàng</strong> / Orders) lets you view all MOs from every store at once.</p>
          <OrdersFilterMockup />
          <h4>Advanced Filters</h4>
          <ul>
            <li><Kw>Zone Filter</Kw>: PRE_PRODUCTION or MASTER_HUB</li>
            <li><Kw>Status Filter</Kw>: Specific status or all active</li>
            <li><Kw>Priority filter</Kw>: show <Code>UT1</Code> MOs only</li>
            <li><Kw>Date Filter</Kw>: Filter by order creation date range</li>
          </ul>
          <h4>Sorting</h4>
          <p>Default sort is by creation date. MOs from the same SO (and their versions) are grouped together — e.g. <Code>26.12345</Code>, <Code>26.12345_1</Code>, <Code>26.12345_2</Code> always appear adjacent.</p>
          <Note>There is an <strong>In / Xuất PDF</strong> (Print / Export PDF) button in the toolbar above the table — the number in brackets is how many MOs will be printed under the current filters. No need for the browser&apos;s Ctrl+P.</Note>
        </div>
      ),
    },
  },

  // ── Chapter 3 ───────────────────────────────────────────────────────────────
  {
    id: 3,
    slug: "tao-phien-ban-mo",
    lastReviewed: "2026-08",
    vi: {
      title: "Tạo Phiên bản MO",
      content: (
        <div>
          <p>Khi một MO cần thay đổi thiết kế (kích thước mới, đá mới, yêu cầu khách hàng thay đổi…), thay vì chỉnh sửa trực tiếp hãy tạo <Kw>phiên bản mới</Kw>.</p>
          <CreateVersionMockup />
          <h4>Quy trình tạo phiên bản</h4>
          <ol>
            <li>Mở panel chi tiết của MO cần sửa</li>
            <li>Bật công tắc <strong>“Tạo phiên bản mới khi lưu”</strong> ở cuối panel</li>
            <li>Sửa các trường cần đổi như bình thường</li>
            <li>Bấm <strong>Lưu</strong> — hệ thống tự sinh số MO mới, bản gốc giữ nguyên</li>
          </ol>
          <Note>Đây là một <strong>công tắc</strong>, không phải một nút riêng. Khi tắt, mọi thay đổi ghi thẳng vào MO hiện tại; khi bật, phần sửa của bạn đi vào một phiên bản mới.</Note>
          <Warn><strong>Không thể</strong> vừa bật “Tạo phiên bản” vừa <strong>Chuyển xưởng</strong> trong cùng một lần lưu — hai việc đó mâu thuẫn ý định, và hệ thống sẽ chặn.</Warn>
          <h4>Đánh số tự động</h4>
          <ul>
            <li>MO <Code>26.12345</Code> → phiên bản 1: <Code>26.12345_1</Code></li>
            <li>Mỗi MO có counter riêng — nếu SO có 2 MO (<Code>26.99001</Code> và <Code>26.99002</Code>), phiên bản đầu tiên của từng MO đều là <Code>.1</Code></li>
          </ul>
          <Warn>Không nên tạo phiên bản cho MO đã ở trạng thái <strong>Hoàn tất</strong> hoặc <strong>Đã hủy</strong>.</Warn>
          <Note>Phiên bản cũ vẫn giữ nguyên trong bảng để audit trail. Chúng sẽ tự nhóm với bản gốc khi sắp xếp.</Note>
        </div>
      ),
    },
    en: {
      title: "Creating MO Versions",
      content: (
        <div>
          <p>When an MO requires design changes (new size, new stones, customer request…), instead of editing directly, create a <Kw>new version</Kw>.</p>
          <CreateVersionMockup />
          <h4>Version Creation Process</h4>
          <ol>
            <li>Open the detail panel of the MO you want to revise</li>
            <li>Turn on the <strong>“Create snapshot on save”</strong> toggle at the bottom of the panel</li>
            <li>Edit the fields as usual</li>
            <li>Press <strong>Save</strong> — the system generates the new MO number and preserves the original</li>
          </ol>
          <Note>This is a <strong>toggle</strong>, not a separate button. Off: edits go straight into the current MO. On: your edits land in a new version.</Note>
          <Warn>You <strong>cannot</strong> combine “Create snapshot” with <strong>Promote to workshop</strong> in the same save — the two intents conflict and the system blocks it.</Warn>
          <h4>Auto-Numbering</h4>
          <ul>
            <li>MO <Code>26.12345</Code> → first version: <Code>26.12345_1</Code></li>
            <li>Each MO has its own counter — if an SO has 2 MOs (<Code>26.99001</Code> and <Code>26.99002</Code>), each MO&apos;s first version is independently <Code>.1</Code></li>
          </ul>
          <Warn>Do not create versions for MOs already in <strong>Completed</strong> or <strong>Cancelled</strong> status.</Warn>
          <Note>Old versions remain in the table for audit purposes and automatically group with the original when sorted.</Note>
        </div>
      ),
    },
  },

  // ── Chapter 4 ───────────────────────────────────────────────────────────────
  {
    id: 4,
    slug: "uu-tien-rush",
    lastReviewed: "2026-08",
    vi: {
      title: "Ưu tiên & phân loại",
      content: (
        <div>
          <p>Hệ thống có hai cấp độ ưu tiên để phân loại MO cần xử lý nhanh.</p>
          <PriorityTableMockup />
          <h4>Ý nghĩa từng chấm màu</h4>
          <ul>
            <li><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#8A6A1A", marginRight: "6px", verticalAlign: "middle" }} /><Kw>UT1 — Siêu gấp</Kw>: Mức cao nhất. <strong>Chỉ mã này</strong> được tab “Ưu tiên” lọc ra.</li>
            <li><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#1E40AF", marginRight: "6px", verticalAlign: "middle" }} /><Kw>UT2 — Gấp</Kw>: Quan trọng nhưng không cấp bách. KHÔNG vào tab “Ưu tiên”.</li>
            <li><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#9B2D2D", marginRight: "6px", verticalAlign: "middle" }} /><Kw>SR — Showroom</Kw>: Đơn hàng dành cho showroom.</li>
          </ul>
          <h4>Cách đặt ưu tiên</h4>
          <p>Mở panel chi tiết MO → chọn tab sản phẩm → click nút ưu tiên bên cạnh sản phẩm cần đánh dấu.</p>
          <Note>Ưu tiên lưu ở <Code>priorityCode</Code> của <strong>từng MO</strong>, không phải một cờ ở cấp đơn hàng. Một SO có thể có vài MO <Code>UT1</Code> và vài MO <Code>Normal</Code>, và bộ lọc xét đúng từng MO.</Note>
          <Note>Trước đây việc phân loại nằm rải rác nhiều chỗ (cờ cấp SO, cờ <Code>isRush</Code>, so chuỗi tại chỗ) và gây lọc sai — MO thường trong cùng SO vẫn lọt vào tab Ưu tiên. Nay chỉ còn một nguồn duy nhất.</Note>
        </div>
      ),
    },
    en: {
      title: "Priority & Classification",
      content: (
        <div>
          <p>The system has priority levels for classifying MOs that need expedited handling.</p>
          <PriorityTableMockup />
          <h4>Color Dot Meanings</h4>
          <ul>
            <li><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#8A6A1A", marginRight: "6px", verticalAlign: "middle" }} /><Kw>UT1 — Urgent</Kw>: Highest urgency. <strong>Only this code</strong> is matched by the “Priority” tab.</li>
            <li><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#1E40AF", marginRight: "6px", verticalAlign: "middle" }} /><Kw>UT2 — Priority</Kw>: Important but not time-critical. Does NOT appear in the “Priority” tab.</li>
            <li><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#9B2D2D", marginRight: "6px", verticalAlign: "middle" }} /><Kw>SR — Showroom</Kw>: Showroom order.</li>
          </ul>
          <h4>How to Set Priority</h4>
          <p>Open the MO detail panel → select the product tab → click the priority button next to the product to flag.</p>
          <Note>Priority lives in each MO&apos;s <Code>priorityCode</Code>, not in an order-level flag. One SO can hold both <Code>UT1</Code> and <Code>Normal</Code> MOs, and filters evaluate each MO on its own.</Note>
        </div>
      ),
    },
  },

  // ── Chapter 5 ───────────────────────────────────────────────────────────────
  {
    id: 5,
    slug: "promote-sang-san-xuat",
    lastReviewed: "2026-08",
    vi: {
      title: "Promote MO sang Sản xuất",
      content: (
        <div>
          <p>Sau khi thiết kế được duyệt, MO được <Kw>chuyển (promote)</Kw> từ Phòng Thiết Kế sang Phòng Sản Xuất.</p>
          <PromoteZoneMockup />
          <h4>Cách hoạt động</h4>
          <p>Hệ thống theo dõi zone ở cấp độ <strong>sản phẩm (item)</strong>, không phải cấp đơn hàng:</p>
          <ul>
            <li>Trước promote: <Code>item.zone = PRE_PRODUCTION</Code></li>
            <li>Sau promote: <Code>item.zone = MASTER_HUB</Code></li>
            <li><Code>order.zone</Code> phản ánh zone của đa số items</li>
          </ul>
          <h4>Tại sao cần phân biệt item.zone?</h4>
          <p>Một SO có thể có 3 MO, trong đó 2 MO đã chuyển sang sản xuất và 1 MO vẫn đang thiết kế. Hệ thống theo dõi từng MO độc lập để tab badges hiển thị chính xác.</p>
          <Note>Sau khi promote, MO sẽ di chuyển từ tab <strong>Phòng Thiết Kế</strong> sang tab <strong>Phòng Sản Xuất</strong> — badge số tự cập nhật.</Note>
          <Warn>Chỉ promote khi thiết kế đã được <strong>phê duyệt</strong>. Promote sai giai đoạn sẽ ảnh hưởng đến dự đoán vàng.</Warn>
        </div>
      ),
    },
    en: {
      title: "Promoting MOs to Production",
      content: (
        <div>
          <p>After a design is approved, the MO is <Kw>promoted</Kw> from the Design Department to the Production Workshop.</p>
          <PromoteZoneMockup />
          <h4>How It Works</h4>
          <p>The system tracks zones at the <strong>item (product) level</strong>, not the order level:</p>
          <ul>
            <li>Before promote: <Code>item.zone = PRE_PRODUCTION</Code></li>
            <li>After promote: <Code>item.zone = MASTER_HUB</Code></li>
            <li><Code>order.zone</Code> reflects the zone of the majority of items</li>
          </ul>
          <h4>Why Track at Item Level?</h4>
          <p>One SO might have 3 MOs, where 2 have moved to production and 1 is still in design. The system tracks each MO independently so tab badges display accurately.</p>
          <Note>After promoting, the MO moves from the <strong>Design Dept.</strong> tab to the <strong>Production</strong> tab — badge counts update automatically.</Note>
          <Warn>Only promote when the design is <strong>approved</strong>. Premature promotion affects gold estimation accuracy.</Warn>
        </div>
      ),
    },
  },

  // ── Chapter 6 ───────────────────────────────────────────────────────────────
  {
    id: 6,
    slug: "phan-quyen-cua-hang",
    lastReviewed: "2026-08",
    vi: {
      title: "Phân quyền & Quản lý Cửa hàng",
      content: (
        <div>
          <p>Hệ thống có 5 vai trò, mỗi vai trò có phạm vi truy cập khác nhau: <Code>ADMIN</Code>, <Code>ORDER</Code>, <Code>PRODUCTION</Code>, <Code>SALES</Code> và <Code>DESIGN_3D</Code>.</p>
          <RolesPermissionsMockup />
          <h4>Gán nhân viên vào cửa hàng</h4>
          <p>SALES không thể tự xem tất cả cửa hàng — cần được gán vào từng cửa hàng cụ thể:</p>
          <ol>
            <li>Vào trang quản trị người dùng</li>
            <li>Chọn nhân viên cần cấu hình</li>
            <li>Thêm cửa hàng vào danh sách phân công</li>
          </ol>
          <Note>Một nhân viên SALES có thể được gán vào nhiều cửa hàng cùng lúc. Hệ thống sẽ tự chuyển hướng đến cửa hàng đầu tiên khi đăng nhập.</Note>
        </div>
      ),
    },
    en: {
      title: "Roles & Store Management",
      content: (
        <div>
          <p>The system has 5 roles, each with a different access scope: <Code>ADMIN</Code>, <Code>ORDER</Code>, <Code>PRODUCTION</Code>, <Code>SALES</Code> and <Code>DESIGN_3D</Code>.</p>
          <RolesPermissionsMockup />
          <h4>Assigning Staff to Stores</h4>
          <p>SALES users cannot access all stores by default — they must be assigned to specific stores:</p>
          <ol>
            <li>Go to user management</li>
            <li>Select the staff member to configure</li>
            <li>Add stores to their assignment list</li>
          </ol>
          <Note>A SALES staff member can be assigned to multiple stores simultaneously. The system will redirect to their first assigned store upon login.</Note>
        </div>
      ),
    },
  },

  // ── Chapter 7 ───────────────────────────────────────────────────────────────
  {
    id: 7,
    slug: "canh-bao-giam-sat",
    lastReviewed: "2026-08",
    vi: {
      title: "Alerts & Giám sát",
      content: (
        <div>
          <p>Hệ thống cảnh báo tự động phát hiện các tình huống bất thường và thông báo cho quản lý.</p>
          <AlertsMockup />
          <h4>Mức độ cảnh báo</h4>
          <ul>
            <li><Kw>CRITICAL</Kw>: Nghiêm trọng — <strong>tự động tạm dừng đơn hàng</strong> ngay khi xuất hiện</li>
            <li><Kw>WARNING</Kw>: Cảnh báo — cần chú ý nhưng không tự động can thiệp</li>
            <li><Kw>INFO</Kw>: Thông tin — theo dõi thôi, không cần hành động ngay</li>
          </ul>
          <h4>Xử lý CRITICAL alert</h4>
          <ol>
            <li>Thấy huy hiệu đỏ ở mục <strong>Cảnh báo</strong> trên <strong>sidebar</strong> (không phải header)</li>
            <li>Mở trang Cảnh báo, hoặc panel chi tiết của MO bị ảnh hưởng</li>
            <li>Đọc nội dung cảnh báo</li>
            <li>Xử lý vấn đề thực tế</li>
            <li>Bấm <strong>Giải quyết</strong></li>
            <li>Nếu muốn đơn chạy lại, phải <strong>tự tích chọn “cho đơn chạy tiếp”</strong> khi giải quyết</li>
          </ol>
          <Warn>Giải quyết cảnh báo <strong>KHÔNG tự động</strong> bỏ trạng thái Tạm ngưng. Đó là một quyết định riêng và phải chọn có chủ ý — nên nếu sau khi giải quyết mà đơn vẫn treo, hãy kiểm lại ô tích đó.</Warn>
          <h4>Lịch sử Workflow</h4>
          <p>Mọi hành động trên đơn hàng đều được ghi lại trong <Kw>Workflow History</Kw> — bao gồm: ai thay đổi, thay đổi gì, lúc nào.</p>
          <Warn>Không nên resolve CRITICAL alert trước khi đã xử lý vấn đề thực tế. Resolve sai có thể khiến đơn hàng tiếp tục sản xuất khi chưa an toàn.</Warn>
        </div>
      ),
    },
    en: {
      title: "Alerts & Monitoring",
      content: (
        <div>
          <p>The automated alert system detects anomalies and notifies management.</p>
          <AlertsMockup />
          <h4>Alert Severity Levels</h4>
          <ul>
            <li><Kw>CRITICAL</Kw>: Severe — <strong>automatically suspends the order</strong> upon triggering</li>
            <li><Kw>WARNING</Kw>: Advisory — requires attention but no automatic action</li>
            <li><Kw>INFO</Kw>: Informational — monitor only, no immediate action needed</li>
          </ul>
          <h4>Handling a CRITICAL Alert</h4>
          <ol>
            <li>Spot the red badge on the <strong>Alerts</strong> item in the <strong>sidebar</strong> (not the header)</li>
            <li>Open the Alerts page, or the affected MO&apos;s detail panel</li>
            <li>Read the alert</li>
            <li>Address the real-world issue</li>
            <li>Click <strong>Resolve</strong></li>
            <li>To let the order run again you must <strong>tick the “resume order” option</strong> while resolving</li>
          </ol>
          <Warn>Resolving an alert does <strong>NOT</strong> automatically clear the Suspended state — that is a separate, deliberate choice. If the order is still on hold after resolving, check that tick box.</Warn>
          <h4>Workflow History</h4>
          <p>Every action on an order is recorded in the <Kw>Workflow History</Kw> — including: who changed it, what was changed, and when.</p>
          <Warn>Do not resolve a CRITICAL alert before the underlying issue is actually fixed. Premature resolution may allow production to continue in an unsafe state.</Warn>
        </div>
      ),
    },
  },
  // ── Chapter 8 ───────────────────────────────────────────────────────────────
  {
    id: 8,
    slug: "phan-hoi-cai-tien",
    lastReviewed: "2026-08",
    vi: {
      title: "Phản hồi & Ghi nhận cải tiến",
      content: (
        <div>
          <p>Hai công cụ để nói chuyện với nhân viên <strong>ngay trong hệ thống</strong>, thay cho nhắn tin qua nền tảng khác.</p>

          <h4>Hộp thư phản hồi</h4>
          <p>Sidebar → <Kw>ADMIN → Phản hồi người dùng</Kw>. Huy hiệu đỏ là số phản hồi chưa xử lý.</p>
          <p>Mỗi phản hồi tự kèm bối cảnh: màn hình, đơn/MO đang xem, phiên bản đơn, và <strong>bản build</strong> lúc gặp lỗi. Đó là thứ biến “hôm trước em thấy lỗi” thành một việc truy được.</p>
          <ul>
            <li><strong>Báo lỗi</strong> → bắn thông báo Google Chat ngay</li>
            <li><strong>Đề xuất cải tiến</strong> → KHÔNG bắn chuông, chỉ đếm vào huy hiệu</li>
          </ul>
          <Note>Hai loại có <strong>hai vòng đời riêng</strong>. Báo lỗi: Mới → Đang xem → Đã sửa / Không phải lỗi. Đề xuất: Mới → <strong>Đã ghi nhận, chưa làm</strong> → Đang làm → Đã làm xong / Không làm.</Note>
          <Warn>Chọn <strong>Không phải lỗi</strong> hoặc <strong>Không làm</strong> thì <strong>bắt buộc</strong> ghi một dòng lý do. Người gửi chịu được câu “không”; họ không chịu được sự im lặng — và sau hai lần im lặng họ quay về nhắn tin.</Warn>

          <h4>Ghi nhận cải tiến</h4>
          <p>Sidebar → <Kw>ADMIN → Ghi nhận cải tiến</Kw>. Cách dùng: ghi dần trong ngày, đăng một lượt.</p>
          <ol>
            <li>Gõ tiêu đề + chi tiết (không bắt buộc), chọn khu vực</li>
            <li><strong>Lưu nháp</strong> — chưa ai thấy</li>
            <li>Cuối ngày bấm <strong>Đăng n mục</strong></li>
          </ol>
          <Note>Cả lượt đăng chỉ gửi <strong>MỘT</strong> tin Google Chat, dù có 5 mục. Và <strong>sửa một mục đã đăng KHÔNG bắn tin lần hai</strong> — nên yên tâm sửa lỗi chính tả.</Note>
          <p>Viết <strong>theo góc người dùng</strong>, không theo góc kỹ thuật: “Chuyển xưởng — bản đã huỷ không còn chặn bản đúng” chứ không phải tên file hay tên hàm. Hệ thống sẽ nhắc nếu tiêu đề nghe như một ghi chú kỹ thuật.</p>
          <Note>Chỉ tick <strong>Quan trọng</strong> khi không biết thì làm sai việc — nó hiện một dải thông báo trên đầu trang. Tick mọi mục là không mục nào còn nổi bật.</Note>
          <Warn>Mục <strong>đã đăng</strong> thì không xoá được — người dùng đã đọc nó rồi. Muốn nó không hiện nữa thì bấm <strong>Bỏ đăng</strong>.</Warn>

          <h4>Vì sao hai thứ này liên quan tới nhau</h4>
          <p>Khi bạn chốt một <strong>Đề xuất cải tiến</strong> là “Đã làm xong”, hãy ghi luôn một mục ở <strong>Có gì mới</strong>. Nhân viên thấy điều mình xin đã được làm — đó là thứ mạnh nhất khiến họ tiếp tục gửi góp ý.</p>
        </div>
      ),
    },
    en: {
      title: "Feedback & Changelog",
      content: (
        <div>
          <p>Two tools for talking to staff <strong>inside the system</strong>, instead of messaging on another platform.</p>

          <h4>Feedback inbox</h4>
          <p>Sidebar → <Kw>ADMIN → Phản hồi người dùng</Kw> (User Feedback). The red badge counts unhandled reports.</p>
          <p>Each report carries its own context: the screen, the SO/MO being viewed, the order version, and the <strong>build</strong> that was running. That is what turns “I saw a bug the other day” into something traceable.</p>
          <ul>
            <li><strong>Bug reports</strong> → fire a Google Chat ping immediately</li>
            <li><strong>Suggestions</strong> → NO ping, they only add to the badge</li>
          </ul>
          <Note>The two kinds have <strong>separate lifecycles</strong>. Bugs: New → Reviewing → Fixed / Not a bug. Suggestions: New → <strong>Acknowledged, not started</strong> → In progress → Done / Won&apos;t do.</Note>
          <Warn>Choosing <strong>Not a bug</strong> or <strong>Won&apos;t do</strong> <strong>requires</strong> a one-line reason. People can take a “no”; they cannot take silence — and after two silences they go back to chat.</Warn>

          <h4>Recording improvements</h4>
          <p>Sidebar → <Kw>ADMIN → Ghi nhận cải tiến</Kw> (Changelog). Write entries through the day, publish once.</p>
          <ol>
            <li>Type a title plus optional detail, pick an area</li>
            <li><strong>Save draft</strong> — nobody sees it yet</li>
            <li>At the end of the day press <strong>Publish n entries</strong></li>
          </ol>
          <Note>The whole batch sends exactly <strong>ONE</strong> Google Chat message, even with 5 entries. And <strong>editing a published entry never sends a second message</strong> — so fix typos freely.</Note>
          <p>Write from the <strong>user&apos;s side</strong>, not the technical side — no file or function names. The editor warns you when a title reads like a commit message.</p>
          <Note>Tick <strong>Important</strong> only when not knowing means doing the job wrong; it shows a banner at the top of every page. Ticking everything means nothing stands out.</Note>
          <Warn><strong>Published</strong> entries cannot be deleted — people already read them. Use <strong>Unpublish</strong> if you want one hidden.</Warn>

          <h4>Why the two connect</h4>
          <p>When you mark a <strong>Suggestion</strong> as Done, write a matching changelog entry. Staff then see that what they asked for got built — the strongest reason they keep sending feedback.</p>
        </div>
      ),
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// 3D DESIGNER GUIDE — 7 chapters (DESIGN_3D role)
//
// ⚠️ MỌI KHẲNG ĐỊNH TRONG BỘ NÀY ĐƯỢC ĐỐI CHIẾU TRỰC TIẾP VỚI CODE, không viết theo phỏng
// đoán. Nguồn cho từng phần:
//
//   · Ai được làm gì            → business/kpi-3d/permissions.ts (bảng CAPABILITIES)
//   · Nhãn trạng thái           → kpi-3d/display.ts, kpi-3d/progress.ts, kpi-3d/review.ts
//   · Chặn ghi tiến độ          → kpi-3d/progress.ts:187 (chưa nhận việc) và :208 (đang gác)
//   · Cách tính Deadline / giờ  → kpi-3d-deadline.ts (đi theo ca làm việc, không phải giờ tường)
//
// Bộ này ra đời vì trước đó vai trò DESIGN_3D KHÔNG có một dòng hướng dẫn nào, dù nó có màn
// hình riêng, quy trình riêng và bị chấm KPI.
// ═══════════════════════════════════════════════════════════════════════════════

export const DESIGNER_3D_CHAPTERS: ChapterDef[] = [
  // ── Chapter 1 ───────────────────────────────────────────────────────────────
  {
    id: 1,
    slug: "man-hinh-cua-ban",
    lastReviewed: "2026-08",
    vi: {
      title: "Màn hình của bạn",
      content: (
        <div>
          <p>Với vai trò <Code>DESIGN_3D</Code>, sidebar chỉ có một mục làm việc: <Kw>Việc thiết kế 3D</Kw>. Đó là toàn bộ nơi bạn cần.</p>
          <Note>Bạn <strong>chỉ thấy việc của chính mình</strong>. Phạm vi này bị ép ở tầng truy vấn phía máy chủ, không phải chỉ ẩn trên giao diện — nên không có cách nào xem việc của đồng nghiệp, kể cả khi đổi đường dẫn.</Note>

          <h4>Hai tab</h4>
          <ul>
            <li><Kw>Việc được giao</Kw> — danh sách các lượt giao việc của bạn</li>
            <li><Kw>Tăng ca</Kw> — khai báo và theo dõi giờ làm thêm của bạn</li>
          </ul>

          <h4>Đọc một dòng trong bảng</h4>
          <p>Mỗi dòng là một <Kw>lượt giao việc</Kw> cho một MO. Các cột đáng chú ý:</p>
          <ul>
            <li><strong>Nhóm KPI</strong> — nhóm công việc quyết định số giờ chuẩn cho MO này</li>
            <li><strong>Deadline KPI</strong> — mốc phải xong, tính theo giờ làm việc</li>
            <li><strong>Sớm / Trễ</strong> — bạn đang trước hay sau hạn</li>
          </ul>
          <Note>Một MO có thể có <strong>nhiều lượt</strong> qua thời gian (bị yêu cầu làm lại, hoặc giao lại cho người khác). Mỗi lượt được tính KPI riêng, độc lập với lượt trước.</Note>
        </div>
      ),
    },
    en: {
      title: "Your Screen",
      content: (
        <div>
          <p>With the <Code>DESIGN_3D</Code> role, the sidebar holds a single working item: <Kw>Việc thiết kế 3D</Kw> (3D Design Tasks). That is everywhere you need.</p>
          <Note>You <strong>only ever see your own work</strong>. That scope is enforced in the server query, not merely hidden in the UI — so there is no URL to change that would reveal a colleague&apos;s tasks.</Note>

          <h4>Two tabs</h4>
          <ul>
            <li><Kw>Việc được giao</Kw> (Assigned work) — your assignment list</li>
            <li><Kw>Tăng ca</Kw> (Overtime) — declare and track your own extra hours</li>
          </ul>

          <h4>Reading a row</h4>
          <p>Each row is one <Kw>assignment</Kw> for one MO. Columns worth knowing:</p>
          <ul>
            <li><strong>Nhóm KPI</strong> — the work group that sets the standard hours for this MO</li>
            <li><strong>Deadline KPI</strong> — the due moment, counted in working hours</li>
            <li><strong>Sớm / Trễ</strong> — whether you are ahead of or behind that deadline</li>
          </ul>
          <Note>One MO may have <strong>several assignments</strong> over time (rework, or handover to someone else). Each is scored on its own, independent of the previous one.</Note>
        </div>
      ),
    },
  },

  // ── Chapter 2 ───────────────────────────────────────────────────────────────
  {
    id: 2,
    slug: "nhan-viec",
    lastReviewed: "2026-08",
    vi: {
      title: "Nhận việc",
      content: (
        <div>
          <p>Việc <strong>đầu tiên</strong> với mỗi lượt mới là bấm <Kw>Xác nhận nhận việc</Kw>.</p>
          <Warn>Chưa xác nhận thì <strong>không ghi được tiến độ</strong>. Hệ thống sẽ trả đúng câu: <em>“Bạn chưa xác nhận nhận việc. Bấm &quot;Xác nhận nhận việc&quot; trước khi cập nhật tiến độ.”</em> Đây là chặn ở phía máy chủ, không phải chỉ mờ cái nút.</Warn>

          <h4>Vì sao phải có bước này</h4>
          <p>Mốc bạn nhận việc là mốc <strong>bắt đầu đếm giờ KPI</strong>. Không có nó thì hệ thống phải đoán, và mọi con số phía sau đều dựa trên một phỏng đoán.</p>
          <Note>Khoảng cách giữa lúc Đặt đơn giao và lúc bạn nhận được ghi lại riêng. Nhận sớm hơn mốc giao dự kiến thì độ trễ tính là <strong>0</strong>, không bị tính âm.</Note>

          <h4>Dòng “Chưa nhận việc”</h4>
          <p>Trong bảng, lượt chưa xác nhận hiện chữ <Kw>Chưa nhận việc</Kw> màu cảnh báo. Đó là dấu hiệu <strong>việc cần làm ngay</strong>, không phải một trạng thái để chờ.</p>
        </div>
      ),
    },
    en: {
      title: "Accepting Work",
      content: (
        <div>
          <p>The <strong>first</strong> thing to do with any new assignment is press <Kw>Xác nhận nhận việc</Kw> (Accept work).</p>
          <Warn>Until you accept, you <strong>cannot record progress</strong>. The server refuses with exactly: <em>“Bạn chưa xác nhận nhận việc…”</em> — this is a server-side block, not just a greyed-out button.</Warn>

          <h4>Why this step exists</h4>
          <p>The moment you accept is the moment the <strong>KPI clock starts</strong>. Without it the system would have to guess, and every number after that would rest on a guess.</p>
          <Note>The gap between when the order desk assigned it and when you accepted is recorded separately. Accepting earlier than the planned handover counts as <strong>0</strong> delay, never negative.</Note>

          <h4>The “Chưa nhận việc” row</h4>
          <p>Un-accepted assignments show <Kw>Chưa nhận việc</Kw> (Not accepted) in a warning tone. That is a <strong>do-it-now</strong> marker, not a state to sit in.</p>
        </div>
      ),
    },
  },

  // ── Chapter 3 ───────────────────────────────────────────────────────────────
  {
    id: 3,
    slug: "cap-nhat-tien-do",
    lastReviewed: "2026-08",
    vi: {
      title: "Cập nhật tiến độ & Gửi kết quả",
      content: (
        <div>
          <p>Sau khi nhận việc, bạn ghi tiến độ bằng một trong ba trạng thái:</p>
          <ul>
            <li><Kw>Đang thiết kế</Kw> — đang làm bình thường</li>
            <li><Kw>Chờ thêm thông tin / phản hồi</Kw> — bạn bị vướng, cần Đặt đơn hoặc khách trả lời</li>
            <li><Kw>Đã gửi kết quả</Kw> — bạn đã nộp bài</li>
          </ul>
          <Note>Chọn <strong>Chờ thêm thông tin</strong> khi thật sự bị vướng. Trong bảng nó hiện thành <Kw>Chờ phản hồi</Kw> màu cảnh báo, để người cần trả lời bạn nhìn thấy.</Note>

          <h4>Gửi kết quả</h4>
          <p>Chọn <Kw>Đã gửi kết quả</Kw> là đóng dấu <strong>giờ hoàn tất</strong>, và hệ thống chấm ngay <Kw>Đúng hạn</Kw> hay <Kw>Trễ hạn</Kw> cho lượt đó.</p>

          <h4>Sau khi bạn nộp</h4>
          <p>Lượt chuyển sang <Kw>Chờ kiểm</Kw> — Đặt đơn/Admin kiểm nội bộ trước khi gửi khách. Hai kết cục:</p>
          <ul>
            <li><Kw>Đã duyệt</Kw> — xong lượt này</li>
            <li><Kw>Yêu cầu làm lại</Kw> — cần sửa; có thể là một lượt mới cho bạn, hoặc giao cho người khác</li>
          </ul>
          <Warn>Đây là bước kiểm <strong>nội bộ</strong>, khác với “Chờ khách duyệt” ở màn đơn hàng. Hai thứ dễ nhầm tên nhưng là hai chặng khác nhau.</Warn>

          <h4>Khi đơn đang bị gác</h4>
          <p>Nếu đơn của bạn bị <strong>tạm dừng</strong>, bạn vẫn ghi được ghi chú và File Render, nhưng <strong>KHÔNG gửi kết quả được</strong>.</p>
          <Note>Không phải để làm khó bạn: giờ công của giai đoạn đó <strong>đã được chốt tại đúng mốc tạm dừng</strong> và đã vào KPI. Cho nộp sau đó là chốt lần thứ hai lên cùng một lượt bằng một con số khác. Cần làm tiếp thì Đặt đơn/Admin giao <strong>lượt mới</strong> — và KPI tính lại từ đầu cho lượt đó.</Note>
        </div>
      ),
    },
    en: {
      title: "Progress & Submitting",
      content: (
        <div>
          <p>Once accepted, you record progress with one of three statuses:</p>
          <ul>
            <li><Kw>Đang thiết kế</Kw> — working normally</li>
            <li><Kw>Chờ thêm thông tin / phản hồi</Kw> — you are blocked, waiting on the order desk or the customer</li>
            <li><Kw>Đã gửi kết quả</Kw> — you submitted your work</li>
          </ul>
          <Note>Use <strong>Chờ thêm thông tin</strong> when you are genuinely blocked. The table shows it as <Kw>Chờ phản hồi</Kw> in a warning tone so whoever owes you an answer can see it.</Note>

          <h4>Submitting</h4>
          <p>Choosing <Kw>Đã gửi kết quả</Kw> stamps the <strong>completion time</strong>, and the system immediately scores the assignment <Kw>Đúng hạn</Kw> (on time) or <Kw>Trễ hạn</Kw> (late).</p>

          <h4>After you submit</h4>
          <p>The assignment moves to <Kw>Chờ kiểm</Kw> — an internal check by the order desk / admin before it reaches the customer. Two outcomes:</p>
          <ul>
            <li><Kw>Đã duyệt</Kw> — this assignment is done</li>
            <li><Kw>Yêu cầu làm lại</Kw> — rework needed; it may come back to you as a new assignment, or go to someone else</li>
          </ul>
          <Warn>This is the <strong>internal</strong> check, different from “Chờ khách duyệt” (awaiting customer) on the orders screen. The names look alike but they are different stages.</Warn>

          <h4>When the order is on hold</h4>
          <p>If your order is <strong>paused</strong>, you can still record notes and render files, but you <strong>cannot submit</strong>.</p>
          <Note>Not to obstruct you: your hours for that stretch were <strong>closed at the exact pause moment</strong> and already counted toward KPI. Allowing a later submission would stamp a second, different verdict on the same assignment. To continue, the order desk / admin issues a <strong>new assignment</strong> — and KPI restarts for it.</Note>
        </div>
      ),
    },
  },

  // ── Chapter 4 ───────────────────────────────────────────────────────────────
  {
    id: 4,
    slug: "deadline-kpi",
    lastReviewed: "2026-08",
    vi: {
      title: "Deadline KPI được tính thế nào",
      content: (
        <div>
          <p>Đây là chương đáng đọc kỹ nhất, vì nó giải thích một con số dễ gây hiểu nhầm.</p>

          <h4>Tính theo GIỜ LÀM VIỆC, không phải giờ đồng hồ</h4>
          <p>Deadline được tính bằng cách <strong>bước qua từng ca làm việc</strong> trong lịch: bỏ ngày nghỉ, bỏ giờ nghỉ giữa ca, bỏ đêm.</p>
          <Note>Ví dụ: giao <strong>16:00 thứ Sáu</strong>, bạn xong <strong>09:00 thứ Hai</strong>. Giờ đồng hồ là 65 giờ, nhưng <strong>giờ làm việc thật chỉ khoảng 2 giờ</strong> — và hệ thống tính theo con số thứ hai.</Note>
          <p>Nên đừng lấy hiệu số ngày để tự suy ra mình trễ bao nhiêu: cuối tuần và ban đêm không được tính.</p>

          <h4>Nhóm KPI quyết định số giờ chuẩn</h4>
          <p>Mỗi MO được gán một <Kw>Nhóm KPI</Kw>, và nhóm đó mang <strong>số giờ chuẩn</strong>. Deadline = mốc bạn nhận việc, cộng thêm số giờ chuẩn đó, đi theo lịch làm việc.</p>

          <h4>“Một ngày làm việc” là bao nhiêu</h4>
          <p>Lấy theo <strong>lịch đang cấu hình</strong>, không phải mặc định 8 giờ. Một lịch có Thứ 2 gồm ba ca (08:00–12:00, 13:00–15:00, 15:10–17:00) là <strong>7 giờ 50 phút</strong>, không phải 8 giờ.</p>

          <h4>Cột “Sớm / Trễ”</h4>
          <p>Là khoảng cách giữa bạn và deadline, cũng đo bằng giờ làm việc. Nên con số ở đây <strong>luôn nhỏ hơn</strong> phép trừ ngày thông thường của bạn — và đó là con số đúng.</p>
          <Warn>Nếu cột này hiện một số bạn thấy vô lý, hãy dùng nút <strong>Góp ý</strong> báo lại kèm ảnh. Chính lớp lỗi đó từng có thật: một bản trước đây hiện “Trễ 142 giờ” trong khi phần lớn là đêm và Chủ nhật.</Warn>
        </div>
      ),
    },
    en: {
      title: "How the KPI Deadline Works",
      content: (
        <div>
          <p>The most worthwhile chapter here, because it explains a number that is easy to misread.</p>

          <h4>Counted in WORKING hours, not wall-clock hours</h4>
          <p>The deadline is computed by <strong>stepping through each working session</strong> in the calendar: skipping holidays, breaks between sessions, and nights.</p>
          <Note>Example: assigned <strong>Friday 16:00</strong>, you finish <strong>Monday 09:00</strong>. Wall-clock is 65 hours, but the <strong>actual working time is about 2 hours</strong> — and the system uses the second number.</Note>
          <p>So do not subtract calendar days to estimate how late you are: weekends and nights do not count.</p>

          <h4>The KPI group sets the standard hours</h4>
          <p>Every MO is assigned a <Kw>Nhóm KPI</Kw> (KPI group) carrying a <strong>standard hour budget</strong>. Deadline = the moment you accepted, plus those standard hours, walked along the working calendar.</p>

          <h4>What “one working day” means</h4>
          <p>Taken from the <strong>configured calendar</strong>, not a hardcoded 8 hours. A Monday made of three sessions (08:00–12:00, 13:00–15:00, 15:10–17:00) is <strong>7h50m</strong>, not 8 hours.</p>

          <h4>The “Sớm / Trễ” column</h4>
          <p>Your distance from the deadline, also measured in working hours. That is why the figure is <strong>always smaller</strong> than a plain day-subtraction — and the smaller one is correct.</p>
          <Warn>If this column shows something that looks impossible, use the <strong>Góp ý</strong> button and attach a screenshot. That exact class of bug has happened: an earlier build displayed “142 hours late” when most of it was nights and Sundays.</Warn>
        </div>
      ),
    },
  },

  // ── Chapter 5 ───────────────────────────────────────────────────────────────
  {
    id: 5,
    slug: "tang-ca",
    lastReviewed: "2026-08",
    vi: {
      title: "Tăng ca",
      content: (
        <div>
          <p>Tab <Kw>Tăng ca</Kw> là nơi bạn khai báo giờ làm thêm cho việc của mình.</p>

          <h4>Khai báo</h4>
          <ol>
            <li>Mở tab <strong>Tăng ca</strong></li>
            <li>Bấm <Kw>Khai báo tăng ca</Kw></li>
            <li>Chọn khoảng thời gian đã làm thêm</li>
            <li>Ghi <strong>Lý do</strong> (không bắt buộc, nhưng nên có — VD “Gấp đơn khách”)</li>
            <li>Gửi</li>
          </ol>
          <Note>Bạn chỉ khai báo được cho <strong>việc do mình phụ trách</strong>.</Note>

          <h4>Sau khi gửi</h4>
          <p>Khai báo ở trạng thái <strong>chờ duyệt</strong>. Việc phê duyệt thuộc <strong>Leader/Giám sát</strong> — bạn không tự duyệt được, và điều đó là có chủ ý: đây là dữ liệu đi vào lương.</p>
          <ul>
            <li><strong>Đã duyệt</strong> — giờ được ghi nhận</li>
            <li><strong>Từ chối</strong> — không ghi nhận</li>
          </ul>
          <Note>Bạn <strong>luôn xem lại được</strong> khai báo của mình ở tab này, kể cả sau khi đã duyệt.</Note>
        </div>
      ),
    },
    en: {
      title: "Overtime",
      content: (
        <div>
          <p>The <Kw>Tăng ca</Kw> (Overtime) tab is where you declare extra hours on your own work.</p>

          <h4>Declaring</h4>
          <ol>
            <li>Open the <strong>Tăng ca</strong> tab</li>
            <li>Press <Kw>Khai báo tăng ca</Kw> (Declare overtime)</li>
            <li>Pick the period you worked</li>
            <li>Add a <strong>reason</strong> (optional but worth it — e.g. “Gấp đơn khách”)</li>
            <li>Submit</li>
          </ol>
          <Note>You can only declare against work <strong>assigned to you</strong>.</Note>

          <h4>After submitting</h4>
          <p>The declaration sits <strong>pending approval</strong>. Approval belongs to the <strong>leader / supervisor</strong> — you cannot approve your own, and that is deliberate: this data feeds payroll.</p>
          <ul>
            <li><strong>Approved</strong> — the hours are counted</li>
            <li><strong>Rejected</strong> — they are not</li>
          </ul>
          <Note>You can <strong>always review your own declarations</strong> in this tab, including after approval.</Note>
        </div>
      ),
    },
  },

  // ── Chapter 6 ───────────────────────────────────────────────────────────────
  {
    id: 6,
    slug: "viec-khong-lam-duoc",
    lastReviewed: "2026-08",
    vi: {
      title: "Việc bạn không làm được — và vì sao",
      content: (
        <div>
          <p>Biết trước ranh giới thì đỡ mất thời gian đi tìm một cái nút không tồn tại.</p>

          <h4>Bạn LÀM ĐƯỢC</h4>
          <ul>
            <li>Xem việc của mình</li>
            <li>Xác nhận nhận việc</li>
            <li>Cập nhật tiến độ và gửi kết quả</li>
            <li>Khai báo tăng ca cho việc của mình</li>
          </ul>

          <h4>Bạn KHÔNG làm được</h4>
          <ul>
            <li><strong>Tạm dừng / mở lại</strong> một lượt — chỉ Admin/Đặt đơn</li>
            <li><strong>Kiểm kết quả</strong> — chỉ Admin/Đặt đơn</li>
            <li><strong>Chuyển việc sang người khác</strong> — chỉ Admin/Đặt đơn</li>
            <li><strong>Xem tải công việc của đồng nghiệp</strong> — chỉ người đi giao việc</li>
            <li><strong>Tự duyệt tăng ca</strong> — chỉ Leader/Giám sát</li>
          </ul>

          <h4>Vì sao bạn không được tự tạm dừng</h4>
          <Warn>Tạm dừng vừa <strong>trừ giờ thực tế</strong> vừa <strong>dời deadline</strong>. Nếu người <strong>đang được chấm điểm</strong> tự bấm dừng được thì KPI không còn nghĩa gì — chỉ cần bấm dừng mỗi lần rời bàn là mọi đơn đều đúng hạn.</Warn>
          <p>Đây không phải là không tin bạn. Đó là điều kiện để con số KPI có nghĩa với <strong>tất cả mọi người</strong>, kể cả bạn.</p>
          <Note>Cần gác đơn thật (thiếu vật liệu, khách chưa trả lời, máy lỗi) thì nói với Đặt đơn/Admin — họ có nút đó. Trong lúc chờ, hãy ghi một dòng tiến độ <strong>Chờ thêm thông tin / phản hồi</strong> để lý do được lưu lại.</Note>

          <h4>Nếu bấm gì mà bị từ chối</h4>
          <p>Hệ thống trả về <strong>câu nói rõ vì sao</strong>, không phải một lỗi chung chung. Nếu câu đó không giúp bạn hiểu, đó là lỗi của hệ thống — bấm <strong>Góp ý</strong> báo lại.</p>
        </div>
      ),
    },
    en: {
      title: "What You Cannot Do — and Why",
      content: (
        <div>
          <p>Knowing the boundary saves you hunting for a button that does not exist.</p>

          <h4>You CAN</h4>
          <ul>
            <li>View your own assignments</li>
            <li>Accept work</li>
            <li>Record progress and submit results</li>
            <li>Declare overtime on your own work</li>
          </ul>

          <h4>You CANNOT</h4>
          <ul>
            <li><strong>Pause / resume</strong> an assignment — admin / order desk only</li>
            <li><strong>Review results</strong> — admin / order desk only</li>
            <li><strong>Hand work to someone else</strong> — admin / order desk only</li>
            <li><strong>See colleagues&apos; workload</strong> — only those who assign work</li>
            <li><strong>Approve your own overtime</strong> — leader / supervisor only</li>
          </ul>

          <h4>Why you cannot pause your own work</h4>
          <Warn>Pausing both <strong>deducts actual hours</strong> and <strong>moves the deadline</strong>. If the person <strong>being scored</strong> could press it, KPI would mean nothing — pause every time you leave the desk and every order finishes on time.</Warn>
          <p>This is not distrust. It is the condition that makes the KPI number mean something for <strong>everyone</strong>, including you.</p>
          <Note>When a real hold is needed (missing material, customer silent, machine down), tell the order desk / admin — they have the button. Meanwhile record a <strong>Chờ thêm thông tin / phản hồi</strong> progress entry so the reason is on record.</Note>

          <h4>If an action is refused</h4>
          <p>The system answers with a sentence that <strong>says why</strong>, not a generic error. If that sentence does not help you understand, that is the system&apos;s fault — press <strong>Góp ý</strong> and report it.</p>
        </div>
      ),
    },
  },

  // ── Chapter 7 ───────────────────────────────────────────────────────────────
  {
    id: 7,
    slug: "gop-y-co-gi-moi-3d",
    lastReviewed: "2026-08",
    vi: {
      title: "Góp ý & Có gì mới",
      content: (
        <div>
          <p>Hai mục này nằm trong nhóm <Kw>Tài liệu</Kw> ở sidebar, cạnh trang Hướng dẫn bạn đang đọc. Cả hai đều dành cho mọi vai trò, kể cả bạn.</p>

          <h4>Báo lỗi hoặc đề xuất — nút “Góp ý”</h4>
          <p>Nút <Kw>Góp ý</Kw> dán ở <strong>giữa cạnh phải màn hình</strong>, luôn thấy.</p>
          <ol>
            <li>Bấm <strong>Góp ý</strong></li>
            <li>Chọn <strong>Báo lỗi</strong> (có chỗ chạy sai) hoặc <strong>Đề xuất cải tiến</strong></li>
            <li>Gõ hai ô — ô thứ hai không bắt buộc</li>
            <li><strong>Bấm Ctrl+V để dán ảnh</strong> vừa chụp, tối đa 4 ảnh</li>
            <li>Bấm <strong>Gửi</strong></li>
          </ol>
          <Note>Bạn <strong>không cần gõ lại</strong> số MO hay tên màn hình — hệ thống tự kèm. Đó là lý do gửi qua đây nhanh hơn nhắn tin.</Note>
          <p>Xem lại những gì đã gửi và câu trả lời của admin ở <Kw>Góp ý của tôi</Kw>.</p>

          <h4>Khi hướng dẫn không khớp màn hình</h4>
          <p>Mục <Kw>Có gì mới</Kw> ghi lại những cải tiến đã đưa vào hệ thống, và có huy hiệu đỏ khi có cập nhật bạn chưa đọc.</p>
          <Warn>Đầu mỗi chương có <strong>mốc rà soát</strong>. Hệ thống cập nhật liên tục, nên khi thấy màn hình khác với hướng dẫn: xem <strong>Có gì mới</strong> trước; nếu vẫn không khớp thì bấm <strong>Góp ý</strong> — đó chính là loại lỗi cần biết nhất.</Warn>

          <h4>Số KPI của bạn cũng cần được kiểm</h4>
          <Note>Nếu Deadline, “Sớm / Trễ”, hay giờ tăng ca hiện ra con số bạn thấy không đúng, <strong>hãy báo</strong>. Đó là dữ liệu ảnh hưởng tới đánh giá công việc của bạn, và im lặng không sửa được nó.</Note>
        </div>
      ),
    },
    en: {
      title: "Feedback & What's New",
      content: (
        <div>
          <p>Both sit in the <Kw>Docs</Kw> group in the sidebar, next to this guide. Both are for every role, including yours.</p>

          <h4>Report a bug or suggest something — the “Góp ý” button</h4>
          <p>The <Kw>Góp ý</Kw> (Feedback) button sits at the <strong>middle of the right edge</strong>, always visible.</p>
          <ol>
            <li>Click <strong>Góp ý</strong></li>
            <li>Pick <strong>Báo lỗi</strong> (something is wrong) or <strong>Đề xuất cải tiến</strong> (a request)</li>
            <li>Fill the two boxes — the second is optional</li>
            <li><strong>Press Ctrl+V to paste a screenshot</strong>, up to 4 images</li>
            <li>Click <strong>Gửi</strong> (Send)</li>
          </ol>
          <Note>You do <strong>not</strong> need to retype the MO or the screen name — the system attaches them. That is why this beats a chat message.</Note>
          <p>Review what you sent, and the admin&apos;s reply, under <Kw>Góp ý của tôi</Kw> (My Feedback).</p>

          <h4>When the guide disagrees with the screen</h4>
          <p><Kw>Có gì mới</Kw> (What&apos;s New) records improvements shipped to the system, with a red badge when there is something you have not read.</p>
          <Warn>Each chapter carries a <strong>review date</strong> at the top. The system changes often, so when the screen disagrees with the guide: check <strong>Có gì mới</strong> first; if it still does not match, press <strong>Góp ý</strong> — that is exactly the kind of problem most worth knowing about.</Warn>

          <h4>Your KPI numbers deserve checking too</h4>
          <Note>If the deadline, the “Sớm / Trễ” figure, or your overtime hours look wrong, <strong>report it</strong>. That data affects how your work is assessed, and silence cannot fix it.</Note>
        </div>
      ),
    },
  },
];

// ─── Hợp đồng dữ liệu của /api/reports/stages ────────────────────────────────
//
// VÌ SAO CÓ FILE NÀY: trước đây cùng một hợp đồng được khai báo HAI LẦN, độc lập nhau —
// `NRow/HRow/TRow/RRow` bên trong route handler, và `NguoiRow/HotRow/...` trong
// production-stats.tsx. Hai bên không có ràng buộc biên dịch nào, nên sửa API mà quên sửa
// client thì TypeScript im lặng, chỉ sai lúc chạy. Sắp có thêm màn Đánh giá Khâu đọc cùng
// dữ liệu này (in bảng tổng KPI ở cuối bản in) — ba nơi đồng bộ bằng tay là không bền.
//
// Từ đây API và mọi màn hình đọc CHUNG một khai báo. Đổi ở đây, `tsc` chỉ ra hết nơi cần sửa.

/** Thợ + mã + bậc — các field mà API gắn thêm khi chuyển từ map tích luỹ sang mảng trả về. */
export type CrafterIdentity = {
  crafter: string;
  /**
   * Mã thợ, lấy từ bảng Craftsman. "" khi thợ chưa có mã HOẶC chưa có trong danh mục.
   *
   * 🎯 THÊM Ở ĐÂY, KHÔNG PHẢI Ở TỪNG KIỂU DÒNG. Cả bốn khâu (Nguội · Hột · TC Dây · Resin) đều
   * mở rộng từ CrafterIdentity, nên một dòng ở đây là bốn bảng cùng có cột Mã — và `tsc` chỉ ra
   * mọi chỗ chưa cung cấp nó. Thêm khâu thứ năm về sau cũng được canh sẵn.
   *
   * ⚠️ Nối bằng TÊN, không phải id: dữ liệu sản xuất lưu tên thợ dạng chữ. Thợ không khớp tên
   * trong danh mục thì mã rỗng — giống hệt cách `level` đã xử lý từ trước.
   */
  code: string;
  /** Bậc thợ, lấy từ bảng Craftsman. "" khi thợ chưa có trong danh mục. */
  level: string;
};

/** Khâu Nguội — khâu DUY NHẤT có KPI quy chuẩn (xem app/lib/business/kpi-nguoi.ts). */
export type NguoiRow = CrafterIdentity & {
  totalHours: number;
  kpiHours: number;
  moCount: number;
  qualityPass: number;
  qualityFail: number;
  timePass: number;
  timeFail: number;
};

/** Khâu Gắn đá Hột — đếm theo loại đá. */
export type HotRow = CrafterIdentity & {
  moCount: number;
  xoan: number;
  xoanLab: number;
  cz: number;
  daMau: number;
  khac: number;
};

/** Khâu Thủ công dây — gộp theo (thợ, nhóm công việc) nên một thợ có thể có nhiều dòng. */
export type TcDayRow = CrafterIdentity & {
  workGroup: string;
  totalHours: number;
  moCount: number;
};

/** Khâu Resin — đếm đạt/không đạt theo trọng lượng và chất lượng. */
export type ResinRow = CrafterIdentity & {
  moCount: number;
  weightPass: number;
  weightFail: number;
  qualityPass: number;
  qualityFail: number;
};

/** Payload đầy đủ của GET /api/reports/stages. */
export type StageReportData = {
  year: number;
  month: number;
  nguoi: NguoiRow[];
  hot: HotRow[];
  tcday: TcDayRow[];
  resin: ResinRow[];
};

// ─── Hợp đồng bảng in ────────────────────────────────────────────────────────
//
// Đặt ở đây (không phải trong component in) vì sắp có HAI bản in cùng vẽ bảng tổng KPI:
// màn Thống kê và cuối bản in Đánh giá Khâu. Một khai báo dùng chung để hai bên không lệch.

/** Mô tả một cột của bảng in. `key` phải khớp khoá trong `PrintKpiRow.cells`. */
export type PrintKpiCol = {
  key: string;
  label: string;
  align?: "left" | "right";
};

/** Một dòng bảng in — giá trị ĐÃ ĐỊNH DẠNG sẵn thành chuỗi, component chỉ việc vẽ. */
export type PrintKpiRow = {
  crafter: string;
  rowKey?: string;
  cells: Record<string, string>;
};

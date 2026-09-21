import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Chuẩn hoá chuỗi tiếng Việt: bỏ dấu, lowercase — dùng cho search client-side
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .toLowerCase()
    .trim();
}

// Hiển thị thời lượng chuyên nghiệp hơn: đổi ký hiệu giờ "g" → "h" (giữ ngày "n", phút "p").
// CHỈ dùng ở tầng hiển thị — chuỗi lưu (durationNote/gioThucTe) vẫn dùng "g" để parse.
// "4g 30p" → "4h 30p" · "16g" → "16h" · "30p" → "30p" · "2n 3g" → "2n 3h"
export function formatDurationDisplay(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/(\d+)\s*g/g, "$1h");
}

/**
 * Số giờ thập phân → chuỗi "Hh Mp" cho bảng KPI. 0 → "—" (ô trống dễ đọc hơn số 0).
 *
 * Trước đây là `fmtHrs` cục bộ trong production-stats.tsx. Chuyển ra đây vì sắp có màn thứ hai
 * (bản in Đánh giá Khâu) hiện cùng con số "Tổng giờ thực tế" — hai nơi tự định dạng riêng thì
 * cùng một giá trị có thể hiện thành "30h 30p" ở màn này và "30.5h" ở màn kia.
 *
 * 22 → "22h" · 30.5 → "30h 30p" · 0.5 → "30p" · 0 → "—"
 */
export function formatHours(h: number): string {
  if (h === 0) return "—";
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60), mm = total % 60;
  if (hh === 0) return `${mm}p`;
  if (mm === 0) return `${hh}h`;
  return `${hh}h ${mm}p`;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  value: string | number | null | undefined,
  currency = "VND"
): string {
  if (value == null) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(
  value: string | null | undefined,
  opts?: { relative?: boolean }
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";

  if (opts?.relative) {
    const diffMs = date.getTime() - Date.now();
    const diffDays = Math.ceil(diffMs / 86_400_000);
    if (diffDays === 0) return "Hôm nay";
    if (diffDays === 1) return "Ngày mai";
    if (diffDays === -1) return "Hôm qua";
    if (diffDays > 0) return `${diffDays} ngày nữa`;
    return `Trễ ${Math.abs(diffDays)} ngày`;
  }

  // Cố định timeZone Asia/Ho_Chi_Minh — không dùng timezone mặc định của môi trường chạy.
  // Server SSR (Vercel) chạy UTC, browser user chạy giờ máy (thường +7 VN nhưng không đảm
  // bảo) — nếu để mặc định, cùng 1 giá trị ngày-UTC-midnight sẽ hiển thị KHÁC NHAU giữa
  // server và client (lệch 1 ngày), gây hydration mismatch và/hoặc ngày sai lệch.
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

export function isOverdue(requiredDate: string | null | undefined): boolean {
  if (!requiredDate) return false;
  return new Date(requiredDate) < new Date();
}

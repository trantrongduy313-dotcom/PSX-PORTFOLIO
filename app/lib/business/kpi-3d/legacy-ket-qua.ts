import { workingDaysFromMinutes } from "@/app/lib/business/kpi-3d/actual-minutes";

// Hai phép tính CŨ của tab Thiết kế, chỉ cho MO CHƯA có lượt giao việc 3D — MO đã có lượt thì
// SERVER chốt và panel không gửi hai giá trị này lên nữa.
// Test khoá cả khuyết điểm đã biết (so ngày trần, mất giờ của deadline):
//   __tests__/kpi-3d-legacy-ket-qua.test.ts

/** Số ngày làm việc suy từ số giờ thực tế. Chuỗi rỗng khi không tính được. */
export function calcSoNgayHT(gioThucTe: string): string {
  const hours = parseFloat(gioThucTe);
  if (isNaN(hours) || hours <= 0) return "";
  const days = workingDaysFromMinutes(Math.round(hours * 60));
  return days == null ? "" : String(days);
}

/** "Hoàn tất sớm" / "Hoàn tất trễ" — cùng ngày thì phân định bằng số giờ. */
export function calcKetQua(
  ngayHT: string,
  deadline: string,
  gioThucTe: string,
  soGioDuKien: string,
): string {
  if (!ngayHT || !deadline) return "";
  const completed = new Date(ngayHT);
  const due = new Date(deadline);
  if (isNaN(completed.getTime()) || isNaN(due.getTime())) return "";
  if (completed < due) return "Hoàn tất sớm";
  if (completed > due) return "Hoàn tất trễ";

  const actual = parseFloat(gioThucTe);
  const planned = parseFloat(soGioDuKien);
  if (isNaN(actual) || isNaN(planned)) return "";
  return actual <= planned ? "Hoàn tất sớm" : "Hoàn tất trễ";
}

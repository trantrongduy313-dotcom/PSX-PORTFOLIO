// "Có gì mới không" — chữ ký nhẹ thay cho việc kéo lại cả bảng (màn Việc thiết kế 3D).
//
// Luật có test: __tests__/kpi-3d-freshness.test.ts
// Vì sao không poll thẳng danh sách, và vì sao phải đếm CẢ NĂM bảng:
//   docs/03_SYSTEM_ARCHITECTURE.md § Chữ ký làm mới của màn 3D
//
// ⚠️ Đưa một trường mới lên bảng 3D thì bảng chứa nó PHẢI có mặt trong chữ ký. Đã bị bỏ sót hai
// lần. Test "chữ ký có ĐÚNG 9 phần" là chốt chặn cho quy tắc này.

/** Bốn cặp (đếm + mốc) đủ để biết phạm vi dữ liệu có thay đổi hay chưa. */
export type FreshnessCounters = {
  assignmentCount: number;
  /** Mốc sửa gần nhất của lượt giao việc — null khi phạm vi rỗng. */
  assignmentUpdatedAt: Date | string | null;
  progressLogCount: number;
  progressLogLatestAt: Date | string | null;
  pauseCount: number;
  pauseLatestAt: Date | string | null;
  /**
   * Các MO mà lượt giao việc trong phạm vi đang trỏ tới.
   *
   * ĐẾM đi cùng MỐC như ba cặp trên. Đếm ở đây bắt được việc một MO rời khỏi phạm vi (lượt bị
   * huỷ/giao lại), thứ mà `_max(updatedAt)` không bao giờ thấy vì nó chỉ đi tới.
   *
   * Optional để dữ liệu cũ / chỗ gọi chưa cập nhật vẫn dựng được chữ ký — nhưng route meta LUÔN
   * truyền; xem test kèm theo.
   */
  orderItemCount?: number;
  orderItemUpdatedAt?: Date | string | null;
  /**
   * ProductionDetail của các đơn trong phạm vi.
   *
   * ⚠️ CÙNG MỘT LÝ DO VỚI ORDERITEM, và suýt nữa lại bị bỏ sót lần thứ hai. "Yêu cầu thiết kế"
   * (Làm INFO / TK mới / Chỉnh size…) nằm trong `ProductionDetail.extraData`, không phải cột của
   * OrderItem hay assignment. Thiếu ở đây thì Đặt đơn đổi yêu cầu mà bảng 3D đứng im — đúng lỗi
   * vừa vá cho cột ưu tiên.
   *
   * Chỉ cần MỐC, không cần đếm: ProductionDetail là 1-1 với Order (`orderId @unique`), và một đơn
   * rời khỏi phạm vi đã được `assignmentCount` bắt rồi.
   */
  productionDetailUpdatedAt?: Date | string | null;
};

const stamp = (v: Date | string | null | undefined): string => {
  if (!v) return "-";
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? String(d.getTime()) : "-";
};

/**
 * Gộp thành MỘT chuỗi để client so sánh bằng `!==`.
 *
 * VÌ SAO LÀ CHUỖI chứ không so từng trường ở client: so từng trường nghĩa là chỗ gọi phải nhớ đủ
 * sáu trường, và ngày nào đó thêm trường thứ bảy thì một màn hình sẽ so năm trường mà vẫn "chạy
 * bình thường" — im lặng bỏ sót thay đổi. Một chuỗi thì thêm trường là mọi chỗ so được ngay.
 *
 * ĐẾM đi cùng MỐC, không chỉ mốc: xoá một lượt làm count giảm nhưng KHÔNG làm mốc sửa gần nhất
 * mới hơn, nên chỉ nhìn mốc sẽ không thấy gì đổi.
 */
export function freshnessSignature(c: FreshnessCounters): string {
  return [
    c.assignmentCount,
    stamp(c.assignmentUpdatedAt),
    c.progressLogCount,
    stamp(c.progressLogLatestAt),
    c.pauseCount,
    stamp(c.pauseLatestAt),
    // THÊM VÀO CUỐI, không chèn giữa: chữ ký chỉ được so bằng `!==` với chữ ký của chính lần
    // trước, nên đổi thứ tự không làm sai — nhưng thêm ở cuối giữ cho các chuỗi cũ trong log đọc
    // được, và giữ nguyên vị trí sáu phần đầu khi đối chiếu bằng mắt.
    c.orderItemCount ?? 0,
    stamp(c.orderItemUpdatedAt),
    stamp(c.productionDetailUpdatedAt),
  ].join("|");
}

/**
 * Dữ liệu đang hiện đã cũ bao lâu, viết cho người đọc.
 *
 * VÌ SAO CẦN HIỆN RA: nút làm mới nói được "bấm để mới", nhưng KHÔNG nói được dữ liệu đang cũ bao
 * lâu — nên người dùng không có cách nào tự biết mình đang xem cái gì. Có mốc thời gian thì lệch
 * 20 giây là chuyện họ thấy và chấp nhận được; không có mốc thì lệch 20 giây và lệch 2 tiếng
 * trông y như nhau.
 */
export function freshnessLabel(fetchedAt: Date | null, now: Date): string {
  if (!fetchedAt || !Number.isFinite(fetchedAt.getTime())) return "";
  const seconds = Math.floor((now.getTime() - fetchedAt.getTime()) / 1000);
  // Số âm = đồng hồ máy lùi giữa hai lần đọc. Hiện "vừa xong" thay vì "-3 giây trước".
  if (seconds < 10) return "vừa xong";
  if (seconds < 60) return `${seconds} giây trước`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

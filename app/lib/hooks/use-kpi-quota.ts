"use client";

// ─── Lấy cấu hình ĐM/Tháng của một tháng, GỌI LƯỜI ───────────────────────────
//
// Dùng cho khối tổng ở cuối bản in Đánh giá Khâu. Chỉ chạy khi `enabled` bật (lúc user mở hộp
// thoại In) — mở màn mà không in thì không tốn request nào.
//
// CHỈ tải /api/admin/kpi-config, KHÔNG tải /api/reports/stages: số giờ, SL công việc và số lần
// không đạt đều cộng được từ chính danh sách đang in (xem stage-review-summary.ts). Thứ duy
// nhất không suy ra được từ danh sách là ĐM/Tháng, vì nó là cấu hình chứ không phải dữ liệu
// công việc. Gọi thêm API báo cáo cả tháng ở đây là truy vấn nặng mà không dùng tới.
//
// Đã tải rồi thì giữ lại: đóng/mở lại hộp thoại KHÔNG gọi lại API. Đổi tháng/năm mới tải lại.

import { useEffect, useRef, useState } from "react";
import { fetchKpiConfig, toQuotaConfig } from "@/app/lib/api/kpi-report-client";
import type { NguoiQuotaConfig } from "@/app/lib/business/kpi-nguoi";

export type KpiQuotaState = {
  cfg: NguoiQuotaConfig | null;
  loading: boolean;
  /** true khi tải hỏng — UI ẩn khối tổng thay vì in ra ĐM sai. */
  failed: boolean;
};

export function useKpiQuota(year: number, month: number, enabled: boolean): KpiQuotaState {
  const [loaded, setLoaded] = useState<{ key: string; cfg: NguoiQuotaConfig | null } | null>(null);
  const fetchedKey = useRef<string | null>(null);
  const key = `${year}-${month}`;

  useEffect(() => {
    if (!enabled || fetchedKey.current === `${year}-${month}`) return;
    fetchedKey.current = `${year}-${month}`;
    let cancelled = false;

    fetchKpiConfig(year, month)
      .then(cfg => {
        if (!cancelled) setLoaded({ key: `${year}-${month}`, cfg: toQuotaConfig(cfg, year, month) });
      })
      .catch(() => {
        // Xoá dấu đã-tải để lần mở sau THỬ LẠI — lỗi mạng nhất thời không nên khoá khối tổng
        // cho tới khi user tải lại trang.
        fetchedKey.current = null;
        if (!cancelled) setLoaded({ key: `${year}-${month}`, cfg: null });
      });

    return () => { cancelled = true; };
  }, [year, month, enabled]);

  // `loading` SUY RA từ "đã có kết quả của đúng tháng này chưa", không phải state riêng bật lên
  // trong effect. Nhờ vậy cấu hình tháng cũ không bị dùng nhầm cho tháng đang xem.
  const fresh = loaded?.key === key ? loaded : null;
  return { cfg: fresh?.cfg ?? null, loading: enabled && !fresh, failed: fresh != null && fresh.cfg === null };
}

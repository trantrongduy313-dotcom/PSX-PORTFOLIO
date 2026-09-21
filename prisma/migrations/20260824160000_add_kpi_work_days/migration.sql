-- Ngày công thực tế của từng thợ trong tháng — điền lúc kiểm kê, ORDER/ADMIN sửa lại được sau.
--
-- VÌ SAO THÊM CỘT MỚI THAY VÌ DÙNG LẠI `overrides`:
-- `overrides` đang chứa { [tênThợ]: ĐM_ghi_đè } — tức KẾT QUẢ. Cột mới chứa NGUYÊN LIỆU (số
-- ngày công), và ĐM sẽ tự suy ra từ nó. Diễn giải lại cột cũ là biến dữ liệu đang có nghĩa "ĐM"
-- thành nghĩa "ngày công": một con số sai trông y như một con số đúng, và không ai phát hiện.
--
-- CỘNG THÊM, KHÔNG PHÁ: DEFAULT '{}' + NOT NULL nên mọi dòng hiện có nhận object rỗng ngay lúc
-- ALTER. Thợ không có key trong đây dùng ngày công mặc định theo lịch — không ô nào trống ở ngày
-- đầu triển khai.
--
-- ⚠️ `IF NOT EXISTS` có chủ ý: câu lệnh này được chạy TAY qua Supabase SQL Editor trước (để
-- không phải dán mật khẩu production vào shell). Nhờ nó, lần `prisma migrate deploy` sau thành
-- no-op và Prisma TỰ ghi sổ đúng chuẩn, không cần checksum giả. Xem migration
-- 20260824140000_add_craftsman_code để biết đầy đủ lý do.

ALTER TABLE "kpi_monthly_config" ADD COLUMN IF NOT EXISTS "workDays" JSONB NOT NULL DEFAULT '{}';

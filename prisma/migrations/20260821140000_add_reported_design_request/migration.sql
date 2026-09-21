-- NV 3D báo lại thực tế đã làm là gì, khi nộp kết quả.
--
-- KHÔNG phải bản sao của "Yêu cầu thiết kế" (ProductionDetail.extraData): trường kia là câu hỏi
-- của Đặt đơn, cột này là câu trả lời của NV 3D. Giữ cả hai mới so được lệch.
--
-- Nullable và KHÔNG có giá trị mặc định: ô này tùy chọn, và null phải giữ đúng nghĩa "không báo
-- gì". Đặt DEFAULT '' sẽ làm mọi dòng cũ trông như đã được trả lời.
ALTER TABLE "design_3d_progress_logs" ADD COLUMN "reportedDesignRequest" TEXT;

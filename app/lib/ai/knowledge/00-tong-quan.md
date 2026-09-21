id: tong-quan
title: Tổng quan hệ thống PSX
lastReviewed: 2026-08
---
PSX là hệ thống quản lý sản xuất trang sức nội bộ.

## Hai khái niệm cốt lõi

- **SO (Sales Order)** — đơn bán hàng lấy từ hệ thống Odoo, mã dạng `26.12345`. Một SO có thể
  chứa nhiều mã hàng khác nhau.
- **MO (Manufacturing Order)** — lệnh sản xuất cho từng mã hàng cụ thể trong SO. Một SO thường
  có từ 1 đến 5 MO.

**Mọi con số trong hệ thống đều đếm theo MO, không phải theo SO.** Thấy "15 đơn đang hoạt động"
nghĩa là 15 MO đang được sản xuất, không phải 15 đơn bán hàng.

## Các vai trò

| Vai trò | Phạm vi |
|---|---|
| ADMIN — Quản trị viên | Toàn bộ hệ thống |
| SALES — Kinh doanh | Đơn của cửa hàng mình được gán |
| ORDER — Xử lý đơn hàng | Tạo đơn, giao việc thiết kế |
| PRODUCTION — Sản xuất | Dữ liệu sản xuất, cảnh báo |
| DESIGN_3D — Nhân viên Thiết kế 3D | Chỉ việc thiết kế do mình phụ trách |

## Tìm việc ở đâu

- **Danh sách đơn hàng** — bảng đơn chính. Việc lọc theo cửa hàng nằm ở thanh công cụ **ngay
  trên bảng**, không nằm ở sidebar.
- **Việc thiết kế 3D** — màn của nhân viên 3D.
- **Cảnh báo** — nơi xử lý các cảnh báo đang mở.
- **Thống kê** — số liệu tổng hợp.
- Nhóm **Tài liệu** — Hướng dẫn sử dụng, Góp ý của tôi, Có gì mới.

## Báo lỗi và góp ý

Nút **Góp ý** dán ở cạnh phải màn hình, luôn có mặt ở mọi trang trong dashboard. Gửi được cả
báo lỗi và đề xuất cải tiến, kèm được ảnh chụp màn hình (dán trực tiếp bằng Ctrl+V cũng được).

Hệ thống **tự kèm** màn hình đang mở, đơn/MO đang xem và bản build — người gửi không cần gõ lại
những thứ đó.

Báo lỗi thì admin nhận thông báo ngay. Đề xuất cải tiến thì không báo ngay, nhưng vẫn được ghi
nhận và xem lại được ở mục **Góp ý của tôi**.

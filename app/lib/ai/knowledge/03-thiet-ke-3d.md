id: thiet-ke-3d
title: Việc thiết kế 3D và KPI
roles: design3d, manager
lastReviewed: 2026-08
---
## Trình tự một lượt việc

1. Đặt đơn hoặc Admin **giao lượt** cho một nhân viên 3D.
2. Nhân viên bấm **Xác nhận nhận việc**.
3. Nhân viên **ghi tiến độ** trong lúc làm.
4. Nhân viên **gửi kết quả**.
5. Người có quyền **đánh giá** kết quả.

## Vì sao không ghi được tiến độ

Chỉ có ba lý do, và thông báo trên màn hình nói rõ lý do nào:

- **Chưa xác nhận nhận việc.** Phải bấm "Xác nhận nhận việc" trước. Đây là lý do hay gặp nhất.
- **Lượt giao việc đã đóng.** Lượt này kết thúc rồi; cần được giao một lượt mới.
- **Đang tạm dừng** — nhưng chỉ chặn *gửi kết quả*, xem mục dưới.

## Đang tạm dừng: ghi tiến độ được, gửi kết quả thì không

Khi lượt việc đang bị tạm dừng:

- ✅ **Vẫn ghi được** tiến độ thường — file render, ghi chú. Những dòng này không đụng tới giờ
  công cũng không đụng deadline.
- ❌ **Không gửi được kết quả.**

Lý do: **tạm dừng là chốt sổ cho phiên đó.** Số giờ của nhân viên được xác nhận ngay tại mốc
dừng và đi vào KPI của tháng đó. Cho gửi kết quả sau khi đã chốt là đóng dấu "xong / đúng hạn"
lên một phiên đã được chốt bằng một con số khác — hai lần chốt trên cùng một lượt, và không ai
đọc được cái nào mới là thật.

Cần làm tiếp thì Đặt đơn hoặc Admin **giao một lượt mới** ở tab Thiết kế của đơn hàng. Mỗi phiên
là một lượt riêng, và KPI tính lại từ đầu cho phiên đó.

## 🔴 Deadline KPI tính theo GIỜ LÀM VIỆC, không phải giờ đồng hồ

Đây là con số bị hiểu sai nhiều nhất.

Deadline đi theo **lịch làm việc đang được cấu hình**, nên nó nhảy qua ngoài giờ, qua ngày nghỉ.

Ví dụ cụ thể: giao việc **16:00 thứ Sáu**, nộp **09:00 thứ Hai**.

- Giờ đồng hồ: **65 giờ**
- Giờ làm việc thật: **khoảng 2 giờ**

Nên "trễ hay không trễ" không đọc được bằng cách trừ hai mốc thời gian.

Và **"một ngày làm việc" không phải 8 giờ mặc định** — nó lấy theo lịch đang cấu hình. Một ngày
ba ca là **7 giờ 50 phút**.

## Nhân viên 3D KHÔNG được tự tạm dừng việc của mình

Việc tạm dừng do Admin, Đặt đơn hoặc Sản xuất thực hiện.

Lý do không phải là chuyện tin hay không tin: tạm dừng **vừa trừ giờ thực tế vừa dời deadline**.
Nếu người **đang được chấm điểm** tự bấm được thì con số KPI không còn nghĩa gì — với ai cũng
vậy, kể cả với chính họ.

Cần dừng thì báo Đặt đơn hoặc Admin.

## Phạm vi dữ liệu

Nhân viên 3D chỉ xem và chỉ cập nhật được **các lượt việc do mình phụ trách**. Không thấy việc
của người khác.

Xác nhận nhận việc thì ngoài nhân viên phụ trách, Admin và Đặt đơn cũng bấm hộ được khi nhân
viên vắng mặt — và hệ thống ghi lại **ai đã bấm**, nên phân biệt được "nhân viên tự nhận" với
"Đặt đơn nhận hộ".

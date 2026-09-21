id: so-mo-phien-ban
title: Số phiên bản của MO
lastReviewed: 2026-08
---
Khi một MO phải làm lại, hệ thống tạo một **phiên bản mới** thay vì sửa lên bản cũ. Bản cũ được
giữ nguyên để còn đọc được lịch sử.

## Cách đọc mã

`26.12345_3` gồm ba phần:

- `26` — năm
- `12345` — số SO của Odoo
- `_3` — **phiên bản thứ 3** của MO này

Mã không có hậu tố, ví dụ `26.12345`, là mã Odoo hai phần — **không phải** phiên bản 1 ẩn.

## Dấu phân cách: một chỗ dễ nhầm

Trong cơ sở dữ liệu tồn tại **cả hai** dấu phân cách:

- Dữ liệu **cũ** dùng dấu chấm — `26.423343.2`
- Dữ liệu **mới** chỉ ghi dấu gạch dưới — `26.423343_3`

**Giao diện luôn hiển thị dấu gạch dưới `_`.** Đây thuần là chuyện hiển thị: thuật toán tính
"phiên bản lớn nhất + 1" không thay đổi, và nó nhận diện được cả hai dạng.

Hệ quả thực tế cần nhớ:

- Khi **tìm kiếm**, một MO cũ có thể đang được lưu với dấu chấm. Tìm không ra bằng `_` thì thử
  bằng `.`
- Việc **kiểm tra trùng MO** phải kiểm cả hai dạng, vì cùng một MO có thể tồn tại ở hai cách
  ghi khác nhau.

## Đánh số

Phiên bản mới luôn là **số phiên bản lớn nhất đang có, cộng một** — kể cả khi phiên bản ở giữa
đã bị huỷ. Số phiên bản không được dùng lại.

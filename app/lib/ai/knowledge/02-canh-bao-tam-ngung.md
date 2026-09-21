id: canh-bao-tam-ngung
title: Cảnh báo và trạng thái Tạm ngưng
roles: employee, manager
lastReviewed: 2026-08
---
## Bốn mức cảnh báo

`LOW` · `MEDIUM` · `HIGH` · `CRITICAL`

Ba mức đầu chỉ để lưu ý — đơn vẫn chạy bình thường.

**Mức `CRITICAL` thì khác: hệ thống TỰ ĐỘNG tạm ngưng đơn.** Không ai phải bấm gì; đơn chuyển
sang trạng thái tạm ngưng ngay khi cảnh báo được tạo.

## 🔴 Xử lý cảnh báo KHÔNG tự động chạy lại đơn

Đây là chỗ nhầm nhiều nhất, và nhầm theo hướng tai hại: người xử lý tưởng đơn đã chạy lại, đơn
thì vẫn nằm im.

Đơn bị tạm ngưng tự động thì có **hai hành động riêng biệt**, và chúng độc lập với nhau:

1. **Xử lý cảnh báo** — đánh dấu cảnh báo đã giải quyết. Đơn **vẫn còn tạm ngưng**.
2. **Tiếp tục sản xuất** — bỏ trạng thái tạm ngưng để đơn chạy lại.

Muốn đơn chạy lại thì phải làm hành động thứ hai. Chỉ làm hành động thứ nhất là cảnh báo sạch
nhưng đơn đứng nguyên chỗ.

Lưu ý: "Tiếp tục sản xuất" chỉ áp dụng cho đơn bị **hệ thống tự động** tạm ngưng. Đơn bị tạm
ngưng vì lý do khác thì hành động này không có tác dụng.

## Các loại cảnh báo

| Loại | Nghĩa |
|---|---|
| Cảnh báo đặc biệt | Sinh ra từ ghi chú bán hàng, có thể tự tạm ngưng đơn |
| Thiếu nguyên liệu | Thiếu nguyên vật liệu |
| Đơn gấp | Đơn được đánh dấu gấp |
| Vấn đề chất lượng | Không đạt kiểm tra chất lượng |
| Thay đổi thiết kế | Thiết kế bị sửa sau khi đã vào sản xuất |
| Khiếu nại khách hàng | Khách hàng phản ánh |

## Trạng thái của đơn

`DRAFT` → `PENDING_DESIGN` → `IN_DESIGN` → `DESIGN_REVIEW` → `DESIGN_APPROVED` →
`DESIGN_COMPLETED` → `PENDING_PRODUCTION` → `IN_PRODUCTION` → `QUALITY_CHECK` → `COMPLETED`

Ngoài mạch trên có hai trạng thái nằm riêng: `SUSPENDED` (tạm ngưng) và `CANCELLED` (đã huỷ).

**Đơn đã huỷ là kết cục cuối** — không chuyển tiếp sang trạng thái nào khác được.

## Khoá sửa trường quan trọng

Từ trạng thái `IN_PRODUCTION` trở đi, các trường quan trọng của đơn **bị khoá không cho sửa**.
Lý do: xưởng đã bắt đầu làm theo thông số đó, nên sửa số liệu lúc này là làm lệch giữa giấy tờ
và vật đang nằm trên bàn.

Cần đổi thật thì tạo **phiên bản MO mới**, không sửa lên bản đang chạy.

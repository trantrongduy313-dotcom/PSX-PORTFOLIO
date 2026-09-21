# Bộ nội dung cho trợ lý "Hỏi trợ lý"

Đây là **toàn bộ** những gì trợ lý được phép biết. Nó không biết gì khác, và nó bị cấm suy diễn
thêm — nên chất lượng câu trả lời **bằng đúng** chất lượng những file trong thư mục này.

## Cách thêm một mục

1. Tạo một file `.md` mới trong thư mục này. Tên file quyết định thứ tự đọc → đặt số ở đầu.
2. Chạy `npm run kb:build`
3. Commit cả file `.md` **và** `generated.ts`

## Định dạng

```
id: luong-trang-thai-don
title: Luồng trạng thái đơn hàng
roles: manager, employee
lastReviewed: 2026-08
---
Nội dung viết bình thường ở đây.
```

| Khoá | Bắt buộc | Ghi chú |
|---|---|---|
| `id` | ✅ | Chữ thường, số, gạch ngang. **Không đổi khi đã dùng** — nó là nhãn dẫn nguồn và đã nằm trong log |
| `title` | ✅ | Hiện trên nút "Mở mục này" |
| `roles` | ❌ | `employee` / `manager` / `design3d`, cách nhau bằng dấu phẩy. **Vắng = mọi vai trò** |
| `lastReviewed` | ✅ | `YYYY-MM` |

## 🔴 Ba luật khi viết nội dung

### 1. Viết LUẬT và LÝ DO, không viết CÁCH BẤM

Phần "bấm đâu, theo thứ tự nào" đã có ở **Hướng dẫn sử dụng** (23 chương). Bộ này trả lời loại
câu hỏi khác:

| ✅ Thuộc bộ này | ❌ Thuộc Hướng dẫn |
|---|---|
| *Vì sao* đơn bị chặn không cho chuyển giai đoạn | Các bước tạo một đơn mới |
| Trạng thái nào sang được trạng thái nào | Vị trí của nút Xuất Excel |
| Deadline được tính theo giờ làm việc nào | Cách đổi bộ lọc cửa hàng |

⚠️ **Vì sao luật này quan trọng:** bộ này và Hướng dẫn cùng mô tả một hệ thống — đó là *hai nơi
lưu cùng một sự thật thì sớm muộn lệch*. Không xoá được rủi ro đó, chỉ giảm được bằng cách để
chúng chồng chéo càng ít càng tốt.

### 2. Nói rõ điều KHÔNG làm được, và vì sao

Câu hỏi hay gặp nhất không phải "làm thế nào" mà **"vì sao tôi không làm được"**. Một mục chỉ
kể việc làm được thì trợ lý sẽ im lặng đúng lúc người dùng cần nhất.

### 3. Con số phải kèm cách tính

Viết *"deadline là 1 ngày"* thì trợ lý sẽ nói lại đúng thế, và người đọc hiểu là 24 giờ. Viết
*"1 ngày làm việc, tính theo lịch đang cấu hình, một ngày ba ca là 7 giờ 50 phút"* thì họ hiểu
đúng.

## Khi hệ thống thay đổi

Sửa mục liên quan, **và cập nhật `lastReviewed`**.

📌 `lastReviewed` không phải thủ tục hành chính. Nó tồn tại để **đổi một lỗi im lặng thành một
lỗi lên tiếng**: một mục không có mốc thì âm thầm tự nhận là đang đúng. Đã có bằng chứng thật
trong dự án này — `app/lib/guide/content.tsx` dạy sai định dạng số MO suốt **717 commit** mà
không ai phát hiện.

Câu trả lời của trợ lý **luôn hiện mốc này**, nên người đọc tự biết mà dè dặt.

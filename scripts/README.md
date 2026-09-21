# scripts/ — công cụ vận hành

## ⚠️ Thư mục này CỐ Ý nhỏ

Trước 08/2026 ở đây có **181 file / 20.758 dòng**, trong đó **173 file không ai gọi** — phần lớn
là script sửa dữ liệu dùng một lần, đã chạy xong từ nhiều tháng trước.

Chúng không chỉ là rác. **76 file `fix-*` ghi thẳng vào database production**, nằm đúng nơi một
người mới (hoặc một AI agent) tìm thấy và chạy được. Một câu vô hại như *"sửa lại mấy MO bị sai
loại SP"* là đủ để tìm ra `fix-21mos-loaisp.ts` và **chạy lại một lệnh của ba tháng trước trên
dữ liệu đã khác**.

📌 Chúng đã được xoá khỏi worktree nhưng **git giữ toàn bộ**. Cần xem lại một thao tác dữ liệu cũ:

```bash
git log --diff-filter=D --name-only -- scripts/    # tim ten file
git show <commit>^:scripts/<ten-file>              # doc noi dung
```

🔴 **Đọc để hiểu chuyện gì đã xảy ra — đừng phục hồi rồi chạy lại.** Dữ liệu hôm nay không phải
dữ liệu lúc script đó được viết.

## LUẬT: thêm script mới

Script sửa dữ liệu dùng một lần thì **đừng commit vào đây**. Viết ở ngoài repo, chạy, rồi bỏ. Chỉ
những gì **chạy nhiều lần** mới thuộc thư mục này.

Nếu buộc phải commit (vì cần review trước khi chạy vào production), sau khi chạy xong thì **xoá
đi** trong cùng đợt. Một script đã chạy mà còn nằm đây là một cái bẫy đang chờ.

## Còn lại gì

| File | Việc | Gọi bằng |
|---|---|---|
| `guard-db-target.ts` | 🔴 **Rào chắn.** Xác định `DATABASE_URL` đang trỏ vào đâu, chặn migration nếu không nhận diện được | `npm run db:whereami` · `migrate:*` |
| `db-preflight.ts` | Diễn tập khô — DB lệch repo chỗ nào. **Chỉ đọc** | `npm run db:preflight` |
| `baseline-preview.ts` | Dựng baseline migration cho DB preview | `npm run baseline:preview` |
| `build-knowledge.ts` | Biên dịch `app/lib/ai/knowledge/*.md` → `generated.ts` | `npm run kb:build` |
| `hash-password.mjs` | Tạo bcrypt hash cho `ADMIN_PASSWORD_HASH`. **Còn dùng** — `auth.ts` vẫn đọc biến đó | `node scripts/hash-password.mjs <mk>` |
| `lib/db-target.ts` | Phân tích chuỗi kết nối + logic rào chắn | (thư viện) |
| `lib/db-registry.ts` | Đọc `db-targets.json` | (thư viện) |
| `lib/schema-shape.ts` | So hình dạng schema với DB thật | (thư viện) |

📌 Ba file `lib/*` có **test** (`__tests__/db-target-guard.test.ts`, `db-preflight.test.ts`). Rào
chắn database là chỗ cuối cùng nên tin vào việc "đọc code thấy đúng".

## Luật an toàn database

Xem [`../CLAUDE.md`](../CLAUDE.md) mục 2. Ngắn gọn:

- `npm run db:whereami` **trước** mọi lệnh ghi
- **Không bao giờ** để `DATABASE_URL` production trong `.env.local`
- Cổng **5432** cho migration · **6543** cho app

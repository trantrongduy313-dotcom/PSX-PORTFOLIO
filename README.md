# PSX Management

ERP nội bộ quản lý sản xuất trang sức. Thay thế hệ thống Google Sheets / Apps Script (V2) trước đó.

**Đang chạy production** trên Vercel — có người dùng và dữ liệu đơn hàng thật.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 · TypeScript |
| Dữ liệu | PostgreSQL (Supabase) · Prisma 7 |
| Đăng nhập | Auth.js v5 + Google OAuth · session lưu ở database |
| Kiểm thử | Vitest |
| Triển khai | Vercel |

## Chạy ở máy

```bash
npm install          # postinstall tự chạy `prisma generate`
npm run dev          # http://localhost:3000
```

Cần một file `.env.local` với `DATABASE_URL` trỏ vào database **preview**.

🔴 **Không bao giờ để `DATABASE_URL` của production trong `.env.local`** — quên xoá là lệnh ghi
kế tiếp bắn thẳng vào production. Xem `CLAUDE.md` mục 2.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run test` | Toàn bộ test |
| `npm run lint` | ESLint |
| `npm run build` | Build production |
| `npm run db:whereami` | **DATABASE_URL đang trỏ vào đâu** — chạy trước mọi lệnh chạm DB |
| `npm run db:preflight` | Diễn tập khô: DB lệch repo chỗ nào (chỉ đọc) |
| `npm run migrate:preview` | Migration lên database preview |
| `npm run migrate:production` | Migration lên production — có rào chắn xác nhận |
| `npm run kb:build` | Biên dịch nội dung trợ lý AI. **Bắt buộc** sau khi sửa `app/lib/ai/knowledge/*.md` |

## Cấu trúc

```
app/
  api/                  Route handlers — mỏng, không chứa luật nghiệp vụ
  dashboard/            Các trang, mỗi trang có _components/ riêng
  lib/
    business/           🎯 LUẬT NGHIỆP VỤ — hàm thuần, có test, không đụng DB
    ai/                 Trợ lý "Hỏi trợ lý" + bộ nội dung (.md)
    guide/              Hướng dẫn sử dụng trong app (bản thật, 23 chương)
    notify/             Google Chat webhook
prisma/schema.prisma    26 model, ghi chú dày — đọc cả comment
scripts/                Công cụ vận hành database
docs/                   Tài liệu hệ thống · docs/archive/ = báo cáo lịch sử
__tests__/              Test
```

📌 Nguyên tắc: **luật nằm ở `app/lib/business/*` và có test. Route mỏng. UI không chứa luật.**
Phải mở một route ra mới biết luật thì luật đã lọt sai tầng.

## Tài liệu

| Đọc | Ở đâu |
|---|---|
| **Bắt đầu ở đây** | [`CLAUDE.md`](CLAUDE.md) — luật an toàn, doctrine, quy ước code |
| Tổng quan | [`docs/01_PROJECT_OVERVIEW.md`](docs/01_PROJECT_OVERVIEW.md) |
| Luật nghiệp vụ | [`docs/02_BUSINESS_RULES.md`](docs/02_BUSINESS_RULES.md) |
| Kiến trúc | [`docs/03_SYSTEM_ARCHITECTURE.md`](docs/03_SYSTEM_ARCHITECTURE.md) |
| Bật tính năng AI | [`ASK-AI-SETUP.md`](ASK-AI-SETUP.md) |
| Bật tính năng Góp ý | [`FEEDBACK-SETUP.md`](FEEDBACK-SETUP.md) |
| Quy trình release | [`RELEASE-MAIN.md`](RELEASE-MAIN.md) |

⚠️ `CLAUDE.md` là file dày nhất về **những gì không suy ra được từ code** — luật an toàn database
và các bài học đã trả giá. Đọc nó trước khi sửa bất cứ thứ gì chạm tới dữ liệu.

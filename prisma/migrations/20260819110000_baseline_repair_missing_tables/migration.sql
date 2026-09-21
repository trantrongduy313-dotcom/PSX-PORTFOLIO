-- VÁ NỀN: năm bảng có trong schema mà KHÔNG migration nào từng tạo.
--
-- ⚠️ PHÁT HIỆN KHI RÀ SOÁT TRƯỚC KHI LÊN MAIN. Đối chiếu 23 model trong schema.prisma với mọi
-- lệnh CREATE TABLE trong prisma/migrations cho ra năm bảng không có nguồn gốc:
--
--     stores · accounts · sessions · verification_tokens · kpi_monthly_config
--
-- Bốn trong số đó KHÔNG được bất kỳ migration nào nhắc tới, dù chỉ một lần. Migration
-- `20260519062804_init` chỉ tạo bảy bảng (users, orders, order_items, production_details,
-- order_versions, workflow_history, alerts) — nó KHÔNG phải một init thật. Phần nền còn lại đã
-- được dựng ngoài migration (nhiều khả năng bằng `prisma db push` thời kỳ đầu).
--
-- HỆ QUẢ: lịch sử migration CHƯA BAO GIỜ dựng lại được cơ sở dữ liệu từ số không. `migrate
-- deploy` lên một DB sạch cho ra schema THIẾU, và không ai phát hiện vì mọi lần deploy đều nhắm
-- vào production — nơi phần nền đã có sẵn từ trước.
--
-- VÌ SAO PHẢI VÁ NGAY BÂY GIỜ, KHÔNG ĐỂ SAU: migration `20260819120000_add_user_stores_official`
-- là cái ĐẦU TIÊN trong toàn bộ lịch sử phụ thuộc vào một trong năm bảng đó —
-- `REFERENCES "stores"("id")`. Không có file này thì nó gãy trên mọi DB sạch. Mốc thời gian của
-- file này CỐ Ý đặt trước nó (110000 < 120000) để `stores` có mặt trước khi bị tham chiếu.
--
-- IDEMPOTENT: production đã có đủ năm bảng nên đây là năm lệnh KHÔNG LÀM GÌ. Nó chỉ có tác dụng
-- trên DB sạch — tức đúng thứ ta cần để dựng được môi trường diễn tập và preview.
--
-- KHOÁ NGOẠI VIẾT TRONG LÒNG `CREATE TABLE`, không phải `ALTER TABLE ADD CONSTRAINT`: Postgres
-- không có `ADD CONSTRAINT IF NOT EXISTS`, nên lệnh ALTER sẽ NỔ trên production nơi ràng buộc đã
-- tồn tại. Viết trong lòng thì nó chỉ chạy đúng lúc bảng được tạo mới.
--
-- ĐỊNH NGHĨA CỘT ĐƯỢC SINH TỰ ĐỘNG, không gõ tay:
--     prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
-- (lệnh chạy hoàn toàn offline, không kết nối cơ sở dữ liệu nào)
--
-- PHẠM VI: file này CHỈ vá phần BẢNG THIẾU. Vẫn còn sai lệch ở mức khoá ngoại/chỉ mục giữa
-- lịch sử migration và schema — ví dụ `users.storeId` không có khoá ngoại nào trong migration.
-- Đó là việc riêng, và `npm run db:preflight` là công cụ để nhìn ra chúng trên từng môi trường.

CREATE TABLE IF NOT EXISTS "stores" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "locale" TEXT NOT NULL DEFAULT 'vi',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "stores_code_key" ON "stores"("code");

CREATE TABLE IF NOT EXISTS "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_sessionToken_key" ON "sessions"("sessionToken");

CREATE TABLE IF NOT EXISTS "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "verification_tokens_token_key" ON "verification_tokens"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

CREATE TABLE IF NOT EXISTS "kpi_monthly_config" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "holidayDays" INTEGER NOT NULL DEFAULT 0,
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_monthly_config_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_monthly_config_year_month_key" ON "kpi_monthly_config"("year", "month");

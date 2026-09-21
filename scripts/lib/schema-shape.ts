// ─── Đọc HÌNH DẠNG mà schema.prisma mong đợi: bảng nào, cột nào ──────────────
//
// ⚠️ MODULE NÀY TỒN TẠI VÌ MỘT CÂU HỎI CHƯA AI TRẢ LỜI ĐƯỢC: production đang có schema gì?
//
// Rà soát trước khi lên main cho thấy schema production ĐÃ TỪNG BỊ SỬA BẰNG TAY — bằng chứng là
// `prisma/migrations/add_user_stores.sql`, một file nằm ngoài mọi thư mục migration kèm dòng
// "Run this on Supabase SQL editor before deploying". Và năm bảng khác trong schema không có
// migration nào tạo ra chúng, tức phần nền được dựng bằng `db push` chứ không phải migration.
//
// Nghĩa là: lịch sử migration KHÔNG mô tả đúng cơ sở dữ liệu thật. Chạy 31 migration lên một DB
// mà ta không biết hình dạng là nhảy vào chỗ tối. Module này là nửa "mong đợi" của phép đối
// chiếu; nửa còn lại (thực tế) do scripts/db-preflight.ts đọc từ information_schema.
//
// File THUẦN: không prisma, không fs, không mạng — để test trực tiếp.

export type SchemaShape = {
  /** table -> tập tên CỘT mà schema mong đợi. */
  tables: Map<string, Set<string>>;
  /** table -> tên model, để câu báo lỗi gọi được tên người đọc nhận ra. */
  modelOf: Map<string, string>;
};

const SCALAR_LINE = /^\s*(\w+)\s+(\w+)(\??|\[\])?\s*(.*)$/;

/**
 * Bóc bảng và cột từ nội dung schema.prisma.
 *
 * QUY TẮC PHÂN BIỆT CỘT VỚI QUAN HỆ: một trường tạo ra cột khi kiểu của nó KHÔNG PHẢI một model.
 * Trường quan hệ (`order Order @relation(...)`) và danh sách (`items OrderItem[]`) không có cột
 * nào trong bảng — cột thật là khoá ngoại đi kèm (`orderId String`), và trường đó tự khai riêng.
 * Enum thì CÓ tạo cột, nên không được loại theo kiểu "không phải kiểu dựng sẵn".
 *
 * Phải quét model HAI LƯỢT: lượt một thu tên mọi model, lượt hai mới biết kiểu nào là quan hệ.
 * Quét một lượt thì model khai sau sẽ bị nhận nhầm thành enum và sinh ra cột ma.
 */
export function parseSchemaShape(schema: string): SchemaShape {
  const blocks = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map((m) => ({
    model: m[1],
    body: m[2],
  }));
  const modelNames = new Set(blocks.map((b) => b.model));

  const tables = new Map<string, Set<string>>();
  const modelOf = new Map<string, string>();

  for (const { model, body } of blocks) {
    const mapped = body.match(/@@map\("([^"]+)"\)/);
    const table = mapped ? mapped[1] : model;
    const columns = new Set<string>();

    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;

      const m = SCALAR_LINE.exec(line);
      if (!m) continue;
      const [, field, type, , rest] = m;

      // Trường quan hệ: kiểu là một model, hoặc có @relation. Không sinh cột.
      if (modelNames.has(type)) continue;
      if (rest.includes("@relation")) continue;

      const renamed = rest.match(/@map\("([^"]+)"\)/);
      columns.add(renamed ? renamed[1] : field);
    }

    tables.set(table, columns);
    modelOf.set(table, model);
  }

  return { tables, modelOf };
}

/**
 * Bảng của CHÍNH Prisma, không phải bảng nghiệp vụ.
 *
 * `schema.prisma` không khai nó, nên phép so "bảng nào DB có mà schema không nhắc" sẽ luôn nêu
 * nó ra — một dòng cảnh báo XUẤT HIỆN MỌI LẦN và LUÔN vô hại. Đó là cách nhanh nhất dạy người
 * dùng bỏ qua cả danh sách, và danh sách đó tồn tại để phát hiện dấu vết vá tay.
 */
const PRISMA_OWN_TABLES = new Set(["_prisma_migrations"]);

export type DriftReport = {
  /** Bảng schema mong đợi mà DB KHÔNG có. Đây là loại sai lệch làm ứng dụng chết lúc chạy. */
  missingTables: string[];
  /** table -> cột schema mong đợi mà DB không có. */
  missingColumns: Map<string, string[]>;
  /** Bảng có trong DB mà schema không nhắc tới. CHỈ ĐỂ BIẾT, không phải lỗi. */
  extraTables: string[];
};

/**
 * So hình dạng mong đợi với hình dạng thật.
 *
 * CHỈ BÁO THIẾU, KHÔNG BÁO THỪA LÀ LỖI: cột/bảng thừa trong DB không làm ứng dụng chết — nó là
 * dấu vết của những lần vá tay, và ta muốn NHÌN THẤY chúng chứ không muốn chúng chặn deploy.
 * Thiếu thì ngược lại: truy vấn đầu tiên chạm tới là nổ.
 */
export function compareShape(
  expected: SchemaShape,
  actual: Map<string, Set<string>>,
): DriftReport {
  const missingTables: string[] = [];
  const missingColumns = new Map<string, string[]>();

  for (const [table, columns] of expected.tables) {
    const real = actual.get(table);
    if (!real) {
      missingTables.push(table);
      continue;
    }
    const gone = [...columns].filter((c) => !real.has(c));
    if (gone.length > 0) missingColumns.set(table, gone);
  }

  const extraTables = [...actual.keys()].filter(
    (t) => !expected.tables.has(t) && !PRISMA_OWN_TABLES.has(t),
  );

  return {
    missingTables: missingTables.sort(),
    missingColumns,
    extraTables: extraTables.sort(),
  };
}

export type MigrationLedger = {
  /** Tên thư mục migration có trên đĩa, đã sắp xếp. */
  onDisk: readonly string[];
  /** Tên migration mà DB ghi là đã áp dụng xong. */
  applied: readonly string[];
  /** Migration DB ghi nhận nhưng CHƯA xong (finished_at null) hoặc đã bị đánh dấu lỗi. */
  failed: readonly string[];
};

export type LedgerVerdict = {
  /** Có trên đĩa, chưa áp dụng → sẽ chạy ở lần deploy tới. */
  pending: string[];
  /**
   * DB ghi là đã áp dụng nhưng KHÔNG còn trên đĩa.
   *
   * Dấu hiệu nguy hiểm: ai đó đã xoá hoặc đổi tên một migration đã chạy. `migrate deploy` sẽ báo
   * lỗi lịch sử không khớp và DỪNG — biết trước còn hơn phát hiện giữa lúc deploy.
   */
  unknownToRepo: string[];
  /**
   * Còn dòng dở dang VÀ KHÔNG có dòng thành công nào → CHẶN deploy thật sự.
   * Prisma từ chối chạy tiếp khi thấy một migration chưa xong và chưa được đánh dấu lùi.
   */
  failed: string[];
  /**
   * Còn dòng dở dang NHƯNG đã có một dòng thành công cho cùng migration đó.
   *
   * ⚠️ TÁCH RIÊNG VÌ HAI CA NÀY KHÁC HẲN NHAU VỀ MỨC ĐỘ. Ca này là RÁC LỊCH SỬ: một lần chạy gãy
   * để lại dòng dở dang, rồi `migrate resolve --applied` THÊM một dòng mới thay vì sửa dòng cũ.
   * Migration đó thực chất đã áp dụng xong.
   *
   * Gộp chung với `failed` thì một vết xước lịch sử bị báo như một chốt chặn deploy — và một công
   * cụ hay báo động giả sẽ bị bỏ qua đúng vào lần nó báo đúng.
   */
  danglingButApplied: string[];
};

export function judgeLedger(ledger: MigrationLedger): LedgerVerdict {
  const appliedSet = new Set(ledger.applied);
  const diskSet = new Set(ledger.onDisk);
  const dangling = [...new Set(ledger.failed)].sort();

  return {
    pending: ledger.onDisk.filter((m) => !appliedSet.has(m)),
    unknownToRepo: ledger.applied.filter((m) => !diskSet.has(m)).sort(),
    failed: dangling.filter((m) => !appliedSet.has(m)),
    danglingButApplied: dangling.filter((m) => appliedSet.has(m)),
  };
}

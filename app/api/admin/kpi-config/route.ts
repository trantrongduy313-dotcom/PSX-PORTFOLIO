import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

// Cấu hình KPI Thợ Nguội theo (year, month): số ngày lễ + NGÀY CÔNG THỰC TẾ từng thợ.
//
// ⚠️ Trước 24/08/2026 trường thứ hai là `overrides` — ĐM ghi đè, tức KẾT QUẢ. Nay là `workDays`
// — NGUYÊN LIỆU, và ĐM tự suy ra (xem business/kpi-nguoi.ts). Cột `overrides` trong DB vẫn còn
// nhưng API KHÔNG đọc/ghi nó nữa.
// GET: xem (ADMIN/PRODUCTION/ORDER). PUT: sửa (ADMIN/ORDER).

export type KpiConfig = {
  /** Số ngày lễ — nay chỉ định nghĩa NGÀY CÔNG MẶC ĐỊNH cho thợ chưa được điền. */
  holidayDays: number;
  /** { tênThợ: ngày công thực tế } — điền lúc kiểm kê. Thiếu key thì dùng mặc định theo lịch. */
  workDays: Record<string, number>;
};

const EMPTY_CONFIG: KpiConfig = { holidayDays: 0, workDays: {} };

function parseYearMonth(sp: URLSearchParams): { year: number; month: number } {
  const year  = parseInt(sp.get("year")  ?? "") || new Date().getFullYear();
  const month = parseInt(sp.get("month") ?? "") || new Date().getMonth() + 1;
  return { year, month };
}

export async function GET(req: NextRequest) {
  const role = (await auth())?.user?.role ?? "";
  if (!["ADMIN", "PRODUCTION", "ORDER"].includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { year, month } = parseYearMonth(req.nextUrl.searchParams);
  const row = await prisma.kpiMonthlyConfig.findUnique({ where: { year_month: { year, month } } });
  if (!row) return NextResponse.json(EMPTY_CONFIG);
  return NextResponse.json({
    holidayDays: row.holidayDays,
    workDays: (row.workDays as Record<string, number>) ?? {},
  });
}

export async function PUT(req: NextRequest) {
  const role = (await auth())?.user?.role ?? "";
  if (!["ADMIN", "ORDER"].includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const body = await req.json() as { year: number; month: number; holidayDays?: number; workDays?: Record<string, number> };
  const { year, month } = body;
  if (!year || !month) return NextResponse.json({ error: "Missing year/month" }, { status: 400 });

  const holidayDays = Math.max(0, Math.floor(body.holidayDays ?? 0));
  const workDays    = sanitizeDayMap(body.workDays);

  const row = await prisma.kpiMonthlyConfig.upsert({
    where:  { year_month: { year, month } },
    update: { holidayDays, workDays },
    create: { year, month, holidayDays, workDays },
  });
  return NextResponse.json({
    holidayDays: row.holidayDays,
    workDays: (row.workDays as Record<string, number>) ?? {},
  });
}

// Chỉ giữ số nguyên ≥ 0; bỏ giá trị rỗng/không hợp lệ (tránh lưu rác). Ngày công là số NGÀY nên
// làm tròn — nửa ngày công không phải khái niệm nghiệp vụ ở đây.
function sanitizeDayMap(raw: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const [name, val] of Object.entries(raw)) {
    const n = Number(val);
    if (name.trim() && Number.isFinite(n) && n >= 0) out[name] = Math.round(n);
  }
  return out;
}

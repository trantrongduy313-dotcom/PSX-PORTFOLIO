-- Additive schema for 3D KPI assignment.
-- Safe checkpoint: this migration creates new configuration/assignment tables and
-- one nullable Designer3D -> User link. It does not modify existing order data.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DESIGN_3D';

CREATE TYPE "Design3DAssignmentStatus" AS ENUM (
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_INFO',
  'SENT_RESULT',
  'REASSIGNED',
  'CANCELLED'
);

CREATE TYPE "Design3DProgressStatus" AS ENUM (
  'IN_PROGRESS',
  'WAITING_INFO',
  'SENT_RESULT'
);

CREATE TYPE "Kpi3DResultStatus" AS ENUM (
  'ON_TIME',
  'LATE'
);

CREATE TYPE "Design3DOvertimeStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

ALTER TABLE "designers_3d" ADD COLUMN "userId" TEXT;

CREATE TABLE "kpi_3d_groups" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "standardMinutes" INTEGER NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "kpi_3d_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "working_calendars" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "working_calendars_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "working_calendar_sessions" (
  "id" TEXT NOT NULL,
  "calendarId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "label" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "working_calendar_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "working_calendar_holidays" (
  "id" TEXT NOT NULL,
  "calendarId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,

  CONSTRAINT "working_calendar_holidays_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "design_3d_assignments" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "designer3DId" TEXT NOT NULL,
  "assignedById" TEXT,
  "kpiGroupId" TEXT NOT NULL,
  "workingCalendarId" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL,
  "standardMinutesSnapshot" INTEGER NOT NULL,
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "status" "Design3DAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "completedAt" TIMESTAMP(3),
  "kpiStatus" "Kpi3DResultStatus",
  "kpiDeltaMinutes" INTEGER,
  "reassignedFromId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "design_3d_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "design_3d_progress_logs" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "updatedById" TEXT,
  "status" "Design3DProgressStatus" NOT NULL,
  "progressPercent" INTEGER,
  "renderInfoUrl" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "design_3d_progress_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "design_3d_overtime_requests" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "designer3DId" TEXT NOT NULL,
  "requestedById" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "minutes" INTEGER NOT NULL,
  "reason" TEXT,
  "status" "Design3DOvertimeStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "design_3d_overtime_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "designers_3d_userId_key" ON "designers_3d"("userId");
CREATE UNIQUE INDEX "kpi_3d_groups_code_key" ON "kpi_3d_groups"("code");
CREATE INDEX "kpi_3d_groups_isActive_idx" ON "kpi_3d_groups"("isActive");
CREATE INDEX "working_calendars_isDefault_idx" ON "working_calendars"("isDefault");
CREATE INDEX "working_calendars_isActive_idx" ON "working_calendars"("isActive");
CREATE INDEX "working_calendar_sessions_calendarId_dayOfWeek_idx" ON "working_calendar_sessions"("calendarId", "dayOfWeek");
CREATE UNIQUE INDEX "working_calendar_holidays_calendarId_date_key" ON "working_calendar_holidays"("calendarId", "date");
CREATE INDEX "working_calendar_holidays_date_idx" ON "working_calendar_holidays"("date");
CREATE INDEX "design_3d_assignments_orderId_idx" ON "design_3d_assignments"("orderId");
CREATE INDEX "design_3d_assignments_orderItemId_idx" ON "design_3d_assignments"("orderItemId");
CREATE INDEX "design_3d_assignments_designer3DId_idx" ON "design_3d_assignments"("designer3DId");
CREATE INDEX "design_3d_assignments_status_idx" ON "design_3d_assignments"("status");
CREATE INDEX "design_3d_assignments_deadlineAt_idx" ON "design_3d_assignments"("deadlineAt");
CREATE INDEX "design_3d_progress_logs_assignmentId_idx" ON "design_3d_progress_logs"("assignmentId");
CREATE INDEX "design_3d_progress_logs_updatedById_idx" ON "design_3d_progress_logs"("updatedById");
CREATE INDEX "design_3d_progress_logs_createdAt_idx" ON "design_3d_progress_logs"("createdAt");
CREATE INDEX "design_3d_overtime_requests_assignmentId_idx" ON "design_3d_overtime_requests"("assignmentId");
CREATE INDEX "design_3d_overtime_requests_designer3DId_idx" ON "design_3d_overtime_requests"("designer3DId");
CREATE INDEX "design_3d_overtime_requests_status_idx" ON "design_3d_overtime_requests"("status");

ALTER TABLE "designers_3d"
  ADD CONSTRAINT "designers_3d_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "working_calendar_sessions"
  ADD CONSTRAINT "working_calendar_sessions_calendarId_fkey"
  FOREIGN KEY ("calendarId") REFERENCES "working_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "working_calendar_holidays"
  ADD CONSTRAINT "working_calendar_holidays_calendarId_fkey"
  FOREIGN KEY ("calendarId") REFERENCES "working_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "design_3d_assignments"
  ADD CONSTRAINT "design_3d_assignments_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "design_3d_assignments"
  ADD CONSTRAINT "design_3d_assignments_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "design_3d_assignments"
  ADD CONSTRAINT "design_3d_assignments_designer3DId_fkey"
  FOREIGN KEY ("designer3DId") REFERENCES "designers_3d"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "design_3d_assignments"
  ADD CONSTRAINT "design_3d_assignments_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "design_3d_assignments"
  ADD CONSTRAINT "design_3d_assignments_kpiGroupId_fkey"
  FOREIGN KEY ("kpiGroupId") REFERENCES "kpi_3d_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "design_3d_assignments"
  ADD CONSTRAINT "design_3d_assignments_workingCalendarId_fkey"
  FOREIGN KEY ("workingCalendarId") REFERENCES "working_calendars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "design_3d_assignments"
  ADD CONSTRAINT "design_3d_assignments_reassignedFromId_fkey"
  FOREIGN KEY ("reassignedFromId") REFERENCES "design_3d_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "design_3d_progress_logs"
  ADD CONSTRAINT "design_3d_progress_logs_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "design_3d_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "design_3d_progress_logs"
  ADD CONSTRAINT "design_3d_progress_logs_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "design_3d_overtime_requests"
  ADD CONSTRAINT "design_3d_overtime_requests_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "design_3d_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "design_3d_overtime_requests"
  ADD CONSTRAINT "design_3d_overtime_requests_designer3DId_fkey"
  FOREIGN KEY ("designer3DId") REFERENCES "designers_3d"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "design_3d_overtime_requests"
  ADD CONSTRAINT "design_3d_overtime_requests_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "design_3d_overtime_requests"
  ADD CONSTRAINT "design_3d_overtime_requests_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

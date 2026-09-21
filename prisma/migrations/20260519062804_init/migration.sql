-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SALE', 'DESIGNER', 'PRODUCTION', 'MANAGER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_DESIGN', 'IN_DESIGN', 'DESIGN_REVIEW', 'DESIGN_APPROVED', 'PENDING_PRODUCTION', 'IN_PRODUCTION', 'QUALITY_CHECK', 'COMPLETED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderZone" AS ENUM ('PRE_PRODUCTION', 'MASTER_HUB');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('SPECIAL', 'MATERIAL_SHORTAGE', 'RUSH_ORDER', 'QUALITY_ISSUE', 'DESIGN_CHANGE', 'CUSTOMER_COMPLAINT');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WorkflowAction" AS ENUM ('CREATED', 'STATUS_CHANGED', 'ZONE_MOVED', 'VERSION_CREATED', 'ALERT_RAISED', 'ALERT_RESOLVED', 'SUSPENDED', 'RESUMED', 'FIELD_UPDATED', 'COMMENT_ADDED');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('NECKLACE', 'RING', 'EARRING', 'BRACELET', 'PENDANT', 'BROOCH', 'OTHER');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('GOLD_18K', 'GOLD_24K', 'SILVER_925', 'PLATINUM', 'DIAMOND', 'GEMSTONE', 'PEARL', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'SALE',
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "saleNote" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "zone" "OrderZone" NOT NULL DEFAULT 'PRE_PRODUCTION',
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "isPriority" BOOLEAN NOT NULL DEFAULT false,
    "isRush" BOOLEAN NOT NULL DEFAULT false,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiredDate" TIMESTAMP(3),
    "estimatedDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "estimatedTotal" DECIMAL(18,2),
    "depositAmount" DECIMAL(18,2),
    "finalTotal" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "designBriefUrl" TEXT,
    "referenceUrls" TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL DEFAULT 'OTHER',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "material" "MaterialType",
    "weightGram" DECIMAL(10,3),
    "size" TEXT,
    "color" TEXT,
    "engraving" TEXT,
    "specifications" JSONB,
    "designFileUrl" TEXT,
    "approvedDesign" TEXT,
    "crafterName" TEXT,
    "craftingNote" TEXT,
    "qualityNote" TEXT,
    "unitPrice" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_details" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "workshopCode" TEXT,
    "workshopName" TEXT,
    "supervisorName" TEXT,
    "castingStartAt" TIMESTAMP(3),
    "castingDoneAt" TIMESTAMP(3),
    "polishingStartAt" TIMESTAMP(3),
    "polishingDoneAt" TIMESTAMP(3),
    "settingStartAt" TIMESTAMP(3),
    "settingDoneAt" TIMESTAMP(3),
    "platingStartAt" TIMESTAMP(3),
    "platingDoneAt" TIMESTAMP(3),
    "qcStartAt" TIMESTAMP(3),
    "qcDoneAt" TIMESTAMP(3),
    "packagingDoneAt" TIMESTAMP(3),
    "materialReceived" BOOLEAN NOT NULL DEFAULT false,
    "materialNote" TEXT,
    "qcResult" TEXT,
    "qcNote" TEXT,
    "reworkCount" INTEGER NOT NULL DEFAULT 0,
    "shippingCarrier" TEXT,
    "trackingNumber" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "internalNote" TEXT,
    "extraData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_versions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changesSummary" TEXT,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "action" "WorkflowAction" NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus",
    "fromZone" "OrderZone",
    "toZone" "OrderZone",
    "comment" TEXT,
    "metadata" JSONB,
    "performedById" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedNote" TEXT,
    "autoSuspended" BOOLEAN NOT NULL DEFAULT false,
    "raisedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_zone_idx" ON "orders"("zone");

-- CreateIndex
CREATE INDEX "orders_isSuspended_idx" ON "orders"("isSuspended");

-- CreateIndex
CREATE INDEX "orders_createdById_idx" ON "orders"("createdById");

-- CreateIndex
CREATE INDEX "orders_assignedToId_idx" ON "orders"("assignedToId");

-- CreateIndex
CREATE INDEX "orders_requiredDate_idx" ON "orders"("requiredDate");

-- CreateIndex
CREATE INDEX "orders_deletedAt_idx" ON "orders"("deletedAt");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_orderId_lineNumber_key" ON "order_items"("orderId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "production_details_orderId_key" ON "production_details"("orderId");

-- CreateIndex
CREATE INDEX "order_versions_orderId_idx" ON "order_versions"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "order_versions_orderId_versionNumber_key" ON "order_versions"("orderId", "versionNumber");

-- CreateIndex
CREATE INDEX "workflow_history_orderId_idx" ON "workflow_history"("orderId");

-- CreateIndex
CREATE INDEX "workflow_history_performedById_idx" ON "workflow_history"("performedById");

-- CreateIndex
CREATE INDEX "workflow_history_performedAt_idx" ON "workflow_history"("performedAt");

-- CreateIndex
CREATE INDEX "workflow_history_action_idx" ON "workflow_history"("action");

-- CreateIndex
CREATE INDEX "alerts_orderId_idx" ON "alerts"("orderId");

-- CreateIndex
CREATE INDEX "alerts_isResolved_idx" ON "alerts"("isResolved");

-- CreateIndex
CREATE INDEX "alerts_severity_idx" ON "alerts"("severity");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_details" ADD CONSTRAINT "production_details_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_versions" ADD CONSTRAINT "order_versions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_versions" ADD CONSTRAINT "order_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_history" ADD CONSTRAINT "workflow_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_history" ADD CONSTRAINT "workflow_history_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

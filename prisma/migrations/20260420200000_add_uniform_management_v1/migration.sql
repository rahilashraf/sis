-- Uniform Management / Orders v1

-- CreateEnum
CREATE TYPE "UniformOrderStatus" AS ENUM ('PENDING', 'APPROVED', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "UniformItem" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "sku" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "availableSizes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "availableColors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniformItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniformOrder" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "UniformOrderStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "internalNotes" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniformOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniformOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "uniformItemId" TEXT NOT NULL,
    "itemNameSnapshot" TEXT NOT NULL,
    "itemSkuSnapshot" TEXT,
    "selectedSize" TEXT,
    "selectedColor" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniformOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UniformItem_schoolId_sku_key" ON "UniformItem"("schoolId", "sku");

-- CreateIndex
CREATE INDEX "UniformItem_schoolId_isActive_sortOrder_name_idx" ON "UniformItem"("schoolId", "isActive", "sortOrder", "name");

-- CreateIndex
CREATE INDEX "UniformItem_schoolId_category_isActive_idx" ON "UniformItem"("schoolId", "category", "isActive");

-- CreateIndex
CREATE INDEX "UniformOrder_schoolId_status_createdAt_idx" ON "UniformOrder"("schoolId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "UniformOrder_parentId_createdAt_idx" ON "UniformOrder"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "UniformOrder_studentId_createdAt_idx" ON "UniformOrder"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "UniformOrderItem_orderId_createdAt_idx" ON "UniformOrderItem"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "UniformOrderItem_uniformItemId_idx" ON "UniformOrderItem"("uniformItemId");

-- AddForeignKey
ALTER TABLE "UniformItem" ADD CONSTRAINT "UniformItem_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformOrder" ADD CONSTRAINT "UniformOrder_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformOrder" ADD CONSTRAINT "UniformOrder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformOrder" ADD CONSTRAINT "UniformOrder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformOrderItem" ADD CONSTRAINT "UniformOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "UniformOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformOrderItem" ADD CONSTRAINT "UniformOrderItem_uniformItemId_fkey" FOREIGN KEY ("uniformItemId") REFERENCES "UniformItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

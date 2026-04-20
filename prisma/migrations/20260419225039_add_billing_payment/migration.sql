-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHEQUE', 'BANK_TRANSFER', 'CARD_EXTERNAL', 'OTHER');

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "schoolYearId" TEXT,
    "studentId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingPayment_schoolId_studentId_idx" ON "BillingPayment"("schoolId", "studentId");

-- CreateIndex
CREATE INDEX "BillingPayment_schoolId_paymentDate_idx" ON "BillingPayment"("schoolId", "paymentDate");

-- CreateIndex
CREATE INDEX "BillingPayment_isVoided_idx" ON "BillingPayment"("isVoided");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_schoolId_receiptNumber_key" ON "BillingPayment"("schoolId", "receiptNumber");

-- CreateIndex
CREATE INDEX "BillingPaymentAllocation_chargeId_idx" ON "BillingPaymentAllocation"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPaymentAllocation_paymentId_chargeId_key" ON "BillingPaymentAllocation"("paymentId", "chargeId");

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPaymentAllocation" ADD CONSTRAINT "BillingPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPaymentAllocation" ADD CONSTRAINT "BillingPaymentAllocation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "BillingCharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

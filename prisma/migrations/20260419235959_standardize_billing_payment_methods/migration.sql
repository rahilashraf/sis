-- Standardize billing payment methods to:
-- EFT, CASH, DEBIT_CREDIT, CHEQUE
-- while safely mapping legacy enum values.

CREATE TYPE "PaymentMethod_new" AS ENUM ('EFT', 'CASH', 'DEBIT_CREDIT', 'CHEQUE');

ALTER TABLE "BillingPayment"
ALTER COLUMN "method" TYPE "PaymentMethod_new"
USING (
  CASE
    WHEN "method"::text IN ('BANK_TRANSFER', 'OTHER', 'EFT') THEN 'EFT'
    WHEN "method"::text IN ('CARD_EXTERNAL', 'CARD', 'DEBIT_CREDIT') THEN 'DEBIT_CREDIT'
    WHEN "method"::text = 'CASH' THEN 'CASH'
    WHEN "method"::text = 'CHEQUE' THEN 'CHEQUE'
    ELSE 'EFT'
  END
)::"PaymentMethod_new";

DROP TYPE "PaymentMethod";

ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";

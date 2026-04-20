-- Add E_TRANSFER to billing payment method enum.
-- Data is preserved; existing values remain unchanged.

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'E_TRANSFER';

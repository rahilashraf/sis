-- Add optional item-level lost fee override used by library lost fine lifecycle rules.
ALTER TABLE "LibraryItem"
ADD COLUMN "lostFeeOverride" DECIMAL(12, 2);

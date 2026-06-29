-- Add Announcements to school-scoped feature toggles.
ALTER TYPE "FeatureModule" ADD VALUE IF NOT EXISTS 'ANNOUNCEMENTS';
ALTER TYPE "PermissionResource" ADD VALUE IF NOT EXISTS 'ANNOUNCEMENTS';

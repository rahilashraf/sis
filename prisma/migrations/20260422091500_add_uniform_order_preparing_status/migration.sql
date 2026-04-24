-- Add PREPARING status to uniform order workflow
ALTER TYPE "UniformOrderStatus" ADD VALUE IF NOT EXISTS 'PREPARING';

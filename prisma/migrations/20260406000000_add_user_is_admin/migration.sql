-- AlterTable
ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Set existing admin user as admin
UPDATE "User" SET "isAdmin" = true WHERE "email" = 'admin@orgchart.local';

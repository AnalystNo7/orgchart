-- DropIndex
DROP INDEX "PnlCache_scenarioId_departmentId_mode_periodStart_periodEnd_key";

-- AlterTable
ALTER TABLE "PnlCache" ADD COLUMN "allocationMode" TEXT NOT NULL DEFAULT 'classic';

-- CreateIndex
CREATE UNIQUE INDEX "PnlCache_scenarioId_departmentId_mode_allocationMode_period_key" ON "PnlCache"("scenarioId", "departmentId", "mode", "allocationMode", "periodStart", "periodEnd");

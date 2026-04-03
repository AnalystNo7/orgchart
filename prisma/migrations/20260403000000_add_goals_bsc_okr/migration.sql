-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('BSC_FINANCIAL', 'BSC_CLIENT', 'BSC_PROCESS', 'BSC_LEARNING', 'OKR');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'AT_RISK', 'FAILED');

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "GoalType" NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ownerId" TEXT,
    "deadline" TIMESTAMP(3),
    "period" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalKpi" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoalKpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalDepartmentLink" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalDepartmentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_scenarioId_idx" ON "Goal"("scenarioId");

-- CreateIndex
CREATE INDEX "Goal_parentId_idx" ON "Goal"("parentId");

-- CreateIndex
CREATE INDEX "GoalKpi_goalId_idx" ON "GoalKpi"("goalId");

-- CreateIndex
CREATE INDEX "GoalDepartmentLink_goalId_idx" ON "GoalDepartmentLink"("goalId");

-- CreateIndex
CREATE INDEX "GoalDepartmentLink_departmentId_idx" ON "GoalDepartmentLink"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalDepartmentLink_goalId_departmentId_key" ON "GoalDepartmentLink"("goalId", "departmentId");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalKpi" ADD CONSTRAINT "GoalKpi_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalDepartmentLink" ADD CONSTRAINT "GoalDepartmentLink_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalDepartmentLink" ADD CONSTRAINT "GoalDepartmentLink_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

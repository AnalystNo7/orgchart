-- CreateEnum
CREATE TYPE "InsightSeverity" AS ENUM ('CRITICAL', 'WARNING', 'INFO', 'POSITIVE');

-- CreateEnum
CREATE TYPE "InsightCategory" AS ENUM ('STRUCTURE', 'FINANCIAL', 'PROCESS', 'COMPETENCY', 'STRATEGY', 'OPERATIONS', 'CUSTOMER');

-- CreateTable
CREATE TABLE "AIInsight" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "category" "InsightCategory" NOT NULL,
    "severity" "InsightSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metricKey" TEXT,
    "currentValue" DOUBLE PRECISION,
    "benchmarkValue" DOUBLE PRECISION,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRecommendation" (
    "id" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIInsight_scenarioId_idx" ON "AIInsight"("scenarioId");
CREATE INDEX "AIInsight_scenarioId_resolved_idx" ON "AIInsight"("scenarioId", "resolved");
CREATE INDEX "AIRecommendation_insightId_idx" ON "AIRecommendation"("insightId");

-- AddForeignKey
ALTER TABLE "AIInsight" ADD CONSTRAINT "AIInsight_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIRecommendation" ADD CONSTRAINT "AIRecommendation_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "AIInsight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

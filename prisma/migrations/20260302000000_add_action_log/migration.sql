-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "undoPayload" JSONB NOT NULL,
    "undone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionLog_scenarioId_idx" ON "ActionLog"("scenarioId");

-- CreateIndex
CREATE INDEX "ActionLog_scenarioId_createdAt_idx" ON "ActionLog"("scenarioId", "createdAt");

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "LlmSetting" ADD COLUMN "maxSteps" INTEGER,
ADD COLUMN "stepTimeoutSec" INTEGER,
ADD COLUMN "chunkTimeoutSec" INTEGER,
ADD COLUMN "runContextBudgetBytes" INTEGER;

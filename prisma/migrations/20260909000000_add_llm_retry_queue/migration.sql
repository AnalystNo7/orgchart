-- AlterTable
ALTER TABLE "LlmSetting" ADD COLUMN "maxRetries" INTEGER,
ADD COLUMN "retryDelaySec" INTEGER,
ADD COLUMN "maxConcurrentRuns" INTEGER,
ADD COLUMN "queueTimeoutSec" INTEGER;

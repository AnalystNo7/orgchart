-- CreateTable: admin-managed LLM connection presets (/admin/llm).
-- "Only one active" is enforced by a transaction in the activate endpoint,
-- not by a partial unique index (Prisma cannot express it in schema.prisma
-- and it would create a permanent schema drift on every migrate dev).
CREATE TABLE "LlmSetting" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT,
    "apiKey" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION,
    "maxOutputTokens" INTEGER,
    "timeoutSec" INTEGER NOT NULL DEFAULT 300,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPromptSetting" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiPromptSetting_pkey" PRIMARY KEY ("id")
);

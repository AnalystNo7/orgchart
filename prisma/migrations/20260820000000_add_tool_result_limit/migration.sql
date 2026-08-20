-- AlterTable: per-preset cap for a single AI tool result (UTF-8 bytes).
-- Providers reject an inbound message when one text block exceeds their limit
-- (Gonka/MiniMax: 65536). NULL means the application default (60000).
ALTER TABLE "LlmSetting" ADD COLUMN "toolResultMaxBytes" INTEGER;

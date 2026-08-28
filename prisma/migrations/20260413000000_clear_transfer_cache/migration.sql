-- Transfer-mode algorithm was rewritten from "contract.amount is ignored" to
-- proper internal transfer-price exchange where REVENUE blocks get the full
-- contract.amount and non-REVENUE blocks only receive internal TP revenue.
--
-- Old cached values are incompatible with the new logic. Since PnlCache is
-- a derived/computed artefact (not a source of truth), we simply drop all
-- rows with allocationMode = 'transfer' so they're recalculated on next
-- request.
--
-- Idempotent: if there are no such rows, the DELETE is a no-op.

DELETE FROM "PnlCache" WHERE "allocationMode" = 'transfer';

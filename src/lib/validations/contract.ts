import { z } from "zod";

export const createContractSchema = z.object({
  name: z.string().min(1, "Наименование обязательно"),
  type: z.enum(["REVENUE", "EXPENSE"]),
  status: z.enum(["CONCLUDED", "PLANNED"]),
  amount: z.number().min(0).nullable().optional(),
  expectedAmount: z.number().min(0).nullable().optional(),
  amountAutoCalc: z.boolean().optional().default(false),
  periodStart: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  periodEnd: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  description: z.string().nullable().optional(),
});

export const updateContractSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["REVENUE", "EXPENSE"]).optional(),
  status: z.enum(["CONCLUDED", "PLANNED"]).optional(),
  amount: z.number().min(0).nullable().optional(),
  expectedAmount: z.number().min(0).nullable().optional(),
  amountAutoCalc: z.boolean().optional(),
  periodStart: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  periodEnd: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  description: z.string().nullable().optional(),
});

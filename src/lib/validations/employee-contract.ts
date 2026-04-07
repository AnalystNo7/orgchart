import { z } from "zod";

export const createEmployeeContractSchema = z.object({
  employeeId: z.string().uuid(),
  contractId: z.string().uuid(),
  revenueStatus: z.enum(["PROVIDED", "PLANNED", "NOT_PROVIDED"]),
  fte: z.number().min(0).max(1),
  periodStart: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  periodEnd: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
});

export const updateEmployeeContractSchema = z.object({
  revenueStatus: z.enum(["PROVIDED", "PLANNED", "NOT_PROVIDED"]).optional(),
  fte: z.number().min(0).max(1).optional(),
  periodStart: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  periodEnd: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
});

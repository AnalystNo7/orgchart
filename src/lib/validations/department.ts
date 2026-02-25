import { z } from "zod";

export const createDepartmentSchema = z.object({
  scenarioId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1, "Название обязательно"),
  shetilType: z.enum(["REVENUE", "RESOURCE", "SERVICE", "BACKOFFICE"]),
  headId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional().default(0),
});

export const updateDepartmentSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).optional(),
  shetilType: z.enum(["REVENUE", "RESOURCE", "SERVICE", "BACKOFFICE"]).optional(),
  headId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

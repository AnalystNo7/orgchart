import { z } from "zod";

export const createEmployeeSchema = z.object({
  scenarioId: z.string().uuid(),
  departmentId: z.string().uuid(),
  fullName: z.string().min(1, "ФИО обязательно"),
  position: z.string().min(1, "Должность обязательна"),
  category: z.enum(["PP", "OPP", "AUP"]),
  fte: z.number().min(0).max(2).optional().default(1.0),
});

export const updateEmployeeSchema = z.object({
  departmentId: z.string().uuid().optional(),
  fullName: z.string().min(1).optional(),
  position: z.string().min(1).optional(),
  category: z.enum(["PP", "OPP", "AUP"]).optional(),
  fte: z.number().min(0).max(2).optional(),
});

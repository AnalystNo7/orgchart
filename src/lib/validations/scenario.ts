import { z } from "zod";

export const createScenarioSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  description: z.string().optional(),
});

export const updateScenarioSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});
